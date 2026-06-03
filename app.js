// Avatar colours cycle through these for email senders
const AVATAR_COLORS = ['#0078D4','#0052CC','#7B61FF','#0e7a3c','#c25000','#d92b3a','#6b7a90'];

// Task filter state
let _allTasks     = [];
let _activeFilter = 'all';


document.addEventListener('DOMContentLoaded', async () => {
  setDateDisplay();
  renderMockData();   // show demo data immediately â€” presentable without sign-in
  initAuth().catch(console.warn);
});

function setDateDisplay() {
  const el = document.getElementById('dateDisplay');
  if (!el) return;
  const opts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
  el.textContent = new Date().toLocaleDateString(undefined, opts);
}

function onLoginSuccess(response) {
  const name  = response.account?.name     || response.account?.username || 'User';
  const email = response.account?.username || '';
  document.getElementById('loginBtn').classList.add('hidden');
  document.getElementById('userInfo').classList.remove('hidden');
  document.getElementById('userName').textContent = name;
  document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('statusBar').classList.remove('hidden');
  loadLiveData(email);
}

function onLogoutSuccess() {
  document.getElementById('loginBtn').classList.remove('hidden');
  document.getElementById('userInfo').classList.add('hidden');
  document.getElementById('statusBar').classList.add('hidden');
  renderMockData();
}

async function loadLiveData(userEmail) {
  showLoading('Fetching your data…');
  try {
    const token = await getAccessToken();

    updateLoadingText('Loading emails, calendar, and tasks');
    const [rawEmails, rawEvents, rawWeekEvents, rawTickets] = await Promise.allSettled([
      fetchEmails(token),
      fetchCalendarEvents(token),
      fetchWeekCalendarEvents(token),
      fetchMyJiraTickets(userEmail),
    ]);

    const emails     = rawEmails.status     === 'fulfilled' ? normalizeEmails(rawEmails.value)     : [];
    const events     = rawEvents.status     === 'fulfilled' ? normalizeEvents(rawEvents.value)     : [];
    const weekEvents = rawWeekEvents.status === 'fulfilled' ? normalizeEvents(rawWeekEvents.value) : [];

    // Jira returns { issues, queryUser, authEmail, error }
    let tickets = [], jiraQueryUser = userEmail, jiraError = null;
    if (rawTickets.status === 'fulfilled') {
      const jiraResult = rawTickets.value;
      tickets       = normalizeJira(jiraResult.issues  || []);
      jiraQueryUser = jiraResult.queryUser || userEmail;
      jiraError     = jiraResult.error     || null;
    }

    if (rawEmails.status     === 'rejected') console.warn('Emails:',         rawEmails.reason);
    if (rawEvents.status     === 'rejected') console.warn('Calendar:',       rawEvents.reason);
    if (rawWeekEvents.status === 'rejected') console.warn('Week calendar:',  rawWeekEvents.reason);
    if (rawTickets.status    === 'rejected') console.warn('Jira:',           rawTickets.reason);

    renderTasks(tickets, jiraQueryUser, jiraError);
    renderCalendar(events);
    renderEmails(emails);
    renderWeeklySchedule(weekEvents);
    updateStats(tickets, events.length, emails.length);
    updateProductivityMeter(tickets, events.length);

    document.getElementById('lastUpdated').textContent =
      'Last updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // AI summary â€” show stat fallback if Claude unavailable
    updateLoadingText('Getting AI summary');
    try {
      await loadAiSummary(tickets, emails.slice(0, 5));
    } catch (err) {
      console.warn('AI summary unavailable:', err);
      document.getElementById('aiSummary').textContent =
        `${tickets.length} open ticket${tickets.length !== 1 ? 's' : ''} Â· ` +
        `${events.length} meeting${events.length !== 1 ? 's' : ''} today Â· ` +
        `${emails.length} unread email${emails.length !== 1 ? 's' : ''}`;
    }

  } catch (err) {
    console.error('loadLiveData:', err);
    const dot = document.querySelector('.status-dot');
    if (dot) { dot.className = 'status-dot offline'; }
    document.getElementById('statusText').textContent = 'Error â€” using demo data';
  } finally {
    hideLoading();
  }
}

