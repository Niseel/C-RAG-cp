import * as lancedb from "@lancedb/lancedb";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

/**
 * Debug script to check embeddings and distances
 */
async function debugEmbeddings() {
  try {
    const openai = new OpenAI({
      apiKey: "api_key",
      baseURL: "http://localhost:1234/v1",
    });
    const embeddingModel = process.env.EMBEDDING_MODEL || "nomic-embed-text-v1.5";
    
    // Connect to database
    const db = await lancedb.connect("./lancedb");
    const table = await db.openTable("documents");
    
    // Get some sample data
    const sample = await table.head(5);
    console.log("Sample chunks:");
    sample.forEach((row, idx) => {
      console.log(`\nChunk ${idx + 1}:`);
      console.log(`  Text: ${row.text?.substring(0, 100)}...`);
      console.log(`  ContentType: ${row.contentType || 'text'}`);
      console.log(`  Vector length: ${row.vector?.length || 0}`);
      if (row.vector && row.vector.length > 0) {
        console.log(`  First 5 vector values: ${row.vector.slice(0, 5).join(', ')}`);
      }
    });
    
    // Test query embedding
    const testQuery = "What is semantic AI?";
    console.log(`\n\nTesting query: "${testQuery}"`);
    const queryResponse = await openai.embeddings.create({
      model: embeddingModel,
      input: testQuery,
    });
    const queryEmbedding = queryResponse.data[0].embedding;
    console.log(`Query embedding length: ${queryEmbedding.length}`);
    console.log(`First 5 query vector values: ${queryEmbedding.slice(0, 5).join(', ')}`);
    
    // Perform search
    const results = await table.search(queryEmbedding).limit(3).toArray();
    console.log(`\n\nSearch results:`);
    results.forEach((result, idx) => {
      console.log(`\nResult ${idx + 1}:`);
      console.log(`  Distance: ${result._distance}`);
      console.log(`  Text: ${result.text?.substring(0, 100)}...`);
      console.log(`  ContentType: ${result.contentType || 'text'}`);
    });
    
    // Check if embeddings are identical
    if (sample.length >= 2) {
      const vec1 = sample[0].vector;
      const vec2 = sample[1].vector;
      if (vec1 && vec2) {
        let identical = true;
        for (let i = 0; i < Math.min(vec1.length, vec2.length); i++) {
          if (vec1[i] !== vec2[i]) {
            identical = false;
            break;
          }
        }
        console.log(`\n\nAre first two embeddings identical? ${identical}`);
      }
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

debugEmbeddings();

