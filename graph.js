// Microsoft Graph API helpers

const GRAPH = 'https://graph.microsoft.com/v1.0';

async function fetchEmails(accessToken) {
  const url = `${GRAPH}/me/messages` +
    `?$filter=isRead eq false` +
    `&$top=10` +
    `&$orderby=receivedDateTime desc` +
    `&$select=subject,from,receivedDateTime,bodyPreview`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Graph emails: ${res.status} ${res.statusText}`);
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
