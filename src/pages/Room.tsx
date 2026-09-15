import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Mic, MicOff, Send, RefreshCcw, AlertTriangle, Loader2,
  LogOut, Users, Search, ArrowLeftRight, Volume2, VolumeX,
  Trash2, Play, Pause, Bell, CheckCircle, Wifi, Settings
} from 'lucide-react';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { VoiceMessageBubble } from '../components/VoiceMessageBubble';
import { DataTracker } from '../services/DataTracker';
import { DataUsageDashboard } from '../components/DataUsageDashboard';
import { DataBadge } from '../components/DataBadge';
import { useDataTracker } from '../hooks/useDataTracker';

// ── Config ────────────────────────────────────────────────────────────────────
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : `http://${window.location.hostname}:3001`);

const LANGUAGES = [
  { code: 'en-IN', name: 'English' }, { code: 'hi-IN', name: 'Hindi' },
  { code: 'bho', name: 'Bhojpuri' }, { code: 'bn-IN', name: 'Bengali' },
  { code: 'ta-IN', name: 'Tamil' }, { code: 'te-IN', name: 'Telugu' },
  { code: 'mr-IN', name: 'Marathi' }, { code: 'gu-IN', name: 'Gujarati' },
  { code: 'kn-IN', name: 'Kannada' }, { code: 'ml-IN', name: 'Malayalam' },
  { code: 'pa-IN', name: 'Punjabi' },
];

type Phase = 'register' | 'lobby' | 'search' | 'connected';

interface User { userId: string; displayName: string; }
interface PeerInfo { userId: string; displayName: string; }

type AnyMessage =
  | { id: string; type: 'text'; senderId: string; senderName: string; original: string; translated: string; sourceLang: string; targetLang: string; timestamp: string; mine: boolean; }
  | { id: string; type: 'voice'; senderId: string; senderName: string; audioUrl: string; duration: number; timestamp: string; mine: boolean; };

function urlBase64ToUint8Array(b64: string) {
  const padding = '='.repeat((4 - b64.length % 4) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...window.atob(base64)].map(c => c.charCodeAt(0)));
}

