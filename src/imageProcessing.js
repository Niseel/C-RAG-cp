import fs from "fs";
import path from "path";
import OpenAI from "openai";

// Optional imports - will be loaded dynamically if available
let tesseractJs = null;
let sharp = null;

async function loadTesseract() {
  if (!tesseractJs) {
    try {
      tesseractJs = await import("tesseract.js");
    } catch (error) {
      console.warn("  ⚠ tesseract.js not available - OCR will be disabled");
      return null;
    }
  }
  return tesseractJs;
}

async function loadSharp() {
  if (!sharp) {
    try {
      sharp = (await import("sharp")).default;
    } catch (error) {
      console.warn(
        "  ⚠ sharp not available - image preprocessing will be disabled"
      );
      return null;
    }
  }
  return sharp;
}

/**
 * Image Processing Module
 * Handles OCR and vision model descriptions for extracted images
 */

export class ImageProcessor {
  constructor(apiKey) {
    this.openai = new OpenAI({
      apiKey: apiKey || "api_key",
      baseURL: process.env.OPENAI_BASE_URL || "http://localhost:1234/v1",
    });
    this.enableOCR = process.env.USE_OCR !== "false";
    this.enableVision = process.env.USE_VISION_MODEL !== "false";
    this.visionModel = process.env.VISION_MODEL || "gpt-4-vision-preview";
    this.ocrLanguage = process.env.OCR_LANGUAGE || "eng";
    this.ocrWorker = null;
  }

  /**
   * Initialize OCR worker
   */
  async initializeOCR() {
    if (!this.enableOCR) return;

    try {
      const tesseract = await loadTesseract();
      if (!tesseract) {
        this.enableOCR = false;
        return;
      }

      console.log("  Initializing OCR engine...");
      this.ocrWorker = await tesseract.createWorker(this.ocrLanguage);
      console.log("  ✓ OCR engine ready");
    } catch (error) {
      console.warn("  ⚠ Could not initialize OCR:", error.message);
      this.enableOCR = false;
    }
  }

  /**
   * Terminate OCR worker
   */
  async terminateOCR() {
    if (this.ocrWorker) {
      await this.ocrWorker.terminate();
      this.ocrWorker = null;
    }
  }

