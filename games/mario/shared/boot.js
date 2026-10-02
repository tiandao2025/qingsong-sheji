// boot.js — single-file bundle of the shared engine.
// Generated from the files in shared/ ; edit those, then re-run tools/build-bundle.js
// Works both in a browser (globals) and inside a WeChat Mini Program (module scope).

// ============================ util.js ============================
var U = (function () {
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function approach(v, target, step) {
    if (v < target) return Math.min(v + step, target);
    if (v > target) return Math.max(v - step, target);
    return target;
  }
  function rand(a, b) { if (a === undefined) { a = 0; b = 1; } if (b === undefined) { b = a; a = 0; } return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function pad(num, len) {
    var s = '' + num;
    while (s.length < len) s = '0' + s;
    return s;
  }
  function timeToMMSS(frames) {
    var total = Math.floor(frames / 60);
    var m = Math.floor(total / 60);
    var s = total % 60;
    if (m > 99) m = 99;
    return U.pad(m, 2) + '-' + U.pad(s, 2);
  }
  function nowMs() { return Date.now(); }
  function sign(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }
  function toInt(v, d) { v = parseInt(v, 10); return isNaN(v) ? (d || 0) : v; }
  return {
    clamp: clamp, lerp: lerp, approach: approach, rand: rand, randInt: randInt, pick: pick,
    mulberry32: mulberry32, rectsOverlap: rectsOverlap, pad: pad, timeToMMSS: timeToMMSS,
    nowMs: nowMs, sign: sign, toInt: toInt
  };
})();


// ============================ input.js ============================
var IN = (function () {
  var API = {};
  var held = {};
  var edge = {};
  var keyMap = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    KeyZ: 'jump', Space: 'jump', KeyK: 'jump', KeyJ: 'jump',
    ShiftLeft: 'run', ShiftRight: 'run', KeyX: 'run',
    Enter: 'start', KeyR: 'restart', KeyM: 'mute', Escape: 'pause'
  };

  function set(name, v) {
    if (!name) return;
    v = !!v;
    if (held[name] === v) return;
    held[name] = v;
    if (v) edge[name] = true;
  }
  function down(name) { return !!held[name]; }
  function pressed(name) { return !!edge[name]; }
  function releaseAll() { held = {}; }
  function clearEdges() { edge = {}; }
  function tick() { edge = {}; }

  function key(name) { return !!keyMap[name]; }

  API.set = set;
  API.down = down;
  API.pressed = pressed;
  API.releaseAll = releaseAll;
  API.clearEdges = clearEdges;
  API.tick = tick;
  API.isTouch = false;
  return API;
})();


// ============================ sfx.js ============================
var SFX = (function () {
  var API = {};
  var ctx = null;
  var master = null;
  var enabled = true;
  var musicTimer = null;
  var musicStep = 0;
  var musicName = null;
  var isMini = (typeof wx !== 'undefined' && typeof wx.createWebAudioContext === 'function');

  function ensure() {
    if (ctx) return true;
    if (isMini) {
      try {
        ctx = wx.createWebAudioContext();
        master = ctx.createGain();
        master.gain.value = 0.3;
        master.connect(ctx.destination);
        return true;
      } catch (e) { ctx = null; return false; }
    }
    var AC = (typeof AudioContext !== 'undefined') ? AudioContext
           : (typeof webkitAudioContext !== 'undefined') ? webkitAudioContext : null;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.28;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; return false; }
    return true;
  }
  function resume() {
    if (!ensure()) return;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) {} }
  }
  function now() { return ctx ? (ctx.currentTime || 0) : 0; }

  function beep(freq, dur, type, vol, when) {
    if (!enabled || !ensure()) return;
    var t = now() + (when || 0);
    try {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol == null ? 0.3 : vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(master);
      osc.start(t); osc.stop(t + dur + 0.02);
    } catch (e) {}
  }
  function sweep(f1, f2, dur, type, vol, when) {
    if (!enabled || !ensure()) return;
    var t = now() + (when || 0);
    try {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(f1, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol == null ? 0.3 : vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(master);
      osc.start(t); osc.stop(t + dur + 0.02);
    } catch (e) {}
  }
  function noise(dur, vol, when) {
    if (!enabled || !ensure()) return;
    var t = now() + (when || 0);
    try {
      var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      var g = ctx.createGain();
      g.gain.value = vol == null ? 0.2 : vol;
      var flt = ctx.createBiquadFilter();
      flt.type = 'lowpass'; flt.frequency.value = 1400;
      src.connect(flt); flt.connect(g); g.connect(master);
      src.start(t);
    } catch (e) {}
  }

  var SFX_MAP = {
    jump: function () { sweep(320, 760, 0.15, 'square', 0.22); },
    bigjump: function () { sweep(280, 860, 0.17, 'square', 0.24); },
    stomp: function () { sweep(520, 130, 0.12, 'square', 0.24); },
    coin: function () { beep(988, 0.06, 'square', 0.22); beep(1319, 0.15, 'square', 0.22, 0.06); },
    powerup: function () { var n = [523, 659, 784, 1047]; for (var i = 0; i < 4; i++) beep(n[i], 0.09, 'square', 0.22, i * 0.07); },
    powerdown: function () { var n = [784, 659, 523, 392]; for (var i = 0; i < 4; i++) beep(n[i], 0.09, 'square', 0.2, i * 0.07); },
    break: function () { noise(0.16, 0.22); sweep(220, 60, 0.15, 'square', 0.18); },
    bump: function () { sweep(170, 110, 0.08, 'square', 0.2); },
    kick: function () { sweep(720, 200, 0.08, 'triangle', 0.22); },
    fire: function () { sweep(920, 260, 0.1, 'sawtooth', 0.18); },
    die: function () { sweep(620, 90, 0.55, 'square', 0.24); },
    '1up': function () { var n = [784, 988, 1319]; for (var i = 0; i < 3; i++) beep(n[i], 0.1, 'square', 0.22, i * 0.09); },
    clear: function () { var n = [523, 659, 784, 1047, 784, 1047, 1319]; for (var i = 0; i < 7; i++) beep(n[i], 0.12, 'square', 0.22, i * 0.13); },
    flag: function () { sweep(300, 950, 0.3, 'square', 0.2); },
    pause: function () { beep(440, 0.08, 'triangle', 0.18); },
    select: function () { beep(660, 0.05, 'square', 0.18); }
  };

  var MELODIES = {
    overworld: [131, 147, 165, 196, 165, 147, 131, 110, 131, 147, 165, 196, 220, 196, 165, 147],
    fast: [196, 196, 220, 196, 165, 196, 247, 220, 196, 196, 165, 147, 131, 147, 165],
    star: [523, 659, 784, 1047, 988, 784, 659, 523, 587, 740, 880, 1175, 1047, 880, 740, 587],
    hurry: [262, 262, 294, 330, 392, 330, 294, 262, 330, 392, 440, 392, 330, 294, 262, 196]
  };

  function tickMusic() {
    if (!enabled || !musicName) return;
    var mel = MELODIES[musicName];
    if (!mel) return;
    var n = mel[musicStep % mel.length];
    beep(n, 0.11, musicName === 'star' ? 'triangle' : 'square', musicName === 'star' ? 0.15 : 0.12);
    musicStep++;
  }

  API.init = function (ac) {
    if (ac) {
      ctx = ac;
      if (!master) {
        master = ctx.createGain();
        master.gain.value = 0.28;
        master.connect(ctx.destination);
      }
      return;
    }
    ensure();
  };
  API.resume = resume;
  API.play = function (name) {
    var f = SFX_MAP[name];
    if (f) f();
  };
  API.startMusic = function (name) {
    musicName = name;
    musicStep = 0;
    ensure();
    resume();
    if (musicTimer) return;
    musicTimer = setInterval(tickMusic, 118);
  };
  API.stopMusic = function () {
    musicName = null;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  };
  API.setMusic = function (name) {
    if (musicName === name) return;
    API.stopMusic();
    if (name) API.startMusic(name);
  };
  API.pauseMusic = function () { API.stopMusic(); };
  API.setEnabled = function (v) {
    enabled = !!v;
    if (!enabled) API.stopMusic();
  };
  API.isEnabled = function () { return enabled; };
  API.isMini = function () { return isMini; };
  return API;
})();


