# Incident Triage Copilot — Codegeist 2026

A Forge app for Jira + Jira Service Management. When a new incident is created,
the app drafts a triage — what broke, the likely cause, blast radius — and
suggests a priority and an owner. **A human always approves before anything is
applied.** Nothing is ever auto-assigned, auto-prioritised, or auto-commented.

- **Hackathon:** Codegeist 2026 — *Build with Context, Ship with Confidence*
- **Category:** Apps for Software Teams (JSM-flavoured)
- **Bonus tracks:** Best Rovo Agents · Best Atlassian MCP · Best Teamwork Graph integration
- **Devpost:** https://devpost.com/software/incident-triage-copilot
- **Demo video:** https://www.youtube.com/watch?v=Tj53Ny5_bDQ (public, 1:48)
- **App ID:** `ari:cloud:ecosystem::app/ff8f7ca2-ffc6-498c-b6d8-d0f4083fcf0b`
- **Status:** deployed + installed — production v2.0.0, development v2.2.0
- **Tests:** 77/77 pass (`npm test`)

## Install

Install on a Jira + Confluence test site from the sharing link
(distribution "Sharing with anyone"):

https://developer.atlassian.com/console/install/ff8f7ca2-ffc6-498c-b6d8-d0f4083fcf0b?signature=AYABeN3E%2BwM9m%2FWWkCkzG7y21dYAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBBliUfXdZJ%2F%2B9hz1OVsc5kQAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDLd5DejrdEJKxHA3zAIBEIA7JgOEnFK0caP%2FO4cko5uVuzHPsDcAPgbi%2Bm2HE7PoJJ3azN2t5D47NYIzNLhdK7gFHiNxkB0pbo9rxmQAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgEfqk1wpCv%2BdSTxthb3TNbwAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMzw86NyDeT26NeooHAgEQgDtgL4tI0M3Xas4nVRPNz6N%2BNy2thuNPqYLPeWOS%2FYoBsW6BXrUpywhHbg49vX5F8oXX7w8OzMW7pHeZqAAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAVX0cgjILXCrAezlcLtDkgYAAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAy%2FDvaPn8Tskm%2B9smwCARCAO33RqeczbRulSEaNpsU1sRy6Xc6eBnKSBdx76HD%2F5NjmuhJfSs5uQ3YMYkguYVhCFq13xTxn7d33Fy0sAgAAAAAMAAAQAAAAAAAAAAAAAAAAAOSr1v65Kx2JWBdwzM9hGlb%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADJ40S2M0OgxHfLY%2Fi2wIK0JCnvr%2FuMWE9f2pS%2FPY6ELaoa23g9xDsmDeiJKcfz4QzaVH8IfSjBltNDAxwDfIwfDDlg%3D&product=jira&product=confluence

The app asks for `read:jira-work`, `write:jira-work`,
`read:servicedesk-request`, `read:graph:*`, `storage:app`.

## How it works

```
issue created ──▶ trigger (avi:jira:created:issue, runs as the app)
                      │ computes triage, stores draft in Forge KVS
                      ▼
issue panel ──▶ UI Kit 2 panel shows draft, confidence, evidence,
                suggested priority + owner, Approve / Refresh buttons
                      │ human clicks Approve
                      ▼
resolver ────▶ apply-triage: posts the comment, sets priority,
                sets assignee (only with confirm === true)

Rovo agent ──▶ same engine via 4 actions + 1 skill, conversationally
MCP server ──▶ rovo:mcp exposes only the 3 read-only GET tools
```

## Triage engine (deterministic, no LLM key needed)

`src/triage.js` is pure JavaScript with no Forge imports:

- **Score 0–100** → priority: ≥75 Highest, ≥55 High, ≥35 Medium, ≥15 Low,
  else Lowest. Signals: severity keywords (critical +35, high +20…),
  blast radius (all-users +25, ≥1000 affected +20…), linked issues,
  similar past incidents, issue type, sev1/p0 labels.
- **Confidence 0.25–0.95** from how much evidence exists.
- **Similar incidents** by Jaccard similarity over stopword-filtered tokens
  (threshold 0.12), ranked; the top match's fix is quoted as the likely cause.
- **Owner ranking**: `resolvedSimilar × 10 − daysSinceLastTouch × 0.5 +
  (onCall ? 15 : 0)`.

## Rovo agent + MCP tools

The Rovo agent **Triage Copilot** ships with 3 conversation starters
("Triage the newest incident", "Who should own this incident?",
"Find incidents like this one"), 4 actions and the `incident-triage` skill:

| Tool / action | Verb | What it does |
| --- | --- | --- |
| `triage-incident` | GET | Runs the triage engine on an issue, returns draft + priority + confidence + evidence. Read-only. |
| `find-similar-incidents` | GET | Past incidents similar to the given issue, ranked with their resolutions. Read-only. |
| `suggest-assignee` | GET | Who should own the incident, ranked by past fixes and graph context. A suggestion only; never assigns. |
| `apply-triage` | UPDATE | Posts the approved triage comment, sets priority and assignee. Requires `confirm === true`; **not** exposed via MCP. |

## Teamwork Graph

