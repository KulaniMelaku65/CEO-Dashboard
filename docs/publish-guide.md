# Publishing the Dashboard Queries on Business Central

You have **4 query objects** to publish (in `bc-al/queries/`). They were
built from your actual Chart of Accounts, Account Schedule (M-MGT-RPT), and
G/L Budgets, so the account ranges and budget name are already correct.

## The 4 objects

| File | Object | Publish as Web Service Name | Feeds |
|------|--------|------------------------------|-------|
| `50100_KFT_GL_Actuals.al` | Query 50100 | **KFT_GL_Actuals** | Budget vs Actual, P&L, cash categories |
| `50105_KFT_GL_Budget.al`  | Query 50105 | **KFT_GL_Budget**  | Budget side, by-unit, monthly budget |
| `50130_KFT_Bank_Ledger.al`| Query 50130 | **KFT_Bank_Ledger**| Daily balances, collections by bank |
| `50160_KFT_GL_Balances.al`| Query 50160 | **KFT_GL_Balances**| Balance-sheet ratios |

> Why only 4 (not 9): with your real structure, the whole P&L — Revenue,
> Cost of Sales, Salaries, OPEX, EBITDA, Depreciation, Net Profit, margins,
> and the per-unit split — is all derived from the single actuals feed plus
> the budget feed. The snapshot does the bucketing using your account ranges.
> Fewer objects to publish, identical coverage.

## Step 1 — Add the objects to an extension
Put the four `.al` files in your AL project (or a small dedicated extension).
Object IDs 50100–50160 are in the default free range; change them only if
they clash with something you already have. Compile and publish the
extension to the **ERP** instance.

## Step 2 — Publish each as a Web Service
In Business Central, search the **Web Services** page. For each query:
1. New line.
2. Object Type = **Query**.
3. Object ID = the ID above (50100, 50105, 50130, 50160).
4. Service Name = the exact name above (e.g. `KFT_GL_Actuals`).
5. Tick **Published**.

They will then be live at:
```
https://enterprise.kifiya.dev/ERP/ODataV4/Company('KIFIYA FINANCIAL TECHNOLOGY')/KFT_GL_Actuals
```
(or the internal `http://10.253.99.143:7048/ERP/ODataV4/...` over VPN).

## Step 3 — Confirm they return data
Open each URL in a browser with Basic Auth (read-only user). You should get
JSON with a `value` array. If you get a login page or 404, the service name
or publish flag is wrong; if 401, check the user's web-service access.

## Already wired for you (no edits needed)
- **Budget name** `20.1` (your 2026 Jan–Dec budget).
- **Account ranges** — revenue 5000–5999, CoS 6000–6099, salaries 8010–8109,
  opex 7000–8009 + 8110–9198, depreciation 9210–9299, financial costs
  9510–9598, bank/cash 2460–2990, debt 3410–3459 + 3700–3749, WIP/capex
  1500–1599, and the balance-sheet groups for ratios.
- **EBITDA formula** matches M-MGT-RPT: Gross Profit − Salaries − Operating
  Expenses. Revenue credit-sign is handled automatically.

## Two optional values you may still want to set
In `snapshot/snapshot.js` → `CONFIG`:
- `DEBT_FACILITY` — total approved facility (ETB millions) so the debt gauge
  shows utilisation vs limit. Left null = gauge shows drawn amount only.
- `CAPEX_BUDGET` — annual CAPEX budget (ETB millions) for that gauge.

## A note on the by-unit view
Your G/L Budgets carry **Global Dimension 2 = "BUS UNIT & DEPART"**, so the
Budget Overview tab groups budget and spend by that dimension automatically.
The values shown are whatever dimension-value codes exist in your entries.
If you'd rather see revenue by business *line* (BPASS, Mobility, Capital
Solutions, etc.), that's a small change — tell me and I'll switch it.