// ============================ art.js ============================
var ART = (function () {

  function raster(rows, map) {
    var h = rows.length, w = 0, i, r;
    for (i = 0; i < h; i++) if (rows[i].length > w) w = rows[i].length;
    var data = new Array(w * h);
    for (r = 0; r < h; r++) {
      var row = rows[r];
      for (i = 0; i < w; i++) {
        var ch = i < row.length ? row.charAt(i) : '.';
        data[r * w + i] = map[ch] || null;
      }
    }
    return { w: w, h: h, data: data };
  }
  function P() {
    var m = {};
    for (var i = 0; i < arguments.length; i += 2) m[arguments[i]] = arguments[i + 1];
    return m;
  }

  var sprites = {};
  var fonts = {};
  function S(name, packed, map) {
    if (typeof packed === 'string') packed = packed.split('|');
    else if (Array.isArray(packed)) packed = packed.slice();
    sprites[name] = raster(packed, map);
  }

  // ================= PALETTES =================
  var M = P('K', '#201810', 'S', '#fcbc70', 's', '#d07830', 'R', '#e83800', 'r', '#a81800',
    'B', '#2050e0', 'b', '#1028a0', 'N', '#7c3c10', 'n', '#4a2000', 'W', '#ffffff',
    'y', '#c08800', 'G', '#38b038', 'C', '#58c8f8');
  var M_FIRE = P('K', '#201810', 'S', '#fcbc70', 's', '#d07830', 'R', '#ffffff', 'r', '#d8d8d8',
    'B', '#e83800', 'b', '#a81800', 'N', '#7c3c10', 'n', '#4a2000', 'W', '#ffffff',
    'y', '#c08800', 'G', '#38b038', 'C', '#58c8f8');
  var M_LUIGI = P('K', '#201810', 'S', '#fcbc70', 's', '#d07830', 'R', '#28a828', 'r', '#186818',
    'B', '#2050e0', 'b', '#1028a0', 'N', '#7c3c10', 'n', '#4a2000', 'W', '#ffffff',
    'y', '#c08800', 'G', '#38b038', 'C', '#58c8f8');
  var M_PEACH = P('K', '#201810', 'S', '#fcd8b0', 's', '#d8a070', 'R', '#e83800', 'r', '#a81800',
    'B', '#f878b8', 'b', '#c04888', 'N', '#7c3c10', 'n', '#4a2000', 'W', '#ffffff',
    'y', '#c08800', 'G', '#38b038', 'C', '#58c8f8');

  // ================= HERO POSES =================
  var HM = [
    '.....KKKKK....',
    '....KRRRRRK...',
    '...KRRRRRRRK..',
    '...KKKSSSSSK..',
    '..KSKKSSSSSK..',
    '..KSKWSSSSSK..',
    '..KSSSKWSSSK..',
    '...KSSSSSSK...',
    '...KKSSSKK....',
    '..KRRRRRRRK...',
    '..sRBRRRRBRs..',
    '..sRBRRRRBRs..',
    '...BBKBBKB....',
    '...BBBBBBB....',
    '...BBYBBYB....',
    '..KKBBBBBBKK..',
    '.KNNKBBKBKNNK.',
    '.KNNNK.K.KNNNK',
    '.KnnnK.K.KnnnK'
  ];
  var HM_WALK1 = [
    '.....KKKKK....',
    '....KRRRRRK...',
    '...KRRRRRRRK..',
    '...KKKSSSSSK..',
    '..KSKKSSSSSK..',
    '..KSKWSSSSSK..',
    '..KSSSKWSSSK..',
    '...KSSSSSSK...',
    '...KKSSSKK....',
    '..KRRRRRRRK...',
    '..sRBRRRRBRs..',
    '..sRBRRRRBRs..',
    '...BBBBBBB....',
    '..KBBYBBYBKK..',
    '.KNNBBYBBYNNK.',
    'KNNNKBBBBKNNNK',
    'KnnnK.K..KnnnK',
    '..KKK......KK.'
  ];
  var HM_WALK2 = [
    '.....KKKKK....',
    '....KRRRRRK...',
    '...KRRRRRRRK..',
    '...KKKSSSSSK..',
    '..KSKKSSSSSK..',
    '..KSKWSSSSSK..',
    '..KSSSKWSSSK..',
    '...KSSSSSSK...',
    '...KKSSSKK....',
    '..KRRRRRRRK...',
    '..sRBRRRRBRs..',
    '..sRBRRRRBRs..',
    '...BBBBBBB....',
    '....BBYBBY....',
    '...KBBBYBBK...',
    '..KNNBBYBBNNK.',
    '..KNNNKK.KNNNK',
    '..KnnnK...Knnn'
  ];
  var HM_JUMP = [
    '..K....KKKKK..',
    '.KRK..KRRRRRK.',
    '.KRRKKRRRRRRRK',
    '..KKKSSSSSSK..',
    '.KSKKSSSSSSK..',
    'KSSKWSSSKSSK..',
    '.SSSKWSSKSSK..',
    '..KSSSSSSKK...',
    '...KSSSSSK....',
    '..KRRRRRRRK...',
    '.KRBRRRRRBRK..',
    'KRRBBRRRRBBRK.',
    'KRRBBBBBBBBRRK',
    '.sBBBBBBBBBBs.',
    '..BBYBBYBBYBB.',
    '..BBB..BBB.BB.',
    '.KNNK..KNNKB..',
    'KNNNK..KNNNK..',
    'KnnnK..KnnnK..'
  ];
  var HM_SKID = [
    '......KKKKK...',
    '.....KRRRRRK..',
    '....KRRRRRRRK.',
    '....KKKSSSSSK.',
    '...KSKKSSSSSK.',
    '...KSKWSSSSSK.',
    '...KSSSKWSSSK.',
    '....KSSSSSSK..',
    '....KKSSSKK...',
    '...KRRRRRRRK..',
    '...sRBRRRRBRs.',
    '...sRBRRRRBRs.',
    '....BBBBBBB...',
    '...KBBYBBYB...',
    '..KNNBYBYBNNK.',
    '..KNNNKK.KNNK.',
    '...KnnK...Knn.'
  ];
  var HM_CLIMB = [
    '..K...KKKKK...',
    '..KR..KRRRRRK..',
    '..KRRKRRRRRRRK.',
    '..KKKSSSSSSSK..',
    '.KSKKSSSSSSK...',
    'KSSKWSSSSSK....',
    '.SSSKWSSSK.....',
    '..KSSSSSK......',
    '..KSSSSSK......',
    '.KRRRRRRRK.....',
    'KRRRRRRRRK.....',
    '.sRRRRRRs......',
    '..BBBBBB.......',
    '..BBYBBY.......',
    '..BBBBBB.......',
    '.KNNNBBKK......',
    'KNNNK.KNNNK....',
    '.KnnK..KnnK...'
  ];
  var HM_DIE = [
    '.....KKKKK....',
    '....KRRRRRK...',
    '...KRRRRRRRK..',
    '...KKKSSSSSK..',
    '..KSKKSSSSSK..',
    '..KKKWSSSSSK..',
    '..KSSKSSSSSK..',
    '...KSSSSSSK...',
    '..KKSSKSSKK...',
    '.KRRRRSSRRRK..',
    '.sRBRRRRRBRs..',
    '.sRBRRRRRBRs..',
    '..BBBBBBBBB...',
    '..BBYBBBYBB...',
    '..BBBBBBBBB...',
    '.KNNNBBBNNNK..',
    'KNNNK.K.KNNNK.',
    '.KKK.....KKK..'
  ];
  var HM_BIG = [
    '.....KKKKK....',
    '....KRRRRRK...',
    '...KRRRRRRRK..',
    '...KKKSSSSSK..',
    '..KSKKSSSSSK..',
    '..KSKWSSSSSK..',
    '..KSSSKWSSSK..',
    '...KSSSSSSK...',
    '...KKSSSKK....',
    '..KRRRRRRRK...',
    '..sRBRRRRBRs..',
    '..sRBRRRRBRs..',
    '...BBBBBBB....',
    '...BBYBBYB....',
    '...BBBBBBB....',
    '...BBYBBYB....',
    '...BBBBBBB....',
    '..KNNBBBNNK...',
    '.KNNNK.KNNNK..',
    '.KnnnK.KnnnK..',
    '.KKKK...KKKK..'
  ];
  var HM_BIGWALK1 = [
    '.....KKKKK....',
    '....KRRRRRK...',
    '...KRRRRRRRK..',
    '...KKKSSSSSK..',
    '..KSKKSSSSSK..',
    '..KSKWSSSSSK..',
    '..KSSSKWSSSK..',
    '...KSSSSSSK...',
    '...KKSSSKK....',
    '..KRRRRRRRK...',
    '..sRBRRRRBRs..',
    '..sRBRRRRBRs..',
    '...BBBBBBB....',
    '...BBYBBYB....',
    '...BBBBBBB....',
    '..KBBBBBBBK...',
    '.KNNBYBBYBNNK.',
    'KNNNKBBBBKNNNK',
    'KnnnK.K..KnnnK',
    '.KKKK......KK.'
  ];
  var HM_BIGWALK2 = [
    '.....KKKKK....',
    '....KRRRRRK...',
    '...KRRRRRRRK..',
    '...KKKSSSSSK..',
    '..KSKKSSSSSK..',
    '..KSKWSSSSSK..',
    '..KSSSKWSSSK..',
    '...KSSSSSSK...',
    '...KKSSSKK....',
    '..KRRRRRRRK...',
    '..sRBRRRRBRs..',
    '..sRBRRRRBRs..',
    '...BBBBBBB....',
    '...BBYBBYB....',
    '...BBBBBBB....',
    '....BBYBBY....',
    '...KBBBBBBK...',
    '..KNNBYBYBNNK.',
    '..KNNNKK.KNNK.',
    '..KnnK...KnnK.'
  ];
  var HM_BIGJUMP = [
    '..K....KKKKK..',
    '.KRK..KRRRRRK.',
    '.KRRKKRRRRRRRK',
    '..KKKSSSSSSK..',
    '.KSKKSSSSSSK..',
    'KSSKWSSSKSSK..',
    '.SSSKWSSKSSK..',
    '..KSSSSSSKK...',
    '...KSSSSSK....',
    '..KRRRRRRRK...',
    '.KRBRRRRRBRK..',
    'KRRBBRRRRBBRK.',
    'KRRBBBBBBBBRRK',
    '.sBBBBBBBBBBs.',
    '..BBYBBYBBYBB.',
    '..BBB..BBB.BB.',
    '.KBBK..KBBK...',
    'KNNBK..KBNNK..',
    'KnnnK..KnnnK..',
    '.KKKK...KKKK..'
  ];
  var HM_BIGSKID = [
    '......KKKKK...',
    '.....KRRRRRK..',
    '....KRRRRRRRK.',
    '....KKKSSSSSK.',
    '...KSKKSSSSSK.',
    '...KSKWSSSSSK.',
    '...KSSSKWSSSK.',
    '....KSSSSSSK..',
    '....KKSSSKK...',
    '...KRRRRRRRK..',
    '...sRBRRRRBRs.',
    '...sRBRRRRBRs.',
    '....BBBBBBB...',
    '...KBBYBBYB...',
    '....BBBBBBB...',
    '..KNNBYBYBNNK.',
    '..KNNNKK.KNNK.',
    '...KnnK...Knn.',
    '....KK.....KK.'
  ];
  var HM_CROUCH = [
    '..............',
    '..............',
    '..............',
    '.....KKKKK....',
    '....KRRRRRK...',
    '...KRRRRRRRK..',
    '...KKKSSSSSK..',
    '..KSKKSSSSSK..',
    '..KSKWSSSSSK..',
    '..KSSSKWSSSK..',
    '...KSSSSSSK...',
    '...KKSSSKK....',
    '..KRRRRRRRK...',
    '..sRBRRRRBRs..',
    '..sRBRRRRBRs..',
    '...BBBBBBB....',
    '...BBYBBYB....',
    '...BBBBBBB....',
    '..KNNBBBNNK...',
    '.KNNNK.KNNNK..',
    '.KnnnK.KnnnK..'
  ];
  var HM_BIGCROUCH = [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.....KKKKK....',
    '....KRRRRRK...',
    '...KRRRRRRRK..',
    '...KKKSSSSSK..',
    '..KSKKSSSSSK..',
    '..KSKWSSSSSK..',
    '..KSSSKWSSSK..',
    '...KSSSSSSK...',
    '...KKSSSKK....',
    '..KRRRRRRRK...',
    '..sRBRRRRBRs..',
    '..sRBRRRRBRs..',
    '...BBBBBBB....',
    '...BBYBBYB....',
    '...BBBBBBB....',
    '..KNNBBBNNK...',
    '.KNNNK.KNNNK..',
    '.KnnnK.KnnnK..'
  ];

  var POSES_SMALL = { idle: HM, walk1: HM_WALK1, walk2: HM_WALK2, jump: HM_JUMP, skid: HM_SKID, climb: HM_CLIMB, die: HM_DIE };
  var POSES_BIG = { idle: HM_BIG, walk1: HM_BIGWALK1, walk2: HM_BIGWALK2, jump: HM_BIGJUMP, skid: HM_BIGSKID, climb: HM_CLIMB, die: HM_DIE };
  var PALETTES = { mario: M, fire: M_FIRE, luigi: M_LUIGI, peach: M_PEACH };

  function buildHero(prefix, poses, pal) {
    for (var k in poses) S(prefix + '_' + k, poses[k], pal);
  }
  buildHero('h_mario', POSES_SMALL, M);
  buildHero('h_mario_big', POSES_BIG, M);
  buildHero('h_fire', POSES_SMALL, M_FIRE);
  buildHero('h_fire_big', POSES_BIG, M_FIRE);
  buildHero('h_luigi', POSES_SMALL, M_LUIGI);
  buildHero('h_luigi_big', POSES_BIG, M_LUIGI);
  buildHero('h_peach', POSES_SMALL, M_PEACH);
  buildHero('h_peach_big', POSES_BIG, M_PEACH);
  S('crouch', HM_CROUCH, M);
  S('crouch_big', HM_BIGCROUCH, M);
  S('crouch_fire', HM_CROUCH, M_FIRE);
  S('crouch_fire_big', HM_BIGCROUCH, M_FIRE);

  // ================= GOOMBA =================
  var GOOM = P('K', '#201810', 'W', '#ffffff', 'b', '#c83800', 'B', '#b85818', 'N', '#7c3c10', 'n', '#4a2000');
  S('goomba1', [
    '.....KKKK.....',
    '...KKBBBBKK...',
    '..KBBBBBBBBK..',
    '.KBBBBBBBBBBK.',
    '.KBWWBBBBWWBK.',
    '.KBBWWBBBBWWBK',
    '.KBBBBBBBBBBK.',
    '..KBBBBBBBBK..',
    '...KKBBBBKK...',
    '....KnnnnK....',
    '...KnnnnnnK...',
    '..KnnKnnKnnK..',
    '.KnnnKnnKnnnK.',
    '.KnnnKnnKnnnK.',
    '..KKKKKKKKKK..'
  ], GOOM);
  S('goomba2', [
    '..............',
    '.....KKKK.....',
    '...KKBBBBKK...',
    '..KBBBBBBBBK..',
    '.KBBBBBBBBBBK.',
    '.KBWWBBBBWWBK.',
    '.KBBWWBBBBWWBK',
    '.KBBBBBBBBBBK.',
    '..KBBBBBBBBK..',
    '...KKBBBBKK...',
    '....KnnnnK....',
    '...KnnnnnnK...',
    '..KnnKnnKnnK..',
    '.KnnnKnnKnnnK.',
    '..KKKKKKKKKK..'
  ], GOOM);
  S('goomba_flat', [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.KKKKKKKKKKKK.',
    'KnnnnnnnnnnnnK',
    'KnnnnnnnnnnnnK',
    '.KKKKKKKKKKKK.'
  ], GOOM);

  // ================= KOOPA =================
  var KOO = P('K', '#201810', 'G', '#38b038', 'g', '#1c7820', 'W', '#ffffff', 'Y', '#fcd000',
    'y', '#c08800', 'O', '#f88018', 'N', '#7c3c10', 'n', '#4a2000', 'S', '#f8d800');
  S('koopa1', [
    '.....KKKKK....',
    '....KGGGKK...',
    '...KGGGGGGK...',
    '..KGGWGGGGGK..',
    '..KGGGKGWGGK..',
    '..KGGGGGGGGK..',
    '...KGGGGGGK...',
    '..KKGGGGGGKK..',
    '.KYYKYYKYYK...',
    'KYYYKYYKYYYK..',
    'KyyyKyyKyyyK..',
    '.KYyKYyKYyYK..',
    '..KGKGKGKGK...',
    '.KNNNK.KNNNK..',
    'KnnnK...KnnnK.'
  ], KOO);
  S('koopa2', [
    '.....KKKKK....',
    '....KGGGKK...',
    '...KGGGGGGK...',
    '..KGGWGGGGGK..',
    '..KGGGKGWGGK..',
    '..KGGGGGGGGK..',
    '...KGGGGGGK...',
    '..KKGGGGGGKK..',
    '.KYYKYYKYYK...',
    'KYYYKYYKYYYK..',
    'KyyyKyyKyyyK..',
    '.KYyKYyKYyYK..',
    '..KGKGKGKGK...',
    'KNNNK...KNNNK.',
    'KnnnK...KnnnK.'
  ], KOO);
  S('shell', [
    '................',
    '................',
    '..KKKKKKKKKK....',
    '.KGGGGGGGGGGK...',
    'KGGGGGGGGGGGGK..',
    'KGGKyKKKyKKGK..',
    'KGKyKKKyKKKyGK.',
    'KGKyKKKyKKKyGK.',
    'KGGKyKKKyKKGK..',
    'KGGGGGGGGGGGGK..',
    'KYYYGYYYGYYYYK..',
    'KyyyKyyyKyyyK..',
    '.KYyKYyKYyYK...',
    '..KGKGKGKGK....',
    '...KKKKKKKK....'
  ], KOO);

  // ================= ITEMS =================
  var ITEM = P('K', '#201810', 'R', '#e83800', 'r', '#a81800', 'W', '#ffffff', 'w', '#f8d8a0',
    'G', '#38b038', 'g', '#187818', 'S', '#fcd000', 's', '#c08800', 'Y', '#f8f0a0', 'B', '#58c8f8', 'N', '#7c3c10');
  S('mushroom', [
    '.....KKKKKK.....',
    '...KKRRRRRRKK...',
    '..KRRWWRRWWRRK..',
    '.KRRWWW RRWWRRK.',
    '.KRWWWWWWWWWRRK.',
    'KRRWWRRRRRRWWRRK',
    'KRWWRRRRRRRWWRK.',
    'KRRRRRRRRRRRRRK.',
    '.KRRRRRRRRRRRK..',
    '..KKDDDDDDDDKK..',
    '....KDDDDDDK....',
    '....KDDDDDDK....',
    '...KDDDDDDDDK...',
    '..KDDDDDDDDDDK..',
    '..KNNNNNNNNNNK..',
    '...KKKKKKKKKK...'
  ], ITEM);
  S('oneup', [
    '.....KKKKKK.....',
    '...KKGGGGGGKK...',
    '..KGGWWGGWWGGK..',
    '.KGGWWWGGWWWGGK.',
    '.KGWWWWWWWWWWGK.',
    'KGGWWRRRRRRWWRGK',
    'KGWWRRRRRRRRWWGK',
    'KGGRRRRRRRRRRGGK',
    '.KGGGRRRRRRGGGK.',
    '..KKDDDDDDDDKK..',
    '....KDDDDDDK....',
    '....KDDDDDDK....',
    '...KDDDDDDDDK...',
    '..KDDDDDDDDDDK..',
    '..KNNNNNNNNNNK..',
    '...KKKKKKKKKK...'
  ], ITEM);
  S('star', [
    '.......KK.......',
    '......KYYK......',
    '......KYYK......',
    '.....KYYYYK.....',
    'KKKKKKYYYYKKKKKK',
    'KYYYYYYYYYYYYYYK',
    '.KYYYYYYYYYYYYK.',
    '..KYYYYYYYYYYK..',
    '...KYYYYYYYYK...',
    '...KYYYYYYYYK...',
    '..KYYYYKYYYYK..',
    '..KYYYK.KYYYK..',
    '.KYYYK...KYYYK.',
    '.KYK.......KYK.',
    '.KK.........KK.'
  ], ITEM);
  S('coin1', [
    '....KKKK....',
    '..KKYYYYKK..',
    '.KYYSSSSYYK.',
    '.KYSSWWWSSYK',
    'KYSSWWWWSSYK',
    'KYSSWWWWSSYK',
    'KYSSWWWWSSYK',
    '.KYSSWWWSSYK',
    '.KYYSSSSYYK.',
    '..KKYYYYKK..',
    '....KKKK....'
  ], ITEM);
  S('coin2', [
    '.....KKK.....',
    '....KYKYK....',
    '...KYSWYYK...',
    '...KYWWWYK...',
    '...KYWWWYK...',
    '...KYWWWYK...',
    '...KYWWWYK...',
    '...KYWWWYK...',
    '...KYSWYYK...',
    '....KYKYK....',
    '.....KKK.....'
  ], ITEM);
  S('coin3', [
    '......K......',
    '.....KYK.....',
    '.....KYK.....',
    '.....KYK.....',
    '.....KYK.....',
    '.....KYK.....',
    '.....KYK.....',
    '.....KYK.....',
    '.....KYK.....',
    '.....KYK.....',
    '......K......'
  ], ITEM);
  S('fireball1', [
    '..KKKK..',
    '.KRRRRK.',
    'KRYWRRYY',
    'KRWWRRRR',
    'KRRRRRRK',
    '.KRRRRK.',
    '..KKKK..'
  ], ITEM);
  S('fireball2', [
    '...KK...',
    '.KKRRKK.',
    'KRYWRYYK',
    'KRWYRRRK',
    'KRRWWRRK',
    '.KRRRRK.',
    '..KKKK..'
  ], ITEM);

  // ================= TILES 16x16 =================
  var T1 = P('K', '#201810', 'D', '#e08840', 'd', '#b05820', 'L', '#fcd088', 'l', '#c07830',
    'G', '#5cd050', 'g', '#2c8c28', 'S', '#fcd000', 's', '#c08800', 'O', '#f88018',
    'B', '#58c8f8', 'W', '#ffffff', 'C', '#a86028', 'c', '#783810', 'N', '#584828',
    'M', '#98c0e8', 'm', '#6890c8', 'F', '#f8f0d8', 'A', '#303840', 'a', '#181c20',
    'P', '#f8f0d8', 'p', '#c0b088', 'Y', '#f8f0d8', 'y', '#b09860', 'V', '#e83800');
  var HP = P('K', '#201810', 'N', '#d8d0c0', 'n', '#8a8274');

  var TP = P('K', '#201810', 'G', '#38b038', 'g', '#186818', 'W', '#ffffff', 'L', '#7ce85c',
    'l', '#48a838', 'Y', '#fcd000', 'N', '#7c3c10');

  S('tile_ground', [
    'KKKKKKKKKKKKKKKK',
    'KDDDDDDDDDDDDDDK',
    'KDLLLLDDDDDDDDDK',
    'KDLLLLLDDDDDDDDK',
    'KDDlDDDDDDDDDDDK',
    'KKKKKKKKKKKKKKKK',
    'KccDDDDccDDDDcc',
    'KccccDDccDDDDccc',
    'KccDDDDDDDDDDDcc',
    'KcDDDDDDccDDDDDc',
    'KKKKKKKKKKKKKKKK',
    'Kddddddddddddddd',
    'KdddddddKddddddd',
    'Kddddddddddddddd',
    'KddddddddddddddD',
    'KKKKKKKKKKKKKKKK'
  ], T1);
  S('tile_ground_stone', [
    'KKKKKKKKKKKKKKKK',
    'KMMMMMMMMMMMMMMK',
    'KMmmmmMMMMMMMMMK',
    'KMmmmmmmMMMMMMMK',
    'KMmmmmmmmMMMMMMK',
    'KKKKKKKKKKKKKKKK',
    'KmmmmmmKmmmmmmmm',
    'KmmmmmmmKmmmmmmm',
    'KmmmmmmmmmmmmmmK',
    'KmmmmmmmmmmmmmMK',
    'KKKKKKKKKKKKKKKK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaKaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KKKKKKKKKKKKKKKK'
  ], T1);
  S('tile_brick', [
    'KKKKKKKKKKKKKKKK',
    'KSSSSSSSSSSSSSSK',
    'KSSSSSSSKSSSSSSK',
    'KKKKKKKKKKKKKKKK',
    'KSSSSSSSKSSSSSSK',
    'KSSSSSSSKSSSSSSK',
    'KKKKKKKKKKKKKKKK',
    'KSSSSSSSKSSSSSSK',
    'KSSSSSSSKSSSSSSK',
    'KKKKKKKKKKKKKKKK',
    'KSSSSSSSKSSSSSSK',
    'KSSSSSSSKSSSSSSK',
    'KKKKKKKKKKKKKKKK',
    'KSSSSSSSKSSSSSSK',
    'KSSSSSSSKSSSSSSK',
    'KKKKKKKKKKKKKKKK'
  ], T1);
  S('tile_block', [
    'KKKKKKKKKKKKKKKK',
    'KCCCCCCCCCCCCCCK',
    'KCCKCCCCCCCCKCCK',
    'KCKKCCCCCCKKCCK',
    'KCKKKCCCCKKKCCK',
    'KCKKKKCCKKKKCCK',
    'KCKKKKKKKKKKCCK',
    'KCCKKKKKKKKKCCK',
    'KCKKKCCCCKKKCCK',
    'KCKKCCKKCCKKCCK',
    'KCKKCCKKCCKKCCK',
    'KCCKCCCCCCCCKCCK',
    'KCCCCCCCCCCCCCCK',
    'KCCCCCCCCCCCCCCK',
    'KCCCCCCCCCCCCCCK',
    'KKKKKKKKKKKKKKKK'
  ], T1);
  S('tile_q1', [
    'KKKKKKKKKKKKKKKK',
    'KSSSSSSSSSSSSSSK',
    'KSaaaaaaaaaaaSSK',
    'KSaSSSSSSSSSaSSK',
    'KSaSSKKKKKSSaSSK',
    'KSSaSSKKKKSSaSSK',
    'KSSSaaaSSaaSSSSK',
    'KSSSaaSSSSaaSSSK',
    'KSSSSaKKKKaSSSSK',
    'KSSSSKKSSKKSSSSK',
    'KSSSSSKaaKSSSSSK',
    'KSSSSSKaaKSSSSSK',
    'KSSSSSKaaKSSSSSK',
    'KSSSSSSSSSSSSSSK',
    'KSSSSSSSSSSSSSSK',
    'KKKKKKKKKKKKKKKK'
  ], T1);
  S('tile_q2', [
    'KKKKKKKKKKKKKKKK',
    'KSSSSSSSSSSSSSSK',
    'KSaaaaaaaaaaaSSK',
    'KSaSSSSSSSSSaSSK',
    'KSaSSKKKKKSSaSSK',
    'KSSaSSKKKKSSaSSK',
    'KSSSaaaSSaaSSSSK',
    'KSSSaaSSSSaaSSSK',
    'KSSSSaKKKKaSSSSK',
    'KSSSSKKSSKKSSSSK',
    'KSSSSSSSSSSSSSSK',
    'KSSSSSSSSSSSSSSK',
    'KSSSSSSSSSSSSSSK',
    'KSSSSSSSSSSSSSSK',
    'KSSSSSSSSSSSSSSK',
    'KKKKKKKKKKKKKKKK'
  ], T1);
  S('tile_used', [
    'KKKKKKKKKKKKKKKK',
    'KCCCCCCCCCCCCCCK',
    'KCCCCCCCCCCCCCCK',
    'KCCCCCCCCCCCCCCK',
    'KCCCCCCCCCCCCCCK',
    'KCCKCCCCCCCCCCCK',
    'KCCKCCCCCCCCCCCK',
    'KCCCCCCKKCCCCCCK',
    'KCCCCCCKKCCCCCCK',
    'KCCCCCCCCCCCCCCK',
    'KCCCCCCCCCCCCCCK',
    'KCCKCCCCCCCCCCCK',
    'KCCKCCCCCCCCCCCK',
    'KCCCCCCCCCCCCCCK',
    'KCCCCCCCCCCCCCCK',
    'KKKKKKKKKKKKKKKK'
  ], T1);
  S('tile_hard', [
    'KKKKKKKKKKKKKKKK',
    'KAAAAAAAaAAAAAAA',
    'KAAAAAAaAAAAAAA',
    'KAAAAAAaAAAAAAA',
    'KAAAAAAaAAAAAAA',
    'KAAAAAAaAAAAAAA',
    'KAAAAAAaAAAAAAA',
    'KAAAAAAaAAAAAAA',
    'KAAAAAAaAAAAAAA',
    'KAAAAAAaAAAAAAA',
    'KAAAAAAaAAAAAAA',
    'KAAAAAAaAAAAAAA',
    'KAAAAAAaAAAAAAA',
    'KAAAAAAaAAAAAAA',
    'KAAAAAAaAaaaaaa',
    'KKKKKKKKKKKKKKKK'
  ], T1);
  S('tile_hazard', [
    'KKKKKKKKKKKKKKKK',
    'NNNNNNNNNNNNNNNN',
    'NNNNNNNNNNNNNNNN',
    'NNNNNNNNNNNNNNNN',
    'NNNNNNNNNNNNNNNN',
    'KKKKKKKKKKKKKKKK',
    'nnnnnnnnnnnnnnnn',
    'NNNNNNNNNNNNNNNN',
    'NNNNNNNNNNNNNNNN',
    'NNNNNNNNNNNNNNNN',
    'KKKKKKKKKKKKKKKK',
    'NNNNNNNNNNNNNNNN',
    'NNNNNNNNNNNNNNNN',
    'NNNNNNNNNNNNNNNN',
    'NNNNNNNNNNNNNNNN',
    'KKKKKKKKKKKKKKKK'
  ], HP);
  S('tile_pit', [
    'KKKKKKKKKKKKKKKK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KKKKKKKKKKKKKKKK'
  ], T1);
  S('pipe_tl', [
    'KKKKKKKKKKKKKKKK',
    'KLLLLLLLLLLLLLLK',
    'KLllllllllllllLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KKKKKKKKKKKKKKKK',
    'KggggggggggggggK',
    'KggggggggggggggK',
    'KggggggggggggggK',
    'KggggggggggggggK',
    'KggggggggggggggK',
    'KggggggggggggggK',
    'KggggggggggggggK',
    'KggggggggggggggK',
    'KKKKKKKKKKKKKKKK'
  ], TP);
  S('pipe_tr', [
    'KKKKKKKKKKKKKKKK',
    'KLLLLLLLLLLLLLLK',
    'KLllllllllllllLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KKKKKKKKKKKKKKKK',
    'KggggggggggggggK',
    'KggggggggggggggK',
    'KggggggggggggggK',
    'KggggggggggggggK',
    'KggggggggggggggK',
    'KggggggggggggggK',
    'KggggggggggggggK',
    'KggggggggggggggK',
    'KKKKKKKKKKKKKKKK'
  ], TP);
  S('pipe_l', [
    'KKKKKKKKKKKKKKKK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KKKKKKKKKKKKKKKK'
  ], TP);
  S('pipe_r', [
    'KKKKKKKKKKKKKKKK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KLggggggggggggLK',
    'KKKKKKKKKKKKKKKK'
  ], TP);
  S('cloud_tl', [
    '......KKKKKKKK',
    '....KKWWWWWWWW',
    '..KKWWWWWWWWWW',
    '.KWWWWWWWWWWWW',
    'KWWWWWWWWWWWWW',
    'KWWWWWWWWWWWWW',
    'KWWWWWWWWWWWWW',
    'KWWWWWWWWWWWWW',
    'KWWWWWWWWWWWWW'
  ], T1);
  S('cloud_tm', [
    'KKKKKKKKKKKKKK',
    'WWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWW'
  ], T1);
  S('cloud_tr', [
    'KKKKKKKK......',
    'WWWWWWWWKK....',
    'WWWWWWWWWWKK..',
    'WWWWWWWWWWWWK.',
    'WWWWWWWWWWWWWK',
    'WWWWWWWWWWWWWK',
    'WWWWWWWWWWWWWK',
    'WWWWWWWWWWWWWK',
    'WWWWWWWWWWWWWK'
  ], T1);
  S('bush_l', [
    '......KKKKKK',
    '....KKGGGGGG',
    '..KKGGGGGGGG',
    '.KGGGGGGGGGGG',
    'KGGGGGGGGGGGG',
    'KGGGGGGGGGGGG',
    'KGGGGGGGGGGGG',
    'KGGGGGGGGGGGG',
    'KGGGGGGGGGGGG'
  ], TP);
  S('bush_m', [
    'KKKKKKKKKKKKKK',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGG'
  ], TP);
  S('bush_r', [
    'KKKKKK......',
    'GGGGGGKK....',
    'GGGGGGGGKK..',
    'GGGGGGGGGGK.',
    'GGGGGGGGGGGK',
    'GGGGGGGGGGGK',
    'GGGGGGGGGGGK',
    'GGGGGGGGGGGK',
    'GGGGGGGGGGGK'
  ], TP);
  S('hill_l', [
    '......KKKKKKKK',
    '....KKGGGGGGGG',
    '..KKGGGGGGGGGG',
    '.KGGGGGGGGGGGG',
    'KGGGGGGGGGGGGG',
    'KGGGGGGGGGGGGG',
    'KGGGGGGGGGGGGG',
    'KGGGGGGGGGGGGG',
    'KGGGGGGGGGGGGG'
  ], TP);
  S('hill_m', [
    'KKKKKKKKKKKKKK',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGGGGG'
  ], TP);
  S('hill_r', [
    'KKKKKKKK......',
    'GGGGGGKK......',
    'GGGGGGGGKK....',
    'GGGGGGGGGGKK..',
    'GGGGGGGGGGGGKK',
    'GGGGGGGGGGGGGK',
    'GGGGGGGGGGGGGK',
    'GGGGGGGGGGGGGK',
    'GGGGGGGGGGGGGK'
  ], TP);
  S('flag_pole', [
    '....KKKK',
    '....KWWK',
    '....KWWK',
    '....KWWK',
    '....KWWK',
    '....KWWK',
    '....KWWK',
    '....KWWK',
    '....KWWK',
    '....KWWK',
    '....KWWK',
    '....KWWK',
    '....KWWK',
    '....KWWK',
    '....KWWK',
    '....KWWK'
  ], T1);
  S('flag_top', [
    'K...........',
    'WWWK........',
    'WWWWK.......',
    'WWWWWK......',
    'WWWWWWK.....',
    'WWWWWWWK....',
    'WWWWWWWWK...',
    'WWWWWWWWWK..',
    'WWWWWWWWWWK.',
    'WWWWWWWWWWW.',
    'WWWWWWWWWWWW',
    'WWWWWWWWWWWK',
    'WWWWWWWWWWWK',
    'WWWWWWWWWWWK',
    'WWWWWWWWWWWK',
    'WWWWWWWWWWWK'
  ], P('K', '#201810', 'W', '#38b038'));
  S('ball', [
    '..KKKK..',
    '.KRRRRK.',
    'KRWWRRYK',
    'KRWWRRRK',
    'KRRRRRRK',
    '.KRRRRK.',
    '..KKKK..'
  ], P('K', '#201810', 'R', '#38b038', 'W', '#ffffff'));

  // Castle blocks
  var CB = P('K', '#201810', 'C', '#c8b8a0', 'c', '#9c8c74', 'W', '#ffffff', 'w', '#8a7a64', 'A', '#584828');
  S('castle_brick', [
    'KKKKKKKKKKKKKKKK',
    'KCCCCCCCCCCCCCCK',
    'KCccCCCCCCcccCCK',
    'KCccCCCCCCcccCCK',
    'KCCCCccccccccCCK',
    'KKKKKKKKKKKKKKKK',
    'KcccCCCCCCcccCCK',
    'KcccccccccccCCK',
    'KCCCCcccCCCCCCCK',
    'KKKKKKKKKKKKKKKK',
    'KCCCCcccCCCCCCCK',
    'KCccCCCCCCcccCCK',
    'KCccCCCCCCcccCCK',
    'KCCCCCCCCCCCCCCK',
    'KCCCCCCCCCCCCCCK',
    'KKKKKKKKKKKKKKKK'
  ], CB);
  S('castle_door', [
    'KKKKKKKKKKKKKKKK',
    'KKKKKKKKKKKKKKKK',
    'KKKAAAAAAAAAAAKK',
    'KKAAAAAAAAAAAAK',
    'KAAAAAAAAAAAAAAAA',
    'KAAAAAAAAAAAAAAAA',
    'KAAAAAAAAAAAAAAAA',
    'KAAAAAAAAAAAAAAAA',
    'KAAAAAAAAAAAAAAAA',
    'KAAAAAAAAAAAAAAAA',
    'KAAAAAAAAAAAAAAAA',
    'KAAAAAAAAAAAAAAAA',
    'KAAAAAAAAAAAAAAAA',
    'KAAAAAAAAAAAAAAAA',
    'KAAAAAAAAAAAAAAAA',
    'KKKKKKKKKKKKKKKK'
  ], CB);
  S('castle_win', [
    'KKKKKKKKKKKKKKKK',
    'KKKKKKKKKKKKKKKK',
    'KKKWWWWWWWWWKKK',
    'KKWWWWWWWWWWWKK',
    'KWAAAAAAAAAAAWK',
    'KWAAAAAAAAAAAWK',
    'KWAAAAAAAAAAAWK',
    'KWAAAAAAAAAAAWK',
    'KWAAAAAAAAAAAWK',
    'KWAAAAAAAAAAAWK',
    'KWWWWWWWWWWWWWK',
    'KKWWWWWWWWWWWKK',
    'KKKWWWWWWWWWKKK',
    'KKKKKKKKKKKKKKK',
    'KKKKKKKKKKKKKKK',
    'KKKKKKKKKKKKKKKK'
  ], CB);

  // Lava / lava top for bonus & underground themes
  var LV = P('K', '#201810', 'V', '#e83800', 'v', '#a81800', 'O', '#fcd000', 'o', '#f88018', 'Y', '#fff8a0');
  S('lava_top', [
    'KKKKKKKKKKKKKKKK',
    'KYYYYKKKKYYYYKKK',
    'KYOOYKKKYOOYKKK',
    'KOOOOOKKOOOOOKK',
    '.KOOOOOKOOOOOOK.',
    '.KOvOOOOKOvOOOK.',
    '..KKvVVKKKKvKK..',
    '...KVVVVVVVVK...',
    '...KVVVVVVVVK...',
    '..KVVVVVVVVVVK..',
    '..KVVVVVVVVVVK..',
    '..KVVVVVVVVVVK..',
    '.KVVVVVVVVVVVVK.',
    '.KVVVVVVVVVVVVK.',
    'KVVVVVVVVVVVVVVK',
    'KKKKKKKKKKKKKKKK'
  ], LV);
  S('lava', [
    'KKKKKKKKKKKKKKKK',
    'KVVVVVVVVVVVVVVK',
    'KVvVVVVVVVVVVvVK',
    'KVVVVVVVVVVVVVVK',
    'KVVVVVVVVVVVVVVK',
    'KVVVVVVVVVVVVVVK',
    'KVVVVVVVVVVVVVVK',
    'KVVVVVVVVVVVVVVK',
    'KVvVVVVVVVVVVvVK',
    'KVVVVVVVVVVVVVVK',
    'KVVVVVVVVVVVVVVK',
    'KVvVVVVVVVVVVvVK',
    'KVVVVVVVVVVVVVVK',
    'KVVVVVVVVVVVVVVK',
    'KVVVVVVVVVVVVVVK',
    'KKKKKKKKKKKKKKKK'
  ], LV);

  // Underground theme tiles
  var UG = P('K', '#201810', 'C', '#3878f8', 'c', '#2048a8', 'W', '#88c0ff', 'A', '#101018', 'a', '#282838',
    'Y', '#fcd000', 'y', '#c08800', 'D', '#58c8f8', 'd', '#3078b0');
  S('tile_ug_ground', [
    'KKKKKKKKKKKKKKKK',
    'KCCCCCCCCCCCCCCK',
    'KCccccCCCcccCCK',
    'KCccccCCCcccCCK',
    'KCCCccccCCCcccK',
    'KKKKKKKKKKKKKKKK',
    'KcccccccCccccccK',
    'KccccccccccccccK',
    'KcccccccCccccccK',
    'KccccccccccccccK',
    'KKKKKKKKKKKKKKKK',
    'KccccccccccccccK',
    'KcccccccCccccccK',
    'KccccccccccccccK',
    'KccccccccccccccK',
    'KKKKKKKKKKKKKKKK'
  ], UG);
  S('tile_ug_brick', [
    'KKKKKKKKKKKKKKKK',
    'KDDDDDDDDDDDDDDK',
    'KDDDDDDDDDDDDDDK',
    'KKKKKKKKKKKKKKKK',
    'KDDDDDDDKDDDDDDK',
    'KDDDDDDDKDDDDDDK',
    'KKKKKKKKKKKKKKKK',
    'KDDDDDDDKDDDDDDK',
    'KDDDDDDDKDDDDDDK',
    'KKKKKKKKKKKKKKKK',
    'KDDDDDDDKDDDDDDK',
    'KDDDDDDDKDDDDDDK',
    'KKKKKKKKKKKKKKKK',
    'KDDDDDDDKDDDDDDK',
    'KDDDDDDDKDDDDDDK',
    'KKKKKKKKKKKKKKKK'
  ], UG);
  S('tile_ug_q', [
    'KKKKKKKKKKKKKKKK',
    'KYYYYYYYYYYYYYYK',
    'KyyyyyyyyyyyyyyK',
    'KyyKKKKKKKKKyyK',
    'KyyKWWWWWWWKyyK',
    'KyKWWKKKKWWKyyK',
    'KyyKWWKKKKWWKyyK',
    'KyyyKKKWWKKKyyK',
    'KyyyKKKWWKKKyyK',
    'KyyyyKWWWWKyyyK',
    'KyyyyKWWWWKyyyK',
    'KyyyyyKKKKyyyyyK',
    'KyyyyyyyyyyyyyyK',
    'KYYYYYYYYYYYYYYK',
    'KYYYYYYYYYYYYYYK',
    'KKKKKKKKKKKKKKKK'
  ], UG);
  S('tile_ug_solid', [
    'KKKKKKKKKKKKKKKK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KaaaaaaaaaaaaaaK',
    'KKKKKKKKKKKKKKKK'
  ], UG);

  // Castle (lava level) brick
  var CB2 = P('K', '#201810', 'C', '#9098a8', 'c', '#687084', 'W', '#ffffff', 'w', '#7a8290', 'A', '#2c3040');
  S('tile_castle', [
    'KKKKKKKKKKKKKKKK',
    'KCCCCCCCCCCCCCCK',
    'KCccCCCCCCcccCCK',
    'KCccCCCCCCcccCCK',
    'KCCCCccccccccCCK',
    'KKKKKKKKKKKKKKKK',
    'KcccCCCCCCcccCCK',
    'KcccccccccccCCK',
    'KCCCCcccCCCCCCCK',
    'KKKKKKKKKKKKKKKK',
    'KCCCCcccCCCCCCCK',
    'KCccCCCCCCcccCCK',
    'KCccCCCCCCcccCCK',
    'KCCCCCCCCCCCCCCK',
    'KCCCCCCCCCCCCCCK',
    'KKKKKKKKKKKKKKKK'
  ], CB2);

  // ================= 5x7 PIXEL FONT =================
  var FONT = {
    '0': '01110 10001 10011 10101 11001 10001 01110',
    '1': '00100 01100 00100 00100 00100 00100 01110',
    '2': '01110 10001 00001 00010 00100 01000 11111',
    '3': '11111 00010 00100 00010 00001 10001 01110',
    '4': '00010 00110 01010 10010 11111 00010 00010',
    '5': '11111 10000 11110 00001 00001 10001 01110',
    '6': '00110 01000 10000 11110 10001 10001 01110',
    '7': '11111 00001 00010 00100 01000 01000 01000',
    '8': '01110 10001 10001 01110 10001 10001 01110',
    '9': '01110 10001 10001 01111 00001 00010 01100',
    'A': '01110 10001 10001 11111 10001 10001 10001',
    'B': '11110 10001 10001 11110 10001 10001 11110',
    'C': '01110 10001 10000 10000 10000 10001 01110',
    'D': '11100 10010 10001 10001 10001 10010 11100',
    'E': '11111 10000 10000 11110 10000 10000 11111',
    'F': '11111 10000 10000 11110 10000 10000 10000',
    'G': '01110 10001 10000 10111 10001 10001 01111',
    'H': '10001 10001 10001 11111 10001 10001 10001',
    'I': '01110 00100 00100 00100 00100 00100 01110',
    'J': '00111 00010 00010 00010 00010 10010 01100',
    'K': '10001 10010 10100 11000 10100 10010 10001',
    'L': '10000 10000 10000 10000 10000 10000 11111',
    'M': '10001 11011 10101 10101 10001 10001 10001',
    'N': '10001 11001 10101 10011 10001 10001 10001',
    'O': '01110 10001 10001 10001 10001 10001 01110',
    'P': '11110 10001 10001 11110 10000 10000 10000',
    'Q': '01110 10001 10001 10001 10101 10010 01101',
    'R': '11110 10001 10001 11110 10100 10010 10001',
    'S': '01111 10000 10000 01110 00001 00001 11110',
    'T': '11111 00100 00100 00100 00100 00100 00100',
    'U': '10001 10001 10001 10001 10001 10001 01110',
    'V': '10001 10001 10001 10001 10001 01010 00100',
    'W': '10001 10001 10001 10101 10101 11011 10001',
    'X': '10001 10001 01010 00100 01010 10001 10001',
    'Y': '10001 10001 01010 00100 00100 00100 00100',
    'Z': '11111 00001 00010 00100 01000 10000 11111',
    '-': '00000 00000 00000 11111 00000 00000 00000',
    '=': '00000 00000 11111 00000 11111 00000 00000',
    '!': '00100 00100 00100 00100 00100 00000 00100',
    '?': '01110 10001 00001 00010 00100 00000 00100',
    '.': '00000 00000 00000 00000 00000 01100 01100',
    ',': '00000 00000 00000 00000 01100 01100 01000',
    ':': '00000 01100 01100 00000 01100 01100 00000',
    'x': '00000 10001 01010 00100 01010 10001 00000',
    '*': '00000 10101 01110 11111 01110 10101 00000',
    '/': '00001 00010 00010 00100 01000 01000 10000',
    "'": '00100 00100 00000 00000 00000 00000 00000',
    '>': '01000 00100 00010 00001 00010 00100 01000',
    '<': '00010 00100 01000 10000 01000 00100 00010',
    ' ': '00000 00000 00000 00000 00000 00000 00000'
  };

  function buildFont(colorKey, color) {
    var pal = P('0', null, '1', color);
    var glyphs = {};
    for (var ch in FONT) {
      glyphs[ch] = raster(FONT[ch].split(' '), pal);
    }
    return glyphs;
  }
  fonts.W = buildFont('X', '#ffffff');
  fonts.Y = buildFont('X', '#fcd000');
  fonts.K = buildFont('X', '#201810');

  return {
    sprites: sprites,
    fonts: fonts,
    P: P,
    raster: raster,
    FONT_ROWS: 7,
    FONT_W: 5
  };
})();


