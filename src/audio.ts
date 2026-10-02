/** Tiny WebAudio synth: no asset files needed. */
class Sound {
  enabled = true;
  volume = 0.6;
  private ctx: AudioContext | null = null;
  private voices: Record<'win' | 'lose', HTMLAudioElement> = {
    win: new Audio('/sounds/win.mp3'),
    lose: new Audio('/sounds/lose.mp3'),
  };
  private voiceTimer = 0;

  // ---- background music: slow acoustic-style loop (Am - F - C - G), synthesized ----
  musicEnabled = true;
  private musicGain: GainNode | null = null;
  private musicTimer = 0;
  private nextNote = 0;
  private step = 0;
  private duck = 1;

  startMusic() {
    if (this.musicTimer || !this.musicEnabled || !this.enabled) return;
    const ac = this.ac; if (!ac) return;
    this.musicGain = ac.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(ac.destination);
    this.nextNote = ac.currentTime + 0.1;
    this.step = 0;
    this.applyMusicVolume(2);
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 120);
  }

  stopMusic() {
    clearInterval(this.musicTimer); this.musicTimer = 0;
    const g = this.musicGain, ac = this.ctx;
    if (g && ac) { g.gain.cancelScheduledValues(ac.currentTime); g.gain.setTargetAtTime(0, ac.currentTime, 0.2); setTimeout(() => g.disconnect(), 1000); }
    this.musicGain = null;
  }

  /** Re-evaluate music state after settings change. */
  unlocked = false;
  unlock() { this.unlocked = true; this.syncMusic(); }
  syncMusic() { if (this.enabled && this.musicEnabled && this.unlocked) this.startMusic(); else this.stopMusic(); this.applyMusicVolume(0.3); }

  private applyMusicVolume(tc = 0.3) {
    if (!this.musicGain || !this.ctx) return;
    this.musicGain.gain.setTargetAtTime(0.32 * this.volume * this.duck, this.ctx.currentTime, tc);
  }

  private pluck(freq: number, t: number, dur: number, gain: number) {
    const ac = this.ctx; if (!ac || !this.musicGain) return;
    const osc = ac.createOscillator(), osc2 = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    osc.type = 'triangle'; osc2.type = 'sine';
    osc.frequency.value = freq; osc2.frequency.value = freq * 2;
    f.type = 'lowpass'; f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f); osc2.connect(f); f.connect(g).connect(this.musicGain);
    osc.start(t); osc2.start(t); osc.stop(t + dur + 0.05); osc2.stop(t + dur + 0.05);
  }

  private scheduleMusic() {
    const ac = this.ctx; if (!ac || !this.musicGain) return;
    const eighth = 60 / 78 / 2;
    const chords = [
      { root: 110.0, tones: [220.0, 261.63, 329.63] },   // Am
      { root: 87.31, tones: [174.61, 261.63, 349.23] },  // F
      { root: 130.81, tones: [261.63, 329.63, 392.0] },  // C
      { root: 98.0, tones: [196.0, 246.94, 293.66] },    // G
    ];
    const melody = [440, 523.25, 587.33, 659.25, 783.99, 880];
    const arp = [0, 1, 2, 1, 0, 1, 2, 1];
    while (this.nextNote < ac.currentTime + 0.5) {
      const bar = Math.floor(this.step / 8) % 4, i = this.step % 8, c = chords[bar];
      const t = this.nextNote;
      if (i === 0 || i === 4) this.pluck(c.root, t, 1.1, 0.5);
      this.pluck(c.tones[arp[i]], t, 0.7, 0.22);
      if ((i === 2 || i === 6) && Math.random() < 0.55) this.pluck(melody[(Math.random() * melody.length) | 0], t + 0.02, 0.9, 0.16);
      this.nextNote += eighth;
      this.step++;
    }
  }

  /** Temporarily lower music while a voice line plays. */
  private duckMusic(ms: number) {
    this.duck = 0.25; this.applyMusicVolume(0.1);
    setTimeout(() => { this.duck = 1; this.applyMusicVolume(0.6); }, ms);
  }

  /** Plays a voice line after `delay` seconds (so it follows the synth effect). */
  voice(kind: 'win' | 'lose', delay = 0.8) {
    this.stopVoice();
    if (!this.enabled) return;
    this.voiceTimer = window.setTimeout(() => {
      const a = this.voices[kind];
      a.volume = Math.min(1, this.volume + 0.3);
      a.currentTime = 0;
      void a.play().catch(() => { /* autoplay blocked */ });
      this.duckMusic(5500);
    }, delay * 1000);
  }

  stopVoice() {
    clearTimeout(this.voiceTimer);
    for (const a of Object.values(this.voices)) { a.pause(); a.currentTime = 0; }
  }

  private get ac(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try { this.ctx = new AudioContext(); } catch { return null; }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number) {
    const ac = this.ac; if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * this.volume, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  reveal(count = 1) {
    const f = 420 + Math.random() * 60;
    this.tone(f, 0.09, 'sine', 0.22, 0, f * 1.5);
    if (count > 6) this.tone(f * 0.5, 0.25, 'triangle', 0.12, 0.03, f * 0.8);
  }
  flag() { this.tone(660, 0.06, 'square', 0.1); this.tone(880, 0.08, 'square', 0.1, 0.05); }
  unflag() { this.tone(560, 0.07, 'square', 0.08, 0, 380); }
  explosion() {
    const ac = this.ac; if (!ac) return;
    const len = ac.sampleRate * 0.9;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ac.createBufferSource(); src.buffer = buf;
    const filter = ac.createBiquadFilter(); filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, ac.currentTime);
    filter.frequency.exponentialRampToValueAtTime(90, ac.currentTime + 0.8);
    const g = ac.createGain(); g.gain.value = 0.7 * this.volume;
    src.connect(filter).connect(g).connect(ac.destination);
    src.start();
    this.tone(110, 0.6, 'sawtooth', 0.25, 0, 35);
  }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.2, i * 0.11)); }
}

export const sound = new Sound();
