// src/__tests__/connect.test.ts
import { createCalendarSource, SCOPE } from '../source';
import { eventsUrl } from '../cursor';
import { calWorld, fakeAuthChannel, fakeFolderSelectionChannel, fakeSession, instantClock, makeHost } from '../testing/harness';

const list = [
  { id: 'me@example.com', summary: 'me@example.com', primary: true, selected: true, backgroundColor: '#4285f4' },
  { id: 'team@group.calendar.google.com', summary: 'Team', summaryOverride: 'My team', selected: true },
  { id: 'holidays@group.v.calendar.google.com', summary: 'Holidays', selected: false },
];

it('connect: oauth with the calendar scope, flat picker preselecting Google-selected calendars, identifier = primary id', async () => {
  const { fetchFn } = calWorld({ calendarList: list });
  const source = createCalendarSource(makeHost(fetchFn), instantClock);
  let spec: any;
  const auth = fakeAuthChannel({
    oauth: async (scopes) => { expect(scopes).toEqual([SCOPE]); return { accessToken: 'tok' } as any; },
    pickFolders: async (s) => { spec = s; return [{ id: list[0].id, name: 'me@example.com', hasChildren: false }]; },
  });
  const res = await source.connect(auth);
  expect(spec.modes).toEqual([{ key: 'calendars', label: 'Calendars' }]);
  expect(spec.multiSelect).toBe(true);
  expect(spec.purpose).toBe('connect');
  expect(spec.selected.map((n: any) => n.id)).toEqual(['me@example.com', 'team@group.calendar.google.com']);
  expect(await spec.roots('calendars')).toEqual([
    { id: 'me@example.com', name: 'me@example.com', hasChildren: false },
    { id: 'team@group.calendar.google.com', name: 'My team', hasChildren: false },
    { id: 'holidays@group.v.calendar.google.com', name: 'Holidays', hasChildren: false },
  ]);
  expect(res).toEqual({ identifier: 'me@example.com', config: { folderRoots: [{ id: 'me@example.com', name: 'me@example.com' }] } });
});

it('connect: empty selection throws', async () => {
  const { fetchFn } = calWorld({ calendarList: list });
  const source = createCalendarSource(makeHost(fetchFn), instantClock);
  const auth = fakeAuthChannel({ oauth: async () => ({ accessToken: 't' }) as any, pickFolders: async () => [] });
  await expect(source.connect(auth)).rejects.toThrow(/no calendars selected/);
});

it('reauthenticate: same primary id passes (case-insensitive), different throws', async () => {
  const { fetchFn } = calWorld({ calendarList: list });
  const source = createCalendarSource(makeHost(fetchFn), instantClock);
  const auth = fakeAuthChannel({ oauth: async () => ({ accessToken: 't' }) as any });
  await expect(source.reauthenticate!({ identifier: ' ME@example.com ' } as any, auth)).resolves.toBeUndefined();
  await expect(source.reauthenticate!({ identifier: 'other@example.com' } as any, auth)).rejects.toThrow(/signed in as me@example.com/);
});

it('manageFolders: current roots preselected; removed calendars archived and dropped from the cursor', async () => {
  const { fetchFn } = calWorld({ calendarList: list });
  const source = createCalendarSource(makeHost(fetchFn), instantClock);
  const session = fakeSession({
    credentials: { accessToken: 't' } as any,
    account: { config: { folderRoots: [{ id: 'me@example.com', name: 'me' }, { id: 'team@group.calendar.google.com', name: 'Team' }] },
      cursor: { v: 1, since: 'S', calendars: { 'me@example.com': { syncToken: 'a', fullAt: 'F' }, 'team@group.calendar.google.com': { syncToken: 'b', fullAt: 'F' } } } } as any,
  });
  const channel = fakeFolderSelectionChannel({
    pickFolders: async () => [{ id: 'me@example.com', name: 'me', hasChildren: false }, { id: 'holidays@group.v.calendar.google.com', name: 'Holidays', hasChildren: false }],
  });
  const upd = await source.manageFolders!(session, channel);
  expect(channel.specs[0].purpose).toBe('manage');
  expect(channel.specs[0].selected!.map((n) => n.id)).toEqual(['me@example.com', 'team@group.calendar.google.com']);
  expect(upd.config.folderRoots.map((r) => r.id)).toEqual(['me@example.com', 'holidays@group.v.calendar.google.com']);
  expect(upd.archiveScopeRootIds).toEqual(['team@group.calendar.google.com']);
  expect(upd.cursor).toEqual({ v: 1, since: 'S', calendars: { 'me@example.com': { syncToken: 'a', fullAt: 'F' } } });
});

it('request shape: full and incremental differ only by timeMin/timeMax vs syncToken', () => {
  const full = new URL(eventsUrl('a@b', { timeMin: 'X', timeMax: 'Y' }));
  const inc = new URL(eventsUrl('a@b', { syncToken: 'T' }));
  const strip = (u: URL, ks: string[]) => { ks.forEach((k) => u.searchParams.delete(k)); return u.toString(); };
  expect(strip(full, ['timeMin', 'timeMax'])).toBe(strip(inc, ['syncToken']));
  expect(inc.searchParams.get('singleEvents')).toBe('true');
  expect(inc.searchParams.get('showDeleted')).toBe('true');
  expect(inc.searchParams.get('maxResults')).toBe('2500');
  expect(full.pathname).toBe('/calendar/v3/calendars/a%40b/events');
});