`src/graph.js` builds persisted Cypher queries executed through the GraphQL
`customQuery` field with a saved `queryKey` (raw `cypherQuery` at request
time is refused for new apps). Three queries: `triage-user-teams`
(`2588d3e3-2cf6-4504-bfdc-848b17540950`), `triage-issue-owners`
(`c810756f-719b-4124-b0bd-102304366881`), `triage-similar-issues`
(`19948a9f-6ffc-4edf-814a-c4f4a9e658a7`). The live schema was downloaded
from the demo site (node label is `JiraWorkItem`, not `JiraIssue`).
When the graph returns nothing, the app falls back to Jira history —
it never fails the triage.

## Try it (mock mode, no Atlassian account needed)

```bash
npm install
npm test            # 77 tests, exit 0
node -e "
const a = require('./src/actions.js');
a.triageIncident({ issueKey: 'SUP-101', useMock: true }).then(r => {
  console.log(r.triage.priority, '| score', r.triage.score, '| confidence', r.triage.confidence);
  console.log(r.draft);
});"
# → Highest | score 100 | confidence 0.95, with a full draft
```

## Test it on a live site

1. Install from the installation link above on a Jira + Confluence test site.
2. Create an incident in any project (e.g. "Checkout is down, payments
   failing for all users").
3. Open the issue — the **Triage Copilot** panel shows the draft.
4. Click **Approve & apply triage**.
5. In Rovo chat, ask "Triage the newest incident".

## Deploy your own copy

Needs a free Atlassian Cloud Developer License
(https://go.atlassian.com/cloud-dev) and the Forge CLI.

```bash
npm install
export FORGE_EMAIL='you@example.com'      # your Atlassian account email
export FORGE_API_TOKEN='paste-the-token'  # create at id.atlassian.com/manage-profile/security/api-tokens — never commit this
./node_modules/.bin/forge login
./node_modules/.bin/forge register        # replace the app id in manifest.yml with the id forge prints
./node_modules/.bin/forge lint
./node_modules/.bin/forge deploy -e development
./node_modules/.bin/forge install -e development   # pick your Jira site, repeat for Confluence
```

The Teamwork Graph queries in `src/graph.js` are wired to the demo site's
persisted queries. On your own site, register your own persisted queries in
TWG Labs and replace the `queryKey` values, or rely on the Jira-history
fallback (the app works without the graph).

## Honest limits (read before judging)

- **Issue panel — verified live.** On the demo site (`realoxsi.atlassian.net`),
  2026-11-18, the panel on SUP-3 ("Checkout page returns 500 for all users")
  showed the draft (score 95/100, confidence 55%), and **Approve & apply
  triage** was clicked live: the summary was posted as a comment and the
  priority was confirmed Highest.
- **Rovo Chat — NOT provisioned on the demo site.** Rovo Chat returns a 404
  on `realoxsi.atlassian.net`, the admin panel shows no Rovo agents, and no
  Rovo conversation was ever run there. The agent, its 4 actions, its skill
  and its conversation starters are declared in `manifest.yml` and ship with
  the app — but they were **not demonstrated live** on this site.
- **MCP exposure — Disabled on the demo site.** The site admin shows the
  app's MCP tools section as "Expose tools to MCP-compatible apps
  [Disabled]". The `rovo:mcp` server with its 3 read-only tools is declared
  in the manifest, but it is **not exposed/enabled** there, and no live MCP
  tool listing exists. The demo video's agent/MCP segment is a designed card
  built from the manifest facts only — not a screenshot, and the narration
  says the app "ships with" them.
- **Demo video frames.** The applied-panel frame in the video is a staged
  recreation: every word is verbatim from the live panel verified 2026-11-18,
  only the layout is staged, and the frame is labelled as such.
- **Similar-issues graph query** has no live caller yet — similar incidents
  still come from Jira JQL + text similarity.
- **No external server, no secrets in code.** The triage engine is
  deterministic and runs entirely inside Forge; data stays in Forge KVS.

## Safety rules baked in

- The trigger **never** writes to the issue — draft only.
- `apply-triage` refuses unless `confirm === true`, priority is valid, and
  the comment is non-empty. Rovo asks the user to confirm UPDATE actions.
- `apply-triage` is **not** exposed via MCP (read-only tools only).
- The agent prompt forbids inventing owners/causes and flags confidence < 50%.

## Files

| File | What it is |
| --- | --- |
| `manifest.yml` | Modules, scopes, resources, runtime nodejs24.x |
| `src/triage.js` | Pure triage engine (score, priority, confidence, similarity, ranking) |
| `src/actions.js` | Rovo action + MCP handlers (one engine, all surfaces) |
| `src/trigger.js` | Issue-created trigger, runs as the app, stores the draft |
| `src/resolvers.js` | UI Kit resolver: getTriage / refreshTriage / approveTriage |
| `src/graph.js` | Teamwork Graph query builders + parsers + history fallback |
| `src/jira.js` | Thin Jira REST adapters (injectable client) |
| `src/mock-data.js` | 12 fictional incidents, 4 owners, 2 Confluence pages |
| `src/frontend/index.jsx` | UI Kit 2 issue panel |
| `prompts/agent-prompt.md` | Rovo agent instructions |
| `skills/incident-triage/` | `rovo:skill` (SKILL.md + scoring rubric) |
| `privacy.html` | Privacy policy (also live at https://privacy.richcommunity.dpdns.org/) |
| `test/` | 77 unit tests, `node --test` |

## License

MIT — see [LICENSE](LICENSE). Built by RichCommunity Studio for
Codegeist 2026.
