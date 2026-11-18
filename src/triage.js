// Incident Triage Copilot — deterministic triage engine.
// Pure functions only: no Forge imports, no network, no randomness.
// The Rovo agent supplies the language understanding; this engine supplies
// the scoring, ranking, and draft text so every surface (panel, agent, MCP)
// returns identical results for identical input.
//
// Scoring model (0-100, documented in skills/incident-triage/references/scoring-rubric.md):
//   base 10
//   + severity keywords (critical +35 each capped, high +20, medium +10)
//   + blast radius (all users +25; >=1000 affected +20; >=100 +12; >=10 +6)
//   + linked issues +3 each, capped +15
//   + similar incidents +2 each, capped +10
//   + issue type Incident +10, Bug +5
//   + labels sev1/p0 +25, sev2/p1 +15
// Priority: >=75 Highest, >=55 High, >=35 Medium, >=15 Low, else Lowest.
// Confidence: 0.25 base + evidence points (similar found, owner found,
// keywords matched, component known, blast radius parsed, long description),
// capped at 0.95.

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is',
  'are', 'was', 'were', 'it', 'its', 'this', 'that', 'when', 'after', 'before',
  'please', 'help', 'issue', 'error', 'problem', 'not', 'no', 'cannot', 'cant',
  'can', 'user', 'users', 'app', 'our', 'we', 'i', 'my', 'me', 'us', 'at', 'by',
  'from', 'as', 'be', 'has', 'have', 'had', 'do', 'does', 'did', 'but', 'if',
  'so', 'than', 'then', 'there', 'here', 'what', 'which', 'who', 'how', 'all',
]);

const SEVERITY = [
  { level: 'critical', weight: 35, words: ['outage', 'down', 'unavailable', 'data loss', 'breach', 'security vulnerability', 'payment failed', 'payments failing', 'data breach', 'corruption', 'deleted'] },
  { level: 'high', weight: 20, words: ['crash', 'crashing', 'cannot log in', 'login failing', 'timeout', 'timing out', 'broken', 'failing', '500', '403', 'lost access', 'locked out'] },
  { level: 'medium', weight: 10, words: ['slow', 'lag', 'incorrect', 'wrong', 'missing', 'duplicate', 'confusing', 'stale', 'outdated', 'typo'] },
];

const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];

function normalize(text) {
  return (text || '').toLowerCase();
}

