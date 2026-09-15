import express from 'express';
import cors from 'cors';
import { translate } from 'google-translate-api-x';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post('/api/translate', async (req, res) => {
  try {
    const { text, sourceLang, targetLang } = req.body;
    
    if (!text || !targetLang) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Extract base language code for google-translate-api-x (e.g., 'hi' from 'hi-IN')
    const source = sourceLang ? sourceLang.split('-')[0] : 'auto';
    const target = targetLang.split('-')[0];

    console.log(`Translating: "${text}" from ${source} to ${target}`);
    
    const result = await translate(text, { from: source, to: target });
    
    res.json({ translatedText: result.text });
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ error: 'Translation failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
