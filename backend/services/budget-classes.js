// Budget "class" (Program Finance vs General Finance) isn't exposed as its own field
// anywhere BC gives us over OData — GetBudgetName only returns Name/Description/Status/
// Blocked (confirmed live: 6 rows, Description is just "Year 1".."Year 5", no class text
// at all), and no standard BC budget-name entity with a class field is reachable from this
// tenant either. The only thing that actually distinguishes them is BC's own budgetName
// numbering convention: the major version before the first "." — "10"/"10.2".."10.5" are
// Program Finance (SAFEE's programme budget cycle), "20.x" are General Finance (Corporate
// Budget Analysis). Centralized here so both pages agree on the same rule.
const PROGRAM_FINANCE_MAJOR = '10';
const GENERAL_FINANCE_MAJOR = '20';

const majorOf = (name) => String(name || '').split('.')[0];
const isProgramFinance = (name) => majorOf(name) === PROGRAM_FINANCE_MAJOR;
const isGeneralFinance = (name) => majorOf(name) === GENERAL_FINANCE_MAJOR;

module.exports = { isProgramFinance, isGeneralFinance };