function tokenize(text) {
  return normalize(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function jaccard(a, b) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  return inter / (setA.size + setB.size - inter);
}

// Parse an affected-user count from free text: "all users", "500 users",
// "affects ~120 customers", "everyone". Returns { count, allUsers }.
function parseBlastRadius(text) {
  const t = normalize(text);
  if (/\ball users\b|\beveryone\b|\ball customers\b|\bwhole (team|company|org)\b/.test(t)) {
    return { count: null, allUsers: true };
  }
  const m = t.match(/(\d[\d,]*)\s*(users?|customers?|accounts?|people|employees?|seats?)\b/);
  if (m) return { count: parseInt(m[1].replace(/,/g, ''), 10), allUsers: false };
  return { count: null, allUsers: false };
}

function matchedKeywords(text) {
  const t = normalize(text);
  const hits = [];
  for (const group of SEVERITY) {
    for (const w of group.words) {
      if (t.includes(w)) hits.push({ word: w, level: group.level, weight: group.weight });
    }
  }
  return hits;
}

function scoreToPriority(score) {
  if (score >= 75) return 'Highest';
  if (score >= 55) return 'High';
  if (score >= 35) return 'Medium';
  if (score >= 15) return 'Low';
  return 'Lowest';
}

function triageIssue(issue, context = {}) {
  const similar = context.similarIssues || [];
  const owners = context.graphOwners || [];
  const text = `${issue.summary || ''}\n${issue.description || ''}`;
  const keywords = matchedKeywords(text);
  const blast = parseBlastRadius(text);
  const linkedCount = (issue.linkedIssues || []).length;

  let score = 10;
  const reasons = ['base score 10'];
  const keywordScore = keywords.reduce((s, k) => s + k.weight, 0);
  const cappedKeyword = Math.min(keywordScore, 70);
  score += cappedKeyword;
  if (cappedKeyword > 0) reasons.push(`severity keywords +${cappedKeyword} (${[...new Set(keywords.map((k) => k.word))].join(', ')})`);
  if (blast.allUsers) { score += 25; reasons.push('blast radius: all users +25'); }
  else if (blast.count !== null && blast.count >= 1000) { score += 20; reasons.push(`blast radius: ${blast.count} affected +20`); }
  else if (blast.count !== null && blast.count >= 100) { score += 12; reasons.push(`blast radius: ${blast.count} affected +12`); }
  else if (blast.count !== null && blast.count >= 10) { score += 6; reasons.push(`blast radius: ${blast.count} affected +6`); }
  if (linkedCount > 0) { const p = Math.min(linkedCount * 3, 15); score += p; reasons.push(`linked issues x${linkedCount} +${p}`); }
  if (similar.length > 0) { const p = Math.min(similar.length * 2, 10); score += p; reasons.push(`similar past incidents x${similar.length} +${p}`); }
  const type = (issue.issueType || '').toLowerCase();
  if (type === 'incident') { score += 10; reasons.push('issue type Incident +10'); }
  else if (type === 'bug') { score += 5; reasons.push('issue type Bug +5'); }
  const labels = (issue.labels || []).map((l) => l.toLowerCase());
  if (labels.includes('sev1') || labels.includes('p0')) { score += 25; reasons.push('label sev1/p0 +25'); }
  else if (labels.includes('sev2') || labels.includes('p1')) { score += 15; reasons.push('label sev2/p1 +15'); }
  score = Math.max(0, Math.min(100, score));

  let confidence = 0.25;
  if (similar.length > 0) confidence += 0.15;
  if (owners.length > 0) confidence += 0.15;
  if (keywords.length > 0) confidence += 0.10;
  if ((issue.components || []).length > 0) confidence += 0.10;
  if (blast.allUsers || blast.count !== null) confidence += 0.10;
  if ((issue.description || '').length > 80) confidence += 0.10;
  confidence = Math.min(0.95, Math.round(confidence * 100) / 100);

  return {
    issueKey: issue.key,
    score,
    priority: scoreToPriority(score),
    confidence,
    severityKeywords: [...new Set(keywords.map((k) => k.word))],
    blastRadius: blast,
    reasons,
    evidence: {
      similarCount: similar.length,
      ownerCount: owners.length,
      linkedCount,
    },
  };
}

// Rank owner candidates: most similar incidents resolved first, then most
// recent touch on the component, on-call gets a boost. Never auto-assigns;
// the caller presents this ranking for a human to pick from.
function rankAssignees(candidates) {
  return (candidates || [])
    .map((c) => {
      const resolved = c.resolvedSimilar || 0;
      const daysAgo = c.lastTouchedDaysAgo == null ? 365 : c.lastTouchedDaysAgo;
      const rankScore = resolved * 10 - daysAgo * 0.5 + (c.onCall ? 15 : 0);
      const why = [];
      if (resolved > 0) why.push(`resolved ${resolved} similar incident${resolved > 1 ? 's' : ''}`);
      if (c.lastTouchedDaysAgo != null) why.push(`last touched this service ${c.lastTouchedDaysAgo}d ago`);
      if (c.onCall) why.push('on call now');
      if (why.length === 0) why.push('teammate on the service team');
      return { ...c, rankScore: Math.round(rankScore * 10) / 10, why: why.join('; ') };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}

function findSimilarIncidents(issue, pastIssues, limit = 5) {
  const text = `${issue.summary || ''}\n${issue.description || ''}`;
  return (pastIssues || [])
    .filter((p) => p.key !== issue.key)
    .map((p) => ({
      ...p,
      similarity: Math.round(jaccard(text, `${p.summary || ''}\n${p.description || ''}`) * 1000) / 1000,
    }))
    .filter((p) => p.similarity >= 0.12)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

function buildTriageDraft(issue, triage, similar, assignees) {
  const lines = [];
  lines.push(`Triage draft for ${issue.key} (confidence ${Math.round(triage.confidence * 100)}%, score ${triage.score}/100)`);
  lines.push('');
  lines.push(`What broke: ${issue.summary || '(no summary)'}`);
  lines.push(`Suggested priority: ${triage.priority}`);
  if (triage.severityKeywords.length > 0) {
    lines.push(`Signals: ${triage.severityKeywords.join(', ')}`);
  }
  if (triage.blastRadius.allUsers) lines.push('Blast radius: all users affected.');
  else if (triage.blastRadius.count !== null) lines.push(`Blast radius: ~${triage.blastRadius.count} users affected.`);
  else lines.push('Blast radius: not stated in the report — confirm with the reporter.');
  if (similar.length > 0) {
    lines.push('');
    lines.push('Similar past incidents:');
    for (const s of similar) {
      lines.push(`- ${s.key}: ${s.summary} (similarity ${s.similarity})${s.resolution ? ` — fixed by: ${s.resolution}` : ''}`);
    }
    lines.push(`Likely cause: same pattern as ${similar[0].key}${similar[0].resolution ? ` (${similar[0].resolution})` : ''} — verify before acting.`);
  } else {
    lines.push('Likely cause: no similar past incident found — treat as a new failure mode.');
  }
  if (assignees.length > 0) {
    lines.push('');
    lines.push(`Suggested owner: ${assignees[0].displayName} (${assignees[0].why}).`);
  }
  lines.push('');
  lines.push('Suggested next step: confirm the blast radius with the reporter, then start from the similar incident above.');
  lines.push('This draft was produced by Triage Copilot. A human reviewed it before it was applied.');
  return lines.join('\n');
}

// Validate an apply-triage request before any Jira write happens.
function validateApplyTriage(input) {
  const errors = [];
  if (!input || typeof input !== 'object') return ['input must be an object'];
  if (!input.issueKey || typeof input.issueKey !== 'string') errors.push('issueKey is required');
  if (!PRIORITIES.includes(input.priority)) errors.push(`priority must be one of ${PRIORITIES.join(', ')}`);
  if (!input.commentBody || typeof input.commentBody !== 'string' || input.commentBody.trim().length === 0) {
    errors.push('commentBody is required');
  }
  if (input.confirm !== true) errors.push('confirm must be true — a human must approve the triage first');
  if (input.assigneeAccountId != null && typeof input.assigneeAccountId !== 'string') {
    errors.push('assigneeAccountId must be a string account ID');
  }
  return errors;
}

module.exports = {
  triageIssue,
  rankAssignees,
  findSimilarIncidents,
  buildTriageDraft,
  validateApplyTriage,
  scoreToPriority,
  parseBlastRadius,
  matchedKeywords,
  jaccard,
  tokenize,
  PRIORITIES,
};
