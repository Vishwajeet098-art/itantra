import { useState, useRef, useCallback } from 'react';

export interface VoiceRecorderState {
  isRecording: boolean;
  seconds: number;
  audioBlob: Blob | null;
  audioUrl: string;
  error: string;
}

export interface VoiceRecorderActions {
  start: () => Promise<void>;
  stop: () => void;
  clear: () => void;
}

const MAX_SECONDS = 60;

export function useVoiceRecorder(lowBandwidth = false): [VoiceRecorderState, VoiceRecorderActions] {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = useRef<((blob: Blob) => void) | null>(null);

  const start = useCallback(async () => {
    setError('');
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(''); setAudioBlob(null); }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: lowBandwidth ? 8000 : 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
    } catch (e: any) {
      const msgs: Record<string, string> = {
        NotAllowedError: 'Microphone permission denied. Allow it in browser settings.',
        NotFoundError: 'No microphone found on this device.',
        NotReadableError: 'Microphone is already in use by another app.',
      };
      setError(msgs[e.name] || `Microphone error: ${e.message}`);
      return;
    }

    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find(t => MediaRecorder.isTypeSupported(t)) || '';

    const mr = new MediaRecorder(stream, {
      mimeType: mimeType || undefined,
      audioBitsPerSecond: lowBandwidth ? 16000 : 32000,
    });

    chunksRef.current = [];
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      clearInterval(timerRef.current!);
      const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
      const url = URL.createObjectURL(blob);
      setAudioBlob(blob);
      setAudioUrl(url);
      setIsRecording(false);
      if (resolveRef.current) { resolveRef.current(blob); resolveRef.current = null; }
    };

    mediaRecorderRef.current = mr;
    mr.start(200); // collect chunks every 200ms
    setIsRecording(true);
    setSeconds(0);

    timerRef.current = setInterval(() => {
      setSeconds(s => {
        if (s + 1 >= MAX_SECONDS) {
          mr.stop();
          return MAX_SECONDS;
        }
        return s + 1;
      });
    }, 1000);
  }, [audioUrl]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    clearInterval(timerRef.current!);
  }, []);

  const clear = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    clearInterval(timerRef.current!);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl('');
    setIsRecording(false);
    setSeconds(0);
    setError('');
  }, [audioUrl]);

  return [
    { isRecording, seconds, audioBlob, audioUrl, error },
    { start, stop, clear },
  ];
}
