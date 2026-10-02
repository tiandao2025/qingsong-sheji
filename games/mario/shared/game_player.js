// game_player.js — player update + collision helpers
function onFloorAt(o) {
  var fx = Math.floor((o.x + o.w / 2) / T);
  var by = Math.floor((o.y + o.h + 1) / T);
  if (TT_SOLID[tileAt(fx, by)]) return true;
  var ly = Math.floor((o.y + o.h + 1) / T);
  for (var d = -2; d <= 2; d++) {
    if (TT_SOLID[tileAt(fx + d, ly)]) return true;
  }
  return false;
}

function playerUpdate() {
  var p = P;
  if (p.dead) {
    p.deadT++;
    if (p.deadT > 8) p.y += 1.55;
    if (p.deadT > 132) { G.mode = 'dying'; }
    return;
  }
  if (p.growT > 0) {
    p.growT--;
    p.inv = Math.max(p.inv, 2);
    if (p.growT === 0) p.h = p.big ? 21 : 15;
  }
  if (p.inv > 0) p.inv--;
  if (p.fireCD > 0) p.fireCD--;
  if (p.inside > 0) {
    p.inside++;
    if (p.inside === 2) { p.inside = 999; }
    if (p.inside > 0) p.x = castle.x + 28;
    return;
  }

  var L = IN.down('left'), R = IN.down('right'), U = IN.down('jump'), RUN = IN.down('run');
  var st = p.star > 0;
  if (st) { p.star--; if (p.star === 0) SFX.setMusic(LV.music); }

  var bodyH = p.big ? (p.crouch ? 14 : 21) : 15;
  if (p.big && !p.crouch && p.h !== 21) p.h = 21;
  if (!p.big && p.h !== 15) p.h = 15;

  // horizontal
  var maxV = st ? 0.168 : (RUN ? PH.run : PH.walk);
  p.skid = false;
  if (L && !R) {
    if (p.vx > 0.02 && p.ground) { p.vx = UApproach(p.vx, 0, PH.skid); p.skid = true; }
    else p.vx = UApproach(p.vx, -maxV, PH.accel);
    p.face = -1;
  } else if (R && !L) {
    if (p.vx < -0.02 && p.ground) { p.vx = UApproach(p.vx, 0, PH.skid); p.skid = true; }
    else p.vx = UApproach(p.vx, maxV, PH.accel);
    p.face = 1;
  } else {
    p.vx = UApproach(p.vx, 0, PH.friction);
  }

  // crouch
  if (p.big) {
    if (L && p.ground) p.crouch = true;
    if (p.crouch && !L) {
      var hx = Math.floor((p.x + p.w / 2) / T), hy = Math.floor(p.y / T);
      if (!TT_SOLID[tileAt(hx, hy)]) p.crouch = false;
    }
  } else p.crouch = false;

  // jump
  if (U && p.ground) {
    var hj = (RUN || st) ? PH.jumpRun : PH.jump;
    if (p.crouch) hj *= 0.86;
    p.vy = hj;
    p.ground = false;
    p.jump = true;
    p.hold = true;
    p.skid = false;
    SFX.play(p.big ? 'bigjump' : 'jump');
  }
  if (!U) p.hold = false;

  // gravity
  var g = (p.jump && p.hold && p.vy < 0) ? PH.gravHold : PH.grav;
  p.vy = Math.min(p.vy + g, PH.maxFall);

  // integrate
  moveX(p, p.vx);

  var my = moveY(p, p.vy);
  if (my.hit) {
    if (p.vy > 0) { p.ground = true; p.jump = false; }
    p.vy = 0;
    if (my.tile && (BRICKY[my.tile] || QUERY[my.tile])) hitBlock(my.tx, my.ty, my.tile);
  } else {
    p.ground = onFloorAt(p);
  }
  if (p.ground) { p.jump = false; }

  // screen edge / level bounds
  if (p.x < camX + 2) { p.x = camX + 2; if (p.vx < 0) p.vx = 0; }
  var maxX = mapW * T - p.w;
  if (p.x > maxX) { p.x = maxX; if (p.vx > 0) p.vx = 0; }

  // pit death
  if (p.y > viewH() + 32) killPlayer(true);

  // fire
  if (IN.pressed('run') && p.fire && p.fireCD === 0 && p.ground !== undefined) {
    spawnFireball();
  }

  // tint
  if (p.star > 0) {
    var cy = (tick / 2 | 0) % 4;
    p.tint = cy === 0 ? 'palette|#fcd000' : cy === 1 ? 'palette|#38b038' : cy === 2 ? 'palette|#58c8f8' : 'white';
  } else if (p.inv > 0 && ((tick / 2 | 0) % 2 === 0)) {
    p.tint = 'white';
  } else p.tint = null;

  // anim
  p.animT++;
  if (Math.abs(p.vx) > 0.015 && p.ground) p.anim = ((p.animT / 3) | 0) % 2;
  else if (Math.abs(p.vx) > 0.015) p.anim = 2;
  else p.anim = 0;
  if (p.crouch) p.anim = 3;
}

