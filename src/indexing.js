import fs from "fs";
import pdf from "pdf-parse";
import OpenAI from "openai";
import * as lancedb from "@lancedb/lancedb";
import { ImageExtractor } from "./imageExtraction.js";
import { ImageProcessor } from "./imageProcessing.js";

/**
 * Indexing Module
 * Handles PDF processing, text extraction, image extraction/processing, and embedding generation
 */

export class Indexer {
  constructor(apiKey) {
    this.openai = new OpenAI({
      apiKey: "api_key",
      baseURL: "http://localhost:1234/v1",
    });
    this.embeddingModel = process.env.EMBEDDING_MODEL; // Same model for indexing and retrieval
    this.enableImageProcessing = process.env.ENABLE_IMAGE_PROCESSING !== "false";
    
    // Initialize image processing components (only if dependencies are available)
    if (this.enableImageProcessing) {
      try {
        this.imageExtractor = new ImageExtractor();
        this.imageProcessor = new ImageProcessor(apiKey);
      } catch (error) {
        console.warn("⚠ Image processing dependencies not available. Continuing with text-only indexing.");
        console.warn(`  Error: ${error.message}`);
        this.enableImageProcessing = false;
      }
    }
  }

  /**
   * Extract text from PDF file
   */
  async extractTextFromPDF(pdfPath) {
    try {
      const dataBuffer = fs.readFileSync(pdfPath);
      const data = await pdf(dataBuffer);

      console.log(`✓ PDF loaded: ${data.numpages} pages`);
      console.log(`✓ Text extracted: ${data.text.length} characters`);

      return data.text;
    } catch (error) {
      console.error("Error extracting text from PDF:", error);
      throw error;
    }
  }

