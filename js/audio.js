'use strict';

// Motor de sonido 100% procedural (WebAudio). No hay ficheros de audio.
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.85;
    this.birdTimer = 3;
    this.owlTimer = 20;
    this.twigTimer = 15;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 5;
    this.master.connect(comp);
    comp.connect(c.destination);

    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    this.amb = c.createGain();
    this.amb.gain.value = 0.7;
    this.amb.connect(this.master);

    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.brown = c.createBuffer(1, len, c.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }
    this.startAmbience();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  get t() { return this.ctx.currentTime; }

  setListener(pos, fwd) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
      l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  // Destino de salida: panner 3D si hay posición, bus normal si no.
  out(pos, gain = 1) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = gain;
    if (pos) {
      const p = c.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 2;
      p.maxDistance = 120;
      p.rolloffFactor = 1.25;
      if (p.positionX) {
        p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p);
      p.connect(this.sfx);
    } else g.connect(this.sfx);
    return g;
  }

  noiseSrc(buf) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf || this.noise;
    s.loop = true;
    return s;
  }

  env(param, t0, attack, peak, decay) {
    param.cancelScheduledValues(t0);
    param.setValueAtTime(0.0001, t0);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
    param.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  filt(type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  noiseBurst(dest, t0, dur, type, freq, q, peak, attack = 0.004) {
    const s = this.noiseSrc();
    const f = this.filt(type, freq, q);
    const g = this.ctx.createGain();
    this.env(g.gain, t0, attack, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t0, Math.random() * 1.5);
    s.stop(t0 + attack + dur + 0.05);
    return f;
  }

  tone(dest, t0, type, f0, f1, dur, peak, attack = 0.005) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + attack + dur);
    const g = this.ctx.createGain();
    this.env(g.gain, t0, attack, peak, dur);
    o.connect(g); g.connect(dest);
    o.start(t0);
    o.stop(t0 + attack + dur + 0.05);
    return o;
  }

  // ---------- Efectos ----------
  step(surface, pos, vol = 0.5) {
    if (!this.ctx) return;
    const o = this.out(pos, vol);
    const t = this.t;
    if (surface === 'wood') {
      this.noiseBurst(o, t, 0.07, 'lowpass', 700, 1, 0.5);
      this.tone(o, t, 'sine', 120, 70, 0.06, 0.5);
    } else if (surface === 'dirt') {
      this.noiseBurst(o, t, 0.09, 'bandpass', 1300, 0.8, 0.45);
    } else {
      this.noiseBurst(o, t, 0.11, 'bandpass', 2400, 0.6, 0.35);
      this.noiseBurst(o, t + 0.02, 0.06, 'highpass', 4000, 0.5, 0.12);
    }
  }

  heavyStep(pos, vol = 1) {
    if (!this.ctx) return;
    const o = this.out(pos, vol);
    const t = this.t;
    this.noiseBurst(o, t, 0.14, 'lowpass', 500, 1, 0.8);
    this.tone(o, t, 'sine', 80, 40, 0.12, 0.7);
  }

  bang(pos, vol = 1) {
    if (!this.ctx) return;
    const o = this.out(pos, vol);
    const t = this.t;
    this.tone(o, t, 'sine', 90, 35, 0.4, 1.0);
    this.noiseBurst(o, t, 0.25, 'lowpass', 600, 1.2, 0.9);
    this.noiseBurst(o, t + 0.01, 0.12, 'bandpass', 1800, 2, 0.3);
  }

  knock(pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 1.1);
    for (let i = 0; i < 3; i++) {
      const t = this.t + i * 0.28;
      this.tone(o, t, 'sine', 210, 130, 0.08, 0.8);
      this.noiseBurst(o, t, 0.05, 'bandpass', 900, 1.5, 0.5);
    }
  }

  click(pos, vol = 0.8) {
    if (!this.ctx) return;
    const o = this.out(pos, vol);
    const t = this.t;
    this.tone(o, t, 'square', 2600, 1800, 0.02, 0.25);
    this.noiseBurst(o, t, 0.03, 'highpass', 3500, 0.7, 0.5);
  }

  bolt(pos, on) {
    if (!this.ctx) return;
    const o = this.out(pos, 0.9);
    const t = this.t;
    const f = this.noiseBurst(o, t, 0.14, 'bandpass', on ? 1800 : 2600, 4, 0.35, 0.02);
    f.frequency.linearRampToValueAtTime(on ? 3000 : 1500, t + 0.14);
    this.tone(o, t + 0.14, 'square', 2200, 1500, 0.025, 0.3);
    this.noiseBurst(o, t + 0.14, 0.04, 'highpass', 3000, 0.7, 0.6);
  }

  creak(pos, vol = 0.8, dur = 0.9) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = this.out(pos, vol);
    const t = this.t;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.linearRampToValueAtTime(130, t + dur * 0.4);
    osc.frequency.linearRampToValueAtTime(85, t + dur);
    const lfo = c.createOscillator();
    lfo.frequency.value = 23;
    const lg = c.createGain();
    lg.gain.value = 18;
    lfo.connect(lg); lg.connect(osc.frequency);
    const f = this.filt('bandpass', 750, 6);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
    g.gain.setValueAtTime(0.5, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f); f.connect(g); g.connect(o);
    osc.start(t); lfo.start(t);
    osc.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  glass(pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 1.2);
    const t = this.t;
    this.noiseBurst(o, t, 0.5, 'highpass', 2500, 0.7, 0.9);
    this.tone(o, t, 'sine', 90, 40, 0.15, 0.6);
    for (let i = 0; i < 14; i++) {
      const f = 2500 + Math.random() * 4500;
      this.tone(o, t + Math.random() * 0.45, 'sine', f, f * 0.97, 0.05 + Math.random() * 0.12, 0.12);
    }
  }

  woodCrack(pos, vol = 1) {
    if (!this.ctx) return;
    const o = this.out(pos, vol);
    const t = this.t;
    this.noiseBurst(o, t, 0.12, 'bandpass', 900, 1.5, 0.9);
    this.noiseBurst(o, t + 0.08, 0.2, 'bandpass', 500, 1.2, 0.7);
    this.tone(o, t, 'sine', 110, 45, 0.25, 0.7);
    this.creak(pos, 0.4, 0.4);
  }

  hammer(pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 0.9);
    for (let i = 0; i < 3; i++) {
      const t = this.t + i * 0.16;
      this.tone(o, t, 'triangle', 1400, 900, 0.05, 0.5);
      this.noiseBurst(o, t, 0.05, 'bandpass', 2200, 2, 0.5);
      this.tone(o, t, 'sine', 160, 90, 0.06, 0.5);
    }
  }

  shot(kind) {
    if (!this.ctx) return;
    const o = this.out(null, kind === 'shotgun' ? 1.4 : 1.1);
    const t = this.t;
    const dur = kind === 'shotgun' ? 0.55 : 0.32;
    const f = this.noiseBurst(o, t, dur, 'lowpass', 7000, 0.8, 1.2, 0.002);
    f.frequency.exponentialRampToValueAtTime(250, t + dur);
    this.tone(o, t, 'sine', kind === 'shotgun' ? 110 : 150, 35, dur * 0.8, 1.2, 0.002);
    this.noiseBurst(o, t + 0.05, dur * 2.5, 'bandpass', 400, 0.6, 0.12, 0.05);
    // El rifle retumba en el valle
    if (kind === 'rifle') [0.35, 0.8].forEach((d, i) => this.noiseBurst(o, t + d, 0.5, 'lowpass', 900, 0.7, 0.3 / (i + 1), 0.03));
  }

  dryFire() {
    if (!this.ctx) return;
    this.click(null, 0.7);
  }

  reload(kind) {
    if (!this.ctx) return;
    const o = this.out(null, 0.7);
    const t = this.t;
    const n = kind === 'shotgun' ? 2 : 3;
    for (let i = 0; i < n; i++) {
      this.tone(o, t + 0.25 + i * 0.35, 'square', 1800, 1400, 0.02, 0.25);
      this.noiseBurst(o, t + 0.25 + i * 0.35, 0.05, 'highpass', 2500, 1, 0.4);
    }
    this.noiseBurst(o, t + 0.05, 0.15, 'bandpass', 1200, 3, 0.2, 0.03);
  }

  scream(pos, vol = 1) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = this.out(pos, vol);
    const t = this.t;
    const dur = 1.4;
    const f = this.filt('bandpass', 1300, 2);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(o);
    [520, 587, 790, 1040].forEach((base, i) => {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base * 1.15, t);
      osc.frequency.exponentialRampToValueAtTime(base * 0.55, t + dur);
      const lfo = c.createOscillator();
      lfo.frequency.value = 7 + i * 2.3;
      const lg = c.createGain();
      lg.gain.value = base * 0.05;
      lfo.connect(lg); lg.connect(osc.frequency);
      osc.connect(f);
      osc.start(t); lfo.start(t);
      osc.stop(t + dur); lfo.stop(t + dur);
    });
    this.noiseBurst(o, t, dur * 0.8, 'bandpass', 2500, 1, 0.25, 0.05);
  }

  growl(pos, vol = 0.9) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = this.out(pos, vol);
    const t = this.t;
    const dur = 1.6;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(62, t);
    osc.frequency.linearRampToValueAtTime(48, t + dur);
    const am = c.createGain();
    am.gain.value = 0.5;
    const lfo = c.createOscillator();
    lfo.frequency.value = 16;
    const lg = c.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg); lg.connect(am.gain);
    const f = this.filt('lowpass', 380, 3);
    const g = c.createGain();
    this.env(g.gain, t, 0.2, 0.9, dur);
    osc.connect(am); am.connect(f); f.connect(g); g.connect(o);
    osc.start(t); lfo.start(t);
    osc.stop(t + dur + 0.3); lfo.stop(t + dur + 0.3);
    this.noiseBurst(o, t, dur, 'lowpass', 300, 1, 0.3, 0.2);
  }

  whisper(pos, vol = 0.5) {
    if (!this.ctx) return;
    const o = this.out(pos, vol);
    const t = this.t;
    for (let i = 0; i < 4; i++) {
      const f = this.noiseBurst(o, t + i * 0.32 + Math.random() * 0.1, 0.28, 'bandpass', 1500 + Math.random() * 1600, 6, 0.4, 0.08);
      f.frequency.linearRampToValueAtTime(900 + Math.random() * 2000, t + i * 0.32 + 0.3);
    }
  }

  twig(pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 0.9);
    const t = this.t;
    this.noiseBurst(o, t, 0.03, 'highpass', 1800, 1, 0.9, 0.001);
    this.noiseBurst(o, t + 0.05, 0.05, 'bandpass', 1200, 2, 0.6, 0.001);
  }

  owl(pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 0.5);
    const t = this.t;
    this.tone(o, t, 'sine', 400, 360, 0.35, 0.3, 0.08);
    this.tone(o, t + 0.6, 'sine', 410, 340, 0.6, 0.3, 0.08);
  }

  bird(pos) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = this.out(pos, 0.35);
    const base = 2800 + Math.random() * 2200;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const t = this.t + i * (0.12 + Math.random() * 0.08);
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.6), t + 0.08);
      const g = c.createGain();
      this.env(g.gain, t, 0.01, 0.4, 0.08);
      osc.connect(g); g.connect(o);
      osc.start(t); osc.stop(t + 0.12);
    }
  }

  // Voz simple de turista ("¡Hola!")
  call(pos) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = this.out(pos, 0.9);
    const t = this.t;
    const syl = [
      { f0: 210, f1: 240, a: 550, b: 950, d: 0.22 },
      { f0: 260, f1: 200, a: 800, b: 1300, d: 0.35 },
    ];
    let tt = t;
    syl.forEach((s) => {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(s.f0, tt);
      osc.frequency.linearRampToValueAtTime(s.f1, tt + s.d);
      const g = c.createGain();
      this.env(g.gain, tt, 0.04, 0.5, s.d);
      const f1 = this.filt('bandpass', s.a, 5);
      const f2 = this.filt('bandpass', s.b, 5);
      osc.connect(f1); osc.connect(f2);
      f1.connect(g); f2.connect(g);
      g.connect(o);
      osc.start(tt); osc.stop(tt + s.d + 0.1);
      tt += s.d + 0.03;
    });
  }

  heartbeat(vol = 0.6) {
    if (!this.ctx) return;
    const o = this.out(null, vol);
    const t = this.t;
    this.tone(o, t, 'sine', 60, 40, 0.12, 0.9, 0.01);
    this.tone(o, t + 0.24, 'sine', 55, 38, 0.14, 0.7, 0.01);
  }

  jumpscare() {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = this.out(null, 1.3);
    const t = this.t;
    const dur = 1.1;
    [311, 440, 622, 933, 1244, 1480].forEach((f, i) => {
      const osc = c.createOscillator();
      osc.type = i % 2 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(f * 1.1, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.8, t + dur);
      const g = c.createGain();
      this.env(g.gain, t, 0.01, 0.18, dur);
      osc.connect(g); g.connect(o);
      osc.start(t); osc.stop(t + dur + 0.05);
    });
    this.noiseBurst(o, t, dur, 'highpass', 1500, 0.5, 0.8, 0.005);
    this.tone(o, t, 'sine', 70, 25, 0.8, 1.2, 0.005);
  }

  hurt() {
    if (!this.ctx) return;
    const o = this.out(null, 0.8);
    const t = this.t;
    this.noiseBurst(o, t, 0.25, 'lowpass', 900, 2, 0.6);
    this.tone(o, t, 'sawtooth', 180, 90, 0.25, 0.25);
  }

  sting() {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = this.out(null, 0.9);
    const t = this.t;
    const dur = 4;
    const f = this.filt('lowpass', 2400, 1);
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(250, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(o);
    [55, 58.3, 110, 116.5, 233, 247].forEach((fr) => {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = fr;
      osc.connect(f);
      osc.start(t); osc.stop(t + dur);
    });
  }

  bell(pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 1.2);
    for (let k = 0; k < 3; k++) {
      const t = this.t + k * 2.2;
      [1, 2, 2.4, 3, 4.2].forEach((m, i) => {
        this.tone(o, t, 'sine', 196 * m, 196 * m, 3.5 - i * 0.5, 0.35 / (i + 1), 0.005);
      });
    }
  }

  radio() {
    if (!this.ctx) return;
    const o = this.out(null, 0.35);
    const t = this.t;
    const f = this.noiseBurst(o, t, 2.8, 'bandpass', 2000, 0.8, 0.5, 0.05);
    f.frequency.linearRampToValueAtTime(900, t + 1.5);
    f.frequency.linearRampToValueAtTime(2600, t + 2.8);
  }

  cash() {
    if (!this.ctx) return;
    const o = this.out(null, 0.5);
    const t = this.t;
    this.tone(o, t, 'sine', 1320, 1320, 0.12, 0.4);
    this.tone(o, t + 0.1, 'sine', 1760, 1760, 0.3, 0.4);
  }

  ui() {
    if (!this.ctx) return;
    this.tone(this.out(null, 0.3), this.t, 'triangle', 660, 660, 0.06, 0.4);
  }

  pickup() {
    if (!this.ctx) return;
    const o = this.out(null, 0.4);
    this.tone(o, this.t, 'triangle', 520, 1040, 0.15, 0.4);
  }

  paper() {
    if (!this.ctx) return;
    const o = this.out(null, 0.5);
    this.noiseBurst(o, this.t, 0.2, 'highpass', 3000, 0.5, 0.4, 0.03);
    this.noiseBurst(o, this.t + 0.15, 0.15, 'highpass', 2500, 0.5, 0.3, 0.02);
  }

  // Zumbido continuo del generador (posicional)
  setHum(pos, on) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.hum) {
      const out = this.out(pos, 1);
      const g = c.createGain();
      g.gain.value = 0;
      const f = this.filt('lowpass', 260, 1.5);
      [48, 96.5, 144].forEach((fr, i) => {
        const o = c.createOscillator();
        o.type = i ? 'square' : 'sawtooth';
        o.frequency.value = fr;
        const og = c.createGain();
        og.gain.value = i ? 0.15 : 0.5;
        o.connect(og); og.connect(f);
        o.start();
      });
      const lfo = c.createOscillator();
      lfo.frequency.value = 9;
      const lg = c.createGain();
      lg.gain.value = 0.08;
      const am = c.createGain();
      am.gain.value = 1;
      lfo.connect(lg); lg.connect(am.gain);
      lfo.start();
      f.connect(am); am.connect(g); g.connect(out);
      this.hum = g;
    }
    this.hum.gain.setTargetAtTime(on ? 0.22 : 0, c.currentTime, on ? 0.4 : 0.15);
  }

  sputter(pos, vol = 1) {
    if (!this.ctx) return;
    const o = this.out(pos, vol);
    for (let i = 0; i < 6; i++) {
      const t = this.t + i * (0.12 + i * 0.05);
      this.tone(o, t, 'sawtooth', 70 - i * 6, 40, 0.1, 0.5 - i * 0.07);
      this.noiseBurst(o, t, 0.08, 'lowpass', 500, 1, 0.35 - i * 0.05);
    }
  }

  pull(pos, ok) {
    if (!this.ctx) return;
    const o = this.out(pos, 1);
    const t = this.t;
    const f = this.noiseBurst(o, t, 0.35, 'bandpass', 900, 3, 0.4, 0.05);
    f.frequency.linearRampToValueAtTime(2200, t + 0.35);
    for (let i = 0; i < (ok ? 6 : 3); i++) {
      this.tone(o, t + 0.4 + i * 0.09, 'sawtooth', 60, 45, 0.08, 0.5);
      this.noiseBurst(o, t + 0.4 + i * 0.09, 0.07, 'lowpass', 600, 1, 0.3);
    }
  }

  glug(pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 0.8);
    for (let i = 0; i < 7; i++) {
      const t = this.t + i * 0.16 + Math.random() * 0.05;
      this.tone(o, t, 'sine', 180 + Math.random() * 80, 90, 0.09, 0.4);
    }
  }

  alarm() {
    if (!this.ctx) return;
    const o = this.out(null, 0.55);
    for (let i = 0; i < 4; i++) {
      this.tone(o, this.t + i * 0.22, 'square', 1760, 1760, 0.11, 0.35, 0.002);
    }
  }

  bark(pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 0.9);
    for (let i = 0; i < 2; i++) {
      const t = this.t + i * 0.28;
      this.tone(o, t, 'sawtooth', 520, 260, 0.1, 0.45, 0.01);
      this.noiseBurst(o, t, 0.1, 'bandpass', 1100, 2, 0.4);
    }
  }

  cry(pos) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = this.out(pos, 0.7);
    const t = this.t;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(480, t);
    osc.frequency.linearRampToValueAtTime(620, t + 0.3);
    osc.frequency.linearRampToValueAtTime(420, t + 0.9);
    const f = this.filt('bandpass', 1300, 4);
    const g = c.createGain();
    this.env(g.gain, t, 0.08, 0.5, 0.9);
    osc.connect(f); f.connect(g); g.connect(o);
    osc.start(t); osc.stop(t + 1.1);
  }

  flare(pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 0.8);
    const t = this.t;
    this.noiseBurst(o, t, 0.25, 'highpass', 2500, 0.7, 0.8, 0.005);
    this.noiseBurst(o, t + 0.2, 6, 'bandpass', 3500, 0.8, 0.12, 0.3);
  }

  // ---------- Multijugador ----------
  // Disparo del otro jugador, oído desde donde esté
  shotAt(pos, kind) {
    if (!this.ctx) return;
    const o = this.out(pos, kind === 'shotgun' ? 2.4 : 1.9);
    const t = this.t;
    const dur = kind === 'shotgun' ? 0.55 : 0.32;
    const f = this.noiseBurst(o, t, dur, 'lowpass', 5000, 0.8, 1.2, 0.002);
    f.frequency.exponentialRampToValueAtTime(220, t + dur);
    this.tone(o, t, 'sine', kind === 'shotgun' ? 100 : 140, 35, dur * 0.8, 1.0, 0.002);
  }

  // Zarpazo al aire
  swipe(pos, vol = 0.7) {
    if (!this.ctx) return;
    const o = this.out(pos, vol);
    const t = this.t;
    const f = this.noiseBurst(o, t, 0.22, 'bandpass', 900, 1.2, 0.6, 0.02);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.2);
  }

  // Hachazo contra un tronco (se oye lejos)
  chop(pos, vol = 1.1) {
    if (!this.ctx) return;
    const o = this.out(pos, vol);
    const t = this.t;
    this.tone(o, t, 'triangle', 320, 110, 0.09, 0.9, 0.002);
    this.noiseBurst(o, t, 0.12, 'bandpass', 750, 1.4, 0.8, 0.002);
    this.tone(o, t, 'sine', 140, 60, 0.18, 0.6, 0.002);
  }

  // Disparador y flash de la cámara de fotos
  shutter() {
    if (!this.ctx) return;
    const o = this.out(null, 0.7);
    const t = this.t;
    this.tone(o, t, 'square', 3200, 2200, 0.015, 0.25);
    this.noiseBurst(o, t, 0.03, 'highpass', 4000, 0.7, 0.45);
    this.tone(o, t + 0.07, 'square', 2600, 1900, 0.015, 0.2);
    this.tone(o, t + 0.1, 'sine', 900, 4200, 0.35, 0.06, 0.05);
  }

  // Rugido largo que hace temblar las paredes
  roar(pos, vol = 1.4) {
    if (!this.ctx) return;
    this.growl(pos, vol);
    const c = this.ctx;
    const o = this.out(pos, vol);
    const t = this.t;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 2.2);
    const f = this.filt('lowpass', 700, 2);
    const g = c.createGain();
    this.env(g.gain, t, 0.15, 0.8, 2.2);
    osc.connect(f); f.connect(g); g.connect(o);
    osc.start(t); osc.stop(t + 2.5);
    this.noiseBurst(o, t, 2.0, 'bandpass', 600, 0.7, 0.5, 0.1);
  }

  // Gota que cae en la cueva
  drip(pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 0.35);
    const t = this.t;
    const f0 = 900 + Math.random() * 900;
    this.tone(o, t, 'sine', f0, f0 * 2.2, 0.08, 0.5, 0.002);
  }

  // Tono limpio (fuegos fatuos, bocas del muro)
  chime(pos, pitch = 1, vol = 0.5) {
    if (!this.ctx) return;
    const o = this.out(pos, vol);
    const t = this.t;
    this.tone(o, t, 'sine', 520 * pitch, 520 * pitch, 0.5, 0.5, 0.01);
    this.tone(o, t, 'triangle', 1040 * pitch, 1035 * pitch, 0.35, 0.18, 0.01);
  }

  // Chispazo de la piedra de afilar
  spark(pos, ok) {
    if (!this.ctx) return;
    const o = this.out(pos, 0.8);
    const t = this.t;
    if (ok) {
      this.noiseBurst(o, t, 0.25, 'highpass', 5000, 0.7, 0.7, 0.002);
      this.tone(o, t, 'square', 2600, 1800, 0.12, 0.15, 0.002);
    } else {
      this.noiseBurst(o, t, 0.18, 'lowpass', 900, 1, 0.6, 0.002);
      this.tone(o, t, 'sine', 160, 70, 0.15, 0.5, 0.002);
    }
  }

  // Chillido de rata
  squeak(pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 0.45);
    const t = this.t;
    this.tone(o, t, 'square', 2400, 3200, 0.07, 0.25, 0.005);
    this.tone(o, t + 0.09, 'square', 2600, 2100, 0.06, 0.2, 0.005);
  }

  // Olfatear
  sniff() {
    if (!this.ctx) return;
    const o = this.out(null, 0.5);
    for (let i = 0; i < 3; i++) this.noiseBurst(o, this.t + i * 0.18, 0.1, 'bandpass', 2800, 1.5, 0.35, 0.03);
  }

  // ---------- Ambiente ----------
  // Público del pleno: murmullo (voces sordas que suben y bajan) y aplausos
  murmur(pos, vol = 0.6, dur = 2.2, angry = false) {
    if (!this.ctx) return;
    const o = this.out(pos, vol);
    const t = this.t;
    for (let i = 0; i < 14; i++) {
      const t0 = t + Math.random() * dur;
      const f = this.noiseBurst(o, t0, 0.18 + Math.random() * 0.3, 'bandpass', (angry ? 520 : 380) + Math.random() * 360, 6, angry ? 0.35 : 0.22, 0.05);
      f.frequency.linearRampToValueAtTime(f.frequency.value * (0.8 + Math.random() * 0.5), t0 + 0.3);
    }
  }

  applause(pos, vol = 0.7) {
    if (!this.ctx) return;
    const o = this.out(pos, vol);
    const t = this.t;
    for (let i = 0; i < 70; i++) {
      const t0 = t + Math.random() * 2.2 * (i / 70 + 0.3);
      this.noiseBurst(o, t0, 0.02 + Math.random() * 0.02, 'bandpass', 1400 + Math.random() * 1600, 1.2, 0.25 + Math.random() * 0.25, 0.001);
    }
  }

  gavel(pos) {
    if (!this.ctx) return;
    const o = this.out(pos, 1);
    for (let i = 0; i < 2; i++) {
      const t = this.t + i * 0.22;
      this.tone(o, t, 'sine', 320, 160, 0.07, 0.9);
      this.noiseBurst(o, t, 0.05, 'bandpass', 1500, 2, 0.6);
    }
  }

  // Medidor de campo de la investigadora: pitido más agudo cuanto más cerca
  emf(level) {
    if (!this.ctx) return;
    const o = this.out(null, 0.25);
    this.tone(o, this.t, 'square', 600 + level * 260, 600 + level * 260, 0.05, 0.3);
  }

  // Tic corto (relojes, medidores)
  tick(vol = 0.3) {
    if (!this.ctx) return;
    const o = this.out(null, vol);
    this.tone(o, this.t, 'triangle', 1400, 1200, 0.02, 0.4);
  }

  startAmbience() {
    const c = this.ctx;
    const t = c.currentTime;

    // Viento
    const wind = this.noiseSrc(this.brown);
    const wf = this.filt('bandpass', 420, 0.6);
    const wlfo = c.createOscillator();
    wlfo.frequency.value = 0.07;
    const wlg = c.createGain();
    wlg.gain.value = 220;
    wlfo.connect(wlg); wlg.connect(wf.frequency);
    this.windGain = c.createGain();
    this.windGain.gain.value = 0.0;
    wind.connect(wf); wf.connect(this.windGain); this.windGain.connect(this.amb);
    wind.start(t); wlfo.start(t);

    // Grillos (noche)
    const cr = c.createOscillator();
    cr.frequency.value = 4300;
    const crAm = c.createGain();
    crAm.gain.value = 0.5;
    const crL = c.createOscillator();
    crL.type = 'square';
    crL.frequency.value = 26;
    const crLg = c.createGain();
    crLg.gain.value = 0.5;
    crL.connect(crLg); crLg.connect(crAm.gain);
    const crL2 = c.createOscillator();
    crL2.frequency.value = 0.9;
    this.crickets = c.createGain();
    this.crickets.gain.value = 0;
    const crL2g = c.createGain();
    crL2g.gain.value = 0.5;
    crL2.connect(crL2g);
    const crickMod = c.createGain();
    crickMod.gain.value = 0.5;
    crL2g.connect(crickMod.gain);
    cr.connect(crAm); crAm.connect(crickMod); crickMod.connect(this.crickets); this.crickets.connect(this.amb);
    cr.start(t); crL.start(t); crL2.start(t);

    // Zumbido grave (noche) y capa de tensión
    this.drone = c.createGain();
    this.drone.gain.value = 0;
    const df = this.filt('lowpass', 200, 1);
    [41.2, 61.7, 43.1].forEach((f) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(df);
      o.start(t);
    });
    df.connect(this.drone); this.drone.connect(this.amb);

    this.tension = c.createGain();
    this.tension.gain.value = 0;
    const tf = this.filt('bandpass', 1900, 3);
    [1880, 1957, 2011].forEach((f) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(tf);
      o.start(t);
    });
    const tl = c.createOscillator();
    tl.frequency.value = 5.5;
    const tlg = c.createGain();
    tlg.gain.value = 0.4;
    const tMod = c.createGain();
    tMod.gain.value = 0.6;
    tl.connect(tlg); tlg.connect(tMod.gain);
    tf.connect(tMod); tMod.connect(this.tension); this.tension.connect(this.amb);
    tl.start(t);
  }

  // daylight 0..1, danger 0..1, indoors bool
  updateAmbience(dt, daylight, danger, indoors, listenerPos) {
    if (!this.ctx || !this.windGain) return;
    const t = this.ctx.currentTime;
    const night = 1 - daylight;
    this.windGain.gain.setTargetAtTime((0.18 + night * 0.12) * (indoors ? 0.45 : 1), t, 0.5);
    this.crickets.gain.setTargetAtTime(night * 0.035 * (indoors ? 0.4 : 1), t, 0.8);
    this.drone.gain.setTargetAtTime(night * 0.06 + danger * 0.16, t, 0.6);
    this.tension.gain.setTargetAtTime(danger * danger * 0.05, t, 0.4);

    if (!listenerPos) return;
    if (daylight > 0.5) {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0) {
        this.birdTimer = 2 + Math.random() * 6;
        const a = Math.random() * Math.PI * 2;
        this.bird({ x: listenerPos.x + Math.cos(a) * 18, y: 8, z: listenerPos.z + Math.sin(a) * 18 });
      }
    } else {
      this.owlTimer -= dt;
      if (this.owlTimer <= 0) {
        this.owlTimer = 25 + Math.random() * 40;
        const a = Math.random() * Math.PI * 2;
        this.owl({ x: listenerPos.x + Math.cos(a) * 30, y: 10, z: listenerPos.z + Math.sin(a) * 30 });
      }
    }
  }
}

const SFX = new SoundEngine();
