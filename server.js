const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DAILY_LIMIT = 15;

console.log('API KEY loaded:', ANTHROPIC_API_KEY ? 'YES (' + ANTHROPIC_API_KEY.slice(0, 12) + '...)' : 'NOT FOUND');

const usage = {};

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

function getUserUsage(userId) {
  const today = getTodayKey();
  if (!usage[userId] || usage[userId].date !== today) {
    usage[userId] = { date: today, count: 0 };
  }
  return usage[userId];
}

app.get('/', (req, res) => {
  res.json({ status: 'CaloriApp backend running 🥗' });
});

app.post('/analyze', async (req, res) => {
  try {
    const { messages, userId } = req.body;
    if (!messages) {
      return res.status(400).json({ error: 'Missing messages' });
    }

    if (userId && !userId.startsWith('dev-')) {
      const userUsage = getUserUsage(userId);
      if (userUsage.count >= DAILY_LIMIT) {
        return res.status(429).json({
          error: 'Daily limit reached',
          limit: DAILY_LIMIT,
          resetAt: 'midnight'
        });
      }
      userUsage.count++;
    }

    let attempt = 0;
    let response;
    while (attempt < 3) {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          messages
        })
      });
      if (response.status === 529) {
        attempt++;
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }
      break;
    }

    const data = await response.json();
    if (!response.ok) {
      console.error('Anthropic error:', data.error?.message);
      return res.status(response.status).json({ error: data.error?.message || 'API error' });
    }
    res.json(data);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/verify-dev', (req, res) => {
  const { code } = req.body;
  const DEV_CODE = process.env.DEV_CODE;

  if (!DEV_CODE) {
    return res.json({ valid: false });
  }

  if (code === DEV_CODE) {
    res.json({ valid: true });
  } else {
    res.json({ valid: false });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`CaloriApp backend running on port ${PORT}`);
});
