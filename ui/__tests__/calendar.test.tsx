import { act, fireEvent, render, screen, within } from '@testing-library/react';
import CalendarPage, { __resetMemo } from '../calendar';

const ev = (id: string, acc: string, cal: string, key: string, start: string, end: string) => ({
  id, accountId: acc, title: 'Design review', metadata: { calendarId: cal, calendarName: cal, calendarColor: '#4285f4',
    occurrenceKey: key, start, end, allDay: false, selfResponse: 'accepted', attendees: [], conferenceUrl: null, location: null } });

async function mount(events: any[], transcripts: any[] = [], accounts?: any[], hold?: (ch: string, q: any) => boolean) {
  const invoke = jest.fn(async (ch: string, q: any) => {
    if (hold?.(ch, q)) return new Promise(() => {}); // never answers

    // The real channel answers with the {state, seq, rev} envelope.
    if (ch === 'app:get-state') return { seq: 1, rev: 1, state: { accounts: accounts ?? [
      { account: { id: 'A', source: 'google-calendar', identifier: 'me@work.com', config: { folderRoots: [{ id: 'work', name: 'Work' }] } } },
      { account: { id: 'B', source: 'google-calendar', identifier: 'me@home.com', config: { folderRoots: [{ id: 'home', name: 'Home' }] } } },
      { account: { id: 'M', source: 'meetings', identifier: 'local' } },
    ] } };
    if (ch === 'search:query') {
      const src = q.type === 'calendar.event'
        ? events.filter((e) => e.accountId === q.account)
        : q.account === 'M' ? transcripts : [];
      return src.slice(q.offset, q.offset + q.limit);
    }
    return null;
  });
  (window as any).kiagent = { invoke, on: () => () => {} };
  const navigate = jest.fn();
  let view!: ReturnType<typeof render>;
  // The mocked invokes resolve at once; act flushes the whole first refresh.
  await act(async () => {
    view = render(<CalendarPage params={{ date: '2026-09-24' }} navigate={navigate} />);
    await new Promise((r) => setTimeout(r, 0));
  });
  return { invoke, navigate, ...view };
}

// Hidden calendars persist in localStorage and the page memo outlives a
// mount; no test may inherit another's.
beforeEach(() => { localStorage.clear(); __resetMemo(); });

const shared = [
  ev('1', 'A', 'work', 'K', '2026-09-24T08:00:00.000Z', '2026-09-24T09:00:00.000Z'),
  ev('2', 'B', 'home', 'K', '2026-09-24T08:00:00.000Z', '2026-09-24T09:00:00.000Z'),
];

it('a two-account invite renders once', async () => {
  await mount(shared);
  expect(await screen.findAllByText('Design review')).toHaveLength(1);
});

it('toggling a calendar hides only its events', async () => {
  const other = ev('3', 'B', 'home', 'L', '2026-09-24T12:00:00.000Z', '2026-09-24T13:00:00.000Z');
  await mount([...shared, { ...other, title: 'Dentist' }]);
  await screen.findByText('Dentist');
  await act(async () => { fireEvent.click(screen.getByLabelText('Home')); });
  expect(screen.queryByText('Dentist')).toBeNull();
  expect(screen.getAllByText('Design review')).toHaveLength(1); // still visible via Work
});

it('shows a transcript badge and opens the transcript', async () => {
  const { navigate } = await mount(shared, [{ id: 't', createdAt: '2026-09-24T08:00:00.000Z', ingestedAt: '2026-09-24T09:10:00.000Z',
    markdown: '## Summary\n- decided X', metadata: { meetingId: 'm1', calendarEvent: { occurrenceKey: 'K' } } }]);
  const block = await screen.findByText('Design review');
  await screen.findByLabelText('Has transcript');
  await act(async () => { fireEvent.click(block); });
  expect(screen.getByText('decided X')).toBeTruthy();
  fireEvent.click(screen.getByText('Open transcript'));
  expect(navigate).toHaveBeenCalledWith('transcripts', { anchor: 'm1' });
});

it('switches to month view', async () => {
  await mount(shared);
  await screen.findByText('Design review');
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(screen.getByRole('heading', { name: 'September 2026' })).toBeTruthy();
});

it('clicking a day lists all its meetings; one opens its details and Back returns to the day', async () => {
  const dentist = { ...ev('3', 'B', 'home', 'L', '2026-09-24T12:00:00.000Z', '2026-09-24T13:00:00.000Z'), title: 'Dentist' };
  const nextDay = { ...ev('4', 'A', 'work', 'N', '2026-09-25T12:00:00.000Z', '2026-09-25T13:00:00.000Z'), title: 'Tomorrow thing' };
  await mount([...shared, dentist, nextDay]);
  await screen.findByText('Dentist');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /all meetings on .*24/i })); });
  const panel = screen.getByRole('complementary', { name: 'Day' });
  expect(within(panel).getByText('Design review')).toBeTruthy();
  expect(within(panel).getByText('Dentist')).toBeTruthy();
  expect(within(panel).queryByText('Tomorrow thing')).toBeNull();
  await act(async () => { fireEvent.click(within(panel).getByText('Dentist')); });
  const details = screen.getByRole('complementary', { name: 'Event details' });
  expect(within(details).getByRole('heading', { name: 'Dentist' })).toBeTruthy();
  await act(async () => { fireEvent.click(within(details).getByRole('button', { name: /back/i })); });
  expect(screen.getByRole('complementary', { name: 'Day' })).toBeTruthy();
});

it('month view: clicking a date opens that day', async () => {
  await mount(shared);
  await screen.findByText('Design review');
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /all meetings on .*24/i })); });
  expect(within(screen.getByRole('complementary', { name: 'Day' })).getByText('Design review')).toBeTruthy();
});

