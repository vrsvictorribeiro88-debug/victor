/**
 * pipeline.js — Main orchestrator
 * Runs the full agent pipeline:
 *   TrendScanner → ContentStrategist → PostWriter (×3) →
 *   QualityReviewer → ImageDirector → WhatsAppNotifier → [APPROVAL GATE] → LinkedInPublisher
 *
 * Usage:
 *   node pipeline.js              — run the full daily pipeline
 *   node pipeline.js --audit      — run SystemAuditor only
 *   node pipeline.js --publish <draftId>  — publish a pre-approved draft
 */

import 'dotenv/config';
import { info, success, error, warn } from './skills/logger.js';
import { loadDraft, updateDraft } from './skills/storage.js';
import { run as scanTrends } from './agents/trendScanner.js';
import { run as strategise } from './agents/contentStrategist.js';
import { run as writePost } from './agents/postWriter.js';
import { run as reviewQuality } from './agents/qualityReviewer.js';
import { run as directImage } from './agents/imageDirector.js';
import { sendDailyBriefing } from './agents/whatsappNotifier.js';
import { run as publishPost } from './agents/linkedinPublisher.js';
import { run as auditSystem } from './agents/systemAuditor.js';

const PIPELINE = 'pipeline';

async function runDailyPipeline() {
  info(PIPELINE, '╔══════════════════════════════════╗');
  info(PIPELINE, '║  LinkedIn Automation Pipeline    ║');
  info(PIPELINE, '╚══════════════════════════════════╝');
  info(PIPELINE, `Started at ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })} AEST`);

  // ── Step 1: Scan trends ────────────────────────────────────────────────────
  info(PIPELINE, '── Step 1/5: TrendScanner');
  const scanOutput = await scanTrends({ resultsPerQuery: 3 });
  info(PIPELINE, `  ✓ ${scanOutput.totalArticles} articles across ${scanOutput.topicResults.length} topics`);

  // ── Step 2: Strategise ─────────────────────────────────────────────────────
  info(PIPELINE, '── Step 2/5: ContentStrategist');
  const strategy = await strategise(scanOutput);
  info(PIPELINE, `  ✓ ${strategy.topPicks.length} post angles selected`);

  // ── Step 3: Write all 3 drafts ────────────────────────────────────────────
  info(PIPELINE, '── Step 3/5: PostWriter (×3 drafts)');
  const rawDrafts = [];
  for (const pick of strategy.topPicks) {
    try {
      const draft = await writePost(pick);
      rawDrafts.push(draft);
      info(PIPELINE, `  ✓ Draft ${pick.rank}: "${pick.title}" (${draft.charCount} chars)`);
    } catch (err) {
      error(PIPELINE, `  ✗ Failed to write draft for pick ${pick.rank}`, { error: err.message });
    }
  }

  if (!rawDrafts.length) {
    error(PIPELINE, 'No drafts produced — aborting pipeline');
    process.exit(1);
  }

  // ── Step 4: Quality review all drafts ────────────────────────────────────
  info(PIPELINE, '── Step 4/5: QualityReviewer');
  const reviewedDrafts = [];
  for (const draft of rawDrafts) {
    try {
      const reviewed = await reviewQuality(draft);
      reviewedDrafts.push(reviewed);
      const status = reviewed.status === 'PENDING_APPROVAL' ? '✓ PASSED' : '✗ REJECTED';
      info(PIPELINE, `  ${status} Draft ${draft.pick.rank} (score: ${reviewed.qualityScore}/10)`);
    } catch (err) {
      error(PIPELINE, `  ✗ Review failed for draft ${draft.id}`, { error: err.message });
    }
  }

  const approvedDrafts = reviewedDrafts.filter((d) => d.status === 'PENDING_APPROVAL');
  if (!approvedDrafts.length) {
    warn(PIPELINE, 'All drafts rejected by QualityReviewer — sending best draft to Victor anyway');
    const bestRejected = reviewedDrafts.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))[0];
    if (bestRejected) {
      updateDraft(bestRejected.id, { status: 'PENDING_APPROVAL', escalated: true });
      approvedDrafts.push({ ...bestRejected, status: 'PENDING_APPROVAL', escalated: true });
    }
  }

  // ── Step 5: Generate images for approved drafts ──────────────────────────
  info(PIPELINE, '── Step 5/5: ImageDirector');
  const finalDrafts = [];
  for (const draft of approvedDrafts) {
    try {
      const withImage = await directImage(draft);
      finalDrafts.push(withImage);
      const imageStatus = withImage.image?.localPath ? '✓ Image generated' : '✓ No image needed';
      info(PIPELINE, `  ${imageStatus} for draft ${draft.id}`);
    } catch (err) {
      warn(PIPELINE, `  Image generation failed for draft ${draft.id} — continuing without image`, { error: err.message });
      finalDrafts.push(draft);
    }
  }

  // ── Approval gate: Send WhatsApp briefing ─────────────────────────────────
  info(PIPELINE, '── Approval gate: Sending WhatsApp briefing');
  const briefingState = await sendDailyBriefing(strategy, finalDrafts);
  info(PIPELINE, `  ✓ Daily briefing sent to Victor`);

  success(PIPELINE, '══ Pipeline complete — awaiting Victor\'s selection');
  return { scanOutput, strategy, finalDrafts, briefingState };
}

async function runPublish(draftId) {
  info(PIPELINE, `Manual publish requested for draft: ${draftId}`);
  const draft = loadDraft(draftId);
  if (!draft) {
    error(PIPELINE, `Draft not found: ${draftId}`);
    process.exit(1);
  }
  if (draft.status !== 'APPROVED') {
    error(PIPELINE, `Draft ${draftId} is not APPROVED — status: ${draft.status}`);
    process.exit(1);
  }
  const result = await publishPost(draft);
  success(PIPELINE, `Published: ${result.url}`);
  return result;
}

const args = process.argv.slice(2);
if (args.includes('--audit')) {
  auditSystem().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
} else if (args.includes('--publish')) {
  const draftId = args[args.indexOf('--publish') + 1];
  if (!draftId) { console.error('Usage: node pipeline.js --publish <draftId>'); process.exit(1); }
  runPublish(draftId).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
} else {
  runDailyPipeline().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
