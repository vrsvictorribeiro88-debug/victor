/**
 * ContentStrategist — Agent 2
 * Analyses TrendScanner output, scores topic relevance, and selects the
 * best 3 post angles for the day — each with a recommended style (A–H).
 */

import 'dotenv/config';
import { chat, extractJSON } from '../skills/anthropicClient.js';
import { info, success, error } from '../skills/logger.js';
import { VICTOR_PROFILE } from '../config/victorProfile.js';
import { POST_FORMATS } from '../config/postFormats.js';
import { run as scanTrends } from './trendScanner.js';

const AGENT = 'contentStrategist';

const SYSTEM_PROMPT = `You are a LinkedIn content strategist for ${VICTOR_PROFILE.name}, ${VICTOR_PROFILE.role} at ${VICTOR_PROFILE.employer} and founder of ${VICTOR_PROFILE.company} in ${VICTOR_PROFILE.location}.

Victor's audience: ${VICTOR_PROFILE.audience.join(', ')}.
Victor's voice: ${VICTOR_PROFILE.voice.tone}

Your job: given a set of today's news and signals, select the TOP 3 post opportunities. For each, recommend the best post style from the available formats.

Available post styles:
${Object.values(POST_FORMATS).map((f) => `${f.code}. ${f.name} — ${f.description}`).join('\n')}

Rules:
- Prioritise topics where Victor has direct professional expertise (finance, NFP, Power BI)
- Prefer timely topics (news from today or yesterday) over evergreen
- Balance styles: avoid recommending the same style three times
- Assign a confidence score (1–10) based on: timeliness, Victor's authority on the topic, likely engagement
- Provide one alternative angle for each selection

Return ONLY valid JSON — no prose before or after.`;

export async function run(scanOutput = null) {
  info(AGENT, 'Starting content strategy analysis');

  if (!scanOutput) {
    info(AGENT, 'No scan output provided — running TrendScanner first');
    scanOutput = await scanTrends();
  }

  const briefing = buildBriefing(scanOutput);
  info(AGENT, `Sending ${briefing.length} chars of trend data to Claude`);

  const { content } = await chat({
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Today's date: ${new Date().toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

Here are today's news signals and trends:

${briefing}

Select the top 3 post opportunities. Return JSON in this exact shape:
{
  "analysedAt": "ISO timestamp",
  "topPicks": [
    {
      "rank": 1,
      "topicId": "string",
      "title": "Compelling post angle title (max 10 words)",
      "sourceArticle": { "title": "...", "url": "...", "source": "..." },
      "postStyle": "A",
      "postStyleName": "INSIGHT POST",
      "whyThisStyle": "One sentence explanation",
      "whyNow": "One sentence explanation of timeliness",
      "suggestedTimeAEST": "08:00",
      "confidenceScore": 8,
      "confidenceReasoning": "Why this score",
      "alternativeAngle": "Different approach if Victor prefers",
      "keyPoints": ["Point 1", "Point 2", "Point 3"]
    }
  ],
  "strategistNotes": "Any overall observations about today's content landscape"
}`,
      },
    ],
    agentName: AGENT,
    maxTokens: 2000,
  });

  const result = await extractJSON(content);
  if (!result || !result.topPicks) {
    error(AGENT, 'Failed to parse structured response from Claude', { raw: content.slice(0, 500) });
    throw new Error('ContentStrategist: invalid Claude response');
  }

  result.analysedAt = result.analysedAt || new Date().toISOString();
  success(AGENT, `Strategy complete — ${result.topPicks.length} picks selected`);
  result.topPicks.forEach((p) => {
    info(AGENT, `  #${p.rank}: ${p.title} [Style ${p.postStyle}] — Confidence ${p.confidenceScore}/10`);
  });

  return result;
}

function buildBriefing(scanOutput) {
  const lines = [];
  for (const { topic, articles } of scanOutput.topicResults) {
    if (!articles.length) continue;
    lines.push(`\n## ${topic.label} (weight: ${topic.weight}/10)`);
    for (const a of articles) {
      lines.push(`- [Score ${a.relevanceScore}] "${a.title}"`);
      if (a.description) lines.push(`  ${a.description.slice(0, 200)}`);
      lines.push(`  Source: ${a.source} | Published: ${a.publishedAt || 'unknown'}`);
    }
  }
  return lines.join('\n');
}

if (process.argv[1].endsWith('contentStrategist.js')) {
  run().then((output) => {
    console.log('\n=== CONTENT STRATEGIST OUTPUT ===');
    output.topPicks.forEach((p) => {
      console.log(`\n${p.rank}. ${p.title}`);
      console.log(`   Style: ${p.postStyle} — ${p.postStyleName}`);
      console.log(`   Why: ${p.whyNow}`);
      console.log(`   Confidence: ${p.confidenceScore}/10`);
    });
    if (output.strategistNotes) console.log(`\nNotes: ${output.strategistNotes}`);
  }).catch(console.error);
}
