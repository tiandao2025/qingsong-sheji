// game_draw.js
function draw() {
  R.beginFrame();
  if (G.mode === 'title') { drawTitle(); R.present(); return; }
  if (G.mode === 'gameover') { drawGameOver(); R.present(); return; }
  drawWorld();
  R.present();
}

function drawWorld() {
  R.drawSky(LV.theme);
  var vw = viewW(), vh = viewH();
  // Keep the 15-row map sitting on the bottom of the viewport; any extra height
  // (tall phone screens) becomes extra sky above.
  var worldH = mapH * T;
  if (vh > worldH) {
    R.translate(0, vh - worldH);
  }
  var c0 = Math.floor(camX / T) - 1, c1 = Math.floor((camX + vw) / T) + 1;
  var i, j, x, y, tx, ty;

  // decor behind
  for (i = 0; i < LV.decor.length; i++) {
    var d = LV.decor[i];
    var dx = d.x * T;
    if (dx < camX - 48 || dx > camX + vw + 48) continue;
    if (d.t === 'cloud') R.drawCloudPair(dx - camX, d.y * T);
    else if (d.t === 'bush') R.drawBushPair(dx - camX, d.y * T);
    else if (d.t === 'hill') R.drawHillPair(dx - camX, d.y * T);
  }

  if (LV.theme === 'castle') {
    for (i = c0; i < c1; i++) {
      if (i < 0 || i >= mapW) continue;
      var t = tileAt(i, 13);
      if (t === TT.GROUND) R.blit(R.sprite('tile_castle'), i * T - camX, 13 * T);
    }
  }

  // tiles
  for (ty = 0; ty < mapH; ty++) {
    for (tx = c0; tx <= c1; tx++) {
      var v = tileAt(tx, ty);
      if (!v) continue;
      var sp = R.sprite(TT_SPR[v]);
      if (!sp) continue;
      var bump = 0;
      if (BRICKY[v] || QUERY[v]) {
        var s = 0;
        for (i = 0; i < parts.length; i++) if (parts[i].bump === tx + ',' + ty) s = 1;
        if (s) bump = -2;
      }
      R.blit(sp, tx * T - camX, ty * T + bump);
    }
  }

  // castle
  if (LV.flagX > 0) R.drawCastle(castle.x - camX, 13 * T);

  // flag
  drawFlag();

  // items
  for (i = 0; i < items.length; i++) drawItem(items[i]);

  // enemies
  for (i = 0; i < enemies.length; i++) drawEnemy(enemies[i]);

  // player
  if (P.inside !== 999) drawPlayer();

  // fireballs
  for (i = 0; i < balls.length; i++) {
    var b = balls[i];
    R.blit(R.sprite((tick / 2 | 0) % 2 ? 'fireball1' : 'fireball2'), b.x - camX, b.y);
  }

  // particles
  for (i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (p.kind === 'coinpop') R.blit(R.sprite('coin1'), p.x - camX, p.y);
    else R.fillRect(p.x - camX, p.y, 4, 4, p.col);
  }
  for (i = 0; i < pops.length; i++) {
    var q = pops[i];
    if (q.kind === 'brick') {
      R.fillRect(q.x - camX, q.y, 16, 16, '#c87030');
      R.fillRect(q.x - camX, q.y, 16, 2, '#00000033');
    } else if (q.kind === 'coin') {
      R.blit(R.sprite('coin1'), q.x - camX, q.y);
    }
  }

  // floaters
  for (i = 0; i < floats.length; i++) {
    var f = floats[i];
    var fy = f.y - f.t * 0.32;
    R.drawText(f.txt, f.x - camX, fy, f.col || 'W', 'left', f.big ? 2 : 1, true);
  }

  // end world transform (tall screens offset the world vertically)
  if (vh > worldH) R.identity();

  // HUD
  R.hud({
    score: U.pad(G.score, 6),
    coins: U.pad(G.coins, 2),
    lives: U.pad(G.lives, 2),
    world: LEVELS.id(lvlIdx),
    time: G.time,
    mute: !SFX.isEnabled()
  });

  if (G.mode === 'ready') {
    R.fillRect(vw / 2 - 100, 84, 200, 60, 'rgba(0,0,0,0.45)');
    R.drawText('WORLD ' + LEVELS.id(lvlIdx), vw / 2, 96, 'Y', 'center', 2, true);
    R.drawText('MARIO  x  ' + G.lives, vw / 2, 122, 'W', 'center', 1, true);
  }
  if (G.mode === 'clear' && levelDoneT > 30) {
    var bw = 130;
    R.fillRect(vw / 2 - bw / 2, 72, bw, 34, 'rgba(0,0,0,0.55)');
    R.drawText('COURSE CLEAR', vw / 2, 82, 'Y', 'center', 1, true);
    if (G.time > 0) R.drawText('TIME x' + Math.floor(G.time / 5), vw / 2, 94, 'W', 'center', 1, false);
  }
  if (G.mode === 'paused') {
    R.fillRect(vw / 2 - 68, 100, 136, 40, 'rgba(0,0,0,0.55)');
    R.drawText('PAUSED', vw / 2, 114, 'Y', 'center', 2, true);
    R.drawText('TAP JUMP TO RESUME', vw / 2, 132, 'W', 'center', 1, false);
  }
}

