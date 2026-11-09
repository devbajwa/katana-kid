
/* =====================================================================
   GAME FLOW  -  starting levels, checkpoints, boss fight, level clear
   ===================================================================== */
const PLAYERS = [new Player(0), new Player(1)];
const BOSS = new Boss();
const GHOST_MAX = CONFIG.ghost.maxSeconds * 60 / CONFIG.ghost.stepsPerSample;
G.ghostRec = [new Int16Array(GHOST_MAX * 3), new Int16Array(GHOST_MAX * 3)];

const Game = {
  startLevel(n) {
    G.levelNum = n; G.nPlayers = G.mode === 'coop' ? 2 : 1; Input.setMode(G.mode); Input.clearLatches();
    const L = generateLevel(G.regionId, n, G.mode); G.level = L;
    G.players = PLAYERS.slice(0, G.nPlayers);
    G.players.forEach((p, i) => p.reset(L.start.x + i * 18, L.start.y));
    Enemies.clear(); Projectiles.clear(); Pickups.clear(); Effects.pool.clear(); PFX.clear(); G.crumbles.length = 0;
    for (const s of L.spawns) {
      if (s.kind === 'orb') { const o = Pickups.get(); if (o) o.init('orb', s.x, s.y, s.ptype); }
      else if (s.kind === 'scroll') { const o = Pickups.get(); if (o) o.init('scroll', s.x, s.y, 0, s.idx); }
      else { const e = Enemies.get(); if (e) e.init(s.kind, s.x, s.y); }
    }
    G.boss = L.bossSpawn ? BOSS.init(L.bossSpawn.x, L.bossSpawn.y, G.nPlayers > 1) : null;
    Object.assign(G, { levelTime: 0, finished: false, finishT: 0, bossFight: false, bossDefeated: false, timeBell: 0, enemyScale: 1, hazardTime: 0,
      scrolls: [false, false, false], wipeT: 0, fade: 1, fadeTarget: 0, hitstop: 0, shake: 0, flash: 0, toast: '', toastT: 0, hint: '', hintT: 0,
      ghostRecN: 0, result: null, resultShown: false, checkpoint: { x: L.start.x, y: L.start.y } });
    const rec = Save.level(G.regionId, n);
    G.prevBest = rec.best[G.mode] == null ? null : rec.best[G.mode];
    G.ghostPlay = null;
    const gd = Save.data.ghosts[Save.key(G.regionId, n, G.mode)];
    if (gd) { try { G.ghostPlay = gd.map(decodeGhost); } catch (e) { G.ghostPlay = null; } }
    Cam.update(0, true); L.baseY = Cam.y;
    const intro = L.hint;
    if (!Save.data.hints['lv' + n]) { Save.data.hints['lv' + n] = 1; Save.write(); G.hint = Game.keyText(intro.hint); G.hintT = 6; }
    else { G.hint = 'LEVEL ' + n + (n === 10 ? ' - BOSS' : ''); G.hintT = 2; }
    Sound.playMusic(REGIONS[0].music);
    G.screen = 'play'; UI.show(null); UI.touch(true);
    resetClock();
  },
  keyText(s) {
    const touch = UI.touchOn(), coop = G.mode === 'coop';
    const K = touch ? { JUMP: 'JUMP', SLASH: 'SLASH', DASH: 'DASH', DOWN: 'DOWN' }
      : coop ? { JUMP: 'W / UP', SLASH: 'F / .', DASH: 'G / /', DOWN: 'S / DOWN' } : { JUMP: 'W', SLASH: 'F', DASH: 'G', DOWN: 'S' };
    return s.replace(/\{(\w+)\}/g, (m, k) => K[k] || k);
  },
  respawnAll() {
    const cp = G.checkpoint, L = G.level;
    G.players.forEach((p, i) => { p.reset(cp.x + (G.nPlayers > 1 ? i * 16 - 8 : 0), cp.y); p.invuln = 1.5; });
    G.fade = 1; G.fadeTarget = 0; G.wipeT = 0;
    if (G.boss && G.bossFight && !G.bossDefeated) {
      G.bossFight = false;
      for (const i of L.gateCells) { L.tiles[i] = TILE.EMPTY; L.vis[i] = 0; }
      BOSS.init(L.bossSpawn.x, L.bossSpawn.y, G.nPlayers > 1); Projectiles.clear(); Sound.playMusic(REGIONS[0].music);
    }
    Cam.update(0, true);
  },
  startBossFight() {
    const L = G.level; G.bossFight = true;
    for (const i of L.gateCells) { L.tiles[i] = TILE.GATE; L.vis[i] = TV.GATE; }
    const gx = (L.gateCells[0] % L.w + 1) * TS;
    for (const p of G.players) if (p.x < gx + 8) p.warpTo(gx + 30, L.bossSpawn.y);
    BOSS.wake(); Sound.playMusic(REGIONS[0].bossMusic);
    Game.toastMsg(CONFIG.boss.name, 3);
  },
  finishLevel() {
    if (G.finished) return;
    G.finished = true; G.finishT = 0; G.finalTime = G.levelTime; G.fadeTarget = 0;
    Sound.sfx('clear');
    for (const p of G.players) { if (p.downed) p.revive(1); PFX.burst(PT.PETAL, p.cx, p.cy, 16, 90, 1.6, 30, 60); }
    const rec = Save.level(G.regionId, G.levelNum), found = G.scrolls.filter(Boolean).length;
    const stars = found === 3 ? 3 : found >= 1 ? 2 : 1, prev = rec.best[G.mode];
    const newBest = prev == null || G.finalTime < prev, rival = prev != null && newBest;
    rec.stars = Math.max(rec.stars || 0, stars);
    rec.scrolls = (rec.scrolls || 0) | G.scrolls.reduce((m, s, i) => m | (s ? 1 << i : 0), 0);
    if (newBest) {
      rec.best[G.mode] = G.finalTime;
      Save.data.ghosts[Save.key(G.regionId, G.levelNum, G.mode)] = G.players.map((p, i) => encodeGhost(G.ghostRec[i], G.ghostRecN));
    }
    const R = Save.data.regions[G.regionId];
    R.unlocked = Math.max(R.unlocked, Math.min(10, G.levelNum + 1));
    if (G.levelNum === 10) R.shard = true;
    Save.write();
    G.result = { time: G.finalTime, found, stars, prev, newBest, rival };
    if (rival) { Sound.sfx('rival'); Game.toastMsg('YOU BEAT YOUR SPIRIT RIVAL!', 3.5); for (const p of G.players) PFX.burst(PT.GLOW, p.cx, p.cy, 16, 120, 1, 0, 30); }
  },
  shake(a) { if (Save.data.settings.shake) G.shake = Math.max(G.shake, a); },
  flash(col, a) { if (Save.data.settings.flashes) { G.flashCol = col; G.flash = Math.max(G.flash, a); } },
  toastMsg(t, d) { G.toast = t; G.toastT = d || 2; },
  hintOnce(key, text) { if (Save.data.hints[key]) return; Save.data.hints[key] = 1; Save.write(); G.hint = text; G.hintT = 4.5; },
  step(dt) {
    G.step++;
    Input.step(G.nPlayers);
    if (G.bot) G.bot();
    if (Input.pauseLatch) { Input.pauseLatch = false; if (!G.finished) { UI.pause(); return; } }
    G.fade = approach(G.fade, G.fadeTarget, dt * 2.5);
    if (G.hintT > 0) G.hintT -= dt; if (G.toastT > 0) G.toastT -= dt;
    G.shake *= CONFIG.fx.shakeDecay; G.flash *= CONFIG.fx.flashDecay;
    if (G.hitstop > 0) { G.hitstop--; return; }
    if (!G.finished) G.levelTime += dt;
    if (G.timeBell > 0) G.timeBell -= dt;
    G.enemyScale = G.timeBell > 0 ? CONFIG.powers.timeBellScale : 1;
    for (const p of G.players) p.update(dt);
    const ar = CONFIG.enemies.activeRange, mx = Cam.x + W / 2, my = Cam.y + H / 2;
    for (const e of Enemies.items) if (e.active && Math.abs(e.cx - mx) < ar && Math.abs(e.cy - my) < ar) e.update(dt);
    if (G.boss && G.boss.active && (G.bossFight || G.boss.state === 'dying')) G.boss.update(dt);
    for (const pr of Projectiles.items) if (pr.active) pr.update(dt);
    for (const pk of Pickups.items) if (pk.active && onScreen(pk.x, pk.y, pk.w, pk.h, 80)) pk.update(dt);
    Level.update(dt);
    for (const ef of Effects.pool.items) if (ef.active) ef.update(dt);
    PFX.update(dt);
    Cam.update(dt);
    if (G.nPlayers > 1) this.catchUp(dt);
    if (G.wipeT > 0) { G.wipeT -= dt; if (G.wipeT <= 0) Game.respawnAll(); }
    this.recordGhost();
    if (G.finished) {
      G.finishT += dt;
      if (G.finishT > 1.9 && !G.resultShown) { G.resultShown = true; if (G.levelNum === 10) UI.story(); else UI.showClear(); }
    }
  },
  catchUp(dt) {
    const m = CONFIG.player.catchupMargin;
    for (const p of G.players) {
      const q = G.players[1 - p.idx];
      const off = p.x + p.w < Cam.x - m || p.x > Cam.x + W + m || p.y > Cam.y + H + m || p.y + p.h < Cam.y - 90;
      if (off && q.alive && !G.finished) {
        p.farT += dt;
        if (Math.floor(p.farT * 3) !== Math.floor((p.farT - dt) * 3) && !p.downed) Sound.sfx('warn');
        if (p.farT > (p.downed ? 0.4 : CONFIG.player.catchupDelay)) { p.warpTo(q.cx - q.facing * 14, q.y + q.h); if (p.downed) p.y -= 10; }
      } else p.farT = 0;
    }
  },
  recordGhost() {
    if (G.finished || G.step % CONFIG.ghost.stepsPerSample || G.ghostRecN >= GHOST_MAX) return;
    const n = G.ghostRecN * 3;
    for (let i = 0; i < G.nPlayers; i++) {
      const p = G.players[i], a = G.ghostRec[i];
      a[n] = Math.round(p.cx); a[n + 1] = Math.round(p.y + p.h); a[n + 2] = p.alive ? p.sheetFrame() * 2 + (p.facing < 0 ? 1 : 0) : -1;
    }
    G.ghostRecN++;
  },
};
function encodeGhost(arr, n) {
  const bytes = new Uint8Array(arr.buffer, 0, n * 3 * 2); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function decodeGhost(str) {
  const bin = atob(str), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, bytes.length >> 1);
}

