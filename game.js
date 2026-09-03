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

  // 薄い足場：下から通過でき、上からは着地できる
  for(const p of platforms) p.oneWay = p.h <= 55 && p.w >= 180;

  const enemies = [
    {x:680,y:1820,w:64,h:82,hp:3,vx:0,flash:0,alive:true,type:"dog"},
    {x:1320,y:1800,w:64,h:82,hp:3,vx:0,flash:0,alive:true,type:"rabbit"},
    {x:1880,y:1860,w:64,h:82,hp:4,vx:0,flash:0,alive:true,type:"fox"},
    {x:2700,y:1810,w:64,h:82,hp:4,vx:0,flash:0,alive:true,type:"boar"},
    {x:3420,y:1850,w:64,h:82,hp:5,vx:0,flash:0,alive:true,type:"dog"}
  ];
  // 敵AI用の状態
  for(const e of enemies){
    e.facing = player.x < e.x ? -1 : 1;
    e.walkPhase = Math.random()*Math.PI*2;
    e.attackTimer = 0;
    e.attackCooldown = .5 + Math.random()*.7;
    e.attackHitDone = false;
  }



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
    lastDirX:0, lastDirTimer:0
  };

  const camera = {x:0,y:0};

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

  function startAttack(type, duration=.24){
    player.attackType = type;
    player.attackTimer = duration;
    player.comboWindow = .58;
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
      case "dashbody": hb={x:f>0?p.x+p.w-2:p.x-64,y:p.y+42,w:68,h:34,damage:3,kx:620*f,ky:-120}; break;
      case "dashupper": hb={x:f>0?p.x+p.w-8:p.x-58,y:p.y-12,w:66,h:88,damage:4,kx:300*f,ky:-720}; break;
      case "dashclaw": hb={x:f>0?p.x+p.w-8:p.x-98,y:p.y+2,w:106,h:p.h-4,damage:4,kx:760*f,ky:-80}; break;
      case "clawstrike": hb={x:f>0?p.x+p.w-8:p.x-70,y:p.y+12,w:78,h:62,damage:2,kx:390*f,ky:-130}; break;
      case "wallup": hb={x:f>0?p.x+p.w-4:p.x-62,y:p.y-34,w:64,h:64,damage:3,kx:420*f,ky:-620}; break;
      case "wallside": hb={x:f>0?p.x+p.w-4:p.x-72,y:p.y+18,w:76,h:46,damage:3,kx:650*f,ky:-120}; break;
      case "walldown": hb={x:f>0?p.x+p.w-4:p.x-60,y:p.y+48,w:64,h:62,damage:3,kx:430*f,ky:520}; break;
    }
    return hb;
  }

  const hitMemory = new WeakMap();
  function processHit(){
    if(player.attackTimer<=0) return;
    const hb=attackHitbox();
    if(!hb) return;
    for(const e of enemies){
      if(!e.alive || !overlap(hb,e)) continue;
      let mark = hitMemory.get(e);
      if(mark === player.attackType + ":" + Math.floor(player.attackTimer*100)) continue;
      e.hp -= hb.damage;
      e.vx = hb.kx;
      e.y += Math.sign(hb.ky)*3;
      e.flash = .12;
      player.hitStop = .045;
      hitMemory.set(e, player.attackType + ":" + Math.floor(player.attackTimer*100));
      if(e.hp<=0) e.alive=false;
    }
  }

  function doAttack(){
    const airKickChain = !player.grounded && player.attackType==="airkick" && player.attackTimer<.18;
    if(player.attackTimer>0 && !airKickChain) return;

    if(player.wallLatched){
      const away = -player.wallLatchSide;
      player.facing = away;
      player.wallLatched = false;
      player.wallRef=null;
      if(input.y < -.35){
        player.vx = 560*away; player.vy=-720; startAttack("wallup",.34);
      }else if(input.y > .35){
        player.vx = 560*away; player.vy=620; startAttack("walldown",.34);
      }else{
        player.vx = 840*away; player.vy=-90; startAttack("wallside",.32);
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
        life:.26,maxLife:.26,damage:4,
        kx:320*player.facing,ky:-760
      });
    }
  }
  function doClaw(){
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
    if(player.wallLatched){
      const away = -player.wallLatchSide;
      player.wallLatched=false;
      player.wallRef=null;
      player.vx=650*away;
      player.vy=-940;
      player.facing=away;
      return;
    }
    wallProbe();
    if(player.onWall && !player.grounded){
      const away=-player.onWall;
      player.vx=630*away;
      player.vy=-920;
      player.facing=away;
      return;
    }
    if(player.grounded){
      if(player.dashTimer>0){
        // ダッシュジャンプ：勢いを残して通常より高く遠くへ
        player.vy=-1180;
        player.vx=Math.max(Math.abs(player.vx),820)*player.facing;
        player.dashTimer=0;
      }else{
        player.vy=-980;
      }
      player.grounded=false;
      player.airKickCount=0;
    }
  }

  function update(dt){
    if(player.hitStop>0){
      player.hitStop-=dt;
      return;
    }

    player.animTime += dt;
    player.attackTimer=Math.max(0,player.attackTimer-dt);
    player.comboWindow=Math.max(0,player.comboWindow-dt);
    player.dashTimer=Math.max(0,player.dashTimer-dt);
    const hadDash = player.dashTimer>0;
    player.dashCooldown=Math.max(0,player.dashCooldown-dt);
    player.invuln=Math.max(0,player.invuln-dt);
    if(hadDash && player.dashTimer<=0 && player.grounded) player.vx*=0.35;
    if(player.attackType==="dashbody" && player.attackTimer>0){
      player.vx *= Math.pow(.002,dt);
    }
    if(player.attackType==="dashclaw" && !player.dashClawActive && player.grounded){
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
          player.vx *= Math.pow(.0000005,dt);
          if(Math.abs(player.vx)<18) player.vx=0;
        }
      }
      if(Math.abs(input.x)>.15) player.facing=Math.sign(input.x);
      player.vy += WORLD.gravity*dt;
      player.vy = Math.min(player.vy,1200);
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

    // 地上に戻ったら壁関連状態を必ず解除。時々歩けなくなる原因の残留状態を消す。
    if(player.grounded){
      player.airKickCount=0;
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
        for(const e of enemies){
          if(!e.alive || fx.hit.has(e) || !overlap(hb,e)) continue;
          fx.hit.add(e);
          e.hp-=fx.damage;
          e.vx=fx.kx;
          e.y-=8;
          e.flash=.12;
          player.hitStop=.045;
          if(e.hp<=0) e.alive=false;
        }
      }else if(fx.type==="dashClawTrail"){
        // 発生位置から進行方向へ伸びる体高サイズの帯
        const left = fx.facing>0 ? fx.x-18 : fx.x-fx.length+18;
        const hb={x:left,y:fx.y-fx.height/2,w:fx.length,h:fx.height};
        for(const e of enemies){
          if(!e.alive || fx.hit.has(e) || !overlap(hb,e)) continue;
          fx.hit.add(e);
          e.hp-=fx.damage;
          e.vx=fx.kx;
          e.flash=.12;
          player.hitStop=.04;
          if(e.hp<=0) e.alive=false;
        }
      }
    }

    for(const e of enemies){
      if(!e.alive) continue;
      e.flash=Math.max(0,e.flash-dt);
      e.attackTimer=Math.max(0,e.attackTimer-dt);
      e.attackCooldown=Math.max(0,e.attackCooldown-dt);
      e.walkPhase += dt*8;

      const dx=(player.x+player.w/2)-(e.x+e.w/2);
      e.facing=dx<0?-1:1;
      const dist=Math.abs(dx);

      if(e.attackTimer>0){
        e.vx=0;
        const elapsed=.62-e.attackTimer;
        if(!e.attackHitDone && elapsed>.27){
          e.attackHitDone=true;
          const hb={x:e.facing>0?e.x+e.w-4:e.x-54,y:e.y-12,w:58,h:e.h+20};
          if(player.invuln<=0 && overlap(hb,player)){
            player.vx=420*e.facing;
            player.vy=-260;
            player.invuln=.75;
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

    if(player.y>WORLD.height+300){
      Object.assign(player,{x:220,y:1760,vx:0,vy:0,wallLatched:false});
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

  function drawBackground(){
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
  }

  function drawPlatform(p){
    const x=p.x-camera.x, y=p.y-camera.y;
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

  function drawEnemy(e){
    if(!e.alive) return;
    const x=e.x-camera.x,y=e.y-camera.y;
    const walking=Math.abs(e.vx)>10 && e.attackTimer<=0;
    const step=walking ? Math.sin(e.walkPhase) : 0;
    const attacking=e.attackTimer>0;
    const ap=attacking ? 1-e.attackTimer/.62 : 0;

    ctx.save();
    ctx.translate(x+e.w/2,y+e.h/2);
    ctx.scale(e.facing,1);
    if(e.flash>0) ctx.globalAlpha=.45;

    const colors={dog:"#b87954",rabbit:"#c9c0bb",fox:"#d87645",boar:"#8f6d63"};
    const c=colors[e.type]||"#b87954";

    // 奥脚
    ctx.strokeStyle="#28313e"; ctx.lineWidth=10; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(-10,31); ctx.lineTo(-14-9*step,48); ctx.stroke();

    // 奥腕（体の後ろ）
    ctx.beginPath(); ctx.moveTo(-16,7); ctx.lineTo(-25,19); ctx.stroke();

    // 人型胴体
    ctx.fillStyle="#303947";
    roundedRect(-24,1,48,37,10); ctx.fill();

    // 前脚：歩行時だけ小さく前後
    ctx.strokeStyle="#303947"; ctx.lineWidth=11;
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
    ctx.strokeStyle="#303947"; ctx.lineWidth=9;
    ctx.beginPath(); ctx.moveTo(17,7); ctx.lineTo(25,14); ctx.stroke();

    // HP
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle="rgba(0,0,0,.35)";
    ctx.fillRect(x+4,y-18,e.w-8,6);
    ctx.fillStyle="#f85";
    ctx.fillRect(x+4,y-18,(e.w-8)*Math.max(0,e.hp/5),6);

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
      airkick:.30, dashbody:.30, dashupper:.34, dashclaw:.30, clawstrike:.30,
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
    let frontHand={x:31,y:-10}, backHand={x:-15,y:5};
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
    if(p.grounded && p.attackTimer<=0 && Math.abs(p.vx)>35 && !p.wallLatched && p.dashTimer<=0){
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
      limb(-14,-7,-19,2,-10,7,9.5,"#b9a08b");
      ctx.fillStyle="#b9a08b";
      ctx.beginPath(); ctx.ellipse(-8,7,7,6,.2,0,Math.PI*2); ctx.fill();
    }

    // カンフー上着：立ち襟・前合わせ・裾広がり・盤扣（飾り紐）
    ctx.fillStyle="#2566d8";
    ctx.beginPath();
    ctx.moveTo(-27,-24);
    ctx.quadraticCurveTo(-35,-14,-32,2);
    ctx.lineTo(-30,29);
    ctx.lineTo(30,29);
    ctx.lineTo(28,-4);
    ctx.quadraticCurveTo(27,-17,18,-24);
    ctx.lineTo(8,-27);
    ctx.lineTo(-18,-27);
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

    // 前合わせと裾
    ctx.strokeStyle="#f1c64c";
    ctx.lineWidth=4.5;
    ctx.lineCap="round";
    ctx.beginPath();
    ctx.moveTo(5,-23);
    ctx.quadraticCurveTo(12,-15,9,-4);
    ctx.lineTo(10,25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-27,25);
    ctx.lineTo(29,25);
    ctx.stroke();

    // 盤扣：横向きの飾り紐を3本
    ctx.lineWidth=3.8;
    for(const yy of [-14,-3,8]){
      ctx.beginPath();
      ctx.moveTo(9,yy);
      ctx.lineTo(22,yy-2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(24,yy-2,2.5,0,Math.PI*2);
      ctx.stroke();
    }

    // 前側の腕だけ服の上に描く。奥側の腕はすでに服の後ろへ描画済み。
    if(wallPose){
      const frontElbow={x:25,y:-10};
      limb(17,-9,frontElbow.x,frontElbow.y,frontHand.x,frontHand.y,10.5,"#b9a08b");
      ctx.fillStyle="#b9a08b";
      ctx.beginPath(); ctx.ellipse(frontHand.x+1,frontHand.y,5.8,4.4,0,0,Math.PI*2); ctx.fill();
    }else{
      const elbow={x:(18+frontHand.x)/2+4,y:(-9+frontHand.y)/2+2};
      limb(18,-9,elbow.x,elbow.y,frontHand.x-3,frontHand.y,10.5,"#b9a08b");
      // 握り拳：丸すぎず、胸前にコンパクトに構える
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
    ctx.restore();
  }

  function draw(){
    drawBackground();
    ctx.save();
    for(const p of platforms) drawPlatform(p);
    for(const e of enemies) drawEnemy(e);

    // 攻撃残像
    for(const fx of attackFX){
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

    // Goal marker
    const gx=4010-camera.x, gy=1490-camera.y;
    ctx.fillStyle="#f0c35a";
    ctx.fillRect(gx,gy,8,210);
    ctx.fillStyle="#c82d2d";
    ctx.beginPath(); ctx.moveTo(gx+8,gy+10); ctx.lineTo(gx+110,gy+42); ctx.lineTo(gx+8,gy+78); ctx.fill();

    ctx.restore();
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
