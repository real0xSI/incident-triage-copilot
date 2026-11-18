// Unit tests for Teamwork Graph helpers (src/graph.js).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const graph = require('../src/graph');

describe('operationName', () => {
  it('prefixes with triage_ and keeps the operation readable', () => {
    assert.equal(graph.operationName('relatedIssues'), 'triage_relatedIssues');
    assert.ok(graph.operationName('echo').length >= 3);
  });
});

describe('buildEchoQuery', () => {
  it('builds the documented echo query', () => {
    const q = graph.buildEchoQuery('hello');
    assert.ok(q.query.includes('echo(myString: "hello")'));
    assert.ok(q.operationName.startsWith('triage_'));
  });
});

describe('buildCustomQuery', () => {
  it('builds a customQuery execution payload matching the live schema', () => {
    const q = graph.buildCustomQuery('c810756f-719b-4124-b0bd-102304366881', { issueAri: 'ari:cloud:jira:cloud-1:issue/10001' });
    assert.ok(q.query.includes('customQuery'));
    assert.ok(q.query.includes('queryParams: CypherRequestParams'));
    assert.ok(q.query.includes('queryParams: $queryParams'));
    assert.ok(!q.query.includes('variables: $variables'));
    assert.equal(q.variables.queryKey, 'c810756f-719b-4124-b0bd-102304366881');
    assert.deepEqual(q.variables.queryParams, { issueAri: 'ari:cloud:jira:cloud-1:issue/10001' });
  });

  it('requests only fields the live schema exposes on JiraWorkItem', () => {
    const q = graph.buildCustomQuery('19948a9f-6ffc-4edf-814a-c4f4a9e658a7', { issueAri: 'ari:cloud:jira:cloud-1:issue/10001' });
    assert.ok(!q.query.includes('{ key summary }'), 'JiraWorkItem has no key/summary in the live TWG schema');
    assert.ok(q.query.includes('... on JiraWorkItem { ari statusAri createdAt }'));
  });

  it('refuses an empty queryKey', () => {
    assert.throws(() => graph.buildCustomQuery(''), /queryKey is required/);
  });
});

describe('buildIssueAri', () => {
  it('builds the documented Jira issue ARI', () => {
    assert.equal(graph.buildIssueAri('cloud-1', '10001'), 'ari:cloud:jira:cloud-1:issue/10001');
    assert.equal(graph.buildIssueAri('cloud-1', 10001), 'ari:cloud:jira:cloud-1:issue/10001');
  });

  it('returns null when either part is missing', () => {
    assert.equal(graph.buildIssueAri(null, '10001'), null);
    assert.equal(graph.buildIssueAri('cloud-1', null), null);
    assert.equal(graph.buildIssueAri(undefined, undefined), null);
  });
});

describe('getCloudId', () => {
  it('returns null outside a Forge runtime instead of throwing', () => {
    assert.equal(graph.getCloudId(), null);
  });
});

