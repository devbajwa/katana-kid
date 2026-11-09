
/* =====================================================================
   5. ART GENERATION  -  all pixel art is drawn once at load into offscreen
      canvases (sprite sheets: row 0 faces right, row 1 faces left).
      At runtime we only ever drawImage from these caches.
   ===================================================================== */
const ART = {};
function R(c, col, x, y, w, h) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); }
function ln(c, col, x0, y0, x1, y1, t) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); t = t || 1;
  c.fillStyle = col;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, o = (t - 1) >> 1;
  let e = dx + dy;
  for (let guard = 0; guard < 400; guard++) {
    c.fillRect(x0 - o, y0 - o, t, t);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
function disc(c, col, cx, cy, r) {
  c.fillStyle = col;
  for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y + r * 0.5)); c.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1); }
}
function outline(cv, col) {      // 1px outline around opaque pixels, keeps sprites readable on busy backgrounds
  const x = cv.ctx, w = cv.width, h = cv.height, id = x.getImageData(0, 0, w, h), d = id.data, out = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (d[(j * w + i) * 4 + 3] > 0) continue;
    const a = (ii, jj) => ii >= 0 && jj >= 0 && ii < w && jj < h && d[(jj * w + ii) * 4 + 3] > 120;
    if (a(i - 1, j) || a(i + 1, j) || a(i, j - 1) || a(i, j + 1)) out[j * w + i] = 1;
  }
  x.fillStyle = col;
  for (let k = 0; k < out.length; k++) if (out[k]) x.fillRect(k % w, (k / w) | 0, 1, 1);
}
function buildSheet(fw, fh, frames, drawFn, outlineCol) {
  const n = frames.length, sheet = makeCanvas(fw * n, fh * 2), tmp = makeCanvas(fw, fh, true), s = sheet.ctx;
  frames.forEach((f, i) => {
    tmp.ctx.clearRect(0, 0, fw, fh); drawFn(tmp.ctx, f, i);
    if (outlineCol) outline(tmp, outlineCol);
    s.drawImage(tmp, i * fw, 0);
    s.save(); s.translate(i * fw + fw, fh); s.scale(-1, 1); s.drawImage(tmp, 0, 0); s.restore();
  });
  sheet.fw = fw; sheet.fh = fh; sheet.n = n;
  return sheet;
}
function tinted(src, col) {
  const c = makeCanvas(src.width, src.height);
  c.ctx.drawImage(src, 0, 0); c.ctx.globalCompositeOperation = 'source-in'; c.ctx.fillStyle = col; c.ctx.fillRect(0, 0, c.width, c.height);
  c.fw = src.fw; c.fh = src.fh; c.n = src.n; return c;
}
function single(w, h, fn) { const c = makeCanvas(w, h); fn(c.ctx, c); return c; }

/* ---------- humanoid characters (samurai, foot soldier, archer) ---------- */
const HUM_DEF = { bob: 0, lean: 0, crouch: 0, legB: [-1, 8], legF: [1, 8], armB: [-1, 5], armF: [2, 5], sword: 1.1, hair: 0, sash: 0,
                  eyes: 'open', head: 'samurai', weapon: 'katana', glint: false, draw: false, weaponBehind: false };
function drawHumanoid(c, P, o, X) {
  o = Object.assign({}, HUM_DEF, o);
  const L = o.lean, cr = o.crouch, B = o.bob + cr;
  const sx = X + 13 + L, sy = 15 + B, hipX = X + 16, hipY = 23 + cr, hx = sx, hy = sy - 7;
  const shB = [sx + 1, sy + 2], shF = [sx + 5, sy + 2];
  const hB = [shB[0] + o.armB[0], shB[1] + o.armB[1]], hF = [shF[0] + o.armF[0], shF[1] + o.armF[1]];
  const ca = Math.cos(o.sword), sa = Math.sin(o.sword);
  const weapon = () => {
    const bx = hF[0] + 1, by = hF[1] + 1;
    if (o.weapon === 'katana') {
      // curved: gentle bow along the spine; sharp: straight and bright; heavy: long two-pixel nodachi
      const st = P.swordStyle || 'curved', len = st === 'heavy' ? 16 : st === 'sharp' ? 13 : 12, bow = st === 'curved' ? 0.022 : 0;
      const hiltLen = st === 'heavy' ? -5 : -3, edge = st === 'sharp' ? '#9ff0ff' : P.bladeDark, face = st === 'sharp' ? '#ffffff' : P.blade;
      for (let i = hiltLen; i <= len; i++) {
        const b = i > 1 ? bow * (i - 1) * (i - 1) : 0;
        const x = Math.round(bx + ca * i + sa * b), y = Math.round(by + sa * i - ca * b);
        if (i <= 0) R(c, (i & 1) && st !== 'sharp' ? P.trim : P.hilt, x, y, 1, 1);
        else if (i === 1) { R(c, P.trim, x, y, 1, 1); R(c, P.trim, Math.round(x - sa), Math.round(y + ca), 1, 1); R(c, P.trim, Math.round(x + sa), Math.round(y - ca), 1, 1); }
        else {
          R(c, i >= len - 1 ? edge : face, x, y, 1, 1);
          if (i < len - (st === 'heavy' ? 1 : 2)) R(c, edge, Math.round(x - sa), Math.round(y + ca), 1, 1);
        }
      }
      if (st === 'sharp') { const tx = Math.round(bx + ca * len), ty = Math.round(by + sa * len); R(c, '#ffffff', tx, ty, 1, 1); }
    } else if (o.weapon === 'shield') {
      const x = hF[0] + 1, y = hF[1] - 7;
      R(c, P.hilt, x, y, 5, 14); R(c, P.armor, x + 1, y + 1, 3, 12); R(c, P.armorLight, x + 1, y + 1, 1, 12);
      R(c, P.trim, x + 2, y + 5, 2, 4); R(c, '#ffffff', x + 2, y + 5, 1, 1); R(c, P.armorDark, x + 1, y + 12, 3, 1);
    } else if (o.weapon === 'spear') {
      for (let i = -7; i <= 17; i++) {
        const x = Math.round(bx + ca * i), y = Math.round(by + sa * i);
        if (i < 13) R(c, P.hilt, x, y, 1, 1);
        else if (i === 13) { R(c, P.sash, x, y, 1, 1); R(c, P.sash, Math.round(x - sa), Math.round(y + ca), 1, 2); }
        else { R(c, i === 17 ? P.bladeDark : P.blade, x, y, 1, 1); if (i < 16) R(c, P.bladeDark, Math.round(x - sa), Math.round(y + ca), 1, 1); }
      }
      if (o.glint) { const tx = Math.round(bx + ca * 17), ty = Math.round(by + sa * 17); R(c, '#ffffff', tx - 1, ty, 3, 1); R(c, '#ffffff', tx, ty - 1, 1, 3); R(c, '#fff6a0', tx - 2, ty, 1, 1); R(c, '#fff6a0', tx + 2, ty, 1, 1); }
    } else if (o.weapon === 'bow') {
      for (let dy = -7; dy <= 7; dy++) R(c, P.hilt, bx + 2 - Math.round(2 * (dy / 7) * (dy / 7)), by + dy, 1, 1);
      R(c, P.trim, bx + 1, by - 1, 1, 3);
      if (o.draw) {
        ln(c, '#e8e0d0', bx, by - 7, hB[0] + 1, hB[1] + 1, 1); ln(c, '#e8e0d0', hB[0] + 1, hB[1] + 1, bx, by + 7, 1);
        ln(c, '#c8a070', hB[0] + 1, hB[1] + 1, bx + 5, by, 1); R(c, '#dfe8f0', bx + 5, by - 1, 2, 3);
        if (o.glint) { R(c, '#ffffff', bx + 7, by, 1, 1); R(c, '#ffffff', bx + 6, by - 2, 1, 1); R(c, '#ffffff', bx + 6, by + 2, 1, 1); }
      } else ln(c, '#e8e0d0', bx, by - 7, bx, by + 7, 1);
    }
  };
  if (o.weaponBehind) weapon();
  // back arm
  ln(c, P.armorDark, shB[0], shB[1], hB[0], hB[1], 2); R(c, P.skinDark, hB[0], hB[1], 2, 2);
  // sash tails (trail behind)
  const st = o.sash;
  ln(c, P.sashDark, sx - 1, sy + 7, sx - 3, sy + 8 + st, 1); ln(c, P.sashDark, sx - 3, sy + 8 + st, sx - 5 + Math.min(0, st), sy + 9 + st * 2, 1);
  ln(c, P.sash, sx - 1, sy + 6, sx - 4, sy + 7 + st, 1);
  // legs (hakama)
  const fB = [hipX - 2 + o.legB[0], hipY + o.legB[1]], fF = [hipX + 1 + o.legF[0], hipY + o.legF[1]];
  ln(c, P.clothDark, hipX - 2, hipY, fB[0], fB[1] - 1, 3); R(c, P.sandal, fB[0] - 1, fB[1], 3, 1);
  ln(c, P.cloth, hipX + 1, hipY, fF[0], fF[1] - 1, 3); R(c, P.sandal, fF[0] - 1, fF[1], 3, 1);
  R(c, P.cloth, sx, hipY - 1, 7, 3); R(c, P.clothDark, sx + 3, hipY, 1, 2);
  // torso armour
  R(c, P.armorDark, sx, sy, 7, 7); R(c, P.armor, sx + 1, sy, 5, 6);
  R(c, P.armorDark, sx + 1, sy + 3, 5, 1); R(c, P.armorLight, sx + 4, sy + 1, 1, 2); R(c, P.trim, sx + 2, sy + 1, 1, 1);
  R(c, P.armorLight, sx + 2, sy + 4, 3, 1);
  // sash belt
  R(c, P.sash, sx, sy + 6, 7, 2); R(c, P.sashDark, sx, sy + 7, 7, 1); R(c, P.sashDark, sx + 1, sy + 6, 1, 2);
  // shoulder guards
  R(c, P.armorDark, sx - 1, sy + 1, 3, 4); R(c, P.armor, sx + 5, sy + 1, 3, 4); R(c, P.armorLight, sx + 6, sy + 1, 2, 1); R(c, P.armorDark, sx + 5, sy + 4, 3, 1);
  // head ('samurai' = the player's chosen look)
  const head = o.head === 'samurai' ? (P.headStyle || 'band') : o.head, tl = Math.max(0, -o.hair);
  const face = () => {
    R(c, P.skin, hx + 2, hy + 3, 5, 4); R(c, P.skinDark, hx + 2, hy + 6, 5, 1); R(c, P.skinDark, hx + 4, hy + 5, 1, 1);
    if (o.eyes === 'closed') R(c, P.eye, hx + 4, hy + 4, 2, 1); else { R(c, P.eye, hx + 5, hy + 3, 1, 2); R(c, '#ffffff', hx + 5, hy + 3, 1, 1); R(c, P.eye, hx + 5, hy + 4, 1, 1); }
  };
  if (head === 'straw') {
    R(c, P.hair, hx, hy + 1, 2, 6); face();
    R(c, '#9a7430', hx - 3, hy + 2, 13, 1); R(c, '#d8b060', hx - 2, hy + 1, 11, 1); R(c, '#d8b060', hx, hy, 7, 1);
    R(c, '#d8b060', hx + 2, hy - 1, 3, 1); R(c, '#9a7430', hx + 3, hy - 2, 1, 1);
    R(c, '#f0d890', hx - 1, hy + 1, 3, 1); R(c, '#f0d890', hx + 1, hy, 2, 1); R(c, '#b89048', hx + 6, hy + 1, 3, 1);
    R(c, P.sash, hx, hy + 2, 7, 1);
    ln(c, P.sash, hx - 1, hy + 3, hx - 3 - tl, hy + 4 + (o.hair >> 1), 1);
  } else if (head === 'helmet') {
    face();
    R(c, P.armorDark, hx - 1, hy - 1, 9, 4); R(c, P.armor, hx, hy - 1, 7, 3); R(c, P.armorLight, hx + 1, hy - 1, 3, 1);
    R(c, P.armorDark, hx - 1, hy + 3, 3, 4); R(c, P.armor, hx - 1, hy + 3, 2, 3); R(c, P.trim, hx, hy + 2, 8, 1);
    ln(c, P.trim, hx + 3, hy - 2, hx + 1, hy - 5, 1); ln(c, P.trim, hx + 4, hy - 2, hx + 6, hy - 5, 1); R(c, P.trim, hx + 3, hy - 2, 2, 1);
  } else if (head === 'ninja') {
    R(c, P.clothDark, hx, hy, 7, 7); R(c, P.cloth, hx + 1, hy, 5, 1);
    R(c, P.skin, hx + 3, hy + 3, 4, 2);
    if (o.eyes === 'closed') R(c, P.eye, hx + 4, hy + 4, 2, 1); else { R(c, P.eye, hx + 5, hy + 3, 1, 2); R(c, '#ffffff', hx + 5, hy + 3, 1, 1); }
    R(c, P.sash, hx, hy + 2, 3, 1);
    ln(c, P.sash, hx - 1, hy + 2, hx - 3 - tl, hy + 3 + (o.hair >> 1), 1); ln(c, P.sash, hx - 1, hy + 3, hx - 2 - tl, hy + 5 + (o.hair >> 1), 1);
  } else if (head === 'fox') {
    R(c, P.hair, hx, hy, 7, 3); R(c, P.hair, hx, hy + 3, 2, 4);
    R(c, '#fbf6ee', hx + 2, hy + 2, 5, 5); R(c, '#fbf6ee', hx + 7, hy + 4, 1, 2); R(c, '#d8cfc0', hx + 2, hy + 6, 5, 1);
    R(c, '#fbf6ee', hx + 2, hy, 1, 2); R(c, '#fbf6ee', hx + 5, hy, 1, 2); R(c, '#e0303a', hx + 2, hy + 1, 1, 1); R(c, '#e0303a', hx + 5, hy + 1, 1, 1);
    R(c, '#1d1424', hx + 5, hy + 3, 2, 1); R(c, '#e0303a', hx + 3, hy + 3, 1, 2); R(c, '#e0303a', hx + 6, hy + 5, 1, 1);
    ln(c, P.band, hx - 1, hy + 2, hx - 3 - tl, hy + 3 + (o.hair >> 1), 1);
  } else if (head === 'band') {
    R(c, P.hair, hx, hy, 7, 3); R(c, P.hair, hx, hy + 3, 2, 4);
    R(c, P.skin, hx + 2, hy + 3, 5, 4); R(c, P.skinDark, hx + 2, hy + 6, 5, 1); R(c, P.skinDark, hx + 4, hy + 5, 1, 1);
    if (o.eyes === 'closed') R(c, P.eye, hx + 4, hy + 4, 2, 1); else { R(c, P.eye, hx + 5, hy + 3, 1, 2); R(c, '#ffffff', hx + 5, hy + 3, 1, 1); R(c, P.eye, hx + 5, hy + 4, 1, 1); }
    R(c, P.band, hx, hy + 2, 7, 1);
    ln(c, P.band, hx - 1, hy + 2, hx - 3 - tl, hy + 3 + (o.hair >> 1), 1); ln(c, P.band, hx - 1, hy + 3, hx - 2 - tl, hy + 4 + (o.hair >> 1), 1);
    R(c, P.hair, hx + 2, hy - 1, 3, 1); R(c, P.hair, hx + 2, hy - 2, 2, 1); R(c, P.armor, hx + 3, hy - 1, 1, 1);
    ln(c, P.hair, hx + 1, hy - 2, hx - 2 - tl, hy - 1 + o.hair, 1);
  } else if (o.head === 'jingasa') {
    R(c, P.skin, hx + 1, hy + 2, 6, 5); R(c, P.skinDark, hx + 1, hy + 6, 6, 1);
    if (o.eyes === 'closed') { R(c, P.eye, hx + 3, hy + 4, 1, 1); R(c, P.eye, hx + 5, hy + 4, 1, 1); }
    else R(c, P.eye, hx + 4, hy + 4, 3, 1);
    R(c, P.band, hx - 2, hy + 2, 11, 1); R(c, P.hair, hx - 2, hy + 1, 11, 1); R(c, P.hair, hx, hy, 7, 1);
    R(c, P.hair, hx + 2, hy - 1, 3, 1); R(c, P.trim, hx + 3, hy - 2, 1, 1); R(c, P.band, hx + 1, hy, 1, 1);
  } else { // hood
    R(c, P.hair, hx, hy, 7, 4); R(c, P.hair, hx - 1, hy + 2, 3, 5); R(c, P.armorLight, hx + 1, hy, 4, 1);
    R(c, P.skin, hx + 2, hy + 3, 5, 3); R(c, P.skinDark, hx + 2, hy + 6, 5, 1);
    if (o.eyes === 'closed') R(c, P.eye, hx + 4, hy + 4, 2, 1); else R(c, P.eye, hx + 4, hy + 4, 2, 1), R(c, '#ffffff', hx + 5, hy + 4, 1, 1);
    R(c, P.band, hx, hy + 2, 7, 1); ln(c, P.band, hx - 1, hy + 2, hx - 3, hy + 4, 1);
  }
  // front arm
  ln(c, P.armor, shF[0], shF[1], hF[0], hF[1], 2); R(c, P.skin, hF[0], hF[1], 2, 2);
  if (!o.weaponBehind) weapon();
}

