import { useCallback, useEffect, useState } from 'react';

/** «04:12» или «1:04:12». */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/**
 * Секундомер тренировки. Время считается от момента старта по часам устройства,
 * поэтому не сбивается, если экран ненадолго гаснет или вкладка уходит в фон.
 */
export function useStopwatch() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const start = useCallback(() => setStartedAt(Date.now()), []);
  /** Останавливает секундомер и возвращает, сколько секунд прошло. */
  const stop = useCallback(() => {
    const seconds = startedAt === null ? 0 : Math.round((Date.now() - startedAt) / 1000);
    setStartedAt(null);
    return seconds;
  }, [startedAt]);

  return {
    running: startedAt !== null,
    seconds: startedAt === null ? 0 : Math.max(0, Math.round((now - startedAt) / 1000)),
    start,
    stop,
  };
}
