/**
 * TrendScanner — Agent 1
 * Searches news and industry signals across all configured topic areas.
 * Outputs structured JSON consumed by ContentStrategist.
 */

import 'dotenv/config';
import { searchAll } from '../skills/searchClient.js';
import { info, success, error } from '../skills/logger.js';
import { TOPIC_AREAS } from '../config/topics.js';

const AGENT = 'trendScanner';

export async function run(options = {}) {
  const { resultsPerQuery = 3 } = options;
  info(AGENT, 'Starting trend scan', { topics: TOPIC_AREAS.length });

  const topicResults = [];

  for (const topic of TOPIC_AREAS) {
    info(AGENT, `Scanning topic: ${topic.label}`, { queries: topic.searchQueries.length });
    try {
      const articles = await searchAll(topic.searchQueries, resultsPerQuery);
      const scored = articles.map((article) => ({
        ...article,
        topicId: topic.id,
        topicLabel: topic.label,
        topicWeight: topic.weight,
        relevanceScore: scoreRelevance(article, topic),
      }));

      const top = scored.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 5);
      topicResults.push({ topic, articles: top, totalFound: articles.length });
      info(AGENT, `Found ${articles.length} articles for ${topic.label} (kept top ${top.length})`);
    } catch (err) {
      error(AGENT, `Failed to scan topic: ${topic.label}`, { error: err.message });
      topicResults.push({ topic, articles: [], totalFound: 0, scanError: err.message });
    }
  }

  const output = {
    scannedAt: new Date().toISOString(),
    totalArticles: topicResults.reduce((sum, t) => sum + t.totalFound, 0),
    topicResults,
  };

  success(AGENT, `Scan complete — ${output.totalArticles} articles across ${TOPIC_AREAS.length} topics`);
  return output;
}

function scoreRelevance(article, topic) {
  let score = topic.weight;
  const text = `${article.title} ${article.description}`.toLowerCase();

  for (const kw of topic.relevanceKeywords) {
    if (text.includes(kw.toLowerCase())) score += 1.5;
  }

  if (article.publishedAt) {
    const age = Date.now() - new Date(article.publishedAt).getTime();
    const hoursOld = age / (1000 * 60 * 60);
    if (hoursOld < 12) score += 3;
    else if (hoursOld < 24) score += 2;
    else if (hoursOld < 48) score += 1;
  }

  const qualitySources = ['afr.com', 'rba.gov.au', 'ato.gov.au', 'acnc.gov.au', 'microsoft.com',
    'aasb.gov.au', 'abc.net.au', 'smh.com.au', 'theaustralian.com.au'];
  if (qualitySources.some((s) => article.source?.includes(s))) score += 2;

  return Math.round(score * 10) / 10;
}

if (process.argv[1].endsWith('trendScanner.js')) {
  run().then((output) => {
    console.log('\n=== TREND SCANNER OUTPUT ===');
    output.topicResults.forEach((t) => {
      console.log(`\n📌 ${t.topic.label} (${t.totalFound} found)`);
      t.articles.slice(0, 2).forEach((a) => {
        console.log(`  • [${a.relevanceScore}] ${a.title}`);
        console.log(`    ${a.source} — ${a.publishedAt || 'unknown date'}`);
      });
    });
  }).catch(console.error);
}
