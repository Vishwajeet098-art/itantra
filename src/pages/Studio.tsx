import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Mic, MicOff, Square, Play, Pause, Send, RefreshCcw,
  AlertTriangle, Info, Loader2, Radio, Volume2, VolumeX,
  LogOut, Wifi, Users, CheckCircle, ArrowLeftRight, Upload
} from 'lucide-react';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { VoiceMessageBubble } from '../components/VoiceMessageBubble';
import { DataTracker } from '../services/DataTracker';
import { DataUsageDashboard } from '../components/DataUsageDashboard';
import { DataBadge } from '../components/DataBadge';
import { useDataTracker } from '../hooks/useDataTracker';
// ── Config ─────────────────────────────────────────────────────────────────────
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : `http://${window.location.hostname}:3001`);

const LANGUAGES = [
  { code: 'en-IN', name: 'English' }, { code: 'hi-IN', name: 'Hindi' },
  { code: 'bho', name: 'Bhojpuri' }, { code: 'bn-IN', name: 'Bengali' },
  { code: 'ta-IN', name: 'Tamil' }, { code: 'te-IN', name: 'Telugu' },
  { code: 'mr-IN', name: 'Marathi' }, { code: 'gu-IN', name: 'Gujarati' },
  { code: 'kn-IN', name: 'Kannada' }, { code: 'ml-IN', name: 'Malayalam' },
  { code: 'pa-IN', name: 'Punjabi' },
];

const TEST_EXAMPLES = [
  { label: 'Hindi → English', from: 'hi-IN', to: 'en-IN', text: 'मैं सोने जा रहा हूँ।' },
  { label: 'Hindi → English', from: 'hi-IN', to: 'en-IN', text: 'मेरा नाम विकास है।' },
  { label: 'Bhojpuri → English', from: 'bho', to: 'en-IN', text: 'रउवा कइसे बानी?' },
  { label: 'English → Hindi', from: 'en-IN', to: 'hi-IN', text: 'My name is Vishwajeet.' },
  { label: 'Hindi → English', from: 'hi-IN', to: 'en-IN', text: 'आज मौसम बहुत अच्छा है।' },
];

// ── Types ──────────────────────────────────────────────────────────────────────
interface User { userId: string; displayName: string; }

type AnyMessage =
  | { id: string; type: 'text'; senderId: string; senderName: string; original: string; translated: string; sourceLang: string; targetLang: string; timestamp: string; mine: boolean; }
  | { id: string; type: 'voice'; senderId: string; senderName: string; audioUrl: string; duration: number; timestamp: string; mine: boolean; };