// Samurai animation table (frame ranges in the sheet)
const ANIM = {
  idle: { s: 0, n: 4, fps: 4 }, run: { s: 4, n: 6, fps: 14 }, jump: { s: 10, n: 2, fps: 6, once: 1 }, fall: { s: 12, n: 2, fps: 8 },
  wall: { s: 14, n: 2, fps: 6 }, slash1: { s: 16, n: 3 }, slash2: { s: 19, n: 3 }, slash3: { s: 22, n: 3 }, air: { s: 25, n: 3 },
  down: { s: 28, n: 2, fps: 14 }, hurt: { s: 30, n: 1 }, victory: { s: 31, n: 2, fps: 3 }, dash: { s: 33, n: 1 },
};
const ANIM_IDS = Object.keys(ANIM);
function samuraiFrames() {
  const F = [];
  F.push({}, { hair: 1 }, { bob: 1, hair: 1, armF: [2, 4], armB: [-1, 4] }, { bob: 1, armF: [2, 4], armB: [-1, 4] });
  const RL = [[4, 7], [1, 8], [-2, 8], [-4, 6], [-2, 4], [2, 5]], BOB = [1, 0, 0, 1, 0, 0], AF = [[3, 2], [2, 3], [0, 4], [-2, 4], [0, 4], [2, 3]];
  for (let i = 0; i < 6; i++) F.push({ legF: RL[i], legB: RL[(i + 3) % 6], bob: BOB[i], lean: 1, armF: AF[i], armB: AF[(i + 3) % 6], sword: 2.55, hair: i % 2 ? -2 : -1, sash: i % 2 ? -2 : -1 });
  F.push({ bob: -1, legB: [-3, 5], legF: [3, 4], armF: [3, -1], armB: [-3, 1], sword: -2.2, hair: 2, sash: 2 },
         { legB: [-2, 6], legF: [3, 5], armF: [3, 1], armB: [-3, 2], sword: -1.8, hair: 1, sash: 1 });
  F.push({ legB: [-3, 8], legF: [3, 7], armF: [4, 0], armB: [-4, 0], sword: 0.4, hair: -2, sash: -2 },
         { legB: [-3, 7], legF: [3, 8], armF: [4, 1], armB: [-4, 1], sword: 0.5, hair: -3, sash: -3 });
  F.push({ lean: 1, legB: [-1, 8], legF: [3, 4], armF: [4, -2], armB: [-2, 4], sword: 1.6, hair: -1, sash: 1 },
         { lean: 1, legB: [-1, 8], legF: [3, 4], armF: [4, -3], armB: [-2, 4], sword: 1.6, hair: -2, sash: 2 });
  F.push({ lean: -1, armF: [-2, -3], armB: [-3, 0], sword: -2.7, legB: [-3, 8], legF: [3, 8] },
         { lean: 2, armF: [5, 1], armB: [2, 2], sword: -0.05, legB: [-4, 8], legF: [5, 8], sash: -2 },
         { lean: 1, armF: [4, 4], armB: [1, 4], sword: 0.7, legB: [-4, 8], legF: [4, 8] });
  F.push({ crouch: 1, armF: [0, 5], armB: [-2, 4], sword: 2.4, legB: [-3, 7], legF: [3, 7] },
         { lean: 1, armF: [5, -1], armB: [1, 1], sword: -0.9, legB: [-3, 8], legF: [4, 8] },
         { armF: [3, -5], armB: [0, -2], sword: -1.6, hair: 1, legB: [-3, 8], legF: [3, 8] });
  F.push({ bob: -1, lean: -1, armF: [0, -6], armB: [-1, -5], sword: -2.0, hair: 2, legB: [-3, 8], legF: [2, 7] },
         { lean: 3, crouch: 1, armF: [6, 1], armB: [4, 2], sword: 0.25, legB: [-5, 7], legF: [6, 7], sash: -3, hair: -2 },
         { lean: 2, crouch: 1, armF: [5, 5], armB: [3, 4], sword: 1.2, legB: [-5, 7], legF: [6, 7] });
  F.push({ legB: [-3, 5], legF: [3, 4], armF: [-2, -3], armB: [-3, 0], sword: -2.6, hair: 1 },
         { lean: 1, legB: [-3, 5], legF: [3, 5], armF: [5, 0], armB: [2, 1], sword: 0, sash: -2 },
         { legB: [-3, 6], legF: [3, 6], armF: [4, 4], armB: [1, 3], sword: 0.8 });
  F.push({ legB: [-3, 4], legF: [2, 4], armF: [1, 6], armB: [-1, 6], sword: 1.57, hair: 3, sash: 3 },
         { legB: [-2, 4], legF: [3, 3], armF: [1, 7], armB: [0, 7], sword: 1.57, hair: 4, sash: 4 });
  F.push({ lean: -2, armF: [3, -2], armB: [-4, -1], sword: -0.6, eyes: 'closed', legB: [-3, 7], legF: [3, 8], hair: 2 });
  F.push({ armF: [1, -8], armB: [-2, 4], sword: -1.57 }, { bob: 1, armF: [1, -7], armB: [-2, 4], sword: -1.57, hair: 1, sash: 1 });
  F.push({ lean: 3, crouch: 1, legB: [-6, 6], legF: [2, 7], armF: [-3, 4], armB: [-4, 3], sword: 2.8, hair: -3, sash: -4 });
  return F;
}
const EN_ANIM = {
  soldier: { walk: { s: 0, n: 4, fps: 6 }, alert: { s: 4, n: 1 }, windup: { s: 5, n: 2, fps: 5 }, attack: { s: 7, n: 2, fps: 12 }, stagger: { s: 9, n: 1 } },
  archer: { idle: { s: 0, n: 2, fps: 2 }, walk: { s: 2, n: 2, fps: 6 }, windup: { s: 4, n: 2, fps: 3 }, attack: { s: 6, n: 1 }, stagger: { s: 7, n: 1 } },
  crow: { fly: { s: 0, n: 4, fps: 10 }, swoop: { s: 4, n: 1 }, windup: { s: 5, n: 1 } },
  shield: { walk: { s: 0, n: 4, fps: 5 }, alert: { s: 4, n: 1 }, windup: { s: 5, n: 2, fps: 5 }, attack: { s: 7, n: 2, fps: 12 }, stagger: { s: 9, n: 1 }, block: { s: 10, n: 1 } },
  ninja: { idle: { s: 0, n: 2, fps: 3 }, walk: { s: 2, n: 2, fps: 8 }, jump: { s: 4, n: 1 }, throw: { s: 5, n: 1 }, stagger: { s: 6, n: 1 } },
  wisp: { fly: { s: 0, n: 3, fps: 8 }, spit: { s: 3, n: 1 } },
  frog: { sit: { s: 0, n: 2, fps: 2 }, crouch: { s: 2, n: 1 }, jump: { s: 3, n: 1 } },
  boss: { idle: { s: 0, n: 2, fps: 2 }, walk: { s: 2, n: 2, fps: 5 }, slamWU: { s: 4, n: 1 }, slam: { s: 5, n: 1 }, chargeWU: { s: 6, n: 1 },
          charge: { s: 7, n: 2, fps: 10 }, throwWU: { s: 9, n: 1 }, throw: { s: 10, n: 1 }, stunned: { s: 11, n: 1 }, roar: { s: 12, n: 1 } },
};
function soldierFrames() {
  const b = { head: 'jingasa', weapon: 'spear', sword: -1.25, armF: [3, 3], armB: [-2, 4] };
  return [
    Object.assign({}, b, { legB: [-3, 8], legF: [3, 8] }), Object.assign({}, b, { legB: [-1, 8], legF: [1, 7], bob: 1 }),
    Object.assign({}, b, { legB: [2, 8], legF: [-2, 8] }), Object.assign({}, b, { legB: [0, 7], legF: [0, 8], bob: 1 }),
    Object.assign({}, b, { sword: -1.45, armF: [2, 2] }),
    Object.assign({}, b, { lean: -2, armF: [-3, 3], armB: [-4, 4], sword: 0, legB: [-3, 8], legF: [3, 8] }),
    Object.assign({}, b, { lean: -2, armF: [-3, 3], armB: [-4, 4], sword: 0, legB: [-3, 8], legF: [3, 8], glint: true }),
    Object.assign({}, b, { lean: 2, armF: [5, 2], armB: [3, 3], sword: 0, legB: [-5, 8], legF: [5, 8] }),
    Object.assign({}, b, { lean: 2, armF: [4, 2], armB: [2, 3], sword: 0.05, legB: [-5, 8], legF: [4, 8] }),
    Object.assign({}, b, { lean: -2, armF: [2, -2], sword: -2.2, eyes: 'closed', legB: [-3, 7], legF: [3, 8] }),
  ];
}
function archerFrames() {
  const b = { head: 'hood', weapon: 'bow', armF: [3, 2], armB: [-1, 4] };
  return [
    Object.assign({}, b), Object.assign({}, b, { bob: 1 }),
    Object.assign({}, b, { legB: [-3, 8], legF: [3, 8] }), Object.assign({}, b, { legB: [2, 8], legF: [-2, 8], bob: 1 }),
    Object.assign({}, b, { lean: -1, armF: [5, 0], armB: [0, 0], draw: true }),
    Object.assign({}, b, { lean: -1, armF: [5, 0], armB: [-2, 0], draw: true, glint: true }),
    Object.assign({}, b, { armF: [5, 0], armB: [1, -2] }),
    Object.assign({}, b, { lean: -2, armF: [2, -2], eyes: 'closed', legB: [-3, 7], legF: [3, 8] }),
  ];
}

