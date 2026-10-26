const W=540,H=960,CX=270,CY=480,WIN=10,TR=30,PI=Math.PI,CD=.45,LIM=1.15,SPD=820,N=9;
const cv=document.getElementById('cv'),mcx=cv.getContext('2d');let cx=mcx;
const bgC=document.createElement('canvas'),tgC=document.createElement('canvas'),TS=TR*2+40;
const $=id=>document.getElementById(id);
const COL=['#ff2e7e','#00e5ff'];          // 0 = rosa (embaixo), 1 = ciano (topo)
const NAME=['Rosa','Ciano'];
const ORIGIN=[{x:CX,y:H-74},{x:CX,y:74}];
const DIR=[-PI/2,PI/2];
const ICE={iceServers:[
  {urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'},
  {urls:'turn:openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'},
  {urls:'turn:openrelay.metered.ca:443',username:'openrelayproject',credential:'openrelayproject'},
  {urls:'turn:openrelay.metered.ca:443?transport=tcp',username:'openrelayproject',credential:'openrelayproject'}]};
let st=null,mode='menu',bot=false,me=0,flip=false,peer=null,conn=null,last=0,sendT=0,aimT=0,botT=1,botI=-1,botR=0,botErr=0,
    K=1,land=false,VW=W,VH=H,parts=[],prevAl=null,roomCode='',exitArm=0,lastRx=0,rq=1,aid=0,fpsA=0,fpsN=0,rqCool=0;
const bowC=[],scC=new Map(),BS=200,HW=140,HH=110;   // caches de sprites (arco e placar)
const demo=newState();
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const norm=a=>Math.atan2(Math.sin(a),Math.cos(a));

/* ---------- tela responsiva: retrato OU paisagem, nítida em qualquer densidade ---------- */
function resize(){
  const vw=window.innerWidth,vh=window.innerHeight;
  const sp=Math.min(vw/W,vh/H),sl=Math.min(vw/H,vh/W);
  land=sl>sp;
  VW=land?H:W;VH=land?W:H;
  const sc=Math.max(sp,sl),d=Math.min(window.devicePixelRatio||1,1.75)*rq;
  const cw=Math.floor(VW*sc),ch=Math.floor(VH*sc);
  const bw=Math.max(1,Math.round(cw*d)),bh=Math.max(1,Math.round(ch*d));
  cv.style.width=cw+'px';cv.style.height=ch+'px';
  if(bw===cv.width&&bh===cv.height&&bgC.width)return;   // evita recriar o canvas (causa de travadas)
  cv.width=bw;cv.height=bh;K=bw/VW;
  buildCaches();
}
function buildCaches(){
  // fundo e alvo são pré-desenhados uma vez (brilho/sombra é caro de refazer a cada quadro)
  const q=K;
  bgC.width=Math.round(W*q);bgC.height=Math.round(H*q);
  let c=bgC.getContext('2d');cx=c;c.setTransform(q,0,0,q,0,0);drawBg();
  tgC.width=tgC.height=Math.round(TS*q);
  c=tgC.getContext('2d');cx=c;c.setTransform(q,0,0,q,TS/2*q,TS/2*q);drawTargetBase();
  for(let p=0;p<2;p++)for(let r=0;r<2;r++){
    const b=bowC[p*2+r]||(bowC[p*2+r]=document.createElement('canvas'));
    b.width=b.height=Math.round(BS*q);
    c=b.getContext('2d');cx=c;c.setTransform(q,0,0,q,BS/2*q,BS/2*q);drawBowBase(p,!!r);
  }
  scC.clear();
  cx=mcx;
}
addEventListener('resize',resize);
addEventListener('orientationchange',()=>setTimeout(resize,150));
if(window.visualViewport)visualViewport.addEventListener('resize',resize);

/* ---------- alvos: padrões bem espaçados (nunca se sobrepõem nem saem da tela) ---------- */
const PATS=[
  // grade 3x3
  [[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]].map(a=>[a[0]*100,a[1]*100]),
  // espiral (ângulo de ouro)
  Array.from({length:N},(_,i)=>{const r=78*Math.sqrt(i+.5),a=i*2.39996;return[Math.cos(a)*r,Math.sin(a)*r]}),
  // anel com centro
  [[0,0],...Array.from({length:8},(_,i)=>[Math.cos(i*PI/4)*140,Math.sin(i*PI/4)*140])],
  // dois anéis (3 dentro, 6 fora)
  [...Array.from({length:3},(_,i)=>[Math.cos(i*2*PI/3-PI/2)*80,Math.sin(i*2*PI/3-PI/2)*80]),
   ...Array.from({length:6},(_,i)=>[Math.cos(i*PI/3)*165,Math.sin(i*PI/3)*165])]
];
const PSPD=[.45,-.4,.5,-.35];
function tpos(pat,i,t){
  const b=PATS[pat][i],a=t*PSPD[pat],c=Math.cos(a),s=Math.sin(a);
  return {x:CX+b[0]*c-b[1]*s,y:CY+b[0]*s+b[1]*c};
}

/* ---------- simulação ---------- */
function newState(){return{t:0,sc:[0,0],pat:0,al:Array(N).fill(true),ar:[],cd:[0,0],win:-1,resp:0,off:[0,0]}}
const aimOf=p=>DIR[p]+st.off[p];
function fire(p){
  if(!st||st.win>=0||st.cd[p]>0)return;
  const a=aimOf(p),o=ORIGIN[p],x=o.x+Math.cos(a)*56,y=o.y+Math.sin(a)*56;
  st.ar.push({x,y,px:x,py:y,vx:Math.cos(a)*SPD,vy:Math.sin(a)*SPD,o:p,id:++aid});
  st.cd[p]=CD;
}
function move(dt){
  st.t+=dt;
  for(const a of st.ar){a.px=a.x;a.py=a.y;a.x+=a.vx*dt;a.y+=a.vy*dt}
  st.ar=st.ar.filter(a=>a.x>-80&&a.x<W+80&&a.y>-80&&a.y<H+80);
}
function segDist(px,py,ax,ay,bx,by){
  const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy;let t=l?((px-ax)*dx+(py-ay)*dy)/l:0;t=clamp(t,0,1);
  return Math.hypot(px-(ax+dx*t),py-(ay+dy*t));
}
function step(dt){
  move(dt);
  st.cd[0]=Math.max(0,st.cd[0]-dt);st.cd[1]=Math.max(0,st.cd[1]-dt);
  if(st.win>=0)return;
  // colisão "varrida": a flecha não atravessa o alvo, mesmo em alta velocidade
  for(const a of st.ar){
    for(let i=0;i<N;i++){
      if(!st.al[i])continue;
      const p=tpos(st.pat,i,st.t);
      if(segDist(p.x,p.y,a.px,a.py,a.x,a.y)<TR+4){
        st.al[i]=false;a.x=-999;st.sc[a.o]++;
        if(st.sc[a.o]>=WIN)st.win=a.o;
        break;
      }
    }
  }
  st.ar=st.ar.filter(a=>a.x>-100);
  if(!st.al.some(Boolean)){
    st.resp+=dt;
    if(st.resp>.9){st.pat=(st.pat+1)%PATS.length;st.al.fill(true);st.resp=0;st.ar=[];botI=-1}
  }
  if(bot)runBot(dt);
}
function runBot(dt){
  const o=ORIGIN[1];
  botR-=dt;
  if(botI<0||!st.al[botI]||botR<=0){
    const l=[];st.al.forEach((v,i)=>{if(v)l.push(i)});
    botI=l.length?l[Math.random()*l.length|0]:-1;botR=1+Math.random();
  }
  if(botI<0)return;
  let p=tpos(st.pat,botI,st.t);
  for(let k=0;k<3;k++){const tt=Math.hypot(p.x-o.x,p.y-o.y)/SPD;p=tpos(st.pat,botI,st.t+tt)}
  const want=clamp(norm(Math.atan2(p.y-o.y,p.x-o.x)-DIR[1])+botErr,-LIM,LIM);
  const diff=want-st.off[1],ms=1.3*dt;
  st.off[1]+=Math.abs(diff)<ms?diff:Math.sign(diff)*ms;
  botT-=dt;
  if(botT<=0&&st.cd[1]<=0&&Math.abs(diff)<.04){fire(1);botT=.6+Math.random()*.9;botErr=(Math.random()-.5)*.36}
}

/* ---------- desenho neon ---------- */
const glow=(c,b)=>{cx.shadowColor=c;cx.shadowBlur=b};
const noGlow=()=>{cx.shadowBlur=0};
function drawBg(){
  cx.fillStyle='#060a14';cx.fillRect(0,0,W,H);
  const g=cx.createRadialGradient(CX,CY,20,CX,CY,420);
  g.addColorStop(0,'rgba(0,229,255,.12)');g.addColorStop(1,'rgba(0,0,0,0)');
  cx.fillStyle=g;cx.fillRect(0,0,W,H);
  cx.strokeStyle='rgba(0,229,255,.08)';cx.lineWidth=1;cx.beginPath();
  for(let x=0;x<=W;x+=45){cx.moveTo(x,0);cx.lineTo(x,H)}
  for(let y=0;y<=H;y+=45){cx.moveTo(0,y);cx.lineTo(W,y)}
  cx.stroke();
  cx.setLineDash([10,14]);cx.strokeStyle='rgba(255,255,255,.16)';
  cx.beginPath();cx.moveTo(0,CY);cx.lineTo(W,CY);cx.stroke();cx.setLineDash([]);
  cx.lineWidth=5;
  glow(COL[1],16);cx.strokeStyle=COL[1];cx.beginPath();cx.moveTo(0,2);cx.lineTo(W,2);cx.stroke();
  glow(COL[0],16);cx.strokeStyle=COL[0];cx.beginPath();cx.moveTo(0,H-2);cx.lineTo(W,H-2);cx.stroke();
  noGlow();
}
function drawTargetBase(){
  cx.fillStyle='rgba(255,196,0,.14)';cx.beginPath();cx.arc(0,0,TR,0,PI*2);cx.fill();
  glow('#ffc400',12);cx.strokeStyle='#ffc400';cx.lineWidth=4;
  cx.beginPath();cx.arc(0,0,TR-2,0,PI*2);cx.stroke();
  cx.lineWidth=3;cx.strokeStyle='#fff';
  cx.beginPath();cx.arc(0,0,TR-11,0,PI*2);cx.stroke();
  cx.fillStyle='#ff3d3d';cx.beginPath();cx.arc(0,0,6,0,PI*2);cx.fill();
  noGlow();
}
function drawTarget(x,y,t){
  cx.drawImage(tgC,x-TS/2,y-TS/2,TS,TS);
  cx.save();cx.translate(x,y);cx.lineWidth=3;cx.strokeStyle='#ff9100';
  for(let i=0;i<3;i++){cx.beginPath();cx.arc(0,0,TR+5,t*2+i*2.09,t*2+i*2.09+.6);cx.stroke()}
  cx.restore();
}
function localCtl(p){return mode==='local2'||p===me}
function drawBowBase(p,ready){
  const c=COL[p];cx.lineCap='round';
  glow(c,8);cx.strokeStyle=c;cx.lineWidth=8;
  cx.beginPath();cx.arc(-26,0,70,-1.15,1.15);cx.stroke();
  const ex=-26+70*Math.cos(1.15),ey=70*Math.sin(1.15),pull=ready?-36:-4;
  cx.strokeStyle='#fff';cx.lineWidth=2;cx.beginPath();cx.moveTo(ex,-ey);cx.lineTo(pull,0);cx.lineTo(ex,ey);cx.stroke();
  if(ready){
    cx.strokeStyle='#fff';cx.lineWidth=5;cx.beginPath();cx.moveTo(-36,0);cx.lineTo(44,0);cx.stroke();
    cx.fillStyle='#fff';cx.beginPath();cx.moveTo(62,0);cx.lineTo(40,-11);cx.lineTo(40,11);cx.fill();
    cx.fillStyle=c;cx.beginPath();cx.moveTo(-36,0);cx.lineTo(-52,-10);cx.lineTo(-44,0);cx.lineTo(-52,10);cx.fill();
  }
  noGlow();
}
function drawBow(S,p){
  const o=ORIGIN[p],a=DIR[p]+S.off[p],c=COL[p],ready=S.cd[p]<=0;
  cx.save();cx.translate(o.x,o.y);
  cx.lineWidth=4;cx.strokeStyle='rgba(255,255,255,.12)';
  cx.beginPath();cx.arc(0,0,64,0,PI*2);cx.stroke();
  cx.strokeStyle=c;
  cx.beginPath();cx.arc(0,0,64,DIR[p]-PI/2,DIR[p]-PI/2+PI*2*(1-S.cd[p]/CD));cx.stroke();
  cx.rotate(a);
  if(ready&&st&&localCtl(p)){
    cx.lineCap='round';cx.setLineDash([4,12]);cx.strokeStyle=c;cx.globalAlpha=.4;cx.lineWidth=2;
    cx.beginPath();cx.moveTo(70,0);cx.lineTo(440,0);cx.stroke();cx.setLineDash([]);cx.globalAlpha=1;
  }
  const spr=bowC[p*2+(ready?1:0)];
  if(spr&&spr.width)cx.drawImage(spr,-BS/2,-BS/2,BS,BS);
  cx.restore();
}
function w2v(x,y){
  if(flip){x=W-x;y=H-y}
  return land?{x:y,y:W-x}:{x,y};
}
function scSpr(p,t){
  const k=p+':'+t;let c=scC.get(k);
  if(!c){
    c=document.createElement('canvas');c.width=Math.round(HW*K);c.height=Math.round(HH*K);
    const g=c.getContext('2d'),sv=cx;cx=g;
    g.setTransform(K,0,0,K,HW/2*K,HH/2*K);
    g.textBaseline='middle';g.textAlign='center';
    glow(COL[p],12);g.fillStyle=COL[p];g.font='900 46px Orbitron,monospace';g.fillText(t,0,0);noGlow();
    g.font='700 13px Orbitron,monospace';g.fillStyle='#8aa';g.fillText('/'+WIN,0,32);
    cx=sv;scC.set(k,c);
  }
  return c;
}
if(document.fonts&&document.fonts.load)document.fonts.load('900 46px Orbitron').then(()=>scC.clear()).catch(()=>{});
function drawHud(S){
  for(let p=0;p<2;p++){
    const wp=p===0?{x:64,y:H-52}:{x:W-64,y:52},v=w2v(wp.x,wp.y);
    cx.save();cx.translate(v.x,v.y);
    if(mode==='local2'&&!land&&p===1)cx.rotate(PI);
    cx.drawImage(scSpr(p,S.sc[p]),-HW/2,-HH/2,HW,HH);
    cx.restore();
  }
  cx.textAlign='center';cx.textBaseline='middle';cx.font='700 11px Orbitron,monospace';
  cx.fillStyle=exitArm>0?'#ffd0e0':'rgba(138,170,170,.45)';
  cx.fillText(exitArm>0?'TOQUE DE NOVO PARA SAIR':'✕ SAIR (Esc)',VW/2,16);
}
function draw(){
  const S=st||demo;
  cx.setTransform(1,0,0,1,0,0);cx.clearRect(0,0,cv.width,cv.height);
  if(land)cx.setTransform(0,-K,K,0,0,W*K);else cx.setTransform(K,0,0,K,0,0);
  cx.save();
  if(flip){cx.translate(W,H);cx.rotate(PI)}
  if(bgC.width)cx.drawImage(bgC,0,0,W,H);
  for(let i=0;i<N;i++)if(S.al[i]){const p=tpos(S.pat,i,S.t);drawTarget(p.x,p.y,S.t)}
  drawBow(S,0);drawBow(S,1);
  for(const a of S.ar){
    const l=Math.hypot(a.vx,a.vy),ux=a.vx/l,uy=a.vy/l,c=COL[a.o];
    const g=cx.createLinearGradient(a.x-ux*90,a.y-uy*90,a.x,a.y);
    g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,c);
    cx.lineCap='round';cx.strokeStyle=g;cx.lineWidth=5;
    cx.beginPath();cx.moveTo(a.x-ux*90,a.y-uy*90);cx.lineTo(a.x,a.y);cx.stroke();
    cx.fillStyle=c;cx.globalAlpha=.35;cx.beginPath();cx.arc(a.x,a.y,10,0,PI*2);cx.fill();cx.globalAlpha=1;
    cx.fillStyle='#fff';cx.beginPath();cx.arc(a.x,a.y,5,0,PI*2);cx.fill();
  }
  for(const q of parts){
    cx.globalAlpha=Math.max(0,q.l*2);cx.fillStyle=q.c;cx.fillRect(q.x-2,q.y-2,4,4);
  }
  cx.globalAlpha=1;
  cx.restore();
  // HUD sempre "em pé" na tela, em retrato ou paisagem
  cx.setTransform(K,0,0,K,0,0);
  if(st)drawHud(st);
}
function fx(dt){
  if(prevAl){
    for(let i=0;i<N;i++)if(prevAl[i]&&!st.al[i]&&parts.length<200){
      const p=tpos(st.pat,i,st.t);
      for(let n=0;n<18;n++){const a=Math.random()*PI*2,s=80+Math.random()*220;
        parts.push({x:p.x,y:p.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:.5,c:n%2?'#ffc400':'#fff'})}
    }
  }else prevAl=new Array(N);
  for(let i=0;i<N;i++)prevAl[i]=st.al[i];
  let j=0;
  for(let i=0;i<parts.length;i++){const q=parts[i];q.x+=q.vx*dt;q.y+=q.vy*dt;q.l-=dt;if(q.l>0)parts[j++]=q}
  parts.length=j;
}

