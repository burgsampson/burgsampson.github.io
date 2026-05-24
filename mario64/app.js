/*
ts is useless - i just asked AI to make something so that the files can go through.
*/

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: true });

let DPR = Math.max(1, window.devicePixelRatio || 1);
function resize(){
  DPR = Math.max(1, window.devicePixelRatio || 1);
  const w = innerWidth;
  const h = innerHeight;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * DPR);
  canvas.height = Math.round(h * DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
addEventListener('resize', resize);
resize();

// Simple seeded RNG
function createRng(seed=Date.now()){
  let s = Number(seed) >>> 0;
  if(s===0) s = 2166136261 >>> 0;
  return function(){
    s += 0x6D2B79F5; s = s >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng = createRng();

// Shape class
class Shape {
  constructor(x,y,opts){
    this.x = x; this.y = y;
    this.vx = opts.vx; this.vy = opts.vy;
    this.size = opts.size;
    this.life = opts.life;
    this.maxLife = opts.life;
    this.color = opts.color;
    this.type = opts.type; // circle, rect, triangle
    this.rotation = opts.rotation || 0;
    this.spin = opts.spin || 0;
  }
  update(dt){
    this.vy += 120 * dt; // gravity
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.spin * dt;
    this.life -= dt;
  }
  draw(ctx){
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.fillStyle = this.color;
    if(this.type === 'circle'){
      ctx.beginPath();
      ctx.arc(0,0,this.size/2,0,Math.PI*2);
      ctx.fill();
    } else if(this.type === 'rect'){
      ctx.fillRect(-this.size/2,-this.size/2,this.size,this.size);
    } else {
      ctx.beginPath();
      ctx.moveTo(0,-this.size*0.6);
      ctx.lineTo(this.size*0.6, this.size*0.6);
      ctx.lineTo(-this.size*0.6, this.size*0.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

const shapes = [];
let last = performance.now();

function randRange(min,max){
  return rng()*(max-min)+min;
}

function randColor(){
  // purposeful color palette (warm + teal)
  const palettes = [
    ['#ff6b35','#ff8a00','#ffd85a'],
    ['#00c2a8','#00e5ff','#2db7ff'],
    ['#7b61ff','#ffd1f0','#ff6b99']
  ];
  const p = palettes[Math.floor(rng()*palettes.length)];
  return p[Math.floor(rng()*p.length)];
}

function spawnOne(x,y){
  const t = ['circle','rect','tri'][Math.floor(rng()*3)];
  const size = randRange(12,64);
  const speed = randRange(80,420);
  const angle = randRange(-Math.PI, Math.PI);
  const vx = Math.cos(angle)*speed;
  const vy = Math.sin(angle)*speed;
  const life = randRange(1.2,3.2);
  const color = randColor();
  const spin = randRange(-3,3);
  shapes.push(new Shape(x,y,{vx,vy,size,life,color,type:t,spin,rotation:randRange(0,Math.PI*2)}));
}

function burst(x,y,count=18){
  for(let i=0;i<count;i++) spawnOne(x,y);
}

function randomizeScene(){
  shapes.length = 0;
  const count = Math.floor(randRange(15,60));
  for(let i=0;i<count;i++){
    const x = randRange(40, innerWidth-40);
    const y = randRange(40, innerHeight-120);
    burst(x,y, Math.floor(randRange(6,18)));
  }
}

function clearScene(){
  shapes.length = 0;
}

function tick(now){
  const dt = Math.min(1/30, (now-last)/1000);
  last = now;
  // Update
  for(let i = shapes.length-1;i>=0;i--){
    const s = shapes[i];
    s.update(dt);
    // floor collision
    if(s.y + s.size/2 > innerHeight){
      s.y = innerHeight - s.size/2;
      s.vy *= -0.45;
      s.vx *= 0.8;
      if(Math.abs(s.vy) < 20) s.vy = 0;
    }
    // off-screen cleanup
    if(s.life <= 0 || s.x < -200 || s.x > innerWidth + 200) shapes.splice(i,1);
  }

  // Draw
  ctx.clearRect(0,0,innerWidth,innerHeight);

  // subtle background gradient
  const g = ctx.createLinearGradient(0,0,0,innerHeight);
  g.addColorStop(0,'rgba(255,255,255,0.02)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,innerWidth,innerHeight);

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(0, innerHeight - 48, innerWidth, 48);

  // draw shapes sorted by size for a bit of depth
  shapes.slice().sort((a,b)=>b.size-a.size).forEach(s=>s.draw(ctx));

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// UI interactions
document.getElementById('btn-rand').addEventListener('click', ()=> {
  rng = createRng(Math.floor(Math.random()*0xffffffff));
  randomizeScene();
});

document.getElementById('btn-burst').addEventListener('click', ()=>{
  // mid-screen burst
  burst(innerWidth/2, innerHeight/3 + randRange(-40,40), 28);
});

document.getElementById('btn-clear').addEventListener('click', ()=>{
  clearScene();
});

document.getElementById('btn-export').addEventListener('click', ()=>{
  // export a PNG with DPR 2 for nice quality
  const exportDPR = Math.min(3, Math.max(1, DPR));
  const tmpC = document.createElement('canvas');
  tmpC.width = Math.round(innerWidth * exportDPR);
  tmpC.height = Math.round(innerHeight * exportDPR);
  const tctx = tmpC.getContext('2d');
  tctx.scale(exportDPR, exportDPR);

  // draw current view onto temp canvas
  // fill bg
  const g = tctx.createLinearGradient(0,0,0,innerHeight);
  g.addColorStop(0,'rgba(255,255,255,0.02)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  tctx.fillStyle = g;
  tctx.fillRect(0,0,innerWidth,innerHeight);
  tctx.fillStyle = 'rgba(0,0,0,0.14)';
  tctx.fillRect(0, innerHeight - 48, innerWidth, 48);
  shapes.slice().sort((a,b)=>b.size-a.size).forEach(s=>s.draw(tctx));

  tmpC.toBlob((blob)=>{
    if(!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `random_play_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
  }, 'image/png');
});

// canvas touch/mouse spawn interaction
function getPointerPos(e){
  if(e.touches && e.touches[0]) return {x: e.touches[0].clientX, y: e.touches[0].clientY};
  return {x: e.clientX, y: e.clientY};
}
let pointerDown = false;
canvas.addEventListener('pointerdown', (e)=>{
  pointerDown = true;
  const p = getPointerPos(e);
  burst(p.x, p.y, Math.floor(randRange(8,20)));
});
canvas.addEventListener('pointermove', (e)=>{
  if(!pointerDown) return;
  const p = getPointerPos(e);
  spawnOne(p.x, p.y);
});
window.addEventListener('pointerup', ()=> pointerDown = false);

// Seed apply
document.getElementById('btn-seed').addEventListener('click', ()=>{
  const val = document.getElementById('seed').value.trim();
  if(val === ''){
    rng = createRng(Math.floor(Math.random()*0xffffffff));
  } else {
    // allow numeric seed or string -> hash
    const num = Number(val);
    if(!Number.isNaN(num)){
      rng = createRng(num);
    } else {
      // simple string hash
      let h = 2166136261 >>> 0;
      for(let i=0;i<val.length;i++) h = Math.imul(h ^ val.charCodeAt(i), 16777619) >>> 0;
      rng = createRng(h);
    }
  }
  randomizeScene();
});

// start with a random scene
rng = createRng(Math.floor(Math.random()*0xffffffff));
randomizeScene();