function shieldFrames() {
  const b = { head: 'helmet', weapon: 'shield', armF: [3, 3], armB: [-2, 4] };
  return [
    { ...b, legB: [-3, 8], legF: [3, 8] }, { ...b, legB: [-1, 8], legF: [1, 7], bob: 1 },
    { ...b, legB: [2, 8], legF: [-2, 8] }, { ...b, legB: [0, 7], legF: [0, 8], bob: 1 },
    { ...b, armF: [3, 2] },
    { ...b, lean: -2, armF: [0, 3], armB: [-4, 4], legB: [-3, 8], legF: [3, 8] },
    { ...b, lean: -3, armF: [-1, 3], armB: [-4, 4], legB: [-4, 8], legF: [3, 8], glint: true },
    { ...b, lean: 3, armF: [7, 2], armB: [2, 3], legB: [-5, 8], legF: [5, 8] },
    { ...b, lean: 3, armF: [6, 2], armB: [2, 3], legB: [-5, 8], legF: [4, 8] },
    { ...b, lean: -2, armF: [1, -1], eyes: 'closed', legB: [-3, 7], legF: [3, 8] },
    { ...b, crouch: 1, lean: 1, armF: [4, 2], legB: [-4, 7], legF: [4, 7] },
  ];
}
function ninjaFrames() {
  const b = { head: 'ninja', weapon: 'katana', sword: 2.5, armF: [2, 5], armB: [-1, 5] };
  return [
    { ...b }, { ...b, bob: 1, hair: 1 },
    { ...b, lean: 1, legB: [-3, 8], legF: [3, 7], sword: 2.7, hair: -2, sash: -2 }, { ...b, lean: 1, legB: [2, 8], legF: [-2, 8], bob: 1, sword: 2.7, hair: -1, sash: -1 },
    { ...b, legB: [-3, 5], legF: [3, 4], armF: [3, -1], armB: [-3, 1], sword: -2.4, hair: 2, sash: 2 },
    { ...b, lean: 1, armF: [6, -1], armB: [-3, 2], sword: 2.6, legB: [-3, 6], legF: [3, 5] },
    { ...b, lean: -2, armF: [2, -2], eyes: 'closed', sword: -2.2, legB: [-3, 7], legF: [3, 8] },
  ];
}
function ell(c, col, cx, cy, rx, ry) { for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / (ry + 0.5)) * (y / (ry + 0.5))))); R(c, col, cx - w, cy + y, w * 2 + 1, 1); } }

/* ---------- Lantern Spook (floating paper lantern) ---------- */
function drawWisp(c, o) {
  const cx = 12, top = 9, fl = o.f % 3;
  disc(c, '#6a4ad0', cx, 6, 3); R(c, '#b8a0ff', cx - 1 + (fl === 1 ? 1 : 0), 1 + (fl === 2 ? 1 : 0), 2, 5); R(c, '#ffffff', cx, 4, 1, 2);
  R(c, '#3a2418', cx - 4, top - 1, 9, 2);
  for (let y = 0; y < 15; y++) { const w = y < 2 || y > 12 ? 11 : 13; R(c, y > 10 ? '#e8d4a8' : '#f6e8c8', cx - (w >> 1), top + 1 + y, w, 1); }
  for (let y = 4; y < 14; y += 3) R(c, '#c8a878', cx - 6, top + y, 13, 1);
  R(c, '#ffd890', cx + 3, top + 3, 2, 6);
  R(c, '#3a2418', cx - 4, top + 16, 9, 2);
  R(c, '#1d1424', cx - 4, top + 5, 2, 3); R(c, '#1d1424', cx + 2, top + 5, 2, 3); R(c, '#ffffff', cx - 4, top + 5, 1, 1); R(c, '#ffffff', cx + 2, top + 5, 1, 1);
  if (o.spit) { R(c, '#3a0a10', cx - 2, top + 9, 5, 4); R(c, '#b890ff', cx - 1, top + 10, 3, 2); }
  else { R(c, '#3a0a10', cx - 2, top + 10, 5, 2); R(c, '#e0485a', cx, top + 11, 2, 3 + (fl === 1 ? 1 : 0)); }
  R(c, '#d8434b', cx - 1, top + 18, 2, 3 + (fl === 2 ? 1 : 0)); R(c, '#ff8a8a', cx - 1, top + 18, 1, 1);
}

/* ---------- Bandit Frog ---------- */
function drawFrog(c, o) {
  const G1 = '#4a9a3a', G2 = '#2e6a2a', G3 = '#8ad06a', BEL = '#e8e0a0', cx = 11, by = 15;
  if (o.pose === 'jump') {
    ln(c, G2, cx - 3, by - 7, cx - 9, by - 1, 2); ln(c, G2, cx - 9, by - 1, cx - 11, by, 1);
    ell(c, G1, cx + 1, by - 8, 6, 4); ell(c, BEL, cx + 2, by - 6, 4, 2);
    ln(c, G2, cx + 4, by - 5, cx + 6, by - 1, 1);
  } else {
    const low = o.pose === 'crouch' ? 1 : 0, br = o.breath ? 1 : 0;
    ell(c, G2, cx - 4, by - 2, 3, 2);
    ell(c, G1, cx, by - 4 + low, 7 + low, 4 - low + br); ell(c, BEL, cx + 2, by - 2 + low, 4, 1);
    R(c, G2, cx + 3, by - 1, 3, 1); R(c, G2, cx - 6, by - 1, 4, 1);
  }
  const ey = o.pose === 'jump' ? by - 13 : by - 9 + (o.pose === 'crouch' ? 1 : 0), ex = cx + (o.pose === 'jump' ? 2 : 1);
  disc(c, G1, ex, ey, 2); disc(c, G1, ex + 4, ey, 2); R(c, '#ffffff', ex - 1, ey - 1, 2, 2); R(c, '#ffffff', ex + 3, ey - 1, 2, 2);
  R(c, '#1d1424', ex, ey, 1, 1); R(c, '#1d1424', ex + 4, ey, 1, 1);
  R(c, '#d8434b', ex - 3, ey + 1, 10, 1); ln(c, '#d8434b', ex - 3, ey + 1, ex - 6, ey + 3 + (o.pose === 'jump' ? -1 : 0), 1);
  R(c, G3, ex - 1, ey - 2, 1, 1); R(c, '#1d1424', ex + 3, ey + 4, 4, 1);
}

/* ---------- crow spirit ---------- */
function drawCrow(c, o) {
  const K = '#1c1428', K2 = '#3e2c58', PU = '#9a5ad0', BEAK = '#f0b030', cx = 16, cy = 13;
  const EYE = o.angry ? '#ff4040' : '#ffe060';
  ln(c, K2, cx - 5, cy, cx - 10, cy + 2, 2); ln(c, PU, cx - 9, cy + 2, cx - 13, cy + 1 + (o.tail || 0), 1); ln(c, K2, cx - 5, cy + 1, cx - 9, cy + 4, 1);
  for (let dy = -3; dy <= 3; dy++) { const w = Math.round(6 * Math.sqrt(1 - (dy / 3.6) * (dy / 3.6))); R(c, K, cx - w, cy + dy, w * 2 + 1, 1); }
  R(c, K2, cx - 3, cy + 1, 6, 1); R(c, PU, cx - 2, cy - 2, 3, 1);
  disc(c, K, cx + 6, cy - 2, 3);
  R(c, EYE, cx + 7, cy - 3, 1, 1); if (o.angry) R(c, EYE, cx + 8, cy - 3, 1, 1);
  if (o.beakOpen) { R(c, BEAK, cx + 9, cy - 3, 3, 1); R(c, BEAK, cx + 9, cy, 3, 1); R(c, '#801020', cx + 9, cy - 2, 2, 2); }
  else { R(c, BEAK, cx + 9, cy - 2, 3, 1); R(c, BEAK, cx + 9, cy - 1, 2, 1); }
  R(c, '#c08a30', cx - 1, cy + 3, 1, 2); R(c, '#c08a30', cx + 1, cy + 3, 1, 2);
  const tips = { up: [cx - 4, cy - 12], mid: [cx - 10, cy - 4], down: [cx - 5, cy + 8], spread: [cx - 1, cy - 12], swept: [cx - 12, cy - 1] };
  const t = tips[o.wing];
  for (let k = 0; k < 4; k++) ln(c, k % 2 ? K2 : K, cx + 1 - k, cy - 1, t[0] + k, t[1] + k, 1);
  R(c, PU, t[0], t[1], 2, 1);
  if (o.wing === 'spread') { for (let k = 0; k < 3; k++) ln(c, K, cx + 2 + k, cy - 1, cx + 5 + k, cy - 11 + k, 1); R(c, PU, cx + 5, cy - 11, 2, 1); }
}

