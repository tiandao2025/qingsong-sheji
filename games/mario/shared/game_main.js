// game_main.js — state machine + main loop + drawing
var TITLE_T = 0;

function gameNew() {
  G.score = 0; G.coins = 0; G.lives = 3; G.level = 0;
  bigStart = false; fireStart = false;
  buildLevel(0);
  G.mode = 'ready';
  readyT = 90;
}

function gameRestart() {
  bigStart = false; fireStart = false;
  G.time = LV.time;
  buildLevel(lvlIdx);
  G.mode = 'ready';
  readyT = 70;
}

function nextLevel() {
  lvlIdx = (lvlIdx + 1) % LEVELS.count;
  buildLevel(lvlIdx);
  G.mode = 'ready';
  readyT = 90;
}

var readyT = 0;

function gameUpdate() {
  tick++;
  if (G.mode === 'title') { TITLE_T++; titleUpdate(); return; }
  if (G.mode === 'ready') {
    readyT--;
    if (readyT <= 0) G.mode = 'play';
    return;
  }
  if (G.mode === 'dying') {
    playerUpdate();
    fxUpdate();
    if (IN.pressed('jump') || IN.pressed('start')) {
      if (G.lives > 0) { G.lives--; G.mode = 'ready'; buildLevel(lvlIdx); readyT = 80; }
      else { G.mode = 'gameover'; G.gameOver = true; }
    }
    return;
  }
  if (G.mode === 'gameover') {
    TITLE_T++;
    if (IN.pressed('jump') || IN.pressed('start')) {
      G.mode = 'title';
      TITLE_T = 0;
      bigStart = false; fireStart = false;
    }
    return;
  }
  if (G.mode === 'paused') {
    if (IN.pressed('jump') || IN.pressed('start')) { G.mode = 'play'; SFX.setMusic(LV.music); }
    if (IN.pressed('pause')) { G.mode = 'play'; SFX.setMusic(LV.music); }
    return;
  }
  if (G.mode === 'clear') {
    levelDoneT++;
    flagUpdate();
    fxUpdate();
    if (levelDoneT === 8) SFX.play('clear');
    if (levelDoneT > 40) {
      P.x += 1.15;
      var fx2 = P.x - camX;
      if (fx2 > viewW() - 4) {
        camX += 1.15;
        P.x = camX + 4;
      }
    }
    if (P.inside === 999 || levelDoneT > 420) nextLevel();
    return;
  }
  if (G.mode !== 'play') return;

  if (IN.pressed('pause')) { G.mode = 'paused'; SFX.pauseMusic(); SFX.play('pause'); return; }

  if (flag.grabbed) {
    G.mode = 'clear';
    return;
  }

  // timer
  if (G.time > 0) {
    if (tick % 24 === 0) {
      G.time--;
      if (G.time === 100 && !G.hurried) { G.hurried = true; SFX.setMusic('hurry'); }
      if (G.time === 0) { killPlayer(false); }
    }
  }

  playerUpdate();
  var i;
  for (i = 0; i < enemies.length; i++) enemyUpdate(enemies[i]);
  for (i = items.length - 1; i >= 0; i--) { itemUpdate(items[i]); if (items[i].gone) items.splice(i, 1); }
  for (i = balls.length - 1; i >= 0; i--) { ballUpdate(balls[i]); if (balls[i].dead && balls[i].t > 20) balls.splice(i, 1); }
  fxUpdate();
  collisions();
  camUpdate();
  for (i = enemies.length - 1; i >= 0; i--) if (enemies[i].gone) enemies.splice(i, 1);
}

function flagUpdate() {
  if (!flag) return;
  flag.t++;

  // 1) slide down the pole
  if (flag.grabbed) {
    if (!flag.done) {
      // ride the cloth down to the pole base
      var target = flag.baseY - P.h - 2;
      if (P.y < target) {
        P.y = Math.min(P.y + 1.35, target);
        P.vy = 0;
        if (flag.y < flag.baseY) flag.y = Math.min(flag.y + 1.35, flag.baseY);
      } else {
        flag.done = true;
        flag.grabbed = 'slid';
        flag.y = flag.baseY;
        SFX.play('flag');
      }
    } else {
      castle.open = true;
    }
    return;
  }

  // 2) walk into the castle door
  if (castle.open && P.inside !== 999) {
    var doorX = castle.x + 24;
    if (P.x > doorX - 6) {
      P.inside++;
      P.x = Math.min(P.x + 0.9, doorX + 4);
      if (P.inside === 30) {
        P.inside = 999;
        if (!G.bonusShown) {
          G.bonusShown = true;
          var t = Math.floor(G.time / 5);
          G.score += t * 50;
          G.coins += t;
          floats.push({ x: castle.x + 10, y: 108, txt: 'TIME BONUS', t: 0, life: 110, big: 1 });
        }
      }
    }
  }
}

