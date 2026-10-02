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
