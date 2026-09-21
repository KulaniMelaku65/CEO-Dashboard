const { bc } = require('./bc-client');

// Every Procurement endpoint is best-effort: one 404/empty page must not take down the rest
// of the snapshot (or the other procurement pages). `endpoints` reports each one's status so
// the UI can say exactly which sources are connected, empty, or missing instead of silently
// rendering blank charts.
const ENDPOINT_NAMES = {
  poSummary:    'KFT_PO_Summary',
  poAging:      'KFT_PO_Aging',
  poVariance:   'KFT_PO_Variance',
  commitments:  'KFT_PO_Commitments',
  spend:        'KFT_Procrument_Spend',
  requisitions: 'KFT_Purchase_Requisitions',
  pendingPr:    'KFT_Pending_PR_Approvals',
  budget:       'KFT_Procrument_Budget',
  doa:          'KFT_Procrument_DOA_Breach',
  auditTrail:   'KFT_Procrument_Audit_Trail',
};

const BC_BLANK_DATE = /^0001-/;
const cleanDate = d => (d && !BC_BLANK_DATE.test(d) ? d : null);
// A blank currency code in Business Central means the local currency (ETB).
const normCur = c => (c && c.trim() ? c.trim() : 'ETB');
const round2 = n => Math.round((n || 0) * 100) / 100;
const monthOf = d => (d || '').slice(0, 7);

// The 20.1 budget is the corporate operating budget (no FX in its allocation rows); the
// 10.x budgets are the SAFEE programme budgets, whose `amount` is USD (commitment rows
// carry both — amountLCY/amount ≈ 126, the ETB/USD rate — and their allocations only carry
// `amount`). Budgets are never summed across currencies; each is reported in its own.
const budgetCurrency = name => (/^10\./.test(name) ? 'USD' : 'ETB');

function groupSum(rows, keyFn, valFns) {
  const m = new Map();
  rows.forEach(r => {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, { key: k, n: 0, ...Object.fromEntries(Object.keys(valFns).map(f => [f, 0])) });
    const g = m.get(k);
    g.n++;
    Object.entries(valFns).forEach(([f, fn]) => { g[f] += fn(r) || 0; });
  });
  return [...m.values()];
}

