import dotenv from 'dotenv';
import { Indexer } from './indexing.js';
import { Retriever } from './retrieval.js';
import { Augmenter } from './augment.js';
import { Generator } from './generation.js';
import fs from 'fs';

// Load environment variables
dotenv.config();

/**
 * Main CRAG Application (Corrective RAG)
 * Orchestrates the entire CRAG pipeline: Indexing -> Retrieval + Analysis + Web Search -> Augmentation -> Generation
 */

class RAGApplication {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.pdfPath = process.env.PDF_PATH;
    this.dbPath = process.env.DB_PATH;
    
    // if (!this.apiKey) {
    //   console.error('❌ Error: OPENAI_API_KEY not found in environment variables');
    //   console.log('Please create a .env file with your OpenAI API key');
    //   process.exit(1);
    // }
    
    this.indexer = new Indexer(this.apiKey);
    this.retriever = new Retriever(this.apiKey, this.dbPath);
    this.augmenter = new Augmenter();
    this.generator = new Generator(this.apiKey);
    
    console.log('ℹ  Corrective RAG enabled - will use web search when local documents are insufficient');
  }

  /**
   * Run the indexing step
   */
  async runIndexing() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    CRAG INDEXING PIPELINE             ║');
    console.log('╚════════════════════════════════════════╝');
    
    // Check if PDF exists
    if (!fs.existsSync(this.pdfPath)) {
      console.error(`❌ Error: PDF file not found at ${this.pdfPath}`);
      console.log('Please provide a PDF file in the correct location');
      process.exit(1);
    }
    
    await this.indexer.indexPDF(this.pdfPath, this.dbPath);
    
    console.log('✅ Your documents are now indexed and ready for queries!');
    console.log(`\nTo start querying, run: npm start\n`);
  }

  /**
   * Run the query step (Retrieval + Analysis + Web Search + Augmentation + Generation)
   */
  async runQuery() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    CRAG QUERY PIPELINE                ║');
    console.log('║    (Corrective RAG)                   ║');
    console.log('╚════════════════════════════════════════╝');
    
    // Check if database exists
    if (!fs.existsSync(this.dbPath)) {
      console.error('❌ Error: Vector database not found');
      console.log('Please run indexing first: npm run index');
      process.exit(1);
    }
    
    // Start interactive Q&A session
    await this.augmenter.startQASession(this.retriever, this.generator);
  }

  /**
   * Run both indexing and query in sequence
   */
  async runFull() {
    await this.runIndexing();
    console.log('\nStarting query mode...\n');
    await this.runQuery();
  }
}

// Main entry point
async function main() {
  const app = new RAGApplication();
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--index')) {
    // Run only indexing
    await app.runIndexing();
  } else if (args.includes('--query')) {
    // Run only query
    await app.runQuery();
  } else if (args.includes('--help') || args.includes('-h')) {
    // Show help
    console.log(`
CRAG Application - Corrective Retrieval-Augmented Generation System

Usage:
  npm start              - Run query mode (requires indexed documents)
  npm run index          - Index PDF documents into vector database
  npm run query          - Run query mode (same as npm start)

Options:
  --index                - Run indexing only
  --query                - Run query only
  --help, -h             - Show this help message

Environment Variables (set in .env file):
  OPENAI_API_KEY         - Your OpenAI API key (required)
  PDF_PATH               - Path to PDF file (default: ./data/sample.pdf)
  DB_PATH                - Path to LanceDB database (default: ./lancedb)

Features:
  - Local document retrieval using LanceDB vector search
  - Automatic query analysis to evaluate retrieval quality
  - Web search (Google) when local documents are insufficient
  - Combined context from local + web sources for better answers

Examples:
  npm run index          - Index your PDF first
  npm start              - Start asking questions with CRAG
    `);
  } else {
    // Default: run query mode
    await app.runQuery();
  }
}

// Run the application
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
