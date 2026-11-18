// UI Kit resolver for the issue panel (jira:issuePanel).
// Runs as the user (api.asUser() inside actions), so reads and writes
// respect that user's Jira permissions.
const Resolver = require('@forge/resolver').default;
const actions = require('./actions');

const resolver = new Resolver();

resolver.define('getTriage', async ({ payload }) => {
  // The panel passes issueId (numeric, from the extension context) or a key.
  const issueKey = payload?.issueKey || payload?.issueId;
  if (!issueKey) throw new Error('issueKey is required');
  // Prefer a stored draft from the creation trigger; recompute if absent.
  // The draft is keyed by canonical issue key, so an id-keyed lookup may
  // miss; the recompute below covers that case.
  try {
    // eslint-disable-next-line global-require
    const { kvs } = require('@forge/kvs');
    const stored = await kvs.get(`triage:${issueKey}`);
    if (stored && stored.status === 'draft-awaiting-approval') return stored;
  } catch (e) {
    // Storage read failure is not fatal; fall through to live compute.
    console.log(`triage-copilot panel: storage read failed (${e.message}), recomputing`);
  }
  return actions.triageIncident({ issueKey, useMock: false });
});

resolver.define('refreshTriage', async ({ payload }) => {
  const issueKey = payload?.issueKey || payload?.issueId;
  if (!issueKey) throw new Error('issueKey is required');
  const result = await actions.triageIncident({ issueKey, useMock: false });
  try {
    // eslint-disable-next-line global-require
    const { kvs } = require('@forge/kvs');
    await kvs.set(`triage:${result.issueKey}`, { ...result, storedAt: new Date().toISOString(), status: 'draft-awaiting-approval' });
  } catch (e) {
    console.log(`triage-copilot panel: storage write failed (${e.message})`);
  }
  return result;
});

resolver.define('approveTriage', async ({ payload }) => {
  // The panel only calls this after the human clicks Approve.
  // applyTriage itself refuses unless confirm === true.
  return actions.applyTriage({ ...payload, confirm: true });
});

module.exports = { handler: resolver.getDefinitions() };
