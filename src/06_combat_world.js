
/* =====================================================================
   10. COMBAT  -  attack hitboxes are separate from body hurtboxes.
       Every target remembers the last attack id that hit it, so one swing
       hits each target once.
   ===================================================================== */
const Combat = {
  playerAttack(p, A) {
    const CC = CONFIG.combat, isDown = p.atkKind === 'down', feet = p.y + p.h;
    const gs = p.powers[6] > 0 ? CONFIG.powers.giantScale : 1, aw = Math.round(A.w * gs), ah = Math.round(A.h * gs);   // Giant Blade grows the box
    const hx = isDown ? p.cx - aw / 2 : p.facing > 0 ? p.cx + A.ox : p.cx - A.ox - aw, hy = feet + A.oy - (isDown ? 0 : (ah - A.h) / 2);
    const dmg = A.dmg + (p.powers[0] > 0 ? CC.flameBonus : 0);
    let landed = false, pogo = false;
    for (const e of Enemies.items) {
      if (!e.active || e.lastHit[p.idx] === p.atkId || !overlap(hx, hy, aw, ah, e.x, e.y, e.w, e.h)) continue;
      e.lastHit[p.idx] = p.atkId;
      if (e.kind === 'shield' && !isDown && e.state !== 'stagger' && sgn(p.cx - e.cx) === e.facing) { e.block(p); continue; }
      e.hurt(dmg, isDown ? (sgn(e.cx - p.cx) || p.facing) : p.facing, A.kb);
      landed = true; if (isDown) pogo = true;
    }
    const b = G.boss;
    if (b && b.active && b.lastHit[p.idx] !== p.atkId && overlap(hx, hy, aw, ah, b.x, b.y, b.w, b.h)) {
      b.lastHit[p.idx] = p.atkId; b.hurt(dmg, p.facing); landed = true; if (isDown) pogo = true;
    }
    for (const pr of Projectiles.items) {
      if (!pr.active || pr.owner !== 'enemy' || !overlap(hx, hy, aw, ah, pr.x - 2, pr.y - 3, pr.w + 4, pr.h + 6)) continue;
      if (pr.kind === 'ember') { pr.pop(); landed = true; if (isDown) pogo = true; }
      else if (pr.kind === 'arrow' || pr.kind === 'star') {
        pr.owner = 'player'; pr.pIdx = p.idx; pr.t = 0; pr.lastHit.clear();
        pr.vx = (isDown ? -sgn(pr.vx) : p.facing) * CC.deflectSpeed; pr.vy = isDown ? -80 : -12;
        Sound.sfx('clang'); PFX.burst(PT.SPARK, pr.cx, pr.cy, 8, 110, 0.3, 0, 0); G.hitstop = Math.max(G.hitstop, 3); landed = true;
        Game.hintOnce('deflect', 'Nice! Deflected arrows hit enemies');
      } else if (pr.kind === 'boulder') { pr.shatter(false); landed = true; if (isDown) pogo = true; }
    }
    for (const ln of G.level.lanterns) {
      if (ln.lastHit === p.atkId || !overlap(hx, hy, aw, ah, ln.x - 7, ln.y - 10, 14, 20)) continue;
      ln.lastHit = p.atkId; ln.hitT = 0.25; Sound.sfx('lantern'); PFX.burst(PT.GLOW, ln.x, ln.y, 8, 60, 0.4, 0, 0);
      if (isDown) pogo = true; else if (!p.onGround) p.refreshAir();
    }
    if (isDown && !pogo) {
      const L = G.level, y0 = Math.floor(hy / TS), y1 = Math.floor((hy + ah) / TS);
      for (let ty = y0; ty <= y1 && !pogo; ty++) for (let tx = Math.floor(hx / TS); tx <= Math.floor((hx + aw) / TS); tx++) if (tileAt(L, tx, ty) === TILE.SPIKE) { pogo = true; break; }
      for (const lg of L.logs) if (!pogo && overlap(hx, hy, aw, ah, lg.ex - 16, lg.ey - 6, 32, 12)) pogo = true;
    }
    if (pogo) { p.pogo(); Sound.sfx('clang'); }
    if (landed && !isDown) {
      G.hitstop = Math.max(G.hitstop, p.atkKind === 'slash3' ? CC.hitstopFinisher : CC.hitstop);
      if (p.atkKind === 'slash3') Game.shake(CC.shakeHeavy);
    }
  },
  flameTrail(p, A) {
    const hx = p.facing > 0 ? p.cx + A.ox : p.cx - A.ox - A.w, hy = p.y + p.h + A.oy;
    for (let k = 0; k < 2; k++) { const pr = Projectiles.get(); if (pr) { pr.init('fire', hx + A.w * (k ? 0.8 : 0.35), hy + A.h * 0.55, 0, 0, 'player'); pr.pIdx = p.idx; } }
  },
  thunderDash(p) { this.bodyHit(p, p.dashId, CONFIG.combat.thunderDmg, 120, PT.BOLT); },
  // body contact damage (Thunder Dash, Golden Armor): each id hits each target once
  bodyHit(p, id, dmg, kb, pt) {
    const x = p.x - 4, y = p.y, w = p.w + 8, h = p.h;
    for (const e of Enemies.items) {
      if (!e.active || e.thunderHit[p.idx] === id || !overlap(x, y, w, h, e.x, e.y, e.w, e.h)) continue;
      e.thunderHit[p.idx] = id; e.hurt(dmg, sgn(e.cx - p.cx) || p.facing, kb); PFX.burst(pt, e.cx, e.cy, 6, 80, 0.3, 0, 0);
    }
    const b = G.boss;
    if (b && b.active && b.thunderHit[p.idx] !== id && overlap(x, y, w, h, b.x, b.y, b.w, b.h)) { b.thunderHit[p.idx] = id; b.hurt(dmg, p.facing); }
  },
  projectileHitsEnemies(pr, dmg, consume) {
    for (const e of Enemies.items) {
      if (!e.active || pr.lastHit.has(e) || !overlap(pr.x, pr.y, pr.w, pr.h, e.x, e.y, e.w, e.h)) continue;
      pr.lastHit.add(e); e.hurt(dmg, pr.facing, 80);
      if (consume) { pr.active = false; return; }
    }
    const b = G.boss;
    if (b && b.active && !pr.lastHit.has(b) && overlap(pr.x, pr.y, pr.w, pr.h, b.x, b.y, b.w, b.h)) { pr.lastHit.add(b); b.hurt(dmg, pr.facing); if (consume) pr.active = false; }
  },
  hurtPlayers(x, y, w, h, dir, dmg) {
    let hit = false;
    for (const p of G.players) if (p.alive && overlap(x, y, w, h, p.x, p.y, p.w, p.h) && p.hurt(dir || sgn(p.cx - (x + w / 2)) || 1, dmg)) hit = true;
    return hit;
  },
};

