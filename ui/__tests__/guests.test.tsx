import { render, screen } from '@testing-library/react';
import { Guest, guestColor, initials } from '../guest';

test('initials take the first and last name, or the start of the address', () => {
  expect(initials('Alex Morgan', 'alex@example.com')).toBe('AM');
  expect(initials('Jordan  van der Lee', 'j@example.com')).toBe('JL');
  expect(initials('Cher', 'cher@example.com')).toBe('C');
  expect(initials(null, 'studio@agency.example')).toBe('S');
  expect(initials('Эльдар Джафаров', 'e@example.com')).toBe('ЭД');
});

test('a guest keeps one colour, picked from the address', () => {
  expect(guestColor('alex@example.com')).toBe(guestColor('ALEX@example.com'));
  const colors = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => guestColor(`${x}@example.com`)));
  expect(colors.size).toBeGreaterThan(1);
});

test('a guest row shows a coloured circle with the initials beside the name', () => {
  render(<Guest name="Alex Morgan" email="alex@example.com" response="Accepted" />);
  const circle = screen.getByText('AM');
  expect(circle.getAttribute('aria-hidden')).toBe('true');
  expect(circle.style.borderRadius).toBe('50%');
  expect(circle.style.background).not.toBe('');
  expect(screen.getByText('Alex Morgan')).toBeTruthy();
  expect(screen.getByText('Accepted')).toBeTruthy();
});
