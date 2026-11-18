// Product trigger: runs when an issue is created (avi:jira:created:issue).
// Triggers run without a user, so this uses api.asApp().
// It ONLY computes the triage and stores the draft in Forge storage.
// It never assigns anyone, never changes priority, and never posts a
// comment. The human sees the draft in the issue panel and approves it.

const actions = require('./actions');

async function onIssueCreated(event) {
  const issueKey = event?.issue?.key || event?.issue?.id;
  if (!issueKey) {
    console.log('triage-copilot trigger: no issue key in event, skipping');
    return;
  }
  try {
    // Triggers run without a user: asUser() would fail here, so the trigger
    // runs as the app. The panel/resolvers still run as the user.
    // eslint-disable-next-line global-require
    const api = require('@forge/api');
    const result = await actions.triageIncident(
      { issueKey, useMock: process.env.TRIAGE_MOCK === '1' },
      api.asApp(),
    );
    // Forge Key-Value Store (@forge/kvs). The legacy `storage` export was
    // removed from @forge/api in 8.0.0; @forge/kvs is its replacement.
    // eslint-disable-next-line global-require
    const { kvs } = require('@forge/kvs');
    await kvs.set(`triage:${result.issueKey}`, {
      ...result,
      storedAt: new Date().toISOString(),
      status: 'draft-awaiting-approval',
    });
    console.log(`triage-copilot trigger: draft stored for ${result.issueKey} (priority ${result.triage.priority}, confidence ${result.triage.confidence})`);
  } catch (e) {
    console.log(`triage-copilot trigger: failed for ${issueKey}: ${e.message}`);
  }
}

module.exports = { onIssueCreated };
