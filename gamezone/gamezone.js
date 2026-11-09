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
    current=id;state='ready';screen.classList.add('active');screen.classList.toggle('runner-active',id==='runner');screen.setAttribute('aria-hidden','false');$('runnerControls').hidden=id!=='runner';
    $('gameTitle').textContent=games[id].title;$('controlHint').textContent=games[id].hint;$('overlaySymbol').textContent=games[id].symbol;
    $('overlayTitle').textContent='READY TO PLAY?';$('overlayText').textContent=games[id].start;$('overlayEyebrow').textContent='LUNA ARCADE · '+id.toUpperCase();
    $('startButton').innerHTML='START GAME <span>→</span>';overlay.classList.remove('hidden');
    setScore(0);coins=0;distance=0;initGame(id);draw();
    if(window.Telegram&&Telegram.WebApp){try{Telegram.WebApp.expand();Telegram.WebApp.requestFullscreen&&Telegram.WebApp.requestFullscreen();Telegram.WebApp.HapticFeedback.impactOccurred('light')}catch(_){}}
  }
  function closeGame(){
    state='menu';current=null;cancelAnimationFrame(raf);screen.classList.remove('active','runner-active');$('runnerControls').hidden=true;screen.setAttribute('aria-hidden','true');
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
    if(id==='flappy'){game.player={x:190,y:470,vy:0,r:28,rot:0};game.pipes=[];game.spawn=0;game.passed=0;game.pipes.push(makePipe(900));}
    if(id==='runner'){game.lane=1;game.targetLane=1;game.laneVisual=1;game.obstacles=[];game.pickups=[];game.spawn=0;game.jump=0;game.jumpV=0;game.slide=0;game.flash=0;game.speed=430;game.runnerMode='select';game.heroIndex=runnerClampV2(runRead('hero',0),0,2);game.runnerDistance=0;game.runnerStage=0;game.runnerEffects={magnet:0,x2:0,jet:0,shoes:0,board:0};game.runnerKeys=1;game.runnerInvul=0;game.rideT=0;game.runnerSaved=false;game.runnerBest=bestOf('runner');try{game.runnerKeys=runRead('keys',1)}catch(_){}}if(id==='racer'){game.lane=1;game.targetLane=1;game.obstacles=[];game.pickups=[];game.spawn=0;game.jump=0;game.jumpV=0;game.slide=0;game.flash=0;game.speed=430;}
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
    if(p.y>H-95||p.y<38){endGame();return}
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
    if(current==='runner'&&state==='playing'&&game.runnerMode!=='run'){const runnerY=(e.clientY-rect.top)/rect.height*H;runHandleTap(pointerX,runnerY);pointerDown=false;swipeStart=null;return;}if(current==='flappy'){flap();return}
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
    drawLunaMascot(game.player.x,game.player.y,game.player.rot,.72);
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


  // Classic side-scrolling pixel-art presentation for Flappy Luna.
  // Original sprites and scenery are drawn from simple pixel blocks.
  function drawFlappyBackdrop(){
    const unit=4;
    ctx.save();
    ctx.scale(unit,unit);
    const w=W/unit,h=H/unit;
    ctx.fillStyle='#70c5ce';ctx.fillRect(0,0,w,h);

    // Distant blocky clouds.
    const cloud=(x,y,s=1)=>{
      x=Math.round(x);y=Math.round(y);
      ctx.fillStyle='#f4fbf5';
      const blocks=[[-11,3,7,3],[-7,0,7,5],[-1,-3,8,8],[5,0,8,5],[10,3,7,3]];
      blocks.forEach(([a,b,c,d])=>ctx.fillRect(x+Math.round(a*s),y+Math.round(b*s),Math.round(c*s),Math.round(d*s)));
      ctx.fillStyle='rgba(255,255,255,.55)';ctx.fillRect(x-5*s,y-1*s,9*s,2*s);
    };
    cloud(27,37,.75);cloud(128,56,.9);cloud(73,125,1.1);cloud(155,139,.8);

    // Pale city silhouette with small square windows.
    ctx.fillStyle='#9ddce0';
    const buildings=[
      [0,163,9,26],[10,155,8,34],[20,158,12,31],[35,149,10,40],
      [47,157,8,32],[57,146,12,43],[72,155,8,34],[82,150,13,39],
      [98,158,9,31],[110,148,12,41],[126,155,9,34],[138,150,10,39],
      [151,158,9,31],[164,151,10,38],[175,160,5,29]
    ];
    buildings.forEach(([x,y,bw,bh])=>{
      ctx.fillRect(x,y,bw,bh);
      ctx.fillStyle='#70c5ce';
      for(let wy=y+5;wy<y+bh-3;wy+=7)for(let wx=x+2;wx<x+bw-1;wx+=4)ctx.fillRect(wx,wy,2,3);
      ctx.fillStyle='#9ddce0';
    });

    // Rolling green hills in the familiar flat, pixel-era palette.
    ctx.fillStyle='#8bd15a';
    ctx.fillRect(0,177,w,52);
    [[0,174,28,7],[21,169,30,11],[48,175,32,7],[78,168,34,12],[111,174,30,8],[139,166,31,14],[163,173,25,8]]
      .forEach(([x,y,bw,bh])=>ctx.fillRect(x,y,bw,bh));
    ctx.fillStyle='#74c94f';
    ctx.fillRect(0,185,w,44);
    [[0,181,35,8],[32,178,31,9],[66,184,33,6],[100,177,36,10],[138,181,30,8],[165,179,15,8]]
      .forEach(([x,y,bw,bh])=>ctx.fillRect(x,y,bw,bh));

    // Ground: grass lip, dark soil line and sandy lower band.
    ctx.fillStyle='#ded895';ctx.fillRect(0,229,w,21);
    ctx.fillStyle='#78c94c';ctx.fillRect(0,225,w,5);
    ctx.fillStyle='#4ba83e';ctx.fillRect(0,225,w,2);
    ctx.fillStyle='#8c6b43';ctx.fillRect(0,230,w,2);
    ctx.fillStyle='#f1df9a';ctx.fillRect(0,233,w,17);
    ctx.fillStyle='rgba(255,255,226,.65)';ctx.fillRect(0,234,w,2);
    // Small blades on the turf edge.
    ctx.fillStyle='#5ab746';
    for(let x=2;x<w;x+=9){ctx.fillRect(x,222,2,4);ctx.fillRect(x+3,224,1,3)}
    ctx.restore();
  }

  function drawGateColumn(x,y,h,flip=false){
    // Retained as a compatibility helper; classic pipes are drawn below.
    const px=Math.round(x/4),py=Math.round(y/4),ph=Math.max(0,Math.round(h/4));
    ctx.save();ctx.scale(4,4);
    ctx.fillStyle='#236b36';ctx.fillRect(px-1,py,24,ph);
    ctx.fillStyle='#69d54c';ctx.fillRect(px+2,py,5,ph);
    ctx.fillStyle='#35a83e';ctx.fillRect(px+7,py,10,ph);
    ctx.fillStyle='#18793b';ctx.fillRect(px+17,py,5,ph);
    ctx.restore();
  }

  function drawLunaMascot(x,y,rotation=0,scale=1){
    // Original tiny yellow bird, inspired by the classic arcade silhouette.
    const px=Math.round(x/4),py=Math.round(y/4);
    ctx.save();ctx.scale(4,4);ctx.translate(px,py);ctx.rotate(rotation*.55);ctx.scale(scale,scale);
    const rect=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h)};
    // Tail feathers and outline.
    rect(-10,-2,3,5,'#4a392c');rect(-12,-1,3,3,'#4a392c');
    rect(-9,-3,3,5,'#f5b83f');rect(-11,-2,3,3,'#f5b83f');
    // Body silhouette.
    rect(-8,-6,13,12,'#4a392c');rect(-6,-8,10,14,'#4a392c');rect(-3,-9,7,13,'#4a392c');
    rect(-7,-6,11,10,'#ffdf4f');rect(-5,-8,8,12,'#ffdf4f');rect(-2,-9,5,11,'#ffdf4f');
    // Soft underside and small wing that flaps.
    rect(-5,2,8,2,'#eebd3e');rect(-7,-1,6,5,'#edbd42');
    const wingY=Math.round(Math.sin(game.time*16)*2);
    rect(-6,wingY,6,3,'#fff0a4');rect(-4,wingY+1,4,2,'#f6d76d');
    // Eye and beak.
    rect(2,-6,4,5,'#fffdf2');rect(4,-5,2,3,'#2e2a28');rect(4,-6,1,1,'#fff');
    rect(5,-1,6,4,'#56362d');rect(6,0,6,3,'#e64c35');rect(7,0,4,1,'#ff8b45');
    // Tiny feet.
    rect(-1,6,2,2,'#c77b35');rect(3,6,2,2,'#c77b35');
    ctx.restore();
  }

  function drawFlappy(){
    drawFlappyBackdrop();
    const s=4;
    // Pixel-perfect green pipes with black outlines, bright edge highlights
    // and a wide cap at the opening.
    game.pipes.forEach(p=>{
      const x=Math.round(p.x/s),top=Math.round((p.center-p.gap/2)/s),bottom=Math.round((p.center+p.gap/2)/s);
      const pipe=(px,py,pw,ph,capAtBottom)=>{
        if(ph<=0)return;
        ctx.save();ctx.scale(s,s);
        // Body: deep outline, bright vertical gradient bands.
        ctx.fillStyle='#174c2b';ctx.fillRect(px-1,py,pw+2,ph);
        ctx.fillStyle='#228b3d';ctx.fillRect(px,py,pw,ph);
        ctx.fillStyle='#6ee45a';ctx.fillRect(px+3,py,5,ph);
        ctx.fillStyle='#42c84a';ctx.fillRect(px+8,py,8,ph);
        ctx.fillStyle='#24993e';ctx.fillRect(px+16,py,5,ph);
        ctx.fillStyle='#177332';ctx.fillRect(px+21,py,2,ph);
        ctx.fillStyle='rgba(255,255,255,.38)';ctx.fillRect(px+4,py,2,ph);
        // Cap has a dark outline and a raised pale green rim.
        const cy=capAtBottom?py+ph-7:py;
        ctx.fillStyle='#174c2b';ctx.fillRect(px-3,cy-1,29,10);
        ctx.fillStyle='#2ca346';ctx.fillRect(px-2,cy,27,7);
        ctx.fillStyle='#79e85e';ctx.fillRect(px,cy,6,3);
        ctx.fillStyle='#4ecb4a';ctx.fillRect(px+6,cy,13,3);
        ctx.fillStyle='#248c3a';ctx.fillRect(px+19,cy,5,6);
        ctx.fillStyle='rgba(255,255,255,.4)';ctx.fillRect(px+2,cy+1,2,4);
        ctx.fillStyle='#174c2b';ctx.fillRect(px-2,cy+7,27,2);
        ctx.restore();
      };
      // Upper pipe extends down to its cap; lower pipe starts at its cap.
      pipe(x,0,23,top-3,true);
      pipe(x,bottom+3,23,250-(bottom+3),false);
    });

    // The classic fixed-score position remains visible inside the playfield.
    ctx.save();ctx.scale(4,4);
    ctx.font='bold 13px monospace';ctx.textAlign='center';ctx.lineJoin='round';
    ctx.lineWidth=3;ctx.strokeStyle='#31515a';ctx.strokeText(String(score),90,24);
    ctx.fillStyle='#fff';ctx.fillText(String(score),90,24);
    ctx.restore();

    drawLunaMascot(game.player.x,game.player.y,game.player.rot,1);
  }


  // SUBWAY-STYLE LUNA RUN ENGINE — original artwork, three-track perspective.
  games.runner.hint='SWIPE LEFT / RIGHT · UP TO JUMP · DOWN TO SLIDE';
  games.runner.start='Dash through three tracks. Dodge trains, jump barriers, slide under signs and collect moon coins.';
  games.runner.over='The tracks got the better of you. Ready for another run?';
  function runnerClampV2(n,a,b){return Math.max(a,Math.min(b,n))}
  function runProject(lane,z){
    const d=runnerClampV2(z,0,1.12),half=92+d*365;
    return {x:360+(lane-1)*half*.66,y:366+Math.pow(Math.min(1,d),1.7)*606,scale:.13+d*1.02,half,laneWidth:half*2/3};
  }
  function runCloud(x,y,s){
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.fillStyle='rgba(255,255,255,.82)';
    ctx.beginPath();ctx.arc(-28,4,21,0,Math.PI*2);ctx.arc(-5,-8,28,0,Math.PI*2);ctx.arc(22,3,21,0,Math.PI*2);ctx.fill();ctx.fillRect(-30,2,55,18);ctx.restore();
  }
  function drawSubwaySky(){
    const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#54c8ee');sky.addColorStop(.43,'#b4e8e8');sky.addColorStop(.66,'#e7f1d6');sky.addColorStop(1,'#8fbf75');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    const sun=ctx.createRadialGradient(555,150,12,555,150,190);sun.addColorStop(0,'rgba(255,246,190,.75)');sun.addColorStop(1,'rgba(255,246,190,0)');ctx.fillStyle=sun;ctx.fillRect(340,0,380,360);
    runCloud(115,112,.8);runCloud(360,178,.55);runCloud(610,95,.95);
    const buildings=[[0,278,55,95],[58,245,65,128],[128,270,48,103],[181,223,64,150],[250,260,52,113],[307,238,70,136],[384,267,48,107],[439,226,66,148],[511,257,56,117],[573,232,65,142],[644,270,76,104]];
    buildings.forEach((b,i)=>{const [x,y,w,h]=b;ctx.fillStyle=i%2?'#8bc7bd':'#7ab4b3';ctx.fillRect(x,y,w,h);ctx.fillStyle='rgba(239,250,218,.58)';for(let wy=y+14;wy<y+h-9;wy+=22)for(let wx=x+10;wx<x+w-6;wx+=16)ctx.fillRect(wx,wy,6,9);ctx.fillStyle='#5c9d9d';ctx.fillRect(x+w*.5-2,y-10,4,10)});
    ctx.fillStyle='#80c46e';ctx.beginPath();ctx.moveTo(0,365);ctx.lineTo(220,355);ctx.lineTo(0,520);ctx.fill();ctx.beginPath();ctx.moveTo(720,365);ctx.lineTo(500,355);ctx.lineTo(720,520);ctx.fill();
    for(let side=0;side<2;side++)for(let i=0;i<5;i++){const x=side?550+i*42:170-i*42,y=355+(i%2)*18;ctx.fillStyle='#367d60';ctx.beginPath();ctx.arc(x,y,17,0,Math.PI*2);ctx.fill();ctx.fillStyle='#4b9a69';ctx.beginPath();ctx.arc(x-7,y-8,13,0,Math.PI*2);ctx.fill();ctx.fillStyle='#765c47';ctx.fillRect(x-3,y+10,6,24)}
  }
  function drawRunTracks(){
    const horizon=366;ctx.fillStyle='#5b9e68';ctx.beginPath();ctx.moveTo(0,horizon);ctx.lineTo(720,horizon);ctx.lineTo(720,H);ctx.lineTo(0,H);ctx.fill();
    ctx.fillStyle='#697b77';ctx.beginPath();ctx.moveTo(252,horizon);ctx.lineTo(468,horizon);ctx.lineTo(850,H);ctx.lineTo(-130,H);ctx.fill();
    for(let lane=0;lane<3;lane++){
      const a=runProject(lane,0),b=runProject(lane,1),aw=a.laneWidth*.49,bw=b.laneWidth*.49;
      ctx.fillStyle=lane===1?'#69716e':'#747875';ctx.beginPath();ctx.moveTo(a.x-aw,horizon);ctx.lineTo(a.x+aw,horizon);ctx.lineTo(b.x+bw,H);ctx.lineTo(b.x-bw,H);ctx.fill();
    }
    const offset=(game.time*.52)%1;
    for(let lane=0;lane<3;lane++)for(let i=0;i<19;i++){
      const z=((i/19)+offset)%1,p=runProject(lane,z),w=p.laneWidth*.82,h=2+z*17;
      ctx.fillStyle='rgba(36,43,43,.42)';ctx.fillRect(p.x-w/2,p.y-h/2+4,w,h);
      ctx.fillStyle='#765d4c';ctx.fillRect(p.x-w/2,p.y-h/2,w,h);ctx.fillStyle='rgba(224,190,145,.38)';ctx.fillRect(p.x-w/2,p.y-h/2,w,h*.22);
    }
    for(let lane=0;lane<3;lane++){
      const a=runProject(lane,0),b=runProject(lane,1),oa=a.laneWidth*.25,ob=b.laneWidth*.25;
      [-1,1].forEach(side=>{ctx.lineCap='round';ctx.strokeStyle='#344c50';ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(a.x+side*oa,horizon);ctx.lineTo(b.x+side*ob,H);ctx.stroke();ctx.strokeStyle='#d5ded5';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(a.x+side*oa-1,horizon);ctx.lineTo(b.x+side*ob-1,H);ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.72)';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(a.x+side*oa-2,horizon);ctx.lineTo(b.x+side*ob-2,H);ctx.stroke()});
    }
    ctx.strokeStyle='rgba(53,91,92,.6)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(248,260);ctx.lineTo(360,375);ctx.lineTo(472,260);ctx.stroke();
    ctx.strokeStyle='rgba(63,93,92,.45)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(278,294);ctx.lineTo(442,294);ctx.moveTo(310,325);ctx.lineTo(410,325);ctx.stroke();
  }
  function drawRunCoin(c){
    const p=runProject(c.lane,c.z),r=7+p.scale*10,spin=.34+Math.abs(Math.sin(game.time*8+c.z*13))*.66;
    ctx.save();ctx.translate(p.x,p.y-42*p.scale);ctx.scale(spin,1);ctx.shadowBlur=18;ctx.shadowColor='#ffdf62';
    const g=ctx.createLinearGradient(-r,-r,r,r);g.addColorStop(0,'#fff9b7');g.addColorStop(.45,'#ffc83d');g.addColorStop(1,'#d47a25');
    ctx.fillStyle=g;ctx.strokeStyle='#fff2a0';ctx.lineWidth=Math.max(1,2*p.scale);ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff8cf';ctx.font='bold '+Math.max(8,r*1.25)+'px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('✦',0,1);ctx.restore();
  }
  function drawRunTrain(o){
    const p=runProject(o.lane,o.z),s=p.scale,w=148*s,h=190*s;ctx.save();ctx.translate(p.x,p.y-h*.83);ctx.shadowBlur=24*s;ctx.shadowColor='rgba(28,53,67,.3)';
    const body=ctx.createLinearGradient(-w/2,0,w/2,0);body.addColorStop(0,'#277e91');body.addColorStop(.25,'#56b9bd');body.addColorStop(.7,'#3b9ba9');body.addColorStop(1,'#205f78');
    ctx.fillStyle=body;ctx.strokeStyle='#e3f2dd';ctx.lineWidth=Math.max(1,4*s);ctx.beginPath();ctx.roundRect(-w/2,0,w,h,12*s);ctx.fill();ctx.stroke();
    ctx.fillStyle='#183d55';ctx.beginPath();ctx.roundRect(-w*.36,h*.13,w*.72,h*.38,8*s);ctx.fill();ctx.fillStyle='#9ad9d9';ctx.beginPath();ctx.roundRect(-w*.32,h*.16,w*.64,h*.29,5*s);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=Math.max(1,2*s);ctx.beginPath();ctx.moveTo(0,h*.17);ctx.lineTo(0,h*.44);ctx.stroke();
    ctx.fillStyle='#f9f0c1';ctx.shadowBlur=12*s;ctx.shadowColor='#fff2b1';ctx.beginPath();ctx.arc(-w*.31,h*.83,5*s,0,Math.PI*2);ctx.arc(w*.31,h*.83,5*s,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#e8bd58';ctx.fillRect(-w*.25,h*.58,w*.5,5*s);ctx.fillStyle='#f2f2dc';ctx.fillRect(-w*.43,h*.93,w*.86,7*s);ctx.restore();
  }
  function drawRunBarrier(o){
    const p=runProject(o.lane,o.z),s=p.scale,w=116*s,h=36*s;ctx.save();ctx.translate(p.x,p.y-12*s);ctx.shadowBlur=12*s;ctx.shadowColor='rgba(32,38,32,.28)';
    ctx.strokeStyle='#4b5552';ctx.lineWidth=Math.max(2,7*s);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-w*.34,4*s);ctx.lineTo(-w*.4,h+17*s);ctx.moveTo(w*.34,4*s);ctx.lineTo(w*.4,h+17*s);ctx.stroke();
    ctx.fillStyle='#f8c84f';ctx.strokeStyle='#8f572f';ctx.lineWidth=Math.max(1,3*s);ctx.beginPath();ctx.roundRect(-w/2,0,w,h,4*s);ctx.fill();ctx.stroke();
    ctx.save();ctx.beginPath();ctx.roundRect(-w/2+2*s,2*s,w-4*s,h-4*s,3*s);ctx.clip();ctx.strokeStyle='#e36d42';ctx.lineWidth=Math.max(3,13*s);for(let i=-2;i<5;i++){ctx.beginPath();ctx.moveTo(i*30*s,h);ctx.lineTo(i*30*s+34*s,0);ctx.stroke()}ctx.restore();ctx.restore();
  }
  function drawRunOverhead(o){
    const p=runProject(o.lane,o.z),s=p.scale,w=145*s,beam=22*s;ctx.save();ctx.translate(p.x,p.y-112*s);
    ctx.strokeStyle='#4b5a58';ctx.lineWidth=Math.max(3,8*s);ctx.beginPath();ctx.moveTo(-w*.43,0);ctx.lineTo(-w*.43,112*s);ctx.moveTo(w*.43,0);ctx.lineTo(w*.43,112*s);ctx.stroke();
    const g=ctx.createLinearGradient(0,-beam/2,0,beam/2);g.addColorStop(0,'#f7db75');g.addColorStop(1,'#da864a');ctx.fillStyle=g;ctx.strokeStyle='#714b43';ctx.lineWidth=Math.max(1,3*s);ctx.beginPath();ctx.roundRect(-w/2,-beam/2,w,beam,5*s);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff0b8';ctx.font='bold '+Math.max(7,12*s)+'px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('WATCH YOUR HEAD',0,0);ctx.restore();
  }
  function drawRunObstacle(o){if(o.z<.035)return;if(o.type==='train')drawRunTrain(o);else if(o.type==='overhead')drawRunOverhead(o);else drawRunBarrier(o)}
  function drawRunCourier(){
    const lane=game.laneVisual===undefined?1:game.laneVisual,p=runProject(lane,.965),jump=Math.min(158,game.jump||0),sliding=game.slide>0;
    const x=p.x,y=828-jump*.72+(sliding?20:0),bob=Math.sin(game.time*17)*3,run=Math.sin(game.time*15),stride=Math.cos(game.time*15);
    ctx.save();ctx.translate(x,y+bob);ctx.scale(1,sliding?.56:1);
    ctx.save();ctx.translate(0,sliding?100:103);ctx.scale(1,.24);ctx.fillStyle='rgba(19,34,35,.28)';ctx.beginPath();ctx.ellipse(0,0,48,19,0,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.fillStyle='#f17a42';ctx.beginPath();ctx.moveTo(-17,-49);ctx.quadraticCurveTo(-65,-57+run*5,-77,-30+run*8);ctx.lineTo(-47,-15);ctx.lineTo(-18,-28);ctx.closePath();ctx.fill();
    ctx.fillStyle='#ffc06a';ctx.beginPath();ctx.moveTo(-53,-39);ctx.lineTo(-76,-30+run*8);ctx.lineTo(-51,-27);ctx.fill();
    ctx.lineCap='round';ctx.strokeStyle='#263b4e';ctx.lineWidth=19;ctx.beginPath();ctx.moveTo(-15,47);ctx.lineTo(-21+stride*17,84);ctx.moveTo(15,47);ctx.lineTo(21-stride*17,84);ctx.stroke();
    ctx.strokeStyle='#e9eff0';ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(-21+stride*17,84);ctx.lineTo(-31+stride*17,99);ctx.moveTo(21-stride*17,84);ctx.lineTo(31-stride*17,99);ctx.stroke();
    ctx.fillStyle='#f6ad55';ctx.beginPath();ctx.ellipse(-34+stride*17,100,15,7,-.08,0,Math.PI*2);ctx.ellipse(29-stride*17,100,15,7,-.08,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#e9b38f';ctx.lineWidth=14;ctx.beginPath();ctx.moveTo(-27,-27);ctx.lineTo(-39-run*12,12);ctx.moveTo(27,-27);ctx.lineTo(39+run*12,9);ctx.stroke();
    const jacket=ctx.createLinearGradient(-34,-36,36,53);jacket.addColorStop(0,'#79d5cc');jacket.addColorStop(.55,'#2698a6');jacket.addColorStop(1,'#17647d');
    ctx.fillStyle=jacket;ctx.strokeStyle='#174b61';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-28,-38);ctx.quadraticCurveTo(0,-54,28,-38);ctx.lineTo(37,42);ctx.quadraticCurveTo(0,59,-37,42);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#ed9a54';ctx.strokeStyle='#754b49';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(-21,-19,42,49,10);ctx.fill();ctx.stroke();ctx.fillStyle='#ffd18a';ctx.fillRect(-14,-11,28,5);
    ctx.strokeStyle='#e4e9d9';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-24,-30);ctx.lineTo(-17,29);ctx.moveTo(24,-30);ctx.lineTo(17,29);ctx.stroke();
    ctx.fillStyle='#e7b28e';ctx.beginPath();ctx.ellipse(0,-59,24,27,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#29364a';ctx.beginPath();ctx.moveTo(-24,-64);ctx.quadraticCurveTo(-28,-99,0,-96);ctx.quadraticCurveTo(31,-94,25,-59);ctx.lineTo(13,-42);ctx.lineTo(-13,-43);ctx.closePath();ctx.fill();
    ctx.fillStyle='#43b8b3';ctx.beginPath();ctx.ellipse(0,-83,24,11,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f1cc71';ctx.fillRect(-4,-94,8,4);ctx.restore();
  }
  function drawSubwayRunner(){
    drawSubwaySky();drawRunTracks();
    for(let i=0;i<8;i++){const z=((i/8)+(game.time*.22)%1)%1,y=366+z*z*500,spread=95+z*420;[-1,1].forEach(side=>{const x=360+side*spread;ctx.strokeStyle='rgba(54,91,86,'+(.25+z*.55)+')';ctx.lineWidth=2+z*4;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-70*z-12);ctx.stroke();ctx.fillStyle='#f8e7a7';ctx.beginPath();ctx.arc(x,y-70*z-12,2+z*4,0,Math.PI*2);ctx.fill()})}
    game.pickups.slice().sort((a,b)=>a.z-b.z).forEach(drawRunCoin);game.obstacles.slice().sort((a,b)=>a.z-b.z).forEach(drawRunObstacle);drawRunCourier();
    const shade=ctx.createLinearGradient(0,0,0,H);shade.addColorStop(0,'rgba(18,50,62,.04)');shade.addColorStop(1,'rgba(10,28,35,.18)');ctx.fillStyle=shade;ctx.fillRect(0,0,W,H);
    ctx.fillStyle='rgba(255,255,255,.9)';ctx.font='bold 19px "DM Mono"';ctx.textAlign='left';ctx.fillText('☾ '+coins,26,48);ctx.textAlign='right';ctx.fillStyle='rgba(255,255,255,.75)';ctx.font='11px "DM Mono"';ctx.fillText('DISTANCE',690,29);
  }
  function updateSubwayRunner(dt){
    if(game.laneVisual===undefined)game.laneVisual=1;game.laneVisual+=(game.targetLane-game.laneVisual)*Math.min(1,dt*13);
    game.speed=Math.min(790,game.speed+dt*8);distance+=game.speed*dt/23;const travel=dt*(.42+game.speed/1650);game.spawn+=dt;
    if(game.spawn>Math.max(.88,1.38-(game.speed-430)/900)){
      const lane=Math.floor(Math.random()*3),roll=Math.random(),type=roll<.28?'train':roll<.76?'barrier':'overhead';game.obstacles.push({lane,z:.015,type});
      if(Math.random()>.2){const coinLane=(lane+1+Math.floor(Math.random()*2))%3;for(let i=0;i<5;i++)game.pickups.push({lane:coinLane,z:-.13+i*.115})}
      else for(let i=0;i<4;i++)game.pickups.push({lane,z:-.18+i*.12});
      game.spawn=0;
    }
    game.obstacles.forEach(o=>o.z+=travel);game.pickups.forEach(c=>c.z+=travel);
    if(game.jump>0||game.jumpV>0){game.jump=Math.max(0,game.jump+game.jumpV*dt);game.jumpV-=1580*dt;if(game.jump===0)game.jumpV=0}
    if(game.slide>0)game.slide=Math.max(0,game.slide-dt);
    const activeLane=Math.round(game.laneVisual);
    for(const o of game.obstacles){if(o.lane!==activeLane||o.z<.875||o.z>1.03)continue;if(o.type==='barrier'&&game.jump>78)continue;if(o.type==='overhead'&&game.slide>0)continue;endGame();return}
    game.pickups=game.pickups.filter(c=>{if(c.lane===activeLane&&c.z>.86&&c.z<1.02){coins++;tone(880);return false}return c.z<1.1});
    game.obstacles=game.obstacles.filter(o=>o.z<1.1);setScore(Math.floor(distance)+coins*10);
  }
  function draw(){
    if(!current)return;
    if(current==='flappy')drawFlappy();else if(current==='runner')drawSubwayRunner();else if(current==='racer')drawRunner(true);else if(current==='jumper')drawJumper();else if(current==='space')drawSpace();else if(current==='brick')drawBrick();
  }
  function update(dt){
    if(current==='flappy')updateFlappy(dt);else if(current==='runner')updateSubwayRunner(dt);else if(current==='racer')updateRunner(dt,true);else if(current==='jumper')updateJumper(dt);else if(current==='space')updateSpace(dt);else if(current==='brick')updateBrick(dt);
  }
  function action(dx,dy){
    if(state!=='playing')return;
    if(current==='runner'){if(dx){game.targetLane=runnerClampV2(game.targetLane+dx,0,2);game.lane=game.targetLane}if(dy<0&&game.jump<=0&&game.slide<=0){game.jump=1;game.jumpV=735;tone(600)}if(dy>0){game.slide=.78;tone(340)}return}
    if(current==='racer'){if(dx)game.targetLane=runnerClampV2(game.targetLane+dx,0,2),game.lane=game.targetLane;if(dy<0&&game.jump<=0){game.jump=1;game.jumpV=620;tone(600)}if(dy>0)game.slide=.55}
    if(current==='jumper')game.player.vx=dx*560;
    if(current==='brick'&&game.ball.stuck){game.ball.stuck=false;game.ball.vy=-480;tone(520)}
  }


  // LUNA_NATIVE_GAME_DIRECT_LAUNCH
  // Telegram Gaming Platform opens each registered game with ?game=<slug>.
  // Start that title directly, without showing the GameZone lobby first.
  try {
    const requestedGame = new URLSearchParams(window.location.search).get('game');
    if (requestedGame && Object.prototype.hasOwnProperty.call(games, requestedGame)) {
      openGame(requestedGame);
      startGame();
    }
  } catch (error) {
    console.warn('Luna direct game launch could not start:', error);
  }


  // -----------------------------------------------------------------------
  // LUNA RUN — original 3D-perspective arcade runner.
  // Hero select, changing rail districts, trains, ramps, coin trails,
  // power-ups, revive keys, pause and tactile controls.
  // -----------------------------------------------------------------------
  games.runner.start='Pick your hero, then dash through changing rail districts. Dodge trains, jump barriers, roll under signs and collect coins and power-ups.';
  games.runner.over='The last train caught up. Choose a new runner and beat your best distance.';
  const RUN_HEROES=[
    {name:'LUNA',tag:'MOONLIGHT SPRINTER',body:'#9069b8',shine:'#d8b8f0',dark:'#302746',scarf:'#f1c58b',hair:'#28233c',skin:'#e8b99c',pack:'#5c9f9d',accent:'#ffe3a6'},
    {name:'RONIN',tag:'NIGHT TRACK RUNNER',body:'#315b9a',shine:'#89b9ee',dark:'#18243d',scarf:'#f07870',hair:'#292438',skin:'#dca27f',pack:'#a54d60',accent:'#ffb18e'},
    {name:'VOLT',tag:'STARBORN EXPLORER',body:'#4a9eaa',shine:'#a9ebe2',dark:'#233e56',scarf:'#f1d16c',hair:'#e3d8c5',skin:'#d5aa8e',pack:'#e2a35d',accent:'#e4fbff'}
  ];
  const RUN_STAGES=[
    {name:'SUNSET YARD',sky:['#30205f','#c45d82','#ffbd78'],far:'#80618d',mid:'#57456e',ground:'#427d65',track:'#676b6d',accent:'#ffe0a0',rain:0},
    {name:'NEON NIGHT',sky:['#101c4b','#4c318c','#ed6ba9'],far:'#34396e',mid:'#262d59',ground:'#263e68',track:'#454c69',accent:'#74e6ff',rain:0},
    {name:'TEAL DAWN',sky:['#129bd0','#75d9ca','#e7f6bc'],far:'#4a9c9e',mid:'#357b83',ground:'#4e9d69',track:'#667975',accent:'#fff0a2',rain:0},
    {name:'STORM RAIL',sky:['#302052','#7776a8','#c5b8d8'],far:'#555377',mid:'#3e4264',ground:'#355c61',track:'#4a5963',accent:'#f3a6d4',rain:1}
  ];
  const RUN_ITEMS={
    magnet:{label:'MAGNET',color:'#ef5575',duration:9,mark:'M'},
    x2:{label:'2X SCORE',color:'#438bff',duration:10,mark:'2X'},
    jet:{label:'JETPACK',color:'#ff9c42',duration:6,mark:'J'},
    shoes:{label:'SNEAKERS',color:'#48d58c',duration:10,mark:'S'},
    board:{label:'HOVERBOARD',color:'#2dc9ee',duration:18,mark:'B'},
    mystery:{label:'MYSTERY BOX',color:'#a879ef',duration:0,mark:'?'},
    key:{label:'LUNA KEY',color:'#ffcf56',duration:0,mark:'K'}
  };
  const runRead=(key,fallback)=>{try{const v=localStorage.getItem('luna_runner_'+key);return v===null?fallback:(Number(v)||0)}catch(_){return fallback}};
  const runWrite=(key,value)=>{try{localStorage.setItem('luna_runner_'+key,String(value))}catch(_){}};
  const runClamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const runStage=()=>RUN_STAGES[game.runnerStage||0];
  function runProject(lane,z){
    z=runnerClampV2(z,0,1.12);
    const half=74+z*302;
    return {x:360+(lane-1)*(48+z*236),y:352+Math.pow(Math.min(z,1),1.7)*610,
      scale:.17+z*1.03,half:half,laneWidth:half*2/3};
  }
  function runPoly(points,fill,stroke,lineWidth){
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth||2;ctx.stroke()}
  }
  function runSky(){
    const st=runStage(),g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,st.sky[0]);g.addColorStop(.43,st.sky[1]);g.addColorStop(1,st.sky[2]);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    const glow=ctx.createRadialGradient(535,190,8,535,190,300);glow.addColorStop(0,'rgba(255,239,185,.42)');glow.addColorStop(1,'rgba(255,239,185,0)');
    ctx.fillStyle=glow;ctx.fillRect(250,0,470,470);
    // Soft cloud banks and layered city silhouettes.
    for(let i=0;i<5;i++){
      const x=(i*183-(game.time*5)%930+930)%930-100,y=115+(i%3)*54,s=.55+(i%2)*.28;
      ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.fillStyle='rgba(255,255,255,.26)';
      ctx.beginPath();ctx.arc(-22,2,19,0,Math.PI*2);ctx.arc(0,-8,25,0,Math.PI*2);ctx.arc(25,2,17,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    for(let layer=0;layer<3;layer++){
      const base=354+layer*46,step=72-layer*10,shift=(game.time*(layer+1)*3)%step;
      for(let i=-1;i<12;i++){
        const x=i*step-shift,w=35+(i*19%27+27)%27,h=60+((i*41+layer*29+1100)%115);
        ctx.fillStyle=layer===0?st.far:layer===1?st.mid:'#26364b';
        ctx.fillRect(x,base-h,w,h);
        ctx.fillStyle='rgba(255,230,174,'+(layer===0?.24:.38)+')';
        for(let wy=base-h+15;wy<base-8;wy+=23)for(let wx=x+8;wx<x+w-4;wx+=15)if(((wx+wy+i)%3)>0)ctx.fillRect(wx,wy,5,8);
      }
    }
    // Track-side trees, fence posts and warm station lamps.
    for(let side=0;side<2;side++)for(let i=0;i<6;i++){
      const x=side?555+i*44:165-i*44,y=356+(i%2)*18;
      ctx.fillStyle='#315d54';ctx.beginPath();ctx.arc(x,y,18,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#508765';ctx.beginPath();ctx.arc(x-6,y-8,12,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#765844';ctx.fillRect(x-3,y+9,6,27);
      ctx.fillStyle=st.accent;ctx.globalAlpha=.5;ctx.beginPath();ctx.arc(x,y-18,3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    }
    if(st.rain){
      ctx.strokeStyle='rgba(225,239,255,.34)';ctx.lineWidth=2;ctx.beginPath();
      for(let i=0;i<24;i++){const x=(i*37+game.time*90)%W,y=(i*59+game.time*260)%H;ctx.moveTo(x,y);ctx.lineTo(x-5,y+23)}ctx.stroke();
    }
  }
  function runTracks(){
    const horizon=352;
    ctx.fillStyle=runStage().ground;ctx.beginPath();ctx.moveTo(0,horizon);ctx.lineTo(W,horizon);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();
    ctx.fillStyle=runStage().track;
    runPoly([[282,horizon],[438,horizon],[820,H],[-100,H]],runStage().track);
    // Projected lane beds with converging sleepers and triple rails.
    for(let lane=0;lane<3;lane++){
      const a=runProject(lane,0),b=runProject(lane,1),wa=a.laneWidth*.47,wb=b.laneWidth*.47;
      runPoly([[a.x-wa,horizon],[a.x+wa,horizon],[b.x+wb,H],[b.x-wb,H]],lane===1?'rgba(35,47,53,.2)':'rgba(255,255,255,.035)');
      for(let i=0;i<21;i++){
        const z=((i/21)+(game.time*.37)%1)%1,p=runProject(lane,z),w=p.laneWidth*.84,h=2+z*12;
        ctx.fillStyle='rgba(35,34,38,.35)';ctx.fillRect(p.x-w/2,p.y-h/2+3,w,h);
        ctx.fillStyle='#806750';ctx.fillRect(p.x-w/2,p.y-h/2,w,h);
        ctx.fillStyle='rgba(234,201,158,.35)';ctx.fillRect(p.x-w/2,p.y-h/2,w,h*.22);
      }
      const railOffA=a.laneWidth*.26,railOffB=b.laneWidth*.26;
      [-1,1].forEach(side=>{
        ctx.lineCap='round';ctx.strokeStyle='#34484d';ctx.lineWidth=11;
        ctx.beginPath();ctx.moveTo(a.x+side*railOffA,horizon);ctx.lineTo(b.x+side*railOffB,H);ctx.stroke();
        ctx.strokeStyle='#d6dfdc';ctx.lineWidth=4;
        ctx.beginPath();ctx.moveTo(a.x+side*railOffA-1,horizon);ctx.lineTo(b.x+side*railOffB-1,H);ctx.stroke();
        ctx.strokeStyle='rgba(255,255,255,.72)';ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(a.x+side*railOffA-2,horizon);ctx.lineTo(b.x+side*railOffB-2,H);ctx.stroke();
      });
    }
    // overhead catenary frame and wires
    ctx.strokeStyle='rgba(51,75,79,.62)';ctx.lineWidth=4;ctx.beginPath();
    ctx.moveTo(240,245);ctx.lineTo(360,365);ctx.lineTo(480,245);ctx.moveTo(240,245);ctx.lineTo(480,245);ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.24)';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(270,278);ctx.lineTo(450,278);ctx.moveTo(303,312);ctx.lineTo(417,312);ctx.stroke();
  }
  function runDrawCoin(c){
    const p=runProject(c.lane,c.z),r=(c.type==='super'?11:8)+p.scale*8;
    ctx.save();ctx.translate(p.x,p.y-43*p.scale);ctx.scale(.42+Math.abs(Math.sin(game.time*8+c.z*9))*.58,1);
    ctx.shadowBlur=18;ctx.shadowColor=c.type==='super'?'#8eeaff':'#ffda65';
    const g=ctx.createLinearGradient(-r,-r,r,r);g.addColorStop(0,'#fff8be');g.addColorStop(.5,'#ffc83e');g.addColorStop(1,'#d57d29');
    ctx.fillStyle=g;ctx.strokeStyle='#fff0ae';ctx.lineWidth=Math.max(1,2*p.scale);
    ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff6d0';ctx.font='bold '+Math.max(8,r*1.3)+'px serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(c.type==='super'?'✦':'☾',0,1);ctx.restore();
  }
  function runDrawPickup(c){
    const p=runProject(c.lane,c.z),item=RUN_ITEMS[c.type],r=17*p.scale+7;
    ctx.save();ctx.translate(p.x,p.y-64*p.scale);ctx.rotate(Math.sin(game.time*2+c.z*3)*.08);
    ctx.shadowBlur=24*p.scale;ctx.shadowColor=item.color;
    const g=ctx.createLinearGradient(-r,-r,r,r);g.addColorStop(0,'#fff');g.addColorStop(.35,item.color);g.addColorStop(1,'#24334d');
    ctx.fillStyle=g;ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=Math.max(1,2*p.scale);
    ctx.beginPath();ctx.roundRect(-r,-r,r*2,r*2,7*p.scale+2);ctx.fill();ctx.stroke();
    ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.font='900 '+Math.max(10,20*p.scale)+'px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(item.mark,0,1);ctx.restore();
  }
  function runTrain(o){
    const p=runProject(o.lane,o.z),s=p.scale,w=146*s,h=205*s,x=p.x,y=p.y;
    ctx.save();ctx.translate(x,y-h);ctx.shadowBlur=24*s;ctx.shadowColor='rgba(12,28,42,.32)';
    const g=ctx.createLinearGradient(-w/2,0,w/2,0);g.addColorStop(0,'#23667f');g.addColorStop(.22,'#58b7b4');g.addColorStop(.7,'#328d9f');g.addColorStop(1,'#164d70');
    ctx.fillStyle=g;ctx.strokeStyle='#e4eee1';ctx.lineWidth=Math.max(1,4*s);
    ctx.beginPath();ctx.roundRect(-w/2,0,w,h,12*s);ctx.fill();ctx.stroke();
    // front windscreen, split glass and safety stripe
    ctx.fillStyle='#183d56';ctx.beginPath();ctx.roundRect(-w*.37,h*.13,w*.74,h*.38,8*s);ctx.fill();
    const glass=ctx.createLinearGradient(0,h*.16,0,h*.48);glass.addColorStop(0,'#bdebe3');glass.addColorStop(1,'#4f9fba');
    ctx.fillStyle=glass;ctx.beginPath();ctx.roundRect(-w*.32,h*.17,w*.64,h*.29,5*s);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=Math.max(1,2*s);ctx.beginPath();ctx.moveTo(0,h*.17);ctx.lineTo(0,h*.45);ctx.stroke();
    ctx.fillStyle='#f3c968';ctx.fillRect(-w*.28,h*.6,w*.56,7*s);
    ctx.fillStyle='#fff0b5';ctx.shadowBlur=12*s;ctx.shadowColor='#fff0b5';
    ctx.beginPath();ctx.arc(-w*.31,h*.84,5*s,0,Math.PI*2);ctx.arc(w*.31,h*.84,5*s,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#263d4a';ctx.fillRect(-w*.42,h*.94,w*.84,8*s);
    ctx.restore();
    // side plane gives the carriage a stronger 3D silhouette
    ctx.save();runPoly([[x+w*.48,y-h*.92],[x+w*.62,y-h*.78],[x+w*.62,y-5*s],[x+w*.48,y]],'rgba(17,59,77,.85)');
    ctx.restore();
  }
  function runBarrier(o){
    const p=runProject(o.lane,o.z),s=p.scale,w=112*s,h=37*s,x=p.x,y=p.y-15*s;
    ctx.save();ctx.translate(x,y);
    ctx.strokeStyle='#4d5550';ctx.lineWidth=Math.max(2,7*s);ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-w*.34,4*s);ctx.lineTo(-w*.4,h+17*s);ctx.moveTo(w*.34,4*s);ctx.lineTo(w*.4,h+17*s);ctx.stroke();
    ctx.fillStyle='#f8c94e';ctx.strokeStyle='#86553b';ctx.lineWidth=Math.max(1,3*s);ctx.beginPath();ctx.roundRect(-w/2,0,w,h,4*s);ctx.fill();ctx.stroke();
    ctx.save();ctx.beginPath();ctx.rect(-w/2,0,w,h);ctx.clip();ctx.strokeStyle='#e56e43';ctx.lineWidth=Math.max(3,13*s);
    for(let i=-2;i<5;i++){ctx.beginPath();ctx.moveTo(i*28*s,h);ctx.lineTo(i*28*s+35*s,0);ctx.stroke()}ctx.restore();ctx.restore();
  }
  function runOverhead(o){
    const p=runProject(o.lane,o.z),s=p.scale,w=132*s,x=p.x,y=p.y;
    ctx.save();ctx.strokeStyle='#4a5b5b';ctx.lineWidth=Math.max(2,8*s);
    ctx.beginPath();ctx.moveTo(x-w*.43,y-130*s);ctx.lineTo(x-w*.43,y);ctx.moveTo(x+w*.43,y-130*s);ctx.lineTo(x+w*.43,y);ctx.stroke();
    const g=ctx.createLinearGradient(0,y-142*s,0,y-120*s);g.addColorStop(0,'#fff0a4');g.addColorStop(1,'#d78b4b');
    ctx.fillStyle=g;ctx.strokeStyle='#784e42';ctx.lineWidth=Math.max(1,3*s);
    ctx.beginPath();ctx.roundRect(x-w/2,y-145*s,w,25*s,5*s);ctx.fill();ctx.stroke();
    ctx.fillStyle='#805038';ctx.font='bold '+Math.max(7,11*s)+'px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('ROLL',x,y-132*s);ctx.restore();
  }
  function runRamp(o){
    const p=runProject(o.lane,o.z),s=p.scale,w=115*s,h=90*s;
    runPoly([[p.x-w/2,p.y],[p.x+w/2,p.y],[p.x+w*.38,p.y-h],[p.x-w*.38,p.y-h]],'#b78954','#f5d09a',Math.max(1,3*s));
    ctx.strokeStyle='rgba(255,241,206,.7)';ctx.lineWidth=Math.max(1,3*s);
    for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(p.x-w*.36+i*w*.19,p.y-h*(.8-i*.08));ctx.lineTo(p.x-w*.34+i*w*.19,p.y-h*(.8-i*.08)+7*s);ctx.stroke()}
  }
  function runDrawObstacle(o){
    if(o.z<.025)return;
    if(o.type==='train')runTrain(o);
    else if(o.type==='overhead')runOverhead(o);
    else if(o.type==='ramp')runRamp(o);
    else runBarrier(o);
  }
  function runDrawHero(index,x,y,scale,phase,sliding,jumping){
    const c=RUN_HEROES[index]||RUN_HEROES[0],s=scale,run=Math.sin(phase||0),stride=Math.cos(phase||0);
    ctx.save();ctx.translate(x,y);ctx.scale(s,sliding?.56:1);
    // soft shadow
    ctx.fillStyle='rgba(8,19,29,.28)';ctx.beginPath();ctx.ellipse(0,7,43,11,0,0,Math.PI*2);ctx.fill();
    // flowing scarf
    ctx.fillStyle=c.scarf;ctx.beginPath();ctx.moveTo(-15,-69);ctx.quadraticCurveTo(-70,-79+run*7,-78,-45+run*8);ctx.lineTo(-48,-28);ctx.lineTo(-16,-48);ctx.closePath();ctx.fill();
    // legs and trainers
    ctx.lineCap='round';ctx.strokeStyle=c.dark;ctx.lineWidth=18;
    ctx.beginPath();ctx.moveTo(-15,-42);ctx.lineTo(-22+stride*15,0);ctx.moveTo(15,-42);ctx.lineTo(22-stride*15,0);ctx.stroke();
    ctx.strokeStyle='#f2eade';ctx.lineWidth=12;ctx.beginPath();
    ctx.moveTo(-22+stride*15,0);ctx.lineTo(-36+stride*15,8);ctx.moveTo(22-stride*15,0);ctx.lineTo(36-stride*15,8);ctx.stroke();
    ctx.fillStyle=c.accent;ctx.beginPath();ctx.ellipse(-37+stride*15,9,13,6,0,0,Math.PI*2);ctx.ellipse(35-stride*15,9,13,6,0,0,Math.PI*2);ctx.fill();
    // arms pumping beside the jacket
    ctx.strokeStyle=c.skin;ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(-27,-112);ctx.lineTo(-42-run*10,-77);ctx.moveTo(27,-112);ctx.lineTo(42+run*10,-78);ctx.stroke();
    const body=ctx.createLinearGradient(-36,-118,36,-44);body.addColorStop(0,c.shine);body.addColorStop(.48,c.body);body.addColorStop(1,c.dark);
    ctx.fillStyle=body;ctx.strokeStyle='rgba(17,31,52,.8)';ctx.lineWidth=4;
    ctx.beginPath();ctx.moveTo(-27,-119);ctx.quadraticCurveTo(0,-135,27,-119);ctx.lineTo(35,-51);ctx.quadraticCurveTo(0,-37,-35,-51);ctx.closePath();ctx.fill();ctx.stroke();
    // backpack and straps
    ctx.fillStyle=c.pack;ctx.strokeStyle='rgba(25,36,55,.65)';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(-19,-110,38,43,8);ctx.fill();ctx.stroke();
    ctx.fillStyle=c.accent;ctx.fillRect(-11,-102,22,5);
    ctx.strokeStyle='rgba(255,247,226,.65)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-24,-115);ctx.lineTo(-18,-57);ctx.moveTo(24,-115);ctx.lineTo(18,-57);ctx.stroke();
    // head and distinct hair silhouette, viewed from behind
    ctx.fillStyle=c.skin;ctx.beginPath();ctx.ellipse(0,-145,23,26,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=c.hair;ctx.beginPath();ctx.moveTo(-24,-151);ctx.quadraticCurveTo(-28,-190,0,-185);ctx.quadraticCurveTo(31,-185,25,-148);ctx.lineTo(12,-128);ctx.lineTo(-12,-128);ctx.closePath();ctx.fill();
    ctx.fillStyle=c.body;ctx.beginPath();ctx.ellipse(0,-178,24,10,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=c.accent;ctx.fillRect(-5,-189,10,4);
    if(jumping){ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-47,-12);ctx.lineTo(-58,10);ctx.moveTo(47,-12);ctx.lineTo(58,10);ctx.stroke()}
    ctx.restore();
  }
  function runDrawHUD(){
    ctx.save();
    ctx.fillStyle='rgba(15,24,44,.66)';ctx.beginPath();ctx.roundRect(18,18,154,74,16);ctx.fill();
    ctx.fillStyle='#ffd369';ctx.beginPath();ctx.arc(43,47,12,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#59442b';ctx.font='bold 14px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('☾',43,47);
    ctx.fillStyle='#fff';ctx.textAlign='left';ctx.font='bold 21px "DM Mono"';ctx.fillText(String(coins),65,42);
    ctx.fillStyle='#ffe6b3';ctx.font='bold 12px "DM Mono"';ctx.fillText('KEYS '+game.runnerKeys,28,76);
    ctx.textAlign='right';ctx.fillStyle='#fff';ctx.font='bold 30px "Space Grotesk"';ctx.fillText(String(score),700,48);
    ctx.fillStyle='rgba(255,255,255,.75)';ctx.font='11px "DM Mono"';ctx.fillText('BEST '+Math.max(game.runnerBest||0,score),700,68);
    const active=Object.keys(game.runnerEffects).filter(k=>game.runnerEffects[k]>0);
    active.forEach((key,i)=>{
      const item=RUN_ITEMS[key],x=260+i*53,y=48;
      ctx.fillStyle='rgba(11,22,39,.75)';ctx.beginPath();ctx.arc(x,y,19,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=item.color;ctx.beginPath();ctx.arc(x,y,14,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff';ctx.font='bold 10px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(item.mark,x,y);
      ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,19,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,game.runnerEffects[key]/item.duration));ctx.stroke();
    });
    ctx.restore();
  }
  function runDrawMenu(){
    runSky();runTracks();
    ctx.fillStyle='rgba(9,16,34,.44)';ctx.fillRect(0,0,W,H);
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='900 53px "Space Grotesk"';ctx.fillStyle='#fff2db';ctx.fillText('LUNA RUN',360,145);
    ctx.font='bold 17px "DM Mono"';ctx.fillStyle=runStage().accent;ctx.fillText('CHOOSE YOUR RUNNER',360,195);
    RUN_HEROES.forEach((hero,i)=>{
      const x=38+i*232,y=300,w=216,h=350,selected=i===game.heroIndex;
      ctx.fillStyle=selected?'rgba(28,43,67,.93)':'rgba(13,23,43,.76)';
      ctx.beginPath();ctx.roundRect(x,y,w,h,18);ctx.fill();
      ctx.strokeStyle=selected?hero.accent:'rgba(255,255,255,.24)';ctx.lineWidth=selected?4:2;ctx.stroke();
      runDrawHero(i,x+w/2,y+255,.72,game.time*4+i,false,false);
      ctx.fillStyle=hero.accent;ctx.font='900 24px "Space Grotesk"';ctx.textAlign='center';ctx.fillText(hero.name,x+w/2,y+45);
      ctx.fillStyle='#ecedf5';ctx.font='10px "DM Mono"';ctx.fillText(hero.tag,x+w/2,y+74);
      ctx.fillStyle=selected?'#fff1c9':'#c8d0dc';ctx.font='bold 12px "DM Mono"';ctx.fillText(selected?'SELECTED':'TAP TO SELECT',x+w/2,y+320);
    });
    ctx.fillStyle='rgba(20,34,56,.92)';ctx.beginPath();ctx.roundRect(205,755,310,85,17);ctx.fill();
    ctx.strokeStyle='#f4d18f';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#f4d18f';ctx.font='900 22px "Space Grotesk"';ctx.fillText('START RUN  →',360,798);
    ctx.fillStyle='#fff';ctx.font='11px "DM Mono"';ctx.fillText('SWIPE OR USE THE BUTTONS BELOW',360,900);
    ctx.textAlign='left';
  }
  function runDrawOverlay(title,subtitle,buttonA,buttonB){
    ctx.fillStyle='rgba(7,13,29,.72)';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#fff1db';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='900 48px "Space Grotesk"';ctx.fillText(title,360,355);
    ctx.fillStyle='#d7dfec';ctx.font='14px "DM Mono"';ctx.fillText(subtitle,360,410);
    ctx.fillStyle='#f1c977';ctx.beginPath();ctx.roundRect(175,510,370,78,16);ctx.fill();
    ctx.fillStyle='#1b263b';ctx.font='900 20px "Space Grotesk"';ctx.fillText(buttonA,360,550);
    if(buttonB){
      ctx.fillStyle='rgba(255,255,255,.1)';ctx.beginPath();ctx.roundRect(175,615,370,66,14);ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle='#fff';ctx.font='bold 16px "Space Grotesk"';ctx.fillText(buttonB,360,648);
    }
    ctx.textAlign='left';
  }
  function drawSubwayRunner(){
    if(game.runnerMode==='select'){runDrawMenu();return}
    const st=runStage();runSky();runTracks();
    // station lamps and pylons recede into the vanishing point
    for(let i=0;i<10;i++){
      const z=((i/10)+(game.time*.16)%1)%1,p=runProject(i%2?0:2,z);
      ctx.strokeStyle='rgba(56,78,75,'+(.25+z*.5)+')';ctx.lineWidth=2+z*4;
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y-95*p.scale);ctx.stroke();
      ctx.fillStyle=st.accent;ctx.beginPath();ctx.arc(p.x,p.y-95*p.scale,3+z*3,0,Math.PI*2);ctx.fill();
    }
    game.pickups.filter(o=>o.type==='coin'||o.type==='super').sort((a,b)=>a.z-b.z).forEach(runDrawCoin);
    game.pickups.filter(o=>o.type!=='coin'&&o.type!=='super').sort((a,b)=>a.z-b.z).forEach(runDrawPickup);
    game.obstacles.slice().sort((a,b)=>a.z-b.z).forEach(runDrawObstacle);
    const lane=game.laneVisual===undefined?1:game.laneVisual;
    const heroY=845-(game.jump||0)*.85-(game.runnerEffects.jet>0?125:0)-(game.rideT>0?105:0);
    runDrawHero(game.heroIndex,360+(lane-1)*170,heroY,1.02,game.time*14,game.slide>0,game.jump>30);
    runDrawHUD();
    // Distance and active district ribbon
    ctx.fillStyle='rgba(10,22,39,.52)';ctx.beginPath();ctx.roundRect(245,110,230,34,10);ctx.fill();
    ctx.fillStyle=st.accent;ctx.font='bold 11px "DM Mono"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(st.name,360,127);
    if(game.runnerMode==='paused')runDrawOverlay('PAUSED','Your run is paused.','RESUME',null);
    if(game.runnerMode==='over')runDrawOverlay(game.runnerKeys>0?'CRASHED':'RUN OVER',
      game.runnerKeys>0?'Use one Luna Key to continue?':'Distance '+Math.floor(game.runnerDistance/10)+' · Coins '+coins,
      game.runnerKeys>0?'CONTINUE · '+game.runnerKeys+' KEY':'TRY AGAIN',
      game.runnerKeys>0?'END RUN / RETRY':null);
  }
  function runStart(){
    game.runnerMode='run';game.spawn=0;game.runnerInvul=1.1;
    game.lane=1;game.targetLane=1;game.laneVisual=1;
    game.obstacles=[];game.pickups=[];game.jump=0;game.jumpV=0;game.slide=0;
    if(!game.runnerEffects)game.runnerEffects={magnet:0,x2:0,jet:0,shoes:0,board:0};
    game.runnerDistance=0;game.speed=430;setScore(0);coins=0;
    tone(520);
  }
  function runUseItem(type){
    if(type==='mystery'){
      const prize=['magnet','x2','jet','shoes','board','key','coins'][Math.floor(Math.random()*7)];
      if(prize==='key'){game.runnerKeys++;runWrite('keys',game.runnerKeys);return}
      if(prize==='coins'){coins+=25;return}
      type=prize;
    }
    if(type==='key'){game.runnerKeys++;runWrite('keys',game.runnerKeys);return}
    if(type==='coins'){coins+=15;return}
    if(game.runnerEffects[type]!==undefined)game.runnerEffects[type]=RUN_ITEMS[type].duration;
    tone(760);
  }
  function runCrash(){
    if(game.runnerMode!=='run')return;
    if(game.runnerEffects.jet>0){return}
    if(game.runnerEffects.board>0){game.runnerEffects.board=0;game.runnerInvul=1.5;game.obstacles=game.obstacles.filter(o=>o.z<.84);tone(260);return}
    game.runnerMode='over';
    tone(150,.18);
  }
  function runSaveResult(){
    if(game.runnerSaved)return;
    game.runnerSaved=true;saveResult();game.runnerBest=bestOf('runner');
  }
  function runRetry(){
    runSaveResult();
    game.runnerEffects={magnet:0,x2:0,jet:0,shoes:0,board:0};
    game.runnerKeys=runRead('keys',game.runnerKeys);game.rideT=0;
    game.runnerMode='select';game.runnerSaved=false;
    game.obstacles=[];game.pickups=[];game.runnerDistance=0;game.speed=430;game.spawn=0;
    game.jump=0;game.jumpV=0;game.slide=0;setScore(0);coins=0;
  }
  function runContinue(){
    if(game.runnerKeys<1)return;
    game.runnerKeys--;runWrite('keys',game.runnerKeys);
    game.runnerMode='run';game.runnerInvul=2.5;game.obstacles=game.obstacles.filter(o=>o.z<.7);
    game.jump=0;game.jumpV=0;game.slide=0;tone(880);
  }
  function runHandleTap(x,y){
    if(game.runnerMode==='select'){
      if(y>=285&&y<=670){game.heroIndex=runnerClampV2(Math.floor(x/240),0,2);runWrite('hero',game.heroIndex);tone(600);return}
      if(y>=735&&y<=865)runStart();
      return;
    }
    if(game.runnerMode==='paused'){game.runnerMode='run';return}
    if(game.runnerMode==='over'){
      if(game.runnerKeys>0&&y>=480&&y<610)runContinue();
      else if(game.runnerKeys>0&&y>=610&&y<710)runRetry();
      else if(game.runnerKeys<1&&y>=480&&y<630)runRetry();
    }
  }
  function updateSubwayRunner(dt){
    if(game.runnerMode!=='run')return;
    game.runnerDistance+=game.speed*dt;
    game.speed=Math.min(870,game.speed+dt*9);
    const st=Math.floor(game.runnerDistance/5300)%RUN_STAGES.length;
    game.runnerStage=st;
    const travel=dt*(.36+game.speed/1900);
    game.spawn+=dt;
    if(game.spawn>Math.max(.78,1.32-game.speed/1900)){
      const lane=Math.floor(Math.random()*3),r=Math.random();
      const type=r<.23?'train':r<.61?'barrier':r<.83?'overhead':'ramp';
      if(type==='ramp'){game.obstacles.push({lane,z:.015,type:'ramp'});game.obstacles.push({lane,z:.255,type:'train'});game.pickups.push({lane,z:.24,type:'super',raised:true});}
      else game.obstacles.push({lane,z:.015,type});
      // Each sequence leaves at least one readable path.
      const safeLane=(lane+1+Math.floor(Math.random()*2))%3;
      for(let i=0;i<6;i++)game.pickups.push({lane:safeLane,z:-.12+i*.105,type:i%4===3?'super':'coin'});
      if(Math.random()<.23)game.pickups.push({lane:safeLane,z:.18,type:['magnet','x2','jet','shoes','board','mystery','key'][Math.floor(Math.random()*7)]});
      if(Math.random()<.2){
        const other=(lane+2)%3;
        for(let i=0;i<4;i++)game.pickups.push({lane:other,z:-.25+i*.12,type:'coin'});
      }
      game.spawn=0;
    }
    game.obstacles.forEach(o=>o.z+=travel);
    game.pickups.forEach(o=>o.z+=travel);
    game.runnerInvul=Math.max(0,game.runnerInvul-dt);game.rideT=Math.max(0,(game.rideT||0)-dt);
    Object.keys(game.runnerEffects).forEach(k=>game.runnerEffects[k]=Math.max(0,game.runnerEffects[k]-dt));
    game.laneVisual+=(game.targetLane-game.laneVisual)*Math.min(1,dt*12);
    if(game.jump>0||game.jumpV>0){
      game.jump=Math.max(0,game.jump+game.jumpV*dt);
      game.jumpV-=1650*dt;if(game.jump===0)game.jumpV=0;
    }
    if(game.slide>0)game.slide=Math.max(0,game.slide-dt);
    const activeLane=Math.round(game.laneVisual);
    // Pickups: the magnet slightly widens its collection radius.
    game.pickups=game.pickups.filter(o=>{
      const near=o.z>.88&&o.z<1.04;
      const magnet=game.runnerEffects.magnet>0&&o.type==='coin'&&o.z>.68;
      const laneMatch=Math.abs(o.lane-game.laneVisual)<(magnet?.95:.34);
      if((near||magnet)&&laneMatch){
        if(o.type==='coin'||o.type==='super'){
          const value=o.type==='super'?5:1;coins+=value*(game.runnerEffects.x2>0?2:1);tone(o.type==='super'?980:810);return false;
        }
        runUseItem(o.type);return false;
      }
      return o.z<1.12;
    });
    // Collision checks. A jump clears low barriers, rolls clear overheads.
    if(game.runnerInvul<=0&&game.runnerEffects.jet<=0){
      for(const o of game.obstacles){
        if(Math.abs(o.lane-game.laneVisual)>.34||o.z<.91||o.z>1.035)continue;
        if(o.type==='barrier'&&game.jump>78)continue;
        if(o.type==='overhead'&&game.slide>0)continue;
        if(o.type==='ramp'){game.rideT=2.7;game.jump=Math.max(game.jump,70);game.jumpV=0;continue;}
        if(o.type==='train'&&game.rideT>0)continue;
        runCrash();return;
      }
    }
    game.obstacles=game.obstacles.filter(o=>o.z<1.15);
    setScore(Math.floor(game.runnerDistance/12)*(game.runnerEffects.x2>0?2:1)+coins*10);
  }
  function action(dx,dy){
    if(state!=='playing')return;
    if(current==='runner'){
      if(game.runnerMode==='select'){if(dx){game.heroIndex=runnerClampV2(game.heroIndex+dx,0,2);runWrite('hero',game.heroIndex)}else if(dy<0)runStart();return}
      if(game.runnerMode==='paused'){if(dy!==0||dx!==0)game.runnerMode='run';return}
      if(game.runnerMode==='over'){if(dy<0&&game.runnerKeys>0)runContinue();else if(dy>0||game.runnerKeys<1)runRetry();return}
      if(dx){game.targetLane=runnerClampV2(game.targetLane+dx,0,2);game.lane=game.targetLane}
      if(dy<0&&game.jump<=0&&game.slide<=0){game.jump=1;game.jumpV=game.runnerEffects.shoes>0?880:730;tone(620)}
      if(dy>0&&game.jump<25){game.slide=.72;tone(350)}
      return;
    }
    if(current==='racer'){
      if(dx)game.targetLane=runnerClampV2(game.targetLane+dx,0,2),game.lane=game.targetLane;
      if(dy<0&&game.jump<=0){game.jump=1;game.jumpV=620;tone(600)}
      if(dy>0)game.slide=.55;
      return;
    }
    if(current==='jumper')game.player.vx=dx*560;
    if(current==='brick'&&game.ball.stuck){game.ball.stuck=false;game.ball.vy=-480;tone(520)}
  }
  // Special-key handling for selection, pause and revive screens.
  window.addEventListener('keydown',e=>{
    if(current!=='runner'||state!=='playing')return;
    if((e.key==='Enter'||e.key===' ')&&game.runnerMode==='select'){e.preventDefault();runStart()}
    else if((e.key==='p'||e.key==='P'||e.key==='Escape')&&game.runnerMode==='run'){e.preventDefault();game.runnerMode='paused'}
    else if((e.key==='Enter'||e.key===' ')&&game.runnerMode==='paused'){e.preventDefault();game.runnerMode='run'}
    else if((e.key==='r'||e.key==='R')&&game.runnerMode==='over'){e.preventDefault();if(game.runnerKeys>0)runContinue();else runRetry()}
  });
  // Touch deck shown only while Luna Run is open.
  $('runnerLeft').addEventListener('click',()=>action(-1,0));
  $('runnerRight').addEventListener('click',()=>action(1,0));
  $('runnerJump').addEventListener('click',()=>action(0,-1));
  $('runnerRoll').addEventListener('click',()=>action(0,1));
  $('runnerHeroBtn').addEventListener('click',()=>{if(current==='runner'&&state==='playing')game.runnerMode='select'});
  $('runnerPauseBtn').addEventListener('click',()=>{if(current==='runner'&&state==='playing')game.runnerMode=game.runnerMode==='paused'?'run':'paused';$('runnerPauseBtn').textContent=game.runnerMode==='paused'?'▶ RESUME':'Ⅱ PAUSE'});
  $('runnerSoundBtn').addEventListener('click',()=>{soundOn=!soundOn;$('runnerSoundBtn').textContent=soundOn?'♫ SOUND ON':'♫ SOUND OFF';if(soundOn)tone(540)});
  $('runnerSoundBtn').textContent=soundOn?'♫ SOUND ON':'♫ SOUND OFF';

  // Subway Hero Run finishing pass: longer metro trains, station detail and
  // clearer mobile-game visuals, while retaining Luna's original characters.
  function runDrawTrainCar(lane,z,isFront){
    const p=runProject(lane,z),s=p.scale,w=145*s,h=194*s,x=p.x,y=p.y;
    ctx.save();ctx.translate(x,y-h*.88);ctx.shadowBlur=22*s;ctx.shadowColor='rgba(12,28,42,.36)';
    const body=ctx.createLinearGradient(-w/2,0,w/2,0);
    body.addColorStop(0,'#174d68');body.addColorStop(.2,'#2e8295');body.addColorStop(.5,'#65c6c1');body.addColorStop(.8,'#338da0');body.addColorStop(1,'#164c68');
    ctx.fillStyle=body;ctx.strokeStyle='#e4f0df';ctx.lineWidth=Math.max(1.3,3.5*s);
    ctx.beginPath();ctx.roundRect(-w/2,0,w,h,11*s);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
    if(isFront){
      ctx.fillStyle='#173b55';ctx.beginPath();ctx.roundRect(-w*.37,h*.13,w*.74,h*.39,8*s);ctx.fill();
      const glass=ctx.createLinearGradient(0,h*.16,0,h*.49);glass.addColorStop(0,'#d5f4e9');glass.addColorStop(.52,'#8ed0cf');glass.addColorStop(1,'#397e9b');
      ctx.fillStyle=glass;ctx.beginPath();ctx.roundRect(-w*.32,h*.17,w*.64,h*.29,5*s);ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.86)';ctx.lineWidth=Math.max(1,2*s);ctx.beginPath();ctx.moveTo(0,h*.17);ctx.lineTo(0,h*.45);ctx.stroke();
      ctx.fillStyle='#f1c85e';ctx.fillRect(-w*.29,h*.59,w*.58,7*s);
      ctx.save();ctx.shadowColor='#fff0b5';ctx.shadowBlur=15*s;ctx.fillStyle='#fff5c8';
      ctx.beginPath();ctx.arc(-w*.31,h*.82,6*s,0,Math.PI*2);ctx.arc(w*.31,h*.82,6*s,0,Math.PI*2);ctx.fill();ctx.restore();
      ctx.fillStyle='#164a60';ctx.beginPath();ctx.roundRect(-w*.17,h*.91,w*.34,12*s,3*s);ctx.fill();
      ctx.fillStyle='#f7e6ac';ctx.font='bold '+Math.max(5,9*s)+'px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('LUNA LINE',0,h*.97);
    }else{
      for(let i=0;i<3;i++){
        const wx=-w*.36+i*w*.25,wy=h*.2,ww=w*.2,wh=h*.25;
        ctx.fillStyle='#173e58';ctx.beginPath();ctx.roundRect(wx,wy,ww,wh,4*s);ctx.fill();
        const glass=ctx.createLinearGradient(0,wy,0,wy+wh);glass.addColorStop(0,'#c5eee6');glass.addColorStop(1,'#5ca7b6');
        ctx.fillStyle=glass;ctx.beginPath();ctx.roundRect(wx+3*s,wy+3*s,ww-6*s,wh-6*s,3*s);ctx.fill();
      }
      ctx.fillStyle='#f1c85e';ctx.fillRect(-w*.43,h*.61,w*.86,6*s);
      ctx.strokeStyle='rgba(255,255,255,.4)';ctx.lineWidth=Math.max(1,s*1.5);ctx.beginPath();ctx.moveTo(-w*.47,h*.12);ctx.lineTo(-w*.47,h*.86);ctx.stroke();
    }
    ctx.fillStyle='#1c3c4c';ctx.fillRect(-w*.45,h*.88,w*.9,12*s);
    ctx.fillStyle='#e7e7d3';ctx.fillRect(-w*.43,h*.92,w*.86,4*s);
    ctx.fillStyle='#202c3b';ctx.beginPath();ctx.roundRect(-w*.39,h*.95,w*.2,13*s,3*s);ctx.roundRect(w*.19,h*.95,w*.2,13*s,3*s);ctx.fill();
    ctx.restore();
    if(isFront){
      ctx.save();runPoly([[x+w*.49,y-h*.83],[x+w*.63,y-h*.72],[x+w*.63,y-4*s],[x+w*.49,y]],'rgba(15,57,74,.88)');ctx.restore();
    }
  }
  function runTrain(o){
    // A connected three-car metro approaches along the chosen railway.
    runDrawTrainCar(o.lane,Math.max(.08,o.z-.30),false);
    runDrawTrainCar(o.lane,Math.max(.08,o.z-.15),false);
    runDrawTrainCar(o.lane,o.z,true);
  }
  function runBarrier(o){
    const p=runProject(o.lane,o.z),s=p.scale,w=118*s,h=39*s,x=p.x,y=p.y-14*s;
    ctx.save();ctx.translate(x,y);ctx.strokeStyle='#4d5550';ctx.lineWidth=Math.max(2,7*s);ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-w*.35,4*s);ctx.lineTo(-w*.42,h+20*s);ctx.moveTo(w*.35,4*s);ctx.lineTo(w*.42,h+20*s);ctx.stroke();
    ctx.fillStyle='#f8ca4d';ctx.strokeStyle='#765039';ctx.lineWidth=Math.max(1,3*s);
    ctx.beginPath();ctx.roundRect(-w/2,0,w,h,4*s);ctx.fill();ctx.stroke();
    ctx.save();ctx.beginPath();ctx.roundRect(-w/2+2*s,2*s,w-4*s,h-4*s,3*s);ctx.clip();
    ctx.strokeStyle='#e65045';ctx.lineWidth=Math.max(3,14*s);
    for(let i=-2;i<6;i++){ctx.beginPath();ctx.moveTo(i*29*s,h);ctx.lineTo(i*29*s+36*s,0);ctx.stroke()}
    ctx.restore();ctx.fillStyle='#fff2ca';ctx.fillRect(-w*.48,-5*s,w*.96,5*s);ctx.restore();
  }
  function runOverhead(o){
    const p=runProject(o.lane,o.z),s=p.scale,w=138*s,x=p.x,y=p.y;
    ctx.save();ctx.strokeStyle='#4a5b5b';ctx.lineWidth=Math.max(2,8*s);
    ctx.beginPath();ctx.moveTo(x-w*.43,y-136*s);ctx.lineTo(x-w*.43,y);ctx.moveTo(x+w*.43,y-136*s);ctx.lineTo(x+w*.43,y);ctx.stroke();
    const g=ctx.createLinearGradient(0,y-150*s,0,y-121*s);g.addColorStop(0,'#fff0a4');g.addColorStop(1,'#d78b4b');
    ctx.fillStyle=g;ctx.strokeStyle='#784e42';ctx.lineWidth=Math.max(1,3*s);
    ctx.beginPath();ctx.roundRect(x-w/2,y-150*s,w,27*s,5*s);ctx.fill();ctx.stroke();
    ctx.fillStyle='#76503c';ctx.font='bold '+Math.max(7,12*s)+'px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('↓ DUCK ↓',x,y-136*s);ctx.restore();
  }
  function drawSubwayRunner(){
    if(game.runnerMode==='select'){runDrawMenu();return}
    runSky();runTracks();
    // Station poles and illuminated signs recede toward the horizon.
    for(let i=0;i<12;i++){
      const z=((i/12)+(game.time*.18)%1)%1,lane=i%2?0:2,p=runProject(lane,z);
      ctx.strokeStyle='rgba(56,78,75,'+(.25+z*.52)+')';ctx.lineWidth=2+z*4;
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y-88*p.scale);ctx.stroke();
      ctx.fillStyle=runStage().accent;ctx.shadowBlur=10;ctx.shadowColor=runStage().accent;
      ctx.beginPath();ctx.arc(p.x,p.y-91*p.scale,3+z*3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      if(i%3===0){const sw=42*p.scale,sy=p.y-128*p.scale;ctx.fillStyle='rgba(18,42,54,.92)';ctx.fillRect(p.x-sw/2,sy,sw,17*p.scale);ctx.fillStyle='#f6e4b5';ctx.font='bold '+Math.max(6,10*p.scale)+'px Arial';ctx.textAlign='center';ctx.fillText('LUNA',p.x,sy+12*p.scale)}
    }
    game.pickups.filter(o=>o.type==='coin'||o.type==='super').slice().sort((a,b)=>a.z-b.z).forEach(runDrawCoin);
    game.pickups.filter(o=>o.type!=='coin'&&o.type!=='super').slice().sort((a,b)=>a.z-b.z).forEach(runDrawPickup);
    game.obstacles.slice().sort((a,b)=>a.z-b.z).forEach(runDrawObstacle);
    const lane=game.laneVisual===undefined?1:game.laneVisual,heroX=360+(lane-1)*170;
    const flying=game.runnerEffects.jet>0,heroY=845-(game.jump||0)*.85-(flying?125:0)-(game.rideT>0?105:0);
    if(game.runnerEffects.board>0){
      ctx.save();ctx.translate(heroX,heroY+97);ctx.shadowColor='#36d8ff';ctx.shadowBlur=25;
      const board=ctx.createLinearGradient(-48,0,48,0);board.addColorStop(0,'#24c8e8');board.addColorStop(.5,'#f4e9ba');board.addColorStop(1,'#875ce0');
      ctx.fillStyle=board;ctx.beginPath();ctx.roundRect(-46,-6,92,13,7);ctx.fill();ctx.fillStyle='#fff';ctx.fillRect(-30,-2,60,3);
      ctx.fillStyle='#18293d';ctx.beginPath();ctx.arc(-28,9,5,0,Math.PI*2);ctx.arc(28,9,5,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    if(flying){
      ctx.save();ctx.translate(heroX,heroY+73);
      for(let i=-1;i<=1;i++){const flame=22+Math.sin(game.time*24+i)*9,g=ctx.createLinearGradient(0,0,0,flame);g.addColorStop(0,'#fff5c4');g.addColorStop(.35,'#ffbd4b');g.addColorStop(1,'rgba(255,75,45,0)');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(i*12-5,0);ctx.lineTo(i*12,flame);ctx.lineTo(i*12+5,0);ctx.closePath();ctx.fill()}
      ctx.restore();
    }
    runDrawHero(game.heroIndex,heroX,heroY,1.02,game.time*14,game.slide>0,game.jump>30);
    if(game.runnerInvul>0&&Math.floor(game.time*16)%2===0){ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(heroX,heroY-75,49,91,0,0,Math.PI*2);ctx.stroke()}
    runDrawHUD();
    ctx.fillStyle='rgba(10,22,39,.58)';ctx.beginPath();ctx.roundRect(245,110,230,34,10);ctx.fill();
    ctx.fillStyle=runStage().accent;ctx.font='bold 11px "DM Mono"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(runStage().name,360,127);
    if(game.runnerMode==='paused')runDrawOverlay('PAUSED','Your run is paused.','RESUME',null);
    if(game.runnerMode==='over')runDrawOverlay(game.runnerKeys>0?'CAUGHT!':'RUN OVER',
      game.runnerKeys>0?'Use one Luna Key to continue?':'Distance '+Math.floor(game.runnerDistance/10)+' · Coins '+coins,
      game.runnerKeys>0?'CONTINUE · '+game.runnerKeys+' KEY':'TRY AGAIN',game.runnerKeys>0?'END RUN / RETRY':null);
  }


})();
