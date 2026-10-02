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
