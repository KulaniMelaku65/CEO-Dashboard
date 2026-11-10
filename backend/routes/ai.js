const router      = require('express').Router();
const requireAuth = require('../middleware/auth');
const db          = require('../db');
const { decrypt } = require('../services/crypto');
const { TOOLS, runTool } = require('../services/ai-tools');

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

// ── Agent loop (docs/agentic-ai-roadmap.md, layer 1) ─────────────────────────────────
// Each provider's callX() makes ONE upstream request and returns a normalized shape:
//   { type: 'text', content }                                        — final answer
//   { type: 'tool_calls', calls: [{ id, name, args }], native }       — wants tool(s) run
// `native` is whatever that provider needs appended to ITS OWN message history to
// continue the conversation (shape differs completely per provider — OpenAI/Groq use
// role:'assistant'+tool_calls then role:'tool' turns; Claude uses content blocks; Gemini
// uses functionCall/functionResponse parts) — callX() owns that shape entirely; the loop
// below never inspects it, just passes it back on the next call.
const MAX_TOOL_ITERATIONS = 6;

// Gemini only accepts 'user' / 'model' roles; system messages go in systemInstruction.
function toGeminiContents(messages) {
  return messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
}

function toGeminiTools(tools) {
  if (!tools?.length) return undefined;
  return [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
}

async function callGemini(messages, apiKey, modelOverride, tools, nativeHistory) {
  // gemini-2.0-flash was retired by Google (returns 404 for everyone, not key-specific) —
  // gemini-3.6-flash is the current default. Override with GEMINI_MODEL if that changes again.
  const model = modelOverride || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const contents = nativeHistory || toGeminiContents(messages);
  const body = {
    ...(system && { systemInstruction: { parts: [{ text: system }] } }),
    contents,
    tools: toGeminiTools(tools),
    // gemini-3.6-flash spends output tokens on hidden "thinking" before the visible reply —
    // an uncapped thinking budget regularly ate the entire token limit on ordinary
    // questions, cutting the answer off mid-sentence with no visible text at all. Capping
    // thinkingBudget and raising the ceiling leaves guaranteed room for the actual answer.
    generationConfig: { maxOutputTokens: 800, temperature: 0.5, thinkingConfig: { thinkingBudget: 200 } }
  };
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 300);
    console.error('Gemini error:', upstream.status, detail);
    return null;
  }
  const j = await upstream.json();
  const parts = j.candidates?.[0]?.content?.parts || [];
  const functionCalls = parts.filter(p => p.functionCall);
  if (functionCalls.length) {
    return {
      type: 'tool_calls',
      calls: functionCalls.map((p, i) => ({ id: `${i}`, name: p.functionCall.name, args: p.functionCall.args || {} })),
      native: [...contents, { role: 'model', parts: functionCalls.map(p => ({ functionCall: p.functionCall })) }]
    };
  }
  const text = parts.map(p => p.text).filter(Boolean).join('');
  return { type: 'text', content: text };
}

function geminiToolResultTurn(calls, results) {
  return { role: 'user', parts: calls.map((c, i) => ({ functionResponse: { name: c.name, response: { result: results[i] } } })) };
}

// ── OpenAI-compatible (OpenAI + Groq both speak this format) ─────────────────────────
function toOpenAiTools(tools) {
  if (!tools?.length) return undefined;
  return tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

async function callOpenAiCompatible(url, defaultModel, messages, apiKey, modelOverride, tools, nativeHistory) {
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelOverride || defaultModel,
      messages: nativeHistory || messages,
      tools: toOpenAiTools(tools),
      max_tokens: 800,
      temperature: 0.5
    })
  });
  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 300);
    console.error(`${url} error:`, upstream.status, detail);
    return null;
  }
  const j = await upstream.json();
  const message = j.choices?.[0]?.message;
  if (message?.tool_calls?.length) {
    return {
      type: 'tool_calls',
      calls: message.tool_calls.map(tc => ({ id: tc.id, name: tc.function.name, args: JSON.parse(tc.function.arguments || '{}') })),
      native: [...(nativeHistory || messages), message]
    };
  }
  return { type: 'text', content: message?.content || '' };
}