/* ---------- level objects: checkpoints, goal, lanterns, logs, crumbling planks ---------- */
const Level = {
  update(dt) {
    const L = G.level, HZ = CONFIG.hazards;
    for (const k of L.checkpoints) {
      if (k.lit) continue;
      for (const p of G.players) if (p.alive && Math.abs(p.cx - k.x) < 14 && p.y + p.h > k.y - 32 && p.y < k.y) { this.lightCheckpoint(k); break; }
    }
    if (L.goal && !G.finished) for (const p of G.players) if (p.alive && p.cx > L.goal.x - 4 && Math.abs(p.y + p.h - L.goal.y) < 90) { Game.finishLevel(); break; }
    for (const ln of L.lanterns) if (ln.hitT > 0) ln.hitT -= dt;
    G.hazardTime += dt * G.enemyScale;
    for (const lg of L.logs) {
      const ph = lg.phase + G.hazardTime * 2 * Math.PI / HZ.logPeriod, a = HZ.logAmp * Math.sin(ph);
      lg.angle = a; lg.ex = lg.ax + Math.sin(a) * lg.len; lg.ey = lg.ay + Math.cos(a) * lg.len; lg.dir = Math.cos(ph) >= 0 ? 1 : -1;
      if (onScreen(lg.ex - 16, lg.ey - 6, 32, 12, 20)) Combat.hurtPlayers(lg.ex - 15, lg.ey - 5, 30, 10, lg.dir, 1);
    }
    this.updateCrumbles(dt);
    if (L.isBoss && !G.bossFight && !G.bossDefeated) for (const p of G.players) if (p.alive && p.x > L.arena.trigger) { Game.startBossFight(); break; }
  },
  lightCheckpoint(k) {
    k.lit = true; G.checkpoint = { x: k.x, y: k.y };
    Sound.sfx('checkpoint'); PFX.burst(PT.GLOW, k.x, k.y - 16, 14, 70, 0.7, 0, 20);
    Effects.label(k.x, k.y - 44, 'CHECKPOINT', '#ffd24a');
    for (const p of G.players) { if (p.downed) p.revive(CONFIG.player.hearts); else if (!p.dead) p.hearts = CONFIG.player.hearts; }
  },
  touchCrumble(tx, ty) {
    const L = G.level, i = ty * L.w + tx;
    if (L.crumbleT[i] !== 0) return;
    L.crumbleT[i] = CONFIG.hazards.crumbleDelay; L.vis[i] = TV.CRACKED; G.crumbles.push(i);
  },
  updateCrumbles(dt) {
    const L = G.level, HZ = CONFIG.hazards;
    for (let k = G.crumbles.length - 1; k >= 0; k--) {
      const i = G.crumbles[k]; let t = L.crumbleT[i];
      if (t > 0) {
        t -= dt * G.enemyScale;
        if (t <= 0) {
          L.tiles[i] = TILE.EMPTY; t = -HZ.crumbleRespawn;
          const x = (i % L.w) * TS + 8, y = ((i / L.w) | 0) * TS + 3;
          if (onScreen(x, y, 1, 1, 10)) { PFX.burst(PT.WOOD, x, y, 6, 60, 0.6, 400, 20); Sound.sfx('crumble'); }
        }
      } else {
        t += dt;
        if (t >= 0) {
          const tx = i % L.w, ty = (i / L.w) | 0;
          let blocked = false;
          for (const p of G.players) if (overlap(p.x, p.y, p.w, p.h, tx * TS, ty * TS, TS, TS)) blocked = true;
          if (blocked) t = -0.2;
          else { L.tiles[i] = TILE.CRUMBLE; L.vis[i] = TV.CRUMBLE; t = 0; G.crumbles[k] = G.crumbles[G.crumbles.length - 1]; G.crumbles.pop(); }
        }
      }
      L.crumbleT[i] = t;
    }
  },
};

