"""
Topic Research Agent
Generates specific, non-generic LinkedIn post topic ideas for Victor's CFO track.
"""

import json
import os
import anthropic
from pathlib import Path

CONFIG_DIR = Path(__file__).parent.parent / "config"


def load_config():
    with open(CONFIG_DIR / "profile.json") as f:
        profile = json.load(f)
    with open(CONFIG_DIR / "brand_voice.json") as f:
        voice = json.load(f)
    return profile, voice


def generate_topics(
    theme: str | None = None,
    count: int = 8,
    format_filter: str | None = None,
) -> list[dict]:
    """
    Generate specific LinkedIn post topic ideas.

    Args:
        theme: Optional focus theme (e.g. "burn rate", "fundraising", "career")
        count: Number of topic ideas to generate
        format_filter: Optional post format to target (e.g. "hot_take", "data_insight")

    Returns:
        List of topic dicts with keys: topic, format, hook_draft, why_it_works
    """
    profile, voice = load_config()

    theme_context = f"Focus specifically on the theme: {theme}" if theme else "Cover a spread across the content pillars."
    format_context = f"All topics should use the '{format_filter}' format." if format_filter else "Mix formats across the topics."

    system_prompt = f"""You are a specialist LinkedIn content strategist for finance professionals in the SaaS/startup space.
Your job is to generate hyper-specific, non-generic post topic ideas for {profile['name']},
a {profile['current_role']} in {profile['industry']} on the path to becoming a CFO.

His content pillars: {json.dumps(profile['content_pillars'], indent=2)}
His target audience: {json.dumps(profile['target_audience'], indent=2)}
His tone: {json.dumps(profile['tone'], indent=2)}

CRITICAL — avoid:
- Vague topics like "the importance of cash flow" or "leadership in finance"
- Topics that could apply to any industry (make it SaaS/startup-specific)
- Inspirational fluff

CRITICAL — aim for:
- Topics grounded in specific metrics, real scenarios, or counterintuitive truths
- Topics where Victor can speak from real FP&A experience
- Topics that would make a SaaS founder or VC stop scrolling"""

    user_prompt = f"""Generate {count} specific LinkedIn post topic ideas.
{theme_context}
{format_context}

Return a JSON array. Each object must have:
- "topic": the specific post topic (one sentence, concrete)
- "format": which post format fits best (from: data_insight, hot_take, lesson_learned, framework_breakdown, career_reflection, list_post)
- "hook_draft": a draft first line for the post (must stop the scroll)
- "why_it_works": one sentence on why this topic will resonate with the target audience
- "content_pillar": which pillar it falls under

Be specific. "The rule of 40 is broken for early-stage startups" is better than "Understanding the rule of 40"."""

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    response = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=2000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw = response.content[0].text.strip()
    # Extract JSON if wrapped in markdown code blocks
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()

    topics = json.loads(raw)
    return topics


def print_topics(topics: list[dict]) -> None:
    for i, t in enumerate(topics, 1):
        print(f"\n{'='*60}")
        print(f"[{i}] {t['topic']}")
        print(f"    Format: {t['format']} | Pillar: {t.get('content_pillar', 'N/A')}")
        print(f"    Hook: \"{t['hook_draft']}\"")
        print(f"    Why: {t['why_it_works']}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate LinkedIn post topics")
    parser.add_argument("--theme", help="Optional focus theme")
    parser.add_argument("--count", type=int, default=8, help="Number of topics")
    parser.add_argument("--format", dest="format_filter", help="Target post format")
    parser.add_argument("--save", action="store_true", help="Save topics to content/drafts/topics.json")
    args = parser.parse_args()

    print(f"Generating {args.count} topic ideas...")
    topics = generate_topics(args.theme, args.count, args.format_filter)
    print_topics(topics)

    if args.save:
        output_path = Path(__file__).parent.parent / "content" / "drafts" / "topics.json"
        with open(output_path, "w") as f:
            json.dump(topics, f, indent=2)
        print(f"\nSaved to {output_path}")
