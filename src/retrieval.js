import OpenAI from "openai";
import * as lancedb from "@lancedb/lancedb";
import { QueryAnalyzer } from "./queryAnalyzer.js";
import { WebSearcher } from "./webSearch.js";

/**
 * Corrective Retrieval Module (CRAG)
 * Handles query embedding, vector similarity search, query analysis, and web search
 */

export class Retriever {
  constructor(apiKey, dbPath = "./lancedb") {
    this.openai = new OpenAI({
      apiKey: "api_key",
      baseURL: "http://localhost:1234/v1",
    });
    this.embeddingModel = process.env.EMBEDDING_MODEL; // Same model as indexing
    this.dbPath = dbPath;

    // CRAG components
    this.queryAnalyzer = new QueryAnalyzer(apiKey);
    this.webSearcher = new WebSearcher();

    // Configuration
    this.enableCorrectiveRAG = true; // Toggle CRAG on/off
    this.useQuickAnalysis = false; // Use heuristic vs LLM-based analysis
  }

  /**
   * Generate embedding for the user query
   */
  async generateQueryEmbedding(query) {
    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: query,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error("Error generating query embedding:", error);
      throw error;
    }
  }

  /**
   * Search for similar documents in LanceDB
   */
  async searchSimilarDocuments(query, topK = 3) {
    try {
      console.log("\n=== RETRIEVAL STEP (Local Documents) ===\n");
      console.log(`Query: "${query}"\n`);

      // Connect to LanceDB
      const db = await lancedb.connect(this.dbPath);
      const table = await db.openTable("documents");

      // Generate query embedding
      console.log("Generating query embedding...");
      const queryEmbedding = await this.generateQueryEmbedding(query);

      // Perform vector search
      console.log(`Searching for top ${topK} similar documents...\n`);
      const results = await table.search(queryEmbedding).limit(topK).toArray();

      // Display results
      console.log(
        `✓ Found ${results.length} relevant chunks from local documents:\n`
      );
      results.forEach((result, index) => {
        const contentType = result.contentType || "text";
        const pageInfo = result.pageNumber ? ` (Page ${result.pageNumber})` : "";
        const typeIcon = contentType === "image" ? "🖼️ " : "📄 ";
        
        console.log(
          `--- ${typeIcon}Chunk ${index + 1} [${contentType}]${pageInfo} (Distance: ${
            result._distance?.toFixed(4) || "N/A"
          }) ---`
        );
        console.log(result.text.substring(0, 200) + "...\n");
      });

      return results;
    } catch (error) {
      console.error("Error searching documents:", error);
      throw error;
    }
  }

  /**
   * Retrieve context for a query using Corrective RAG (CRAG)
   * CRAG Steps:
   * 1. Retrieve from local vector DB
   * 2. Query Analyzer evaluates the query
   * 3. ALWAYS perform web search to find additional information
   * 4. Combine full context (local + web)
   */
  async retrieveContext(query, topK = 3) {
    // Step 1: Retrieve from local documents
    const localResults = await this.searchSimilarDocuments(query, topK);
    let localContext = localResults.map((result) => result.text).join("\n\n");

    // If CRAG is disabled, return local results only
    if (!this.enableCorrectiveRAG) {
      return {
        context: localContext,
        chunks: localResults,
        webResults: null,
        analysis: null,
      };
    }

    // Step 2: Query Analyzer evaluates the query and generates search query
    console.log("\n=== QUERY ANALYSIS ===\n");
    console.log("Analyzing query to generate optimal web search...");

    const analysis = await this.queryAnalyzer.analyze(
      query,
      localResults,
      this.useQuickAnalysis
    );

    // Step 3: ALWAYS perform web search (CRAG adds web information to local retrieval)
    console.log(
      "\n📡 Performing web search to supplement local documents...\n"
    );

    const searchQuery = analysis.suggested_search_query || query;
    const webContext = await this.webSearcher.getSearchContext(searchQuery, 3);
    const webResults = { searchQuery, context: webContext };

    // Step 4: Combine full context (local + web)
    const combinedContext = `=== LOCAL DOCUMENT CONTEXT ===

${localContext}

=== WEB SEARCH CONTEXT (Additional Information) ===

${webContext}`;

    console.log(`\n✓ Full context prepared: Local Documents + Web Search`);

    return {
      context: combinedContext,
      localContext,
      webContext,
      chunks: localResults,
      webResults,
      analysis,
    };
  }

  /**
   * Configure CRAG behavior
   */
  setCRAGConfig({ enableCorrectiveRAG, useQuickAnalysis }) {
    if (enableCorrectiveRAG !== undefined) {
      this.enableCorrectiveRAG = enableCorrectiveRAG;
    }
    if (useQuickAnalysis !== undefined) {
      this.useQuickAnalysis = useQuickAnalysis;
    }
  }
}
