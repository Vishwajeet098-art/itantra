import { useState, useEffect, useRef, useCallback } from 'react';
import {
  AlertOctagon, MapPin, MapPinOff, X, CheckCircle, XCircle, Loader2,
  ShieldAlert, ShieldCheck, User, AlertTriangle, Mic, MicOff, Play,
  Pause, Trash2, Bell, BellOff, Upload, Volume2
} from 'lucide-react';

// ── Config ────────────────────────────────────────────────────────────────────
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : `http://${window.location.hostname}:3001`);

const COUNTDOWN_SEC = 5;
const MAX_RECORD_SEC = 30;

type SosPhase = 'idle' | 'recording' | 'preview' | 'countdown' | 'uploading' | 'sending' | 'sent' | 'failed' | 'cancelled';

interface Contact { name: string; phone: string; email: string; }
interface GpsLocation { lat: number; lon: number; accuracy: number; }

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// ── Component ─────────────────────────────────────────────────────────────────
export function Sos() {
  const [phase, setPhase] = useState<SosPhase>('idle');
  const [countdown, setCountdown] = useState(COUNTDOWN_SEC);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [eventId, setEventId] = useState('');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState(''); // local preview URL
  const [remoteAudioUrl, setRemoteAudioUrl] = useState(''); // server-stored URL
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [location, setLocation] = useState<GpsLocation | null>(null);
  const [locationError, setLocationError] = useState('');
  const [contact, setContact] = useState<Contact>({ name: '', phone: '', email: '' });
  const [savedContact, setSavedContact] = useState<Contact | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushStatus, setPushStatus] = useState('');
  const [error, setError] = useState('');
  const [pushResult, setPushResult] = useState('');

  // Incoming SOS from notification click
  const [incomingSos, setIncomingSos] = useState<{ audioUrl: string; senderName: string } | null>(null);
  const [isIncomingPlaying, setIsIncomingPlaying] = useState(false);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const incomingAudioRef = useRef<HTMLAudioElement | null>(null);
  const countdownVal = useRef(COUNTDOWN_SEC);

  // ── Load saved data ──────────────────────────────────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem('itantra_sos_contact');
    if (raw) { try { setSavedContact(JSON.parse(raw)); } catch {} }
    // Check if push is already subscribed
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(reg =>
        reg.pushManager.getSubscription().then(sub => { if (sub) setPushEnabled(true); })
      );
    }
  }, []);

  // ── Register service worker ───────────────────────────────────────────────
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(() => {
        console.log('[SW] Registered');
      }).catch(e => console.error('[SW] Registration failed:', e));

      // Listen for messages from service worker (notification click)
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SOS_NOTIFICATION_CLICK') {
          setIncomingSos({ audioUrl: event.data.audioUrl, senderName: event.data.senderName });
        }
      });
    }
    // Check URL params for incoming SOS (when opened from notification)
    const params = new URLSearchParams(window.location.search);
    const incomingAudio = params.get('audioUrl');
    const incomingSender = params.get('sender');
    if (incomingAudio) setIncomingSos({ audioUrl: decodeURIComponent(incomingAudio), senderName: incomingSender || 'Unknown' });
  }, []);

  // ── Enable push notifications (Device 2) ─────────────────────────────────
  const enablePush = async () => {
    if (!savedContact) { setError('Save a trusted contact first so your subscription can be linked.'); return; }
    setPushStatus('requesting');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setPushStatus('denied'); setError('Notification permission denied. Enable it in browser settings.'); return; }

      const reg = await navigator.serviceWorker.ready;
      // Fetch VAPID public key from backend
      const keyRes = await fetch(`${BACKEND_URL}/api/vapid-public-key`);
      const { publicKey } = await keyRes.json();

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch(`${BACKEND_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription,
          contactId: savedContact.phone || savedContact.email,
          contactName: savedContact.name,
        }),
      });

      setPushEnabled(true);
      setPushStatus('enabled');
      setError('');
    } catch (err: any) {
      setPushStatus('error');
      setError(`Push setup failed: ${err.message}`);
    }
  };

  const disablePush = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`${BACKEND_URL}/api/push/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId: savedContact?.phone || savedContact?.email, endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPushEnabled(false);
      setPushStatus('');
    } catch (err: any) {
      setError(`Could not unsubscribe: ${err.message}`);
    }
  };

  // ── Location ──────────────────────────────────────────────────────────────
  const requestLocation = useCallback(() => {
    setLocationError('');
    if (!navigator.geolocation) { setLocationError('Geolocation not supported.'); return; }
    navigator.geolocation.getCurrentPosition(
      p => setLocation({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      e => {
        const m: Record<number, string> = { 1: 'Location permission denied.', 2: 'Location unavailable.', 3: 'Timeout.' };
        setLocationError(m[e.code] || 'Location error.');
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, []);

  // ── Voice Recording ───────────────────────────────────────────────────────
  const startRecording = async () => {
    setError('');
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(''); setAudioBlob(null); }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setPhase('preview');
        clearInterval(recordTimerRef.current!);
        setRecordingSeconds(0);
      };
      mediaRecorderRef.current = mr;
      mr.start(100);
      setPhase('recording');
      setRecordingSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => {
          if (s + 1 >= MAX_RECORD_SEC) { stopRecording(); return MAX_RECORD_SEC; }
          return s + 1;
        });
      }, 1000);
    } catch (err: any) {
      setError(`Microphone error: ${err.message}. Grant microphone permission and try again.`);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    clearInterval(recordTimerRef.current!);
  };

  const deleteRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl('');
    setPhase('idle');
    setError('');
  };

  const togglePreview = () => {
    if (!previewAudioRef.current) return;
    if (isPreviewPlaying) { previewAudioRef.current.pause(); setIsPreviewPlaying(false); }
    else { previewAudioRef.current.play(); setIsPreviewPlaying(true); }
  };

  // ── SOS Countdown ─────────────────────────────────────────────────────────
  const startCountdown = () => {
    if (!savedContact) { setError('Set a trusted contact first.'); return; }
    if (!audioBlob) { setError('Record a voice note first.'); return; }
    setError('');
    setPhase('countdown');
    countdownVal.current = COUNTDOWN_SEC;
    setCountdown(COUNTDOWN_SEC);
    countdownRef.current = setInterval(() => {
      countdownVal.current -= 1;
      setCountdown(countdownVal.current);
      if (countdownVal.current <= 0) { clearInterval(countdownRef.current!); uploadAndSend(); }
    }, 1000);
  };

  const cancelCountdown = () => {
    clearInterval(countdownRef.current!);
    setPhase('preview');
    setError('');
  };

  // ── Upload Audio + Send SOS Push ──────────────────────────────────────────
  const uploadAndSend = async () => {
    setPhase('uploading');
    setError('');

    // Capture location
    let loc = location;
    if (!loc && navigator.geolocation) {
      try {
        loc = await new Promise<GpsLocation>((res, rej) =>
          navigator.geolocation.getCurrentPosition(
            p => res({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
            rej, { timeout: 4000 }
          )
        );
        setLocation(loc);
      } catch {}
    }

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob!, 'sos-voice.webm');
      formData.append('senderId', `web_${Date.now()}`);
      formData.append('senderName', 'iTantra User');
      formData.append('contactId', savedContact!.phone || savedContact!.email);
      formData.append('contactName', savedContact!.name);
      if (loc) formData.append('location', JSON.stringify({ lat: loc.lat, lon: loc.lon }));
      formData.append('message', 'Emergency SOS voice note via iTantra');

      setPhase('sending');
      const res = await fetch(`${BACKEND_URL}/api/sos/voice`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setEventId(data.eventId);
      setRemoteAudioUrl(data.audioUrl);
      setPushResult(data.note);
      setPhase('sent');
    } catch (err: any) {
      setError(`SOS failed: ${err.message}`);
      setPhase('failed');
    }
  };

  const reset = () => {
    setPhase('idle');
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl('');
    setRemoteAudioUrl('');
    setEventId('');
    setError('');
    setPushResult('');
  };

  const saveContact = () => {
    if (!contact.name.trim()) return;
    localStorage.setItem('itantra_sos_contact', JSON.stringify(contact));
    setSavedContact(contact);
    setEditingContact(false);
  };

  const deleteContact = () => {
    localStorage.removeItem('itantra_sos_contact');
    setSavedContact(null);
    setContact({ name: '', phone: '', email: '' });
    if (pushEnabled) disablePush();
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-1 flex items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-error" /> Emergency SOS
        </h1>
        <p className="text-gray-400 text-sm">Send a voice note SOS to your trusted contact — delivered even when their tab is closed via Web Push.</p>
      </div>

      {/* Incoming SOS banner (Device 2) */}
      {incomingSos && (
        <div className="p-5 bg-error/10 border-2 border-error rounded-2xl flex flex-col gap-4">
          <p className="text-error font-bold text-lg flex items-center gap-2">
            <AlertOctagon className="w-6 h-6" /> Incoming SOS from {incomingSos.senderName}
          </p>
          <audio
            ref={incomingAudioRef}
            src={incomingSos.audioUrl}
            onPlay={() => setIsIncomingPlaying(true)}
            onPause={() => setIsIncomingPlaying(false)}
            onEnded={() => setIsIncomingPlaying(false)}
          />
          <div className="flex gap-3">
            <button onClick={() => incomingAudioRef.current?.play()}
              className="flex items-center gap-2 px-5 py-2.5 bg-error hover:bg-red-600 text-white rounded-xl font-medium transition-all">
              <Volume2 className="w-4 h-4" /> Play Voice Note
            </button>
            <button onClick={() => setIncomingSos(null)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm transition-colors">
              <X className="w-4 h-4" /> Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Honest limitations */}
      <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-start gap-3 text-yellow-300 text-sm">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold mb-1">Closed-tab push works only via HTTPS + browser push enabled.</p>
          <ul className="text-yellow-400/80 text-xs space-y-0.5 list-disc list-inside">
            <li>Device 2 must click "Enable SOS Notifications" below — one time.</li>
            <li>Push delivery is not guaranteed if the phone is offline, or Chrome/Firefox is force-stopped.</li>
            <li>Voice note does not auto-play — Device 2 must tap the notification then press Play.</li>
            <li>For two real devices: expose the backend via HTTPS (ngrok or Railway).</li>
          </ul>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-error/10 border border-error/20 rounded-xl flex items-start gap-3 text-error text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* ── ENABLE NOTIFICATIONS (Device 2) ────────────────────────────────── */}
      <div className="bg-card border border-white/10 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" /> SOS Push Notifications
          </h2>
          {pushEnabled && (
            <button onClick={disablePush} className="text-xs px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors">
              Disable
            </button>
          )}
        </div>
        {pushEnabled ? (
          <div className="flex items-center gap-3 p-3 bg-success/5 border border-success/20 rounded-xl">
            <BellOff className="w-5 h-5 text-success" />
            <div>
              <p className="text-success text-sm font-medium">SOS notifications enabled on this device.</p>
              <p className="text-xs text-gray-500">You will receive an alert even when this tab is closed.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-400">
              <strong className="text-white">Device 2 (Receiver):</strong> Click below to register this browser for push notifications.
              You only need to do this once.
            </p>
            <button onClick={enablePush} disabled={pushStatus === 'requesting'}
              className="flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium transition-all disabled:opacity-50">
              {pushStatus === 'requesting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
              {pushStatus === 'requesting' ? 'Requesting permission…' : 'Enable SOS Notifications'}
            </button>
            {!('PushManager' in window) && (
              <p className="text-xs text-yellow-400">⚠ Web Push not supported in this browser. Use Chrome or Firefox on Android.</p>
            )}
          </div>
        )}
      </div>

      {/* ── TRUSTED CONTACT ────────────────────────────────────────────────── */}
      <div className="bg-card border border-white/10 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2"><User className="w-5 h-5 text-primary" /> Trusted Contact</h2>
          {savedContact && !editingContact && (
            <div className="flex gap-2">
              <button onClick={() => { setContact(savedContact); setEditingContact(true); }}
                className="text-xs px-3 py-1 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors">Edit</button>
              <button onClick={deleteContact}
                className="text-xs px-3 py-1 bg-error/10 hover:bg-error/20 border border-error/20 text-error rounded-lg transition-colors">Remove</button>
            </div>
          )}
        </div>
        {savedContact && !editingContact ? (
          <div className="p-4 bg-success/5 border border-success/20 rounded-xl flex flex-col gap-1">
            <p className="font-semibold text-white flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-success" />{savedContact.name}</p>
            {savedContact.phone && <p className="text-sm text-gray-400 ml-6">{savedContact.phone}</p>}
            {savedContact.email && <p className="text-sm text-gray-400 ml-6">{savedContact.email}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input type="text" placeholder="Name *" value={contact.name} onChange={e => setContact(c => ({ ...c, name: e.target.value }))}
              className="w-full bg-darker border border-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary" />
            <input type="tel" placeholder="Phone (used as contact ID)" value={contact.phone} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))}
              className="w-full bg-darker border border-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary" />
            <input type="email" placeholder="Email" value={contact.email} onChange={e => setContact(c => ({ ...c, email: e.target.value }))}
              className="w-full bg-darker border border-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary" />
            <p className="text-xs text-gray-500">The contact ID (phone or email) must match what Device 2 used when clicking "Enable Notifications".</p>
            <button onClick={saveContact} disabled={!contact.name.trim()}
              className="py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-medium transition-all disabled:opacity-40">Save Contact</button>
          </div>
        )}
      </div>

      {/* ── LOCATION ────────────────────────────────────────────────────────── */}
      <div className="bg-card border border-white/10 rounded-2xl p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><MapPin className="w-5 h-5 text-primary" /> Location (Optional)</h2>
        {location ? (
          <div className="flex items-center justify-between p-3 bg-success/5 border border-success/20 rounded-xl">
            <div>
              <p className="text-sm text-success flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Location ready</p>
              <p className="text-xs text-gray-500">±{Math.round(location.accuracy)}m · {location.lat.toFixed(4)}, {location.lon.toFixed(4)}</p>
            </div>
            <button onClick={() => setLocation(null)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10">
              <MapPinOff className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {locationError && <p className="text-xs text-yellow-400">{locationError}</p>}
            <button onClick={requestLocation}
              className="flex items-center justify-center gap-2 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm transition-colors">
              <MapPin className="w-4 h-4" /> Allow Location Access
            </button>
            <p className="text-xs text-gray-500">Captured only at SOS trigger time. Never tracked continuously.</p>
          </div>
        )}
      </div>

      {/* ── VOICE NOTE + SOS BUTTON ─────────────────────────────────────────── */}
      <div className="bg-card border border-white/10 rounded-2xl p-6">
        <h2 className="font-semibold mb-5 flex items-center gap-2"><Mic className="w-5 h-5 text-error" /> Voice Note + SOS</h2>

        {/* IDLE — no recording yet */}
        {phase === 'idle' && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-gray-400 text-sm text-center">Record a voice note (up to {MAX_RECORD_SEC}s), then send as SOS.</p>
            <button onClick={startRecording}
              className="w-40 h-40 rounded-full bg-error/10 border-4 border-error hover:bg-error/20 active:scale-95 transition-all flex flex-col items-center justify-center gap-2 shadow-[0_0_30px_rgba(239,68,68,0.25)]">
              <Mic className="w-14 h-14 text-error" />
              <span className="text-white text-sm font-semibold">Record SOS</span>
            </button>
          </div>
        )}

        {/* RECORDING */}
        {phase === 'recording' && (
          <div className="flex flex-col items-center gap-5">
            <div className="flex items-center gap-2 text-error animate-pulse font-mono text-lg">
              <span className="w-3 h-3 rounded-full bg-error animate-ping inline-block"></span>
              Recording… {recordingSeconds}s / {MAX_RECORD_SEC}s
            </div>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div className="h-2 rounded-full bg-error transition-all" style={{ width: `${(recordingSeconds / MAX_RECORD_SEC) * 100}%` }}></div>
            </div>
            <button onClick={stopRecording}
              className="flex items-center gap-2 px-8 py-3 bg-error hover:bg-red-600 text-white rounded-2xl font-semibold transition-all">
              <MicOff className="w-5 h-5" /> Stop Recording
            </button>
          </div>
        )}

        {/* PREVIEW */}
        {phase === 'preview' && audioUrl && (
          <div className="flex flex-col gap-4">
            <audio ref={previewAudioRef} src={audioUrl}
              onPlay={() => setIsPreviewPlaying(true)}
              onPause={() => setIsPreviewPlaying(false)}
              onEnded={() => setIsPreviewPlaying(false)} />
            <div className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white font-medium">Voice note ready</p>
                <p className="text-xs text-gray-500">{recordingSeconds > 0 ? `${recordingSeconds}s` : 'Recorded'}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={togglePreview}
                  className="p-3 rounded-full bg-primary/20 hover:bg-primary/30 text-primary transition-colors">
                  {isPreviewPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                </button>
                <button onClick={startRecording}
                  className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 transition-colors" title="Re-record">
                  <Mic className="w-5 h-5" />
                </button>
                <button onClick={deleteRecording}
                  className="p-3 rounded-full bg-error/10 hover:bg-error/20 text-error transition-colors" title="Delete">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
            <button onClick={startCountdown}
              className="w-full py-3 bg-error hover:bg-red-600 text-white rounded-2xl font-bold text-lg transition-all shadow-[0_0_30px_rgba(239,68,68,0.3)]">
              <AlertOctagon className="w-5 h-5 inline mr-2" /> Send SOS
            </button>
            <p className="text-xs text-gray-500 text-center">Sends after a {COUNTDOWN_SEC}-second countdown. You can cancel.</p>
          </div>
        )}

        {/* COUNTDOWN */}
        {phase === 'countdown' && (
          <div className="flex flex-col items-center gap-6">
            <p className="text-error font-semibold text-lg animate-pulse">Sending SOS in…</p>
            <div className="w-36 h-36 rounded-full border-4 border-error flex items-center justify-center shadow-[0_0_40px_rgba(239,68,68,0.4)] animate-pulse">
              <span className="text-6xl font-bold text-error">{countdown}</span>
            </div>
            <button onClick={cancelCountdown}
              className="flex items-center gap-2 px-8 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl font-semibold transition-all">
              <X className="w-5 h-5" /> Cancel — False Alarm
            </button>
          </div>
        )}

        {/* UPLOADING / SENDING */}
        {(phase === 'uploading' || phase === 'sending') && (
          <div className="flex flex-col items-center gap-4 py-6">
            <Loader2 className="w-14 h-14 text-error animate-spin" />
            <p className="text-white font-semibold">{phase === 'uploading' ? 'Uploading voice note…' : 'Sending push notification…'}</p>
            <p className="text-xs text-gray-400">Uploading audio and delivering push to {savedContact?.name}…</p>
          </div>
        )}

        {/* SENT */}
        {phase === 'sent' && (
          <div className="flex flex-col items-center gap-5 py-2">
            <CheckCircle className="w-14 h-14 text-success" />
            <div className="text-center">
              <p className="text-success font-bold text-xl">SOS Sent!</p>
              <p className="text-gray-400 text-sm mt-1">Voice note uploaded. Push notification fired.</p>
            </div>
            {pushResult && (
              <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-center text-gray-400 w-full">
                {pushResult}
              </div>
            )}
            {remoteAudioUrl && (
              <div className="w-full p-4 bg-white/5 border border-white/10 rounded-xl">
                <p className="text-xs text-gray-400 mb-2">Audio stored at:</p>
                <p className="text-xs text-primary break-all">{remoteAudioUrl}</p>
                <audio controls src={remoteAudioUrl} className="w-full mt-2" />
              </div>
            )}
            <div className="flex gap-3 flex-wrap justify-center">
              <button onClick={reset}
                className="flex items-center gap-2 px-5 py-2.5 bg-success/20 border border-success/30 text-success rounded-xl text-sm transition-colors">
                <ShieldCheck className="w-4 h-4" /> I'm Safe — Reset
              </button>
            </div>
          </div>
        )}

        {/* FAILED */}
        {phase === 'failed' && (
          <div className="flex flex-col items-center gap-5 py-4">
            <XCircle className="w-14 h-14 text-error" />
            <p className="text-error font-bold text-xl">SOS Failed</p>
            <p className="text-gray-400 text-sm text-center">{error}</p>
            <p className="text-xs text-gray-500 text-center">
              If offline, call your contact directly: <strong className="text-white">{savedContact?.phone}</strong>
            </p>
            <button onClick={reset} className="px-6 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-sm transition-colors">
              Try Again
            </button>
          </div>
        )}

        {/* CANCELLED */}
        {phase === 'cancelled' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle className="w-12 h-12 text-success" />
            <p className="text-success font-semibold">Cancelled — No SOS was sent.</p>
          </div>
        )}
      </div>

      {/* HTTPS deployment note */}
      <div className="bg-card border border-yellow-500/20 rounded-2xl p-5 text-xs text-gray-400 space-y-1">
        <p className="text-white text-sm font-semibold mb-2">HTTPS Required for Two Real Devices</p>
        <p>Service Workers and Web Push only work on HTTPS (not plain HTTP on a LAN).</p>
        <p>To test on two real devices, expose the backend with ngrok:</p>
        <div className="bg-darker rounded-xl p-3 font-mono text-primary mt-2 space-y-1">
          <p># In one terminal:</p>
          <p>cd server &amp;&amp; node server.js</p>
          <p></p>
          <p># In another terminal:</p>
          <p>ngrok http 3001</p>
          <p></p>
          <p># Copy the https://xxxx.ngrok.io URL</p>
          <p># In Room.tsx and Sos.tsx, set BACKEND_URL to that ngrok URL</p>
          <p># Rebuild: npm run build &amp;&amp; npm run preview -- --host</p>
        </div>
        <p className="mt-2">• Device 2 must also be on HTTPS to register the push subscription.</p>
        <p>• Microphone is never recorded without your explicit action.</p>
        <p>• Location is captured only when SOS is triggered, not continuously.</p>
        <p>• All data stays on your local backend unless you deploy it.</p>
      </div>
    </div>
  );
}
