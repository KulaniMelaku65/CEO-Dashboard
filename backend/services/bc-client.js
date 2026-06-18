const https = require('https');

function bcEnv() {
  return {
    base:     process.env.BC_BASE,
    company:  process.env.BC_COMPANY,
    user:     process.env.BC_USER,
    key:      process.env.BC_KEY,
    allowSelfSigned: process.env.BC_ALLOW_SELF_SIGNED === 'true'
  };
}

function isBcConfigured() {
  const { base, company, user, key } = bcEnv();
  return Boolean(base && company && user && key);
}

function assertBcConfigured() {
  if (!isBcConfigured())
    throw new Error('Business Central not configured — set BC_BASE, BC_COMPANY, BC_USER, BC_KEY in backend/.env');
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

module.exports = { bc, isBcConfigured, assertBcConfigured };
