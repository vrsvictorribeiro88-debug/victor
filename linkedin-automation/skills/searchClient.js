import axios from 'axios';
import { info, warn, error } from './logger.js';

const AGENT = 'searchClient';

async function braveSearch(query, count = 5) {
  if (!process.env.BRAVE_SEARCH_API_KEY) throw new Error('BRAVE_SEARCH_API_KEY not set');
  const response = await axios.get('https://api.search.brave.com/res/v1/news/search', {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY,
    },
    params: { q: query, count, freshness: 'pd', country: 'AU' },
  });
  return (response.data.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    description: r.description || r.extra_snippets?.[0] || '',
    source: r.meta_url?.netloc || r.url,
    publishedAt: r.age || null,
    query,
  }));
}

async function serperSearch(query, count = 5) {
  if (!process.env.SERPER_API_KEY) throw new Error('SERPER_API_KEY not set');
  const response = await axios.post(
    'https://google.serper.dev/news',
    { q: query, num: count, gl: 'au', hl: 'en' },
    { headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' } },
  );
  return (response.data.news || []).map((r) => ({
    title: r.title,
    url: r.link,
    description: r.snippet || '',
    source: r.source,
    publishedAt: r.date || null,
    query,
  }));
}

export async function search(query, count = 5) {
  if (process.env.DRY_RUN === 'true') {
    info(AGENT, `[DRY_RUN] Mock search for: "${query}"`);
    return [
      {
        title: `[MOCK] News about: ${query}`,
        url: 'https://example.com/mock',
        description: 'This is a mock result for DRY_RUN mode.',
        source: 'mock',
        publishedAt: new Date().toISOString(),
        query,
      },
    ];
  }

  if (process.env.BRAVE_SEARCH_API_KEY) {
    try {
      info(AGENT, `Brave search: "${query}"`);
      return await braveSearch(query, count);
    } catch (err) {
      warn(AGENT, `Brave search failed, falling back to Serper: ${err.message}`);
    }
  }

  if (process.env.SERPER_API_KEY) {
    info(AGENT, `Serper search: "${query}"`);
    return await serperSearch(query, count);
  }

  error(AGENT, 'No search API key configured (BRAVE_SEARCH_API_KEY or SERPER_API_KEY)');
  throw new Error('No search API configured');
}

export async function searchAll(queries, resultsPerQuery = 3) {
  const results = [];
  for (const query of queries) {
    try {
      const hits = await search(query, resultsPerQuery);
      results.push(...hits);
    } catch (err) {
      warn(AGENT, `Search failed for query "${query}": ${err.message}`);
    }
  }
  const seen = new Set();
  return results.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}
