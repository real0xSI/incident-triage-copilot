// Teamwork Graph access for Incident Triage Copilot.
//
// What the live docs say (verified 2026-11-14, developer.atlassian.com):
// - The Teamwork Graph API is in Preview (since 15 Oct 2026). New apps use
//   curated GraphQL queries or persisted Cypher queries; raw `cypherQuery`
//   sent at request time is refused for new apps.
// - A persisted query is registered ahead of time and executed at runtime
//   through the GraphQL `customQuery` root field with its `queryKey`.
// - Scopes are per object type: read:graph:issue:jira,
//   read:graph:user:atlassian, read:graph:team:atlassian,
//   read:graph:page:confluence. Missing or disabled scopes do NOT error:
//   queries succeed but omit unreadable data (results come back empty).
// - Curated queries return at most 25 rows per page.
// - The full schema is downloadable from
//   https://<site>.atlassian.net/gateway/api/graphql/twg/schema
// - Backend call: api.asUser().requestTeamworkGraph(graphql, variables)
//   (package @forge/api). TWG is USER-scoped by design: api.asApp() has
//   NO requestTeamworkGraph method at all, so callers must guard on
//   `typeof client.requestTeamworkGraph === 'function'` and skip the graph
//   (with a clear note) when running as the app — e.g. the creation
//   trigger, which runs with no user. Calling it unguarded on an asApp
//   client is what produced the panel's "client.requestTeamworkGraph is
//   not a function" note on the trigger-stored SUP-2 draft.
//   Frontend call: requestTeamworkGraph from @forge/bridge (Preview
//   since 11 Nov 2026) — not used here; the panel goes through resolvers.
//
// RESOLVED 2026-11-16 against the live schema downloaded from
// https://realoxsi.atlassian.net/gateway/api/graphql/twg/schema:
// - Node labels are JiraWorkItem (not JiraIssue) and AtlassianUser /
//   AtlassianTeam, matching the tutorial's Cypher examples.
// - There is NO issue-to-component relationship in the live schema at
//   all, so "same component" is expressed as "same Jira space" via
//   jira_space_has_jira_work_item (verified in the docs' Scopes page).
// - issue owners = assignee + reporter, via the curated relationships
//   atlassian_user_assigned_jira_work_item and
//   atlassian_user_reported_jira_work_item (both in the live schema).
// - The registered queries match issues by ARI ($issueAri), NOT by key:
//   the live schema exposes no `key` (or `summary`) on JiraWorkItem, and
//   the TWG Labs registration of the key-based drafts was rejected for
//   exactly that reason. Callers build the ARI with buildIssueAri from
//   the site cloud ID (getCloudId) + the numeric Jira issue id.
// - customQuery takes queryParams (CypherRequestParams), NOT `variables`,
//   and returns a CypherQueryConnection (edges/node/columns) — see
//   buildCustomQuery / parseGraphOwners.
// The app still never depends on the graph: when TWG returns empty, the
// engine falls back to Jira history (who resolved similar issues), lowers
// confidence, and says so in the draft.

// Registered persisted-query keys (TWG Labs, 2026-11-16). These are the
// queryKey UUIDs returned at registration; the placeholder names they
// replace never existed in TWG Labs.
const QUERY_KEYS = {
  issueOwners: 'c810756f-719b-4124-b0bd-102304366881',
  similarIssues: '19948a9f-6ffc-4edf-814a-c4f4a9e658a7',
  userTeams: '2588d3e3-2cf6-4504-bfdc-848b17540950',
};

// Build a Jira issue ARI for Teamwork Graph matching:
// ari:cloud:jira:<cloudId>:issue/<numeric issue id>. The registered
// issue queries match on the ARI because the live TWG schema exposes no
// `key` field on JiraWorkItem. Returns null when either part is missing.
function buildIssueAri(cloudId, issueId) {
  if (!cloudId || !issueId) return null;
  return `ari:cloud:jira:${cloudId}:issue/${issueId}`;
}

