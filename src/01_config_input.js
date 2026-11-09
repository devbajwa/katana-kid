'use strict';
/* =====================================================================
   KATANA KID  -  Stage 1 (Region 1: Cherry Blossom Valley). Game idea & design: Luqman.
   One self-contained file. Sections:
     1. CONFIG            8. ENTITIES (players, enemies, boss, projectiles, pickups, effects)
     2. UTILITIES         9. PHYSICS (tile collision)
     3. INPUT            10. COMBAT
     4. AUDIO            11. CAMERA
     5. ART GENERATION   12. RENDERING
     6. LEVEL CHUNKS     13. UI (menus, HUD)
     7. LEVEL GENERATOR  14. SAVES
                         15. MAIN LOOP
   ===================================================================== */

/* =====================================================================
   1. CONFIG  -  every tunable value lives here
   ===================================================================== */
const CONFIG = {
  view: { w: 480, h: 270, tile: 16 },
  loop: { step: 1 / 60, maxAccum: 0.1 },            // accumulator cap = 6 physics steps (no spiral of death)

  physics: {                                        // pixels and seconds
    gravity: 940, maxFall: 300,
    runSpeed: 115, groundAccel: 1300, groundFriction: 1600, airAccel: 900, airFriction: 420,
    jumpVel: 292, jumpCut: 0.42, doubleJumpVel: 265, airJumps: 1,
    coyoteTime: 0.10, jumpBuffer: 0.12,
    wallSlideSpeed: 55, wallJumpX: 150, wallJumpY: 282, wallJumpLock: 0.14, wallCoyote: 0.08,
    dashSpeed: 275, dashTime: 0.14, dashCooldown: 0.45, airDashes: 1,
    airSlashMax: 3, airSlashHang: 0.18, airSlashGravity: 0.1,
    downStrikeVel: 340, pogoVel: 305,
    hurtKnockX: 130, hurtKnockY: 170, hurtStun: 0.28,
    dropThroughTime: 0.18,
  },

  player: {
    w: 10, h: 20, hearts: 5, invuln: 1.0,
    reviveTime: 2.0, reviveRadius: 28, reviveHearts: 3,
    catchupDelay: 1.3, catchupGhost: 1.0, catchupMargin: 28,
    deathFade: 0.9, fallDamage: 1,
    squashJump: [0.72, 1.28], squashLand: [1.3, 0.75], squashRecover: 12,
  },

  combat: {
    comboWindow: 0.35, slashBuffer: 0.12, dashBuffer: 0.08,
    hitstop: 3, hitstopFinisher: 4, hitstopHurt: 5,
    shakeHit: 1.5, shakeHeavy: 3, shakeHurt: 4, shakeBoss: 6,
    flameBonus: 1, thunderDmg: 2, deflectSpeed: 250, deflectDmg: 2,
    // frame counts at 60 fps; hitbox offsets from player centre-x and feet-y, facing right
    attacks: {
      slash1: { startup: 3, active: 5, recovery: 9,  dmg: 1, kb: 80,  ox: 1,   oy: -19, w: 24, h: 21, lunge: 40, stop: 3 },
      slash2: { startup: 3, active: 5, recovery: 9,  dmg: 1, kb: 90,  ox: 1,   oy: -26, w: 24, h: 28, lunge: 40, stop: 3 },
      slash3: { startup: 5, active: 6, recovery: 16, dmg: 2, kb: 200, ox: 0,   oy: -22, w: 30, h: 25, lunge: 95, stop: 4 },
      air:    { startup: 2, active: 6, recovery: 8,  dmg: 1, kb: 80,  ox: 0,   oy: -24, w: 26, h: 28, lunge: 0,  stop: 3 },
      down:   { startup: 2, active: 90, recovery: 4, dmg: 1, kb: 40,  ox: -10, oy: -2,  w: 20, h: 16, lunge: 0,  stop: 3 },
    },
  },

  enemies: {
    soldier: { hp: 3, w: 12, h: 20, speed: 28, chaseSpeed: 50, sight: 120, alertTime: 0.4, attackRange: 34,
               windup: 0.6, attackTime: 0.24, recover: 0.6, stagger: 0.32, reach: 26 },
    archer:  { hp: 2, w: 12, h: 20, speed: 24, sight: 210, keepAway: 80, alertTime: 0.4, windup: 0.75,
               fireEvery: 2.1, arrowSpeed: 150, recover: 0.4, stagger: 0.32 },
    crow:    { hp: 1, w: 12, h: 10, patrolRange: 48, patrolSpeed: 0.9, waveAmp: 7, sight: 105, windup: 0.55,
               swoopSpeed: 170, swoopTime: 0.9, returnSpeed: 75, cooldown: 1.6 },
    shield:  { hp: 4, w: 14, h: 20, speed: 20, chaseSpeed: 38, sight: 120, alertTime: 0.4, attackRange: 26, windup: 0.55,
               attackTime: 0.22, recover: 0.7, stagger: 0.4, reach: 18, turnDelay: 0.55, blockPush: 130 },
    ninja:   { hp: 2, w: 10, h: 20, speed: 40, sight: 170, alertTime: 0.3, leapVx: 70, leapVy: 270, throwEvery: 1.4, starSpeed: 165, stagger: 0.3 },
    wisp:    { hp: 2, w: 14, h: 16, sight: 150, drift: 34, bobAmp: 6, fireEvery: 3.2, emberSpeed: 72, stagger: 0.35 },
    frog:    { hp: 2, w: 14, h: 11, sight: 140, hopVx: 85, hopVy: 250, rest: 0.9, stagger: 0.3 },
    unlockLevel: { frog: 2, shield: 3, wisp: 5, ninja: 6 },                        // first level each new enemy can appear on
    variants: { soldier: [['shield', 30], ['frog', 50]], archer: [['ninja', 45]], crow: [['wisp', 40]] },  // optional E/A/Y spots: % chance (cumulative)
    activeRange: 360,                               // enemies further than this from the camera are frozen
  },

  boss: {
    name: 'RED ONI GATEKEEPER', hp: 30, coopScale: 1.5, w: 34, h: 46,
    walkSpeed: 30, idleTime: 1.1, phase2Speed: 1.4,
    slamWindup: 0.85, slamTime: 0.45, shockSpeed: 165,
    chargeWindup: 0.8, chargeSpeed: 225, stunTime: 1.5,
    throwWindup: 0.75, boulderFlight: 0.95, recover: 0.6,
  },

  hazards: { logPeriod: 2.7, logAmp: 1.05, crumbleDelay: 0.45, crumbleRespawn: 3.2, spikeKnock: 230 },

  powers: {
    // 0 Flame Blade, 1 Wind Step, 2 Spirit Shield, 3 Thunder Dash, 4 Time Bell,
    // 5 Healing Peach, 6 Giant Blade, 7 Swift Sandals, 8 Golden Armor
    names: ['FLAME BLADE', 'WIND STEP', 'SPIRIT SHIELD', 'THUNDER DASH', 'TIME BELL', 'HEALING PEACH', 'GIANT BLADE', 'SWIFT SANDALS', 'GOLDEN ARMOR'],
    hints: ['Slashes burn and hit harder!', 'Two extra air jumps!', 'Blocks the next hit!', 'Dash through enemies!', 'Enemies slow down!',
            'Two hearts back!', 'Huge slashes!', 'Run super fast!', 'Nothing can hurt you!'],
    duration: [12, 12, 25, 12, 8, 0, 12, 12, 7],
    colors: ['#ff7a2a', '#7fe0c8', '#9fd2ff', '#ffe14a', '#d9a8ff', '#ff8fb0', '#ff5ad0', '#6af08a', '#ffc21a'],
    timed: [0, 1, 2, 3, 6, 7, 8],                    // per-player timers shown in the HUD (4 is global, 5 is instant)
    windExtraJumps: 2, timeBellScale: 0.5, peachHearts: 2, giantScale: 1.5, swiftSpeed: 1.4, goldenHitEvery: 21, orbRespawn: 20, blinkTime: 3,
    unlockByLevel: [[2, 5, 7], [2, 1, 5, 7], [2, 1, 0, 5, 7, 6], [2, 1, 0, 3, 5, 6, 7], [0, 1, 2, 3, 4, 5, 6, 7, 8]],   // orb types per level (index = level-1, clamps)
  },

  // swords: startup/recovery are added frames, reach scales hitbox width, finisher adds damage to the 3rd combo hit
  swords: {
    curved: { name: 'Curved Katana', desc: 'Balanced and reliable. The classic samurai blade.', startup: 0, recovery: 0, reach: 1, finisher: 0, arc: 0, arcScale: 1 },
    sharp:  { name: 'Sharp Blade', desc: 'Lightning-fast slashes, a little shorter.', startup: -1, recovery: -3, reach: 0.9, finisher: 0, arc: 2, arcScale: 0.95 },
    heavy:  { name: 'Heavy Nodachi', desc: 'Long reach and a mighty finisher, but slower.', startup: 2, recovery: 3, reach: 1.3, finisher: 1, arc: 3, arcScale: 1.2 },
  },
  looks: {   // Dojo options: [name, main, dark, light]
    armor: [['Crimson', '#cf3340', '#7c1a2a', '#f2705e'], ['Ocean', '#2f6fd8', '#18397a', '#6fa8ff'], ['Jade', '#2f9a5a', '#17552f', '#6ad08a'],
            ['Royal', '#7a45c8', '#432070', '#b088f0'], ['Sunset', '#e8792a', '#8a3e12', '#ffb070'], ['Shadow', '#3a3448', '#1e1a28', '#6a6080'],
            ['Snow', '#e4e0ee', '#9890ac', '#ffffff'], ['Sakura', '#e86a9a', '#8a2a52', '#ffa8c8']],
    sash: [['Gold', '#f2c14e', '#b07a1e'], ['Orange', '#ff9a3c', '#b0581e'], ['White', '#f6f0e4', '#b8b0a0'], ['Red', '#e83a3a', '#8a1a20'],
           ['Teal', '#3ad0c0', '#1a7a70'], ['Pink', '#ff8ac0', '#b04a7a']],
    head: [['band', 'Headband'], ['straw', 'Straw Hat'], ['helmet', 'Helmet'], ['ninja', 'Ninja Mask'], ['fox', 'Fox Mask']],
    nameMax: 12,
  },

  fx: { particles: 520, particlesLow: 160, petals: 42, petalsLow: 12, shakeDecay: 0.86, flashDecay: 0.85 },
  ghost: { stepsPerSample: 3, maxSeconds: 900, alpha: 0.42 },  // 3 steps = 20 samples/s
  quality: { slowFrameMs: 25, slowFor: 2.0 },

  level: {
    chunksBase: 4, chunksPerLevel: 0.9,
    optionalEnemyBase: 0.18, optionalEnemyPerLevel: 0.08,
    skyRows: 6, groundRows: 5, killDepth: 56,
  },

  audio: { lookahead: 0.15, tick: 25, musicVol: 0.55, sfxVol: 0.8, root: 62, inScale: [0, 1, 5, 7, 8] },

  colors: {
    p1: { armor: '#cf3340', armorDark: '#7c1a2a', armorLight: '#f2705e', trim: '#f2c14e', cloth: '#2c2540', clothDark: '#1a1528',
          skin: '#f3c9a0', skinDark: '#cf9670', hair: '#1d1424', band: '#f6f0e4', sash: '#f2c14e', sashDark: '#b07a1e',
          blade: '#eef5ff', bladeDark: '#9fb3c8', hilt: '#3a2618', eye: '#1d1424', sandal: '#5a3a24' },
    p2: { armor: '#2f6fd8', armorDark: '#18397a', armorLight: '#6fa8ff', trim: '#f2c14e', cloth: '#2c2540', clothDark: '#1a1528',
          skin: '#f0c49a', skinDark: '#c88f6a', hair: '#2a1a14', band: '#f6f0e4', sash: '#ff9a3c', sashDark: '#b0581e',
          blade: '#eef5ff', bladeDark: '#9fb3c8', hilt: '#3a2618', eye: '#1d1424', sandal: '#5a3a24' },
    ghost: { armor: '#e6eeff', armorDark: '#a8b8dc', armorLight: '#ffffff', trim: '#ffffff', cloth: '#c4d0ee', clothDark: '#9aa8cc',
             skin: '#f4f7ff', skinDark: '#cdd6f0', hair: '#aebcdc', band: '#ffffff', sash: '#ffffff', sashDark: '#c4d0ee',
             blade: '#ffffff', bladeDark: '#cdd6f0', hilt: '#9aa8cc', eye: '#5a6a9a', sandal: '#9aa8cc' },
    soldier: { armor: '#5e4a86', armorDark: '#3a2b58', armorLight: '#8a72b8', trim: '#c9a066', cloth: '#2a2236', clothDark: '#191424',
               skin: '#3a2030', skinDark: '#24121c', hair: '#c9a066', band: '#8a6a3c', sash: '#9a3040', sashDark: '#6a1e2a',
               blade: '#dfe8f0', bladeDark: '#8a9aaa', hilt: '#7a5232', eye: '#ff5a4a', sandal: '#3a2a20' },
    archer:  { armor: '#3f7050', armorDark: '#24452f', armorLight: '#68a078', trim: '#d8b070', cloth: '#2a2a2a', clothDark: '#1a1a1a',
               skin: '#3a2030', skinDark: '#24121c', hair: '#24452f', band: '#d8b070', sash: '#a04030', sashDark: '#6a2820',
               blade: '#dfe8f0', bladeDark: '#8a9aaa', hilt: '#8a5a32', eye: '#ffd24a', sandal: '#3a2a20' },
    shield:  { armor: '#7a8296', armorDark: '#454a5c', armorLight: '#aab2c8', trim: '#d8434b', cloth: '#2a2236', clothDark: '#191424',
               skin: '#3a2030', skinDark: '#24121c', hair: '#454a5c', band: '#d8434b', sash: '#d8434b', sashDark: '#8a1a20',
               blade: '#dfe8f0', bladeDark: '#8a9aaa', hilt: '#6a4428', eye: '#ff5a4a', sandal: '#3a2a20' },
    ninja:   { armor: '#34344a', armorDark: '#1a1a26', armorLight: '#5a5a78', trim: '#c8303a', cloth: '#26263a', clothDark: '#14141e',
               skin: '#e8c49a', skinDark: '#b88a68', hair: '#14141e', band: '#c8303a', sash: '#c8303a', sashDark: '#7a1a20',
               blade: '#eef5ff', bladeDark: '#9fb3c8', hilt: '#3a2618', eye: '#ff4a4a', sandal: '#22222e', swordStyle: 'sharp' },
    hud: { text: '#fff6e0', shadow: '#1b1220', gold: '#f2c14e', p1: '#ff5a5a', p2: '#5aa0ff' },
    sky: ['#231a45', '#3b2a62', '#6a3d78', '#a8507e', '#e27a7e', '#f6a36a', '#ffcf8a', '#ffe6b0'],
  },
};

