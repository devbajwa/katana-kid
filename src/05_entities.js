
/* =====================================================================
   GAME STATE
   ===================================================================== */
const G = {
  screen: 'title', mode: 'solo', regionId: 1, levelNum: 1, level: null, players: [], nPlayers: 1,
  time: 0, levelTime: 0, step: 0, hitstop: 0, shake: 0, flash: 0, flashCol: '#ffffff', fade: 0,
  timeBell: 0, enemyScale: 1, hazardTime: 0, attackId: 1, checkpoint: null, scrolls: [false, false, false],
  finished: false, finishT: 0, finalTime: 0, bossFight: false, bossDefeated: false, boss: null,
  hint: '', hintT: 0, toast: '', toastT: 0, wipeT: 0, crumbles: [], quality: { low: false, auto: false },
  ghostRec: null, ghostRecN: 0, ghostPlay: null, prevBest: null, result: null,
};
const lowGfx = () => Save.data.settings.lowGfx || G.quality.auto;

/* =====================================================================
   9. PHYSICS  -  axis-separated AABB vs tile grid. One-way platforms only
                  collide when falling onto them from above.
   ===================================================================== */
function moveX(e, dx) {
  const L = G.level; e.x += dx;
  const t = Math.floor(e.y / TS), b = Math.floor((e.y + e.h - 0.01) / TS);
  if (dx > 0) {
    const tx = Math.floor((e.x + e.w - 0.01) / TS);
    for (let ty = t; ty <= b; ty++) if (SOLID[tileAt(L, tx, ty)]) { e.x = tx * TS - e.w; e.vx = 0; return 1; }
  } else if (dx < 0) {
    const tx = Math.floor(e.x / TS);
    for (let ty = t; ty <= b; ty++) if (SOLID[tileAt(L, tx, ty)]) { e.x = (tx + 1) * TS; e.vx = 0; return -1; }
  }
  return 0;
}
function moveY(e, dy, drop) {
  const L = G.level, prevBottom = e.y + e.h; e.y += dy; e.onGround = false;
  const l = Math.floor(e.x / TS), r = Math.floor((e.x + e.w - 0.01) / TS);
  if (dy > 0) {
    const ty = Math.floor((e.y + e.h - 0.01) / TS), top = ty * TS;
    for (let tx = l; tx <= r; tx++) {
      const t = tileAt(L, tx, ty);
      if (SOLID[t] || (ONEWAY[t] && !drop && prevBottom <= top + 0.5)) { e.y = top - e.h; e.vy = 0; e.onGround = true; e.groundTile = t; e.groundTy = ty; return 1; }
    }
  } else if (dy < 0) {
    const ty = Math.floor(e.y / TS);
    for (let tx = l; tx <= r; tx++) if (SOLID[tileAt(L, tx, ty)]) { e.y = (ty + 1) * TS; e.vy = 0; return -1; }
  }
  return 0;
}
function touchWall(e, dir) {
  const L = G.level, tx = Math.floor((dir > 0 ? e.x + e.w + 1 : e.x - 1) / TS);
  const t = tileAt(L, tx, Math.floor((e.y + 4) / TS)), b = tileAt(L, tx, Math.floor((e.y + e.h - 4) / TS));
  return (SOLID[t] && t !== TILE.SPIKE) || (SOLID[b] && b !== TILE.SPIKE);
}
function groundAhead(e, dir) {
  const L = G.level, tx = Math.floor((dir > 0 ? e.x + e.w + 2 : e.x - 2) / TS), ty = Math.floor((e.y + e.h + 2) / TS), t = tileAt(L, tx, ty);
  return (SOLID[t] || ONEWAY[t]) && t !== TILE.SPIKE;
}

/* =====================================================================
   8. ENTITIES  -  shared shape: position, velocity, hitbox, state, update, draw.
                   Everything except the players is pooled.
   ===================================================================== */
class Entity {
  constructor() { this.active = false; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.w = 8; this.h = 8; this.state = ''; this.t = 0; this.facing = 1; }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  update(dt) {}
  draw(ctx, ox, oy) {}
}
class Pool {
  constructor(Cls, n) { this.items = []; for (let i = 0; i < n; i++) this.items.push(new Cls()); this.n = n; this.cur = 0; }
  get() {
    for (let k = 0; k < this.n; k++) {
      const i = (this.cur + k) % this.n, it = this.items[i];
      if (!it.active) { this.cur = (i + 1) % this.n; it.active = true; return it; }
    }
    return null;
  }
  clear() { for (const it of this.items) it.active = false; }
}
function onScreen(x, y, w, h, m) { return x + w > Cam.x - m && x < Cam.x + W + m && y + h > Cam.y - m && y < Cam.y + H + m; }
function frameOf(a, t) { return a.s + (a.n > 1 ? (a.once ? Math.min(a.n - 1, Math.floor(t * (a.fps || 8))) : Math.floor(t * (a.fps || 8)) % a.n) : 0); }
function drawSheet(ctx, sheet, frame, facing, footX, footY, sx, sy) {
  const fw = sheet.fw, fh = sheet.fh, row = facing < 0 ? 1 : 0;
  if (sx === undefined || (sx === 1 && sy === 1)) ctx.drawImage(sheet, frame * fw, row * fh, fw, fh, Math.round(footX - fw / 2), Math.round(footY - fh), fw, fh);
  else { const w = Math.round(fw * sx), h = Math.round(fh * sy); ctx.drawImage(sheet, frame * fw, row * fh, fw, fh, Math.round(footX - w / 2), Math.round(footY - h), w, h); }
}

/* ---------- particles: struct-of-arrays pool, no allocation at runtime ---------- */
const PFX = {
  n: 0, cur: 0,
  init(n) {
    this.n = n; this.x = new Float32Array(n); this.y = new Float32Array(n); this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.grav = new Float32Array(n); this.type = new Uint8Array(n);
  },
  spawn(type, x, y, vx, vy, life, grav) {
    const cap = lowGfx() ? Math.min(this.n, CONFIG.fx.particlesLow) : this.n;
    const i = this.cur % cap; this.cur = (this.cur + 1) % cap;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.life[i] = life; this.max[i] = life; this.grav[i] = grav || 0; this.type[i] = type;
  },
  burst(type, x, y, n, speed, life, grav, up) {
    if (lowGfx()) n = Math.ceil(n / 2);
    for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7); this.spawn(type, x, y, Math.cos(a) * s, Math.sin(a) * s - (up || 0), life * (0.6 + Math.random() * 0.4), grav); }
  },
  clear() { this.life.fill(0); },
  update(dt) {
    const x0 = Cam.x - 40, x1 = Cam.x + W + 40, y0 = Cam.y - 60, y1 = Cam.y + H + 40;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      if (this.x[i] < x0 || this.x[i] > x1 || this.y[i] < y0 || this.y[i] > y1) { this.life[i] = 0; continue; }   // cull off-screen
      this.life[i] -= dt; this.vy[i] += this.grav[i] * dt;
      if (this.type[i] === PT.PETAL || this.type[i] === PT.LEAF) this.vx[i] += Math.sin((this.life[i] + i) * 5) * 30 * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
    }
  },
  draw(ctx, ox, oy) {
    const img = ART.pfx;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      const f = Math.min(3, Math.floor((1 - this.life[i] / this.max[i]) * 4));
      ctx.drawImage(img, f * 8, this.type[i] * 8, 8, 8, Math.round(this.x[i] - 4 - ox), Math.round(this.y[i] - 4 - oy), 8, 8);
    }
  },
};

/* ---------- effects (slash arcs, alert marks, floating labels) ---------- */
class Effect extends Entity {
  init(kind, x, y, life) { this.kind = kind; this.x = x; this.y = y; this.t = 0; this.life = life; this.follow = null; this.img = null; this.facing = 1; this.flame = 0; this.scale = 1; this.vy = 0; return this; }
  update(dt) {
    this.t += dt; if (this.t >= this.life) { this.active = false; return; }
    if (this.follow) {
      if (!this.follow.active && this.follow.active !== undefined) { this.active = false; return; }
      if (this.kind === 'arc') { this.x = this.follow.cx; this.y = this.follow.y + this.follow.h - 11; }
      else { this.x = this.follow.cx; this.y = this.follow.y - 6; }
    }
    this.y += this.vy * dt;
  }
  draw(ctx, ox, oy) {
    if (this.kind === 'arc') {
      const sheet = ART.arcs[this.arc][this.flame], f = Math.min(2, Math.floor(this.t / this.life * 3)), sz = Math.round(64 * this.scale);
      ctx.drawImage(sheet, f * 64, this.facing < 0 ? 64 : 0, 64, 64, Math.round(this.x - sz / 2 - ox), Math.round(this.y - sz / 2 - oy), sz, sz);
    } else if (this.kind === 'alert') {
      ctx.drawImage(ART.props.alert, Math.round(this.x - 2 - ox), Math.round(this.y - 12 - oy - Math.min(4, this.t * 30)));
    } else if (this.kind === 'label') {
      if (this.t > this.life - 0.3 && ((this.t * 20) | 0) % 2) return;
      ctx.drawImage(this.img, Math.round(this.x - this.img.width / 2 - ox), Math.round(this.y - oy));
    }
  }
}
const Effects = {
  pool: null,
  arc(p, kind) { const e = this.pool.get(); if (!e) return; e.init('arc', p.cx, p.y + p.h - 11, kind === 'down' ? 0.3 : 0.16); e.arc = kind; e.facing = p.facing; e.follow = p; e.flame = p.powers[0] > 0 ? 1 : p.sword.arc; e.scale = p.sword.arcScale * (p.powers[6] > 0 ? CONFIG.powers.giantScale : 1); },
  alert(en) { const e = this.pool.get(); if (e) { e.init('alert', en.cx, en.y - 6, 0.6); e.follow = en; } },
  label(x, y, text, col) { const e = this.pool.get(); if (e) { e.init('label', x, y, 1.1); e.img = textImage(text, col || '#fff6e0', 1); e.vy = -18; } },
};

