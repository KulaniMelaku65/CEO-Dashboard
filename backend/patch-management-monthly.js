#!/usr/bin/env node
/**
 * One-time backfill: populates This Month / Last Month values in all
 * SQLite snapshots using BC GL actuals (M-MGT-RPT account lists).
 *
 * Usage (from project root):
 *   node backend/patch-management-monthly.js
 */

const path = require('path');
// Load BC credentials: root .env has the latest key; backend .env has DB_PATH
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Database = require('better-sqlite3');
const { bc }   = require('./services/bc-client');

// M-MGT-RPT exact account lists (mirrors snapshot-builder.js)
const MGT_REV = new Set(['5013','5014','5015','5016','5017','5018','5019','5020','5021','5022','5023','5024','5025']);
const MGT_COS = new Set(['6011','6013','6014','6015','6016','6051','6052','6053','6054','6055','6056','6057']);
const MGT_SAL = new Set(['8101','8102','8103','8104','8105','8106']);
const OPEX_A  = ['7000', '8100'];
const OPEX_B  = ['8110', '9199'];
const DEP     = ['9210', '9299'];
const FIN     = ['9510', '9599'];

const inR = (a, [lo, hi]) => a >= lo && a <= hi;
const num = n  => Number(n) || 0;
const toM = v  => Math.round(v / 1e6 * 10) / 10;

function prevMonthKey(mKey) {
  const [y, m] = mKey.split('-').map(Number);
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function computeMonth(rows) {
  let rev = 0, cos = 0, sal = 0, op = 0, da = 0, fin = 0;
  rows.forEach(x => {
    const a = String(x.accountNo), v = num(x.amount);
    if (MGT_REV.has(a)) { rev += v; return; }
    if (MGT_COS.has(a)) { cos += v; return; }
    if (MGT_SAL.has(a)) { sal += v; return; }
    if (inR(a, DEP))    { da  += v; return; }
    if (inR(a, FIN))    { fin += v; return; }
    if (inR(a, OPEX_A) || inR(a, OPEX_B)) op += v;
  });
  if (rev === 0) return null; // no revenue = no meaningful monthly data
  const mRev   = toM(-rev);
  const mCos   = toM(cos);
  const mGP    = toM(-rev - cos);
  const mOpex  = toM(sal + op);
  const mEB    = toM(-rev - cos - sal - op);
  const mNet   = toM(-rev - cos - sal - op - da - fin);
  const mGPMgn = mRev ? parseFloat((mGP  / mRev * 100).toFixed(1)) : null;
  const mEBMgn = mRev ? parseFloat((mEB  / mRev * 100).toFixed(1)) : null;
  return { mRev, mCos, mGP, mGPMgn, mOpex, mEB, mEBMgn, mNet };
}

// Metric name → getter for month/last values (handles both old and new row names)
const METRIC_MAP = {
  'Revenue':         (c, p) => ({ month: c?.mRev,   last: p?.mRev   }),
  'Total Revenue':   (c, p) => ({ month: c?.mRev,   last: p?.mRev   }),
  'Cost of Sales':   (c, p) => ({ month: c?.mCos,   last: p?.mCos   }),
  'Gross Profit':    (c, p) => ({ month: c?.mGP,    last: p?.mGP    }),
  'Gross Margin %':  (c, p) => ({ month: c?.mGPMgn, last: p?.mGPMgn }),
  'Operating Exp.':  (c, p) => ({ month: c?.mOpex,  last: p?.mOpex  }),
  'Total OPEX':      (c, p) => ({ month: c?.mOpex,  last: p?.mOpex  }),
  'EBITDA':          (c, p) => ({ month: c?.mEB,    last: p?.mEB    }),
  'EBITDA Margin %': (c, p) => ({ month: c?.mEBMgn, last: p?.mEBMgn }),
  'Net Profit':      (c, p) => ({ month: c?.mNet,   last: p?.mNet   }),
};

async function main() {
  const dbPath = process.env.DB_PATH
    ? path.resolve(__dirname, process.env.DB_PATH)
    : path.join(__dirname, '../data/kifiya.db');

  console.log(`DB: ${dbPath}`);
  const db = new Database(dbPath);

  const snapshots = db.prepare('SELECT snapshot_date AS date, data FROM snapshots ORDER BY snapshot_date').all();
  console.log(`Loaded ${snapshots.length} snapshots`);
  if (snapshots.length === 0) { console.log('Nothing to do.'); return; }

  const dates   = snapshots.map(s => s.date).sort();
  const maxDate = dates[dates.length - 1];
  // Expand min by 1 month to cover "Last Month" of the earliest snapshot
  const minPrev = prevMonthKey(dates[0].slice(0, 7));
  const minDate = `${minPrev}-01`;

  console.log(`Fetching KFT_GL_Actuals from ${minDate} to ${maxDate} …`);
  console.log('(this may take a few minutes with pagination)');
  const t0      = Date.now();
  const actuals = await bc('KFT_GL_Actuals',
    `?$filter=postingDate ge ${minDate} and postingDate le ${maxDate}`);
  console.log(`  ${actuals.length} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Group by YYYY-MM
  const byMonth = {};
  actuals.forEach(x => {
    if (!x.postingDate) return;
    const k = String(x.postingDate).slice(0, 7);
    (byMonth[k] = byMonth[k] || []).push(x);
  });
  console.log(`  ${Object.keys(byMonth).length} distinct months covered`);

  const stmt = db.prepare('UPDATE snapshots SET data = ? WHERE snapshot_date = ?');

  const patch = db.transaction(() => {
    let updated = 0, skipped = 0;
    for (const { date, data } of snapshots) {
      const snap = JSON.parse(data);
      const mgmt = snap.reports?.management;
      if (!Array.isArray(mgmt) || mgmt.length === 0) { skipped++; continue; }

      const mKey = date.slice(0, 7);
      const pKey = prevMonthKey(mKey);
      const cur  = computeMonth(byMonth[mKey] || []);
      const prv  = computeMonth(byMonth[pKey] || []);

      if (!cur && !prv) { skipped++; continue; }

      let changed = false;
      mgmt.forEach(row => {
        const fn = METRIC_MAP[row.metric];
        if (!fn) return;
        const vals = fn(cur, prv);
        if (vals.month != null) { row.month = vals.month; changed = true; }
        if (vals.last  != null) { row.last  = vals.last;  changed = true; }
      });

      if (changed) { stmt.run(JSON.stringify(snap), date); updated++; }
      else skipped++;
    }
    return { updated, skipped };
  });

  const { updated, skipped } = patch();
  console.log(`\nDone — ${updated} snapshots updated, ${skipped} skipped.`);
  db.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
