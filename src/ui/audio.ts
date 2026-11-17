export type Sfx = 'pickup' | 'place' | 'invalid' | 'clear' | 'gameOver' | 'newBest' | 'levelUp';

/** Port for sound and haptics, so the view can be driven silently in tests. */
export interface FeedbackPlayer {
  enabled: boolean;
  /** Must be called from a user gesture; browsers block audio before that. */
  unlock(): void;
  play(sfx: Sfx, level?: number): void;
}

// C major pentatonic: any run of notes sounds pleasant, and climbing it gives
// combos an audible sense of "higher and higher".
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];

type AudioContextCtor = new () => AudioContext;

/** Synthesises every sound with WebAudio: no asset files to load or license. */
export class WebAudioFeedback implements FeedbackPlayer {
  enabled = true;
  private context: AudioContext | undefined;

  unlock(): void {
    try {
      if (!this.context) {
        const w = window as unknown as {
          AudioContext?: AudioContextCtor;
          webkitAudioContext?: AudioContextCtor;
        };
        const Ctor = w.AudioContext ?? w.webkitAudioContext;
        if (Ctor) {
          this.context = new Ctor();
        }
      }
      if (this.context?.state === 'suspended') {
        void this.context.resume();
      }
    } catch {
      this.context = undefined;
    }
  }

  play(sfx: Sfx, level = 0): void {
    if (!this.enabled) {
      return;
    }
    switch (sfx) {
      case 'pickup':
        this.tone(660, 0, 0.05, 0.05, 'sine');
        break;
      case 'place':
        this.tone(196, 0, 0.09, 0.16, 'triangle');
        this.tone(392, 0, 0.05, 0.05, 'sine');
        this.vibrate(8);
        break;
      case 'invalid':
        this.tone(150, 0, 0.1, 0.07, 'sine');
        break;
      case 'clear': {
        const base = Math.max(0, Math.min(SCALE.length - 3, level));
        this.tone(SCALE[base], 0, 0.16, 0.13, 'triangle');
        this.tone(SCALE[base + 1], 0.07, 0.16, 0.13, 'triangle');
        this.tone(SCALE[base + 2], 0.14, 0.3, 0.15, 'triangle');
        this.vibrate(18 + 6 * base);
        break;
      }
      case 'levelUp':
        [2, 4, 7].forEach((note, i) => this.tone(SCALE[note], 0.22 + i * 0.08, 0.26, 0.1, 'sine'));
        break;
      case 'newBest':
        [0, 2, 3, 5, 7].forEach((note, i) => this.tone(SCALE[note], 0.3 + i * 0.09, 0.3, 0.12, 'triangle'));
        this.vibrate(60);
        break;
      case 'gameOver':
        this.tone(392, 0, 0.28, 0.12, 'sine');
        this.tone(329.63, 0.2, 0.28, 0.12, 'sine');
        this.tone(261.63, 0.4, 0.6, 0.12, 'sine');
        this.vibrate(40);
        break;
    }
  }

  private tone(freq: number, delay: number, duration: number, volume: number, type: OscillatorType): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running') {
      return;
    }
    try {
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.03);
    } catch {
      // Audio is a nicety; never let it interrupt play.
    }
  }

  private vibrate(ms: number): void {
    try {
      navigator.vibrate?.(ms);
    } catch {
      // Not supported: ignore.
    }
  }
}
