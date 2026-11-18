// Unit tests for Jira REST adapters (src/jira.js), live-client path.
// @forge/api 8.x rejects plain-string request paths: requestJira must
// receive a `route` object (see forge-fetch-route). These tests prove the
// live path passes a Route, not a string, using a fake non-mock client.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jira = require('../src/jira');

// A Route is an object with a read-only string `value` (ReadonlyRoute in
// @forge/api). `Route`/`isRoute` are type-only exports, so the check is
// structural: an object with a string value — never a plain string path,
// which @forge/api 8.x rejects at runtime.
const isRouteObj = (x) => x !== null && typeof x === 'object' && typeof x.value === 'string';

function fakeClient(responder) {
  const calls = [];
  return {
    calls,
    async requestJira(routeArg, options) {
      calls.push({ routeArg, options });
      return responder(routeArg, options);
    },
  };
}

function okJson(body) {
  return { ok: true, json: async () => body };
}

describe('getIssue (live client)', () => {
  it('calls requestJira with a Route object for the issue path', async () => {
    const client = fakeClient(() => okJson({
      key: 'SUP-1',
      fields: {
        summary: 'Checkout is down',
        description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'payments failing' }] }] },
        issuetype: { name: 'Task' },
        labels: [],
        components: [],
        issuelinks: [],
        status: { name: 'To Do' },
        priority: null,
        assignee: null,
      },
    }));
    const issue = await jira.getIssue(client, 'SUP-1');
    assert.equal(issue.key, 'SUP-1');
    assert.equal(issue.summary, 'Checkout is down');
    assert.equal(client.calls.length, 1);
    assert.ok(isRouteObj(client.calls[0].routeArg), 'requestJira must receive a Route, not a string');
    assert.equal(client.calls[0].routeArg.value, '/rest/api/3/issue/SUP-1');
  });

  it('throws on a non-OK response', async () => {
    const client = fakeClient(() => ({ ok: false, status: 404 }));
    await assert.rejects(() => jira.getIssue(client, 'SUP-404'), /HTTP 404/);
  });
});

describe('searchIssues (live client)', () => {
  it('calls requestJira with a Route whose query params are encoded', async () => {
    const client = fakeClient(() => okJson({ issues: [] }));
    const found = await jira.searchIssues(client, 'project = SUP AND statusCategory = Done', 20);
    assert.deepEqual(found, []);
    assert.equal(client.calls.length, 1);
    assert.ok(isRouteObj(client.calls[0].routeArg), 'requestJira must receive a Route, not a string');
    const value = client.calls[0].routeArg.value;
    assert.ok(value.startsWith('/rest/api/3/search/jql?jql='), value);
    assert.ok(value.includes('project%20%3D%20SUP'), `JQL must be URL-encoded: ${value}`);
    assert.ok(value.includes('maxResults=20'), value);
  });
});

describe('addComment/setPriority/setAssignee (live client)', () => {
  it('pass Route objects with the right method and path', async () => {
    const client = fakeClient(() => okJson({ id: '10001' }));
    await jira.addComment(client, 'SUP-1', 'triage draft');
    await jira.setPriority(client, 'SUP-1', 'Highest');
    await jira.setAssignee(client, 'SUP-1', '712020:abc');
    assert.equal(client.calls.length, 3);
    for (const call of client.calls) {
      assert.ok(isRouteObj(call.routeArg), 'requestJira must receive a Route, not a string');
    }
    assert.equal(client.calls[0].routeArg.value, '/rest/api/3/issue/SUP-1/comment');
    assert.equal(client.calls[0].options.method, 'POST');
    assert.equal(client.calls[1].routeArg.value, '/rest/api/3/issue/SUP-1');
    assert.equal(client.calls[1].options.method, 'PUT');
    assert.equal(client.calls[2].routeArg.value, '/rest/api/3/issue/SUP-1/assignee');
    assert.equal(client.calls[2].options.method, 'PUT');
  });
});
