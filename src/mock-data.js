// Mock data for the mock-data mode (TRIAGE_MOCK=1 or useMock in a request).
// Lets the whole triage flow — engine, actions, panel — run end to end with
// no Atlassian site at all. All people are fictional.
const MOCK_ISSUES = [
  {
    key: 'SUP-101', summary: 'Checkout is down, payments failing for all users',
    description: 'Since 09:12 UTC checkout returns 500 for all users. Payments failing, customers cannot complete orders. About 1200 users affected so far.',
    issueType: 'Incident', labels: ['sev1'], components: ['checkout'],
    linkedIssues: ['SUP-98', 'SUP-99'], status: 'Open',
  },
  {
    key: 'SUP-98', summary: 'Checkout 500 errors after deploy',
    description: 'Checkout service returns 500 after the morning deploy. Rolled back the deploy and errors stopped.',
    issueType: 'Incident', labels: ['sev1'], components: ['checkout'],
    linkedIssues: [], status: 'Done', resolution: 'rolled back deploy v2.14.1',
    assignee: { accountId: 'mock-ana', displayName: 'Ana' },
  },
  {
    key: 'SUP-99', summary: 'Payment gateway timeouts',
    description: 'Payment gateway timing out for ~300 users during peak. Retried with backoff, recovered.',
    issueType: 'Incident', labels: ['sev2'], components: ['payments'],
    linkedIssues: [], status: 'Done', resolution: 'added retry with backoff to gateway client',
    assignee: { accountId: 'mock-bo', displayName: 'Bo' },
  },
  {
    key: 'SUP-102', summary: 'Cannot log in with SSO',
    description: 'Login failing for 45 users after the IdP certificate rotation. Users see a 403 on the callback.',
    issueType: 'Incident', labels: [], components: ['auth'],
    linkedIssues: [], status: 'Open',
  },
  {
    key: 'SUP-103', summary: 'Dashboard loads very slow',
    description: 'Dashboard takes 30 seconds to load for the reporting team, about 12 users.',
    issueType: 'Bug', labels: [], components: ['dashboard'],
    linkedIssues: [], status: 'Open',
  },
  {
    key: 'SUP-104', summary: 'Search returns stale results',
    description: 'Search index is stale, results are outdated by about a day for everyone.',
    issueType: 'Bug', labels: [], components: ['search'],
    linkedIssues: [], status: 'Open',
  },
  {
    key: 'SUP-105', summary: 'Mobile app crashes on launch',
    description: 'Mobile app crashing on launch for iOS users after the latest release. Around 800 users affected.',
    issueType: 'Incident', labels: ['p1'], components: ['mobile'],
    linkedIssues: [], status: 'Open',
  },
  {
    key: 'SUP-106', summary: 'Invoice PDF missing line items',
    description: 'Generated invoices are missing line items for 3 customers this week.',
    issueType: 'Bug', labels: [], components: ['billing'],
    linkedIssues: [], status: 'Open',
  },
  {
    key: 'SUP-107', summary: 'Checkout slow during sale',
    description: 'Checkout is slow, pages take 8 seconds during the sale. 600 users affected.',
    issueType: 'Incident', labels: [], components: ['checkout'],
    linkedIssues: ['SUP-98'], status: 'Done', resolution: 'scaled checkout pods and added cache',
    assignee: { accountId: 'mock-ana', displayName: 'Ana' },
  },
  {
    key: 'SUP-108', summary: 'Webhook deliveries failing',
    description: 'Outgoing webhooks failing with timeouts, retry queue growing.',
    issueType: 'Incident', labels: [], components: ['integrations'],
    linkedIssues: [], status: 'Open',
  },
  {
    key: 'SUP-109', summary: 'Typo on the pricing page',
    description: 'The pricing page says "per mounth" instead of "per month".',
    issueType: 'Bug', labels: [], components: ['website'],
    linkedIssues: [], status: 'Open',
  },
  {
    key: 'SUP-110', summary: 'SSO login fails after cert rotation',
    description: 'SSO callback returns 403 after the identity provider rotated its certificate. Re-uploaded the new certificate and login recovered.',
    issueType: 'Incident', labels: [], components: ['auth'],
    linkedIssues: [], status: 'Done', resolution: 're-uploaded IdP certificate',
    assignee: { accountId: 'mock-cid', displayName: 'Cid' },
  },
];

// Fictional Teamwork Graph owners: who resolved similar incidents and who
// last touched the service. In live mode this comes from TWG queries.
const MOCK_GRAPH_OWNERS = [
  { accountId: 'mock-ana', displayName: 'Ana', resolvedSimilar: 2, lastTouchedDaysAgo: 3, onCall: true, team: 'Checkout' },
  { accountId: 'mock-bo', displayName: 'Bo', resolvedSimilar: 1, lastTouchedDaysAgo: 12, onCall: false, team: 'Payments' },
  { accountId: 'mock-cid', displayName: 'Cid', resolvedSimilar: 1, lastTouchedDaysAgo: 1, onCall: false, team: 'Identity' },
  { accountId: 'mock-dee', displayName: 'Dee', resolvedSimilar: 0, lastTouchedDaysAgo: 30, onCall: false, team: 'Checkout' },
];

const MOCK_CONFLUENCE_PAGES = [
  { id: 'p1', title: 'Checkout runbook', url: 'https://example.atlassian.net/wiki/spaces/OPS/pages/p1' },
  { id: 'p2', title: 'Incident response playbook', url: 'https://example.atlassian.net/wiki/spaces/OPS/pages/p2' },
];

module.exports = { MOCK_ISSUES, MOCK_GRAPH_OWNERS, MOCK_CONFLUENCE_PAGES };
