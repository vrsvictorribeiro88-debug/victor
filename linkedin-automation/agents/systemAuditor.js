/**
 * SystemAuditor — Agent 8
 * Runs weekly (Monday 08:00 AEST) to review logs, identify failures,
 * and produce improvement recommendations.
 */

import 'dotenv/config';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chat, extractJSON } from '../skills/anthropicClient.js';
import { info, success, warn } from '../skills/logger.js';
import { saveAuditReport, listDrafts } from '../skills/storage.js';
import { sendAuditSummary } from './whatsappNotifier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, '..', 'logs');
const AGENT = 'systemAuditor';

export async function run() {
  info(AGENT, 'Starting weekly system audit');

  const { fromDate, toDate } = getLastWeekRange();
  info(AGENT, `Audit period: ${fromDate} → ${toDate}`);

  const logData = collectLogs(fromDate, toDate);
  const draftData = collectDrafts(fromDate, toDate);
  const weekStats = computeStats(logData, draftData);

  info(AGENT, 'Requesting AI analysis of audit data');
  const aiAnalysis = await analyseWithClaude(weekStats, logData, draftData);

  const report = {
    generatedAt: new Date().toISOString(),
    period: `${fromDate} to ${toDate}`,
    weekSummary: weekStats,
    logsSummary: summariseLogs(logData),
    drafts: draftData,
    recommendations: aiAnalysis.recommendations,
    flags: aiAnalysis.flags,
    pipelineHealth: aiAnalysis.pipelineHealth,
    nextWeekFocus: aiAnalysis.nextWeekFocus,
  };

  const reportPath = saveAuditReport(report);
  success(AGENT, `Audit complete — report saved to ${reportPath}`);

  try {
    await sendAuditSummary(report);
  } catch (err) {
    warn(AGENT, `Could not send WhatsApp audit summary: ${err.message}`);
  }

  return report;
}

function getLastWeekRange() {
  const now = new Date();
  const toDate = now.toISOString().slice(0, 10);
  const from = new Date(now);
  from.setDate(from.getDate() - 7);
  return { fromDate: from.toISOString().slice(0, 10), toDate };
}

function collectLogs(fromDate, toDate) {
  if (!existsSync(LOGS_DIR)) return {};
  const allLogs = {};
  const files = readdirSync(LOGS_DIR).filter((f) => f.endsWith('.jsonl'));

  for (const file of files) {
    const dateKey = file.slice(0, 10);
    if (dateKey < fromDate || dateKey > toDate) continue;
    const agent = file.slice(11, -6);
    if (!allLogs[agent]) allLogs[agent] = [];
    const lines = readFileSync(join(LOGS_DIR, file), 'utf8').split('\n').filter(Boolean);
    allLogs[agent].push(...lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean));
  }
  return allLogs;
}

function collectDrafts(fromDate, toDate) {
  const all = listDrafts();
  return all.filter((d) => {
    if (!d.createdAt) return false;
    const date = d.createdAt.slice(0, 10);
    return date >= fromDate && date <= toDate;
  });
}

function computeStats(logData, drafts) {
  const errors = Object.values(logData).flat().filter((l) => l.level === 'ERROR');
  const approved = drafts.filter((d) => ['APPROVED', 'PUBLISHED'].includes(d.status));
  const rejected = drafts.filter((d) => d.status === 'REJECTED');
  const published = drafts.filter((d) => d.status === 'PUBLISHED');
  const skipped = drafts.filter((d) => d.status === 'SKIPPED');
  const rewrites = drafts.filter((d) => d.wasRewritten);

  return {
    totalDrafts: drafts.length,
    postsCompleted: published.length,
    approved: approved.length,
    rejected: rejected.length,
    skipped: skipped.length,
    rewrites: rewrites.length,
    apiErrors: errors.length,
    agentsWithErrors: [...new Set(errors.map((e) => e.agent))],
    styleBreakdown: Object.fromEntries(
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((s) => [s, drafts.filter((d) => d.pick?.postStyle === s).length]),
    ),
  };
}

function summariseLogs(logData) {
  const summary = {};
  for (const [agent, entries] of Object.entries(logData)) {
    summary[agent] = {
      total: entries.length,
      errors: entries.filter((e) => e.level === 'ERROR').length,
      warnings: entries.filter((e) => e.level === 'WARN').length,
    };
  }
  return summary;
}

async function analyseWithClaude(stats, logData, drafts) {
  const errorSamples = Object.values(logData).flat()
    .filter((l) => l.level === 'ERROR')
    .slice(0, 10)
    .map((l) => `[${l.agent}] ${l.message}`);

  const { content } = await chat({
    system: `You are a LinkedIn automation system analyst. Review weekly metrics and provide actionable recommendations.
Be specific. If error rates are high, identify the likely cause. If engagement potential looks low, say why.`,
    messages: [
      {
        role: 'user',
        content: `Weekly audit data for Victor Ribeiro's LinkedIn automation system:

## Stats
${JSON.stringify(stats, null, 2)}

## Error samples (up to 10)
${errorSamples.length ? errorSamples.join('\n') : 'No errors this week.'}

## Draft status breakdown
${drafts.map((d) => `- ${d.id}: ${d.status} | style:${d.pick?.postStyle} | score:${d.qualityScore}`).join('\n') || 'No drafts this week.'}

Provide analysis in JSON:
{
  "pipelineHealth": "HEALTHY | DEGRADED | CRITICAL",
  "flags": ["Specific issue 1", "Specific issue 2"],
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2", "Actionable recommendation 3"],
  "nextWeekFocus": "One-sentence suggestion for next week's content focus"
}`,
      },
    ],
    agentName: AGENT,
    maxTokens: 800,
  });

  const analysis = await extractJSON(content);
  return analysis || { pipelineHealth: 'UNKNOWN', flags: [], recommendations: ['Manual review recommended'], nextWeekFocus: 'N/A' };
}

if (process.argv[1].endsWith('systemAuditor.js')) {
  run().then((report) => {
    console.log('\n=== SYSTEM AUDITOR OUTPUT ===');
    console.log(`Health: ${report.pipelineHealth}`);
    console.log(`Period: ${report.period}`);
    console.log('\nWeek stats:', report.weekSummary);
    console.log('\nRecommendations:');
    report.recommendations?.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
  }).catch(console.error);
}
