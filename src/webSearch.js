import { search } from 'googlethis';

/**
 * Web Search Module
 * Performs Google searches and extracts content from web pages
 * Used in Corrective RAG to supplement local document retrieval
 */

export class WebSearcher {
  constructor() {
    this.maxResults = 5;
  }

  /**
   * Perform Google search using googlethis library
   */
  async performSearch(query, numResults = 3) {
    try {
      console.log('\n=== WEB SEARCH ===\n');
      console.log(`Searching for: "${query}"`);
      
      const options = {
        page: 0,
        safe: false,
        parse_ads: false,
        additional_params: {
          hl: 'en'
        }
      };

      // Perform the search
      const response = await search(query, options);
      
      // Extract organic results
      const results = response.results.slice(0, numResults).map((result, idx) => ({
        title: result.title || '',
        link: result.url || '',
        description: result.description || '',
        snippet: result.description || '',
        source: 'google'
      }));

      if (results.length === 0) {
        console.log('⚠ No search results found');
        return [];
      }

      console.log(`✓ Found ${results.length} search results\n`);

      // Display results
      results.forEach((result, idx) => {
        console.log(`${idx + 1}. ${result.title}`);
        console.log(`   ${result.description.substring(0, 150)}...`);
        if (result.link) {
          console.log(`   URL: ${result.link}`);
        }
        console.log();
      });

      return results;

    } catch (error) {
      console.error('Google search failed:', error.message);
      return [];
    }
  }

  /**
   * Get knowledge graph information if available
   */
  async getKnowledgeGraph(query) {
    try {
      const options = {
        page: 0,
        safe: false,
        parse_ads: false,
        additional_params: {
          hl: 'en'
        }
      };

      const response = await search(query, options);
      
      // Check if knowledge graph is available
      if (response.knowledge_panel) {
        console.log('\n=== KNOWLEDGE GRAPH ===\n');
        const kg = response.knowledge_panel;
        
        let kgText = '';
        if (kg.title) {
          kgText += `Title: ${kg.title}\n`;
          console.log(`Title: ${kg.title}`);
        }
        if (kg.type) {
          kgText += `Type: ${kg.type}\n`;
          console.log(`Type: ${kg.type}`);
        }
        if (kg.description) {
          kgText += `Description: ${kg.description}\n`;
          console.log(`Description: ${kg.description}`);
        }
        if (kg.info) {
          kgText += `Info: ${JSON.stringify(kg.info, null, 2)}\n`;
        }
        
        console.log();
        return kgText;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get knowledge graph:', error.message);
      return null;
    }
  }

  /**
   * Get featured snippet if available
   */
  async getFeaturedSnippet(query) {
    try {
      const options = {
        page: 0,
        safe: false,
        parse_ads: false,
        additional_params: {
          hl: 'en'
        }
      };

      const response = await search(query, options);
      
      if (response.featured_snippet) {
        console.log('\n=== FEATURED SNIPPET ===\n');
        const snippet = response.featured_snippet;
        
        let snippetText = '';
        if (snippet.title) {
          snippetText += `Title: ${snippet.title}\n`;
          console.log(`Title: ${snippet.title}`);
        }
        if (snippet.description) {
          snippetText += `Content: ${snippet.description}\n`;
          console.log(`Content: ${snippet.description}`);
        }
        if (snippet.url) {
          snippetText += `Source: ${snippet.url}\n`;
          console.log(`Source: ${snippet.url}`);
        }
        
        console.log();
        return snippetText;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get featured snippet:', error.message);
      return null;
    }
  }

  /**
   * Perform comprehensive search and extract all available information
   */
  async comprehensiveSearch(query, numResults = 3) {
    const results = await this.performSearch(query, numResults);
    const knowledgeGraph = await this.getKnowledgeGraph(query);
    const featuredSnippet = await this.getFeaturedSnippet(query);

    return {
      results,
      knowledgeGraph,
      featuredSnippet
    };
  }

  /**
   * Get combined text context from search results
   */
  async getSearchContext(query, numResults = 3) {
    const { results, knowledgeGraph, featuredSnippet } = await this.comprehensiveSearch(query, numResults);
    
    let context = '';

    // Add featured snippet if available
    if (featuredSnippet) {
      context += `=== FEATURED SNIPPET ===\n${featuredSnippet}\n\n`;
    }

    // Add knowledge graph if available
    if (knowledgeGraph) {
      context += `=== KNOWLEDGE GRAPH ===\n${knowledgeGraph}\n\n`;
    }

    // Add search results
    if (results.length > 0) {
      context += `=== SEARCH RESULTS ===\n\n`;
      
      const contextParts = results.map((result, idx) => {
        let text = `[Web Source ${idx + 1}: ${result.title}]\n`;
        text += `URL: ${result.link}\n`;
        text += `Content: ${result.description}`;
        return text;
      });
      
      context += contextParts.join('\n\n---\n\n');
    }

    return context;
  }

  /**
   * Quick search - just get snippets without extra information
   */
  async quickSearch(query, numResults = 3) {
    console.log('\n=== WEB SEARCH ===\n');
    console.log(`Searching for: "${query}"`);

    try {
      const options = {
        page: 0,
        safe: false,
        parse_ads: false,
        additional_params: {
          hl: 'en'
        }
      };

      const response = await search(query, options);
      const results = response.results.slice(0, numResults);

      console.log(`✓ Found ${results.length} results\n`);

      // Combine into simple context
      const context = results.map((result, idx) => 
        `[${idx + 1}] ${result.title}\n${result.description}`
      ).join('\n\n');

      return context;

    } catch (error) {
      console.error('Search failed:', error.message);
      return '';
    }
  }
}