/* =====================================================================
   12. RENDERING  -  only drawImage from caches + a few solid fillRects
   ===================================================================== */
const CANVAS = document.getElementById('game'), CTX = CANVAS.getContext('2d', { alpha: false });
CTX.imageSmoothingEnabled = false;
const Weather = {
  n: 0, x: null, y: null, d: null, ph: null, lastCx: 0, lastCy: 0,
  init() { const n = CONFIG.fx.petals; this.n = n; this.x = new Float32Array(n); this.y = new Float32Array(n); this.d = new Float32Array(n); this.ph = new Float32Array(n);
    for (let i = 0; i < n; i++) { this.x[i] = Math.random() * W; this.y[i] = Math.random() * H; this.d[i] = 0.3 + Math.random() * 0.9; this.ph[i] = Math.random() * 6; } },
  draw(ctx, dt, camX, camY, front) {
    const n = lowGfx() ? CONFIG.fx.petalsLow : this.n, dx = camX - this.lastCx, dy = camY - this.lastCy;
    if (!front) { this.lastCx = camX; this.lastCy = camY; }
    for (let i = 0; i < n; i++) {
      const d = this.d[i], isFront = d > 1.0;
      if (isFront !== front) continue;
      if (isFront && lowGfx()) continue;           // extra foreground weather layer is optional
      this.ph[i] += dt * (1 + d);
      this.x[i] += (-14 * d + Math.sin(this.ph[i]) * 12) * dt - (front ? 0 : dx * d * 0.5); this.y[i] += (18 + 10 * d) * dt - (front ? 0 : dy * d * 0.3);
      if (this.y[i] > H + 8) { this.y[i] = -8; this.x[i] = Math.random() * (W + 60); } if (this.y[i] < -10) this.y[i] = H + 6;
      if (this.x[i] < -10) this.x[i] += W + 20; if (this.x[i] > W + 10) this.x[i] -= W + 20;
      const f = ((this.ph[i] * 2) | 0) % 4;
      if (isFront) ctx.drawImage(ART.pfx, f * 8, 0, 8, 8, Math.round(this.x[i]), Math.round(this.y[i]), 16, 16);
      else ctx.drawImage(ART.pfx, f * 8, 0, 8, 8, Math.round(this.x[i]), Math.round(this.y[i]), 8, 8);
    }
  },
};
function drawBackground(ctx, ox, oy, baseY) {
  const B = ART.bg;
  ctx.drawImage(B.sky, 0, 0);
  if (!lowGfx()) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55 + 0.25 * Math.sin(G.time * 0.6); ctx.drawImage(B.rays, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  const tops = [96, 128, 150, 178], vy = baseY - oy;
  for (let li = 0; li < B.layers.length; li++) {
    const Ly = B.layers[li], img = Ly.img, lw = img.width;
    let x = -((ox * Ly.f) % lw); if (x > 0) x -= lw;
    const y = Math.round(tops[li] + clamp(vy * Ly.fy, -120, 140));
    for (; x < W; x += lw) ctx.drawImage(img, Math.round(x), y);
    if (y + img.height < H) { ctx.fillStyle = Ly.base; ctx.fillRect(0, y + img.height, W, H - y - img.height); }
    if (li === 1) { const m = B.mist[0], mx = -((G.time * 5 + ox * 0.2) % 480); ctx.drawImage(m, Math.round(mx), y + 40); ctx.drawImage(m, Math.round(mx) + 480, y + 40); }
  }
}
function renderWorld(dt) {
  const ctx = CTX, L = G.level, S = Save.data.settings;
  let ox = Math.round(Cam.x), oy = Math.round(Cam.y);
  if (G.shake > 0.3 && S.shake) { ox += Math.round((Math.random() * 2 - 1) * G.shake); oy += Math.round((Math.random() * 2 - 1) * G.shake); }
  drawBackground(ctx, ox, oy, L.baseY);
  Weather.draw(ctx, dt, ox, oy, false);
  const P = ART.props;
  // decor behind the play layer
  for (const d of L.decor) {
    if (d.img === 'grass') { if (d.x - ox < -12 || d.x - ox > W || d.y - oy < -8 || d.y - oy > H + 8) continue; ctx.drawImage(P.grass[(((G.time * 3 + d.x * 0.05) | 0) + d.phase) % 4], d.x - ox, d.y - oy - 7); continue; }
    const img = P[d.img]; if (!img) continue;
    const x = Math.round(d.x - img.width / 2 - ox), y = Math.round(d.y - img.height - oy);
    if (x > W || x + img.width < 0 || y > H || y + img.height < 0) continue;
    ctx.drawImage(img, x, y);
  }
  // tiles (visible window only)
  const tx0 = Math.max(0, Math.floor(ox / TS)), tx1 = Math.min(L.w - 1, Math.floor((ox + W) / TS)), ty0 = Math.max(0, Math.floor(oy / TS)), ty1 = Math.min(L.h - 1, Math.floor((oy + H) / TS));
  const T = ART.tiles, jit = (G.step >> 1) % 2;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const i = ty * L.w + tx, t = L.tiles[i]; if (!t) continue;
    const v = L.vis[i];
    ctx.drawImage(T, (v & 15) * 16, (v >> 4) * 16, 16, 16, tx * TS - ox + (v === TV.CRACKED ? jit : 0), ty * TS - oy, 16, 16);
  }
  // level objects
  for (const k of L.checkpoints) if (onScreen(k.x - 12, k.y - 30, 24, 30, 0)) drawSheet(ctx, P.shrine, k.lit ? 1 + ((G.time * 6) | 0) % 3 : 0, 1, k.x - ox, k.y - oy);
  if (L.goal && onScreen(L.goal.x - 34, L.goal.y - 64, 68, 64, 0)) ctx.drawImage(P.torii, Math.round(L.goal.x - 34 - ox), Math.round(L.goal.y - 64 - oy));
  for (const ln of L.lanterns) {
    if (!onScreen(ln.x - 8, ln.y - 12, 16, 24, 0)) continue;
    const by = Math.sin(G.time * 2 + ln.bob) * 2;
    drawSheet(ctx, P.spiritLantern, ln.hitT > 0 ? 2 : ((G.time * 4 + ln.bob) | 0) % 2, 1, ln.x - ox, ln.y + 10 + by - oy);
  }
  for (const lg of L.logs) {
    if (!onScreen(Math.min(lg.ax, lg.ex) - 20, lg.ay, Math.abs(lg.ex - lg.ax) + 40, lg.len + 20, 0)) continue;
    const steps = Math.floor(lg.len / 4);
    for (let s = 0; s <= steps; s++) { const f = s / steps; ctx.drawImage(P.ropeDot, Math.round(lerp(lg.ax, lg.ex, f) - 1 - ox), Math.round(lerp(lg.ay, lg.ey, f) - 1 - oy)); }
    ctx.drawImage(P.log, Math.round(lg.ex - 18 - ox), Math.round(lg.ey - 6 - oy));
  }
  for (const pk of Pickups.items) if (pk.active && onScreen(pk.x, pk.y, pk.w, pk.h, 8)) pk.draw(ctx, ox, oy);
  drawGhosts(ctx, ox, oy);
  for (const e of Enemies.items) if (e.active && onScreen(e.x - 24, e.y - 12, e.w + 48, e.h + 16, 0)) e.draw(ctx, ox, oy);
  if (G.boss && G.boss.active) G.boss.draw(ctx, ox, oy);
  for (const p of G.players) p.draw(ctx, ox, oy);
  for (const pr of Projectiles.items) if (pr.active && onScreen(pr.x, pr.y, pr.w, pr.h, 8)) pr.draw(ctx, ox, oy);
  for (const ef of Effects.pool.items) if (ef.active) ef.draw(ctx, ox, oy);
  PFX.draw(ctx, ox, oy);
  if (!lowGfx()) { const m = ART.bg.mist[1], mx = -((G.time * 12 + ox * 0.8) % 480); ctx.globalAlpha = 0.35; ctx.drawImage(m, Math.round(mx), H - 48); ctx.drawImage(m, Math.round(mx) + 480, H - 48); ctx.globalAlpha = 1; }
  Weather.draw(ctx, dt, ox, oy, true);
  if (G.timeBell > 0) { ctx.globalAlpha = 0.12; ctx.fillStyle = '#b080ff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  if (G.flash > 0.02 && S.flashes) { ctx.globalAlpha = Math.min(0.7, G.flash); ctx.fillStyle = G.flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  drawHUD(ctx);
  if (G.fade > 0.01) { ctx.globalAlpha = Math.min(1, G.fade); ctx.fillStyle = '#0b0810'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}
function drawGhosts(ctx, ox, oy) {
  if (!G.ghostPlay || !Save.data.settings.showGhost) return;
  const pos = G.levelTime * 60 / CONFIG.ghost.stepsPerSample, i = Math.floor(pos), f = pos - i;
  for (const g of G.ghostPlay) {
    const n = (g.length / 3) | 0; if (i >= n - 1) continue;
    const c = g[i * 3 + 2]; if (c < 0) continue;
    const x = lerp(g[i * 3], g[i * 3 + 3], f), y = lerp(g[i * 3 + 1], g[i * 3 + 4], f);
    if (!onScreen(x - 16, y - 40, 32, 40, 0)) continue;
    ctx.globalAlpha = CONFIG.ghost.alpha; drawSheet(ctx, ART.sam.ghost, c >> 1, (c & 1) ? -1 : 1, x - ox, y - oy + 1);
    ctx.globalAlpha = 0.75; ctx.drawImage(ART.rivalLabel, Math.round(x - ox - ART.rivalLabel.width / 2), Math.round(y - oy - 34)); ctx.globalAlpha = 1;
  }
}
function drawBar(ctx, x, y, w, h, frac, col) {
  ctx.fillStyle = '#1b1220'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2); ctx.fillStyle = '#3a2a40'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(w * clamp(frac, 0, 1)), h);
}
function drawHUD(ctx) {
  const PW = CONFIG.powers, P = ART.props, HC = CONFIG.colors.hud;
  for (let i = 0; i < G.nPlayers; i++) {
    const p = G.players[i], right = i === 1, x0 = right ? W - 6 - 50 : 6;
    if (G.nPlayers > 1) ctx.drawImage(i ? ART.p2Label : ART.p1Label, right ? W - 14 : 6, 18 + 0);
    for (let h = 0; h < CONFIG.player.hearts; h++) ctx.drawImage(P.heart[h < p.hearts ? i : 2], x0 + h * 10, 5);
    if (p.powers[2] > 0) ctx.drawImage(P.heart[3], right ? x0 - 11 : x0 + 50, 5);
    let px = right ? W - 6 - 10 - (G.nPlayers > 1 ? 10 : 0) : 6 + (G.nPlayers > 1 ? 10 : 0);
    for (const t of PW.timed) {
      if (p.powers[t] <= 0) continue;
      const rem = p.powers[t], blink = rem < PW.blinkTime && ((G.time * 8) | 0) % 2;
      if (!blink) ctx.drawImage(P.icons[t], px, 17);
      drawBar(ctx, px, 29, 10, 2, rem / PW.duration[t], PW.colors[t]);
      px += right ? -13 : 13;
    }
    if (p.downed) drawText(ctx, 'SPIRIT', right ? W - 6 : 6, 17, '#bfe6ff', 1, right ? 'right' : 'left');
  }
  drawText(ctx, fmtTime(G.levelTime), W / 2, 5, HC.text, 1, 'center');
  const found = (G.scrolls[0] ? 1 : 0) + (G.scrolls[1] ? 1 : 0) + (G.scrolls[2] ? 1 : 0);
  drawSheet(ctx, P.scroll, 0, 1, W / 2 - 8, 25); drawText(ctx, found + '/3', W / 2 + 6, 15, HC.gold, 1, 'center');
  if (G.timeBell > 0) {
    const blink = G.timeBell < PW.blinkTime && ((G.time * 8) | 0) % 2;
    if (!blink) ctx.drawImage(P.icons[4], W / 2 + 22, 14); drawBar(ctx, W / 2 + 22, 26, 10, 2, G.timeBell / PW.duration[4], PW.colors[4]);
  }
  if (G.boss && (G.bossFight || G.boss.state === 'dying') && !G.bossDefeated) {
    const b = G.boss;
    drawText(ctx, CONFIG.boss.name, W / 2, H - 22, '#ffd0c0', 1, 'center');
    drawBar(ctx, W / 2 - 100, H - 14, 200, 6, b.hpShown / b.maxHp, b.phase === 2 ? '#ff6a3a' : '#d8434b');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(W / 2, H - 14, 1, 6);
  }
  if (G.hintT > 0 && G.hint) {
    const a = Math.min(1, G.hintT * 2), w = textWidth(G.hint.toUpperCase(), 1) + 12;
    ctx.globalAlpha = a * 0.75; ctx.fillStyle = '#1b1220'; ctx.fillRect(Math.round(W / 2 - w / 2), 40, w, 13); ctx.globalAlpha = a;
    drawText(ctx, G.hint, W / 2, 44, '#ffe9a0', 1, 'center'); ctx.globalAlpha = 1;
  }
  if (G.toastT > 0 && G.toast) {
    const pulse = 1 + (G.toastT > 1.5 ? 1 : 0);
    drawText(ctx, G.toast, W / 2, 70, '#ffffff', pulse, 'center');
  }
  if (G.nPlayers > 1) for (const p of G.players) {
    if (p.farT <= 0 || ((G.time * 6) | 0) % 2) continue;
    const sx = clamp(p.cx - Cam.x, 10, W - 18), sy = clamp(p.cy - Cam.y, 40, H - 20);
    ctx.drawImage(P.warn[p.cx < Cam.x ? 0 : 1], Math.round(sx), Math.round(sy));
    ctx.drawImage(p.idx ? ART.p2Label : ART.p1Label, Math.round(sx), Math.round(sy) - 8);
  }
  if (G.quality.auto && G.qualityToast > 0) G.qualityToast -= 1 / 60;
}