// Read the site cloud ID from the Forge runtime. Primary source:
// getAppContext().installation.contexts[].cloudId; fallback: parse it out
// of the runtime contextAri (ari:cloud:jira:<cloudId>:...). Returns null
// outside a Forge runtime (unit tests) instead of throwing.
function getCloudId() {
  try {
    // eslint-disable-next-line global-require
    const { getAppContext, __getRuntime } = require('@forge/api');
    const ctx = getAppContext();
    const fromInstall = (ctx?.installation?.contexts || []).find((c) => c && c.cloudId);
    if (fromInstall) return fromInstall.cloudId;
    const contextAri = __getRuntime()?.contextAri || '';
    const m = /ari:cloud:jira:([^:/]+)/.exec(contextAri);
    if (m) return m[1];
  } catch (e) {
    // No Forge runtime (plain Node / unit tests): no cloud ID available.
  }
  return null;
}

// Operation names follow the documented rule: company (min 3 chars) +
// operation (min 4 chars), e.g. triage_relatedIssues.
function operationName(op) {
  return `triage_${op}`;
}

// Connectivity check: the `echo` field is the documented minimal query.
function buildEchoQuery(message = 'triage-copilot') {
  return {
    operationName: operationName('echo'),
    query: `query ${operationName('echo')} { echo(myString: "${message}") }`,
    variables: {},
  };
}

// Execute a persisted (registered) query by its queryKey. Field and
// argument names match the LIVE schema (downloaded 2026-11-16):
// customQuery(queryKey: String!, queryParams: CypherRequestParams,
// first: Int): CypherQueryConnection. The selection set reads the
// columns keyed by the RETURN clause names of the registered Cypher.
function buildCustomQuery(queryKey, variables = {}) {
  if (!queryKey || typeof queryKey !== 'string') {
    throw new Error('queryKey is required to execute a persisted Teamwork Graph query');
  }
  const op = operationName('customQuery');
  return {
    operationName: op,
    query:
      `query ${op}($queryKey: String!, $queryParams: CypherRequestParams) { ` +
      'customQuery(queryKey: $queryKey, queryParams: $queryParams, first: 25) { ' +
      'edges { node { columns { key value { __typename ' +
      '... on CypherQueryResultNode { id data { __typename ' +
      '... on AtlassianUser { accountId name email } ' +
      // JiraWorkItem exposes NO `key` or `summary` in the live TWG schema
      // (only ari, assigneeAri, createdAt, createdBy, dueDate,
      // fixVersionIds, isArchived, issueTypeAri, lastUpdated, reporterAri,
      // statusAri, statusCategory) — request real fields only.
      '... on JiraWorkItem { ari statusAri createdAt } ' +
      '... on AtlassianTeam { id displayName } } } } } } } ' +
      'pageInfo { hasNextPage endCursor } } }',
    variables: { queryKey, queryParams: variables },
  };
}