// ============================ levels.js ============================
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


// ============================ render.js ============================
var R = (function () {
  var API = {};
  var cv = null, ctx = null;
  var cvBuf = null, ctxBuf = null;
  var VW = 256, VH = 240;   // VH is fixed by the 15-row tilemap; VW adapts to aspect ratio
  var SCALE = 2;
  var fontCache = {};

  function hex2rgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function rgbStr(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }

  function sprite(name) { return ART.sprites[name]; }

  function makeSurface(w, h) {
    var mk = API.createCanvas;
    var c = mk(w, h);
    return { canvas: c, ctx: c.getContext('2d') };
  }

  function blit(sp, x, y, flip, tint, alpha) {
    if (!sp) return;
    var c = ctxBuf;
    c.save();
    if (alpha != null) c.globalAlpha = alpha;
    if (tint) {
      var t = tintCache[tint] || (tintCache[tint] = tintCanvas(sp, tint));
      if (flip) {
        c.translate(x + sp.w, y);
        c.scale(-1, 1);
        c.drawImage(t, 0, 0);
      } else {
        c.drawImage(t, x, y);
      }
    } else {
      if (flip) {
        c.translate(x + sp.w, y);
        c.scale(-1, 1);
        c.drawImage(sp.canvas, 0, 0);
      } else {
        c.drawImage(sp.canvas, x, y);
      }
    }
    c.restore();
  }

  var tintCache = {};
  function tintCanvas(sp, key) {
    var parts = key.split('|');
    var body = parts[0];
    var flash = parts.length > 1 ? parts[1] : null;
    var c = API.createCanvas(sp.w, sp.h);
    var g = c.getContext('2d');
    g.drawImage(sp.canvas, 0, 0);
    if (body === 'white') {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, sp.w, sp.h);
    } else if (body === 'palette') {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = flash || '#fcd000';
      g.fillRect(0, 0, sp.w, sp.h);
    }
    return c;
  }

  function drawText(str, x, y, colorKey, align, scale, shadow) {
    scale = scale || 1;
    var glyphs = ART.fonts[colorKey] || ART.fonts.W;
    str = ('' + str).toUpperCase();
    var gw = 5, gh = 7, sp = 1;
    var total = 0, i;
    for (i = 0; i < str.length; i++) {
      var g = glyphs[str.charAt(i)] || glyphs['?'];
      total += (g.w + sp) * scale;
    }
    total -= sp * scale;
    var cx = x;
    if (align === 'center') cx = x - Math.floor(total / 2);
    else if (align === 'right') cx = x - total;
    if (shadow) {
      drawTextRaw(str, cx + scale, y + scale, 'K', scale);
    }
    drawTextRaw(str, cx, y, colorKey, scale);
    return total;
  }
  function drawTextRaw(str, x, y, colorKey, scale) {
    var glyphs = ART.fonts[colorKey] || ART.fonts.W;
    var cx = x;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      var g = glyphs[ch] || glyphs[' '];
      if (ch !== ' ') {
        ctxBuf.drawImage(g.canvas, cx, y, g.w * scale, g.h * scale);
      }
      cx += (g.w + 1) * scale;
    }
  }
  function textWidth(str, scale) {
    var glyphs = ART.fonts.W;
    var s = ('' + str).length;
    return s * 6 * (scale || 1) - (scale || 1);
  }

  var THEME = {
    overworld: { sky: ['#5c94fc', '#a8e0fc'], cloud: 'cloud_tl', sun: null },
    underground: { sky: ['#0c1030', '#1c2450'], cloud: null },
    castle: { sky: ['#100c1c', '#2a1c30'], cloud: null }
  };

  function drawSky(theme) {
    var t = THEME[theme] || THEME.overworld;
    var g = ctxBuf.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, t.sky[0]);
    g.addColorStop(1, t.sky[1]);
    ctxBuf.fillStyle = g;
    ctxBuf.fillRect(0, 0, VW, VH);
    if (theme === 'overworld') {
      var g2 = ctxBuf.createLinearGradient(0, 0, 0, 96);
      g2.addColorStop(0, 'rgba(255,255,255,0)');
      g2.addColorStop(1, 'rgba(255,255,255,0.10)');
      ctxBuf.fillStyle = g2;
      ctxBuf.fillRect(0, 0, VW, 96);
    }
  }

  function drawCloudPair(x, y) {
    blit(sprite('cloud_tl'), x, y);
    blit(sprite('cloud_tm'), x + 14, y);
    blit(sprite('cloud_tr'), x + 28, y);
  }

  function drawBushPair(x, y) {
    blit(sprite('bush_l'), x, y - 8);
    blit(sprite('bush_m'), x + 14, y - 8);
    blit(sprite('bush_r'), x + 28, y - 8);
  }

  function drawHillPair(x, y) {
    blit(sprite('hill_l'), x, y - 16);
    blit(sprite('hill_m'), x + 14, y - 16);
    blit(sprite('hill_r'), x + 28, y - 16);
  }

  function drawCastle(x, y) {
    // x,y = left edge / ground line. Castle is 80px wide (5 tiles), 96px tall.
    var col, row;
    // rows: 0 = top ... 5 = ground line
    for (row = 0; row < 5; row++) {
      var yy = y - 16 - row * 16;
      for (col = 0; col < 5; col++) {
        var xx = x + col * 16;
        // battlements (crenellations) on the top row
        if (row === 0 && (col === 0 || col === 2 || col === 4)) continue;
        blit(sprite('castle_brick'), xx, yy);
      }
    }
    // side tower windows
    blit(sprite('castle_win'), x, y - 16 - 3 * 16);
    blit(sprite('castle_win'), x + 64, y - 16 - 3 * 16);
    // keep (raised center block, 2 tiles wide)
    blit(sprite('castle_brick'), x + 16, y - 16 - 5 * 16);
    blit(sprite('castle_brick'), x + 32, y - 16 - 5 * 16);
    blit(sprite('castle_brick'), x + 16, y - 16 - 4 * 16);
    blit(sprite('castle_brick'), x + 32, y - 16 - 4 * 16);
    // keep window
    blit(sprite('castle_win'), x + 16, y - 16 - 5 * 16);
    // battlements on the keep
    blit(sprite('castle_brick'), x + 32, y - 16 - 6 * 16);
    // ground line
    blit(sprite('castle_brick'), x, y);
    blit(sprite('castle_brick'), x + 16, y);
    blit(sprite('castle_brick'), x + 32, y);
    blit(sprite('castle_brick'), x + 48, y);
    blit(sprite('castle_brick'), x + 64, y);
    // arched door (2 tiles wide)
    blit(sprite('castle_door'), x + 16, y - 16);
    blit(sprite('castle_door'), x + 32, y - 16);
    blit(sprite('castle_door'), x + 16, y);
    blit(sprite('castle_door'), x + 32, y);
  }



  function hud(g) {
    var y = 5, w = VW;
    drawText(g.score, 8, y, 'W', 'left', 1, true);
    drawText('@' + g.coins, Math.round(w * 0.26), y, 'Y', 'left', 1, true);
    drawText('x' + g.lives, Math.round(w * 0.44), y, 'W', 'left', 1, true);
    drawText(g.world, Math.round(w * 0.66), y, 'W', 'left', 1, true);
    drawText(U.pad(g.time, 3), Math.round(w * 0.84), y, 'W', 'left', 1, true);
    if (g.mute) drawText('M', Math.round(w * 0.93), y, 'Y', 'left', 1, true);
  }


  function present() {
    var el = API.display;
    if (el && el.tagName === 'CANVAS') {
      var bw = Math.max(1, Math.round(el.clientWidth || VW * SCALE));
      var bh = Math.max(1, Math.round(el.clientHeight || VH * SCALE));
      if (el.width !== bw || el.height !== bh) { el.width = bw; el.height = bh; }
      var dctx = el.getContext('2d');
      dctx.imageSmoothingEnabled = false;
      dctx.clearRect(0, 0, bw, bh);

      var BW = cvBuf.width, BH = cvBuf.height;
      var bufAspect = BW / BH, dispAspect = bw / bh;
      var k;
      // Display wider than the buffer -> match heights (width crops/pads).
      // Display taller (portrait) -> match widths (height pads) = classic letterbox.
      if (dispAspect >= bufAspect) k = bh / BH;
      else k = bw / BW;

      var dw = BW * k, dh = BH * k;
      var dx = (bw - dw) / 2, dy = (bh - dh) / 2;
      dctx.drawImage(cvBuf, 0, 0, BW, BH, dx, dy, dw, dh);
    }
    if (API.onPresent) API.onPresent(cvBuf, VW * SCALE, VH * SCALE);
  }

  function beginFrame() {
    ctxBuf.setTransform(1, 0, 0, 1, 0, 0);
    ctxBuf.clearRect(0, 0, VW * SCALE, VH * SCALE);
    ctxBuf.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  }
  function endFrame() { ctxBuf.restore(); }

  function clip(x, y, w, h) {
    ctxBuf.save();
    ctxBuf.beginPath();
    ctxBuf.rect(x, y, w, h);
    ctxBuf.clip();
  }
  function unclip() { ctxBuf.restore(); }

  function fillRect(x, y, w, h, color) {
    ctxBuf.fillStyle = color;
    ctxBuf.fillRect(x, y, w, h);
  }
  function fillScreen(color) {
    ctxBuf.fillStyle = color;
    ctxBuf.fillRect(0, 0, VW, VH);
  }
  function translate(x, y) {
    ctxBuf.save();
    ctxBuf.translate(x, y);
  }
  function identity() {
    ctxBuf.restore();
    // back to scale-space (beginFrame applied SCALE)
    ctxBuf.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  }

  function setScale(s) {
    s = Math.max(1, Math.min(6, s | 0));
    if (s === SCALE) return;
    SCALE = s;
    rebuild();
  }

  // Change the virtual viewport, then rebuild the frame buffer.
  function setViewport(w, h) {
    w = Math.max(200, Math.round(w));
    h = Math.max(160, Math.round(h));
    if (w === VW && h === VH) return;
    VW = w; VH = h;
    rebuild();
  }

  function rebuild() {
    if (!API.createCanvas) return;
    cvBuf = API.createCanvas(VW * SCALE, VH * SCALE);
    ctxBuf = cvBuf.getContext('2d');
    ctxBuf.imageSmoothingEnabled = false;
    if (API.display && API.display.tagName === 'CANVAS') {
      API.display.width = VW * SCALE;
      API.display.height = VH * SCALE;
    }
  }
  function getScale() { return SCALE; }
  function width() { return VW; }
  function height() { return VH; }

  API.init = function (createCanvas, display) {
    API.createCanvas = createCanvas;
    API.display = display;
    cvBuf = createCanvas(VW * SCALE, VH * SCALE);
    ctxBuf = cvBuf.getContext('2d');
    ctxBuf.imageSmoothingEnabled = false;
    // pre-render all sprites + fonts
    bakeAll();
    if (display && display.tagName === 'CANVAS') {
      display.width = VW * SCALE;
      display.height = VH * SCALE;
    }
  };
  function bakeAll() {
    for (var name in ART.sprites) {
      var sp = ART.sprites[name];
      sp.canvas = API.createCanvas(sp.w, sp.h);
      var g = sp.canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      for (var y = 0; y < sp.h; y++) {
        for (var x = 0; x < sp.w; x++) {
          var c = sp.data[y * sp.w + x];
          if (!c) continue;
          g.fillStyle = c;
          g.fillRect(x, y, 1, 1);
        }
      }
    }
    for (var f in ART.fonts) {
      var glyphs = ART.fonts[f];
      for (var ch in glyphs) {
        var gl = glyphs[ch];
        gl.canvas = API.createCanvas(gl.w, gl.h);
        var gg = gl.canvas.getContext('2d');
        for (var gy = 0; gy < gl.h; gy++) {
          for (var gx = 0; gx < gl.w; gx++) {
            var gc = gl.data[gy * gl.w + gx];
            if (!gc) continue;
            gg.fillStyle = gc;
            gg.fillRect(gx, gy, 1, 1);
          }
        }
      }
    }
  }

  API.getVW = function () { return VW; };
  API.getVH = function () { return VH; };
  API.blit = blit;
  API.sprite = sprite;
  API.drawText = drawText;
  API.textWidth = textWidth;
  API.drawSky = drawSky;
  API.drawCloudPair = drawCloudPair;
  API.drawBushPair = drawBushPair;
  API.drawHillPair = drawHillPair;
  API.drawCastle = drawCastle;
  API.hud = hud;
  API.present = present;
  API.beginFrame = beginFrame;
  API.endFrame = endFrame;
  API.clip = clip;
  API.unclip = unclip;
  API.fillRect = fillRect;
  API.fillScreen = fillScreen;
  API.translate = translate;
  API.identity = identity;
  API.setScale = setScale;
  API.setViewport = setViewport;
  API.getScale = getScale;
  API.w = width;
  API.h = height;
  API.reset = function () { tintCache = {}; };
  API.buffer = function () { return cvBuf; };
  API.scale = function () { return SCALE; };
  return API;
})();