/* ---------- Player ---------- */
class Player extends Entity {
  constructor(idx) { super(); this.idx = idx; this.w = CONFIG.player.w; this.h = CONFIG.player.h; this.powers = new Float32Array(CONFIG.powers.names.length); this.setSword('curved'); this.reset(0, 0); }
  // per-player attack table = base attacks adjusted by the chosen sword (built once, not per swing)
  setSword(key) {
    const S = CONFIG.swords[key] || CONFIG.swords.curved, base = CONFIG.combat.attacks;
    this.sword = S; this.attacks = {};
    for (const k in base) {
      const A = Object.assign({}, base[k]);
      if (k !== 'down') { A.startup = Math.max(1, A.startup + S.startup); A.recovery = Math.max(4, A.recovery + S.recovery); A.w = Math.round(A.w * S.reach); }
      if (k === 'slash3') A.dmg += S.finisher;
      this.attacks[k] = A;
    }
  }
  reset(x, y) {
    const C = CONFIG.physics;
    this.active = true; this.x = x - this.w / 2; this.y = y - this.h; this.vx = this.vy = 0; this.facing = 1;
    this.hearts = CONFIG.player.hearts; this.powers.fill(0); this.invuln = 0; this.dashT = 0; this.dashCd = 0;
    this.airJumps = C.airJumps; this.airDashes = C.airDashes; this.airSlashes = C.airSlashMax; this.coyote = 0;
    this.jumpBuf = this.slashBuf = this.dashBuf = 0; this.wallLock = 0; this.wallLockDir = 0; this.wallDir = 0; this.lastWallDir = 0; this.wallCoyote = 0;
    this.hangT = 0; this.atk = null; this.atkKind = ''; this.atkF = 0; this.atkId = 0; this.comboStep = 0; this.comboT = 0;
    this.hurtT = 0; this.downed = false; this.dead = false; this.deadT = 0; this.reviveT = 0; this.ghostT = 0; this.farT = 0;
    this.sx = 1; this.sy = 1; this.anim = 'idle'; this.animT = 0; this.frame = 0; this.jumpCutReady = false; this.onGround = false;
    this.safeX = this.x; this.safeY = this.y; this.dropT = 0; this.sliding = false; this.wasSliding = false; this.dashId = 0; this.landT = 0; this.goldId = 0;
  }
  get alive() { return !this.downed && !this.dead; }
  maxAirJumps() { return CONFIG.physics.airJumps + (this.powers[1] > 0 ? CONFIG.powers.windExtraJumps : 0); }
  partner() { return G.nPlayers > 1 ? G.players[1 - this.idx] : null; }
  squash(sx, sy) { this.sx = sx; this.sy = sy; }
  update(dt) {
    const C = CONFIG.physics, PC = CONFIG.player, inp = Input.players[this.idx];
    this.animT += dt;
    if (this.ghostT > 0) this.ghostT -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    for (let i = 0; i < this.powers.length; i++) if (this.powers[i] > 0) this.powers[i] = Math.max(0, this.powers[i] - dt);
    const k = Math.min(1, dt * PC.squashRecover); this.sx += (1 - this.sx) * k; this.sy += (1 - this.sy) * k;
    if (this.dead) { this.deadT -= dt; if (this.deadT <= 0 && G.nPlayers === 1) Game.respawnAll(); return; }
    if (this.downed) { this.updateSpirit(dt); return; }
    if (G.finished) {
      this.vx = approach(this.vx, 0, C.groundFriction * dt); this.vy = Math.min(this.vy + C.gravity * dt, C.maxFall);
      moveX(this, this.vx * dt); moveY(this, this.vy * dt, false); this.setAnim(this.onGround ? 'victory' : 'fall'); return;
    }
    // input buffers
    this.jumpBuf = inp.jumpP ? C.jumpBuffer : this.jumpBuf - dt;
    this.slashBuf = inp.slashP ? CONFIG.combat.slashBuffer : this.slashBuf - dt;
    this.dashBuf = inp.dashP ? CONFIG.combat.dashBuffer : this.dashBuf - dt;
    this.dashCd -= dt; this.comboT -= dt; this.wallLock -= dt; this.coyote -= dt; this.wallCoyote -= dt; this.dropT -= dt; this.hurtT -= dt;
    const run = C.runSpeed * (this.powers[7] > 0 ? CONFIG.powers.swiftSpeed : 1);
    let mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (this.wallLock > 0) mx = this.wallLockDir;
    if (this.hurtT > 0) mx = 0;
    const grounded = this.onGround;
    // dash
    if (this.dashBuf > 0 && this.dashCd <= 0 && this.hurtT <= 0 && (grounded || this.airDashes > 0) && (!this.atk || this.atkKind === 'air')) {
      this.dashBuf = 0; this.dashT = C.dashTime; this.dashCd = C.dashCooldown; if (!grounded) this.airDashes--;
      if (mx) this.facing = mx; this.vy = 0; this.dashId = ++G.attackId; this.endAttack(); this.hangT = 0;
      Sound.sfx(this.powers[3] > 0 ? 'thunder' : 'dash'); this.squash(1.3, 0.8);
      PFX.burst(PT.DUST, this.cx, this.y + this.h - 2, 5, 40, 0.35, 0, 10);
    }
    if (this.dashT > 0) {
      this.dashT -= dt; this.vx = this.facing * C.dashSpeed; this.vy = 0;
      if (G.step % 2 === 0) PFX.spawn(this.powers[3] > 0 ? PT.BOLT : PT.DUST, this.cx - this.facing * 6, this.y + 6 + Math.random() * 12, -this.facing * 20, 0, 0.3, 0);
      if (this.powers[3] > 0) Combat.thunderDash(this);
      if (this.dashT <= 0) this.vx = this.facing * run;
    } else {
      if (this.atk && grounded) this.vx = approach(this.vx, 0, C.groundFriction * dt);
      else if (mx) { this.vx = approach(this.vx, mx * run, (grounded ? C.groundAccel : C.airAccel) * dt * (sgn(this.vx) === -mx ? 1.7 : 1)); if (!this.atk) this.facing = mx; }
      else this.vx = approach(this.vx, 0, (grounded ? C.groundFriction : C.airFriction) * dt);
      let g = C.gravity;
      if (this.hangT > 0) { this.hangT -= dt; g *= C.airSlashGravity; }
      this.vy += g * dt;
      // wall slide
      this.wallDir = 0;
      if (!grounded) { if (touchWall(this, 1)) this.wallDir = 1; else if (touchWall(this, -1)) this.wallDir = -1; }
      if (this.wallDir) { this.wallCoyote = C.wallCoyote; this.lastWallDir = this.wallDir; }
      this.sliding = !!this.wallDir && this.vy > 0 && this.atkKind !== 'down' && (mx === this.wallDir || (mx === 0 && this.wasSliding));
      if (this.sliding) {
        this.vy = Math.min(this.vy, C.wallSlideSpeed); this.facing = this.wallDir; this.airDashes = C.airDashes; this.airSlashes = C.airSlashMax;
        if (G.step % 6 === 0) PFX.spawn(PT.DUST, this.wallDir > 0 ? this.x + this.w : this.x, this.y + 4, -this.wallDir * 10, -10, 0.3, 0);
      }
      this.vy = Math.min(this.vy, this.atkKind === 'down' ? C.downStrikeVel : C.maxFall);
    }
    // jumping
    if (this.jumpBuf > 0 && this.hurtT <= 0) {
      if (inp.down && grounded && ONEWAY[this.groundTile]) { this.dropT = C.dropThroughTime; this.jumpBuf = 0; this.onGround = false; }
      else if (grounded || this.coyote > 0) {
        this.vy = -C.jumpVel; this.jumpBuf = 0; this.coyote = 0; this.jumpCutReady = true; this.dashT = 0;
        this.squash(CONFIG.player.squashJump[0], CONFIG.player.squashJump[1]); Sound.sfx('jump');
        PFX.burst(PT.DUST, this.cx, this.y + this.h, 4, 30, 0.3, 0, 5);
        if (this.atkKind && this.atkKind !== 'air') this.endAttack();
      } else if (this.wallCoyote > 0 && this.dashT <= 0) {
        const d = this.lastWallDir;
        this.vx = -d * C.wallJumpX; this.vy = -C.wallJumpY; this.wallLock = C.wallJumpLock; this.wallLockDir = -d; this.facing = -d;
        this.airJumps = this.maxAirJumps(); this.airDashes = C.airDashes; this.jumpBuf = 0; this.wallCoyote = 0; this.jumpCutReady = true;
        this.squash(0.8, 1.2); Sound.sfx('wjump'); this.endAttack();
        PFX.burst(PT.DUST, d > 0 ? this.x + this.w : this.x, this.cy, 6, 45, 0.35, 0, 0);
      } else if (this.airJumps > 0) {
        this.airJumps--; this.vy = -C.doubleJumpVel; this.jumpBuf = 0; this.jumpCutReady = true; this.dashT = 0; this.hangT = 0;
        this.squash(0.8, 1.2); Sound.sfx('djump'); if (this.atkKind === 'down') this.endAttack();
        PFX.burst(this.powers[1] > 0 ? PT.LEAF : PT.GLOW, this.cx, this.y + this.h, 6, 50, 0.35, 0, 0);
      }
    }
    if (this.jumpCutReady && !inp.jump && this.vy < 0) { this.vy *= C.jumpCut; this.jumpCutReady = false; }
    if (this.vy >= 0) this.jumpCutReady = false;
    // golden armor: touching enemies hurts them; swift sandals leave a trail
    if (this.powers[8] > 0) {
      if (G.step % CONFIG.powers.goldenHitEvery === 0) this.goldId = ++G.attackId;
      Combat.bodyHit(this, this.goldId, 2, 140, PT.SPARK);
      if (G.step % 5 === 0) PFX.spawn(PT.SPARK, this.x + Math.random() * this.w, this.y + Math.random() * this.h, 0, -20, 0.35, 0);
    }
    if (this.powers[7] > 0 && grounded && Math.abs(this.vx) > 60 && G.step % 4 === 0) PFX.spawn(PT.LEAF, this.cx - this.facing * 5, this.y + this.h - 3, -this.facing * 25, -15, 0.4, 0);
    // attacks
    if (this.slashBuf > 0 && this.canAttack()) this.startAttack(inp);
    this.updateAttack();
    // move + collide
    const wasGround = this.onGround, impact = this.vy;
    moveX(this, this.vx * dt);
    moveY(this, this.vy * dt, this.dropT > 0);
    if (this.onGround) {
      this.coyote = C.coyoteTime; this.airJumps = this.maxAirJumps(); this.airDashes = C.airDashes; this.airSlashes = C.airSlashMax; this.hangT = 0;
      if (!wasGround) {
        const s = clamp(impact / C.maxFall, 0, 1);
        if (s > 0.35) { this.squash(lerp(1, CONFIG.player.squashLand[0], s), lerp(1, CONFIG.player.squashLand[1], s)); PFX.burst(PT.DUST, this.cx, this.y + this.h, 5, 40, 0.35, 0, 6); Sound.sfx('land'); }
        if (this.atkKind === 'down') { this.endAttack(); G.shake = Math.max(G.shake, 1); }
      }
      const L = G.level, l = Math.floor(this.x / TS), r = Math.floor((this.x + this.w - 0.01) / TS);
      let safe = true;
      for (let tx = l; tx <= r; tx++) {
        const t = tileAt(L, tx, this.groundTy);
        if (t === TILE.CRUMBLE) { Level.touchCrumble(tx, this.groundTy); safe = false; }
        if (t === TILE.SPIKE) safe = false;
      }
      if (this.groundTile === TILE.SPIKE) this.hurt(-this.facing, 1, CONFIG.hazards.spikeKnock);
      if (safe && tileAt(L, l - 1, this.groundTy) !== TILE.SPIKE && tileAt(L, r + 1, this.groundTy) !== TILE.SPIKE) { this.safeX = this.x; this.safeY = this.y; }
    }
    const col = clamp(Math.floor(this.cx / TS), 0, G.level.w - 1);
    if (this.y > G.level.killY[col]) this.fallOut();
    this.pickAnim();
    this.wasSliding = this.sliding;
  }
  canAttack() {
    if (this.dashT > 0 || this.hurtT > 0) return false;
    if (!this.atk) return true;
    const A = this.atk;
    return this.onGround && this.atkKind.startsWith('slash') && this.atkF >= A.startup + A.active && this.atkKind !== 'slash3';
  }
  startAttack(inp) {
    const C = CONFIG.physics; let kind;
    if (!this.onGround) {
      if (inp.down) kind = 'down';
      else {
        if (this.airSlashes <= 0) return;
        this.airSlashes--; kind = 'air'; this.hangT = C.airSlashHang;
        if (this.vy > 0) this.vy = 0; else this.vy *= 0.5;
      }
      this.comboStep = 0;
    } else {
      const mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0); if (mx) this.facing = mx;
      this.comboStep = (this.comboT > 0 || this.atk) && this.comboStep < 3 ? this.comboStep + 1 : 1;
      kind = 'slash' + this.comboStep;
    }
    this.slashBuf = 0;
    const A = this.attacks[kind];
    this.atk = A; this.atkKind = kind; this.atkF = 0; this.atkId = ++G.attackId; this.animT = 0;
    if (A.lunge) this.vx = this.facing * A.lunge;
    Sound.sfx('swoosh', kind === 'slash3' ? 3 : kind === 'slash2' || kind === 'air' ? 2 : 1);
    Effects.arc(this, kind);
  }
  updateAttack() {
    if (!this.atk) return;
    const A = this.atk, f = ++this.atkF;
    if (this.atkKind === 'down' && f > A.startup) this.vy = CONFIG.physics.downStrikeVel;
    if (f > A.startup && f <= A.startup + A.active) {
      if (f === A.startup + 1 && this.powers[0] > 0 && this.atkKind !== 'down') Combat.flameTrail(this, A);
      Combat.playerAttack(this, A);
    }
    if (this.atk && f >= A.startup + A.active + A.recovery) this.endAttack();
  }
  endAttack() {
    if (!this.atk) return;
    if (this.atkKind.startsWith('slash')) this.comboT = CONFIG.combat.comboWindow;
    if (this.atkKind === 'slash3') this.comboStep = 0;
    this.atk = null; this.atkKind = '';
  }
  pogo() {
    const C = CONFIG.physics;
    this.vy = -C.pogoVel; this.airJumps = this.maxAirJumps(); this.airDashes = C.airDashes; this.airSlashes = C.airSlashMax;
    this.jumpCutReady = false; this.endAttack(); this.squash(0.8, 1.25); G.hitstop = Math.max(G.hitstop, 2);
    PFX.burst(PT.SPARK, this.cx, this.y + this.h + 4, 6, 70, 0.25, 0, 0);
  }
  refreshAir() { const C = CONFIG.physics; this.airJumps = this.maxAirJumps(); this.airDashes = C.airDashes; this.airSlashes = C.airSlashMax; this.hangT = C.airSlashHang; if (this.vy > 0) this.vy = 0; }
  hurt(dir, dmg, knock) {
    const C = CONFIG.physics, CC = CONFIG.combat;
    if (!this.alive || this.invuln > 0 || this.ghostT > 0 || G.finished) return false;
    if ((this.dashT > 0 && this.powers[3] > 0) || this.powers[8] > 0) return false;
    if (this.powers[2] > 0) {
      this.powers[2] = 0; this.invuln = 0.7; Sound.sfx('shield'); PFX.burst(PT.GLOW, this.cx, this.cy, 12, 90, 0.5, 0, 0);
      this.vx = (dir || -this.facing) * 80; this.vy = -100; return true;
    }
    this.hearts = Math.max(0, this.hearts - (dmg || 1));
    this.invuln = CONFIG.player.invuln; this.hurtT = C.hurtStun; this.endAttack(); this.dashT = 0; this.hangT = 0;
    this.vx = (dir || -this.facing) * C.hurtKnockX; this.vy = -(knock || C.hurtKnockY);
    G.hitstop = Math.max(G.hitstop, CC.hitstopHurt); Game.shake(CC.shakeHurt); Game.flash('#ff3a4a', 0.35);
    Sound.sfx('hurt'); PFX.burst(PT.SPARK, this.cx, this.cy, 6, 60, 0.3, 0, 0);
    if (this.hearts <= 0) this.knockOut();
    return true;
  }
  knockOut() {
    Sound.sfx('down'); PFX.burst(PT.SMOKE, this.cx, this.cy, 10, 50, 0.7, -20, 0); PFX.burst(PT.PETAL, this.cx, this.cy, 8, 60, 1, 40, 30);
    this.endAttack(); this.vx = 0; this.vy = 0;
    if (G.nPlayers === 1) { this.dead = true; this.deadT = CONFIG.player.deathFade; G.fadeTarget = 1; }
    else {
      this.downed = true; this.reviveT = 0; this.y -= 6;
      if (G.players.every(p => p.downed || p.dead)) { G.wipeT = CONFIG.player.deathFade; G.fadeTarget = 1; }
      else Game.toastMsg('STAND NEAR YOUR PARTNER TO REVIVE!', 2.5);
    }
  }
  updateSpirit(dt) {
    this.y += Math.sin(G.time * 3 + this.idx) * 6 * dt;
    const p = this.partner(), PC = CONFIG.player;
    if (p && p.alive && Math.abs(p.cx - this.cx) < PC.reviveRadius && Math.abs(p.cy - this.cy) < PC.reviveRadius + 8) {
      this.reviveT += dt;
      if (G.step % 4 === 0) PFX.spawn(PT.GLOW, this.cx + rnd(-8, 8), this.cy + rnd(-8, 8), 0, -30, 0.5, 0);
      if (this.reviveT >= PC.reviveTime) this.revive(PC.reviveHearts);
    } else this.reviveT = Math.max(0, this.reviveT - dt * 2);
    this.setAnim('hurt');
  }
  revive(hearts) {
    this.downed = false; this.dead = false; this.hearts = hearts; this.invuln = 1.5; this.vy = -160; this.reviveT = 0;
    Sound.sfx('revive'); PFX.burst(PT.GLOW, this.cx, this.cy, 14, 80, 0.6, 0, 0); PFX.burst(PT.PETAL, this.cx, this.cy, 8, 60, 1, 40, 20);
    Effects.label(this.cx, this.y - 12, 'REVIVED!', '#bfe6ff');
  }
  fallOut() {
    this.hearts -= CONFIG.player.fallDamage; Sound.sfx('hurt');
    this.x = this.safeX; this.y = this.safeY; this.vx = this.vy = 0; this.invuln = 1.2; this.endAttack(); this.dashT = 0;
    PFX.burst(PT.GLOW, this.cx, this.cy, 10, 60, 0.5, 0, 0);
    if (this.hearts <= 0) { this.hearts = 0; this.knockOut(); }
  }
  warpTo(x, y) {
    this.x = x - this.w / 2; this.y = y - this.h; this.vx = this.vy = 0; this.ghostT = CONFIG.player.catchupGhost; this.farT = 0;
    this.endAttack(); this.dashT = 0; PFX.burst(PT.GLOW, this.cx, this.cy, 12, 70, 0.5, 0, 0);
  }
  setAnim(a) { if (this.anim !== a) { this.anim = a; this.animT = 0; } }
  pickAnim() {
    if (this.hurtT > 0) return this.setAnim('hurt');
    if (this.dashT > 0) return this.setAnim('dash');
    if (this.atk) { this.anim = this.atkKind; return; }
    if (this.sliding) return this.setAnim('wall');
    if (!this.onGround) return this.setAnim(this.vy < 0 ? 'jump' : 'fall');
    this.setAnim(Math.abs(this.vx) > 12 ? 'run' : 'idle');
  }
  sheetFrame() {
    if (this.atk) { const A = this.atk, f = this.atkF; const a = ANIM[this.atkKind]; return a.s + (this.atkKind === 'down' ? (Math.floor(f / 4) % 2) : f <= A.startup ? 0 : f <= A.startup + A.active ? 1 : 2); }
    return frameOf(ANIM[this.anim], this.animT);
  }
  draw(ctx, ox, oy) {
    const fr = this.sheetFrame(), fx = this.cx - ox, fy = this.y + this.h - oy + 1;
    this.frame = fr;
    if (this.dead) return;
    if (this.downed) {
      ctx.globalAlpha = 0.55; drawSheet(ctx, ART.sam.ghost, fr, this.facing, fx, fy); ctx.globalAlpha = 1;
      drawSheet(ctx, ART.props.spiritFlame, (G.time * 6 | 0) % 2, 1, fx, fy - 26);
      const nl = ART.nameLabel[this.idx]; ctx.drawImage(nl, Math.round(fx - nl.width / 2), Math.round(fy - 46));
      if (this.reviveT > 0) ctx.drawImage(ART.props.ring[Math.min(11, Math.floor(this.reviveT / CONFIG.player.reviveTime * 12))], Math.round(fx - 9), Math.round(fy - 34));
      return;
    }
    if (this.onGround) ctx.drawImage(ART.props.shadow, Math.round(fx - 8), Math.round(fy - 3));
    const flicker = (this.invuln > 0 || this.ghostT > 0) && ((G.time * 20) | 0) % 2 === 0;
    if (flicker && Save.data.settings.flashes) return;
    if (this.ghostT > 0 || (flicker && !Save.data.settings.flashes)) ctx.globalAlpha = 0.5;
    const sheet = this.hurtT > CONFIG.physics.hurtStun - 0.08 && Save.data.settings.flashes ? ART.sam.flash[this.idx] : ART.sam.pl[this.idx];
    drawSheet(ctx, sheet, fr, this.facing, fx, fy, this.sx, this.sy);
    if (this.powers[8] > 0 && !(this.powers[8] < CONFIG.powers.blinkTime && ((G.time * 8) | 0) % 2)) {
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(G.time * 14); drawSheet(ctx, ART.sam.gold[this.idx], fr, this.facing, fx, fy, this.sx, this.sy);
    }
    ctx.globalAlpha = 1;
    if (this.powers[2] > 0) { const b = ART.props.shieldBubble; ctx.globalAlpha = 0.6 + Math.sin(G.time * 6) * 0.2; ctx.drawImage(b, Math.round(fx - 13), Math.round(fy - 28)); ctx.globalAlpha = 1; }
    if (G.nPlayers > 1) {   // P2's name lifts when the two labels would overlap
      const nl = ART.nameLabel[this.idx], q = this.partner();
      const lift = this.idx && q && q.alive && Math.abs(q.cx - this.cx) < (nl.width + ART.nameLabel[0].width) / 2 + 3 && Math.abs(q.y - this.y) < 12 ? 7 : 0;
      ctx.drawImage(nl, Math.round(fx - nl.width / 2), Math.round(fy - 36 - lift));
    }
  }
}

