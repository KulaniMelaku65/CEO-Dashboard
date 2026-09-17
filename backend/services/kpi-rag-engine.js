// Turns one KPI's actual value into Green/Amber/Red per PRD §4.2/4.5. Only the seven base
// types (T1–T7) have a real rule here — combined/compound type strings (e.g. "T2 (compound)",
// "T1/T3") come from the source inventory as still-being-finalized shapes with no
// machine-parseable second condition, so they intentionally evaluate to null ("insufficient
// rule to auto-evaluate yet") rather than guessing. A submitter can still record the actual
// value and a manual reason/action note for these; the CFO can tighten rag_rule_json later to
// make a specific KPI auto-evaluate once its exact compound rule is confirmed.
//
// Default bands (used when a KPI's rag_rule_json override is absent):
//   higher-is-better ratio types (T1, T2 "≥", T7): green >=100% of target, amber >=80%, red below
//   lower-is-better types (T5 duration, T2 "≤" direction): green <=100% of target, amber <=120%, red above
//   T4 zero-tolerance: green if actual === 0, red otherwise (no amber)
//   T6 variance: green within the stated tolerance, red outside it (no amber band — PRD treats
//     variance as pass/fail against the tolerance, not graded)
//   T3 milestone: green if actual >= target (N of M, or 1/1 for a plain yes/no), else red
const DEFAULT_AMBER_RATIO = 0.8

function baseType(type) {
  return String(type || '').replace(/\s*\(compound\)/i, '').split('/')[0].trim()
}

function isCompoundOrMultiType(type) {
  const t = String(type || '')
  return /compound/i.test(t) || t.includes('/')
}

// direction inferred from the target_note text (≥ vs ≤) — falls back to "higher is better"
function inferDirection(targetNote) {
  if (typeof targetNote === 'string' && targetNote.trim().startsWith('≤')) return 'lower'
  return 'higher'
}

/**
 * @param {{type: string, target_value: number|null, target_note: string|null, rag_rule_json: string|null}} kpi
 * @param {number|null} actualValue
 * @param {number|null} phasedTarget - this period's phased target (falls back to kpi.target_value)
 * @returns {'green'|'amber'|'red'|null}
 */
function evaluateRag(kpi, actualValue, phasedTarget) {
  if (actualValue == null) return null
  if (isCompoundOrMultiType(kpi.type)) return null

  const rule = kpi.rag_rule_json ? safeParse(kpi.rag_rule_json) : null
  const target = phasedTarget != null ? phasedTarget : kpi.target_value
  const type = baseType(kpi.type)
  const direction = rule?.direction || inferDirection(kpi.target_note)

  switch (type) {
    case 'T4': // zero-tolerance
      return actualValue === 0 ? 'green' : 'red'

    case 'T6': { // variance within tolerance band
      if (target == null) return null
      const tolerance = rule?.tolerancePct ?? target
      return Math.abs(actualValue) <= tolerance ? 'green' : 'red'
    }

    case 'T3': // milestone (N of M, or plain count vs target)
      if (target == null) return null
      return actualValue >= target ? 'green' : 'red'

    case 'T1': case 'T2': case 'T5': case 'T7': {
      if (target == null || target === 0) return null
      const amberRatio = rule?.amberRatio ?? DEFAULT_AMBER_RATIO
      const ratio = direction === 'lower' ? target / actualValue : actualValue / target
      if (ratio >= 1) return 'green'
      if (ratio >= amberRatio) return 'amber'
      return 'red'
    }

    default:
      return null
  }
}

function safeParse(json) {
  try { return JSON.parse(json) } catch { return null }
}

// worst-of, used by the roll-up engine — red worse than amber worse than green worse than null
const RAG_RANK = { red: 0, amber: 1, green: 2 }
function worstRag(a, b) {
  if (a == null) return b
  if (b == null) return a
  return RAG_RANK[a] <= RAG_RANK[b] ? a : b
}

module.exports = { evaluateRag, worstRag, baseType }
