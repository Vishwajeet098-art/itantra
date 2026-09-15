import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';

export function Layout() {
  return (
    <div className="min-h-screen bg-darker text-white flex flex-col font-sans selection:bg-primary/30">
      <Navbar />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
      <footer className="w-full border-t border-white/10 py-6 text-center text-sm text-gray-500 mt-auto">
        <p>iTantra — Indian Multilingual TTS & STT Aided Neural Transceiver Radio Access for Low Bitrate Links.</p>
        <p className="mt-1">Smart India Hackathon 2026 Prototype</p>
      </footer>
    </div>
  );
}