// ─────────────────────────────────────────────────────────────────────────────
export function Studio() {
  // ── Translation state (existing) ────────────────────────────────────────
  const [sourceLang, setSourceLang] = useState('hi-IN');
  const [targetLang, setTargetLang] = useState('en-IN');
  const [inputText, setInputText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isSttActive, setIsSttActive] = useState(false);
  const [sttSupported, setSttSupported] = useState(true);
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [isTtsPaused, setIsTtsPaused] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [translationError, setTranslationError] = useState('');

  // ── Voice Room state (new) ───────────────────────────────────────────────
  const [me, setMe] = useState<User | null>(null);
  const [regPhone, setRegPhone] = useState('');
  const [regName, setRegName] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [peerName, setPeerName] = useState('');
  const [peerOnline, setPeerOnline] = useState(false);
  const [messages, setMessages] = useState<AnyMessage[]>([]);
  const [roomError, setRoomError] = useState('');
  const [roomConnected, setRoomConnected] = useState(false);
  const [autoPlay, setAutoPlay] = useState(() => localStorage.getItem('itantra_autoplay') !== 'false');
  const [muted, setMuted] = useState(false);
  const [playbackUnlocked, setPlaybackUnlocked] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [lastBlob, setLastBlob] = useState<{ blob: Blob; seconds: number } | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const recognitionRef = useRef<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  
  const { lowBandwidthMode } = useDataTracker();
  const [recorder, recorderActions] = useVoiceRecorder(lowBandwidthMode);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Backend health ───────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/health`)
      .then(r => r.json()).then(() => setBackendOnline(true))
      .catch(() => setBackendOnline(false));
  }, []);

  // ── Load saved user ──────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('itantra_user');
    if (saved) { try { setMe(JSON.parse(saved)); } catch {} }
  }, []);

  // ── STT setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSttSupported(false); return; }
    const r = new SR();
    r.continuous = false; r.interimResults = true;
    r.onresult = (e: any) => {
      let fin = ''; let int = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t; else int += t;
      }
      if (fin) { setInputText(p => (p + ' ' + fin).trim()); setInterimText(''); }
      else setInterimText(int);
    };
    r.onerror = (e: any) => {
      const m: Record<string, string> = {
        'not-allowed': 'Microphone access denied.',
        'no-speech': 'No speech detected.',
      };
      setTranslationError(m[e.error] || `STT error: ${e.error}`);
      setIsSttActive(false); setInterimText('');
    };
    r.onend = () => { setIsSttActive(false); setInterimText(''); };
    recognitionRef.current = r;
  }, []);

  // ── Translation flow ──────────────────────────────────────────────────────
  const toggleSTT = useCallback(() => {
    setTranslationError('');
    if (!sttSupported) { setTranslationError('STT not supported. Use Chrome or Edge.'); return; }
    if (isSttActive) { recognitionRef.current?.stop(); }
    else {
      recognitionRef.current.lang = sourceLang === 'bho' ? 'hi-IN' : sourceLang;
      setInterimText('');
      try { recognitionRef.current.start(); setIsSttActive(true); }
      catch { setTranslationError('Could not start mic. Check browser permissions.'); }
    }
  }, [isSttActive, sourceLang, sttSupported]);

  const handleTranslate = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;
    setTranslationError(''); setIsTranslating(true); setTranslatedText('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sourceLang, targetLang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Translation failed');
      setTranslatedText(data.translatedText);
    } catch (e: any) { setTranslationError(e.message); }
    finally { setIsTranslating(false); }
  }, [inputText, sourceLang, targetLang]);

  const playTTS = useCallback(() => {
    if (!translatedText || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(translatedText);
    u.lang = targetLang === 'bho' ? 'hi-IN' : targetLang;
    u.onstart = () => { setIsTtsPlaying(true); setIsTtsPaused(false); };
    u.onend = () => { setIsTtsPlaying(false); setIsTtsPaused(false); };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [translatedText, targetLang]);

  // ── Room registration ─────────────────────────────────────────────────────
  const handleRegister = async () => {
    const phone = regPhone.replace(/\D/g, '');
    if (phone.length < 10) { setRoomError('Enter a valid 10+ digit number.'); return; }
    if (!regName.trim()) { setRoomError('Enter your name.'); return; }
    setRoomError(''); setRegLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, displayName: regName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const u: User = { userId: data.userId, displayName: data.displayName };
      setMe(u);
      localStorage.setItem('itantra_user', JSON.stringify(u));
    } catch (e: any) { setRoomError(e.message); }
    finally { setRegLoading(false); }
  };

  // ── Join room ─────────────────────────────────────────────────────────────
  const handleJoinRoom = () => {
    const code = joinCode.trim().toUpperCase();
    if (!me || code.length < 6) { setRoomError('Enter a 6-letter room code.'); return; }
    setRoomError('');
    connectSocket(code, me);
  };

  // ── Socket connection ─────────────────────────────────────────────────────
  const connectSocket = useCallback((code: string, user: User) => {
    if (socketRef.current?.connected) socketRef.current.disconnect();
    const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      setRoomError('');
      socket.emit('join_room', { code, userId: user.userId });
    });
    socket.on('connect_error', () =>
      setRoomError(`Cannot reach backend at ${BACKEND_URL}. Is the server running?`)
    );
    socket.on('room_joined', ({ history }: { code: string; displayName: string; history: any[] }) => {
      setRoomCode(code);
      setRoomConnected(true);
      setMessages(history.map(m => ({ ...m, mine: m.senderId === user.userId })));
    });
    socket.on('join_error', ({ message }: { message: string }) => {
      setRoomError(message); setRoomConnected(false);
    });
    socket.on('peer_online', ({ displayName }: { displayName: string }) => {
      setPeerOnline(true); setPeerName(prev => prev || displayName);
    });
    socket.on('peer_offline', () => setPeerOnline(false));

    socket.on('message_confirmed', (msg: any) => {
      setMessages(prev => prev.map(m =>
        m.id === msg.id ? { ...msg, mine: true } : m
      ));
    });
    socket.on('receive_message', (msg: any) => {
      DataTracker.recordText(msg.id, code, 'received', msg);
      setMessages(prev => [...prev, { ...msg, mine: false }]);
    });
    socket.on('receive_voice', (msg: any) => {
      setMessages(prev => [...prev, { ...msg, mine: false }]);
    });
    socket.on('disconnect', () => setPeerOnline(false));

    socketRef.current = socket;
  }, []);

  // ── Leave room ────────────────────────────────────────────────────────────
  const leaveRoom = () => {
    socketRef.current?.emit('leave_room');
    socketRef.current?.disconnect();
    socketRef.current = null;
    recorderActions.clear();
    setRoomConnected(false);
    setRoomCode('');
    setPeerName('');
    setPeerOnline(false);
    setMessages([]);
    setJoinCode('');
    setRoomError('');
  };

  // ── Voice upload ──────────────────────────────────────────────────────────
  const uploadVoice = useCallback(async (blob: Blob, seconds: number) => {
    if (!me || !roomCode) return;
    setIsUploading(true); setUploadError(''); setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'voice.webm');
      formData.append('roomCode', roomCode);
      formData.append('userId', me.userId);
      formData.append('duration', String(seconds));

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let totalUploaded = blob.size;
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round(e.loaded / e.total * 100));
            totalUploaded = e.total;
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText);
            DataTracker.recordVoiceUpload(data.msgId, roomCode, blob.size, totalUploaded);
            setMessages(prev => [...prev, {
              id: data.msgId, type: 'voice',
              senderId: me.userId, senderName: me.displayName,
              audioUrl: data.audioUrl, duration: seconds,
              timestamp: new Date().toISOString(), mine: true,
            }]);
            recorderActions.clear();
            setLastBlob(null);
            resolve();
          } else {
            reject(new Error(JSON.parse(xhr.responseText)?.error || 'Upload failed'));
          }
        };
        xhr.onerror = () => reject(new Error('Network error. Check your connection.'));
        xhr.open('POST', `${BACKEND_URL}/api/voice/upload`);
        xhr.send(formData);
      });
    } catch (e: any) {
      setUploadError(e.message);
      setLastBlob({ blob, seconds }); // save for retry
    } finally {
      setIsUploading(false); setUploadProgress(0);
    }
  }, [me, roomCode, recorderActions]);

  // Auto-upload when recording stops
  useEffect(() => {
    if (!recorder.isRecording && recorder.audioBlob && !isUploading && roomConnected) {
      uploadVoice(recorder.audioBlob, Math.max(1, recorder.seconds));
    }
  }, [recorder.isRecording, recorder.audioBlob]);

  // ── Send text message ──────────────────────────────────────────────────────
  const handleSendText = useCallback(() => {
    const text = inputText.trim();
    if (!text || !socketRef.current || !me || !roomConnected) return;
    const optimistic: AnyMessage = {
      id: Date.now().toString(), type: 'text',
      senderId: me.userId, senderName: me.displayName,
      original: text, translated: '…',
      sourceLang, targetLang,
      timestamp: new Date().toISOString(), mine: true,
    };
    setMessages(prev => [...prev, optimistic]);
    setInputText('');
    const payload = { text, sourceLang, targetLang };
    socketRef.current.emit('send_message', payload);
    DataTracker.recordText(optimistic.id, roomCode, 'sent', payload);
  }, [inputText, sourceLang, targetLang, me, roomCode, roomConnected]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-8">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1">Communication Studio</h1>
          <p className="text-gray-400 text-sm">Multilingual translation demo + real device-to-device voice messaging.</p>
        </div>
        <div className={`flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full border ${
          backendOnline === true ? 'bg-success/10 border-success/30 text-success'
            : backendOnline === false ? 'bg-error/10 border-error/30 text-error'
            : 'bg-white/5 border-white/10 text-gray-400'
        }`}>
          <span className={`w-2 h-2 rounded-full ${backendOnline === true ? 'bg-success' : backendOnline === false ? 'bg-error' : 'bg-gray-400 animate-pulse'}`}></span>
          {backendOnline === true ? 'Backend Online' : backendOnline === false ? 'Backend Offline' : 'Checking…'}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — TRANSLATION DEMO (existing, unchanged)
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10"></div>
          <span className="text-xs text-gray-400 font-semibold tracking-widest uppercase px-3">Translation Demo</span>
          <div className="flex-1 h-px bg-white/10"></div>
        </div>

        {translationError && (
          <div className="p-4 bg-error/10 border border-error/20 rounded-xl flex items-start gap-3 text-error text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /><p>{translationError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Sender */}
          <div className="flex flex-col bg-card border border-white/10 rounded-2xl overflow-hidden min-h-[300px]">
            <div className="px-5 py-3 border-b border-white/10 bg-white/5 flex flex-wrap justify-between items-center gap-3">
              <h2 className="font-semibold">Sender (You)</h2>
              <select value={sourceLang} onChange={e => { setSourceLang(e.target.value); setTranslatedText(''); }}
                className="bg-darker border border-white/20 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary">
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </div>
            <div className="flex-1 p-5 flex flex-col gap-3">
              <textarea value={inputText} onChange={e => setInputText(e.target.value)}
                placeholder={`Type or speak in ${LANGUAGES.find(l => l.code === sourceLang)?.name}…`}
                rows={4}
                className="w-full bg-transparent resize-none outline-none text-lg text-white placeholder-gray-600" />
              {interimText && <p className="text-sm text-primary/70 italic border-l-2 border-primary/40 pl-3">{interimText}</p>}
              <div className="flex items-center justify-between pt-3 border-t border-white/10 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <button onClick={toggleSTT}
                    className={`p-3 rounded-full transition-all ${isSttActive ? 'bg-error/20 text-error ring-2 ring-error/40 animate-pulse' : sttSupported ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-white/5 text-gray-600 cursor-not-allowed'}`}>
                    {isSttActive ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                  {isSttActive && <span className="text-xs text-error animate-pulse">Listening…</span>}
                  <button onClick={() => { setInputText(''); setTranslatedText(''); setTranslationError(''); }}
                    className="p-3 rounded-full bg-white/5 text-gray-400 hover:bg-white/10 transition-colors">
                    <RefreshCcw className="w-5 h-5" />
                  </button>
                </div>
                <button onClick={handleTranslate} disabled={!inputText.trim() || isTranslating}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  {isTranslating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {isTranslating ? 'Translating…' : 'Send & Translate'}
                </button>
              </div>
            </div>
          </div>

          {/* Receiver */}
          <div className="flex flex-col bg-card border border-white/10 rounded-2xl overflow-hidden min-h-[300px]">
            <div className="px-5 py-3 border-b border-white/10 bg-white/5 flex flex-wrap justify-between items-center gap-3">
              <h2 className="font-semibold">Receiver (Remote)</h2>
              <select value={targetLang} onChange={e => { setTargetLang(e.target.value); setTranslatedText(''); }}
                className="bg-darker border border-white/20 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-secondary">
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </div>
            <div className="flex-1 p-5 flex flex-col justify-between gap-4">
              <div className="flex-1">
                {!translatedText && !isTranslating && (
                  <p className="text-gray-500 italic text-center mt-12">Waiting for translation…</p>
                )}
                {isTranslating && (
                  <div className="flex flex-col items-center justify-center mt-12 gap-3">
                    <div className="flex gap-1">
                      {[0, 0.15, 0.3].map(d => (
                        <span key={d} className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: `${d}s` }}></span>
                      ))}
                    </div>
                    <p className="text-xs text-primary font-mono">Translating via backend…</p>
                  </div>
                )}
                {translatedText && !isTranslating && (
                  <p className="text-2xl text-white leading-relaxed whitespace-pre-wrap">{translatedText}</p>
                )}
              </div>
              <div className="flex items-center justify-center gap-3 pt-3 border-t border-white/10">
                {isTtsPlaying ? (
                  <>
                    <button onClick={() => { if (isTtsPaused) window.speechSynthesis.resume(); else window.speechSynthesis.pause(); setIsTtsPaused(p => !p); }}
                      className="flex items-center gap-2 px-5 py-2.5 bg-secondary/20 border border-secondary/40 text-secondary rounded-xl font-medium transition-all">
                      {isTtsPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                      {isTtsPaused ? 'Resume' : 'Pause'}
                    </button>
                    <button onClick={() => { window.speechSynthesis.cancel(); setIsTtsPlaying(false); }}
                      className="flex items-center gap-2 px-5 py-2.5 bg-error/20 border border-error/40 text-error rounded-xl font-medium transition-all">
                      <Square className="w-4 h-4 fill-current" /> Stop
                    </button>
                  </>
                ) : (
                  <button onClick={playTTS} disabled={!translatedText}
                    className="flex items-center gap-2 px-5 py-2.5 bg-secondary hover:bg-purple-600 text-white rounded-xl font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                    <Play className="w-4 h-4 fill-current" /> Play Translated Speech
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Test examples */}
        <div className="bg-card border border-white/10 rounded-2xl p-5">
          <p className="text-sm font-semibold text-white mb-3">Quick Test Examples</p>
          <div className="flex flex-wrap gap-3">
            {TEST_EXAMPLES.map((ex, i) => (
              <button key={i} onClick={() => { setSourceLang(ex.from); setTargetLang(ex.to); setInputText(ex.text); setTranslatedText(''); setTranslationError(''); }}
                className="px-4 py-2.5 bg-white/5 border border-white/10 hover:border-primary/40 hover:bg-white/10 rounded-xl text-sm text-left transition-all">
                <span className="block text-xs text-primary mb-1">{ex.label}</span>
                <span className="text-white">{ex.text}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — LIVE VOICE ROOM
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10"></div>
          <span className="text-xs text-gray-400 font-semibold tracking-widest uppercase px-3 flex items-center gap-2">
            <Radio className="w-3 h-3 text-primary" /> Live Voice Room
          </span>
          <div className="flex-1 h-px bg-white/10"></div>
        </div>

        <p className="text-sm text-gray-400">
          Real device-to-device voice messaging through the existing Live Room backend.
          Voice is recorded, uploaded, and delivered to the other device via WebSocket.
        </p>

        {roomError && (
          <div className="p-4 bg-error/10 border border-error/20 rounded-xl flex items-start gap-3 text-error text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /><p>{roomError}</p>
          </div>
        )}

        {/* ── NOT REGISTERED ─────────────────────────────────────────────── */}
        {!me && (
          <div className="bg-card border border-white/10 rounded-2xl p-6 max-w-md flex flex-col gap-4">
            <h3 className="font-semibold flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> Quick Register</h3>
            <p className="text-gray-400 text-sm">Register once to use voice rooms. Your phone number is never shown to others.</p>
            <input type="tel" placeholder="Phone number" value={regPhone}
              onChange={e => setRegPhone(e.target.value)}
              className="w-full bg-darker border border-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary" />
            <input type="text" placeholder="Display name" value={regName}
              onChange={e => setRegName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRegister()}
              className="w-full bg-darker border border-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary" />
            <button onClick={handleRegister} disabled={regLoading}
              className="py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold transition-all disabled:opacity-50">
              {regLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Register & Continue'}
            </button>
          </div>
        )}

        {/* ── REGISTERED — NOT IN ROOM ────────────────────────────────────── */}
        {me && !roomConnected && (
          <div className="bg-card border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white">Signed in as <strong>{me.displayName}</strong></span>
              <button onClick={() => { localStorage.removeItem('itantra_user'); setMe(null); }}
                className="text-xs text-gray-400 hover:text-error transition-colors">Sign out</button>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-400">Enter the 6-letter room code from the <strong className="text-white">Live Room</strong> page, or create one there first.</p>
              <div className="flex gap-2">
                <input type="text" placeholder="Room code (e.g. XK7P2R)" value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={6}
                  className="flex-1 bg-darker border border-white/20 rounded-xl px-4 py-3 text-xl font-mono tracking-widest text-center focus:outline-none focus:border-primary" />
                <button onClick={handleJoinRoom}
                  className="px-5 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold transition-all flex items-center gap-2">
                  <Wifi className="w-4 h-4" /> Join
                </button>
              </div>
              <p className="text-xs text-gray-500">Go to <strong className="text-white">/room</strong> on either device → Create Room → share the 6-letter code → enter it here.</p>
            </div>
          </div>
        )}

        {/* ── IN ROOM — VOICE INTERFACE ───────────────────────────────────── */}
        {me && roomConnected && (
          <div className="flex flex-col gap-4">

            {/* Status bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-card border border-white/10 rounded-xl">
              <div className="flex items-center gap-3">
                <span className={`flex items-center gap-2 text-sm font-medium ${peerOnline ? 'text-success' : 'text-yellow-400'}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${peerOnline ? 'bg-success' : 'bg-yellow-400 animate-pulse'}`}></span>
                  {peerOnline ? `${peerName || 'Peer'} is here` : 'Waiting for peer…'}
                </span>
                <span className="text-xs text-gray-500 font-mono">Room: {roomCode}</span>
              </div>
              <div className="flex items-center gap-2">
                <DataUsageDashboard />
                <button onClick={() => setMuted(m => !m)} title={muted ? 'Unmute' : 'Mute'}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                  {muted ? <VolumeX className="w-4 h-4 text-gray-400" /> : <Volume2 className="w-4 h-4 text-white" />}
                </button>
                <button onClick={() => { const n = !autoPlay; setAutoPlay(n); localStorage.setItem('itantra_autoplay', String(n)); }}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${autoPlay ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                  Auto-play {autoPlay ? 'ON' : 'OFF'}
                </button>
                <button onClick={leaveRoom}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-error/10 hover:bg-error/20 border border-error/20 text-error rounded-lg text-xs transition-colors">
                  <LogOut className="w-3 h-3" /> Leave
                </button>
              </div>
            </div>

            {/* Enable playback unlock button (first-time) */}
            {!playbackUnlocked && (
              <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-primary" /> Enable Voice Playback
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Click once to allow the browser to auto-play incoming voice messages.</p>
                </div>
                <button onClick={() => { setPlaybackUnlocked(true); }}
                  className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-medium transition-all shrink-0">
                  Enable
                </button>
              </div>
            )}

            {/* Message history */}
            <div className="bg-card border border-white/10 rounded-2xl overflow-hidden" style={{ height: '360px' }}>
              <div className="px-4 py-2.5 border-b border-white/10 text-xs text-gray-400 flex items-center justify-between">
                <span>Voice + Text Messages</span>
                <span>{messages.length} messages</span>
              </div>
              <div className="h-full overflow-y-auto p-4 space-y-3 pb-16">
                {messages.length === 0 && (
                  <p className="text-center text-gray-500 italic text-sm mt-16">
                    Click the mic below to start recording a voice message. Click it again to send.
                  </p>
                )}
                {messages.map(msg => {
                  if (msg.type === 'voice') {
                    return (
                      <VoiceMessageBubble key={msg.id}
                        msg={{ ...msg, mine: msg.senderId === me.userId }}
                        autoPlay={autoPlay && playbackUnlocked}
                        muted={muted}
                        roomCode={roomCode}
                        userId={me.userId}
                      />
                    );
                  }
                  const tm = msg as Extract<AnyMessage, { type: 'text' }>;
                  const isMine = tm.senderId === me.userId;
                  return (
                    <div key={msg.id} className={`flex flex-col gap-1 max-w-[78%] ${isMine ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                      <div className={`px-4 py-3 rounded-2xl text-sm ${isMine ? 'bg-primary/20 border border-primary/30 rounded-tr-sm' : 'bg-secondary/20 border border-secondary/30 rounded-tl-sm'}`}>
                        {!isMine && <p className="text-xs text-gray-400 mb-1">{tm.senderName}</p>}
                        <p className="text-white">{tm.original}</p>
                        {tm.translated && tm.translated !== tm.original && tm.translated !== '…' && (
                          <p className="text-gray-300 text-xs mt-1 border-t border-white/10 pt-1">→ {tm.translated}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 px-1">
                        <DataBadge msgId={msg.id} />
                        <span className="text-xs text-gray-600">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            </div>

            {/* Upload progress */}
            {isUploading && (
              <div className="px-4 py-3 bg-card border border-white/10 rounded-xl">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                  <span className="flex items-center gap-2"><Upload className="w-3.5 h-3.5 animate-pulse" /> Uploading voice message…</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-primary transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}

            {/* Upload error + retry */}
            {uploadError && (
              <div className="p-3 bg-error/10 border border-error/20 rounded-xl flex items-center justify-between gap-3 text-sm">
                <span className="text-error flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{uploadError}</span>
                {lastBlob && (
                  <button onClick={() => { uploadVoice(lastBlob.blob, lastBlob.seconds); setUploadError(''); }}
                    className="text-xs text-white underline shrink-0">Retry</button>
                )}
              </div>
            )}

            {/* Voice recorder + text input */}
            <div className="bg-card border border-white/10 rounded-2xl p-5 flex flex-col gap-4">

              {/* Recording indicator */}
              {recorder.isRecording && (
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-error animate-ping inline-block shrink-0"></span>
                  <span className="text-error text-sm font-mono animate-pulse">Recording {recorder.seconds}s / 60s</span>
                  <div className="flex-1 bg-white/10 rounded-full h-1.5">
                    <div className="h-1.5 bg-error rounded-full transition-all" style={{ width: `${(recorder.seconds / 60) * 100}%` }} />
                  </div>
                  <button onClick={recorderActions.stop}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-error/20 hover:bg-error/30 border border-error/30 text-error rounded-lg text-xs transition-all">
                    <Square className="w-3 h-3 fill-current" /> Stop
                  </button>
                </div>
              )}

              {recorder.error && (
                <div className="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />{recorder.error}
                </div>
              )}

              {/* Mic hold-to-record + text send */}
              <div className="flex items-end gap-3">
                {/* Big mic button */}
                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      if (recorder.isRecording) recorderActions.stop();
                      else recorderActions.start();
                    }}
                    disabled={isUploading}
                    title="Click to record voice — click again to stop and send"
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all select-none ${
                      recorder.isRecording
                        ? 'bg-error/30 text-error ring-4 ring-error/40 scale-110 shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                        : isUploading
                        ? 'bg-white/5 text-gray-600 cursor-not-allowed'
                        : 'bg-primary/20 text-primary hover:bg-primary/30 active:scale-110 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                    }`}>
                    {isUploading
                      ? <Loader2 className="w-6 h-6 animate-spin" />
                      : recorder.isRecording ? <Square className="w-6 h-6 fill-current" /> : <Mic className="w-6 h-6" />
                    }
                  </button>
                  <span className="text-xs text-gray-500 text-center w-16 leading-tight">
                    {recorder.isRecording ? 'Click to\nsend' : isUploading ? 'Sending…' : 'Click to\nrecord'}
                  </span>
                </div>

                {/* Text input */}
                <div className="flex-1 flex flex-col gap-2">
                  <textarea value={inputText} onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                    placeholder="Or type a message and press Enter…"
                    rows={2}
                    className="w-full bg-darker border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 resize-none outline-none focus:border-primary transition-colors" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">Enter to send text · Click mic to send voice</span>
                    <button onClick={handleSendText} disabled={!inputText.trim()}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      <Send className="w-3.5 h-3.5" /> Send
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Autoplay explanation */}
            <div className="bg-card border border-white/10 rounded-xl p-4 text-xs text-gray-500 space-y-1">
              <p className="text-white text-sm font-medium mb-1">Voice delivery flow</p>
              <p>1. <strong className="text-white">Record:</strong> Click the mic button → speak → click again.</p>
              <p>2. <strong className="text-white">Auto-upload:</strong> Audio (WebM/Opus, 32 kbps, mono) is immediately uploaded to the backend and stored securely.</p>
              <p>3. <strong className="text-white">Delivery:</strong> Backend emits a <code className="text-primary">receive_voice</code> WebSocket event to the peer's open socket.</p>
              <p>4. <strong className="text-white">Auto-play:</strong> Device 2 receives the URL and attempts to play it automatically. If the browser blocks it, a "Tap to play" button appears inline.</p>
              <p>5. <strong className="text-white">Tab closed:</strong> A Web Push notification is sent. Requires HTTPS — see ngrok setup instructions.</p>
              <p className="text-yellow-400 mt-1">⚠ Only room members can access audio files. Unauthorized requests return 403.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
