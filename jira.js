// Jira REST API helpers — proxied through Azure Function to keep token server-side

async function fetchMyJiraTickets(userEmail) {
  const params = userEmail ? `?user=${encodeURIComponent(userEmail)}` : '';
  const res = await fetch(`/api/jira-tickets${params}`);
  if (!res.ok) throw new Error(`Jira proxy: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.issues || [];
}

// Normalise Jira issue → display model
function normalizeJira(issues) {
  return issues.map(issue => {
    const f = issue.fields;
    const due = f.duedate ? new Date(f.duedate) : null;
    const now = new Date();
    return {
      key:        issue.key,
      summary:    f.summary,
      priority:   f.priority?.name?.toLowerCase().replace(' ', '') || 'medium',
      status:     normalizeStatus(f.status?.statusCategory?.key),
      statusLabel:f.status?.name || 'Unknown',
      issueType:  f.issuetype?.name?.toLowerCase() || 'task',
      due,
      overdue:    due ? due < now : false,
      url:        `${JIRA_CONFIG.baseUrl}/browse/${issue.key}`,
    };
  });
}

function normalizeStatus(key) {
  const map = { new: 'todo', indeterminate: 'inprogress', done: 'done' };
  return map[key] || 'todo';
}
