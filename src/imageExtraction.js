import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Dynamic import for pdfjs-dist to handle ESM compatibility
// Use legacy build for Node.js as recommended
let pdfjsLib;
async function loadPdfJs() {
  if (!pdfjsLib) {
    try {
      // Use legacy build for Node.js environments
      pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    } catch (error) {
      // Fallback to regular import if legacy doesn't work
      try {
        pdfjsLib = await import("pdfjs-dist");
      } catch (error2) {
        console.warn("⚠ pdfjs-dist not available - image extraction will be disabled");
        return null;
      }
    }
  }
  return pdfjsLib;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Image Extraction Module
 * Extracts images from PDF files using pdfjs-dist
 */

export class ImageExtractor {
  constructor() {
    this.tempImageDir = path.join(process.cwd(), "temp_images");
    this.ensureTempDirectory();
  }

  /**
   * Ensure temporary directory exists for storing extracted images
   */
  ensureTempDirectory() {
    if (!fs.existsSync(this.tempImageDir)) {
      fs.mkdirSync(this.tempImageDir, { recursive: true });
    }
  }

  /**
   * Extract all images from a PDF file
   * @param {string} pdfPath - Path to the PDF file
   * @returns {Promise<Array>} Array of image objects with metadata
   */
  async extractImagesFromPDF(pdfPath) {
    try {
      console.log(`\n📸 Extracting images from PDF: ${pdfPath}`);

      // Load pdfjs-dist dynamically
      const pdfjs = await loadPdfJs();
      if (!pdfjs) {
        throw new Error("pdfjs-dist not available");
      }
      // Handle both default export and named exports
      const pdfjsModule = pdfjs.default || pdfjs;
      const { getDocument } = pdfjsModule;
      
      // Set worker path if needed (for browser compatibility, not needed for Node.js)
      // GlobalWorkerOptions.workerSrc = 'path/to/pdf.worker.js';

      const dataBuffer = fs.readFileSync(pdfPath);
      // Convert Buffer to Uint8Array for pdfjs-dist
      const data = new Uint8Array(dataBuffer);
      const loadingTask = getDocument({ data });
      const pdf = await loadingTask.promise;

      const images = [];
      const numPages = pdf.numPages;

      console.log(`  Processing ${numPages} pages...`);

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const operatorList = await page.getOperatorList();

        // First pass: collect all image names
        const pdfjsModule = pdfjs.default || pdfjs;
        const OPS = pdfjsModule.OPS || {};
        const paintImageOp = OPS.paintImageXObject || 60;
        const paintJpegOp = OPS.paintJpegXObject || 61;
        
        const imageNames = new Set();
        for (let i = 0; i < operatorList.fnArray.length; i++) {
          const op = operatorList.fnArray[i];
          const args = operatorList.argsArray[i];
          
          if (op === paintImageOp || op === paintJpegOp) {
            const imageName = args[0];
            if (imageName) {
              imageNames.add(imageName);
            }
          }
        }

        // Second pass: resolve and extract images
        let imageIndex = 0;
        for (const imageName of imageNames) {
          try {
            // Try to get the object - it may need to be resolved first
            // Use a promise-based approach to handle async resolution
            let imageObj;
            try {
              imageObj = await page.objs.get(imageName);
            } catch (resolveError) {
              // If object isn't resolved yet, try to resolve it
              // Some images are referenced but not yet loaded
              if (resolveError.message && resolveError.message.includes("isn't resolved yet")) {
                // Wait a bit and try again, or skip this image
                console.warn(`  ⚠ Image ${imageName} on page ${pageNum} not yet resolved, skipping...`);
                continue;
              }
              throw resolveError;
            }

            if (imageObj && imageObj.data) {
              let imageData = imageObj.data;
              
              // Convert image data to Buffer if it's not already
              if (!Buffer.isBuffer(imageData)) {
                imageData = Buffer.from(imageData);
              }
              
              // Check image object for format information
              // pdfjs-dist image objects may have format, filter, or other metadata
              let imageFormat = null;
              if (imageObj.filter && imageObj.filter.name) {
                // Filter name indicates compression format
                const filterName = imageObj.filter.name;
                if (filterName === 'DCTDecode' || filterName === 'JPXDecode') {
                  imageFormat = 'jpg';
                } else if (filterName === 'FlateDecode' || filterName === 'LZWDecode') {
                  imageFormat = 'png'; // Often PNG for lossless
                } else if (filterName === 'CCITTFaxDecode') {
                  imageFormat = 'tiff'; // Fax compression, often TIFF
                }
              }
              
              // Try to determine format from image data headers
              let imageExtension = imageFormat || this.getImageExtension(imageData);
              
              // Save with determined extension
              const imagePath = path.join(
                this.tempImageDir,
                `page_${pageNum}_image_${imageIndex}.${imageExtension || 'jpg'}`
              );
              
              // Save raw image data
              fs.writeFileSync(imagePath, imageData);
              
              // Now try to convert to JPEG using sharp for OCR compatibility
              // This will decode PDF image formats to standard JPEG
              const jpegPath = path.join(
                this.tempImageDir,
                `page_${pageNum}_image_${imageIndex}_ocr.jpg`
              );
              
              try {
                const sharp = (await import("sharp")).default;
                // Use failOn: 'none' to handle any format
                await sharp(imagePath, { failOn: 'none' })
                  .jpeg({ quality: 90 })
                  .toFile(jpegPath);
                
                // Use the converted JPEG for OCR
                // Keep original for reference, but use JPEG for processing
                images.push({
                  pageNumber: pageNum,
                  imageIndex: imageIndex++,
                  path: jpegPath, // Use converted JPEG for OCR
                  originalPath: imagePath, // Keep original
                  extension: 'jpg',
                  size: imageData.length,
                });
              } catch (sharpError) {
                // If sharp conversion fails, use original
                console.warn(`  ⚠ Could not convert image with sharp: ${sharpError.message}, using original`);
                images.push({
                  pageNumber: pageNum,
                  imageIndex: imageIndex++,
                  path: imagePath,
                  extension: imageExtension || 'jpg',
                  size: imageData.length,
                });
              }

              console.log(`  ✓ Extracted image from page ${pageNum} (${(imageData.length / 1024).toFixed(2)} KB)`);
            }
          } catch (error) {
            // Skip images that can't be resolved
            console.warn(`  ⚠ Could not extract image ${imageName} from page ${pageNum}: ${error.message}`);
          }
        }
      }

      console.log(`✓ Total images extracted: ${images.length}`);
      return images;
    } catch (error) {
      console.error("Error extracting images from PDF:", error);
      // Fallback: try alternative method using pdf-parse
      return await this.extractImagesAlternative(pdfPath);
    }
  }

  /**
   * Alternative image extraction method
   * Some PDFs may require different extraction approaches
   */
  async extractImagesAlternative(pdfPath) {
    console.log("  Trying alternative extraction method...");
    // This is a placeholder - can be enhanced with other libraries
    // For now, return empty array if primary method fails
    return [];
  }

  /**
   * Determine image extension from image data
   */
  getImageExtension(imageData) {
    // Check file signatures (magic numbers)
    if (imageData[0] === 0xff && imageData[1] === 0xd8) {
      return "jpg";
    } else if (imageData[0] === 0x89 && imageData[1] === 0x50) {
      return "png";
    } else if (imageData[0] === 0x47 && imageData[1] === 0x49) {
      return "gif";
    } else if (imageData[0] === 0x42 && imageData[1] === 0x4d) {
      return "bmp";
    }
    // Default to jpg for unknown formats
    return "jpg";
  }

  /**
   * Clean up temporary image files
   */
  cleanup() {
    try {
      if (fs.existsSync(this.tempImageDir)) {
        const files = fs.readdirSync(this.tempImageDir);
        files.forEach((file) => {
          fs.unlinkSync(path.join(this.tempImageDir, file));
        });
        console.log(`✓ Cleaned up ${files.length} temporary image files`);
      }
    } catch (error) {
      console.warn("Warning: Could not clean up temporary images:", error.message);
    }
  }

  /**
   * Get image metadata without extracting
   */
  async getImageMetadata(pdfPath) {
    try {
      const pdfjs = await loadPdfJs();
      if (!pdfjs) {
        throw new Error("pdfjs-dist not available");
      }
      const pdfjsModule = pdfjs.default || pdfjs;
      const { getDocument } = pdfjsModule;
      
      const dataBuffer = fs.readFileSync(pdfPath);
      // Convert Buffer to Uint8Array for pdfjs-dist
      const data = new Uint8Array(dataBuffer);
      const loadingTask = getDocument({ data });
      const pdf = await loadingTask.promise;

      const metadata = {
        totalPages: pdf.numPages,
        hasImages: false,
        estimatedImageCount: 0,
      };

      // Quick scan of first few pages to detect images
      for (let pageNum = 1; pageNum <= Math.min(3, pdf.numPages); pageNum++) {
        const page = await pdf.getPage(pageNum);
        const operatorList = await page.getOperatorList();

        for (let i = 0; i < operatorList.fnArray.length; i++) {
          const op = operatorList.fnArray[i];
          const pdfjsModule = pdfjs.default || pdfjs;
          const OPS = pdfjsModule.OPS || {};
          const paintImageOp = OPS.paintImageXObject || 60;
          const paintJpegOp = OPS.paintJpegXObject || 61;
          
          if (op === paintImageOp || op === paintJpegOp) {
            metadata.hasImages = true;
            metadata.estimatedImageCount++;
          }
        }
      }

      return metadata;
    } catch (error) {
      console.error("Error getting image metadata:", error);
      return { hasImages: false, estimatedImageCount: 0 };
    }
  }
}

