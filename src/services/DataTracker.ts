type MessageType = 'text' | 'voice' | 'system';
type Direction = 'sent' | 'received';

export interface UsageRecord {
  id: string;
  roomId: string;
  type: MessageType;
  direction: Direction;
  payloadBytes: number;
  networkBytes: number;
  isEstimate: boolean;
  timestamp: string;
}

class DataTrackerService {
  private records: Map<string, UsageRecord> = new Map();
  private listeners: Set<() => void> = new Set();
  public lowBandwidthMode: boolean = localStorage.getItem('itantra_low_bw') === 'true';

  // Constants for estimation
  private readonly WS_OVERHEAD = 30; // socket.io framing overhead estimate

  public toggleLowBandwidth() {
    this.lowBandwidthMode = !this.lowBandwidthMode;
    localStorage.setItem('itantra_low_bw', String(this.lowBandwidthMode));
    this.notify();
  }

  public recordText(id: string, roomId: string, direction: Direction, textPayload: any) {
    if (this.records.has(id)) return;
    const str = typeof textPayload === 'string' ? textPayload : JSON.stringify(textPayload);
    const payloadBytes = new TextEncoder().encode(str).length;
    const networkBytes = payloadBytes + this.WS_OVERHEAD; // Estimated WS framing overhead

    this.records.set(id, {
      id, roomId, type: 'text', direction,
      payloadBytes, networkBytes, isEstimate: true,
      timestamp: new Date().toISOString()
    });
    this.notify();
  }

  public recordVoiceUpload(id: string, roomId: string, blobSize: number, totalUploaded: number) {
    if (this.records.has(id)) return;
    this.records.set(id, {
      id, roomId, type: 'voice', direction: 'sent',
      payloadBytes: blobSize,
      networkBytes: totalUploaded > blobSize ? totalUploaded : blobSize + 200, // exact if progress event > blob, else estimate multipart overhead
      isEstimate: totalUploaded <= blobSize,
      timestamp: new Date().toISOString()
    });
    this.notify();
  }

  public recordVoiceDownload(id: string, roomId: string, blobSize: number, headerContentLength?: number) {
    if (this.records.has(id)) return;
    const networkBytes = headerContentLength || blobSize + 300; // estimated HTTP headers overhead
    this.records.set(id, {
      id, roomId, type: 'voice', direction: 'received',
      payloadBytes: blobSize,
      networkBytes,
      isEstimate: !headerContentLength,
      timestamp: new Date().toISOString()
    });
    this.notify();
  }

  public getTotals() {
    let sentText = 0, recvText = 0, sentVoice = 0, recvVoice = 0;
    let textCount = 0, voiceCount = 0;
    
    this.records.forEach(r => {
      if (r.type === 'text') {
        textCount++;
        if (r.direction === 'sent') sentText += r.networkBytes;
        else recvText += r.networkBytes;
      } else if (r.type === 'voice') {
        voiceCount++;
        if (r.direction === 'sent') sentVoice += r.networkBytes;
        else recvVoice += r.networkBytes;
      }
    });

    const totalSession = sentText + recvText + sentVoice + recvVoice;
    const avgVoice = voiceCount > 0 ? (sentVoice + recvVoice) / voiceCount : 0;

    return { sentText, recvText, sentVoice, recvVoice, textCount, voiceCount, totalSession, avgVoice };
  }

  public getRecord(id: string) {
    return this.records.get(id);
  }

  public getRecordsArray() {
    return Array.from(this.records.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  public clearSession() {
    this.records.clear();
    this.notify();
  }

  public exportReport(format: 'json' | 'csv') {
    const arr = this.getRecordsArray();
    if (format === 'json') {
      return JSON.stringify(arr, null, 2);
    }
    
    const headers = ['Timestamp', 'MessageID', 'RoomID', 'Type', 'Direction', 'PayloadBytes', 'NetworkBytes', 'Measurement'];
    const rows = arr.map(r => [
      r.timestamp, r.id, r.roomId, r.type, r.direction, r.payloadBytes, r.networkBytes, r.isEstimate ? 'Estimated' : 'Measured'
    ]);
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(l => l());
  }
}

export const DataTracker = new DataTrackerService();

export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
