import { AgentTool, ToolContext } from '../types';
import { registerTool } from '../toolRegistry';

const ok = (output?: any) => ({ success: true, output });
const fail = (error: string) => ({ success: false, error });

/**
 * Smart Search Agent - Intelligently searches and extracts information
 */
export const smartSearchTool: AgentTool = {
  name: 'smart_search',
  description: 'Search for information - automatically navigates to search engine and performs search',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      searchEngine: {
        type: 'string',
        enum: ['google', 'duckduckgo', 'bing'],
        description: 'Which search engine to use (default: duckduckgo)'
      },
      extractResults: {
        type: 'boolean',
        description: 'Extract and return search results (default: true)'
      }
    },
    required: ['query'],
    additionalProperties: false,
  },
  async execute(ctx: ToolContext, args: { query: string; searchEngine?: string; extractResults?: boolean }) {
    const query = String(args?.query || '').trim();
    const searchEngine = args?.searchEngine || 'duckduckgo';
    const extractResults = args?.extractResults !== false;

    if (!query) return fail('Missing search query');

    ctx.log(`🔍 Smart search: "${query}"`);

    try {
      // Always navigate to search engine with query (simpler and more reliable)
      const searchEngineUrls: Record<string, string> = {
        'google': `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        'duckduckgo': `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        'bing': `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
      };

      const searchUrl = searchEngineUrls[searchEngine];

      if (!searchUrl) {
        return fail(`Unknown search engine: ${searchEngine}`);
      }

      ctx.log(`🌐 Navigating to ${searchEngine} with query...`);
      ctx.webview.loadURL(searchUrl);

      // Wait for page to load
      await new Promise(r => setTimeout(r, 3000));

      // Extract results if requested
      if (extractResults) {
        const results = await extractSearchResults(ctx);
        return ok({ query, results, searchEngine, resultsCount: results.length });
      }

      return ok({ query, searchEngine, message: 'Search completed' });

    } catch (e: any) {
      return fail(e?.message || 'Search failed');
    }
  },
};

/**
 * Extract Search Results - Extract structured data from search results
 */
export const extractSearchResultsTool: AgentTool = {
  name: 'extract_search_results',
  description: 'Extract structured search results from current page',
  parameters: {
    type: 'object',
    properties: {
      maxResults: { type: 'number', description: 'Maximum results to extract (default: 10)' }
    },
    additionalProperties: false,
  },
  async execute(ctx: ToolContext, args: { maxResults?: number }) {
    const maxResults = args?.maxResults || 10;

    ctx.log(`📋 Extracting up to ${maxResults} search results`);

    try {
      const results = await extractSearchResults(ctx, maxResults);
      return ok({ results, count: results.length });
    } catch (e: any) {
      return fail(e?.message || 'Extraction failed');
    }
  },
};

/**
 * Helper: Extract search results from page
 */
async function extractSearchResults(ctx: ToolContext, maxResults: number = 10) {
  try {
    const results = await ctx.webview.executeJavaScript(`
      (function() {
        const results = [];
        const max = ${maxResults};

        // Google
        const googleResults = document.querySelectorAll('div.g, div[data-sokoban-container]');
        for (let i = 0; i < Math.min(googleResults.length, max); i++) {
          const result = googleResults[i];
          const titleEl = result.querySelector('h3');
          const linkEl = result.querySelector('a');
          const snippetEl = result.querySelector('.VwiC3b, .yXK7lf, [data-sncf]');

          if (titleEl && linkEl) {
            results.push({
              title: titleEl.textContent.trim(),
              url: linkEl.href,
              snippet: snippetEl ? snippetEl.textContent.trim() : '',
              source: 'google'
            });
          }
        }

        // DuckDuckGo
        const ddgResults = document.querySelectorAll('article[data-testid="result"], li[data-layout="organic"]');
        for (let i = 0; i < Math.min(ddgResults.length, max); i++) {
          const result = ddgResults[i];
          const titleEl = result.querySelector('h2 a, [data-testid="result-title-a"]');
          const snippetEl = result.querySelector('[data-result="snippet"], .result__snippet');

          if (titleEl) {
            results.push({
              title: titleEl.textContent.trim(),
              url: titleEl.href,
              snippet: snippetEl ? snippetEl.textContent.trim() : '',
              source: 'duckduckgo'
            });
          }
        }

        // Bing
        const bingResults = document.querySelectorAll('li.b_algo');
        for (let i = 0; i < Math.min(bingResults.length, max); i++) {
          const result = bingResults[i];
          const titleEl = result.querySelector('h2 a');
          const snippetEl = result.querySelector('.b_caption p');

          if (titleEl) {
            results.push({
              title: titleEl.textContent.trim(),
              url: titleEl.href,
              snippet: snippetEl ? snippetEl.textContent.trim() : '',
              source: 'bing'
            });
          }
        }

        return results.slice(0, max);
      })()
    `);

    return results || [];
  } catch (e) {
    ctx.log(`⚠️ Failed to extract results: ${e}`);
    return [];
  }
}

/**
 * Smart Click Result - Click on a specific search result
 */
export const clickSearchResultTool: AgentTool = {
  name: 'click_search_result',
  description: 'Click on a search result by index or keyword match',
  parameters: {
    type: 'object',
    properties: {
      index: { type: 'number', description: 'Result index (1-based, e.g., 1 for first result)' },
      keyword: { type: 'string', description: 'Keyword to match in title (alternative to index)' }
    },
    additionalProperties: false,
  },
  async execute(ctx: ToolContext, args: { index?: number; keyword?: string }) {
    const index = args?.index;
    const keyword = args?.keyword?.toLowerCase();

    if (!index && !keyword) {
      return fail('Must provide either index or keyword');
    }

    ctx.log(index ? `🖱️ Clicking result #${index}` : `🖱️ Clicking result matching "${keyword}"`);

    try {
      const clicked = await ctx.webview.executeJavaScript(`
        (async function() {
          const targetIndex = ${index ? index - 1 : -1};
          const targetKeyword = ${JSON.stringify(keyword || '')};

          // Find all result links
          const links = [];

          // Google
          document.querySelectorAll('div.g h3, div[data-sokoban-container] h3').forEach(h3 => {
            const link = h3.closest('a') || h3.parentElement.querySelector('a');
            if (link) links.push(link);
          });

          // DuckDuckGo
          document.querySelectorAll('[data-testid="result-title-a"], article h2 a').forEach(a => {
            links.push(a);
          });

          // Bing
          document.querySelectorAll('li.b_algo h2 a').forEach(a => {
            links.push(a);
          });

          // Find target link
          let targetLink;
          if (targetIndex >= 0 && targetIndex < links.length) {
            targetLink = links[targetIndex];
          } else if (targetKeyword) {
            targetLink = links.find(link =>
              link.textContent.toLowerCase().includes(targetKeyword)
            );
          }

          if (!targetLink) {
            return { success: false, error: 'Result not found' };
          }

          // Scroll to and click
          targetLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(r => setTimeout(r, 300));
          targetLink.click();

          return {
            success: true,
            title: targetLink.textContent.trim(),
            url: targetLink.href
          };
        })()
      `);

      if (clicked?.success) {
        return ok({ title: clicked.title, url: clicked.url });
      }

      return fail(clicked?.error || 'Click failed');
    } catch (e: any) {
      return fail(e?.message || 'Click failed');
    }
  },
};

// Register all search tools
registerTool(smartSearchTool);
registerTool(extractSearchResultsTool);
registerTool(clickSearchResultTool);
