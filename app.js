// ─── DayBridge — Main Application ────────────────────────────────

// Avatar colours cycle through these for email senders
const AVATAR_COLORS = ['#0078D4','#0052CC','#7B61FF','#0e7a3c','#c25000','#d92b3a','#6b7a90'];

// Task filter state
let _allTasks     = [];
let _activeFilter = 'all';

// ─── Initialisation ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  setDateDisplay();
  renderMockData();   // show demo data immediately — presentable without sign-in
  initAuth().catch(console.warn);
});

function setDateDisplay() {
  const el = document.getElementById('dateDisplay');
  if (!el) return;
  const opts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
  el.textContent = new Date().toLocaleDateString(undefined, opts);
}

// ─── Auth Callbacks (called by auth.js) ─────────────────────────

function onLoginSuccess(response) {
  const name = response.account?.name || response.account?.username || 'User';
  document.getElementById('loginBtn').classList.add('hidden');
  document.getElementById('userInfo').classList.remove('hidden');
  document.getElementById('userName').textContent = name;
  document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('statusBar').classList.remove('hidden');
  loadLiveData();
}

function onLogoutSuccess() {
  document.getElementById('loginBtn').classList.remove('hidden');
  document.getElementById('userInfo').classList.add('hidden');
  document.getElementById('statusBar').classList.add('hidden');
  renderMockData();
}

// ─── Live Data ───────────────────────────────────────────────────

