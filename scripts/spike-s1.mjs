// scripts/spike-s1.mjs — usage:
//   TOKEN=<access token with calendar.readonly> CAL=primary node scripts/spike-s1.mjs full
//   TOKEN=... CAL=primary SYNC=<token> node scripts/spike-s1.mjs inc
// Get a token from https://developers.google.com/oauthplayground (scope calendar.readonly).
const { TOKEN, CAL = 'primary', SYNC } = process.env;
const mode = process.argv[2];
const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL)}/events`;
const now = Date.now();
let pageToken;
let pages = 0;
const out = [];
let next;
do {
  const u = new URL(base);
  u.searchParams.set('singleEvents', 'true');
  u.searchParams.set('showDeleted', 'true');
  u.searchParams.set('maxResults', '2500');
  if (mode === 'full') {
    u.searchParams.set('timeMin', new Date(now - 365 * 864e5).toISOString());
    u.searchParams.set('timeMax', new Date(now + 400 * 864e5).toISOString());
  } else {
    u.searchParams.set('syncToken', SYNC);
  }
  if (pageToken) u.searchParams.set('pageToken', pageToken);
  const r = await fetch(u, { headers: { authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const j = await r.json();
  pages++;
  out.push(...j.items);
  pageToken = j.nextPageToken;
  next = j.nextSyncToken;
} while (pageToken);
console.log(JSON.stringify({ pages, count: out.length, nextSyncToken: next,
  sample: out.filter((e) => e.status === 'cancelled').slice(0, 20) }, null, 2));
