// levels.js - level data. Tile units, 16px each. Ground surface row = 13.
var LEVELS = (function () {

  function L() {
    return {
      theme: 'overworld',
      music: 'overworld',
      time: 400,
      width: 200,
      ground: [[0, 13, 200, 2]],
      blocks: [], qblocks: [], solid: [], pipes: [], stairs: [],
      enemies: [], items: [], coins: [], decor: [],
      flagX: 190, castleX: 194,
      startX: 3, startY: 11,
      note: ''
    };
  }

  function mk() { return L(); }

  // ---------- World 1-1 ----------
  function level11() {
    var s = mk();
    s.theme = 'overworld'; s.music = 'overworld'; s.time = 400; s.width = 212;
    s.ground = [[0, 13, 72, 2], [89, 13, 20, 2], [116, 13, 30, 2], [153, 13, 59, 2]];
    s.decor = [
      { t: 'hill', x: 0, y: 13 }, { t: 'hill', x: 16, y: 13 },
      { t: 'bush', x: 11, y: 13 }, { t: 'bush', x: 23, y: 13 },
      { t: 'cloud', x: 8, y: 2 }, { t: 'cloud', x: 19, y: 3 },
      { t: 'cloud', x: 27, y: 2 }, { t: 'cloud', x: 36, y: 3 },
      { t: 'hill', x: 40, y: 13 }, { t: 'bush', x: 46, y: 13 },
      { t: 'cloud', x: 49, y: 2 }, { t: 'cloud', x: 58, y: 3 },
      { t: 'hill', x: 64, y: 13 }, { t: 'bush', x: 70, y: 13 },
      { t: 'cloud', x: 74, y: 2 }, { t: 'cloud', x: 83, y: 3 },
      { t: 'bush', x: 92, y: 13 }, { t: 'cloud', x: 95, y: 2 },
      { t: 'hill', x: 100, y: 13 }, { t: 'bush', x: 106, y: 13 },
      { t: 'cloud', x: 110, y: 3 }, { t: 'cloud', x: 120, y: 2 },
      { t: 'hill', x: 126, y: 13 }, { t: 'bush', x: 132, y: 13 },
      { t: 'cloud', x: 135, y: 2 }, { t: 'cloud', x: 145, y: 3 },
      { t: 'bush', x: 148, y: 13 }, { t: 'hill', x: 154, y: 13 },
      { t: 'cloud', x: 158, y: 2 }, { t: 'cloud', x: 168, y: 3 },
      { t: 'bush', x: 162, y: 13 }, { t: 'bush', x: 176, y: 13 },
      { t: 'cloud', x: 178, y: 2 }, { t: 'cloud', x: 188, y: 3 },
      { t: 'bush', x: 190, y: 13 }, { t: 'hill', x: 196, y: 13 }
    ];
    s.qblocks = [
      { x: 16, y: 9, item: 'coin' },
      { x: 20, y: 9, item: 'mushroom' },
      { x: 21, y: 5, item: 'coin' },
      { x: 22, y: 5, item: 'coin' },
      { x: 23, y: 9, item: 'coin' },
      { x: 24, y: 5, item: 'coin' },
      { x: 22, y: 9, item: 'coin' },
      { x: 78, y: 9, item: 'mushroom' },
      { x: 79, y: 5, item: 'coin' },
      { x: 94, y: 9, item: 'coin' },
      { x: 100, y: 9, item: 'star' },
      { x: 118, y: 9, item: 'mushroom' },
      { x: 121, y: 9, item: 'coin' },
      { x: 128, y: 9, item: 'mushroom' },
      { x: 129, y: 5, item: 'coin' },
      { x: 130, y: 5, item: 'coin' },
      { x: 131, y: 5, item: 'coin' },
      { x: 140, y: 9, item: '1up' },
      { x: 168, y: 9, item: 'mushroom' },
      { x: 169, y: 5, item: 'coin' },
      { x: 170, y: 5, item: 'coin' },
      { x: 171, y: 5, item: 'coin' }
    ];
    s.blocks = [
      { x: 21, y: 9, w: 1 }, { x: 23, y: 9, w: 1 },
      { x: 77, y: 9, w: 1 }, { x: 80, y: 9, w: 1 },
      { x: 94, y: 5, w: 3 }, { x: 101, y: 5, w: 3 },
      { x: 118, y: 9, w: 1 }, { x: 120, y: 9, w: 1 },
      { x: 123, y: 9, w: 1 },
      { x: 134, y: 9, w: 3 }, { x: 140, y: 9, w: 1 },
      { x: 152, y: 9, w: 1 }, { x: 155, y: 9, w: 1 },
      { x: 166, y: 5, w: 3 }, { x: 172, y: 5, w: 3 },
      { x: 169, y: 9, w: 1 }
    ];
    s.pipes = [
      { x: 28, y: 11, h: 2 }, { x: 38, y: 10, h: 3 }, { x: 46, y: 11, h: 2 },
      { x: 57, y: 10, h: 3 },
      { x: 163, y: 10, h: 3 }
    ];
    s.solid = [
      { x: 0, y: 0, w: 1, h: 13 },
      { x: 80, y: 11, w: 4, h: 2 },
      { x: 86, y: 10, w: 3, h: 3 },
      { x: 108, y: 11, w: 5, h: 2 },
      { x: 134, y: 12, w: 4, h: 1 },
      { x: 146, y: 11, w: 5, h: 2 },
      { x: 176, y: 11, w: 6, h: 2 }
    ];
    s.stairs = [
      { x: 134, y: 12, n: 4, dir: 1 },
      { x: 181, y: 12, n: 8, dir: 1 },
      { x: 189, y: 12, n: 1, dir: -1 }
    ];
    s.enemies = [
      { t: 'goomba', x: 22, y: 12 }, { t: 'goomba', x: 40, y: 9 },
      { t: 'goomba', x: 51, y: 12 }, { t: 'goomba', x: 52, y: 12 },
      { t: 'goomba', x: 82, y: 12 }, { t: 'goomba', x: 97, y: 12 },
      { t: 'goomba', x: 99, y: 12 }, { t: 'koopa', x: 107, y: 12 },
      { t: 'goomba', x: 114, y: 12 }, { t: 'goomba', x: 115, y: 12 },
      { t: 'goomba', x: 124, y: 12 }, { t: 'koopa', x: 145, y: 12 },
      { t: 'goomba', x: 150, y: 12 }, { t: 'goomba', x: 160, y: 9 },
      { t: 'goomba', x: 179, y: 11 }, { t: 'goomba', x: 180, y: 11 },
      { t: 'koopa', x: 188, y: 12 }
    ];
    s.coins = [
      { x: 18, y: 7 }, { x: 22, y: 4 }, { x: 24, y: 4 },
      { x: 96, y: 4 }, { x: 130, y: 4 }, { x: 141, y: 4 },
      { x: 169, y: 4 }, { x: 171, y: 4 },
      { x: 30, y: 6 }, { x: 31, y: 6 }, { x: 60, y: 7 }, { x: 61, y: 7 },
      { x: 110, y: 8 }, { x: 111, y: 8 }, { x: 148, y: 8 }
    ];
    s.flagX = 197; s.castleX = 200;
    return s;
  }

  // ---------- World 1-2 (underground) ----------
  function level12() {
    var s = mk();
    s.theme = 'underground'; s.music = 'overworld'; s.time = 400; s.width = 196;
    s.ground = [[0, 13, 90, 2], [101, 13, 95, 2]];
    s.decor = [];
    s.qblocks = [
      { x: 14, y: 8, item: 'coin' }, { x: 15, y: 8, item: 'mushroom' },
      { x: 16, y: 8, item: 'coin' },
      { x: 20, y: 5, item: 'coin' }, { x: 21, y: 5, item: 'coin' },
      { x: 22, y: 5, item: 'coin' },
      { x: 40, y: 8, item: 'mushroom' },
      { x: 52, y: 5, item: '1up' },
      { x: 53, y: 5, item: 'coin' }, { x: 54, y: 5, item: 'coin' },
      { x: 55, y: 5, item: 'coin' },
      { x: 70, y: 8, item: 'star' },
      { x: 95, y: 8, item: 'mushroom' }, { x: 96, y: 8, item: 'coin' },
      { x: 120, y: 5, item: 'coin' }, { x: 121, y: 5, item: 'coin' },
      { x: 122, y: 5, item: 'coin' },
      { x: 140, y: 8, item: 'mushroom' },
      { x: 155, y: 5, item: '1up' }
    ];
    s.blocks = [
      { x: 24, y: 8, w: 4 }, { x: 30, y: 8, w: 1 },
      { x: 44, y: 8, w: 3 },
      { x: 60, y: 8, w: 2 },
      { x: 100, y: 8, w: 4 }, { x: 110, y: 8, w: 3 },
      { x: 128, y: 8, w: 3 }, { x: 132, y: 8, w: 1 },
      { x: 146, y: 8, w: 4 },
      { x: 166, y: 8, w: 3 }, { x: 172, y: 8, w: 1 }
    ];
    s.solid = [
      { x: 0, y: 0, w: 1, h: 15 },
      { x: 34, y: 10, w: 4, h: 3 },
      { x: 78, y: 10, w: 6, h: 3 },
      { x: 90, y: 0, w: 11, h: 15 },
      { x: 104, y: 11, w: 1, h: 2 },
      { x: 116, y: 11, w: 3, h: 2 },
      { x: 136, y: 10, w: 2, h: 3 },
      { x: 180, y: 11, w: 5, h: 2 }
    ];
    s.enemies = [
      { t: 'goomba', x: 24, y: 12 }, { t: 'goomba', x: 45, y: 12 },
      { t: 'koopa', x: 47, y: 12 }, { t: 'goomba', x: 62, y: 12 },
      { t: 'goomba', x: 72, y: 7 }, { t: 'koopa', x: 80, y: 9 },
      { t: 'goomba', x: 112, y: 12 }, { t: 'goomba', x: 130, y: 12 },
      { t: 'koopa', x: 137, y: 9 }, { t: 'goomba', x: 148, y: 12 },
      { t: 'goomba', x: 150, y: 12 }, { t: 'goomba', x: 168, y: 12 },
      { t: 'koopa', x: 170, y: 12 }
    ];
    s.coins = [
      { x: 20, y: 4 }, { x: 21, y: 4 }, { x: 22, y: 4 },
      { x: 35, y: 8 }, { x: 36, y: 8 }, { x: 37, y: 8 },
      { x: 53, y: 4 }, { x: 54, y: 4 }, { x: 55, y: 4 },
      { x: 79, y: 8 }, { x: 80, y: 8 }, { x: 81, y: 8 },
      { x: 117, y: 9 }, { x: 118, y: 9 },
      { x: 121, y: 4 }, { x: 122, y: 4 },
      { x: 181, y: 9 }, { x: 182, y: 9 }
    ];
    s.flagX = 181; s.castleX = 184;
    return s;
  }

  // ---------- World 1-3 (overworld, vertical) ----------
  function level13() {
    var s = mk();
    s.theme = 'overworld'; s.music = 'overworld'; s.time = 350; s.width = 208;
    s.ground = [[0, 13, 30, 2], [38, 13, 26, 2], [72, 13, 34, 2], [114, 13, 30, 2], [152, 13, 56, 2]];
    s.decor = [
      { t: 'hill', x: 2, y: 13 }, { t: 'bush', x: 12, y: 13 }, { t: 'cloud', x: 8, y: 2 },
      { t: 'cloud', x: 20, y: 3 }, { t: 'hill', x: 42, y: 13 }, { t: 'bush', x: 50, y: 13 },
      { t: 'cloud', x: 44, y: 2 }, { t: 'cloud', x: 58, y: 3 },
      { t: 'bush', x: 78, y: 13 }, { t: 'hill', x: 88, y: 13 }, { t: 'cloud', x: 76, y: 2 },
      { t: 'cloud', x: 90, y: 3 }, { t: 'bush', x: 120, y: 13 }, { t: 'cloud', x: 118, y: 2 },
      { t: 'cloud', x: 132, y: 3 }, { t: 'hill', x: 140, y: 13 },
      { t: 'cloud', x: 150, y: 2 }, { t: 'bush', x: 158, y: 13 }, { t: 'cloud', x: 166, y: 3 },
      { t: 'hill', x: 176, y: 13 }, { t: 'bush', x: 184, y: 13 }, { t: 'cloud', x: 180, y: 2 },
      { t: 'cloud', x: 194, y: 3 }
    ];
    s.qblocks = [
      { x: 12, y: 9, item: 'mushroom' }, { x: 13, y: 9, item: 'coin' },
      { x: 16, y: 5, item: '1up' },
      { x: 44, y: 9, item: 'mushroom' }, { x: 46, y: 9, item: 'coin' },
      { x: 48, y: 9, item: 'coin' },
      { x: 52, y: 6, item: 'star' },
      { x: 78, y: 9, item: 'mushroom' }, { x: 79, y: 5, item: 'coin' },
      { x: 80, y: 5, item: 'coin' }, { x: 81, y: 5, item: 'coin' },
      { x: 120, y: 9, item: 'coin' }, { x: 122, y: 9, item: 'mushroom' },
      { x: 124, y: 5, item: 'coin' }, { x: 125, y: 5, item: 'coin' },
      { x: 156, y: 9, item: 'star' },
      { x: 166, y: 9, item: 'mushroom' }, { x: 168, y: 9, item: 'coin' },
      { x: 170, y: 5, item: 'coin' }, { x: 171, y: 5, item: 'coin' }
    ];
    s.blocks = [
      { x: 13, y: 9, w: 1 }, { x: 17, y: 9, w: 1 },
      { x: 45, y: 9, w: 1 }, { x: 47, y: 9, w: 1 },
      { x: 121, y: 9, w: 1 }, { x: 123, y: 9, w: 1 },
      { x: 167, y: 9, w: 1 }, { x: 169, y: 9, w: 1 },
      { x: 88, y: 8, w: 6 }, { x: 142, y: 8, w: 4 }
    ];
    s.pipes = [
      { x: 22, y: 11, h: 2 }, { x: 25, y: 10, h: 3 },
      { x: 66, y: 11, h: 2 }, { x: 69, y: 9, h: 5 },
      { x: 104, y: 11, h: 2 }, { x: 130, y: 10, h: 3 },
      { x: 146, y: 11, h: 2 }
    ];
    s.solid = [
      { x: 0, y: 0, w: 1, h: 13 },
      { x: 34, y: 11, w: 4, h: 2 },
      { x: 54, y: 11, w: 6, h: 2 },
      { x: 92, y: 12, w: 4, h: 1 },
      { x: 110, y: 11, w: 4, h: 2 },
      { x: 132, y: 11, w: 5, h: 2 },
      { x: 176, y: 11, w: 6, h: 2 },
      { x: 190, y: 10, w: 8, h: 3 }
    ];
    s.stairs = [
      { x: 96, y: 12, n: 3, dir: 1 },
      { x: 100, y: 12, n: 6, dir: -1 },
      { x: 178, y: 12, n: 4, dir: 1 },
      { x: 186, y: 12, n: 8, dir: 1 },
      { x: 194, y: 12, n: 1, dir: -1 }
    ];
    s.enemies = [
      { t: 'goomba', x: 20, y: 12 }, { t: 'goomba', x: 26, y: 9 },
      { t: 'koopa', x: 42, y: 12 }, { t: 'goomba', x: 50, y: 12 },
      { t: 'goomba', x: 58, y: 9 }, { t: 'goomba', x: 60, y: 9 },
      { t: 'koopa', x: 76, y: 12 }, { t: 'goomba', x: 86, y: 7 },
      { t: 'goomba', x: 116, y: 12 }, { t: 'koopa', x: 122, y: 12 },
      { t: 'goomba', x: 128, y: 12 }, { t: 'koopa', x: 140, y: 12 },
      { t: 'goomba', x: 154, y: 12 }, { t: 'koopa', x: 162, y: 12 },
      { t: 'goomba', x: 172, y: 12 }, { t: 'goomba', x: 180, y: 9 },
      { t: 'goomba', x: 182, y: 9 }
    ];
    s.coins = [
      { x: 17, y: 4 }, { x: 53, y: 5 }, { x: 54, y: 5 },
      { x: 80, y: 4 }, { x: 81, y: 4 }, { x: 82, y: 4 },
      { x: 125, y: 4 }, { x: 170, y: 4 }, { x: 171, y: 4 },
      { x: 33, y: 9 }, { x: 34, y: 9 }, { x: 35, y: 9 },
      { x: 111, y: 9 }, { x: 112, y: 9 }, { x: 133, y: 9 }, { x: 134, y: 9 }
    ];
    s.flagX = 197; s.castleX = 200;
    return s;
  }

  // ---------- World 1-4 (bonus / lava castle) ----------
  function level14() {
    var s = mk();
    s.theme = 'castle'; s.music = 'fast'; s.time = 300; s.width = 184;
    s.ground = [[0, 13, 184, 2]];
    s.decor = [];
    s.qblocks = [
      { x: 20, y: 8, item: '1up' }, { x: 21, y: 8, item: 'coin' },
      { x: 56, y: 8, item: 'coin' }, { x: 57, y: 8, item: 'coin' },
      { x: 100, y: 8, item: 'mushroom' },
      { x: 132, y: 8, item: '1up' }, { x: 133, y: 8, item: 'coin' }
    ];
    s.blocks = [
      { x: 30, y: 8, w: 3 }, { x: 40, y: 8, w: 2 },
      { x: 70, y: 8, w: 4 }, { x: 90, y: 8, w: 3 },
      { x: 110, y: 8, w: 4 }, { x: 120, y: 8, w: 2 },
      { x: 145, y: 8, w: 4 }, { x: 160, y: 8, w: 3 }
    ];
    s.pipes = [];
    s.solid = [
      { x: 0, y: 0, w: 1, h: 15 },
      { x: 8, y: 11, w: 2, h: 2 },
      { x: 24, y: 9, w: 2, h: 4 },
      { x: 36, y: 10, w: 2, h: 3 },
      { x: 50, y: 11, w: 3, h: 2 },
      { x: 62, y: 10, w: 2, h: 3 },
      { x: 78, y: 9, w: 2, h: 4 },
      { x: 96, y: 11, w: 3, h: 2 },
      { x: 106, y: 10, w: 2, h: 3 },
      { x: 126, y: 9, w: 2, h: 4 },
      { x: 138, y: 11, w: 3, h: 2 },
      { x: 152, y: 10, w: 2, h: 3 },
      { x: 168, y: 9, w: 2, h: 4 }
    ];
    s.enemies = [
      { t: 'goomba', x: 16, y: 12 }, { t: 'goomba', x: 18, y: 12 },
      { t: 'koopa', x: 34, y: 12 }, { t: 'goomba', x: 44, y: 12 },
      { t: 'koopa', x: 58, y: 12 }, { t: 'goomba', x: 66, y: 12 },
      { t: 'koopa', x: 74, y: 12 }, { t: 'goomba', x: 84, y: 12 },
      { t: 'koopa', x: 94, y: 12 }, { t: 'goomba', x: 104, y: 12 },
      { t: 'koopa', x: 114, y: 12 }, { t: 'goomba', x: 122, y: 12 },
      { t: 'koopa', x: 130, y: 12 }, { t: 'goomba', x: 142, y: 12 },
      { t: 'koopa', x: 150, y: 12 }, { t: 'goomba', x: 158, y: 12 },
      { t: 'koopa', x: 166, y: 12 }
    ];
    s.coins = [
      { x: 25, y: 7 }, { x: 37, y: 8 }, { x: 51, y: 9 }, { x: 52, y: 9 },
      { x: 63, y: 8 }, { x: 79, y: 7 }, { x: 97, y: 9 }, { x: 107, y: 8 },
      { x: 127, y: 7 }, { x: 139, y: 9 }, { x: 153, y: 8 }, { x: 169, y: 7 }
    ];
    s.flagX = 175; s.castleX = 178;
    s.noCastleDoor = false;
    return s;
  }

  // ---------- World 1-5 (fast finale) ----------
  function level15() {
    var s = mk();
    s.theme = 'overworld'; s.music = 'fast'; s.time = 300; s.width = 218;
    s.ground = [[0, 13, 24, 2], [32, 13, 22, 2], [62, 13, 26, 2], [96, 13, 30, 2], [134, 13, 84, 2]];
    s.decor = [
      { t: 'hill', x: 2, y: 13 }, { t: 'cloud', x: 6, y: 2 }, { t: 'cloud', x: 16, y: 3 },
      { t: 'bush', x: 36, y: 13 }, { t: 'cloud', x: 34, y: 2 }, { t: 'cloud', x: 46, y: 3 },
      { t: 'hill', x: 66, y: 13 }, { t: 'bush', x: 72, y: 13 }, { t: 'cloud', x: 64, y: 2 },
      { t: 'cloud', x: 78, y: 3 }, { t: 'hill', x: 100, y: 13 }, { t: 'bush', x: 106, y: 13 },
      { t: 'cloud', x: 100, y: 2 }, { t: 'cloud', x: 112, y: 3 },
      { t: 'bush', x: 140, y: 13 }, { t: 'hill', x: 148, y: 13 }, { t: 'cloud', x: 138, y: 2 },
      { t: 'cloud', x: 152, y: 3 }, { t: 'bush', x: 166, y: 13 }, { t: 'cloud', x: 164, y: 2 },
      { t: 'hill', x: 176, y: 13 }, { t: 'cloud', x: 182, y: 3 }, { t: 'bush', x: 190, y: 13 },
      { t: 'cloud', x: 198, y: 2 }, { t: 'hill', x: 206, y: 13 }
    ];
    s.qblocks = [
      { x: 10, y: 9, item: 'mushroom' },
      { x: 38, y: 9, item: 'coin' }, { x: 40, y: 9, item: 'star' },
      { x: 68, y: 9, item: 'mushroom' }, { x: 71, y: 5, item: 'coin' },
      { x: 72, y: 5, item: 'coin' }, { x: 73, y: 5, item: 'coin' },
      { x: 102, y: 9, item: '1up' }, { x: 105, y: 9, item: 'coin' },
      { x: 110, y: 5, item: '1up' },
      { x: 142, y: 9, item: 'mushroom' }, { x: 144, y: 9, item: 'coin' },
      { x: 170, y: 9, item: 'coin' }, { x: 172, y: 9, item: 'coin' },
      { x: 174, y: 5, item: 'coin' }, { x: 175, y: 5, item: 'coin' },
      { x: 176, y: 5, item: 'coin' }
    ];
    s.blocks = [
      { x: 11, y: 9, w: 1 },
      { x: 39, y: 9, w: 1 },
      { x: 69, y: 9, w: 1 }, { x: 70, y: 9, w: 1 },
      { x: 103, y: 9, w: 1 }, { x: 106, y: 9, w: 1 },
      { x: 143, y: 9, w: 1 },
      { x: 171, y: 9, w: 1 }, { x: 173, y: 9, w: 1 }
    ];
    s.pipes = [
      { x: 18, y: 11, h: 2 }, { x: 44, y: 11, h: 2 },
      { x: 90, y: 11, h: 2 }, { x: 93, y: 10, h: 3 },
      { x: 118, y: 11, h: 2 }, { x: 121, y: 9, h: 4 },
      { x: 190, y: 11, h: 2 }
    ];
    s.solid = [
      { x: 0, y: 0, w: 1, h: 13 },
      { x: 24, y: 0, w: 8, h: 15 },
      { x: 54, y: 0, w: 8, h: 15 },
      { x: 88, y: 11, w: 8, h: 2 },
      { x: 126, y: 12, w: 8, h: 1 },
      { x: 148, y: 11, w: 6, h: 2 },
      { x: 180, y: 11, w: 8, h: 2 },
      { x: 198, y: 11, w: 6, h: 2 }
    ];
    s.stairs = [
      { x: 154, y: 12, n: 5, dir: 1 },
      { x: 202, y: 12, n: 8, dir: 1 },
      { x: 210, y: 12, n: 1, dir: -1 }
    ];
    s.enemies = [
      { t: 'goomba', x: 20, y: 12 }, { t: 'goomba', x: 36, y: 12 },
      { t: 'goomba', x: 42, y: 12 }, { t: 'koopa', x: 48, y: 12 },
      { t: 'goomba', x: 66, y: 12 }, { t: 'goomba', x: 76, y: 12 },
      { t: 'goomba', x: 78, y: 12 }, { t: 'koopa', x: 100, y: 12 },
      { t: 'goomba', x: 108, y: 12 }, { t: 'goomba', x: 112, y: 12 },
      { t: 'koopa', x: 130, y: 12 }, { t: 'goomba', x: 136, y: 12 },
      { t: 'goomba', x: 146, y: 12 }, { t: 'koopa', x: 156, y: 12 },
      { t: 'goomba', x: 166, y: 12 }, { t: 'goomba', x: 168, y: 12 },
      { t: 'goomba', x: 176, y: 12 }, { t: 'koopa', x: 184, y: 12 },
      { t: 'goomba', x: 196, y: 12 }, { t: 'goomba', x: 198, y: 12 }
    ];
    s.coins = [
      { x: 72, y: 4 }, { x: 73, y: 4 }, { x: 74, y: 4 },
      { x: 175, y: 4 }, { x: 176, y: 4 }, { x: 177, y: 4 },
      { x: 32, y: 9 }, { x: 33, y: 9 }, { x: 34, y: 9 },
      { x: 63, y: 9 }, { x: 64, y: 9 },
      { x: 145, y: 9 }, { x: 146, y: 9 },
      { x: 181, y: 9 }, { x: 182, y: 9 }, { x: 183, y: 9 }
    ];
    s.flagX = 208; s.castleX = 211;
    return s;
  }

  var LIST = [
    { id: '1-1', name: 'WORLD 1-1', build: level11 },
    { id: '1-2', name: 'WORLD 1-2', build: level12 },
    { id: '1-3', name: 'WORLD 1-3', build: level13 },
    { id: '1-4', name: 'WORLD 1-4', build: level14 },
    { id: '1-5', name: 'WORLD 1-5', build: level15 }
  ];

  return {
    list: LIST,
    count: LIST.length,
    get: function (i) {
      var idx = ((i % LIST.length) + LIST.length) % LIST.length;
      return LIST[idx].build();
    },
    name: function (i) {
      var idx = ((i % LIST.length) + LIST.length) % LIST.length;
      return LIST[idx].name;
    },
    id: function (i) {
      var idx = ((i % LIST.length) + LIST.length) % LIST.length;
      return LIST[idx].id;
    }
  };
})();