/* ---------- loop ---------- */
const keys=new Set();
function keyTurn(dt){
  if(!st||st.win>=0)return;
  const R=1.9*dt,L=k=>keys.has(k);
  const turn=(p,d)=>{if(d)setOff(p,st.off[p]+d)};
  if(mode==='local2'){
    turn(0,(L('KeyD')?R:0)-(L('KeyA')?R:0));
    turn(1,(L('ArrowLeft')?R:0)-(L('ArrowRight')?R:0)); // topo: ▶ mira para a direita da tela
  }else turn(me,(L('ArrowRight')||L('KeyD')?R:0)-(L('ArrowLeft')||L('KeyA')?R:0));
}
function loop(ts){
  requestAnimationFrame(loop);
  try{frame(ts)}catch(err){console.error(err)}
}
function frame(ts){
  const rawMs=ts-last,dt=Math.min(.05,rawMs/1000||0);last=ts;
  // qualidade adaptativa: se o aparelho estiver lento, reduz a resolução do canvas
  if(rawMs>0&&rawMs<100){fpsA+=rawMs;if(++fpsN>=60){
    const avg=fpsA/fpsN;fpsA=0;fpsN=0;
    if(avg>28&&rq>.55&&performance.now()>rqCool){rq=Math.max(.55,rq*.8);rqCool=performance.now()+3000;resize()}
  }}
  if(exitArm>0)exitArm-=dt;
  if(!st){demo.t+=dt;draw();return}
  keyTurn(dt);
  if(mode==='guest'){move(dt);st.cd[0]=Math.max(0,st.cd[0]-dt);st.cd[1]=Math.max(0,st.cd[1]-dt)}else step(dt);
  const net=(mode==='host'||mode==='guest')&&conn&&conn.open;
  if(net){
    // vigia: se nada chegar por 10s a conexão caiu em silêncio — volta ao menu em vez de "travar"
    if(performance.now()-lastRx>10000){const m=mode==='host'?'O outro jogador perdeu a conexão.':'Conexão com a sala perdida.';toMenu();show('p-online');msg(m);return}
  }
  if(mode==='host'&&net&&(sendT+=dt)>.04){
    sendT=0;
    const dc=conn.dataChannel;
    if(!dc||dc.bufferedAmount<16000){try{conn.send(snap())}catch(e){}}   // não enche a fila se a rede estiver lenta
  }
  if(mode==='guest'&&net&&(aimT+=dt)>.04&&aimDirty){aimT=0;aimDirty=false;try{conn.send({a:st.off[me]})}catch(e){}}
  fx(dt);draw();
  const over=st.win>=0;
  $('p-end').classList.toggle('hidden',!over);
  if(over){
    $('end-t').textContent=mode==='local2'?NAME[st.win]+' venceu!':(st.win===me?'Você venceu! 🏆':'Você perdeu!');
    $('b-again').classList.toggle('hidden',mode==='guest');
  }
}
function start(m){
  mode=m;st=newState();parts=[];prevAl=null;botI=-1;aimDirty=false;exitArm=0;lastRx=performance.now();
  $('ui').classList.add('hidden');
  resize();
}
function toMenu(){
  st=null;mode='menu';flip=false;roomCode='';ptr.clear();keys.clear();
  if(conn){try{conn.close()}catch(e){}conn=null}
  if(peer){try{peer.destroy()}catch(e){}peer=null}
  $('ui').classList.remove('hidden');$('p-end').classList.add('hidden');
  $('b-copy').classList.add('hidden');show('p-main');
}