/* ---------- Red Oni Gatekeeper (72x72 frames, feet at bottom) ---------- */
function drawOni(c, o) {
  o = Object.assign({ bob: 0, lean: 0, crouch: 0, club: -2.2, clubBehind: false, armF: [-2, -6], armB: [-2, 12], mouth: 'grin', eyes: 'n', boulder: false, legs: 0 }, o);
  const X = 4, Y = 8, L = o.lean, B = o.bob + o.crouch;
  const SK = '#d8443a', SKD = '#8e2626', SKL = '#f2765a', HAIR = '#2a1626', HORN = '#f4e6c4', TIG = '#f2b630', TIGD = '#2a1a10';
  const CLUB = '#4a4658', CLUBL = '#7a7690', STUD = '#d8d4e8';
  const shF = [X + 44 + L, Y + 24 + B], hF = [shF[0] + o.armF[0], shF[1] + o.armF[1]];
  const club = () => {
    const ca = Math.cos(o.club), sa = Math.sin(o.club);
    for (let i = -4; i <= 30; i++) { const x = hF[0] + ca * i, y = hF[1] + sa * i, r = i < 6 ? 1 : i < 10 ? 2 : 3; R(c, i < 6 ? '#6a3a2a' : CLUB, x - r, y - r, r * 2 + 1, r * 2 + 1); }
    for (let i = 10; i <= 30; i += 4) { const x = hF[0] + ca * i, y = hF[1] + sa * i; R(c, STUD, x - sa * 3, y + ca * 3, 1, 1); R(c, STUD, x + sa * 3, y - ca * 3, 1, 1); R(c, CLUBL, x, y, 1, 1); }
  };
  if (o.clubBehind) club();
  const lb = o.legs === 1 ? -3 : o.legs === 2 ? 3 : 0;
  R(c, SKD, X + 21 + lb, Y + 46 + o.crouch, 10, 64 - 46 - o.crouch - 3 + 2); R(c, SKD, X + 18 + lb, Y + 61, 13, 3);
  R(c, SKD, X + 34 - lb, Y + 46 + o.crouch, 10, 64 - 46 - o.crouch - 3 + 2); R(c, SK, X + 35 - lb, Y + 47 + o.crouch, 8, 13 - o.crouch); R(c, SKD, X + 33 - lb, Y + 61, 13, 3);
  // back arm
  const shB = [X + 20 + L, Y + 24 + B], hB = [shB[0] + o.armB[0], shB[1] + o.armB[1]];
  ln(c, SKD, shB[0], shB[1], hB[0], hB[1], 7); disc(c, SKD, hB[0], hB[1], 4);
  // torso
  R(c, SKD, X + 17 + L, Y + 20 + B, 31, 25); R(c, SK, X + 18 + L, Y + 21 + B, 29, 23);
  R(c, SKL, X + 25 + L, Y + 30 + B, 16, 11); R(c, SKD, X + 32 + L, Y + 23 + B, 1, 6); R(c, SKD, X + 25 + L, Y + 28 + B, 6, 1); R(c, SKD, X + 35 + L, Y + 28 + B, 6, 1);
  R(c, SKL, X + 20 + L, Y + 22 + B, 8, 2);
  // tiger loincloth + rope belt
  R(c, TIG, X + 18 + L, Y + 42 + B, 30, 9); for (let i = 0; i < 6; i++) R(c, TIGD, X + 20 + L + i * 5, Y + 43 + B, 2, 3 + (i % 2) * 3);
  R(c, '#e8e0d0', X + 17 + L, Y + 41 + B, 32, 2); R(c, '#b8b0a0', X + 30 + L, Y + 41 + B, 3, 4);
  // head
  const hx = X + 23 + L, hy = Y + 4 + B;
  R(c, HAIR, hx - 3, hy + 2, 6, 14);
  R(c, SKD, hx, hy + 1, 21, 18); R(c, SK, hx + 1, hy + 2, 19, 16); R(c, SKL, hx + 13, hy + 3, 5, 2);
  R(c, HAIR, hx - 1, hy - 1, 23, 5); for (let i = 0; i < 6; i++) R(c, HAIR, hx - 2 + i * 4, hy - 3 + (i % 2), 3, 3);
  ln(c, HORN, hx + 4, hy, hx + 2, hy - 7, 2); ln(c, HORN, hx + 17, hy, hx + 20, hy - 7, 2); R(c, '#ffffff', hx + 2, hy - 7, 1, 1); R(c, '#ffffff', hx + 20, hy - 7, 1, 1);
  const glow = o.eyes === 'glow';
  if (o.eyes === 'dizzy') { ln(c, '#ffe14a', hx + 7, hy + 7, hx + 10, hy + 10, 1); ln(c, '#ffe14a', hx + 10, hy + 7, hx + 7, hy + 10, 1); ln(c, '#ffe14a', hx + 13, hy + 7, hx + 16, hy + 10, 1); ln(c, '#ffe14a', hx + 16, hy + 7, hx + 13, hy + 10, 1); }
  else {
    R(c, HAIR, hx + 6, hy + 5, 6, 2); R(c, HAIR, hx + 13, hy + 5, 6, 2);
    R(c, glow ? '#ffffff' : '#ffe14a', hx + 7, hy + 7, 4, 3); R(c, glow ? '#ffffff' : '#ffe14a', hx + 14, hy + 7, 4, 3);
    R(c, glow ? '#ff3020' : '#000000', hx + 9, hy + 8, 2, 2); R(c, glow ? '#ff3020' : '#000000', hx + 16, hy + 8, 2, 2);
  }
  R(c, SKD, hx + 11, hy + 10, 3, 3);
  if (o.mouth === 'roar') { R(c, '#3a0a10', hx + 5, hy + 12, 13, 6); R(c, '#c8303a', hx + 8, hy + 15, 7, 2); R(c, '#fffaf0', hx + 6, hy + 12, 2, 3); R(c, '#fffaf0', hx + 15, hy + 12, 2, 3); R(c, '#fffaf0', hx + 8, hy + 16, 1, 2); R(c, '#fffaf0', hx + 14, hy + 16, 1, 2); }
  else { R(c, '#3a0a10', hx + 6, hy + 13, 11, 3); R(c, '#fffaf0', hx + 7, hy + 13, 9, 1); R(c, '#fffaf0', hx + 7, hy + 12, 1, 3); R(c, '#fffaf0', hx + 15, hy + 12, 1, 3); }
  if (o.boulder) { disc(c, '#6a5a4e', hx + 10, hy - 9, 8); disc(c, '#8a7a6a', hx + 9, hy - 10, 6); R(c, '#a89888', hx + 6, hy - 14, 3, 2); R(c, '#5a4a40', hx + 12, hy - 6, 3, 1); }
  // front arm
  ln(c, SK, shF[0], shF[1], hF[0], hF[1], 7); disc(c, SK, hF[0], hF[1], 4); R(c, SKL, shF[0] - 2, shF[1] - 3, 4, 2);
  R(c, '#c8b060', shF[0] - 3, shF[1] + 5, 7, 2);
  if (!o.clubBehind) club();
}
function oniFrames() {
  return [
    {}, { bob: 1 }, { legs: 1 }, { legs: 2, bob: 1 },
    { lean: -3, armF: [-6, -16], club: -1.9, eyes: 'glow', mouth: 'roar' },
    { lean: 4, crouch: 3, armF: [8, 6], club: 0.9 },
    { lean: 5, crouch: 5, armF: [0, 4], club: 2.5, eyes: 'glow', armB: [4, 10] },
    { lean: 6, crouch: 3, legs: 1, armF: [0, 3], club: 2.7, mouth: 'roar', eyes: 'glow' },
    { lean: 6, crouch: 3, legs: 2, armF: [0, 3], club: 2.7, mouth: 'roar', eyes: 'glow' },
    { crouch: 3, armF: [-14, -14], armB: [8, -16], boulder: true, clubBehind: true, club: -2.5, mouth: 'roar' },
    { lean: 4, armF: [10, -4], armB: [6, 2], clubBehind: true, club: -2.5 },
    { lean: -3, eyes: 'dizzy', mouth: 'roar', armF: [4, 8], club: 1.4, armB: [-4, 12] },
    { bob: -1, armF: [2, -12], club: -1.6, eyes: 'glow', mouth: 'roar', armB: [-6, -6] },
  ];
}

/* ---------- slash arcs ---------- */
function arcCanvas(size, r0, r1, a0, a1, cols, alphaMul, trim) {
  const cv = makeCanvas(size, size), id = cv.ctx.createImageData(size, size), d = id.data, cx = size / 2, cy = size / 2, span = a1 - a0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.sqrt(dx * dx + dy * dy);
    if (r < r0 || r > r1) continue;
    let a = Math.atan2(dy, dx), t = -1;
    for (const k of [0, 2 * Math.PI, -2 * Math.PI]) { const tt = (a + k - a0) / span; if (tt >= 0 && tt <= 1) { t = tt; break; } }
    if (t < trim) continue;
    const rr = (r - r0) / (r1 - r0), col = rr > 0.72 ? cols[0] : rr > 0.4 ? cols[1] : cols[2];
    const i = (y * size + x) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = Math.round(255 * alphaMul * (0.2 + 0.8 * t) * (rr > 0.15 ? 1 : 0.5));
  }
  cv.ctx.putImageData(id, 0, 0); return cv;
}
const ARC_DEFS = { slash1: [10, 21, -1.9, 1.0], slash2: [10, 21, 1.3, -1.5], slash3: [11, 27, -2.6, 1.3], air: [11, 23, -2.5, 1.7], down: [7, 19, 0.35, 2.8], thrust: [9, 18, -0.5, 0.5] };

/* ---------- bitmap font (3x5) ---------- */
const FONT_GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
  ':': '000010000010000', '.': '000000000000010', '!': '010010010000010', '?': '110001010000010', '-': '000000111000000',
  '/': '001001010100100', ',': '000000000010100', "'": '010010000000000', '+': '000010111010000', '%': '101001010100101',
  '(': '010100100100010', ')': '010001001001010', '*': '000101010101000', ' ': '000000000000000', 'x': '000101010101000',
};
const FONT_CHARS = Object.keys(FONT_GLYPHS).join('');
const FONT_INDEX = {}; for (let i = 0; i < FONT_CHARS.length; i++) FONT_INDEX[FONT_CHARS[i]] = i;
const fontAtlases = {};
function fontAtlas(col) {
  if (fontAtlases[col]) return fontAtlases[col];
  const cv = makeCanvas(FONT_CHARS.length * 4, 5);
  for (let i = 0; i < FONT_CHARS.length; i++) { const g = FONT_GLYPHS[FONT_CHARS[i]]; for (let k = 0; k < 15; k++) if (g[k] === '1') R(cv.ctx, col, i * 4 + (k % 3), (k / 3) | 0, 1, 1); }
  return (fontAtlases[col] = cv);
}
function textWidth(str, scale) { return (str.length * 4 - 1) * (scale || 1); }
function drawText(ctx, str, x, y, col, scale, align, shadow) {
  scale = scale || 1; str = String(str).toUpperCase();
  const w = textWidth(str, scale);
  if (align === 'center') x -= w >> 1; else if (align === 'right') x -= w;
  x = Math.round(x); y = Math.round(y);
  if (shadow !== false) drawGlyphs(ctx, str, x + scale, y + scale, fontAtlas(CONFIG.colors.hud.shadow), scale);
  drawGlyphs(ctx, str, x, y, fontAtlas(col || CONFIG.colors.hud.text), scale);
}
function drawGlyphs(ctx, str, x, y, atlas, s) {
  for (let i = 0; i < str.length; i++) {
    const gi = FONT_INDEX[str[i]]; if (gi === undefined || gi === FONT_INDEX[' ']) continue;
    ctx.drawImage(atlas, gi * 4, 0, 3, 5, x + i * 4 * s, y, 3 * s, 5 * s);
  }
}
const textCache = new Map();
function textImage(str, col, scale) {   // cached pre-rendered label (built once per unique string)
  const key = str + '|' + col + '|' + scale;
  let c = textCache.get(key);
  if (!c) { c = makeCanvas(textWidth(str, scale) + scale + 1, 5 * scale + scale + 1); drawText(c.ctx, str, 0, 0, col, scale); textCache.set(key, c); }
  return c;
}

