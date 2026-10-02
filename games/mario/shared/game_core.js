// game_core.js — physics, tilemap, player, entities
var T = 16;
// Live virtual-viewport size (the renderer adapts this to the window aspect ratio).
function viewW() { return R.w(); }
function viewH() { return R.h(); }

var TT = {
  EMPTY: 0, GROUND: 1, GROUND2: 2, BRICK: 3, Q1: 4, USED: 5,
  P_TL: 6, P_TR: 7, P_L: 8, P_R: 9,
  HARD: 10, CASTLE: 11, UG_GROUND: 12, UG_BRICK: 13, UG_Q: 14, UG_SOLID: 15
};
var TT_SPR = {
  1: 'tile_ground', 2: 'tile_ground_stone', 3: 'tile_brick', 4: 'tile_q1',
  5: 'tile_used', 6: 'pipe_tl', 7: 'pipe_tr', 8: 'pipe_l', 9: 'pipe_r',
  10: 'tile_hard', 11: 'tile_castle', 12: 'tile_ug_ground', 13: 'tile_ug_brick',
  14: 'tile_ug_q', 15: 'tile_ug_solid'
};
var TT_SOLID = {
  1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1,
  10: 1, 11: 1, 12: 1, 13: 1, 14: 1, 15: 1
};
var BRICKY = { 3: 1, 13: 1 };
var QUERY = { 4: 1, 14: 1 };

var PH = {
  walk: 1.42, run: 2.58, jump: -5.6, jumpRun: -6.0,
  grav: 0.27, gravHold: 0.16, maxFall: 5.6,
  accel: 0.22, friction: 0.19, skid: 0.42,
  stompBounce: -4.5, shellBounce: -4.2
};

var G = {
  mode: 'title', level: 0, score: 0, coins: 0, lives: 3,
  time: 400, paused: false, gameOver: false, bonusShown: false
};

var LV = null, lvlIdx = 0, tiles = null, mapW = 0, mapH = 15;
var camX = 0, tick = 0;
var P = null;
var enemies = [], items = [], balls = [], parts = [], floats = [], pops = [];
var flag = null;
var castle = null;
var bigStart = false, fireStart = false;
var levelDoneT = 0;
var startBigT = 0;

// ---------- tilemap ----------
function tileAt(tx, ty) {
  if (ty < 0) return TT.EMPTY;
  if (tx < 0 || tx >= mapW) return TT.HARD;
  if (ty >= mapH) return TT.EMPTY;
  return tiles[ty * mapW + tx] | 0;
}
function setTile(tx, ty, v) {
  if (tx < 0 || tx >= mapW || ty < 0 || ty >= mapH) return;
  tiles[ty * mapW + tx] = v;
}
function fillTiles(x, y, w, h, t) {
  for (var yy = y; yy < y + h; yy++)
    for (var xx = x; xx < x + w; xx++) setTile(xx, yy, t);
}

