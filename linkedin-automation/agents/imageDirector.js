/**
 * ImageDirector — Agent 5
 * Decides whether a post needs an image, generates a detailed DALL·E 3 brief,
 * and creates the visual via OpenAI API.
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import axios from 'axios';
import { chat, extractJSON } from '../skills/anthropicClient.js';
import { info, success, warn, error } from '../skills/logger.js';
import { updateDraft } from '../skills/storage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, '..', 'drafts', 'images');
const AGENT = 'imageDirector';

let _openai = null;
function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const BRIEF_SYSTEM = `You are an art director for LinkedIn content. You create DALL·E 3 image prompts for professional posts.

Style guide:
- Images must be clean, professional, and not overly literal
- Avoid text in images (DALL·E renders it poorly)
- Prefer: abstract data visualisations, architectural photography, minimalist graphics,
  professional office settings, Sydney cityscapes for Australian posts
- No faces or recognisable people
- Aspect ratio: 1:1 (square) for LinkedIn best practices
- Style: modern, slightly elevated, suitable for a finance/BI professional's brand`;

export async function run(draft) {
  if (!draft?.postCopy) throw new Error('ImageDirector requires a draft with postCopy');
  info(AGENT, `Assessing image needs for draft: ${draft.id}`);

  if (!draft.imageRecommended) {
    info(AGENT, 'Image not recommended for this post — skipping generation');
    return { ...draft, image: null };
  }

  const brief = await generateBrief(draft);
  info(AGENT, 'Image brief generated', { prompt: brief.dallePrompt.slice(0, 100) + '...' });

  if (process.env.DRY_RUN === 'true') {
    warn(AGENT, '[DRY_RUN] Skipping DALL·E API call');
    const result = { ...draft, image: { brief, url: null, localPath: null, dryRun: true } };
    updateDraft(draft.id, result);
    return result;
  }

  const imageResult = await generateImage(brief.dallePrompt, draft.id);
  const finalDraft = { ...draft, image: { brief, ...imageResult } };
  updateDraft(draft.id, finalDraft);
  success(AGENT, 'Image generated and saved', { localPath: imageResult.localPath });
  return finalDraft;
}

async function generateBrief(draft) {
  const { content } = await chat({
    system: BRIEF_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Create a DALL·E 3 image brief for this LinkedIn post:

---
${draft.postCopy}
---

Post topic: ${draft.pick?.title || 'unknown'}
Post style: ${draft.pick?.postStyle || 'A'}
PostWriter's image idea: ${draft.imageDescription || 'not specified'}

Return JSON:
{
  "imageNeeded": true,
  "conceptDescription": "What the image represents conceptually",
  "dallePrompt": "The full DALL·E 3 prompt — detailed, specific, style-consistent",
  "altText": "LinkedIn alt text for accessibility",
  "rationale": "Why this image enhances the post"
}`,
      },
    ],
    agentName: AGENT,
    maxTokens: 600,
  });

  const brief = await extractJSON(content);
  if (!brief?.dallePrompt) throw new Error('ImageDirector: failed to generate image brief');
  return brief;
}

async function generateImage(prompt, draftId) {
  info(AGENT, 'Calling DALL·E 3 API');
  const response = await getOpenAI().images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
    response_format: 'url',
  });

  const imageUrl = response.data[0].url;
  if (!existsSync(IMAGES_DIR)) mkdirSync(IMAGES_DIR, { recursive: true });
  const localPath = join(IMAGES_DIR, `${draftId}.png`);

  const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  writeFileSync(localPath, imgResponse.data);
  info(AGENT, `Image downloaded and saved to ${localPath}`);

  return { url: imageUrl, localPath, revisedPrompt: response.data[0].revised_prompt };
}

if (process.argv[1].endsWith('imageDirector.js')) {
  const mockDraft = {
    id: 'test-image-001',
    postCopy: "Power BI's Copilot feature quietly changed something important for finance teams this week.\n\nNot the automation. The expectation.\n\nWhen your stakeholders know AI can build a dashboard in minutes, your value shifts. You're no longer the person who builds — you're the person who asks the right questions.\n\n3 questions I now ask before any dashboard project:\n1. What decision does this need to support?\n2. Who is the weakest data literacy in the room?\n3. What would 'wrong' look like?\n\nAI builds fast. Judgment builds trust.\n\n#PowerBI #FinanceAnalytics #DataStrategy #MicrosoftFabric",
    charCount: 580,
    imageRecommended: true,
    imageDescription: 'Abstract data visualisation showing transformation from raw data to insights',
    pick: { title: 'Power BI Copilot changes finance team dynamics', postStyle: 'A' },
  };
  run(mockDraft).then((r) => {
    console.log('\n=== IMAGE DIRECTOR OUTPUT ===');
    console.log('Image:', r.image?.localPath || r.image?.url || 'none');
    console.log('Brief:', r.image?.brief?.conceptDescription || 'n/a');
  }).catch(console.error);
}
