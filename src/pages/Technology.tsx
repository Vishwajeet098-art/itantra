export function Technology() {
  return (
    <div className="max-w-4xl mx-auto py-12">
      <h1 className="text-4xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Core Technology</h1>
      <p className="text-gray-400 mb-12 text-lg">Understanding the pipeline that powers iTantra's low-bandwidth communication.</p>
      
      <div className="space-y-8">
        <div className="bg-card border border-white/10 rounded-2xl p-8">
          <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm">1</span>
            Speech-to-Text (STT)
          </h2>
          <p className="text-gray-400 leading-relaxed">
            Converts spoken Indian languages into digital text. We utilize advanced browser APIs for real-time offline-capable dictation, ensuring privacy and speed without requiring continuous high-speed internet during the input phase.
          </p>
        </div>

        <div className="bg-card border border-white/10 rounded-2xl p-8">
          <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm">2</span>
            Neural Machine Translation
          </h2>
          <p className="text-gray-400 leading-relaxed">
            The recognized text is translated instantly into the target language. By using text rather than transmitting audio, we drastically reduce the required payload size.
          </p>
        </div>

        <div className="bg-card border border-white/10 rounded-2xl p-8">
          <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm">3</span>
            Low-Bitrate Encoding & Transmission
          </h2>
          <p className="text-gray-400 leading-relaxed">
            The translated text is highly compressed. Unlike standard voice calls which require kilobits per second, text transmission requires mere bytes, allowing communication over degraded 2G networks or emergency radio links (LoRa).
          </p>
        </div>

        <div className="bg-card border border-white/10 rounded-2xl p-8">
          <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm">4</span>
            Text-to-Speech (TTS)
          </h2>
          <p className="text-gray-400 leading-relaxed">
            On the receiving end, the tiny data packet is decoded back into text and synthesized into natural-sounding speech in the receiver's native language.
          </p>
        </div>
      </div>
    </div>
  );
}
