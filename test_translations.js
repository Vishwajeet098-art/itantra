const tests = [
  { text: 'मैं सोने जा रहा हूँ।', from: 'hi-IN', to: 'en-IN', expected: 'I am going to sleep.' },
  { text: 'मेरा नाम विकास है।', from: 'hi-IN', to: 'en-IN', expected: 'My name is Vikas.' },
  { text: 'My name is Vishwajeet.', from: 'en-IN', to: 'hi-IN', expected: 'मेरा नाम विश्वजीत है।' },
  { text: 'आज मौसम बहुत अच्छा है।', from: 'hi-IN', to: 'en-IN', expected: 'The weather is very nice today.' },
];

async function run() {
  for (const t of tests) {
    try {
      const res = await fetch('http://localhost:3001/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t.text, sourceLang: t.from, targetLang: t.to }),
      });
      const data = await res.json();
      console.log(`\n✅ Input:    "${t.text}"`);
      console.log(`   Expected: "${t.expected}"`);
      console.log(`   Got:      "${data.translatedText || data.error}"`);
    } catch (e) {
      console.log(`\n❌ FAILED for: "${t.text}"`, e.message);
    }
  }
}
run();
