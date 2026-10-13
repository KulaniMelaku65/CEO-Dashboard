// Seniority ranking for job titles, used wherever a page groups employees by job title
// within a section/department and needs the most senior titles pinned to the top rather
// than sorted purely by headcount/cost. Chief and Director are matched as a literal
// prefix (e.g. "Chief Executive Officer", "Director of Finance"); Manager/Lead/Officer
// are matched anywhere in the title (word boundary) since those almost always appear at
// the END of a real title ("HR Manager", "Team Lead", "Compliance Officer") rather than
// the start. Anything that matches no tier sorts last, in whatever order the caller
// already uses as a tie-break.
const STARTS_WITH_TIERS = [
  { rank: 0, re: /^chief\b/i },
  { rank: 1, re: /^director\b/i },
]
const CONTAINS_TIERS = [
  { rank: 2, re: /\bmanager\b/i },
  { rank: 3, re: /\b(lead|officer)\b/i },
]

export function titleRank(title) {
  const t = (title || '').trim()
  for (const tier of STARTS_WITH_TIERS) if (tier.re.test(t)) return tier.rank
  for (const tier of CONTAINS_TIERS) if (tier.re.test(t)) return tier.rank
  return 4
}

// Drop-in replacement for a `(a, b) => ...` comparator that currently starts with some
// other criterion — pass that existing comparator as `tiebreak` and it runs only when
// both titles land in the same seniority tier (including "everyone else").
export function compareByTitleRank(titleOf, tiebreak) {
  return (a, b) => titleRank(titleOf(a)) - titleRank(titleOf(b)) || tiebreak(a, b)
}
