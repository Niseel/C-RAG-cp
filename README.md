# Corrective RAG (CRAG) Application

A **Corrective Retrieval-Augmented Generation (CRAG)** system built with JavaScript, LanceDB, OpenAI, and Google Search. This console application demonstrates an advanced RAG architecture with **query analysis** and **web search correction**: **Indexing**, **Retrieval + Analysis**, **Web Search**, **Augmentation**, and **Generation**.

## 🏗️ Architecture

This application implements the **Corrective RAG (CRAG)** pipeline:

### 1. **Indexing (I)**

- Extracts text content from PDF files
- **Extracts and processes images from PDFs** (OCR + Vision models)
- Splits text into manageable chunks
- Generates embeddings using OpenAI's embedding model (`text-embedding-nomic-embed-text-v1.5`)
- Stores embeddings in a local LanceDB vector database (text + image descriptions)

### 2. **Retrieval (R) + Query Analysis**

- Converts user queries into embeddings using the same embedding model
- Performs vector similarity search in LanceDB
- **Analyzes retrieval quality** using LLM or heuristics
- Evaluates if local documents are sufficient to answer the query

### 3. **Web Search (Corrective Step)**

- If local documents are insufficient, performs **Google Search** using `googlethis` library
- Extracts snippets, featured snippets, and knowledge graph information
- Combines web context with local document context

### 4. **Augmentation (A)**

- Provides an interactive console Q&A interface
- Combines user queries with retrieved context (local + web)
- Prepares augmented prompts for the LLM

### 5. **Generation (G)**

- Uses OpenAI's GPT model to generate answers
- Leverages combined context for accurate, grounded responses
- Provides answers based on both local documents and web information

## 🎯 What Makes This CRAG?

**Corrective RAG** improves upon traditional RAG by:

- ✅ **Evaluating retrieval quality** before generating answers
- ✅ **Automatically searching the web** when local documents are insufficient
- ✅ **Combining multiple sources** (local + web) for better accuracy
- ✅ **Handling time-sensitive queries** (news, current events, recent data)
- ✅ **Using Google Search** with featured snippets and knowledge graphs
- ✅ **Processing images from PDFs** using OCR and vision models for comprehensive document understanding

## 📋 Prerequisites

