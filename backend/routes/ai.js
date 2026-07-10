const router      = require('express').Router();
const requireAuth = require('../middleware/auth');

// Gemini only accepts 'user' / 'model' roles; system messages go in systemInstruction.
function toGeminiBody(messages) {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  return {
    ...(system && { systemInstruction: { parts: [{ text: system }] } }),
    contents,
    generationConfig: { maxOutputTokens: 400, temperature: 0.5 }
  };
}

async function callGemini(messages) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_KEY}`,
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

async function callGroq(messages) {
  const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.GROQ_KEY}`
    },
    body: JSON.stringify({
      model:       'llama-3.1-8b-instant',
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

// POST /api/ai/chat — proxy to Gemini (preferred) or GROQ so the API key never reaches the browser
router.post('/chat', requireAuth, async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || !messages.length)
    return res.status(400).json({ error: 'messages array is required.' });

  const useGemini = !!process.env.GEMINI_KEY;
  if (!useGemini && !process.env.GROQ_KEY)
    return res.status(503).json({ error: 'AI service not configured.' });

  try {
    const result = useGemini ? await callGemini(messages) : await callGroq(messages);
    if (!result) return res.status(502).json({ error: 'AI service returned an error.' });
    res.json(result);
  } catch (e) {
    console.error('AI proxy error:', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