// Cypher definitions to register ahead of time (deploy step: submit each
// query for registration against the app; you must be a contributor).
// All relationship names below are VERIFIED in the live TWG schema
// (downloaded 2026-11-16) and/or Atlassian's own docs examples:
//   atlassian_user_is_in_atlassian_team (official tutorial + schema)
//   atlassian_user_assigned_jira_work_item (docs Scopes page + schema)
//   atlassian_user_reported_jira_work_item (schema)
//   jira_space_has_jira_work_item (docs Scopes page + schema)
// Node labels: JiraWorkItem (not JiraIssue), AtlassianUser, AtlassianTeam,
// JiraSpace — as in the live schema.
function persistedQueryDefinitions() {
  return [
    {
      queryKey: QUERY_KEYS.userTeams,
      description: 'Teams a user belongs to. Relationship verified in the official tutorial.',
      cypher:
        'MATCH (user:AtlassianUser {ari: $userAri})-[:atlassian_user_is_in_atlassian_team]->(team:AtlassianTeam) ' +
        'RETURN team',
    },
    {
      queryKey: QUERY_KEYS.issueOwners,
      description: 'People assigned to or reporting an issue, matched by issue ARI. Relationships verified in the live TWG schema (2026-11-16). The live schema has no `key` on JiraWorkItem, so the registered query matches {ari: $issueAri}.',
      cypher:
        'MATCH (owner:AtlassianUser)-[:atlassian_user_assigned_jira_work_item|atlassian_user_reported_jira_work_item]->(issue:JiraWorkItem {ari: $issueAri}) ' +
        'RETURN owner',
    },
    {
      queryKey: QUERY_KEYS.similarIssues,
      description: 'Past work items in the same Jira space, matched by issue ARI. The live schema has no issue-to-component relationship, so "same component" is expressed as "same space". Relationship verified in the live TWG schema (2026-11-16).',
      cypher:
        'MATCH (issue:JiraWorkItem {ari: $issueAri})<-[:jira_space_has_jira_work_item]-(space:JiraSpace)-[:jira_space_has_jira_work_item]->(past:JiraWorkItem) ' +
        'WHERE past <> issue RETURN past LIMIT 25',
    },
  ];
}

// Defensive parser: TWG omits unreadable data instead of erroring, so any
// shape may come back thin or empty. Returns { owners, empty, reason }.
// Live shape (CypherQueryConnection): data.customQuery.edges[].node.columns[]
// with one column per RETURN clause name ('owner' for the issue-owners
// query); each column value is a CypherQueryResultNode whose `data` is the
// hydrated AtlassianUser (accountId, name, email). A legacy array-of-rows
// shape is still accepted for mocks and older tests.
function parseGraphOwners(response) {
  if (!response || typeof response !== 'object') {
    return { owners: [], empty: true, reason: 'no response from Teamwork Graph' };
  }
  const cq = response?.data?.customQuery;
  let rows = [];
  if (cq && Array.isArray(cq.edges)) {
    rows = cq.edges.flatMap((e) => (e?.node?.columns || [])
      .filter((c) => c?.key === 'owner')
      .map((c) => c?.value?.data)
      .filter(Boolean));
  } else if (Array.isArray(cq)) {
    rows = cq.map((r) => r?.owner ?? r);
  }
  const owners = rows
    .filter((o) => o && (o.accountId || o.ari || o.displayName || o.name))
    .map((o) => ({
      accountId: o.accountId || o.ari || null,
      displayName: o.displayName || o.name || 'Unknown',
      resolvedSimilar: o.resolvedSimilar || 0,
      lastTouchedDaysAgo: o.lastTouchedDaysAgo ?? null,
      onCall: !!o.onCall,
    }));
  return {
    owners,
    empty: owners.length === 0,
    reason: owners.length === 0
      ? 'Teamwork Graph returned no owners (scopes may be ungranted or the data is not in the graph)'
      : null,
  };
}

// Fallback owners from Jira history: who resolved similar issues.
// This is what the engine uses when the graph is empty, so triage still
// works on sites without TWG data.
function ownersFromHistory(similarIssues) {
  const byId = new Map();
  for (const issue of similarIssues || []) {
    const a = issue.assignee;
    if (!a || !a.accountId) continue;
    const entry = byId.get(a.accountId) || {
      accountId: a.accountId,
      displayName: a.displayName || 'Unknown',
      resolvedSimilar: 0,
      lastTouchedDaysAgo: null,
      onCall: false,
      source: 'jira-history',
    };
    entry.resolvedSimilar += 1;
    byId.set(a.accountId, entry);
  }
  return [...byId.values()];
}

module.exports = {
  QUERY_KEYS,
  operationName,
  buildEchoQuery,
  buildCustomQuery,
  buildIssueAri,
  getCloudId,
  persistedQueryDefinitions,
  parseGraphOwners,
  ownersFromHistory,
};