- **Node.js** (v18 or higher)
- **OpenAI API Key** ([Get one here](https://platform.openai.com/api-keys))
- A **PDF file** with text content (and optionally images)
- **Internet connection** for web search
- **System dependencies** for image processing (Canvas, Sharp - installed automatically via npm)

## 🚀 Installation

1. **Clone or navigate to the project directory:**

   ```bash
   cd "c:\Users\H280946\Documents\GitHub\AI Project\RAGs"
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure environment variables:**

   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Edit `.env` and add your OpenAI API key:
     ```
     OPENAI_API_KEY=sk-your-actual-api-key-here
     PDF_PATH=./data/sample.pdf
     DB_PATH=./lancedb
     ```

4. **Add your PDF file:**
   - Create a `data` folder and place your PDF file there:
     ```bash
     mkdir data
     # Then copy your PDF to ./data/sample.pdf
     ```

## 📖 Usage

### Step 1: Index Your PDF

First, index your PDF document to create the vector database:

```bash
npm run index
```

This will:

- Extract text from your PDF
- **Extract images from your PDF** (if enabled)
- **Process images with OCR and vision models** to extract text and descriptions
- Generate embeddings for text chunks and image descriptions
- Store embeddings in LanceDB
- Create a `lancedb/` folder with the vector database

### Step 2: Query the System

Start the interactive Q&A session:

```bash
npm start
```

Or explicitly:

```bash
npm run query
```

Then type your questions and get answers based on your PDF content!

**Example:**

```
Enter your question: What is the main topic of this document?
```

**CRAG in Action:**

- If your PDF contains the answer → Uses local documents
- If query needs current info (e.g., "latest AI trends") → Searches Google + uses local docs
- If local docs are unclear → Automatically searches web for additional context

Type `exit` or `quit` to end the session.

### View Help

```bash
node src/main.js --help
```

## 📁 Project Structure

```
RAGs/
├── src/
│   ├── main.js          # Main application entry point (CRAG orchestrator)
│   ├── indexing.js      # Indexing module (PDF processing & embedding)
│   ├── retrieval.js     # CRAG Retrieval module (vector search + analysis + web)
│   ├── queryAnalyzer.js # Query analyzer (evaluates retrieval quality)
│   ├── webSearch.js     # Web search module (Google search with googlethis)
│   ├── augment.js       # Augmentation module (Q&A interface)
│   └── generation.js    # Generation module (LLM responses)
├── data/
│   └── sample.pdf       # Your PDF files (you need to add this)
├── lancedb/             # Vector database (created automatically)
├── .env                 # Environment variables (create from .env.example)
├── .env.example         # Example environment configuration
├── .gitignore          # Git ignore file
├── package.json        # Project dependencies
└── README.md           # This file
```

## 🔧 Configuration

Edit the `.env` file to customize:

- `OPENAI_API_KEY`: Your OpenAI API key (required)
- `PDF_PATH`: Path to your PDF file (default: `./data/sample.pdf`)
- `DB_PATH`: Path to store the vector database (default: `./lancedb`)
- `EMBEDDING_MODEL`: Embedding model name (default: `nomic-embed-text-v1.5`)
- `LLM_MODEL`: LLM model for generation (default: `gpt-4`)

### Image Processing Configuration

- `ENABLE_IMAGE_PROCESSING`: Enable/disable image extraction (default: `true`)
- `USE_OCR`: Enable OCR for text extraction from images (default: `true`)
- `USE_VISION_MODEL`: Enable vision models for image descriptions (default: `true`)
- `VISION_MODEL`: Vision model to use (default: `gpt-4-vision-preview`)
- `OCR_LANGUAGE`: OCR language code (default: `eng`)

## 🧩 Modules Overview

| Module               | File               | Purpose                                                                  |
| -------------------- | ------------------ | ------------------------------------------------------------------------ |
| **Indexing**         | `indexing.js`      | PDF text extraction, image extraction/processing, chunking, embedding generation, vector storage      |
| **Image Extraction** | `imageExtraction.js` | Extracts images from PDF files using pdfjs-dist                        |
| **Image Processing** | `imageProcessing.js` | OCR and vision model processing for extracted images                   |
| **Retrieval (CRAG)** | `retrieval.js`     | Query embedding, vector search, quality analysis, web search integration | 
| **Query Analyzer**   | `queryAnalyzer.js` | Evaluates retrieval quality, determines if web search is needed          |
| **Web Search**       | `webSearch.js`     | Google search using googlethis, extracts snippets and knowledge graphs   |
| **Augmentation**     | `augment.js`       | Console Q&A interface, prompt augmentation with combined context         |
| **Generation**       | `generation.js`    | LLM-based answer generation using OpenAI                                 |

## 💡 How It Works (CRAG Pipeline)

1. **Indexing Phase:**

   - Your PDF is processed and split into chunks
   - Each chunk is converted to a vector embedding
   - Embeddings are stored in LanceDB for fast retrieval

2. **Query Phase (CRAG):**
   - You enter a question in the console
   - The question is converted to a vector embedding
   - LanceDB finds the most similar document chunks
   - **Query Analyzer evaluates** if local documents are sufficient
   - If needed, **performs Google Search** for additional information
   - **Combines local + web context**
   - OpenAI generates an answer based on the combined context

## 🔍 CRAG Features in Detail

### Query Analysis

The system automatically analyzes whether local documents are sufficient:

- Checks relevance of retrieved chunks to the query
- Detects queries that need current/recent information
- Evaluates completeness of available context

### Web Search Integration

When local documents are insufficient:

- Uses `googlethis` library for Google Search
- Extracts featured snippets for quick facts
- Retrieves knowledge graph information
- Combines top search results with local context

### Context Combination

Intelligently merges information from multiple sources:

- Local documents (your PDFs)
- Web search results (Google)
- Featured snippets and knowledge panels

## 🛠️ Troubleshooting

### "OPENAI_API_KEY not found"

- Make sure you've created a `.env` file
- Add your OpenAI API key to `.env`

### "PDF file not found"

- Ensure your PDF is in the correct location (default: `./data/sample.pdf`)
- Or update `PDF_PATH` in `.env` to point to your PDF

### "Vector database not found"

- Run `npm run index` first to create the database
- The database is created in the `lancedb/` folder

### "Web search failed"

- This is normal - the system will continue with local documents only
- Check your internet connection
- The `googlethis` library doesn't require API keys

## 📦 Dependencies

- **@lancedb/lancedb**: Vector database for embeddings
- **openai**: OpenAI API client for embeddings and LLM
- **pdf-parse**: PDF text extraction
- **pdfjs-dist**: PDF parsing and image extraction
- **tesseract.js**: OCR for text extraction from images
- **canvas**: Image processing and manipulation
- **sharp**: High-performance image processing
- **dotenv**: Environment variable management
- **readline**: Console input/output
- **googlethis**: Google search without API keys

## 📝 License

MIT

## 🤝 Contributing

Feel free to open issues or submit pull requests!

## 🖼️ Image Processing Features

This CRAG system now supports **comprehensive image processing** from PDFs:

### How It Works

1. **Image Extraction**: Uses `pdfjs-dist` to extract all images from PDF pages
2. **OCR Processing**: Uses `tesseract.js` to extract text from images (free, local processing)
3. **Vision Descriptions**: Uses OpenAI GPT-4 Vision to generate detailed descriptions of images
4. **Combined Storage**: Stores both OCR text and vision descriptions as searchable chunks

### Benefits

- ✅ **Captures text in images**: Charts, diagrams, scanned documents
- ✅ **Understands visual content**: Describes charts, infographics, photos
- ✅ **Comprehensive retrieval**: Can answer questions about visual content
- ✅ **Configurable**: Enable/disable OCR and vision models independently

### Cost Considerations

- **OCR (Tesseract.js)**: Free, runs locally
- **Vision Models**: ~$0.01-0.03 per image (GPT-4 Vision)
- **Recommendation**: Use OCR for text-heavy images, vision models for complex visuals

### Performance

- Image extraction: ~1-2 seconds per page
- OCR processing: ~2-5 seconds per image
- Vision model: ~2-5 seconds per image
- Total indexing time: ~5-10 seconds per page with images

## ⚡ Next Steps

To extend this CRAG application, consider:

- Adding support for multiple PDF files
- Implementing conversation history and multi-turn dialogues
- Adding web interface with Express.js
- Supporting other document types (DOCX, TXT, Markdown, etc.)
- Implementing advanced chunking strategies (semantic chunking)
- Adding metadata filtering and hybrid search
- Fine-tuning query analysis thresholds
- Adding more web sources (news APIs, academic papers, etc.)
- Implementing document re-ranking after retrieval
- Adding caching for web search results
- **Multimodal embeddings** for native image search
- **Image similarity search** using CLIP or similar models

---

**Happy CRAG-ing! 🚀**

- Using different embedding models

---

**Happy RAG-ing! 🚀**
