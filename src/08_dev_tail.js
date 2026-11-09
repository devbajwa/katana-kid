
/* ---------- developer harness: open with #selftest or #shot=L3@300 (ignored in normal play) ---------- */
function makeBot() {
  let stuck = 0, lastX = 0;
  return function () {
    for (let i = 0; i < G.nPlayers; i++) {
      const inp = Input.players[i], s = G.step + i * 11;
      inp.right = s % 240 < 200; inp.left = !inp.right && s % 240 > 220; inp.jump = s % 40 < 18;
      inp.jumpP = s % 40 === 0 || s % 40 === 10; inp.slashP = s % 17 === 0; inp.dashP = s % 90 === 0; inp.down = s % 120 > 100;
    }
    const p = G.players[0];
    if (p.cx > lastX + 4) { lastX = p.cx; stuck = 0; }
    else if (++stuck > 150) {
      const cs = G.level.chunkStarts; let k = cs.findIndex(c => c.x * TS > p.cx + 8); if (k < 0) k = cs.length - 1;
      for (const q of G.players) if (q.alive) { q.x = (cs[k].x + 1) * TS; q.y = cs[k].floorY * TS - q.h - 1; q.vx = q.vy = 0; }
      stuck = 0; lastX = p.cx;
    }
    if (G.bossFight && G.boss.active && G.step % 15 === 0 && G.boss.state !== 'dying') G.boss.hurt(1, 1);
    if (G.bossDefeated && G.step % 120 === 0) for (const s of Pickups.items) if (s.active && s.kind === 'shard') { p.x = s.cx - p.w / 2; p.y = s.y - 4; }
  };
}
function runDevHarness(mode) {
  const log = (...a) => console.log('[harness] ' + a.join(' '));
  window.addEventListener('error', e => console.error('[harness] ERROR ' + e.message + ' @' + e.lineno));
  if (mode.startsWith('selftest')) {
    const t0 = performance.now(); let errors = 0;
    const a = generateLevel(1, 5, 'solo'), b = generateLevel(1, 5, 'solo');
    log('deterministic=' + a.tiles.every((v, i) => v === b.tiles[i]));
    for (const m of ['solo', 'coop']) for (let n = 1; n <= 10; n++) {
      try {
        G.mode = m; Game.startLevel(n); G.bot = makeBot();
        let maxX = 0, s = 0;
        for (; s < 60 * 120 && !G.finished; s++) {
          Game.step(1 / 60);
          if (G.screen !== 'play') { G.screen = 'play'; UI.show(null); }
          if (s % 20 === 0) renderWorld(1 / 60);
          for (const p of G.players) maxX = Math.max(maxX, p.cx);
        }
        for (let k = 0; k < 150; k++) Game.step(1 / 60);
        const en = Enemies.items.filter(e => e.active).length;
        if (G.boss) log('boss fight=' + G.bossFight + ' state=' + G.boss.state + ' hp=' + G.boss.hp + ' defeated=' + G.bossDefeated + ' active=' + G.boss.active +
          ' shard=' + Pickups.items.filter(p => p.active && p.kind === 'shard').map(p => (p.x | 0) + ',' + (p.y | 0)).join(';') + ' p=' + (G.players[0].x | 0) + ',' + (G.players[0].y | 0));
        log(m + ' L' + n + ' width=' + G.level.w * TS + ' reached=' + (maxX | 0) + ' finished=' + G.finished + ' t=' + G.levelTime.toFixed(1) +
            ' hearts=' + G.players.map(p => p.hearts).join('/') + ' enemiesLeft=' + en + ' cps=' + G.level.checkpoints.length + ' scrolls=' + G.level.spawns.filter(s => s.kind === 'scroll').length +
            ' chunks=' + G.level.chunkStarts.map(c => c.id).join(','));
      } catch (e) { errors++; console.error('[harness] FAIL ' + m + ' L' + n + ' ' + e.stack); }
    }
    try {
      Save.write(); Save.load();
      G.mode = 'coop'; Game.startLevel(2); G.bot = makeBot();
      for (let s = 0; s < 600; s++) { Game.step(1 / 60); if (s % 10 === 0) renderWorld(1 / 60); }
      log('reloaded save: unlocked=' + Save.data.regions[1].unlocked + ' ghostTracks=' + (G.ghostPlay ? G.ghostPlay.length : 0) + ' samples=' + (G.ghostPlay ? G.ghostPlay[0].length / 3 : 0) + ' prevBest=' + (G.prevBest || 0).toFixed(2));
    } catch (e) { errors++; console.error('[harness] FAIL replay ' + e.stack); }
    // every sword x every power-up x every new enemy, with the bot fighting
    try {
      const kinds = {};
      for (const sw of Object.keys(CONFIG.swords)) {
        PLAYERS[0].setSword(sw); PLAYERS[1].setSword(sw);
        G.mode = 'coop'; Game.startLevel(8); G.bot = makeBot();
        const p0 = G.players[0];
        for (const k of ['shield', 'ninja', 'wisp', 'frog']) for (let j = 0; j < 2; j++) { const e = Enemies.get(); if (e) e.init(k, p0.cx + 60 + j * 90, k === 'wisp' ? p0.y : p0.y + p0.h); }
        let kills = 0;
        for (let st = 0; st < 1500; st++) {
          for (const q of G.players) for (const t of CONFIG.powers.timed) q.powers[t] = (st >> 7) % 7 === CONFIG.powers.timed.indexOf(t) ? 5 : 0;
          const before = Enemies.items.filter(e => e.active).length;
          Game.step(1 / 60); if (G.screen !== 'play') { G.screen = 'play'; UI.show(null); }
          if (st % 10 === 0) renderWorld(1 / 60);
          kills += Math.max(0, before - Enemies.items.filter(e => e.active).length);
          for (const e of Enemies.items) if (e.active) kinds[e.kind + '.' + e.state] = 1;
        }
        log('sword ' + sw + ' slash3 dmg=' + PLAYERS[0].attacks.slash3.dmg + ' w=' + PLAYERS[0].attacks.slash1.w + ' kills=' + kills + ' hearts=' + G.players.map(q => q.hearts).join('/'));
      }
      log('enemy states seen: ' + Object.keys(kinds).filter(k => /shield|ninja|wisp|frog/.test(k)).sort().join(' '));
      const pk = Pickups.get(); pk.init('orb', 0, 0, 5); G.players[0].hearts = 1; pk.collect(G.players[0]); log('peach hearts=' + G.players[0].hearts);
      PLAYERS.forEach((q, i) => q.setSword(Save.data.profile[i].sword));
    } catch (e) { errors++; console.error('[harness] FAIL loadout ' + e.stack); }
    G.bot = null; G.screen = 'title'; UI.show('title');
    log('ghost saved=' + Object.keys(Save.data.ghosts).length + ' unlocked=' + Save.data.regions[1].unlocked);
    log('SELFTEST DONE errors=' + errors + ' ms=' + ((performance.now() - t0) | 0));
    return;
  }
  const m = /shot=(\w+)(?:@(\d+))?/.exec(mode); if (!m) return;
  const what = m[1], steps = +(m[2] || 240);
  if (what === 'map') { UI.map(); return; }
  if (what === 'dojo') { UI.act('dojo'); UI.dojoP = steps % 2; Save.data.profile[1].head = ['band', 'straw', 'helmet', 'ninja', 'fox'][(steps >> 1) % 5]; applyProfile(1); UI.buildDojo(); return; }
  if (what === 'about') { UI.act('about'); return; }
  if (what === 'settings') { UI.act('settings'); return; }
  if (what === 'looks') {     // every look/sword combo lined up on the title background
    const keep = Save.data.profile.map(q => Object.assign({}, q));
    G.screen = 'shot'; UI.show(null);
    renderTitle(0);
    CTX.fillStyle = 'rgba(20,10,30,0.6)'; CTX.fillRect(0, 60, W, 170);
    const heads = CONFIG.looks.head, swords = Object.keys(CONFIG.swords);
    for (let i = 0; i < heads.length; i++) for (let j = 0; j < 3; j++) {
      Save.data.profile[0] = Object.assign({}, keep[0], { head: heads[i][0], sword: swords[j], armor: (i + j * 3) % 8, sash: (i + j) % 6 });
      buildPlayerArt(0, Save.data.profile[0]);
      drawSheet(CTX, ART.sam.pl[0], j === 1 ? ANIM.slash2.s + 1 : j === 2 ? ANIM.slash3.s + 1 : ANIM.idle.s, 1, 50 + i * 90, 110 + j * 52, 1.5, 1.5);
    }
    Save.data.profile = keep; buildPlayerArt(0, keep[0]);
    G.freeze = true; return;
  }
  if (what === 'zoo') {       // all enemies + projectiles + powers in one frame
    G.mode = 'solo'; Game.startLevel(3); G.bot = null; G.hintT = 0;
    const p = G.players[0]; p.powers[8] = 5; p.powers[6] = 5;
    const ks = ['soldier', 'shield', 'archer', 'ninja', 'frog', 'crow', 'wisp'];
    Enemies.clear();
    ks.forEach((k, i) => { const e = Enemies.get(); e.init(k, p.cx + 50 + i * 40, (k === 'crow' || k === 'wisp') ? p.y - 30 : p.y + p.h); e.facing = -1; });
    for (let k = 0; k < 9; k++) { const o = Pickups.get(); o.init('orb', p.cx + 20 + k * 22, p.y - 60, k); }
    for (let s2 = 0; s2 < 20; s2++) Game.step(1 / 60);
    Input.players[0].latch.slash = true; for (let s2 = 0; s2 < 5; s2++) Game.step(1 / 60);
    G.screen = 'shot'; UI.show(null); return;
  }
  if (what === 'touch') {     // co-op touch layout over a level
    Save.data.settings.touch = 'on'; G.mode = steps % 2 ? 'coop' : 'solo'; Game.startLevel(2); G.hintT = 0;
    for (let s2 = 0; s2 < 60; s2++) Game.step(1 / 60);
    G.screen = 'play'; UI.touch(true); G.screen = 'shot'; return;
  }
  if (what === 'intro') { G.mode = 'coop'; UI.intro(); STORY.idx = steps % 4; UI.storyText(); return; }
  if (what === 'story') { UI.story(); STORY.idx = steps % 2; return; }
  const lm = /^L(\d+)(c?)$/.exec(what); if (!lm) return;
  G.mode = lm[2] ? 'coop' : 'solo'; Game.startLevel(+lm[1]); G.bot = makeBot(); G.hintT = 99;
  if (+lm[1] === 10) for (const p of G.players) { p.x = G.level.arena.trigger + 20 + p.idx * 20; p.y = G.level.bossSpawn.y - p.h; }
  for (let s = 0; s < steps; s++) { Game.step(1 / 60); if (G.screen !== 'play') break; }
  G.bot = null; if (G.screen === 'play') { G.screen = 'shot'; UI.show(null); }
}

boot();
</script>
</body>
</html>
