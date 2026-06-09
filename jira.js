// Jira REST API helpers — proxied through Azure Function to keep token server-side

async function fetchMyJiraTickets(userEmail, accessToken) {
  const params = userEmail ? `?user=${encodeURIComponent(userEmail)}` : '';
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  const res = await fetch(`/api/jira-tickets${params}`, { headers });
  if (!res.ok) throw new Error(`Jira proxy: ${res.status} ${res.statusText}`);
  const data = await res.json();

  // Surface any Jira-side error (e.g. unknown user)
  if (data.error) console.warn('Jira API error:', data.error, '| queried as:', data.queryUser);

  return {
    issues:    data.issues    || [],
    doneToday: data.doneToday || 0,
    queryUser: data.queryUser || userEmail || '',
    authEmail: data.authEmail || '',
    error:     data.error     || null,
  };
}

// Normalise Jira issue → display model
function normalizeJira(issues) {
  return issues.map(issue => {
    const f   = issue.fields;
    const due = f.duedate ? new Date(f.duedate) : null;
    const now = new Date();
    return {
      key:          issue.key,
      summary:      f.summary,
      priority:     f.priority?.name?.toLowerCase().replace(' ', '') || 'medium',
      status:       normalizeStatus(f.status?.statusCategory?.key),
      statusLabel:  f.status?.name || 'Unknown',
      issueType:    f.issuetype?.name?.toLowerCase() || 'task',
      due,
      overdue:      due ? due < now : false,
      url:          `https://wallstreetdocs.atlassian.net/browse/${issue.key}`,
      assigneeName: f.assignee?.displayName || '',
      assigneeEmail:f.assignee?.emailAddress || '',
    };
  });
}

function normalizeStatus(key) {
  const map = { new: 'todo', indeterminate: 'inprogress', done: 'done' };
  return map[key] || 'todo';
}
