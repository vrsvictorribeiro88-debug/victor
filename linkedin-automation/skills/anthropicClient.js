import Anthropic from '@anthropic-ai/sdk';
import { info, error } from './logger.js';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10);

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

async function withRetry(fn, agentName, attempt = 1) {
  try {
    return await fn();
  } catch (err) {
    if (attempt >= MAX_RETRIES) {
      error(agentName, `Claude API failed after ${MAX_RETRIES} retries`, { error: err.message });
      throw err;
    }
    const delay = Math.pow(2, attempt) * 1000;
    info(agentName, `Claude API error — retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`, { error: err.message });
    await new Promise((r) => setTimeout(r, delay));
    return withRetry(fn, agentName, attempt + 1);
  }
}

const DRY_RUN_MOCKS = {
  contentStrategist: JSON.stringify({
    analysedAt: new Date().toISOString(),
    topPicks: [
      { rank: 1, topicId: 'finance_accounting', title: 'ACNC reporting changes affect every Australian charity', sourceArticle: { title: 'ACNC Update 2025', url: 'https://acnc.gov.au', source: 'acnc.gov.au' }, postStyle: 'B', postStyleName: 'NEWS COMMENTARY', whyThisStyle: 'Breaking regulatory news Victor can speak to directly', whyNow: 'ACNC released updated reporting guidelines this week', suggestedTimeAEST: '08:00', confidenceScore: 9, confidenceReasoning: 'Directly relevant to Victor\'s NFP finance role; timely; audience will share', alternativeAngle: 'How-To post on updating your ACNC compliance checklist', keyPoints: ['New ACNC financial reporting thresholds', 'Impact on salary packaging disclosures', 'What to action before next reporting period'] },
      { rank: 2, topicId: 'power_bi_data', title: 'Three DAX patterns that cut my reporting time in half', sourceArticle: { title: 'Power BI Monthly Digest', url: 'https://microsoft.com', source: 'microsoft.com' }, postStyle: 'C', postStyleName: 'HOW-TO / TIPS', whyThisStyle: 'Practical tutorial — highest save/share rate for BI audience', whyNow: 'Microsoft released Fabric updates making these patterns more relevant', suggestedTimeAEST: '12:00', confidenceScore: 8, confidenceReasoning: 'Strong evergreen value; Victor has hands-on expertise to be specific', alternativeAngle: 'Insight post on why most finance dashboards are built backwards', keyPoints: ['CALCULATE with REMOVEFILTERS', 'Dynamic period comparisons without a date table', 'Using SELECTEDVALUE for clean parameter-driven visuals'] },
      { rank: 3, topicId: 'ai_automation', title: 'AI won\'t replace finance teams — but this will', sourceArticle: { title: 'AI in Finance 2025', url: 'https://example.com', source: 'example.com' }, postStyle: 'H', postStyleName: 'CONTRARIAN TAKE', whyThisStyle: 'Challenge the AI-fear narrative with a more precise argument', whyNow: 'AI anxiety in finance is peaking; a grounded take stands out', suggestedTimeAEST: '17:30', confidenceScore: 7, confidenceReasoning: 'Contrarian posts drive comments; Victor\'s dual finance+BI background adds credibility', alternativeAngle: 'Poll asking finance teams what task they wish AI could automate today', keyPoints: ['The real threat is finance teams who don\'t use AI', 'Three workflows Victor has already automated', 'What judgment looks like when AI handles the routine work'] },
    ],
    strategistNotes: '[DRY_RUN] Mock strategy — replace with real Brave/Serper + Claude keys',
  }),

  postWriter: JSON.stringify({
    postCopy: `Most finance teams I meet are drowning in reconciliations that could be automated in a week.\n\nNot because the technology is hard. Because no one has sat down and mapped the process first.\n\nHere's what I've learned running finance at a mid-size NFP:\n\nAutomation without process clarity just creates faster chaos.\n\nBefore touching Power BI or any tool:\n1. Document the current workflow — every manual step\n2. Find the three steps that consume 80% of the time\n3. Ask: does this step require human judgment, or just human execution?\n\nThe last category is where you start.\n\nWe cut our month-end close from 8 days to 3. Not through software. Through that question.\n\n#FinanceOps #PowerBI #NFPFinance #FinancialControl #ProcessImprovement`,
    charCount: 712,
    hashtags: ['FinanceOps', 'PowerBI', 'NFPFinance', 'FinancialControl', 'ProcessImprovement'],
    imageRecommended: true,
    imageDescription: 'Clean minimalist graphic showing a process flow diagram transforming from chaotic to streamlined',
    writerNotes: '[DRY_RUN] Mock draft — will use real Claude API with actual keys',
  }),

  qualityReviewer: JSON.stringify({
    passed: true,
    qualityScore: 8,
    issues: [],
    strengths: ['Opens with a specific, relatable pain point', 'Numbered framework is actionable', 'Ends with a concrete result, not a question'],
    verdict: 'APPROVED',
    rewrittenCopy: null,
  }),

  imageDirector: JSON.stringify({
    imageNeeded: true,
    conceptDescription: 'A clean process flow diagram showing transformation from complexity to clarity',
    dallePrompt: 'Minimalist infographic showing a tangled web of arrows on the left transforming into three clean sequential steps on the right. Monochrome with a single blue accent. Professional, corporate design. No text. White background. Square format.',
    altText: 'Process improvement diagram showing workflow simplification',
    rationale: 'Visual reinforces the post\'s core message about mapping before automating',
  }),

  systemAuditor: JSON.stringify({
    pipelineHealth: 'HEALTHY',
    flags: ['[DRY_RUN] No real data to analyse yet'],
    recommendations: ['Connect Brave Search API to start real trend scanning', 'Add your LinkedIn token to begin publishing', 'Run one live post to establish a baseline quality score'],
    nextWeekFocus: 'Power BI and NFP finance — both have active signals this week',
  }),
};

export async function chat({ system, messages, agentName = 'anthropicClient', maxTokens = 2048, temperature = 0.7 }) {
  if (process.env.DRY_RUN === 'true') {
    info(agentName, '[DRY_RUN] Returning mock Claude response');
    const mockContent = DRY_RUN_MOCKS[agentName] || JSON.stringify({ result: '[DRY_RUN mock]' });
    return { content: mockContent, usage: {} };
  }
  info(agentName, 'Calling Claude API', { model: MODEL, maxTokens });
  return withRetry(async () => {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    });
    const content = response.content[0]?.text || '';
    info(agentName, 'Claude API response received', {
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      chars: content.length,
    });
    return { content, usage: response.usage };
  }, agentName);
}

export async function extractJSON(text) {
  const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // fall through
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