// ── Component ─────────────────────────────────────────────────────────────────
export function Room() {
  // Auth
  const [phase, setPhase] = useState<Phase>('register');
  const [me, setMe] = useState<User | null>(null);
  const [regPhone, setRegPhone] = useState('');
  const [regName, setRegName] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  // Search + room creation
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResult, setSearchResult] = useState<PeerInfo | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [peer, setPeer] = useState<PeerInfo | null>(null);
  const [peerOnline, setPeerOnline] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  // Languages
  const [myLang, setMyLang] = useState('hi-IN');
  const [peerLang, setPeerLang] = useState('en-IN');

  // Messages
  const [messages, setMessages] = useState<AnyMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Voice
  const { lowBandwidthMode } = useDataTracker();
  const [recorder, recorderActions] = useVoiceRecorder(lowBandwidthMode);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Settings
  const [autoPlayVoice, setAutoPlayVoice] = useState(() =>
    localStorage.getItem('itantra_autoplay') !== 'false'
  );
  const [muted, setMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  // STT
  const [sttText, setSttText] = useState('');
  const [sttInterim, setSttInterim] = useState('');
  const [sttActive, setSttActive] = useState(false);
  const sttRef = useRef<any>(null);

  // General
  const [error, setError] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Load saved user
  useEffect(() => {
    const saved = localStorage.getItem('itantra_user');
    if (saved) {
      try {
        const u = JSON.parse(saved);
        setMe(u);
        setPhase('lobby');
      } catch {}
    }
    // Check push
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(r =>
        r.pushManager.getSubscription().then(s => { if (s) setPushEnabled(true); })
      );
    }
    // Handle ?code= param (from push notification link)
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) setJoinCode(code.toUpperCase());
  }, []);

  // STT setup
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = false; r.interimResults = true;
    r.onresult = (e: any) => {
      let fin = ''; let int = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t; else int += t;
      }
      if (fin) { setSttText(p => (p + ' ' + fin).trim()); setSttInterim(''); }
      else setSttInterim(int);
    };
    r.onerror = () => { setSttActive(false); setSttInterim(''); };
    r.onend = () => { setSttActive(false); setSttInterim(''); };
    sttRef.current = r;
  }, []);

  // ── Registration ──────────────────────────────────────────────────────────
  const handleRegister = async () => {
    const phone = regPhone.replace(/\D/g, '');
    if (phone.length < 10) { setError('Enter a valid 10+ digit phone number.'); return; }
    if (!regName.trim()) { setError('Enter your name.'); return; }
    setError(''); setRegLoading(true);
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
      setPhase('lobby');
    } catch (e: any) {
      setError(e.message);
    } finally { setRegLoading(false); }
  };

  // ── User search ───────────────────────────────────────────────────────────
  const handleSearch = async () => {
    const phone = searchPhone.replace(/\D/g, '');
    if (phone.length < 10) { setError('Enter a 10+ digit phone number.'); return; }
    setError(''); setSearchLoading(true); setSearchResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/search?phone=${phone}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSearchResult(data);
    } catch (e: any) { setError(e.message); }
    finally { setSearchLoading(false); }
  };

  // ── Create private room ───────────────────────────────────────────────────
  const handleCreateRoom = async (peerId: string, peerName: string) => {
    if (!me) return;
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: me.userId, peerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPeer({ userId: peerId, displayName: peerName });
      setRoomCode(data.code);
      connectSocket(data.code, me);
      setPhase('connected');
    } catch (e: any) { setError((e as any).message); }
  };

  // ── Join room by code ─────────────────────────────────────────────────────
  const handleJoinByCode = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!me || code.length < 6) { setError('Enter a 6-letter room code.'); return; }
    setError('');
    setRoomCode(code);
    setPeer(null); // peer info will come from history
    connectSocket(code, me);
    setPhase('connected');
  };

  // ── Socket ────────────────────────────────────────────────────────────────
  const connectSocket = useCallback((code: string, user: User) => {
    if (socketRef.current?.connected) socketRef.current.disconnect();
    const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      setError('');
      socket.emit('join_room', { code, userId: user.userId });
    });
    socket.on('connect_error', () =>
      setError(`Cannot reach backend at ${BACKEND_URL}. Is the server running?`)
    );

    socket.on('room_joined', ({ history }: { code: string; displayName: string; history: any[] }) => {
      // Restore history
      const msgs: AnyMessage[] = history.map(m => ({
        ...m,
        mine: m.senderId === user.userId,
      }));
      setMessages(msgs);
    });

    socket.on('join_error', ({ message }: { message: string }) => {
      setError(message);
      setPhase('lobby');
    });

    socket.on('peer_online', ({ displayName }: { displayName: string }) => {
      setPeerOnline(true);
      if (!peer) setPeer({ userId: '', displayName });
    });
    socket.on('peer_offline', () => setPeerOnline(false));

    socket.on('message_confirmed', (msg: any) => {
      setMessages(prev => prev.map(m =>
        m.type === 'text' && (m as any).pending && m.id === msg.id
          ? { ...msg, mine: true }
          : m
      ));
      setIsSending(false);
    });

    socket.on('receive_message', (msg: any) => {
      DataTracker.recordText(msg.id, code, 'received', msg);
      setMessages(prev => [...prev, { ...msg, mine: false }]);
    });

    socket.on('receive_voice', (msg: any) => {
      // the voice audio itself will be tracked in VoiceMessageBubble
      setMessages(prev => [...prev, { ...msg, mine: false }]);
    });

    socket.on('disconnect', () => setPeerOnline(false));

    socketRef.current = socket;
  }, [peer]);

  // ── Send text ─────────────────────────────────────────────────────────────
  const handleSendText = useCallback(() => {
    const text = (sttText || inputText).trim();
    if (!text || !socketRef.current || isSending) return;
    setError('');
    const optimistic: AnyMessage = {
      id: Date.now().toString(),
      type: 'text',
      senderId: me!.userId,
      senderName: me!.displayName,
      original: text,
      translated: '…',
      sourceLang: myLang,
      targetLang: peerLang,
      timestamp: new Date().toISOString(),
      mine: true,
    };
    setMessages(prev => [...prev, optimistic]);
    setInputText('');
    setSttText('');
    setIsSending(true);
    
    const payload = { text, sourceLang: myLang, targetLang: peerLang };
    socketRef.current.emit('send_message', payload);
    DataTracker.recordText(optimistic.id, roomCode, 'sent', payload);
  }, [inputText, sttText, myLang, peerLang, isSending, me, roomCode]);

  // ── Upload voice automatically after recording stops ──────────────────────
  const uploadVoice = useCallback(async (blob: Blob, seconds: number) => {
    if (!me || !roomCode) return;
    setIsUploading(true);
    setUploadError('');
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'voice.webm');
      formData.append('roomCode', roomCode);
      formData.append('userId', me.userId);
      formData.append('duration', String(seconds));

      // XHR for progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let totalUploaded = blob.size; // fallback
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
            
            // Add optimistic voice bubble to own chat
            setMessages(prev => [...prev, {
              id: data.msgId,
              type: 'voice',
              senderId: me.userId,
              senderName: me.displayName,
              audioUrl: data.audioUrl,
              duration: seconds,
              timestamp: new Date().toISOString(),
              mine: true,
            }]);
            recorderActions.clear();
            resolve();
          } else {
            reject(new Error(JSON.parse(xhr.responseText)?.error || 'Upload failed'));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during upload.'));
        xhr.open('POST', `${BACKEND_URL}/api/voice/upload`);
        xhr.send(formData);
      });
    } catch (e: any) {
      setUploadError(e.message);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [me, roomCode, recorderActions]);

  // Auto-upload when recording stops
  useEffect(() => {
    if (!recorder.isRecording && recorder.audioBlob && !isUploading) {
      uploadVoice(recorder.audioBlob, Math.max(1, recorder.seconds));
    }
  }, [recorder.isRecording, recorder.audioBlob]);

  // ── Enable push ───────────────────────────────────────────────────────────
  const enablePush = async () => {
    if (!me) return;
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { setError('Notification permission denied.'); return; }
    const reg = await navigator.serviceWorker.ready;
    const keyRes = await fetch(`${BACKEND_URL}/api/vapid-public-key`);
    const { publicKey } = await keyRes.json();
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    await fetch(`${BACKEND_URL}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub, userId: me.userId }),
    });
    setPushEnabled(true);
  };

  const leaveRoom = () => {
    socketRef.current?.emit('leave_room');
    socketRef.current?.disconnect();
    socketRef.current = null;
    recorderActions.clear();
    setPhase('lobby');
    setRoomCode('');
    setPeer(null);
    setPeerOnline(false);
    setMessages([]);
    setInputText('');
    setSttText('');
    setError('');
  };

  const toggleSTT = () => {
    if (!sttRef.current) { setError('Speech recognition not supported. Use Chrome.'); return; }
    if (sttActive) { sttRef.current.stop(); }
    else { sttRef.current.lang = myLang === 'bho' ? 'hi-IN' : myLang; try { sttRef.current.start(); setSttActive(true); } catch {} }
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1">Live Room</h1>
          <p className="text-gray-400 text-sm">Private voice + text communication between two people.</p>
        </div>
        {phase === 'connected' && (
          <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border font-mono ${
            peerOnline ? 'bg-success/10 border-success/30 text-success' : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${peerOnline ? 'bg-success' : 'bg-yellow-400 animate-pulse'}`}></span>
            {peerOnline ? `${peer?.displayName || 'Peer'} is here` : 'Waiting for peer'} · {roomCode}
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-error/10 border border-error/20 rounded-xl flex items-start gap-3 text-error text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" /><p>{error}</p>
        </div>
      )}

      {/* ── REGISTER ─────────────────────────────────────────────────────── */}
      {phase === 'register' && (
        <div className="bg-card border border-white/10 rounded-2xl p-8 max-w-md mx-auto w-full flex flex-col gap-5">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-1">Register to Use Live Room</h2>
            <p className="text-gray-400 text-sm">Your phone number is only used to find you — it is never shown in the room.</p>
          </div>
          <input type="tel" placeholder="Phone number (e.g. 9876543210)" value={regPhone}
            onChange={e => setRegPhone(e.target.value)}
            className="w-full bg-darker border border-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary" />
          <input type="text" placeholder="Your display name" value={regName}
            onChange={e => setRegName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRegister()}
            className="w-full bg-darker border border-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary" />
          <p className="text-xs text-gray-500">Phone is stored only in memory on the local server. It is not shared with anyone.</p>
          <button onClick={handleRegister} disabled={regLoading}
            className="w-full py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-semibold transition-all disabled:opacity-50">
            {regLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Register & Continue'}
          </button>
        </div>
      )}

      {/* ── LOBBY ────────────────────────────────────────────────────────── */}
      {phase === 'lobby' && me && (
        <div className="flex flex-col gap-6">
          <div className="px-4 py-3 bg-card border border-white/10 rounded-xl flex items-center justify-between">
            <span className="text-sm text-white">Signed in as <strong>{me.displayName}</strong></span>
            <button onClick={() => { localStorage.removeItem('itantra_user'); setMe(null); setPhase('register'); }}
              className="text-xs text-gray-400 hover:text-error transition-colors">Sign out</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Search + start chat */}
            <div className="bg-card border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                <Search className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-lg font-semibold">Start a Private Room</h2>
              <p className="text-gray-400 text-sm">Find someone by their phone number and start a private room.</p>
              <div className="flex gap-2">
                <input type="tel" placeholder="Their phone number" value={searchPhone}
                  onChange={e => setSearchPhone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  className="flex-1 bg-darker border border-white/20 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
                <button onClick={handleSearch} disabled={searchLoading}
                  className="px-4 py-2.5 bg-primary hover:bg-primary-hover rounded-xl transition-all disabled:opacity-50">
                  {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </div>
              {searchResult && (
                <div className="p-4 bg-success/5 border border-success/20 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">{searchResult.displayName}</p>
                    <p className="text-xs text-gray-500">Found · phone not shown</p>
                  </div>
                  <button onClick={() => handleCreateRoom(searchResult.userId, searchResult.displayName)}
                    className="px-4 py-2 bg-primary hover:bg-primary-hover rounded-lg text-sm font-medium transition-all">
                    Start Room
                  </button>
                </div>
              )}
            </div>

            {/* Join by code */}
            <div className="bg-card border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
              <div className="w-12 h-12 bg-secondary/10 rounded-xl flex items-center justify-center">
                <Wifi className="w-6 h-6 text-secondary" />
              </div>
              <h2 className="text-lg font-semibold">Join by Code</h2>
              <p className="text-gray-400 text-sm">Enter the 6-letter room code shared by the other person.</p>
              <input type="text" placeholder="XXXXXX" value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="w-full bg-darker border border-white/20 rounded-xl px-4 py-3 text-3xl font-mono tracking-widest text-center focus:outline-none focus:border-secondary" />
              <button onClick={handleJoinByCode}
                className="w-full py-3 bg-secondary hover:bg-purple-600 rounded-xl font-semibold transition-all">
                Join Room
              </button>
            </div>
          </div>

          {/* Push enable for when offline */}
          {!pushEnabled && 'PushManager' in window && (
            <div className="bg-card border border-white/10 rounded-2xl p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> Enable background notifications</p>
                <p className="text-xs text-gray-400 mt-1">Get notified of voice messages even when this tab is closed.</p>
              </div>
              <button onClick={enablePush}
                className="px-4 py-2 bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary rounded-xl text-sm transition-colors shrink-0">
                Enable
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── CONNECTED ────────────────────────────────────────────────────── */}
      {phase === 'connected' && me && (
        <div className="flex flex-col gap-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-card border border-white/10 rounded-xl">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-white">{me.displayName}</span>
              <span className="text-gray-500 text-sm">→</span>
              <span className={`text-sm ${peerOnline ? 'text-success' : 'text-gray-400'}`}>
                {peer?.displayName || 'Peer'}
                {peerOnline ? <span className="ml-1 text-xs">(online)</span> : <span className="ml-1 text-xs text-gray-500">(offline)</span>}
              </span>
            </div>
            <DataUsageDashboard />
            <div className="flex items-center gap-2">
              <button onClick={() => setMuted(m => !m)} title={muted ? 'Unmute' : 'Mute incoming audio'}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                {muted ? <VolumeX className="w-4 h-4 text-gray-400" /> : <Volume2 className="w-4 h-4 text-white" />}
              </button>
              <button onClick={() => setShowSettings(s => !s)} title="Settings"
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                <Settings className="w-4 h-4 text-white" />
              </button>
              <button onClick={leaveRoom}
                className="flex items-center gap-2 px-3 py-1.5 bg-error/10 hover:bg-error/20 border border-error/20 text-error rounded-lg text-xs transition-colors">
                <LogOut className="w-3 h-3" /> Leave
              </button>
            </div>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="bg-card border border-white/10 rounded-xl p-4 flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">Automatic Voice Playback</p>
                  <p className="text-xs text-gray-400">Auto-plays incoming voice messages. Browser may still block it.</p>
                </div>
                <button onClick={() => {
                  const next = !autoPlayVoice;
                  setAutoPlayVoice(next);
                  localStorage.setItem('itantra_autoplay', String(next));
                }} className={`w-12 h-6 rounded-full transition-all ${autoPlayVoice ? 'bg-primary' : 'bg-white/20'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${autoPlayVoice ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">Mute Incoming Audio</p>
                  <p className="text-xs text-gray-400">Silences all incoming voice messages.</p>
                </div>
                <button onClick={() => setMuted(m => !m)} className={`w-12 h-6 rounded-full transition-all ${muted ? 'bg-error' : 'bg-white/20'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${muted ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div className="text-xs text-gray-500 p-3 bg-darker rounded-lg">
                <p className="font-medium text-white mb-1">Auto-play browser restrictions</p>
                <p>Browsers block auto-play until the user has interacted with the page. If blocked, a "Tap to play" button will appear on each voice message. After one manual play, future messages may auto-play.</p>
              </div>
            </div>
          )}

          {/* Languages */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-card border border-white/10 rounded-xl p-3">
              <label className="block text-xs text-gray-400 mb-1.5">My Language</label>
              <select value={myLang} onChange={e => setMyLang(e.target.value)}
                className="w-full bg-darker border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary">
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </div>
            <button onClick={() => { setMyLang(peerLang); setPeerLang(myLang); }}
              className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
              <ArrowLeftRight className="w-4 h-4" />
            </button>
            <div className="flex-1 bg-card border border-white/10 rounded-xl p-3">
              <label className="block text-xs text-gray-400 mb-1.5">Peer's Language</label>
              <select value={peerLang} onChange={e => setPeerLang(e.target.value)}
                className="w-full bg-darker border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-secondary">
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </div>
          </div>

          {/* Message history */}
          <div className="bg-card border border-white/10 rounded-2xl flex flex-col overflow-hidden" style={{ height: '400px' }}>
            <div className="px-4 py-2.5 border-b border-white/10 text-xs text-gray-400 flex items-center justify-between">
              <span>Chat · Room {roomCode}</span>
              <span>{messages.length} messages</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-center text-gray-500 italic text-sm mt-16">No messages yet. Type or record a voice note.</p>
              )}
              {messages.map(msg => {
                if (msg.type === 'voice') {
                  return (
                    <VoiceMessageBubble
                      key={msg.id}
                      msg={{ ...msg, mine: msg.senderId === me.userId }}
                      autoPlay={autoPlayVoice}
                      muted={muted}
                      roomCode={roomCode}
                      userId={me.userId}
                    />
                  );
                }
                const textMsg = msg as Extract<AnyMessage, { type: 'text' }>;
                const isMine = textMsg.senderId === me.userId;
                return (
                  <div key={msg.id} className={`flex flex-col gap-1 max-w-[80%] ${isMine ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                    <div className={`px-4 py-3 rounded-2xl text-sm ${isMine ? 'bg-primary/20 border border-primary/30 rounded-tr-sm' : 'bg-secondary/20 border border-secondary/30 rounded-tl-sm'}`}>
                      {!isMine && <p className="text-xs text-gray-400 mb-1">{textMsg.senderName}</p>}
                      <p className="text-white">{textMsg.original}</p>
                      {textMsg.translated && textMsg.translated !== textMsg.original && textMsg.translated !== '…' && (
                        <p className="text-gray-300 text-xs mt-1 border-t border-white/10 pt-1">→ {textMsg.translated}</p>
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

          {/* Voice recording bar */}
          <div className="bg-card border border-white/10 rounded-2xl p-4">
            {recorder.error && (
              <div className="mb-3 p-3 bg-error/10 border border-error/20 rounded-xl text-error text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />{recorder.error}
              </div>
            )}
            {uploadError && (
              <div className="mb-3 p-3 bg-error/10 border border-error/20 rounded-xl text-error text-xs flex items-center justify-between gap-2">
                <span className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{uploadError}</span>
                <button onClick={() => recorder.audioBlob && uploadVoice(recorder.audioBlob, recorder.seconds)}
                  className="text-xs underline shrink-0">Retry</button>
              </div>
            )}

            {isUploading && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Uploading voice message…</span><span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}

            {recorder.isRecording && (
              <div className="mb-3 flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-error animate-ping inline-block"></span>
                <span className="text-error text-sm font-mono animate-pulse">Recording {recorder.seconds}s / 60s</span>
                <div className="flex-1 bg-white/10 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-error transition-all" style={{ width: `${(recorder.seconds / 60) * 100}%` }} />
                </div>
              </div>
            )}

            {/* Text input + controls */}
            <div className="flex flex-col gap-3">
              <textarea
                value={sttText || inputText}
                onChange={e => { setSttText(''); setInputText(e.target.value); }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                placeholder="Type a message… (Enter to send)"
                rows={2}
                className="w-full bg-transparent resize-none outline-none text-white placeholder-gray-600 text-sm"
              />
              {sttInterim && <p className="text-xs text-primary/70 italic border-l-2 border-primary/40 pl-3">{sttInterim}</p>}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10 flex-wrap">
                <div className="flex items-center gap-2">
                  {/* Voice record button */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      if (recorder.isRecording) recorderActions.stop();
                      else recorderActions.start();
                    }}
                    disabled={isUploading}
                    title="Click to record voice · Click again to send"
                    className={`flex items-center gap-2 px-3 py-2 rounded-full transition-all ${
                      recorder.isRecording
                        ? 'bg-error/20 text-error ring-2 ring-error/40'
                        : isUploading
                        ? 'bg-white/5 text-gray-600 cursor-not-allowed'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                     recorder.isRecording ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
                    <span className="text-xs">{recorder.isRecording ? 'Stop & Send' : isUploading ? 'Sending' : 'Voice'}</span>
                  </button>
                  {/* STT button */}
                  <button onClick={toggleSTT} title="Speech to text"
                    className={`p-2.5 rounded-full transition-all ${sttActive ? 'bg-primary/20 text-primary ring-1 ring-primary/40 animate-pulse' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                    <Mic className="w-4 h-4" />
                  </button>

                  {(inputText || sttText) && (
                    <button onClick={() => { setInputText(''); setSttText(''); }}
                      className="p-2.5 rounded-full bg-white/5 text-gray-400 hover:bg-white/10 transition-colors">
                      <RefreshCcw className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <button onClick={handleSendText}
                  disabled={!(inputText.trim() || sttText.trim()) || isSending}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm">
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {isSending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </div>

          {/* Autoplay + closed-tab disclaimer */}
          <div className="bg-card border border-white/10 rounded-xl p-4 text-xs text-gray-500 space-y-1">
            <p className="font-medium text-white text-sm">How voice messages work</p>
            <p>• <strong className="text-white">In-room:</strong> Voice messages are delivered instantly via WebSocket and auto-played (if your browser allows it).</p>
            <p>• <strong className="text-white">Tab closed:</strong> A push notification is sent. Tapping it opens this room and shows the voice message. <em>Audio does not auto-play while the tab is closed.</em></p>
            <p>• <strong className="text-white">Browser force-stopped or offline:</strong> Push delivery is not guaranteed. For reliable background alerting a native Android app with FCM is needed.</p>
            <p>• Voice messages use WebM/Opus (32 kbps mono) to minimize mobile data usage.</p>
          </div>
        </div>
      )}
    </div>
  );
}
