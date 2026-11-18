// Thin Jira REST adapters. Every function takes an `apiClient` with a
// `requestJira(route, options)` method so tests can inject a mock client
// and live code passes `api.asUser()` / `api.asApp()`.
// Product triggers run without a user, so they must use api.asApp().
// Resolvers and Rovo actions run as the user, so they use api.asUser().
//
// @forge/api 8.x REQUIRES request paths to be built with the `route`
// tagged template — plain strings are rejected at runtime ("You must
// create your route using the 'route' export"). `route` URL-encodes
// interpolations that appear after `?` in the template (query params)
// and validates path interpolations. Lazy-required so unit tests can load
// this module without the Forge runtime.
let cachedRoute = null;
function getRoute() {
  if (!cachedRoute) {
    // eslint-disable-next-line global-require
    cachedRoute = require('@forge/api').route;
  }
  return cachedRoute;
}

const { MOCK_ISSUES } = require('./mock-data');

function isMock(client) {
  return !client || client.__mock === true;
}

// Normalize a Jira issue payload to the shape the triage engine expects.
function normalizeIssue(apiIssue) {
  const f = apiIssue.fields || {};
  const text = (adf) => {
    if (!adf) return '';
    if (typeof adf === 'string') return adf;
    // Minimal ADF text extraction: walk paragraphs and text nodes.
    const out = [];
    const walk = (node) => {
      if (!node) return;
      if (node.type === 'text') out.push(node.text || '');
      if (Array.isArray(node.content)) node.content.forEach(walk);
    };
    walk(adf);
    return out.join(' ');
  };
  return {
    id: apiIssue.id || null,
    key: apiIssue.key,
    summary: f.summary || '',
    description: text(f.description),
    issueType: f.issuetype?.name || '',
    labels: f.labels || [],
    components: (f.components || []).map((c) => c.name),
    linkedIssues: (f.issuelinks || []).map((l) => l.outwardIssue?.key || l.inwardIssue?.key).filter(Boolean),
    status: f.status?.name || '',
    priority: f.priority?.name || null,
    assignee: f.assignee ? { accountId: f.assignee.accountId, displayName: f.assignee.displayName } : null,
  };
}

async function getIssue(client, issueKey) {
  if (isMock(client)) {
    const found = MOCK_ISSUES.find((i) => i.key === issueKey);
    if (!found) throw new Error(`mock issue not found: ${issueKey}`);
    return { ...found, linkedIssues: found.linkedIssues || [] };
  }
  const res = await client.requestJira(getRoute()`/rest/api/3/issue/${issueKey}`);
  if (!res.ok) throw new Error(`getIssue ${issueKey} failed: HTTP ${res.status}`);
  return normalizeIssue(await res.json());
}

// Search past issues by JQL. Returns normalized issues (done + open).
async function searchIssues(client, jql, maxResults = 20) {
  if (isMock(client)) {
    return MOCK_ISSUES.filter((i) => i.status === 'Done').map((i) => ({ ...i, linkedIssues: i.linkedIssues || [] }));
  }
  const fields = 'summary,description,issuetype,labels,components,issuelinks,status,priority,assignee';
  const res = await client.requestJira(
    getRoute()`/rest/api/3/search/jql?jql=${jql}&maxResults=${maxResults}&fields=${fields}`,
  );
  if (!res.ok) throw new Error(`searchIssues failed: HTTP ${res.status}`);
  const body = await res.json();
  return (body.issues || []).map(normalizeIssue);
}

function commentAdf(text) {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

async function addComment(client, issueKey, text) {
  if (isMock(client)) return { id: 'mock-comment-1', body: text, mocked: true };
  const res = await client.requestJira(getRoute()`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: commentAdf(text) }),
  });
  if (!res.ok) throw new Error(`addComment ${issueKey} failed: HTTP ${res.status}`);
  return res.json();
}

async function setPriority(client, issueKey, priorityName) {
  if (isMock(client)) return { mocked: true, issueKey, priority: priorityName };
  const res = await client.requestJira(getRoute()`/rest/api/3/issue/${issueKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { priority: { name: priorityName } } }),
  });
  if (!res.ok) throw new Error(`setPriority ${issueKey} failed: HTTP ${res.status}`);
  return { ok: true };
}

async function setAssignee(client, issueKey, accountId) {
  if (isMock(client)) return { mocked: true, issueKey, assignee: accountId };
  const res = await client.requestJira(getRoute()`/rest/api/3/issue/${issueKey}/assignee`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId }),
  });
  if (!res.ok) throw new Error(`setAssignee ${issueKey} failed: HTTP ${res.status}`);
  return { ok: true };
}

module.exports = {
  getIssue,
  searchIssues,
  addComment,
  setPriority,
  setAssignee,
  normalizeIssue,
  commentAdf,
};