// ============================ game_core.js ============================
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


// ============================ game_player.js ============================
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


// ============================ game_entity.js ============================
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


// ============================ game_collide.js ============================
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


// ============================ game_main.js ============================
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



// ============================ game_draw.js ============================
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


// ============================ exports ============================
var MARIO_GAME_API = {
  U: U, IN: IN, SFX: SFX, ART: ART, LEVELS: LEVELS, R: R, GAME: GAME,
  getG: function () { return G; },
  getP: function () { return P; },
  getLV: function () { return LV; },
  getMapW: function () { return mapW; },
  getCamX: function () { return camX; },
  getFlag: function () { return flag; },
  getCastle: function () { return castle; },
  getEnemies: function () { return enemies; },
  getItems: function () { return items; },
  getBalls: function () { return balls; },
  getTiles: function () { return tiles; },
  getReadyT: function () { return readyT; },
  getLvlIdx: function () { return lvlIdx; },
  isTitle: function () { return G.mode === 'title'; },
  isPlaying: function () { return G.mode === 'play'; },
  isPaused: function () { return G.mode === 'paused'; },
  getMusic: function () { return LV ? LV.music : null; },
  setPaused: function (v) {
    if (v && G.mode === 'play') { G.mode = 'paused'; SFX.stopMusic(); }
    else if (!v && G.mode === 'paused') { G.mode = 'play'; SFX.setMusic(LV.music); }
  }
};
if (typeof module !== 'undefined' && module.exports) module.exports = MARIO_GAME_API;
if (typeof module !== 'undefined' && module.exports) module.exports = MARIO_GAME_API;
