import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Radio, Mic, Globe2, Activity } from 'lucide-react';

export function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-4xl"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          Smart India Hackathon 2026 Prototype
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 text-transparent bg-clip-text bg-gradient-to-r from-white via-blue-100 to-white">
          Breaking Language Barriers. <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Connecting Every Voice.</span>
        </h1>
        
        <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
          AI-powered multilingual communication designed for low-bandwidth networks. 
          Speak in your native language, transmit over minimal data, and be heard perfectly.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link 
            to="/studio" 
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 text-lg font-semibold rounded-xl bg-primary hover:bg-primary-hover text-white transition-all shadow-[0_0_25px_rgba(6,182,212,0.4)] hover:shadow-[0_0_35px_rgba(6,182,212,0.6)] hover:-translate-y-1"
          >
            Start Communication
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link 
            to="/technology" 
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 text-lg font-semibold rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all hover:-translate-y-1"
          >
            Explore Technology
          </Link>
        </div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl"
      >
        {[
          { icon: Mic, title: "Speech Recognition", desc: "Native STT with robust fallback mechanisms." },
          { icon: Globe2, title: "Neural Translation", desc: "12+ Indian regional languages supported seamlessly." },
          { icon: Radio, title: "Low-Bitrate Links", desc: "Optimized encoding for 2G and LoRa networks." }
        ].map((feature, i) => (
          <div key={i} className="p-6 rounded-2xl bg-card border border-white/5 hover:border-primary/30 transition-colors group">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <feature.icon className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-white">{feature.title}</h3>
            <p className="text-gray-400">{feature.desc}</p>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
