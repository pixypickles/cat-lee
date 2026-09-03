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

  function resolveCollisions(axis){
    player.grounded = false;
    player.onWall = 0;
    for(const p of platforms){
      if(!overlap(player,p)) continue;
      if(axis==="x"){
        if(player.vx>0){
          player.x = p.x-player.w;
          player.vx = 0;
          player.onWall = 1;
        }else if(player.vx<0){
          player.x = p.x+p.w;
          player.vx = 0;
          player.onWall = -1;
        }
      }else{
        if(player.vy>0){
          player.y = p.y-player.h;
          player.vy = 0;
          player.grounded = true;
          player.airDashAvailable = true;
        }else if(player.vy<0){
          player.y = p.y+p.h;
          player.vy = 0;
        }
      }
    }
  }

  function getWallContact(){
    const pad = 14;
    const inset = 10;
    const left = {x:player.x-pad,y:player.y+inset,w:pad,h:player.h-inset*2};
    const right= {x:player.x+player.w,y:player.y+inset,w:pad,h:player.h-inset*2};

    for(const p of platforms){
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
      case "dashclaw": hb={x:f>0?p.x+p.w-10:p.x-82,y:p.y+14,w:92,h:64,damage:3,kx:520*f,ky:-180}; break;
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
      const away=-player.wallLatchSide; player.facing=away; player.wallLatched=false; player.wallRef=null;
      if(input.y<-.35){ player.vx=560*away; player.vy=-720; startAttack("wallup",.38); }
      else if(input.y>.35){ player.vx=560*away; player.vy=620; startAttack("walldown",.38); }
      else { player.vx=840*away; player.vy=-90; startAttack("wallside",.36); }
      return;
    }
    const dir=Math.abs(input.x)>.25?Math.sign(input.x):(player.lastDirTimer>0?player.lastDirX:0);
    const backwards=dir!==0 && dir===-player.facing;
    // 後ろ+攻撃を最優先。直前0.20秒の後ろ入力も受付し、空中でも出せる。
    if(backwards){
      startAttack("somersault",.52); player.vx=-620*player.facing;
      player.vy=player.grounded?-520:-390; player.grounded=false; return;
    }
    if(!player.grounded){ startAttack("airkick",.38); player.vx+=300*player.facing; return; }
    if(input.y<-.38){ startAttack("upper",.40); player.vy=-300; player.vx+=90*player.facing; return; }
    if(player.dashTimer>0){ startAttack("dashbody",.42); player.vx=1160*player.facing; return; }
    if(player.comboWindow>0) player.comboStep=(player.comboStep%3)+1; else player.comboStep=1;
    const types=["","jab","straight","kickup"], d=[0,.32,.38,.54]; startAttack(types[player.comboStep],d[player.comboStep]);
    if(player.comboStep===1) player.vx+=210*player.facing;
    if(player.comboStep===2) player.vx+=290*player.facing;
    if(player.comboStep===3) player.vx+=280*player.facing;
  }
  function doClaw(){
    if(player.dashTimer>0 && player.attackTimer<=0){
      startAttack("dashclaw",.38);
      player.vx=650*player.facing;
      player.clawTrail=.28;
      return;
    }
    const contact = wallProbe();
    if(contact && !player.grounded){
      player.wallLatched = true;
      player.wallLatchSide = contact.side;
      player.wallRef = contact.platform;
      snapToWall(contact);
      player.vx=0;
      player.vy=0;
    }
  }

  function doDash(){
    if(player.dashCooldown>0) return;
    if(!player.grounded && !player.airDashAvailable) return;
    player.dashTimer=.20;
    player.dashCooldown=.30;
    player.vx = 1160*player.facing;
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
    player.dashCooldown=Math.max(0,player.dashCooldown-dt);
    player.invuln=Math.max(0,player.invuln-dt);
    player.clawTrail=Math.max(0,player.clawTrail-dt);
    player.lastDirTimer=Math.max(0,player.lastDirTimer-dt);
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
      if(player.dashTimer<=0 && player.attackType!=="dashbody" && player.attackType!=="dashclaw"){
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
      resolveCollisions("x");
    }
    player.y += player.vy*dt;
    resolveCollisions("y");

    if(player.wallLatched && player.wallRef){
      snapToWall({side:player.wallLatchSide, platform:player.wallRef});
    } else {
      wallProbe();
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
    g.addColorStop(0,"#121827");
    g.addColorStop(1,"#26364a");
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
    ctx.fillStyle="#263238";
    roundedRect(x,y,p.w,p.h,8); ctx.fill();
    ctx.fillStyle="#50616c";
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
    const bob=p.grounded && p.attackTimer<=0 ? Math.sin(p.animTime*12)*1.5 : 0;

    const durations = {
      jab:.23, straight:.23, kickup:.36, upper:.30, somersault:.42,
      airkick:.28, dashbody:.34, dashclaw:.38, wallup:.34, wallside:.32, walldown:.34
    };
    const dur=durations[p.attackType]||.25;
    const t=p.attackTimer>0 ? 1-Math.max(0,Math.min(1,p.attackTimer/dur)) : 0;
    const strike=Math.sin(Math.min(1,t)*Math.PI);

    let bodyRot=0, leanX=0, bodyY=0, headRot=0;
    let fs={x:18,y:-8}, bs={x:-16,y:-8};
    let fh={x:34,y:-2}, bh={x:-27,y:8};
    let fhip={x:13,y:24}, bhip={x:-14,y:24};
    let ff={x:18,y:47}, bf={x:-17,y:47};
    const type=p.attackType;

    if(type==="jab"){
      bodyRot=-.14*strike; leanX=7*strike;
      fh={x:58+8*strike,y:-11}; bh={x:-18,y:-2};
      ff={x:31,y:47}; bf={x:-28,y:48}; headRot=.06*strike;
    }else if(type==="straight"){
      bodyRot=-.32*strike; leanX=12*strike;
      fs={x:22,y:-13}; fh={x:70+10*strike,y:-14}; bh={x:-10,y:-3};
      ff={x:38,y:47}; bf={x:-34,y:49}; headRot=.12*strike;
    }else if(type==="kickup"){
      bodyRot=.22*strike; leanX=-7*strike; bodyY=-6*strike;
      fh={x:25,y:-7}; bh={x:-31,y:-14};
      ff={x:39+14*strike,y:-18-48*strike}; bf={x:-26,y:49}; headRot=-.12*strike;
    }else if(type==="upper"){
      bodyRot=-.22*strike; leanX=7*strike; bodyY=-12*strike;
      fh={x:30+12*strike,y:-64-18*strike}; bh={x:-25,y:2};
      ff={x:28,y:47}; bf={x:-29,y:50}; headRot=.1*strike;
    }else if(type==="somersault"){
      bodyRot=-Math.PI*1.65*t; bodyY=-18*Math.sin(Math.PI*t);
      fh={x:24,y:-17}; bh={x:-24,y:-18};
      ff={x:49,y:-8}; bf={x:-35,y:31}; headRot=.22;
    }else if(type==="airkick"){
      bodyRot=-.05*strike; leanX=13*strike;
      fh={x:-3,y:-22}; bh={x:-28,y:-6};
      ff={x:68+12*strike,y:4}; bf={x:-31,y:38}; headRot=.14*strike;
    }else if(type==="dashbody"){
      bodyRot=-.42*strike; leanX=21*strike; bodyY=9*strike;
      fs={x:22,y:-4}; fh={x:65+14*strike,y:13}; bh={x:-22,y:-10};
      ff={x:44,y:48}; bf={x:-38,y:50}; headRot=.18*strike;
    }else if(type==="dashclaw"){
      bodyRot=-.55*strike; leanX=11*strike;
      fs={x:19,y:-15}; fh={x:68+12*strike,y:-36+31*strike}; bh={x:-30,y:8};
      ff={x:38,y:47}; bf={x:-34,y:50}; headRot=.21*strike;
    }else if(type==="wallup"){
      bodyRot=-.46*strike; bodyY=-6*strike;
      ff={x:62,y:-23-23*strike}; bf={x:-24,y:40};
      fh={x:7,y:-26}; bh={x:-27,y:-9};
    }else if(type==="wallside"){
      bodyRot=-.34*strike; leanX=15*strike;
      ff={x:75+12*strike,y:3}; bf={x:-28,y:36};
      fh={x:-5,y:-21}; bh={x:-31,y:-5};
    }else if(type==="walldown"){
      bodyRot=.38*strike; leanX=10*strike;
      ff={x:55+10*strike,y:53+20*strike}; bf={x:-25,y:23};
      fh={x:4,y:-26}; bh={x:-30,y:-6};
    }else if(p.wallLatched){
      bodyRot=.07*p.wallLatchSide;
      fh={x:31,y:-19}; bh={x:25,y:8};
      ff={x:26,y:34}; bf={x:19,y:49};
    }else if(!p.grounded){
      bodyRot=-.09;
      fh={x:27,y:-13}; bh={x:-26,y:-10};
      ff={x:28,y:36}; bf={x:-28,y:43};
    }else if(Math.abs(p.vx)>60){
      const run=Math.sin(p.animTime*18);
      bodyRot=-.09*Math.sign(p.vx)*f;
      fh={x:30,y:-5+11*run}; bh={x:-26,y:4-11*run};
      ff={x:24+19*run,y:48}; bf={x:-20-19*run,y:48};
    }

    ctx.save();
    ctx.translate(x+leanX*f,y+bob+bodyY);
    ctx.scale(f,1);
    ctx.scale(1.15,1.15);

    if(p.clawTrail>0){
      ctx.save();
      ctx.globalAlpha=p.clawTrail/.28;
      ctx.strokeStyle="#e8d8ff";
      ctx.lineWidth=5;
      ctx.lineCap="round";
      for(let i=-1;i<=1;i++){
        ctx.beginPath();
        ctx.arc(35,-7+i*11,67,Math.PI*1.03,Math.PI*1.82);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.rotate(bodyRot);

    function limb(x1,y1,x2,y2,x3,y3,width,color){
      ctx.strokeStyle=color;
      ctx.lineWidth=width;
      ctx.lineCap="round";
      ctx.lineJoin="round";
      ctx.beginPath();
      ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.stroke();
    }

    ctx.strokeStyle="#c48757"; ctx.lineWidth=10; ctx.lineCap="round";
    ctx.beginPath();
    ctx.moveTo(-20,22);
    ctx.quadraticCurveTo(-60+9*Math.sin(p.animTime*7),9,-47,-33);
    ctx.stroke();

    let bk={x:(bhip.x+bf.x)/2-5,y:(bhip.y+bf.y)/2};
    let fk={x:(fhip.x+ff.x)/2+7,y:(fhip.y+ff.y)/2-2};
    if(["kickup","airkick","wallup","wallside","walldown","somersault"].includes(type) && p.attackTimer>0){
      fk={x:27,y:18};
    }
    limb(bhip.x,bhip.y,bk.x,bk.y,bf.x,bf.y,13,"#202838");
    limb(fhip.x,fhip.y,fk.x,fk.y,ff.x,ff.y,14,"#202838");

    ctx.fillStyle="#1f2a3b";
    roundedRect(-31,-28,62,60,13); ctx.fill();
    ctx.strokeStyle="#f4d07b"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(1,-23); ctx.lineTo(1,26); ctx.stroke();
    ctx.fillStyle="#a52222"; ctx.fillRect(-32,20,64,9);

    const fe={x:(fs.x+fh.x)/2+7,y:(fs.y+fh.y)/2};
    const be={x:(bs.x+bh.x)/2-6,y:(bs.y+bh.y)/2+3};
    limb(bs.x,bs.y,be.x,be.y,bh.x,bh.y,11,"#c48757");
    limb(fs.x,fs.y,fe.x,fe.y,fh.x,fh.y,12,"#c48757");

    ctx.save();
    ctx.translate(0,-45);
    ctx.rotate(headRot-bodyRot*.30);
    ctx.fillStyle="#c48757";
    ctx.beginPath(); ctx.arc(0,0,29,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-24,-16); ctx.lineTo(-13,-40); ctx.lineTo(-4,-19); ctx.fill();
    ctx.beginPath(); ctx.moveTo(24,-16); ctx.lineTo(13,-40); ctx.lineTo(4,-19); ctx.fill();
    ctx.fillStyle="#fff";
    ctx.beginPath(); ctx.arc(-9,-3,5,0,Math.PI*2); ctx.arc(9,-3,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#111";
    ctx.beginPath(); ctx.arc(-8,-3,2.4,0,Math.PI*2); ctx.arc(8,-3,2.4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#7a3f35";
    ctx.beginPath(); ctx.moveTo(-4,7); ctx.lineTo(4,7); ctx.lineTo(0,12); ctx.fill();
    ctx.restore();

    if(type==="dashclaw" && p.attackTimer>0){
      ctx.save();
      ctx.strokeStyle="rgba(255,255,255,.58)";
      ctx.lineWidth=3;
      for(let i=-1;i<=1;i++){
        ctx.beginPath();
        ctx.moveTo(fh.x-4,fh.y+i*5);
        ctx.lineTo(fh.x+30,fh.y-14+i*7);
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