function openAiToolResultTurns(calls, results) {
  return calls.map((c, i) => ({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(results[i]) }));
}

async function callGroq(messages, apiKey, modelOverride, tools, nativeHistory) {
  // llama-3.1-8b-instant was retired by Groq (404s for everyone, not key-specific —
  // found while smoke-testing the agent loop). openai/gpt-oss-20b is current and
  // supports tool-calling; override with GROQ_MODEL if Groq's lineup changes again.
  return callOpenAiCompatible('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_MODEL || 'openai/gpt-oss-20b', messages, apiKey, modelOverride, tools, nativeHistory);
}

async function callOpenAI(messages, apiKey, modelOverride, tools, nativeHistory) {
  return callOpenAiCompatible('https://api.openai.com/v1/chat/completions', 'gpt-4o-mini', messages, apiKey, modelOverride, tools, nativeHistory);
}

// ── Claude ─────────────────────────────────────────────────────────────────────────
function toClaudeTools(tools) {
  if (!tools?.length) return undefined;
  return tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}

async function callClaude(messages, apiKey, modelOverride, tools, nativeHistory) {
  const model = modelOverride || process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const chatMessages = nativeHistory || messages.filter(m => m.role !== 'system');
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model, max_tokens: 800, temperature: 0.5,
      ...(system && { system }),
      tools: toClaudeTools(tools),
      messages: chatMessages
    })
  });
  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 300);
    console.error('Claude error:', upstream.status, detail);
    return null;
  }
  const j = await upstream.json();
  const toolUses = (j.content || []).filter(b => b.type === 'tool_use');
  if (j.stop_reason === 'tool_use' && toolUses.length) {
    return {
      type: 'tool_calls',
      calls: toolUses.map(b => ({ id: b.id, name: b.name, args: b.input || {} })),
      native: [...chatMessages, { role: 'assistant', content: j.content }]
    };
  }
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return { type: 'text', content: text };
}

function claudeToolResultTurn(calls, results) {
  return {
    role: 'user',
    content: calls.map((c, i) => ({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(results[i]) }))
  };
}

// Provider is forced via Admin's "active provider" setting, or failing that AI_PROVIDER
// ('gemini' | 'openai' | 'groq' | 'claude'), or picked by whichever key is set (DB first,
// then .env), in that same priority order.
const PROVIDERS = {
  gemini: { envKey: 'GEMINI_KEY',    call: callGemini,  toolResultTurn: (calls, results) => [geminiToolResultTurn(calls, results)] },
  openai: { envKey: 'OPENAI_KEY',    call: callOpenAI,  toolResultTurn: openAiToolResultTurns },
  groq:   { envKey: 'GROQ_KEY',      call: callGroq,    toolResultTurn: openAiToolResultTurns },
  claude: { envKey: 'ANTHROPIC_KEY', call: callClaude,  toolResultTurn: (calls, results) => [claudeToolResultTurn(calls, results)] }
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

// Runs the tool-calling loop against whichever provider is active, for up to
// MAX_TOOL_ITERATIONS round trips, executing each requested tool (services/ai-tools.js —
// permission-checked and audit-logged there) and feeding the result back before asking
// the model to continue. Returns the same { choices: [{ message }] } shape the frontend
// already expects, whether or not any tool was actually used — this is a drop-in upgrade
// to the existing /chat endpoint, not a new one.
async function runAgentLoop(messages, resolved, user) {
  const provider = PROVIDERS[resolved.name];
  let nativeHistory = null;
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const out = await provider.call(messages, resolved.apiKey, resolved.model, TOOLS, nativeHistory);
    if (!out) return null;
    if (out.type === 'text') return { choices: [{ message: { role: 'assistant', content: out.content } }] };

    const results = await Promise.all(out.calls.map(c => runTool(c.name, c.args, user)));
    nativeHistory = [...out.native, ...provider.toolResultTurn(out.calls, results)];
  }
  return { choices: [{ message: { role: 'assistant', content: "I wasn't able to finish looking that up within my step limit — try asking a narrower question." } }] };
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
    const result = await runAgentLoop(messages, resolved, req.user);
    if (!result) return res.status(502).json({ error: 'AI service returned an error.' });
    res.json(result);
  } catch (e) {
    console.error('AI proxy error:', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
