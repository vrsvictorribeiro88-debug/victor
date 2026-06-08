import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRAFTS_DIR = join(__dirname, '..', 'drafts');
const LOGS_DIR = join(__dirname, '..', 'logs');

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function todayKey() {
  return new Date().toLocaleString('en-CA', { timeZone: 'Australia/Sydney' }).slice(0, 10);
}

export function saveDraft(draft) {
  ensureDir(DRAFTS_DIR);
  const id = draft.id || `${todayKey()}_${Date.now()}`;
  const filePath = join(DRAFTS_DIR, `${id}.json`);
  const payload = { ...draft, id, savedAt: new Date().toISOString() };
  writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return { id, filePath };
}

export function loadDraft(id) {
  const filePath = join(DRAFTS_DIR, `${id}.json`);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function updateDraft(id, updates) {
  const draft = loadDraft(id);
  if (!draft) throw new Error(`Draft not found: ${id}`);
  const updated = { ...draft, ...updates, updatedAt: new Date().toISOString() };
  writeFileSync(join(DRAFTS_DIR, `${id}.json`), JSON.stringify(updated, null, 2));
  return updated;
}

export function listDrafts(filter = {}) {
  ensureDir(DRAFTS_DIR);
  const files = readdirSync(DRAFTS_DIR).filter((f) => f.endsWith('.json'));
  const drafts = files.map((f) => JSON.parse(readFileSync(join(DRAFTS_DIR, f), 'utf8')));
  if (filter.status) return drafts.filter((d) => d.status === filter.status);
  if (filter.date) return drafts.filter((d) => d.savedAt?.startsWith(filter.date));
  return drafts;
}

export function getPendingApproval() {
  return listDrafts({ status: 'PENDING_APPROVAL' });
}

export function getLatestDraft() {
  ensureDir(DRAFTS_DIR);
  const files = readdirSync(DRAFTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();
  if (!files.length) return null;
  return JSON.parse(readFileSync(join(DRAFTS_DIR, files[0]), 'utf8'));
}

export function saveAuditReport(report) {
  ensureDir(LOGS_DIR);
  const dateKey = todayKey();
  const filePath = join(LOGS_DIR, `weekly_audit_${dateKey}.json`);
  writeFileSync(filePath, JSON.stringify(report, null, 2));
  return filePath;
}
