// Module-load tests: every backend module must load in plain Node without a
// Forge runtime (all Forge imports are lazy, inside handlers). The UI Kit
// frontend is excluded on purpose: @forge/bridge throws outside Atlassian
// products, which is expected Forge behaviour, not a bug.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('backend modules load without a Forge runtime', () => {
  it('loads triage, graph, jira, mock-data', () => {
    assert.ok(require('../src/triage'));
    assert.ok(require('../src/graph'));
    assert.ok(require('../src/jira'));
    assert.ok(require('../src/mock-data'));
  });

  it('loads actions (Rovo/MCP handlers)', () => {
    const a = require('../src/actions');
    for (const fn of ['triageIncident', 'findSimilarIncidents', 'suggestAssignee', 'applyTriage']) {
      assert.equal(typeof a[fn], 'function', `${fn} must be a function`);
    }
  });

  it('loads the trigger handler', () => {
    const t = require('../src/trigger');
    assert.equal(typeof t.onIssueCreated, 'function');
  });

  it('loads the UI resolver and exposes a handler', () => {
    const r = require('../src/resolvers');
    assert.ok(r.handler, 'resolvers must export handler');
  });

  it('@forge/kvs exposes the key-value API the app uses', () => {
    // eslint-disable-next-line global-require
    const { kvs } = require('@forge/kvs');
    assert.equal(typeof kvs.get, 'function');
    assert.equal(typeof kvs.set, 'function');
  });

  it('@forge/api exposes asUser/asApp/requestTeamworkGraph', () => {
    // eslint-disable-next-line global-require
    const api = require('@forge/api');
    assert.equal(typeof api.asUser, 'function');
    assert.equal(typeof api.asApp, 'function');
    assert.equal(typeof api.asUser().requestTeamworkGraph, 'function');
  });

  it('@forge/resolver default export is the Resolver class', () => {
    // eslint-disable-next-line global-require
    const Resolver = require('@forge/resolver').default;
    assert.equal(typeof Resolver, 'function');
    const resolver = new Resolver();
    assert.equal(typeof resolver.define, 'function');
    assert.equal(typeof resolver.getDefinitions, 'function');
  });
});