async function loadLiveData() {
  showLoading('Fetching your data…');
  try {
    const token = await getAccessToken();

    updateLoadingText('Loading emails, calendar, and tasks…');
    const [rawEmails, rawEvents, rawTickets] = await Promise.allSettled([
      fetchEmails(token),
      fetchCalendarEvents(token),
      fetchMyJiraTickets(),
    ]);

    const emails  = rawEmails.status  === 'fulfilled' ? normalizeEmails(rawEmails.value)   : [];
    const events  = rawEvents.status  === 'fulfilled' ? normalizeEvents(rawEvents.value)   : [];
    const tickets = rawTickets.status === 'fulfilled' ? normalizeJira(rawTickets.value)    : [];

    if (rawEmails.status  === 'rejected') console.warn('Emails:', rawEmails.reason);
    if (rawEvents.status  === 'rejected') console.warn('Calendar:', rawEvents.reason);
    if (rawTickets.status === 'rejected') console.warn('Jira:', rawTickets.reason);

    renderTasks(tickets);
    renderCalendar(events);
    renderEmails(emails);
    updateStats(tickets, events.length, emails.length);
    updateProductivityMeter(tickets, events.length);

    document.getElementById('lastUpdated').textContent =
      'Last updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // AI summary — optional, silently skip if function not deployed
    updateLoadingText('Getting AI summary…');
    await loadAiSummary(tickets, emails.slice(0, 5)).catch(console.warn);

  } catch (err) {
    console.error('loadLiveData:', err);
    const dot = document.querySelector('.status-dot');
    if (dot) { dot.className = 'status-dot offline'; }
    document.getElementById('statusText').textContent = 'Error — using demo data';
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
  if (!res.ok) return;
  const ai = await res.json();
  if (ai.summary) {
    document.getElementById('aiSummary').textContent = ai.summary;
  }
  if (ai.blockers?.length) {
    const el = document.getElementById('aiBlockers');
    el.classList.remove('hidden');
    el.textContent = '⚠ Blockers: ' + ai.blockers.join(' · ');
  }
}

// ─── Render — Tasks ──────────────────────────────────────────────

function renderTasks(tasks) {
  _allTasks = tasks;
  _applyTaskFilter();
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
    const typeAbbr   = { story: 'S', bug: 'B', task: 'T', epic: 'E', subtask: '↳' };
    const abbr       = typeAbbr[t.issueType] || 'T';
    const likelihood = calcCompletionLikelihood(t);
    const lkClass    = likelihood >= 70 ? 'lk-high' : likelihood >= 40 ? 'lk-mid' : 'lk-low';

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

// ─── Render — Calendar ───────────────────────────────────────────

function renderCalendar(events) {
  const list = document.getElementById('eventList');
  document.getElementById('eventCount').textContent = events.length;

  if (!events.length) {
    list.innerHTML = emptyState('No events today', calendarIcon());
    return;
  }

  list.innerHTML = events.map(e => {
    const time = `${fmt12(e.start)} – ${fmt12(e.end)}`;
    return `
    <div class="event-item ${e.isNow ? 'event-now' : ''}" ${e.joinUrl ? `onclick="window.open('${e.joinUrl}','_blank')"` : ''}>
      <div class="event-bar"></div>
      <div>
        <div class="event-time">${time}</div>
        <div class="event-subject">${escHtml(e.subject)}</div>
        ${e.location ? `<div class="event-location">${escHtml(e.location)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ─── Render — Emails ─────────────────────────────────────────────

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
    return `
    <div class="email-item">
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

// ─── Mock Data (demo without sign-in) ────────────────────────────

function renderMockData() {
  const mockTasks = [
    { key:'WSD-101', summary:'Implement SSO login with MSAL',  priority:'high',    status:'inprogress', statusLabel:'In Progress', issueType:'story', due: daysFromNow(1),  overdue: false, url:'#' },
    { key:'WSD-98',  summary:'Fix calendar sync timezone bug', priority:'highest', status:'inprogress', statusLabel:'In Progress', issueType:'bug',   due: daysFromNow(-1), overdue: true,  url:'#' },
    { key:'WSD-95',  summary:'Write API integration tests',    priority:'medium',  status:'todo',       statusLabel:'To Do',       issueType:'task',  due: daysFromNow(3),  overdue: false, url:'#' },
    { key:'WSD-90',  summary:'Dashboard performance review',   priority:'low',     status:'review',     statusLabel:'In Review',   issueType:'task',  due: daysFromNow(5),  overdue: false, url:'#' },
  ];

  const base = new Date(); base.setMinutes(0,0,0);
  const mockEvents = [
    { subject:'Daily Standup',          start: hrs(base,9),  end: hrs(base,9,15),  location:'Teams',         isNow: isNow(hrs(base,9),  hrs(base,9,15)),  joinUrl: null },
    { subject:'Product Roadmap Review', start: hrs(base,11), end: hrs(base,12),    location:'Conf Room B',    isNow: isNow(hrs(base,11), hrs(base,12)),    joinUrl: null },
    { subject:'1-on-1 with Manager',    start: hrs(base,14), end: hrs(base,14,30), location:'Online meeting', isNow: isNow(hrs(base,14), hrs(base,14,30)), joinUrl: '#'  },
    { subject:'Sprint Planning',        start: hrs(base,15), end: hrs(base,16,30), location:'Main boardroom', isNow: isNow(hrs(base,15), hrs(base,16,30)), joinUrl: null },
  ];

  renderTasks(mockTasks);
  renderCalendar(mockEvents);
  renderEmails([
    { from:'Sarah Chen',      subject:'Re: Q3 Dashboard Timeline',            date: minsAgo(12),  preview:'Looks good! Can we move the demo to Thursday instead?' },
    { from:'Jira Automation', subject:'[WSD-98] Bug assigned to you',         date: minsAgo(34),  preview:'A new bug has been assigned: Fix calendar sync timezone bug' },
    { from:'Azure DevOps',    subject:'Build #142 failed — main branch',      date: minsAgo(55),  preview:'The build failed at step: npm test. View details…' },
    { from:'David Park',      subject:'API credentials for staging env',      date: minsAgo(80),  preview:'Hi, I have sent the updated .env values to your Teams DM' },
    { from:'HR Team',         subject:'New policy update — remote work 2026', date: minsAgo(210), preview:'Please review and acknowledge the updated remote work guidelines' },
  ]);

  updateStats(mockTasks, mockEvents.length, 5);
  updateProductivityMeter(mockTasks, mockEvents.length);

  document.getElementById('aiSummary').textContent =
    'Demo mode — sign in with Microsoft to load your live tasks, calendar events, and unread emails with AI prioritization.';
}

// ─── Loading helpers ─────────────────────────────────────────────

function showLoading(text) {
  document.getElementById('loadingText').textContent = text || 'Loading…';
  document.getElementById('loadingOverlay').classList.remove('hidden');
}
function updateLoadingText(text) {
  document.getElementById('loadingText').textContent = text;
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}

// ─── Utility helpers ─────────────────────────────────────────────

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

// ─── Stats Bar ───────────────────────────────────────────────────

function updateStats(tasks, eventCount, emailCount) {
  const open = tasks.filter(t => t.status !== 'done').length;
  const done = tasks.filter(t => t.status === 'done').length;
  const set  = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('statOpenTickets', open);
  set('statDoneToday',   done);
  set('statMeetings',    eventCount);
  set('statEmails',      emailCount);
}

// ─── Completion Likelihood ────────────────────────────────────────

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
    if (diff < 0)      score += 18;   // overdue — high urgency
    else if (diff === 0) score += 22; // due today
    else if (diff === 1) score += 8;
    else if (diff > 5)   score -= 8;
  }

  return Math.min(95, Math.max(5, Math.round(score)));
}

// ─── Productivity Meter ───────────────────────────────────────────

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