/* ---------- title + story scenes ---------- */
const TITLE_CYCLE = ['idle', 'idle', 'slash1', 'slash2', 'slash3', 'idle', 'run', 'victory'];
function renderTitle(dt) {
  const ctx = CTX, ox = G.time * 25;
  drawBackground(ctx, ox, 0, 0);
  Weather.draw(ctx, dt, ox, 0, false);
  const T = ART.tiles;
  for (let x = -((ox) % 16) - 16; x < W; x += 16) { ctx.drawImage(T, 1 * 16, 0, 16, 16, Math.round(x), 222, 16, 16); for (let y = 238; y < H; y += 16) ctx.drawImage(T, 0, 0, 16, 16, Math.round(x), y, 16, 16); }
  ctx.drawImage(ART.props.tree, -6, 222 - 84); ctx.drawImage(ART.props.lantern, 440, 222 - 24);
  const cyc = Math.floor(G.time / 1.1) % TITLE_CYCLE.length, a = ANIM[TITLE_CYCLE[cyc]], t = G.time % 1.1;
  let fr = a.n === 3 ? a.s + Math.min(2, Math.floor(t * 8)) : frameOf(a, t);
  drawSheet(ctx, ART.sam.p1, fr, 1, 104, 223, 3, 3);
  drawSheet(ctx, ART.sam.p2, frameOf(ANIM.idle, G.time + 0.5), -1, 384, 223, 3, 3);
  drawText(ctx, 'KATANA KID', W / 2, 16, '#ffe9a0', 5, 'center');
  drawText(ctx, 'THE TEN SHARDS OF THE SACRED SWORD', W / 2, 50, '#f6ead2', 1, 'center');
  Weather.draw(ctx, dt, ox, 0, true);
}
const STORY = {
  intro: [
    'Long ago, a quiet mountain village was protected by the Sacred Sword.',
    'One night the Oni Warlord came. With one mighty blow he shattered the sword!',
    'Its ten shards flew across the land. Each one is now guarded by a fearsome boss.',
    null, // filled with solo/co-op text
  ],
  outro: [
    'The Red Oni Gatekeeper bursts into cherry petals. The first shard glows in your hands!',
    'One shard home, nine to go... Region 2, the Misty Bamboo Grove, is coming soon!',
  ],
  scenes: {}, idx: 0, list: null, kind: 'intro',
};
function sceneCanvas(name) {
  if (STORY.scenes[name]) return STORY.scenes[name];
  const c = makeCanvas(W, H), x = c.ctx, P = ART.props;
  drawBackgroundTo(x, name === 'oni' ? 140 : 40);
  const ground = (y) => { for (let gx = 0; gx < W; gx += 16) { x.drawImage(ART.tiles, 16, 0, 16, 16, gx, y, 16, 16); for (let yy = y + 16; yy < H; yy += 16) x.drawImage(ART.tiles, 0, 0, 16, 16, gx, yy, 16, 16); } };
  if (name === 'village' || name === 'home') {
    ground(214); x.drawImage(P.house, 30, 214 - 60); x.drawImage(P.house, 340, 214 - 60); x.drawImage(P.tree, 120, 214 - 84); x.drawImage(P.tree, 290, 214 - 84);
    x.drawImage(P.lantern, 200, 190); x.drawImage(P.lantern, 268, 190);
    R(x, '#5a5668', 220, 196, 40, 18); R(x, '#8a8496', 224, 190, 32, 8);
    if (name === 'village') { for (let r = 30; r > 8; r -= 6) { x.globalAlpha = 0.12; disc(x, '#bff0ff', 240, 160, r); } x.globalAlpha = 1; ln(x, '#3a2618', 240, 192, 240, 182, 3); R(x, '#f2c14e', 234, 180, 13, 2); ln(x, '#eef5ff', 240, 178, 240, 130, 3); ln(x, '#9fb3c8', 241, 178, 241, 132, 1); }
    else { drawSheet(x, ART.sam.p1, ANIM.victory.s, 1, 240, 215, 3, 3); for (let r = 26; r > 6; r -= 5) { x.globalAlpha = 0.15; disc(x, '#7fd8ff', 246, 112, r); } x.globalAlpha = 1; drawSheet(x, P.shard, 0, 1, 246, 124, 2, 2); }
  } else if (name === 'oni') {
    x.globalAlpha = 0.55; x.fillStyle = '#2a0a20'; x.fillRect(0, 0, W, H); x.globalAlpha = 1; ground(222);
    drawSheet(x, ART.boss, 4, 1, 160, 223, 2, 2);
    for (let k = 0; k < 10; k++) { const a = -2.6 + k * 0.24, r = 70 + (k % 3) * 22; drawSheet(x, P.shard, k % 2, 1, 330 + Math.cos(a) * r, 120 + Math.sin(a) * r, 1, 1); }
    for (let r = 20; r > 4; r -= 4) { x.globalAlpha = 0.18; disc(x, '#bff0ff', 330, 110, r); } x.globalAlpha = 1;
  } else if (name === 'map' || name === 'map2') {
    x.globalAlpha = 0.9; R(x, '#e8d4a8', 40, 30, 400, 200); x.globalAlpha = 1; R(x, '#8a5a3a', 40, 30, 400, 3); R(x, '#8a5a3a', 40, 227, 400, 3);
    const pts = [[70, 200], [120, 180], [160, 200], [210, 170], [180, 130], [130, 110], [170, 70], [240, 60], [300, 90], [380, 60]];
    for (let k = 0; k < pts.length - 1; k++) ln(x, '#a07a5a', pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 2);
    pts.forEach((p, k) => { disc(x, '#5a3a28', p[0], p[1], 5); disc(x, name === 'map2' && k === 0 ? '#7fd8ff' : '#c8303a', p[0], p[1], 3); if (!(name === 'map2' && k === 0)) drawSheet(x, P.shard, 0, 1, p[0], p[1] - 6); });
    if (name === 'map2') drawSheet(x, ART.sam.p1, ANIM.idle.s, 1, 70, 194);
  } else if (name === 'depart') {
    ground(214); x.drawImage(P.tree, 340, 214 - 84);
    drawSheet(x, ART.sam.p1, ANIM.idle.s, 1, 200, 215, 3, 3);
    if (G.mode === 'coop') drawSheet(x, ART.sam.p2, ANIM.idle.s + 2, 1, 130, 215, 3, 3);
  }
  return (STORY.scenes[name] = c);
}
function drawBackgroundTo(ctx, ox) {
  const save = G.time; G.time = 0; const keep = G.quality.auto; drawBackground(ctx, ox, 0, 0); G.time = save; G.quality.auto = keep;
}
function renderScene(dt) {
  const names = STORY.kind === 'intro' ? ['village', 'oni', 'map', 'depart'] : ['home', 'map2'];
  CTX.drawImage(sceneCanvas(names[Math.min(STORY.idx, names.length - 1)]), 0, 0);
  Weather.draw(CTX, dt, 0, 0, false); Weather.draw(CTX, dt, 0, 0, true);
}

