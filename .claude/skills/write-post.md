# Write LinkedIn Post

Write a LinkedIn post in Victor's voice for the SaaS CFO track. Direct, data-driven, specific — no fluff.

## When to use
When Victor has a topic ready and wants a draft post written.

## What you do

1. Load `linkedin/config/profile.json` and `linkedin/config/brand_voice.json`
2. Ask if not provided:
   - The specific topic or angle
   - The format (data_insight | hot_take | lesson_learned | framework_breakdown | career_reflection | list_post)
   - Any specific data, numbers, or personal experience to incorporate
3. Write the post following:
   - Hook rules from brand_voice.json (non-negotiable)
   - Format spec for the chosen format
   - Victor's tone: direct, data-driven, specific, no corporate jargon
   - Line breaks for mobile readability
   - One CTA at the end
   - 3-5 hashtags at the very bottom only
4. Optionally offer 2 variants with different hooks

## Format specs quick reference
- **data_insight**: Lead with surprising stat → implication → takeaway (150-250 words)
- **hot_take**: Bold provocative opinion → supporting evidence → challenge to reader (100-200 words)
- **lesson_learned**: Tension setup → what happened → what it taught (200-350 words)
- **framework_breakdown**: Promise clarity → numbered framework → why it matters (200-400 words)
- **career_reflection**: Challenge conventional wisdom → real experience → what actually works (200-300 words)
- **list_post**: Bold claim → numbered specific list → one-line synthesis (150-300 words)

## After writing
Immediately flag any weaknesses in the draft. Don't just deliver and wait.
If the hook is weak, say so. If it needs a real number to be credible, say what's missing.
Ask: "Want me to critique this now, or try a different angle?"

## Args
- Required: topic description
- Optional: `--format [format_name]`
- Optional: `--variants 2` for two hook options
- Optional: `--context [any specific data or experience to include]`
