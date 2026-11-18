// Manifest validation tests: parse manifest.yml and assert the module
// wiring the Codegeist bonus tracks depend on. (forge lint is the second,
// authoritative check — run `npm run lint`.)
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const manifest = yaml.load(fs.readFileSync(path.join(ROOT, 'manifest.yml'), 'utf8'));

describe('manifest.yml', () => {
  it('declares the nodejs24.x runtime', () => {
    assert.equal(manifest.app.runtime.name, 'nodejs24.x');
  });

  it('has a registered app id (real ARI, not the placeholder)', () => {
    assert.ok(/^ari:cloud:ecosystem::app\/[0-9a-f-]{36}$/.test(manifest.app.id), `app id is not a registered ARI: ${manifest.app.id}`);
    assert.ok(!manifest.app.id.includes('REPLACE-WITH-REGISTERED-APP-ID'));
  });

  it('declares the issue panel (UI Kit, native render)', () => {
    const panel = manifest.modules['jira:issuePanel'][0];
    assert.equal(panel.key, 'triage-copilot-panel');
    assert.equal(panel.render, 'native');
    assert.equal(panel.resolver.function, 'resolver');
    assert.equal(panel.resource, 'main');
  });

  it('declares the issue-created trigger', () => {
    const trigger = manifest.modules.trigger[0];
    assert.ok(trigger.events.includes('avi:jira:created:issue'));
    assert.equal(trigger.function, 'trigger-handler');
  });

  it('declares the Rovo agent with 4 actions and 1 skill', () => {
    const agent = manifest.modules['rovo:agent'][0];
    assert.equal(agent.key, 'triage-copilot-agent');
    assert.ok(agent.name.length <= 30, `agent name is ${agent.name.length} chars, max 30`);
    assert.ok(agent.prompt.startsWith('resource:agent-prompt;'));
    // apply-triage is an UPDATE action: Rovo asks the human to confirm
    // before running it, so the write stays human-gated.
    assert.deepEqual(agent.actions, ['triage-incident', 'find-similar-incidents', 'suggest-assignee', 'apply-triage']);
    assert.deepEqual(agent.skills, ['incident-triage']);
    assert.ok(Array.isArray(agent.conversationStarters) && agent.conversationStarters.length >= 2, 'agent needs conversation starters');
  });

  it('declares the rovo:skill with a real SKILL.md directory', () => {
    const skill = manifest.modules['rovo:skill'][0];
    assert.equal(skill.key, 'incident-triage');
    assert.equal(skill.source.dir, 'skills/incident-triage');
    assert.ok(fs.existsSync(path.join(ROOT, 'skills/incident-triage/SKILL.md')));
    assert.deepEqual(skill.dependencies.tools, ['triage-incident', 'find-similar-incidents', 'suggest-assignee']);
  });

  it('declares the rovo:mcp module exposing the 3 read-only tools', () => {
    const mcp = manifest.modules['rovo:mcp'][0];
    assert.equal(mcp.key, 'triage-copilot-mcp');
    assert.deepEqual(mcp.tools, ['triage-incident', 'find-similar-incidents', 'suggest-assignee']);
    assert.ok(!mcp.tools.includes('apply-triage'), 'write action must NOT be exposed via MCP');
  });

  it('declares all 4 actions with the documented verbs', () => {
    const byKey = Object.fromEntries(manifest.modules.action.map((a) => [a.key, a]));
    assert.equal(byKey['triage-incident'].actionVerb, 'GET');
    assert.equal(byKey['find-similar-incidents'].actionVerb, 'GET');
    assert.equal(byKey['suggest-assignee'].actionVerb, 'GET');
    assert.equal(byKey['apply-triage'].actionVerb, 'UPDATE');
    for (const a of manifest.modules.action) {
      assert.ok(a.function, `${a.key} needs a function`);
      assert.ok(a.inputs.issueKey.required, `${a.key} needs a required issueKey`);
    }
  });

  it('declares every referenced function handler and resource file', () => {
    const fnKeys = new Set(manifest.modules.function.map((f) => f.key));
    for (const a of manifest.modules.action) assert.ok(fnKeys.has(a.function), `missing function ${a.function}`);
    assert.ok(fnKeys.has('resolver'));
    assert.ok(fnKeys.has('trigger-handler'));
    for (const f of manifest.modules.function) {
      // Handler paths are relative to src/ (Forge resolves them there).
      const [file] = f.handler.split('.');
      assert.ok(fs.existsSync(path.join(ROOT, 'src', `${file}.js`)), `missing handler file src/${file}.js`);
    }
    for (const r of manifest.resources) {
      assert.ok(fs.existsSync(path.join(ROOT, r.path)), `missing resource ${r.path}`);
    }
  });

  it('declares the Teamwork Graph scopes and storage:app', () => {
    const scopes = manifest.permissions.scopes;
    for (const s of ['storage:app', 'read:jira-work', 'write:jira-work', 'read:graph:issue:jira', 'read:graph:user:atlassian', 'read:graph:team:atlassian', 'read:graph:page:confluence']) {
      assert.ok(scopes.includes(s), `missing scope ${s}`);
    }
  });

  it('keeps the agent prompt file under the limit', () => {
    const prompt = fs.readFileSync(path.join(ROOT, 'prompts/agent-prompt.md'), 'utf8');
    assert.ok(prompt.length > 200 && prompt.length < 8000);
    assert.ok(prompt.toLowerCase().includes('confirm'));
  });
});
