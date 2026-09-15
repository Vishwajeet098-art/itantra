const q = "मैं सोने जा रहा हूँ।";
fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=hi|en`)
  .then(res => res.json())
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(console.error);
