"""
Post Critic Agent
Provides honest, harsh, useful critique of LinkedIn posts.
No flattery. No patronising. Just what actually needs to change.
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


def critique_post(post_text: str, intended_format: str | None = None) -> dict:
    """
    Critically review a LinkedIn post. Honest, direct, no flattery.

    Args:
        post_text: The full LinkedIn post to critique
        intended_format: The format the post was meant to follow

    Returns:
        Dict with critique dimensions, overall score, and specific rewrite suggestions
    """
    profile, voice = load_config()

    format_context = f"Intended format: {intended_format}" if intended_format else "Format not specified — assess what it's trying to be."

    system_prompt = f"""You are a brutally honest marketing director reviewing LinkedIn posts for {profile['name']},
a {profile['current_role']} building toward a CFO role in SaaS/Tech.

Your job: give specific, actionable critique. Not encouragement. Not "this is great but..."
If it's weak, say it's weak and explain exactly why. If the hook will lose 80% of readers, say that.

You are reviewing against these standards:
1. Hook quality — does the first line stop a scroll? Be specific about what's wrong.
2. Specificity — are there real numbers, real scenarios, or is it vague? Vague is death on LinkedIn.
3. Audience fit — would a SaaS founder or finance professional actually care? Or is this generic?
4. Voice authenticity — does it sound like a real person with expertise, or like corporate content?
5. Structure — is it mobile-readable? Any walls of text?
6. CTA — does it invite engagement or is it an afterthought?
7. LinkedIn algorithm suitability — does it invite comments? Saves? Or just passive likes?

The target audience: {json.dumps(profile['target_audience'], indent=2)}
The tone we're going for: {json.dumps(profile['tone'], indent=2)}

Do NOT soften feedback. Do NOT lead with positives unless they genuinely exist.
Flag if the post will blend into generic finance content and be forgotten."""

    user_prompt = f"""Critique this LinkedIn post:

{format_context}

---
{post_text}
---

Return a JSON object with:
- "overall_score": integer 1-10 (be calibrated — a 7 is actually good, a 5 is mediocre, a 3 is bad)
- "verdict": one harsh sentence summarising the post's main problem (or strength if it's genuinely good)
- "hook_score": integer 1-10
- "hook_feedback": specific critique of the first line — what it does well or badly
- "specificity_score": integer 1-10
- "specificity_feedback": is it specific enough? What's missing?
- "voice_score": integer 1-10
- "voice_feedback": does it sound authentic or generic?
- "structure_score": integer 1-10
- "structure_feedback": mobile readability, length, formatting
- "cta_score": integer 1-10
- "cta_feedback": does the CTA invite the right engagement?
- "will_be_remembered": boolean — will this post stick in someone's memory?
- "top_3_issues": array of exactly 3 specific issues to fix (concrete, not vague)
- "rewrite_suggestion": a specific rewrite of just the hook line to make it stronger (if the hook is weak)
- "publish_recommendation": "publish_as_is" | "revise_first" | "do_not_publish"
- "revision_priority": if revise_first, what's the single most important thing to change"""

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


def print_critique(critique: dict) -> None:
    score = critique["overall_score"]
    score_bar = "█" * score + "░" * (10 - score)

    print(f"\n{'='*60}")
    print(f"OVERALL SCORE: {score}/10  [{score_bar}]")
    print(f"VERDICT: {critique['verdict']}")
    print(f"PUBLISH: {critique['publish_recommendation'].upper()}")
    print(f"\n{'-'*60}")

    dimensions = [
        ("Hook", "hook_score", "hook_feedback"),
        ("Specificity", "specificity_score", "specificity_feedback"),
        ("Voice", "voice_score", "voice_feedback"),
        ("Structure", "structure_score", "structure_feedback"),
        ("CTA", "cta_score", "cta_feedback"),
    ]

    for label, score_key, feedback_key in dimensions:
        s = critique[score_key]
        bar = "█" * s + "░" * (10 - s)
        print(f"\n{label}: {s}/10 [{bar}]")
        print(f"  {critique[feedback_key]}")

    print(f"\n{'-'*60}")
    print("TOP 3 ISSUES TO FIX:")
    for i, issue in enumerate(critique["top_3_issues"], 1):
        print(f"  {i}. {issue}")

    if critique.get("rewrite_suggestion"):
        print(f"\nHOOK REWRITE SUGGESTION:")
        print(f'  "{critique["rewrite_suggestion"]}"')

    if critique.get("revision_priority"):
        print(f"\nIF REVISING — START WITH:")
        print(f"  {critique['revision_priority']}")

    memorable = "YES" if critique["will_be_remembered"] else "NO"
    print(f"\nWILL BE REMEMBERED: {memorable}")


if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="Critique a LinkedIn post")
    parser.add_argument("--file", help="Path to a .txt or .json file containing the post")
    parser.add_argument("--format", help="Intended post format")
    args = parser.parse_args()

    if args.file:
        path = Path(args.file)
        if path.suffix == ".json":
            with open(path) as f:
                data = json.load(f)
            post_text = data.get("post_text") or data.get("posts", [{}])[0].get("post_text", "")
        else:
            with open(path) as f:
                post_text = f.read()
    else:
        print("Paste your LinkedIn post below. Press Ctrl+D (Linux/Mac) or Ctrl+Z (Windows) when done:\n")
        post_text = sys.stdin.read()

    print("Critiquing post...")
    critique = critique_post(post_text, args.format)
    print_critique(critique)
