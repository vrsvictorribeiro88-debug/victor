# LinkedIn Automation — Roadmap

---

## Phase 1 — Foundation (Current)

**Status:** Complete scaffold, ready for API key configuration

### What's live
- [x] Multi-agent pipeline (TrendScanner → ContentStrategist → PostWriter → QualityReviewer → ImageDirector → WhatsAppNotifier → LinkedInPublisher)
- [x] SystemAuditor with weekly WhatsApp report
- [x] Webhook server for WhatsApp approval replies
- [x] GitHub Actions daily trigger (07:00 AEST)
- [x] Local JSON file storage for drafts and logs
- [x] DRY_RUN mode for safe testing
- [x] Quality rules: hard rejection + AI rewrite loop

### Phase 1 limitations
- Draft/log storage is local files — lost between GitHub Actions runs (mitigated by artefact uploads)
- No engagement analytics yet (LinkedIn API read scope needed)
- WhatsApp approval requires webhook server to be separately deployed
- LinkedIn OAuth token expires every 60 days — manual refresh required

---

## Phase 2 — Analytics + Persistence

**Goal:** Close the feedback loop and stop losing data between runs

### Planned features

#### 2.1 Supabase integration
Replace `/drafts/` and `/logs/` JSON files with a Supabase PostgreSQL database:
- `drafts` table: all post drafts with status, edit history, approval timestamps
- `logs` table: agent run logs queryable by date/agent/level
- `posts` table: published posts with LinkedIn post URN and engagement snapshots
- `audit_reports` table: weekly audit history

Benefit: drafts and logs persist across GitHub Actions runs without artefact uploads.

#### 2.2 LinkedIn engagement analytics
- Add `linkedinAnalytics.js` skill using the LinkedIn Marketing API
- Pull impressions, reactions, comments, shares for published posts
- SystemAuditor compares post styles against engagement benchmarks
- ContentStrategist weights style selection by Victor's own engagement history

#### 2.3 Series tracking
- Track which posts are part of a series in Supabase
- ContentStrategist detects natural follow-ups to recent high-engagement posts
- WhatsApp briefing shows "Continue [Series Name]" as a ranked option

#### 2.4 Scheduled posting
- Replace manual approval gate with a time-window approach
- Victor approves → post queued for optimal AEST posting window
- LinkedInPublisher uses node-cron to post at the exact scheduled time

#### 2.5 Edit loop
- When Victor replies `EDIT: <notes>`, PostWriter automatically rewrites using the notes
- New draft sent immediately for approval
- Full edit history stored in Supabase

---

## Phase 3 — Auto-publish with guardrails

**Goal:** Near-autonomous publishing with Victor reviewing exceptions only

### Planned features

#### 3.1 Smart auto-publish mode
- ContentStrategist assigns a "safe to auto-publish" flag for high-confidence picks
- Posts scoring 9/10 quality + 8/10+ confidence auto-publish with a 30-minute veto window
- Victor receives WhatsApp: "Publishing in 30 min — reply VETO to stop"

#### 3.2 Engagement-adaptive content
- Weekly analysis adjusts topic weights based on actual engagement data
- If Power BI posts consistently outperform others, ContentStrategist increases their priority
- If How-To posts (style C) have lower engagement on Fridays, avoid them then

#### 3.3 LinkedIn comment monitoring
- New agent: `engagementResponder.js`
- Monitors comments on Victor's posts via LinkedIn API
- Drafts suggested reply for Victor's review via WhatsApp
- Victor approves/edits/discards the reply

#### 3.4 Series planner
- Full series planning UI (or WhatsApp command interface)
- `SERIES: <topic> <parts>` → ContentStrategist generates a 5-post series outline
- Posts queued and published across 2 weeks with consistent branding

#### 3.5 Multi-format output
- ImageDirector produces: square (1:1) for feed + wide (1.91:1) for article headers
- PostWriter variant: LinkedIn Article drafts (long-form) for quarterly deep-dives
- Newsletter option: compile monthly top posts into a LinkedIn Newsletter issue

#### 3.6 Competitive intelligence
- TrendScanner also monitors 5–10 target LinkedIn profiles (peers, industry leaders)
- ContentStrategist uses their posting cadence to find uncovered angles
- Respect: frame Victor's perspective, not reactions to others

---

## Phase 4 — Multi-platform (Future)

Reuse the agent pipeline for:
- Twitter/X threads
- Substack newsletter digests
- Email marketing (Klaviyo or Mailchimp)
- Speaking opportunity pitch emails

The agent architecture (JSON-in, JSON-out) is already portable.

---

## Dependency tracker

| Capability | Dependency | Phase |
|---|---|---|
| Persistent storage | Supabase free tier | 2 |
| Engagement analytics | LinkedIn Marketing API r_organization_social scope | 2 |
| Scheduled posting | node-cron in persistent server | 2 |
| Auto-publish guardrails | Victor's trust + Phase 2 analytics | 3 |
| Comment monitoring | LinkedIn API v2 — comments endpoint | 3 |
| LinkedIn Articles | LinkedIn Article API | 3 |
