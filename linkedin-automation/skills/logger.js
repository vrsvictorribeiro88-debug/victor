import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, '..', 'logs');

function ensureLogsDir() {
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
}

function toAEST(date = new Date()) {
  return new Date(date.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }));
}

function timestamp() {
  return toAEST().toISOString().replace('T', ' ').slice(0, 19);
}

function todayKey() {
  return toAEST().toISOString().slice(0, 10);
}

function logFilePath(agent) {
  return join(LOGS_DIR, `${todayKey()}_${agent}.jsonl`);
}

export function log(agent, level, message, data = {}) {
  ensureLogsDir();
  const entry = {
    ts: timestamp(),
    agent,
    level,
    message,
    ...data,
  };
  const line = JSON.stringify(entry);
  const filePath = logFilePath(agent);
  writeFileSync(filePath, line + '\n', { flag: 'a' });

  const colour = { INFO: '\x1b[36m', WARN: '\x1b[33m', ERROR: '\x1b[31m', SUCCESS: '\x1b[32m' }[level] || '\x1b[0m';
  console.log(`${colour}[${timestamp()}] [${agent}] [${level}] ${message}\x1b[0m`);
  if (Object.keys(data).length) console.log('  ', JSON.stringify(data, null, 2).split('\n').join('\n   '));
}

export function info(agent, message, data = {}) { log(agent, 'INFO', message, data); }
export function warn(agent, message, data = {}) { log(agent, 'WARN', message, data); }
export function error(agent, message, data = {}) { log(agent, 'ERROR', message, data); }
export function success(agent, message, data = {}) { log(agent, 'SUCCESS', message, data); }

export function readTodayLogs(agent) {
  ensureLogsDir();
  const filePath = logFilePath(agent);
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function readLogsForDateRange(agent, fromDate, toDate) {
  ensureLogsDir();
  const entries = [];
  const from = new Date(fromDate);
  const to = new Date(toDate);
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const dateKey = d.toISOString().slice(0, 10);
    const filePath = join(LOGS_DIR, `${dateKey}_${agent}.jsonl`);
    if (existsSync(filePath)) {
      const lines = readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
      entries.push(...lines.map((l) => JSON.parse(l)));
    }
  }
  return entries;
}
