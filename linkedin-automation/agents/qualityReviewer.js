/**
 * QualityReviewer — Agent 4
 * Critiques every draft before it reaches Victor.
 * Rejects failing drafts once and rewrites them before escalating.
 */

import 'dotenv/config';
import { chat, extractJSON } from '../skills/anthropicClient.js';
import { info, warn, success, error } from '../skills/logger.js';
import { updateDraft } from '../skills/storage.js';
import { QUALITY_RULES } from '../config/qualityRules.js';
import { VICTOR_PROFILE } from '../config/victorProfile.js';

const AGENT = 'qualityReviewer';

const REVIEWER_SYSTEM = `You are a ruthless but fair LinkedIn content editor reviewing posts for ${VICTOR_PROFILE.name}, a Financial Controller and Power BI specialist in Sydney.

Your job: assess whether this post is good enough to send to Victor for approval.
Victor's audience is finance professionals, NFP leaders, and BI practitioners.

Be specific in your critique. If you reject, explain exactly what's wrong and rewrite the post to fix it.
Return ONLY valid JSON.`;

export async function run(draft) {
  if (!draft?.postCopy) throw new Error('QualityReviewer requires a draft with postCopy');
  info(AGENT, `Reviewing draft: ${draft.id}`, { chars: draft.charCount });

  const hardFailures = runHardChecks(draft.postCopy);
  const buzzwordHits = findBuzzwords(draft.postCopy);

  if (hardFailures.length || buzzwordHits.length) {
    warn(AGENT, 'Hard rule failures detected — requesting AI rewrite', {
      failures: hardFailures,
      buzzwords: buzzwordHits,
    });
    return rewriteAndReview(draft, hardFailures, buzzwordHits);
  }

  return aiReview(draft);
}

function runHardChecks(text) {
  return QUALITY_RULES.hardRejections
    .filter((rule) => rule.test(text))
    .map((rule) => rule.description);
}

function findBuzzwords(text) {
  const lower = text.toLowerCase();
  return QUALITY_RULES.buzzwordBan.filter((bw) => lower.includes(bw.toLowerCase()));
}

async function aiReview(draft) {
  const { content } = await chat({
    system: REVIEWER_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Review this LinkedIn post draft:

---
${draft.postCopy}
---

Character count: ${draft.charCount}

Check for:
1. Does it start with "I"? (instant reject)
2. Is it generic — could anyone have written this? (reject)
3. Does it contain at least one specific insight, data point, or personal angle? (required)
4. Does it end with a weak/generic CTA? (reject)
5. Does it offer clear value to finance, NFP, or BI professionals? (required)
6. Overall quality score (1–10)

Return JSON:
{
  "passed": true,
  "qualityScore": 8,
  "issues": [],
  "strengths": ["What works well"],
  "verdict": "APPROVED | REWRITE_REQUIRED",
  "rewrittenCopy": null
}

If verdict is REWRITE_REQUIRED, provide the improved "rewrittenCopy" that fixes all issues.`,
      },
    ],
    agentName: AGENT,
    maxTokens: 1500,
  });

  const review = await extractJSON(content);
  if (!review) {
    error(AGENT, 'Failed to parse review response', { raw: content.slice(0, 300) });
    throw new Error('QualityReviewer: invalid Claude response');
  }

  return finalise(draft, review);
}

async function rewriteAndReview(draft, hardFailures, buzzwordHits) {
  const { content } = await chat({
    system: REVIEWER_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `This LinkedIn post has failed quality checks and MUST be rewritten:

---
${draft.postCopy}
---

Specific problems found:
${hardFailures.map((f) => `- ${f}`).join('\n')}
${buzzwordHits.length ? `- Contains banned buzzwords: ${buzzwordHits.join(', ')}` : ''}

Rewrite the post to fix ALL of these issues while preserving the core idea and Victor's voice.
Rules reminder: do not start with "I", stay 150–1300 chars, no buzzwords, end with a specific CTA.

Return JSON:
{
  "passed": false,
  "originalIssues": ${JSON.stringify([...hardFailures, ...buzzwordHits.map((b) => `Buzzword: "${b}"`)], null, 2)},
  "qualityScore": 5,
  "verdict": "REWRITTEN",
  "rewrittenCopy": "The improved post text here"
}`,
      },
    ],
    agentName: AGENT,
    maxTokens: 1500,
  });

  const review = await extractJSON(content);
  if (!review?.rewrittenCopy) {
    error(AGENT, 'Failed to get rewrite from Claude', { raw: content.slice(0, 300) });
    throw new Error('QualityReviewer: rewrite failed');
  }

  info(AGENT, 'Post rewritten — running second pass review');
  const rewrittenDraft = { ...draft, postCopy: review.rewrittenCopy, charCount: review.rewrittenCopy.length };
  const secondPass = await aiReview(rewrittenDraft);
  return { ...secondPass, wasRewritten: true, originalIssues: review.originalIssues };
}

function finalise(draft, review) {
  const finalCopy = review.rewrittenCopy || draft.postCopy;
  const status = review.passed ? 'PENDING_APPROVAL' : 'REJECTED';

  const result = {
    ...draft,
    postCopy: finalCopy,
    charCount: finalCopy.length,
    status,
    qualityScore: review.qualityScore,
    qualityIssues: review.issues || [],
    qualityStrengths: review.strengths || [],
    verdict: review.verdict,
    wasRewritten: review.wasRewritten || !!review.rewrittenCopy,
    reviewedAt: new Date().toISOString(),
  };

  updateDraft(draft.id, result);

  if (status === 'PENDING_APPROVAL') {
    success(AGENT, `Draft APPROVED for Victor's review (score: ${review.qualityScore}/10)`, { draftId: draft.id });
  } else {
    warn(AGENT, `Draft REJECTED — requires manual escalation (score: ${review.qualityScore}/10)`, {
      draftId: draft.id,
      issues: review.issues,
    });
  }

  return result;
}

if (process.argv[1].endsWith('qualityReviewer.js')) {
  const mockDraft = {
    id: 'test-draft-001',
    postCopy: "I think Power BI is a game-changer for finance teams. In today's fast-paced world, every professional should leverage data analytics. What do you think?",
    charCount: 157,
    pick: { title: 'Test', postStyle: 'A' },
  };
  run(mockDraft).then((r) => {
    console.log('\n=== QUALITY REVIEWER OUTPUT ===');
    console.log('Status:', r.status, '| Score:', r.qualityScore);
    console.log('Rewritten:', r.wasRewritten);
    console.log('\nFinal copy:\n', r.postCopy);
  }).catch(console.error);
}
