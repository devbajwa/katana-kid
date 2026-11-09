
/* =====================================================================
   4. AUDIO  -  everything synthesised with the Web Audio API.
      Koto = Karplus-Strong plucked string (buffers built once per pitch).
      Shakuhachi = sine with vibrato + band-passed breath noise.
      Taiko = pitch-dropping sine + low noise thump.
      Music uses the Japanese In scale (0,1,5,7,8) with a look-ahead scheduler.
   ===================================================================== */
const Sound = {
  ctx: null, master: null, musicBus: null, sfxBus: null, reverb: null, noiseBuf: null, kotoBufs: {},
  track: null, trackName: '', step: 0, nextTime: 0, timer: 0, ready: false,

  unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* iOS: lets sound play with the silent switch on */ }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(c.destination);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(comp);
    this.sfxBus = c.createGain(); this.sfxBus.connect(comp);
    // small hall reverb from a generated impulse response
    this.reverb = c.createConvolver();
    const len = Math.floor(c.sampleRate * 1.8), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    this.reverb.buffer = ir;
    this.revSend = c.createGain(); this.revSend.gain.value = 0.32;
    this.revSend.connect(this.reverb); this.reverb.connect(comp);
    // shared white noise
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    for (let m = 38; m <= 88; m++) this.kotoBuf(m);       // pre-build koto strings once
    this.ready = true;
    this.applyVolumes();
    this.timer = setInterval(() => this.schedule(), CONFIG.audio.tick);
    if (this.trackName) { const n = this.trackName; this.trackName = ''; this.playMusic(n); }
  },
  applyVolumes() {
    if (!this.ready) return;
    const s = Save.data.settings, t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(s.musicOn ? s.musicVol * 0.55 : 0, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfxVol * 0.9, t, 0.02);
  },
  midiHz: m => 440 * Math.pow(2, (m - 69) / 12),
  inNote(deg) { // degree in the In scale -> MIDI note
    const sc = CONFIG.audio.inScale, o = Math.floor(deg / 5), i = ((deg % 5) + 5) % 5;
    return CONFIG.audio.root + o * 12 + sc[i];
  },

  // ---------- instruments ----------
  kotoBuf(m) {
    if (this.kotoBufs[m]) return this.kotoBufs[m];
    const c = this.ctx, sr = c.sampleRate, f = this.midiHz(m);
    const len = Math.floor(sr * 1.7), N = Math.max(2, Math.round(sr / f));
    const b = c.createBuffer(1, len, sr), d = b.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < N; i++) { const r = Math.random() * 2 - 1; prev = prev * 0.45 + r * 0.55; d[i] = prev * 0.6; }
    const decay = 0.9965 + Math.min(0.0025, f / 900000);
    for (let i = N; i < len; i++) d[i] = (d[i - N] + d[i - N + 1]) * 0.5 * decay;
    return (this.kotoBufs[m] = b);
  },
  koto(m, t, vol, bus) {
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain();
    s.buffer = this.kotoBuf(clamp(m, 38, 88));
    g.gain.setValueAtTime(vol, t); g.gain.setTargetAtTime(0, t + 1.2, 0.12);
    s.connect(g); g.connect(bus || this.musicBus); if (!bus || bus === this.musicBus) g.connect(this.revSend);
    s.start(t); s.stop(t + 1.7);
  },
  flute(m, t, dur, vol) {
    const c = this.ctx, f = this.midiHz(m);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 0.965, t); o.frequency.linearRampToValueAtTime(f, t + 0.14);
    const lfo = c.createOscillator(); lfo.frequency.value = 5.3;
    const lg = c.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.014, t + dur * 0.7);
    lfo.connect(lg); lg.connect(o.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.1);
    g.gain.setValueAtTime(vol * 0.85, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.18);
    const n = c.createBufferSource(); n.buffer = this.noiseBuf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 1.5; bp.Q.value = 2.5;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(vol * 0.9, t + 0.04);
    ng.gain.linearRampToValueAtTime(vol * 0.28, t + 0.2); ng.gain.linearRampToValueAtTime(0.0001, t + dur + 0.15);
    o.connect(g); n.connect(bp); bp.connect(ng);
    for (const node of [g, ng]) { node.connect(this.musicBus); node.connect(this.revSend); }
    const end = t + dur + 0.25;
    o.start(t); lfo.start(t); n.start(t, Math.random() * 1.5); o.stop(end); lfo.stop(end); n.stop(end);
  },
  taiko(t, vol, pitch, bus) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(130 * pitch, t); o.frequency.exponentialRampToValueAtTime(42 * pitch, t + 0.3);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g); g.connect(bus || this.musicBus);
    const n = c.createBufferSource(); n.buffer = this.noiseBuf;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420 * pitch;
    const ng = c.createGain(); ng.gain.setValueAtTime(vol * 0.7, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    n.connect(lp); lp.connect(ng); ng.connect(bus || this.musicBus);
    o.start(t); o.stop(t + 0.6); n.start(t, Math.random()); n.stop(t + 0.16);
  },
  ka(t, vol) { // rim click
    const c = this.ctx, n = c.createBufferSource(); n.buffer = this.noiseBuf;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(hp); hp.connect(g); g.connect(this.musicBus); n.start(t, Math.random()); n.stop(t + 0.06);
  },

  // ---------- music ----------
  playMusic(name) {
    if (this.trackName === name) return;
    this.trackName = name; this.track = TRACKS[name] || null; this.step = 0;
    if (this.ready) this.nextTime = this.ctx.currentTime + 0.12;
  },
  schedule() {
    if (!this.ready || !this.track) return;
    const c = this.ctx, la = CONFIG.audio.lookahead;
    if (this.nextTime < c.currentTime - 0.3) this.nextTime = c.currentTime + 0.05;   // tab was asleep: resync
    const audible = Save.data.settings.musicOn && Save.data.settings.musicVol > 0;
    while (this.nextTime < c.currentTime + la) {
      if (audible) this.track.play(this, this.step, this.nextTime);
      this.nextTime += this.track.stepDur; this.step++;
    }
  },

  // ---------- sound effects ----------
  tone(type, f0, f1, dur, vol, t, delay) {
    const c = this.ctx; t = (t || c.currentTime) + (delay || 0);
    const o = c.createOscillator(), g = c.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(type, f0, f1, q, dur, vol, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const n = c.createBufferSource(); n.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f); f.connect(g); g.connect(this.sfxBus); n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.02);
  },
  pluck(deg, delay, vol) { this.koto(this.inNote(deg), this.ctx.currentTime + (delay || 0), vol || 0.5, this.sfxBus); },
  sfx(name, v) {
    if (!this.ready || Save.data.settings.sfxVol <= 0) return;
    v = v || 0;
    switch (name) {
      case 'swoosh': this.noise('bandpass', 700 + v * 350, 3200 + v * 900, 1.4, 0.11 + v * 0.035, 0.55 + v * 0.1); if (v === 3) this.tone('triangle', 220, 110, 0.12, 0.12); break;
      case 'clang': [1250, 1890, 2710].forEach((f, i) => this.tone(i ? 'sine' : 'square', f, f * 0.99, 0.35 - i * 0.08, 0.09)); this.noise('highpass', 4000, 6000, 0.7, 0.04, 0.3); break;
      case 'hit': this.tone('sine', 190, 55, 0.12, 0.5); this.noise('lowpass', 1800, 300, 0.8, 0.08, 0.4); break;
      case 'kill': this.noise('lowpass', 2400, 200, 0.7, 0.35, 0.45); this.tone('sine', 300, 60, 0.25, 0.3); break;
      case 'jump': this.tone('triangle', 330, 620, 0.09, 0.22); break;
      case 'djump': this.tone('triangle', 520, 980, 0.1, 0.2); this.noise('highpass', 3000, 6000, 1, 0.08, 0.12); break;
      case 'wjump': this.tone('triangle', 400, 760, 0.09, 0.2); this.noise('bandpass', 900, 500, 2, 0.06, 0.3); break;
      case 'land': this.noise('lowpass', 500, 120, 0.8, 0.07, 0.35); break;
      case 'dash': this.noise('bandpass', 2400, 500, 1.2, 0.16, 0.5); break;
      case 'thunder': this.noise('bandpass', 3000, 400, 2, 0.2, 0.5); this.tone('sawtooth', 160, 60, 0.18, 0.12); break;
      case 'power': [0, 2, 4, 5, 7].forEach((d, i) => this.pluck(d + 3, i * 0.06, 0.5)); break;
      case 'scroll': this.pluck(9, 0, 0.5); this.pluck(12, 0.08, 0.5); break;
      case 'checkpoint': this.tone('sine', 880, 878, 1.2, 0.18); this.tone('sine', 1318, 1316, 1.0, 0.1); [0, 2, 4].forEach((d, i) => this.pluck(d, i * 0.09, 0.45)); break;
      case 'hurt': this.tone('square', 420, 140, 0.22, 0.14); this.noise('lowpass', 1200, 200, 1, 0.15, 0.3); break;
      case 'shield': this.tone('sine', 1500, 600, 0.3, 0.2); this.noise('highpass', 3000, 5000, 1, 0.2, 0.2); break;
      case 'down': this.tone('sine', 500, 120, 0.6, 0.2); break;
      case 'revive': [0, 2, 3, 4, 5, 7].forEach((d, i) => this.pluck(d + 2, i * 0.07, 0.5)); break;
      case 'clear': [0, 2, 4, 5, 4, 7].forEach((d, i) => this.pluck(d + 2, i * 0.12, 0.55)); this.taiko(this.ctx.currentTime, 0.6, 1, this.sfxBus); break;
      case 'lantern': this.tone('sine', 1046, 1040, 0.4, 0.14); this.tone('sine', 1568, 1560, 0.3, 0.08); break;
      case 'crumble': this.noise('lowpass', 900, 200, 1, 0.25, 0.35); break;
      case 'arrow': this.noise('bandpass', 1800, 900, 3, 0.1, 0.3); this.tone('triangle', 900, 500, 0.06, 0.08); break;
      case 'boulder': this.noise('lowpass', 900, 100, 0.8, 0.4, 0.6); this.tone('sine', 90, 40, 0.3, 0.4); break;
      case 'break': this.noise('lowpass', 2500, 300, 0.6, 0.3, 0.55); break;
      case 'slam': this.taiko(this.ctx.currentTime, 0.9, 0.7, this.sfxBus); this.noise('lowpass', 600, 80, 0.7, 0.5, 0.6); break;
      case 'roar': this.tone('sawtooth', 110, 70, 0.9, 0.18); this.tone('sawtooth', 116, 66, 0.9, 0.14); this.noise('lowpass', 700, 200, 1, 0.9, 0.35); break;
      case 'alert': this.tone('square', 900, 1300, 0.07, 0.08); break;
      case 'caw': this.tone('sawtooth', 700, 420, 0.16, 0.1); this.tone('sawtooth', 680, 400, 0.14, 0.08, 0, 0.18); break;
      case 'bell': this.tone('sine', 660, 655, 1.6, 0.25); this.tone('sine', 1650, 1640, 1.2, 0.1); this.tone('sine', 990, 985, 1.4, 0.12); break;
      case 'shard': [4, 5, 7, 9, 10, 12].forEach((d, i) => this.pluck(d, i * 0.1, 0.55)); this.tone('sine', 1760, 1750, 1.5, 0.08, 0, 0.6); break;
      case 'rival': [7, 9, 10, 12].forEach((d, i) => this.pluck(d, 0.5 + i * 0.1, 0.5)); break;
      case 'menu': this.pluck(5, 0, 0.35); break;
      case 'heal': [0, 2, 4, 7].forEach((d, i) => this.pluck(d + 5, i * 0.07, 0.45)); this.tone('sine', 880, 1320, 0.3, 0.1); break;
      case 'golden': [0, 4, 7, 9, 12].forEach((d, i) => this.pluck(d + 4, i * 0.05, 0.5)); this.tone('triangle', 660, 1320, 0.5, 0.12); break;
      case 'hop': this.tone('sine', 260, 520, 0.12, 0.12); break;
      case 'star': this.noise('bandpass', 4200, 2200, 4, 0.12, 0.2); this.tone('square', 1600, 1200, 0.05, 0.05); break;
      case 'spook': this.tone('sine', 420, 300, 0.5, 0.12); this.tone('sine', 630, 450, 0.5, 0.06, 0, 0.1); break;
      case 'ember': this.noise('bandpass', 900, 400, 2, 0.25, 0.25); break;
      case 'block': [1500, 2200].forEach(f => this.tone('square', f, f * 0.98, 0.18, 0.08)); this.noise('highpass', 3000, 5000, 1, 0.08, 0.3); break;
      case 'warn':this.tone('triangle', 700, 700, 0.08, 0.1); break;
    }
  },
};

