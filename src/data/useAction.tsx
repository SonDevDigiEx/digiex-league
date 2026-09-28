import { useEffect, useRef, useState } from 'react';
import { useLeague } from './store';

/**
 * Guarded mutations for a group of buttons: one request at a time (synchronous lock, so double clicks
 * can't slip through), a spinner on the button that was pressed, and an optional cooldown after a
 * successful action to stop rapid back-and-forth toggling.
 */
export function useAction(cooldownMs = 0) {
  const { run } = useLeague();
  const lock = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const [coolUntil, setCoolUntil] = useState(0);
  const [, tick] = useState(0);

  const left = Math.max(0, coolUntil - Date.now());
  useEffect(() => {
    if (!left) return;
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [left > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (key: string, fn: () => Promise<unknown>, ok?: string | ((r: unknown) => string)) => {
    if (lock.current || Date.now() < coolUntil) return;
    lock.current = true;
    setPending(key);
    try {
      const done = await run(fn, ok);
      if (done && cooldownMs) setCoolUntil(Date.now() + cooldownMs);
    } finally {
      lock.current = false;
      setPending(null);
    }
  };

  return {
    act,
    /** Key of the action in flight (for the spinner). */
    pending,
    /** Disable the whole group while a request runs or during the cooldown. */
    busy: pending !== null || left > 0,
    /** Seconds left in the cooldown (0 when free). */
    wait: Math.ceil(left / 1000),
  };
}

export function Spin() {
  return <span className="spin" aria-hidden="true" />;
}
