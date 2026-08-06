type SoundName = 'jump' | 'checkpoint' | 'ability' | 'rocket' | 'respawn' | 'finish';

export class AudioManager {
  private muted = false;
  private volume = 0.16;

  setMuted(value: boolean) { this.muted = value; }
  setVolume(value: number) { this.volume = Math.min(1, Math.max(0, value)); }
  play(name: SoundName) {
    if (this.muted || typeof AudioContext === 'undefined') return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const frequencies: Record<SoundName, number> = { jump: 330, checkpoint: 520, ability: 610, rocket: 180, respawn: 440, finish: 720 };
    oscillator.frequency.value = frequencies[name];
    oscillator.type = name === 'rocket' ? 'sawtooth' : 'square';
    gain.gain.setValueAtTime(this.volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.09);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + 0.1);
    oscillator.addEventListener('ended', () => void context.close());
  }
}
