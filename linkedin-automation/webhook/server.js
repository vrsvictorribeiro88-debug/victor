/**
 * Webhook server — handles Twilio WhatsApp inbound replies.
 * Deploy this to Railway, Render, or Fly.io and point Twilio's
 * WhatsApp sandbox/number webhook URL here.
 *
 * Incoming message flow:
 *   Victor replies "1", "2", or "3" → briefing selection stored
 *   Victor replies "APPROVE"        → draft marked approved, publish triggered
 *   Victor replies "EDIT: <notes>"  → draft stored with edit notes for rewrite
 *   Victor replies "DISCARD"        → draft marked discarded
 *   Victor replies "SKIP"           → today's pipeline marked skipped
 */

import 'dotenv/config';
import express from 'express';
import { URLSearchParams } from 'url';
import { info, success, warn, error } from '../skills/logger.js';
import { listDrafts, updateDraft, getPendingApproval } from '../skills/storage.js';
import { run as publishPost } from '../agents/linkedinPublisher.js';

const app = express();
const PORT = process.env.PORT || 3000;
const AGENT = 'webhookServer';

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/webhook/whatsapp', async (req, res) => {
  const from = req.body.From;
  const body = (req.body.Body || '').trim();
  const victorNumber = process.env.VICTOR_WHATSAPP_TO;

  if (from !== victorNumber) {
    warn(AGENT, `Ignored message from unknown sender: ${from}`);
    return res.status(200).send('<Response/>');
  }

  info(AGENT, `Received WhatsApp from Victor: "${body}"`);

  try {
    await handleVictorReply(body.toUpperCase());
    res.status(200).send('<Response/>');
  } catch (err) {
    error(AGENT, `Webhook handler error: ${err.message}`);
    res.status(200).send('<Response/>');
  }
});

async function handleVictorReply(body) {
  if (['1', '2', '3'].includes(body)) {
    return handleBriefingSelection(parseInt(body, 10));
  }

  if (body === 'APPROVE') {
    return handleApproval();
  }

  if (body.startsWith('EDIT:')) {
    const notes = body.slice(5).trim();
    return handleEditRequest(notes);
  }

  if (body === 'DISCARD') {
    return handleDiscard();
  }

  if (body === 'SKIP') {
    return handleSkip();
  }

  warn(AGENT, `Unrecognised reply from Victor: "${body}"`);
}

async function handleBriefingSelection(rank) {
  const pendingDrafts = listDrafts({ status: 'DRAFT' });
  const selected = pendingDrafts.find((d) => d.pick?.rank === rank);

  if (!selected) {
    warn(AGENT, `No draft found for rank ${rank}`);
    return;
  }

  updateDraft(selected.id, { status: 'SELECTED', selectedAt: new Date().toISOString() });
  success(AGENT, `Victor selected option ${rank}: ${selected.pick?.title}`);
}

async function handleApproval() {
  const pending = getPendingApproval();
  if (!pending.length) {
    warn(AGENT, 'APPROVE received but no draft is pending approval');
    return;
  }

  const draft = pending[0];
  updateDraft(draft.id, { status: 'APPROVED', approvedAt: new Date().toISOString() });
  success(AGENT, `Draft APPROVED by Victor: ${draft.id}`);

  if (process.env.AUTO_PUBLISH === 'true') {
    info(AGENT, 'AUTO_PUBLISH enabled — triggering LinkedInPublisher');
    try {
      const approvedDraft = { ...draft, status: 'APPROVED' };
      await publishPost(approvedDraft);
    } catch (err) {
      error(AGENT, `Auto-publish failed: ${err.message}`);
    }
  } else {
    info(AGENT, 'AUTO_PUBLISH disabled — draft approved and ready for manual publish');
  }
}

async function handleEditRequest(notes) {
  const pending = getPendingApproval();
  if (!pending.length) {
    warn(AGENT, 'EDIT received but no draft is pending approval');
    return;
  }

  const draft = pending[0];
  updateDraft(draft.id, {
    status: 'EDIT_REQUESTED',
    editNotes: notes,
    editRequestedAt: new Date().toISOString(),
  });
  info(AGENT, `Edit requested for draft ${draft.id}: "${notes}"`);
}

async function handleDiscard() {
  const pending = getPendingApproval();
  if (!pending.length) {
    warn(AGENT, 'DISCARD received but no draft is pending approval');
    return;
  }

  const draft = pending[0];
  updateDraft(draft.id, { status: 'DISCARDED', discardedAt: new Date().toISOString() });
  warn(AGENT, `Draft DISCARDED by Victor: ${draft.id}`);
}

async function handleSkip() {
  const pendingDrafts = listDrafts({ status: 'DRAFT' }).concat(getPendingApproval());
  for (const draft of pendingDrafts) {
    updateDraft(draft.id, { status: 'SKIPPED', skippedAt: new Date().toISOString() });
  }
  info(AGENT, "Victor skipped today's pipeline");
}

app.listen(PORT, () => {
  info(AGENT, `Webhook server running on port ${PORT}`);
  info(AGENT, `WhatsApp webhook: POST /webhook/whatsapp`);
  info(AGENT, `Health check: GET /health`);
});

export default app;
