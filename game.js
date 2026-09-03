(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const stateText = document.getElementById("stateText");

  const WORLD = {
    width: 4200,
    height: 2200,
    gravity: 2500,
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
    airDashAvailable:true
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

  function wallProbe(){
    const pad = 5;
    const left = {x:player.x-pad,y:player.y+6,w:pad,h:player.h-12};
    const right= {x:player.x+player.w,y:player.y+6,w:pad,h:player.h-12};
    let side=0;
    for(const p of platforms){
      if(overlap(left,p)) side=-1;
      if(overlap(right,p)) side=1;
    }
    player.onWall = side;
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
      const away = -player.wallLatchSide;
      player.facing = away;
      player.wallLatched = false;
      if(input.y < -.35){
        player.vx = 430*away; player.vy=-520; startAttack("wallup",.3);
      }else if(input.y > .35){
        player.vx = 420*away; player.vy=470; startAttack("walldown",.3);
      }else{
        player.vx = 680*away; player.vy=-70; startAttack("wallside",.28);
      }
      return;
    }

    if(!player.grounded){
      startAttack("airkick",.25);
      return;
    }

    const backwards = input.x && Math.sign(input.x) === -player.facing;
    if(input.y < -.38){
      startAttack("upper",.28);
      player.vy = -80;
      return;
    }
    if(backwards){
      startAttack("somersault",.38);
      player.vx = -320*player.facing;
      player.vy = -260;
      return;
    }
    if(player.dashTimer>0){
      startAttack("dashbody",.34);
      player.vx = 760*player.facing;
      return;
    }

    if(player.comboWindow>0) player.comboStep = (player.comboStep%3)+1;
    else player.comboStep=1;
    startAttack(["","jab","straight","kickup"][player.comboStep], player.comboStep===3?.34:.22);
  }

  function doClaw(){
    if(player.dashTimer>0 && player.attackTimer<=0){
      startAttack("dashclaw",.38);
      player.vx=650*player.facing;
      player.clawTrail=.28;
      return;
    }
    wallProbe();
    if(player.onWall && !player.grounded){
      player.wallLatched = true;
      player.wallLatchSide = player.onWall;
      player.vx=0; player.vy=0;
    }
  }

  function doDash(){
    if(player.dashCooldown>0) return;
    if(!player.grounded && !player.airDashAvailable) return;
    player.dashTimer=.19;
    player.dashCooldown=.34;
    player.vx = 880*player.facing;
    if(!player.grounded) {
      player.vy *= .25;
      player.airDashAvailable=false;
    }
  }

  function doJump(){
    if(player.wallLatched){
      const away = -player.wallLatchSide;
      player.wallLatched=false;
      player.vx=540*away;
      player.vy=-780;
      player.facing=away;
      return;
    }
    wallProbe();
    if(player.onWall && !player.grounded){
      const away=-player.onWall;
      player.vx=520*away;
      player.vy=-760;
      player.facing=away;
      return;
    }
    if(player.grounded){
      player.vy=-800;
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

    if(input.attackPressed) doAttack();
    if(input.clawPressed) doClaw();
    if(input.dashPressed) doDash();
    if(input.jumpPressed) doJump();

    if(player.wallLatched){
      wallProbe();
      if(!player.onWall || player.grounded){
        player.wallLatched=false;
      } else {
        player.vx=0;
        player.vy=0;
        const side=player.wallLatchSide;
        player.x += side*1.5;

        // 「爪を押しながら上」で登る。爪を連打しても少しずつ登る。
        if(input.claw && input.y<-.25){
          player.vy=-210;
        } else if(input.clawPressed){
          player.vy=-280;
        }
      }
    } else {
      const maxSpeed = player.grounded ? 430 : 390;
      const accel = player.grounded ? 2600 : 1500;
      if(player.dashTimer<=0 && player.attackType!=="dashbody" && player.attackType!=="dashclaw"){
        const target=input.x*maxSpeed;
        player.vx += Math.sign(target-player.vx)*Math.min(Math.abs(target-player.vx), accel*dt);
        if(Math.abs(input.x)<.05 && player.grounded){
          player.vx *= Math.pow(.0008,dt);
        }
      }
      if(Math.abs(input.x)>.15) player.facing=Math.sign(input.x);
      player.vy += WORLD.gravity*dt;
      player.vy = Math.min(player.vy,1200);
    }

    player.x += player.vx*dt;
    resolveCollisions("x");
    player.y += player.vy*dt;
    resolveCollisions("y");
    wallProbe();

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
    const bob=p.grounded?Math.sin(p.animTime*12)*1.5:0;

    ctx.save();
    ctx.translate(x,y+bob);
    ctx.scale(f,1);

    if(p.clawTrail>0){
      ctx.save();
      ctx.globalAlpha=p.clawTrail/.28;
      ctx.strokeStyle="#e8d8ff";
      ctx.lineWidth=5;
      ctx.lineCap="round";
      for(let i=-1;i<=1;i++){
        ctx.beginPath();
        ctx.arc(34,-6+i*10,58,Math.PI*1.05,Math.PI*1.8);
        ctx.stroke();
      }
      ctx.restore();
    }

    const attacking=p.attackTimer>0;

    // tail
    ctx.strokeStyle="#c48757";
    ctx.lineWidth=10;
    ctx.lineCap="round";
    ctx.beginPath();
    ctx.moveTo(-20,24);
    ctx.quadraticCurveTo(-62,14,-45,-28);
    ctx.stroke();

    // legs
    ctx.strokeStyle="#202838";
    ctx.lineWidth=13;
    ctx.beginPath(); ctx.moveTo(-14,25); ctx.lineTo(-17,46); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(13,25); ctx.lineTo(18,46); ctx.stroke();

    // body kung-fu jacket
    ctx.fillStyle="#1f2a3b";
    roundedRect(-29,-24,58,56,12); ctx.fill();
    ctx.strokeStyle="#f4d07b";
    ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(0,-20); ctx.lineTo(0,26); ctx.stroke();

    // belt
    ctx.fillStyle="#a52222";
    ctx.fillRect(-30,20,60,8);

    // head
    ctx.fillStyle="#c48757";
    ctx.beginPath();
    ctx.arc(0,-42,28,0,Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-23,-58); ctx.lineTo(-12,-80); ctx.lineTo(-4,-60); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(23,-58); ctx.lineTo(12,-80); ctx.lineTo(4,-60); ctx.fill();

    // face
    ctx.fillStyle="#fff";
    ctx.beginPath(); ctx.arc(-9,-45,5,0,Math.PI*2); ctx.arc(9,-45,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#111";
    ctx.beginPath(); ctx.arc(-8,-45,2.4,0,Math.PI*2); ctx.arc(8,-45,2.4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#7a3f35";
    ctx.beginPath(); ctx.moveTo(-4,-35); ctx.lineTo(4,-35); ctx.lineTo(0,-30); ctx.fill();

    // arms / attack pose
    ctx.strokeStyle="#c48757";
    ctx.lineWidth=11;
    if(attacking){
      if(p.attackType==="upper"){
        ctx.beginPath(); ctx.moveTo(16,-12); ctx.lineTo(30,-55); ctx.stroke();
      }else if(["jab","straight","dashbody"].includes(p.attackType)){
        ctx.beginPath(); ctx.moveTo(15,-10); ctx.lineTo(47,-8); ctx.stroke();
      }else if(p.attackType==="dashclaw"){
        ctx.beginPath(); ctx.moveTo(13,-10); ctx.lineTo(49,-30); ctx.stroke();
      }else{
        ctx.beginPath(); ctx.moveTo(16,-8); ctx.lineTo(34,-17); ctx.stroke();
      }
    }else{
      ctx.beginPath(); ctx.moveTo(18,-8); ctx.lineTo(34,-2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-16,-8); ctx.lineTo(-27,8); ctx.stroke();

    // kick accent
    if(["kickup","airkick","wallup","wallside","walldown","somersault"].includes(p.attackType) && p.attackTimer>0){
      ctx.strokeStyle="#202838"; ctx.lineWidth=14;
      ctx.beginPath(); ctx.moveTo(12,24); ctx.lineTo(49,-3); ctx.stroke();
      ctx.strokeStyle="rgba(255,255,255,.25)"; ctx.lineWidth=4;
      ctx.beginPath(); ctx.moveTo(20,18); ctx.lineTo(62,-7); ctx.stroke();
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
