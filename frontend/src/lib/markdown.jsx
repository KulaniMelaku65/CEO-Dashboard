import { Fragment } from 'react'

// Minimal, dependency-free markdown -> React renderer for chat bubbles. Deliberately
// narrow: bold/italic/inline-code plus bullet/numbered lists and paragraphs — the subset
// LLM chat replies actually use. Always builds real React elements (never
// dangerouslySetInnerHTML), so there's no injection risk even though the source text
// comes from an LLM.
function renderInline(text, keyPrefix) {
  const parts = []
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|_[^_]+_)/g
  let lastIndex = 0
  let match
  let i = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    const token = match[0]
    if (token.startsWith('**')) {
      parts.push(<strong key={`${keyPrefix}-${i++}`}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`')) {
      parts.push(
        <code key={`${keyPrefix}-${i++}`} className="px-1 py-0.5 rounded text-[11px]" style={{ background: 'rgba(255,255,255,0.15)' }}>
          {token.slice(1, -1)}
        </code>
      )
    } else {
      parts.push(<em key={`${keyPrefix}-${i++}`}>{token.slice(1, -1)}</em>)
    }
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

// GFM-style pipe table: a header row, a `|---|:--:|--:|` separator row, then body rows.
const isTableRow = l => /^\s*\|.*\|\s*$|^\s*\S.*\|.*\S\s*$/.test(l) && l.includes('|')
const isTableSeparator = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(l)
const splitRow = l => {
  const trimmed = l.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map(c => c.trim())
}

function Table({ rows, keyPrefix }) {
  const [header, ...body] = rows
  return (
    <div className="overflow-x-auto my-1.5 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr style={{ background: 'rgba(255,255,255,0.08)' }}>
            {header.map((h, i) => (
              <th key={i} className="text-left px-2.5 py-1.5 font-bold whitespace-nowrap" style={{ borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
                {renderInline(h, `${keyPrefix}-th-${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 ? 'rgba(255,255,255,0.04)' : 'transparent' }}>
              {row.map((c, ci) => (
                <td key={ci} className="px-2.5 py-1.5 whitespace-nowrap" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  {renderInline(c, `${keyPrefix}-td-${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function renderMarkdown(text) {
  if (!text) return null
  const lines = String(text).split('\n')
  const blocks = []
  let i = 0
  let key = 0

  const isBullet  = l => /^\s*[-*]\s+/.test(l)
  const isNumbered = l => /^\s*\d+\.\s+/.test(l)
  const isHeading = l => /^#{1,4}\s+/.test(l)

  while (i < lines.length) {
    const line = lines[i]

    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitRow(line)
      i += 2
      const body = []
      while (i < lines.length && isTableRow(lines[i])) { body.push(splitRow(lines[i])); i++ }
      blocks.push(<Table key={key} rows={[header, ...body]} keyPrefix={`t${key}`} />)
      key++
      continue
    }

    if (isBullet(line)) {
      const items = []
      while (i < lines.length && isBullet(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++ }
      blocks.push(
        <ul key={key} className="list-disc pl-4 space-y-0.5 my-1">
          {items.map((it, idx) => <li key={idx}>{renderInline(it, `ul${key}-${idx}`)}</li>)}
        </ul>
      )
      key++
      continue
    }

    if (isNumbered(line)) {
      const items = []
      while (i < lines.length && isNumbered(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++ }
      blocks.push(
        <ol key={key} className="list-decimal pl-4 space-y-0.5 my-1">
          {items.map((it, idx) => <li key={idx}>{renderInline(it, `ol${key}-${idx}`)}</li>)}
        </ol>
      )
      key++
      continue
    }

    const headingMatch = /^(#{1,4})\s+(.*)$/.exec(line)
    if (headingMatch) {
      blocks.push(<p key={key} className="font-extrabold mt-1.5 mb-0.5 first:mt-0">{renderInline(headingMatch[2], `h${key}`)}</p>)
      key++
      i++
      continue
    }

    if (line.trim() === '') { i++; continue }

    const paraLines = []
    while (
      i < lines.length && lines[i].trim() !== '' &&
      !isBullet(lines[i]) && !isNumbered(lines[i]) && !isHeading(lines[i]) &&
      !(isTableRow(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      paraLines.push(lines[i])
      i++
    }
    blocks.push(
      <p key={key} className="mb-1.5 last:mb-0">
        {paraLines.map((l, idx) => (
          <Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInline(l, `p${key}-${idx}`)}
          </Fragment>
        ))}
      </p>
    )
    key++
  }

  return blocks
}
