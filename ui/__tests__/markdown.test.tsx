import { render } from '@testing-library/react';
import { Markdown } from '../markdown';

const html = (src: string) => {
  const { container } = render(<Markdown source={src} />);
  return container;
};

test('headings, paragraphs and inline marks', () => {
  const c = html('# Meeting Summary\n\nWe **agreed** on *scope* and `v2`, see [doc](https://x.test/d).');
  expect(c.querySelector('h3')?.textContent).toBe('Meeting Summary');
  expect(c.querySelector('p strong')?.textContent).toBe('agreed');
  expect(c.querySelector('p em')?.textContent).toBe('scope');
  expect(c.querySelector('p code')?.textContent).toBe('v2');
  const a = c.querySelector('p a') as HTMLAnchorElement;
  expect(a.textContent).toBe('doc');
  expect(a.getAttribute('href')).toBe('https://x.test/d');
  expect(a.getAttribute('target')).toBe('_blank');
});

test('nested bullet lists keep their structure', () => {
  const c = html('*   **Technical Updates:**\n    *   SEO removals\n    *   Dashboards fixed\n*   Next steps');
  const top = c.querySelector('ul')!;
  expect(top.children).toHaveLength(2);
  expect(top.children[0].querySelector('strong')?.textContent).toBe('Technical Updates:');
  expect(top.children[0].querySelectorAll('ul > li')).toHaveLength(2);
  expect(top.children[1].textContent).toBe('Next steps');
});

test('numbered lists become ol', () => {
  const c = html('1. one\n2. two');
  expect(c.querySelectorAll('ol > li')).toHaveLength(2);
});

test('never injects HTML and ignores non-http links', () => {
  const c = html('<img src=x onerror=alert(1)> [x](javascript:alert(1))');
  expect(c.querySelector('img')).toBeNull();
  expect(c.querySelector('a')).toBeNull();
  expect(c.textContent).toContain('<img');
});
