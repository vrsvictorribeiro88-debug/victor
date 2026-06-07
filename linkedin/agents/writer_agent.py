"""
Post Writer Agent
Writes LinkedIn posts in Victor's voice for the SaaS CFO track.
"""

import json
import os
from pathlib import Path
import anthropic

CONFIG_DIR = Path(__file__).parent.parent / "config"


def load_config():
    with open(CONFIG_DIR / "profile.json") as f:
        profile = json.load(f)
    with open(CONFIG_DIR / "brand_voice.json") as f:
        voice = json.load(f)
    return profile, voice


def write_post(
    topic: str,
    format: str,
    hook_draft: str | None = None,
    additional_context: str | None = None,
    variants: int = 1,
) -> list[dict]:
    """
    Write a LinkedIn post for a given topic.

    Args:
        topic: The specific post topic
        format: Post format (data_insight, hot_take, lesson_learned, framework_breakdown, career_reflection, list_post)
        hook_draft: Optional starting hook to build from
        additional_context: Any specific data, story, or angle to include
        variants: Number of different versions to generate (1-3)

    Returns:
        List of post dicts with keys: post_text, format, word_count, notes
    """
    profile, voice = load_config()

    format_spec = voice["post_formats"].get(format, {})
    hook_rules = "\n".join(f"- {r}" for r in voice["hook_rules"])
    cta_options = ", ".join(f'"{c}"' for c in voice["cta_options"])

    hook_instruction = f'Build from this hook draft: "{hook_draft}"' if hook_draft else "Write a strong original hook."
    context_instruction = f"Incorporate this specific context: {additional_context}" if additional_context else ""
    variants_instruction = f"Generate {variants} distinct variant(s) of the post." if variants > 1 else "Generate 1 post."

    system_prompt = f"""You are writing LinkedIn posts for {profile['name']}, a {profile['current_role']} in {profile['industry']} building toward a CFO role.

VOICE & TONE:
{json.dumps(profile['tone'], indent=2)}

AUDIENCE:
{json.dumps(profile['target_audience'], indent=2)}

FORMAT BEING USED: {format}
{json.dumps(format_spec, indent=2)}

HOOK RULES (non-negotiable):
{hook_rules}

AVAILABLE CTAs: {cta_options}

STRUCTURAL RULES:
- Use line breaks liberally — LinkedIn posts are read on mobile
- No walls of text — max 2-3 sentences per paragraph
- Bold key terms sparingly (use ** for bold in LinkedIn)
- End with exactly one CTA
- Never use hashtags in the body — add 3-5 at the very end only
- Keep hashtags niche and specific (not #finance or #leadership)"""

    user_prompt = f"""Topic: {topic}
Format: {format}
{hook_instruction}
{context_instruction}
{variants_instruction}

Return a JSON array. Each object must have:
- "post_text": the full LinkedIn post text (ready to copy-paste)
- "format": the format used
- "word_count": approximate word count
- "hook_analysis": one sentence on why the hook works (or warning if it's weak)
- "predicted_engagement": "low" | "medium" | "high" with a one-line reason"""

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    response = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=3000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw = response.content[0].text.strip()
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()

    posts = json.loads(raw)
    return posts


def print_posts(posts: list[dict]) -> None:
    for i, p in enumerate(posts, 1):
        print(f"\n{'='*60}")
        print(f"[VARIANT {i}] Format: {p['format']} | Words: {p['word_count']} | Engagement: {p['predicted_engagement']}")
        print(f"Hook analysis: {p['hook_analysis']}")
        print(f"\n{'-'*60}\n")
        print(p["post_text"])


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Write a LinkedIn post")
    parser.add_argument("topic", help="The post topic")
    parser.add_argument("--format", default="data_insight",
                        choices=["data_insight", "hot_take", "lesson_learned", "framework_breakdown", "career_reflection", "list_post"],
                        help="Post format")
    parser.add_argument("--hook", help="Optional hook draft to build from")
    parser.add_argument("--context", help="Additional context, data, or story")
    parser.add_argument("--variants", type=int, default=1, help="Number of variants (1-3)")
    parser.add_argument("--save", help="Save to file (provide filename without extension)")
    args = parser.parse_args()

    print(f"Writing post: {args.topic}")
    posts = write_post(args.topic, args.format, args.hook, args.context, args.variants)
    print_posts(posts)

    if args.save:
        output_path = Path(__file__).parent.parent / "content" / "drafts" / f"{args.save}.json"
        with open(output_path, "w") as f:
            json.dump({"topic": args.topic, "format": args.format, "posts": posts}, f, indent=2)
        print(f"\nSaved to {output_path}")
