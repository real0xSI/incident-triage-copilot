// Unit tests for the deterministic triage engine (src/triage.js).
// Run: node --test test/  (or npm test)
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const triage = require('../src/triage');
const { MOCK_ISSUES, MOCK_GRAPH_OWNERS } = require('../src/mock-data');

const base = (over = {}) => ({
  key: 'SUP-1',
  summary: 'Something is wrong',
  description: '',
  issueType: 'Bug',
  labels: [],
  components: [],
  linkedIssues: [],
  ...over,
});

describe('scoreToPriority', () => {
  it('maps boundaries exactly', () => {
    assert.equal(triage.scoreToPriority(100), 'Highest');
    assert.equal(triage.scoreToPriority(75), 'Highest');
    assert.equal(triage.scoreToPriority(74), 'High');
    assert.equal(triage.scoreToPriority(55), 'High');
    assert.equal(triage.scoreToPriority(54), 'Medium');
    assert.equal(triage.scoreToPriority(35), 'Medium');
    assert.equal(triage.scoreToPriority(34), 'Low');
    assert.equal(triage.scoreToPriority(15), 'Low');
    assert.equal(triage.scoreToPriority(14), 'Lowest');
    assert.equal(triage.scoreToPriority(0), 'Lowest');
  });
});

describe('parseBlastRadius', () => {
  it('detects all-users phrasing', () => {
    assert.deepEqual(triage.parseBlastRadius('checkout is down for all users'), { count: null, allUsers: true });
    assert.deepEqual(triage.parseBlastRadius('everyone is locked out'), { count: null, allUsers: true });
  });
  it('parses counts', () => {
    assert.deepEqual(triage.parseBlastRadius('affects 1,200 users'), { count: 1200, allUsers: false });
    assert.deepEqual(triage.parseBlastRadius('about 45 customers hit'), { count: 45, allUsers: false });
  });
  it('returns empty when unstated', () => {
    assert.deepEqual(triage.parseBlastRadius('it is broken'), { count: null, allUsers: false });
  });
});

describe('triageIssue', () => {
  it('scores the checkout outage Highest', () => {
    const issue = MOCK_ISSUES.find((i) => i.key === 'SUP-101');
    const similar = triage.findSimilarIncidents(issue, MOCK_ISSUES, 5);
    const r = triage.triageIssue(issue, { similarIssues: similar, graphOwners: MOCK_GRAPH_OWNERS });
    assert.equal(r.priority, 'Highest');
    assert.ok(r.score >= 75, `score ${r.score} should be >= 75`);
    assert.ok(r.confidence >= 0.5, `confidence ${r.confidence} should be >= 0.5`);
    assert.ok(r.severityKeywords.includes('outage') || r.severityKeywords.includes('down'));
    assert.equal(r.blastRadius.allUsers, true);
  });

  it('scores a typo Low (base 10 + typo keyword 10 + Bug 5 = 25)', () => {
    const issue = MOCK_ISSUES.find((i) => i.key === 'SUP-109');
    const r = triage.triageIssue(issue, { similarIssues: [], graphOwners: [] });
    assert.equal(r.priority, 'Low');
    assert.equal(r.score, 25);
  });

  it('scores a slow dashboard Medium or lower, never Highest', () => {
    const issue = MOCK_ISSUES.find((i) => i.key === 'SUP-103');
    const r = triage.triageIssue(issue, { similarIssues: [], graphOwners: [] });
    assert.ok(['Medium', 'Low', 'Lowest'].includes(r.priority), `got ${r.priority}`);
  });

  it('is deterministic: same input, same output', () => {
    const issue = MOCK_ISSUES.find((i) => i.key === 'SUP-101');
    const a = triage.triageIssue(issue, { similarIssues: [], graphOwners: [] });
    const b = triage.triageIssue(issue, { similarIssues: [], graphOwners: [] });
    assert.deepEqual(a, b);
  });

  it('caps the score at 100', () => {
    const r = triage.triageIssue(base({
      summary: 'outage breach data loss down unavailable payment failed',
      description: 'all users affected, 5000 users, sev1',
      issueType: 'Incident',
      labels: ['sev1'],
      linkedIssues: ['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6'],
    }), { similarIssues: [{}, {}, {}, {}, {}], graphOwners: [{}] });
    assert.equal(r.score, 100);
  });

  it('lowers confidence when there is no evidence', () => {
    const r = triage.triageIssue(base({ summary: 'weird thing', description: 'huh' }), { similarIssues: [], graphOwners: [] });
    assert.ok(r.confidence <= 0.35, `confidence ${r.confidence}`);
  });
});

