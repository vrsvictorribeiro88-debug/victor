# Generate LinkedIn Topics

Generate specific, non-generic LinkedIn post topic ideas for Victor's CFO track in SaaS/Tech.

## When to use
When Victor wants to see topic ideas for posts. Can focus on a theme or generate a broad spread.

## What you do

1. Load Victor's profile from `linkedin/config/profile.json` and brand voice from `linkedin/config/brand_voice.json`
2. Generate 6-8 specific topic ideas. Each must have:
   - A concrete, specific topic (not vague)
   - A suggested post format (from: data_insight, hot_take, lesson_learned, framework_breakdown, career_reflection, list_post)
   - A draft hook (first line) — must follow hook rules from brand_voice.json
   - A one-line reason why this topic will resonate with SaaS founders / finance professionals
3. Present them in a numbered list, clearly formatted

## Critical rules
- Topics must be SaaS/startup-specific, not generic finance content
- Every topic should be something Victor can speak to from his FP&A experience
- If the user provides a theme or focus area, prioritise that angle
- Avoid: "the importance of X", "why X matters", "how to think about X" — these are weak
- Aim for: specific claims, counterintuitive angles, concrete scenarios

## Args
- Optional: `--theme [topic area]` — focus on a specific area (e.g., "burn rate", "fundraising", "career")
- Optional: `--format [format]` — only generate topics for one format type
- Optional: `--count [n]` — number of topics (default 8)

## After generating
Ask Victor: "Which of these resonates? I can write any of them, or combine angles from multiple."
Be honest if any topic is too generic — flag it directly.
