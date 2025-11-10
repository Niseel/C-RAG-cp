import readline from "readline";

/**
 * Augment Module
 * Handles user interaction and query augmentation with retrieved context
 */

export class Augmenter {
  constructor() {
    this.rl = null;
  }

  /**
   * Create readline interface for console input
   */
  createInterface() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * Close readline interface
   */
  close() {
    if (this.rl) {
      this.rl.close();
    }
  }

  /**
   * Prompt user for input
   */
  async prompt(question) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer);
      });
    });
  }

  /**
   * Get query from user via console
   */
  async getUserQuery() {
    console.log("\n=== AUGMENT STEP ===\n");
    const query = await this.prompt("Enter your question: ");
    return query.trim();
  }

  /**
   * Augment the query with retrieved context
   * Prepares the prompt for the LLM
   */
  augmentQueryWithContext(query, context) {
    const augmentedPrompt = `You are a helpful assistant. Answer the user's question based on the following context. If the answer cannot be found in the context, say 'I dont Know - Call ThanhNC40'.

Context:
${context}

User Question: ${query}

Answer:`;

    return augmentedPrompt;
  }

  /**
   * Interactive Q&A session
   */
  async startQASession(retriever, generator) {
    this.createInterface();

    console.log("\n========================================");
    console.log("   RAG Q&A System");
    console.log("========================================");
    console.log('Type your question or "exit" to quit\n');

    while (true) {
      try {
        // Get user query
        const query = await this.getUserQuery();

        // Check for exit command
        if (query.toLowerCase() === "exit" || query.toLowerCase() === "quit") {
          console.log("\nGoodbye! 👋\n");
          break;
        }

        if (!query) {
          console.log("Please enter a valid question.\n");
          continue;
        }

        // Retrieve relevant context
        const { context } = await retriever.retrieveContext(query, 30);

        // Augment query with context
        const augmentedPrompt = this.augmentQueryWithContext(query, context);

        // Generate answer
        await generator.generateAnswer(augmentedPrompt);

        console.log("\n" + "=".repeat(40) + "\n");
      } catch (error) {
        console.error("Error during Q&A session:", error.message);
        console.log("Please try again.\n");
      }
    }

    this.close();
  }
}