/* ---------- Enemies: soldier, archer, crow ---------- */
const WALKERS = { soldier: 1, archer: 1, shield: 1, ninja: 1 };   // ground enemies with a walk cycle
const FLYERS = { crow: 1, wisp: 1 };
const STATE_ANIM = {   // behaviour state -> animation name (static tables, no per-frame objects)
  soldier: { patrol: 'walk', chase: 'walk', alert: 'alert', windup: 'windup', attack: 'attack', recover: 'alert', stagger: 'stagger' },
  archer: { patrol: 'walk', aim: 'idle', alert: 'idle', windup: 'windup', recover: 'attack', stagger: 'stagger' },
  crow: { patrol: 'fly', return: 'fly', stagger: 'fly', windup: 'windup', swoop: 'swoop' },
  shield: { patrol: 'walk', chase: 'walk', alert: 'alert', windup: 'windup', attack: 'attack', recover: 'alert', stagger: 'stagger', block: 'block' },
  ninja: { patrol: 'walk', alert: 'idle', ready: 'idle', leap: 'jump', stagger: 'stagger' },
  wisp: { patrol: 'fly', hunt: 'fly', return: 'fly', stagger: 'fly' },
  frog: { patrol: 'sit', crouch: 'crouch', hop: 'jump', stagger: 'jump' },
  boss: { sleep: 'idle', roar: 'roar', idle: 'idle', slamWU: 'slamWU', slam: 'slam', chargeWU: 'chargeWU', charge: 'charge', stunned: 'stunned', throwWU: 'throwWU', throw: 'throw', dying: 'stunned' },
};
class Enemy extends Entity {
  constructor() { super(); this.lastHit = [0, 0]; this.thunderHit = [0, 0]; }
  init(kind, x, y) {
    const C = CONFIG.enemies[kind];
    this.kind = kind; this.C = C; this.w = C.w; this.h = C.h; this.x = x - C.w / 2; this.y = FLYERS[kind] ? y - C.h / 2 : y - C.h;
    this.hp = C.hp; this.state = 'patrol'; this.t = 0; this.vx = this.vy = 0; this.facing = -1; this.homeX = this.x; this.homeY = this.y;
    this.flashT = 0; this.lastHit[0] = this.lastHit[1] = 0; this.thunderHit[0] = this.thunderHit[1] = 0; this.cd = 0; this.animT = Math.random() * 2;
    this.phase = Math.random() * 6; this.onGround = false; this.sheet = ART[kind]; this.flashSheet = ART[kind + 'Flash']; this.anims = EN_ANIM[kind];
    this.atkHit = false; this.turnT = 0; this.thrown = false; this.throwT = 0; this.spitT = 0; this.seen = false; this.chasing = false; return this;
  }
  target() {
    let best = null, bd = 1e9;
    for (const p of G.players) { if (!p.alive || p.ghostT > 0) continue; const d = Math.abs(p.cx - this.cx) + Math.abs(p.cy - this.cy) * 1.5; if (d < bd) { bd = d; best = p; } }
    return best;
  }
  setState(s, t) { this.state = s; this.t = t || 0; this.animT = 0; }
  update(dt) {
    dt *= G.enemyScale;
    this.animT += dt; this.t -= dt; if (this.flashT > 0) this.flashT -= dt;
    const p = this.target(), C = this.C;
    const dx = p ? p.cx - this.cx : 0, dy = p ? (p.y + p.h) - (this.y + this.h) : 9999, adx = Math.abs(dx);
    if (this.kind === 'crow') return this.updateCrow(dt, p, dx, dy);
    if (this.kind === 'wisp') return this.updateWisp(dt, p, dx);
    if (this.kind === 'frog') return this.updateFrog(dt, p, dx, dy, adx);
    if (this.kind === 'ninja') return this.updateNinja(dt, p, dx, dy, adx);
    switch (this.state) {
      case 'patrol': {
        const sp = this.kind === 'archer' ? C.speed * 0.5 : C.speed;
        this.vx = this.facing * sp;
        if (!groundAhead(this, this.facing) || touchWall(this, this.facing) || (this.kind === 'archer' && Math.abs(this.x - this.homeX) > 24 && sgn(this.x - this.homeX) === this.facing)) this.facing *= -1;
        const seeY = this.kind === 'archer' ? 110 : 48;
        if (p && adx < C.sight && Math.abs(dy) < seeY && (sgn(dx) === this.facing || adx < 50)) {
          this.facing = sgn(dx) || this.facing; this.vx = 0; this.setState('alert', C.alertTime); Effects.alert(this); Sound.sfx('alert');
          if (this.kind === 'shield') Game.hintOnce('en_shield', 'Shield Guards block slashes! Hit their back or down strike');
        }
        break;
      }
      case 'alert': this.vx = 0; if (this.t <= 0) { this.setState(this.kind === 'archer' ? 'aim' : 'chase'); this.cd = 0.25; } break;
      case 'chase':
        if (!p || adx > C.sight * 1.6 || Math.abs(dy) > 96) { this.setState('patrol'); break; }
        if (this.kind === 'shield' && sgn(dx) && sgn(dx) !== this.facing) {          // slow to turn around: that is the opening
          this.vx = 0; this.turnT += dt; if (this.turnT > C.turnDelay) { this.facing = sgn(dx); this.turnT = 0; }
          break;
        }
        this.turnT = 0; this.facing = sgn(dx) || this.facing;
        if (adx < C.attackRange && Math.abs(dy) < 30) { this.vx = 0; this.setState('windup', C.windup); }
        else this.vx = groundAhead(this, this.facing) && !touchWall(this, this.facing) ? this.facing * C.chaseSpeed : 0;
        break;
      case 'block': this.vx = approach(this.vx, 0, 600 * dt); if (this.t <= 0) this.setState('windup', C.windup * 0.7); break;
      case 'aim':
        if (!p || adx > C.sight * 1.4 || Math.abs(dy) > 150) { this.setState('patrol'); break; }
        this.facing = sgn(dx) || this.facing;
        this.vx = adx < C.keepAway && groundAhead(this, -this.facing) && !touchWall(this, -this.facing) ? -this.facing * C.speed : 0;
        this.cd -= dt; if (this.cd <= 0) { this.vx = 0; this.setState('windup', C.windup); }
        break;
      case 'windup':
        this.vx = 0; if (p && this.kind === 'archer') this.facing = sgn(dx) || this.facing;
        if (this.t <= 0) {
          if (this.kind !== 'archer') { this.setState('attack', C.attackTime); this.vx = this.facing * 70; this.atkHit = false; Sound.sfx('swoosh', 0); }
          else { this.fireArrow(p); this.setState('recover', C.recover); }
        }
        break;
      case 'attack': {
        this.vx = approach(this.vx, 0, 500 * dt);
        const fx = this.facing > 0 ? this.cx + 2 : this.cx - 2 - C.reach;
        Combat.hurtPlayers(fx, this.y + 6, C.reach, 7, this.facing, 1);
        if (this.t <= 0) this.setState('recover', C.recover);
        break;
      }
      case 'recover': this.vx = approach(this.vx, 0, 500 * dt); if (this.t <= 0) { this.setState(this.kind === 'archer' ? 'aim' : 'chase'); this.cd = C.fireEvery || 0; } break;
      case 'stagger': this.vx = approach(this.vx, 0, 600 * dt); if (this.t <= 0) { this.setState(this.kind === 'archer' ? 'aim' : 'chase'); this.cd = 0.6; } break;
    }
    this.physics(dt);
  }
  physics(dt) {
    this.vy = Math.min(this.vy + CONFIG.physics.gravity * dt, CONFIG.physics.maxFall);
    moveX(this, this.vx * dt); moveY(this, this.vy * dt, false);
    if (this.y > G.level.killY[clamp(Math.floor(this.cx / TS), 0, G.level.w - 1)]) this.defeat(true);
  }
  block(p) {   // Shield Guard stops a frontal slash and pushes the player back
    Sound.sfx('block'); PFX.burst(PT.SPARK, this.cx + this.facing * 8, this.cy, 6, 90, 0.25, 0, 0);
    p.vx = -sgn(this.cx - p.cx) * this.C.blockPush; G.hitstop = Math.max(G.hitstop, 2);
    if (this.state !== 'attack' && this.state !== 'windup') this.setState('block', 0.3);
    Game.hintOnce('en_shield', 'Shield Guards block slashes! Hit their back or down strike');
  }
  updateFrog(dt, p, dx, dy, adx) {
    const C = this.C;
    switch (this.state) {
      case 'patrol':
        if (this.onGround) this.vx = approach(this.vx, 0, 600 * dt);
        if (this.t <= 0 && this.onGround) {
          const chase = !!p && adx < C.sight && Math.abs(dy) < 80;
          let dir = chase ? (sgn(dx) || 1) : Math.random() < 0.5 ? -1 : 1;
          if (!chase && Math.abs(this.x - this.homeX) > 40) dir = sgn(this.homeX - this.x);
          if (!chase && !groundAhead(this, dir)) dir = -dir;
          this.facing = dir; this.chasing = chase; this.setState('crouch', 0.22);
          if (chase && !this.seen) { this.seen = true; Effects.alert(this); Game.hintOnce('en_frog', 'Bandit Frogs hop at you. Down strike to bounce on them!'); }
        }
        break;
      case 'crouch':
        if (this.t <= 0) {
          this.vx = this.facing * C.hopVx * (this.chasing ? 1 : 0.55); this.vy = -C.hopVy * (this.chasing ? 1 : 0.8); this.onGround = false; this.setState('hop');
          if (onScreen(this.x, this.y, this.w, this.h, 0)) Sound.sfx('hop');
        }
        break;
      case 'hop':
        if (this.onGround && this.t < -0.05) { this.vx = 0; this.setState('patrol', C.rest * (0.7 + Math.random() * 0.6)); PFX.burst(PT.DUST, this.cx, this.y + this.h, 3, 30, 0.3, 0, 4); }
        break;
      case 'stagger': this.vx = approach(this.vx, 0, 500 * dt); if (this.t <= 0) this.setState('patrol', 0.4); break;
    }
    if (this.state !== 'stagger') Combat.hurtPlayers(this.x + 2, this.y + 2, this.w - 4, this.h - 2, this.facing, 1);
    this.physics(dt);
  }
  updateNinja(dt, p, dx, dy, adx) {
    const C = this.C;
    if (this.throwT > 0) this.throwT -= dt;
    switch (this.state) {
      case 'patrol':
        this.vx = this.facing * C.speed * 0.5;
        if (!groundAhead(this, this.facing) || touchWall(this, this.facing) || (Math.abs(this.x - this.homeX) > 40 && sgn(this.x - this.homeX) === this.facing)) this.facing *= -1;
        if (p && adx < C.sight && Math.abs(dy) < 120) {
          this.facing = sgn(dx) || this.facing; this.vx = 0; this.setState('alert', C.alertTime); Effects.alert(this); Sound.sfx('alert');
          Game.hintOnce('en_ninja', 'Shadow Ninjas throw stars. Slash them back!');
        }
        break;
      case 'alert': this.vx = 0; if (this.t <= 0) this.setState('ready', 0.15); break;
      case 'ready':
        this.vx = approach(this.vx, 0, 600 * dt);
        if (p) this.facing = sgn(dx) || this.facing;
        if (!p || adx > C.sight * 1.5 || Math.abs(dy) > 160) { this.setState('patrol'); break; }
        if (this.t <= 0 && this.onGround) {
          let dir = adx < 70 ? -this.facing : Math.random() < 0.5 ? this.facing : 0;
          if (dir && (!groundAhead(this, dir) || touchWall(this, dir))) dir = 0;
          this.vx = dir * C.leapVx; this.vy = -C.leapVy; this.onGround = false; this.thrown = false; this.setState('leap');
        }
        break;
      case 'leap':
        if (p) this.facing = sgn(dx) || this.facing;
        if (!this.thrown && this.vy > -40) { this.thrown = true; this.throwT = 0.25; this.throwStar(p); }
        if (this.onGround && this.t < -0.1) this.setState('ready', C.throwEvery);
        break;
      case 'stagger': this.vx = approach(this.vx, 0, 600 * dt); if (this.t <= 0) this.setState('ready', 0.5); break;
    }
    this.physics(dt);
  }
  throwStar(p) {
    const pr = Projectiles.get(); if (!pr) return;
    const sx = this.cx + this.facing * 6, sy = this.y + 8, C = this.C;
    let ax = this.facing, ay = 0;
    if (p) { const ddx = p.cx - sx, ddy = p.cy - sy, d = Math.hypot(ddx, ddy) || 1; ay = clamp(ddy / d, -0.8, 0.8); ax = this.facing * Math.sqrt(1 - ay * ay); }
    pr.init('star', sx, sy, ax * C.starSpeed, ay * C.starSpeed, 'enemy'); Sound.sfx('star');
  }
  updateWisp(dt, p, dx) {
    const C = this.C;
    this.phase += dt; if (this.spitT > 0) this.spitT -= dt;
    switch (this.state) {
      case 'patrol':
        this.x = this.homeX + Math.sin(this.phase * 0.7) * 20; this.y = this.homeY + Math.sin(this.phase * 2.2) * C.bobAmp;
        this.facing = Math.cos(this.phase * 0.7) >= 0 ? 1 : -1;
        if (p && Math.abs(dx) < C.sight && Math.abs(p.cy - this.cy) < 120) {
          this.setState('hunt'); this.cd = 1.2; this.vx = this.vy = 0; Effects.alert(this); Sound.sfx('spook');
          Game.hintOnce('en_wisp', 'Lantern Spooks float through walls. Slash them!');
        }
        break;
      case 'hunt': {
        if (!p || Math.abs(dx) > C.sight * 1.8) { this.setState('return'); break; }
        const ddx = p.cx - this.cx, ddy = p.y - 16 - this.cy, d = Math.hypot(ddx, ddy) || 1;
        this.vx = approach(this.vx, ddx / d * C.drift, 70 * dt); this.vy = approach(this.vy, ddy / d * C.drift, 70 * dt);
        this.x += this.vx * dt; this.y += (this.vy + Math.sin(this.phase * 3) * 12) * dt; this.facing = sgn(ddx) || this.facing;
        this.cd -= dt;
        if (this.cd <= 0 && d < C.sight) {
          this.cd = C.fireEvery; this.spitT = 0.4;
          const ex = p.cx - this.cx, ey = p.cy - this.cy - 4, ed = Math.hypot(ex, ey) || 1;
          const pr = Projectiles.get(); if (pr) { pr.init('ember', this.cx, this.cy + 4, ex / ed * C.emberSpeed, ey / ed * C.emberSpeed, 'enemy'); Sound.sfx('ember'); }
        }
        break;
      }
      case 'return': {
        const tx = this.homeX + Math.sin(this.phase * 0.7) * 20, ty = this.homeY, ddx = tx - this.x, ddy = ty - this.y, d = Math.hypot(ddx, ddy);
        if (d < 3) { this.setState('patrol'); break; }
        this.x += ddx / d * C.drift * dt; this.y += ddy / d * C.drift * dt; this.facing = sgn(ddx) || this.facing;
        if (p && Math.abs(dx) < C.sight * 0.8) this.setState('hunt');
        break;
      }
      case 'stagger':
        this.x += this.vx * dt; this.y += this.vy * dt; this.vx = approach(this.vx, 0, 300 * dt); this.vy = approach(this.vy, 0, 300 * dt);
        if (this.t <= 0) this.setState('hunt');
        break;
    }
    if (this.state !== 'stagger') Combat.hurtPlayers(this.x + 2, this.y + 2, this.w - 4, this.h - 4, sgn(this.vx) || this.facing, 1);
  }
  fireArrow(p) {
    const pr = Projectiles.get(); if (!pr) return;
    const sx = this.cx + this.facing * 8, sy = this.y + 9, C = this.C;
    let ax = this.facing, ay = 0;
    if (p) { const ddx = p.cx - sx, ddy = p.cy - sy, d = Math.hypot(ddx, ddy) || 1; ay = clamp(ddy / d, -0.55, 0.55); ax = this.facing * Math.sqrt(1 - ay * ay); }
    pr.init('arrow', sx, sy, ax * C.arrowSpeed, ay * C.arrowSpeed, 'enemy'); Sound.sfx('arrow');
  }
  updateCrow(dt, p, dx, dy) {
    const C = this.C;
    switch (this.state) {
      case 'patrol':
        this.phase += dt;
        this.x = this.homeX + Math.sin(this.phase * C.patrolSpeed) * C.patrolRange;
        this.y = this.homeY + Math.sin(this.phase * 3) * C.waveAmp;
        this.facing = Math.cos(this.phase * C.patrolSpeed) >= 0 ? 1 : -1;
        this.cd -= dt;
        if (p && Math.abs(dx) < C.sight && dy > -10 && dy < 150 && this.cd <= 0) { this.setState('windup', C.windup); this.facing = sgn(dx) || 1; Sound.sfx('caw'); Effects.alert(this); }
        break;
      case 'windup':
        this.y -= 12 * dt; if (p) this.facing = sgn(dx) || this.facing;
        if (this.t <= 0) {
          if (p) { const ddx = p.cx - this.cx, ddy = p.cy - this.cy, d = Math.hypot(ddx, ddy) || 1; this.vx = ddx / d * C.swoopSpeed; this.vy = ddy / d * C.swoopSpeed; }
          else { this.vx = this.facing * C.swoopSpeed; this.vy = C.swoopSpeed * 0.5; }
          this.setState('swoop', C.swoopTime);
        }
        break;
      case 'swoop':
        this.x += this.vx * dt; this.y += this.vy * dt; this.facing = sgn(this.vx) || this.facing;
        Combat.hurtPlayers(this.x, this.y, this.w, this.h, sgn(this.vx), 1);
        if (this.t <= 0 || SOLID[tileAt(G.level, Math.floor(this.cx / TS), Math.floor(this.cy / TS))]) this.setState('return');
        break;
      case 'stagger': this.x += this.vx * dt; this.vx = approach(this.vx, 0, 300 * dt); if (this.t <= 0) this.setState('return'); break;
      case 'return': {
        const tx = this.homeX + Math.sin(this.phase * C.patrolSpeed) * C.patrolRange, ty = this.homeY;
        const ddx = tx - this.x, ddy = ty - this.y, d = Math.hypot(ddx, ddy);
        if (d < 3) { this.setState('patrol'); this.cd = C.cooldown; break; }
        this.x += ddx / d * C.returnSpeed * dt; this.y += ddy / d * C.returnSpeed * dt; this.facing = sgn(ddx) || this.facing;
        break;
      }
    }
  }
  hurt(dmg, dir, kb) {
    this.hp -= dmg; this.flashT = 0.12;
    PFX.burst(PT.SPARK, this.cx, this.cy, 5, 80, 0.25, 0, 0); PFX.burst(PT.INK, this.cx, this.cy, 3, 50, 0.4, 200, 30);
    if (this.hp <= 0) { this.defeat(); return; }
    Sound.sfx('hit');
    this.vx = dir * kb; if (this.kind !== 'crow') this.vy = this.kind === 'wisp' ? -30 : -60; this.facing = -dir || this.facing;
    this.setState('stagger', this.C.stagger || 0.3);
  }
  defeat(silent) {
    this.active = false;
    if (silent) return;
    Sound.sfx('kill'); Game.shake(CONFIG.combat.shakeHit);
    PFX.burst(PT.SMOKE, this.cx, this.cy, 10, 60, 0.7, -30, 10); PFX.burst(PT.INK, this.cx, this.cy, 6, 90, 0.5, 250, 40); PFX.burst(PT.PETAL, this.cx, this.cy, 8, 70, 1.2, 40, 40);
  }
  draw(ctx, ox, oy) {
    const a = this.anims;
    let name = STATE_ANIM[this.kind][this.state] || (FLYERS[this.kind] ? 'fly' : 'walk');
    if (this.kind === 'archer' && this.state === 'aim' && Math.abs(this.vx) > 1) name = 'walk';
    else if (this.kind === 'ninja' && this.throwT > 0) name = 'throw';
    else if (this.kind === 'ninja' && this.state === 'patrol' && Math.abs(this.vx) < 1) name = 'idle';
    else if (this.kind === 'wisp' && this.spitT > 0) name = 'spit';
    const an = a[name];
    let fr = frameOf(an, this.animT);
    if ((this.kind === 'soldier' || this.kind === 'shield') && this.state === 'windup') fr = an.s + (this.t < this.C.windup * 0.5 ? 1 : 0);
    if ((this.state === 'patrol' || this.state === 'chase') && Math.abs(this.vx) < 1 && WALKERS[this.kind]) fr = an.s;
    const sheet = this.flashT > 0 ? this.flashSheet : this.sheet;
    const footY = this.kind === 'crow' ? this.cy + 12 : this.kind === 'wisp' ? this.cy + 17 : this.y + this.h + 1;
    if (this.onGround && !FLYERS[this.kind]) ctx.drawImage(ART.props.shadow, Math.round(this.cx - 8 - ox), Math.round(this.y + this.h - 2 - oy));
    drawSheet(ctx, sheet, fr, this.facing, this.cx - ox, footY - oy);
  }
}