// ---------- level build ----------
function buildLevel(i) {
  lvlIdx = i;
  LV = LEVELS.get(i);
  mapW = LV.width;
  tiles = [];
  for (var k = 0; k < mapW * mapH; k++) tiles[k] = TT.EMPTY;
  var j, seg;

  var ug = LV.theme === 'underground';
  var grT = ug ? TT.UG_GROUND : TT.GROUND;
  var brT = ug ? TT.UG_BRICK : TT.BRICK;
  var qT = ug ? TT.UG_Q : TT.Q1;
  var soT = ug ? TT.UG_SOLID : TT.CASTLE;

  for (j = 0; j < LV.ground.length; j++) {
    seg = LV.ground[j];
    fillTiles(seg[0], seg[1], seg[2], seg[3], grT);
  }
  for (j = 0; j < LV.blocks.length; j++) {
    seg = LV.blocks[j];
    fillTiles(seg.x, seg.y, seg.w, 1, brT);
  }
  for (j = 0; j < LV.qblocks.length; j++) {
    setTile(LV.qblocks[j].x, LV.qblocks[j].y, qT);
  }
  for (j = 0; j < LV.solid.length; j++) {
    seg = LV.solid[j];
    fillTiles(seg.x, seg.y, seg.w, seg.h, soT);
  }
  for (j = 0; j < LV.pipes.length; j++) {
    seg = LV.pipes[j];
    var by = 13 - seg.h;
    setTile(seg.x, by, TT.P_TL);
    setTile(seg.x + 1, by, TT.P_TR);
    for (var n = 1; n < seg.h; n++) {
      setTile(seg.x, by + n, TT.P_L);
      setTile(seg.x + 1, by + n, TT.P_R);
    }
  }
  for (j = 0; j < LV.stairs.length; j++) {
    seg = LV.stairs[j];
    for (var n2 = 0; n2 < seg.n; n2++) setTile(seg.x + n2, seg.y - n2, TT.CASTLE);
  }

  enemies = []; items = []; balls = []; parts = []; floats = []; pops = [];
  for (j = 0; j < LV.enemies.length; j++) {
    var e = LV.enemies[j];
    enemies.push(makeEnemy(e.t, e.x * T, e.y * T));
  }
  for (j = 0; j < LV.coins.length; j++) {
    var c = LV.coins[j];
    items.push({ kind: 'coin', x: c.x * T + 4, y: c.y * T, w: 8, h: 14, vy: 0, vx: 0, anim: (c.x + c.y) % 4, free: true, gone: false });
  }
  flag = {
    x: LV.flagX * T, topY: 3 * T, y: 3 * T, baseY: 12 * T,
    w: 14, h: 12, grabbed: false, done: false, t: 0
  };
  castle = { x: LV.castleX * T, open: false, t: 0 };
  levelDoneT = 0;
  P = makePlayer();
  camX = Math.max(0, Math.min(P.x - 72, mapW * T - viewW()));
  G.time = LV.time;
  G.bonusShown = false;
  SFX.setMusic(LV.music);
}

function makePlayer() {
  return {
    x: LV.startX * T, y: LV.startY * T, w: 12, h: 15,
    vx: 0, vy: 0, face: 1,
    big: !!bigStart, fire: !!fireStart,
    ground: false, jump: false, hold: true,
    anim: 0, animT: 0, skid: false,
    crouch: false, inv: 0, star: 0, tint: null,
    dead: false, deadT: 0, growT: 0, shrinkT: 0,
    fireCD: 0, walkOff: 0, inside: 0
  };
}

// ---------- movement ----------
function moveX(o, dx) {
  if (dx === 0) return false;
  var hit = false;
  var steps = Math.max(1, Math.ceil(Math.abs(dx) / 5));
  var s = dx / steps;
  for (var i = 0; i < steps; i++) {
    o.x += s;
    var t0 = Math.floor(o.y / T) - 1;
    var t1 = Math.floor((o.y + o.h - 1) / T);
    var tx = s > 0 ? Math.floor((o.x + o.w - 1) / T) : Math.floor(o.x / T);
    for (var ty = t0; ty <= t1; ty++) {
      if (TT_SOLID[tileAt(tx, ty)]) {
        o.x = s > 0 ? tx * T - o.w - 0.01 : (tx + 1) * T + 0.01;
        hit = true;
        break;
      }
    }
    if (hit) break;
  }
  return hit;
}

function moveY(o, dy) {
  if (dy === 0) return { hit: false, tile: 0, tx: -1, ty: -1 };
  var hit = false, tile = 0, hx = -1, hy = -1;
  var steps = Math.max(1, Math.ceil(Math.abs(dy) / 5));
  var s = dy / steps;
  for (var i = 0; i < steps; i++) {
    o.y += s;
    var ty = s > 0 ? Math.floor((o.y + o.h - 1) / T) : Math.floor(o.y / T);
    var lx = Math.floor(o.x / T);
    var rx = Math.floor((o.x + o.w - 1) / T);
    for (var tx = lx; tx <= rx; tx++) {
      if (TT_SOLID[tileAt(tx, ty)]) {
        o.y = s > 0 ? ty * T - o.h - 0.01 : (ty + 1) * T + 0.01;
        hit = true; tile = tileAt(tx, ty); hx = tx; hy = ty;
        break;
      }
    }
    if (hit) break;
  }
  return { hit: hit, tile: tile, tx: hx, ty: hy };
}
