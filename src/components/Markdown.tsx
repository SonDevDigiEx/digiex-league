import type { ReactNode } from 'react';

/** Inline: **bold**, *italic*, `code`. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<b key={key + i++}>{t.slice(2, -2)}</b>);
    else if (t.startsWith('`')) out.push(<code key={key + i++}>{t.slice(1, -1)}</code>);
    else out.push(<em key={key + i++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/** Small Markdown renderer for tournament rules: headings, tables, lists, quotes, rules, paragraphs. */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const l = lines[i];
    const key = 'b' + k++;
    if (!l.trim()) { i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) {
      const lvl = h[1].length;
      const content = inline(h[2], key);
      blocks.push(lvl === 1 ? <h2 key={key}>{content}</h2> : lvl === 2 ? <h3 key={key}>{content}</h3> : <h4 key={key}>{content}</h4>);
      i++; continue;
    }
    if (/^-{3,}\s*$/.test(l)) { blocks.push(<hr key={key} />); i++; continue; }
    if (l.trim().startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
      const [head, ...rest] = rows;
      const body = rest.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
      blocks.push(
        <div key={key} className="md-table"><table>
          <thead><tr>{cells(head).map((c, j) => <th key={j}>{inline(c, key + 'h' + j)}</th>)}</tr></thead>
          <tbody>{body.map((r, ri) => <tr key={ri}>{cells(r).map((c, j) => <td key={j}>{inline(c, key + ri + '_' + j)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
      continue;
    }
    if (l.startsWith('>')) {
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={key}>{q.filter(Boolean).map((x, j) => <p key={j}>{inline(x, key + j)}</p>)}</blockquote>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      blocks.push(<ul key={key}>{items.map((x, j) => <li key={j}>{inline(x, key + j)}</li>)}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#|>|\||-{3,}|\s*[-*]\s)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={key}>{inline(para.join(' '), key)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
