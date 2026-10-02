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
