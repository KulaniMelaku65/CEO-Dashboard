const router      = require('express').Router();
const requireAuth = require('../middleware/auth');
const db          = require('../db');
const { decrypt } = require('../services/crypto');

// DB-stored key/model for a provider, if an admin has set one via Admin — Users & Access;
// falls back to .env so a zero-config deployment keeps working untouched. api_key is
// stored encrypted (see routes/ai-settings.js's PUT handler) — decrypted here, the one
// place it's actually used to call a provider. A decrypt failure (encryption secret
// rotated out from under an existing row, or a corrupted value) is treated as "not
// configured" rather than crashing the chat endpoint.
function dbRow(provider) {
  const row = db.prepare('SELECT api_key, model FROM ai_provider_keys WHERE provider = ?').get(provider);
  if (!row) return row;
  try {
    return { ...row, api_key: decrypt(row.api_key) };
  } catch (e) {
    console.error(`[ai] Failed to decrypt stored key for ${provider}:`, e.message);
    return null;
  }
}

// Gemini only accepts 'user' / 'model' roles; system messages go in systemInstruction.
function toGeminiBody(messages) {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  return {
    ...(system && { systemInstruction: { parts: [{ text: system }] } }),
    contents,
    // gemini-3.6-flash spends output tokens on hidden "thinking" before the visible reply —
    // an uncapped thinking budget regularly ate the entire 400-token limit on ordinary
    // questions, cutting the answer off mid-sentence with no visible text at all. Capping
    // thinkingBudget and raising the ceiling leaves guaranteed room for the actual answer.
    generationConfig: { maxOutputTokens: 800, temperature: 0.5, thinkingConfig: { thinkingBudget: 200 } }
  };
}

async function callGemini(messages, apiKey, modelOverride) {
  // gemini-2.0-flash was retired by Google (returns 404 for everyone, not key-specific) —
  // gemini-3.6-flash is the current default. Override with GEMINI_MODEL if that changes again.
  const model = modelOverride || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toGeminiBody(messages))
    }
  );
  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 300);
    console.error('Gemini error:', upstream.status, detail);
    return null;
  }
  const j = await upstream.json();
  const text = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  // Reshape to the OpenAI-style format the frontend expects.
  return { choices: [{ message: { role: 'assistant', content: text } }] };
}

async function callGroq(messages, apiKey, modelOverride) {
  const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model:       modelOverride || 'llama-3.1-8b-instant',
      messages,
      max_tokens:  400,
      temperature: 0.5
    })
  });
  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 300);
    console.error('GROQ error:', upstream.status, detail);
    return null;
  }
  return upstream.json();
}

// OpenAI's chat completions response is already in the { choices: [{ message }] }
// shape the frontend expects, so no reshaping is needed here (unlike Gemini).
async function callOpenAI(messages, apiKey, modelOverride) {
  const model = modelOverride || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens:  400,
      temperature: 0.5
    })
  });
  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 300);
    console.error('OpenAI error:', upstream.status, detail);
    return null;
  }
  return upstream.json();
}

// Claude's messages API takes system prompts as a top-level `system` field, not as a
// message in the array — same split as Gemini's systemInstruction above.
async function callClaude(messages, apiKey, modelOverride) {
  const model = modelOverride || process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const chatMessages = messages.filter(m => m.role !== 'system');
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':          apiKey,
      'anthropic-version':  '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      temperature: 0.5,
      ...(system && { system }),
      messages: chatMessages
    })
  });
  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 300);
    console.error('Claude error:', upstream.status, detail);
    return null;
  }
  const j = await upstream.json();
  const text = j.content?.map(c => c.text).join('') || '';
  // Reshape to the OpenAI-style format the frontend expects.
  return { choices: [{ message: { role: 'assistant', content: text } }] };
}

// Provider is forced via Admin's "active provider" setting, or failing that AI_PROVIDER
// ('gemini' | 'openai' | 'groq' | 'claude'), or picked by whichever key is set (DB first,
// then .env), in that same priority order.
const PROVIDERS = {
  gemini: { envKey: 'GEMINI_KEY',    call: callGemini },
  openai: { envKey: 'OPENAI_KEY',    call: callOpenAI },
  groq:   { envKey: 'GROQ_KEY',      call: callGroq   },
  claude: { envKey: 'ANTHROPIC_KEY', call: callClaude }
};

// Resolves the provider to use plus the key/model it should run with — DB-stored key wins
// over .env when both exist for the same provider.
function resolveProvider() {
  const activeSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'ai_active_provider'").get()?.value;
  const forced = (activeSetting || process.env.AI_PROVIDER || '').toLowerCase();

  const hasConfig = name => dbRow(name) || process.env[PROVIDERS[name].envKey];
  const provider = (forced && PROVIDERS[forced] && hasConfig(forced))
    ? forced
    : Object.keys(PROVIDERS).find(hasConfig);

  if (!provider) return null;
  const row = dbRow(provider);
  return {
    name:   provider,
    apiKey: row?.api_key || process.env[PROVIDERS[provider].envKey],
    model:  row?.model || null,
  };
}

// POST /api/ai/chat — proxy to whichever provider is configured so the API key never reaches the browser
router.post('/chat', requireAuth, async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || !messages.length)
    return res.status(400).json({ error: 'messages array is required.' });

  const resolved = resolveProvider();
  if (!resolved)
    return res.status(503).json({ error: 'AI service not configured.' });

  try {
    const result = await PROVIDERS[resolved.name].call(messages, resolved.apiKey, resolved.model);
    if (!result) return res.status(502).json({ error: 'AI service returned an error.' });
    res.json(result);
  } catch (e) {
    console.error('AI proxy error:', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