async function loadAiSummary(tasks, emails) {
  const res = await fetch('/api/summarize', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ tasks, emails }),
  });
  if (!res.ok) throw new Error(`AI summary: ${res.status}`);
  const ai = await res.json();

  if (ai.summary) {
    document.getElementById('aiSummary').textContent = ai.summary;
  }
  if (ai.focusOrder?.length) {
    const el = document.getElementById('aiFocusItems');
    el.classList.remove('hidden');
    el.innerHTML = ai.focusOrder.map(item =>
      `<span class="ai-focus-chip">â†‘ ${escHtml(String(item))}</span>`
    ).join('');
  }
  if (ai.blockers?.length) {
    const el = document.getElementById('aiBlockers');
    el.classList.remove('hidden');
    el.innerHTML = ai.blockers.map(b =>
      `<span class="ai-blocker-chip">âš  ${escHtml(String(b))}</span>`
    ).join('');
  }
}


let _jiraQueryUser = '';
let _jiraError     = null;

function renderTasks(tasks, queryUser, error) {
  _allTasks      = tasks;
  _jiraQueryUser = queryUser || '';
  _jiraError     = error     || null;
  _applyTaskFilter();
  _renderJiraUserBadge();
}

function _renderJiraUserBadge() {
  const badge = document.getElementById('jiraUserBadge');
  if (!badge) return;
  if (_jiraError) {
    badge.innerHTML = `<span class="jira-user-badge jira-user-error" title="${escHtml(_jiraError)}">âš  Jira error</span>`;
  } else if (_jiraQueryUser) {
    badge.innerHTML = `<span class="jira-user-badge" title="Fetching tickets assigned to ${escHtml(_jiraQueryUser)}">
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M8 1a4 4 0 1 1 0 8A4 4 0 0 1 8 1zm0 9c-4.42 0-7 2.24-7 3.5V15h14v-1.5C15 12.24 12.42 10 8 10z" fill="currentColor"/></svg>
      ${escHtml(_jiraQueryUser)}
    </span>`;
  } else {
    badge.innerHTML = '';
  }
}

