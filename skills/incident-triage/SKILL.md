---
name: incident-triage
description: "Triage a Jira incident with evidence: run the deterministic triage engine, find similar past incidents, suggest an owner from Teamwork Graph and Jira history, and draft a triage summary for a human to approve. Use when a user reports a new incident, asks what broke, who should own it, or what the priority should be."
allowed-tools: triage-incident find-similar-incidents suggest-assignee
---

# Incident triage

Triage a Jira incident in four steps. Never skip step 4: a human approves
every triage before anything is applied.

## 1. Triage the incident

Call `triage-incident` with the issue key. It returns a draft summary, a
suggested priority, a confidence score (0-1), and the reasons behind the
score. The scoring rubric is in `references/scoring-rubric.md`.

## 2. Find similar past incidents

Call `find-similar-incidents` with the same issue key. Similar incidents are
ranked by text similarity (Jaccard >= 0.12). Quote the most similar one's
resolution as the likely cause — and label it as a hypothesis, not a fact.

## 3. Suggest an owner

Call `suggest-assignee` with the issue key. Owners are ranked by who resolved
similar incidents, who last touched the related service or component in the
Teamwork Graph, and who is on call. Present the top suggestion with its
reason. If the graph returned nothing, say so and use the Jira-history
fallback instead of inventing an owner.

## 4. Present the draft and wait

Show the user: what broke, the suggested priority with confidence, the
evidence (similar incidents, owner reasons), and the draft text. Ask what to
change. Do NOT apply anything yet.

Only when the user explicitly approves, the applying step uses the
`apply-triage` action (UPDATE verb, `confirm` must be true) with the approved
priority, assignee, and comment text. Never set `confirm` yourself without
an explicit approval in the conversation.

## Edge cases

- Confidence below 0.50: say the triage is low-confidence and name the
  missing evidence (no similar incidents, no owner found, vague report).
- No similar incidents: say it is a new failure mode; do not force a match.
- Missing or vague blast radius: ask the user to confirm how many users are
  affected instead of guessing.
- The user disagrees with the priority: accept their priority, note the
  engine's reasons for the record, and move on.
