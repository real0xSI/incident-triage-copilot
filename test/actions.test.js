// End-to-end tests of the Rovo/MCP action handlers in mock mode
// (src/actions.js with useMock:true — no Atlassian site, no Forge runtime).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const actions = require('../src/actions');

describe('triageIncident (mock mode)', () => {
  it('triages SUP-101 Highest with evidence and a draft', async () => {
    const r = await actions.triageIncident({ issueKey: 'SUP-101', useMock: true });
    assert.equal(r.issueKey, 'SUP-101');
    assert.equal(r.triage.priority, 'Highest');
    assert.ok(r.triage.confidence >= 0.5);
    assert.ok(r.draft.includes('SUP-101'));
    assert.ok(r.similarIncidents.some((s) => s.key === 'SUP-98'));
    assert.equal(r.suggestedAssignees[0].displayName, 'Ana');
    assert.equal(r.mockMode, true);
  });

  it('triages a typo Low with no similar incidents', async () => {
    const r = await actions.triageIncident({ issueKey: 'SUP-109', useMock: true });
    assert.equal(r.triage.priority, 'Low');
    assert.equal(r.similarIncidents.length, 0);
  });

  it('throws without an issue key', async () => {
    await assert.rejects(() => actions.triageIncident({ useMock: true }), /issueKey is required/);
  });

  it('throws for an unknown mock issue', async () => {
    await assert.rejects(() => actions.triageIncident({ issueKey: 'SUP-999', useMock: true }), /not found/);
  });

  it('accepts issueId as well as issueKey (panel passes an id)', async () => {
    const r = await actions.triageIncident({ issueId: 'SUP-101', useMock: true });
    assert.equal(r.issueKey, 'SUP-101');
    assert.equal(r.triage.priority, 'Highest');
  });

  it('accepts an injected client override (trigger passes api.asApp())', async () => {
    const r = await actions.triageIncident({ issueKey: 'SUP-101', useMock: true }, actions.mockClient());
    assert.equal(r.issueKey, 'SUP-101');
    assert.equal(r.mockMode, true);
  });
});

describe('triageIncident (asApp-like client, no requestTeamworkGraph)', () => {
  // Regression test for the panel's "client.requestTeamworkGraph is not a
  // function" note: api.asApp() has no such method, so buildContext must
  // skip the graph gracefully and fall back to Jira history instead of
  // surfacing a TypeError as the graph note.
  function asAppLikeClient() {
    const issuePayload = {
      id: '10001', key: 'SUP-101',
      fields: {
        summary: 'Checkout is down',
        description: 'Checkout returns 500 for all users.',
        issuetype: { name: 'Incident' },
        labels: ['sev1'], components: [{ name: 'checkout' }],
        issuelinks: [], status: { name: 'Open' },
        priority: { name: 'High' }, assignee: null,
      },
    };
    return {
      requestJira: async (route) => {
        const url = (route && route.value_) || String(route);
        const body = url.includes('/search/jql') ? { issues: [] } : issuePayload;
        return { ok: true, json: async () => body };
      },
    };
  }

  it('triages with Jira-history fallback and a user-context graph note', async () => {
    const r = await actions.triageIncident({ issueKey: 'SUP-101' }, asAppLikeClient());
    assert.equal(r.issueKey, 'SUP-101');
    assert.equal(r.mockMode, false);
    assert.ok(r.graphNote.includes('runs as the user'), `unexpected graphNote: ${r.graphNote}`);
    assert.ok(!r.graphNote.includes('not a function'), `graphNote must not leak a TypeError: ${r.graphNote}`);
  });
});

describe('findSimilarIncidents (mock mode)', () => {
  it('returns ranked similar incidents with resolutions', async () => {
    const r = await actions.findSimilarIncidents({ issueKey: 'SUP-101', useMock: true });
    assert.ok(r.similarIncidents.length >= 1);
    assert.ok(r.similarIncidents[0].similarity >= 0.12);
    assert.ok(r.similarIncidents.some((s) => s.resolution));
  });

  it('respects the limit', async () => {
    const r = await actions.findSimilarIncidents({ issueKey: 'SUP-101', limit: 1, useMock: true });
    assert.equal(r.similarIncidents.length, 1);
  });
});

describe('suggestAssignee (mock mode)', () => {
  it('suggests Ana first for the checkout outage', async () => {
    const r = await actions.suggestAssignee({ issueKey: 'SUP-101', useMock: true });
    assert.equal(r.suggestedAssignees[0].displayName, 'Ana');
    assert.ok(r.suggestedAssignees[0].why.length > 0);
  });
});

describe('applyTriage (mock mode)', () => {
  it('applies an approved triage and reports what was set', async () => {
    const r = await actions.applyTriage({
      issueKey: 'SUP-101', priority: 'Highest', commentBody: 'draft text',
      assigneeAccountId: 'mock-ana', confirm: true, useMock: true,
    });
    assert.equal(r.applied, true);
    assert.equal(r.prioritySet, 'Highest');
    assert.equal(r.assigneeSet, 'mock-ana');
    assert.equal(r.mockMode, true);
  });

  it('refuses to apply without human confirmation', async () => {
    await assert.rejects(
      () => actions.applyTriage({ issueKey: 'SUP-101', priority: 'High', commentBody: 'x', confirm: false, useMock: true }),
      /confirm must be true/,
    );
  });

  it('refuses an invalid priority before any write', async () => {
    await assert.rejects(
      () => actions.applyTriage({ issueKey: 'SUP-101', priority: 'Urgent', commentBody: 'x', confirm: true, useMock: true }),
      /priority must be one of/,
    );
  });
});
