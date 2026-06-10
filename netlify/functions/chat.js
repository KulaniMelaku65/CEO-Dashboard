// Groq proxy — keeps the API key server-side (Netlify env var GROQ_KEY)
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const key = process.env.GROQ_KEY;
  if (!key) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'GROQ_KEY environment variable not set in Netlify' })
    };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await resp.json();
  return {
    statusCode: resp.status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  };
};