/* ---------- online (PeerJS) — PC, celular e tablet juntos ---------- */
let aimDirty=false;
const snap=()=>({t:st.t,sc:st.sc,pat:st.pat,al:st.al,win:st.win,off:st.off,cd:st.cd,
  ar:st.ar.map(a=>[a.x|0,a.y|0,a.vx|0,a.vy|0,a.o,a.id|0])});
function applySnap(d){
  lastRx=performance.now();
  if(!st||!d||d.f||d.a!==undefined||d.p)return;
  // suaviza o relógio e as flechas em vez de "teleportar" a cada pacote (era a causa das travadinhas online)
  const dT=d.t-st.t;
  if(Math.abs(dT)>.4)st.t=d.t;else st.t+=dT*.3;
  st.sc=d.sc;st.pat=d.pat;st.al=d.al;st.win=d.win;
  const old=new Map();for(const a of st.ar)old.set(a.id,a);
  st.ar=d.ar.map(r=>{
    const o=old.get(r[5]);
    if(o){
      const ex=r[0]-o.x,ey=r[1]-o.y;
      if(ex*ex+ey*ey>3600){o.x=r[0];o.y=r[1]}else{o.x+=ex*.3;o.y+=ey*.3}
      o.vx=r[2];o.vy=r[3];return o;
    }
    return {x:r[0],y:r[1],px:r[0],py:r[1],vx:r[2],vy:r[3],o:r[4],id:r[5]};
  });
  const oth=1-me;
  st.off[oth]+=(d.off[oth]-st.off[oth])*.4;
  st.cd[oth]=d.cd[oth];
  if(d.cd[me]>st.cd[me])st.cd[me]=d.cd[me];
}
const msg=t=>$('msg').textContent=t;
const rcode=()=>Array.from({length:4},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random()*24|0]).join('');
const roomLink=()=>location.origin+location.pathname+'?sala='+roomCode;
function createRoom(){
  if(typeof Peer==='undefined')return msg('Biblioteca online não carregou. Verifique a internet.');
  roomCode=rcode();
  peer=new Peer('tjam-'+roomCode,{config:ICE});
  peer.on('disconnected',()=>{try{peer.reconnect()}catch(e){}});
  peer.on('open',()=>{msg('Sala '+roomCode+' criada!\nEnvie o código ou o link e aguarde o outro jogador...');$('b-copy').classList.remove('hidden')});
  peer.on('error',e=>{
    if(e.type==='unavailable-id'){peer.destroy();peer=null;createRoom()}
    else{msg('Erro de conexão: '+e.type);peer=null}
  });
  peer.on('connection',c=>{
    if(conn){c.close();return}
    conn=c;
    c.on('open',()=>{me=0;flip=false;bot=false;start('host')});
    c.on('data',d=>{
      lastRx=performance.now();
      if(!d||!st)return;
      if(typeof d.a==='number'&&isFinite(d.a))st.off[1]=clamp(d.a,-LIM,LIM);
      if(d.f)fire(1);
    });
    c.on('close',()=>{if(mode==='host'){toMenu();show('p-online');msg('O outro jogador saiu.')}});
  });
}
function joinRoom(){
  const code=$('code').value.trim().toUpperCase();
  if(code.length<4)return msg('Digite o código de 4 letras.');
  if(typeof Peer==='undefined')return msg('Biblioteca online não carregou. Verifique a internet.');
  msg('Conectando...');
  peer=new Peer({config:ICE});
  peer.on('error',e=>{msg(e.type==='peer-unavailable'?'Sala não encontrada.':'Erro de conexão: '+e.type)});
  peer.on('open',()=>{
    conn=peer.connect('tjam-'+code,{reliable:true});
    const to=setTimeout(()=>{if(mode!=='guest')msg('Não foi possível conectar. Confira o código.')},12000);
    conn.on('open',()=>{clearTimeout(to);me=1;flip=true;bot=false;start('guest')});
    conn.on('data',applySnap);
    conn.on('close',()=>{if(mode==='guest'){toMenu();show('p-online');msg('A sala foi fechada.')}});
  });
}

