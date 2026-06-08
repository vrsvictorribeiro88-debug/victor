# LinkedIn Automation Pipeline

A multi-agent content pipeline for Victor Ribeiro dos Santos — Financial Controller, Emanuel Synagogue Sydney / Founder, Altarion Business Intelligence.

Scans daily industry signals → selects the best post angle → drafts in Victor's voice → reviews quality → generates images → requests approval via WhatsApp → publishes to LinkedIn.

---

## Architecture

```
TrendScanner → ContentStrategist → PostWriter (×3)
    → QualityReviewer → ImageDirector → WhatsAppNotifier
    → [Victor approves via WhatsApp] → LinkedInPublisher
                                      ↑
                              webhook/server.js handles replies
```

Weekly: `SystemAuditor` reviews logs, flags issues, sends WhatsApp summary.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 20+ | `node --version` to check |
| Anthropic API key | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| OpenAI API key | [platform.openai.com](https://platform.openai.com/api-keys) — for DALL·E 3 |
| Brave Search API key | [api.search.brave.com](https://api.search.brave.com/app/keys) (or Serper.dev) |
| Twilio account | WhatsApp-enabled number required |
| LinkedIn Developer App | Marketing Developer Platform access required |

---

## Setup

### 1. Install dependencies

```bash
cd linkedin-automation
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
# Edit .env with your actual API keys
```

See `.env.example` for full documentation of every variable.

### 3. Authenticate with LinkedIn

LinkedIn requires OAuth 2.0. Use the helper script:

```bash
node scripts/linkedin-auth.js
```

This opens a browser for the OAuth flow and saves your access token. After auth, run:

```bash
node agents/linkedinPublisher.js
# Prints your LinkedIn Person URN — add to LINKEDIN_PERSON_URN in .env
```

### 4. Configure Twilio WhatsApp

1. In [Twilio Console](https://console.twilio.com/), enable the WhatsApp Sandbox or a dedicated number
2. Set the webhook URL to: `https://your-server.example.com/webhook/whatsapp`
3. Deploy `webhook/server.js` to Railway, Render, or Fly.io (see below)

### 5. Test the pipeline (dry run)

```bash
DRY_RUN=true node pipeline.js
```

This runs the full pipeline without calling external APIs.

### 6. Run the full pipeline

```bash
node pipeline.js
```

---

## Deployment

### GitHub Actions (recommended — production)

1. Go to your repo → **Settings → Secrets and variables → Actions**
2. Add each variable from `.env.example` as a repository secret
3. The workflow at `.github/workflows/daily_run.yml` triggers at 07:00 AEST daily

Manual trigger: Actions tab → "LinkedIn Daily Pipeline" → "Run workflow" → choose mode

### Webhook server (required for WhatsApp replies)

The webhook server must be publicly accessible for Twilio to deliver Victor's replies:

```bash
# Local dev (with ngrok)
npx ngrok http 3000
# Set WEBHOOK_BASE_URL to the ngrok URL in .env and Twilio console

# Production deploy (Railway)
# Connect your repo to Railway — it detects package.json automatically
# Set start command: node webhook/server.js
```

---

## Running individual agents

Each agent is standalone:

```bash
npm run scan          # TrendScanner only
npm run strategise    # ContentStrategist (runs scanner first)
npm run write         # PostWriter (uses mock pick)
npm run review        # QualityReviewer (uses mock draft)
npm run audit         # SystemAuditor
npm run webhook       # Webhook server
```

---

## Manual publish (after approval)

If AUTO_PUBLISH is disabled (default), publish an approved draft manually:

```bash
node pipeline.js --publish <draftId>
```

Draft IDs are logged during the pipeline run and stored in `/drafts/`.

---

## Directory structure

```
linkedin-automation/
├── pipeline.js              # Main orchestrator
├── agents/
│   ├── trendScanner.js      # Agent 1 — news/signal scanning
│   ├── contentStrategist.js # Agent 2 — topic scoring + angle selection
│   ├── postWriter.js        # Agent 3 — draft writing in Victor's voice
│   ├── qualityReviewer.js   # Agent 4 — quality gating + auto-rewrite
│   ├── imageDirector.js     # Agent 5 — DALL·E 3 image generation
│   ├── whatsappNotifier.js  # Agent 6 — Twilio WhatsApp briefings
│   ├── linkedinPublisher.js # Agent 7 — LinkedIn API v2 publishing
│   └── systemAuditor.js     # Agent 8 — weekly health + recommendations
├── skills/
│   ├── anthropicClient.js   # Claude API wrapper with retry logic
│   ├── searchClient.js      # Brave/Serper search abstraction
│   ├── logger.js            # Structured JSONL logging
│   └── storage.js           # Draft/log file persistence
├── config/
│   ├── victorProfile.js     # Victor's voice, audience, style rules
│   ├── topics.js            # Search queries per topic area
│   ├── postFormats.js       # Post styles A–H definitions
│   └── qualityRules.js      # QualityReviewer rejection criteria
├── webhook/
│   └── server.js            # Express server for Twilio callbacks
├── drafts/                  # Generated post drafts (JSON)
│   └── images/              # DALL·E generated images (PNG)
├── logs/                    # Daily agent logs (JSONL) + weekly audits
├── .env.example             # Environment variable documentation
└── .github/
    └── workflows/
        └── daily_run.yml    # GitHub Actions — 07:00 AEST trigger
```

---

## WhatsApp approval flow

1. **07:00 AEST** — Pipeline runs, scans trends, writes 3 draft posts
2. **~07:30 AEST** — Victor receives WhatsApp: 3 topic options
3. Victor replies **1**, **2**, or **3** to select a topic (or **SKIP**)
4. Full draft is sent to Victor's WhatsApp
5. Victor replies:
   - **APPROVE** — draft is published (or queued if AUTO_PUBLISH=false)
   - **EDIT: [notes]** — stored for manual rewrite, re-submit next day
   - **DISCARD** — draft discarded, no post that day

---

## Environment variables quick reference

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | All AI agents (Claude) |
| `OPENAI_API_KEY` | ✅ | DALL·E 3 image generation |
| `BRAVE_SEARCH_API_KEY` | ✅* | Trend scanning (*or Serper) |
| `SERPER_API_KEY` | ✅* | Trend scanning fallback |
| `TWILIO_ACCOUNT_SID` | ✅ | WhatsApp notifications |
| `TWILIO_AUTH_TOKEN` | ✅ | WhatsApp notifications |
| `TWILIO_WHATSAPP_FROM` | ✅ | Twilio sending number |
| `VICTOR_WHATSAPP_TO` | ✅ | Victor's WhatsApp number |
| `LINKEDIN_ACCESS_TOKEN` | ✅ | LinkedIn publishing |
| `LINKEDIN_PERSON_URN` | ✅ | LinkedIn author identity |
| `AUTO_PUBLISH` | ❌ | Set `true` to skip approval gate |
| `DRY_RUN` | ❌ | Set `true` for API-free testing |