function _applyTaskFilter() {
  const list = document.getElementById('taskList');
  document.getElementById('taskCount').textContent = _allTasks.length;

  const toShow = _activeFilter === 'all'
    ? _allTasks
    : _activeFilter === 'critical'
      ? _allTasks.filter(t => t.priority === 'highest' || t.priority === 'blocker')
      : _allTasks.filter(t => t.priority === _activeFilter);

  if (!toShow.length) {
    const msg = _activeFilter === 'all'
      ? 'No open tasks assigned to you'
      : `No ${_activeFilter} priority tasks`;
    list.innerHTML = emptyState(msg, taskIcon());
    return;
  }

  list.innerHTML = toShow.map(t => {
    const dueLabel   = t.due ? formatDate(t.due) : '';
    const dueClass   = t.overdue ? 'task-due overdue' : 'task-due';
    const typeAbbr   = { story: 'S', bug: 'B', task: 'T', epic: 'E', subtask: 'â†³' };
    const abbr       = typeAbbr[t.issueType] || 'T';
    const likelihood = calcCompletionLikelihood(t);
    const lkClass    = likelihood >= 70 ? 'lk-high' : likelihood >= 40 ? 'lk-mid' : 'lk-low';

    const assigneeInitial = t.assigneeName ? t.assigneeName.charAt(0).toUpperCase() : '?';
    const assigneeTitle   = t.assigneeName
      ? `${t.assigneeName} (${t.assigneeEmail})`
      : 'Unassigned';

    return `
    <div class="task-item" onclick="window.open('${t.url}','_blank')">
      <div class="priority-flag priority-${t.priority}"></div>
      <div class="task-icon ${t.issueType}">${abbr}</div>
      <div class="task-body">
        <div class="task-key">${t.key}</div>
        <div class="task-summary" title="${escHtml(t.summary)}">${escHtml(t.summary)}</div>
        <div class="task-meta">
          <span class="task-status status-${t.status}">${t.statusLabel}</span>
          ${dueLabel ? `<span class="${dueClass}">${dueLabel}</span>` : ''}
          <span class="task-assignee" title="${escHtml(assigneeTitle)}">${escHtml(assigneeInitial)}</span>
          <span class="task-likelihood ${lkClass}" title="Likelihood of completing today">
            <span class="lk-bar"><span class="lk-fill" style="width:${likelihood}%"></span></span>
            <span class="lk-pct">${likelihood}%</span>
          </span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterTasks(priority) {
  _activeFilter = priority;
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === priority);
  });
  _applyTaskFilter();
}

// â”€â”€â”€ Render â€” Calendar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderCalendar(events) {
  const list = document.getElementById('eventList');
  document.getElementById('eventCount').textContent = events.length;

  if (!events.length) {
    list.innerHTML = emptyState('No events today', calendarIcon());
    return;
  }

  list.innerHTML = events.map(e => {
    const time    = `${fmt12(e.start)} – ${fmt12(e.end)}`;
    const openUrl = e.joinUrl || 'https://outlook.office.com/calendar/view/day';
    return `
    <div class="event-item ${e.isNow ? 'event-now' : ''}" onclick="window.open('${openUrl}','_blank')" style="cursor:pointer">
      <div class="event-bar"></div>
      <div class="event-content">
        <div class="event-time">${time}</div>
        <div class="event-subject">${escHtml(e.subject)}</div>
        ${e.location ? `<div class="event-location">${escHtml(e.location)}</div>` : ''}
      </div>
      ${e.joinUrl ? '<div class="event-join">Join</div>' : ''}
    </div>`;
  }).join('');
}

// â”€â”€â”€ Render â€” Emails â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderEmails(emails) {
  const list = document.getElementById('emailList');
  document.getElementById('emailCount').textContent = emails.length;

  if (!emails.length) {
    list.innerHTML = emptyState('Inbox zero!', emailIcon());
    return;
  }

  list.innerHTML = emails.map((e, i) => {
    const color   = AVATAR_COLORS[i % AVATAR_COLORS.length];
    const initial = e.from.charAt(0).toUpperCase();
    const date    = formatDate(e.date);
    const url     = 'https://outlook.office.com/mail/';
    return `
    <div class="email-item" onclick="window.open('${url}','_blank')">
      <div class="email-avatar" style="background:${color}">${initial}</div>
      <div class="email-body">
        <div class="email-row1">
          <span class="email-from">${escHtml(e.from)}</span>
          <span class="email-date">${date}</span>
        </div>
        <div class="email-subject">${escHtml(e.subject)}</div>
        <div class="email-preview">${escHtml(e.preview)}</div>
      </div>
    </div>`;
  }).join('');
}

// â”€â”€â”€ Render â€” Weekly Schedule â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderWeeklySchedule(allEvents) {
  const el = document.getElementById('weeklyList');
  if (!el) return;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day   = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));

  const eventsByDay = {};
  allEvents.forEach(e => {
    const key = new Date(e.start).toDateString();
    if (!eventsByDay[key]) eventsByDay[key] = [];
    eventsByDay[key].push(e);
  });

  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  el.innerHTML = dayNames.map((name, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key     = d.toDateString();
    const dayEvts = eventsByDay[key] || [];
    const count   = dayEvts.length;
    const isToday = d.toDateString() === today.toDateString();
    const isPast  = d < today && !isToday;
    const hasNow  = dayEvts.some(e => e.isNow);

    const dots = count > 0
      ? Array.from({ length: Math.min(count, 3) }, (_, di) =>
          `<span class="week-dot${di === 0 && hasNow ? ' week-dot-now' : ''}"></span>`
        ).join('')
      : '';

    return `
    <div class="week-day${isToday ? ' week-day-today' : ''}${isPast ? ' week-day-past' : ''}">
      <span class="week-day-name">${name}</span>
      <span class="week-day-num">${d.getDate()}</span>
      <div class="week-dots">${dots}</div>
      ${count > 0 ? `<span class="week-count">${count}</span>` : ''}
    </div>`;
  }).join('');
}

// â”€â”€â”€ Empty state before sign-in â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderMockData() {
  renderTasks([]);
  renderCalendar([]);
  renderEmails([]);
  renderWeeklySchedule([]);
  updateStats([], 0, 0);

  const fill = document.getElementById('psFill');
  if (fill) { fill.style.width = '0%'; fill.style.background = '#e1e6ed'; }
  const pct    = document.getElementById('psPct');    if (pct)    pct.textContent    = '';
  const status = document.getElementById('psStatus'); if (status) { status.textContent = 'Sign in to calculate'; status.style.color = ''; }
  const chips  = document.getElementById('psChips');  if (chips)  chips.innerHTML    = '';

  document.getElementById('aiSummary').textContent =
    'Sign in with Microsoft to get your AI-powered daily briefing  tasks, emails and calendar events prioritised for you.';
}

function showLoading(text) {
  document.getElementById('loadingText').textContent = text || 'Loading';
  document.getElementById('loadingOverlay').classList.remove('hidden');
}
function updateLoadingText(text) {
  document.getElementById('loadingText').textContent = text;
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}


function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmt12(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function formatDate(d) {
  const now   = new Date();
  const today = new Date(now); today.setHours(0,0,0,0);
  const target= new Date(d);   target.setHours(0,0,0,0);
  const diff  = Math.round((target - today) / 86400000);
  if (diff === 0)  return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1)  return 'Tomorrow';
  if (diff < -1)   return `${Math.abs(diff)}d overdue`;
  if (diff < 7)    return `In ${diff}d`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate()+n); return d; }
function minsAgo(m)     { return new Date(Date.now() - m*60000); }
function hrs(base, h, m=0) { const d=new Date(base); d.setHours(h,m,0,0); return d; }
function isNow(s, e)    { const n=new Date(); return n>=s && n<=e; }
function emptyState(msg, icon) {
  return `<div class="empty-state">${icon}<span>${msg}</span></div>`;
}

// Inline SVG helpers for empty states
function taskIcon()     { return '<svg width="32" height="32" viewBox="0 0 18 18" fill="none"><rect x="1" y="1" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="M5 9l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
function calendarIcon() { return '<svg width="32" height="32" viewBox="0 0 18 18" fill="none"><rect x="1" y="3" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M1 7h16M6 1v4M12 1v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'; }
function emailIcon()    { return '<svg width="32" height="32" viewBox="0 0 18 18" fill="none"><rect x="1" y="4" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M1 6l8 5 8-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'; }


function updateStats(tasks, eventCount, emailCount) {
  const open = tasks.filter(t => t.status !== 'done').length;
  const done = tasks.filter(t => t.status === 'done').length;
  const set  = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('statOpenTickets', open);
  set('statDoneToday',   done);
  set('statMeetings',    eventCount);
  set('statEmails',      emailCount);
}


function calcCompletionLikelihood(task) {
  if (task.status === 'done') return 100;

  const base       = { inprogress: 65, review: 80, todo: 25 };
  let   score      = base[task.status] ?? 30;

  const priorityMod = { highest: 20, blocker: 20, high: 12, medium: 0, low: -10, lowest: -15 };
  score += priorityMod[task.priority] ?? 0;

  if (task.due) {
    const today  = new Date(); today.setHours(0,0,0,0);
    const dueDay = new Date(task.due); dueDay.setHours(0,0,0,0);
    const diff   = Math.round((dueDay - today) / 86400000);
    if (diff < 0)      score += 18;   // overdue â€” high urgency
    else if (diff === 0) score += 22; // due today
    else if (diff === 1) score += 8;
    else if (diff > 5)   score -= 8;
  }

  return Math.min(95, Math.max(5, Math.round(score)));
}

function updateProductivityMeter(tasks, eventCount) {
  const inFlight = tasks.filter(t => t.status === 'inprogress' || t.status === 'review').length;
  const overdue  = tasks.filter(t => t.overdue).length;

  const score = Math.min(100, Math.max(0,
    40 + Math.min(25, inFlight * 8) - (overdue * 10) + Math.min(20, eventCount * 4)
  ));

  const tiers = [
    [96, 'Peak Performance', '#22c55e'],
    [81, 'High Output',      '#22c55e'],
    [66, 'Productive',       '#0078D4'],
    [51, 'On Track',         '#0078D4'],
    [31, 'Getting Started',  '#f59e0b'],
    [ 0, 'Slow Day',         '#c25000'],
  ];
  const [, label, color] = tiers.find(([min]) => score >= min) || tiers[tiers.length - 1];

  const fill   = document.getElementById('psFill');
  const pct    = document.getElementById('psPct');
  const status = document.getElementById('psStatus');
  const chips  = document.getElementById('psChips');
  if (!fill) return;

  fill.style.width      = score + '%';
  fill.style.background = color;
  pct.textContent       = score + '%';
  status.textContent    = label;
  status.style.color    = color;

  chips.innerHTML = [
    inFlight > 0 && `<span class="ps-chip">${inFlight} active</span>`,
    overdue  > 0 && `<span class="ps-chip warn">${overdue} overdue</span>`,
    eventCount > 0 && `<span class="ps-chip">${eventCount} meeting${eventCount !== 1 ? 's' : ''}</span>`,
  ].filter(Boolean).join('');
}

