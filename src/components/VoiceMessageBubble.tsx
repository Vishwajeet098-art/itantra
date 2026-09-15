import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, Loader2 } from 'lucide-react';
import { DataTracker } from '../services/DataTracker';
import { DataBadge } from './DataBadge';

interface Props {
  msg: {
    id: string;
    senderName: string;
    audioUrl: string;
    duration: number;
    timestamp: string;
    mine: boolean;
  };
  autoPlay?: boolean;
  muted?: boolean;
  roomCode: string;
  userId: string;
}

export function VoiceMessageBubble({ msg, autoPlay, muted, roomCode, userId }: Props) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(msg.duration || 0);
  const [playStatus, setPlayStatus] = useState<'idle' | 'fetching' | 'loading' | 'playing' | 'paused' | 'done' | 'error'>('idle');
  const [autoPlayBlocked, setAutoPlayBlocked] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const didAutoPlay = useRef(false);
  const localBlobUrl = useRef<string>('');

  const authUrl = `${msg.audioUrl.split('?')[0]}?room=${roomCode}&uid=${userId}`;

  // Fetch the audio EXACTLY to measure download bytes, cache it, and play it.
  const fetchAndPlay = async (isAutoPlayAttempt: boolean) => {
    try {
      if (!localBlobUrl.current) {
        setPlayStatus('fetching');
        const res = await fetch(authUrl);
        if (!res.ok) throw new Error('Fetch failed');
        const contentLength = res.headers.get('Content-Length');
        const blob = await res.blob();
        
        if (!msg.mine) {
          DataTracker.recordVoiceDownload(msg.id, roomCode, blob.size, contentLength ? parseInt(contentLength, 10) : undefined);
        }
        
        localBlobUrl.current = URL.createObjectURL(blob);
      }

      setPlayStatus('loading');
      if (!audioRef.current) {
        const a = new Audio();
        audioRef.current = a;
        a.onloadedmetadata = () => { if (a.duration && isFinite(a.duration)) setDuration(a.duration); };
        a.ontimeupdate = () => { if (a.duration) setProgress(a.currentTime / a.duration); };
        a.onplay = () => { setPlaying(true); setPlayStatus('playing'); };
        a.onpause = () => { setPlaying(false); setPlayStatus('paused'); };
        a.onended = () => { setPlaying(false); setPlayStatus('done'); setProgress(0); };
        a.onerror = () => { setPlayStatus('error'); setPlaying(false); };
      }

      const audio = audioRef.current;
      audio.src = localBlobUrl.current;
      
      try {
        await audio.play();
        setAutoPlayBlocked(false);
      } catch (e) {
        if (isAutoPlayAttempt) {
          setAutoPlayBlocked(true);
          setPlayStatus('idle');
        } else {
          setPlayStatus('error');
        }
      }
    } catch (err) {
      setPlayStatus('error');
    }
  };

  useEffect(() => {
    // If it's a new received message and autoPlay is on, attempt fetch+play
    if (autoPlay && !msg.mine && !didAutoPlay.current && !muted) {
      didAutoPlay.current = true;
      fetchAndPlay(true);
    }
    return () => { 
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    };
  }, [msg.id, autoPlay, muted]); // only run when ID changes

  useEffect(() => {
    // Cleanup blob url on unmount
    return () => {
      if (localBlobUrl.current) URL.revokeObjectURL(localBlobUrl.current);
    };
  }, []);

  const togglePlay = () => {
    setAutoPlayBlocked(false);
    if (playing && audioRef.current) {
      audioRef.current.pause();
    } else {
      fetchAndPlay(false);
    }
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`flex flex-col gap-1 max-w-[75%] ${msg.mine ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
      <div className={`w-full px-4 py-3 rounded-2xl ${
        msg.mine
          ? 'bg-primary/20 border border-primary/30 rounded-tr-sm'
          : 'bg-secondary/20 border border-secondary/30 rounded-tl-sm'
      }`}>
        {!msg.mine && <p className="text-xs text-gray-400 mb-2">{msg.senderName}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${
              msg.mine ? 'bg-primary/30 hover:bg-primary/50 text-primary' : 'bg-secondary/30 hover:bg-secondary/50 text-secondary'
            }`}
          >
            {playStatus === 'loading' || playStatus === 'fetching'
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : playing
              ? <Pause className="w-4 h-4" />
              : <Play className="w-4 h-4 fill-current" />
            }
          </button>

          {/* Waveform + progress */}
          <div className="flex-1 flex flex-col gap-1">
            <div className="relative h-8 flex items-center gap-px">
              {Array.from({ length: 30 }, (_, i) => {
                const h = 20 + Math.sin(i * 1.3) * 12 + Math.cos(i * 0.7) * 8;
                const active = i / 30 <= progress;
                return (
                  <div key={i}
                    className={`flex-1 rounded-full transition-colors ${active
                      ? msg.mine ? 'bg-primary' : 'bg-secondary'
                      : 'bg-white/20'
                    }`}
                    style={{ height: `${h}%` }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{playStatus === 'playing' ? fmt(progress * duration) : fmt(duration)}</span>
              <span>{playStatus === 'done' ? 'Played' : playStatus === 'error' ? '⚠ Error' : ''}</span>
            </div>
          </div>
        </div>

        {autoPlayBlocked && !msg.mine && (
          <button onClick={togglePlay}
            className="mt-2 w-full flex items-center justify-center gap-2 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white transition-colors">
            <Volume2 className="w-3 h-3" /> Tap to play voice message
          </button>
        )}

        {playStatus === 'error' && (
          <button onClick={togglePlay} className="mt-2 text-xs text-error underline">Retry</button>
        )}
      </div>
      <div className="flex items-center gap-2 px-1">
        <DataBadge msgId={msg.id} />
        <span className="text-xs text-gray-600">
          {new Date(msg.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
