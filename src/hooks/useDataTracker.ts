import { useState, useEffect } from 'react';
import { DataTracker } from '../services/DataTracker';

export function useDataTracker() {
  const [totals, setTotals] = useState(DataTracker.getTotals());
  const [lowBandwidthMode, setLowBandwidthMode] = useState(DataTracker.lowBandwidthMode);
  // We use a counter just to force re-renders if we want to re-render message lists, 
  // but message list will just query DataTracker.getRecord(id).
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = DataTracker.subscribe(() => {
      setTotals(DataTracker.getTotals());
      setLowBandwidthMode(DataTracker.lowBandwidthMode);
      setTick(t => t + 1);
    });
    return unsubscribe;
  }, []);

  return {
    totals,
    lowBandwidthMode,
    toggleLowBandwidth: () => DataTracker.toggleLowBandwidth(),
    clearSession: () => DataTracker.clearSession(),
    exportReport: (format: 'json'|'csv') => DataTracker.exportReport(format),
    tracker: DataTracker
  };
}
