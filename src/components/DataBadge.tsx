import { DataTracker } from '../services/DataTracker';
import { useDataTracker } from '../hooks/useDataTracker';

export function DataBadge({ msgId }: { msgId: string }) {
  const { totals } = useDataTracker(); // triggers render on change
  const record = DataTracker.getRecord(msgId);
  
  if (!record) return null;

  return (
    <div className="flex items-center gap-1.5 mt-1 opacity-70 hover:opacity-100 transition-opacity">
      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-black/20 border border-white/5">
        {record.direction === 'sent' ? '↑' : '↓'} {formatBytes(record.networkBytes)}
      </span>
      {record.isEstimate && (
        <span className="text-[10px] text-yellow-500/70" title="Estimated network overhead">~</span>
      )}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