/* ---------- controles NOVOS ----------
   Toque/caneta : arraste para girar o arco (qualquer lugar da tela), solte para atirar
   Mouse        : o arco mira no cursor, clique atira
   Teclado      : ◀ ▶ / A D giram, Espaço/Enter atira, Esc sai
   Local 2P     : cada jogador usa a sua metade da tela                                */
function setOff(p,v){
  if(!isFinite(v))return;
  v=clamp(v,-LIM,LIM);
  if(!st||st.off[p]===v)return;
  st.off[p]=v;
  if(mode==='guest'&&p===me)aimDirty=true;
}
function doFire(p){
  if(!st||st.win>=0)return;
  if(mode==='guest'){
    if(conn&&conn.open){conn.send({f:1,a:st.off[me]});st.cd[me]=CD}
  }else fire(p);
}
const ptr=new Map();
function toWorld(e){
  const r=cv.getBoundingClientRect();
  const u=(e.clientX-r.left)/r.width*VW,v=(e.clientY-r.top)/r.height*VH;
  let x,y;
  if(land){y=u;x=W-v}else{x=u;y=v}
  if(flip){x=W-x;y=H-y}
  return {x,y,u,v};
}
const playerAt=w=>mode==='local2'?(w.y>CY?0:1):me;
function aimAt(p,w){
  const o=ORIGIN[p];
  if(Math.hypot(w.x-o.x,w.y-o.y)<24)return;
  setOff(p,norm(Math.atan2(w.y-o.y,w.x-o.x)-DIR[p]));
}
cv.addEventListener('pointerdown',e=>{
  if(!st||st.win>=0)return;
  const w=toWorld(e);
  if(w.v<42&&Math.abs(w.u-VW/2)<110){            // faixa discreta "SAIR" no topo
    if(exitArm>0){toMenu();return}
    exitArm=2.2;return;
  }
  const p=playerAt(w);
  if(e.pointerType==='mouse'){aimAt(p,w);doFire(p);return}
  try{cv.setPointerCapture(e.pointerId)}catch(_){}
  ptr.set(e.pointerId,{p,x0:w.x,off0:st.off[p]});
});
cv.addEventListener('pointermove',e=>{
  if(!st||st.win>=0)return;
  const w=toWorld(e);
  if(e.pointerType==='mouse'){aimAt(playerAt(w),w);return}
  const s=ptr.get(e.pointerId);if(!s)return;
  const sign=s.p===0?1:-1;                          // arrastar "para a direita do jogador" gira o arco para a direita dele
  setOff(s.p,s.off0+sign*(w.x-s.x0)*(LIM/190));
});
const endPtr=(e,shoot)=>{
  const s=ptr.get(e.pointerId);if(!s)return;
  ptr.delete(e.pointerId);
  if(shoot&&st&&st.win<0)doFire(s.p);
};
cv.addEventListener('pointerup',e=>endPtr(e,true));
cv.addEventListener('pointercancel',e=>endPtr(e,false));
cv.addEventListener('contextmenu',e=>e.preventDefault());