function drawFlag() {
  if (!flag) return;
  var fx = flag.x - camX;
  var topY = T;
  var botY = 13 * T;
  // pole
  for (var y = topY; y <= botY; y += T) {
    R.blit(R.sprite('flag_pole'), fx, y);
  }
  // finial
  R.blit(R.sprite('ball'), fx - 2, topY - T);
  // cloth (hangs on the left side of the pole)
  R.blit(R.sprite('flag_top'), fx - 13, flag.y);
  R.blit(R.sprite('flag_pole'), fx, botY);
}


function drawItem(it) {
  var x = it.x - camX;
  var name = null, fl = 0;
  if (it.kind === 'coin') name = 'coin' + ((it.anim | 0) % 4);
  else if (it.kind === 'mushroom') name = 'mushroom';
  else if (it.kind === 'oneup') name = 'oneup';
  else if (it.kind === 'star') name = 'star';
  if (!name) return;
  if (it.kind === 'star') fl = ((tick / 3) | 0) % 2;
  R.blit(R.sprite(name), x, it.y, false, fl ? 'palette|#fcd8a0' : null);
}

function drawEnemy(e) {
  var x = e.x - camX, y = e.y;
  if (e.k === 'goomba') {
    if (e.dying) { R.blit(R.sprite('goomba_flat'), x, y); return; }
    if (e.flat) { R.blit(R.sprite('goomba_flat'), x, y); return; }
    var n = (e.anim / 8 | 0) % 2;
    R.blit(R.sprite(n ? 'goomba2' : 'goomba1'), x, y);
  } else {
    if (e.shell) {
      var spr = 'shell';
      R.blit(R.sprite(spr), x - 1, y, e.vx > 0);
      return;
    }
    var n2 = (e.anim / 8 | 0) % 2;
    R.blit(R.sprite(n2 ? 'koopa2' : 'koopa1'), x, y);
  }
}

function drawPlayer() {
  var p = P;
  var x = p.x - camX, y = p.y;
  if (p.dead) { R.blit(R.sprite('h_mario_die'), x - 2, y); return; }
  var who = p.fire ? 'h_fire' : 'h_mario';
  var big = p.big;
  var pre = big ? who + '_big' : who;
  var spr;
  if (p.anim === 3) spr = 'crouch' + (p.fire ? '_fire' : '') + (big ? '_big' : '');
  else if (!p.ground) spr = pre + '_jump';
  else if (p.skid) spr = pre + '_skid';
  else if (p.anim === 1) spr = pre + '_walk1';
  else if (p.anim === 2) spr = pre + '_walk2';
  else spr = pre + '_idle';
  var sp = R.sprite(spr);
  if (!sp) sp = R.sprite(pre + '_idle');
  R.blit(sp, x + (p.w - sp.w) / 2, y + (p.h - sp.h), p.face < 0, p.tint);
}