function UApproach(v, t, s) { return v < t ? Math.min(v + s, t) : Math.max(v - s, t); }

function hitBlock(tx, ty, tile) {
  if (BRICKY[tile]) {
    if (P.big) {
      setTile(tx, ty, TT.EMPTY);
      addScore(50);
      floats.push({ x: tx * T, y: ty * T - 4, txt: '50', t: 0, life: 40 });
      pops.push({ x: tx * T, y: ty * T, t: 0, kind: 'brick' });
      SFX.play('break');
      for (var i = 0; i < 4; i++) {
        parts.push({ x: tx * T + 4 + (i % 2) * 8, y: ty * T + 4 + ((i / 2) | 0) * 8, vx: (i % 2 ? 1 : -1) * 0.55, vy: -2.2 - i * 0.25, t: 0, kind: 'chunk', col: '#c87030' });
      }
    } else {
      SFX.play('bump');
      P.anim = 0;
    }
    return;
  }
  if (QUERY[tile]) {
    var data = null;
    for (var i = 0; i < LV.qblocks.length; i++) {
      if (LV.qblocks[i].x === tx && LV.qblocks[i].y === ty) { data = LV.qblocks[i]; break; }
    }
    setTile(tx, ty, LV.theme === 'underground' ? TT.UG_SOLID : TT.USED);
    SFX.play('bump');
    if (data && data.item) {
      if (data.item === 'coin') {
        G.coins++; addScore(200);
        floats.push({ x: tx * T, y: ty * T - 4, txt: '200', t: 0, life: 40 });
        pops.push({ x: tx * T + 2, y: ty * T, t: 0, kind: 'coin' });
        parts.push({ x: tx * T + 8, y: ty * T, vx: 0, vy: -3.4, t: 0, kind: 'coinpop' });
        coinTick();
      } else {
        items.push({ kind: data.item, x: tx * T, y: ty * T, w: 16, h: 16, grow: 20, vy: 0, vx: 0, gone: false, justBorn: true });
      }
    }
    return;
  }
}

function coinTick() {
  if (G.coins >= 100) {
    G.coins -= 100;
    G.lives++;
    SFX.play('1up');
    floats.push({ x: P.x, y: P.y - 18, txt: '1UP', t: 0, life: 60, big: 1 });
  }
}

function addScore(n) { G.score += n; }

function killPlayer(pit) {
  if (P.dead) return;
  P.dead = true;
  P.deadT = 0;
  P.vy = pit ? 0 : -4.2;
  P.vx = 0;
  SFX.stopMusic();
  SFX.play('die');
}

function growPlayer(fire) {
  if (P.big) {
    if (fire) { P.fire = true; SFX.play('powerup'); }
    else { SFX.play('powerup'); }
    return;
  }
  P.big = true;
  P.h = 21;
  P.growT = 26;
  P.inv = 30;
  SFX.play('powerup');
}

function hurtPlayer() {
  if (P.inv > 0 || P.star > 0 || P.dead) return;
  if (P.big) {
    P.big = false;
    P.fire = false;
    P.h = 15;
    P.crouch = false;
    P.inv = 110;
    P.growT = 0;
    SFX.play('powerdown');
  } else {
    killPlayer(false);
  }
}

function spawnFireball() {
  if (balls.length >= 2) return;
  P.fireCD = 14;
  balls.push({
    x: P.face > 0 ? P.x + P.w : P.x - 8, y: P.y + (P.big ? 6 : 3),
    w: 8, h: 8, vx: P.face * 2.35, vy: 1.1, t: 0, dead: 0
  });
  SFX.play('fire');
}
