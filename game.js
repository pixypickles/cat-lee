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
    {x:0,y:1920,w:900,h:280},
    {x:980,y:1840,w:540,h:360},
    {x:1600,y:1970,w:520,h:230},
    {x:2210,y:1760,w:480,h:440},
    {x:2780,y:1880,w:600,h:320},
    {x:3480,y:1700,w:720,h:500},

    {x:420,y:1550,w:330,h:50},
    {x:820,y:1320,w:300,h:50},
    {x:1190,y:1050,w:280,h:50},
    {x:1550,y:780,w:340,h:50},
    {x:2050,y:1080,w:300,h:50},
    {x:2450,y:820,w:330,h:50},
    {x:2920,y:560,w:330,h:50},
    {x:3420,y:900,w:300,h:50},
    {x:3780,y:620,w:300,h:50},

    {x:1420,y:1180,w:70,h:660},
    {x:1930,y:870,w:70,h:900},
    {x:2690,y:650,w:70,h:1110},
    {x:3330,y:960,w:70,h:920},
  ];

  // 薄い足場：下から通過でき、上からは着地できる
  for(const p of platforms) p.oneWay = p.h <= 55 && p.w >= 180;

  const enemies = [
    {x:690,y:1470,w:64,h:78,hp:3,vx:0,flash:0,alive:true},
    {x:1270,y:970,w:64,h:78,hp:3,vx:0,flash:0,alive:true},
    {x:1710,y:1890,w:64,h:78,hp:4,vx:0,flash:0,alive:true},
    {x:2310,y:1680,w:64,h:78,hp:4,vx:0,flash:0,alive:true},
    {x:3000,y:480,w:64,h:78,hp:5,vx:0,flash:0,alive:true},
    {x:3600,y:1620,w:64,h:78,hp:5,vx:0,flash:0,alive:true},
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
    lastDirX:0, lastDirTimer:0
  };

  const camera = {x:0,y:0};
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
    player.comboWindow = .36;
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
    if(player.attackTimer>0) return;

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
      startAttack("airkick",.30);
      player.vx += 260*player.facing;
      return;
    }

    if(player.dashTimer>0){
      // ダッシュ攻撃：低く走り込んでから突き上げるアッパー
      startAttack("dashupper",.34);
      player.dashTimer=0;
      player.vx = 520*player.facing;
      player.vy = -180;
      return;
    }

    if(player.comboWindow>0) player.comboStep = (player.comboStep%3)+1;
    else player.comboStep=1;
    const types=["","jab","straight","kickup"];
    const durations=[0,.26,.29,.42];
    startAttack(types[player.comboStep],durations[player.comboStep]);
    if(player.comboStep===1) player.vx += 150*player.facing;
    if(player.comboStep===2) player.vx += 210*player.facing;
    if(player.comboStep===3) player.vx += 180*player.facing;
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
    player.dashTimer=.155;
    player.dashCooldown=.30;
    player.vx = 980*player.facing;
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
      player.vy=-980;
      player.grounded=false;
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

    for(const e of enemies){
      if(!e.alive) continue;
      e.flash=Math.max(0,e.flash-dt);
      e.x += e.vx*dt;
      e.vx *= Math.pow(.02,dt);
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
    ctx.save();
    ctx.translate(x+e.w/2,y+e.h/2);
    if(e.flash>0) ctx.globalAlpha=.45;

    ctx.fillStyle="#d86b4e";
    roundedRect(-25,-22,50,48,10); ctx.fill();
    ctx.fillStyle="#1b2430";
    roundedRect(-30,10,60,26,9); ctx.fill();
    ctx.fillStyle="#fff";
    ctx.beginPath(); ctx.arc(-10,-8,5,0,Math.PI*2); ctx.arc(10,-8,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#111";
    ctx.beginPath(); ctx.arc(-10,-8,2,0,Math.PI*2); ctx.arc(10,-8,2,0,Math.PI*2); ctx.fill();

    ctx.fillStyle="rgba(0,0,0,.35)";
    ctx.fillRect(-28,-48,56,7);
    ctx.fillStyle="#f85";
    ctx.fillRect(-28,-48,56*Math.max(0,e.hp/5),7);
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
      frontHand={x:wallX,y:-24 + 12*climb};
      backHand ={x:wallX-3,y:  3 - 12*climb};
      frontKnee={x:24,y:23}; backKnee={x:18,y:31};
      frontFoot={x:wallX-1,y:22 - 11*climb};
      backFoot ={x:wallX-4,y:48 + 11*climb};
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
      frontKnee={x:31+10*chamber,y:22-7*chamber};
      frontFoot={x:37+18*chamber+43*hit,y:43-18*chamber-22*hit+13*recover};
      backFoot={x:-30,y:39};
      tx=10*hit;
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
      tilt=-.11;
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

    // rear leg
    limb(-15,24,backKnee.x,backKnee.y,backFoot.x,backFoot.y,14,"#b9a08b");
    // front leg
    limb(15,24,frontKnee.x,frontKnee.y,frontFoot.x,frontFoot.y,15,"#b9a08b");

    // blue kung-fu jacket, brighter than black so it reads over dark background.
    ctx.fillStyle="#2f67d8";
    ctx.beginPath();
    ctx.moveTo(-26,-25);
    ctx.lineTo(21,-25);
    ctx.quadraticCurveTo(31,-18,30,-4);
    ctx.lineTo(28,28);
    ctx.lineTo(-28,28);
    ctx.lineTo(-31,-4);
    ctx.quadraticCurveTo(-31,-18,-26,-25);
    ctx.closePath();
    ctx.fill();

    // yellow trim
    ctx.strokeStyle="#f1c64c";
    ctx.lineWidth=5;
    ctx.beginPath();
    ctx.moveTo(-25,-22);
    ctx.lineTo(17,-22);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(5,-21);
    ctx.lineTo(7,25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-26,24);
    ctx.lineTo(27,24);
    ctx.stroke();

    // arms: on a wall both hands visibly reach the surface
    if(wallPose){
      // 奥の腕も胸の前で折ってから壁へ。手首だけ浮いて見えない形にする。
      const rearElbow={x:10,y:5};
      const frontElbow={x:27,y:-8};
      limb(-10,-7,rearElbow.x,rearElbow.y,backHand.x,backHand.y,11,"#b9a08b");
      limb(17,-9,frontElbow.x,frontElbow.y,frontHand.x,frontHand.y,12,"#b9a08b");

      // 壁に押し当てた手のひら
      ctx.fillStyle="#b9a08b";
      ctx.beginPath(); ctx.ellipse(backHand.x+1,backHand.y,7,5,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(frontHand.x+1,frontHand.y,7,5,0,0,Math.PI*2); ctx.fill();
    }else{
      limb(-14,-7,-23,3,-8,8,12,"#b9a08b");
      const elbow={x:(18+frontHand.x)/2+6,y:(-9+frontHand.y)/2};
      limb(18,-9,elbow.x,elbow.y,frontHand.x,frontHand.y,12,"#b9a08b");
    }

    // neck/collar
    ctx.fillStyle="#f1c64c";
    ctx.fillRect(-17,-33,36,9);

    // distinctly side-profile head: oval shifted forward.
    ctx.save();
    ctx.translate(2,-53);
    ctx.scale(.82,1);
    ctx.fillStyle="#b9a08b";
    ctx.beginPath();
    ctx.ellipse(0,0,31,29,0,0,Math.PI*2);
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
    ctx.ellipse(24,-47,13,10,0,0,Math.PI*2);
    ctx.fill();

    // nose
    ctx.fillStyle="#4b342f";
    ctx.beginPath();
    ctx.moveTo(33,-51); ctx.lineTo(40,-47); ctx.lineTo(33,-43); ctx.closePath(); ctx.fill();

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
      ctx.globalAlpha=.85;
      ctx.strokeStyle="#f8f4e8";
      ctx.lineWidth=4.5;
      ctx.lineCap="round";
      for(let i=-1;i<=1;i++){
        const yy=-18+i*22;
        ctx.beginPath();
        ctx.moveTo(-20,yy);
        ctx.lineTo(82,yy+5);
        ctx.stroke();
      }
      ctx.restore();
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