/* ---------- particles atlas: 8x8 cells, rows = type, cols = 4 life frames ---------- */
const PT = { PETAL: 0, DUST: 1, SPARK: 2, SMOKE: 3, INK: 4, FIRE: 5, WOOD: 6, GLOW: 7, ROCK: 8, BOLT: 9, SHARD: 10, LEAF: 11 };
function buildParticles() {
  const cv = makeCanvas(32, 12 * 8), c = cv.ctx;
  for (let f = 0; f < 4; f++) {
    const ox = f * 8;
    // petal (rotating)
    const pr = [[2, 3, 3, 2], [3, 3, 2, 3], [3, 2, 2, 2], [3, 3, 3, 2]][f];
    R(c, '#f7b2ca', ox + 2, 2, pr[0], pr[1]); R(c, '#ffd6e4', ox + 2, 2, 1, 1); R(c, '#e07a9a', ox + 1 + pr[0], 1 + pr[1], 1, 1);
    disc(c, ['#e8dccb', '#d8cbb8', '#c4b6a2', '#b0a290'][f], ox + 4, 8 + 4, [1, 2, 3, 3][f]);
    if (f === 3) { c.clearRect(ox + 2, 8 + 2, 1, 1); c.clearRect(ox + 5, 8 + 5, 1, 1); }
    const sc = ['#ffffff', '#fff6a0', '#ffd24a', '#ff9a3a'][f], sl = [3, 3, 2, 1][f];
    R(c, sc, ox + 4 - sl, 16 + 4, sl * 2 + 1, 1); R(c, sc, ox + 4, 16 + 4 - sl, 1, sl * 2 + 1); if (f < 2) R(c, '#ffffff', ox + 3, 16 + 3, 3, 3);
    disc(c, ['#bfb2d0', '#a596bc', '#8a7aa6', '#6e5e8a'][f], ox + 4, 24 + 4, [2, 3, 3, 2][f]); if (f < 3) R(c, '#e0d8ec', ox + 3, 24 + 2, 2, 1);
    disc(c, '#1a1424', ox + 4, 32 + 4, [2, 2, 1, 1][f]); if (f === 0) R(c, '#4a3a6a', ox + 3, 32 + 3, 1, 1);
    disc(c, ['#fff2a0', '#ffc040', '#ff7a2a', '#c83a20'][f], ox + 4, 40 + 4, [2, 3, 2, 1][f]); if (f < 2) R(c, '#ffffff', ox + 4, 40 + 3, 1, 1);
    R(c, ['#a0703a', '#8a5a2a', '#a0703a', '#6a4422'][f], ox + 2, 48 + 3, f % 2 ? 2 : 4, f % 2 ? 4 : 2);
    const gl = [3, 2, 2, 1][f]; R(c, '#ffffff', ox + 4 - gl, 56 + 4, gl * 2 + 1, 1); R(c, '#ffffff', ox + 4, 56 + 4 - gl, 1, gl * 2 + 1); R(c, '#bff0ff', ox + 4, 56 + 4, 1, 1);
    R(c, ['#8a8496', '#7a7488', '#6a6478', '#5a5468'][f], ox + 2, 64 + 2, 4 - (f >> 1), 3 - (f >> 1)); R(c, '#a8a2b8', ox + 2, 64 + 2, 1, 1);
    ln(c, ['#ffffff', '#fff27a', '#ffe14a', '#80e0ff'][f], ox + 2, 72 + 1, ox + 5, 72 + 3, 1); ln(c, '#fff27a', ox + 5, 72 + 3, ox + 3, 72 + 6, 1);
    R(c, ['#ffffff', '#bfe6ff', '#7fc8ff', '#4a90ff'][f], ox + 3, 80 + 2, 2, 4 - (f >> 1)); R(c, '#ffffff', ox + 3, 80 + 2, 1, 1);
    R(c, ['#7ab85a', '#5a9a4a', '#7ab85a', '#4a8a3a'][f], ox + 2, 88 + 3, f % 2 ? 2 : 3, f % 2 ? 3 : 2);
  }
  return cv;
}

/* ---------- tiles ---------- */
const TILE = { EMPTY: 0, GROUND: 1, STONE: 2, WALL: 3, ROOF: 4, PLAT: 5, BRIDGE: 6, CRUMBLE: 7, SPIKE: 8, GATE: 9 };
const SOLID = [0, 1, 1, 1, 1, 0, 0, 0, 1, 1];
const ONEWAY = [0, 0, 0, 0, 0, 1, 1, 1, 0, 0];
const TV = { GROUND: 0, STONE: 16, WALL: 32, WALLWIN: 33, ROOFTOP: 34, ROOF: 35, PLAT: 36, BRIDGE: 37, CRUMBLE: 38, CRACKED: 39, SPIKE: 40, GATE: 41 };
function buildTiles() {
  const cv = makeCanvas(256, 48), c = cv.ctx, rng = mulberry32(77);
  for (let f = 0; f < 16; f++) {
    // ground: flags 1 top, 2 left, 4 right, 8 bottom exposed
    let ox = f * 16, oy = 0;
    R(c, '#6b4430', ox, oy, 16, 16);
    for (let k = 0; k < 14; k++) R(c, rng() < 0.5 ? '#5a3826' : '#7d5238', ox + ((rng() * 15) | 0), oy + 2 + ((rng() * 13) | 0), 2, 1);
    for (let k = 0; k < 2; k++) { const sx = ox + 2 + ((rng() * 11) | 0), sy = oy + 6 + ((rng() * 8) | 0); R(c, '#8a6a52', sx, sy, 3, 2); R(c, '#a88a70', sx, sy, 1, 1); }
    if (f & 2) { R(c, '#3e2418', ox, oy, 1, 16); R(c, '#55331f', ox + 1, oy, 1, 16); }
    if (f & 4) { R(c, '#3e2418', ox + 15, oy, 1, 16); R(c, '#55331f', ox + 14, oy, 1, 16); }
    if (f & 8) R(c, '#3e2418', ox, oy + 15, 16, 1);
    if (f & 1) {
      R(c, '#5aa04a', ox, oy, 16, 4); R(c, '#3e7a3a', ox, oy + 4, 16, 1); R(c, '#2e5a2e', ox, oy + 5, 16, 1);
      for (let i = 0; i < 16; i += 2) if (rng() < 0.6) R(c, '#3e7a3a', ox + i, oy + 5, 1, 1 + ((rng() * 2) | 0));
      for (let i = 0; i < 5; i++) R(c, '#8ad06a', ox + ((rng() * 16) | 0), oy + ((rng() * 2) | 0), 1, 1);
      if (rng() < 0.4) R(c, '#f7b2ca', ox + 3 + ((rng() * 10) | 0), oy + 1, 1, 1);
      if (f & 2) R(c, '#3e7a3a', ox, oy, 1, 6);
      if (f & 4) R(c, '#3e7a3a', ox + 15, oy, 1, 6);
    }
    // stone blocks
    ox = f * 16; oy = 16;
    R(c, '#7a7488', ox, oy, 16, 16);
    R(c, '#4e4a5a', ox, oy + 7, 16, 1); R(c, '#4e4a5a', ox + 7, oy, 1, 7); R(c, '#4e4a5a', ox + 3, oy + 8, 1, 8); R(c, '#4e4a5a', ox + 11, oy + 8, 1, 8);
    R(c, '#9a94aa', ox + 1, oy + 1, 5, 1); R(c, '#9a94aa', ox + 9, oy + 1, 5, 1); R(c, '#9a94aa', ox + 5, oy + 9, 5, 1);
    for (let k = 0; k < 6; k++) R(c, '#6a6478', ox + ((rng() * 15) | 0), oy + ((rng() * 15) | 0), 1, 1);
    if (f & 2) R(c, '#3a3644', ox, oy, 1, 16);
    if (f & 4) R(c, '#3a3644', ox + 15, oy, 1, 16);
    if (f & 8) R(c, '#3a3644', ox, oy + 15, 16, 1);
    if (f & 1) { R(c, '#c0bad0', ox, oy, 16, 1); R(c, '#5a8a4a', ox, oy, 16, 2); for (let i = 0; i < 4; i++) R(c, '#5a8a4a', ox + ((rng() * 15) | 0), oy + 2, 2, 1 + ((rng() * 2) | 0)); }
  }
  let ox = 0, oy = 32;
  // house wall plain / window
  for (let v = 0; v < 2; v++) {
    ox = (32 + v) * 16 - 256 * 2;
    R(c, '#eadfc8', ox, oy, 16, 16); R(c, '#5a3a28', ox, oy, 2, 16); R(c, '#5a3a28', ox + 14, oy, 2, 16); R(c, '#5a3a28', ox, oy + 7, 16, 2);
    R(c, '#d6c8ac', ox + 2, oy + 9, 12, 1);
    if (v) { R(c, '#f8f0dc', ox + 3, oy + 1, 10, 5); for (let i = 0; i < 3; i++) R(c, '#8a6a4a', ox + 5 + i * 3, oy + 1, 1, 5); R(c, '#8a6a4a', ox + 3, oy + 3, 10, 1); R(c, '#ffd890', ox + 4, oy + 2, 1, 1); }
  }
  // roof top & inner
  for (let v = 0; v < 2; v++) {
    ox = (34 + v) * 16 - 512;
    R(c, '#3a3f5a', ox, oy, 16, 16);
    for (let row = 0; row < 4; row++) for (let i = 0; i < 4; i++) { R(c, '#525a7a', ox + i * 4 + (row % 2) * 2, oy + row * 4, 3, 3); R(c, '#6a74a0', ox + i * 4 + (row % 2) * 2, oy + row * 4, 1, 1); }
    if (v === 0) { R(c, '#252a40', ox, oy, 16, 2); R(c, '#7a84b0', ox, oy, 16, 1); for (let i = 0; i < 16; i += 4) R(c, '#9aa4d0', ox + i + 1, oy, 2, 1); }
  }
  // platform / bridge / crumble
  ox = 36 * 16 - 512;
  R(c, '#6a4422', ox, oy, 16, 6); R(c, '#b07a40', ox, oy, 16, 4); R(c, '#d09a5a', ox, oy, 16, 1); R(c, '#4a2c16', ox + 7, oy + 1, 1, 3); R(c, '#4a2c16', ox + 15, oy + 1, 1, 3); R(c, '#3a2410', ox + 3, oy + 2, 1, 1); R(c, '#3a2410', ox + 11, oy + 2, 1, 1);
  R(c, '#5a3a20', ox + 2, oy + 6, 2, 3); R(c, '#5a3a20', ox + 12, oy + 6, 2, 3);
  ox = 37 * 16 - 512;
  for (let i = 0; i < 4; i++) { R(c, '#a06a34', ox + i * 4, oy + 1, 3, 4); R(c, '#c88a4a', ox + i * 4, oy + 1, 3, 1); }
  R(c, '#d8c090', ox, oy, 16, 1); R(c, '#8a6a4a', ox, oy + 6, 16, 1); ln(c, '#8a6a4a', ox, oy + 6, ox + 8, oy + 8, 1); ln(c, '#8a6a4a', ox + 8, oy + 8, ox + 15, oy + 6, 1);
  for (let v = 0; v < 2; v++) {
    ox = (38 + v) * 16 - 512;
    R(c, '#7a5a3a', ox, oy, 16, 5); R(c, '#a88058', ox, oy, 16, 3); R(c, '#c8a078', ox, oy, 16, 1);
    ln(c, '#3a2410', ox + 4, oy, ox + 6, oy + 4, 1); ln(c, '#3a2410', ox + 11, oy + 1, ox + 10, oy + 4, 1);
    if (v) { ln(c, '#3a2410', ox + 1, oy + 2, ox + 4, oy + 3, 1); ln(c, '#3a2410', ox + 13, oy, ox + 15, oy + 3, 1); ln(c, '#3a2410', ox + 7, oy + 1, ox + 9, oy + 2, 1); }
  }
  // spikes
  ox = 40 * 16 - 512;
  R(c, '#3a3644', ox, oy + 14, 16, 2);
  for (let i = 0; i < 4; i++) { const bx = ox + i * 4; for (let y = 0; y < 8; y++) { const w = Math.max(1, Math.round((y + 1) / 2)); R(c, '#b8c0d0', bx + 2 - (w >> 1), oy + 6 + y, w, 1); } R(c, '#ffffff', bx + 2, oy + 6, 1, 2); R(c, '#6a7080', bx + 3, oy + 11, 1, 3); }
  // gate
  ox = 41 * 16 - 512;
  R(c, '#2a2430', ox, oy, 16, 16); for (let i = 0; i < 4; i++) { R(c, '#5a5468', ox + 1 + i * 4, oy, 2, 16); R(c, '#8a84a0', ox + 1 + i * 4, oy, 1, 16); }
  R(c, '#9a2a30', ox, oy + 2, 16, 2); R(c, '#9a2a30', ox, oy + 12, 16, 2);
  return cv;
}

