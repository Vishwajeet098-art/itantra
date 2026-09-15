import { useState } from 'react';
import { BarChart2, Download, RefreshCw, Zap } from 'lucide-react';
import { useDataTracker } from '../hooks/useDataTracker';
import { formatBytes } from '../services/DataTracker';

export function DataUsageDashboard() {
  const { totals, lowBandwidthMode, toggleLowBandwidth, clearSession, exportReport } = useDataTracker();
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button 
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-card border border-white/10 hover:border-primary/40 hover:bg-white/5 rounded-xl text-xs text-gray-400 transition-all"
      >
        <BarChart2 className="w-3.5 h-3.5 text-primary" />
        Data Usage: {formatBytes(totals.totalSession)}
      </button>
    );
  }

  const handleExport = (format: 'json' | 'csv') => {
    const data = exportReport(format);
    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `itantra-data-usage.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-card border border-white/10 rounded-xl p-4 flex flex-col gap-3 w-full max-w-sm">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" /> Data Usage Monitor
        </h3>
        <button onClick={() => setExpanded(false)} className="text-gray-500 hover:text-white">✕</button>
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-black/20 p-2 rounded flex flex-col">
          <span className="text-gray-500">Text Up</span>
          <span className="font-mono text-white">{formatBytes(totals.sentText)}</span>
        </div>
        <div className="bg-black/20 p-2 rounded flex flex-col">
          <span className="text-gray-500">Text Down</span>
          <span className="font-mono text-white">{formatBytes(totals.recvText)}</span>
        </div>
        <div className="bg-black/20 p-2 rounded flex flex-col">
          <span className="text-gray-500">Voice Up</span>
          <span className="font-mono text-primary">{formatBytes(totals.sentVoice)}</span>
        </div>
        <div className="bg-black/20 p-2 rounded flex flex-col">
          <span className="text-gray-500">Voice Down</span>
          <span className="font-mono text-primary">{formatBytes(totals.recvVoice)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded p-2 text-sm mt-1">
        <span className="text-gray-300">Total Session:</span>
        <span className="font-mono font-bold text-white">{formatBytes(totals.totalSession)}</span>
      </div>

      <div className="flex items-center justify-between gap-2 mt-2">
        <button 
          onClick={toggleLowBandwidth}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs transition-colors border ${
            lowBandwidthMode 
              ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-500' 
              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
          }`}
          title={lowBandwidthMode ? "Low bandwidth active (16kbps audio)" : "Enable low bandwidth (16kbps audio)"}
        >
          <Zap className="w-3.5 h-3.5" /> 
          {lowBandwidthMode ? 'Low BW: ON' : 'Low BW: OFF'}
        </button>

        <div className="flex items-center gap-1">
          <button onClick={() => handleExport('csv')} className="px-2 py-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-xs flex items-center gap-1 text-gray-300" title="Export CSV">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={clearSession} className="p-1.5 bg-error/10 hover:bg-error/20 rounded border border-error/20 text-error" title="Reset Session">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      
      <p className="text-[10px] text-gray-500 mt-1 leading-tight">
        Values represent exact payload transfer where available, or estimates of network overhead (~) otherwise.
      </p>
    </div>
  );
}
