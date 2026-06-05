#!/usr/bin/env python3
"""Aggregate Concord match-run files into data/concord-summary.json.

Reads every ~/concord/runs/match-*.json, computes per-model stats
(matches played, victory rate, survival rate, avg territories held at end),
and writes the aggregate to ai-tracker's data/concord-summary.json.

Re-run after every Concord match batch. Idempotent.

Usage: python3 scripts/aggregate-concord-scores.py
"""

from __future__ import annotations

import glob
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONCORD_RUNS = Path.home() / "concord" / "runs"
OUT_PATH = ROOT / "data" / "concord-summary.json"

# Map Concord-engine model identifiers to ai-tracker model IDs (entity ids).
# When the engine uses a slightly different name (e.g., "claude-haiku-4-5-20251001"
# vs the tracker's "anthropic__claude-haiku-4-5"), this is where we reconcile.
MODEL_MAP: dict[str, str | None] = {
    "claude-opus-4-7": "anthropic__claude-opus-4-7",
    "claude-sonnet-4-6": "anthropic__claude-sonnet-4-6",
    "claude-haiku-4-5": "anthropic__claude-haiku-4-5",
    "claude-haiku-4-5-20251001": "anthropic__claude-haiku-4-5",
    "gpt-4o": None,
    "gpt-4o-mini": None,
    "gpt-5.4": "openai__gpt-5.4",
    "gpt-5.5": "openai__gpt-5.5",
    "grok-3-latest": "xai__grok-3",
    "grok-3": "xai__grok-3",
    "grok-4.20": "xai__grok-4.20",
    "deepseek-chat": None,
    "deepseek-v4-pro": "deepseek__deepseek-v4-pro",
    "deepseek-r1": "deepseek__deepseek-r1",
    "mistral-large-latest": "mistral__mistral-large-2512",
    "mistral-large-2411": "mistral__mistral-large-2512",
    "meta-llama/llama-3.3-70b-instruct": "meta__llama-3.3-70b-instruct",
    "llama-3.3-70b-instruct": "meta__llama-3.3-70b-instruct",
}


def main() -> None:
    if not CONCORD_RUNS.exists():
        print(f"err: {CONCORD_RUNS} not found", file=sys.stderr)
        sys.exit(1)

    stats: dict[str, dict] = defaultdict(
        lambda: {
            "matches_played": 0,
            "victories_achieved": 0,
            "survived_to_end": 0,
            "total_territories_held_at_end": 0,
            "as_each_house": defaultdict(int),
        }
    )

    runs = sorted(glob.glob(str(CONCORD_RUNS / "match-*.json")))
    if not runs:
        print(f"warn: no match-*.json in {CONCORD_RUNS}", file=sys.stderr)

    latest_run = None
    last_rule_version = "unknown"
    for path in runs:
        with open(path) as f:
            run = json.load(f)
        if not latest_run or run["started_at"] > latest_run:
            latest_run = run["started_at"]
        last_rule_version = run.get("rule_version", "unknown")
        final = run.get("final_results") or {}
        final_state = run.get("final_state") or {}
        controllers = final_state.get("controllers", {})

        for house_name, house_info in run["houses"].items():
            concord_model = house_info["model"].replace("openrouter/", "")
            s = stats[concord_model]
            s["matches_played"] += 1
            s["as_each_house"][house_name] += 1
            end_terrs = sum(1 for owner in controllers.values() if owner == house_name)
            s["total_territories_held_at_end"] += end_terrs
            if end_terrs > 0:
                s["survived_to_end"] += 1
            house_final = final.get(house_name) or {}
            if house_final.get("won") is True:
                s["victories_achieved"] += 1

    summary = {
        "kind": "concord-summary",
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "matches_total": len(runs),
        "latest_match_started_at": latest_run,
        "rule_version": last_rule_version,
        "source_engine": "Zerg internal Concord engine (methodology summarized on /concord)",
        "models": [],
    }

    for concord_model, s in sorted(stats.items(), key=lambda kv: -kv[1]["matches_played"]):
        tracker_id = MODEL_MAP.get(concord_model)
        n = s["matches_played"]
        summary["models"].append(
            {
                "concord_model_id": concord_model,
                "tracker_model_id": tracker_id,
                "matches_played": n,
                "victories_achieved": s["victories_achieved"],
                "victory_rate": round(s["victories_achieved"] / n, 4) if n else 0,
                "survival_rate": round(s["survived_to_end"] / n, 4) if n else 0,
                "avg_territories_at_end": round(s["total_territories_held_at_end"] / n, 3) if n else 0,
                "houses_played": dict(s["as_each_house"]),
            }
        )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(summary, f, indent=2)
        f.write("\n")
    print(f"wrote {OUT_PATH}: {len(summary['models'])} models, {summary['matches_total']} matches")


if __name__ == "__main__":
    main()
