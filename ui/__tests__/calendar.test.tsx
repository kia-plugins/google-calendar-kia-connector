import { act, fireEvent, render, screen } from '@testing-library/react';
import CalendarPage from '../calendar';

const ev = (id: string, acc: string, cal: string, key: string, start: string, end: string) => ({
  id, accountId: acc, title: 'Design review', metadata: { calendarId: cal, calendarName: cal, calendarColor: '#4285f4',
    occurrenceKey: key, start, end, allDay: false, selfResponse: 'accepted', attendees: [], conferenceUrl: null, location: null } });

async function mount(events: any[], transcripts: any[] = [], accounts?: any[]) {
  const invoke = jest.fn(async (ch: string, q: any) => {
    if (ch === 'app:get-state') return { accounts: accounts ?? [
      { account: { id: 'A', source: 'google-calendar', identifier: 'me@work.com', config: { folderRoots: [{ id: 'work', name: 'Work' }] } } },
      { account: { id: 'B', source: 'google-calendar', identifier: 'me@home.com', config: { folderRoots: [{ id: 'home', name: 'Home' }] } } },
    ] };
    if (ch === 'search:query') {
      const src = q.type === 'calendar.event' ? events : transcripts;
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
  expect(screen.getByText('September 2026')).toBeTruthy();
});