async function buildProcurement(asOfDate) {
  const endpoints = {};
  const fetched = {};
  await Promise.all(Object.entries(ENDPOINT_NAMES).map(async ([key, name]) => {
    try {
      const rows = await bc(name);
      fetched[key] = rows;
      endpoints[key] = { name, ok: true, rows: rows.length };
    } catch (e) {
      fetched[key] = [];
      endpoints[key] = { name, ok: false, rows: 0, error: /404/.test(e.message) ? 'Not found (404) — endpoint is not published in Business Central under this name' : e.message.slice(0, 120) };
    }
  }));

  const poSummary = fetched.poSummary;
  const doaByPo = new Map(fetched.doa.map(r => [r.poNo, r]));
  const agingByPo = new Map(fetched.poAging.map(r => [r.poNo, r]));
  const poCurrency = new Map(poSummary.map(r => [r.poNo, normCur(r.currencyCode)]));
  const vendorName = new Map(poSummary.map(r => [r.vendorNo, r.vendorName]));
  fetched.doa.forEach(r => { if (!vendorName.has(r.vendorNo)) vendorName.set(r.vendorNo, r.vendorName); });

  // One row per PO, joined across Summary + Aging + DOA (all three are keyed by poNo and
  // describe the same 1:1 set of purchase orders). Compact keys — the frontend aggregates
  // these client-side so filters/drilldowns stay interactive without new server round-trips.
  const pos = poSummary.map(r => {
    const a = agingByPo.get(r.poNo);
    const d = doaByPo.get(r.poNo);
    return {
      no: r.poNo, vn: r.vendorNo, v: r.vendorName, st: r.status,
      od: cleanDate(r.orderDate), dd: cleanDate(r.dueDate), erd: cleanDate(a?.expectedReceiptDate),
      cur: normCur(r.currencyCode), amt: round2(r.amount), vat: round2(r.amountInclVAT),
      bu: r.globalDim2 || '', dim1: r.globalDim1 || '',
      rec: !!r.completelyReceived, inv: !!r.partiallyInvoiced, rni: round2(a?.amtRcdNotInvoicedLCY),
      ap: d?.approverId || '', asg: d?.assignedUserId || '',
      lim: d ? d.purchaseAmountApprovalLimit : null,
      unl: !!d?.unlimitedPurchaseApproval, adm: !!d?.approvalAdministrator,
    };
  });

  // PO variance (PO vs receipt vs invoice) — aggregated here rather than shipped line-by-line
  // (2k+ lines) since the page only needs totals, a by-BU/vendor split and the largest lines.
  // Lines carry no currency of their own, so it's looked up from the parent PO; foreign-
  // currency lines are reported separately and never summed into the ETB totals.
  const varLines = fetched.poVariance.map(l => {
    const cur = poCurrency.get(l.poNo) || 'ETB';
    const recAmt = l.quantity ? l.amount * (l.quantityReceived / l.quantity) : 0;
    const invAmt = l.quantity ? l.amount * (l.quantityInvoiced / l.quantity) : 0;
    return { ...l, cur, recAmt, invAmt };
  });
  const varEtb = varLines.filter(l => l.cur === 'ETB');
  const varForeign = varLines.filter(l => l.cur !== 'ETB');
  const variance = {
    lines: varLines.length,
    etbLines: varEtb.length,
    totals: {
      ordered: round2(varEtb.reduce((s, l) => s + l.amount, 0)),
      received: round2(varEtb.reduce((s, l) => s + l.recAmt, 0)),
      invoiced: round2(varEtb.reduce((s, l) => s + l.invAmt, 0)),
      receivedNotInvoiced: round2(varEtb.reduce((s, l) => s + (l.amtRcdNotInvoiced || 0), 0)),
      outstandingInclVat: round2(varEtb.reduce((s, l) => s + l.outstandingAmount, 0)),
      linesWithReceipt: varEtb.filter(l => l.quantityReceived > 0).length,
      linesWithInvoice: varEtb.filter(l => l.quantityInvoiced > 0).length,
    },
    foreign: groupSum(varForeign, l => l.cur, { ordered: l => l.amount }).map(g => ({ currency: g.key, lines: g.n, ordered: round2(g.ordered) })),
    byBU: groupSum(varEtb, l => l.globalDim2 || '', { ordered: l => l.amount, outstanding: l => l.outstandingAmount })
      .map(g => ({ bu: g.key, lines: g.n, ordered: round2(g.ordered), outstanding: round2(g.outstanding) }))
      .sort((a, b) => b.ordered - a.ordered).slice(0, 15),
    byVendor: groupSum(varEtb, l => l.vendorNo, { ordered: l => l.amount, outstanding: l => l.outstandingAmount })
      .map(g => ({ vn: g.key, v: vendorName.get(g.key) || g.key, lines: g.n, ordered: round2(g.ordered), outstanding: round2(g.outstanding) }))
      .sort((a, b) => b.ordered - a.ordered).slice(0, 15),
    topLines: [...varEtb].sort((a, b) => b.amount - a.amount).slice(0, 25).map(l => ({
      po: l.poNo, ln: l.lineNo, no: l.no, desc: l.description, vn: l.vendorNo, v: vendorName.get(l.vendorNo) || l.vendorNo,
      qty: l.quantity, qr: l.quantityReceived, qi: l.quantityInvoiced, amt: round2(l.amount), out: round2(l.outstandingAmount), bu: l.globalDim2 || '',
    })),
  };

  // Commitment ledger entries (amountLCY is the ETB figure and is negative by BC convention
  // for a commitment; `amount` is the USD-equivalent). Shown as positive "committed".
  const com = fetched.commitments;
  const commitments = {
    entries: com.length,
    totals: { lcy: round2(-com.reduce((s, r) => s + r.amountLCY, 0)), usd: round2(-com.reduce((s, r) => s + r.amount, 0)) },
    dateFrom: com.map(r => r.date).sort()[0] || null,
    dateTo: com.map(r => r.date).sort().slice(-1)[0] || null,
    byMonth: groupSum(com, r => monthOf(r.date), { lcy: r => -r.amountLCY, usd: r => -r.amount })
      .map(g => ({ m: g.key, n: g.n, lcy: round2(g.lcy), usd: round2(g.usd) })).sort((a, b) => a.m.localeCompare(b.m)),
    byBU: groupSum(com, r => r.globalDim2 || '', { lcy: r => -r.amountLCY, usd: r => -r.amount })
      .map(g => ({ bu: g.key, n: g.n, lcy: round2(g.lcy), usd: round2(g.usd) })).sort((a, b) => b.lcy - a.lcy).slice(0, 15),
    byBudget: groupSum(com, r => r.budgetName, { lcy: r => -r.amountLCY, usd: r => -r.amount })
      .map(g => ({ budget: g.key, n: g.n, lcy: round2(g.lcy), usd: round2(g.usd) })),
    topDocs: groupSum(com, r => r.sourceDocNo || r.documentNo, { lcy: r => -r.amountLCY, usd: r => -r.amount })
      .map(g => ({ doc: g.key, n: g.n, lcy: round2(g.lcy), usd: round2(g.usd) }))
      .sort((a, b) => b.lcy - a.lcy).slice(0, 25),
  };

  // Procurement spend — posted purchase-invoice lines, ETB, ex-VAT (`amount`). Zero-amount
  // placeholder lines (blank type/vendor) are dropped. Vendor names aren't on this endpoint,
  // so they're resolved from the PO list (covers ~96% of spend by value); anything else
  // falls back to the vendor number in the UI.
  const spendRows = fetched.spend.filter(r => r.amount !== 0 || r.vendorNo).map(r => ({
    d: r.postingDate, doc: r.documentNo, vn: r.vendorNo, v: vendorName.get(r.vendorNo) || '',
    t: (r.type || '').trim() || 'Other', pg: r.genProdPostingGroup || '', gl: r.no || '',
    desc: r.description || '', amt: round2(r.amount), bu: r.globalDim2 || '',
  }));

  // Budget vs commitments per budget name, each in its own currency (see budgetCurrency).
  const bud = fetched.budget;
  const budgets = [...new Set(bud.map(r => r.budgetName))].sort().map(name => {
    const rows = bud.filter(r => r.budgetName === name);
    const alloc = rows.filter(r => r.transactionType === 'Allocation');
    const comm = rows.filter(r => r.transactionType === 'Commitment');
    const cur = budgetCurrency(name);
    const allocated = alloc.reduce((s, r) => s + r.amount, 0);
    const committed = -comm.reduce((s, r) => s + r.amount, 0);
    const months = new Map();
    alloc.forEach(r => { const k = monthOf(r.date); months.set(k, { m: k, allocated: 0, committed: 0, ...months.get(k) }); months.get(k).allocated += r.amount; });
    comm.forEach(r => { const k = monthOf(r.date); months.set(k, { m: k, allocated: 0, committed: 0, ...months.get(k) }); months.get(k).committed -= r.amount; });
    const dimKey = cur === 'USD' ? (r => r.budgetDim2 || '(none)') : (r => r.globalDim2 || '(none)');
    const byDim = groupSum(rows, dimKey, {
      allocated: r => (r.transactionType === 'Allocation' ? r.amount : 0),
      committed: r => (r.transactionType === 'Commitment' ? -r.amount : 0),
    }).map(g => ({ unit: g.key, allocated: round2(g.allocated), committed: round2(g.committed) }))
      .sort((a, b) => b.allocated - a.allocated).slice(0, 15);
    return {
      name, currency: cur,
      allocated: round2(allocated), committed: round2(committed),
      committedLcy: round2(-comm.reduce((s, r) => s + r.amountLCY, 0)),
      utilizationPct: allocated > 0 ? round2((committed / allocated) * 100) : null,
      entries: rows.length,
      dateFrom: alloc.map(r => r.date).sort()[0] || null,
      dateTo: alloc.map(r => r.date).sort().slice(-1)[0] || null,
      dimLabel: cur === 'USD' ? 'Intervention (budget dim 2)' : 'Business unit',
      byDim,
      monthly: [...months.values()].map(x => ({ m: x.m, allocated: round2(x.allocated), committed: round2(x.committed) })).sort((a, b) => a.m.localeCompare(b.m)),
    };
  });

  return {
    asOfDate,
    endpoints,
    po: { rows: pos },
    variance,
    commitments,
    spend: { rows: spendRows },
    budget: { budgets },
    requisitions: { rows: fetched.requisitions.length },
    pendingPr: { rows: fetched.pendingPr.length },
  };
}

module.exports = { buildProcurement };