/* =====================================================================
   2. UTILITIES
   ===================================================================== */
const W = CONFIG.view.w, H = CONFIG.view.h, TS = CONFIG.view.tile;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const sgn = v => (v < 0 ? -1 : v > 0 ? 1 : 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const overlap = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed() {
  let h = 2166136261;
  for (let i = 0; i < arguments.length; i++) { h ^= arguments[i] | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; }
  return h >>> 0;
}
function makeCanvas(w, h, readback) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', readback ? { willReadFrequently: true } : undefined); x.imageSmoothingEnabled = false; c.ctx = x; return c;
}
function fmtTime(sec) {
  if (sec == null || !isFinite(sec)) return '--:--.--';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60), c = Math.floor((sec * 100) % 100);
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s + '.' + (c < 10 ? '0' : '') + c;
}

/* =====================================================================
   3. INPUT  -  keyboard (event state map, so simultaneous keys are never lost),
                 up to 2 gamepads, touch buttons. Presses are latched until a physics
                 step consumes them, so a tap shorter than a frame still registers.
   ===================================================================== */
class PlayerInput {
  constructor() {
    this.left = this.right = this.up = this.down = this.jump = this.slash = this.dash = false;
    this.jumpP = this.slashP = this.dashP = false;           // pressed this step
    this.latch = { jump: false, slash: false, dash: false };
    this.pad = { left: false, right: false, up: false, down: false, jump: false, slash: false, dash: false };
    this.touch = { left: false, right: false, down: false, jump: false, slash: false, dash: false };
  }
}
const Input = {
  keys: Object.create(null),
  players: [new PlayerInput(), new PlayerInput()],
  map: Object.create(null),               // key code -> [[playerIndex, action], ...]
  padPrev: [{}, {}, {}, {}],
  pauseLatch: false, menuLatch: null,
  BINDS: {
    p1: { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], jump: ['KeyW'], slash: ['KeyF'], dash: ['KeyG'] },
    p2: { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], jump: ['ArrowUp'], slash: ['Period'], dash: ['Slash'] },
    soloExtra: { jump: ['Space', 'KeyK'], slash: ['KeyJ'], dash: ['KeyL', 'ShiftLeft'] },
  },
  setMode(mode) {
    this.map = Object.create(null);
    const add = (code, p, a) => { (this.map[code] || (this.map[code] = [])).push([p, a]); };
    const addSet = (set, p) => { for (const a in set) for (const c of set[a]) add(c, p, a); };
    if (mode === 'coop') { addSet(this.BINDS.p1, 0); addSet(this.BINDS.p2, 1); }
    else { addSet(this.BINDS.p1, 0); addSet(this.BINDS.p2, 0); addSet(this.BINDS.soloExtra, 0); }
  },
  init() {
    this.setMode('solo');
    const block = { Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Slash: 1, Period: 1 };
    window.addEventListener('keydown', e => {
      Sound.unlock();
      const tg = e.target;
      if (tg && tg.tagName === 'INPUT' && tg.type === 'text') { if (e.code === 'Enter' || e.code === 'Escape') tg.blur(); return; }   // typing a name
      if (G.screen === 'play' && block[e.code]) e.preventDefault();
      if (e.repeat) { if (G.screen === 'play') e.preventDefault(); return; }
      this.keys[e.code] = true;
      const acts = this.map[e.code];
      if (acts && G.screen === 'play') for (const [p, a] of acts) if (a in this.players[p].latch) this.players[p].latch[a] = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.pauseLatch = true;
      if (e.code === 'KeyM') UI.toggleMusic();
      if (G.screen !== 'play') UI.menuKey(e);
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = Object.create(null); this.releaseTouches(); });
    this.initTouch();
  },
  // touch buttons: each finger is tracked, so sliding a thumb from one button to the next works
  // (pointer capture is released so the finger can leave the button it started on)
  touchSeen: false, fingers: new Map(), touchCount: new Map(),
  initTouch() {
    const root = document.getElementById('touch');
    const press = el => {
      const n = (this.touchCount.get(el) || 0) + 1; this.touchCount.set(el, n); if (n > 1) return;
      el.classList.add('on');
      const pi = this.players[+el.parentNode.dataset.p], k = el.dataset.k; pi.touch[k] = true; if (k in pi.latch) pi.latch[k] = true;
    };
    const release = el => {
      const n = (this.touchCount.get(el) || 0) - 1; this.touchCount.set(el, Math.max(0, n)); if (n > 0) return;
      el.classList.remove('on'); this.players[+el.parentNode.dataset.p].touch[el.dataset.k] = false;
    };
    this.releaseTouches = () => {
      for (const el of this.touchCount.keys()) { el.classList.remove('on'); this.touchCount.set(el, 1); release(el); }
      this.fingers.clear();
    };
    root.addEventListener('pointerdown', e => {
      const el = e.target.closest('.tb'); if (!el) return;
      e.preventDefault(); Sound.unlock();
      if (el.dataset.k === 'pause') { this.pauseLatch = true; return; }
      try { el.releasePointerCapture(e.pointerId); } catch (err) { /* not captured */ }
      this.fingers.set(e.pointerId, { el, set: el.parentNode }); press(el);
    });
    window.addEventListener('pointermove', e => {
      const f = this.fingers.get(e.pointerId); if (!f) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      let el = hit && hit.closest ? hit.closest('.tb') : null;
      if (el && el.parentNode !== f.set) el = null;          // stay within this player's buttons
      if (el === f.el) return;
      if (f.el) release(f.el); if (el) press(el);
      f.el = el;
    }, { passive: true });
    const up = e => { const f = this.fingers.get(e.pointerId); if (!f) return; if (f.el) release(f.el); this.fingers.delete(e.pointerId); };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    document.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' && !this.touchSeen) { this.touchSeen = true; UI.touch(G.screen === 'play' && !UI.current); }
    }, { passive: true });
  },
  releaseTouches() {},
  held(p, a) {
    const pi = this.players[p];
    if (pi.pad[a] || pi.touch[a]) return true;
    for (const code in this.map) {
      if (!this.keys[code]) continue;
      for (const [pp, aa] of this.map[code]) if (pp === p && aa === a) return true;
    }
    return false;
  },
  pollGamepads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let slot = 0;
    for (let i = 0; i < pads.length && slot < 2; i++) {
      const gp = pads[i]; if (!gp || !gp.connected) continue;
      const p = G.mode === 'coop' ? slot : 0;
      const b = n => !!(gp.buttons[n] && gp.buttons[n].pressed);
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const st = { left: ax < -0.4 || b(14), right: ax > 0.4 || b(15), up: ay < -0.5 || b(12), down: ay > 0.5 || b(13),
                   jump: b(0), slash: b(2), dash: b(1) || b(5), start: b(9), back: b(1) };
      const prev = this.padPrev[i];
      const pi = this.players[p];
      if (G.mode === 'coop' || slot === 0) {
        for (const a of ['left', 'right', 'up', 'down', 'jump', 'slash', 'dash']) pi.pad[a] = st[a] || (G.mode !== 'coop' && slot > 0 && pi.pad[a]);
      }
      if (G.screen === 'play') {
        for (const a of ['jump', 'slash', 'dash']) if (st[a] && !prev[a]) pi.latch[a] = true;
        if (st.start && !prev.start) this.pauseLatch = true;
      } else {
        if (st.up && !prev.up) UI.menuNav(-1); if (st.down && !prev.down) UI.menuNav(1);
        if (st.left && !prev.left) UI.menuNav(-1, true); if (st.right && !prev.right) UI.menuNav(1, true);
        if (st.jump && !prev.jump) UI.menuActivate();
        if ((st.back && !prev.back) || (st.start && !prev.start)) UI.menuBack(st.start && !prev.start);
      }
      this.padPrev[i] = st; slot++;
    }
  },
  // called once per physics step: resolve held state + consume latched presses
  step(count) {
    for (let p = 0; p < count; p++) {
      const pi = this.players[p];
      pi.left = this.held(p, 'left'); pi.right = this.held(p, 'right');
      pi.up = this.held(p, 'up'); pi.down = this.held(p, 'down');
      pi.jump = this.held(p, 'jump'); pi.slash = this.held(p, 'slash'); pi.dash = this.held(p, 'dash');
      pi.jumpP = pi.latch.jump; pi.slashP = pi.latch.slash; pi.dashP = pi.latch.dash;
      pi.latch.jump = pi.latch.slash = pi.latch.dash = false;
    }
  },
  clearLatches() { for (const pi of this.players) pi.latch.jump = pi.latch.slash = pi.latch.dash = false; this.pauseLatch = false; },
};
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches);

/* ---------- full screen (iPad Safari uses the webkit-prefixed API) ---------- */
const FS = {
  el: document.documentElement,
  standalone: !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)),
  supported() { return !!(this.el.requestFullscreen || this.el.webkitRequestFullscreen); },
  active() { return !!(document.fullscreenElement || document.webkitFullscreenElement); },
  toggle() {
    try {
      if (this.active()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else { const r = (this.el.requestFullscreen || this.el.webkitRequestFullscreen).call(this.el); if (r && r.catch) r.catch(() => {}); }
    } catch (e) { /* refused: keep playing windowed */ }
  },
};
