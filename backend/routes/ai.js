const router      = require('express').Router();
const requireAuth = require('../middleware/auth');

// POST /api/ai/chat — proxy to GROQ so the API key never reaches the browser
router.post('/chat', requireAuth, async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || !messages.length)
    return res.status(400).json({ error: 'messages array is required.' });

  if (!process.env.GROQ_KEY)
    return res.status(503).json({ error: 'AI service not configured.' });

  try {
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
      return res.status(502).json({ error: 'AI service returned an error.' });
    }
    res.json(await upstream.json());
  } catch (e) {
    console.error('AI proxy error:', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