describe('findSimilarIncidents', () => {
  it('finds the checkout rollback incident for the checkout outage', () => {
    const issue = MOCK_ISSUES.find((i) => i.key === 'SUP-101');
    const similar = triage.findSimilarIncidents(issue, MOCK_ISSUES, 5);
    const keys = similar.map((s) => s.key);
    assert.ok(keys.includes('SUP-98'), `expected SUP-98 in ${keys}`);
    assert.ok(similar.every((s) => s.similarity >= 0.12));
  });

  it('finds nothing similar for a typo', () => {
    const issue = MOCK_ISSUES.find((i) => i.key === 'SUP-109');
    const similar = triage.findSimilarIncidents(issue, MOCK_ISSUES, 5);
    assert.equal(similar.length, 0);
  });

  it('never returns the issue itself', () => {
    const issue = MOCK_ISSUES.find((i) => i.key === 'SUP-98');
    const similar = triage.findSimilarIncidents(issue, MOCK_ISSUES, 5);
    assert.ok(!similar.some((s) => s.key === 'SUP-98'));
  });

  it('respects the limit', () => {
    const issue = MOCK_ISSUES.find((i) => i.key === 'SUP-101');
    assert.ok(triage.findSimilarIncidents(issue, MOCK_ISSUES, 2).length <= 2);
  });
});

describe('rankAssignees', () => {
  it('ranks the on-call resolver of similar incidents first', () => {
    const ranked = triage.rankAssignees(MOCK_GRAPH_OWNERS);
    assert.equal(ranked[0].displayName, 'Ana');
    assert.ok(ranked[0].rankScore > ranked[1].rankScore);
  });

  it('gives every candidate a reason', () => {
    for (const c of triage.rankAssignees(MOCK_GRAPH_OWNERS)) {
      assert.ok(c.why && c.why.length > 0);
    }
  });

  it('handles an empty list', () => {
    assert.deepEqual(triage.rankAssignees([]), []);
  });
});

describe('buildTriageDraft', () => {
  it('contains the key facts and a human-review line', () => {
    const issue = MOCK_ISSUES.find((i) => i.key === 'SUP-101');
    const similar = triage.findSimilarIncidents(issue, MOCK_ISSUES, 5);
    const r = triage.triageIssue(issue, { similarIssues: similar, graphOwners: MOCK_GRAPH_OWNERS });
    const draft = triage.buildTriageDraft(issue, r, similar, triage.rankAssignees(MOCK_GRAPH_OWNERS));
    assert.ok(draft.includes('SUP-101'));
    assert.ok(draft.includes('Highest'));
    assert.ok(draft.includes('SUP-98'));
    assert.ok(draft.includes('Ana'));
    assert.ok(draft.toLowerCase().includes('human'));
  });
});

describe('validateApplyTriage', () => {
  it('refuses without confirm=true', () => {
    const errs = triage.validateApplyTriage({ issueKey: 'SUP-101', priority: 'High', commentBody: 'x', confirm: false });
    assert.ok(errs.some((e) => e.includes('confirm')));
  });

  it('refuses an invalid priority', () => {
    const errs = triage.validateApplyTriage({ issueKey: 'SUP-101', priority: 'Urgent', commentBody: 'x', confirm: true });
    assert.ok(errs.some((e) => e.includes('priority')));
  });

  it('refuses an empty comment', () => {
    const errs = triage.validateApplyTriage({ issueKey: 'SUP-101', priority: 'High', commentBody: '  ', confirm: true });
    assert.ok(errs.some((e) => e.includes('commentBody')));
  });

  it('accepts a complete approved triage', () => {
    const errs = triage.validateApplyTriage({ issueKey: 'SUP-101', priority: 'Highest', commentBody: 'draft', confirm: true, assigneeAccountId: 'mock-ana' });
    assert.deepEqual(errs, []);
  });
});
