"""
Orchestrator Agent
Runs the full pipeline: Topic → Write → Critique → (if score >= 7) Image Brief
Chains all subagents with human-in-the-loop checkpoints.
"""

import json
import os
from pathlib import Path
from datetime import datetime
from topic_agent import generate_topics
from writer_agent import write_post
from critic_agent import critique_post, print_critique
from image_agent import generate_image_brief, print_brief

CONTENT_DIR = Path(__file__).parent.parent / "content"


def run_full_pipeline(
    topic: str | None = None,
    topic_theme: str | None = None,
    post_format: str | None = None,
    auto_proceed: bool = False,
    min_score: int = 6,
) -> dict:
    """
    Full pipeline: topic selection → writing → critique → image brief.

    Args:
        topic: Provide a specific topic (skip topic generation)
        topic_theme: Theme for topic generation if no topic given
        post_format: Force a specific post format
        auto_proceed: Skip human approval prompts
        min_score: Minimum critique score to proceed to image brief

    Returns:
        Dict with the approved post, critique, and image brief
    """
    print("\n" + "="*60)
    print("LINKEDIN POST PIPELINE")
    print("="*60)

    # STEP 1: Topic selection
    if not topic:
        print("\n[STEP 1] Generating topic ideas...")
        topics = generate_topics(theme=topic_theme, count=5, format_filter=post_format)

        print("\nGenerated topics:")
        for i, t in enumerate(topics, 1):
            print(f"\n  [{i}] {t['topic']}")
            print(f"      Format: {t['format']}")
            print(f"      Hook: \"{t['hook_draft']}\"")

        if auto_proceed:
            selected = topics[0]
            print(f"\nAuto-selecting topic 1.")
        else:
            choice = input("\nSelect a topic (1-5) or type your own: ").strip()
            if choice.isdigit() and 1 <= int(choice) <= len(topics):
                selected = topics[int(choice) - 1]
            else:
                selected = {"topic": choice, "format": post_format or "data_insight", "hook_draft": None}

        topic = selected["topic"]
        post_format = post_format or selected.get("format", "data_insight")
        hook_draft = selected.get("hook_draft")
        print(f"\nSelected: {topic}")
    else:
        hook_draft = None
        post_format = post_format or "data_insight"

    # STEP 2: Write post
    print(f"\n[STEP 2] Writing post (format: {post_format})...")
    posts = write_post(topic, post_format, hook_draft, variants=2)

    print(f"\nGenerated {len(posts)} variant(s).")
    for i, p in enumerate(posts, 1):
        print(f"\n--- VARIANT {i} ({p['word_count']} words) ---")
        print(p["post_text"])

    if auto_proceed:
        chosen_post = posts[0]
        print("\nAuto-selecting variant 1.")
    else:
        if len(posts) > 1:
            choice = input("\nChoose variant (1 or 2), or press Enter for 1: ").strip()
            idx = int(choice) - 1 if choice.isdigit() else 0
        else:
            idx = 0
        chosen_post = posts[max(0, min(idx, len(posts) - 1))]

    # STEP 3: Critique
    print("\n[STEP 3] Critiquing post...")
    critique = critique_post(chosen_post["post_text"], post_format)
    print_critique(critique)

    if critique["overall_score"] < min_score:
        print(f"\nScore {critique['overall_score']}/10 is below minimum {min_score}.")
        if not auto_proceed:
            proceed = input("Proceed anyway? (y/n): ").strip().lower()
            if proceed != "y":
                print("Pipeline stopped. Revise the post and run again.")
                return {"status": "stopped", "reason": "low_score", "critique": critique}

    # STEP 4: Image brief
    print("\n[STEP 4] Generating image brief...")
    image_brief = generate_image_brief(chosen_post["post_text"], post_format)
    print_brief(image_brief)

    # STEP 5: Save
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output = {
        "timestamp": timestamp,
        "topic": topic,
        "format": post_format,
        "post_text": chosen_post["post_text"],
        "critique": critique,
        "image_brief": image_brief,
        "status": "draft" if critique["publish_recommendation"] != "publish_as_is" else "approved",
    }

    status_dir = "approved" if output["status"] == "approved" else "drafts"
    output_path = CONTENT_DIR / status_dir / f"post_{timestamp}.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n{'='*60}")
    print(f"Pipeline complete. Saved to: {output_path}")
    print(f"Status: {output['status'].upper()}")

    return output


if __name__ == "__main__":
    import argparse
    import sys
    sys.path.insert(0, str(Path(__file__).parent))

    parser = argparse.ArgumentParser(description="Run full LinkedIn post pipeline")
    parser.add_argument("--topic", help="Specific topic to write about")
    parser.add_argument("--theme", help="Theme for topic generation")
    parser.add_argument("--format", dest="post_format",
                        choices=["data_insight", "hot_take", "lesson_learned", "framework_breakdown", "career_reflection", "list_post"],
                        help="Force a post format")
    parser.add_argument("--auto", action="store_true", help="Auto-proceed without human checkpoints")
    parser.add_argument("--min-score", type=int, default=6, help="Minimum critique score to proceed")
    args = parser.parse_args()

    run_full_pipeline(
        topic=args.topic,
        topic_theme=args.theme,
        post_format=args.post_format,
        auto_proceed=args.auto,
        min_score=args.min_score,
    )
