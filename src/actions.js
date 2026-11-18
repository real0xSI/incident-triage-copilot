// Rovo action + MCP tool handlers. One engine serves all three surfaces
// (issue panel, Rovo agent, MCP server) so behaviour is identical everywhere.
//
// Action verbs (manifest): triage-incident GET, find-similar-incidents GET,
// suggest-assignee GET, apply-triage UPDATE (Rovo asks the user to confirm
// before running an UPDATE action).
// MCP exposes only the three GET tools; apply-triage stays human-gated
// through the panel and the Rovo agent.

const triage = require('./triage');
const jira = require('./jira');
const graph = require('./graph');
const { MOCK_ISSUES, MOCK_GRAPH_OWNERS } = require('./mock-data');

function mockClient() {
  return { __mock: true };
}

function useMock(payload) {
  return payload && (payload.useMock === true || process.env.TRIAGE_MOCK === '1');
}

// Build the full context for one issue: Jira issue + similar past issues +
// graph owners (with Jira-history fallback when the graph is empty).
// issueKeyOrId accepts a key (SUP-101) or a numeric id from the panel
// extension context; the Jira API accepts both, and the fetched issue's
// canonical key drives the project filter below.
async function buildContext(client, issueKeyOrId) {
  const issue = await jira.getIssue(client, issueKeyOrId);
  const projectKey = (issue.key || String(issueKeyOrId)).split('-')[0];
  const past = await jira.searchIssues(client, `project = ${projectKey} AND statusCategory = Done ORDER BY updated DESC`, 20);
  const similar = triage.findSimilarIncidents(issue, past, 5);

  let owners = [];
  let graphNote = null;
  if (isMockClient(client)) {
    owners = MOCK_GRAPH_OWNERS.slice();
  } else if (typeof client.requestTeamworkGraph !== 'function') {
    // TWG is user-scoped: api.asApp() has no requestTeamworkGraph method.
    // The creation trigger runs as the app, so it skips the graph here and
    // the panel recompute (which runs as the user) queries it instead.
    // This guard is the fix for the panel's "client.requestTeamworkGraph
    // is not a function" note on trigger-stored drafts.
    graphNote = 'Teamwork Graph runs as the user; the creation trigger runs as the app, so graph owners were skipped here — open the panel to recompute with the graph.';
  } else {
    try {
      const issueAri = graph.buildIssueAri(graph.getCloudId(), issue.id);
      if (!issueAri) throw new Error('could not determine the issue ARI for this site');
      const q = graph.buildCustomQuery(graph.QUERY_KEYS.issueOwners, { issueAri });
      const res = await client.requestTeamworkGraph(q.query, q.variables);
      const parsed = graph.parseGraphOwners(await res.json());
      owners = parsed.owners;
      graphNote = parsed.reason;
    } catch (e) {
      graphNote = `Teamwork Graph unavailable: ${e.message}`;
    }
  }
  if (owners.length === 0) {
    owners = graph.ownersFromHistory(similar);
    if (!graphNote) graphNote = 'Teamwork Graph returned no owners; fell back to Jira history.';
  }
  return { issue, similar, owners, graphNote };
}

function isMockClient(client) {
  return !client || client.__mock === true;
}

function getClient(payload, clientOverride) {
  if (clientOverride) return clientOverride;
  if (useMock(payload)) return mockClient();
  // Lazy-require @forge/api so unit tests can load this module without Forge.
  // eslint-disable-next-line global-require
  const api = require('@forge/api');
  return api.asUser();
}

async function triageIncident(payload, clientOverride) {
  const issueKey = payload?.issueKey || payload?.issueId;
  if (!issueKey) throw new Error('issueKey is required');
  const client = getClient(payload, clientOverride);
  const { issue, similar, owners, graphNote } = await buildContext(client, issueKey);
  const result = triage.triageIssue(issue, { similarIssues: similar, graphOwners: owners });
  const ranked = triage.rankAssignees(owners);
  const draft = triage.buildTriageDraft(issue, result, similar, ranked);
  return {
    issueKey: issue.key || issueKey,
    summary: issue.summary,
    triage: result,
    draft,
    similarIncidents: similar.map((s) => ({ key: s.key, summary: s.summary, similarity: s.similarity, resolution: s.resolution || null })),
    suggestedAssignees: ranked.slice(0, 3),
    graphNote,
    mockMode: isMockClient(client),
  };
}

async function findSimilarIncidents(payload, clientOverride) {
  const issueKey = payload?.issueKey || payload?.issueId;
  if (!issueKey) throw new Error('issueKey is required');
  const client = getClient(payload, clientOverride);
  const { issue, similar } = await buildContext(client, issueKey);
  return {
    issueKey: issue.key || issueKey,
    similarIncidents: similar.slice(0, payload?.limit || 5).map((s) => ({
      key: s.key,
      summary: s.summary,
      similarity: s.similarity,
      status: s.status,
      resolution: s.resolution || null,
      assignee: s.assignee || null,
    })),
    mockMode: isMockClient(client),
  };
}

async function suggestAssignee(payload, clientOverride) {
  const issueKey = payload?.issueKey || payload?.issueId;
  if (!issueKey) throw new Error('issueKey is required');
  const client = getClient(payload, clientOverride);
  const { issue, similar, owners, graphNote } = await buildContext(client, issueKey);
  const ranked = triage.rankAssignees(owners);
  return {
    issueKey: issue.key || issueKey,
    suggestedAssignees: ranked.slice(0, 3),
    graphNote,
    mockMode: isMockClient(client),
  };
}

async function applyTriage(payload) {
  const errors = triage.validateApplyTriage(payload);
  if (errors.length > 0) throw new Error(`apply-triage refused: ${errors.join('; ')}`);
  const client = getClient(payload);
  const comment = await jira.addComment(client, payload.issueKey, payload.commentBody);
  let priorityResult = null;
  let assigneeResult = null;
  if (payload.priority) priorityResult = await jira.setPriority(client, payload.issueKey, payload.priority);
  if (payload.assigneeAccountId) assigneeResult = await jira.setAssignee(client, payload.issueKey, payload.assigneeAccountId);
  return {
    issueKey: payload.issueKey,
    applied: true,
    commentId: comment.id || null,
    prioritySet: priorityResult ? payload.priority : null,
    assigneeSet: assigneeResult ? payload.assigneeAccountId : null,
    mockMode: isMockClient(client),
  };
}

module.exports = { triageIncident, findSimilarIncidents, suggestAssignee, applyTriage, buildContext, mockClient, MOCK_ISSUES };
