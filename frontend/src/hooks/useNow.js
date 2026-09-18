import { useState, useEffect } from 'react';

/**
 * Custom hook that returns current timestamp, updating every intervalMs.
 * Enables live dynamic rendering of timers and countdowns.
 * @param {number} intervalMs - Interval in milliseconds (default: 1000)
 */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
