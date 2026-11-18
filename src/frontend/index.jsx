import React from 'react';
import ForgeReconciler, {
  Text,
  Heading,
  Button,
  ButtonGroup,
  Stack,
  Box,
  SectionMessage,
  Select,
  Spinner,
  List,
  ListItem,
  useProductContext,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];

const App = () => {
  const context = useProductContext();
  // The issue reference arrives in more than one documented shape:
  // extension.issue.key/id (hello-world tutorial) or top-level
  // issueKey/issueId (JiraContext). Accept any of them; the backend treats
  // a key or a numeric id identically.
  const issueRef = context?.extension?.issue?.key
    || context?.extension?.issue?.id
    || context?.issueKey
    || context?.issueId;
  const issueKey = issueRef != null ? String(issueRef) : null;
  const [triage, setTriage] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [priority, setPriority] = React.useState('High');
  const [assignee, setAssignee] = React.useState(null);
  const [applied, setApplied] = React.useState(false);
  const [applying, setApplying] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!issueKey) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke('getTriage', { issueKey });
      setTriage(result);
      setPriority(result?.triage?.priority || 'High');
      const first = result?.suggestedAssignees?.[0];
      if (first) setAssignee(first.accountId);
    } catch (e) {
      setError(e.message || 'Failed to load triage.');
    } finally {
      setLoading(false);
    }
  }, [issueKey]);

  React.useEffect(() => { load(); }, [load]);

  const onApprove = async () => {
    if (!triage) return;
    setApplying(true);
    try {
      await invoke('approveTriage', {
        issueKey: triage.issueKey || issueKey,
        priority,
        assigneeAccountId: assignee || undefined,
        commentBody: triage.draft,
      });
      setApplied(true);
    } catch (e) {
      setError(e.message || 'Failed to apply triage.');
    } finally {
      setApplying(false);
    }
  };

  const onRefresh = async () => {
    setLoading(true);
    try {
      const result = await invoke('refreshTriage', { issueKey });
      setTriage(result);
      setApplied(false);
    } catch (e) {
      setError(e.message || 'Failed to refresh triage.');
    } finally {
      setLoading(false);
    }
  };

  if (!issueKey) {
    return <Text>Open this panel from a Jira issue to see its triage.</Text>;
  }
  if (loading) return <Spinner size="medium" label="Running triage…" />;
  if (error) {
    return (
      <Stack space="space.200">
        <SectionMessage title="Triage failed" appearance="error">
          <Text>{error}</Text>
        </SectionMessage>
        <Button appearance="primary" onClick={onRefresh}>Try again</Button>
      </Stack>
    );
  }
  if (!triage) return <Text>No triage available yet.</Text>;

  const t = triage.triage;
  const assigneeOptions = (triage.suggestedAssignees || []).map((a) => ({
    label: `${a.displayName} — ${a.why}`,
    value: a.accountId,
  }));

  return (
    <Stack space="space.200">
      <Heading size="medium">Triage Copilot — {triage.issueKey || issueKey}</Heading>
      <Box>
        <Text>{triage.summary}</Text>
      </Box>
      <SectionMessage
        title={`Suggested priority: ${t.priority} (confidence ${Math.round(t.confidence * 100)}%, score ${t.score}/100)`}
        appearance={t.priority === 'Highest' ? 'error' : t.priority === 'High' ? 'warning' : 'information'}
      >
        <Text>{t.reasons.join(' · ')}</Text>
      </SectionMessage>
      <Text>{triage.draft}</Text>
      {(triage.similarIncidents || []).length > 0 && (
        <Box>
          <Heading size="small">Similar past incidents</Heading>
          <List>
            {(triage.similarIncidents || []).map((s) => (
              <ListItem key={s.key}>
                <Text>{s.key}: {s.summary} (similarity {s.similarity}){s.resolution ? ` — ${s.resolution}` : ''}</Text>
              </ListItem>
            ))}
          </List>
        </Box>
      )}
      {(triage.suggestedAssignees || []).length > 0 && (
        <Box>
          <Heading size="small">Suggested owner</Heading>
          <List>
            {(triage.suggestedAssignees || []).map((a) => (
              <ListItem key={a.accountId}>
                <Text>{a.displayName} — {a.why}</Text>
              </ListItem>
            ))}
          </List>
        </Box>
      )}
      {triage.graphNote && <Text>{triage.graphNote}</Text>}
      {applied ? (
        <SectionMessage title="Triage applied" appearance="confirmation">
          <Text>The summary was posted as a comment and the priority{assignee ? ' and assignee' : ''} were set.</Text>
        </SectionMessage>
      ) : (
        <Stack space="space.100">
          <Select
            label="Priority to apply"
            options={PRIORITIES.map((p) => ({ label: p, value: p }))}
            value={priority}
            onChange={(e) => setPriority(e.value)}
          />
          {assigneeOptions.length > 0 && (
            <Select
              label="Assignee to apply"
              options={assigneeOptions}
              value={assignee}
              onChange={(e) => setAssignee(e.value)}
            />
          )}
          <ButtonGroup>
            <Button appearance="primary" onClick={onApprove} isDisabled={applying}>
              {applying ? 'Applying…' : 'Approve & apply triage'}
            </Button>
            <Button appearance="subtle" onClick={onRefresh}>Refresh triage</Button>
          </ButtonGroup>
          <Text>Nothing is applied until you approve. Triage Copilot never assigns anyone on its own.</Text>
        </Stack>
      )}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
