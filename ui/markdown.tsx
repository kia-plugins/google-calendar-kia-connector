import type { ReactNode } from 'react';

/**
 * A small markdown renderer for transcript summaries: headings, paragraphs,
 * nested bullet and numbered lists, **bold**, *italic*, `code` and
 * [links](https://…). It builds React elements, never HTML, so a summary
 * cannot inject markup; links open only for http(s).
 */

interface Item { indent: number; ordered: boolean; text: string; children: Item[] }

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|\[[^\]]+\]\([^)\s]+\))/;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) { out.push(rest); break; }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const t = m[0];
    const key = k++;
    if (t.startsWith('`')) out.push(<code key={key} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.92em' }}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('**') || t.startsWith('__')) out.push(<strong key={key}>{inline(t.slice(2, -2))}</strong>);
    else if (t.startsWith('[')) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t)!;
      out.push(/^https?:\/\//i.test(href)
        ? <a key={key} href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-text)' }}>{inline(label)}</a>
        : label);
    } else out.push(<em key={key}>{inline(t.slice(1, -1))}</em>);
    rest = rest.slice(m.index + t.length);
  }
  return out;
}

function list(items: Item[], key: number): ReactNode {
  const Tag = items[0].ordered ? 'ol' : 'ul';
  return (
    <Tag key={key} style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {items.map((it, i) => (
        <li key={i}>
          {inline(it.text)}
          {it.children.length > 0 && list(it.children, 0)}
        </li>
      ))}
    </Tag>
  );
}

/** Lines of one list block → a tree by indentation. */
function toTree(lines: string[]): Item[] {
  const root: Item[] = [];
  const stack: Item[] = [];
  for (const line of lines) {
    const m = LIST.exec(line);
    if (!m) {
      // A wrapped continuation line belongs to the item above it.
      if (stack.length) stack[stack.length - 1].text += ` ${line.trim()}`;
      continue;
    }
    const item: Item = { indent: m[1].replace(/\t/g, '    ').length, ordered: /\d/.test(m[2]), text: m[3], children: [] };
    while (stack.length && stack[stack.length - 1].indent >= item.indent) stack.pop();
    (stack.length ? stack[stack.length - 1].children : root).push(item);
    stack.push(item);
  }
  return root;
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = HEADING.exec(line.trim());
    if (h) {
      const Tag = h[1].length <= 2 ? 'h3' : 'h4';
      blocks.push(<Tag key={i} style={{ margin: 0, fontSize: Tag === 'h3' ? 13 : 12, fontWeight: 600 }}>{inline(h[2])}</Tag>);
      i++;
      continue;
    }
    if (LIST.test(line)) {
      const start = i;
      // A list runs until a blank line followed by a non-list, non-indented line.
      while (i < lines.length && (lines[i].trim() === '' ? LIST.test(lines[i + 1] ?? '') || /^\s+\S/.test(lines[i + 1] ?? '') : LIST.test(lines[i]) || /^\s+\S/.test(lines[i]))) i++;
      blocks.push(list(toTree(lines.slice(start, i).filter((l) => l.trim())), start));
      continue;
    }
    const start = i;
    while (i < lines.length && lines[i].trim() && !HEADING.test(lines[i].trim()) && !LIST.test(lines[i])) i++;
    blocks.push(<p key={start} style={{ margin: 0 }}>{inline(lines.slice(start, i).map((l) => l.trim()).join(' '))}</p>);
  }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, lineHeight: 1.45 }}>{blocks}</div>;
}