/* ---------- props ---------- */
function buildProps() {
  const P = {};
  P.tree = single(80, 84, (c) => {
    const rng = mulberry32(5);
    ln(c, '#3a2420', 40, 84, 40, 46, 6); ln(c, '#4a2e26', 41, 84, 41, 50, 2);
    ln(c, '#3a2420', 40, 54, 22, 34, 3); ln(c, '#3a2420', 40, 50, 60, 30, 3); ln(c, '#3a2420', 40, 46, 38, 24, 3); ln(c, '#3a2420', 26, 38, 14, 36, 2); ln(c, '#3a2420', 56, 34, 68, 36, 2);
    R(c, '#2a1a18', 34, 82, 13, 2);
    const blobs = [[22, 30, 12], [40, 20, 14], [58, 28, 12], [12, 36, 8], [68, 36, 8], [30, 16, 9], [50, 14, 9], [40, 34, 10]];
    for (const b of blobs) disc(c, '#b8607e', b[0], b[1] + 2, b[2]);
    for (const b of blobs) disc(c, '#e88aac', b[0], b[1], b[2] - 1);
    for (const b of blobs) disc(c, '#f8b8cc', b[0] - 2, b[1] - 3, Math.max(2, b[2] - 6));
    for (let k = 0; k < 70; k++) { const b = blobs[(rng() * blobs.length) | 0], a = rng() * 6.28, r = rng() * b[2]; R(c, rng() < 0.5 ? '#ffe0ea' : '#c86a8a', b[0] + Math.cos(a) * r, b[1] + Math.sin(a) * r, 1, 1); }
  });
  P.lantern = single(14, 24, (c) => {
    R(c, '#5a5668', 3, 22, 8, 2); R(c, '#8a8496', 5, 14, 4, 8); R(c, '#7a7488', 2, 12, 10, 2);
    R(c, '#8a8496', 3, 6, 8, 6); R(c, '#ffcf6a', 5, 7, 4, 4); R(c, '#fff2b0', 6, 8, 2, 2);
    R(c, '#6a6478', 1, 4, 12, 2); R(c, '#8a8496', 3, 2, 8, 2); R(c, '#9a94aa', 6, 0, 2, 2); R(c, '#a8a2b8', 1, 4, 12, 1);
  });
  P.house = single(76, 60, (c) => {
    R(c, '#eadfc8', 8, 28, 60, 32); R(c, '#5a3a28', 8, 28, 3, 32); R(c, '#5a3a28', 65, 28, 3, 32); R(c, '#5a3a28', 8, 42, 60, 2); R(c, '#5a3a28', 36, 28, 2, 32);
    R(c, '#f8f0dc', 14, 31, 18, 9); for (let i = 0; i < 4; i++) R(c, '#8a6a4a', 17 + i * 4, 31, 1, 9); R(c, '#8a6a4a', 14, 35, 18, 1); R(c, '#ffd890', 15, 32, 2, 2);
    R(c, '#7a5232', 44, 44, 16, 16); R(c, '#5a3a20', 51, 44, 2, 16); R(c, '#c8a070', 45, 46, 5, 12);
    for (let y = 0; y < 20; y++) { const w = 38 + y * 2; R(c, y < 2 ? '#7a84b0' : y % 3 === 0 ? '#2a3048' : '#3a4262', 38 - w / 2, 8 + y, w, 1); }
    R(c, '#252a40', 0, 27, 76, 2); R(c, '#2a3048', -2, 26, 6, 2); R(c, '#2a3048', 72, 26, 6, 2); R(c, '#7a84b0', 0, 25, 3, 1); R(c, '#7a84b0', 73, 25, 3, 1);
    R(c, '#252a40', 18, 5, 40, 3); R(c, '#9aa4d0', 18, 5, 40, 1);
  });
  P.grass = [];
  for (let f = 0; f < 4; f++) P.grass.push(single(12, 8, (c) => {
    const sw = [0, 1, 0, -1][f];
    const bl = [[1, 4], [3, 7], [5, 5], [7, 8], [9, 5], [10, 3]];
    for (const b of bl) ln(c, b[0] % 4 === 1 ? '#3e7a3a' : '#6ab85a', b[0], 7, b[0] + sw * (b[1] > 5 ? 2 : 1), 8 - b[1], 1);
    R(c, '#8ad06a', 3 + sw * 2, 1, 1, 1);
  }));
  P.flowers = single(10, 6, (c) => { ln(c, '#3e7a3a', 2, 5, 2, 2, 1); ln(c, '#3e7a3a', 7, 5, 7, 1, 1); R(c, '#f7b2ca', 1, 1, 3, 2); R(c, '#ffffff', 6, 0, 3, 2); R(c, '#ffd24a', 2, 1, 1, 1); R(c, '#ffd24a', 7, 0, 1, 1); });
  // checkpoint shrine: frame 0 unlit, 1-3 lit flicker
  P.shrine = buildSheet(24, 30, [0, 1, 2, 3], (c, f) => {
    R(c, '#5a5668', 2, 27, 20, 3); R(c, '#7a7488', 4, 25, 16, 2);
    R(c, '#8a8496', 6, 12, 12, 13); R(c, '#6a6478', 6, 12, 1, 13); R(c, '#a8a2b8', 17, 12, 1, 13);
    R(c, '#2a2430', 9, 15, 6, 7);
    R(c, '#5a3a28', 2, 8, 20, 4); R(c, '#3a2418', 0, 10, 24, 2); R(c, '#9a2a30', 4, 6, 16, 2); R(c, '#c83a40', 4, 6, 16, 1);
    R(c, '#f2c14e', 11, 3, 2, 3);
    if (f > 0) {
      const fl = [[0, 0], [1, -1], [0, 1]][f - 1];
      R(c, '#ff9a3a', 10 + fl[0], 17 + fl[1], 4, 4); R(c, '#ffd24a', 11 + fl[0], 16 + fl[1], 2, 4); R(c, '#ffffff', 11 + fl[0], 18, 2, 2);
      R(c, '#f2c14e', 9, 22, 6, 1);
    }
  });
  P.torii = single(68, 64, (c) => {
    R(c, '#2a1420', 13, 16, 6, 48); R(c, '#2a1420', 49, 16, 6, 48);
    R(c, '#d0303a', 14, 16, 4, 46); R(c, '#d0303a', 50, 16, 4, 46); R(c, '#ff6a60', 14, 16, 1, 46); R(c, '#ff6a60', 50, 16, 1, 46);
    R(c, '#1b1220', 12, 58, 8, 6); R(c, '#1b1220', 48, 58, 8, 6);
    R(c, '#d0303a', 6, 18, 56, 4); R(c, '#2a1420', 6, 22, 56, 1);
    R(c, '#1b1220', 0, 6, 68, 5); R(c, '#2a2030', 2, 4, 64, 2); R(c, '#d0303a', 2, 11, 64, 4); R(c, '#ff6a60', 2, 11, 64, 1);
    R(c, '#1b1220', 0, 4, 4, 3); R(c, '#1b1220', 64, 4, 4, 3);
    R(c, '#1b1220', 30, 14, 8, 6); R(c, '#f2c14e', 32, 15, 4, 4);
  });
  P.spiritLantern = buildSheet(14, 20, [0, 1, 2], (c, f) => {
    const body = f === 2 ? '#ffffff' : '#f4d8a0', glow = f === 2 ? '#ffffff' : ['#ffb84a', '#ffcf6a'][f];
    R(c, '#3a2418', 6, 0, 2, 3); R(c, '#5a3a28', 3, 3, 8, 2);
    R(c, body, 2, 5, 10, 11); R(c, glow, 4, 7, 6, 7); R(c, '#c83a40', 2, 8, 10, 1); R(c, '#c83a40', 2, 12, 10, 1);
    R(c, '#5a3a28', 3, 16, 8, 2); R(c, '#c83a40', 6, 18, 2, 2);
    if (f !== 2) { R(c, '#1b1220', 5, 9, 1, 1); R(c, '#1b1220', 8, 9, 1, 1); R(c, '#1b1220', 6, 11, 2, 1); }
  }, '#2a1420');
  P.log = single(36, 12, (c) => {
    R(c, '#5a3a20', 0, 1, 36, 10); R(c, '#8a5a30', 1, 2, 34, 7); R(c, '#a8743e', 1, 3, 34, 2);
    for (let i = 4; i < 34; i += 7) R(c, '#5a3a20', i, 3, 3, 1);
    disc(c, '#c89a60', 2, 6, 4); disc(c, '#8a5a30', 2, 6, 2); R(c, '#5a3a20', 2, 6, 1, 1);
    R(c, '#3a2410', 16, 0, 4, 12);
  });
  P.ropeDot = single(2, 2, (c) => { R(c, '#c8a070', 0, 0, 2, 2); R(c, '#8a6a4a', 1, 1, 1, 1); });
  P.orbs = []; P.icons = [];
  const PC = CONFIG.powers.colors;
  for (let t = 0; t < PC.length; t++) {
    P.orbs.push(buildSheet(18, 18, [0, 1, 2, 3], (c, f) => {
      const r = [7, 8, 8, 7][f];
      disc(c, PC[t] + '55', 9, 9, r + 1); disc(c, PC[t], 9, 9, 6); disc(c, '#ffffff', 8, 8, 3);
      drawIcon(c, t, 4, 4, true); R(c, '#ffffff', 6, 5, 2, 1);
    }));
    P.icons.push(single(10, 10, (c) => { R(c, '#1b1220', 0, 0, 10, 10); R(c, PC[t], 1, 1, 8, 8); drawIcon(c, t, 0, 0, false); }));
  }
  P.scroll = buildSheet(14, 12, [0, 1], (c, f) => {
    R(c, '#e8d8b0', 3, 2, 8, 8); R(c, '#c8b080', 3, 8, 8, 1); R(c, '#8a2a30', 1, 1, 2, 10); R(c, '#8a2a30', 11, 1, 2, 10);
    R(c, '#5a3a28', 5, 4, 4, 1); R(c, '#5a3a28', 5, 6, 3, 1); R(c, '#f2c14e', 1, 5, 2, 2); R(c, '#f2c14e', 11, 5, 2, 2);
    if (f) { R(c, '#ffffff', 4, 2, 1, 1); R(c, '#ffffff', 12, 0, 1, 1); }
  }, '#2a1420');
  P.shard = buildSheet(14, 18, [0, 1], (c, f) => {
    disc(c, f ? '#7fd8ff55' : '#7fd8ff33', 7, 9, 7);
    for (let y = 0; y < 14; y++) { const w = y < 7 ? Math.ceil((y + 1) / 2) : Math.ceil((14 - y) / 2.5); R(c, '#8ae0ff', 7 - (w >> 1), 2 + y, w, 1); }
    R(c, '#ffffff', 6, 4, 1, 6); R(c, '#3a90d0', 8, 9, 1, 5);
  });
  P.boulder = buildSheet(16, 16, [0, 1, 2, 3], (c, f) => {
    disc(c, '#5a4a40', 8, 8, 7); disc(c, '#7a6a5a', 7, 7, 6);
    const a = f * Math.PI / 2;
    for (let k = 0; k < 3; k++) { const ang = a + k * 2.1; R(c, '#9a8a78', 8 + Math.cos(ang) * 3, 8 + Math.sin(ang) * 3, 2, 2); }
    R(c, '#4a3a30', 8 + Math.cos(a + 1) * 4, 8 + Math.sin(a + 1) * 4, 2, 1);
  }, '#1b1220');
  P.shock = buildSheet(22, 18, [0, 1, 2], (c, f) => {
    const hgt = [12, 15, 13][f];
    for (let x = 0; x < 22; x++) { const h = Math.round(hgt * Math.sin(Math.PI * x / 22)); if (h <= 0) continue; R(c, '#ff8a3a', x, 18 - h, 1, h); R(c, '#ffd24a', x, 18 - Math.round(h * 0.6), 1, Math.round(h * 0.6)); }
    R(c, '#fff2b0', 8, 18 - 4, 6, 4); R(c, '#ffffff', 4 + f * 4, 18 - hgt + 3, 1, 1);
  }, '#5a1a10');
  P.arrow = buildSheet(12, 5, [0], (c) => { R(c, '#c8a070', 1, 2, 9, 1); R(c, '#dfe8f0', 9, 1, 2, 3); R(c, '#ffffff', 11, 2, 1, 1); R(c, '#e8e0d0', 0, 1, 2, 1); R(c, '#e8e0d0', 0, 3, 2, 1); });
  P.arrowGlow = tinted(P.arrow, '#bff0ff');
  P.fire = buildSheet(12, 14, [0, 1, 2], (c, f) => {
    const s = [0, 1, -1][f];
    disc(c, '#c83a20', 6, 10, 3); disc(c, '#ff7a2a', 6 + s, 9, 3); disc(c, '#ffc040', 6, 9, 2); R(c, '#ff7a2a', 5 + s, 3, 2, 4); R(c, '#fff2a0', 6, 8, 1, 2);
  });
  P.heart = [];
  const heartShape = (c, col, dark, hl) => { R(c, col, 1, 1, 3, 4); R(c, col, 5, 1, 3, 4); R(c, col, 0, 2, 9, 3); R(c, col, 1, 5, 7, 1); R(c, col, 2, 6, 5, 1); R(c, col, 3, 7, 3, 1); R(c, col, 4, 8, 1, 1); R(c, dark, 2, 6, 5, 1); if (hl) R(c, hl, 1, 2, 2, 1); };
  P.heart.push(single(10, 10, c => heartShape(c, '#ff4a5a', '#b02030', '#ffd0d8')));
  P.heart.push(single(10, 10, c => heartShape(c, '#4a9aff', '#2050b0', '#d0e8ff')));
  P.heart.push(single(10, 10, c => heartShape(c, '#3a2a40', '#2a1e30', null)));
  P.heart.push(single(10, 10, c => heartShape(c, '#cfe8ff', '#8ab0e0', '#ffffff')));
  for (const h of P.heart) outline(h, '#1b1220');
  P.alert = single(5, 10, c => { R(c, '#1b1220', 0, 0, 5, 10); R(c, '#ffd24a', 1, 1, 3, 5); R(c, '#ffd24a', 1, 7, 3, 2); });
  P.ring = [];
  for (let f = 0; f < 12; f++) P.ring.push(single(18, 18, c => {
    for (let k = 0; k < 24; k++) { const a = -Math.PI / 2 + k / 24 * Math.PI * 2; R(c, k < (f + 1) * 2 ? '#ffe14a' : '#3a2a50', 9 + Math.cos(a) * 7 - 1, 9 + Math.sin(a) * 7 - 1, 2, 2); }
  }));
  P.warn = [single(9, 9, c => { for (let i = 0; i < 5; i++) R(c, '#ffe14a', 1 + i, 4 - i, 1, i * 2 + 1); R(c, '#1b1220', 6, 3, 2, 3); }), null];
  P.warn[1] = single(9, 9, c => c.save() || (c.translate(9, 0), c.scale(-1, 1), c.drawImage(P.warn[0], 0, 0), c.restore()));
  P.dizzy = buildSheet(18, 6, [0, 1], (c, f) => { for (let k = 0; k < 3; k++) { const a = f * 1.0 + k * 2.1; R(c, '#ffe14a', 8 + Math.cos(a) * 7, 2 + Math.sin(a) * 2, 2, 2); } });
  P.spiritFlame = buildSheet(10, 12, [0, 1], (c, f) => { disc(c, '#bfe6ff', 5, 8, 3); R(c, '#ffffff', 4 + f, 3, 2, 5); R(c, '#bfe6ff', 3 - f, 5, 1, 2); });
  P.shadow = single(16, 4, c => { c.fillStyle = 'rgba(20,10,30,0.32)'; c.fillRect(3, 0, 10, 4); c.fillRect(1, 1, 14, 2); });
  P.star = buildSheet(9, 9, [0, 1], (c, f) => {
    if (f) { R(c, '#c8d0e0', 4, 0, 1, 9); R(c, '#c8d0e0', 0, 4, 9, 1); R(c, '#8a94aa', 3, 3, 3, 3); }
    else { ln(c, '#c8d0e0', 1, 1, 7, 7, 1); ln(c, '#c8d0e0', 7, 1, 1, 7, 1); R(c, '#8a94aa', 3, 3, 3, 3); }
    R(c, '#ffffff', 4, 4, 1, 1);
  }, '#1b1220');
  P.ember = buildSheet(10, 10, [0, 1], (c, f) => { disc(c, '#6a4ad0', 5, 5, 4); disc(c, f ? '#c0a8ff' : '#a088ff', 5, 5, 3); R(c, '#ffffff', 4 + f, 3, 2, 2); });
  P.goldGlint = single(7, 7, c => { R(c, '#fff6c0', 3, 0, 1, 7); R(c, '#fff6c0', 0, 3, 7, 1); R(c, '#ffffff', 2, 2, 3, 3); });
  P.shieldBubble = single(26, 30, c => { for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; R(c, k % 3 ? '#9fd2ff' : '#ffffff', 13 + Math.cos(a) * 11, 15 + Math.sin(a) * 13, 1, 1); } });
  return P;
}
function drawIcon(c, t, ox, oy, small) {
  const k = '#1b1220';
  if (t === 0) { R(c, k, ox + 4, oy + 2, 2, 6); R(c, k, ox + 3, oy + 3, 1, 4); R(c, k, ox + 6, oy + 4, 1, 3); R(c, '#fff2a0', ox + 4, oy + 5, 2, 2); }
  else if (t === 1) { R(c, k, ox + 2, oy + 3, 5, 1); R(c, k, ox + 6, oy + 2, 1, 1); R(c, k, ox + 3, oy + 5, 5, 1); R(c, k, ox + 2, oy + 7, 4, 1); R(c, k, ox + 7, oy + 6, 1, 1); }
  else if (t === 2) { R(c, k, ox + 2, oy + 2, 6, 4); R(c, k, ox + 3, oy + 6, 4, 1); R(c, k, ox + 4, oy + 7, 2, 1); R(c, '#ffffff', ox + 3, oy + 3, 4, 2); }
  else if (t === 3) { R(c, k, ox + 5, oy + 1, 2, 3); R(c, k, ox + 3, oy + 4, 4, 1); R(c, k, ox + 4, oy + 5, 2, 3); R(c, k, ox + 3, oy + 8, 2, 1); }
  else if (t === 4) { R(c, k, ox + 3, oy + 2, 4, 1); R(c, k, ox + 2, oy + 3, 6, 4); R(c, k, ox + 1, oy + 7, 8, 1); R(c, k, ox + 4, oy + 8, 2, 1); R(c, '#ffffff', ox + 3, oy + 3, 1, 3); }
  else if (t === 5) { R(c, k, ox + 3, oy + 3, 4, 6); R(c, k, ox + 2, oy + 4, 6, 4); R(c, '#3e7a3a', ox + 5, oy + 1, 2, 2); R(c, '#ffffff', ox + 3, oy + 4, 1, 2); }
  else if (t === 6) { ln(c, k, ox + 2, oy + 8, ox + 8, oy + 2, 2); R(c, k, ox + 1, oy + 5, 4, 1); R(c, k, ox + 4, oy + 5, 1, 4); R(c, '#ffffff', ox + 7, oy + 2, 1, 1); }
  else if (t === 7) { for (let i = 0; i < 2; i++) { ln(c, k, ox + 1 + i * 4, oy + 2, ox + 4 + i * 4, oy + 5, 1); ln(c, k, ox + 4 + i * 4, oy + 5, ox + 1 + i * 4, oy + 8, 1); } }
  else { R(c, k, ox + 4, oy + 1, 2, 2); R(c, k, ox + 1, oy + 3, 8, 2); R(c, k, ox + 2, oy + 5, 6, 2); R(c, k, ox + 2, oy + 7, 2, 2); R(c, k, ox + 6, oy + 7, 2, 2); R(c, '#ffffff', ox + 4, oy + 3, 1, 2); }
}