function drawTitle() {
  var vw = viewW();
  R.drawSky('overworld');

  // sky decor
  R.drawCloudPair(20, 26);
  R.drawCloudPair(150, 20);
  R.drawCloudPair(86, 44);
  R.drawHillPair(6, 13 * T);
  R.drawBushPair(112, 13 * T);

  // title banner
  R.fillRect(0, 8, vw, 62, 'rgba(10,14,34,0.78)');
  R.fillRect(0, 68, vw, 2, '#fcd000');
  R.drawText('SUPER PIXEL', vw / 2, 18, 'Y', 'center', 3, true);
  R.drawText('PLATFORMER', vw / 2, 48, 'W', 'center', 2, true);

  // demo stage (spans the viewport)
  var gy = 13 * T;
  var nTiles = Math.ceil(vw / T) + 1;
  for (var i = 0; i < nTiles; i++) {
    R.blit(R.sprite('tile_ground'), i * T, gy);
    R.blit(R.sprite('tile_ground'), i * T, gy + T);
  }
  // scenery spread across the width
  var span = Math.max(1, Math.floor((vw - 200) / 16));
  R.blit(R.sprite('tile_q1'), 4 * T, 9 * T);
  R.blit(R.sprite('tile_q1'), 5 * T, 9 * T);
  var pipeX = Math.max(12, 10 + span) * T;
  R.blit(R.sprite('pipe_tl'), pipeX, 11 * T);
  R.blit(R.sprite('pipe_tr'), pipeX + T, 11 * T);
  R.blit(R.sprite('pipe_l'), pipeX, 12 * T);
  R.blit(R.sprite('pipe_r'), pipeX + T, 12 * T);

  var walk = ((TITLE_T / 9) | 0) % 2;
  var hop = (TITLE_T % 46) < 24;
  R.blit(R.sprite(hop ? 'h_mario_jump' : (walk ? 'h_mario_walk1' : 'h_mario_idle')),
    2 * T, hop ? gy - 34 : gy - 19);
  var gAnim = ((TITLE_T / 8) | 0) % 2;
  var goombaX = Math.max(8, Math.floor(span * 0.55)) * T;
  R.blit(R.sprite(gAnim ? 'goomba2' : 'goomba1'), goombaX, gy - 15);
  var cAnim = ((TITLE_T / 6) | 0) % 4;
  var coinX = Math.max(9, Math.floor(span * 0.8)) * T;
  R.blit(R.sprite('coin' + cAnim), coinX, 8 * T);
  R.blit(R.sprite('coin' + ((cAnim + 2) % 4)), coinX + T, 8 * T);

  // clouds / hills anchored to the edges
  R.drawCloudPair(16, 78);
  R.drawCloudPair(Math.max(0, vw - 62), 76);
  R.drawHillPair(Math.max(0, 10 * T - 16), 13 * T);
  R.drawBushPair(Math.max(0, vw - 80), 13 * T);

  // bottom panel

  R.fillRect(0, 202, vw, 38, 'rgba(10,14,34,0.85)');
  R.fillRect(0, 202, vw, 1, '#fcd000');
  if ((TITLE_T / 26 | 0) % 2 === 0) {
    R.drawText('PRESS JUMP OR SPACE', vw / 2, 208, 'Y', 'center', 1, true);
  }
  R.drawText('ARROWS MOVE  Z JUMP  X RUN', vw / 2, 222, 'W', 'center', 1, false);
  R.drawText('MINIPROGRAM ON-SCREEN PAD', vw / 2, 232, 'W', 'center', 1, false);
}


function drawGameOver() {
  R.fillScreen('#101018');
  R.drawText('GAME OVER', vw / 2, 100, 'W', 'center', 3, true);
  R.drawText('SCORE ' + U.pad(G.score, 6), vw / 2, 140, 'Y', 'center', 1, true);
  if ((TITLE_T / 30 | 0) % 2 === 0) R.drawText('PRESS JUMP TO CONTINUE', vw / 2, 176, 'W', 'center', 1, true);
}

function titleUpdate() {
  if (IN.pressed('jump') || IN.pressed('start')) {
    SFX.init();
    SFX.play('select');
    gameNew();
  }
}

// ---------- boot ----------
var GAME = {
  update: gameUpdate,
  draw: draw,
  newGame: gameNew,
  G: G,
  isTouch: function () { return IN.isTouch; }
};
