// Trigger handler tests (mock mode). The trigger must run without a user:
// it passes api.asApp() into triageIncident. Outside a Forge runtime the
// @forge/kvs write fails, which the trigger catches and logs — so this
// test asserts the handler runs to completion and mentions the issue,
// not that storage succeeded.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('onIssueCreated (mock mode)', () => {
  it('computes a triage for an issue key and does not throw', async () => {
    process.env.TRIAGE_MOCK = '1';
    const { onIssueCreated } = require('../src/trigger');
    const lines = [];
    const origLog = console.log;
    console.log = (msg) => lines.push(String(msg));
    try {
      await onIssueCreated({ issue: { key: 'SUP-101' } });
    } finally {
      console.log = origLog;
    }
    assert.ok(lines.some((l) => l.includes('SUP-101')), `expected SUP-101 in logs, got: ${lines.join(' | ')}`);
  });

  it('accepts an issue id when the event carries no key', async () => {
    process.env.TRIAGE_MOCK = '1';
    const { onIssueCreated } = require('../src/trigger');
    const lines = [];
    const origLog = console.log;
    console.log = (msg) => lines.push(String(msg));
    try {
      // Mock client keys off the payload, so an id still resolves the mock issue.
      await onIssueCreated({ issue: { id: 'SUP-101' } });
    } finally {
      console.log = origLog;
    }
    assert.ok(lines.some((l) => l.includes('SUP-101')), `expected SUP-101 in logs, got: ${lines.join(' | ')}`);
  });

  it('skips events with no issue at all', async () => {
    const { onIssueCreated } = require('../src/trigger');
    const lines = [];
    const origLog = console.log;
    console.log = (msg) => lines.push(String(msg));
    try {
      await onIssueCreated({});
    } finally {
      console.log = origLog;
    }
    assert.ok(lines.some((l) => l.includes('no issue key')), `expected skip log, got: ${lines.join(' | ')}`);
  });
});