/* ---------- parallax backgrounds (Cherry Blossom Valley at sunrise) ---------- */
function buildBackground() {
  const B = {}, SKY = CONFIG.colors.sky, BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  B.sky = single(W, H, c => {
    const bands = SKY.length - 1;
    for (let y = 0; y < H; y++) {
      const t = Math.pow(y / (H * 0.78), 1.15) * bands, i = Math.min(bands - 1, Math.floor(t)), f = Math.min(1, t - i);
      for (let x = 0; x < W; x += 4) {
        for (let k = 0; k < 4; k++) { const th = BAYER[(y % 4) * 4 + ((x + k) % 4)] / 16; c.fillStyle = f > th ? SKY[i + 1] : SKY[i]; c.fillRect(x + k, y, 1, 1); }
      }
    }
    const sx = 330, sy = 178;
    for (let r = 46; r > 30; r -= 4) { c.globalAlpha = 0.12; disc(c, '#fff0c0', sx, sy, r); }
    c.globalAlpha = 1; disc(c, '#ffe9b0', sx, sy, 28); disc(c, '#fff8e0', sx - 3, sy - 3, 22);
    const rng = mulberry32(9);
    for (let k = 0; k < 7; k++) { const cx = rng() * W, cy = 40 + rng() * 100, w = 40 + rng() * 70; R(c, '#f6a8a0', cx, cy, w, 2); R(c, '#ffd0b0', cx + 6, cy - 1, w - 16, 1); R(c, '#c87890', cx + 4, cy + 2, w - 8, 1); }
    for (let k = 0; k < 30; k++) R(c, '#ffffff', rng() * W, rng() * 50, 1, 1);
  });
  const ridge = (w, x, amps, base) => { let y = base; for (const a of amps) y += Math.sin(2 * Math.PI * a[0] * x / w + a[2]) * a[1]; return y; };
  const layer = (w, h, fn) => { const c = makeCanvas(w, h); fn(c.ctx, w, h); return c; };
  B.layers = [];
  B.layers.push({ f: 0.05, fy: 0.02, base: '#7c5c90', img: layer(640, 150, (c, w, h) => {
    for (let x = 0; x < w; x++) {
      const y = Math.round(ridge(w, x, [[2, 26, 0.3], [5, 12, 1.1], [11, 5, 2.0]], 60));
      R(c, '#7c5c90', x, y, 1, h - y);
      const lit = Math.cos(2 * Math.PI * 2 * x / w + 0.3) > 0;
      if (lit) R(c, '#9c7aa6', x, y, 1, Math.max(0, 70 - y) + 6);
      if (y < 48) R(c, '#f4e2ee', x, y, 1, Math.min(6, 48 - y + 2));
    }
  }) });
  B.layers.push({ f: 0.14, fy: 0.05, base: '#5c3f72', img: layer(720, 130, (c, w, h) => {
    for (let x = 0; x < w; x++) { const y = Math.round(ridge(w, x, [[3, 16, 0.8], [7, 7, 2.3], [13, 3, 0.2]], 62)); R(c, '#5c3f72', x, y, 1, h - y); R(c, '#6e4f84', x, y, 1, 2); }
    const pag = (px, py) => { for (let t = 0; t < 4; t++) { const ww = 22 - t * 4, yy = py - t * 9; R(c, '#3e2a52', px - ww / 2, yy, ww, 3); R(c, '#4a3460', px - ww / 2 + 3, yy + 3, ww - 6, 6); R(c, '#ffb060', px - 1, yy + 4, 2, 2); } R(c, '#3e2a52', px, py - 40, 1, 6); };
    pag(170, Math.round(ridge(w, 170, [[3, 16, 0.8], [7, 7, 2.3], [13, 3, 0.2]], 62)) + 4);
    pag(520, Math.round(ridge(w, 520, [[3, 16, 0.8], [7, 7, 2.3], [13, 3, 0.2]], 62)) + 4);
    const rng = mulberry32(3);
    for (let k = 0; k < 40; k++) { const x = rng() * w, y = ridge(w, x, [[3, 16, 0.8], [7, 7, 2.3], [13, 3, 0.2]], 62); R(c, '#4a3262', x, y - 6, 3, 7); R(c, '#4a3262', x - 1, y - 4, 5, 3); }
  }) });
  B.layers.push({ f: 0.3, fy: 0.1, base: '#45305e', img: layer(800, 110, (c, w, h) => {
    const rng = mulberry32(4);
    for (let x = 0; x < w; x++) { const y = Math.round(ridge(w, x, [[2, 10, 2.1], [6, 6, 0.4], [9, 3, 1.3]], 58)); R(c, '#45305e', x, y, 1, h - y); }
    for (let k = 0; k < 26; k++) {
      const x = rng() * w, y = ridge(w, x, [[2, 10, 2.1], [6, 6, 0.4], [9, 3, 1.3]], 58), r = 5 + rng() * 6;
      R(c, '#3a2840', x, y - r, 2, r + 2); disc(c, '#a8648c', x, y - r - 2, r); disc(c, '#c47aa0', x - 1, y - r - 4, Math.max(2, r - 3));
      if (x < 12) { disc(c, '#a8648c', x + w, y - r - 2, r); disc(c, '#c47aa0', x + w - 1, y - r - 4, Math.max(2, r - 3)); }
      if (x > w - 12) { disc(c, '#a8648c', x - w, y - r - 2, r); disc(c, '#c47aa0', x - w - 1, y - r - 4, Math.max(2, r - 3)); }
    }
  }) });
  B.layers.push({ f: 0.55, fy: 0.18, base: '#2e2242', img: layer(900, 90, (c, w, h) => {
    const rng = mulberry32(8);
    R(c, '#2e2242', 0, 70, w, 20);
    let x = 0;
    while (x < w - 40) {
      const hw = 34 + ((rng() * 30) | 0), hh = 16 + ((rng() * 14) | 0), base = 72;
      R(c, '#2e2242', x + 4, base - hh, hw - 8, hh);
      for (let y = 0; y < 10; y++) R(c, y === 0 ? '#4a3c66' : '#251a36', x + 9 - y, base - hh - 10 + y, hw - 18 + y * 2, 1);
      if (rng() < 0.8) { R(c, '#ffb060', x + 10, base - hh + 5, 3, 3); R(c, '#ffd890', x + 11, base - hh + 6, 1, 1); }
      if (rng() < 0.5) R(c, '#ffb060', x + hw - 16, base - hh + 6, 3, 3);
      x += hw + 6 + ((rng() * 30) | 0);
    }
    for (let k = 0; k < 14; k++) { const tx = rng() * w; R(c, '#251a36', tx, 50, 2, 25); disc(c, '#3a2a50', tx, 46, 7); }
  }) });
  B.mist = [0, 1].map(k => single(480, 48, c => {
    const rng = mulberry32(20 + k);
    for (let i = 0; i < 26; i++) { c.globalAlpha = 0.07 + rng() * 0.07; const x = rng() * 480, y = 10 + rng() * 26, w = 60 + rng() * 120; c.fillStyle = '#fff0f4'; c.fillRect(x, y, w, 6 + rng() * 8); if (x + w > 480) c.fillRect(x - 480, y, w, 8); }
    c.globalAlpha = 1;
  }));
  B.rays = single(W, H, c => {
    for (let k = 0; k < 6; k++) {
      const a = -2.1 + k * 0.32 + (k % 2) * 0.1;
      c.globalAlpha = 0.05 + (k % 3) * 0.02; c.fillStyle = '#fff2c8'; c.beginPath(); c.moveTo(330, 178);
      c.lineTo(330 + Math.cos(a - 0.06) * 600, 178 + Math.sin(a - 0.06) * 600); c.lineTo(330 + Math.cos(a + 0.06) * 600, 178 + Math.sin(a + 0.06) * 600); c.fill();
    }
    c.globalAlpha = 1;
  });
  return B;
}

