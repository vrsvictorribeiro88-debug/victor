# Victor Ribeiro — LinkedIn CFO Track Automation

## Project Purpose
Automated LinkedIn content system for Victor Ribeiro, FP&A Finance Manager in SaaS/Tech, building toward a CFO role.
Goal: build a visible, credible personal brand in startup finance that accelerates the CFO career path.

## Directory Structure
```
linkedin/
  agents/              # Python subagents (use Anthropic API directly)
    topic_agent.py     # Generates specific post topic ideas
    writer_agent.py    # Writes posts in Victor's voice
    critic_agent.py    # Provides honest critique of posts
    image_agent.py     # Visual strategy and image briefs
    orchestrator.py    # Chains all agents in a full pipeline
  config/
    profile.json       # Victor's profile, audience, content pillars
    brand_voice.json   # Post formats, hook rules, tone guidelines
  content/
    drafts/            # Work in progress posts (.json)
    approved/          # Approved posts ready to schedule (.json)
  main.py              # CLI entry point
.claude/skills/        # Claude Code slash commands
  generate-topics.md   # /generate-topics
  write-post.md        # /write-post
  critique-post.md     # /critique-post
  image-brief.md       # /image-brief
  plan-calendar.md     # /plan-calendar
```

## Environment
- `ANTHROPIC_API_KEY` must be set to run Python agents
- Models used: claude-opus-4-8 for all agents (quality over speed for content)

## Available Skills (slash commands in Claude Code)
| Command | What it does |
|---------|-------------|
| `/generate-topics` | Generates 6-8 specific post topic ideas |
| `/write-post` | Writes a post draft in Victor's voice |
| `/critique-post` | Honest critique — no flattery |
| `/image-brief` | Visual strategy and image creation brief |
| `/plan-calendar` | Weekly/monthly content calendar |

## Python CLI (requires ANTHROPIC_API_KEY)
```bash
cd linkedin
python main.py topics --theme "burn rate"
python main.py write "why most startup burn multiples are lying to founders" --format hot_take
python main.py critique --file content/drafts/my_post.txt
python main.py image --file content/drafts/post.json
python main.py pipeline --theme "fundraising"   # full pipeline with human checkpoints
```

## Content Strategy Summary
- **Primary audience**: SaaS founders, VCs, finance professionals on the CFO track
- **Differentiator**: Specific, data-backed, SaaS-native finance content — not generic leadership fluff
- **Posting target**: 3-4x per week, Tue/Wed/Thu as priority days
- **Voice**: Direct, specific, willing to take a stance — no corporate jargon

## Honest Positioning Context
Victor is starting from <500 followers. The growth path is:
1. **Months 1-3**: Establish the niche — SaaS metrics + FP&A-to-CFO journey content. Focus on saves and comments, not likes.
2. **Months 4-6**: Introduce hotter takes and more opinionated content once there's a base audience.
3. **Month 6+**: Start engaging with CFOs, founders, VCs directly — content opens doors to conversations.

The biggest risk is defaulting to generic content. Every post must pass the question: "Could this have been written by anyone in finance?" If yes, rewrite it.

## Critical Conduct for Claude
- Be honest. If a post is weak, say it's weak.
- Don't patronise. Victor is building expertise — treat him as a finance professional, not a student.
- Push back on generic topics. "Cash flow is important" is not a post topic.
- When critiquing, specifics only — "the hook is weak" is not feedback.
- Acknowledge when something is genuinely good — false modesty is as unhelpful as false flattery.
