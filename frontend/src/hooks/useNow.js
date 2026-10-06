import { useSyncExternalStore } from 'react';

// ONE timer per interval length for the whole app, however many components ask for the time.
// (Each card/row used to start its own setInterval: a board of 200 cases meant 200 timers and 200 separate re-renders per second.)
// Subscribers are only notified while the tab is visible, and get a fresh value the moment it becomes visible again.

const tickers = new Map();   // intervalMs -> { now, listeners:Set<fn>, timer }

function getTicker(intervalMs) {
  let t = tickers.get(intervalMs);
  if (!t) {
    t = { now: Date.now(), listeners: new Set(), timer: null };
    tickers.set(intervalMs, t);
  }
  return t;
}

function tick(t) {
  t.now = Date.now();
  t.listeners.forEach((l) => l());
}

function subscribeTo(intervalMs) {
  return (listener) => {
    const t = getTicker(intervalMs);
    t.listeners.add(listener);

    if (!t.timer) {
      t.timer = setInterval(() => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') tick(t);
      }, intervalMs);
      if (typeof document !== 'undefined') {
        t.onVisible = () => document.visibilityState === 'visible' && tick(t);
        document.addEventListener('visibilitychange', t.onVisible);
      }
    }

    return () => {
      t.listeners.delete(listener);
      if (t.listeners.size === 0 && t.timer) {
        clearInterval(t.timer);
        t.timer = null;
        if (t.onVisible) document.removeEventListener('visibilitychange', t.onVisible);
      }
    };
  };
}

const subscribers = new Map();   // stable subscribe function per interval (useSyncExternalStore needs a stable identity)

/**
 * The current time in ms, refreshed every `intervalMs` (default 1 s). Every caller shares one timer per interval.
 * @param {number} intervalMs
 */
export function useNow(intervalMs = 1000) {
  let subscribe = subscribers.get(intervalMs);
  if (!subscribe) {
    subscribe = subscribeTo(intervalMs);
    subscribers.set(intervalMs, subscribe);
  }
  return useSyncExternalStore(subscribe, () => getTicker(intervalMs).now, () => Date.now());
}
