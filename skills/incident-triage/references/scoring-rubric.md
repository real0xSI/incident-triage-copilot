# Triage scoring rubric (reference for the incident-triage skill)

The engine in `src/triage.js` scores every incident 0-100 with this rubric.
The score is deterministic: the same issue and the same context always give
the same score, so the panel, the Rovo agent, and the MCP tools agree.

## Score

| Component | Points |
|---|---|
| Base | 10 |
| Severity keywords (critical +35 each, high +20, medium +10; keyword subtotal capped at 70) | up to 70 |
| Blast radius: all users | +25 |
| Blast radius: >= 1000 affected | +20 |
| Blast radius: >= 100 affected | +12 |
| Blast radius: >= 10 affected | +6 |
| Linked issues | +3 each, capped +15 |
| Similar past incidents | +2 each, capped +10 |
| Issue type Incident | +10 |
| Issue type Bug | +5 |
| Label sev1 / p0 | +25 |
| Label sev2 / p1 | +15 |

## Priority mapping

| Score | Priority |
|---|---|
| >= 75 | Highest |
| >= 55 | High |
| >= 35 | Medium |
| >= 15 | Low |
| < 15 | Lowest |

## Confidence (0.25 base, capped 0.95)

- +0.15 similar past incidents found
- +0.15 an owner was found in the graph or history
- +0.10 severity keywords matched
- +0.10 a component is set on the issue
- +0.10 blast radius parsed from the report
- +0.10 description longer than 80 characters

Below 0.50 the draft must be presented as low-confidence with the missing
evidence named.

## Assignee ranking

`resolvedSimilar * 10 - lastTouchedDaysAgo * 0.5 + (onCall ? 15 : 0)`.
Highest rank wins. The ranking is a suggestion only; assignment always
needs a human approval.
