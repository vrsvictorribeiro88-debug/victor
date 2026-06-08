/**
 * PostWriter — Agent 3
 * Drafts full LinkedIn post copy in Victor's voice, given a selected topic
 * and post style from ContentStrategist.
 */

import 'dotenv/config';
import { chat, extractJSON } from '../skills/anthropicClient.js';
import { info, success, error } from '../skills/logger.js';
import { saveDraft } from '../skills/storage.js';
import { VICTOR_PROFILE } from '../config/victorProfile.js';
import { POST_FORMATS } from '../config/postFormats.js';
import { v4 as uuid } from 'uuid';

const AGENT = 'postWriter';

const SYSTEM_PROMPT = `You are a ghostwriter for ${VICTOR_PROFILE.name}, ${VICTOR_PROFILE.role} at ${VICTOR_PROFILE.employer} and founder of ${VICTOR_PROFILE.company}.

## Victor's Voice
${VICTOR_PROFILE.voice.tone}

Style rules:
${VICTOR_PROFILE.voice.style.map((s) => `- ${s}`).join('\n')}

NEVER use these words:
${VICTOR_PROFILE.voice.avoidWords.join(', ')}

NEVER start a post with the word "I".

## Post length
- Minimum: 150 characters
- Maximum: 1,300 characters
- Optimal: 500–900 characters
- Short paragraphs — 1–3 sentences each
- Use line breaks generously

## LinkedIn formatting
- No markdown headers
- Line breaks between paragraphs
- 3–5 relevant hashtags at the end (not inline)
- Emojis optional but used sparingly — max 2 per post

Write ONLY the post copy. Return JSON with the post and metadata.`;

export async function run(pick, options = {}) {
  if (!pick) throw new Error('PostWriter requires a content pick from ContentStrategist');

  const { seriesContext = null } = options;
  const format = POST_FORMATS[pick.postStyle];
  info(AGENT, `Writing post: "${pick.title}"`, { style: pick.postStyle, format: format?.name });

  const { content } = await chat({
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Write a LinkedIn post for Victor with these parameters:

**Topic:** ${pick.title}
**Post style:** ${pick.postStyle} — ${format?.name}
**Structure to follow:** ${format?.structure?.join(' → ')}
**Key points to incorporate:** ${(pick.keyPoints || []).join('; ')}
**Source article (for reference/grounding):** ${pick.sourceArticle?.title || 'N/A'} — ${pick.sourceArticle?.source || ''}
**Why this topic is relevant now:** ${pick.whyNow}
${seriesContext ? `**Series context:** ${seriesContext}` : ''}

Today's date in Sydney: ${new Date().toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

Return JSON in this exact shape:
{
  "postCopy": "The full LinkedIn post text — exactly as it should appear on LinkedIn",
  "charCount": 0,
  "hashtags": ["hashtag1", "hashtag2"],
  "imageRecommended": true,
  "imageDescription": "What kind of image would enhance this post",
  "writerNotes": "Any notes about craft decisions made"
}`,
      },
    ],
    agentName: AGENT,
    maxTokens: 1500,
    temperature: 0.8,
  });

  const result = await extractJSON(content);
  if (!result?.postCopy) {
    error(AGENT, 'Failed to parse post draft from Claude', { raw: content.slice(0, 500) });
    throw new Error('PostWriter: invalid Claude response');
  }

  result.charCount = result.postCopy.length;
  const draftId = uuid();
  const draft = {
    id: draftId,
    status: 'DRAFT',
    pick,
    postCopy: result.postCopy,
    charCount: result.charCount,
    hashtags: result.hashtags || [],
    imageRecommended: result.imageRecommended,
    imageDescription: result.imageDescription,
    writerNotes: result.writerNotes,
    createdAt: new Date().toISOString(),
  };

  const { filePath } = saveDraft(draft);
  success(AGENT, `Draft written (${result.charCount} chars)`, { draftId, filePath });

  return draft;
}

if (process.argv[1].endsWith('postWriter.js')) {
  const mockPick = {
    rank: 1,
    topicId: 'power_bi_data',
    title: 'Power BI Copilot changes how finance teams build reports',
    postStyle: 'A',
    postStyleName: 'INSIGHT POST',
    whyNow: 'Microsoft released new Copilot features this week',
    keyPoints: ['AI in report building', 'Finance team productivity', 'Risks of over-reliance on AI suggestions'],
    sourceArticle: { title: 'Microsoft Fabric Copilot Update', source: 'microsoft.com' },
  };
  run(mockPick).then((draft) => {
    console.log('\n=== POST WRITER OUTPUT ===\n');
    console.log(draft.postCopy);
    console.log(`\nChars: ${draft.charCount} | Image: ${draft.imageRecommended ? 'Yes' : 'No'}`);
  }).catch(console.error);
}
