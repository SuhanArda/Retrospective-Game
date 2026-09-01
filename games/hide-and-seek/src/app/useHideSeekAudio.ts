import { useCallback, useEffect, useRef } from 'react';
import { HideSeekConfig } from '../domain/config';

/**
 * Original, asset-free cues synthesized with the Web Audio API — same
 * approach as Imposter's `useSuspicionMusic`. No sound files at all: no
 * license to track, no download, and no risk of repeating rus-ruleti's own
 * 14 MB WAV mistake (`public/sounds/bacgroundBirds.wav`) in this game's own
 * asset folder.
 *
 * Two kinds of cue live here: one-shots (catch, the two round-end stingers,
 * a footstep, the reveal chime/warning) that fire and forget, and the one
 * *loop* — the DARK ambience — which needs an explicit start/stop pair
 * since, unlike everything else, it has to keep running unattended for the
 * whole phase.
 *
 * Everything routes through one master gain node (`masterGain()`) instead
 * of `ctx.destination` directly — `setMuted` only has to ramp that single
 * node, and it uniformly silences (and, on unmute, un-silences) whatever's
 * currently playing, ambience loop included, without the loop needing its
 * own separate mute bookkeeping.
 */
export function useHideSeekAudio() {
  const contextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const ambienceRef = useRef<{ gain: GainNode; nodes: OscillatorNode[] } | null>(null);

  const context = useCallback((): AudioContext => {
    const existing = contextRef.current;
    if (existing) return existing;
    const created = new AudioContext();
    contextRef.current = created;
    return created;
  }, []);

  const masterGain = useCallback((): GainNode => {
    const existing = masterGainRef.current;
    if (existing) return existing;
    const ctx = context();
    const node = ctx.createGain();
    node.gain.value = 1;
    node.connect(ctx.destination);
    masterGainRef.current = node;
    return node;
  }, [context]);

  /** Call once on the first user gesture — browsers refuse to start audio before that. */
  const unlock = useCallback(() => {
    void context().resume();
  }, [context]);

  /** Ramps the master gain rather than cutting it — an instant 1→0 on every mute click reads as a click/pop, not a mute. */
  const setMuted = useCallback((value: boolean) => {
    const ctx = context();
    const gain = masterGain();
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(value ? 0 : 1, now + 0.08);
  }, [context, masterGain]);

  const playCatch = useCallback(() => {
    const ctx = context();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    gain.connect(masterGain());

    const thud = ctx.createOscillator();
    thud.type = 'sawtooth';
    thud.frequency.setValueAtTime(180, now);
    thud.frequency.exponentialRampToValueAtTime(50, now + 0.35);
    thud.connect(gain);
    thud.start(now);
    thud.stop(now + 0.5);
  }, [context, masterGain]);

  const playRevealChime = useCallback(() => {
    const ctx = context();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    gain.connect(masterGain());

    for (const frequency of [523.25, 659.25, 783.99]) {
      const tone = ctx.createOscillator();
      tone.type = 'sine';
      tone.frequency.setValueAtTime(frequency, now);
      tone.connect(gain);
      tone.start(now);
      tone.stop(now + 0.9);
    }
  }, [context, masterGain]);

  /**
   * A low, faintly uneasy drone — two detuned sawtooths through a lowpass
   * filter, its cutoff breathing on a slow LFO so the loop never sits
   * perfectly static. Idempotent: calling it while already running is a
   * no-op rather than layering a second drone underneath the first, which
   * matters because the phase-change effect that drives this doesn't track
   * whether it's already been called for the current DARK phase.
   */
  const startDarkAmbience = useCallback(() => {
    if (ambienceRef.current) return;
    const ctx = context();
    const now = ctx.currentTime;

    const ambienceGain = ctx.createGain();
    ambienceGain.gain.setValueAtTime(0.0001, now);
    ambienceGain.gain.exponentialRampToValueAtTime(0.05, now + 1.2);
    ambienceGain.connect(masterGain());

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, now);
    filter.connect(ambienceGain);

    const droneA = ctx.createOscillator();
    droneA.type = 'sawtooth';
    droneA.frequency.setValueAtTime(55, now);
    droneA.connect(filter);
    droneA.start(now);

    const droneB = ctx.createOscillator();
    droneB.type = 'sawtooth';
    droneB.frequency.setValueAtTime(55.6, now); // slightly detuned — the beat is what reads as "uneasy" rather than just "low"
    droneB.connect(filter);
    droneB.start(now);

    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.08, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(60, now);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start(now);

    ambienceRef.current = { gain: ambienceGain, nodes: [droneA, droneB, lfo] };
  }, [context, masterGain]);

  /** Fades the drone out over ~0.6s rather than cutting it, then actually stops the oscillators once the fade finishes. */
  const stopDarkAmbience = useCallback(() => {
    const active = ambienceRef.current;
    if (!active) return;
    ambienceRef.current = null;
    const ctx = context();
    const now = ctx.currentTime;
    active.gain.gain.cancelScheduledValues(now);
    active.gain.gain.setValueAtTime(active.gain.gain.value, now);
    active.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    const stopAt = now + 0.7;
    for (const node of active.nodes) node.stop(stopAt);
  }, [context]);

  /** Fired once, `REVEAL_WARNING_SEC` before DARK ends — a rising pitch/filter sweep under the HUD's own blinking countdown. */
  const playRevealWarning = useCallback(() => {
    const ctx = context();
    const now = ctx.currentTime;
    const duration = HideSeekConfig.REVEAL_WARNING_SEC;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + duration * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    gain.connect(masterGain());

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + duration);
    filter.connect(gain);

    const riser = ctx.createOscillator();
    riser.type = 'sawtooth';
    riser.frequency.setValueAtTime(140, now);
    riser.frequency.exponentialRampToValueAtTime(420, now + duration);
    riser.connect(filter);
    riser.start(now);
    riser.stop(now + duration + 0.1);
  }, [context, masterGain]);

  /**
   * A short filtered noise burst, not a tonal click — real footsteps are
   * noise-shaped, and a pitched blip repeated every ~300ms reads as a
   * video-game UI tick instead. Kept quiet: this fires constantly while
   * moving, so it has to sit under everything else, not compete with it.
   */
  const playFootstep = useCallback(() => {
    const ctx = context();
    const now = ctx.currentTime;
    const durationSeconds = 0.05;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * durationSeconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(180, now);
    filter.Q.setValueAtTime(0.8, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain());
    noise.start(now);
    noise.stop(now + durationSeconds + 0.01);
  }, [context, masterGain]);

  /** A rising major arpeggio — the local player ended up on the winning side. */
  const playWin = useCallback(() => {
    const ctx = context();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
    gain.connect(masterGain());

    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      const startAt = now + index * 0.09;
      const tone = ctx.createOscillator();
      tone.type = 'triangle';
      tone.frequency.setValueAtTime(frequency, startAt);
      tone.connect(gain);
      tone.start(startAt);
      tone.stop(startAt + 0.5);
    });
  }, [context, masterGain]);

  /** A soft, falling close — deflating rather than harsh, since losing a party game shouldn't feel like a buzzer. */
  const playLose = useCallback(() => {
    const ctx = context();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    gain.connect(masterGain());

    [392, 349.23, 293.66].forEach((frequency, index) => {
      const startAt = now + index * 0.12;
      const tone = ctx.createOscillator();
      tone.type = 'sine';
      tone.frequency.setValueAtTime(frequency, startAt);
      tone.connect(gain);
      tone.start(startAt);
      tone.stop(startAt + 0.6);
    });
  }, [context, masterGain]);

  useEffect(() => () => { void contextRef.current?.close(); }, []);

  return {
    unlock,
    setMuted,
    playCatch,
    playRevealChime,
    startDarkAmbience,
    stopDarkAmbience,
    playRevealWarning,
    playFootstep,
    playWin,
    playLose,
  };
}
