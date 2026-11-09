(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('gameCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const screen = $('gameScreen');
  const overlay = $('gameOverlay');
  const scoreValue = $('scoreValue');
  const soundToggle = $('soundToggle');
  const games = {
    flappy:{title:'FLAPPY LUNA',symbol:'☾',hint:'TAP TO FLY · SPACE TO FLAP',start:'Tap to flap through the glowing moon gates. Every gate is a point.',over:'The night got you. One more flight?',color:'#cfb2ff'},
    runner:{title:'LUNA RUN',symbol:'✦',hint:'SWIPE LEFT / RIGHT · UP TO JUMP · DOWN TO SLIDE',start:'Change lanes, jump over barriers and collect moon coins.',over:'The run is over. Ready for another dash?',color:'#f4c98b'},
    jumper:{title:'SKY JUMPER',symbol:'✧',hint:'TAP LEFT / RIGHT SIDE · ARROW KEYS',start:'Keep bouncing upward. Land on platforms and keep climbing.',over:'You reached the clouds. Try to climb higher!',color:'#9ce9ff'},
    space:{title:'STAR BLASTER',symbol:'✦',hint:'DRAG TO MOVE · AUTO FIRE',start:'Slide your ship across the sky and dodge the incoming swarm.',over:'The stars are quiet again. Launch another mission?',color:'#9ce9ff'},
    brick:{title:'NEON BREAKER',symbol:'▰',hint:'DRAG OR MOVE TO CONTROL THE PADDLE',start:'Keep the energy orb alive and clear every glowing block.',over:'The orb slipped away. Reset and try again.',color:'#f4a9df'},
    racer:{title:'NEON RACER',symbol:'◈',hint:'SWIPE LEFT / RIGHT · ARROW KEYS',start:'Three lanes. Endless neon. Avoid traffic and collect stars.',over:'The road ends here. Can you beat your record?',color:'#f4a9df'}
  };
  const keys = Object.create(null);
  let current = null, state = 'menu', raf = 0, lastTime = 0, score = 0, coins = 0, distance = 0, soundOn = false, audio = null;
  let pointerDown = false, pointerX = W/2, swipeStart = null, game = {};
  const storage = {
    read(){try{return JSON.parse(localStorage.getItem('luna_arcade_v1')||'{}')}catch(_){return {}}},
    write(data){try{localStorage.setItem('luna_arcade_v1',JSON.stringify(data))}catch(_){}}
  };
  let records = storage.read();
  const bestOf = (id) => Number((records.best||{})[id]||0);
  function refreshStats(){
    const bests = Object.values(records.best||{}).map(Number);
    $('bestOverall').textContent = Math.max(0,...bests).toLocaleString();
    $('gamesPlayed').textContent = Number(records.played||0).toLocaleString();
    $('arcadeCoins').textContent = Number(records.coins||0).toLocaleString();
    document.querySelectorAll('[data-best]').forEach(el=>el.textContent='BEST '+bestOf(el.dataset.best).toLocaleString());
  }
  function saveResult(){
    records.best=records.best||{};
    if(score>bestOf(current)) records.best[current]=score;
    records.played=Number(records.played||0)+1;
    records.coins=Number(records.coins||0)+coins;
    storage.write(records); refreshStats();
  }
  function setScore(value){score=Math.max(0,Math.floor(value));scoreValue.textContent=score.toLocaleString()}
  function tone(freq,duration=.06){
    if(!soundOn)return;
    try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(.045,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration)}catch(_){}
  }
  function openGame(id){
    if(!games[id])return;
    current=id;state='ready';screen.classList.add('active');screen.setAttribute('aria-hidden','false');
    $('gameTitle').textContent=games[id].title;$('controlHint').textContent=games[id].hint;$('overlaySymbol').textContent=games[id].symbol;
    $('overlayTitle').textContent='READY TO PLAY?';$('overlayText').textContent=games[id].start;$('overlayEyebrow').textContent='LUNA ARCADE · '+id.toUpperCase();
    $('startButton').innerHTML='START GAME <span>→</span>';overlay.classList.remove('hidden');
    setScore(0);coins=0;distance=0;initGame(id);draw();
    if(window.Telegram&&Telegram.WebApp){try{Telegram.WebApp.expand();Telegram.WebApp.requestFullscreen&&Telegram.WebApp.requestFullscreen();Telegram.WebApp.HapticFeedback.impactOccurred('light')}catch(_){}}
  }
  function closeGame(){
    state='menu';current=null;cancelAnimationFrame(raf);screen.classList.remove('active');screen.setAttribute('aria-hidden','true');
    if(window.Telegram&&Telegram.WebApp){try{Telegram.WebApp.exitFullscreen&&Telegram.WebApp.exitFullscreen();Telegram.WebApp.BackButton.hide()}catch(_){}}
  }
  function endGame(){
    if(state!=='playing')return;state='over';cancelAnimationFrame(raf);saveResult();
    $('overlaySymbol').textContent='✦';$('overlayTitle').textContent='RUN COMPLETE';$('overlayEyebrow').textContent='PERSONAL BEST · '+bestOf(current).toLocaleString();
    $('overlayText').textContent=games[current].over+'  You collected '+coins+' moon coins.';$('startButton').innerHTML='PLAY AGAIN <span>↻</span>';
    overlay.classList.remove('hidden');tone(180,.18);
  }
  function startGame(){
    if(!current)return;initGame(current);state='playing';lastTime=performance.now();overlay.classList.add('hidden');setScore(0);
    tone(520);raf=requestAnimationFrame(loop);
  }
  function initGame(id){
    game={time:0,particles:[],stars:Array.from({length:65},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*2+.5,a:Math.random()*.65+.2,s:Math.random()*.6+.15}))};
    if(id==='flappy'){game.player={x:190,y:470,vy:0,r:24,rot:0};game.pipes=[];game.spawn=0;game.passed=0;game.pipes.push(makePipe(900));}
    if(id==='runner'||id==='racer'){game.lane=1;game.targetLane=1;game.obstacles=[];game.pickups=[];game.spawn=0;game.jump=0;game.jumpV=0;game.slide=0;game.flash=0;game.speed=430;}
    if(id==='jumper'){game.player={x:360,y:790,vx:0,vy:-620,r:23};game.platforms=[];for(let i=0;i<9;i++)game.platforms.push({x:70+Math.random()*530,y:860-i*105,w:110+Math.random()*55});game.camera=0;game.left=false;game.right=false;}
    if(id==='space'){game.player={x:360,y:840};game.bullets=[];game.enemies=[];game.spawn=0;game.fire=0;game.drag=false;game.lives=3;game.scoreTime=0;}
    if(id==='brick'){game.paddle={x:360,y:915,w:150};game.ball={x:360,y:870,vx:220,vy:-480,r:12,stuck:true};game.bricks=[];for(let row=0;row<6;row++)for(let col=0;col<8;col++)game.bricks.push({x:43+col*80,y:145+row*48,w:69,h:25,hp:row<2?2:1,alive:true,hue:(row*35+col*9)%360});game.lives=3;}
  }
  function makePipe(x){const gap=245,center=250+Math.random()*440;return{x,center,gap,passed:false}}
  function bg(){
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#0b1030');g.addColorStop(.58,'#19153e');g.addColorStop(1,'#111329');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    const glow=ctx.createRadialGradient(W*.5,H*.26,20,W*.5,H*.26,650);glow.addColorStop(0,'rgba(129,101,214,.25)');glow.addColorStop(1,'rgba(129,101,214,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
    game.stars.forEach(s=>{s.y+=s.s;if(s.y>H){s.y=0;s.x=Math.random()*W}ctx.globalAlpha=s.a*(.65+.35*Math.sin(game.time*2+s.x));ctx.fillStyle='#e9dcff';ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1;
  }
  function rounded(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke()}}
  function glowCircle(x,y,r,color){ctx.save();ctx.shadowBlur=28;ctx.shadowColor=color;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore()}
  function drawFlappy(){
    bg();
    ctx.save();ctx.fillStyle='rgba(235,217,255,.92)';ctx.shadowBlur=36;ctx.shadowColor='#b995ff';ctx.beginPath();ctx.arc(525,170,57,0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.arc(550,150,52,0,Math.PI*2);ctx.fill();ctx.restore();
    game.pipes.forEach(p=>{const top=p.center-p.gap/2,bottom=p.center+p.gap/2;const grad=ctx.createLinearGradient(p.x,0,p.x+112,0);grad.addColorStop(0,'#6e58bc');grad.addColorStop(.5,'#b99cff');grad.addColorStop(1,'#55459e');ctx.save();ctx.shadowBlur=22;ctx.shadowColor='#8b70ff';ctx.fillStyle=grad;ctx.fillRect(p.x,0,92,top-17);ctx.fillRect(p.x,bottom+17,92,H-bottom);ctx.fillStyle='#d8c7ff';ctx.fillRect(p.x-9,top-25,110,25);ctx.fillRect(p.x-9,bottom,110,25);ctx.restore();});
    const p=game.player;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.shadowBlur=25;ctx.shadowColor='#ffdca1';ctx.fillStyle='#ffe2a6';ctx.beginPath();ctx.ellipse(0,0,31,24,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c99bff';ctx.beginPath();ctx.ellipse(-7,7,17,10,Math.sin(game.time*15)*.2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#30234f';ctx.beginPath();ctx.arc(11,-5,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ff9fba';ctx.beginPath();ctx.moveTo(29,1);ctx.lineTo(44,7);ctx.lineTo(29,12);ctx.fill();ctx.restore();
    ctx.fillStyle='rgba(255,255,255,.06)';ctx.fillRect(0,H-30,W,30);
  }
  function drawRoad(){
    bg();const horizon=330;ctx.fillStyle='#151330';ctx.beginPath();ctx.moveTo(0,horizon);ctx.lineTo(W,horizon);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();
    ctx.strokeStyle='rgba(173,143,255,.22)';ctx.lineWidth=3;for(let i=0;i<4;i++){const x=120+i*160;ctx.beginPath();ctx.moveTo(W/2+(x-W/2)*.2,horizon);ctx.lineTo(x,H);ctx.stroke()}
    for(let i=0;i<14;i++){const t=(i/14+game.time*.7)%1;const y=horizon+t*t*(H-horizon);ctx.strokeStyle='rgba(186,158,255,'+(0.04+t*.2)+')';ctx.lineWidth=1+t*3;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
    const sun=ctx.createRadialGradient(360,240,12,360,240,170);sun.addColorStop(0,'rgba(249,164,203,.55)');sun.addColorStop(1,'rgba(249,164,203,0)');ctx.fillStyle=sun;ctx.fillRect(170,50,380,330);
  }
  function drawRunner(car){
    drawRoad();
    game.obstacles.forEach(o=>{const x=180+o.lane*180,y=o.y,size=38+o.z*18;ctx.save();ctx.translate(x,y);ctx.shadowBlur=20;ctx.shadowColor=car?'#ff8fd2':'#ffb87c';rounded(-size,-size,size*2,size*2,10,car?'#b84d9d':'#92587a','rgba(255,220,255,.7)');ctx.fillStyle='rgba(255,255,255,.35)';ctx.fillRect(-size*.55,-size*.55,size*1.1,5);ctx.restore()});
    game.pickups.forEach(c=>{ctx.save();glowCircle(c.x,c.y,16,'#f7d28a');ctx.fillStyle='#fff2bd';ctx.beginPath();ctx.arc(c.x,c.y,7,0,Math.PI*2);ctx.fill();ctx.restore()});
    const x=180+game.lane*180,y=825-Math.min(155,game.jump*0.2);ctx.save();ctx.translate(x,y);if(game.slide>0)ctx.scale(1,.6);ctx.shadowBlur=30;ctx.shadowColor=car?'#ff9ed2':'#d3a5ff';ctx.fillStyle=car?'#ff9fcd':'#d8c0ff';if(car){rounded(-38,-52,76,98,22,'#c65c9f','#ffd8f3');rounded(-26,-33,52,26,10,'#241e45');ctx.fillStyle='#fff0ad';ctx.fillRect(-28,34,16,8);ctx.fillRect(12,34,16,8)}else{ctx.beginPath();ctx.moveTo(0,-58);ctx.lineTo(35,-15);ctx.lineTo(25,43);ctx.lineTo(-25,43);ctx.lineTo(-35,-15);ctx.closePath();ctx.fill();ctx.fillStyle='#3b2b5b';rounded(-18,-18,36,29,9,'#6a4f9b');}ctx.restore();
  }
  function drawJumper(){
    bg();for(let i=0;i<game.platforms.length;i++){const p=game.platforms[i];ctx.save();ctx.shadowBlur=18;ctx.shadowColor='#8beaff';rounded(p.x,p.y-game.camera,p.w,14,8,'#8beaff','rgba(255,255,255,.8)');ctx.restore()}
    const p=game.player;const y=p.y-game.camera;ctx.save();ctx.translate(p.x,y);ctx.shadowBlur=24;ctx.shadowColor='#c4a0ff';ctx.fillStyle='#d8baff';ctx.beginPath();ctx.arc(0,0,25,0,Math.PI*2);ctx.fill();ctx.fillStyle='#29224a';ctx.beginPath();ctx.arc(8,-5,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffe5a8';ctx.beginPath();ctx.ellipse(-12,25,10,5,-.25,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function drawSpace(){
    bg();game.bullets.forEach(b=>{ctx.save();ctx.shadowBlur=16;ctx.shadowColor='#8beaff';rounded(b.x-4,b.y-18,8,28,5,'#a8f5ff');ctx.restore()});
    game.enemies.forEach(e=>{ctx.save();ctx.translate(e.x,e.y);ctx.shadowBlur=20;ctx.shadowColor='#ff8fca';ctx.fillStyle='#d97fb6';ctx.beginPath();ctx.moveTo(0,26);ctx.lineTo(32,-5);ctx.lineTo(17,-24);ctx.lineTo(-17,-24);ctx.lineTo(-32,-5);ctx.closePath();ctx.fill();ctx.fillStyle='#fff0c1';ctx.beginPath();ctx.arc(-9,-4,4,0,Math.PI*2);ctx.arc(9,-4,4,0,Math.PI*2);ctx.fill();ctx.restore()});
    const p=game.player;ctx.save();ctx.translate(p.x,p.y);ctx.shadowBlur=27;ctx.shadowColor='#9deaff';ctx.fillStyle='#b2eaff';ctx.beginPath();ctx.moveTo(0,-46);ctx.lineTo(36,34);ctx.lineTo(0,19);ctx.lineTo(-36,34);ctx.closePath();ctx.fill();ctx.fillStyle='#6653aa';ctx.beginPath();ctx.ellipse(0,-2,10,19,0,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.fillStyle='#f5c6df';ctx.font='700 22px Space Grotesk';ctx.fillText('♥ '.repeat(game.lives),28,58);
  }
  function drawBrick(){
    bg();game.bricks.forEach(b=>{if(!b.alive)return;const c='hsl('+b.hue+',78%,68%)';ctx.save();ctx.shadowBlur=16;ctx.shadowColor=c;rounded(b.x,b.y,b.w,b.h,7,c,'rgba(255,255,255,.55)');ctx.restore()});
    const p=game.paddle;ctx.save();ctx.shadowBlur=22;ctx.shadowColor='#8beaff';rounded(p.x-p.w/2,p.y,p.w,15,9,'#83eaff','#d9fbff');ctx.restore();
    const b=game.ball;glowCircle(b.x,b.y,b.r,'#fff0b9');
    ctx.fillStyle='rgba(255,255,255,.7)';ctx.font='16px DM Mono';ctx.fillText('LIVES  '+game.lives,28,58);
  }
  function draw(){
    if(!current)return;
    if(current==='flappy')drawFlappy();else if(current==='runner'||current==='racer')drawRunner(current==='racer');else if(current==='jumper')drawJumper();else if(current==='space')drawSpace();else if(current==='brick')drawBrick();
  }
  function loop(now){
    if(state!=='playing')return;
    const dt=Math.min(.033,(now-lastTime)/1000||0);lastTime=now;game.time+=dt;
    update(dt);draw();raf=requestAnimationFrame(loop);
  }
  function update(dt){
    if(current==='flappy')updateFlappy(dt);
    if(current==='runner'||current==='racer')updateRunner(dt,current==='racer');
    if(current==='jumper')updateJumper(dt);
    if(current==='space')updateSpace(dt);
    if(current==='brick')updateBrick(dt);
  }
  function updateFlappy(dt){
    const p=game.player;p.vy+=1500*dt;p.y+=p.vy*dt;p.rot=Math.min(.85,Math.max(-.5,p.vy/850));
    game.spawn+=dt;if(game.spawn>1.65){game.pipes.push(makePipe(W+50));game.spawn=0}
    game.pipes.forEach(pipe=>{pipe.x-=250*dt;if(!pipe.passed&&pipe.x+92<p.x){pipe.passed=true;setScore(score+1);tone(720)}});
    game.pipes=game.pipes.filter(p=>p.x>-130);
    if(p.y>H-42||p.y<38){endGame();return}
    for(const pipe of game.pipes){const gapTop=pipe.center-pipe.gap/2,gapBottom=pipe.center+pipe.gap/2;if(p.x+p.r>pipe.x-8&&p.x-p.r<pipe.x+100&&(p.y-p.r<gapTop||p.y+p.r>gapBottom)){endGame();return}}
  }
  function updateRunner(dt,isCar){
    game.speed=Math.min(760,game.speed+dt*8);distance+=game.speed*dt/23;setScore(Math.floor(distance)+coins*10);
    game.spawn+=dt;if(game.spawn>(isCar ? .86 : 1.02)){const lane=Math.floor(Math.random()*3);game.obstacles.push({lane,y:-80,z:Math.random()});if(Math.random()>.35)game.pickups.push({x:180+Math.floor(Math.random()*3)*180,y:-260});game.spawn=0}
    if(game.jump>0){game.jump+=game.jumpV*dt;game.jumpV-=1450*dt;if(game.jump<0){game.jump=0;game.jumpV=0}}
    if(game.slide>0)game.slide-=dt;
    game.obstacles.forEach(o=>o.y+=game.speed*dt);game.pickups.forEach(c=>c.y+=game.speed*dt);
    const py=825-Math.min(155,game.jump*.2);
    for(const o of game.obstacles){if(o.lane===game.lane&&o.y>py-70&&o.y<py+45&&game.jump<95&&game.slide<=0){endGame();return}}
    game.pickups=game.pickups.filter(c=>{if(c.y>py-35&&c.y<py+35&&Math.abs(c.x-(180+game.lane*180))<65){coins++;tone(880);return false}return c.y<H+30});
    game.obstacles=game.obstacles.filter(o=>o.y<H+100);
    if(game.flash>0)game.flash-=dt;
  }
  function updateJumper(dt){
    const p=game.player;p.vy+=1450*dt;p.x+=p.vx*dt;p.x=Math.max(38,Math.min(W-38,p.x));p.y+=p.vy*dt;
    if(p.vy>0){for(const plat of game.platforms){const py=plat.y;if(p.x>plat.x-20&&p.x<plat.x+plat.w+20&&p.y+24>=py&&p.y+24<=py+25){p.vy=-690;tone(500);break}}}
    if(p.y-game.camera<420){const shift=420-(p.y-game.camera);game.camera+=shift;distance=Math.max(distance,game.camera);setScore(Math.floor(distance/10))}
    const highest=game.camera+H;game.platforms=game.platforms.filter(pl=>pl.y-game.camera<H+100);
    while(game.platforms.length<10){const y=Math.min(...game.platforms.map(pl=>pl.y))-105;game.platforms.push({x:35+Math.random()*550,y,w:100+Math.random()*60})}
    p.vx*=.88;if(p.y-game.camera>H+40){endGame()}
  }
  function updateSpace(dt){
    const p=game.player;game.fire+=dt;if(game.fire>.18){game.bullets.push({x:p.x,y:p.y-35});game.fire=0}
    game.spawn+=dt;if(game.spawn>.65){game.enemies.push({x:45+Math.random()*(W-90),y:-35,v:260+Math.random()*140});game.spawn=0}
    game.bullets.forEach(b=>b.y-=720*dt);game.enemies.forEach(e=>e.y+=e.v*dt);
    game.bullets=game.bullets.filter(b=>b.y>-30);
    for(const e of game.enemies){for(const b of game.bullets){if(Math.abs(e.x-b.x)<34&&Math.abs(e.y-b.y)<35){e.dead=true;b.dead=true;setScore(score+10);tone(660)}}if(e.y>p.y-30&&e.y<p.y+30&&Math.abs(e.x-p.x)<48){e.dead=true;game.lives--;tone(120,.15);if(game.lives<=0){endGame();return}}}
    game.enemies=game.enemies.filter(e=>!e.dead&&e.y<H+40);game.bullets=game.bullets.filter(b=>!b.dead);
    game.scoreTime+=dt;if(game.scoreTime>=1){setScore(score+5);game.scoreTime=0}
    if(pointerDown){p.x+=(pointerX-p.x)*Math.min(1,dt*12)}p.x=Math.max(45,Math.min(W-45,p.x));
  }
  function updateBrick(dt){
    const p=game.paddle,b=game.ball;if(pointerDown)p.x+=(pointerX-p.x)*Math.min(1,dt*14);p.x=Math.max(p.w/2+8,Math.min(W-p.w/2-8,p.x));
    if(b.stuck){b.x=p.x;b.y=p.y-35;return}
    b.x+=b.vx*dt;b.y+=b.vy*dt;
    if(b.x<b.r||b.x>W-b.r){b.vx*=-1;tone(300)}if(b.y<b.r+25){b.vy=Math.abs(b.vy);tone(300)}
    if(b.y>p.y-10&&b.y<p.y+18&&b.x>p.x-p.w/2&&b.x<p.x+p.w/2&&b.vy>0){b.vy=-Math.abs(b.vy);b.vx+=(b.x-p.x)/p.w*260;tone(540)}
    for(const brick of game.bricks){if(brick.alive&&b.x>brick.x-b.r&&b.x<brick.x+brick.w+b.r&&b.y>brick.y-b.r&&b.y<brick.y+brick.h+b.r){brick.hp--;if(brick.hp<=0){brick.alive=false;setScore(score+5);coins+=1}b.vy*=-1;tone(470);break}}
    if(game.bricks.every(br=>!br.alive)){game.bricks.forEach(br=>{br.alive=true;br.hp=1});b.vy=-Math.abs(b.vy);setScore(score+100)}
    if(b.y>H+20){game.lives--;if(game.lives<=0){endGame();return}b.stuck=true;b.vx=220;b.vy=-480}
  }
  function flap(){if(current!=='flappy')return;if(state==='ready'){startGame();}if(state==='playing'){game.player.vy=-480;game.player.rot=-.45;tone(510)}}
  function action(dx,dy){
    if(state!=='playing')return;
    if(current==='runner'||current==='racer'){if(dx)game.targetLane=Math.max(0,Math.min(2,game.targetLane+dx)),game.lane=game.targetLane;if(dy<0&&game.jump<=0){game.jump=1;game.jumpV=620;tone(600)}if(dy>0)game.slide=.55}
    if(current==='jumper'){game.player.vx=dx*560}
    if(current==='brick'&&game.ball.stuck){game.ball.stuck=false;game.ball.vy=-480;tone(520)}
  }
  function pointerDownHandler(e){
    const rect=canvas.getBoundingClientRect();pointerX=(e.clientX-rect.left)/rect.width*W;pointerDown=true;swipeStart={x:e.clientX,y:e.clientY};
    if(current==='flappy'){flap();return}
    if(current==='brick'){if(game.ball&&game.ball.stuck){action(0,0)}return}
    if(current==='jumper'){game.player.vx=(pointerX<W/2?-1:1)*560;return}
    if((current==='runner'||current==='racer')&&state==='ready')startGame();
    if(current==='space')game.player.x=pointerX;
  }
  function pointerMoveHandler(e){
    if(!pointerDown)return;const rect=canvas.getBoundingClientRect();pointerX=(e.clientX-rect.left)/rect.width*W;
    if(current==='space')game.player.x=pointerX;
  }
  function pointerUpHandler(e){
    if(!pointerDown)return;pointerDown=false;
    if(swipeStart&&(current==='runner'||current==='racer')){const dx=e.clientX-swipeStart.x,dy=e.clientY-swipeStart.y;if(Math.abs(dx)>25||Math.abs(dy)>25){if(Math.abs(dx)>Math.abs(dy))action(dx>0?1:-1,0);else action(0,dy)}}
    if(current==='jumper')game.player.vx=0;
    swipeStart=null;
  }
  canvas.addEventListener('pointerdown',pointerDownHandler);canvas.addEventListener('pointermove',pointerMoveHandler);window.addEventListener('pointerup',pointerUpHandler);
  window.addEventListener('keydown',e=>{
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key))e.preventDefault();
    if(e.key==='Escape'&&screen.classList.contains('active'))closeGame();
    if(e.key===' '&&current==='flappy'){flap();return}
    if(e.key==='ArrowLeft')action(-1,0);if(e.key==='ArrowRight')action(1,0);if(e.key==='ArrowUp')action(0,-1);if(e.key==='ArrowDown')action(0,1);
    if(e.key===' '&&state==='ready')startGame();
  },{passive:false});
  document.querySelectorAll('[data-game]').forEach(card=>card.addEventListener('click',()=>openGame(card.dataset.game)));
  $('startButton').addEventListener('click',startGame);$('restartButton').addEventListener('click',()=>{if(current)openGame(current)});$('backButton').addEventListener('click',closeGame);
  soundToggle.addEventListener('click',()=>{soundOn=!soundOn;soundToggle.innerHTML=(soundOn?'♫':'♪')+' <span>Sound '+(soundOn?'ON':'OFF')+'</span>';if(soundOn)tone(640)});
  window.addEventListener('resize',()=>{if(current&&state!=='playing')draw()});
  if(window.Telegram&&Telegram.WebApp){
    try{Telegram.WebApp.ready();Telegram.WebApp.setHeaderColor('#090817');Telegram.WebApp.setBackgroundColor('#090817');Telegram.WebApp.BackButton.show();Telegram.WebApp.BackButton.onClick(closeGame);const user=Telegram.WebApp.initDataUnsafe&&Telegram.WebApp.initDataUnsafe.user;if(user&&user.first_name)$('welcomeText').textContent='Hey '+user.first_name+' — your next high score is waiting.';}catch(_){}
  }
  refreshStats();draw();
})();