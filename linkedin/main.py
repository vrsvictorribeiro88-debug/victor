"""
LinkedIn Content Automation — Main Entry Point
Victor Ribeiro | FP&A → CFO track | SaaS/Tech

Quick commands:
  python main.py topics                  # Generate topic ideas
  python main.py write "your topic"      # Write a post
  python main.py critique                # Critique a post (paste or --file)
  python main.py image                   # Get image brief for a post
  python main.py pipeline                # Full pipeline: topic → write → critique → image
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "agents"))

from topic_agent import generate_topics, print_topics
from writer_agent import write_post, print_posts
from critic_agent import critique_post, print_critique
from image_agent import generate_image_brief, print_brief


def cmd_topics(args):
    topics = generate_topics(
        theme=args.theme,
        count=args.count,
        format_filter=args.format,
    )
    print_topics(topics)


def cmd_write(args):
    if not args.topic:
        print("Error: provide a topic. Usage: python main.py write \"your topic here\"")
        sys.exit(1)
    posts = write_post(
        topic=args.topic,
        format=args.format or "data_insight",
        hook_draft=args.hook,
        additional_context=args.context,
        variants=args.variants,
    )
    print_posts(posts)


def cmd_critique(args):
    if args.file:
        import json
        path = Path(args.file)
        if path.suffix == ".json":
            with open(path) as f:
                data = json.load(f)
            post_text = data.get("post_text") or data.get("posts", [{}])[0].get("post_text", "")
        else:
            with open(path) as f:
                post_text = f.read()
    else:
        print("Paste your post below. Press Ctrl+D when done:\n")
        post_text = sys.stdin.read()

    critique = critique_post(post_text, args.format)
    print_critique(critique)


def cmd_image(args):
    if args.file:
        import json
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
        print("Paste your post below. Press Ctrl+D when done:\n")
        post_text = sys.stdin.read()
        post_format = args.format

    brief = generate_image_brief(post_text, post_format)
    print_brief(brief)


def cmd_pipeline(args):
    from orchestrator import run_full_pipeline
    run_full_pipeline(
        topic=args.topic,
        topic_theme=args.theme,
        post_format=args.format,
        auto_proceed=args.auto,
        min_score=args.min_score,
    )


def main():
    parser = argparse.ArgumentParser(
        description="LinkedIn Content Automation for Victor Ribeiro | FP&A → CFO"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # topics
    p_topics = subparsers.add_parser("topics", help="Generate post topic ideas")
    p_topics.add_argument("--theme", help="Focus theme (e.g. 'burn rate', 'fundraising')")
    p_topics.add_argument("--count", type=int, default=8)
    p_topics.add_argument("--format")

    # write
    p_write = subparsers.add_parser("write", help="Write a LinkedIn post")
    p_write.add_argument("topic", nargs="?", help="Post topic")
    p_write.add_argument("--format", default="data_insight",
                         choices=["data_insight", "hot_take", "lesson_learned", "framework_breakdown", "career_reflection", "list_post"])
    p_write.add_argument("--hook", help="Hook draft")
    p_write.add_argument("--context", help="Additional context")
    p_write.add_argument("--variants", type=int, default=1)

    # critique
    p_crit = subparsers.add_parser("critique", help="Critique a LinkedIn post")
    p_crit.add_argument("--file", help="Path to post file (.txt or .json)")
    p_crit.add_argument("--format", help="Intended post format")

    # image
    p_img = subparsers.add_parser("image", help="Get image brief for a post")
    p_img.add_argument("--file", help="Path to post file (.txt or .json)")
    p_img.add_argument("--format", help="Post format")

    # pipeline
    p_pipe = subparsers.add_parser("pipeline", help="Run full pipeline")
    p_pipe.add_argument("--topic", help="Specific topic")
    p_pipe.add_argument("--theme", help="Topic generation theme")
    p_pipe.add_argument("--format",
                        choices=["data_insight", "hot_take", "lesson_learned", "framework_breakdown", "career_reflection", "list_post"])
    p_pipe.add_argument("--auto", action="store_true", help="Auto-proceed")
    p_pipe.add_argument("--min-score", type=int, default=6)

    args = parser.parse_args()
    commands = {
        "topics": cmd_topics,
        "write": cmd_write,
        "critique": cmd_critique,
        "image": cmd_image,
        "pipeline": cmd_pipeline,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