// player palette = base colours + the Dojo choices (armour, sash, look, sword)
function playerPalette(idx, prof) {
  const LK = CONFIG.looks, A = LK.armor[prof.armor] || LK.armor[0], S = LK.sash[prof.sash] || LK.sash[0];
  return Object.assign({}, idx ? CONFIG.colors.p2 : CONFIG.colors.p1,
    { armor: A[1], armorDark: A[2], armorLight: A[3], sash: S[1], sashDark: S[2], headStyle: prof.head, swordStyle: prof.sword },
    prof.sword === 'heavy' ? { blade: '#dfe6f2', bladeDark: '#7d8aa0' } : null);
}
// 40x36 frames (feet at the bottom, body centred) leave room for hats and long blades
function samSheet(P, outlineCol) { return buildSheet(40, 36, SAM_FRAMES, (c, f) => { c.save(); c.translate(4, 4); drawHumanoid(c, P, f, 0); c.restore(); }, outlineCol); }
let SAM_FRAMES = null;
function buildPlayerArt(idx, prof) {
  const sheet = samSheet(playerPalette(idx, prof), '#1b1220');
  ART.sam.pl[idx] = sheet; ART.sam.flash[idx] = tinted(sheet, '#ffffff'); ART.sam.gold[idx] = tinted(sheet, '#ffd84a');
  ART.sam[idx ? 'p2' : 'p1'] = sheet;
  ART.nameLabel[idx] = textImage(prof.name || (idx ? 'P2' : 'P1'), idx ? CONFIG.colors.hud.p2 : CONFIG.colors.hud.p1, 1);
}
function buildAllArt(profiles) {
  const CC = CONFIG.colors;
  SAM_FRAMES = samuraiFrames();
  ART.sam = { pl: [], flash: [], gold: [], ghost: samSheet(Object.assign({ headStyle: 'band', swordStyle: 'curved' }, CC.ghost), '#7f8fc8') };
  ART.nameLabel = [];
  buildPlayerArt(0, profiles[0]); buildPlayerArt(1, profiles[1]);
  ART.soldier = buildSheet(56, 32, soldierFrames(), (c, f) => drawHumanoid(c, CC.soldier, f, 12), '#120c18');
  ART.archer = buildSheet(48, 32, archerFrames(), (c, f) => drawHumanoid(c, CC.archer, f, 8), '#120c18');
  ART.shield = buildSheet(48, 32, shieldFrames(), (c, f) => drawHumanoid(c, CC.shield, f, 8), '#120c18');
  ART.ninja = buildSheet(48, 36, ninjaFrames(), (c, f) => { c.save(); c.translate(0, 4); drawHumanoid(c, CC.ninja, f, 8); c.restore(); }, '#120c18');
  ART.crow = buildSheet(32, 24, [{ wing: 'up' }, { wing: 'mid', tail: 1 }, { wing: 'down' }, { wing: 'mid', tail: -1 }, { wing: 'swept', angry: true }, { wing: 'spread', angry: true, beakOpen: true }], drawCrow, '#3a1a4a');
  ART.wisp = buildSheet(24, 32, [{ f: 0 }, { f: 1 }, { f: 2 }, { f: 0, spit: true }], drawWisp, '#2a1430');
  ART.frog = buildSheet(24, 18, [{ pose: 'sit' }, { pose: 'sit', breath: true }, { pose: 'crouch' }, { pose: 'jump' }], (c, f) => { c.save(); c.translate(0, 2); drawFrog(c, f); c.restore(); }, '#122010');
  ART.boss = buildSheet(72, 72, oniFrames(), drawOni, '#1b0a10');
  for (const k of ['soldier', 'archer', 'shield', 'ninja', 'crow', 'wisp', 'frog', 'boss']) ART[k + 'Flash'] = tinted(ART[k], '#ffffff');
  ART.arcs = {};
  const ARC_COLS = [[[255, 255, 255], [190, 230, 255], [120, 170, 255]], [[255, 246, 170], [255, 170, 60], [230, 80, 30]],   // curved, flame
                    [[230, 255, 255], [120, 240, 230], [40, 190, 200]], [[255, 240, 255], [210, 170, 255], [140, 90, 230]]];  // sharp, heavy
  for (const k in ARC_DEFS) {
    const d = ARC_DEFS[k], mk = (cols) => buildSheet(64, 64, [0, 1, 2], (c, f) => c.drawImage(arcCanvas(64, d[0] + f * 2, d[1], d[2], d[3], cols, [1, 0.7, 0.4][f], f * 0.25), 0, 0));
    ART.arcs[k] = ARC_COLS.map(mk);
  }
  ART.pfx = buildParticles();
  ART.tiles = buildTiles();
  ART.props = buildProps();
  ART.bg = buildBackground();
  ART.rivalLabel = textImage('SPIRIT RIVAL', '#e6f0ff', 1);
  ART.p1Label = textImage('P1', CONFIG.colors.hud.p1, 1);
  ART.p2Label = textImage('P2', CONFIG.colors.hud.p2, 1);
}
