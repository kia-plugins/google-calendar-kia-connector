import { render, screen } from '@testing-library/react';
import type { EventDoc, Occurrence, TranscriptDoc } from '../data';
import { Week } from '../week';
import { Month } from '../month';

const day = new Date(2026, 8, 25);
const at = (h: number, m: number) => new Date(2026, 8, 25, h, m).toISOString();

function occ(key: string, title: string, start: string, end: string): Occurrence {
  const primary: EventDoc = {
    id: key, accountId: 'A', title,
    metadata: {
      calendarId: 'c', calendarName: 'c', calendarColor: '#e8710a', occurrenceKey: key, start, end, allDay: false,
      selfResponse: 'accepted', attendees: [], conferenceUrl: null, location: null,
    },
  };
  return { key, primary, copies: [primary] };
}

const transcript: TranscriptDoc = { id: 't', createdAt: null, ingestedAt: at(9, 0), markdown: null, metadata: {} };

function week(occurrences: Occurrence[], withTranscript: string[] = []) {
  render(
    <Week
      days={[day]}
      occurrences={occurrences}
      transcripts={new Map(withTranscript.map((k) => [k, transcript]))}
      onSelect={() => {}}
      onPickDay={() => {}}
    />,
  );
}

const box = (title: string) => screen.getByText(title).closest('button') as HTMLButtonElement;

test('back-to-back short meetings never overlap and each has its own border', () => {
  week([occ('a', 'Mi Daily', at(9, 30), at(9, 40)), occ('b', 'Product daily', at(9, 40), at(9, 50))]);
  const a = box('Mi Daily');
  const b = box('Product daily');
  expect(parseFloat(a.style.top) + parseFloat(a.style.height)).toBeLessThan(parseFloat(b.style.top));
  for (const el of [a, b]) {
    expect(el.style.borderStyle).toBe('solid');
    expect(el.style.borderWidth).toBe('1px 1px 1px 3px');
  }
});

test('a 10-minute meeting uses really small text and drops the time line', () => {
  week([occ('a', 'Mi Daily', at(9, 30), at(9, 40))]);
  expect(screen.getByText('Mi Daily').style.fontSize).toBe('8px');
  expect(box('Mi Daily').textContent).not.toMatch(/ – /);
});

test('an hour-long meeting keeps the regular title and its time', () => {
  week([occ('a', 'Planning', at(10, 0), at(11, 0))]);
  expect(screen.getByText('Planning').style.fontSize).toBe('11.5px');
  expect(box('Planning').textContent).toMatch(/ – /);
});

test('a meeting with a transcript shows a mic icon, not a dot', () => {
  week([occ('a', 'Planning', at(10, 0), at(11, 0))], ['a']);
  const badge = screen.getByLabelText('Has transcript');
  expect(badge.tagName.toLowerCase()).toBe('svg');
  expect(document.body.textContent).not.toContain('●');
});

test('month view marks a transcript with the mic icon too', () => {
  render(
    <Month
      grid={[day]}
      month={8}
      occurrences={[occ('a', 'Planning', at(10, 0), at(11, 0))]}
      transcripts={new Map([['a', transcript]])}
      onSelect={() => {}}
      onPickDay={() => {}}
    />,
  );
  expect(screen.getByLabelText('Has transcript').tagName.toLowerCase()).toBe('svg');
  expect(document.body.textContent).not.toContain('●');
});
