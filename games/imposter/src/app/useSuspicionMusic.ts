import { useCallback, useEffect, useRef } from 'react';

/** An original, asset-free suspense loop synthesized with the Web Audio API. */
export function useSuspicionMusic(active: boolean, enabled: boolean) {
  const contextRef = useRef<AudioContext | null>(null);

  const unlock = useCallback(() => {
    const context = contextRef.current ?? new AudioContext();
    contextRef.current = context;
    void context.resume();
  }, []);

  useEffect(() => {
    if (!active || !enabled) return;

    const context = contextRef.current ?? new AudioContext();
    contextRef.current = context;
    const master = context.createGain();
    master.gain.value = 0.12;
    master.connect(context.destination);

    const notes = [110, 110, 130.81, 116.54, 110, 146.83, 130.81, 116.54];
    let step = 0;

    const playStep = () => {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = step % 4 === 3 ? 'square' : 'triangle';
      oscillator.frequency.setValueAtTime(notes[step % notes.length]!, now);
      oscillator.frequency.exponentialRampToValueAtTime(notes[step % notes.length]! * 0.985, now + 0.34);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(step % 2 === 0 ? 0.9 : 0.5, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(now);
      oscillator.stop(now + 0.4);
      step += 1;
    };

    void context.resume().then(playStep).catch(() => undefined);
    const timer = window.setInterval(playStep, 430);
    return () => {
      window.clearInterval(timer);
      master.disconnect();
    };
  }, [active, enabled]);

  useEffect(() => () => {
    if (contextRef.current) void contextRef.current.close();
  }, []);

  return unlock;
}