/* =====================================================================
   11. CAMERA  -  follows one player with look-ahead, or frames both players
       (always keeping the leader in view; the one behind gets warped forward).
   ===================================================================== */
const Cam = {
  x: 0, y: 0, look: 0,
  progress(p) { return p.cx - (p.y + p.h) * 0.6; },
  leader() {
    let best = null;
    for (const p of G.players) if (p.alive && (!best || this.progress(p) > this.progress(best))) best = p;
    return best || G.players[0];
  },
  update(dt, snap) {
    const L = G.level;
    let sx = 0, sy = 0, n = 0;
    for (const p of G.players) if (p.alive) { sx += p.cx; sy += p.y + p.h; n++; }
    if (!n) for (const p of G.players) { sx += p.cx; sy += p.y + p.h; n++; }
    const P0 = G.players[0];
    this.look = approach(this.look, G.nPlayers === 1 && P0.alive ? P0.facing * 30 : 0, dt * 70);
    let tx = sx / n + this.look - W / 2, ty = sy / n - H * 0.66;
    if (G.nPlayers > 1) {
      const ld = this.leader(), lx = ld.cx, ly = ld.y + ld.h;
      if (lx > tx + W - 50) tx = lx - W + 50; if (lx < tx + 50) tx = lx - 50;
      if (ly > ty + H - 24) ty = ly - H + 24; if (ly < ty + 60) ty = ly - 60;
    }
    if (G.bossFight && L.arena) { tx = L.arena.x0; ty = L.arena.y1 - H; }
    tx = clamp(tx, 0, L.w * TS - W); ty = clamp(ty, 0, L.h * TS - H);
    if (snap) { this.x = tx; this.y = ty; return; }
    this.x += (tx - this.x) * Math.min(1, dt * 7);
    const dy = ty - this.y, dz = G.bossFight ? 0 : 10;
    if (Math.abs(dy) > dz) this.y += (dy - sgn(dy) * dz) * Math.min(1, dt * 5);
  },
};
