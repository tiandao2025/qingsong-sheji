// game_collide.js
function boxOf(o) { return { x: o.x, y: o.y, w: o.w, h: o.h }; }

function collisions() {
  var p = P;
  if (p.dead || p.inside === 999) return;
  var pb = boxOf(p);
  var i, j;

  for (i = items.length - 1; i >= 0; i--) {
    var it = items[i];
    if (it.gone || it.grow > 0) continue;
    if (!ov(pb, boxOf(it))) continue;
    if (it.kind === 'coin') {
      G.coins++; addScore(200);
      floats.push({ x: it.x, y: it.y - 6, txt: '200', t: 0, life: 40 });
      coinTick();
      it.gone = 1;
    } else if (it.kind === 'mushroom') {
      growPlayer(false); it.gone = 1;
    } else if (it.kind === 'oneup') {
      G.lives++; SFX.play('1up');
      floats.push({ x: p.x, y: p.y - 18, txt: '1UP', t: 0, life: 60, big: 1 });
      it.gone = 1;
    } else if (it.kind === 'star') {
      p.star = 620; SFX.setMusic('star');
      floats.push({ x: p.x, y: p.y - 18, txt: 'STAR!', t: 0, life: 60, big: 1 });
      it.gone = 1;
    }
  }

  for (i = enemies.length - 1; i >= 0; i--) {
    var e = enemies[i];
    if (e.gone) continue;
    if (!ov(pb, boxOf(e))) continue;

    if (p.star > 0) { killEnemy(e, 'flip'); addScore(200); continue; }

    var stomping = (p.vy > 0.4) && (p.y + p.h - e.y < 14);
    if (e.k === 'koopa' && e.shell) {
      var shellStill = (e.shell === 2);
      if (!shellStill) {
        if (stomping || ov(pb, boxOf(e))) {
          e.shell = 2; e.vx = 0; addScore(400);
          SFX.play('stomp');
          p.vy = PH.stompBounce;
          continue;
        }
      } else {
        if (stomping) { e.shell = 2; p.vy = PH.stompBounce; addScore(100); SFX.play('stomp'); continue; }
        if (Math.abs(e.vx) > 0.3) { hurtPlayer(); continue; }
        e.shell = 1; e.vx = 2.2 * (p.x + p.w / 2 < e.x + e.w / 2 ? 1 : -1);
        addScore(400); SFX.play('kick');
        continue;
      }
    }
    if (e.k === 'koopa' && e.shell === 0) {
      if (stomping) { stompEnemy(e); p.vy = PH.stompBounce; continue; }
      hurtPlayer();
      continue;
    }
    if (e.flat) continue;
    if (stomping) { stompEnemy(e); p.vy = PH.stompBounce; continue; }
    hurtPlayer();
  }

  for (i = balls.length - 1; i >= 0; i--) {
    var b = balls[i];
    if (b.dead) continue;
    for (j = enemies.length - 1; j >= 0; j--) {
      var en = enemies[j];
      if (en.gone) continue;
      if (ov(boxOf(b), boxOf(en))) {
        killEnemy(en, 'flip');
        addScore(200);
        b.dead = 1;
        break;
      }
    }
  }

  // flag
  if (!flag.grabbed && p.x + p.w > flag.x && p.x < flag.x + 10) {
    flag.grabbed = true;
    levelDoneT = 1;
    SFX.stopMusic();
    SFX.play('flag');
  }

  if (p.y > viewH() + 40 && !p.dead) killPlayer(true);
}

function ov(a, b) { return U.rectsOverlap(a, b); }

function camUpdate() {
  if (P.dead) return;
  var vw = viewW();
  var target = P.x + P.w / 2 - vw / 2;
  if (target > camX) camX = target;
  var maxCam = mapW * T - vw;
  if (camX > maxCam) camX = maxCam;
  if (camX < 0) camX = 0;
}