/* ---------- Red Oni Gatekeeper ---------- */
class Boss extends Entity {
  constructor() { super(); this.lastHit = [0, 0]; this.thunderHit = [0, 0]; }
  init(x, y, coop) {
    const C = CONFIG.boss;
    this.active = true; this.w = C.w; this.h = C.h; this.x = x - C.w / 2; this.y = y - C.h; this.homeX = this.x; this.homeY = this.y;
    this.maxHp = Math.round(C.hp * (coop ? C.coopScale : 1)); this.hp = this.maxHp; this.vx = this.vy = 0; this.facing = -1;
    this.state = 'sleep'; this.t = 0; this.animT = 0; this.flashT = 0; this.phase = 1; this.queue = []; this.last = ''; this.hpShown = this.hp;
    this.lastHit[0] = this.lastHit[1] = 0; this.thunderHit[0] = this.thunderHit[1] = 0; this.dying = 0; this.rng = mulberry32(99);
    return this;
  }
  get spd() { return this.phase === 2 ? CONFIG.boss.phase2Speed : 1; }
  setState(s, t) { this.state = s; this.t = t || 0; this.animT = 0; this.didAct = false; }
  target() { let best = null, bd = 1e9; for (const p of G.players) { if (!p.alive) continue; const d = Math.abs(p.cx - this.cx); if (d < bd) { bd = d; best = p; } } return best; }
  wake() { this.setState('roar', 1.3); Sound.sfx('roar'); Game.shake(CONFIG.combat.shakeBoss); }
  update(dt) {
    dt *= G.enemyScale;
    const C = CONFIG.boss, sp = this.spd;
    this.animT += dt; this.t -= dt; if (this.flashT > 0) this.flashT -= dt;
    this.hpShown = approach(this.hpShown, this.hp, dt * 20);
    const p = this.target();
    switch (this.state) {
      case 'sleep': this.vx = 0; break;
      case 'roar': this.vx = 0; if (this.t <= 0) this.setState('idle', C.idleTime / sp); break;
      case 'idle':
        if (p) { this.facing = sgn(p.cx - this.cx) || this.facing; this.vx = Math.abs(p.cx - this.cx) > 50 ? this.facing * C.walkSpeed * sp : 0; }
        if (this.t <= 0) this.nextAttack();
        break;
      case 'slamWU': this.vx = 0; if (this.t <= 0) this.setState('slam', C.slamTime); break;
      case 'slam':
        if (!this.didAct) {
          this.didAct = true; Sound.sfx('slam'); Game.shake(CONFIG.combat.shakeBoss); Game.flash('#ffffff', 0.2);
          const fy = this.y + this.h;
          for (const d of [-1, 1]) { const s = Projectiles.get(); if (s) s.init('shock', this.cx + d * 22, fy, d * C.shockSpeed * (this.phase === 2 ? 1.2 : 1), 0, 'enemy'); }
          PFX.burst(PT.ROCK, this.cx + this.facing * 26, fy - 2, 10, 90, 0.6, 400, 80); PFX.burst(PT.DUST, this.cx + this.facing * 26, fy - 2, 8, 70, 0.5, 0, 20);
        }
        if (this.t > C.slamTime - 0.15) Combat.hurtPlayers(this.facing > 0 ? this.cx + 10 : this.cx - 44, this.y + this.h - 22, 34, 22, this.facing, 1);
        if (this.t <= 0) this.after(C.recover);
        break;
      case 'chargeWU':
        this.vx = 0; if (p) this.facing = sgn(p.cx - this.cx) || this.facing;
        if (G.step % 4 === 0) PFX.spawn(PT.DUST, this.cx - this.facing * 14, this.y + this.h - 2, -this.facing * 40, -20, 0.4, 0);
        if (this.t <= 0) { this.setState('charge', 3); Sound.sfx('roar'); }
        break;
      case 'charge':
        this.vx = this.facing * C.chargeSpeed * sp;
        if (G.step % 3 === 0) PFX.spawn(PT.DUST, this.cx - this.facing * 14, this.y + this.h - 2, -this.facing * 30, -15, 0.4, 0);
        Combat.hurtPlayers(this.x, this.y + 6, this.w, this.h - 6, this.facing, 1);
        break;
      case 'stunned': this.vx = approach(this.vx, 0, 400 * dt); if (this.t <= 0) this.after(0.2); break;
      case 'throwWU': this.vx = 0; if (p) this.facing = sgn(p.cx - this.cx) || this.facing; if (this.t <= 0) this.setState('throw', 0.5); break;
      case 'throw':
        if (!this.didAct) {
          this.didAct = true; Sound.sfx('swoosh', 3);
          const n = this.phase === 2 ? 2 : 1;
          for (let k = 0; k < n; k++) {
            const b = Projectiles.get(); if (!b) break;
            const tx = p ? p.cx + (k ? -this.facing * 50 : 0) : this.cx + this.facing * 100, ty = p ? p.y + p.h - 6 : this.y + this.h - 6;
            const sx = this.cx + this.facing * 6, sy = this.y - 6, T = C.boulderFlight * (k ? 1.2 : 1), g = 500;
            b.init('boulder', sx, sy, (tx - sx) / T, (ty - sy) / T - 0.5 * g * T, 'enemy');
          }
        }
        if (this.t <= 0) this.after(C.recover);
        break;
      case 'dying':
        this.vx = 0; this.dying += dt;
        if (G.step % 5 === 0) { PFX.burst(PT.SMOKE, this.x + Math.random() * this.w, this.y + Math.random() * this.h, 3, 40, 0.6, -20, 0); Game.shake(2); }
        if (this.dying > 1.6) this.explode();
        break;
    }
    this.vy = Math.min(this.vy + CONFIG.physics.gravity * dt, CONFIG.physics.maxFall);
    const hit = moveX(this, this.vx * dt);
    moveY(this, this.vy * dt, true);
    const A = G.level.arena;
    if (A) { if (this.x < A.x0 + 3 * TS) { this.x = A.x0 + 3 * TS; if (this.state === 'charge') this.hitWall(); } if (this.x + this.w > A.x1 - 2 * TS) { this.x = A.x1 - 2 * TS - this.w; if (this.state === 'charge') this.hitWall(); } }
    if (hit && this.state === 'charge') this.hitWall();
  }
  hitWall() {
    if (this.state !== 'charge') return;
    this.setState('stunned', CONFIG.boss.stunTime / (this.phase === 2 ? 1.2 : 1)); this.vx = -this.facing * 60;
    Sound.sfx('boulder'); Game.shake(CONFIG.combat.shakeBoss);
    PFX.burst(PT.ROCK, this.cx + this.facing * 20, this.y + 10, 10, 100, 0.7, 400, 40);
  }
  nextAttack() {
    if (!this.queue.length) {
      const opts = ['slamWU', 'chargeWU', 'throwWU'].filter(o => o !== this.last);
      const first = opts[(this.rng() * opts.length) | 0];
      this.queue.push(first);
      if (this.phase === 2) { const combos = { slamWU: 'throwWU', chargeWU: 'slamWU', throwWU: 'chargeWU' }; this.queue.push(combos[first]); }
    }
    const s = this.queue.shift(); this.last = s;
    const C = CONFIG.boss, sp = this.spd;
    this.setState(s, (s === 'slamWU' ? C.slamWindup : s === 'chargeWU' ? C.chargeWindup : C.throwWindup) / sp);
  }
  after(rest) { if (this.queue.length) this.nextAttack(); else this.setState('idle', (CONFIG.boss.idleTime + rest) / this.spd); }
  hurt(dmg, dir) {
    if (this.state === 'dying' || this.state === 'sleep') return;
    this.hp -= dmg; this.flashT = 0.1; Sound.sfx('hit');
    PFX.burst(PT.SPARK, this.cx - dir * 10, this.cy, 6, 90, 0.3, 0, 0); PFX.burst(PT.INK, this.cx, this.cy, 2, 60, 0.4, 200, 30);
    if (this.hp <= 0) { this.hp = 0; this.setState('dying'); this.dying = 0; this.queue.length = 0; Sound.sfx('roar'); Game.flash('#ffffff', 0.5); return; }
    if (this.phase === 1 && this.hp <= this.maxHp / 2) {
      this.phase = 2; this.queue.length = 0; this.setState('roar', 1.1); Sound.sfx('roar'); Game.shake(CONFIG.combat.shakeBoss); Game.flash('#ff6040', 0.35);
      Game.toastMsg('THE ONI IS ENRAGED!', 2);
    }
  }
  explode() {
    this.active = false; G.bossDefeated = true; Sound.sfx('kill'); Sound.sfx('slam'); Game.shake(8); Game.flash('#ffffff', 0.7);
    PFX.burst(PT.SMOKE, this.cx, this.cy, 30, 120, 1.0, -30, 0); PFX.burst(PT.INK, this.cx, this.cy, 16, 140, 0.8, 250, 60); PFX.burst(PT.PETAL, this.cx, this.cy, 30, 120, 2, 30, 60);
    const s = Pickups.get(); if (s) s.init('shard', this.cx, this.y + this.h - 12);
    Sound.playMusic(REGIONS[0].music);
  }
  draw(ctx, ox, oy) {
    const a = EN_ANIM.boss;
    const an = this.state === 'idle' && Math.abs(this.vx) > 1 ? a.walk : a[STATE_ANIM.boss[this.state]] || a.idle;
    const fr = frameOf(an, this.animT);
    let jx = 0;
    if (this.state === 'slamWU' || this.state === 'chargeWU' || this.state === 'throwWU' || this.state === 'dying') jx = ((G.step >> 1) % 2) ? 1 : -1;
    const warn = (this.state.endsWith('WU') && ((this.t * 10) | 0) % 2 === 0);
    const sheet = this.flashT > 0 || (warn && Save.data.settings.flashes && this.t < 0.35) ? ART.bossFlash : ART.boss;
    drawSheet(ctx, sheet, fr, this.facing, this.cx - ox + jx, this.y + this.h - oy + 1);
    if (this.state === 'stunned') drawSheet(ctx, ART.props.dizzy, (G.step >> 3) % 2, 1, this.cx - ox, this.y - oy - 8);
    if (this.state.endsWith('WU')) ctx.drawImage(ART.props.alert, Math.round(this.cx - ox - 2), Math.round(this.y - oy - 30));
  }
}

