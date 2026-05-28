# Submitting to ai-tracker

ai-tracker tracks AI models, AI tools, developer repos, and events that happen to them (releases, price changes, deprecations, etc.). Found something we missed? Two paths.

## Path 1: The /submit form (Phase 4)

[ai-tracker-dxu.pages.dev/submit](https://ai-tracker-dxu.pages.dev/submit) accepts new models, new tools, new repos, and events on existing entities. The form previews the JSON payload as you type.

When the live submission API is up:
1. Pick the kind (event / new model / new tool / new repo)
2. Fill the fields — entity, type, date, summary, source
3. Solve the Turnstile challenge (when wired)
4. Submit. The API hashes your IP for rate limiting (5/day), runs an LLM moderator (Anthropic Haiku, confidence ≥0.4 → queued, < 0.4 → dropped), and pushes a commit to the rolling [`submissions/queue`](#queue) PR.

## Path 2: GitHub issue (works today)

Until the API ships, the form pre-fills a GitHub issue when `PUBLIC_GITHUB_ISSUES_URL` is configured. If no public repo URL is configured yet, it gives you copyable JSON for manual review. Same end-state — your submission lands in the queue for review.

Once the public remote exists, you can also open a submission issue directly with the GitHub issue template. Paste JSON like this into the template body:

```json
{
  "kind": "event",
  "source": "https://www.anthropic.com/news/...",
  "event": {
    "entity": "anthropic__claude-opus-4-7",
    "type": "price_change",
    "date": "2026-05-11",
    "summary": "Input price dropped from $5/M to $3/M.",
    "delta": { "field": "pricing.input_per_mtok", "from": 5, "to": 3 }
  }
}
```

Event types: `released`, `price_change`, `deprecated`, `capability_added`, `benchmark_update`, `license_change`, `model_swap`, `shut_down`, `rebrand`, `acquired`.

For repo submissions, use a public GitHub URL and the `owner/name` full name:

```json
{
  "kind": "repo",
  "source": "https://github.com/browser-use/browser-use",
  "entity": {
    "kind": "repo",
    "full_name": "browser-use/browser-use",
    "category": "browser-automation",
    "repo_url": "https://github.com/browser-use/browser-use",
    "notes": "Browser automation agent framework with active public releases."
  }
}
```

## What goes in a good submission

- **Source URL must be authoritative.** Provider docs, official blog/news posts, official API reference. Aggregators (OpenRouter, HuggingFace) are accepted but downweighted.
- **Date must be the change date**, not today's date.
- **Repo submissions need a public GitHub repo URL** and a short reason it belongs in an AI tracker.
- **Summary ≤ 280 characters.** Lead with the fact, not the framing.
- **Delta is optional but recommended for price/license/capability changes.** Format: `{ field: "pricing.input_per_mtok", from: 5, to: 3 }`.

## How submissions get reviewed

Submissions land in a long-lived rolling PR (`submissions/queue`). Maintainers do bulk approvals via squash-merge — one merge clears the batch.

A watchdog cron pings the maintainer Slack DM at 24h / 48h / 7d of unreviewed time, so nothing rots.

## Anti-spam

- Turnstile challenge on `/submit` (Phase 4)
- IP-hashed rate limit: 5 submissions per day per IP
- Anthropic Haiku moderator filters obvious noise before queuing

## License

Accepted original submission text and project-authored structured metadata are dedicated for unrestricted reuse under [LICENSE-DATA](./LICENSE-DATA). By submitting, you agree your original contribution can be used for any purpose, including AI training and retrieval. Source URLs, provider docs, GitHub metadata, package metadata, and other third-party source material remain under their original terms.

## Getting credit

The optional `contact` email field is used only for follow-up questions. Your name doesn't appear on the entity page (we credit the source URL, not the submitter, to keep the directory canonical).

## Bigger contributions

For new ingestion sources (a new authoritative reader, a new aggregator, a new event-emitting integration), open a regular feature PR.
