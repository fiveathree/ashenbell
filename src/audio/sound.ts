// 全部音效用 Web Audio 即場合成，唔使任何音效檔，冇版權問題（PLAN.md 第 9 節）
export type Sfx = 'swing' | 'hit' | 'bone' | 'hurt' | 'death' | 'groan' | 'arrow' | 'spell' | 'whirl' | 'charge' | 'roar'
  | 'coin' | 'item' | 'legend' | 'levelup' | 'potion' | 'break' | 'rune' | 'bell' | 'heavy' | 'ui';
export type Ambient = 'dungeon' | 'town' | null;

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private amb: { stop: () => void } | null = null;
  private want: Ambient = null;
  private last = new Map<string, number>();
  volume = 0.7;

  /** 瀏覽器要用戶撳過先准出聲，第一下撳滑鼠時先開 */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const n = this.ctx.sampleRate * 2, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
    this.ambient(this.want);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get state() { return this.ctx?.state ?? 'none'; }

  private env(t: number, peak: number, dur: number, attack = 0.005) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  private tone(freq: number, dur: number, type: OscillatorType, peak: number, to = freq, delay = 0) {
    const c = this.ctx!, t = c.currentTime + delay, o = c.createOscillator(), g = this.env(t, peak, dur);
    o.type = type; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    o.connect(g); g.connect(this.master!);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private noise(dur: number, freq: number, kind: BiquadFilterType, peak: number, to = freq, q = 1, delay = 0) {
    const c = this.ctx!, t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = this.env(t, peak, dur);
    s.buffer = this.noiseBuf; s.loop = true;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = kind; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    s.connect(f); f.connect(g); g.connect(this.master!);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  private bellTone(base: number, dur: number, peak: number) {
    [1, 2.01, 2.76, 4.07, 5.4].forEach((m, i) => this.tone(base * m, dur / (1 + i * 0.5), 'sine', peak / (1 + i * 0.8), base * m));
  }

  play(name: Sfx) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.master) return;
    // 同一種聲短時間內唔疊太多（旋風斬打 16 隻唔好爆音）
    const now = this.ctx.currentTime, gap = name === 'hit' || name === 'bone' ? 0.05 : 0.03;
    if (now - (this.last.get(name) ?? -1) < gap) return;
    this.last.set(name, now);
    switch (name) {
      case 'swing': this.noise(0.17, 700, 'bandpass', 0.22, 2600, 1.4); break;
      case 'hit': this.noise(0.08, 1100, 'lowpass', 0.4, 300); this.tone(130, 0.11, 'sine', 0.4, 55); break;
      case 'bone': this.noise(0.05, 3000, 'highpass', 0.22); this.tone(620, 0.04, 'square', 0.1, 240); this.noise(0.04, 2400, 'highpass', 0.14, 2400, 1, 0.045); break;
      case 'hurt': this.tone(190, 0.2, 'sawtooth', 0.16, 90); this.noise(0.1, 800, 'lowpass', 0.2, 240); break;
      case 'death': this.tone(150, 0.6, 'sawtooth', 0.14, 42); this.noise(0.28, 500, 'lowpass', 0.22, 90, 1, 0.08); break;
      case 'groan': this.tone(95 + Math.random() * 30, 0.5, 'sawtooth', 0.06, 60); break;
      case 'arrow': this.noise(0.16, 2600, 'bandpass', 0.14, 900, 3); break;
      case 'spell': this.tone(320, 0.32, 'sine', 0.14, 100); this.noise(0.28, 1500, 'bandpass', 0.08, 300, 2); break;
      case 'whirl': this.noise(0.26, 500, 'bandpass', 0.18, 1800, 1.6); break;
      case 'charge': this.noise(0.3, 300, 'bandpass', 0.3, 1400, 1); this.tone(85, 0.26, 'sine', 0.34, 45, 0.2); break;
      case 'roar': this.tone(110, 0.7, 'sawtooth', 0.18, 60); this.noise(0.6, 700, 'lowpass', 0.24, 200); break;
      case 'coin': [2300, 3100, 2700].forEach((f, i) => this.tone(f, 0.07, 'triangle', 0.08, f, i * 0.05)); break;
      case 'item': this.tone(520, 0.12, 'triangle', 0.14, 780); break;
      case 'legend': this.bellTone(330, 2.2, 0.22); this.tone(990, 1.2, 'sine', 0.06, 990, 0.1); break;
      case 'levelup': [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.1, f, i * 0.09)); break;
      case 'potion': [260, 340, 430].forEach((f, i) => this.tone(f, 0.08, 'sine', 0.14, f * 1.3, i * 0.07)); break;
      case 'break': this.noise(0.14, 1500, 'bandpass', 0.3, 300, 0.8); this.tone(90, 0.1, 'triangle', 0.2, 50); break;
      case 'rune': this.noise(0.45, 900, 'lowpass', 0.4, 60); this.tone(70, 0.4, 'sine', 0.45, 32); break;
      case 'heavy': this.noise(0.3, 600, 'lowpass', 0.4, 70); this.tone(60, 0.34, 'sine', 0.5, 30); break;
      case 'bell': this.bellTone(98, 4, 0.34); break;
      case 'ui': this.tone(900, 0.04, 'triangle', 0.05, 700); break;
    }
  }

  /** 環境聲：地底低鳴、風、滴水；小鎮夜蟲同遠處鐘聲 */
  ambient(kind: Ambient) {
    this.want = kind;
    if (!this.ctx || !this.master) return;
    this.amb?.stop();
    this.amb = null;
    if (!kind) return;
    const c = this.ctx, bus = c.createGain();
    bus.gain.value = 0.0001;
    bus.gain.exponentialRampToValueAtTime(1, c.currentTime + 2);
    bus.connect(this.master);
    const nodes: AudioScheduledSourceNode[] = [];
    const start = <T extends AudioScheduledSourceNode>(n: T) => { n.start(); nodes.push(n); return n; };

    const wind = c.createBufferSource(), wf = c.createBiquadFilter(), wg = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    wind.buffer = this.noiseBuf; wind.loop = true;
    wf.type = 'lowpass'; wf.frequency.value = kind === 'town' ? 420 : 230;
    wg.gain.value = kind === 'town' ? 0.05 : 0.035;
    lfo.frequency.value = 0.09; lg.gain.value = 110;
    lfo.connect(lg); lg.connect(wf.frequency);
    wind.connect(wf); wf.connect(wg); wg.connect(bus);
    start(wind); start(lfo);

    if (kind === 'dungeon') {
      for (const f of [46, 46.6, 69]) {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = f; g.gain.value = 0.045;
        o.connect(g); g.connect(bus); start(o);
      }
    }
    const timers: number[] = [];
    const every = (min: number, max: number, fn: () => void) => {
      const step = () => { timers[0] = window.setTimeout(() => { if (this.ctx?.state === 'running') fn(); step(); }, min + Math.random() * (max - min)); };
      step();
    };
    const every2 = (min: number, max: number, fn: () => void) => {
      const step = () => { timers[1] = window.setTimeout(() => { if (this.ctx?.state === 'running') fn(); step(); }, min + Math.random() * (max - min)); };
      step();
    };
    if (kind === 'dungeon') {
      every(2200, 6500, () => this.tone(900 + Math.random() * 700, 0.09, 'sine', 0.05, 380));
      every2(14000, 30000, () => this.tone(62, 3, 'sawtooth', 0.025, 41));
    } else {
      every(700, 2200, () => { for (let i = 0; i < 3; i++) this.tone(4300, 0.03, 'sine', 0.012, 4100, i * 0.07); });
      every2(38000, 70000, () => this.bellTone(98, 4, 0.1));
    }
    this.amb = { stop: () => {
      timers.forEach(clearTimeout);
      bus.gain.setTargetAtTime(0.0001, c.currentTime, 0.4);
      window.setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch { /* 已停 */ } }); bus.disconnect(); }, 1500);
    } };
  }
}

export const sound = new Sound();
