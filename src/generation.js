import OpenAI from "openai";

/**
 * Generation Module
 * Handles answer generation using OpenAI's LLM
 */

export class Generator {
  constructor(apiKey) {
    this.openai = new OpenAI({
      apiKey: "api_key",
      baseURL: "http://localhost:1234/v1",
    });
    this.model = process.env.LLM_MODEL;
  }

  /**
   * Generate answer using OpenAI's chat completion
   */
  async generateAnswer(prompt, temperature = 0.7) {
    try {
      console.log("\n=== GENERATION STEP ===\n");
      console.log("Generating answer using OpenAI...\n");

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: temperature,
        max_tokens: 500,
      });

      const answer = response.choices[0].message.content;

      // Display the answer
      console.log("=== ANSWER ===\n");
      console.log(answer);
      console.log("\n" + "=".repeat(40));

      return answer;
    } catch (error) {
      console.error("Error generating answer:", error.message);
      throw error;
    }
  }

  /**
   * Generate answer with streaming (for real-time display)
   */
  async generateAnswerStreaming(prompt, temperature = 0.7) {
    try {
      console.log("\n=== GENERATION STEP ===\n");
      console.log("Generating answer using OpenAI...\n");
      console.log("=== ANSWER ===\n");

      const stream = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: temperature,
        max_tokens: 500,
        stream: true,
      });

      let fullAnswer = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        process.stdout.write(content);
        fullAnswer += content;
      }

      console.log("\n" + "=".repeat(40));

      return fullAnswer;
    } catch (error) {
      console.error("Error generating answer:", error.message);
      throw error;
    }
  }

  /**
   * Change the model being used
   */
  setModel(modelName) {
    this.model = modelName;
    console.log(`Model changed to: ${modelName}`);
  }
}
