# Handoff

## Next

Resume Batch B of the post-Group-N fresh review pass on `jie-platform`. Batch A is fully closed; Batch B (gaps 5, 6) is the next two items; Batches C and D follow.

Concretely, in order:

1. **Item 5** — `-p` mode wait condition. Recommendation presented and waiting on your call: "all agents idle" (not just leader). Two sub-questions open: confirm the rule, and confirm the timeout interaction (`--timeout` is the upper bound on the wait, on expiry → stop+exit 3). Edits land in `ui/cli.md` step 7-8 once you confirm.

2. **Item 6** — `-p` mode leader filter. `ui/cli.md:61` currently says `agent_role === leader`; the leader's role is whatever `TEAM.md` declares (e.g. `manager` in scenario 2). The CLI resolves the team → reads `TEAM.md` → uses the actual leader role name in the filter. Edits land in `ui/cli.md` step 4 + step 5 (passes the resolved leader role through the flow).

3. **Item 7** — `compact()` vs `persist()` for `compactionSummary`. Spec says compact() persists the summary; persist() also writes all message_ends. Pick one writer (lean: persist() owns the row; compact() only updates `compacted=1` flags). Edits in `08-memory.md`.

4. **Item 8** — `subscriberCount` vs self-receipt. `notify`'s `recipients = subscriberCount(topic)` includes the publisher if subscribed; self-receipt is filtered, so the LLM sees "1 recipient" with 0 actual deliveries. Pick: subtract self from the count in `notify` (it's the LLM-facing view; the bus-level count is unchanged), or report the registered count and document the divergence. Lean: subtract self — the LLM-facing number is the LLM-facing number, not the bus-level number.

5. **Item 9** — `compact()` transactionality. Two writes (insert summary, update raw range) without `transaction()` wrap. Fix: wrap in `storage.transaction(fn)`. One-line edit in the body of `compact()` (storage-layer concern); spec text in `08-memory.md`.

6. **Item 10** — `--continue` "most recent" definition. Spec says "highest `created_at`" but each row has its own `created_at`. Pick: per-session `MAX(created_at)` across the session's rows, then sort sessions by that. Or `MIN(created_at)` of the first row. Lean: `MAX(created_at)` (the most recently active session).

7. **Smaller items** (Batch D): `artifact.list` LIKE wildcard escape, `agent.queue.update` payload format vs body queue format, `web_fetch` HTML stripping with no extra deps. Flag and discuss.

After Batch B-D close, **run the implementation plan** (the Group M "Resume Plan" 13 steps in `review-tracker.md` "Resume Plan" section), with two amendments already in the tracker: Batches A-D touch-ups land first, and `--api-key` is now part of the CLI test surface.

## Your role

Developer implementing `jie-platform` based on specs. Continue the same review style:

- For each gap, present: the exact contradictory text (with line refs), my analysis with options, my recommendation, and 1-3 sub-questions for you to confirm.
- Apply edits after your "okay" / "confirmed" / etc.
- Mark the gap closed in `review-tracker.md` (move it from "Open" to a strikethrough entry in the same batch section, with edit summary + ADR pointer if any).
- Write an ADR for the decision only when it's architecturally significant (format change, dep-set change, package-boundary change, semantic-shift-in-protocol). Most spec corrections don't need one — capture the rationale inline.

The two state files that own the work are `review-tracker.md` (working list) and `addrs/` (decisions). Don't accumulate history in the tracker; compact resolved entries to one-liners and let `addrs/` carry the detail.

Then run the resume plan and exercise user scenarios 4 + 6 against the running platform (per the existing test plan).

## State at handoff

- `review-tracker.md` reflects Batch A closed; items 5-10 still open across Batches B/C/D; smaller Batch D items still listed.
- Specs edited: `06-agent-model.md`, `08-memory.md`, `09-deployment.md`, `10-configuration.md`, `ui/cli.md`, `00-user-scenarios.md`, `monorepo-structure.md`, `backlog.md` (item 21 added).
- ADRs written: `18-role-identifier-is-filename-stem.md`. No other new ADRs in this pass (Gaps 1, 2, 3 were spec corrections / small dep additions captured inline).
- `addrs/1-prompt-in-publish-out.md` Decision §18 updated to defer to ADR 9.
- No code changes yet — pure spec/design pass. The Group M "Resume Plan" 13-step implementation plan is still the working draft for after the review closes.