// Tracks: play(sound, step, time). stepDur in seconds.
const TRACKS = {
  // calm exploration: 80 bpm, eighth-note grid, 8-bar loop
  valley: {
    stepDur: 60 / 80 / 2,
    roots: [0, 0, -3, -3, -2, -2, -4, -1],
    arpA: [0, 2, 4, 5, 7, 5, 4, 2], arpB: [0, 4, 2, 5, 4, 7, 5, 4],
    melody: [[0, 0, 7, 5], [0, 6, 8, 2], [1, 0, 7, 3], [1, 4, 5, 4], [2, 0, 4, 6], [2, 6, 5, 2], [3, 0, 4, 3], [3, 4, 2, 4],
             [4, 0, 5, 3], [4, 4, 7, 4], [5, 0, 9, 5], [5, 6, 8, 2], [6, 0, 7, 3], [6, 3, 8, 1], [6, 4, 7, 4], [7, 0, 5, 7]],
    play(S, step, t) {
      const bar = Math.floor(step / 8) % 8, s = step % 8, cyc = Math.floor(step / 64);
      const r = this.roots[bar], arp = (bar + cyc) % 2 ? this.arpB : this.arpA;
      if (s === 0) S.koto(S.inNote(r - 10), t, 0.5);
      if (s !== 7 || bar % 2) S.koto(S.inNote(r - 5 + arp[s]), t, s % 2 ? 0.22 : 0.3);
      if (cyc % 3 !== 2) for (const m of this.melody) if (m[0] === bar && m[1] === s) S.flute(S.inNote(m[2] + (cyc % 3 === 1 && bar > 3 ? -2 : 0)), t, m[3] * this.stepDur * 0.95, 0.2);
      if (s === 0 && bar % 2 === 0) S.taiko(t, 0.35, 1);
      if (bar === 7 && (s === 4 || s === 6)) S.taiko(t, 0.25, 1.2);
    },
  },
  // boss: 150 bpm, sixteenth grid, drum-heavy
  boss: {
    stepDur: 60 / 150 / 4,
    shift: [0, 0, 1, 1, 0, 0, -1, 2],
    ost: [0, 0, 1, 0, 3, 0, 1, -1],
    play(S, step, t) {
      const s = step % 16, bar = Math.floor(step / 16) % 8, sh = this.shift[bar];
      if (s === 0 || s === 6 || s === 8 || (bar % 2 && s === 11)) S.taiko(t, s === 0 ? 0.95 : 0.7, s === 0 ? 0.85 : 1);
      if (s === 4 || s === 12) S.ka(t, 0.35);
      if (bar % 4 === 3 && s >= 12) S.taiko(t, 0.4, 1.35);
      if (s % 2 === 0) S.koto(S.inNote(this.ost[s / 2] - 5 + sh), t, 0.3);
      if (s === 0) S.koto(S.inNote(sh - 10), t, 0.5);
      if (bar % 2 === 1 && s === 0) S.flute(S.inNote(7 + sh), t, 0.38, 0.2);
      if (bar % 2 === 1 && s === 8) S.flute(S.inNote(8 + sh), t, 0.5, 0.2);
      if (bar === 7 && s === 4) S.flute(S.inNote(10), t, 0.9, 0.22);
    },
  },
};
