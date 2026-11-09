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
    space:{title:'STAR DEFENDER',symbol:'✦',hint:'DRAG TO MOVE · AUTO FIRE',start:'Slide your ship across the sky and dodge the incoming swarm.',over:'The stars are quiet again. Launch another mission?',color:'#9ce9ff'},
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


  // -----------------------------------------------------------------------
  // Luna Arcade art pass — bespoke canvas illustration, no emoji sprites.
  // The game rules remain lightweight; all scenery and characters are drawn
  // locally at the canvas resolution for crisp mobile rendering.
  // -----------------------------------------------------------------------
  function artPath(points, fill, stroke, width=2) {
    ctx.beginPath();
    points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));
    ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill()}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}
  }
  function artGrad(x1,y1,x2,y2,stops) {
    const g=ctx.createLinearGradient(x1,y1,x2,y2);
    stops.forEach(s=>g.addColorStop(s[0],s[1]));
    return g;
  }
  function artGlow(x,y,r,color,alpha=1) {
    ctx.save();ctx.globalAlpha=alpha;ctx.shadowBlur=r*2.2;ctx.shadowColor=color;ctx.fillStyle=color;
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function artCloud(x,y,s,color='rgba(249,225,218,.44)') {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.fillStyle=color;
    ctx.beginPath();ctx.ellipse(0,4,55,14,0,0,Math.PI*2);ctx.ellipse(-24,-3,23,17,0,0,Math.PI*2);ctx.ellipse(5,-11,28,22,0,0,Math.PI*2);ctx.ellipse(32,-2,21,14,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
  function artStar(x,y,r,color='#fff0c7') {
    ctx.save();ctx.translate(x,y);ctx.fillStyle=color;ctx.shadowBlur=12;ctx.shadowColor=color;
    ctx.beginPath();ctx.moveTo(0,-r);ctx.quadraticCurveTo(r*.18,-r*.18,r,0);ctx.quadraticCurveTo(r*.18,r*.18,0,r);ctx.quadraticCurveTo(-r*.18,r*.18,-r,0);ctx.quadraticCurveTo(-r*.18,-r*.18,0,-r);ctx.fill();ctx.restore();
  }
  function artMoon(x,y,r) {
    ctx.save();ctx.shadowBlur=44;ctx.shadowColor='#ffe2bd';ctx.fillStyle='#f4dfbb';
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(54,58,83,.48)';ctx.beginPath();ctx.arc(x+r*.34,y-r*.2,r*.86,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(255,241,214,.16)';ctx.beginPath();ctx.arc(x-r*.2,y-r*.28,r*.12,0,Math.PI*2);ctx.arc(x+r*.05,y+r*.3,r*.08,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function artPine(x,y,s,color) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.fillStyle=color;
    ctx.fillRect(-4,-20,8,24);
    for(let i=0;i<3;i++){const yy=-28-i*23;artPath([[-28,yy+25],[0,yy-25],[28,yy+25]],color);}
    ctx.restore();
  }
  function drawFlappyBackdrop(){
    const sky=artGrad(0,0,0,H,[[0,'#172642'],[.38,'#5a607f'],[.72,'#c38b8d'],[1,'#e8b49a']]);ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    const haze=ctx.createRadialGradient(550,150,10,550,150,300);haze.addColorStop(0,'rgba(255,224,184,.28)');haze.addColorStop(1,'rgba(255,224,184,0)');ctx.fillStyle=haze;ctx.fillRect(250,0,470,420);
    artMoon(550,145,57);
    for(let i=0;i<24;i++){const x=(i*137+40)%W,y=(i*71+29)%420;artStar(x,y,(i%3)+1,i%4===0?'#fff0c7':'rgba(244,231,219,.72)')}
    // Distant ridges and a soft valley.
    artPath([[0,480],[95,360],[175,430],[260,320],[354,416],[455,345],[555,420],[650,338],[720,390],[720,760],[0,760]],'#58617b');
    artPath([[0,570],[115,435],[210,523],[310,405],[420,500],[530,420],[635,515],[720,455],[720,820],[0,820]],'#3b4964');
    artPath([[0,690],[110,555],[215,640],[318,530],[430,635],[540,548],[630,632],[720,574],[720,900],[0,900]],'#293a51');
    artCloud(110+Math.sin(game.time*.25)*24,276,.9,'rgba(250,221,211,.25)');
    artCloud(410-Math.sin(game.time*.18)*18,350,.7,'rgba(255,231,218,.21)');
    // Foreground pines scroll gently to suggest forward movement.
    for(let i=0;i<9;i++){const x=i*94-((game.time*18)%94);artPine(x,872+(i%2)*17,.85+(i%3)*.13,i%2?'#1c3046':'#20344a')}
    const ground=artGrad(840,0,0,H,[[0,'#344b57'],[1,'#182b3d']]);ctx.fillStyle=ground;ctx.fillRect(0,880,W,120);
    ctx.strokeStyle='rgba(244,218,188,.28)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,883);ctx.lineTo(W,883);ctx.stroke();
  }
  function drawLunaMascot(x,y,rotation=0,scale=1){
    ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.scale(scale,scale);
    // Tail and two soft feather ears.
    ctx.save();ctx.shadowBlur=14;ctx.shadowColor='rgba(211,174,255,.5)';
    ctx.fillStyle='#aa8cbf';ctx.beginPath();ctx.moveTo(-28,8);ctx.quadraticCurveTo(-69,-12,-60,-42);ctx.quadraticCurveTo(-35,-28,-17,-9);ctx.fill();
    ctx.fillStyle='#f0d5b8';ctx.strokeStyle='#5c4a6b';ctx.lineWidth=4;
    ctx.beginPath();ctx.moveTo(-25,-25);ctx.quadraticCurveTo(-43,-64,-18,-57);ctx.quadraticCurveTo(-7,-49,-5,-28);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(13,-27);ctx.quadraticCurveTo(24,-65,42,-48);ctx.quadraticCurveTo(45,-35,29,-18);ctx.fill();ctx.stroke();
    ctx.restore();
    // Main body with layered cream and lilac plumage.
    ctx.save();ctx.shadowBlur=24;ctx.shadowColor='rgba(255,222,169,.42)';
    ctx.fillStyle='#f3d8b6';ctx.strokeStyle='#5b4c6b';ctx.lineWidth=5;
    ctx.beginPath();ctx.ellipse(0,0,43,38,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#c29ac5';ctx.beginPath();ctx.ellipse(-4,14,27,18,-.1,0,Math.PI*2);ctx.fill();
    // Wing flutters on each tap.
    ctx.save();ctx.translate(-19,7);ctx.rotate(Math.sin(game.time*15)*.22);ctx.fillStyle='#d5b1d1';ctx.strokeStyle='#6b5877';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(-37,-24,-28,14);ctx.quadraticCurveTo(-18,29,3,15);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    // Face, glints and blush.
    ctx.fillStyle='#fff8e9';ctx.beginPath();ctx.ellipse(13,-5,17,20,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#343149';ctx.beginPath();ctx.ellipse(18,-5,5.5,8,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(20,-8,2,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(219,133,139,.55)';ctx.beginPath();ctx.ellipse(25,12,7,3,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#d98e79';ctx.beginPath();ctx.moveTo(30,1);ctx.lineTo(46,8);ctx.lineTo(30,13);ctx.closePath();ctx.fill();
    // Crescent hair clip.
    ctx.strokeStyle='#f5d38d';ctx.lineWidth=4;ctx.beginPath();ctx.arc(-16,-25,8,-.8,1.9);ctx.stroke();
    ctx.restore();ctx.restore();
  }
  function drawGateColumn(x,y,h,flip=false){
    if(h<15)return;ctx.save();
    const w=100,grad=artGrad(x,0,x+w,0,[[0,'#55496d'],[.22,'#b99b9b'],[.5,'#e8cba8'],[.76,'#9d8197'],[1,'#4b456d']]);
    ctx.shadowBlur=20;ctx.shadowColor='rgba(224,188,181,.25)';
    ctx.fillStyle=grad;ctx.fillRect(x,y,w,h);ctx.strokeStyle='#f6d9b2';ctx.lineWidth=3;ctx.strokeRect(x+2,y+2,w-4,h-4);
    ctx.fillStyle='rgba(255,244,220,.22)';ctx.fillRect(x+12,y+8,8,Math.max(0,h-16));
    ctx.fillStyle='rgba(46,45,75,.42)';ctx.fillRect(x+22,y+8,w-34,Math.max(0,h-16));
    // Repeated engraved bands.
    for(let yy=y+24;yy<y+h-12;yy+=44){ctx.strokeStyle='rgba(249,220,180,.42)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+24,yy);ctx.lineTo(x+w-24,yy);ctx.stroke();artStar(x+w/2,yy+10,5,'#f4d7a7')}
    ctx.shadowBlur=0;ctx.fillStyle='#e4c5a7';ctx.fillRect(x-12,flip?y:y+h-16,w+24,16);ctx.fillStyle='#fff0d4';ctx.fillRect(x-12,flip?y:y+h-16,w+24,4);
    ctx.restore();
  }
  function drawFlappy(){
    drawFlappyBackdrop();
    game.pipes.forEach(p=>{
      const top=p.center-p.gap/2,bottom=p.center+p.gap/2;
      drawGateColumn(p.x,0,top-15,true);
      drawGateColumn(p.x,bottom+15,H-bottom-15,false);
      // Ornate lintels and glowing gate marks.
      ctx.save();ctx.shadowBlur=15;ctx.shadowColor='#ffddb2';ctx.fillStyle='#d8b894';ctx.fillRect(p.x-15,top-27,130,15);ctx.fillRect(p.x-15,bottom+12,130,15);
      ctx.strokeStyle='#fff0d1';ctx.lineWidth=3;ctx.strokeRect(p.x-15,top-27,130,15);ctx.strokeRect(p.x-15,bottom+12,130,15);
      artStar(p.x+50,top-18,5,'#fff2cf');artStar(p.x+50,bottom+20,5,'#fff2cf');ctx.restore();
    });
    // Loose light motes behind the mascot.
    for(let i=0;i<8;i++){const x=(game.player.x-100+i*19+W)%W,y=game.player.y+Math.sin(game.time*4+i)*20;ctx.globalAlpha=.45-i*.04;artStar(x,y,2+i*.2,'#ffe9c4')}ctx.globalAlpha=1;
    drawLunaMascot(game.player.x,game.player.y,game.player.rot,1);
  }
  function drawRunnerBackdrop(){
    const sky=artGrad(0,0,0,H,[[0,'#14253c'],[.38,'#4d536c'],[.62,'#c08383'],[1,'#e1a58e']]);ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    // Moonlit skyline: layered silhouettes, windows and rooftop antennae.
    artMoon(550,115,46);
    for(let layer=0;layer<3;layer++){
      const base=460+layer*75,step=75-layer*8;
      for(let i=0;i<11;i++){
        const x=i*step-((game.time*(layer?10:4))%(step));
        const bw=38+(i*17%27),bh=75+((i*43+layer*29)%115);
        ctx.fillStyle=layer===0?'#313752':layer===1?'#252c45':'#1d263c';
        ctx.fillRect(x,base-bh,bw,bh);
        ctx.fillStyle=layer===0?'rgba(252,204,165,.45)':'rgba(150,211,207,.33)';
        for(let wy=base-bh+15;wy<base-10;wy+=23)for(let wx=x+9;wx<x+bw-5;wx+=17)if(((wx+wy+i)%3)>0)ctx.fillRect(wx,wy,5,8);
        ctx.fillStyle='#e5a88e';ctx.fillRect(x+bw*.5,base-bh-7,2,7);
      }
    }
    // Torii-inspired street frames and lanterns.
    for(let side=0;side<2;side++){
      const x=side?660:60;ctx.strokeStyle='rgba(238,173,153,.62)';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(x,180);ctx.lineTo(x,575);ctx.moveTo(x-35,193);ctx.lineTo(x+35,193);ctx.moveTo(x-25,214);ctx.lineTo(x+25,214);ctx.stroke();
      ctx.fillStyle='#f0b58f';ctx.shadowBlur=16;ctx.shadowColor='#f0b58f';ctx.fillRect(x-13,253,26,32);ctx.shadowBlur=0;ctx.fillStyle='rgba(255,230,193,.8)';ctx.fillRect(x-6,258,12,20);
    }
    const haze=ctx.createLinearGradient(0,410,0,590);haze.addColorStop(0,'rgba(250,177,154,0)');haze.addColorStop(1,'rgba(250,177,154,.19)');ctx.fillStyle=haze;ctx.fillRect(0,400,W,190);
  }
  function drawRunnerRoad(){
    const horizon=475;
    ctx.fillStyle='#151c31';ctx.beginPath();ctx.moveTo(0,horizon);ctx.lineTo(W,horizon);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();ctx.fill();
    ctx.fillStyle='#20263b';ctx.beginPath();ctx.moveTo(230,horizon);ctx.lineTo(490,horizon);ctx.lineTo(720,H);ctx.lineTo(0,H);ctx.closePath();ctx.fill();
    // Road edge strips.
    ctx.strokeStyle='#d28c90';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(230,horizon);ctx.lineTo(0,H);ctx.moveTo(490,horizon);ctx.lineTo(720,H);ctx.stroke();
    // Three playable lanes and animated reflective dashes.
    for(let lane=1;lane<3;lane++){const top=360+(lane-1)*0;const bottomX=lane*240;ctx.strokeStyle='rgba(207,197,218,.36)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(360+(lane-1)*42,horizon);ctx.lineTo(bottomX,H);ctx.stroke()}
    const travel=(game.time*380)%160;
    for(let i=0;i<7;i++){const y=horizon+((i*160+travel)%(H-horizon));const t=(y-horizon)/(H-horizon);const dash=3+t*10;ctx.fillStyle='rgba(246,216,184,'+(.22+t*.42)+')';ctx.fillRect(356-dash/2,y,dash,12+t*19)}
    // Soft horizon light.
    const glow=ctx.createRadialGradient(360,450,5,360,450,360);glow.addColorStop(0,'rgba(242,160,145,.2)');glow.addColorStop(1,'rgba(242,160,145,0)');ctx.fillStyle=glow;ctx.fillRect(0,250,W,500);
  }
  function drawCourier(x,y){
    ctx.save();ctx.translate(x,y);
    const run=Math.sin(game.time*14);
    // Motion shadow.
    ctx.fillStyle='rgba(5,8,19,.38)';ctx.beginPath();ctx.ellipse(0,113,48,11,0,0,Math.PI*2);ctx.fill();
    // Scarf tail and hair silhouette.
    ctx.fillStyle='#f1b0a5';ctx.beginPath();ctx.moveTo(-17,-35);ctx.quadraticCurveTo(-77,-42,-66+run*7,15);ctx.quadraticCurveTo(-34,1,-22,-5);ctx.fill();
    // Legs and bright trainers.
    ctx.lineCap='round';ctx.strokeStyle='#252b43';ctx.lineWidth=18;ctx.beginPath();ctx.moveTo(-17,62);ctx.lineTo(-25+run*15,99);ctx.moveTo(16,62);ctx.lineTo(25-run*15,99);ctx.stroke();
    ctx.strokeStyle='#f1d6c1';ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(-25+run*15,99);ctx.lineTo(-39+run*15,108);ctx.moveTo(25-run*15,99);ctx.lineTo(38-run*15,108);ctx.stroke();
    ctx.strokeStyle='#f1b0a5';ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(-27,8);ctx.lineTo(-43-run*9,43);ctx.moveTo(27,8);ctx.lineTo(42+run*9,39);ctx.stroke();
    // Jacket with seam and pocket.
    const jacket=artGrad(-35,0,35,70,[[0,'#c18bc4'],[.5,'#896fae'],[1,'#514d78']]);
    ctx.fillStyle=jacket;ctx.strokeStyle='#31314c';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-27,-16);ctx.quadraticCurveTo(0,-31,28,-16);ctx.lineTo(38,66);ctx.quadraticCurveTo(0,79,-38,66);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle='rgba(255,231,214,.6)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(0,60);ctx.moveTo(-18,33);ctx.lineTo(18,33);ctx.stroke();
    // Head, short flowing hair and facial details.
    ctx.fillStyle='#e8b99f';ctx.beginPath();ctx.ellipse(0,-42,25,29,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#47384f';ctx.lineWidth=4;ctx.stroke();
    ctx.fillStyle='#29283e';ctx.beginPath();ctx.moveTo(-25,-47);ctx.quadraticCurveTo(-30,-89,7,-78);ctx.quadraticCurveTo(37,-78,29,-31);ctx.lineTo(17,-21);ctx.lineTo(14,-51);ctx.quadraticCurveTo(-3,-32,-25,-34);ctx.closePath();ctx.fill();
    ctx.fillStyle='#fff0df';ctx.beginPath();ctx.ellipse(9,-43,4,6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#332d43';ctx.beginPath();ctx.arc(11,-42,2.4,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#d58f8c';ctx.beginPath();ctx.ellipse(-10,-27,7,3,0,0,Math.PI*2);ctx.fill();
    // Hair pin.
    ctx.strokeStyle='#f2cf8f';ctx.lineWidth=4;ctx.beginPath();ctx.arc(-14,-64,7,-1,1.7);ctx.stroke();
    ctx.restore();
  }
  function drawRunnerObstacle(o,isCar){
    const x=180+o.lane*180,y=o.y;
    ctx.save();ctx.translate(x,y);
    if(isCar){
      ctx.shadowBlur=18;ctx.shadowColor='#df819e';
      const g=artGrad(-30,-42,30,50,[[0,'#e9a5b0'],[.5,'#9c6485'],[1,'#4e476b']]);
      ctx.fillStyle=g;ctx.strokeStyle='#2d304b';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-36,34);ctx.lineTo(-30,-22);ctx.quadraticCurveTo(0,-54,30,-22);ctx.lineTo(36,34);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle='#24344d';ctx.beginPath();ctx.moveTo(-22,-17);ctx.quadraticCurveTo(0,-40,22,-17);ctx.lineTo(18,3);ctx.lineTo(-18,3);ctx.closePath();ctx.fill();
      ctx.fillStyle='#ffdeae';ctx.fillRect(-28,22,12,5);ctx.fillRect(16,22,12,5);
      ctx.fillStyle='#202237';ctx.fillRect(-41,4,8,22);ctx.fillRect(33,4,8,22);
    }else{
      // Wooden cargo crate with metal corners and warning paint.
      ctx.shadowBlur=16;ctx.shadowColor='rgba(238,183,135,.28)';
      const g=artGrad(-40,-40,40,55,[[0,'#bb936f'],[.52,'#805f66'],[1,'#493f59']]);
      ctx.fillStyle=g;ctx.strokeStyle='#f0c99d';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-38,-38);ctx.lineTo(31,-38);ctx.lineTo(40,-28);ctx.lineTo(40,40);ctx.lineTo(-30,40);ctx.lineTo(-40,29);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.strokeStyle='rgba(255,227,189,.53)';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-31,-20);ctx.lineTo(29,22);ctx.moveTo(30,-20);ctx.lineTo(-28,22);ctx.stroke();
      ctx.fillStyle='#efc590';ctx.fillRect(-42,-39,11,12);ctx.fillRect(28,29,12,12);
      ctx.fillStyle='#ffe2ad';ctx.fillRect(-13,-5,26,10);ctx.fillStyle='#4a435d';ctx.font='bold 10px "DM Mono"';ctx.textAlign='center';ctx.fillText('L',0,3);
    }
    ctx.restore();
  }
  function drawMoonCoin(c){
    const spin=.28+Math.abs(Math.sin(game.time*7+c.y*.02))*.72;
    ctx.save();ctx.translate(c.x,c.y);ctx.scale(spin,1);ctx.shadowBlur=20;ctx.shadowColor='#f4ca79';
    const g=artGrad(-15,-15,15,15,[[0,'#fff0bd'],[.4,'#eab55f'],[1,'#9c683d']]);
    ctx.fillStyle=g;ctx.strokeStyle='#fff0ba';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#fff0c5';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#fff3d1';ctx.font='bold 15px serif';ctx.textAlign='center';ctx.fillText('☾',0,5);ctx.restore();
  }
  function drawCarPlayer(x,y){
    ctx.save();ctx.translate(x,y);ctx.shadowBlur=22;ctx.shadowColor='#f28fbc';
    // Tires behind the body.
    ctx.fillStyle='#0b1020';ctx.beginPath();ctx.roundRect(-42,-43,15,43,5);ctx.roundRect(27,-43,15,43,5);ctx.roundRect(-42,31,15,43,5);ctx.roundRect(27,31,15,43,5);ctx.fill();
    const g=artGrad(-42,-45,42,65,[[0,'#ffd6c7'],[.42,'#e28bb2'],[1,'#743e79']]);
    ctx.fillStyle=g;ctx.strokeStyle='#302c4b';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-31,-65);ctx.quadraticCurveTo(-38,-51,-38,-24);ctx.lineTo(-33,51);ctx.quadraticCurveTo(0,70,33,51);ctx.lineTo(38,-24);ctx.quadraticCurveTo(38,-51,31,-65);ctx.quadraticCurveTo(0,-80,-31,-65);ctx.fill();ctx.stroke();
    ctx.fillStyle='#293a51';ctx.strokeStyle='#f5c9d6';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-25,-38);ctx.quadraticCurveTo(0,-58,25,-38);ctx.lineTo(21,-3);ctx.lineTo(-21,-3);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#ffe9b6';ctx.fillRect(-28,42,14,7);ctx.fillRect(14,42,14,7);
    ctx.fillStyle='#fff1d7';ctx.fillRect(-7,-57,14,5);ctx.restore();
  }
  function drawRunner(car){
    drawRunnerBackdrop();drawRunnerRoad();
    game.obstacles.forEach(o=>drawRunnerObstacle(o,car));
    game.pickups.forEach(c=>drawMoonCoin(c));
    const jumpHeight=Math.min(135,game.jump||0);
    const py=825-jumpHeight;
    if(car)drawCarPlayer(180+game.lane*180,py-7);
    else drawCourier(180+game.lane*180,py-5);
    // Speed streaks and fine ground dust.
    if(game.speed>480){ctx.strokeStyle='rgba(245,210,190,.16)';ctx.lineWidth=2;for(let i=0;i<10;i++){const x=(i*79+game.time*120)%W;const y=690+(i*37%230);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-8,y+36);ctx.stroke()}}
  }
  function drawJumperBackdrop(){
    const sky=artGrad(0,0,0,H,[[0,'#39749b'],[.48,'#89b2c4'],[1,'#e8c7b2']]);ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    artMoon(565,145,47);
    for(let i=0;i<8;i++){const x=(i*121-(game.time*13)%121);const y=180+(i%3)*110;artCloud(x,y,.7+(i%2)*.2,'rgba(255,249,229,.27)')}
    artPath([[0,620],[100,480],[210,570],[320,440],[440,565],[550,450],[660,550],[720,495],[720,1000],[0,1000]],'rgba(80,117,142,.28)');
    artPath([[0,770],[90,640],[190,720],[300,600],[420,710],[540,590],[650,695],[720,650],[720,1000],[0,1000]],'rgba(51,89,116,.2)');
  }
  function drawFloatingPlatform(p,screenY){
    ctx.save();ctx.translate(p.x,screenY);
    ctx.shadowBlur=16;ctx.shadowColor='rgba(61,92,128,.25)';
    ctx.fillStyle='#6a7e89';ctx.beginPath();ctx.moveTo(0,4);ctx.lineTo(p.w,4);ctx.lineTo(p.w-12,25);ctx.lineTo(13,25);ctx.closePath();ctx.fill();
    const g=artGrad(0,-7,0,12,[[0,'#d4e4d5'],[1,'#7fa4a4']]);ctx.fillStyle=g;ctx.strokeStyle='#526c83';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(-5,-9,p.w+10,17,8);ctx.fill();ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(10,-5);ctx.lineTo(p.w-10,-5);ctx.stroke();
    artStar(p.w*.48,-25,5,'#fff0c7');ctx.restore();
  }
  function drawJumper(){
    drawJumperBackdrop();
    game.platforms.forEach(p=>drawFloatingPlatform(p,p.y-game.camera));
    const p=game.player,y=p.y-game.camera;
    ctx.save();ctx.translate(p.x,y);
    // Small cloud-jumper with scarf, round backpack and a wind-swept cape.
    ctx.fillStyle='rgba(32,61,88,.22)';ctx.beginPath();ctx.ellipse(0,36,35,8,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#d7a2a8';ctx.beginPath();ctx.moveTo(-12,-6);ctx.quadraticCurveTo(-56,-31,-45,20);ctx.quadraticCurveTo(-24,10,-4,13);ctx.fill();
    ctx.fillStyle='#f0c5a8';ctx.beginPath();ctx.arc(0,-20,24,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#504767';ctx.lineWidth=4;ctx.stroke();
    ctx.fillStyle='#302c48';ctx.beginPath();ctx.moveTo(-23,-22);ctx.quadraticCurveTo(-18,-64,15,-49);ctx.quadraticCurveTo(34,-35,22,-8);ctx.lineTo(13,-20);ctx.lineTo(-7,-17);ctx.closePath();ctx.fill();
    ctx.fillStyle='#fff3e5';ctx.beginPath();ctx.ellipse(8,-19,4,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#302b43';ctx.beginPath();ctx.arc(9,-18,2.5,0,Math.PI*2);ctx.fill();
    const jacket=artGrad(-25,0,25,60,[[0,'#a4c5c5'],[1,'#647ca3']]);ctx.fillStyle=jacket;ctx.strokeStyle='#4a4e70';ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(-26,3,52,49,14);ctx.fill();ctx.stroke();
    ctx.fillStyle='#d9c4a5';ctx.beginPath();ctx.arc(0,24,9,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#403b5a';ctx.lineWidth=11;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-13,47);ctx.lineTo(-18,68);ctx.moveTo(13,47);ctx.lineTo(18,68);ctx.stroke();
    ctx.restore();
  }
  function drawSpaceBackdrop(){
    const g=artGrad(0,0,0,H,[[0,'#080f28'],[.5,'#151e3b'],[1,'#261d48']]);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    const neb=ctx.createRadialGradient(480,340,15,480,340,420);neb.addColorStop(0,'rgba(100,90,163,.32)');neb.addColorStop(.6,'rgba(65,79,130,.12)');neb.addColorStop(1,'rgba(65,79,130,0)');ctx.fillStyle=neb;ctx.fillRect(0,0,W,H);
    artMoon(125,180,65);
    ctx.strokeStyle='rgba(178,157,219,.18)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(125,180,112,36,-.4,0,Math.PI*2);ctx.stroke();
    game.stars.forEach((s,i)=>{const x=(s.x+(i%2?1:-1)*game.time*(5+i%5)+W*10)%W;artStar(x,s.y,Math.max(1.3,s.r),i%5===0?'#f2cc91':'rgba(223,232,255,.78)')});
    for(let i=0;i<4;i++){const x=40+i*180;ctx.strokeStyle='rgba(152,198,219,.14)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,680,65+i*10,.1,2.4);ctx.stroke()}
  }
  function drawStarShip(x,y){
    ctx.save();ctx.translate(x,y);ctx.shadowBlur=25;ctx.shadowColor='#92dcf0';
    ctx.fillStyle='#d5eaf0';ctx.strokeStyle='#42567a';ctx.lineWidth=5;
    ctx.beginPath();ctx.moveTo(0,-53);ctx.quadraticCurveTo(20,-12,42,30);ctx.lineTo(13,19);ctx.lineTo(0,34);ctx.lineTo(-13,19);ctx.lineTo(-42,30);ctx.quadraticCurveTo(-20,-12,0,-53);ctx.fill();ctx.stroke();
    ctx.fillStyle='#7bb7d0';ctx.beginPath();ctx.ellipse(0,-5,11,22,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ffcc9b';ctx.beginPath();ctx.moveTo(-13,27);ctx.lineTo(0,53+Math.sin(game.time*18)*8);ctx.lineTo(13,27);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#fff1d5';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-30,34);ctx.lineTo(-20,24);ctx.moveTo(30,34);ctx.lineTo(20,24);ctx.stroke();ctx.restore();
  }
  function drawCosmicVisitor(e){
    ctx.save();ctx.translate(e.x,e.y);ctx.rotate(Math.sin(game.time*2+e.x)*.12);
    ctx.shadowBlur=20;ctx.shadowColor='#ca9be3';
    const g=artGrad(-28,-28,28,35,[[0,'#f0c1a6'],[.5,'#b681c9'],[1,'#625a99']]);
    ctx.fillStyle=g;ctx.strokeStyle='#443b68';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,-31);ctx.quadraticCurveTo(15,-19,31,-6);ctx.lineTo(21,24);ctx.quadraticCurveTo(0,43,-21,24);ctx.lineTo(-31,-6);ctx.quadraticCurveTo(-15,-19,0,-31);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff1d3';ctx.beginPath();ctx.arc(-9,0,4,0,Math.PI*2);ctx.arc(9,0,4,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#51416f';ctx.beginPath();ctx.arc(-9,0,2,0,Math.PI*2);ctx.arc(9,0,2,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#ffdfa8';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-29);ctx.lineTo(0,-43);ctx.stroke();artStar(0,-47,5,'#ffdfa8');
    ctx.restore();
  }
  function drawSpace(){
    drawSpaceBackdrop();
    game.bullets.forEach(b=>{ctx.save();ctx.shadowBlur=16;ctx.shadowColor='#a9eaff';ctx.strokeStyle='#c1f1f5';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x,b.y+19);ctx.stroke();artStar(b.x,b.y,5,'#f4e1aa');ctx.restore()});
    game.enemies.forEach(e=>{if(!e.dead)drawCosmicVisitor(e)});
    drawStarShip(game.player.x,game.player.y);
    ctx.fillStyle='#f2d9a5';ctx.font='500 18px "DM Mono"';ctx.fillText('SHIELDS',28,48);
    for(let i=0;i<game.lives;i++){ctx.fillStyle='#96d9e5';ctx.fillRect(28+i*25,63,17,5)}
  }
  function drawBrickBackdrop(){
    const g=artGrad(0,0,0,H,[[0,'#18213a'],[.55,'#101a30'],[1,'#0d172a']]);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    for(let x=0;x<W;x+=60){ctx.strokeStyle='rgba(172,194,218,.055)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
    for(let y=0;y<H;y+=60){ctx.strokeStyle='rgba(172,194,218,.055)';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
    const halo=ctx.createRadialGradient(360,300,20,360,300,500);halo.addColorStop(0,'rgba(161,115,180,.15)');halo.addColorStop(1,'rgba(161,115,180,0)');ctx.fillStyle=halo;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(230,200,166,.3)';ctx.lineWidth=3;ctx.strokeRect(18,18,W-36,H-36);
  }
  function drawBrickTile(b){
    const hue=b.hue||320;
    const main='hsl('+hue+',48%,57%)',light='hsl('+hue+',70%,82%)',dark='hsl('+hue+',48%,35%)';
    ctx.save();ctx.shadowBlur=13;ctx.shadowColor=main;
    ctx.fillStyle=dark;ctx.beginPath();ctx.roundRect(b.x,b.y+4,b.w,b.h,6);ctx.fill();
    ctx.fillStyle=main;ctx.beginPath();ctx.roundRect(b.x,b.y,b.w,b.h-5,6);ctx.fill();
    ctx.fillStyle=light;ctx.globalAlpha=.62;ctx.beginPath();ctx.roundRect(b.x+4,b.y+3,b.w-8,4,3);ctx.fill();ctx.globalAlpha=1;
    ctx.strokeStyle='rgba(255,246,225,.55)';ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(b.x+1,b.y+1,b.w-2,b.h-7,5);ctx.stroke();
    ctx.restore();
  }
  function drawBrick(){
    drawBrickBackdrop();
    game.bricks.forEach(b=>{if(b.alive)drawBrickTile(b)});
    const p=game.paddle;ctx.save();ctx.shadowBlur=22;ctx.shadowColor='#91d9e8';
    ctx.fillStyle='#263e59';ctx.beginPath();ctx.roundRect(p.x-p.w/2,p.y+5,p.w,15,8);ctx.fill();
    const g=artGrad(p.x-p.w/2,p.y,p.x+p.w/2,p.y+10,[[0,'#6f9eaf'],[.5,'#e2eee2'],[1,'#7b9fb7']]);ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(p.x-p.w/2,p.y,p.w,10,5);ctx.fill();ctx.restore();
    const b=game.ball;ctx.save();ctx.shadowBlur=25;ctx.shadowColor='#ffe1a4';const orb=ctx.createRadialGradient(b.x-5,b.y-6,2,b.x,b.y,b.r+3);orb.addColorStop(0,'#fffdf1');orb.addColorStop(.45,'#fbe6bd');orb.addColorStop(1,'#d58f78');ctx.fillStyle=orb;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff4d7';ctx.lineWidth=2;ctx.stroke();ctx.restore();
    ctx.fillStyle='#e7d8ba';ctx.font='500 16px "DM Mono"';ctx.fillText('BALLS  '+game.lives,28,55);
  }
  function draw(){
    if(!current)return;
    if(current==='flappy')drawFlappy();
    else if(current==='runner')drawRunner(false);
    else if(current==='racer')drawRunner(true);
    else if(current==='jumper')drawJumper();
    else if(current==='space')drawSpace();
    else if(current==='brick')drawBrick();
  }
  function updateRunner(dt,isCar){
    game.speed=Math.min(isCar?840:760,game.speed+dt*8);
    distance+=game.speed*dt/23;
    game.spawn+=dt;
    if(game.spawn > (isCar ? .82 : 1.02)){
      const lane=Math.floor(Math.random()*3);
      game.obstacles.push({lane,y:-80,z:Math.random()});
      if(Math.random()>.23){const coinLane=Math.floor(Math.random()*3);game.pickups.push({x:180+coinLane*180,y:-260})}
      game.spawn=0;
    }
    if(game.jump>0||game.jumpV>0){
      game.jump=Math.max(0,game.jump+game.jumpV*dt);
      game.jumpV-=1600*dt;
      if(game.jump===0)game.jumpV=0;
    }
    if(game.slide>0)game.slide=Math.max(0,game.slide-dt);
    game.obstacles.forEach(o=>o.y+=game.speed*dt);
    game.pickups.forEach(c=>c.y+=game.speed*dt);
    const playerY=825-(game.jump||0);
    for(const o of game.obstacles){
      if(o.lane===game.lane&&o.y>playerY-72&&o.y<playerY+50&&game.jump<62&&game.slide<=0){endGame();return}
    }
    game.pickups=game.pickups.filter(c=>{
      if(c.y>playerY-42&&c.y<playerY+42&&Math.abs(c.x-(180+game.lane*180))<65){coins++;tone(880);return false}
      return c.y<H+35;
    });
    game.obstacles=game.obstacles.filter(o=>o.y<H+100);
    setScore(Math.floor(distance)+coins*10);
  }

})();
