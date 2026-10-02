// game_entity.js — enemies, items, fireballs, particles
function makeEnemy(type, x, y) {
  if (type === 'koopa') {
    return {
      k: 'koopa', x: x, y: y, w: 14, h: 22, vx: -0.034, vy: 0,
      shell: 0, anim: 0, dead: 0, dx: 0, g: true, stun: 0
    };
  }
  return {
    k: 'goomba', x: x, y: y, w: 14, h: 15, vx: -0.038, vy: 0,
    flat: 0, anim: 0, dead: 0, dx: 0, g: true
  };
}

function enemyUpdate(e) {
  if (e.dead) { e.dead++; if (e.dead > 34) e.gone = 1; return; }
  if (e.gone) return;
  if (e.x + e.w < camX - 48 || e.x > camX + viewW() + 96) { e.dormant = 1; }
  else e.dormant = 0;
  if (e.dormant) return;

  if (e.k === 'koopa' && e.shell) {
    if (e.shell === 1) {
      e.vy = Math.min(e.vy + PH.grav, PH.maxFall);
      moveX(e, e.vx);
      var r = moveY(e, e.vy);
      if (r.hit) e.vy = 0;
      if (e.x < camX + 8) { e.x = camX + 8; e.vx = Math.abs(e.vx); }
      var wx = e.vx > 0 ? Math.floor((e.x + e.w + 1) / T) : Math.floor((e.x - 1) / T);
      var wy = Math.floor((e.y + e.h / 2) / T);
      if (TT_SOLID[tileAt(wx, wy)]) { e.vx = -e.vx; e.x += e.vx * 2; }
      e.anim++;
      if (e.y > viewH() + 48) e.gone = 1;
      return;
    }
  }

  e.vy = Math.min(e.vy + PH.grav, PH.maxFall);
  var hx = moveX(e, e.vx);
  if (hx) e.vx = -e.vx;
  var hy = moveY(e, e.vy);
  if (hy.hit) {
    e.vy = 0;
    e.g = true;
    if (hy.tile && (BRICKY[hy.tile] || QUERY[hy.tile])) hitBlock(hy.tx, hy.ty, hy.tile);
  } else e.g = onFloorAt(e);
  if (e.k === 'goomba' && e.flat) {
    e.y = onFloorY(e);
    e.vy = 0;
  }
  if (e.y > viewH() + 48) e.gone = 1;
  e.anim++;
}

function onFloorY(o) {
  var fx = Math.floor((o.x + o.w / 2) / T);
  var by = Math.floor((o.y + o.h + 1) / T);
  for (var d = 0; d <= 2; d++) if (TT_SOLID[tileAt(fx + d, by)]) return by * T - o.h - 0.01;
  for (var d2 = 0; d2 <= 2; d2++) if (TT_SOLID[tileAt(fx - d2, by)]) return by * T - o.h - 0.01;
  return o.y;
}

function stompEnemy(e) {
  if (e.k === 'koopa' && e.shell === 2) { e.shell = 1; e.vx = 2.4; return; }
  if (e.k === 'koopa' && e.shell === 1) { e.shell = 2; e.vx = 0; return; }
  if (e.k === 'koopa') {
    e.shell = 2; e.vx = 0; e.vy = 0;
    e.y = e.y + (22 - 15);
    e.h = 15;
    addScore(100);
    SFX.play('stomp');
    return;
  }
  if (e.flat) return;
  e.flat = 1; e.vx = 0;
  addScore(100);
  SFX.play('stomp');
}

function killEnemy(e, how) {
  if (e.dead) return;
  e.dead = 1; e.dead = 0; e.dying = 1;
  e.vy = -3.0; e.vx = 0;
  e.dy = -3.0;
  addScore(100);
  if (how === 'flip') {
    e.flip = 1;
  }
  SFX.play('kick');
}

function itemUpdate(it) {
  if (it.gone) return;
  if (it.grow > 0) {
    it.grow--;
    it.y -= 0.9;
    if (it.grow === 0) {
      it.y += 16;
      if (it.kind === 'coin') {
        G.coins++; addScore(200);
        floats.push({ x: it.x, y: it.y - 6, txt: '200', t: 0, life: 40 });
        coinTick();
        it.gone = 1;
        return;
      }
      it.vx = (it.kind === 'star') ? 0.075 : 0.055;
    }
    return;
  }
  if (it.kind === 'coin' && it.free) {
    it.anim = (it.anim + 1) % 4;
    return;
  }
  if (it.kind === 'star') it.x += Math.sin(tick / 5) * 0.22;
  it.vy = Math.min(it.vy + PH.grav, PH.maxFall);
  var h = moveX(it, it.vx);
  if (h) it.vx = -it.vx;
  var r = moveY(it, it.vy);
  if (r.hit) {
    it.vy = 0;
    if (it.kind === 'star') it.vy = -3.1;
  }
  if (it.y > viewH() + 64) it.gone = 1;
}

function ballUpdate(b) {
  if (b.dead) { b.t++; return; }
  b.vy = Math.min(b.vy + 0.16, 4.4);
  var h = moveX(b, b.vx);
  var r = moveY(b, b.vy);
  if (h) { b.vx = -b.vx; }
  if (r.hit) {
    b.vy = -2.35;
    if (b.t > 60) b.dead = 1;
  }
  b.t++;
  if (b.t > 200) b.dead = 1;
  if (b.y > viewH() + 40) b.dead = 1;
}

function fxUpdate() {
  var i;
  for (i = parts.length - 1; i >= 0; i--) {
    var p = parts[i];
    p.t++;
    if (p.kind === 'coinpop') {
      p.vy += 0.24;
      p.y += p.vy;
      if (p.t > 34) parts.splice(i, 1);
      continue;
    }
    p.vy += 0.22;
    p.x += p.vx;
    p.y += p.vy;
    if (p.y > viewH() + 30 || p.t > 90) parts.splice(i, 1);
  }
  for (i = pops.length - 1; i >= 0; i--) {
    pops[i].t++;
    if (pops[i].t > 16) pops.splice(i, 1);
  }
  for (i = floats.length - 1; i >= 0; i--) {
    floats[i].t++;
    if (floats[i].t > floats[i].life) floats.splice(i, 1);
  }
}