  /**
   * Preprocess image for better OCR results
   * Converts image to a format that tesseract.js can handle
   * Uses sharp to normalize and convert to JPEG
   */
  async preprocessImage(imagePath) {
    try {
      const sharpLib = await loadSharp();
      if (!sharpLib) {
        return imagePath; // Return original if sharp not available
      }

      const processedPath = imagePath.replace(/\.[^.]+$/, "_processed.jpg");

      try {
        // Use sharp to read and convert ANY image format to JPEG
        // This handles PDF-extracted images that might be in various formats
        const image = sharpLib(imagePath);
        const metadata = await image.metadata();

        // Convert to RGB if needed (some PDF images are in CMYK or other color spaces)
        let pipeline = image.ensureAlpha().removeAlpha();

        // Convert to RGB color space for better OCR compatibility
        if (metadata.space && metadata.space !== "srgb") {
          pipeline = pipeline.toColorspace("srgb");
        }

        // Process for OCR: grayscale, normalize, sharpen, resize
        await pipeline
          .greyscale()
          .normalize()
          .sharpen()
          .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 90, mozjpeg: true }) // High quality JPEG
          .toFile(processedPath);

        return processedPath;
      } catch (convertError) {
        // If sharp conversion fails, try a simpler conversion
        try {
          console.warn(
            `  ⚠ First conversion failed, trying simpler conversion...`
          );
          await sharpLib(imagePath).jpeg({ quality: 85 }).toFile(processedPath);
          return processedPath;
        } catch (simpleError) {
          // If all conversion fails, return original and let OCR try
          console.warn(
            `  ⚠ Image conversion failed, using original: ${simpleError.message}`
          );
          return imagePath;
        }
      }
    } catch (error) {
      console.warn(
        `  ⚠ Image preprocessing error: ${error.message}, using original`
      );
      return imagePath;
    }
  }

  /**
   * Extract text from image using OCR
   */
  async extractTextWithOCR(imagePath) {
    if (!this.enableOCR || !this.ocrWorker) {
      return null;
    }

    try {
      // Check if file exists and is readable
      if (!fs.existsSync(imagePath)) {
        console.warn(`  ⚠ Image file not found: ${imagePath}`);
        return null;
      }

      // Try to preprocess the image to improve OCR accuracy
      let processedPath = imagePath;
      try {
        processedPath = await this.preprocessImage(imagePath);
      } catch (preprocessError) {
        // If preprocessing fails, still try OCR with original image
        console.warn(
          `  ⚠ Image preprocessing failed, using original: ${preprocessError.message}`
        );
        processedPath = imagePath;
      }

      // Try OCR recognition with timeout and better error handling
      let data;
      try {
        // Wrap in Promise.race to handle worker thread errors
        const ocrPromise = this.ocrWorker.recognize(processedPath);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("OCR timeout")), 30000)
        );

        const result = await Promise.race([ocrPromise, timeoutPromise]);
        data = result.data;
      } catch (ocrError) {
        // If OCR fails due to format issues, skip this image
        if (
          ocrError.message &&
          (ocrError.message.includes("unsupported image format") ||
            ocrError.message.includes("Unknown format") ||
            ocrError.message.includes("Error attempting to read image") ||
            ocrError.message.includes("OCR timeout"))
        ) {
          console.warn(
            `  ⚠ OCR cannot process image format: ${path.basename(imagePath)}`
          );
          return null;
        }
        // For other errors, log and return null instead of throwing
        console.warn(
          `  ⚠ OCR error for ${path.basename(imagePath)}: ${ocrError.message}`
        );
        return null;
      }

      // Clean up processed image
      if (processedPath !== imagePath && fs.existsSync(processedPath)) {
        try {
          fs.unlinkSync(processedPath);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }

      const text = data.text.trim();
      const confidence = data.confidence;

      if (text && confidence > 30) {
        // Only return text if confidence is reasonable
        return {
          text: text,
          confidence: confidence,
        };
      }

      return null;
    } catch (error) {
      console.warn(`  ⚠ OCR failed for ${imagePath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate description of image using vision model
   * Falls back to text-based analysis if vision model is not available
   */
  async describeImageWithVision(imagePath) {
    if (!this.enableVision) {
      return null;
    }

    try {
      // Read image as base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString("base64");

      // Determine image MIME type
      const ext = imagePath.split(".").pop().toLowerCase();
      const mimeType = ext === "png" ? "image/png" : "image/jpeg";

      // Try vision model first
      try {
        const response = await this.openai.chat.completions.create({
          model: this.visionModel,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Describe this image in detail, including any text, charts, diagrams, or visual elements. Focus on semantic information, concepts, relationships, and content that would be useful for document understanding and retrieval. Be specific about what the image shows.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 500,
        });

        const description = response.choices[0].message.content;
        return {
          description: description,
          model: this.visionModel,
        };
      } catch (visionError) {
        // If vision model fails (e.g., not supported), try text-based analysis
        if (
          visionError.message &&
          visionError.message.includes("Invalid model")
        ) {
          console.warn(
            `  ⚠ Vision model not supported, using text-based image analysis`
          );
          return await this.describeImageWithTextAnalysis(imagePath);
        }
        throw visionError;
      }
    } catch (error) {
      console.warn(
        `  ⚠ Vision model failed for ${imagePath}: ${error.message}`
      );
      // Try text-based fallback
      return await this.describeImageWithTextAnalysis(imagePath);
    }
  }

  /**
   * Fallback: Generate semantic description using text-based analysis
   * Uses file metadata and basic analysis when vision models aren't available
   */
  async describeImageWithTextAnalysis(imagePath) {
    try {
      const stats = fs.statSync(imagePath);
      const ext = path.basename(imagePath).split(".").pop().toLowerCase();
      const sizeKB = (stats.size / 1024).toFixed(2);

      // Create a semantic description based on file properties and context
      const description = `Image file (${ext.toUpperCase()}, ${sizeKB} KB). This image likely contains visual content such as diagrams, charts, screenshots, illustrations, or graphical elements. The image may contain text, data visualizations, UI elements, or other visual information relevant to the document context.`;

      return {
        description: description,
        model: "text-analysis-fallback",
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Process a single image: OCR + Vision description
   */
  async processImage(imagePath, pageNumber) {
    console.log(`  Processing image from page ${pageNumber}...`);

    const result = {
      pageNumber: pageNumber,
      imagePath: imagePath,
      ocrText: null,
      visionDescription: null,
      combinedDescription: null,
    };

    // Try OCR first (faster, free)
    if (this.enableOCR && this.ocrWorker) {
      try {
        const ocrResult = await this.extractTextWithOCR(imagePath);
        if (ocrResult) {
          result.ocrText = ocrResult.text;
          result.ocrConfidence = ocrResult.confidence;
          console.log(
            `    ✓ OCR: Extracted ${
              ocrResult.text.length
            } characters (confidence: ${ocrResult.confidence.toFixed(1)}%)`
          );
        }
      } catch (ocrError) {
        // Handle worker thread errors that might not be caught properly
        // These errors come from worker threads and may not be caught normally
        const errorMsg = ocrError?.message || String(ocrError);
        if (
          errorMsg.includes("Error attempting to read image") ||
          errorMsg.includes("Unknown format") ||
          errorMsg.includes("unsupported image format") ||
          errorMsg.includes("pixReadStream")
        ) {
          console.warn(
            `    ⚠ OCR cannot process this image format, skipping OCR`
          );
        } else {
          console.warn(`    ⚠ OCR error: ${errorMsg}`);
        }
        // Continue to vision model even if OCR fails
      }
    }

    // Try vision model (slower, costs money, but better for visual understanding)
    if (this.enableVision) {
      const visionResult = await this.describeImageWithVision(imagePath);
      if (visionResult) {
        result.visionDescription = visionResult.description;
        console.log(
          `    ✓ Vision: Generated description (${visionResult.description.length} characters)`
        );
      }
    }

    // Combine OCR and vision descriptions with rich semantic context
    // PRIORITIZE OCR TEXT - this is the actual content from images
    if (result.ocrText || result.visionDescription) {
      const parts = [];

      // Add semantic context about the image
      const semanticContext = `Image from page ${pageNumber} of the document. `;

      // PRIORITY: OCR text contains actual readable content from the image
      if (result.ocrText) {
        // OCR text is the most important - it's the actual content
        parts.push(`Text extracted from image: ${result.ocrText}`);
      }

      if (result.visionDescription) {
        parts.push(`Visual description: ${result.visionDescription}`);
      }

      // Create a rich semantic description that can be embedded
      // If we have OCR text, prioritize it heavily
      if (result.ocrText) {
        result.combinedDescription = `${semanticContext}${result.ocrText}. ${
          result.visionDescription
            ? "Visual context: " + result.visionDescription + ". "
            : ""
        }This image contains the above text content and visual information.`;
      } else {
        result.combinedDescription =
          semanticContext +
          parts.join(". ") +
          ". This image contains visual information that may include diagrams, charts, screenshots, illustrations, or other graphical content relevant to the document.";
      }
    } else {
      // Even if OCR/Vision fail, create a basic semantic description
      console.log(
        `    ⚠ No text or description extracted from image, creating basic description`
      );
      result.combinedDescription = `Image from page ${pageNumber} of the document. This image contains visual content that may include diagrams, charts, screenshots, illustrations, or other graphical elements. The image may contain information relevant to the document's content.`;
    }

    return result;
  }

  /**
   * Process multiple images
   */
  async processImages(images) {
    if (!images || images.length === 0) {
      return [];
    }

    console.log(`\n🖼️  Processing ${images.length} extracted images...`);

    // Initialize OCR if enabled
    if (this.enableOCR) {
      await this.initializeOCR();
    }

    // Set up unhandled error handler for worker thread errors
    // Worker threads can throw errors that aren't caught by normal try-catch
    const originalUnhandledRejection = process.listeners("unhandledRejection");
    const originalUncaughtException = process.listeners("uncaughtException");

    const errorHandler = (error) => {
      // Check if this is an OCR worker error we can ignore
      const errorMsg = error?.message || String(error) || "";
      if (
        errorMsg.includes("Error attempting to read image") ||
        errorMsg.includes("Unknown format") ||
        errorMsg.includes("pixReadStream") ||
        errorMsg.includes("Error: Error attempting to read image")
      ) {
        // This is expected for unsupported image formats, ignore it
        console.warn(
          `  ⚠ OCR worker error (ignored): ${errorMsg.substring(0, 100)}`
        );
        return;
      }
      // For other errors, use default handling
      if (originalUnhandledRejection.length > 0) {
        originalUnhandledRejection[0](error);
      }
    };

    const exceptionHandler = (error) => {
      const errorMsg = error?.message || String(error) || "";
      if (
        errorMsg.includes("Error attempting to read image") ||
        errorMsg.includes("Unknown format") ||
        errorMsg.includes("pixReadStream")
      ) {
        // Ignore OCR format errors
        return;
      }
      if (originalUncaughtException.length > 0) {
        originalUncaughtException[0](error);
      }
    };

    process.on("unhandledRejection", errorHandler);
    process.on("uncaughtException", exceptionHandler);

    const results = [];

    for (const image of images) {
      try {
        const result = await this.processImage(image.path, image.pageNumber);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        // Handle specific OCR errors gracefully
        if (
          error.message &&
          (error.message.includes("unsupported image format") ||
            error.message.includes("Unknown format") ||
            error.message.includes("Error attempting to read image"))
        ) {
          console.warn(
            `  ⚠ Skipping image ${path.basename(
              image.path
            )} - unsupported format for OCR`
          );
          // Still try vision model if enabled
          if (this.enableVision) {
            try {
              const visionResult = await this.describeImageWithVision(
                image.path
              );
              if (visionResult) {
                results.push({
                  pageNumber: image.pageNumber,
                  imagePath: image.path,
                  ocrText: null,
                  visionDescription: visionResult.description,
                  combinedDescription: `[Visual description: ${visionResult.description}]`,
                });
              }
            } catch (visionError) {
              console.warn(
                `  ⚠ Vision model also failed for ${path.basename(image.path)}`
              );
            }
          }
        } else {
          console.error(
            `  ✗ Error processing image ${path.basename(image.path)}:`,
            error.message
          );
        }
      }
    }

    // Clean up OCR worker
    if (this.ocrWorker) {
      await this.terminateOCR();
    }

    // Remove error handlers
    process.removeListener("unhandledRejection", errorHandler);
    process.removeListener("uncaughtException", exceptionHandler);

    console.log(
      `✓ Successfully processed ${results.length}/${images.length} images\n`
    );

    return results;
  }

  /**
   * Get processing statistics
   */
  getStats(processedImages) {
    const stats = {
      total: processedImages.length,
      withOCR: 0,
      withVision: 0,
      withBoth: 0,
    };

    processedImages.forEach((img) => {
      if (img.ocrText && img.visionDescription) {
        stats.withBoth++;
      } else if (img.ocrText) {
        stats.withOCR++;
      } else if (img.visionDescription) {
        stats.withVision++;
      }
    });

    return stats;
  }
}
