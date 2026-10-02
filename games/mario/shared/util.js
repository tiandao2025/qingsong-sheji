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
