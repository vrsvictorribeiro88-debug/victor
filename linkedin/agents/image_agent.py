"""
Image Brief Agent
Recommends visual strategy for LinkedIn posts.
LinkedIn posts with the right image type get 2x more engagement — but the wrong image kills credibility.
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


def generate_image_brief(post_text: str, post_format: str | None = None) -> dict:
    """
    Generate a visual brief for a LinkedIn post.

    Args:
        post_text: The LinkedIn post content
        post_format: The post format (data_insight, hot_take, etc.)

    Returns:
        Dict with image type recommendation, brief, do/don't list, and prompt for AI image generation
    """
    profile, voice = load_config()

    system_prompt = f"""You are a visual content strategist for LinkedIn, specialising in finance and SaaS content.
You advise {profile['name']}, a {profile['current_role']} building toward a CFO role.

LINKEDIN IMAGE CONTEXT:
- LinkedIn images appear as thumbnails before the post text — the image must complement the hook, not repeat it
- Personal photos (face visible) get ~3x more engagement than stock photos
- Data visualisations (charts, tables) work extremely well for finance content
- Text-heavy graphics need to be scannable in 2 seconds on mobile
- Canva-style corporate templates with clip art look unprofessional in 2025
- The image should make someone curious enough to click "see more"

IMAGE TYPES FOR FINANCE LINKEDIN CONTENT:
1. "personal_photo" — Victor's photo in a work context (desk, whiteboard, laptop) — humanises the brand
2. "data_chart" — a clean chart or graph visualising the key metric in the post
3. "text_graphic" — bold text overlay with the hook or a key stat (dark background, minimal design)
4. "screenshot" — screenshot of a spreadsheet, dashboard, or tool (blurred if sensitive)
5. "no_image" — some posts perform better without an image (algorithm buries them less, more "organic" feel)
6. "carousel" — multi-slide format for frameworks and breakdowns (highest saves on LinkedIn)

TONE:
Honest and direct. If no image is the right call, say so. If a personal photo would help, say it plainly."""

    user_prompt = f"""Analyse this LinkedIn post and provide a visual brief:

Post format: {post_format or "not specified"}

---
{post_text}
---

Return a JSON object with:
- "recommended_type": one of: personal_photo, data_chart, text_graphic, screenshot, no_image, carousel
- "recommendation_reason": 2-3 sentences on why this image type fits this specific post
- "image_brief": detailed description of exactly what the image should show (specific enough to create or commission)
- "design_notes": list of specific design guidance (colors, text size, what to avoid)
- "alternative_type": a second-best option if the first isn't possible
- "canva_search_terms": list of 3-4 search terms to use in Canva or similar tools
- "ai_image_prompt": a detailed prompt for generating the image with Midjourney or DALL-E (skip if personal_photo or screenshot)
- "dos": list of 3 things the image MUST do
- "donts": list of 3 things the image must NOT do
- "expected_impact": how much this image type typically boosts engagement for this content category"""

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    response = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=2000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw = response.content[0].text.strip()
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()

    return json.loads(raw)


def print_brief(brief: dict) -> None:
    print(f"\n{'='*60}")
    print(f"IMAGE RECOMMENDATION: {brief['recommended_type'].upper()}")
    print(f"\nWhy: {brief['recommendation_reason']}")
    print(f"\n{'-'*60}")
    print(f"BRIEF:\n{brief['image_brief']}")

    print(f"\n{'-'*60}")
    print("DESIGN NOTES:")
    for note in brief["design_notes"]:
        print(f"  • {note}")

    print(f"\nDO:")
    for d in brief["dos"]:
        print(f"  ✓ {d}")

    print(f"\nDON'T:")
    for d in brief["donts"]:
        print(f"  ✗ {d}")

    print(f"\nCANVA SEARCH TERMS: {', '.join(brief['canva_search_terms'])}")

    if brief.get("ai_image_prompt"):
        print(f"\nAI IMAGE PROMPT:\n  {brief['ai_image_prompt']}")

    print(f"\nALTERNATIVE: {brief['alternative_type']}")
    print(f"EXPECTED IMPACT: {brief['expected_impact']}")


if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="Generate image brief for a LinkedIn post")
    parser.add_argument("--file", help="Path to a .txt or .json file containing the post")
    parser.add_argument("--format", help="Post format")
    args = parser.parse_args()

    if args.file:
        path = Path(args.file)
        if path.suffix == ".json":
            with open(path) as f:
                data = json.load(f)
            post_text = data.get("post_text") or data.get("posts", [{}])[0].get("post_text", "")
            post_format = data.get("format") or args.format
        else:
            with open(path) as f:
                post_text = f.read()
            post_format = args.format
    else:
        print("Paste your LinkedIn post below. Press Ctrl+D (Linux/Mac) or Ctrl+Z (Windows) when done:\n")
        post_text = sys.stdin.read()
        post_format = args.format

    print("Generating image brief...")
    brief = generate_image_brief(post_text, post_format)
    print_brief(brief)
