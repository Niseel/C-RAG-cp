import OpenAI from "openai";

/**
 * Query Analyzer Module
 * Evaluates retrieval quality and determines if additional web search is needed
 * Core component of Corrective RAG (CRAG)
 */

export class QueryAnalyzer {
  constructor(apiKey) {
    this.openai = new OpenAI({
      apiKey: "api_key",
      baseURL: "http://localhost:1234/v1",
    });
    this.model = process.env.LLM_MODEL;
  }

  /**
   * Evaluate the relevance of retrieved documents to the query
   * Returns a score and determination if web search is needed
   */
  async evaluateRetrievalQuality(query, retrievedChunks) {
    try {
      console.log("\n=== QUERY ANALYSIS ===\n");
      console.log("Evaluating retrieval quality...");

      // Prepare the retrieved context
      const context = retrievedChunks
        .map(
          (chunk, idx) =>
            `[Chunk ${idx + 1}]: ${chunk.text.substring(0, 200)}...`
        )
        .join("\n\n");

      const analysisPrompt = `You are a query analyzer for a Retrieval-Augmented Generation (RAG) system.

Your task is to evaluate if the retrieved documents are sufficient to answer the user's query.

User Query: "${query}"

Retrieved Documents:
${context}

Analyze the relevance and completeness of the retrieved documents. Consider:
1. Do the documents directly address the query?
2. Is there enough information to provide a complete answer?
3. Are the documents current and relevant?
4. Does the query ask for recent/current information that might not be in the documents?

Respond in JSON format with:
{
  "relevance_score": <number 0-10>,
  "is_sufficient": <boolean>,
  "requires_web_search": <boolean>,
  "reasoning": "<brief explanation>",
  "suggested_search_query": "<optimized search query if web search needed, or null>"
}`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are a precise query analyzer. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: analysisPrompt,
          },
        ],
        temperature: 0.3,
      });

      let content = response.choices[0].message.content;

      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        content = jsonMatch[1];
      }

      const analysis = JSON.parse(content.trim());

      // Display analysis results
      console.log(`✓ Relevance Score: ${analysis.relevance_score}/10`);
      console.log(
        `✓ Documents Sufficient: ${analysis.is_sufficient ? "Yes" : "No"}`
      );
      console.log(
        `✓ Web Search Required: ${analysis.requires_web_search ? "Yes" : "No"}`
      );
      console.log(`  Reasoning: ${analysis.reasoning}`);

      if (analysis.requires_web_search && analysis.suggested_search_query) {
        console.log(`  Suggested Search: "${analysis.suggested_search_query}"`);
      }

      return analysis;
    } catch (error) {
      console.error("Error analyzing query:", error.message);
      // Default to using retrieved docs if analysis fails
      return {
        relevance_score: 5,
        is_sufficient: true,
        requires_web_search: false,
        reasoning: "Analysis failed, using retrieved documents only",
        suggested_search_query: null,
      };
    }
  }

  /**
   * Determine if query needs web search based on query type
   * Quick heuristic-based approach (alternative to LLM-based analysis)
   */
  async quickAnalysis(query, retrievedChunks) {
    const queryLower = query.toLowerCase();

    // Keywords that often indicate need for current/web information
    const webIndicators = [
      "latest",
      "recent",
      "current",
      "today",
      "now",
      "new",
      "news",
      "update",
      "trend",
      "price",
      "stock",
      "weather",
      "2024",
      "2025",
      "this year",
      "this month",
    ];

    // Check if query contains web indicators
    const needsWebInfo = webIndicators.some((indicator) =>
      queryLower.includes(indicator)
    );

    // Check if retrieved chunks are very short or empty
    const totalLength = retrievedChunks.reduce(
      (sum, chunk) => sum + (chunk.text?.length || 0),
      0
    );

    const requiresWeb = needsWebInfo || totalLength < 100;

    return {
      relevance_score: requiresWeb ? 4 : 7,
      is_sufficient: !requiresWeb,
      requires_web_search: requiresWeb,
      reasoning: requiresWeb
        ? "Query appears to need current information or retrieved content is insufficient"
        : "Retrieved documents should be sufficient",
      suggested_search_query: requiresWeb ? query : null,
    };
  }

  /**
   * Analyze and decide on retrieval strategy
   */
  async analyze(query, retrievedChunks, useQuickAnalysis = false) {
    if (useQuickAnalysis) {
      return await this.quickAnalysis(query, retrievedChunks);
    } else {
      return await this.evaluateRetrievalQuality(query, retrievedChunks);
    }
  }
}