addEventListener('keydown',e=>{
  if(!st||mode==='menu')return;
  if(e.code==='Escape'){toMenu();return}
  const used=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyS','KeyW','Space','Enter'];
  if(!used.includes(e.code))return;
  e.preventDefault();
  keys.add(e.code);
  if(e.repeat)return;
  if(mode==='local2'){
    if(e.code==='Space'||e.code==='KeyS')doFire(0);
    else if(e.code==='ArrowUp'||e.code==='KeyW')doFire(1);
  }else if(e.code==='Space'||e.code==='Enter'||e.code==='ArrowUp'||e.code==='ArrowDown')doFire(me);
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>keys.clear());

setInterval(()=>{if(conn&&conn.open&&(mode==='host'||mode==='guest')){try{conn.send({p:1})}catch(e){}}},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)lastRx=performance.now()});

/* ---------- menus ---------- */
function show(id){document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('hidden',p.id!==id))}
$('b-online').onclick=()=>{msg('');show('p-online')};
$('b-local').onclick=()=>show('p-local');
document.querySelectorAll('.back').forEach(b=>b.onclick=toMenu);
$('b-create').onclick=()=>{if(peer)return;msg('Criando sala...');createRoom()};
$('b-join').onclick=()=>{if(peer){try{peer.destroy()}catch(e){}peer=null}joinRoom()};
$('b-copy').onclick=async()=>{
  try{await navigator.clipboard.writeText(roomLink());msg('Link copiado! Sala '+roomCode)}
  catch(e){msg('Copie o link: '+roomLink())}
};
$('b-1p').onclick=()=>{bot=true;me=0;flip=false;start('local1')};
$('b-2p').onclick=()=>{bot=false;me=0;flip=false;start('local2')};
$('b-again').onclick=()=>{st=newState();parts=[];prevAl=null;botI=-1};
$('b-menu').onclick=toMenu;
$('code').addEventListener('keydown',e=>{if(e.key==='Enter')$('b-join').click()});

/* entrar direto por link: ?sala=ABCD */
const qs=new URLSearchParams(location.search).get('sala');
if(qs){show('p-online');$('code').value=qs.slice(0,4).toUpperCase();setTimeout(()=>$('b-join').click(),300)}
resize();
requestAnimationFrame(ts=>{last=ts;requestAnimationFrame(loop)});