/* ---------- Projectiles: arrows, boulders, shockwaves, flame-blade fire ---------- */
const PROJ_SIZE = { arrow: [10, 3, 4], star: [7, 7, 4], ember: [8, 8, 3.5], boulder: [12, 12, 5], shock: [14, 14, 3], fire: [12, 12, 0.6] };   // w, h, lifetime
class Projectile extends Entity {
  constructor() { super(); this.lastHit = new Set(); }
  init(kind, x, y, vx, vy, owner) {
    this.kind = kind; this.vx = vx; this.vy = vy; this.owner = owner; this.t = 0; this.lastHit.clear(); this.pIdx = -1;
    const S = PROJ_SIZE[kind];
    this.w = S[0]; this.h = S[1]; this.life = S[2]; this.x = x - this.w / 2; this.y = kind === 'shock' ? y - this.h : y - this.h / 2;
    this.facing = vx < 0 ? -1 : 1; return this;
  }
  update(dt) {
    if (this.owner === 'enemy') dt *= G.enemyScale;
    this.t += dt;
    if (this.t > this.life || !onScreen(this.x, this.y, this.w, this.h, 260)) { this.active = false; return; }
    const L = G.level;
    switch (this.kind) {
      case 'arrow': case 'star':
        this.x += this.vx * dt; this.y += this.vy * dt; this.facing = this.vx < 0 ? -1 : 1;
        if (SOLID[tileAt(L, Math.floor((this.cx + this.facing * 4) / TS), Math.floor(this.cy / TS))]) { PFX.burst(PT.WOOD, this.cx, this.cy, 3, 40, 0.3, 200, 20); this.active = false; return; }
        if (this.owner === 'enemy') { if (Combat.hurtPlayers(this.x, this.y - 1, this.w, this.h + 2, this.facing, 1)) this.active = false; }
        else Combat.projectileHitsEnemies(this, CONFIG.combat.deflectDmg, true);
        break;
      case 'ember':
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (G.step % 5 === 0) PFX.spawn(PT.GLOW, this.cx, this.cy, 0, -10, 0.3, 0);
        if (SOLID[tileAt(L, Math.floor(this.cx / TS), Math.floor(this.cy / TS))] || Combat.hurtPlayers(this.x, this.y, this.w, this.h, sgn(this.vx), 1)) this.pop();
        break;
      case 'boulder':
        this.vy += 500 * dt; this.x += this.vx * dt; this.y += this.vy * dt;
        if (SOLID[tileAt(L, Math.floor(this.cx / TS), Math.floor((this.y + this.h) / TS))] || SOLID[tileAt(L, Math.floor((this.cx + this.facing * 6) / TS), Math.floor(this.cy / TS))]) { this.shatter(true); return; }
        if (Combat.hurtPlayers(this.x, this.y, this.w, this.h, this.facing, 1)) this.shatter(false);
        break;
      case 'shock':
        this.x += this.vx * dt;
        if (touchWall(this, this.facing) || !groundAhead(this, this.facing)) { PFX.burst(PT.DUST, this.cx, this.y + this.h, 5, 40, 0.4, 0, 10); this.active = false; return; }
        if (G.step % 3 === 0) PFX.spawn(PT.ROCK, this.cx, this.y + this.h - 2, rnd(-20, 20), -60, 0.4, 300);
        Combat.hurtPlayers(this.x + 2, this.y + 3, this.w - 4, this.h - 3, this.facing, 1);
        break;
      case 'fire':
        this.y -= 10 * dt;
        if (G.step % 4 === 0) PFX.spawn(PT.FIRE, this.cx + rnd(-4, 4), this.cy, 0, -30, 0.4, 0);
        Combat.projectileHitsEnemies(this, 1, false);
        break;
    }
  }
  pop() { this.active = false; PFX.burst(PT.GLOW, this.cx, this.cy, 6, 50, 0.35, 0, 0); }
  shatter(hitGround) {
    this.active = false; Sound.sfx(hitGround ? 'boulder' : 'break'); Game.shake(2);
    PFX.burst(PT.ROCK, this.cx, this.cy, 10, 100, 0.6, 400, 60); PFX.burst(PT.DUST, this.cx, this.cy, 5, 50, 0.5, 0, 0);
  }
  draw(ctx, ox, oy) {
    const P = ART.props;
    switch (this.kind) {
      case 'arrow': drawSheet(ctx, this.owner === 'enemy' ? P.arrow : P.arrowGlow, 0, this.facing, this.cx - ox, this.y + 4 - oy); break;
      case 'star': drawSheet(ctx, P.star, Math.floor(this.t * 16) % 2, 1, this.cx - ox, this.y + this.h + 1 - oy); break;
      case 'ember': drawSheet(ctx, P.ember, Math.floor(this.t * 8) % 2, 1, this.cx - ox, this.y + this.h + 1 - oy); break;
      case 'boulder': drawSheet(ctx, P.boulder, Math.floor(this.t * 12) % 4, this.facing, this.cx - ox, this.y + this.h + 2 - oy); break;
      case 'shock': drawSheet(ctx, P.shock, Math.floor(this.t * 14) % 3, this.facing, this.cx - ox, this.y + this.h + 1 - oy); break;
      case 'fire': drawSheet(ctx, P.fire, Math.floor(this.t * 14) % 3, 1, this.cx - ox, this.y + this.h + 1 - oy); break;
    }
  }
}