/* =====================================================================
   13. UI  -  HTML overlays for menus; HUD is drawn on the canvas
   ===================================================================== */
const $ = id => document.getElementById(id);
const UI = {
  current: null, settingsReturn: 'title', selLevel: 1,
  show(id) {
    document.querySelectorAll('.ov').forEach(o => o.classList.remove('show'));
    this.current = id;
    if (id) { const el = $('scr-' + id); el.classList.add('show'); const b = el.querySelector('button:not([disabled])'); if (b) setTimeout(() => b.focus({ preventScroll: true }), 0); }
    this.touch(G.screen === 'play' && !id);
  },
  touchOn() { const m = Save.data.settings.touch; return m === 'on' || (m === 'auto' && (isTouchDevice || Input.touchSeen)); },
  touch(on) {
    const show = !!on && G.screen === 'play' && this.touchOn(), el = $('touch');
    el.classList.toggle('show', show); el.classList.toggle('duo', G.mode === 'coop'); el.classList.toggle('big', !!Save.data.settings.touchBig);
    if (!show) Input.releaseTouches();
    document.body.classList.toggle('touchdev', this.touchOn());
  },
  init() {
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (b) { Sound.unlock(); Sound.sfx('menu'); this.act(b.dataset.act, b); }
      const t = e.target.closest('[data-tog]'); if (t) { const k = t.dataset.tog; Save.data.settings[k] = !Save.data.settings[k]; this.syncSettings(); Save.write(); Sound.applyVolumes(); }
      const cy = e.target.closest('[data-cyc]'); if (cy) { const S = Save.data.settings, o = ['auto', 'on', 'off']; S.touch = o[(o.indexOf(S.touch) + 1) % o.length]; this.syncSettings(); Save.write(); this.touch(false); }
    });
    $('set-music').addEventListener('input', e => { Save.data.settings.musicVol = e.target.value / 100; Sound.applyVolumes(); Save.writeSoon(); });
    $('set-sfx').addEventListener('input', e => { Save.data.settings.sfxVol = e.target.value / 100; Sound.applyVolumes(); Save.writeSoon(); });
    document.addEventListener('pointerdown', () => Sound.unlock(), { passive: true });
    document.addEventListener('touchend', () => Sound.unlock(), { passive: true });   // older iOS only unlocks audio on touchend
    $('dojo-name').addEventListener('input', e => this.dojoName(e.target));
    $('dojo-name').addEventListener('blur', e => { if (!e.target.value.trim()) { e.target.value = playerName(this.dojoP); } });
    this.buildMap();
  },
  act(a, el) {
    switch (a) {
      case 'solo': case 'coop':
        G.mode = a; Input.setMode(a); this.refreshMap();
        if (!Save.data.introSeen) this.intro(); else this.map();
        break;
      case 'settings': this.settingsReturn = this.current; G.screenBefore = G.screen; this.syncSettings(); this.show('settings'); break;
      case 'settings-back': this.show(this.settingsReturn); if (this.settingsReturn === 'pause') G.screen = 'pause'; break;
      case 'intro-next': this.storyNext(); break;
      case 'intro-skip': Save.data.introSeen = true; Save.write(); this.map(); break;
      case 'story-next': this.storyNext(); break;
      case 'title': G.screen = 'title'; this.show('title'); break;
      case 'play': if (this.selLevel <= Save.data.regions[1].unlocked) Game.startLevel(this.selLevel); break;
      case 'mode': G.mode = G.mode === 'solo' ? 'coop' : 'solo'; Input.setMode(G.mode); this.refreshMap(); break;
      case 'level': this.selLevel = +el.dataset.lv; this.refreshMap(); break;
      case 'region': this.refreshMap(+el.dataset.rg); break;
      case 'resume': this.resume(); break;
      case 'restart': Game.startLevel(G.levelNum); break;
      case 'quit': this.map(); break;
      case 'next': if (G.levelNum < 10) { this.selLevel = G.levelNum + 1; Game.startLevel(G.levelNum + 1); } else this.map(); break;
      case 'dojo': this.dojoReturn = this.current === 'map' ? 'map' : 'title'; G.screen = 'dojo'; this.dojoP = 0; this.buildDojo(); this.show('dojo'); break;
      case 'dojo-p': this.dojoP = +el.dataset.p; this.buildDojo(); break;
      case 'dojo-set': this.dojoSet(el.dataset.k, el.dataset.v); break;
      case 'dojo-done': Save.write(); if (this.dojoReturn === 'map') this.map(); else { G.screen = 'title'; this.show('title'); } break;
      case 'about': G.screen = 'about'; this.show('about'); break;
      case 'fullscreen': FS.toggle(); break;
    }
  },
  /* ---------- Dojo: name, colours, look and sword for each player ---------- */
  dojoP: 0, dojoReturn: 'title',
  buildDojo() {
    const LK = CONFIG.looks, prof = Save.data.profile[this.dojoP], on = c => (c ? ' class="on"' : '');
    document.querySelectorAll('#dojo-tabs button').forEach(b => b.classList.toggle('ghost', +b.dataset.p !== this.dojoP));
    $('dojo-name').value = prof.name; $('dojo-name').maxLength = LK.nameMax;
    $('dojo-armor').innerHTML = LK.armor.map((a, i) => '<button data-act="dojo-set" data-k="armor" data-v="' + i + '" title="' + a[0] + '" aria-label="' + a[0] + '" style="background:' + a[1] + '"' + on(i === prof.armor) + '></button>').join('');
    $('dojo-sash').innerHTML = LK.sash.map((a, i) => '<button data-act="dojo-set" data-k="sash" data-v="' + i + '" title="' + a[0] + '" aria-label="' + a[0] + ' sash" style="background:' + a[1] + '"' + on(i === prof.sash) + '></button>').join('');
    $('dojo-head').innerHTML = LK.head.map(h => '<button data-act="dojo-set" data-k="head" data-v="' + h[0] + '"' + on(h[0] === prof.head) + '>' + h[1] + '</button>').join('');
    $('dojo-sword').innerHTML = Object.keys(CONFIG.swords).map(k => '<button data-act="dojo-set" data-k="sword" data-v="' + k + '"' + on(k === prof.sword) + '>' + CONFIG.swords[k].name + '</button>').join('');
    $('dojo-sword-info').textContent = CONFIG.swords[prof.sword].desc;
  },
  dojoSet(k, v) {
    const prof = Save.data.profile[this.dojoP];
    prof[k] = k === 'armor' || k === 'sash' ? +v : v;
    applyProfile(this.dojoP); Save.writeSoon(); this.buildDojo();
    const b = document.querySelector('#scr-dojo [data-k="' + k + '"][data-v="' + v + '"]'); if (b) b.focus({ preventScroll: true });
  },
  dojoName(inp) {
    const clean = cleanName(inp.value);
    if (clean !== inp.value) inp.value = clean;
    Save.data.profile[this.dojoP].name = clean.trim() || Save.defaults().profile[this.dojoP].name;
    ART.nameLabel[this.dojoP] = textImage(playerName(this.dojoP), this.dojoP ? CONFIG.colors.hud.p2 : CONFIG.colors.hud.p1, 1);
    Save.writeSoon();
  },
  map() { G.screen = 'map'; this.selLevel = Math.min(this.selLevel, Save.data.regions[1].unlocked); this.refreshMap(); this.show('map'); Sound.playMusic('valley'); },
  pause() { G.screen = 'pause'; this.show('pause'); },
  resume() { G.screen = 'play'; Input.clearLatches(); this.show(null); resetClock(); },
  intro() { STORY.kind = 'intro'; STORY.idx = 0; G.screen = 'intro'; STORY.scenes.depart = null; this.show('intro'); this.storyText(); },
  story() { STORY.kind = 'outro'; STORY.idx = 0; G.screen = 'story'; this.show('story'); this.storyText(); Sound.sfx('shard'); },
  storyText() {
    const list = STORY[STORY.kind === 'intro' ? 'intro' : 'outro'];
    let t = list[STORY.idx];
    if (t === null) t = G.mode === 'coop' ? playerName(0) + ' and ' + playerName(1) + ' set out together to bring every shard home!' : playerName(0) + ' sets out to bring every shard home!';
    $(STORY.kind === 'intro' ? 'intro-text' : 'story-text').textContent = t;
  },
  storyNext() {
    const list = STORY[STORY.kind === 'intro' ? 'intro' : 'outro'];
    STORY.idx++;
    if (STORY.idx >= list.length) {
      if (STORY.kind === 'intro') { Save.data.introSeen = true; Save.write(); this.map(); }
      else { G.screen = 'clear'; this.showClear(); }
      return;
    }
    this.storyText();
  },
  showClear() {
    const r = G.result || { time: G.levelTime, found: 0, stars: 1 };
    G.screen = 'clear';
    $('clear-title').textContent = G.levelNum === 10 ? 'Shard Recovered!' : 'Level ' + G.levelNum + ' Clear!';
    $('clear-stars').textContent = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
    let rival = r.prev == null ? 'First run! Your Spirit Rival will race you next time.' : r.rival ? '<span class="rival">You beat your Spirit Rival!</span>' : 'Your Spirit Rival was faster this time (' + fmtTime(r.prev) + ').';
    const who = G.mode === 'coop' ? playerName(0) + ' & ' + playerName(1) : playerName(0);
    $('clear-stats').innerHTML = 'Great job, <b>' + who + '</b>!<br>Time: <b>' + fmtTime(r.time) + '</b>' + (r.newBest ? ' &nbsp;NEW BEST!' : '') + '<br>Scrolls found: <b>' + r.found + ' / 3</b><br>' + rival;
    $('btn-next').style.display = G.levelNum < 10 ? '' : 'none';
    this.show('clear');
  },
  syncSettings() {
    const s = Save.data.settings;
    $('set-music').value = Math.round(s.musicVol * 100); $('set-sfx').value = Math.round(s.sfxVol * 100);
    document.querySelectorAll('[data-tog]').forEach(b => { const on = !!s[b.dataset.tog]; b.textContent = on ? 'ON' : 'OFF'; b.classList.toggle('alt', !on); });
    document.querySelectorAll('[data-cyc]').forEach(b => { b.textContent = s.touch.toUpperCase(); b.classList.toggle('alt', s.touch === 'off'); });
    const fsOk = FS.supported() && !FS.standalone;
    $('fs-row').style.display = fsOk ? '' : 'none'; document.querySelector('#scr-title .fsb').style.display = fsOk ? '' : 'none';
    $('fs-set').textContent = FS.active() ? 'ON' : 'OFF'; $('fs-set').classList.toggle('alt', !FS.active());
    $('fs-tip').textContent = !fsOk && !FS.standalone && isTouchDevice ? 'Tip: tap Share, then "Add to Home Screen" to play full screen.' : '';
  },
  toggleMusic() { Save.data.settings.musicOn = !Save.data.settings.musicOn; Sound.applyVolumes(); Save.write(); this.syncSettings(); if (G.screen === 'play') Game.toastMsg(Save.data.settings.musicOn ? 'MUSIC ON' : 'MUSIC OFF', 1.2); },
  MAP_PTS: [[30, 158], [82, 176], [136, 154], [190, 176], [246, 152], [272, 96], [216, 74], [160, 98], [104, 72], [48, 50]],
  MAP_LABEL: [[-14, -16, 'start'],[0, 20], [0, -15], [0, 20], [0, -15], [6, 21, 'end'], [0, -15], [0, 21], [0, -15], [0, -15]],
  buildMap() {
    const svg = $('map-svg'), P = this.MAP_PTS;
    let d = 'M' + P[0][0] + ' ' + P[0][1];
    for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i]; d += ' Q' + (a[0] + b[0]) / 2 + ' ' + ((a[1] + b[1]) / 2 + (i % 2 ? 12 : -12)) + ' ' + b[0] + ' ' + b[1]; }
    let h = '<path d="' + d + '" fill="none" stroke="#8a5a3a" stroke-width="3" stroke-dasharray="6 4" stroke-linecap="round"/>';
    REGIONS.forEach((r, i) => {
      const [x, y] = P[i], play = r.playable, lb = this.MAP_LABEL[i];
      h += '<g class="node" data-act="region" data-rg="' + r.id + '"><circle cx="' + x + '" cy="' + y + '" r="' + (play ? 11 : 8) + '" fill="' + (play ? '#c8303a' : '#8a7a6a') + '" stroke="#3a2418" stroke-width="2"/>' +
        '<text x="' + x + '" y="' + (y + 3.5) + '" text-anchor="middle" font-size="9" font-weight="bold" fill="#fff6e0">' + r.id + '</text>' +
        '<text x="' + (x + lb[0]) + '" y="' + (y + lb[1]) + '" text-anchor="' + (lb[2] || 'middle') + '" font-size="7" font-weight="' + (play ? 'bold' : 'normal') + '" fill="' + (play ? '#8a1f2a' : '#5a3a28') + '">' + r.name + (play ? '' : ' (soon)') + '</text></g>';
    });
    svg.innerHTML = h;
  },
  refreshMap(rg) {
    const region = REGIONS.find(r => r.id === (rg || 1));
    $('btn-mode').textContent = 'Mode: ' + (G.mode === 'coop' ? 'Co-op' : 'Solo');
    $('reg-name').textContent = 'Region ' + region.id + ': ' + region.name;
    const grid = $('lvl-grid'), info = $('lvl-info');
    if (!region.playable) {
      $('reg-desc').textContent = 'Coming soon! This shard is still hidden.';
      grid.innerHTML = ''; info.textContent = 'Recover the first shard in Cherry Blossom Valley, then wait for the next chapter of the quest.';
      $('btn-play').disabled = true; return;
    }
    const R = Save.data.regions[1];
    $('reg-desc').textContent = region.desc + (R.shard ? ' Shard recovered!' : '');
    let h = '';
    for (let n = 1; n <= 10; n++) {
      const lv = Save.level(1, n), locked = n > R.unlocked, st = lv.stars || 0;
      h += '<button data-act="level" data-lv="' + n + '"' + (locked ? ' disabled' : '') + (n === this.selLevel ? ' style="outline:.15em solid #fff;filter:brightness(1.3)"' : '') + '>' +
        (n === 10 ? 'BOSS' : n) + '<span class="st">' + (locked ? '—' : '★'.repeat(st) + '<i>' + '☆'.repeat(3 - st) + '</i>') + '</span></button>';
    }
    grid.innerHTML = h;
    const lv = Save.level(1, this.selLevel), feat = region.intro[this.selLevel - 1];
    const sc = lv.scrolls || 0, nsc = (sc & 1) + ((sc >> 1) & 1) + ((sc >> 2) & 1);
    info.innerHTML = '<b>Level ' + this.selLevel + '</b> — ' + Game.keyText(feat.hint).replace(/^NEW: /, 'New: ') + '<br>Best solo: ' + fmtTime(lv.best.solo) + ' · Best co-op: ' + fmtTime(lv.best.coop) + ' · Scrolls ' + nsc + '/3';
    $('btn-play').disabled = this.selLevel > R.unlocked;
  },
  visibleButtons() { const el = this.current && $('scr-' + this.current); return el ? [...el.querySelectorAll('button:not([disabled]), input')].filter(b => b.offsetParent !== null) : []; },
  menuNav(d, horiz) {
    const list = this.visibleButtons(); if (!list.length) return;
    const a = document.activeElement;
    if (horiz && a && a.type === 'range') { a.value = +a.value + d * 5; a.dispatchEvent(new Event('input')); return; }
    let i = list.indexOf(a); i = i < 0 ? 0 : (i + d + list.length) % list.length; list[i].focus();
  },
  menuActivate() { const a = document.activeElement; if (a && a.tagName === 'BUTTON' && this.visibleButtons().includes(a)) a.click(); else { const l = this.visibleButtons(); if (l[0]) l[0].focus(); } },
  menuBack(isStart) {
    if (G.screen === 'pause' && this.current === 'pause') return this.resume();
    const el = this.current && $('scr-' + this.current); if (!el) return;
    if (isStart && (this.current === 'intro' || this.current === 'story')) return this.storyNext();
    if (el.dataset.back) this.act(el.dataset.back);
  },
  menuKey(e) {
    if (!this.current) return;
    const a = document.activeElement;
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp' || ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && !(a && a.type === 'range'))) {
      e.preventDefault(); this.menuNav(e.code === 'ArrowDown' || e.code === 'ArrowRight' ? 1 : -1);
    } else if (e.code === 'Escape' || (e.code === 'KeyP' && G.screen === 'pause')) { e.preventDefault(); this.menuBack(); }
    else if ((e.code === 'Enter' || e.code === 'Space') && (!a || a.tagName !== 'BUTTON')) { e.preventDefault(); this.menuActivate(); }
  },
};

