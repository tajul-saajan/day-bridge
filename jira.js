// Jira REST API helpers
// In production: route calls through an Azure Function proxy — never expose JIRA_AUTH in browser.

const JIRA_CONFIG = {
  baseUrl: window.ENV?.JIRA_BASE_URL || 'https://yourcompany.atlassian.net',
  email:   window.ENV?.JIRA_EMAIL    || '',
  token:   window.ENV?.JIRA_TOKEN    || '',
};

function getJiraAuth() {
  return btoa(`${JIRA_CONFIG.email}:${JIRA_CONFIG.token}`);
}

async function fetchMyJiraTickets() {
  const jql = encodeURIComponent(
    'assignee = currentUser() AND statusCategory != Done ORDER BY priority ASC, due ASC'
  );
  const fields = 'summary,priority,status,duedate,issuetype,assignee';

  const res = await fetch(
    `${JIRA_CONFIG.baseUrl}/rest/api/3/search?jql=${jql}&fields=${fields}&maxResults=20`,
    {
      headers: {
        Authorization: `Basic ${getJiraAuth()}`,
        Accept:        'application/json',
      },
    }
  );
  if (!res.ok) throw new Error(`Jira API: ${res.status} ${res.statusText}`);
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