describe('persistedQueryDefinitions', () => {
  it('returns three definitions with the registered UUID keys', () => {
    const defs = graph.persistedQueryDefinitions();
    assert.equal(defs.length, 3);
    const keys = defs.map((d) => d.queryKey);
    assert.equal(new Set(keys).size, 3);
    assert.deepEqual([...keys].sort(), [
      '19948a9f-6ffc-4edf-814a-c4f4a9e658a7',
      '2588d3e3-2cf6-4504-bfdc-848b17540950',
      'c810756f-719b-4124-b0bd-102304366881',
    ]);
    for (const d of defs) {
      assert.ok(d.cypher.includes('MATCH'), `${d.queryKey} must be a Cypher query`);
      assert.ok(d.description.length > 0);
    }
  });

  it('uses the verified relationship in the user-teams query', () => {
    const defs = graph.persistedQueryDefinitions();
    const teams = defs.find((d) => d.queryKey === '2588d3e3-2cf6-4504-bfdc-848b17540950');
    assert.ok(teams.cypher.includes('atlassian_user_is_in_atlassian_team'));
    assert.ok(teams.cypher.includes('$userAri'));
    assert.ok(!teams.cypher.includes('TODO_SCHEMA'));
  });

  it('uses only relationship names verified in the live TWG schema', () => {
    const defs = graph.persistedQueryDefinitions();
    for (const d of defs) {
      assert.ok(!d.cypher.includes('TODO_SCHEMA'), `${d.queryKey} must not contain placeholders`);
      assert.ok(!d.description.includes('TODO-SCHEMA'));
    }
    const owners = defs.find((d) => d.queryKey === 'c810756f-719b-4124-b0bd-102304366881');
    assert.ok(owners.cypher.includes('atlassian_user_assigned_jira_work_item'));
    assert.ok(owners.cypher.includes('atlassian_user_reported_jira_work_item'));
    assert.ok(owners.cypher.includes('JiraWorkItem'));
    const similar = defs.find((d) => d.queryKey === '19948a9f-6ffc-4edf-814a-c4f4a9e658a7');
    assert.ok(similar.cypher.includes('jira_space_has_jira_work_item'));
    assert.ok(similar.cypher.includes('JiraWorkItem'));
  });

  it('matches issues by ARI, never by key (the live schema has no key)', () => {
    const defs = graph.persistedQueryDefinitions();
    for (const d of defs) {
      assert.ok(!d.cypher.includes('$issueKey'), `${d.queryKey} must not use $issueKey`);
      assert.ok(!d.cypher.includes('{key:'), `${d.queryKey} must not match on key`);
    }
    const owners = defs.find((d) => d.queryKey === 'c810756f-719b-4124-b0bd-102304366881');
    assert.ok(owners.cypher.includes('{ari: $issueAri}'));
    const similar = defs.find((d) => d.queryKey === '19948a9f-6ffc-4edf-814a-c4f4a9e658a7');
    assert.ok(similar.cypher.includes('{ari: $issueAri}'));
    assert.ok(similar.cypher.includes('WHERE past <> issue'));
  });
});

describe('parseGraphOwners', () => {
  it('parses owners out of a live customQuery connection (edges/columns)', () => {
    const parsed = graph.parseGraphOwners({
      data: {
        customQuery: {
          edges: [
            {
              node: {
                columns: [
                  {
                    key: 'owner',
                    value: {
                      __typename: 'CypherQueryResultNode',
                      id: 'ari:cloud:identity::user/712020:aaa',
                      data: { __typename: 'AtlassianUser', accountId: 'a1', name: 'Ana', email: 'ana@example.com' },
                    },
                  },
                ],
              },
            },
            { node: { columns: [{ key: 'owner', value: { __typename: 'CypherQueryResultNode', id: 'x', data: { __typename: 'AtlassianUser', accountId: 'a2', name: 'Bo' } } }] } },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });
    assert.equal(parsed.empty, false);
    assert.equal(parsed.owners.length, 2);
    assert.equal(parsed.owners[0].displayName, 'Ana');
    assert.equal(parsed.owners[0].accountId, 'a1');
    assert.equal(parsed.owners[1].displayName, 'Bo');
  });

  it('parses owners out of a legacy array-of-rows shape', () => {
    const parsed = graph.parseGraphOwners({
      data: { customQuery: [{ owner: { accountId: 'a1', displayName: 'Ana', resolvedSimilar: 2 } }] },
    });
    assert.equal(parsed.empty, false);
    assert.equal(parsed.owners[0].displayName, 'Ana');
  });

  it('reports empty with a reason when the graph returns nothing', () => {
    const parsed = graph.parseGraphOwners({ data: { customQuery: [] } });
    assert.equal(parsed.empty, true);
    assert.ok(parsed.reason.includes('Teamwork Graph'));
  });

  it('handles a null response without throwing', () => {
    const parsed = graph.parseGraphOwners(null);
    assert.equal(parsed.empty, true);
  });
});

describe('ownersFromHistory', () => {
  it('counts resolved similar incidents per assignee', () => {
    const owners = graph.ownersFromHistory([
      { assignee: { accountId: 'a1', displayName: 'Ana' } },
      { assignee: { accountId: 'a1', displayName: 'Ana' } },
      { assignee: { accountId: 'a2', displayName: 'Bo' } },
      { summary: 'no assignee here' },
    ]);
    assert.equal(owners.length, 2);
    assert.equal(owners.find((o) => o.accountId === 'a1').resolvedSimilar, 2);
    assert.equal(owners.find((o) => o.accountId === 'a2').resolvedSimilar, 1);
  });
});
