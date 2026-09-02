import { useCallback, useState } from 'react';
import { upgradeClientResult } from '../validation';

const STORAGE_KEY = 'jiahao-history-v2';
const LEGACY_KEY = 'jiahao-history';

function readHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY) || '[]';
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(upgradeClientResult).filter(Boolean).slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function useAssessmentHistory() {
  const [history, setHistory] = useState(readHistory);
  const add = useCallback((result) => {
    setHistory((current) => {
      const next = [upgradeClientResult(result), ...current.filter((item) => item?.id !== result?.id)].slice(0, 12);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage can be disabled */ }
      return next;
    });
  }, []);
  const clear = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch { /* storage can be disabled */ }
  }, []);
  return { history, add, clear };
}
