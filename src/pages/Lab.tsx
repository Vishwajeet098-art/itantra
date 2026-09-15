import { useState } from 'react';
import { Play, Square, Loader2, ArrowRight, Activity, Wifi } from 'lucide-react';
import { motion } from 'framer-motion';

export function Lab() {
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [network, setNetwork] = useState('2g');

  const startSimulation = () => {
    setIsTransmitting(true);
    setProgress(0);
    
    // Simulate transmission over time based on network
    const speed = network === '4g' ? 20 : network === '3g' ? 50 : network === '2g' ? 100 : 200;
    
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          setTimeout(() => setIsTransmitting(false), 1000);
          return 100;
        }
        return p + 2;
      });
    }, speed);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Low-Bandwidth Lab</h1>
      <p className="text-gray-400 mb-8">Simulate text-encoded voice transmission over degraded networks.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Controls */}
        <div className="bg-card border border-white/10 rounded-2xl p-6 h-fit">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <Wifi className="text-primary" /> Network Settings
          </h2>
          
          <div className="space-y-4 mb-8">
            <label className="block text-sm font-medium text-gray-400">Simulated Bandwidth</label>
            <div className="grid grid-cols-2 gap-2">
              {['lora', '2g', '3g', '4g'].map(n => (
                <button
                  key={n}
                  onClick={() => setNetwork(n)}
                  className={`p-3 rounded-lg border text-sm font-medium transition-colors uppercase ${
                    network === n 
                      ? 'bg-primary/20 border-primary text-primary' 
                      : 'border-white/10 hover:bg-white/5 text-gray-400'
                  }`}
                >
                  {n === 'lora' ? 'Low Bitrate' : n}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={startSimulation}
              disabled={isTransmitting}
              className="flex-1 py-3 bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isTransmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              {isTransmitting ? 'Transmitting...' : 'Start'}
            </button>
            <button 
              onClick={() => { setProgress(0); setIsTransmitting(false); }}
              disabled={isTransmitting}
              className="px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-lg font-semibold border border-white/10 flex items-center justify-center gap-2"
              title="Reset Simulation"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Simulation Canvas */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-white/10 rounded-2xl p-8 relative overflow-hidden">
            <h3 className="text-lg font-semibold text-white mb-8">Data Flow Pipeline</h3>
            
            <div className="flex items-center justify-between relative">
              {/* Sender */}
              <div className="z-10 bg-darker p-4 rounded-xl border border-white/10 text-center w-32">
                <div className="text-xs text-gray-400 mb-1">Sender</div>
                <div className="text-sm font-medium text-primary">Voice Input</div>
              </div>

              {/* Channel */}
              <div className="flex-1 h-px bg-white/10 relative mx-4">
                {isTransmitting && (
                  <motion.div 
                    className="absolute top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full shadow-[0_0_10px_#06b6d4]"
                    initial={{ left: 0, width: "0%" }}
                    animate={{ left: `${progress}%`, width: progress < 10 ? `${progress}%` : "10px" }}
                    transition={{ ease: "linear" }}
                  />
                )}
              </div>

              {/* Receiver */}
              <div className="z-10 bg-darker p-4 rounded-xl border border-white/10 text-center w-32">
                <div className="text-xs text-gray-400 mb-1">Receiver</div>
                <div className="text-sm font-medium text-secondary">Voice Output</div>
              </div>
            </div>

            <div className="mt-8 flex justify-between text-sm text-gray-400 px-8">
              <div className="text-center">STT + Translate<br/>(Local)</div>
              <div className="text-center">Encode</div>
              <div className="text-center text-primary font-mono">{network.toUpperCase()} Link</div>
              <div className="text-center">Decode</div>
              <div className="text-center">TTS<br/>(Local)</div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card border border-white/10 p-4 rounded-xl">
              <div className="text-xs text-gray-400 mb-1">Raw Audio Size</div>
              <div className="text-xl font-mono text-white">~45 KB</div>
            </div>
            <div className="bg-card border border-white/10 p-4 rounded-xl">
              <div className="text-xs text-gray-400 mb-1">Encoded Text Size</div>
              <div className="text-xl font-mono text-primary">~45 Bytes</div>
            </div>
            <div className="bg-card border border-white/10 p-4 rounded-xl">
              <div className="text-xs text-gray-400 mb-1">Simulated Latency</div>
              <div className="text-xl font-mono text-secondary">
                {network === '4g' ? '40ms' : network === '3g' ? '150ms' : network === '2g' ? '800ms' : '2500ms'}
              </div>
            </div>
            <div className="bg-card border border-white/10 p-4 rounded-xl">
              <div className="text-xs text-gray-400 mb-1">Delivery Status</div>
              <div className="text-xl font-mono text-white flex items-center gap-2">
                {progress}% {progress === 100 && <span className="text-success text-sm">OK</span>}
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500 text-center italic mt-4">* Values are simulated for demonstration purposes</p>
        </div>
      </div>
    </div>
  );
}