/* ---------- Pickups: power-up orbs, scrolls, the sword shard ---------- */
class Pickup extends Entity {
  init(kind, x, y, ptype, idx) {
    this.kind = kind; this.ptype = ptype || 0; this.idx = idx || 0; this.w = 12; this.h = 12; this.x = x - 6; this.y = y - 6; this.baseY = this.y;
    this.taken = false; this.respawnT = 0; this.t = Math.random() * 6; return this;
  }
  update(dt) {
    this.t += dt;
    this.y = this.baseY + Math.sin(this.t * 3) * 2;
    if (this.taken) { this.respawnT -= dt; if (this.respawnT <= 0) { this.taken = false; PFX.burst(PT.GLOW, this.cx, this.cy, 6, 40, 0.4, 0, 0); } return; }
    for (const p of G.players) {
      if (!p.alive || !overlap(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) continue;
      this.collect(p); break;
    }
  }
  collect(p) {
    if (this.kind === 'orb') {
      const t = this.ptype, PW = CONFIG.powers;
      if (t === 4) { G.timeBell = PW.duration[4]; Sound.sfx('bell'); }
      else if (t === 5) { p.hearts = Math.min(CONFIG.player.hearts, p.hearts + PW.peachHearts); Sound.sfx('heal'); PFX.burst(PT.PETAL, p.cx, p.cy, 10, 60, 0.8, 0, 20); }
      else { p.powers[t] = PW.duration[t]; Sound.sfx(t === 8 ? 'golden' : 'power'); }
      if (t === 1) p.airJumps = p.maxAirJumps();
      this.taken = true; this.respawnT = PW.orbRespawn;
      PFX.burst(PT.GLOW, this.cx, this.cy, 12, 80, 0.5, 0, 0);
      Effects.label(this.cx, this.y - 10, PW.names[t], PW.colors[t]);
      Game.hintOnce('pw' + t, PW.names[t] + ': ' + PW.hints[t]);
    } else if (this.kind === 'scroll') {
      G.scrolls[this.idx] = true; this.active = false; Sound.sfx('scroll');
      PFX.burst(PT.GLOW, this.cx, this.cy, 10, 60, 0.5, 0, 0);
      Effects.label(this.cx, this.y - 10, 'SCROLL ' + G.scrolls.filter(Boolean).length + '/3', '#f2c14e');
    } else if (this.kind === 'shard') {
      this.active = false; Sound.sfx('shard'); PFX.burst(PT.SHARD, this.cx, this.cy, 20, 100, 1, 0, 0);
      Game.finishLevel();
    }
  }
  draw(ctx, ox, oy) {
    const P = ART.props, x = this.cx - ox, y = this.y + this.h - oy;
    if (this.kind === 'orb') { if (this.taken) return; drawSheet(ctx, P.orbs[this.ptype], Math.floor(this.t * 6) % 4, 1, x, y + 3); }
    else if (this.kind === 'scroll') drawSheet(ctx, P.scroll, Math.floor(this.t * 3) % 2, 1, x, y);
    else if (this.kind === 'shard') drawSheet(ctx, P.shard, Math.floor(this.t * 4) % 2, 1, x, y + 3);
  }
}
const Enemies = new Pool(Enemy, 64), Projectiles = new Pool(Projectile, 64), Pickups = new Pool(Pickup, 48);
Effects.pool = new Pool(Effect, 64);