/* =====================================================================
   14. SAVES  -  one versioned object in localStorage; every access guarded
   ===================================================================== */
const Save = {
  KEY: 'samuraiCombatt.save', VERSION: 1, LAYOUT: 2, data: null, timer: 0,     // key kept from the first build so old progress loads
  defaults() {
    return { version: this.VERSION, layout: this.LAYOUT, introSeen: false, regions: { 1: { unlocked: 1, shard: false, levels: {} } }, ghosts: {}, hints: {},
      profile: [{ name: 'Katana Kid', armor: 0, sash: 0, head: 'band', sword: 'curved' }, { name: 'Blade Buddy', armor: 1, sash: 1, head: 'straw', sword: 'sharp' }],
      settings: { musicVol: CONFIG.audio.musicVol, sfxVol: CONFIG.audio.sfxVol, musicOn: true, shake: true, flashes: true, lowGfx: false, showGhost: true,
                  touch: 'auto', touchBig: false } };
  },
  load() {
    let d = null;
    try { const raw = localStorage.getItem(this.KEY); if (raw) d = JSON.parse(raw); } catch (e) { d = null; }
    const def = this.defaults();
    if (!d || typeof d !== 'object' || d.version !== this.VERSION) d = this.migrate(d, def);
    d.settings = Object.assign(def.settings, d.settings || {});
    d.regions = d.regions || def.regions; if (!d.regions[1]) d.regions[1] = def.regions[1];
    d.ghosts = d.ghosts || {}; d.hints = d.hints || {};
    if (d.layout !== this.LAYOUT) { d.ghosts = {}; d.layout = this.LAYOUT; }       // level layouts changed: old rival runs no longer match
    const LK = CONFIG.looks;
    d.profile = def.profile.map((dp, i) => {
      const p = Object.assign(dp, (d.profile || [])[i] || {});
      p.name = cleanName(String(p.name || '')).trim() || dp.name;
      if (!LK.armor[p.armor]) p.armor = i; if (!LK.sash[p.sash]) p.sash = i;
      if (!LK.head.some(h => h[0] === p.head)) p.head = 'band'; if (!CONFIG.swords[p.sword]) p.sword = 'curved';
      return p;
    });
    if (['auto', 'on', 'off'].indexOf(d.settings.touch) < 0) d.settings.touch = 'auto';
    this.data = d;
  },
  migrate(old, def) { return def; },  // future versions convert old saves here
  key(r, l, m) { return r + '-' + l + '-' + m; },
  level(r, l) {
    const R = this.data.regions[r] || (this.data.regions[r] = { unlocked: 1, levels: {} });
    return R.levels[l] || (R.levels[l] = { best: { solo: null, coop: null }, stars: 0, scrolls: 0 });
  },
  write() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); }
    catch (e) { try { const slim = Object.assign({}, this.data, { ghosts: {} }); localStorage.setItem(this.KEY, JSON.stringify(slim)); } catch (e2) { /* storage unavailable: keep playing */ } }
  },
  writeSoon() { clearTimeout(this.timer); this.timer = setTimeout(() => this.write(), 300); },
};

