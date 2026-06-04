// DayBridge — Notification Service
// Handles browser notifications, sound alerts, and notification history

class DayBridgeNotifications {
  constructor() {
    this._prev   = JSON.parse(localStorage.getItem('db_notif_state') || '{}');
    this._list   = JSON.parse(localStorage.getItem('db_notif_list')  || '[]');
    this._ctx    = null;
    this._open   = false;
  }

  // ─── Audio Context ──────────────────────────────────────────────
  _audio() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this._ctx;
  }

  _tone(freqs, dur = 0.25) {
    try {
      const ctx = this._audio();
      freqs.forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        const t = ctx.currentTime + i * (dur * 0.65);
        gain.gain.setValueAtTime(0.22, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      });
    } catch (e) {}
  }

  // Different sound per notification type
  soundEmail()  { this._tone([520],          0.45); }           // single soft ping
  soundJira()   { this._tone([350, 490],      0.22); }          // double beep
  soundTeams()  { this._tone([523, 659, 784], 0.18); }          // 3-note ascending chime

  // ─── Browser Notifications ──────────────────────────────────────
  async requestPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      const p = await Notification.requestPermission();
      document.getElementById('notifPermBanner')?.classList.add('hidden');
      return p;
    }
  }

  _browserNotif(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('DayBridge — ' + title, { body, icon: '/favicon.ico' });
    }
  }

  // ─── History ────────────────────────────────────────────────────
  _push(type, title, body) {
    this._list.unshift({ type, title, body, time: new Date().toISOString() });
    if (this._list.length > 30) this._list = this._list.slice(0, 30);
    localStorage.setItem('db_notif_list', JSON.stringify(this._list));
  }

  getUnread() {
    const since = localStorage.getItem('db_notif_cleared') || '1970-01-01T00:00:00Z';
    return this._list.filter(n => n.time > since).length;
  }

  markRead() {
    localStorage.setItem('db_notif_cleared', new Date().toISOString());
    this._updateBadge();
    this.renderPanel();
  }

  _updateBadge() {
    const b = document.getElementById('notifBadge');
    const n = this.getUnread();
    if (b) { b.textContent = n; b.classList.toggle('hidden', n === 0); }
  }

  // ─── Check for New Items ─────────────────────────────────────────
  check(emailCount, jiraCount, teamsCount) {
    const p = this._prev;
    let fired = false;

    if (p.emailCount !== undefined && emailCount > p.emailCount) {
      const d = emailCount - p.emailCount;
      this.soundEmail();
      const body = `${d} new email${d > 1 ? 's' : ''} in your inbox`;
      this._browserNotif('New Email', body);
      this._push('email', 'New Email', body);
      fired = true;
    }

    if (p.jiraCount !== undefined && jiraCount > p.jiraCount) {
      const d = jiraCount - p.jiraCount;
      setTimeout(() => this.soundJira(), fired ? 600 : 0);
      const body = `${d} new Jira ticket${d > 1 ? 's' : ''} assigned to you`;
      this._browserNotif('New Jira Ticket', body);
      this._push('jira', 'New Ticket', body);
      fired = true;
    }

    if (p.teamsCount !== undefined && teamsCount > p.teamsCount) {
      const d = teamsCount - p.teamsCount;
      setTimeout(() => this.soundTeams(), fired ? 1200 : 0);
      const body = `${d} new Teams message${d > 1 ? 's' : ''}`;
      this._browserNotif('Teams Message', body);
      this._push('teams', 'Teams Message', body);
    }

    this._prev = { emailCount, jiraCount, teamsCount };
    localStorage.setItem('db_notif_state', JSON.stringify(this._prev));
    this._updateBadge();
  }

  // ─── Render Panel ───────────────────────────────────────────────
  renderPanel() {
    const panel = document.getElementById('notifList');
    if (!panel) return;

    if (!this._list.length) {
      panel.innerHTML = '<div class="notif-empty">No notifications yet.<br>Notifications appear when new emails, tickets or Teams messages arrive.</div>';
      return;
    }

    const since  = localStorage.getItem('db_notif_cleared') || '1970-01-01T00:00:00Z';
    const icons  = { email: '&#9993;', jira: '&#9675;', teams: '&#128172;' };
    const labels = { email: 'Email', jira: 'Jira', teams: 'Teams' };

    panel.innerHTML = this._list.map(n => {
      const isNew = n.time > since;
      const t     = new Date(n.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
      <div class="notif-item notif-${n.type} ${isNew ? 'notif-new' : ''}">
        <div class="notif-dot-type notif-dot-${n.type}"></div>
        <div class="notif-body">
          <div class="notif-row1">
            <span class="notif-label">${labels[n.type] || 'Alert'}</span>
            <span class="notif-time">${t}</span>
          </div>
          <div class="notif-text">${n.body}</div>
        </div>
      </div>`;
    }).join('');
  }

  // ─── Toggle Panel ───────────────────────────────────────────────
  toggle() {
    const panel = document.getElementById('notifDropdown');
    if (!panel) return;
    this._open = !this._open;
    panel.classList.toggle('hidden', !this._open);
    if (this._open) {
      this.renderPanel();
      this.markRead();
    }
  }

  close() {
    this._open = false;
    document.getElementById('notifDropdown')?.classList.add('hidden');
  }
}

const Notif = new DayBridgeNotifications();

// Close panel when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('#notifBtn') && !e.target.closest('#notifDropdown')) {
    Notif.close();
  }
});
