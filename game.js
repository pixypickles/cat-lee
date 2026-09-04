(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const stateText = document.getElementById("stateText");

  const WORLD = {
    width: 4200,
    height: 2200,
    gravity: 1850,
  };

  const platforms = [
    {x:0,y:1920,w:920,h:280},
    {x:920,y:1900,w:720,h:300},
    {x:1640,y:1940,w:820,h:260},
    {x:2460,y:1890,w:760,h:310},
    {x:3220,y:1930,w:980,h:270},

    {x:520,y:1640,w:300,h:46},
    {x:1120,y:1560,w:360,h:46},
    {x:2020,y:1610,w:320,h:46},
    {x:2850,y:1540,w:360,h:46},
    {x:3520,y:1620,w:300,h:46},

    {x:860,y:1480,w:64,h:420},
    {x:1580,y:1450,w:64,h:490},
    {x:2410,y:1500,w:64,h:390},
    {x:3170,y:1420,w:64,h:470},

    {x:2560,y:1360,w:250,h:42},
    {x:2920,y:1270,w:240,h:42},
    {x:3330,y:1390,w:260,h:42}
  ];

  // 背景の建物は通常の地形判定を持たないが、
  // 空中ジャンプ時だけ壁蹴りの足場として使える。
  // 低い屋根へテンポよく上がるための補助で、1回の滞空につき1回まで。
  const backgroundWallJumpSurfaces = [
    {x:180,  y:1390,h:500},{x:610,  y:1390,h:500},
    {x:650,  y:1320,h:570},{x:1150, y:1320,h:570},
    {x:1190, y:1260,h:630},{x:1620, y:1260,h:630},
    {x:1690, y:1380,h:510},{x:2150, y:1380,h:510},
    {x:2200, y:1310,h:580},{x:2720, y:1310,h:580},
    {x:2770, y:1240,h:650},{x:3240, y:1240,h:650},
    {x:3290, y:1350,h:540},{x:3700, y:1350,h:540},
    {x:3740, y:1280,h:610},{x:4170, y:1280,h:610}
  ];

  function backgroundWallProbe(){
    const pcx=player.x+player.w/2;
    const top=player.y+10;
    const bottom=player.y+player.h-8;
    let best=null, bestDist=999;
    for(const w of backgroundWallJumpSurfaces){
      if(bottom<=w.y || top>=w.y+w.h) continue;
      const d=Math.abs(pcx-w.x);
      if(d<=player.w/2+24 && d<bestDist){
        bestDist=d;
        // wall is on the right => side 1, on left => side -1
        best={side:w.x>=pcx?1:-1,x:w.x};
      }
    }
    return best;
  }

  // 足場属性はステージ切替後にも再設定する。
  function configurePlatforms(){
    for(const p of platforms){
      p.oneWay = p.h <= 55 && p.w >= 180;
      p.climbThrough = p.w <= 70 && p.h >= 300;
    }
  }
  configurePlatforms();

  const enemies = [
    {x:680,y:1806,w:72,h:96,hp:3,vx:0,flash:0,alive:true,type:"dog"},
    {x:1320,y:1786,w:72,h:96,hp:3,vx:0,flash:0,alive:true,type:"rabbit"},
    {x:1880,y:1846,w:72,h:96,hp:4,vx:0,flash:0,alive:true,type:"fox"},
    {x:2700,y:1796,w:72,h:96,hp:4,vx:0,flash:0,alive:true,type:"boar"},
    {x:3420,y:1836,w:72,h:96,hp:5,vx:0,flash:0,alive:true,type:"dog"}
  ];
  const input = {
    x:0, y:0,
    attack:false, attackPressed:false,
    claw:false, clawPressed:false,
    dash:false, dashPressed:false,
    jump:false, jumpPressed:false
  };

  const player = {
    x:220,y:1760,w:72,h:96,
    vx:0,vy:0,
    facing:1,
    grounded:false,
    onWall:0,
    wallLatched:false,
    wallLatchSide:0,
    wallRef:null,
    wallJumpUsed:false,
    dashTimer:0,
    dashCooldown:0,
    attackTimer:0,
    attackType:"",
    comboStep:0,
    comboWindow:0,
    invuln:0,
    clawTrail:0,
    hitStop:0,
    animTime:0,
    airDashAvailable:true,
    airKickSide:0,
    airKickCount:0,
    lastDirX:0, lastDirTimer:0,
    maxHp:10,
    hp:10,
    deaths:0,
    respawnTimer:0,
    respawnX:220,
    respawnY:1760,
    parryTimer:0,
    parryCooldown:0,
    parrySuccess:0,
    backstepTimer:0,
    attackSerial:0
  };

  // 敵AI用の状態。player生成後に初期化する。
  for(const e of enemies){
    e.facing = player.x < e.x ? -1 : 1;
    e.walkPhase = Math.random()*Math.PI*2;
    e.attackTimer = 0;
    e.attackCooldown = .5 + Math.random()*.7;
    e.attackHitDone = false;
  }

  // 高所からツボを投げる敵。地上ルートから見え、登って倒せる。
  const throwers = [
    {x:1260,y:1460,w:68,h:92,hp:3,alive:true,facing:-1,throwTimer:1.2,flash:0},
    {x:2980,y:1440,w:68,h:92,hp:3,alive:true,facing:-1,throwTimer:2.0,flash:0}
  ];
  const pots = [];

  // ステージ終端ボス
  const boss = {
    x:3940,y:1814,baseY:1814,w:92,h:116,
    hp:36,maxHp:36,
    vx:0,vy:0,
    facing:-1,
    flash:0,
    alive:true,
    active:false,
    attackTimer:0,
    attackCooldown:1.0,
    attackHitDone:false,
    walkPhase:0
  };
  let currentStage=1;
  let stageCleared=false;
  let clearTimer=0;
  let sageUnlocked=false;
  let sageMode=false;
  try{
    sageUnlocked=localStorage.getItem("catLeeSageUnlocked")==="1";
    sageMode=localStorage.getItem("catLeeStartSage")==="1";
    if(sageMode){sageUnlocked=true;localStorage.removeItem("catLeeStartSage");}
  }catch{}
  const sageWaves=[];
  function activateSage(){
    sageMode=true;sageUnlocked=true;player.maxHp=40;player.hp=40;player.invuln=1;
    try{localStorage.setItem("catLeeSageUnlocked","1");}catch{}
  }
  function spawnSageWave(dir="forward",counter=false){
    const f=player.facing;
    sageWaves.push({x:player.x+player.w/2+42*f,y:player.y+player.h*.42,
      vx:(dir==="up"?760:1180)*f,vy:dir==="up"?-760:0,life:.72,maxLife:.72,
      r:counter?92:78,damage:counter?38:34,hit:new Set(),facing:f});
  }

  const camera = {x:0,y:0};
  if(sageMode){player.maxHp=40;player.hp=40;}

  function initEnemyState(e){
    e.facing = player.x < e.x ? -1 : 1;
    e.walkPhase = Math.random()*Math.PI*2;
    e.attackTimer = 0;
    e.attackCooldown = .45 + Math.random()*.65;
    e.attackHitDone = false;
    e.hitPause=0;
  }

  function loadStage2(){
    currentStage=2;
    stageCleared=false;
    clearTimer=0;

    // 第二幕：港街。地上を主軸に、倉庫屋根・桟橋・船荷へ軽快に上がれる構成。
    const stage2Platforms=[
      {x:0,y:1920,w:900,h:280},
      {x:900,y:1900,w:760,h:300},
      {x:1660,y:1940,w:760,h:260},
      {x:2420,y:1890,w:800,h:310},
      {x:3220,y:1930,w:980,h:270},

      {x:430,y:1660,w:350,h:44},
      {x:1050,y:1580,w:380,h:44},
      {x:1760,y:1650,w:320,h:44},
      {x:2390,y:1530,w:390,h:44},
      {x:3050,y:1610,w:340,h:44},
      {x:3500,y:1490,w:330,h:44},

      {x:900,y:1450,w:62,h:450},
      {x:1640,y:1420,w:62,h:520},
      {x:2860,y:1380,w:62,h:510},

      {x:2460,y:1335,w:260,h:42},
      {x:3180,y:1290,w:250,h:42},
      {x:3520,y:1370,w:260,h:42}
    ];
    platforms.splice(0,platforms.length,...stage2Platforms);
    configurePlatforms();

    const stage2Walls=[
      {x:220,y:1370,h:520},{x:760,y:1370,h:520},
      {x:1000,y:1290,h:600},{x:1510,y:1290,h:600},
      {x:1740,y:1390,h:500},{x:2200,y:1390,h:500},
      {x:2260,y:1260,h:630},{x:2810,y:1260,h:630},
      {x:3000,y:1330,h:560},{x:3480,y:1330,h:560},
      {x:3550,y:1230,h:660},{x:4140,y:1230,h:660}
    ];
    backgroundWallJumpSurfaces.splice(0,backgroundWallJumpSurfaces.length,...stage2Walls);

    enemies.splice(0,enemies.length,
      {x:650,y:1806,w:72,h:96,hp:4,vx:0,flash:0,alive:true,type:"fox"},
      {x:1250,y:1786,w:72,h:96,hp:4,vx:0,flash:0,alive:true,type:"dog"},
      {x:1900,y:1846,w:72,h:96,hp:5,vx:0,flash:0,alive:true,type:"boar"},
      {x:2660,y:1796,w:72,h:96,hp:5,vx:0,flash:0,alive:true,type:"rabbit"},
      {x:3340,y:1836,w:72,h:96,hp:6,vx:0,flash:0,alive:true,type:"fox"}
    );
    for(const e of enemies) initEnemyState(e);

    throwers.splice(0,throwers.length,
      {x:1180,y:1488,w:68,h:92,hp:4,alive:true,facing:-1,throwTimer:1.15,flash:0},
      {x:3170,y:1518,w:68,h:92,hp:4,alive:true,facing:-1,throwTimer:1.8,flash:0}
    );
    pots.length=0;
    attackFX.length=0;

    Object.assign(boss,{
      x:3940,y:1814,baseY:1814,w:94,h:116,
      hp:44,maxHp:44,vx:0,vy:0,
      facing:-1,flash:0,alive:true,active:false,
      attackTimer:0,attackCooldown:.9,attackHitDone:false,
      walkPhase:0,hitPause:0
    });

    Object.assign(player,{
      x:180,y:1788,vx:0,vy:0,facing:1,
      grounded:false,onWall:0,wallLatched:false,wallLatchSide:0,wallRef:null,
      wallJumpUsed:false,dashTimer:0,dashCooldown:0,
      attackTimer:0,attackType:"",comboStep:0,comboWindow:0,
      invuln:1.0,respawnTimer:0,respawnX:180,respawnY:1788
    });
    player.hp=player.maxHp;
    camera.x=0;camera.y=0;
  }

  function loadStage3(){
    currentStage=3;
    stageCleared=false;
    clearTimer=0;

    // 第三幕：新市街。煉瓦街・商館・路面電車の気配がある近代都市。
    // 地上を高速で進み、庇・非常階段・建物壁を使って高所へ抜ける。
    const stage3Platforms=[
      {x:0,y:1920,w:880,h:280},
      {x:880,y:1900,w:760,h:300},
      {x:1640,y:1940,w:780,h:260},
      {x:2420,y:1890,w:800,h:310},
      {x:3220,y:1930,w:980,h:270},

      {x:400,y:1680,w:310,h:42},
      {x:980,y:1600,w:400,h:42},
      {x:1690,y:1660,w:330,h:42},
      {x:2260,y:1550,w:380,h:42},
      {x:2860,y:1640,w:360,h:42},
      {x:3480,y:1530,w:350,h:42},

      {x:800,y:1440,w:60,h:460},
      {x:1540,y:1410,w:60,h:530},
      {x:2740,y:1390,w:60,h:500},
      {x:3360,y:1360,w:60,h:570},

      {x:2130,y:1370,w:260,h:40},
      {x:2950,y:1310,w:260,h:40},
      {x:3600,y:1370,w:250,h:40}
    ];
    platforms.splice(0,platforms.length,...stage3Platforms);
    configurePlatforms();

    const stage3Walls=[
      {x:170,y:1350,h:540},{x:720,y:1350,h:540},
      {x:930,y:1240,h:650},{x:1440,y:1240,h:650},
      {x:1670,y:1360,h:530},{x:2130,y:1360,h:530},
      {x:2200,y:1200,h:690},{x:2700,y:1200,h:690},
      {x:2810,y:1300,h:590},{x:3300,y:1300,h:590},
      {x:3430,y:1160,h:730},{x:4160,y:1160,h:730}
    ];
    backgroundWallJumpSurfaces.splice(0,backgroundWallJumpSurfaces.length,...stage3Walls);

    enemies.splice(0,enemies.length,
      {x:610,y:1806,w:72,h:96,hp:5,vx:0,flash:0,alive:true,type:"dog"},
      {x:1210,y:1786,w:72,h:96,hp:5,vx:0,flash:0,alive:true,type:"fox"},
      {x:1880,y:1846,w:72,h:96,hp:6,vx:0,flash:0,alive:true,type:"rabbit"},
      {x:2580,y:1796,w:72,h:96,hp:6,vx:0,flash:0,alive:true,type:"boar"},
      {x:3280,y:1836,w:72,h:96,hp:7,vx:0,flash:0,alive:true,type:"dog"}
    );
    for(const e of enemies) initEnemyState(e);

    throwers.splice(0,throwers.length,
      {x:1080,y:1508,w:68,h:92,hp:5,alive:true,facing:-1,throwTimer:1.0,flash:0},
      {x:2970,y:1548,w:68,h:92,hp:5,alive:true,facing:-1,throwTimer:1.65,flash:0}
    );
    pots.length=0;
    attackFX.length=0;

    Object.assign(boss,{
      x:3925,y:1810,baseY:1810,w:100,h:120,
      hp:52,maxHp:52,vx:0,vy:0,
      facing:-1,flash:0,alive:true,active:false,
      attackTimer:0,attackCooldown:.82,attackHitDone:false,
      walkPhase:0,hitPause:0
    });

    Object.assign(player,{
      x:180,y:1788,vx:0,vy:0,facing:1,
      grounded:false,onWall:0,wallLatched:false,wallLatchSide:0,wallRef:null,
      wallJumpUsed:false,dashTimer:0,dashCooldown:0,
      attackTimer:0,attackType:"",comboStep:0,comboWindow:0,
      invuln:1.0,respawnTimer:0,respawnX:180,respawnY:1788
    });
    player.hp=player.maxHp;
    camera.x=0;camera.y=0;
  }

  function loadStage4(){
    currentStage=4;
    stageCleared=false;
    clearTimer=0;

    // 第四幕：工場街。倉庫・煙突・鉄骨・搬送足場が並ぶ夜の工業地区。
    // 地上を走りつつ、鉄骨壁と足場で一気に上へ抜けられる構成。
    const stage4Platforms=[
      {x:0,y:1920,w:900,h:280},
      {x:900,y:1900,w:740,h:300},
      {x:1640,y:1940,w:800,h:260},
      {x:2440,y:1890,w:780,h:310},
      {x:3220,y:1930,w:980,h:270},

      {x:380,y:1660,w:330,h:44},
      {x:980,y:1570,w:390,h:44},
      {x:1680,y:1640,w:360,h:44},
      {x:2290,y:1510,w:380,h:44},
      {x:2890,y:1600,w:350,h:44},
      {x:3460,y:1470,w:370,h:44},

      {x:820,y:1420,w:60,h:480},
      {x:1530,y:1380,w:60,h:560},
      {x:2720,y:1360,w:60,h:530},
      {x:3370,y:1320,w:60,h:610},

      {x:2110,y:1340,w:280,h:42},
      {x:3000,y:1260,w:260,h:42},
      {x:3570,y:1320,w:260,h:42}
    ];
    platforms.splice(0,platforms.length,...stage4Platforms);
    configurePlatforms();

    const stage4Walls=[
      {x:150,y:1320,h:570},{x:730,y:1320,h:570},
      {x:930,y:1190,h:700},{x:1450,y:1190,h:700},
      {x:1650,y:1320,h:570},{x:2150,y:1320,h:570},
      {x:2200,y:1140,h:750},{x:2700,y:1140,h:750},
      {x:2820,y:1260,h:630},{x:3320,y:1260,h:630},
      {x:3420,y:1080,h:810},{x:4160,y:1080,h:810}
    ];
    backgroundWallJumpSurfaces.splice(0,backgroundWallJumpSurfaces.length,...stage4Walls);

    enemies.splice(0,enemies.length,
      {x:590,y:1806,w:72,h:96,hp:6,vx:0,flash:0,alive:true,type:"boar"},
      {x:1190,y:1786,w:72,h:96,hp:6,vx:0,flash:0,alive:true,type:"dog"},
      {x:1870,y:1846,w:72,h:96,hp:7,vx:0,flash:0,alive:true,type:"fox"},
      {x:2590,y:1796,w:72,h:96,hp:7,vx:0,flash:0,alive:true,type:"rabbit"},
      {x:3290,y:1836,w:72,h:96,hp:8,vx:0,flash:0,alive:true,type:"boar"}
    );
    for(const e of enemies) initEnemyState(e);

    throwers.splice(0,throwers.length,
      {x:1100,y:1478,w:68,h:92,hp:6,alive:true,facing:-1,throwTimer:.95,flash:0},
      {x:3020,y:1508,w:68,h:92,hp:6,alive:true,facing:-1,throwTimer:1.55,flash:0}
    );
    pots.length=0;
    attackFX.length=0;

    Object.assign(boss,{
      x:3918,y:1808,baseY:1808,w:104,h:122,
      hp:62,maxHp:62,vx:0,vy:0,
      facing:-1,flash:0,alive:true,active:false,
      attackTimer:0,attackCooldown:.75,attackHitDone:false,
      walkPhase:0,hitPause:0,
      jumping:false,jumpCooldown:1.15,landingHitDone:false
    });

    Object.assign(player,{
      x:180,y:1788,vx:0,vy:0,facing:1,
      grounded:false,onWall:0,wallLatched:false,wallLatchSide:0,wallRef:null,
      wallJumpUsed:false,dashTimer:0,dashCooldown:0,
      attackTimer:0,attackType:"",comboStep:0,comboWindow:0,
      invuln:1.0,respawnTimer:0,respawnX:180,respawnY:1788
    });
    player.hp=player.maxHp;
    camera.x=0;camera.y=0;
  }

  
  function loadStage5(){
    currentStage=5;
    stageCleared=false;
    clearTimer=0;

    const stage5Platforms=[
      {x:0,y:1920,w:880,h:280},{x:880,y:1900,w:760,h:300},
      {x:1640,y:1940,w:800,h:260},{x:2440,y:1890,w:780,h:310},{x:3220,y:1930,w:980,h:270},
      {x:390,y:1660,w:330,h:42},{x:970,y:1570,w:390,h:42},{x:1690,y:1640,w:360,h:42},
      {x:2270,y:1510,w:390,h:42},{x:2890,y:1600,w:350,h:42},{x:3470,y:1470,w:370,h:42},
      {x:810,y:1410,w:60,h:490},{x:1520,y:1370,w:60,h:570},{x:2730,y:1350,w:60,h:540},{x:3370,y:1300,w:60,h:630},
      {x:2090,y:1330,w:280,h:40},{x:2990,y:1250,w:260,h:40},{x:3570,y:1300,w:260,h:40}
    ];
    platforms.splice(0,platforms.length,...stage5Platforms);
    configurePlatforms();

    backgroundWallJumpSurfaces.splice(0,backgroundWallJumpSurfaces.length,
      {x:150,y:1300,h:590},{x:730,y:1300,h:590},{x:920,y:1170,h:720},{x:1460,y:1170,h:720},
      {x:1660,y:1300,h:590},{x:2160,y:1300,h:590},{x:2200,y:1110,h:780},{x:2700,y:1110,h:780},
      {x:2820,y:1230,h:660},{x:3320,y:1230,h:660},{x:3420,y:1030,h:860},{x:4160,y:1030,h:860}
    );

    enemies.splice(0,enemies.length,
      {x:590,y:1806,w:72,h:96,hp:7,vx:0,flash:0,alive:true,type:"fox"},
      {x:1200,y:1786,w:72,h:96,hp:7,vx:0,flash:0,alive:true,type:"dog"},
      {x:1880,y:1846,w:72,h:96,hp:8,vx:0,flash:0,alive:true,type:"boar"},
      {x:2590,y:1796,w:72,h:96,hp:8,vx:0,flash:0,alive:true,type:"rabbit"},
      {x:3290,y:1836,w:72,h:96,hp:9,vx:0,flash:0,alive:true,type:"fox"}
    );
    for(const e of enemies) initEnemyState(e);

    throwers.splice(0,throwers.length,
      {x:1090,y:1478,w:68,h:92,hp:7,alive:true,facing:-1,throwTimer:.9,flash:0},
      {x:3020,y:1508,w:68,h:92,hp:7,alive:true,facing:-1,throwTimer:1.45,flash:0}
    );
    pots.length=0;
    attackFX.length=0;

    Object.assign(boss,{
      x:3915,y:1808,baseY:1808,w:106,h:122,
      hp:72,maxHp:72,vx:0,vy:0,facing:-1,flash:0,alive:true,active:false,
      attackTimer:0,attackCooldown:.72,attackHitDone:false,walkPhase:0,hitPause:0,
      jumping:false,jumpCooldown:0,weaponMode:"thrust",weaponSerial:0
    });

    Object.assign(player,{
      x:180,y:1788,vx:0,vy:0,facing:1,grounded:false,onWall:0,wallLatched:false,
      wallLatchSide:0,wallRef:null,wallJumpUsed:false,dashTimer:0,dashCooldown:0,
      attackTimer:0,attackType:"",comboStep:0,comboWindow:0,invuln:1.0,
      respawnTimer:0,respawnX:180,respawnY:1788
    });
    player.hp=player.maxHp;
    camera.x=0;camera.y=0;
  }

  
  function loadStage6(){
    currentStage=6; stageCleared=false; clearTimer=0;
    const ps=[
      {x:0,y:1920,w:900,h:280},{x:900,y:1900,w:740,h:300},{x:1640,y:1940,w:800,h:260},
      {x:2440,y:1890,w:780,h:310},{x:3220,y:1930,w:980,h:270},
      {x:360,y:1660,w:340,h:42},{x:980,y:1560,w:390,h:42},{x:1680,y:1640,w:360,h:42},
      {x:2260,y:1500,w:390,h:42},{x:2870,y:1590,w:360,h:42},{x:3460,y:1460,w:380,h:42},
      {x:800,y:1400,w:60,h:500},{x:1510,y:1360,w:60,h:580},{x:2720,y:1340,w:60,h:550},{x:3360,y:1280,w:60,h:650},
      {x:2080,y:1320,w:290,h:40},{x:2980,y:1240,w:270,h:40},{x:3560,y:1290,w:270,h:40}
    ];
    platforms.splice(0,platforms.length,...ps); configurePlatforms();
    backgroundWallJumpSurfaces.splice(0,backgroundWallJumpSurfaces.length,
      {x:120,y:1270,h:620},{x:740,y:1270,h:620},{x:900,y:1140,h:750},{x:1470,y:1140,h:750},
      {x:1630,y:1280,h:610},{x:2160,y:1280,h:610},{x:2190,y:1080,h:810},{x:2700,y:1080,h:810},
      {x:2810,y:1200,h:690},{x:3330,y:1200,h:690},{x:3410,y:990,h:900},{x:4160,y:990,h:900});
    enemies.splice(0,enemies.length,
      {x:560,y:1806,w:72,h:96,hp:8,vx:0,flash:0,alive:true,type:"dog"},
      {x:1180,y:1786,w:72,h:96,hp:8,vx:0,flash:0,alive:true,type:"boar"},
      {x:1880,y:1846,w:72,h:96,hp:9,vx:0,flash:0,alive:true,type:"fox"},
      {x:2580,y:1796,w:72,h:96,hp:9,vx:0,flash:0,alive:true,type:"rabbit"},
      {x:3280,y:1836,w:72,h:96,hp:10,vx:0,flash:0,alive:true,type:"dog"});
    for(const e of enemies) initEnemyState(e);
    throwers.splice(0,throwers.length,
      {x:1090,y:1468,w:68,h:92,hp:8,alive:true,facing:-1,throwTimer:.85,flash:0},
      {x:3010,y:1498,w:68,h:92,hp:8,alive:true,facing:-1,throwTimer:1.3,flash:0});
    pots.length=0; attackFX.length=0;
    Object.assign(boss,{
      x:3910,y:1808,baseY:1808,w:108,h:122,hp:82,maxHp:82,vx:0,vy:0,facing:-1,
      flash:0,alive:true,active:false,attackTimer:0,attackCooldown:.7,attackHitDone:false,
      walkPhase:0,hitPause:0,jumping:false,jumpCooldown:1.0,weaponMode:"chain",weaponSerial:0
    });
    Object.assign(player,{x:180,y:1788,vx:0,vy:0,facing:1,grounded:false,onWall:0,wallLatched:false,
      wallLatchSide:0,wallRef:null,wallJumpUsed:false,dashTimer:0,dashCooldown:0,attackTimer:0,
      attackType:"",comboStep:0,comboWindow:0,invuln:1,respawnTimer:0,respawnX:180,respawnY:1788});
    player.hp=player.maxHp; camera.x=0; camera.y=0;
  }

  
  function loadStage7(){
    currentStage=7;stageCleared=false;clearTimer=0;
    const ps=[
      {x:0,y:1920,w:650,h:280},{x:650,y:1810,w:560,h:390},{x:1210,y:1690,w:560,h:510},
      {x:1770,y:1570,w:560,h:630},{x:2330,y:1450,w:560,h:750},{x:2890,y:1320,w:560,h:880},{x:3450,y:1090,w:750,h:1110},
      {x:410,y:1690,w:260,h:40},{x:820,y:1570,w:290,h:40},{x:1370,y:1450,w:300,h:40},
      {x:1920,y:1330,w:310,h:40},{x:2470,y:1210,w:310,h:40},{x:3010,y:1080,w:300,h:40},{x:3500,y:930,w:330,h:40},
      {x:720,y:1370,w:60,h:440},{x:1510,y:1240,w:60,h:450},{x:2290,y:1110,w:60,h:460},{x:2860,y:930,w:60,h:390},{x:3380,y:790,w:60,h:530}
    ];
    platforms.splice(0,platforms.length,...ps);configurePlatforms();
    backgroundWallJumpSurfaces.splice(0,backgroundWallJumpSurfaces.length,
      {x:560,y:1380,h:430},{x:760,y:1330,h:480},{x:1120,y:1250,h:440},{x:1510,y:1160,h:530},
      {x:1710,y:1120,h:450},{x:2260,y:1000,h:570},{x:2320,y:940,h:510},{x:2860,y:820,h:500},
      {x:2890,y:800,h:520},{x:3420,y:680,h:640},{x:3450,y:620,h:470},{x:4160,y:620,h:470});
    enemies.splice(0,enemies.length,
      {x:520,y:1816,w:72,h:96,hp:9,vx:0,flash:0,alive:true,type:"rabbit"},
      {x:1030,y:1714,w:72,h:96,hp:9,vx:0,flash:0,alive:true,type:"fox"},
      {x:1570,y:1594,w:72,h:96,hp:10,vx:0,flash:0,alive:true,type:"dog"},
      {x:2140,y:1474,w:72,h:96,hp:10,vx:0,flash:0,alive:true,type:"boar"},
      {x:2710,y:1354,w:72,h:96,hp:11,vx:0,flash:0,alive:true,type:"rabbit"},
      {x:3220,y:1224,w:72,h:96,hp:11,vx:0,flash:0,alive:true,type:"fox"});
    for(const e of enemies)initEnemyState(e);
    throwers.splice(0,throwers.length,
      {x:1430,y:1358,w:68,h:92,hp:9,alive:true,facing:-1,throwTimer:.82,flash:0},
      {x:3060,y:988,w:68,h:92,hp:9,alive:true,facing:-1,throwTimer:1.25,flash:0});
    pots.length=0;attackFX.length=0;
    Object.assign(boss,{x:3910,y:968,baseY:968,w:110,h:122,hp:92,maxHp:92,vx:0,vy:0,facing:-1,
      flash:0,alive:true,active:false,attackTimer:0,attackCooldown:.68,attackHitDone:false,
      walkPhase:0,hitPause:0,jumping:false,jumpCooldown:1.1,weaponMode:"spear",weaponSerial:0});
    Object.assign(player,{x:180,y:1788,vx:0,vy:0,facing:1,grounded:false,onWall:0,wallLatched:false,
      wallLatchSide:0,wallRef:null,wallJumpUsed:false,dashTimer:0,dashCooldown:0,attackTimer:0,
      attackType:"",comboStep:0,comboWindow:0,invuln:1,respawnTimer:0,respawnX:180,respawnY:1788});
    if(sageMode)player.maxHp=40;player.hp=player.maxHp;camera.x=0;camera.y=0;
  }

  
  function loadStage8(){
    currentStage=8;stageCleared=false;clearTimer=0;
    const ps=[
      {x:0,y:1920,w:820,h:280},{x:820,y:1900,w:760,h:300},{x:1580,y:1935,w:780,h:265},
      {x:2360,y:1895,w:800,h:305},{x:3160,y:1920,w:1040,h:280},
      {x:390,y:1640,w:330,h:40},{x:980,y:1510,w:370,h:40},{x:1660,y:1620,w:340,h:40},
      {x:2200,y:1480,w:390,h:40},{x:2790,y:1570,w:350,h:40},{x:3400,y:1430,w:390,h:40},
      {x:760,y:1360,w:60,h:540},{x:1470,y:1300,w:60,h:635},{x:2680,y:1260,w:60,h:635},{x:3320,y:1210,w:60,h:710}
    ];
    platforms.splice(0,platforms.length,...ps);configurePlatforms();
    backgroundWallJumpSurfaces.splice(0,backgroundWallJumpSurfaces.length,
      {x:90,y:1190,h:710},{x:720,y:1190,h:710},{x:850,y:1080,h:820},{x:1450,y:1080,h:820},
      {x:1570,y:1210,h:690},{x:2140,y:1210,h:690},{x:2180,y:1020,h:880},{x:2670,y:1020,h:880},
      {x:2760,y:1120,h:780},{x:3300,y:1120,h:780},{x:3370,y:900,h:1000},{x:4160,y:900,h:1000});
    enemies.splice(0,enemies.length,
      {x:560,y:1806,w:72,h:96,hp:10,vx:0,flash:0,alive:true,type:"dog"},
      {x:1160,y:1806,w:72,h:96,hp:10,vx:0,flash:0,alive:true,type:"fox"},
      {x:1860,y:1841,w:72,h:96,hp:11,vx:0,flash:0,alive:true,type:"boar"},
      {x:2520,y:1801,w:72,h:96,hp:11,vx:0,flash:0,alive:true,type:"rabbit"},
      {x:3200,y:1826,w:72,h:96,hp:12,vx:0,flash:0,alive:true,type:"dog"});
    for(const e of enemies)initEnemyState(e);
    throwers.splice(0,throwers.length,
      {x:1080,y:1418,w:68,h:92,hp:10,alive:true,facing:-1,throwTimer:.8,flash:0},
      {x:2870,y:1478,w:68,h:92,hp:10,alive:true,facing:-1,throwTimer:1.2,flash:0});
    pots.length=0;attackFX.length=0;
    Object.assign(boss,{
      x:3910,y:1798,baseY:1798,w:108,h:122,hp:100,maxHp:100,vx:0,vy:0,facing:-1,
      flash:0,alive:true,active:false,attackTimer:0,attackCooldown:.65,attackHitDone:false,
      walkPhase:0,hitPause:0,jumping:false,jumpCooldown:1.0,weaponMode:"baton",weaponSerial:0
    });
    Object.assign(player,{x:180,y:1788,vx:0,vy:0,facing:1,grounded:false,onWall:0,wallLatched:false,
      wallLatchSide:0,wallRef:null,wallJumpUsed:false,dashTimer:0,dashCooldown:0,attackTimer:0,
      attackType:"",comboStep:0,comboWindow:0,invuln:1,respawnTimer:0,respawnX:180,respawnY:1788});
    if(sageMode)player.maxHp=40;player.hp=player.maxHp;camera.x=0;camera.y=0;
  }

  
  function loadStage9(){
    currentStage=9;stageCleared=false;clearTimer=0;
    const ps=[
      {x:0,y:1920,w:760,h:280},{x:760,y:1900,w:760,h:300},{x:1520,y:1940,w:760,h:260},
      {x:2280,y:1900,w:760,h:300},{x:3040,y:1920,w:1160,h:280},
      {x:330,y:1650,w:350,h:40},{x:920,y:1510,w:390,h:40},{x:1570,y:1640,w:360,h:40},
      {x:2140,y:1470,w:390,h:40},{x:2730,y:1570,w:360,h:40},{x:3370,y:1430,w:400,h:40},
      {x:710,y:1330,w:60,h:570},{x:1450,y:1260,w:60,h:680},{x:2640,y:1220,w:60,h:680},{x:3290,y:1170,w:60,h:750}
    ];
    platforms.splice(0,platforms.length,...ps);configurePlatforms();
    backgroundWallJumpSurfaces.splice(0,backgroundWallJumpSurfaces.length,
      {x:80,y:1150,h:750},{x:690,y:1150,h:750},{x:800,y:1030,h:870},{x:1430,y:1030,h:870},
      {x:1510,y:1170,h:730},{x:2090,y:1170,h:730},{x:2120,y:980,h:920},{x:2620,y:980,h:920},
      {x:2710,y:1080,h:820},{x:3270,y:1080,h:820},{x:3350,y:850,h:1050},{x:4160,y:850,h:1050});
    enemies.splice(0,enemies.length,
      {x:500,y:1806,w:72,h:96,hp:11,vx:0,flash:0,alive:true,type:"fox"},
      {x:1100,y:1806,w:72,h:96,hp:11,vx:0,flash:0,alive:true,type:"dog"},
      {x:1760,y:1846,w:72,h:96,hp:12,vx:0,flash:0,alive:true,type:"boar"},
      {x:2460,y:1806,w:72,h:96,hp:12,vx:0,flash:0,alive:true,type:"rabbit"},
      {x:3150,y:1826,w:72,h:96,hp:13,vx:0,flash:0,alive:true,type:"fox"});
    for(const e of enemies)initEnemyState(e);
    throwers.splice(0,throwers.length,
      {x:1010,y:1418,w:68,h:92,hp:11,alive:true,facing:-1,throwTimer:.75,flash:0},
      {x:2820,y:1478,w:68,h:92,hp:11,alive:true,facing:-1,throwTimer:1.1,flash:0});
    pots.length=0;attackFX.length=0;
    Object.assign(boss,{
      x:3905,y:1798,baseY:1798,w:112,h:122,hp:112,maxHp:112,vx:0,vy:0,facing:-1,
      flash:0,alive:true,active:false,attackTimer:0,attackCooldown:.62,attackHitDone:false,
      walkPhase:0,hitPause:0,jumping:false,jumpCooldown:.9,weaponMode:"tonfa",weaponSerial:0
    });
    Object.assign(player,{x:180,y:1788,vx:0,vy:0,facing:1,grounded:false,onWall:0,wallLatched:false,
      wallLatchSide:0,wallRef:null,wallJumpUsed:false,dashTimer:0,dashCooldown:0,attackTimer:0,
      attackType:"",comboStep:0,comboWindow:0,invuln:1,respawnTimer:0,respawnX:180,respawnY:1788});
    if(sageMode)player.maxHp=40;player.hp=player.maxHp;camera.x=0;camera.y=0;
  }


  function loadStage10(){
    currentStage=10;stageCleared=false;clearTimer=0;
    const ps=[
      // ロビー→右上→左上→右上→左上→屋上。各階は折り返し通路。
      {x:0,y:1920,w:4200,h:280},
      {x:300,y:1640,w:3500,h:40},
      {x:300,y:1360,w:3500,h:40},
      {x:300,y:1080,w:3500,h:40},
      {x:300,y:800,w:3500,h:40},
      {x:300,y:520,w:3500,h:40},
      // 各端の非常階段／エレベーターシャフト。交互に上へ。
      {x:3720,y:1360,w:60,h:560},{x:300,y:1080,w:60,h:560},
      {x:3720,y:800,w:60,h:560},{x:300,y:520,w:60,h:560},
      // 爪登りショートカット用の中央シャフト
      {x:2020,y:520,w:60,h:1400}
    ];
    platforms.splice(0,platforms.length,...ps);configurePlatforms();
    backgroundWallJumpSurfaces.splice(0,backgroundWallJumpSurfaces.length,
      {x:80,y:500,h:1420},{x:298,y:500,h:1420},{x:3780,y:500,h:1420},{x:4160,y:500,h:1420},
      {x:2010,y:500,h:1420},{x:2080,y:500,h:1420});

    enemies.splice(0,enemies.length,
      {x:900,y:1544,w:72,h:96,hp:13,vx:0,flash:0,alive:true,type:"dog"},
      {x:2750,y:1544,w:72,h:96,hp:13,vx:0,flash:0,alive:true,type:"boar"},
      {x:2950,y:1264,w:72,h:96,hp:14,vx:0,flash:0,alive:true,type:"fox"},
      {x:1050,y:1264,w:72,h:96,hp:14,vx:0,flash:0,alive:true,type:"rabbit"},
      {x:1100,y:984,w:72,h:96,hp:15,vx:0,flash:0,alive:true,type:"dog"},
      {x:2820,y:984,w:72,h:96,hp:15,vx:0,flash:0,alive:true,type:"boar"},
      {x:2900,y:704,w:72,h:96,hp:16,vx:0,flash:0,alive:true,type:"fox"},
      {x:1050,y:704,w:72,h:96,hp:16,vx:0,flash:0,alive:true,type:"rabbit"});
    for(const e of enemies)initEnemyState(e);
    throwers.splice(0,throwers.length,
      {x:2450,y:1548,w:68,h:92,hp:12,alive:true,facing:-1,throwTimer:.8,flash:0},
      {x:1450,y:1268,w:68,h:92,hp:12,alive:true,facing:1,throwTimer:1.1,flash:0},
      {x:2450,y:988,w:68,h:92,hp:13,alive:true,facing:-1,throwTimer:.9,flash:0},
      {x:1450,y:708,w:68,h:92,hp:13,alive:true,facing:1,throwTimer:1.2,flash:0});
    pots.length=0;attackFX.length=0;

    // 屋上ラスボス。銃弾は pots 配列を流用し bullet=true で直進させる。
    Object.assign(boss,{
      x:3300,y:398,baseY:398,w:112,h:122,hp:130,maxHp:130,vx:0,vy:0,facing:-1,
      flash:0,alive:true,active:false,attackTimer:0,attackCooldown:.72,attackHitDone:false,
      walkPhase:0,hitPause:0,jumping:false,jumpCooldown:0,weaponMode:"pistol",weaponSerial:0,
      gunCooldown:.8
    });
    Object.assign(player,{x:180,y:1788,vx:0,vy:0,facing:1,grounded:false,onWall:0,wallLatched:false,
      wallLatchSide:0,wallRef:null,wallJumpUsed:false,dashTimer:0,dashCooldown:0,attackTimer:0,
      attackType:"",comboStep:0,comboWindow:0,invuln:1,respawnTimer:0,respawnX:180,respawnY:1788});
    if(sageMode)player.maxHp=40;player.hp=player.maxHp;camera.x=0;camera.y=0;
  }

// 攻撃エフェクト兼ヒット判定。短時間だけ残る。
  const attackFX = [];
  function spawnAttackFX(fx){
    fx.hit = new Set();
    attackFX.push(fx);
  }

  let last = performance.now();

  function resizeCanvas(){
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth*dpr);
    canvas.height = Math.floor(innerHeight*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  addEventListener("resize", resizeCanvas);
  resizeCanvas();

  function keyToAction(key, down) {
    const k = key.toLowerCase();
    if (k==="a" || k==="arrowleft") input.x = down ? -1 : (input.x<0?0:input.x);
    if (k==="d" || k==="arrowright") input.x = down ? 1 : (input.x>0?0:input.x);
    if (k==="w" || k==="arrowup") input.y = down ? -1 : (input.y<0?0:input.y);
    if (k==="s" || k==="arrowdown") input.y = down ? 1 : (input.y>0?0:input.y);

    const map = {j:"attack",k:"claw",l:"dash"," ":"jump"};
    if (map[k]) {
      const a = map[k];
      if (down && !input[a]) input[a+"Pressed"] = true;
      input[a] = down;
    }
  }

  addEventListener("keydown", e => { if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault(); keyToAction(e.key,true); });
  addEventListener("keyup", e => keyToAction(e.key,false));

  const actionButtons = [...document.querySelectorAll(".action")];
  actionButtons.forEach(btn => {
    const a = btn.dataset.action;
    const start = e => {
      e.preventDefault();
      if (!input[a]) input[a+"Pressed"] = true;
      input[a] = true;
      btn.classList.add("pressed");
      try { btn.setPointerCapture(e.pointerId); } catch {}
    };
    const end = e => {
      e.preventDefault();
      input[a] = false;
      btn.classList.remove("pressed");
    };
    btn.addEventListener("pointerdown", start);
    btn.addEventListener("pointerup", end);
    btn.addEventListener("pointercancel", end);
  });

  const stickZone = document.getElementById("stickZone");
  const stickBase = document.getElementById("stickBase");
  const stickKnob = document.getElementById("stickKnob");
  let stickPointer = null;
  let stickCenter = {x:0,y:0};
  function updateStick(e) {
    const rect = stickBase.getBoundingClientRect();
    stickCenter.x = rect.left + rect.width/2;
    stickCenter.y = rect.top + rect.height/2;
    let dx = e.clientX - stickCenter.x;
    let dy = e.clientY - stickCenter.y;
    const max = rect.width*0.34;
    const len = Math.hypot(dx,dy) || 1;
    if (len > max) { dx = dx/len*max; dy = dy/len*max; }
    stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    input.x = Math.abs(dx/max) < .18 ? 0 : Math.max(-1,Math.min(1,dx/max));
    input.y = Math.abs(dy/max) < .2 ? 0 : Math.max(-1,Math.min(1,dy/max));
  }
  stickZone.addEventListener("pointerdown", e => { stickPointer=e.pointerId; updateStick(e); try{stickZone.setPointerCapture(e.pointerId)}catch{}; });
  stickZone.addEventListener("pointermove", e => { if(e.pointerId===stickPointer) updateStick(e); });
  function clearStick(e){
    if (e.pointerId !== stickPointer) return;
    stickPointer=null; input.x=0; input.y=0;
    stickKnob.style.transform="translate(-50%, -50%)";
  }
  stickZone.addEventListener("pointerup",clearStick);
  stickZone.addEventListener("pointercancel",clearStick);

  function overlap(a,b){
    return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
  }

  function resolveCollisions(axis, prevY=player.y){
    player.grounded=false;
    player.onWall=0;
    for(const p of platforms){
      if(p.climbThrough) continue;
      if(!overlap(player,p)) continue;
      if(axis==="x"){
        if(p.oneWay) continue;
        if(player.vx>0){ player.x=p.x-player.w; player.vx=0; player.onWall=1; }
        else if(player.vx<0){ player.x=p.x+p.w; player.vx=0; player.onWall=-1; }
      }else{
        if(p.oneWay){
          const prevBottom=prevY+player.h, nowBottom=player.y+player.h;
          if(player.vy>=0 && prevBottom<=p.y+10 && nowBottom>=p.y){
            player.y=p.y-player.h; player.vy=0; player.grounded=true; player.airDashAvailable=true;
          }
          continue;
        }
        if(player.vy>0){ player.y=p.y-player.h; player.vy=0; player.grounded=true; player.airDashAvailable=true; }
        else if(player.vy<0){ player.y=p.y+p.h; player.vy=0; }
      }
    }
  }
  function getWallContact(){
    const pad = 14;
    const inset = 10;
    const left = {x:player.x-pad,y:player.y+inset,w:pad,h:player.h-inset*2};
    const right= {x:player.x+player.w,y:player.y+inset,w:pad,h:player.h-inset*2};

    for(const p of platforms){
      if(p.oneWay) continue;

      if(p.climbThrough){
        const verticalOverlap =
          player.y + player.h - inset > p.y &&
          player.y + inset < p.y + p.h;
        if(!verticalOverlap) continue;
        const pc=player.x+player.w/2, wc=p.x+p.w/2;
        if(Math.abs(pc-wc) <= player.w/2 + p.w/2 + pad){
          // 棒の中心を通り抜けていても、爪を押せば近い側へ吸着
          return {side: pc <= wc ? 1 : -1, platform:p};
        }
        continue;
      }

      const verticalOverlap =
        player.y + player.h - inset > p.y &&
        player.y + inset < p.y + p.h;

      if(!verticalOverlap) continue;

      const leftGap = Math.abs(player.x - (p.x + p.w));
      const rightGap = Math.abs((player.x + player.w) - p.x);

      if(overlap(left,p) || leftGap <= pad) return {side:-1, platform:p};
      if(overlap(right,p) || rightGap <= pad) return {side:1, platform:p};
    }
    return null;
  }

  function wallProbe(){
    const c = getWallContact();
    player.onWall = c ? c.side : 0;
    return c;
  }

  function snapToWall(contact){
    if(!contact) return;
    const p = contact.platform;
    if(contact.side === 1){
      player.x = p.x - player.w - 0.5;
    }else{
      player.x = p.x + p.w + 0.5;
    }
  }

  function spawnHitSpark(x,y,kind="hit"){
    spawnAttackFX({
      type:"hitSpark",
      x,y,kind,
      life:.16,maxLife:.16
    });
  }

  function triggerParry(x,y){
    player.parrySuccess=.24;
    player.hitStop=Math.max(player.hitStop,.065);
    player.invuln=Math.max(player.invuln,.22);
    player.attackTimer=0;
    player.attackType="";
    spawnAttackFX({
      type:"parrySpark",x:x,y:y,
      life:.26,maxLife:.26
    });    if(sageMode) spawnSageWave("forward",true);

  }

  function defeatPlayer(){
    if(player.respawnTimer>0 || stageCleared) return;
    player.deaths++;
    player.hp=0;
    player.respawnTimer=.85;
    player.vx=0;
    player.vy=0;
    player.wallLatched=false;
    player.wallRef=null;
    player.attackTimer=0;
    player.dashTimer=0;
  }

  function hurtPlayer(damage, kx=0, ky=-220){
    if(player.invuln>0 || player.respawnTimer>0 || stageCleared) return;
    if(sageMode){damage=Math.min(1,damage);kx*=.12;ky*=.18;}
    player.hp=Math.max(0,player.hp-damage);
    player.vx=kx;
    player.vy=ky;
    player.invuln=.72;
    spawnHitSpark(
      player.x+player.w/2,
      player.y+player.h*.46,
      "hurt"
    );
    if(player.hp<=0) defeatPlayer();
  }

  function revivePlayer(){
    player.hp=player.maxHp;
    player.x=Math.max(40,Math.min(WORLD.width-player.w-40,player.respawnX));
    player.y=Math.max(120,Math.min(1810,player.respawnY-34));
    player.vx=0; player.vy=0;
    player.invuln=1.25;
    player.respawnTimer=0;
    player.wallLatched=false;
    player.wallRef=null;
    pots.length=0;
  }

  function startAttack(type, duration=.24){
    player.attackType = type;
    player.attackTimer = duration;
    player.comboWindow = .58;
    player.attackSerial++;
  }

  function attackHitbox(){
    const p = player;
    let hb = null;
    const f = p.facing;
    switch(p.attackType){
      case "jab": hb={x:f>0?p.x+p.w-4:p.x-40,y:p.y+34,w:44,h:28,damage:1,kx:220*f,ky:-80}; break;
      case "straight": hb={x:f>0?p.x+p.w-2:p.x-54,y:p.y+28,w:56,h:32,damage:1,kx:320*f,ky:-60}; break;
      case "kickup": hb={x:f>0?p.x+p.w-8:p.x-52,y:p.y+4,w:62,h:66,damage:2,kx:260*f,ky:-500}; break;
      case "upper": hb={x:p.x+10,y:p.y-32,w:p.w-20,h:64,damage:2,kx:100*f,ky:-650}; break;
      case "somersault": hb={x:f>0?p.x-12:p.x+player.w-48,y:p.y+4,w:60,h:72,damage:2,kx:-420*f,ky:-400}; break;
      case "airkick": hb={x:f>0?p.x+p.w-4:p.x-52,y:p.y+22,w:56,h:42,damage:2,kx:320*f,ky:-110}; break;
      case "divedown": hb={x:f>0?p.x+p.w-5:p.x-70,y:p.y+38,w:74,h:66,damage:4,kx:560*f,ky:520}; break;
      case "dashbody": hb={x:f>0?p.x+p.w-2:p.x-64,y:p.y+42,w:68,h:34,damage:3,kx:620*f,ky:-120}; break;
      case "dashupper": hb={x:f>0?p.x+p.w-8:p.x-58,y:p.y-12,w:66,h:88,damage:4,kx:300*f,ky:-720}; break;
      case "dashclaw": hb={x:f>0?p.x+p.w-8:p.x-98,y:p.y+2,w:106,h:p.h-4,damage:4,kx:760*f,ky:-80}; break;
      case "clawstrike": hb={x:f>0?p.x+p.w-8:p.x-70,y:p.y+12,w:78,h:62,damage:2,kx:390*f,ky:-130}; break;
      case "clawdown": hb={x:f>0?p.x+p.w-6:p.x-64,y:p.y+4,w:70,h:78,damage:4,kx:420*f,ky:220}; break;
      case "wallup": hb={x:f>0?p.x+p.w-4:p.x-66,y:p.y-38,w:68,h:68,damage:4,kx:500*f,ky:-700}; break;
      case "wallside": hb={x:f>0?p.x+p.w-4:p.x-78,y:p.y+14,w:82,h:50,damage:4,kx:760*f,ky:-140}; break;
      case "walldown": hb={x:f>0?p.x+p.w-4:p.x-66,y:p.y+44,w:70,h:68,damage:4,kx:520*f,ky:600}; break;
    }
    return hb;
  }

  const hitMemory = new WeakMap();
  function processHit(){
    if(player.attackTimer<=0) return;
    const hb=attackHitbox();
    if(!hb) return;
    for(const e of [...enemies,...throwers,boss]){
      if(!e.alive || (e===boss && !boss.active) || !overlap(hb,e)) continue;

      // 爪ガード中は、攻撃動作中の相手に通常爪ダメージを先に入れない。
      // 「弾いたのに同時に倒す／食らう」を防ぎ、弾きを優先する。
      const parryTarget =
        player.attackType==="clawstrike" &&
        player.parryTimer>0 &&
        ((e===boss && e.active && e.attackTimer>0) ||
         (enemies.includes(e) && e.attackTimer>0));
      if(parryTarget) continue;

      if(hitMemory.get(e)===player.attackSerial) continue;
      hitMemory.set(e,player.attackSerial);

      e.hp -= hb.damage;
      // ヒット時は少しだけ押し戻し、その後すぐ詰め直されないよう短く足を止める。
      e.vx = 150*player.facing;
      e.hitPause = Math.max(e.hitPause||0,.14);
      e.flash = .12;
      spawnHitSpark(
        e.x+e.w*(player.facing>0?.22:.78),
        e.y+e.h*.46,
        "hit"
      );
      player.hitStop = .045;
      if(e.hp<=0) e.alive=false;
    }
  }

  function doAttack(){
    if(sageMode){
      if(player.attackTimer>0)return;
      if(input.y<-.28){startAttack("dashupper",.34);spawnSageWave("up",false);}
      else{startAttack("straight",.29);spawnSageWave("forward",false);}
      return;
    }
    const airKickChain = !player.grounded && player.attackType==="airkick" && player.attackTimer<.18;
    if(player.attackTimer>0 && !airKickChain) return;

    if(player.wallLatched){
      const away = -player.wallLatchSide;
      player.facing = away;
      player.wallLatched = false;
      player.wallRef=null;
      if(input.y < -.35){
        player.vx = 700*away; player.vy=-820; startAttack("wallup",.31);
        spawnAttackFX({
          type:"wallKickAir", dir:"up",
          x:player.x+player.w/2, y:player.y+player.h*.52,
          facing:away, life:.24,maxLife:.24
        });
      }else if(input.y > .35){
        player.vx = 690*away; player.vy=720; startAttack("walldown",.31);
        spawnAttackFX({
          type:"wallKickAir", dir:"down",
          x:player.x+player.w/2, y:player.y+player.h*.58,
          facing:away, life:.24,maxLife:.24
        });
      }else{
        player.vx = 960*away; player.vy=-100; startAttack("wallside",.29);
        spawnAttackFX({
          type:"wallKickAir", dir:"side",
          x:player.x+player.w/2, y:player.y+player.h*.58,
          facing:away, life:.22,maxLife:.22
        });
      }
      return;
    }

    // 上＋攻撃は地上・空中ともサマーソルト。最優先で受付。
    if(input.y < -.28){
      startAttack("somersault",.44);
      player.vx = -260*player.facing;
      player.vy = player.grounded ? -600 : -420;
      player.grounded=false;
      return;
    }

    if(!player.grounded){
      // 空中で下＋攻撃：斜め下へ一気に踏み込む急降下キック。
      // 壁つかまりからの下キックと同じ「足に風をまとう」感触。
      if(input.y > .35){
        startAttack("divedown",.34);
        player.vx = 650*player.facing;
        player.vy = 900;
        spawnAttackFX({
          type:"wallKickAir", dir:"down",
          x:player.x+player.w/2, y:player.y+player.h*.62,
          facing:player.facing, life:.26,maxLife:.26
        });
        return;
      }
      player.airKickSide = 1-player.airKickSide;
      player.airKickCount++;
      startAttack("airkick",.27);
      player.vx += 150*player.facing;
      return;
    }

    if(player.dashTimer>0){
      // ダッシュ攻撃：低く走り込んでから突き上げるアッパー
      startAttack("dashupper",.42);
      player.dashTimer=0;
      player.vx = 520*player.facing;
      player.vy = -180;

      // 下から上へ半円を描くパンチ残像。見た目と同じ軌道に当たり判定。
      spawnAttackFX({
        type:"upperArc",
        x:player.x+player.w/2 + 54*player.facing,
        y:player.y+player.h*.60,
        facing:player.facing,
        life:.26,
        maxLife:.26,
        delay:.10,
        damage:4,
        kx:320*player.facing,
        ky:-760
      });
      return;
    }

    if(player.comboWindow>0) player.comboStep = (player.comboStep%3)+1;
    else player.comboStep=1;
    const types=["","jab","straight","dashupper"];
    const durations=[0,.26,.29,.42];
    startAttack(types[player.comboStep],durations[player.comboStep]);
    if(player.comboStep===1) player.vx += 150*player.facing;
    if(player.comboStep===2) player.vx += 210*player.facing;
    if(player.comboStep===3){
      player.vx += 150*player.facing;
      player.vy=-150;
      spawnAttackFX({
        type:"upperArc",
        x:player.x+player.w/2 + 54*player.facing,
        y:player.y+player.h*.60,
        facing:player.facing,
        life:.26,maxLife:.26,delay:.10,damage:4,
        kx:320*player.facing,ky:-760
      });
    }
  }
  function doClaw(){
    if(sageMode){player.parryTimer=.35;player.parryCooldown=0;return;}
    // 爪は攻撃だけでなく防御にも使える。受付は広めの約0.30秒。
    if(player.parryCooldown<=0){
      player.parryTimer=.30;
      player.parryCooldown=.30;
    }
    if(player.dashTimer>0 && player.attackTimer<=0){
      startAttack("dashclaw",.30);
      player.dashTimer=0;
      player.dashClawActive=true;
      player.dashClawTimer=.30;
      player.invuln=.34;
      player.vx=1280*player.facing;
      player.vy=0;
      player.clawTrail=.34;

      // 体の高さに残る3本の爪痕そのものを攻撃判定にする。
      spawnAttackFX({
        type:"dashClawTrail",
        x:player.x+player.w/2,
        y:player.y+player.h/2,
        facing:player.facing,
        life:.34,
        maxLife:.34,
        damage:4,
        kx:780*player.facing,
        ky:-90,
        length:150,
        height:player.h*.72
      });
      return;
    }

    // 派生コンボ：攻撃→攻撃→爪＝振り下ろし爪
    const clawChainReady = player.attackTimer<=0 || player.attackTimer<.10;
    if(player.grounded && player.comboWindow>0 && clawChainReady && player.comboStep===2){
      player.comboStep=3;
      startAttack("clawdown",.44);
      player.vx += 90*player.facing;
      spawnAttackFX({
        type:"clawDownArc",
        x:player.x+player.w/2 + 46*player.facing,
        y:player.y+player.h*.46,
        facing:player.facing,
        life:.32,maxLife:.32,delay:.07,
        damage:7,kx:560*player.facing,
        rx:88,ry:86
      });
      return;
    }

    const contact = wallProbe();
    if(!player.dashClawActive && contact && !player.grounded){
      player.wallLatched = true;
      player.wallLatchSide = contact.side;
      player.wallRef = contact.platform;
      snapToWall(contact);
      player.vx=0;
      player.vy=0;
      return;
    }

    // 壁が無ければ通常の爪攻撃。
    if(player.attackTimer<=0){
      startAttack("clawstrike",.30);
      player.vx += 115*player.facing;
      player.clawTrail=.22;
    }
  }
  function doDash(){
    if(sageMode){
      const dir=Math.abs(input.x)>.25?Math.sign(input.x):player.facing;player.facing=dir;
      // 仙人ダッシュ：1回で約1.7画面ぶんをほぼ瞬間移動。
      const leap=Math.max(innerWidth*1.7,1120);
      const oldX=player.x;
      player.x=Math.max(20,Math.min(WORLD.width-player.w-20,player.x+dir*leap));
      player.vx=dir*180;player.invuln=.72;player.dashCooldown=.07;
      spawnAttackFX({type:"dashClawTrail",x:(oldX+player.x)/2+player.w/2,y:player.y+player.h/2,facing:dir,
        life:.24,maxLife:.24,damage:20,kx:1050*dir,ky:-300,
        length:Math.max(260,Math.abs(player.x-oldX)),height:player.h});
      return;
    }
    // 敵と反対方向＋ダッシュで無敵バックステップ。
    // 近くに敵がいない時は「向いている方向の後ろ入力」で判定。
    let nearest=null, nearestDist=99999;
    for(const e of [...enemies,...throwers,boss]){
      if(!e.alive) continue;
      const d=Math.abs((e.x+e.w/2)-(player.x+player.w/2));
      if(d<nearestDist){ nearest=e; nearestDist=d; }
    }
    let away=-player.facing;
    if(nearest && nearestDist<520){
      away=(player.x+player.w/2)<(nearest.x+nearest.w/2)?-1:1;
    }
    const backHeld=Math.abs(input.x)>.35 && Math.sign(input.x)===away;
    if(backHeld && player.grounded && player.dashCooldown<=0){
      player.wallLatched=false;
      player.backstepTimer=.28;
      player.invuln=Math.max(player.invuln,.24);
      player.vx=away*690;
      player.vy=-120;
      player.dashCooldown=.36;
      spawnAttackFX({
        type:"backstepAir",
        x:player.x+player.w/2,y:player.y+player.h*.70,
        facing:away,life:.24,maxLife:.24
      });
      return;
    }
    if(player.dashCooldown>0) return;
    if(!player.grounded && !player.airDashAvailable) return;
    player.dashTimer=.26;
    player.dashCooldown=.30;
    player.vx = 1010*player.facing;
    if(!player.grounded) {
      player.vy *= .25;
      player.airDashAvailable=false;
    }
  }

  function doJump(){
    // 爪でしっかり掴まっている時の壁ジャンプは従来通り強め。
    if(player.wallLatched){
      const away = -player.wallLatchSide;
      player.wallLatched=false;
      player.wallRef=null;
      player.vx=(sageMode?820:650)*away;
      player.vy=sageMode?-1580:-940;
      player.facing=away;
      player.wallJumpUsed=true;
      spawnAttackFX({
        type:"wallKickAir",dir:"up",
        x:player.x+player.w/2,y:player.y+player.h*.62,
        facing:away,life:.16,maxLife:.16
      });
      return;
    }

    // 空中では、登れる壁・竹・背景建物の壁の近くなら
    // 1回だけ「壁を蹴って2段ジャンプ」できる。
    wallProbe();
    const bgWall=backgroundWallProbe();
    if(!player.grounded && !player.wallJumpUsed && (player.onWall || bgWall)){
      const side=player.onWall || bgWall.side;
      const away=-side;
      player.vx=(sageMode?760:540)*away;
      player.vy=sageMode?-1500:-860;
      player.facing=away;
      player.wallJumpUsed=true;
      player.onWall=0;
      spawnAttackFX({
        type:"wallKickAir",dir:"up",
        x:player.x+player.w/2,y:player.y+player.h*.66,
        facing:away,life:.17,maxLife:.17
      });
      return;
    }

    if(player.grounded){
      if(player.dashTimer>0){
        // ダッシュジャンプ：勢いを残して通常より高く遠くへ
        player.vy=sageMode?-1750:-1180;
        player.vx=Math.max(Math.abs(player.vx),sageMode?1150:820)*player.facing;
        player.dashTimer=0;
      }else{
        player.vy=sageMode?-1600:-980;
      }
      player.grounded=false;
      player.airKickCount=0;
      player.wallJumpUsed=false;
    }
  }

  function update(dt){
    if(stageCleared){
      clearTimer+=dt;
      const continuePressed=input.attackPressed||input.clawPressed||input.dashPressed||input.jumpPressed;
      if(currentStage===1 && clearTimer>.65 && continuePressed){
        input.attackPressed=input.clawPressed=input.dashPressed=input.jumpPressed=false;
        loadStage2();
        return;
      }
      if(currentStage===2 && clearTimer>.65 && continuePressed){
        input.attackPressed=input.clawPressed=input.dashPressed=input.jumpPressed=false;
        loadStage3();
        return;
      }
      if(currentStage===3 && clearTimer>.65 && continuePressed){
        input.attackPressed=input.clawPressed=input.dashPressed=input.jumpPressed=false;
        loadStage4();
        return;
      }
      if(currentStage===4 && clearTimer>.65 && continuePressed){
        input.attackPressed=input.clawPressed=input.dashPressed=input.jumpPressed=false;
        loadStage5();
        return;
      }
      if(currentStage===5 && clearTimer>.65 && continuePressed){
        input.attackPressed=input.clawPressed=input.dashPressed=input.jumpPressed=false;
        loadStage6();
        return;
      }
      if(currentStage===6 && clearTimer>.65 && continuePressed){
        input.attackPressed=input.clawPressed=input.dashPressed=input.jumpPressed=false;
        loadStage7();
        return;
      }
      if(currentStage===7 && clearTimer>.65 && continuePressed){
        input.attackPressed=input.clawPressed=input.dashPressed=input.jumpPressed=false;
        loadStage8();
        return;
      }
      if(currentStage===8 && clearTimer>.65 && continuePressed){
        input.attackPressed=input.clawPressed=input.dashPressed=input.jumpPressed=false;
        loadStage9();
        return;
      }
      if(currentStage===9 && clearTimer>.65 && continuePressed){
        input.attackPressed=input.clawPressed=input.dashPressed=input.jumpPressed=false;
        loadStage10();
        return;
      }
      if(currentStage===10 && clearTimer>.8 && input.clawPressed){
        try{localStorage.setItem("catLeeSageUnlocked","1");localStorage.setItem("catLeeStartSage","1");}catch{}
        location.reload();return;
      }
      input.attackPressed=input.clawPressed=input.dashPressed=input.jumpPressed=false;
      return;
    }

    if(player.respawnTimer>0){
      player.respawnTimer-=dt;
      player.animTime+=dt;
      if(player.respawnTimer<=0) revivePlayer();
      input.attackPressed=input.clawPressed=input.dashPressed=input.jumpPressed=false;
      return;
    }

    if(player.hitStop>0){
      player.hitStop-=dt;
      return;
    }

    player.animTime += dt;
    if(!sageMode && sageUnlocked && currentStage===1 && player.x<700 && input.claw && input.dash){
      activateSage();input.clawPressed=input.dashPressed=false;
    }
    player.parryTimer=Math.max(0,player.parryTimer-dt);
    player.parryCooldown=Math.max(0,player.parryCooldown-dt);
    if(sageMode && input.claw){player.parryTimer=.35;player.parryCooldown=0;}
    player.parrySuccess=Math.max(0,player.parrySuccess-dt);
    player.backstepTimer=Math.max(0,player.backstepTimer-dt);

    const prevAttackTimer=player.attackTimer;
    const prevAttackType=player.attackType;
    player.attackTimer=Math.max(0,player.attackTimer-dt);
    if(prevAttackTimer>0 && player.attackTimer<=0){
      // 攻撃アニメ終了後に技名を残さない。次の入力待ち姿勢へ確実に戻す。
      player.attackType="";
    }

    player.comboWindow=Math.max(0,player.comboWindow-dt);
    const hadDash = player.dashTimer>0;
    player.dashTimer=Math.max(0,player.dashTimer-dt);
    player.dashCooldown=Math.max(0,player.dashCooldown-dt);
    player.invuln=Math.max(0,player.invuln-dt);
    if(hadDash && player.dashTimer<=0 && player.grounded){
      player.vx*=0.35;
      if(Math.abs(player.vx)<70) player.vx=0;
    }
    if(player.attackType==="dashbody" && player.attackTimer>0){
      player.vx *= Math.pow(.002,dt);
    }
    if(player.attackType==="dashclaw" && player.attackTimer>0 && !player.dashClawActive && player.grounded){
      player.vx *= Math.pow(.002,dt);
    }
    player.clawTrail=Math.max(0,player.clawTrail-dt);
    player.lastDirTimer=Math.max(0,player.lastDirTimer-dt);
    player.dashClawTimer=Math.max(0,player.dashClawTimer-dt);
    if(player.dashClawActive && player.dashClawTimer<=0){
      player.dashClawActive=false;
      player.vx*=0.28;
      if(player.grounded && Math.abs(player.vx)<80) player.vx=0;
    }
    if(Math.abs(input.x)>.30){ player.lastDirX=Math.sign(input.x); player.lastDirTimer=.20; }

    if(input.attackPressed) doAttack();
    if(input.clawPressed) doClaw();
    if(input.dashPressed) doDash();
    if(input.jumpPressed) doJump();

    if(player.wallLatched){
      const p = player.wallRef;
      const verticalStillValid = p &&
        player.y + player.h - 8 > p.y &&
        player.y + 8 < p.y + p.h;

      if(!verticalStillValid || player.grounded){
        player.wallLatched=false;
        player.wallRef=null;
      } else {
        const contact = {side:player.wallLatchSide, platform:p};
        snapToWall(contact);
        player.vx=0;
        player.vy=0;

        // 爪＋上はしっかり登る。爪連打は一段ずつ強く登る。
        if(input.claw && input.y<-.25){
          player.vy=-360;
        } else if(input.clawPressed){
          player.vy=-430;
        } else if(input.y>0.65){
          player.vy=150;
        }
      }
    } else {
      const maxSpeed = player.grounded ? 500 : 455;
      const accel = player.grounded ? 5200 : 2300;
      if(player.dashTimer<=0 && !["dashbody","dashclaw"].includes(player.attackType)){
        const target=input.x*maxSpeed;
        player.vx += Math.sign(target-player.vx)*Math.min(Math.abs(target-player.vx), accel*dt);
        if(Math.abs(input.x)<.05 && player.grounded){
          const settle = player.dashCooldown>0 ? .0000000002 : .0000005;
          player.vx *= Math.pow(settle,dt);
          if(Math.abs(player.vx)<28) player.vx=0;
        }
      }
      if(Math.abs(input.x)>.15) player.facing=Math.sign(input.x);
      const gravityScale=(sageMode && !player.grounded && input.y<-.25)?.52:1;
      player.vy += WORLD.gravity*gravityScale*dt;
      player.vy = Math.min(player.vy,sageMode?1050:1200);
    }

    if(!player.wallLatched){
      player.x += player.vx*dt;
      if(!player.dashClawActive) resolveCollisions("x");
    }
    const prevY=player.y;
    player.y += player.vy*dt;
    resolveCollisions("y",prevY);

    if(player.wallLatched && player.wallRef){
      snapToWall({side:player.wallLatchSide, platform:player.wallRef});
    } else {
      wallProbe();
    }

    // 急降下キックは着地した瞬間に技を終了。前傾ポーズを地上へ持ち越さない。
    if(player.grounded && player.attackType==="divedown"){
      player.attackTimer=0;
      player.attackType="";
      player.vy=0;
      player.vx*=0.42;
      if(Math.abs(player.vx)<75) player.vx=0;
    }

    // 地上に戻ったら壁関連状態を必ず解除。時々歩けなくなる原因の残留状態を消す。
    if(player.grounded){
      // 落下直前ではなく、直近の安全な地上位置へ「その場復活」するための記録
      player.respawnX=player.x;
      player.respawnY=player.y;
      player.airKickCount=0;
      player.wallJumpUsed=false;
      player.wallLatched=false;
      player.wallRef=null;
      player.wallLatchSide=0;
      player.onWall=0;
      if(Math.abs(input.x)>.08 && player.attackTimer<=0 && !player.dashClawActive){
        const desired=input.x*470;
        if(Math.abs(player.vx)<35) player.vx=desired;
      }
    }

    processHit();

    // 残像エフェクトの寿命とヒット判定
    for(let i=attackFX.length-1;i>=0;i--){
      const fx=attackFX[i];
      if((fx.delay||0)>0){
        fx.delay=Math.max(0,fx.delay-dt);
        continue;
      }
      fx.life-=dt;
      if(fx.life<=0){
        attackFX.splice(i,1);
        continue;
      }

      if(fx.type==="upperArc"){
        const progress=1-fx.life/fx.maxLife;
        // キャット・リーの前方で、下→前→上へ縦の半円。
        // 円の中心自体を前へ置き、背中側には回り込ませない。
        const theta=Math.PI/2 - progress*Math.PI;
        const radiusX=62, radiusY=82;
        const cx=fx.x + Math.cos(theta)*radiusX*fx.facing;
        const cy=fx.y + Math.sin(theta)*radiusY;
        const hb={x:cx-30,y:cy-30,w:60,h:60};
        for(const e of [...enemies,...throwers,boss]){
          if(!e.alive || (e===boss && !boss.active) || fx.hit.has(e) || !overlap(hb,e)) continue;
          fx.hit.add(e);
          e.hp-=fx.damage;
          e.vx=190*fx.facing;
          e.hitPause=Math.max(e.hitPause||0,.14);
          e.flash=.12;
          spawnHitSpark(e.x+e.w/2,e.y+e.h*.43,"hit");
          player.hitStop=.045;
          if(e.hp<=0) e.alive=false;
        }
      }else if(fx.type==="dashClawTrail"){
        // 発生位置から進行方向へ伸びる体高サイズの帯
        const left = fx.facing>0 ? fx.x-18 : fx.x-fx.length+18;
        const hb={x:left,y:fx.y-fx.height/2,w:fx.length,h:fx.height};
        for(const e of [...enemies,...throwers,boss]){
          if(!e.alive || (e===boss && !boss.active) || fx.hit.has(e) || !overlap(hb,e)) continue;
          fx.hit.add(e);
          e.hp-=fx.damage;
          e.vx=230*fx.facing;
          e.hitPause=Math.max(e.hitPause||0,.14);
          e.flash=.12;
          spawnHitSpark(e.x+e.w/2,e.y+e.h*.46,"hit");
          player.hitStop=.04;
          if(e.hp<=0) e.alive=false;
        }
      }else if(fx.type==="clawDownArc"){
        // 上前方から下前方へ振り下ろす弧。3本の爪痕の中央を攻撃軌道にする。
        const progress=1-fx.life/fx.maxLife;
        const theta=-Math.PI*.72 + progress*Math.PI*.92;
        const cx=fx.x + Math.cos(theta)*fx.rx*fx.facing;
        const cy=fx.y + Math.sin(theta)*fx.ry;
        const hb={x:cx-32,y:cy-28,w:64,h:56};
        for(const e of [...enemies,...throwers,boss]){
          if(!e.alive || (e===boss && !boss.active) || fx.hit.has(e) || !overlap(hb,e)) continue;
          fx.hit.add(e);
          e.hp-=fx.damage;
          e.vx=210*fx.facing;
          e.hitPause=Math.max(e.hitPause||0,.15);
          e.flash=.12;
          spawnHitSpark(e.x+e.w/2,e.y+e.h*.48,"hit");
          player.hitStop=.05;
          if(e.hp<=0) e.alive=false;
        }
      }
    }

    // 高所投擲敵：主人公の方向を向き、ステージごとの投擲物を放物線で投げる
    for(const e of throwers){
      if(!e.alive) continue;
      e.flash=Math.max(0,e.flash-dt);
      const dx=(player.x+player.w/2)-(e.x+e.w/2);
      e.facing=dx<0?-1:1;
      e.throwTimer-=dt;
      if(Math.abs(dx)<900 && e.throwTimer<=0){
        const sx=e.x+e.w/2+22*e.facing, sy=e.y+22;
        const flight=Math.max(.75,Math.min(1.25,Math.abs(dx)/520));
        pots.push({
          x:sx,y:sy,w:26,h:28,
          vx:dx/flight,
          vy:-520,
          spin:0,
          alive:true
        });
        e.throwTimer=2.0+Math.random()*.7;
      }
    }

    // 投擲物：重力で落下し、地形か主人公に当たると壊れる
    for(let i=pots.length-1;i>=0;i--){
      const q=pots[i];
      if(q.bullet){
        q.x+=q.vx*dt;q.y+=q.vy*dt;q.spin=0;
      }else{
        q.vy+=1050*dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.spin+=dt*7*(q.vx<0?-1:1);
      }

      let broken=false;
      if(overlap(q,player)){
        if(player.parryTimer>0){
          triggerParry(q.x+q.w/2,q.y+q.h/2);
          player.parryTimer=0;
          // 投擲物も銃弾も爪で打ち返せる。弾丸は一直線に「カキン！」。
          q.vx=-q.vx*(q.bullet?1.05:1.25);
          q.vy=q.bullet?0:-430;
          q.returned=true;
          q.ownerSafe=.12;
        }else if(player.invuln<=0){
          hurtPlayer(q.bullet?3:2,(q.bullet?520:300)*(q.vx<0?-1:1),q.bullet?-120:-260);
          broken=true;
        }
      }
      if(q.ownerSafe>0) q.ownerSafe=Math.max(0,q.ownerSafe-dt);
      if(q.returned && q.ownerSafe<=0){
        for(const e of [...enemies,...throwers,boss]){
          if(!e.alive || (e===boss && !boss.active) || !overlap(q,e)) continue;
          e.hp-=q.bullet?8:3;
          e.flash=.12;
          e.vx=(q.vx<0?-1:1)*190;
          e.hitPause=Math.max(e.hitPause||0,.15);
          spawnHitSpark(e.x+e.w/2,e.y+e.h*.42,"hit");
          if(e.hp<=0) e.alive=false;
          broken=true;
          break;
        }
      }
      if(!broken){
        for(const plat of platforms){
          if(plat.climbThrough) continue;
          if(overlap(q,plat)){ broken=true; break; }
        }
      }
      if(broken || q.y>WORLD.height+100 || q.x<-100 || q.x>WORLD.width+100){
        pots.splice(i,1);
      }
    }

    for(let wi=sageWaves.length-1;wi>=0;wi--){
      const wv=sageWaves[wi];wv.life-=dt;wv.x+=wv.vx*dt;wv.y+=wv.vy*dt;
      const box={x:wv.x-wv.r,y:wv.y-wv.r*.65,w:wv.r*2,h:wv.r*1.3};
      for(const e of [...enemies,...throwers,boss]){
        if(!e.alive||(e===boss&&!boss.active)||wv.hit.has(e)||!overlap(box,e))continue;
        wv.hit.add(e);e.hp-=wv.damage;e.flash=.18;
        if(e===boss){
          // 無双火力はそのまま。ただしボスを地形外へ吹き飛ばして進行不能にしない。
          e.vx=0;e.vy=0;e.hitPause=Math.max(e.hitPause||0,.42);
        }else{
          e.vx=wv.facing*1150;e.vy=-720;e.hitPause=Math.max(e.hitPause||0,.48);
        }
        spawnHitSpark(e.x+e.w/2,e.y+e.h*.42,"hit");
        if(e.hp<=0)e.alive=false;
      }
      for(let qi=pots.length-1;qi>=0;qi--)if(overlap(box,pots[qi]))pots.splice(qi,1);
      if(wv.life<=0||wv.x<-200||wv.x>WORLD.width+200||wv.y<-200)sageWaves.splice(wi,1);
    }

    for(const e of enemies){
      if(!e.alive) continue;
      e.flash=Math.max(0,e.flash-dt);
      e.hitPause=Math.max(0,(e.hitPause||0)-dt);
      e.attackTimer=Math.max(0,e.attackTimer-dt);
      e.attackCooldown=Math.max(0,e.attackCooldown-dt);
      e.walkPhase += dt*8;

      const dx=(player.x+player.w/2)-(e.x+e.w/2);
      e.facing=dx<0?-1:1;
      const dist=Math.abs(dx);

      if(e.hitPause>0){
        // 被弾直後はAIの前進を止め、受けた小さなノックバックだけ残す。
        e.vx*=Math.pow(.08,dt);
      }else if(e.attackTimer>0){
        e.vx=0;
        const elapsed=.62-e.attackTimer;
        if(!e.attackHitDone && elapsed>.27){
          e.attackHitDone=true;
          const hb={x:e.facing>0?e.x+e.w-4:e.x-54,y:e.y-12,w:58,h:e.h+20};
          if(overlap(hb,player)){
            if(player.parryTimer>0){
              triggerParry(player.x+player.w/2,player.y+player.h*.42);
              player.parryTimer=0;
              e.vx=-e.facing*340;
              e.attackTimer=0;
              e.attackCooldown=1.05;
            }else if(player.invuln<=0){
              hurtPlayer(2,420*e.facing,-260);
            }
          }
        }
      }else if(dist<92 && e.attackCooldown<=0){
        e.attackTimer=.62;
        e.attackCooldown=1.15+Math.random()*.45;
        e.attackHitDone=false;
        e.vx=0;
      }else if(dist<620 && dist>72){
        e.vx=e.facing*92;
      }else{
        e.vx=0;
      }

      e.x += e.vx*dt;
      e.y += 900*dt;
      for(const p of platforms){
        if(overlap(e,p) && e.y+e.h>=p.y && e.y<p.y){
          e.y=p.y-e.h;
        }
      }
    }

    // 終端エリアに入るとボス戦。倒すまで arena から先へは抜けない。
    const reachedBossZone=(currentStage===10 ? player.y<650 : player.x>3550);
    if(reachedBossZone && !boss.active){
      boss.active=true;
      // 旧バージョン由来などで既にHP0なら、このフレームで通常のクリア処理へ流す。
    }
    if(boss.active && boss.alive){
      boss.flash=Math.max(0,boss.flash-dt);
      boss.hitPause=Math.max(0,(boss.hitPause||0)-dt);
      boss.attackTimer=Math.max(0,boss.attackTimer-dt);
      boss.attackCooldown=Math.max(0,boss.attackCooldown-dt);
      boss.jumpCooldown=Math.max(0,(boss.jumpCooldown||0)-dt);
      boss.walkPhase+=dt*8;

      const dx=(player.x+player.w/2)-(boss.x+boss.w/2);
      boss.facing=dx<0?-1:1;
      const dist=Math.abs(dx);

      if(currentStage===10){
        // ラスボス：ピストルで間合いを作る。予兆→発砲。近距離は銃床打ち。
        boss.gunCooldown=Math.max(0,(boss.gunCooldown||0)-dt);
        if(boss.hitPause>0){
          boss.vx*=Math.pow(.08,dt);boss.x+=boss.vx*dt;
        }else if(boss.attackTimer>0){
          boss.vx=0;
          const elapsed=.72-boss.attackTimer;
          if(boss.weaponMode==="pistol"){
            if(!boss.attackHitDone && elapsed>.31){
              boss.attackHitDone=true;
              const sx=boss.x+boss.w/2+boss.facing*48,sy=boss.y+42;
              pots.push({x:sx-6,y:sy-4,w:12,h:8,vx:boss.facing*1280,vy:0,spin:0,alive:true,bullet:true,ownerSafe:.10});
            }
          }else if(!boss.attackHitDone && elapsed>.22){
            boss.attackHitDone=true;
            const hb={x:boss.facing>0?boss.x+boss.w-18:boss.x-76,y:boss.y+16,w:94,h:72};
            if(overlap(hb,player)){
              if(player.parryTimer>0){triggerParry(player.x+player.w/2,player.y+player.h*.42);player.parryTimer=0;boss.attackTimer=0;boss.attackCooldown=.95;boss.vx=-boss.facing*320;}
              else hurtPlayer(4,720*boss.facing,-280);
            }
          }
        }else if(dist<125 && boss.attackCooldown<=0){
          boss.weaponMode="gunbutt";boss.attackTimer=.72;boss.attackCooldown=.62;boss.attackHitDone=false;
        }else if(dist>165 && boss.gunCooldown<=0 && boss.attackCooldown<=0){
          boss.weaponMode="pistol";boss.attackTimer=.72;boss.attackCooldown=.72;boss.gunCooldown=.92+Math.random()*.28;boss.attackHitDone=false;
        }else if(dist<220){
          boss.vx=-boss.facing*150;boss.x+=boss.vx*dt;
        }else if(dist>520){
          boss.vx=boss.facing*110;boss.x+=boss.vx*dt;
        }else boss.vx=0;
        boss.x=Math.max(350,Math.min(3750-boss.w,boss.x));boss.y=boss.baseY;
      }else if(currentStage===9){
        // 地下施設の副官：トンファー。高速接近→二連打、時々跳び込み。
        if(boss.jumping){
          boss.vy+=2000*dt;boss.x+=boss.vx*dt;boss.y+=boss.vy*dt;
          if(!boss.attackHitDone && boss.vy>0 && overlap({x:boss.x+5,y:boss.y+15,w:boss.w-10,h:boss.h-10},player)){
            boss.attackHitDone=true;
            if(player.parryTimer>0){triggerParry(player.x+player.w/2,player.y+player.h*.45);player.parryTimer=0;boss.vx=-boss.facing*300;boss.vy=-340;}
            else hurtPlayer(5,760*boss.facing,-430);
          }
          if(boss.y>=boss.baseY){boss.y=boss.baseY;boss.vy=0;boss.vx=0;boss.jumping=false;boss.jumpCooldown=.9;boss.attackCooldown=.28;}
        }else if(boss.hitPause>0){
          boss.vx*=Math.pow(.08,dt);boss.x+=boss.vx*dt;
        }else if(boss.attackTimer>0){
          const elapsed=.62-boss.attackTimer;boss.vx=0;
          if(!boss.attackHitDone && elapsed>.20){
            boss.attackHitDone=true;
            const hb={x:boss.facing>0?boss.x+boss.w-20:boss.x-112,y:boss.y+18,w:132,h:76};
            if(overlap(hb,player)){
              if(player.parryTimer>0){triggerParry(player.x+player.w/2,player.y+player.h*.44);player.parryTimer=0;boss.attackTimer=0;boss.attackCooldown=.95;boss.vx=-boss.facing*330;}
              else hurtPlayer(5,730*boss.facing,-300);
            }
          }
        }else if(boss.jumpCooldown<=0 && dist>260 && dist<520){
          boss.jumping=true;boss.vy=-720;boss.vx=boss.facing*(340+Math.min(80,dist*.1));boss.attackHitDone=false;boss.jumpCooldown=1.25;
        }else if(dist<190 && boss.attackCooldown<=0){
          boss.attackTimer=.62;boss.attackCooldown=.58+Math.random()*.2;boss.attackHitDone=false;boss.weaponSerial=(boss.weaponSerial||0)+1;
        }else if(dist<850 && dist>150){
          boss.vx=boss.facing*215;boss.x+=boss.vx*dt;
        }else boss.vx=0;
        boss.x=Math.max(3650,Math.min(4090-boss.w,boss.x));
        if(!boss.jumping)boss.y=boss.baseY;
      }else if(currentStage===8){
        // 現代街のボス：警棒の連撃＋跳び膝。銃はまだラスボスまで温存。
        if(boss.jumping){
          boss.vy+=1950*dt;boss.x+=boss.vx*dt;boss.y+=boss.vy*dt;
          if(!boss.attackHitDone && boss.vy>0 && overlap({x:boss.x+8,y:boss.y+12,w:boss.w-16,h:boss.h-8},player)){
            boss.attackHitDone=true;
            if(player.parryTimer>0){triggerParry(player.x+player.w/2,player.y+player.h*.45);player.parryTimer=0;boss.vx=-boss.facing*280;boss.vy=-320;}
            else hurtPlayer(4,700*boss.facing,-420);
          }
          if(boss.y>=boss.baseY){boss.y=boss.baseY;boss.vy=0;boss.vx=0;boss.jumping=false;boss.jumpCooldown=1.0;boss.attackCooldown=.35;}
        }else if(boss.hitPause>0){
          boss.vx*=Math.pow(.08,dt);boss.x+=boss.vx*dt;
        }else if(boss.attackTimer>0){
          const elapsed=.66-boss.attackTimer;boss.vx=0;
          if(!boss.attackHitDone && elapsed>.24){
            boss.attackHitDone=true;
            const hb={x:boss.facing>0?boss.x+boss.w-18:boss.x-96,y:boss.y+20,w:114,h:70};
            if(overlap(hb,player)){
              if(player.parryTimer>0){triggerParry(player.x+player.w/2,player.y+player.h*.45);player.parryTimer=0;boss.attackTimer=0;boss.attackCooldown=1.0;boss.vx=-boss.facing*300;}
              else hurtPlayer(4,690*boss.facing,-270);
            }
          }
        }else if(boss.jumpCooldown<=0 && dist>210 && dist<480){
          boss.jumping=true;boss.vy=-760;boss.vx=boss.facing*(300+Math.min(80,dist*.12));boss.attackHitDone=false;boss.jumpCooldown=1.35;
        }else if(dist<175 && boss.attackCooldown<=0){
          boss.attackTimer=.66;boss.attackCooldown=.68+Math.random()*.22;boss.attackHitDone=false;boss.weaponSerial=(boss.weaponSerial||0)+1;
        }else if(dist<800 && dist>145){
          boss.vx=boss.facing*185;boss.x+=boss.vx*dt;
        }else boss.vx=0;
        boss.x=Math.max(3650,Math.min(4090-boss.w,boss.x));
        if(!boss.jumping)boss.y=boss.baseY;
      }else if(currentStage===7){
        // 槍ボス：長い突き、低い足払い、後方ジャンプで間合い管理。
        if(boss.jumping){
          boss.vy+=1900*dt;boss.x+=boss.vx*dt;boss.y+=boss.vy*dt;
          if(boss.y>=boss.baseY){boss.y=boss.baseY;boss.vy=0;boss.vx=0;boss.jumping=false;boss.jumpCooldown=1.0;boss.attackCooldown=.35;}
        }else if(boss.hitPause>0){
          boss.vx*=Math.pow(.08,dt);boss.x+=boss.vx*dt;
        }else if(boss.attackTimer>0){
          const elapsed=.76-boss.attackTimer;boss.vx=0;
          if(!boss.attackHitDone && elapsed>.29){
            boss.attackHitDone=true;
            const sweep=boss.weaponMode==="spearSweep";
            const hb=sweep
              ? {x:boss.facing>0?boss.x+boss.w-22:boss.x-188,y:boss.y+62,w:210,h:42}
              : {x:boss.facing>0?boss.x+boss.w-16:boss.x-215,y:boss.y+26,w:231,h:40};
            if(overlap(hb,player)){
              if(player.parryTimer>0){
                triggerParry(player.x+player.w/2,player.y+player.h*(sweep?.72:.42));player.parryTimer=0;
                boss.attackTimer=0;boss.attackCooldown=1.05;boss.vx=-boss.facing*300;
              }else hurtPlayer(sweep?4:4,760*boss.facing,sweep?-520:-220);
            }
          }
        }else if(dist<120 && boss.jumpCooldown<=0){
          // 近すぎると一度離れて槍の間合いへ。
          boss.jumping=true;boss.vy=-620;boss.vx=-boss.facing*330;boss.jumpCooldown=1.3;
        }else if(dist<285 && boss.attackCooldown<=0){
          boss.weaponSerial=(boss.weaponSerial||0)+1;
          boss.weaponMode=(boss.weaponSerial%3===0)?"spearSweep":"spear";
          boss.attackTimer=.76;boss.attackCooldown=.78+Math.random()*.28;boss.attackHitDone=false;
        }else if(dist<820 && dist>235){
          boss.vx=boss.facing*150;boss.x+=boss.vx*dt;
        }else boss.vx=0;
        boss.x=Math.max(3650,Math.min(4090-boss.w,boss.x));
        if(!boss.jumping)boss.y=boss.baseY;
      }else if(currentStage===6){
        // 鎖分銅ボス：遠距離の横振りと、時々跳び込み攻撃。
        if(boss.jumping){
          boss.vy+=1950*dt; boss.x+=boss.vx*dt; boss.y+=boss.vy*dt;
          if(!boss.attackHitDone && boss.vy>50 && overlap({x:boss.x+5,y:boss.y+18,w:boss.w-10,h:boss.h-12},player)){
            boss.attackHitDone=true;
            if(player.parryTimer>0){triggerParry(player.x+player.w/2,player.y+player.h*.45);player.parryTimer=0;boss.vx=-boss.facing*260;boss.vy=-330;}
            else hurtPlayer(4,650*boss.facing,-380);
          }
          if(boss.y>=boss.baseY){boss.y=boss.baseY;boss.vy=0;boss.vx=0;boss.jumping=false;boss.jumpCooldown=1.1;boss.attackCooldown=.45;}
        }else if(boss.hitPause>0){
          boss.vx*=Math.pow(.08,dt);boss.x+=boss.vx*dt;
        }else if(boss.attackTimer>0){
          const elapsed=.78-boss.attackTimer;boss.vx=0;
          if(!boss.attackHitDone && elapsed>.31){
            boss.attackHitDone=true;
            const hb={x:boss.facing>0?boss.x+boss.w-20:boss.x-210,y:boss.y+12,w:230,h:88};
            if(overlap(hb,player)){
              if(player.parryTimer>0){triggerParry(player.x+player.w/2,player.y+player.h*.42);player.parryTimer=0;boss.attackTimer=0;boss.attackCooldown=1.15;boss.vx=-boss.facing*320;}
              else hurtPlayer(4,760*boss.facing,-300);
            }
          }
        }else if(boss.jumpCooldown<=0 && dist>230 && dist<600){
          boss.jumping=true;boss.vy=-850;boss.vx=boss.facing*(300+Math.min(110,dist*.13));boss.attackHitDone=false;boss.jumpCooldown=1.5;
        }else if(dist<255 && boss.attackCooldown<=0){
          boss.attackTimer=.78;boss.attackCooldown=.9+Math.random()*.28;boss.attackHitDone=false;boss.weaponSerial=(boss.weaponSerial||0)+1;
        }else if(dist<800 && dist>205){
          boss.vx=boss.facing*160;boss.x+=boss.vx*dt;
        }else boss.vx=0;
        boss.x=Math.max(3650,Math.min(4090-boss.w,boss.x));
        if(!boss.jumping)boss.y=boss.baseY;
      }else if(currentStage===5){
        // 長棍ボス：突きと横薙ぎ。どちらも爪で弾ける。
        if(boss.hitPause>0){
          boss.vx*=Math.pow(.08,dt);
          boss.x+=boss.vx*dt;
        }else if(boss.attackTimer>0){
          const elapsed=.72-boss.attackTimer;
          boss.vx=0;
          if(!boss.attackHitDone && elapsed>.27){
            boss.attackHitDone=true;
            const hb=boss.weaponMode==="sweep"
              ? {x:boss.facing>0?boss.x+boss.w-18:boss.x-142,y:boss.y+20,w:160,h:78}
              : {x:boss.facing>0?boss.x+boss.w-12:boss.x-164,y:boss.y+34,w:176,h:44};
            if(overlap(hb,player)){
              if(player.parryTimer>0){
                triggerParry(player.x+player.w/2,player.y+player.h*.45);
                player.parryTimer=0;
                boss.attackTimer=0;
                boss.attackCooldown=1.05;
                boss.vx=-boss.facing*300;
              }else{
                hurtPlayer(boss.weaponMode==="sweep"?4:3,720*boss.facing,boss.weaponMode==="sweep"?-430:-240);
              }
            }
          }
        }else if(dist<205 && boss.attackCooldown<=0){
          boss.weaponSerial=(boss.weaponSerial||0)+1;
          boss.weaponMode=(boss.weaponSerial%2===0)?"sweep":"thrust";
          boss.attackTimer=.72;
          boss.attackCooldown=.78+Math.random()*.30;
          boss.attackHitDone=false;
        }else if(dist<780 && dist>165){
          boss.vx=boss.facing*165;
          boss.x+=boss.vx*dt;
        }else{
          boss.vx=0;
        }
        boss.x=Math.max(3650,Math.min(4090-boss.w,boss.x));
        boss.y=boss.baseY;

      }else if(currentStage===4){
        // 第四幕ボスはジャンプで間合いを変える。
        if(boss.jumping){
          boss.vy += 1950*dt;
          boss.x += boss.vx*dt;
          boss.y += boss.vy*dt;
          boss.x=Math.max(3650,Math.min(4090-boss.w,boss.x));

          // 空中でプレイヤーに触れた時は飛び膝のような体当たり。
          if(!boss.attackHitDone && boss.vy>80){
            const airHb={x:boss.x+8,y:boss.y+24,w:boss.w-16,h:boss.h-18};
            if(overlap(airHb,player)){
              boss.attackHitDone=true;
              if(player.parryTimer>0){
                triggerParry(player.x+player.w/2,player.y+player.h*.42);
                player.parryTimer=0;
                boss.vx=-boss.facing*240;
                boss.vy=-360;
              }else{
                hurtPlayer(3,560*boss.facing,-360);
              }
            }
          }

          if(boss.y>=boss.baseY){
            boss.y=boss.baseY;
            boss.vy=0;
            boss.vx=0;
            boss.jumping=false;
            boss.jumpCooldown=.95+Math.random()*.55;
            boss.attackCooldown=Math.max(boss.attackCooldown,.42);

            // 着地の衝撃。近すぎると小さく吹き飛ばされる。
            const landDx=Math.abs((player.x+player.w/2)-(boss.x+boss.w/2));
            if(landDx<135){
              spawnHitSpark(boss.x+boss.w/2,boss.y+boss.h-8,"hit");
              if(player.parryTimer>0){
                triggerParry(player.x+player.w/2,player.y+player.h*.70);
                player.parryTimer=0;
              }else{
                hurtPlayer(3,500*boss.facing,-300);
              }
            }
          }
        }else if(boss.hitPause>0){
          boss.vx*=Math.pow(.08,dt);
          boss.x+=boss.vx*dt;
        }else if(boss.attackTimer>0){
          const elapsed=.72-boss.attackTimer;
          boss.vx=0;
          if(!boss.attackHitDone && elapsed>.30){
            boss.attackHitDone=true;
            const hb={
              x:boss.facing>0?boss.x+boss.w-8:boss.x-90,
              y:boss.y+25,w:98,h:58
            };
            if(overlap(hb,player)){
              if(player.parryTimer>0){
                triggerParry(player.x+player.w/2,player.y+player.h*.40);
                player.parryTimer=0;
                boss.attackTimer=0;
                boss.attackCooldown=1.0;
                boss.vx=-boss.facing*260;
                boss.y=boss.baseY;
              }else{
                hurtPlayer(4,650*boss.facing,-360);
              }
            }
          }
        }else if(boss.jumpCooldown<=0 && dist>150 && dist<650){
          // 予備動作を短くして、プレイヤーを飛び越えるように跳ぶ。
          boss.jumping=true;
          boss.vy=-900;
          boss.vx=boss.facing*(300+Math.min(120,dist*.16));
          boss.attackHitDone=false;
          boss.attackTimer=0;
          boss.jumpCooldown=1.4;
        }else if(dist<138 && boss.attackCooldown<=0){
          boss.attackTimer=.72;
          boss.attackCooldown=.78+Math.random()*.32;
          boss.attackHitDone=false;
        }else if(dist<720 && dist>110){
          boss.vx=boss.facing*175;
          boss.x+=boss.vx*dt;
        }else{
          boss.vx=0;
        }

        boss.x=Math.max(3650,Math.min(4090-boss.w,boss.x));
        if(!boss.jumping) boss.y=boss.baseY;
      }else{
        if(boss.hitPause>0){
          boss.vx*=Math.pow(.08,dt);
        }else if(boss.attackTimer>0){
          const elapsed=.72-boss.attackTimer;
          boss.vx=0;
          if(!boss.attackHitDone && elapsed>.30){
            boss.attackHitDone=true;
            const hb={
              x:boss.facing>0?boss.x+boss.w-8:boss.x-86,
              y:boss.y+26,w:94,h:56
            };
            if(overlap(hb,player)){
              if(player.parryTimer>0){
                triggerParry(player.x+player.w/2,player.y+player.h*.40);
                player.parryTimer=0;
                boss.attackTimer=0;
                boss.attackCooldown=1.15;
                boss.vx=-boss.facing*260;
                boss.y=boss.baseY||1814;
              }else{
                hurtPlayer(3,620*boss.facing,-340);
              }
            }
          }
        }else if(dist<130 && boss.attackCooldown<=0){
          boss.attackTimer=.72;
          boss.attackCooldown=.86+Math.random()*.38;
          boss.attackHitDone=false;
        }else if(dist<720 && dist>105){
          boss.vx=boss.facing*150;
        }else{
          boss.vx=0;
        }

        boss.x+=boss.vx*dt;
        boss.x=Math.max(3650,Math.min(4090-boss.w,boss.x));
      }

      // ボス戦中の簡易 arena。最終戦は屋上全体を使える。
      if(currentStage===10) player.x=Math.max(300,Math.min(3800-player.w,player.x));
      else player.x=Math.max(3560,Math.min(4140-player.w,player.x));
    }
    if(boss.active && boss.alive){
      if(currentStage===10){
        boss.x=Math.max(350,Math.min(3750-boss.w,boss.x));
        if(!Number.isFinite(boss.y) || boss.y<250 || boss.y>700){boss.y=boss.baseY;boss.vy=0;}
      }else{
        boss.x=Math.max(3650,Math.min(4090-boss.w,boss.x));
        if(!Number.isFinite(boss.y) || boss.y<boss.baseY-900 || boss.y>boss.baseY+260){boss.y=boss.baseY;boss.vy=0;boss.jumping=false;}
      }
    }

    if(!boss.alive && boss.active && !stageCleared){
      if(currentStage===10){sageUnlocked=true;try{localStorage.setItem("catLeeSageUnlocked","1");}catch{}}
      stageCleared=true;
      clearTimer=0;
      player.vx=0;
      player.attackTimer=0;
    }

    if(player.y>WORLD.height+300){
      defeatPlayer();
    }

    input.attackPressed=input.clawPressed=input.dashPressed=input.jumpPressed=false;

    const viewW=innerWidth, viewH=innerHeight;
    const targetX=player.x+player.w/2-viewW*.42;
    const targetY=player.y+player.h/2-viewH*.57;
    camera.x += (Math.max(0,Math.min(WORLD.width-viewW,targetX))-camera.x)*Math.min(1,dt*6);
    camera.y += (Math.max(0,Math.min(WORLD.height-viewH,targetY))-camera.y)*Math.min(1,dt*6);

    let s="移動";
    if(player.wallLatched) s="壁つかまり";
    else if(player.attackTimer>0) s=player.attackType;
    else if(player.dashTimer>0) s="ダッシュ";
    else if(!player.grounded) s="空中";
    stateText.textContent=s.toUpperCase();
  }

  function roundedRect(x,y,w,h,r){
    const rr=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y,x+w,y+h,rr);
    ctx.arcTo(x+w,y+h,x,y+h,rr);
    ctx.arcTo(x,y+h,x,y,rr);
    ctx.arcTo(x,y,x+w,y,rr);
    ctx.closePath();
  }

  function drawStage10Background(){
    const w=innerWidth,h=innerHeight;
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,"#11162a");g.addColorStop(.55,"#27314b");g.addColorStop(1,"#66515b");
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.save();

    // 窓の外は夜明け前の高層都市。登るほど空が広くなる。
    for(let i=0;i<12;i++){
      const bw=150+(i%3)*45,bh=360+(i%5)*95;
      const x=(i*390-camera.x*.16)-220,y=h-bh+camera.y*.08;
      ctx.fillStyle="#1c2638";ctx.fillRect(x,y,bw,bh);
      ctx.fillStyle="rgba(235,202,112,.38)";
      for(let yy=y+35;yy<y+bh-20;yy+=58)for(let xx=x+24;xx<x+bw-20;xx+=48)ctx.fillRect(xx,yy,17,22);
    }

    // ビル内部の柱とガラス壁
    for(let x0=250;x0<4200;x0+=520){
      const x=x0-camera.x;ctx.fillStyle="#242b35";ctx.fillRect(x,430-camera.y,42,1490);
      ctx.fillStyle="rgba(91,128,153,.18)";ctx.fillRect(x+42,470-camera.y,390,1370);
      ctx.strokeStyle="rgba(167,194,207,.28)";ctx.lineWidth=3;ctx.strokeRect(x+42,470-camera.y,390,1370);
    }

    // 各フロアの天井照明。右→左→右→左の折り返しが見える。
    for(const fy of [1640,1360,1080,800,520]){
      const y=fy-camera.y;ctx.fillStyle="#303944";ctx.fillRect(-camera.x,y-18,4200,18);
      ctx.fillStyle="rgba(235,238,220,.72)";
      for(let x0=430;x0<3800;x0+=420)ctx.fillRect(x0-camera.x,y-12,190,5);
    }

    // 端の階段方向サイン
    const signs=[[3500,1510,"UP ↗"],[470,1230,"↖ UP"],[3500,950,"UP ↗"],[470,670,"↖ ROOF"]];
    for(const [x0,y0,t] of signs){
      const x=x0-camera.x,y=y0-camera.y;ctx.fillStyle="#17334a";ctx.fillRect(x,y,135,46);
      ctx.fillStyle="#d9eef4";ctx.font="bold 17px sans-serif";ctx.textAlign="center";ctx.fillText(t,x+67,y+30);ctx.textAlign="left";
    }

    // 最上階～屋上のヘリポート風スペース
    const roofY=520-camera.y;
    ctx.fillStyle="rgba(16,21,30,.72)";ctx.fillRect(300-camera.x,roofY-230,3500,230);
    ctx.strokeStyle="#b8a65b";ctx.lineWidth=6;ctx.beginPath();ctx.arc(3200-camera.x,roofY-8,125,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle="#b8a65b";ctx.font="bold 72px sans-serif";ctx.textAlign="center";ctx.fillText("H",3200-camera.x,roofY+18);ctx.textAlign="left";
    ctx.restore();
  }

  function drawStage9Background(){
    const w=innerWidth,h=innerHeight;
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,"#10171d");g.addColorStop(.55,"#1e2c31");g.addColorStop(1,"#303739");
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.save();

    // 地下鉄トンネルとコンクリート施設
    ctx.fillStyle="#293237";
    for(let x0=-200;x0<4400;x0+=620){
      const x=x0-camera.x*.45;ctx.fillRect(x,480-camera.y*.05,500,1420);
      ctx.strokeStyle="#455158";ctx.lineWidth=10;ctx.strokeRect(x+25,520-camera.y*.05,450,1320);
    }

    // 天井配管
    const pipeY=780-camera.y*.08;
    for(const off of [0,62,124]){
      ctx.strokeStyle=off===62?"#705d43":"#58656a";ctx.lineWidth=16;
      ctx.beginPath();ctx.moveTo(-100,pipeY+off);ctx.lineTo(w+100,pipeY+off);ctx.stroke();
    }
    for(let x=80;x<w;x+=230){
      ctx.strokeStyle="#68757a";ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(x,pipeY-80);ctx.lineTo(x,pipeY+140);ctx.stroke();
    }

    // 地下鉄ホーム・線路
    const railY=1865-camera.y;
    ctx.fillStyle="#74736d";ctx.fillRect(-camera.x,railY,4300,35);
    ctx.fillStyle="#171b1d";ctx.fillRect(-camera.x,railY+35,4300,90);
    ctx.strokeStyle="#a7a39a";ctx.lineWidth=8;
    ctx.beginPath();ctx.moveTo(-camera.x,railY+58);ctx.lineTo(4300-camera.x,railY+58);ctx.moveTo(-camera.x,railY+100);ctx.lineTo(4300-camera.x,railY+100);ctx.stroke();

    // 警告帯・施設扉
    for(let x0=180;x0<3500;x0+=700){
      const x=x0-camera.x,y=1740-camera.y;
      ctx.fillStyle="#c6a63d";ctx.fillRect(x,y,240,18);
      ctx.fillStyle="#222";for(let i=0;i<6;i++){ctx.save();ctx.translate(x+i*42,y);ctx.rotate(-.55);ctx.fillRect(0,-8,16,36);ctx.restore();}
    }
    const labels=[[420,1250,"B2"],[1120,1130,"POWER"],[1800,1260,"MAINT."],[2460,1110,"SECURITY"],[3100,1230,"B3"]];
    for(const [x0,y0,t] of labels){
      const x=x0-camera.x,y=y0-camera.y;ctx.fillStyle="#20292d";ctx.fillRect(x,y,130,55);ctx.strokeStyle="#7f9297";ctx.lineWidth=3;ctx.strokeRect(x,y,130,55);
      ctx.fillStyle="#cbd6d6";ctx.font="bold 18px sans-serif";ctx.textAlign="center";ctx.fillText(t,x+65,y+35);ctx.textAlign="left";
    }

    // 換気ファン
    for(const x0 of [700,1960,3050]){
      const x=x0-camera.x,y=1080-camera.y;ctx.strokeStyle="#718086";ctx.lineWidth=9;ctx.beginPath();ctx.arc(x,y,75,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle="#4d5b60";
      for(let a=0;a<4;a++){ctx.save();ctx.translate(x,y);ctx.rotate(a*Math.PI/2);ctx.beginPath();ctx.ellipse(32,0,42,15,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    }

    // 最奥：エレベーターホール。次は上へ。
    const gx=3550-camera.x,gy=1110-camera.y;
    ctx.fillStyle="#151d22";ctx.fillRect(gx,gy,540,790);
    ctx.fillStyle="#59656b";ctx.fillRect(gx+105,gy+235,145,555);ctx.fillRect(gx+290,gy+235,145,555);
    ctx.strokeStyle="#9ba7aa";ctx.lineWidth=5;ctx.strokeRect(gx+105,gy+235,145,555);ctx.strokeRect(gx+290,gy+235,145,555);
    ctx.fillStyle="#d2bd68";ctx.font="bold 23px sans-serif";ctx.textAlign="center";ctx.fillText("TOWER ACCESS",gx+270,gy+175);ctx.textAlign="left";
    ctx.restore();
  }

  function drawStage8Background(){
    const w=innerWidth,h=innerHeight;
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,"#11152b");g.addColorStop(.58,"#29244a");g.addColorStop(1,"#503544");
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.save();

    // 現代の高層ビル群
    const towers=[[-100,520,360,1380],[300,700,310,1200],[670,430,420,1470],[1160,620,350,1280],
      [1560,360,450,1540],[2070,650,330,1250],[2460,470,410,1430],[2940,580,350,1320],[3350,300,650,1600]];
    for(const [x0,y0,bw,bh] of towers){
      const x=x0-camera.x*.35,y=y0-camera.y*.08;
      ctx.fillStyle="#20283a";ctx.fillRect(x,y,bw,bh);
      for(let yy=y+55;yy<y+bh;yy+=72)for(let xx=x+35;xx<x+bw-25;xx+=65){
        ctx.fillStyle=((Math.floor((xx+yy)/60)%4)===0)?"rgba(255,215,120,.7)":"rgba(95,143,174,.28)";
        ctx.fillRect(xx,yy,28,34);
      }
    }

    // ネオンと看板
    const signs=[[220,1160,"NIGHT"],[930,1040,"CAT CAFE"],[1690,1110,"ARCADE"],[2320,990,"HOTEL"],
      [2880,1080,"CLUB"],[3480,880,"龍 CITY"]];
    for(const [sx0,sy0,label] of signs){
      const x=sx0-camera.x,y=sy0-camera.y;
      ctx.fillStyle="rgba(18,18,28,.88)";ctx.fillRect(x,y,150,62);
      ctx.strokeStyle="#e6b4d7";ctx.lineWidth=4;ctx.strokeRect(x,y,150,62);
      ctx.fillStyle="#f4d8e8";ctx.font="bold 18px sans-serif";ctx.textAlign="center";ctx.fillText(label,x+75,y+39);ctx.textAlign="left";
    }

    // 高架道路・街灯・横断歩道
    ctx.fillStyle="#343944";ctx.fillRect(-camera.x*.55,1450-camera.y*.1,w+500,38);
    for(let x0=150;x0<4300;x0+=520){
      const x=x0-camera.x,y=1840-camera.y;
      ctx.strokeStyle="#4d5560";ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(x,y+50);ctx.lineTo(x,y-190);ctx.quadraticCurveTo(x,y-235,x+55,y-235);ctx.stroke();
      ctx.fillStyle="#f0d995";ctx.beginPath();ctx.ellipse(x+62,y-235,24,10,0,0,Math.PI*2);ctx.fill();
    }
    for(let x0=300;x0<4000;x0+=900){
      const x=x0-camera.x,y=1892-camera.y;ctx.fillStyle="rgba(235,235,230,.55)";
      for(let i=0;i<6;i++)ctx.fillRect(x+i*44,y,28,10);
    }

    // ボス前の現代ビル入口
    const gx=3560-camera.x,gy=1190-camera.y;
    ctx.fillStyle="#171d28";ctx.fillRect(gx,gy,520,710);
    ctx.fillStyle="#39485a";ctx.fillRect(gx+100,gy+230,320,480);
    ctx.strokeStyle="#91a7b7";ctx.lineWidth=6;ctx.strokeRect(gx+100,gy+230,320,480);
    ctx.fillStyle="#d7c477";ctx.font="bold 26px sans-serif";ctx.textAlign="center";ctx.fillText("LEE TOWER",gx+260,gy+180);ctx.textAlign="left";
    ctx.restore();
  }

  function drawStage7Background(){
    const w=innerWidth,h=innerHeight;
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,"#efbd82");g.addColorStop(.36,"#c98268");g.addColorStop(.72,"#596c68");g.addColorStop(1,"#354940");
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.save();

    const valleyShift=camera.y*.10;
    for(let layer=0;layer<3;layer++){
      ctx.fillStyle=layer===0?"rgba(82,91,86,.25)":layer===1?"rgba(56,75,68,.40)":"rgba(40,65,55,.55)";
      ctx.beginPath();ctx.moveTo(0,h);
      for(let x=-240;x<w+300;x+=280){
        const yy=720+layer*175+valleyShift+Math.sin((x+camera.x*.08)/240)*80;
        ctx.lineTo(x,yy);ctx.lineTo(x+140,yy-170+layer*20);ctx.lineTo(x+280,yy);
      }
      ctx.lineTo(w,h);ctx.closePath();ctx.fill();
    }

    ctx.fillStyle="#394f43";ctx.beginPath();
    ctx.moveTo(-200-camera.x,1980-camera.y);ctx.lineTo(500-camera.x,1840-camera.y);ctx.lineTo(1100-camera.x,1710-camera.y);
    ctx.lineTo(1700-camera.x,1580-camera.y);ctx.lineTo(2300-camera.x,1450-camera.y);ctx.lineTo(2900-camera.x,1320-camera.y);
    ctx.lineTo(3500-camera.x,1090-camera.y);ctx.lineTo(4400-camera.x,980-camera.y);ctx.lineTo(4400-camera.x,2300-camera.y);
    ctx.lineTo(-200-camera.x,2300-camera.y);ctx.closePath();ctx.fill();

    const temples=[{x:180,y:1470,w:470,h:430},{x:900,y:1330,w:470,h:470},{x:1660,y:1190,w:470,h:500},
      {x:2380,y:1040,w:470,h:520},{x:3020,y:850,w:430,h:470}];
    for(const b of temples){
      const x=b.x-camera.x,y=b.y-camera.y;
      ctx.fillStyle="#d8c7a5";ctx.fillRect(x,y,b.w,b.h);ctx.strokeStyle="#6a392e";ctx.lineWidth=11;
      for(let xx=x+42;xx<x+b.w;xx+=110){ctx.beginPath();ctx.moveTo(xx,y);ctx.lineTo(xx,y+b.h);ctx.stroke();}
      ctx.fillStyle="#303f3d";ctx.beginPath();ctx.moveTo(x-42,y+15);ctx.quadraticCurveTo(x+b.w/2,y-80,x+b.w+42,y+15);
      ctx.quadraticCurveTo(x+b.w/2,y-24,x-42,y+15);ctx.fill();
    }

    ctx.fillStyle="#8b8679";
    for(let i=0;i<18;i++){const wx=250+i*190,wy=1810-i*43;ctx.fillRect(wx-camera.x,wy-camera.y,150,18);}

    for(const [x0,y0] of [[430,1710],[1110,1550],[1810,1400],[2520,1250],[3150,1080]]){
      const x=x0-camera.x,y=y0-camera.y;ctx.fillStyle="#77736a";ctx.fillRect(x,y,20,100);ctx.fillRect(x-17,y+10,54,14);
      ctx.fillRect(x-9,y-20,38,31);ctx.fillStyle="#f2c66d";ctx.fillRect(x,y-11,20,16);
    }
    for(const [x0,y0] of [[700,1570],[1490,1420],[2260,1260],[2860,1080],[3370,880]]){
      const x=x0-camera.x,y=y0-camera.y;ctx.strokeStyle="#493c2f";ctx.lineWidth=17;ctx.beginPath();
      ctx.moveTo(x,y+250);ctx.quadraticCurveTo(x-35,y+80,x+8,y-90);ctx.stroke();ctx.fillStyle="#29493b";
      for(const [dx,dy] of [[-55,0],[25,-45],[-20,-90]]){ctx.beginPath();ctx.ellipse(x+dx,y+dy,82,34,-.2,0,Math.PI*2);ctx.fill();}
    }

    const gx=3560-camera.x,gy=560-camera.y;ctx.fillStyle="#4b2927";ctx.fillRect(gx,gy,510,530);
    ctx.fillStyle="#263a37";ctx.beginPath();ctx.moveTo(gx-60,gy+22);ctx.quadraticCurveTo(gx+255,gy-105,gx+570,gy+22);
    ctx.lineTo(gx+520,gy+48);ctx.lineTo(gx-10,gy+48);ctx.closePath();ctx.fill();
    ctx.fillStyle="#b82f2f";ctx.fillRect(gx+120,gy+72,270,66);ctx.fillStyle="#efd278";ctx.font="bold 28px serif";
    ctx.textAlign="center";ctx.fillText("天山寺",gx+255,gy+114);ctx.textAlign="left";ctx.restore();
  }

  function drawStage6Background(){
    const w=innerWidth,h=innerHeight;
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,"#0b1721");g.addColorStop(.62,"#27414d");g.addColorStop(1,"#665343");
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.save();

    // 夜明け前の港と遠景クレーン
    ctx.fillStyle="rgba(223,218,183,.22)";ctx.beginPath();ctx.arc(w*.8,105,52,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#182a32";ctx.lineWidth=13;
    for(let i=0;i<8;i++){
      const x=i*620-camera.x*.13-150,base=1570-camera.y*.04;
      ctx.beginPath();ctx.moveTo(x,base);ctx.lineTo(x,base-430);ctx.lineTo(x+230,base-430);ctx.lineTo(x+80,base-320);ctx.stroke();
    }
    // 倉庫
    const bs=[{x:120,y:1270,w:620,h:620},{x:900,y:1140,w:570,h:750},{x:1630,y:1280,w:530,h:610},
      {x:2190,y:1080,w:510,h:810},{x:2810,y:1200,w:520,h:690},{x:3410,y:990,w:750,h:900}];
    for(const b of bs){
      const x=b.x-camera.x,y=b.y-camera.y;
      ctx.fillStyle="#59636a";ctx.fillRect(x,y,b.w,b.h);
      ctx.fillStyle="#313b42";ctx.fillRect(x,y,b.w,24);
      ctx.strokeStyle="rgba(28,35,40,.35)";ctx.lineWidth=4;
      for(let xx=x+45;xx<x+b.w;xx+=70){ctx.beginPath();ctx.moveTo(xx,y+25);ctx.lineTo(xx,y+b.h);ctx.stroke();}
      for(let wx=x+70;wx<x+b.w-70;wx+=145){ctx.fillStyle="#244654";ctx.fillRect(wx,y+100,76,88);ctx.strokeStyle="#1d2c33";ctx.lineWidth=6;ctx.strokeRect(wx,y+100,76,88);}
    }
    // コンテナ
    for(const [cx0,cy0,label] of [[330,1760,"LEE"],[1320,1740,"PACIFIC"],[2020,1780,"CARGO"],[2860,1735,"OCEAN"]]){
      const x=cx0-camera.x,y=cy0-camera.y;
      ctx.fillStyle="#75483f";ctx.fillRect(x,y,210,105);ctx.strokeStyle="#342d2d";ctx.lineWidth=5;ctx.strokeRect(x,y,210,105);
      ctx.fillStyle="rgba(236,220,178,.65)";ctx.font="bold 18px sans-serif";ctx.fillText(label,x+18,y+60);
    }
    // 港の大型クレーンと吊りフック
    ctx.strokeStyle="#26353d";ctx.lineWidth=16;
    for(const gx0 of [780,1530,2720,3370]){
      const x=gx0-camera.x;ctx.beginPath();ctx.moveTo(x,1880-camera.y);ctx.lineTo(x,1260-camera.y);ctx.lineTo(x+190,1260-camera.y);ctx.stroke();
      ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x+145,1260-camera.y);ctx.lineTo(x+145,1450-camera.y);ctx.stroke();
      ctx.lineWidth=16;
    }
    // 最奥の倉庫ゲート
    const gx=3580-camera.x,gy=1350-camera.y;
    ctx.fillStyle="#202a30";ctx.fillRect(gx,gy,480,540);ctx.strokeStyle="#8a7451";ctx.lineWidth=9;ctx.strokeRect(gx+20,gy+20,440,500);
    ctx.fillStyle="#9b3231";ctx.fillRect(gx+100,gy+55,280,64);ctx.fillStyle="#ead071";ctx.font="bold 26px serif";ctx.textAlign="center";
    ctx.fillText("第六倉庫",gx+240,gy+96);ctx.textAlign="left";
    ctx.restore();
  }

  function drawStage5Background(){
    const w=innerWidth,h=innerHeight;
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,"#11192a");g.addColorStop(.58,"#26384d");g.addColorStop(1,"#54434a");
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    ctx.save();

    for(let i=0;i<18;i++){
      const bw=110+(i%4)*38,bh=260+(i%6)*74;
      const bx=i*280-camera.x*.12-140,by=1580-bh-camera.y*.04;
      ctx.fillStyle=i%2?"#1c2632":"#202b39";ctx.fillRect(bx,by,bw,bh);
      for(let wy=by+32;wy<by+bh-30;wy+=48){
        ctx.fillStyle="rgba(242,205,105,.18)";ctx.fillRect(bx+20,wy,13,18);ctx.fillRect(bx+57,wy,13,18);
      }
    }

    const buildings=[
      {x:150,y:1300,w:580,h:590},{x:920,y:1170,w:540,h:720},{x:1660,y:1300,w:500,h:590},
      {x:2200,y:1110,w:500,h:780},{x:2820,y:1230,w:500,h:660},{x:3420,y:1030,w:740,h:860}
    ];
    for(const b of buildings){
      const bx=b.x-camera.x,by=b.y-camera.y;
      ctx.fillStyle="#654842";ctx.fillRect(bx,by,b.w,b.h);
      ctx.strokeStyle="rgba(41,25,27,.30)";ctx.lineWidth=2;
      for(let yy=by+24,row=0;yy<by+b.h;yy+=26,row++){
        ctx.beginPath();ctx.moveTo(bx,yy);ctx.lineTo(bx+b.w,yy);ctx.stroke();
        const off=row%2?26:0;
        for(let xx=bx+off;xx<bx+b.w;xx+=52){ctx.beginPath();ctx.moveTo(xx,yy-26);ctx.lineTo(xx,yy);ctx.stroke();}
      }
      for(let wx=bx+65;wx<bx+b.w-70;wx+=128){
        for(let wy=by+90;wy<Math.min(by+470,by+b.h-90);wy+=138){
          ctx.fillStyle="#29485b";ctx.fillRect(wx,wy,62,82);
          ctx.strokeStyle="#2d2527";ctx.lineWidth=6;ctx.strokeRect(wx,wy,62,82);
          ctx.fillStyle="rgba(235,191,94,.32)";ctx.fillRect(wx+8,wy+8,18,25);
        }
      }
    }

    const neons=[[420,1450,"DRAGON"],[1190,1350,"HOTEL"],[1850,1490,"CAFE"],[2470,1320,"CLUB"],[3090,1430,"MARKET"],[3750,1280,"GOLDEN"]];
    ctx.textAlign="center";ctx.font="bold 20px sans-serif";
    for(const [nx0,ny0,label] of neons){
      const nx=nx0-camera.x,ny=ny0-camera.y;
      ctx.fillStyle="rgba(18,23,31,.85)";ctx.fillRect(nx-52,ny-28,104,46);
      ctx.strokeStyle="#e3b84c";ctx.lineWidth=3;ctx.strokeRect(nx-52,ny-28,104,46);
      ctx.fillStyle="#f1d06c";ctx.fillText(label,nx,ny+2);
    }
    ctx.textAlign="left";

    for(const [sx0,sy0] of [[730,1450],[1480,1370],[2700,1320],[3340,1410]]){
      const sx=sx0-camera.x,sy=sy0-camera.y;
      ctx.strokeStyle="#343a42";ctx.lineWidth=7;
      ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+105,sy);ctx.moveTo(sx+14,sy);ctx.lineTo(sx+14,sy+310);ctx.moveTo(sx+91,sy);ctx.lineTo(sx+91,sy+310);ctx.stroke();
      ctx.lineWidth=3;
      for(let yy=sy+32;yy<sy+300;yy+=34){ctx.beginPath();ctx.moveTo(sx+14,yy);ctx.lineTo(sx+91,yy);ctx.stroke();}
    }

    const railY=1540-camera.y*.18;
    ctx.fillStyle="#303942";ctx.fillRect(0,railY,w,30);
    ctx.fillStyle="#222930";
    for(let x=-80;x<w+100;x+=180)ctx.fillRect(x,railY+30,26,h-railY);
    const trainX=500-(camera.x*.35%1800);
    ctx.fillStyle="rgba(83,96,108,.82)";roundedRect(trainX,railY-82,610,76,10);ctx.fill();
    for(let i=0;i<7;i++){ctx.fillStyle="#6f8b98";ctx.fillRect(trainX+34+i*78,railY-64,54,34);}

    const tx=3180-camera.x*.65,ty=770-camera.y*.07;
    ctx.fillStyle="#303941";ctx.beginPath();ctx.ellipse(tx,ty,75,28,0,0,Math.PI*2);ctx.fill();ctx.fillRect(tx-75,ty,150,110);
    ctx.strokeStyle="#303941";ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(tx-55,ty+100);ctx.lineTo(tx-95,ty+240);ctx.moveTo(tx+55,ty+100);ctx.lineTo(tx+95,ty+240);ctx.stroke();

    const gx=3590-camera.x,gy=1370-camera.y;
    ctx.fillStyle="#251f28";ctx.fillRect(gx,gy,460,520);
    ctx.strokeStyle="#b48947";ctx.lineWidth=8;ctx.strokeRect(gx+18,gy+18,424,484);
    ctx.fillStyle="#8d2634";ctx.fillRect(gx+100,gy+55,260,65);
    ctx.fillStyle="#f1d275";ctx.font="bold 27px serif";ctx.textAlign="center";ctx.fillText("龍門武館",gx+230,gy+97);ctx.textAlign="left";
    ctx.restore();
  }

  function drawStage4Background(){
    const w=innerWidth,h=innerHeight;
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,"#171d25");
    g.addColorStop(.62,"#37414a");
    g.addColorStop(1,"#65584e");
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);

    ctx.save();

    // 月明かりと煙
    ctx.fillStyle="rgba(232,224,194,.22)";
    ctx.beginPath();ctx.arc(w*.78,110,58,0,Math.PI*2);ctx.fill();
    for(let i=0;i<9;i++){
      const sx=i*520-camera.x*.12-120;
      const sy=420+(i%3)*90-camera.y*.04;
      ctx.fillStyle="rgba(120,128,130,.10)";
      ctx.beginPath();ctx.ellipse(sx,sy,170,55,-.15,0,Math.PI*2);ctx.fill();
    }

    // 遠景の煙突
    for(let i=0;i<10;i++){
      const cx=i*470-camera.x*.15;
      const base=1600-camera.y*.05;
      const ch=300+(i%4)*75;
      ctx.fillStyle="#20272c";ctx.fillRect(cx,base-ch,64,ch);
      ctx.fillStyle="#343b3f";ctx.fillRect(cx-10,base-ch,84,18);
      ctx.globalAlpha=.18;
      ctx.fillStyle="#a9aa9e";
      for(let k=0;k<3;k++){
        ctx.beginPath();ctx.ellipse(cx+35+k*30,base-ch-35-k*24,48+k*15,24,0,0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=1;
    }

    // 工場棟
    const factories=[
      {x:150,y:1320,w:580,h:570},
      {x:930,y:1190,w:520,h:700},
      {x:1650,y:1320,w:500,h:570},
      {x:2200,y:1140,w:500,h:750},
      {x:2820,y:1260,w:500,h:630},
      {x:3420,y:1080,w:740,h:810}
    ];
    for(const b of factories){
      const bx=b.x-camera.x,by=b.y-camera.y;
      ctx.fillStyle="#5c5048";ctx.fillRect(bx,by,b.w,b.h);
      ctx.strokeStyle="rgba(34,30,28,.38)";ctx.lineWidth=3;
      for(let yy=by+30;yy<by+b.h;yy+=32){
        ctx.beginPath();ctx.moveTo(bx,yy);ctx.lineTo(bx+b.w,yy);ctx.stroke();
      }

      // 大きな工場窓
      for(let wx=bx+70;wx<bx+b.w-80;wx+=145){
        for(let wy=by+85;wy<Math.min(by+430,by+b.h-100);wy+=150){
          ctx.fillStyle="#374d55";ctx.fillRect(wx,wy,78,90);
          ctx.strokeStyle="#232a2e";ctx.lineWidth=7;ctx.strokeRect(wx,wy,78,90);
          ctx.lineWidth=3;
          ctx.beginPath();ctx.moveTo(wx+39,wy);ctx.lineTo(wx+39,wy+90);
          ctx.moveTo(wx,wy+45);ctx.lineTo(wx+78,wy+45);ctx.stroke();
        }
      }

      // 鉄骨補強
      ctx.strokeStyle="#2b3135";ctx.lineWidth=9;
      ctx.beginPath();
      ctx.moveTo(bx+20,by+30);ctx.lineTo(bx+b.w-20,by+b.h-30);
      ctx.moveTo(bx+b.w-20,by+30);ctx.lineTo(bx+20,by+b.h-30);
      ctx.stroke();
    }

    // 鉄骨クレーン・配管
    ctx.strokeStyle="#444b50";ctx.lineWidth=14;
    for(const gx0 of [760,1550,2730,3370]){
      const gx=gx0-camera.x;
      ctx.beginPath();ctx.moveTo(gx,1870-camera.y);ctx.lineTo(gx,1280-camera.y);ctx.stroke();
      ctx.lineWidth=7;
      ctx.beginPath();ctx.moveTo(gx,1350-camera.y);ctx.lineTo(gx+180,1350-camera.y);ctx.stroke();
      ctx.lineWidth=14;
    }
    ctx.strokeStyle="#7a6556";ctx.lineWidth=18;
    ctx.beginPath();
    ctx.moveTo(-100-camera.x,1710-camera.y);
    ctx.lineTo(4200-camera.x,1650-camera.y);
    ctx.stroke();

    // 黄色い作業灯
    for(const lx0 of [480,1260,1980,2520,3140,3780]){
      const lx=lx0-camera.x,ly=1540-camera.y;
      ctx.fillStyle="rgba(240,196,89,.20)";
      ctx.beginPath();ctx.moveTo(lx,ly);ctx.lineTo(lx-85,ly+270);ctx.lineTo(lx+85,ly+270);ctx.closePath();ctx.fill();
      ctx.fillStyle="#e2b84e";ctx.fillRect(lx-11,ly-8,22,15);
    }

    // 木箱・ドラム缶
    for(const [cx0,cy0] of [[330,1800],[1320,1795],[2030,1810],[2830,1785],[3470,1810]]){
      const cx=cx0-camera.x,cy=cy0-camera.y;
      ctx.fillStyle="#70523d";ctx.fillRect(cx,cy,58,52);
      ctx.strokeStyle="#3d3028";ctx.lineWidth=3;ctx.strokeRect(cx,cy,58,52);
      ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+58,cy+52);
      ctx.moveTo(cx+58,cy);ctx.lineTo(cx,cy+52);ctx.stroke();

      ctx.fillStyle="#4f5a5e";roundedRect(cx+68,cy-8,40,60,8);ctx.fill();
      ctx.strokeStyle="#242b2e";ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(cx+69,cy+5);ctx.lineTo(cx+107,cy+5);
      ctx.moveTo(cx+69,cy+36);ctx.lineTo(cx+107,cy+36);ctx.stroke();
    }

    // ボス前の大工場ゲート
    const fx=3600-camera.x,fy=1370-camera.y;
    ctx.fillStyle="#2d3439";ctx.fillRect(fx,fy,450,520);
    ctx.strokeStyle="#858079";ctx.lineWidth=10;ctx.strokeRect(fx+20,fy+20,410,480);
    ctx.fillStyle="#b34f37";ctx.fillRect(fx+105,fy+55,240,62);
    ctx.fillStyle="#f0d17a";ctx.font="bold 26px sans-serif";ctx.textAlign="center";
    ctx.fillText("WORKS No.4",fx+225,fy+96);
    ctx.textAlign="left";

    ctx.restore();
  }

  function drawStage3Background(){
    const w=innerWidth,h=innerHeight;
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,"#26313f");
    g.addColorStop(.58,"#5e6670");
    g.addColorStop(1,"#8a7565");
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);

    ctx.save();

    // 遠景の近代都市シルエット
    ctx.globalAlpha=.24;
    for(let i=0;i<16;i++){
      const bw=120+(i%4)*45;
      const bh=210+(i%5)*72;
      const bx=i*310-camera.x*.13-160;
      const by=1570-bh-camera.y*.05;
      ctx.fillStyle="#283039";
      ctx.fillRect(bx,by,bw,bh);
      for(let wy=by+35;wy<by+bh-25;wy+=46){
        ctx.fillStyle="rgba(219,195,134,.25)";
        ctx.fillRect(bx+24,wy,15,20);
        ctx.fillRect(bx+64,wy,15,20);
      }
    }
    ctx.globalAlpha=1;

    // 煉瓦造りの商館・ホテル・劇場
    const blocks=[
      {x:170,y:1350,w:550,h:540,t:"商會"},
      {x:930,y:1240,w:510,h:650,t:"飯店"},
      {x:1670,y:1360,w:460,h:530,t:"百貨"},
      {x:2200,y:1200,w:500,h:690,t:"銀行"},
      {x:2810,y:1300,w:490,h:590,t:"劇場"},
      {x:3430,y:1160,w:730,h:730,t:"大飯店"}
    ];
    for(const b of blocks){
      const bx=b.x-camera.x,by=b.y-camera.y;
      ctx.fillStyle="#8b6856";ctx.fillRect(bx,by,b.w,b.h);

      // 煉瓦目地
      ctx.strokeStyle="rgba(58,38,31,.22)";ctx.lineWidth=2;
      for(let yy=by+26,row=0;yy<by+b.h;yy+=28,row++){
        ctx.beginPath();ctx.moveTo(bx,yy);ctx.lineTo(bx+b.w,yy);ctx.stroke();
        const off=row%2?28:0;
        for(let xx=bx+off;xx<bx+b.w;xx+=56){
          ctx.beginPath();ctx.moveTo(xx,yy-28);ctx.lineTo(xx,yy);ctx.stroke();
        }
      }

      // 石の縁取り
      ctx.fillStyle="#b29a7d";
      ctx.fillRect(bx,by,b.w,16);
      ctx.fillRect(bx+14,by,12,b.h);
      ctx.fillRect(bx+b.w-26,by,12,b.h);

      // 窓
      for(let wx=bx+62;wx<bx+b.w-70;wx+=126){
        for(let wy=by+78;wy<Math.min(by+410,by+b.h-90);wy+=132){
          ctx.fillStyle="#3e5663";ctx.fillRect(wx,wy,58,76);
          ctx.strokeStyle="#c1ad8a";ctx.lineWidth=5;ctx.strokeRect(wx,wy,58,76);
          ctx.lineWidth=2;
          ctx.beginPath();ctx.moveTo(wx+29,wy);ctx.lineTo(wx+29,wy+76);
          ctx.moveTo(wx,wy+38);ctx.lineTo(wx+58,wy+38);ctx.stroke();
        }
      }

      // 店名プレート
      ctx.fillStyle="#26313b";ctx.fillRect(bx+b.w*.5-48,by+28,96,34);
      ctx.fillStyle="#e1c46e";ctx.font="bold 19px serif";ctx.textAlign="center";
      ctx.fillText(b.t,bx+b.w*.5,by+52);
    }
    ctx.textAlign="left";

    // バルコニー／非常階段
    for(const [sx0,sy0] of [[760,1500],[1500,1430],[2730,1390],[3330,1460]]){
      const sx=sx0-camera.x,sy=sy0-camera.y;
      ctx.strokeStyle="#3c4146";ctx.lineWidth=7;
      ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+100,sy);
      ctx.moveTo(sx+15,sy);ctx.lineTo(sx+15,sy+260);
      ctx.moveTo(sx+85,sy);ctx.lineTo(sx+85,sy+260);ctx.stroke();
      ctx.lineWidth=3;
      for(let yy=sy+30;yy<sy+250;yy+=34){
        ctx.beginPath();ctx.moveTo(sx+15,yy);ctx.lineTo(sx+85,yy);ctx.stroke();
      }
    }

    // 路面電車の架線と街灯
    ctx.strokeStyle="#2f3439";ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(0,1460-camera.y*.12);ctx.lineTo(w,1390-camera.y*.12);ctx.stroke();
    for(const lx0 of [350,1220,2050,2920,3740]){
      const lx=lx0-camera.x;
      ctx.strokeStyle="#343b40";ctx.lineWidth=8;
      ctx.beginPath();ctx.moveTo(lx,1885-camera.y);ctx.lineTo(lx,1500-camera.y);ctx.stroke();
      ctx.beginPath();ctx.arc(lx+18,1506-camera.y,19,Math.PI,0);ctx.stroke();
      ctx.fillStyle="#e7cf85";ctx.beginPath();ctx.arc(lx+36,1506-camera.y,9,0,Math.PI*2);ctx.fill();
    }

    // 路面電車（遠景）
    const tramX=1470-camera.x*.55, tramY=1715-camera.y*.2;
    ctx.fillStyle="rgba(68,76,83,.72)";
    roundedRect(tramX,tramY,380,115,12);ctx.fill();
    ctx.fillStyle="rgba(188,165,115,.65)";ctx.fillRect(tramX+22,tramY+18,336,20);
    for(let i=0;i<5;i++){
      ctx.fillStyle="#59717e";ctx.fillRect(tramX+34+i*66,tramY+50,48,38);
    }
    ctx.fillStyle="#24292d";
    ctx.beginPath();ctx.arc(tramX+78,tramY+116,18,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(tramX+302,tramY+116,18,0,Math.PI*2);ctx.fill();

    // 路面の看板と庇
    const awnings=[[420,1690,"茶房"],[1770,1700,"洋服"],[2920,1680,"電影"],[3560,1640,"旅館"]];
    ctx.font="bold 20px serif";ctx.textAlign="center";
    for(const [ax0,ay0,label] of awnings){
      const ax=ax0-camera.x, ay=ay0-camera.y;
      ctx.fillStyle="#26323c";ctx.fillRect(ax-45,ay-82,90,38);
      ctx.fillStyle="#e0c772";ctx.fillText(label,ax,ay-56);
      ctx.fillStyle="#75504a";
      ctx.beginPath();ctx.moveTo(ax-78,ay-40);ctx.lineTo(ax+78,ay-40);ctx.lineTo(ax+60,ay);ctx.lineTo(ax-60,ay);ctx.closePath();ctx.fill();
    }
    ctx.textAlign="left";

    // ボス前の大ホテル玄関
    const hx=3620-camera.x,hy=1435-camera.y;
    ctx.fillStyle="#353b44";ctx.fillRect(hx,hy,420,455);
    ctx.fillStyle="#b9a37f";ctx.fillRect(hx+22,hy+20,376,28);
    ctx.fillStyle="#6a2430";ctx.fillRect(hx+120,hy+140,180,315);
    ctx.fillStyle="#e0c16e";ctx.font="bold 28px serif";ctx.textAlign="center";
    ctx.fillText("GRAND HOTEL",hx+210,hy+96);
    ctx.textAlign="left";

    ctx.restore();
  }

  function drawStage2Background(){
    const w=innerWidth,h=innerHeight;
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,"#34465b");
    g.addColorStop(.58,"#66798a");
    g.addColorStop(1,"#9b8a70");
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);

    // 海と夕靄
    const seaY=Math.max(h*.66,520-camera.y*.04);
    ctx.fillStyle="#536f7a";ctx.fillRect(0,seaY,w,h-seaY);
    ctx.globalAlpha=.22;
    ctx.strokeStyle="#d5d1b8";ctx.lineWidth=3;
    for(let i=0;i<12;i++){
      const yy=seaY+18+i*18;
      ctx.beginPath();
      ctx.moveTo((i*93-camera.x*.08)%(w+180)-90,yy);
      ctx.lineTo(Math.min(w,(i*93-camera.x*.08)%(w+180)+150),yy);
      ctx.stroke();
    }
    ctx.globalAlpha=1;

    ctx.save();

    // 遠くの帆船・マスト
    for(const [sx0,sy0,sc] of [[300,1490,.8],[1540,1450,1],[2700,1490,.85]]){
      const sx=sx0-camera.x*.18,sy=sy0-camera.y*.08;
      ctx.strokeStyle="rgba(45,50,54,.48)";ctx.lineWidth=5;
      ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx,sy-260*sc);ctx.stroke();
      ctx.beginPath();ctx.moveTo(sx,sy-220*sc);ctx.lineTo(sx+120*sc,sy-110*sc);ctx.lineTo(sx,sy-110*sc);ctx.closePath();
      ctx.fillStyle="rgba(214,203,174,.24)";ctx.fill();
      ctx.fillStyle="rgba(38,48,53,.46)";
      ctx.beginPath();ctx.moveTo(sx-80*sc,sy);ctx.lineTo(sx+120*sc,sy);ctx.lineTo(sx+80*sc,sy+40*sc);ctx.lineTo(sx-60*sc,sy+40*sc);ctx.closePath();ctx.fill();
    }

    // 港の倉庫群
    const warehouses=[
      {x:220,y:1370,w:540,h:520,roof:"tile"},
      {x:1000,y:1290,w:510,h:600,roof:"flat"},
      {x:1740,y:1390,w:460,h:500,roof:"tile"},
      {x:2260,y:1260,w:550,h:630,roof:"flat"},
      {x:3000,y:1330,w:480,h:560,roof:"tile"},
      {x:3550,y:1230,w:590,h:660,roof:"flat"}
    ];
    for(const b of warehouses){
      const bx=b.x-camera.x,by=b.y-camera.y;
      ctx.fillStyle=b.roof==="flat"?"#b9ae98":"#c9bca1";
      ctx.fillRect(bx,by,b.w,b.h);

      // 石・煉瓦の目地
      ctx.strokeStyle="rgba(91,72,57,.16)";ctx.lineWidth=2;
      for(let yy=by+45;yy<by+b.h;yy+=48){
        ctx.beginPath();ctx.moveTo(bx,yy);ctx.lineTo(bx+b.w,yy);ctx.stroke();
      }

      // 木枠の大窓
      for(let wx=bx+70;wx<bx+b.w-70;wx+=150){
        for(let wy=by+90;wy<Math.min(by+360,by+b.h-100);wy+=145){
          ctx.fillStyle="#526775";ctx.fillRect(wx,wy,72,82);
          ctx.strokeStyle="#563d31";ctx.lineWidth=6;ctx.strokeRect(wx,wy,72,82);
          ctx.lineWidth=3;
          ctx.beginPath();ctx.moveTo(wx+36,wy);ctx.lineTo(wx+36,wy+82);
          ctx.moveTo(wx,wy+41);ctx.lineTo(wx+72,wy+41);ctx.stroke();
        }
      }

      if(b.roof==="tile"){
        ctx.fillStyle="#465257";
        ctx.beginPath();ctx.moveTo(bx-24,by+8);ctx.lineTo(bx+45,by-38);
        ctx.lineTo(bx+b.w-45,by-38);ctx.lineTo(bx+b.w+24,by+8);ctx.closePath();ctx.fill();
      }else{
        ctx.fillStyle="#59473c";ctx.fillRect(bx-8,by-16,b.w+16,22);
      }
    }

    // 港の看板
    const signs=[[560,1480,"碼頭"],[1260,1390,"貨棧"],[2430,1370,"海運"],[3710,1340,"倉庫"]];
    ctx.textAlign="center";ctx.font="bold 22px serif";
    for(const [sx0,sy0,label] of signs){
      const sx=sx0-camera.x,sy=sy0-camera.y;
      ctx.fillStyle="#d0b36b";ctx.fillRect(sx-38,sy-20,76,42);
      ctx.fillStyle="#473428";ctx.fillText(label,sx,sy+8);
      ctx.strokeStyle="#5d4433";ctx.lineWidth=3;ctx.strokeRect(sx-38,sy-20,76,42);
    }
    ctx.textAlign="left";

    // 荷箱の山
    for(const [cx0,cy0] of [[330,1800],[820,1815],[2070,1810],[2790,1800],[3380,1810]]){
      const cx=cx0-camera.x,cy=cy0-camera.y;
      for(let row=0;row<2;row++){
        for(let col=0;col<2-row;col++){
          const xx=cx+col*56+row*26,yy=cy-row*48;
          ctx.fillStyle="#806044";ctx.fillRect(xx,yy,50,43);
          ctx.strokeStyle="#4e392d";ctx.lineWidth=3;ctx.strokeRect(xx,yy,50,43);
          ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx+50,yy+43);
          ctx.moveTo(xx+50,yy);ctx.lineTo(xx,yy+43);ctx.stroke();
        }
      }
    }

    // 大型クレーンと綱
    const craneX=3380-camera.x, craneY=1240-camera.y;
    ctx.strokeStyle="#4a3b32";ctx.lineWidth=14;
    ctx.beginPath();ctx.moveTo(craneX,craneY+650);ctx.lineTo(craneX,craneY);ctx.lineTo(craneX+330,craneY+100);ctx.stroke();
    ctx.lineWidth=4;
    ctx.beginPath();ctx.moveTo(craneX+300,craneY+90);ctx.lineTo(craneX+300,craneY+390);ctx.stroke();
    ctx.fillStyle="#6f5440";ctx.fillRect(craneX+270,craneY+390,60,48);

    ctx.restore();
  }

  function drawBackground(){
    if(currentStage===10){drawStage10Background();return;}
    if(currentStage===9){drawStage9Background();return;}
    if(currentStage===8){drawStage8Background();return;}
    if(currentStage===7){drawStage7Background();return;}
    if(currentStage===6){drawStage6Background();return;}
    if(currentStage===5){
      drawStage5Background();
      return;
    }
    if(currentStage===4){
      drawStage4Background();
      return;
    }
    if(currentStage===3){
      drawStage3Background();
      return;
    }
    if(currentStage===2){
      drawStage2Background();
      return;
    }
    const w=innerWidth,h=innerHeight;
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,"#26354a");
    g.addColorStop(1,"#52697d");
    ctx.fillStyle=g;
    ctx.fillRect(0,0,w,h);

    ctx.save();
    ctx.globalAlpha=.18;
    for(let i=0;i<12;i++){
      const x=(i*370-camera.x*.18)% (w+500)-250;
      const y=h-180-(i%4)*85-camera.y*.05;
      ctx.fillStyle="#8ca0b8";
      ctx.beginPath();
      ctx.moveTo(x,y+180);
      ctx.lineTo(x+120,y);
      ctx.lineTo(x+250,y+180);
      ctx.fill();
    }
    ctx.restore();

    // STAGE 1：古い中国の武術映画を思わせる架空の街。
    ctx.save();

    // 遠景の山並み
    ctx.globalAlpha=.28;
    ctx.fillStyle="#64736c";
    ctx.beginPath();
    ctx.moveTo(-100-camera.x*.10,1320-camera.y*.08);
    const mountains=[[120,1110],[310,1280],[520,1040],[760,1290],[1010,1080],[1290,1280],[1580,1010],[1870,1290],[2190,1090],[2520,1280],[2860,1030],[3210,1290],[3560,1080],[3920,1300],[4300,1110]];
    for(const [mx,my] of mountains) ctx.lineTo(mx-camera.x*.10,my-camera.y*.08);
    ctx.lineTo(4400-camera.x*.10,1510-camera.y*.08);
    ctx.lineTo(-100-camera.x*.10,1510-camera.y*.08);
    ctx.closePath();ctx.fill();
    ctx.globalAlpha=1;

    // 白壁・木組み・格子窓の家
    const houses=[
      {x:180,y:1390,w:430,h:500,n:2},{x:650,y:1320,w:500,h:570,n:2},
      {x:1190,y:1260,w:430,h:630,n:3},{x:1690,y:1380,w:460,h:510,n:2},
      {x:2200,y:1310,w:520,h:580,n:2},{x:2770,y:1240,w:470,h:650,n:3},
      {x:3290,y:1350,w:410,h:540,n:2},{x:3740,y:1280,w:430,h:610,n:2}
    ];
    for(const b of houses){
      const bx=b.x-camera.x,by=b.y-camera.y;
      ctx.fillStyle="#d9d0b8";ctx.fillRect(bx,by,b.w,b.h);
      ctx.fillStyle="#563a2d";
      ctx.fillRect(bx+18,by,16,b.h);ctx.fillRect(bx+b.w-34,by,16,b.h);
      for(let yy=by+115;yy<by+b.h;yy+=150)ctx.fillRect(bx+15,yy,b.w-30,12);

      for(let floor=0;floor<b.n;floor++){
        const wy=by+82+floor*145;
        for(let wx=bx+70;wx<bx+b.w-80;wx+=135){
          ctx.fillStyle="#718b81";ctx.fillRect(wx,wy,58,65);
          ctx.strokeStyle="#4b352b";ctx.lineWidth=5;ctx.strokeRect(wx,wy,58,65);
          ctx.lineWidth=3;ctx.beginPath();
          ctx.moveTo(wx+19,wy);ctx.lineTo(wx+19,wy+65);
          ctx.moveTo(wx+39,wy);ctx.lineTo(wx+39,wy+65);
          ctx.moveTo(wx,wy+32);ctx.lineTo(wx+58,wy+32);ctx.stroke();
        }
      }

      // 反り瓦屋根
      ctx.fillStyle="#394b48";ctx.beginPath();
      ctx.moveTo(bx-28,by+10);
      ctx.quadraticCurveTo(bx+18,by-15,bx+55,by-42);
      ctx.lineTo(bx+b.w-55,by-42);
      ctx.quadraticCurveTo(bx+b.w-18,by-15,bx+b.w+28,by+10);
      ctx.quadraticCurveTo(bx+b.w*.78,by-2,bx+b.w*.5,by+2);
      ctx.quadraticCurveTo(bx+b.w*.22,by-2,bx-28,by+10);ctx.fill();
      ctx.strokeStyle="rgba(220,224,205,.25)";ctx.lineWidth=3;
      for(let tx=bx+20;tx<bx+b.w;tx+=42){
        ctx.beginPath();ctx.moveTo(tx,by-34);ctx.lineTo(tx-12,by+3);ctx.stroke();
      }
    }

    // 赤提灯
    const lanterns=[[520,1440],[585,1440],[1080,1370],[1160,1370],[2050,1440],[2120,1440],[3160,1350],[3235,1350]];
    for(const [lx0,ly0] of lanterns){
      const lx=lx0-camera.x,ly=ly0-camera.y;
      ctx.strokeStyle="#4b352b";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(lx,ly-35);ctx.lineTo(lx,ly);ctx.stroke();
      ctx.fillStyle="#b73b31";ctx.beginPath();ctx.ellipse(lx,ly+18,14,21,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#e1b74c";ctx.fillRect(lx-10,ly-5,20,4);ctx.fillRect(lx-10,ly+39,20,4);
    }

    // 布看板
    const signs=[[780,1450,"茶"],[1440,1390,"武"],[2390,1410,"酒"],[3440,1430,"藥"]];
    ctx.textAlign="center";ctx.font="bold 24px serif";
    for(const [sx0,sy0,ch] of signs){
      const sx=sx0-camera.x,sy=sy0-camera.y;
      ctx.fillStyle="#c7aa67";ctx.fillRect(sx-20,sy,40,82);
      ctx.fillStyle="#4a3028";ctx.fillText(ch,sx,sy+35);
      ctx.strokeStyle="#4a3028";ctx.lineWidth=2;ctx.strokeRect(sx-20,sy,40,82);
    }
    ctx.textAlign="left";

    // 竹竿
    for(const px0 of [930,1860,2620,3500]){
      const px=px0-camera.x;
      ctx.strokeStyle="#71854d";ctx.lineWidth=8;
      ctx.beginPath();ctx.moveTo(px,1860-camera.y);ctx.lineTo(px,1390-camera.y);ctx.stroke();
      ctx.lineWidth=3;
      for(let yy=1810;yy>1410;yy-=70){ctx.beginPath();ctx.moveTo(px-5,yy-camera.y);ctx.lineTo(px+5,yy-camera.y);ctx.stroke();}
    }

    // 屋台
    for(const [sx0,sy0] of [[350,1710],[1830,1710],[3030,1710]]){
      const sx=sx0-camera.x,sy=sy0-camera.y;
      ctx.fillStyle="#634334";ctx.fillRect(sx,sy,150,16);ctx.fillRect(sx+12,sy+16,9,145);ctx.fillRect(sx+128,sy+16,9,145);
      ctx.fillStyle="#a94235";ctx.beginPath();ctx.moveTo(sx-12,sy);ctx.lineTo(sx+18,sy-55);ctx.lineTo(sx+135,sy-55);ctx.lineTo(sx+162,sy);ctx.closePath();ctx.fill();
    }

    // ボス前の武館門
    const gateX=3580-camera.x,gateY=1410-camera.y;
    ctx.fillStyle="#632f2b";ctx.fillRect(gateX,gateY,34,480);ctx.fillRect(gateX+430,gateY,34,480);ctx.fillRect(gateX-18,gateY,500,32);
    ctx.fillStyle="#354946";ctx.beginPath();
    ctx.moveTo(gateX-55,gateY+2);ctx.quadraticCurveTo(gateX+55,gateY-60,gateX+230,gateY-48);
    ctx.quadraticCurveTo(gateX+405,gateY-60,gateX+520,gateY+2);
    ctx.lineTo(gateX+470,gateY+22);ctx.lineTo(gateX-10,gateY+22);ctx.closePath();ctx.fill();
    ctx.fillStyle="#d0a64d";ctx.fillRect(gateX+174,gateY+42,150,54);
    ctx.fillStyle="#3f2b25";ctx.font="bold 26px serif";ctx.textAlign="center";ctx.fillText("武館",gateX+249,gateY+78);ctx.textAlign="left";

    ctx.restore();
  }

  function drawPlatform(p){
    const x=p.x-camera.x, y=p.y-camera.y;

    if(currentStage===10){
      if(p.climbThrough){
        const cx=x+p.w/2;ctx.save();ctx.strokeStyle="#48535f";ctx.lineWidth=10;
        ctx.beginPath();ctx.moveTo(cx-15,y);ctx.lineTo(cx-15,y+p.h);ctx.moveTo(cx+15,y);ctx.lineTo(cx+15,y+p.h);ctx.stroke();
        ctx.lineWidth=4;for(let yy=y+24;yy<y+p.h;yy+=31){ctx.beginPath();ctx.moveTo(cx-15,yy);ctx.lineTo(cx+15,yy);ctx.stroke();}
        ctx.restore();return;
      }
      if(p.oneWay){ctx.fillStyle="#343d48";ctx.fillRect(x,y,p.w,p.h);ctx.fillStyle="#84929c";ctx.fillRect(x,y,p.w,8);return;}
      ctx.fillStyle="#303741";roundedRect(x,y,p.w,p.h,3);ctx.fill();ctx.fillStyle="#66737d";ctx.fillRect(x,y,p.w,10);return;
    }
    if(currentStage===9){
      if(p.climbThrough){
        const cx=x+p.w/2;ctx.save();ctx.strokeStyle="#657279";ctx.lineWidth=9;
        ctx.beginPath();ctx.moveTo(cx-14,y);ctx.lineTo(cx-14,y+p.h);ctx.moveTo(cx+14,y);ctx.lineTo(cx+14,y+p.h);ctx.stroke();
        ctx.lineWidth=4;for(let yy=y+24;yy<y+p.h;yy+=32){ctx.beginPath();ctx.moveTo(cx-14,yy);ctx.lineTo(cx+14,yy);ctx.stroke();}
        ctx.restore();return;
      }
      if(p.oneWay){ctx.fillStyle="#414b50";ctx.fillRect(x,y,p.w,p.h);ctx.fillStyle="#a38d48";ctx.fillRect(x,y,p.w,8);return;}
      ctx.fillStyle="#3a4144";roundedRect(x,y,p.w,p.h,4);ctx.fill();ctx.fillStyle="#697277";ctx.fillRect(x,y,p.w,12);return;
    }
    if(currentStage===8){
      if(p.climbThrough){
        // 非常階段の縦梯子／排水管
        const cx=x+p.w/2;ctx.save();ctx.strokeStyle="#46515e";ctx.lineWidth=8;
        ctx.beginPath();ctx.moveTo(cx-13,y);ctx.lineTo(cx-13,y+p.h);ctx.moveTo(cx+13,y);ctx.lineTo(cx+13,y+p.h);ctx.stroke();
        ctx.lineWidth=4;for(let yy=y+25;yy<y+p.h;yy+=34){ctx.beginPath();ctx.moveTo(cx-13,yy);ctx.lineTo(cx+13,yy);ctx.stroke();}
        ctx.restore();return;
      }
      if(p.oneWay){ctx.fillStyle="#3d4652";ctx.fillRect(x,y,p.w,p.h);ctx.fillStyle="#87909a";ctx.fillRect(x,y,p.w,8);return;}
      ctx.fillStyle="#353a43";roundedRect(x,y,p.w,p.h,4);ctx.fill();ctx.fillStyle="#707985";ctx.fillRect(x,y,p.w,12);return;
    }
    if(currentStage===7){
      if(p.climbThrough){
        // 山寺では松・木柱を掴んで登れる。
        const cx=x+p.w/2;ctx.save();ctx.strokeStyle="#5b4634";ctx.lineWidth=19;ctx.lineCap="round";
        ctx.beginPath();ctx.moveTo(cx,y);ctx.lineTo(cx,y+p.h);ctx.stroke();
        ctx.strokeStyle="#7c684e";ctx.lineWidth=3;
        for(let yy=y+45;yy<y+p.h;yy+=58){ctx.beginPath();ctx.moveTo(cx-10,yy);ctx.lineTo(cx+10,yy);ctx.stroke();}
        ctx.restore();return;
      }
      if(p.oneWay){ctx.fillStyle="#5c4a3a";ctx.fillRect(x,y,p.w,p.h);ctx.fillStyle="#303f3d";ctx.fillRect(x,y,p.w,9);return;}
      ctx.fillStyle="#77736a";roundedRect(x,y,p.w,p.h,4);ctx.fill();ctx.fillStyle="#a59a82";ctx.fillRect(x,y,p.w,12);return;
    }
    if(currentStage===6){
      if(p.climbThrough){
        const cx=x+p.w/2;ctx.save();ctx.strokeStyle="#35444b";ctx.lineWidth=17;ctx.lineCap="square";
        ctx.beginPath();ctx.moveTo(cx,y);ctx.lineTo(cx,y+p.h);ctx.stroke();ctx.strokeStyle="#849097";ctx.lineWidth=3;
        for(let yy=y+38;yy<y+p.h;yy+=50){ctx.beginPath();ctx.moveTo(cx-12,yy);ctx.lineTo(cx+12,yy);ctx.stroke();}
        ctx.restore();return;
      }
      if(p.oneWay){ctx.fillStyle="#46535a";ctx.fillRect(x,y,p.w,p.h);ctx.fillStyle="#8a775f";ctx.fillRect(x,y,p.w,8);return;}
      ctx.fillStyle="#444b4e";roundedRect(x,y,p.w,p.h,4);ctx.fill();ctx.fillStyle="#77716a";ctx.fillRect(x,y,p.w,12);return;
    }
    if(currentStage===5){
      if(p.climbThrough){
        const cx=x+p.w/2;ctx.save();ctx.strokeStyle="#343b44";ctx.lineWidth=16;ctx.lineCap="round";
        ctx.beginPath();ctx.moveTo(cx,y+3);ctx.lineTo(cx,y+p.h);ctx.stroke();
        ctx.strokeStyle="#7b8388";ctx.lineWidth=3;
        for(let yy=y+38;yy<y+p.h;yy+=48){ctx.beginPath();ctx.moveTo(cx-12,yy);ctx.lineTo(cx+12,yy);ctx.stroke();}
        ctx.restore();return;
      }
      if(p.oneWay){
        ctx.fillStyle="#363d46";ctx.fillRect(x,y,p.w,p.h);ctx.fillStyle="#8c755f";ctx.fillRect(x,y,p.w,8);
        ctx.strokeStyle="#20262c";ctx.lineWidth=3;
        for(let xx=x+30;xx<x+p.w;xx+=42){ctx.beginPath();ctx.moveTo(xx,y+8);ctx.lineTo(xx,y+p.h);ctx.stroke();}
        return;
      }
      ctx.fillStyle="#3d4147";roundedRect(x,y,p.w,p.h,4);ctx.fill();ctx.fillStyle="#6e6762";ctx.fillRect(x,y,p.w,12);return;
    }

    if(currentStage===4){
      if(p.climbThrough){
        // 工場街では鉄骨柱。掴んで登れる。
        const cx=x+p.w/2;
        ctx.save();
        ctx.strokeStyle="#3d454a";ctx.lineWidth=18;ctx.lineCap="square";
        ctx.beginPath();ctx.moveTo(cx,y);ctx.lineTo(cx,y+p.h);ctx.stroke();
        ctx.strokeStyle="#72787a";ctx.lineWidth=3;
        for(let yy=y+35;yy<y+p.h;yy+=52){
          ctx.beginPath();ctx.moveTo(cx-12,yy);ctx.lineTo(cx+12,yy);ctx.stroke();
        }
        ctx.restore();
        return;
      }
      if(p.oneWay){
        ctx.fillStyle="#41494e";ctx.fillRect(x,y,p.w,p.h);
        ctx.fillStyle="#858078";ctx.fillRect(x,y,p.w,8);
        ctx.strokeStyle="#23292d";ctx.lineWidth=4;
        for(let xx=x+30;xx<x+p.w;xx+=42){
          ctx.beginPath();ctx.moveTo(xx,y+8);ctx.lineTo(xx,y+p.h);ctx.stroke();
        }
        return;
      }
      ctx.fillStyle="#45484a";roundedRect(x,y,p.w,p.h,4);ctx.fill();
      ctx.fillStyle="#77716a";ctx.fillRect(x,y,p.w,12);
      return;
    }

    if(currentStage===3){
      if(p.climbThrough){
        // 新市街では雨樋／非常階段の縦パイプとして登れる。
        const cx=x+p.w/2;
        ctx.save();
        ctx.strokeStyle="#4c5157";ctx.lineWidth=15;ctx.lineCap="round";
        ctx.beginPath();ctx.moveTo(cx,y+3);ctx.lineTo(cx,y+p.h);ctx.stroke();
        ctx.strokeStyle="#92979b";ctx.lineWidth=3;
        for(let yy=y+45;yy<y+p.h;yy+=66){
          ctx.beginPath();ctx.moveTo(cx-10,yy);ctx.lineTo(cx+10,yy);ctx.stroke();
        }
        ctx.restore();
        return;
      }
      if(p.oneWay){
        // 庇・バルコニー・非常階段の床
        ctx.fillStyle="#43494f";ctx.fillRect(x,y,p.w,p.h);
        ctx.fillStyle="#9b876e";ctx.fillRect(x,y,p.w,8);
        ctx.strokeStyle="#252a2e";ctx.lineWidth=3;
        for(let xx=x+30;xx<x+p.w;xx+=44){
          ctx.beginPath();ctx.moveTo(xx,y+8);ctx.lineTo(xx,y+p.h);ctx.stroke();
        }
        return;
      }
      // 石畳／街路
      ctx.fillStyle="#4b4f54";roundedRect(x,y,p.w,p.h,5);ctx.fill();
      ctx.fillStyle="#77716a";ctx.fillRect(x,y,p.w,12);
      ctx.strokeStyle="rgba(255,255,255,.07)";ctx.lineWidth=2;
      for(let xx=x+80;xx<x+p.w;xx+=100){
        ctx.beginPath();ctx.moveTo(xx,y);ctx.lineTo(xx,y+30);ctx.stroke();
      }
      return;
    }

    if(currentStage===2){
      if(p.climbThrough){
        // 港では竹ではなく、船のマスト／係留柱として登れる。
        const cx=x+p.w/2;
        ctx.save();
        ctx.strokeStyle="#604837";ctx.lineWidth=17;ctx.lineCap="round";
        ctx.beginPath();ctx.moveTo(cx,y+3);ctx.lineTo(cx,y+p.h);ctx.stroke();
        ctx.strokeStyle="#b59a6e";ctx.lineWidth=3;
        for(let yy=y+50;yy<y+p.h;yy+=74){
          ctx.beginPath();ctx.moveTo(cx-11,yy);ctx.lineTo(cx+11,yy);ctx.stroke();
        }
        ctx.strokeStyle="rgba(214,203,174,.7)";ctx.lineWidth=3;
        ctx.beginPath();ctx.moveTo(cx,y+85);ctx.lineTo(cx+52,y+180);ctx.stroke();
        ctx.restore();
        return;
      }
      if(p.oneWay){
        ctx.fillStyle="#76583f";ctx.fillRect(x,y,p.w,p.h);
        ctx.fillStyle="#9a7957";ctx.fillRect(x,y,p.w,9);
        ctx.strokeStyle="#4d382d";ctx.lineWidth=3;
        for(let xx=x+38;xx<x+p.w;xx+=52){
          ctx.beginPath();ctx.moveTo(xx,y);ctx.lineTo(xx,y+p.h);ctx.stroke();
        }
        return;
      }
      ctx.fillStyle="#4f4a43";roundedRect(x,y,p.w,p.h,5);ctx.fill();
      ctx.fillStyle="#86775f";ctx.fillRect(x,y,p.w,13);
      return;
    }    if(p.climbThrough){
      // STAGE 1では電柱ではなく、登れる太い竹竿として描画
      const cx=x+p.w/2;
      ctx.save();
      ctx.strokeStyle="#617b45";
      ctx.lineWidth=Math.max(12,Math.min(20,p.w*.34));
      ctx.lineCap="round";
      ctx.beginPath();
      ctx.moveTo(cx,y+4);
      ctx.lineTo(cx,y+p.h-2);
      ctx.stroke();

      // 竹の節
      ctx.strokeStyle="#91a866";
      ctx.lineWidth=3;
      for(let yy=y+34;yy<y+p.h;yy+=58){
        ctx.beginPath();
        ctx.moveTo(cx-10,yy);
        ctx.lineTo(cx+10,yy);
        ctx.stroke();
      }

      // 小枝と葉を少しだけ付け、電柱シルエットを消す
      ctx.strokeStyle="#617b45";
      ctx.lineWidth=4;
      for(let yy=y+70,n=0;yy<y+p.h-50;yy+=118,n++){
        const side=n%2===0?1:-1;
        ctx.beginPath();
        ctx.moveTo(cx,yy);
        ctx.lineTo(cx+side*25,yy-22);
        ctx.stroke();
        ctx.fillStyle="#789653";
        ctx.beginPath();
        ctx.ellipse(cx+side*31,yy-27,13,5,side*.35,0,Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    ctx.fillStyle="#354751";
    roundedRect(x,y,p.w,p.h,8); ctx.fill();
    ctx.fillStyle="#7f96a3";
    ctx.fillRect(x,y,p.w,10);
    ctx.strokeStyle="rgba(255,255,255,.08)";
    ctx.lineWidth=2;
    for(let yy=y+36;yy<y+p.h;yy+=36){
      ctx.beginPath(); ctx.moveTo(x,yy); ctx.lineTo(x+p.w,yy); ctx.stroke();
    }
  }

  function drawThrower(e){
    if(!e.alive) return;
    const x=e.x-camera.x,y=e.y-camera.y;
    ctx.save();
    ctx.translate(x+e.w/2,y+e.h/2);
    ctx.scale(e.facing*1.12,1.12);
    if(e.flash>0) ctx.globalAlpha=.45;

    // 横向きの猫科風の投擲敵
    ctx.strokeStyle="#35313b"; ctx.lineWidth=10; ctx.lineCap="round";
    ctx.beginPath();ctx.moveTo(-10,23);ctx.lineTo(-14,38);ctx.stroke();
    ctx.beginPath();ctx.moveTo(10,23);ctx.lineTo(15,38);ctx.stroke();
    ctx.fillStyle="#5c465f"; roundedRect(-21,-3,42,34,9);ctx.fill();

    ctx.fillStyle="#9c7655";
    ctx.beginPath();ctx.ellipse(1,-25,23,21,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(-13,-39);ctx.lineTo(-5,-53);ctx.lineTo(1,-39);ctx.fill();
    ctx.beginPath();ctx.moveTo(9,-39);ctx.lineTo(17,-51);ctx.lineTo(20,-35);ctx.fill();
    ctx.beginPath();ctx.ellipse(19,-20,12,8,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#171719";ctx.beginPath();ctx.arc(11,-28,3,0,Math.PI*2);ctx.fill();

    // 手元の投擲物
    if(currentStage===5){
      ctx.fillStyle="#8a969e";roundedRect(17,-2,13,27,4);ctx.fill();
      ctx.fillStyle="#4d575e";ctx.fillRect(17,2,13,4);ctx.fillRect(17,18,13,4);
    }else if(currentStage===4){
      ctx.fillStyle="#8b9296";ctx.fillRect(18,-2,9,29);
      ctx.fillStyle="#555d62";
      ctx.beginPath();ctx.arc(22,-5,8,0,Math.PI*2);ctx.fill();
    }else if(currentStage===3){
      ctx.fillStyle="#55756f";roundedRect(16,0,12,27,4);ctx.fill();
      ctx.fillRect(19,-6,6,8);
      ctx.fillStyle="#c7b07c";ctx.fillRect(17,-8,10,3);
    }else{
      ctx.fillStyle=currentStage===2?"#8a6547":"#a95f3e";
      ctx.beginPath();
      ctx.moveTo(20,-2);ctx.quadraticCurveTo(36,2,33,20);
      ctx.quadraticCurveTo(30,30,18,27);ctx.quadraticCurveTo(8,25,10,13);
      ctx.quadraticCurveTo(11,3,20,-2);ctx.fill();
      ctx.fillStyle="#6f392a";ctx.fillRect(14,-4,14,5);
    }

    // HPは本体が見えてから頭上近く
    ctx.setTransform(1,0,0,1,0,0);
    if(x+e.w>0 && x<innerWidth && y+e.h>0 && y<innerHeight){
      ctx.fillStyle="rgba(0,0,0,.35)";ctx.fillRect(x+7,y-7,e.w-14,5);
      ctx.fillStyle="#f85";ctx.fillRect(x+7,y-7,(e.w-14)*Math.max(0,e.hp/3),5);
    }
    ctx.restore();
  }

  function drawPot(q){
    const x=q.x-camera.x,y=q.y-camera.y;
    ctx.save();
    ctx.translate(x+q.w/2,y+q.h/2);
    if(q.bullet){
      ctx.strokeStyle="#fff2b0";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-22*(q.vx<0?-1:1),0);ctx.lineTo(8*(q.vx<0?-1:1),0);ctx.stroke();
      ctx.fillStyle="#fff8d2";ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.fill();ctx.restore();return;
    }
    ctx.rotate(q.spin);
    if(currentStage===5){
      ctx.fillStyle="#88939b";roundedRect(-8,-13,16,26,4);ctx.fill();
      ctx.fillStyle="#4f5960";ctx.fillRect(-8,-10,16,4);ctx.fillRect(-8,7,16,4);
      ctx.strokeStyle="rgba(230,235,238,.55)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-3,-7);ctx.lineTo(-3,6);ctx.stroke();
    }else if(currentStage===4){
      // 工場街では金属ボルトを投げる。
      ctx.fillStyle="#899095";
      ctx.fillRect(-5,-13,10,26);
      ctx.fillStyle="#555d62";
      ctx.beginPath();
      for(let i=0;i<6;i++){
        const a=i*Math.PI/3;
        const xx=Math.cos(a)*10,yy=Math.sin(a)*10;
        if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);
      }
      ctx.closePath();ctx.fill();
    }else if(currentStage===3){
      // 新市街の高所敵は空き瓶を投げる。
      ctx.fillStyle="#55756f";roundedRect(-7,-10,14,22,5);ctx.fill();
      ctx.fillRect(-4,-15,8,7);
      ctx.fillStyle="#c7b07c";ctx.fillRect(-5,-17,10,3);
      ctx.strokeStyle="rgba(230,245,240,.5)";ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(-3,-7);ctx.lineTo(-3,7);ctx.stroke();
    }else if(currentStage===2){
      // 港の投擲敵は小樽を投げる。
      ctx.fillStyle="#8a6547";roundedRect(-12,-13,24,26,6);ctx.fill();
      ctx.strokeStyle="#4e382d";ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(-11,-7);ctx.lineTo(11,-7);
      ctx.moveTo(-11,7);ctx.lineTo(11,7);ctx.stroke();
      ctx.fillStyle="#5a4435";ctx.fillRect(-12,-2,24,4);
    }else{
      ctx.fillStyle="#b96a43";
      ctx.beginPath();
      ctx.moveTo(-8,-11);ctx.quadraticCurveTo(-15,-2,-11,9);
      ctx.quadraticCurveTo(0,17,11,9);ctx.quadraticCurveTo(15,-2,8,-11);
      ctx.closePath();ctx.fill();
      ctx.fillStyle="#713b2b";ctx.fillRect(-8,-14,16,5);
    }
    ctx.restore();
  }

  function drawBoss(e){
    if(!e.alive) return;
    const x=e.x-camera.x,y=e.y-camera.y;
    const ap=e.attackTimer>0 ? 1-e.attackTimer/.72 : 0;
    ctx.save();
    ctx.translate(x+e.w/2,y+e.h/2);
    ctx.scale(e.facing,1);
    if(e.flash>0) ctx.globalAlpha=.48;

    if(currentStage===10){
      // ラスボス：白いスーツの獅子。ピストルは明確な予兆を見せてから発砲。
      ctx.strokeStyle="#25272b";ctx.lineWidth=18;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(-23,35);ctx.lineTo(-30,59);ctx.stroke();ctx.beginPath();ctx.moveTo(23,35);ctx.lineTo(30,59);ctx.stroke();
      ctx.fillStyle="#dedbd2";roundedRect(-41,-6,82,61,10);ctx.fill();
      ctx.fillStyle="#f1eee5";ctx.beginPath();ctx.moveTo(-25,-3);ctx.lineTo(0,30);ctx.lineTo(27,-3);ctx.closePath();ctx.fill();
      ctx.fillStyle="#282b31";ctx.beginPath();ctx.moveTo(-4,1);ctx.lineTo(5,1);ctx.lineTo(7,27);ctx.lineTo(0,33);ctx.lineTo(-7,27);ctx.closePath();ctx.fill();
      // 獅子のたてがみ
      ctx.fillStyle="#8a633f";ctx.beginPath();ctx.arc(0,-42,42,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#c99b63";ctx.beginPath();ctx.ellipse(5,-42,30,27,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(27,-31,18,12,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#f0d36e";ctx.beginPath();ctx.arc(15,-47,4,0,Math.PI*2);ctx.fill();

      const t=e.attackTimer>0?Math.max(0,Math.min(1,(.72-e.attackTimer)/.72)):0;
      const aim=e.attackTimer>0?Math.min(1,t/.38):0;
      ctx.strokeStyle="#dedbd2";ctx.lineWidth=14;ctx.beginPath();ctx.moveTo(22,3);ctx.lineTo(39+15*aim,-4-9*aim);ctx.stroke();
      ctx.save();ctx.translate(40+15*aim,-4-9*aim);ctx.rotate(-.05);
      ctx.fillStyle="#292c31";roundedRect(0,-6,42,13,3);ctx.fill();ctx.fillRect(8,5,12,15);
      if(e.weaponMode==="pistol" && e.attackTimer>0 && t>.38 && t<.53){
        ctx.fillStyle="#fff0a0";ctx.beginPath();ctx.moveTo(45,0);ctx.lineTo(67,-12);ctx.lineTo(60,0);ctx.lineTo(68,12);ctx.closePath();ctx.fill();
      }
      ctx.restore();
    }else if(currentStage===9){
      // 狼の副官。防具付きの黒装束＋両手トンファー。
      ctx.strokeStyle="#1d2328";ctx.lineWidth=18;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(-23,35);ctx.lineTo(-30,59);ctx.stroke();ctx.beginPath();ctx.moveTo(23,35);ctx.lineTo(30,59);ctx.stroke();
      ctx.fillStyle="#20272d";roundedRect(-40,-5,80,60,10);ctx.fill();
      ctx.fillStyle="#59646b";ctx.fillRect(-35,8,70,12);ctx.fillRect(-31,30,62,9);
      ctx.fillStyle="#6b7378";ctx.fillRect(-32,-2,18,22);ctx.fillRect(14,-2,18,22);
      ctx.fillStyle="#45484b";ctx.beginPath();ctx.ellipse(2,-41,36,31,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(-25,-59);ctx.lineTo(-17,-79);ctx.lineTo(-5,-61);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.moveTo(18,-60);ctx.lineTo(27,-78);ctx.lineTo(34,-57);ctx.closePath();ctx.fill();
      ctx.fillStyle="#b7a08e";ctx.beginPath();ctx.ellipse(27,-31,18,12,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#d8d16b";ctx.beginPath();ctx.arc(14,-46,4,0,Math.PI*2);ctx.fill();

      const t=e.attackTimer>0?Math.max(0,Math.min(1,(.62-e.attackTimer)/.62)):0;
      const sw=e.attackTimer>0?Math.sin(t*Math.PI):0;
      for(const side of [-1,1]){
        ctx.save();ctx.scale(side,1);ctx.strokeStyle="#343a3e";ctx.lineWidth=14;
        ctx.beginPath();ctx.moveTo(20,4);ctx.lineTo(38+sw*12,15-sw*18);ctx.stroke();
        ctx.translate(39+sw*12,15-sw*18);ctx.rotate(-.25-sw*.7);
        ctx.strokeStyle="#858d91";ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(-14,0);ctx.lineTo(62,0);ctx.stroke();
        ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(5,-18);ctx.lineTo(5,20);ctx.stroke();ctx.restore();
      }
    }else if(currentStage===8){
      // 黒豹の現代用心棒。スーツ＋伸縮警棒。
      ctx.strokeStyle="#20232b";ctx.lineWidth=18;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(-22,35);ctx.lineTo(-28,59);ctx.stroke();ctx.beginPath();ctx.moveTo(22,35);ctx.lineTo(29,59);ctx.stroke();
      ctx.fillStyle="#252936";roundedRect(-39,-5,78,59,10);ctx.fill();
      ctx.fillStyle="#dedede";ctx.beginPath();ctx.moveTo(-8,-3);ctx.lineTo(0,30);ctx.lineTo(9,-3);ctx.closePath();ctx.fill();
      ctx.fillStyle="#7b2530";ctx.beginPath();ctx.moveTo(-4,1);ctx.lineTo(4,1);ctx.lineTo(7,24);ctx.lineTo(0,31);ctx.lineTo(-7,24);ctx.closePath();ctx.fill();
      ctx.fillStyle="#29282d";ctx.beginPath();ctx.ellipse(2,-41,36,31,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(-24,-59);ctx.lineTo(-17,-79);ctx.lineTo(-5,-61);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.moveTo(18,-60);ctx.lineTo(27,-78);ctx.lineTo(34,-57);ctx.closePath();ctx.fill();
      ctx.fillStyle="#b9a18f";ctx.beginPath();ctx.ellipse(26,-31,18,12,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#f0c76a";ctx.beginPath();ctx.arc(14,-46,4,0,Math.PI*2);ctx.fill();

      const t=e.attackTimer>0?Math.max(0,Math.min(1,(.66-e.attackTimer)/.66)):0;
      const swing=e.attackTimer>0?Math.sin(t*Math.PI):0;
      ctx.strokeStyle="#29282d";ctx.lineWidth=14;ctx.beginPath();ctx.moveTo(23,3);ctx.lineTo(41-swing*4,13);ctx.lineTo(50+swing*18,22-swing*20);ctx.stroke();
      ctx.save();ctx.translate(49+swing*18,21-swing*20);ctx.rotate(-.2-swing*.75);
      ctx.strokeStyle="#a8adb4";ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(76,0);ctx.stroke();ctx.restore();
    }else if(currentStage===7){
      // 鹿の槍術師。長槍を腰の高さで構える。
      ctx.strokeStyle="#4c3830";ctx.lineWidth=17;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(-22,35);ctx.lineTo(-28,59);ctx.stroke();ctx.beginPath();ctx.moveTo(22,35);ctx.lineTo(29,59);ctx.stroke();
      ctx.fillStyle="#e3ded0";roundedRect(-38,-4,76,57,11);ctx.fill();ctx.fillStyle="#6c3434";ctx.fillRect(-36,22,72,8);
      ctx.fillStyle="#a77b59";ctx.beginPath();ctx.ellipse(1,-40,35,31,0,0,Math.PI*2);ctx.fill();
      // 鹿角
      ctx.strokeStyle="#654a36";ctx.lineWidth=7;
      ctx.beginPath();ctx.moveTo(-15,-63);ctx.lineTo(-28,-84);ctx.lineTo(-38,-91);ctx.moveTo(-28,-84);ctx.lineTo(-20,-98);ctx.stroke();
      ctx.beginPath();ctx.moveTo(14,-63);ctx.lineTo(26,-84);ctx.lineTo(37,-91);ctx.moveTo(26,-84);ctx.lineTo(19,-98);ctx.stroke();
      ctx.fillStyle="#111";ctx.beginPath();ctx.arc(15,-45,4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#71503e";ctx.beginPath();ctx.ellipse(28,-32,16,11,0,0,Math.PI*2);ctx.fill();

      ctx.strokeStyle="#a77b59";ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(24,2);ctx.lineTo(42,10);ctx.lineTo(50,17);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-20,3);ctx.lineTo(4,11);ctx.lineTo(19,16);ctx.stroke();

      ctx.save();ctx.translate(20,16);
      let angle=-.04,shift=0;
      if(e.attackTimer>0){
        const t=Math.max(0,Math.min(1,ap/.76));
        if(e.weaponMode==="spearSweep"){angle=-.75+1.35*Math.sin(t*Math.PI*.5);shift=12*t;}
        else{angle=-.04;shift=82*Math.sin(t*Math.PI*.5);}
      }
      ctx.rotate(angle);ctx.strokeStyle="#74452a";ctx.lineWidth=8;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(-72+shift,0);ctx.lineTo(112+shift,0);ctx.stroke();
      ctx.fillStyle="#b9bdc0";ctx.beginPath();ctx.moveTo(112+shift,-8);ctx.lineTo(142+shift,0);ctx.lineTo(112+shift,8);ctx.closePath();ctx.fill();
      ctx.restore();
    }else if(currentStage===6){
      // 熊の鎖分銅使い。鎖が大きな円弧を描く。
      const air=e.jumping;
      ctx.strokeStyle="#322d2d";ctx.lineWidth=18;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(-22,35);ctx.lineTo(-28,58-(air?12:0));ctx.stroke();
      ctx.beginPath();ctx.moveTo(22,35);ctx.lineTo(29,58-(air?12:0));ctx.stroke();
      ctx.fillStyle="#4a2c32";roundedRect(-39,-4,78,57,12);ctx.fill();
      ctx.fillStyle="#b9974f";ctx.fillRect(-36,22,72,8);
      ctx.fillStyle="#76594a";ctx.beginPath();ctx.ellipse(1,-40,37,32,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(-20,-63,11,0,Math.PI*2);ctx.arc(21,-63,11,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#b08a70";ctx.beginPath();ctx.ellipse(21,-31,21,14,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#111";ctx.beginPath();ctx.arc(13,-45,4,0,Math.PI*2);ctx.fill();

      ctx.strokeStyle="#76594a";ctx.lineWidth=16;ctx.beginPath();ctx.moveTo(28,3);ctx.lineTo(43,9);ctx.lineTo(51,15);ctx.stroke();

      // 鎖＋分銅
      ctx.save();ctx.translate(48,15);
      let ang=-.15,len=76;
      if(e.attackTimer>0){
        const t=Math.max(0,Math.min(1,ap/.78));ang=-1.15+t*Math.PI*2.15;len=105+35*Math.sin(t*Math.PI);
      }else if(air){ang=.55;len=92;}
      ctx.rotate(ang);ctx.strokeStyle="#b8b0a2";ctx.lineWidth=4;ctx.setLineDash([8,5]);
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(len,0);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle="#55565a";ctx.beginPath();ctx.arc(len+10,0,13,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#b8b0a2";ctx.lineWidth=3;ctx.stroke();ctx.restore();
    }else if(currentStage===5){
      // 鷹の棍術家
      ctx.strokeStyle="#272a2f";ctx.lineWidth=17;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(-22,35);ctx.lineTo(-27,58);ctx.stroke();
      ctx.beginPath();ctx.moveTo(22,35);ctx.lineTo(29,58);ctx.stroke();

      ctx.fillStyle="#252833";roundedRect(-37,-4,74,56,11);ctx.fill();
      ctx.strokeStyle="#b7893f";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(4,-1);ctx.lineTo(5,44);ctx.stroke();
      ctx.fillStyle="#7f2831";ctx.fillRect(-35,22,70,8);

      ctx.fillStyle="#9b7955";ctx.beginPath();ctx.ellipse(1,-40,35,31,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(-21,-58);ctx.lineTo(-8,-78);ctx.lineTo(0,-58);ctx.fill();
      ctx.fillStyle="#d0aa5d";ctx.beginPath();ctx.moveTo(31,-43);ctx.lineTo(51,-34);ctx.lineTo(31,-26);ctx.closePath();ctx.fill();
      ctx.fillStyle="#111";ctx.beginPath();ctx.arc(15,-45,4,0,Math.PI*2);ctx.fill();

      ctx.strokeStyle="#9b7955";ctx.lineWidth=14;
      ctx.beginPath();ctx.moveTo(26,4);ctx.lineTo(42,10);ctx.lineTo(50,18);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-20,4);ctx.lineTo(4,12);ctx.lineTo(18,17);ctx.stroke();

      ctx.save();ctx.translate(22,14);
      let staffAngle=-.12,staffShift=0;
      if(e.attackTimer>0){
        const swing=Math.sin(Math.min(1,ap/.72)*Math.PI*.5);
        if(e.weaponMode==="sweep"){staffAngle=-.95+1.45*swing;staffShift=10*swing;}
        else{staffAngle=-.08;staffShift=58*swing;}
      }
      ctx.rotate(staffAngle);
      ctx.strokeStyle="#7b4d2b";ctx.lineWidth=9;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(-58+staffShift,0);ctx.lineTo(92+staffShift,0);ctx.stroke();
      ctx.strokeStyle="#d5b45f";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(80+staffShift,0);ctx.lineTo(96+staffShift,0);ctx.stroke();
      ctx.restore();

    }else if(currentStage===4){
      // 第四幕ボス：大型ゴリラの工場監督。ジャンプ攻撃を使う重量級。
      const airborne=e.jumping;
      const tuck=airborne?10:0;

      ctx.strokeStyle="#2d2d2f";ctx.lineWidth=19;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(-23,34-tuck);ctx.lineTo(-29,58-tuck*1.4);ctx.stroke();
      ctx.beginPath();ctx.moveTo(23,34-tuck);ctx.lineTo(30,58-tuck*1.4);ctx.stroke();

      // 作業服
      ctx.fillStyle="#3c594d";roundedRect(-39,-5,78,58,12);ctx.fill();
      ctx.fillStyle="#c59036";ctx.fillRect(-36,22,72,8);
      ctx.fillStyle="#c6b273";ctx.fillRect(-9,-2,18,46);

      // ゴリラ顔
      ctx.fillStyle="#4b4544";
      ctx.beginPath();ctx.ellipse(1,-40,37,32,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#75645b";
      ctx.beginPath();ctx.ellipse(20,-31,22,15,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#111";
      ctx.beginPath();ctx.arc(13,-45,4,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(25,-35,3,0,Math.PI*2);ctx.fill();

      // 太い前腕。通常時は拳を胸前に置く。攻撃は水平ストレート。
      ctx.strokeStyle="#4b4544";ctx.lineWidth=20;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(31,3);
      if(airborne){
        ctx.lineTo(51,-3);ctx.lineTo(76,12);
      }else if(e.attackTimer>0){
        const punch=Math.sin(Math.min(1,ap/.72)*Math.PI*.5);
        const elbowX=43+18*punch;
        const elbowY=8-3*punch;
        const fistX=48+38*punch;
        const fistY=11-5*punch;
        ctx.lineTo(elbowX,elbowY);ctx.lineTo(fistX,fistY);
      }else{
        ctx.lineTo(43,10);ctx.lineTo(50,17);
      }
      ctx.stroke();

      // ジャンプ中は膝を畳んで分かりやすく。
      if(airborne){
        ctx.strokeStyle="#2d2d2f";ctx.lineWidth=14;
        ctx.beginPath();ctx.moveTo(-18,34);ctx.lineTo(-5,43);ctx.lineTo(8,35);ctx.stroke();
      }

    }else if(currentStage===3){
      // 第三幕ボス：白狼の大ホテル警備長。スーツ姿だが拳法使い。
      ctx.strokeStyle="#252a31";ctx.lineWidth=17;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(-22,35);ctx.lineTo(-28,58);ctx.stroke();
      ctx.beginPath();ctx.moveTo(21,35);ctx.lineTo(29,58);ctx.stroke();

      ctx.fillStyle="#202936";roundedRect(-36,-4,72,55,11);ctx.fill();
      // 白シャツとネクタイ
      ctx.fillStyle="#ded8c9";
      ctx.beginPath();ctx.moveTo(-13,-4);ctx.lineTo(0,14);ctx.lineTo(13,-4);ctx.closePath();ctx.fill();
      ctx.fillStyle="#8e2631";
      ctx.beginPath();ctx.moveTo(-4,2);ctx.lineTo(4,2);ctx.lineTo(7,28);ctx.lineTo(0,36);ctx.lineTo(-7,28);ctx.closePath();ctx.fill();

      // 白狼の横顔
      ctx.fillStyle="#c8c6bf";
      ctx.beginPath();ctx.ellipse(2,-40,35,31,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(-23,-59);ctx.lineTo(-9,-82);ctx.lineTo(-1,-58);ctx.fill();
      ctx.beginPath();ctx.moveTo(12,-59);ctx.lineTo(29,-80);ctx.lineTo(30,-51);ctx.fill();
      ctx.beginPath();ctx.ellipse(25,-34,17,11,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#33373b";
      ctx.beginPath();ctx.moveTo(36,-39);ctx.lineTo(45,-34);ctx.lineTo(36,-29);ctx.closePath();ctx.fill();
      ctx.fillStyle="#111";ctx.beginPath();ctx.arc(16,-44,4,0,Math.PI*2);ctx.fill();

      // 攻撃腕：胸前のガードから、顔の高さへ真っ直ぐ伸ばす。
      ctx.strokeStyle="#c8c6bf";ctx.lineWidth=16;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(29,4);
      if(e.attackTimer>0){
        const punch=Math.sin(Math.min(1,ap/.72)*Math.PI*.5);
        ctx.lineTo(43+17*punch,7-5*punch);
        ctx.lineTo(48+34*punch,11-9*punch);
      }else{
        ctx.lineTo(42,8);ctx.lineTo(48,17);
      }
      ctx.stroke();

    }else if(currentStage===2){
      // 第二幕ボス：黒豹の港湾用心棒。洋装ベスト＋武術家の構え。
      ctx.strokeStyle="#25262a";ctx.lineWidth=16;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(-20,35);ctx.lineTo(-24,56);ctx.stroke();
      ctx.beginPath();ctx.moveTo(20,35);ctx.lineTo(27,56);ctx.stroke();

      ctx.fillStyle="#263746";roundedRect(-34,-3,68,52,12);ctx.fill();
      ctx.fillStyle="#8b2630";ctx.fillRect(-7,-3,14,50);
      ctx.strokeStyle="#c0a568";ctx.lineWidth=3;ctx.strokeRect(-30,2,60,42);

      ctx.fillStyle="#343235";
      ctx.beginPath();ctx.ellipse(2,-39,34,31,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(-22,-60);ctx.lineTo(-9,-78);ctx.lineTo(-2,-58);ctx.fill();
      ctx.beginPath();ctx.moveTo(13,-59);ctx.lineTo(28,-76);ctx.lineTo(29,-51);ctx.fill();

      ctx.fillStyle="#d6c7ae";ctx.beginPath();ctx.ellipse(23,-33,15,11,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#111";ctx.beginPath();ctx.arc(16,-43,4,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(33,-38);ctx.lineTo(41,-34);ctx.lineTo(33,-30);ctx.closePath();ctx.fill();

      ctx.strokeStyle="#343235";ctx.lineWidth=15;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(27,4);
      if(e.attackTimer>0){
        const punch=Math.sin(Math.min(1,ap/.72)*Math.PI*.5);
        ctx.lineTo(41+17*punch,7-4*punch);
        ctx.lineTo(47+33*punch,12-8*punch);
      }else{
        ctx.lineTo(40,9);ctx.lineTo(47,18);
      }
      ctx.stroke();
    }else{
      // 第一幕ボス：大柄な虎の武術家
      ctx.strokeStyle="#392d2b";ctx.lineWidth=16;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(-20,35);ctx.lineTo(-24,56);ctx.stroke();
      ctx.beginPath();ctx.moveTo(20,35);ctx.lineTo(27,56);ctx.stroke();

      ctx.fillStyle="#6d1f24";
      roundedRect(-34,-3,68,52,12);ctx.fill();
      ctx.strokeStyle="#e4b848";ctx.lineWidth=4;
      ctx.beginPath();ctx.moveTo(3,-1);ctx.lineTo(5,42);ctx.stroke();

      ctx.fillStyle="#cf8446";
      ctx.beginPath();ctx.ellipse(2,-39,34,31,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(-22,-61);ctx.lineTo(-10,-79);ctx.lineTo(-2,-59);ctx.fill();
      ctx.beginPath();ctx.moveTo(13,-60);ctx.lineTo(28,-77);ctx.lineTo(30,-52);ctx.fill();

      ctx.strokeStyle="#3a2924";ctx.lineWidth=5;
      for(const yy of [-55,-43,-31]){
        ctx.beginPath();ctx.moveTo(-16,yy);ctx.lineTo(-5,yy+5);ctx.stroke();
      }
      ctx.fillStyle="#171515";ctx.beginPath();ctx.arc(16,-43,4,0,Math.PI*2);ctx.fill();

      ctx.strokeStyle="#cf8446";ctx.lineWidth=15;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(27,4);
      if(e.attackTimer>0){
        const punch=Math.sin(Math.min(1,ap/.72)*Math.PI*.5);
        ctx.lineTo(41+17*punch,7-4*punch);
        ctx.lineTo(47+33*punch,12-8*punch);
      }else{
        ctx.lineTo(40,9);ctx.lineTo(47,18);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnemy(e){
    if(!e.alive) return;
    const x=e.x-camera.x,y=e.y-camera.y;
    const walking=Math.abs(e.vx)>10 && e.attackTimer<=0;
    const step=walking ? Math.sin(e.walkPhase) : 0;
    const attacking=e.attackTimer>0;
    const ap=attacking ? 1-e.attackTimer/.62 : 0;

    ctx.save();
    ctx.translate(x+e.w/2,y+e.h/2);
    ctx.scale(e.facing*1.10,1.10);
    if(e.flash>0) ctx.globalAlpha=.45;

    const colors={dog:"#b87954",rabbit:"#c9c0bb",fox:"#d87645",boar:"#8f6d63"};
    const c=colors[e.type]||"#b87954";

    // 奥脚
    ctx.strokeStyle="#28313e"; ctx.lineWidth=10; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(-10,31); ctx.lineTo(-14-9*step,48); ctx.stroke();

    // 奥腕（体の後ろ）
    ctx.beginPath(); ctx.moveTo(-16,7); ctx.lineTo(-25,19); ctx.stroke();

    // 人型胴体。港街では用心棒らしい暗い赤茶の上着。
    const outfit=currentStage===5?"#2f2938":(currentStage===4?"#3e4d45":(currentStage===3?"#2f3948":(currentStage===2?"#563842":"#303947")));
    ctx.fillStyle=outfit;
    roundedRect(-24,1,48,37,10); ctx.fill();

    // 前脚：歩行時だけ小さく前後
    ctx.strokeStyle=outfit; ctx.lineWidth=11;
    ctx.beginPath(); ctx.moveTo(11,31); ctx.lineTo(17+9*step,48); ctx.stroke();

    // 横向きの動物顔
    ctx.fillStyle=c;
    ctx.beginPath(); ctx.ellipse(1,-19,25,23,0,0,Math.PI*2); ctx.fill();

    // 耳
    if(e.type==="rabbit"){
      ctx.beginPath(); ctx.ellipse(-6,-44,7,19,-.1,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(9,-43,7,18,.12,0,Math.PI*2); ctx.fill();
    }else if(e.type==="boar"){
      ctx.beginPath(); ctx.moveTo(-13,-35); ctx.lineTo(-6,-48); ctx.lineTo(0,-34); ctx.fill();
    }else{
      ctx.beginPath(); ctx.moveTo(-14,-34); ctx.lineTo(-5,-49); ctx.lineTo(1,-34); ctx.fill();
      ctx.beginPath(); ctx.moveTo(9,-34); ctx.lineTo(17,-46); ctx.lineTo(20,-31); ctx.fill();
    }

    // 前へ出るマズルで横顔を明確に
    ctx.fillStyle=c;
    ctx.beginPath(); ctx.ellipse(20,-13,14,10,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#4a342e";
    ctx.beginPath();
    ctx.moveTo(30,-17); ctx.lineTo(36,-13); ctx.lineTo(30,-9); ctx.closePath(); ctx.fill();

    // 横顔なので目は前側を主に見せる
    ctx.fillStyle="#fff";
    ctx.beginPath(); ctx.ellipse(10,-22,6,6,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#111";
    ctx.beginPath(); ctx.arc(12,-22,2.5,0,Math.PI*2); ctx.fill();

    // 青龍刀。柄は両手で持ち、攻撃時は頭上→前方へ振り下ろす。
    ctx.save();
    let swordAngle;
    if(attacking){
      if(ap<.35) swordAngle=-1.75 + (ap/.35)*.25;       // 振りかぶり
      else swordAngle=-1.50 + ((ap-.35)/.65)*2.15;     // 前へ振り下ろし
    }else{
      swordAngle=-.55;
    }
    ctx.translate(14,7);
    ctx.rotate(swordAngle);

    // 手
    ctx.fillStyle=c;
    ctx.beginPath(); ctx.arc(0,0,6,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(12,0,5.5,0,Math.PI*2); ctx.fill();

    // 長い柄
    ctx.strokeStyle="#6b4a2f"; ctx.lineWidth=5; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(-14,0); ctx.lineTo(58,0); ctx.stroke();

    // 青龍刀の幅広い刃
    ctx.fillStyle="#d7e0e6";
    ctx.strokeStyle="#7b8790"; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(50,-5);
    ctx.quadraticCurveTo(76,-18,94,-8);
    ctx.quadraticCurveTo(82,3,57,8);
    ctx.lineTo(50,4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // 前腕
    ctx.strokeStyle=outfit; ctx.lineWidth=9;
    ctx.beginPath(); ctx.moveTo(17,7); ctx.lineTo(25,14); ctx.stroke();

    // HP：敵本体が画面内に入ってから、頭上すぐ近くに表示
    ctx.setTransform(1,0,0,1,0,0);
    const bodyVisible =
      x + e.w > 0 && x < innerWidth &&
      y + e.h > 0 && y < innerHeight;
    if(bodyVisible){
      const barY=y-7;
      ctx.fillStyle="rgba(0,0,0,.35)";
      ctx.fillRect(x+8,barY,e.w-16,5);
      ctx.fillStyle="#f85";
      ctx.fillRect(x+8,barY,(e.w-16)*Math.max(0,e.hp/5),5);
    }

    ctx.restore();
  }
  function drawCatLee(){
    const p=player;
    const x=p.x-camera.x+p.w/2;
    const y=p.y-camera.y+p.h/2;
    const f=p.facing;
    const type=p.attackType;

    const durations={
      jab:.26, straight:.29, kickup:.42, somersault:.44,
      airkick:.30, divedown:.34, dashbody:.30, dashupper:.34, dashclaw:.30, clawstrike:.30,
      wallup:.34, wallside:.32, walldown:.34
    };
    const dur=durations[type]||.3;
    const u=p.attackTimer>0 ? 1-Math.max(0,Math.min(1,p.attackTimer/dur)) : 0;

    function pulse(a,b){
      if(u<=a || u>=b) return 0;
      const q=(u-a)/(b-a);
      return Math.sin(q*Math.PI);
    }

    const wind=pulse(.02,.34);
    const hit=pulse(.20,.67);
    const recover=pulse(.54,.96);

    let tx=0, ty=0, tilt=0, crouch=0;
    let frontHand={x:39,y:-11}, backHand={x:-7,y:1};
    let frontFoot={x:30,y:49}, backFoot={x:-26,y:50};
    let frontKnee={x:24,y:27}, backKnee={x:-18,y:28};

    // 壁つかまり：両手両足で壁面をつかむ。
    // 登っている間は対角の手足を交互に動かす。
    const wallPose = p.wallLatched && p.attackTimer<=0;
    if(wallPose){
      const climb = input.y<-.24 ? Math.sin(p.animTime*16) : 0;
      const wallX = 42;
      frontHand={x:wallX,y:-28 + 9*climb};
      backHand ={x:wallX-8,y: 10 - 9*climb};
      frontKnee={x:24,y:23}; backKnee={x:18,y:31};
      frontFoot={x:wallX-1,y:22 - 10*climb};
      backFoot ={x:wallX-5,y:48 + 10*climb};
      tx=-3;
      tilt=.02;
    }

    if(type==="jab"){
      tx=-2*wind+7*hit;
      frontHand={x:27-8*wind+42*hit-10*recover,y:-11};
      frontFoot={x:31+8*hit,y:49};
      backFoot={x:-29,y:50};
    }else if(type==="straight"){
      tx=-5*wind+14*hit-4*recover;
      crouch=2*wind;
      frontHand={x:21-12*wind+58*hit-15*recover,y:-13};
      frontFoot={x:30-3*wind+22*hit,y:49};
      backFoot={x:-31-5*hit,y:50};
      tilt=-.045*hit;
    }else if(type==="kickup"){
      crouch=7*wind-3*hit;
      const chamber=Math.max(wind,recover*.8);
      frontKnee={x:31+10*chamber,y:21-10*chamber};
      frontFoot={x:35+15*chamber+33*hit,y:47-26*chamber-58*hit+20*recover};
      backFoot={x:-29,y:50};
      tx=-4*hit;
    }else if(type==="airkick"){
      const chamber=Math.max(wind,recover*.8);
      if(p.airKickSide===0){
        frontKnee={x:31+10*chamber,y:22-7*chamber};
        frontFoot={x:37+18*chamber+43*hit,y:43-18*chamber-22*hit+13*recover};
        backFoot={x:-30,y:39};
      }else{
        // 反対脚で蹴る。交互に見えるよう前後脚の役割を入れ替える。
        backKnee={x:25+9*chamber,y:23-7*chamber};
        backFoot={x:32+17*chamber+40*hit,y:42-17*chamber-21*hit+13*recover};
        frontFoot={x:-25,y:40};
      }
      tx=9*hit;
    }else if(type==="dashupper"){
      crouch=13*wind-9*hit;
      tx=-5*wind+13*hit;
      tilt=-.05*wind;
      frontHand={x:20-6*wind+22*hit,y:3+8*wind-62*hit+18*recover};
      frontKnee={x:24,y:29}; backKnee={x:-18,y:30};
      frontFoot={x:31+10*hit,y:50}; backFoot={x:-29-6*hit,y:50};
    }else if(type==="dashbody"){
      crouch=11*wind+7*hit;
      tx=-5*wind+18*hit;
      tilt=-.07*hit;
      frontHand={x:18-9*wind+50*hit,y:6+7*wind};
      frontFoot={x:30-5*wind+26*hit,y:50};
      backFoot={x:-35-7*hit,y:50};
    }else if(type==="clawstrike"){
      tx=-4*wind+8*hit;
      frontHand={x:12-18*wind+52*hit-12*recover,y:-20+13*hit};
      frontFoot={x:32+10*hit,y:49};
      tilt=-.04*hit;
    }else if(type==="clawdown"){
      // 高く振りかぶって、前方下へ大きく爪を振り下ろす
      tx=-3*wind+10*hit;
      tilt=.04*wind-.08*hit;
      frontHand={
        x:10-8*wind+50*hit,
        y:-34-34*wind+66*hit
      };
      backHand={x:-13,y:-6};
      frontKnee={x:23,y:29}; backKnee={x:-17,y:30};
      frontFoot={x:34,y:50}; backFoot={x:-28,y:50};
    }else if(type==="dashclaw"){
      tx=-7*wind+14*hit;
      frontHand={x:6-24*wind+63*hit-15*recover,y:-26+21*hit};
      frontFoot={x:31+19*hit,y:49};
      backFoot={x:-34-5*hit,y:50};
      tilt=-.07*hit;
    }else if(type==="wallup"){
      const chamber=Math.max(wind,recover*.75);
      frontKnee={x:31+10*chamber,y:20-10*chamber};
      frontFoot={x:36+18*chamber+38*hit,y:44-26*chamber-46*hit+15*recover};
      backFoot={x:-26,y:39}; tx=5*hit;
    }else if(type==="wallside"){
      const chamber=Math.max(wind,recover*.75);
      frontKnee={x:32+11*chamber,y:23-6*chamber};
      frontFoot={x:38+20*chamber+52*hit,y:43-15*chamber};
      backFoot={x:-27,y:38}; tx=10*hit;
    }else if(type==="walldown"){
      const chamber=Math.max(wind,recover*.75);
      frontKnee={x:31+10*chamber,y:24+5*chamber};
      frontFoot={x:37+17*chamber+40*hit,y:43+16*chamber+28*hit-12*recover};
      backFoot={x:-27,y:27}; tx=8*hit; ty=4*hit;
    }else if(type==="divedown"){
      const chamber=Math.max(wind,recover*.55);
      tilt=.18+.12*hit;
      tx=8*hit; ty=7*hit;
      frontKnee={x:29+8*chamber,y:22+7*chamber};
      frontFoot={x:40+16*chamber+43*hit,y:42+14*chamber+34*hit-8*recover};
      backKnee={x:-12,y:25}; backFoot={x:-27,y:30};
      frontHand={x:20,y:-8}; backHand={x:-20,y:0};
    }

    // ダッシュ中は背を低くして前傾。通常走りとは明確にシルエットを変える。
    if(p.dashTimer>0 && p.attackTimer<=0 && !p.wallLatched){
      crouch=10;
      tx=9;
      tilt=.11;
      frontHand={x:24,y:2};
      backHand={x:-19,y:-2};
      frontKnee={x:27,y:31}; backKnee={x:-18,y:31};
      frontFoot={x:41,y:50}; backFoot={x:-30,y:50};
    }

    // 歩行：攻撃していない地上移動では、膝と足先を交互に振る。
    if(p.grounded && p.attackTimer<=0 && Math.abs(p.vx)>35 && Math.abs(input.x)>.08 && !p.wallLatched && p.dashTimer<=0){
      const speedRatio=Math.min(1,Math.abs(p.vx)/455);
      const walk=Math.sin(p.animTime*(12+7*speedRatio));
      const liftA=Math.max(0,-walk);
      const liftB=Math.max(0, walk);
      // 歩幅をコンパクトに。横へ開かず、進行方向へ素早く刻む。
      frontKnee={x:20+7*walk,y:28-6*liftA};
      backKnee ={x:-16-7*walk,y:29-6*liftB};
      frontFoot={x:27+13*walk,y:50-9*liftA};
      backFoot ={x:-24-13*walk,y:50-9*liftB};
      tx=1.2*Math.abs(walk);
    }

    const bob=p.grounded && p.attackTimer<=0 ? Math.sin(p.animTime*12)*1.2 : 0;

    ctx.save();
    ctx.translate(x+tx*f,y+bob+ty+crouch);
    ctx.scale(f,1);
    ctx.scale(1.18,1.18);
    if(sageMode){
      ctx.save();ctx.globalAlpha=.18;ctx.fillStyle="#fff2a8";ctx.beginPath();ctx.ellipse(0,0,62,82,0,0,Math.PI*2);ctx.fill();ctx.restore();
    }

    if(type==="somersault" && p.attackTimer>0){
      ctx.rotate(-Math.PI*2*u);
    }else{
      ctx.rotate(tilt);
    }

    function limb(x1,y1,x2,y2,x3,y3,width,color){
      ctx.strokeStyle=color;
      ctx.lineWidth=width;
      ctx.lineCap="round";
      ctx.lineJoin="round";
      ctx.beginPath();
      ctx.moveTo(x1,y1);
      ctx.lineTo(x2,y2);
      ctx.lineTo(x3,y3);
      ctx.stroke();
    }

    // tail: side silhouette
    ctx.strokeStyle="#b9a08b";
    ctx.lineWidth=10;
    ctx.lineCap="round";
    ctx.beginPath();
    ctx.moveTo(-24,22);
    ctx.quadraticCurveTo(-61,20,-58,-16);
    ctx.quadraticCurveTo(-55,-38,-40,-31);
    ctx.stroke();

    // 脚そのものを青いズボンとして描く。上から短パンを被せない。
    // 膝まで太めの青い脚、足先だけ猫の毛色を見せる。
    const rearAnkle={
      x:backKnee.x+(backFoot.x-backKnee.x)*.72,
      y:backKnee.y+(backFoot.y-backKnee.y)*.72
    };
    const frontAnkle={
      x:frontKnee.x+(frontFoot.x-frontKnee.x)*.72,
      y:frontKnee.y+(frontFoot.y-frontKnee.y)*.72
    };
    limb(-15,24,backKnee.x,backKnee.y,rearAnkle.x,rearAnkle.y,16,"#173f8f");
    limb(15,24,frontKnee.x,frontKnee.y,frontAnkle.x,frontAnkle.y,17,"#173f8f");

    // 裾から出る足先
    ctx.strokeStyle="#b9a08b";
    ctx.lineWidth=12;
    ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(rearAnkle.x,rearAnkle.y); ctx.lineTo(backFoot.x,backFoot.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(frontAnkle.x,frontAnkle.y); ctx.lineTo(frontFoot.x,frontFoot.y); ctx.stroke();

    // 奥側の腕は必ず服の後ろに描く。
    if(wallPose){
      const rearElbow={x:5,y:6};
      limb(-12,-7,rearElbow.x,rearElbow.y,backHand.x,backHand.y,9.5,"#b9a08b");
      ctx.fillStyle="#b9a08b";
      ctx.beginPath(); ctx.ellipse(backHand.x+1,backHand.y,5.2,4.1,0,0,Math.PI*2); ctx.fill();
    }else{
      // 奥腕も背中側へ張り出させず、胸の前へ畳んだシルエットにする。
      limb(-10,-8,-7,-1,2,2,9.5,"#b9a08b");
      ctx.fillStyle="#b9a08b";
      ctx.beginPath(); ctx.ellipse(4,1,6.5,5.5,.15,0,Math.PI*2); ctx.fill();
    }

    // カンフー上着：背中側をほぼ直線にし、腹だけが膨らんで見えない細身の横姿へ。
    ctx.fillStyle="#2566d8";
    ctx.beginPath();
    ctx.moveTo(-23,-24);
    ctx.quadraticCurveTo(-27,-12,-26,2);
    ctx.lineTo(-25,28);
    ctx.lineTo(29,28);
    ctx.lineTo(28,-4);
    ctx.quadraticCurveTo(27,-16,18,-24);
    ctx.lineTo(8,-27);
    ctx.lineTo(-17,-27);
    ctx.closePath();
    ctx.fill();

    // 立ち襟
    ctx.fillStyle="#f1c64c";
    ctx.beginPath();
    ctx.moveTo(-19,-31);
    ctx.lineTo(17,-31);
    ctx.lineTo(20,-23);
    ctx.lineTo(-20,-23);
    ctx.closePath();
    ctx.fill();

    // 前合わせ：襟元から斜めに前へ落ち、その後だけ縦へ。
    // ファスナーのような中央線ではなく、伝統的な右前の合わせに見せる。
    ctx.strokeStyle="#f1c64c";
    ctx.lineWidth=4.2;
    ctx.lineCap="round";
    ctx.lineJoin="round";
    ctx.beginPath();
    ctx.moveTo(4,-23);
    ctx.quadraticCurveTo(12,-20,17,-13);
    ctx.lineTo(20,23);
    ctx.stroke();

    // 裾の縁取り
    ctx.beginPath();
    ctx.moveTo(-24,24);
    ctx.lineTo(29,24);
    ctx.stroke();

    // 盤扣：合わせ線から胸側へ短く伸びる3本。輪と留め玉を分けて描く。
    ctx.lineWidth=3.4;
    for(const [yy,xx] of [[-13,17],[-3,18],[8,19]]){
      ctx.beginPath();
      ctx.moveTo(xx,yy);
      ctx.lineTo(8,yy-1);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(6,yy-1,3.1,0,Math.PI*2);
      ctx.stroke();
    }

    // 前側の腕だけ服の上に描く。奥側の腕はすでに服の後ろへ描画済み。
    if(wallPose){
      const frontElbow={x:25,y:-10};
      limb(17,-9,frontElbow.x,frontElbow.y,frontHand.x,frontHand.y,10.5,"#b9a08b");
      ctx.fillStyle="#b9a08b";
      ctx.beginPath(); ctx.ellipse(frontHand.x+1,frontHand.y,5.8,4.4,0,0,Math.PI*2); ctx.fill();
    }else{
      // 前腕は胸に貼り付けず、顔の前へ一段出した構え。
      const elbow={x:(20+frontHand.x)/2+5,y:(-8+frontHand.y)/2+4};
      limb(20,-8,elbow.x,elbow.y,frontHand.x-3,frontHand.y,10.5,"#b9a08b");
      ctx.fillStyle="#b9a08b";
      ctx.beginPath();
      ctx.ellipse(frontHand.x,frontHand.y,8,7,-.25,0,Math.PI*2);
      ctx.fill();
    }

    // neck/collar
    ctx.fillStyle="#f1c64c";
    ctx.fillRect(-17,-33,36,9);

    // distinctly side-profile head: oval shifted forward.
    ctx.save();
    ctx.translate(2,-52);
    ctx.scale(.94,.88);
    ctx.fillStyle="#b9a08b";
    ctx.beginPath();
    ctx.ellipse(0,0,32,29,0,0,Math.PI*2);
    ctx.fill();
    ctx.restore();

    // ears angled toward profile
    ctx.fillStyle="#b9a08b";
    ctx.beginPath();
    ctx.moveTo(-20,-67); ctx.lineTo(-10,-88); ctx.lineTo(-3,-66); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(7,-67); ctx.lineTo(17,-85); ctx.lineTo(21,-63); ctx.fill();

    // side eye
    ctx.fillStyle="#151515";
    ctx.beginPath();
    ctx.ellipse(10,-56,4,7,0,0,Math.PI*2);
    ctx.fill();

    // muzzle protrudes forward
    ctx.fillStyle="#c7b6a8";
    ctx.beginPath();
    ctx.ellipse(23,-47,11,9,0,0,Math.PI*2);
    ctx.fill();

    // 鼻：横顔でも三角の尖った先端は真下へ向ける
    ctx.fillStyle="#8b5548";
    ctx.beginPath();
    ctx.moveTo(28,-51);
    ctx.lineTo(38,-51);
    ctx.lineTo(33,-42);
    ctx.closePath();
    ctx.fill();

    // mouth
    ctx.strokeStyle="#4b342f";
    ctx.lineWidth=2.5;
    ctx.beginPath();
    ctx.arc(22,-42,9,.1,1.55);
    ctx.stroke();

    // 髭は鼻先から前へ出さず、頬から後方へ流す
    ctx.strokeStyle="#4b342f";
    ctx.lineWidth=2.2;
    ctx.beginPath(); ctx.moveTo(-8,-48); ctx.lineTo(-25,-51); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-7,-43); ctx.lineTo(-25,-37); ctx.stroke();

    // claw trails
    if(type==="clawstrike" && p.attackTimer>0 && hit>.08){
      ctx.save();
      ctx.globalAlpha=Math.min(1,.35+hit);
      ctx.strokeStyle="#f8f4e8";
      ctx.lineWidth=3.5;
      ctx.lineCap="round";
      for(let i=-1;i<=1;i++){
        ctx.beginPath();
        ctx.moveTo(frontHand.x-1,frontHand.y+i*5);
        ctx.lineTo(frontHand.x+34,frontHand.y-12+i*8);
        ctx.stroke();
      }
      ctx.restore();
    }

    if(type==="dashclaw" && p.attackTimer>0){
      ctx.save();
      const fade=Math.max(.18,Math.min(.62,p.attackTimer/.30));
      ctx.globalAlpha=fade;
      ctx.strokeStyle="#ffffff";
      ctx.lineWidth=4;
      ctx.lineCap="round";

      // 本線
      for(let i=-1;i<=1;i++){
        const yy=-18+i*22;
        ctx.beginPath();
        ctx.moveTo(-24,yy);
        ctx.lineTo(84,yy+5);
        ctx.stroke();
      }

      // 少し後ろに薄い残像
      ctx.globalAlpha=fade*.35;
      ctx.lineWidth=7;
      for(let i=-1;i<=1;i++){
        const yy=-18+i*22;
        ctx.beginPath();
        ctx.moveTo(-48,yy-1);
        ctx.lineTo(46,yy+4);
        ctx.stroke();
      }
      ctx.restore();
    }
    if(sageMode){
      // 猫仙人：体型は通常CAT LEEのまま。衣装を覆わず「顔・気配」だけ仙人化する。
      ctx.save();
      ctx.globalAlpha=.98;

      // 長い白眉。通常より後ろへ流して老練な印象に。
      ctx.strokeStyle="#fffdf5";
      ctx.lineWidth=4.5;
      ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(5,-44);ctx.quadraticCurveTo(18,-49,27,-47);ctx.stroke();

      // 頬から下へ流れる細身の白髭。胴体を覆わない幅に抑える。
      ctx.fillStyle="#fffdf5";
      ctx.beginPath();
      ctx.moveTo(18,-30);
      ctx.quadraticCurveTo(28,-19,22,-7);
      ctx.quadraticCurveTo(17,5,11,18);
      ctx.quadraticCurveTo(9,3,3,-8);
      ctx.quadraticCurveTo(7,-22,18,-30);
      ctx.closePath();ctx.fill();

      // 顎髭を一本だけ長く。体の中央を隠しすぎない細さ。
      ctx.beginPath();
      ctx.moveTo(9,-23);
      ctx.quadraticCurveTo(8,-5,1,22);
      ctx.quadraticCurveTo(-2,31,-5,35);
      ctx.quadraticCurveTo(0,13,0,-21);
      ctx.closePath();ctx.fill();

      // 後頭部の白い毛束。
      ctx.strokeStyle="#eeeae0";
      ctx.lineWidth=5.5;
      ctx.beginPath();ctx.moveTo(-18,-43);ctx.quadraticCurveTo(-31,-36,-34,-23);ctx.stroke();

      // 眉間に小さな金色の「気」の印。衣装を変えずに仙人だと判別できる目印。
      ctx.fillStyle="#f5d86e";
      ctx.beginPath();ctx.arc(-1,-49,3.2,0,Math.PI*2);ctx.fill();

      // 手首だけ白い布巻きにして、通常CAT LEEとの差をもう一段つける。
      ctx.strokeStyle="#f1eee5";
      ctx.lineWidth=5;
      ctx.beginPath();ctx.moveTo(30,5);ctx.lineTo(34,9);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-27,7);ctx.lineTo(-31,11);ctx.stroke();

      ctx.restore();
    }
    ctx.restore();
  }

  function resultText(){
    const d=player.deaths;
    if(d===0) return ["伝説級！ CAT LEE","ノーミスの達人エンディング"];
    if(d<=3) return ["達人","見事なカンフー映画エンディング"];
    if(d<=9) return ["なかなかやるニャ","ちょっと傷だらけの英雄エンディング"];
    if(d<=19) return ["修行が足りん！","包帯だらけで祝勝会エンディング"];
    return ["❌多すぎ！","病院のベッドで表彰される変なエンディング"];
  }

  function drawStageTitle(){
    if(player.x<700 && !boss.active && !stageCleared){
      const fade=Math.max(0,Math.min(1,(700-player.x)/300));
      ctx.save();ctx.globalAlpha=.78*fade;ctx.textAlign="center";ctx.fillStyle="#fff";
      ctx.font="bold 24px serif";
      const stageNames=["","第一幕　古街","第二幕　港街","第三幕　新市街","第四幕　工場街","第五幕　海外街",
        "第六幕　港湾倉庫","第七幕　山岳寺院","第八幕　現代繁華街","第九幕　地下施設","最終幕　高層ビル"];
      const stageName=stageNames[currentStage]||("STAGE "+currentStage);
      ctx.fillText(stageName,innerWidth/2,88);
      ctx.font="14px sans-serif";
      ctx.fillText("STAGE "+currentStage,innerWidth/2,110);
      ctx.restore();
    }
  }

  function drawHUD(){
    ctx.save();
    drawStageTitle();

    // 体力
    ctx.fillStyle="rgba(0,0,0,.48)";
    roundedRect(16,16,178,28,10);ctx.fill();
    ctx.fillStyle="#f2d45c";
    ctx.font="bold 14px sans-serif";
    ctx.fillText(sageMode?"猫仙人":"CAT LEE",26,35);
    ctx.fillStyle="#402b2b";
    ctx.fillRect(91,25,92,10);
    ctx.fillStyle="#55c86f";
    ctx.fillRect(91,25,92*Math.max(0,player.hp/player.maxHp),10);

    // 死亡回数：ゼロから増えていく
    ctx.fillStyle="rgba(0,0,0,.48)";
    roundedRect(innerWidth-102,16,86,32,10);ctx.fill();
    ctx.fillStyle="#fff";
    ctx.font="bold 19px sans-serif";
    ctx.textAlign="center";
    ctx.fillText("❌ "+player.deaths,innerWidth-59,39);

    if(sageMode){
      ctx.fillStyle="#fff2a8";ctx.font="bold 15px sans-serif";ctx.textAlign="center";
      ctx.fillText("猫仙人・無双状態",innerWidth/2,112);ctx.textAlign="left";
    }else if(sageUnlocked&&currentStage===1&&player.x<700){
      ctx.fillStyle="#fff2a8";ctx.font="bold 14px sans-serif";ctx.textAlign="center";
      ctx.fillText("解放済：爪＋ダッシュ同時押し → 猫仙人",innerWidth/2,112);ctx.textAlign="left";
    }
    if(player.parrySuccess>0){
      ctx.fillStyle="#fff";
      ctx.font="bold 20px sans-serif";
      ctx.textAlign="center";
      ctx.fillText("カキン！",innerWidth/2,126);
      ctx.textAlign="left";
    }

    if(boss.active && boss.alive){
      const bw=Math.min(430,innerWidth*.62);
      const bx=(innerWidth-bw)/2;
      ctx.fillStyle="rgba(0,0,0,.56)";
      roundedRect(bx,60,bw,34,10);ctx.fill();
      ctx.fillStyle="#fff";
      ctx.font="bold 14px sans-serif";
      ctx.fillText("BOSS",innerWidth/2,75);
      ctx.fillStyle="#411b1b";
      ctx.fillRect(bx+18,81,bw-36,7);
      ctx.fillStyle="#d84d45";
      ctx.fillRect(bx+18,81,(bw-36)*Math.max(0,boss.hp/boss.maxHp),7);
    }

    if(player.respawnTimer>0){
      ctx.fillStyle="rgba(0,0,0,.55)";
      ctx.fillRect(0,0,innerWidth,innerHeight);
      ctx.fillStyle="#fff";
      ctx.font="bold 28px sans-serif";
      ctx.fillText("まだ終わらニャい！",innerWidth/2,innerHeight*.45);
      ctx.font="bold 20px sans-serif";
      ctx.fillText("❌ "+player.deaths,innerWidth/2,innerHeight*.45+38);
    }

    if(stageCleared && clearTimer>.45){
      ctx.fillStyle="rgba(12,16,20,.82)";
      ctx.fillRect(0,0,innerWidth,innerHeight);
      ctx.fillStyle="#f2d45c";
      ctx.font="bold 34px sans-serif";
      ctx.fillText("STAGE CLEAR",innerWidth/2,innerHeight*.30);

      if(currentStage===1){
        ctx.fillStyle="#fff";
        ctx.font="bold 26px serif";
        ctx.fillText("第一幕　古街　突破",innerWidth/2,innerHeight*.43);
        ctx.font="19px sans-serif";
        ctx.fillText("次は港へ―― 第二幕「港街」",innerWidth/2,innerHeight*.53);
        if(clearTimer>.65){
          ctx.font="bold 17px sans-serif";
          ctx.fillText("攻撃・爪・ダッシュ・ジャンプで次へ",innerWidth/2,innerHeight*.64);
        }
      }else if(currentStage===2){
        ctx.fillStyle="#fff";
        ctx.font="bold 26px serif";
        ctx.fillText("第二幕　港街　突破",innerWidth/2,innerHeight*.43);
        ctx.font="19px sans-serif";
        ctx.fillText("街の中心へ―― 第三幕「新市街」",innerWidth/2,innerHeight*.53);
        if(clearTimer>.65){
          ctx.font="bold 17px sans-serif";
          ctx.fillText("攻撃・爪・ダッシュ・ジャンプで次へ",innerWidth/2,innerHeight*.64);
        }
      }else if(currentStage===3){
        ctx.fillStyle="#fff";
        ctx.font="bold 26px serif";
        ctx.fillText("第三幕　新市街　突破",innerWidth/2,innerHeight*.43);
        ctx.font="19px sans-serif";
        ctx.fillText("夜の工業地帯へ―― 第四幕「工場街」",innerWidth/2,innerHeight*.53);
        if(clearTimer>.65){
          ctx.font="bold 17px sans-serif";
          ctx.fillText("攻撃・爪・ダッシュ・ジャンプで次へ",innerWidth/2,innerHeight*.64);
        }
      }else if(currentStage===4){
        ctx.fillStyle="#fff";
        ctx.font="bold 26px serif";
        ctx.fillText("第四幕　工場街　突破",innerWidth/2,innerHeight*.43);
        ctx.font="19px sans-serif";
        ctx.fillText("海の向こうの大都市へ―― 第五幕「海外街」",innerWidth/2,innerHeight*.53);
        if(clearTimer>.65){
          ctx.font="bold 17px sans-serif";
          ctx.fillText("攻撃・爪・ダッシュ・ジャンプで次へ",innerWidth/2,innerHeight*.64);
        }
      }else if(currentStage===5){
        ctx.fillStyle="#fff";ctx.font="bold 26px serif";
        ctx.fillText("第五幕　海外街　突破",innerWidth/2,innerHeight*.43);
        ctx.font="19px sans-serif";ctx.fillText("港の最奥へ―― 第六幕「港湾倉庫」",innerWidth/2,innerHeight*.53);
        if(clearTimer>.65){ctx.font="bold 17px sans-serif";ctx.fillText("攻撃・爪・ダッシュ・ジャンプで次へ",innerWidth/2,innerHeight*.64);}
      }else if(currentStage===6){
        ctx.fillStyle="#fff";ctx.font="bold 26px serif";ctx.fillText("第六幕　港湾倉庫　突破",innerWidth/2,innerHeight*.43);
        ctx.font="19px sans-serif";ctx.fillText("山の奥へ―― 第七幕「山岳寺院」",innerWidth/2,innerHeight*.53);
        if(clearTimer>.65){ctx.font="bold 17px sans-serif";ctx.fillText("攻撃・爪・ダッシュ・ジャンプで次へ",innerWidth/2,innerHeight*.64);}
      }else if(currentStage===7){
        ctx.fillStyle="#fff";ctx.font="bold 26px serif";ctx.fillText("第七幕　山岳寺院　突破",innerWidth/2,innerHeight*.43);
        ctx.font="19px sans-serif";ctx.fillText("山を下り、現代へ―― 第八幕「現代繁華街」",innerWidth/2,innerHeight*.53);
        if(clearTimer>.65){ctx.font="bold 17px sans-serif";ctx.fillText("攻撃・爪・ダッシュ・ジャンプで次へ",innerWidth/2,innerHeight*.64);}
      }else if(currentStage===8){
        ctx.fillStyle="#fff";ctx.font="bold 26px serif";ctx.fillText("第八幕　現代繁華街　突破",innerWidth/2,innerHeight*.43);
        ctx.font="19px sans-serif";ctx.fillText("敵組織を追って地下へ―― 第九幕「地下施設」",innerWidth/2,innerHeight*.53);
        if(clearTimer>.65){ctx.font="bold 17px sans-serif";ctx.fillText("攻撃・爪・ダッシュ・ジャンプで次へ",innerWidth/2,innerHeight*.64);}
      }else if(currentStage===9){
        ctx.fillStyle="#fff";ctx.font="bold 26px serif";ctx.fillText("第九幕　地下施設　突破",innerWidth/2,innerHeight*.43);
        ctx.font="19px sans-serif";ctx.fillText("エレベーターで敵の本拠へ―― 最終幕「高層ビル」",innerWidth/2,innerHeight*.53);
        if(clearTimer>.65){ctx.font="bold 17px sans-serif";ctx.fillText("攻撃・爪・ダッシュ・ジャンプで最終決戦へ",innerWidth/2,innerHeight*.64);}
      }else{
        const [rank,ending]=resultText();
        ctx.fillStyle="#fff";
        ctx.font="bold 28px sans-serif";
        ctx.fillText(rank,innerWidth/2,innerHeight*.43);
        ctx.font="bold 21px sans-serif";
        ctx.fillText("ミス回数  ❌ "+player.deaths,innerWidth/2,innerHeight*.51);
        ctx.font="18px sans-serif";
        ctx.fillText(ending,innerWidth/2,innerHeight*.60);
        if(player.deaths>=20){
          ctx.font="48px sans-serif";ctx.fillText("🏥",innerWidth/2,innerHeight*.70);
        }
        if(currentStage===10){
          ctx.fillStyle="#fff2a8";ctx.font="bold 20px sans-serif";
          ctx.fillText("クリア特典：猫仙人 解放！",innerWidth/2,innerHeight*.73);
          ctx.fillStyle="#fff";ctx.font="bold 16px sans-serif";
          ctx.fillText("爪ボタンで『猫仙人・無双周回』を開始",innerWidth/2,innerHeight*.79);
        }
      }
    }
    ctx.textAlign="left";
    ctx.restore();
  }

  function draw(){
    drawBackground();
    ctx.save();
    for(const p of platforms) drawPlatform(p);
    for(const e of enemies) drawEnemy(e);
    for(const e of throwers) drawThrower(e);
    drawBoss(boss);
    for(const q of pots) drawPot(q);
    for(const wv of sageWaves){
      const a=Math.max(0,wv.life/wv.maxLife),x=wv.x-camera.x,y=wv.y-camera.y;
      ctx.save();ctx.globalAlpha=.22+.55*a;ctx.strokeStyle="#fff6c7";ctx.lineWidth=14;
      ctx.beginPath();ctx.ellipse(x,y,wv.r*(1.35+(1-a)*.8),wv.r*.72,0,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=.14+.25*a;ctx.lineWidth=34;ctx.stroke();ctx.restore();
    }

    // 攻撃残像
    for(const fx of attackFX){
      if((fx.delay||0)>0) continue;
      const alpha=Math.max(0,fx.life/fx.maxLife);
      if(fx.type==="upperArc"){
        const progress=1-fx.life/fx.maxLife;
        ctx.save();
        ctx.translate(fx.x-camera.x,fx.y-camera.y);
        ctx.scale(fx.facing,1);
        ctx.globalAlpha=.22+.42*alpha;
        ctx.strokeStyle="#f7f0df";
        ctx.lineWidth=13;
        ctx.lineCap="round";

        // 前方に張り出す縦半円。下から拳の上までをなぞる。
        ctx.beginPath();
        const steps=24;
        const shown=Math.max(3,Math.floor(steps*progress));
        for(let j=0;j<=shown;j++){
          const t=j/steps;
          const theta=Math.PI/2-t*Math.PI;
          const x=Math.cos(theta)*62;
          const y=Math.sin(theta)*82;
          if(j===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.stroke();

        ctx.globalAlpha=.15*alpha;
        ctx.lineWidth=22;
        ctx.stroke();
        ctx.restore();
      }else if(fx.type==="clawDownArc"){
        const progress=1-fx.life/fx.maxLife;
        ctx.save();
        ctx.translate(fx.x-camera.x,fx.y-camera.y);
        ctx.scale(fx.facing,1);
        ctx.strokeStyle="#fff";
        ctx.lineCap="round";

        // 3本の爪痕が、上前方→下前方へ弧を描きながら伸びる
        const steps=28;
        const shown=Math.max(3,Math.floor(steps*progress));
        for(let line=-1;line<=1;line++){
          ctx.beginPath();
          for(let j=0;j<=shown;j++){
            const t=j/steps;
            const theta=-Math.PI*.72+t*Math.PI*.92;
            const rrX=fx.rx + line*10;
            const rrY=fx.ry + line*7;
            const xx=Math.cos(theta)*rrX;
            const yy=Math.sin(theta)*rrY + line*10;
            if(j===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);
          }
          ctx.globalAlpha=.48*alpha;
          ctx.lineWidth=5.5;
          ctx.stroke();
        }
        ctx.globalAlpha=.10*alpha;
        ctx.lineWidth=11;
        ctx.stroke();
        ctx.restore();
      }else if(fx.type==="wallKickAir"){
        const progress=1-fx.life/fx.maxLife;
        ctx.save();
        ctx.translate(fx.x-camera.x,fx.y-camera.y);
        ctx.scale(fx.facing,1);
        ctx.globalAlpha=.18 + .55*alpha;
        ctx.strokeStyle="#ffffff";
        ctx.lineCap="round";

        // 足の周囲に空気が巻きつくような短い流線
        let angle=0;
        if(fx.dir==="up") angle=-.72;
        else if(fx.dir==="down") angle=.62;
        ctx.rotate(angle);

        for(let i=0;i<4;i++){
          const off=(i-1.5)*8;
          const len=44 + i*7 + progress*22;
          ctx.lineWidth=5-i*.45;
          ctx.beginPath();
          ctx.moveTo(-10,off);
          ctx.quadraticCurveTo(18,off-10, len, off+2);
          ctx.stroke();
        }

        ctx.globalAlpha=.15*alpha;
        ctx.lineWidth=14;
        ctx.beginPath();
        ctx.moveTo(-8,0);
        ctx.quadraticCurveTo(18,-14,58+progress*20,0);
        ctx.stroke();
        ctx.restore();
      }else if(fx.type==="hitSpark"){
        const progress=1-fx.life/fx.maxLife;
        ctx.save();
        ctx.translate(fx.x-camera.x,fx.y-camera.y);
        ctx.globalAlpha=alpha;
        ctx.strokeStyle="#fff";
        ctx.fillStyle="#fff";
        ctx.lineCap="round";
        const r=6+progress*13;
        for(let i=0;i<5;i++){
          const a=-.9+i*.45;
          ctx.lineWidth=2.5;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a)*3,Math.sin(a)*3);
          ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);
          ctx.stroke();
        }
        ctx.globalAlpha=.55*alpha;
        ctx.beginPath();
        ctx.arc(0,0,4+progress*3,0,Math.PI*2);
        ctx.fill();
        ctx.restore();
      }else if(fx.type==="parrySpark"){
        const progress=1-fx.life/fx.maxLife;
        ctx.save();
        ctx.translate(fx.x-camera.x,fx.y-camera.y);
        ctx.globalAlpha=alpha;
        ctx.strokeStyle="#fff";
        ctx.lineCap="round";

        // 接触点のリング。上の「カキン！」とは別に、その場で弾いたことが分かる。
        ctx.lineWidth=5;
        ctx.beginPath();
        ctx.arc(0,0,10+progress*24,0,Math.PI*2);
        ctx.stroke();

        for(let i=0;i<8;i++){
          const a=i*Math.PI/4 + progress*.25;
          const r1=8, r2=30+progress*20;
          ctx.lineWidth=i%2?3:5;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a)*r1,Math.sin(a)*r1);
          ctx.lineTo(Math.cos(a)*r2,Math.sin(a)*r2);
          ctx.stroke();
        }

        ctx.globalAlpha=.85*alpha;
        ctx.lineWidth=4;
        ctx.beginPath();
        ctx.moveTo(-15,-15);ctx.lineTo(15,15);
        ctx.moveTo(15,-15);ctx.lineTo(-15,15);
        ctx.stroke();
        ctx.restore();
      }else if(fx.type==="backstepAir"){
        const progress=1-fx.life/fx.maxLife;
        ctx.save();
        ctx.translate(fx.x-camera.x,fx.y-camera.y);
        ctx.scale(fx.facing,1);
        ctx.globalAlpha=.55*alpha;
        ctx.strokeStyle="#fff";
        ctx.lineCap="round";
        for(let i=0;i<4;i++){
          ctx.lineWidth=5-i*.6;
          ctx.beginPath();
          ctx.moveTo(10,(i-1.5)*9);
          ctx.quadraticCurveTo(-20-progress*20,(i-1.5)*11,-62-progress*28,(i-1.5)*13);
          ctx.stroke();
        }
        ctx.restore();
      }else if(fx.type==="dashClawTrail"){
        ctx.save();
        ctx.translate(fx.x-camera.x,fx.y-camera.y);
        ctx.scale(fx.facing,1);
        for(let i=-1;i<=1;i++){
          const yy=i*(fx.height/3);
          ctx.globalAlpha=.34*alpha;
          ctx.strokeStyle="#ffffff";
          ctx.lineWidth=5;
          ctx.lineCap="round";
          ctx.beginPath();
          ctx.moveTo(-12,yy);
          ctx.lineTo(fx.length-18,yy+4);
          ctx.stroke();

          ctx.globalAlpha=.12*alpha;
          ctx.lineWidth=10;
          ctx.beginPath();
          ctx.moveTo(-35,yy);
          ctx.lineTo(fx.length-52,yy+3);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    drawCatLee();

    // ボス arena の終端
    const gx=4140-camera.x, gy=1500-camera.y;
    ctx.fillStyle=currentStage===1?"#5b2a25":(currentStage===2?"#4b4037":(currentStage===3?"#343b44":(currentStage===4?"#2d3439":"#251f28")));
    ctx.fillRect(gx,gy,22,390);
    ctx.fillStyle=currentStage===1?"#d8ad48":(currentStage===2?"#a88b63":(currentStage===3?"#b6a274":(currentStage===4?"#c29a42":"#b7893f")));
    ctx.fillRect(gx-14,gy,50,18);

    ctx.restore();

    drawHUD();
  }

  function frame(now){
    const dt=Math.min((now-last)/1000,.033);
    last=now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