  /**
   * Split text into chunks for better retrieval
   */
  chunkText(text, chunkSize = 500, overlap = 50) {
    const chunks = [];
    const sentences = text.split(/[.!?]\s+/);
    let currentChunk = "";

    for (const sentence of sentences) {
      if (
        (currentChunk + sentence).length > chunkSize &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk.trim());
        // Keep overlap by taking last few words
        const words = currentChunk.split(" ");
        currentChunk = words.slice(-overlap / 10).join(" ") + " " + sentence;
      } else {
        currentChunk += sentence + ". ";
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    console.log(`✓ Text split into ${chunks.length} chunks`);
    return chunks;
  }

  /**
   * Generate embeddings for text chunks using OpenAI
   */
  async generateEmbeddings(textChunks) {
    try {
      console.log("Generating embeddings...");
      const embeddings = [];

      // Process in batches to avoid rate limits
      const batchSize = 20;
      for (let i = 0; i < textChunks.length; i += batchSize) {
        const batch = textChunks.slice(i, i + batchSize);
        const response = await this.openai.embeddings.create({
          model: this.embeddingModel,
          input: batch,
        });

        embeddings.push(...response.data.map((item) => item.embedding));
        console.log(
          `  Progress: ${Math.min(i + batchSize, textChunks.length)}/${
            textChunks.length
          } chunks`
        );
      }

      console.log(`✓ Generated ${embeddings.length} embeddings`);
      return embeddings;
    } catch (error) {
      console.error("Error generating embeddings:", error);
      throw error;
    }
  }

  /**
   * Store embeddings in LanceDB
   * Now supports both text and image chunks
   */
  async storeInVectorDB(chunks, embeddings, dbPath = "./lancedb") {
    try {
      console.log("Storing embeddings in LanceDB...");

      // Connect to LanceDB
      const db = await lancedb.connect(dbPath);

      // Prepare data for storage
      // chunks can be either strings (text) or objects (with text, contentType, pageNumber, etc.)
      const data = chunks.map((chunk, index) => {
        const chunkData = {
          text: typeof chunk === "string" ? chunk : chunk.text || chunk.combinedDescription,
          vector: embeddings[index],
          id: index,
        };

        // Add metadata if chunk is an object
        if (typeof chunk === "object") {
          chunkData.contentType = chunk.contentType || "text";
          // Only include pageNumber if it's not null/undefined (LanceDB can't handle all nulls)
          if (chunk.pageNumber !== null && chunk.pageNumber !== undefined) {
            chunkData.pageNumber = chunk.pageNumber;
          }
          if (chunk.imagePath) {
            chunkData.imagePath = chunk.imagePath;
          }
          if (chunk.ocrText) {
            chunkData.ocrText = chunk.ocrText;
          }
          if (chunk.visionDescription) {
            chunkData.visionDescription = chunk.visionDescription;
          }
          // Ensure text field has meaningful content for semantic search
          if (!chunkData.text || chunkData.text.trim().length === 0) {
            // Create a semantic description from available metadata
            const semanticParts = [];
            if (chunk.ocrText) semanticParts.push(`Contains text: ${chunk.ocrText}`);
            if (chunk.visionDescription) semanticParts.push(`Visual content: ${chunk.visionDescription}`);
            if (chunk.pageNumber) semanticParts.push(`From page ${chunk.pageNumber}`);
            chunkData.text = semanticParts.length > 0 
              ? semanticParts.join(". ") 
              : `Image content from page ${chunk.pageNumber || 'unknown'}`;
          }
        } else {
          chunkData.contentType = "text";
        }

        return chunkData;
      });

      // Create or overwrite table
      const tableName = "documents";
      try {
        await db.dropTable(tableName);
      } catch (error) {
        // Table doesn't exist, that's fine
      }

      const table = await db.createTable(tableName, data);

      console.log(`✓ Stored ${data.length} embeddings in LanceDB`);
      return table;
    } catch (error) {
      console.error("Error storing in vector DB:", error);
      throw error;
    }
  }

  /**
   * Process images from PDF and create chunks
   */
  async processImagesFromPDF(pdfPath) {
    if (!this.enableImageProcessing || !this.imageExtractor || !this.imageProcessor) {
      return [];
    }

    try {
      // Extract images from PDF
      const images = await this.imageExtractor.extractImagesFromPDF(pdfPath);

      if (images.length === 0) {
        console.log("  No images found in PDF\n");
        return [];
      }

      // Process images (OCR + Vision)
      const processedImages = await this.imageProcessor.processImages(images);

      // Convert processed images to chunks
      const imageChunks = processedImages.map((img) => ({
        text: img.combinedDescription,
        contentType: "image",
        pageNumber: img.pageNumber,
        imagePath: img.imagePath,
        ocrText: img.ocrText,
        visionDescription: img.visionDescription,
      }));

      // Show statistics
      const stats = this.imageProcessor.getStats(processedImages);
      console.log(`📊 Image Processing Stats:`);
      console.log(`   Total images: ${stats.total}`);
      console.log(`   With OCR only: ${stats.withOCR}`);
      console.log(`   With Vision only: ${stats.withVision}`);
      console.log(`   With both: ${stats.withBoth}\n`);

      return imageChunks;
    } catch (error) {
      console.error("Error processing images:", error);
      console.log("  Continuing with text-only indexing...\n");
      return [];
    }
  }

  /**
   * Main indexing pipeline
   * Now includes image extraction and processing
   */
  async indexPDF(pdfPath, dbPath = "./lancedb") {
    console.log("\n=== INDEXING STEP ===\n");

    // Step 1: Extract text from PDF
    const text = await this.extractTextFromPDF(pdfPath);

    // Step 2: Split text into chunks
    const textChunks = this.chunkText(text);
    const textChunkObjects = textChunks.map((chunk) => ({
      text: chunk,
      contentType: "text",
    }));

    // Step 3: Extract and process images (if enabled)
    let imageChunks = [];
    if (this.enableImageProcessing) {
      imageChunks = await this.processImagesFromPDF(pdfPath);
    }

    // Step 4: Combine text and image chunks
    let allChunks = [...textChunkObjects, ...imageChunks];
    console.log(`✓ Total chunks to index: ${textChunks.length} text + ${imageChunks.length} image = ${allChunks.length} total\n`);

    // Step 5: Generate embeddings for all chunks
    // Ensure we have valid, meaningful text for each chunk
    const chunkTexts = allChunks.map((chunk, idx) => {
      if (typeof chunk === "string") {
        return chunk;
      }
      // For image chunks, prioritize OCR TEXT - this is the actual content!
      // OCR text contains the real semantic content from images
      let text = null;
      
      // PRIORITY 1: If we have OCR text, use it as the primary content
      if (chunk.ocrText && chunk.ocrText.trim().length > 0) {
        // OCR text is the actual readable content - this is what we want to search
        text = `Image from page ${chunk.pageNumber || 'unknown'}: ${chunk.ocrText}`;
        if (chunk.visionDescription) {
          text += ` Visual context: ${chunk.visionDescription}`;
        }
      } 
      // PRIORITY 2: Use combinedDescription (which should include OCR text)
      else if (chunk.combinedDescription && chunk.combinedDescription.trim().length > 0) {
        text = chunk.combinedDescription;
      }
      // PRIORITY 3: Use vision description if available
      else if (chunk.visionDescription && chunk.visionDescription.trim().length > 0) {
        text = `Image from page ${chunk.pageNumber || 'unknown'}: ${chunk.visionDescription}`;
      }
      // PRIORITY 4: Fallback to generic description
      else if (chunk.text && chunk.text.trim().length > 0) {
        text = chunk.text;
      }
      // PRIORITY 5: Create from available metadata
      else {
        const parts = [];
        if (chunk.ocrText) {
          parts.push(`Text content: ${chunk.ocrText}`);
        }
        if (chunk.visionDescription) {
          parts.push(`Visual description: ${chunk.visionDescription}`);
        }
        if (chunk.pageNumber) {
          parts.push(`From page ${chunk.pageNumber}`);
        }
        text = parts.length > 0 
          ? parts.join(". ") 
          : `Image content from page ${chunk.pageNumber || 'unknown'} containing visual information`;
      }
      
      // Ensure text is not empty and has semantic value
      if (!text || text.trim().length === 0) {
        console.warn(`  ⚠ Empty chunk at index ${idx}, using fallback description`);
        return `Visual content from page ${chunk.pageNumber || 'unknown'} with graphical elements, diagrams, or illustrations`;
      }
      
      // Log image chunk content for debugging
      if (chunk.contentType === "image") {
        console.log(`  Image chunk ${idx}: ${text.substring(0, 100)}...`);
      }
      
      return text;
    });
    
    // Filter out any empty chunks before embedding
    const validChunks = [];
    const validChunkTexts = [];
    chunkTexts.forEach((text, idx) => {
      if (text && text.trim().length > 0) {
        validChunks.push(allChunks[idx]);
        validChunkTexts.push(text);
      }
    });
    
    if (validChunkTexts.length !== chunkTexts.length) {
      console.log(`  Filtered ${chunkTexts.length - validChunkTexts.length} empty chunks`);
    }
    
    console.log(`  Generating embeddings for ${validChunkTexts.length} valid chunks...`);
    const embeddings = await this.generateEmbeddings(validChunkTexts);
    
    // Update allChunks to only include valid ones for storage
    allChunks = validChunks;

    // Step 6: Store in vector database
    await this.storeInVectorDB(allChunks, embeddings, dbPath);

    // Cleanup temporary images
    if (this.imageExtractor) {
      this.imageExtractor.cleanup();
    }

    console.log("\n✓ Indexing completed successfully!");
    console.log(`  - Text chunks: ${textChunks.length}`);
    console.log(`  - Image chunks: ${imageChunks.length}`);
    console.log(`  - Total chunks: ${allChunks.length}\n`);
  }
}
