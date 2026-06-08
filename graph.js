// Microsoft Graph API helpers

const GRAPH = 'https://graph.microsoft.com/v1.0';

async function fetchEmails(accessToken) {
  // /inbox/messages scopes to the Inbox only — excludes Deleted Items and other folders
  const url = `${GRAPH}/me/mailFolders/inbox/messages` +
    `?$filter=isRead eq false` +
    `&$top=10` +
    `&$orderby=receivedDateTime desc` +
    `&$select=subject,from,receivedDateTime,bodyPreview,webLink`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Graph emails: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.value || [];
}

async function fetchWeekCalendarEvents(accessToken) {
  const now    = new Date();
  const day    = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const url = `${GRAPH}/me/calendarView` +
    `?startDateTime=${monday.toISOString()}` +
    `&endDateTime=${sunday.toISOString()}` +
    `&$select=subject,start,end,location,isOnlineMeeting,onlineMeetingUrl` +
    `&$orderby=start/dateTime asc&$top=50`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
  });
  if (!res.ok) throw new Error(`Graph week calendar: ${res.status}`);
  const data = await res.json();
  return data.value || [];
}

async function fetchCalendarEvents(accessToken) {
  const now   = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end   = new Date(now); end.setHours(23, 59, 59, 999);

  const url = `${GRAPH}/me/calendarView` +
    `?startDateTime=${start.toISOString()}` +
    `&endDateTime=${end.toISOString()}` +
    `&$select=subject,start,end,location,isOnlineMeeting,onlineMeetingUrl` +
    `&$orderby=start/dateTime asc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
  });
  if (!res.ok) throw new Error(`Graph calendar: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.value || [];
}

async function fetchTeamsChats(accessToken) {
  try {
    // Expand viewpoint to get unread count per chat
    const url = `${GRAPH}/me/chats?$expand=lastMessagePreview,viewpoint&$top=20` +
      `&$select=id,topic,chatType,lastUpdatedDateTime`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const all = data.value || [];
    // Keep only chats with unread messages
    return all.filter(c => {
      const vp = c.viewpoint;
      if (!vp) return true; // no viewpoint data — include as fallback
      if (typeof vp.unreadMessageCount === 'number') return vp.unreadMessageCount > 0;
      // fall back to date comparison if unreadMessageCount not present
      const lastRead = vp.lastMessageReadDateTime;
      if (!lastRead) return true;
      return new Date(lastRead) < new Date(c.lastUpdatedDateTime);
    });
  } catch { return []; }
}

function normalizeTeamsChats(raw) {
  return raw.map(c => ({
    id:          c.id,
    topic:       c.topic || (c.chatType === 'oneOnOne' ? 'Direct Message' : 'Group Chat'),
    chatType:    c.chatType,
    lastMessage: stripHtml(c.lastMessagePreview?.body?.content || ''),
    lastSender:  c.lastMessagePreview?.from?.user?.displayName || '',
    lastUpdated: new Date(c.lastUpdatedDateTime),
  }));
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchChatMessages(accessToken, chatId) {
  const url = `${GRAPH}/chats/${chatId}/messages?$top=10`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Chat messages: ${res.status}`);
  const data = await res.json();
  return (data.value || [])
    .filter(m => m.messageType === 'message' && m.from?.user)
    .reverse();
}

async function sendTeamsMessage(accessToken, chatId, text) {
  const url = `${GRAPH}/chats/${chatId}/messages`;
  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: { content: text } }),
  });
  if (!res.ok) throw new Error(`Send message: ${res.status}`);
  return res.json();
}

async function fetchUserProfile(accessToken) {
  const res = await fetch(`${GRAPH}/me?$select=displayName,mail,jobTitle`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Graph profile: ${res.status}`);
  return res.json();
}

// Normalise Graph email → display model
function normalizeEmails(rawEmails) {
  return rawEmails.map(e => ({
    id:       e.id,
    subject:  e.subject || '(no subject)',
    from:     e.from?.emailAddress?.name || e.from?.emailAddress?.address || 'Unknown',
    address:  e.from?.emailAddress?.address || '',
    date:     new Date(e.receivedDateTime),
    preview:  e.bodyPreview || '',
    webLink:  e.webLink || 'https://outlook.office.com/mail/',
  }));
}

// Normalise Graph calendar event → display model
function normalizeEvents(rawEvents) {
  return rawEvents.map(e => {
    const start = new Date(e.start.dateTime + (e.start.timeZone === 'UTC' ? 'Z' : ''));
    const end   = new Date(e.end.dateTime   + (e.end.timeZone   === 'UTC' ? 'Z' : ''));
    const now   = new Date();
    return {
      id:       e.id,
      subject:  e.subject || '(no title)',
      location: e.location?.displayName || (e.isOnlineMeeting ? 'Online meeting' : ''),
      start,
      end,
      isNow: now >= start && now <= end,
      joinUrl: e.onlineMeetingUrl || null,
    };
  });
}