/* =====================================================================
   15. MAIN LOOP  -  fixed 1/60 s physics with an accumulator, rendering every frame
   ===================================================================== */
let lastTime = 0, acc = 0, slowT = 0, emaMs = 16;
function resetClock() { lastTime = performance.now(); acc = 0; }
function resize() {
  const stage = $('stage'), dpr = window.devicePixelRatio || 1, vw = window.innerWidth, vh = window.innerHeight;
  const s = Math.floor(Math.min(vw * dpr / W, vh * dpr / H));
  let cw, ch;
  if (s >= 2) { cw = W * s / dpr; ch = H * s / dpr; }                     // crisp integer scale
  else { const f = Math.min(vw / W, vh / H); cw = W * f; ch = H * f; }    // tiny windows: fit
  stage.style.width = cw + 'px'; stage.style.height = ch + 'px'; stage.style.fontSize = (cw / W * 7.2) + 'px';
}
function cleanName(s) { return s.replace(/[^A-Za-z0-9 .!?'-]/g, '').slice(0, CONFIG.looks.nameMax); }
function playerName(i) { return Save.data.profile[i].name; }
function applyProfile(i) {                       // rebuild one player's sprites + sword stats after a Dojo change
  const prof = Save.data.profile[i];
  buildPlayerArt(i, prof); PLAYERS[i].setSword(prof.sword); STORY.scenes = {};
}
function drawDojoPreview() {
  const cv = $('dojo-prev'), x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
  x.clearRect(0, 0, cv.width, cv.height);
  const cyc = Math.floor(G.time / 1.1) % TITLE_CYCLE.length, a = ANIM[TITLE_CYCLE[cyc]], t = G.time % 1.1;
  const fr = a.n === 3 ? a.s + Math.min(2, Math.floor(t * 8)) : frameOf(a, t);
  x.drawImage(ART.props.shadow, 14, 37); drawSheet(x, ART.sam.pl[UI.dojoP], fr, 1, 22, 40);
}
function addHomeScreenIcon() {                   // icon for "Add to Home Screen", drawn from the player sprite
  try {
    const c = makeCanvas(180, 180), x = c.ctx, g = x.createLinearGradient(0, 0, 0, 180);
    g.addColorStop(0, '#3b2a62'); g.addColorStop(0.7, '#e27a7e'); g.addColorStop(1, '#ffcf8a'); x.fillStyle = g; x.fillRect(0, 0, 180, 180);
    drawSheet(x, ART.sam.pl[0], ANIM.victory.s, 1, 90, 172, 4, 4);
    const url = c.toDataURL('image/png');
    for (const rel of ['apple-touch-icon', 'icon']) { const l = document.createElement('link'); l.rel = rel; l.href = url; document.head.appendChild(l); }
  } catch (e) { /* icon is optional */ }
}
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastTime) / 1000; lastTime = now;
  if (!(dt > 0)) dt = 0; if (dt > 0.25) dt = 0.25;
  G.time += dt;
  Input.pollGamepads();
  if (G.screen === 'play') {
    if (dt < 0.1 && dt > 0) {
      emaMs = emaMs * 0.9 + dt * 100;
      if (emaMs > CONFIG.quality.slowFrameMs) { slowT += dt; if (slowT > CONFIG.quality.slowFor && !G.quality.auto) { G.quality.auto = true; Game.toastMsg('LOW GRAPHICS ON FOR SMOOTHER PLAY', 2.5); } }
      else slowT = 0;
    }
    acc += Math.min(dt, CONFIG.loop.maxAccum);
    const st = CONFIG.loop.step;
    while (acc >= st) { Game.step(st); acc -= st; if (G.screen !== 'play') { acc = 0; break; } }
  }
  render(dt);
}
function render(dt) {
  if (G.freeze) return;                     // dev harness still frame
  if (G.screen === 'dojo') { renderTitle(dt); drawDojoPreview(); }
  else if (G.screen === 'title' || G.screen === 'map' || G.screen === 'about' || (G.screen === 'settings' && !G.level)) renderTitle(dt);
  else if (G.screen === 'intro' || G.screen === 'story') renderScene(dt);
  else if (G.level) renderWorld(G.screen === 'play' ? dt : 0);
  else renderTitle(dt);
}
function boot() {
  Save.load();
  buildAllArt(Save.data.profile);
  PLAYERS.forEach((p, i) => p.setSword(Save.data.profile[i].sword));
  PFX.init(CONFIG.fx.particles);
  Weather.init();
  Input.init();
  UI.init();
  UI.syncSettings();
  window.addEventListener('resize', resize); resize();
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  if (window.visualViewport) visualViewport.addEventListener('resize', resize);
  for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => { resize(); UI.syncSettings(); });
  UI.touch(false);
  addHomeScreenIcon();
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.screen === 'play') UI.pause(); });
  G.screen = 'title'; UI.show('title');
  Sound.playMusic('valley');
  resetClock();
  requestAnimationFrame(frame);
  if (location.hash.startsWith('#selftest') || location.hash.startsWith('#shot')) runDevHarness(location.hash.slice(1));
}
