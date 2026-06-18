const https = require('https');

function bcEnv() {
  return {
    base:     process.env.BC_BASE     || process.env.BC_BASE_URL,
    company:  process.env.BC_COMPANY,
    user:     process.env.BC_USER     || process.env.BC_USERNAME,
    key:      process.env.BC_KEY      || process.env.BC_ACCESS_KEY,
    allowSelfSigned: process.env.BC_ALLOW_SELF_SIGNED === 'true'
  };
}

function missingBcVars() {
  const { base, company, user, key } = bcEnv();
  const missing = [];
  if (!base)    missing.push('BC_BASE (or BC_BASE_URL)');
  if (!company) missing.push('BC_COMPANY');
  if (!user)    missing.push('BC_USER (or BC_USERNAME)');
  if (!key)     missing.push('BC_KEY (or BC_ACCESS_KEY)');
  return missing;
}

function isBcConfigured() {
  return missingBcVars().length === 0;
}

function assertBcConfigured() {
  if (!isBcConfigured()) {
    throw new Error(`Business Central not configured — missing: ${missingBcVars().join(', ')}`);
  }
}

const httpsAgent = () => new https.Agent({ rejectUnauthorized: !bcEnv().allowSelfSigned });

/** Query BC OData with pagination (@odata.nextLink). */
async function bc(service, query = '') {
  assertBcConfigured();
  const { base, company, user, key } = bcEnv();
  const auth = 'Basic ' + Buffer.from(`${user}:${key}`).toString('base64');

  let url = `${base}/Company('${encodeURIComponent(company)}')/${service}${query}`;
  let all = [];

  for (let page = 0; url && page < 200; page++) {
    const r = await fetch(url, {
      headers: { Authorization: auth, Accept: 'application/json' },
      agent: url.startsWith('https') ? httpsAgent() : undefined
    });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 200);
      throw new Error(`BC ${r.status} on ${service}: ${detail}`);
    }
    const j = await r.json();
    const rows = j.value || j;
    if (Array.isArray(rows)) all = all.concat(rows);
    else return rows;
    url = j['@odata.nextLink'] || null;
  }
  return all;
}

module.exports = { bc, isBcConfigured, assertBcConfigured, missingBcVars };