it('the side panel floats over the calendar instead of taking width from it', async () => {
  await mount(shared);
  await act(async () => { fireEvent.click(await screen.findByText('Design review')); });
  const panel = screen.getByRole('complementary', { name: 'Event details' });
  expect(panel.style.position).toBe('absolute');
  expect(panel.parentElement?.style.position).toBe('relative');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /all meetings on .*24/i })); });
  expect(screen.getByRole('complementary', { name: 'Day' }).style.position).toBe('absolute');
});

it('the event panel renders the transcript summary as markdown', async () => {
  await mount(shared, [{ id: 't', createdAt: '2026-09-24T08:00:00.000Z', ingestedAt: '2026-09-24T09:10:00.000Z',
    markdown: '## Summary\n\n## Итоги\n\n*   **Technical Updates:**\n    *   SEO removals\n\n## Transcript\n**Me**: hi',
    metadata: { meetingId: 'm1', calendarEvent: { occurrenceKey: 'K' } } }]);
  await act(async () => { fireEvent.click(await screen.findByText('Design review')); });
  const section = screen.getByRole('region', { name: 'Linked transcript' });
  expect(within(section).getByText('Technical Updates:').tagName).toBe('STRONG');
  expect(within(section).getByText('SEO removals')).toBeTruthy();
  expect(section.textContent).not.toContain('**');
  expect(section.textContent).not.toContain('hi');
});

it('Open in Google signs in as the account the event came from', async () => {
  const onB = { ...ev('9', 'B', 'home', 'Z', '2026-09-24T14:00:00.000Z', '2026-09-24T15:00:00.000Z'),
    title: 'Home thing', url: 'https://www.google.com/calendar/event?eid=abc' };
  await mount([onB]);
  await act(async () => { fireEvent.click(await screen.findByText('Home thing')); });
  const link = screen.getByRole('link', { name: 'Open in Google' }) as HTMLAnchorElement;
  const u = new URL(link.href);
  expect(u.searchParams.get('eid')).toBe('abc');
  expect(u.searchParams.get('authuser')).toBe('me@home.com');
});

it('Join opens Meet as the account the event came from; other links stay as they are', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-24T13:00:00.000Z'));
  const meet = { ...ev('9', 'B', 'home', 'Z', '2026-09-24T14:00:00.000Z', '2026-09-24T15:00:00.000Z'), title: 'Meet thing' };
  meet.metadata = { ...meet.metadata, conferenceUrl: 'https://meet.google.com/abc-defg-hij' } as any;
  const zoom = { ...ev('8', 'B', 'home', 'Y', '2026-09-24T16:00:00.000Z', '2026-09-24T17:00:00.000Z'), title: 'Zoom thing' };
  zoom.metadata = { ...zoom.metadata, conferenceUrl: 'https://zoom.us/j/123?pwd=x' } as any;
  await mount([meet, zoom]);
  await act(async () => { fireEvent.click(await screen.findByText('Meet thing')); });
  const join = new URL((screen.getByRole('link', { name: 'Join' }) as HTMLAnchorElement).href);
  expect(join.host).toBe('meet.google.com');
  expect(join.searchParams.get('authuser')).toBe('me@home.com');
  await act(async () => { fireEvent.click(screen.getByText('Zoom thing')); });
  expect((screen.getByRole('link', { name: 'Join' }) as HTMLAnchorElement).href).toBe('https://zoom.us/j/123?pwd=x');
  (Date.now as jest.Mock).mockRestore();
});

it('the page leaves its title to the host and leads with the range', async () => {
  await mount(shared);
  expect(screen.queryByRole('heading', { name: 'Calendar' })).toBeNull();
  expect(screen.getByRole('heading', { name: /^21 – .*2026$/ })).toBeTruthy();
});

it("the transcript card shows the meeting's length, and none for a record without it", async () => {
  const doc = (durationMs?: number) => [{ id: 't', createdAt: '2026-09-24T08:00:00.000Z', ingestedAt: '2026-09-24T09:10:00.000Z',
    markdown: '## Summary\n- decided X', metadata: { meetingId: 'm1', durationMs, calendarEvent: { occurrenceKey: 'K' } } }];
  const first = await mount(shared, doc(48 * 60_000));
  await act(async () => { fireEvent.click(await screen.findByText('Design review')); });
  expect(within(screen.getByRole('region', { name: 'Linked transcript' })).getByText('48 min')).toBeTruthy();
  first.unmount();
  await mount(shared, doc(undefined));
  await act(async () => { fireEvent.click(await screen.findByText('Design review')); });
  expect(within(screen.getByRole('region', { name: 'Linked transcript' })).queryByText(/ min$/)).toBeNull();
});

it('events paint without waiting for the transcripts query', async () => {
  await mount(shared, [], undefined, (ch, q) => ch === 'search:query' && q.type === 'meeting.transcript');
  expect(screen.getAllByText('Design review')).toHaveLength(1);
});

it('a revisit paints the last events at once, before any query answers', async () => {
  const first = await mount(shared);
  first.unmount();
  await mount([], [], undefined, () => true);
  expect(screen.getAllByText('Design review')).toHaveLength(1);
  expect(screen.getByLabelText('Work')).toBeTruthy(); // the rail's calendars too
});

it('every search names its account, so it can use the per-account index', async () => {
  const { invoke } = await mount(shared);
  const searches = invoke.mock.calls.filter(([ch]) => ch === 'search:query').map(([, q]) => q);
  expect(searches.filter((q) => q.type === 'calendar.event').map((q) => q.account).sort()).toEqual(['A', 'B']);
  expect(searches.filter((q) => q.type === 'meeting.transcript').map((q) => q.account)).toEqual(['M']);
});
