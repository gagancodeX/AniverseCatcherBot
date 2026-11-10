(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('gameCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // All 2D scenes render directly at the canvas's native 720x1000
  // resolution. No low-resolution intermediate buffer or palette reduction:
  // this preserves fine edges and avoids the blur on every game.
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  function finishPixelFrame() {
    // Kept as a no-op for existing call sites; never resample the game canvas.
  }
  const screen = $('gameScreen');
  const overlay = $('gameOverlay');
  const scoreValue = $('scoreValue');
  const soundToggle = $('soundToggle');
  const GAME_API_BASE = 'https://aniversecatcherbot.onrender.com';
  const games = {
    flappy:{title:'FLAPPY BIRD 🐦',symbol:'🐦',hint:'TAP TO FLY · SPACE TO FLAP',start:'Guide your little bird through the moonlit gates. One clean flight, one more high score.',over:'The night caught your bird. Ready for another flight?',color:'#cfb2ff'},
    runner:{title:'LUNA RUN',symbol:'✦',hint:'SWIPE LEFT / RIGHT · UP TO JUMP · DOWN TO SLIDE',start:'Dash through the lunar rails, dodge trains and collect glowing coins.',over:'Your run has ended. The next record is yours to chase.',color:'#f4c98b'},
    jumper:{title:'LUNA THE NINJA 🥷',symbol:'🥷',hint:'TAP LEFT / RIGHT SIDE · ARROW KEYS',start:'Leap from platform to platform through the moonlit skyline. Keep climbing.',over:'Your ninja journey pauses here. Climb higher next round!',color:'#9ce9ff'},
    space:{title:'LUNA STAR DEFENDER ☾',symbol:'☾',hint:'DRAG TO MOVE · AUTO FIRE',start:'Survive the lunar eclipse, guide your ship through the cosmic swarm and protect your score.',over:'The eclipse has passed. Ready for another mission?',color:'#9ce9ff'},
    brick:{title:'BREAKER BALL ◈',symbol:'◈',hint:'TAP TO LAUNCH · DRAG TO MOVE THE PADDLE',start:'Launch the glowing ball, guide your paddle and clear every lunar block.',over:'The ball slipped away. Reset and break your record.',color:'#f4a9df'},
    racer:{title:'RACE BLAZE 🚗',symbol:'🚗',hint:'SWIPE LEFT / RIGHT · ARROW KEYS',start:'Own the curves, overtake traffic and chase a new night-drive record.',over:'The road has cooled down. Ready to race again?',color:'#f4a9df'}
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
    submitGameScore(current, score);
  }
  function submitGameScore(gameId, finalScore){
    const initData=window.Telegram&&Telegram.WebApp&&Telegram.WebApp.initData;
    if(!initData||!gameId)return;
    fetch(GAME_API_BASE+'/api/game-score',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,game:gameId,score:Math.max(0,Math.floor(Number(finalScore)||0))})}).catch(()=>{});
  }
  async function showGameLeaderboard(gameId){
    if(!gameId||!games[gameId])return;
    const modal=$('leaderboardModal'),list=$('leaderboardList');
    $('leaderboardTitle').textContent=games[gameId].title+' · TOP 10';
    $('leaderboardGame').textContent='GLOBAL RANKINGS / '+gameId.toUpperCase();
    list.replaceChildren();
    const loading=document.createElement('li');loading.className='leaderboard-empty';loading.textContent='Loading scores…';list.appendChild(loading);
    modal.classList.add('active');modal.setAttribute('aria-hidden','false');
    try{
      const response=await fetch(GAME_API_BASE+'/api/game-leaderboard?game='+encodeURIComponent(gameId),{cache:'no-store'});
      const payload=await response.json();
      if(!response.ok||!payload.ok)throw new Error('Leaderboard unavailable');
      list.replaceChildren();
      if(!payload.entries.length){const empty=document.createElement('li');empty.className='leaderboard-empty';empty.textContent='No scores yet. Set the first record!';list.appendChild(empty);return}
      payload.entries.forEach(entry=>{
        const item=document.createElement('li');item.className='leaderboard-row';
        const rank=document.createElement('span');rank.className='leaderboard-rank';rank.textContent=String(entry.rank).padStart(2,'0');
        const identity=document.createElement('span');identity.className='leaderboard-player';
        const name=document.createElement('b');name.textContent=entry.name||'Player';
        const username=document.createElement('small');username.textContent=entry.username?'@'+entry.username:'LUNA PLAYER';
        identity.append(name,username);
        const points=document.createElement('strong');points.className='leaderboard-points';points.textContent=Number(entry.score||0).toLocaleString();
        item.append(rank,identity,points);list.appendChild(item);
      });
    }catch(_){
      list.replaceChildren();const failed=document.createElement('li');failed.className='leaderboard-empty';
      failed.textContent='Leaderboard is unavailable. Open GameZone from /gamezone and try again.';list.appendChild(failed);
    }
  }
  function setScore(value){score=Math.max(0,Math.floor(value));scoreValue.textContent=score.toLocaleString();if(current&&$('bestValue'))$('bestValue').textContent=Math.max(bestOf(current),score).toLocaleString()}
  function tone(freq,duration=.06){
    if(!soundOn)return;
    try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(.045,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration)}catch(_){}
  }
  function openGame(id){
    if(!games[id])return;
    if(id==='racer'){window.location.href='/racer.html';return;}
    current=id;state='ready';screen.classList.remove('runner-3d-active');screen.classList.add('active');screen.classList.toggle('runner-active',id==='runner');screen.setAttribute('aria-hidden','false');$('runnerControls').hidden=id!=='runner';
    if(id==='runner'){syncRunnerPauseButton();$('runnerSoundBtn').textContent=soundOn?'♫ SOUND ON':'♫ SOUND OFF';}
    $('gameTitle').textContent=games[id].title;$('controlHint').textContent=games[id].hint;$('overlaySymbol').textContent=games[id].symbol;
    $('overlayTitle').textContent='READY TO PLAY?';$('overlayText').textContent=games[id].start;$('overlayEyebrow').textContent='LUNA ARCADE · '+id.toUpperCase();
    $('startButton').innerHTML='START GAME <span>→</span>';overlay.classList.remove('hidden');
    setScore(0);coins=0;distance=0;initGame(id);$('bestValue').textContent=bestOf(id).toLocaleString();draw();finishPixelFrame();
    if(window.Telegram&&Telegram.WebApp){try{Telegram.WebApp.expand();Telegram.WebApp.requestFullscreen&&Telegram.WebApp.requestFullscreen();Telegram.WebApp.HapticFeedback.impactOccurred('light')}catch(_){}}
  }
  function closeGame(){
    if(current==='runner'&&state==='playing'&&game.runnerMode!=='select')runSaveResult();
    state='menu';current=null;cancelAnimationFrame(raf);screen.classList.remove('active','runner-active','runner-3d-active');$('runnerControls').hidden=true;screen.setAttribute('aria-hidden','true');
    if(window.Telegram&&Telegram.WebApp){try{Telegram.WebApp.exitFullscreen&&Telegram.WebApp.exitFullscreen();Telegram.WebApp.BackButton.hide()}catch(_){}}
  }
  function endGame(){
    if(state!=='playing')return;state='over';cancelAnimationFrame(raf);saveResult();
    $('overlaySymbol').textContent='✦';$('overlayTitle').textContent='RUN COMPLETE';$('overlayEyebrow').textContent='PERSONAL BEST · '+bestOf(current).toLocaleString();
    $('overlayText').textContent=games[current].over+'  You collected '+coins+' moon coins.';$('startButton').innerHTML='PLAY AGAIN <span>↻</span>';
    overlay.classList.remove('hidden');tone(180,.18);
  }
  function startGame(){
    if(!current)return;
    cancelAnimationFrame(raf);
    coins=0;distance=0;
    initGame(current);
    state='playing';
    lastTime=performance.now();
    overlay.classList.add('hidden');
    setScore(0);
    tone(520);
    raf=requestAnimationFrame(loop);
  }
  function initGame(id){
    game={time:0,particles:[],stars:Array.from({length:65},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*2+.5,a:Math.random()*.65+.2,s:Math.random()*.6+.15}))};
    if(id==='flappy'){game.player={x:190,y:470,vy:0,r:28,rot:0};game.pipes=[];game.spawn=0;game.passed=0;game.pipes.push(makePipe(900));}
    if(id==='runner'){game.lane=1;game.targetLane=1;game.laneVisual=1;game.obstacles=[];game.pickups=[];game.spawn=0;game.jump=0;game.jumpV=0;game.slide=0;game.flash=0;game.speed=430;game.runnerMode='select';game.heroIndex=runnerClampV2(runRead('hero',0),0,2);game.runnerDistance=0;game.runnerStage=0;game.runnerEffects={magnet:0,x2:0,jet:0,shoes:0,board:0};game.runnerKeys=1;game.runnerInvul=0;game.rideT=0;game.runnerSaved=false;game.runnerBest=bestOf('runner');game.runnerFX=[];game.runnerShake=0;game.runnerFlash=0;try{game.runnerKeys=Math.max(0,Math.floor(runRead('keys',1)))}catch(_){}syncRunnerPauseButton();}if(id==='racer'){game.lane=1;game.targetLane=1;game.obstacles=[];game.pickups=[];game.spawn=0;game.jump=0;game.jumpV=0;game.slide=0;game.flash=0;game.speed=430;}
    if(id==='jumper'){game.player={x:360,y:790,vx:0,vy:-620,r:23};game.platforms=[];for(let i=0;i<9;i++)game.platforms.push({x:70+Math.random()*530,y:860-i*105,w:110+Math.random()*55});game.camera=0;game.left=false;game.right=false;}
    if(id==='space'){game.player={x:360,y:840,vx:0,prevX:360};game.bullets=[];game.enemies=[];game.spawn=0;game.fire=0;game.drag=false;game.lives=3;game.scoreTime=0;game.spaceParticles=[];game.spaceStage=1;game.spaceInvuln=0;game.spaceBoss=null;game.spaceBossClock=0;game.spaceBossWarning=0;game.spaceTrailClock=0;}
    if(id==='brick'){game.level=1;game.paddle={x:360,y:915,w:150};game.ball={x:360,y:870,vx:220,vy:-480,r:12,stuck:true};game.bricks=[];for(let row=0;row<6;row++)for(let col=0;col<8;col++)game.bricks.push({x:43+col*80,y:145+row*48,w:69,h:25,hp:row<2?2:1,alive:true,hue:(row*35+col*9)%360});game.lives=3;}
  }
  function makePipe(x){const difficulty=Math.min(1,score/40),gap=Math.round(245-difficulty*72),center=250+Math.random()*440;return{x,center,gap,passed:false}}
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
    update(dt);draw();finishPixelFrame();raf=requestAnimationFrame(loop);
  }
  function update(dt){
    if(current==='flappy')updateFlappy(dt);
    if(current==='runner'||current==='racer')updateRunner(dt,current==='racer');
    if(current==='jumper')updateJumper(dt);
    if(current==='space')updateSpace(dt);
    if(current==='brick')updateBrick(dt);
  }
  function updateFlappy(dt){
    const p=game.player,difficulty=Math.min(1,score/40),pipeSpeed=250+difficulty*105;
    p.vy+=1500*dt;p.y+=p.vy*dt;p.rot=Math.min(.85,Math.max(-.5,p.vy/850));
    game.spawn+=dt;if(game.spawn>Math.max(1.02,1.65-difficulty*.48)){game.pipes.push(makePipe(W+50));game.spawn=0}
    game.pipes.forEach(pipe=>{pipe.x-=pipeSpeed*dt;if(!pipe.passed&&pipe.x+92<p.x){pipe.passed=true;game.passed=(game.passed||0)+1;setScore(score+1);tone(720)}});
    game.pipes=game.pipes.filter(p=>p.x>-130);
    if(p.y>H-95||p.y<38){endGame();return}
    for(const pipe of game.pipes){const gapTop=pipe.center-pipe.gap/2,gapBottom=pipe.center+pipe.gap/2;if(p.x+p.r>pipe.x-8&&p.x-p.r<pipe.x+100&&(p.y-p.r<gapTop||p.y+p.r>gapBottom)){endGame();return}}
  }
  function updateRunner(dt,isCar){
    game.speed=Math.min(760,game.speed+dt*8);distance+=game.speed*dt/23;setScore(Math.floor(distance/35)+coins);
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
    if(p.y-game.camera<420){const shift=420-(p.y-game.camera);game.camera+=shift;distance=Math.max(distance,game.camera);setScore(Math.floor(distance/50))}
    const highest=game.camera+H;game.platforms=game.platforms.filter(pl=>pl.y-game.camera<H+100);
    const climbDifficulty=Math.min(1.5,distance/4500),platformGap=105+Math.round(climbDifficulty*20),platformWidth=Math.max(78,140-Math.round(climbDifficulty*34));
    while(game.platforms.length<10){const y=Math.min(...game.platforms.map(pl=>pl.y))-platformGap;game.platforms.push({x:35+Math.random()*(W-platformWidth-70),y,w:platformWidth})}
    p.vx*=.88;if(p.y-game.camera>H+40){endGame()}
  }
  function spawnSpaceBurst(x,y,color,count=9){
    if(!game.spaceParticles)game.spaceParticles=[];
    for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=55+Math.random()*190;game.spaceParticles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.32+Math.random()*.52,maxLife:.84,size:1.8+Math.random()*3.7,color})}
    if(game.spaceParticles.length>220)game.spaceParticles.splice(0,game.spaceParticles.length-220);
  }
  function makeSpaceEnemy(kind,x,y,difficulty){
    const specs={scout:{size:.58,hp:1,speed:270,value:5,color:'#75e4ee'},fighter:{size:.92,hp:1,speed:190,value:10,color:'#d18bdf'},heavy:{size:1.34,hp:3,speed:122,value:22,color:'#f0b77c'}};
    const spec=specs[kind]||specs.fighter;
    return {kind,x,y,baseX:x,v:spec.speed+difficulty*(kind==='scout'?95:kind==='heavy'?55:76),phase:Math.random()*Math.PI*2,amplitude:(kind==='heavy'?18:kind==='scout'?48:32)+difficulty*15,frequency:kind==='scout'?2.4:kind==='heavy'?.9:1.45,size:spec.size,hp:spec.hp+(kind==='heavy'&&difficulty>.95?1:0),maxHp:spec.hp+(kind==='heavy'&&difficulty>.95?1:0),value:spec.value,color:spec.color,hit:0,dead:false};
  }
  function updateSpace(dt){
    const p=game.player,difficulty=Math.min(1.45,game.time/78);
    game.spaceStage=1+Math.floor(game.time/28);game.spaceInvuln=Math.max(0,(game.spaceInvuln||0)-dt);game.spaceBossWarning=Math.max(0,(game.spaceBossWarning||0)-dt);game.spaceTrailClock=(game.spaceTrailClock||0)+dt;
    const previousX=p.x;if(pointerDown)p.x+=(pointerX-p.x)*Math.min(1,dt*14);
    p.x=Math.max(42,Math.min(W-42,p.x));p.vx=(p.x-previousX)/Math.max(dt,.001);p.prevX=p.x;
    game.fire+=dt;const fireRate=Math.max(.115,.19-difficulty*.035);
    if(game.fire>=fireRate){game.bullets.push({x:p.x-10,y:p.y-36,speed:850},{x:p.x+10,y:p.y-36,speed:850});game.fire=0}
    game.spawn+=dt;const spawnEvery=Math.max(.48,1.28-difficulty*.43);
    if(game.spawn>=spawnEvery&&game.enemies.length<16){
      const roll=Math.random(),kind=roll<(.22+difficulty*.12)?'heavy':roll<(.58+difficulty*.10)?'fighter':'scout';
      const baseX=70+Math.random()*(W-140),packSize=game.time<12?1:game.time<34?(Math.random()<.34?2:1):(Math.random()<(.28+difficulty*.22)?3:2);
      for(let i=0;i<packSize&&game.enemies.length<16;i++){const shipKind=i===0?kind:(Math.random()<.72?'scout':'fighter'),x=Math.max(48,Math.min(W-48,baseX+(i-(packSize-1)/2)*(shipKind==='heavy'?92:72)));game.enemies.push(makeSpaceEnemy(shipKind,x,-52-i*76,difficulty))}
      game.spawn=0;
    }
    game.spaceBossClock=(game.spaceBossClock||0)+dt;
    if(!game.spaceBoss&&game.time>38&&game.spaceBossClock>48){const hp=24+Math.floor(difficulty*9);game.spaceBoss={x:W/2,y:-120,targetY:160,hp,maxHp:hp,vx:105+20*difficulty,phase:Math.random()*Math.PI*2,hit:0};game.spaceBossClock=0;game.spaceBossWarning=2.8}
    game.bullets.forEach(b=>b.y-=b.speed*dt);game.bullets=game.bullets.filter(b=>b.y>-45);
    for(const e of game.enemies){
      if(e.dead)continue;e.hit=Math.max(0,e.hit-dt);e.y+=e.v*dt;e.x=e.baseX+Math.sin(game.time*e.frequency+e.phase)*e.amplitude;e.x=Math.max(32,Math.min(W-32,e.x));
      for(const b of game.bullets){if(b.dead)continue;const dx=e.x-b.x,dy=e.y-b.y,r=24*e.size;if(dx*dx+dy*dy<(r+7)*(r+7)){b.dead=true;e.hp--;e.hit=.1;spawnSpaceBurst(b.x,b.y,e.color,4);if(e.hp<=0){e.dead=true;setScore(score+e.value);spawnSpaceBurst(e.x,e.y,e.color,15);tone(e.kind==='heavy'?460:760,.07)}else tone(540,.035);break}}
      const hitRadius=27+e.size*20;
      if(!e.dead&&game.spaceInvuln<=0&&Math.abs(e.y-p.y)<38+e.size*16&&Math.abs(e.x-p.x)<hitRadius){e.dead=true;game.lives--;game.spaceInvuln=1.35;spawnSpaceBurst(p.x,p.y,'#a8f1ff',22);tone(130,.16);if(game.lives<=0){endGame();return}}
    }
    game.enemies=game.enemies.filter(e=>!e.dead&&e.y<H+100);game.bullets=game.bullets.filter(b=>!b.dead);
    if(game.spaceBoss){
      const boss=game.spaceBoss;boss.hit=Math.max(0,boss.hit-dt);
      if(boss.y<boss.targetY)boss.y+=115*dt;else{boss.x+=boss.vx*dt;if(boss.x>W-150){boss.x=W-150;boss.vx=-Math.abs(boss.vx)}if(boss.x<150){boss.x=150;boss.vx=Math.abs(boss.vx)}boss.y=boss.targetY+Math.sin(game.time*1.8+boss.phase)*14}
      for(const b of game.bullets){if(b.dead)continue;const dx=boss.x-b.x,dy=boss.y-b.y;if(dx*dx+dy*dy<112*112){b.dead=true;boss.hp--;spawnSpaceBurst(b.x,b.y,'#ffcf98',5);if(boss.hp<=0){spawnSpaceBurst(boss.x,boss.y,'#f4bf83',44);game.spaceBoss=null;setScore(score+90+Math.floor(difficulty*30));tone(980,.2)}else tone(620,.035);break}}
      game.bullets=game.bullets.filter(b=>!b.dead);
    }
    game.spaceParticles=(game.spaceParticles||[]).filter(part=>{part.x+=part.vx*dt;part.y+=part.vy*dt;part.vx*=Math.max(0,1-dt*1.8);part.vy*=Math.max(0,1-dt*1.8);part.life-=dt;return part.life>0});
    if(game.spaceTrailClock>.045){game.spaceTrailClock=0;spawnSpaceBurst(p.x,p.y+45,'#86ddf3',2)}
    if(game.spaceInvuln>0&&game.lives>0)p.shieldPulse=(p.shieldPulse||0)+dt;
  }
  function updateBrick(dt){
    const p=game.paddle,b=game.ball;
    if(pointerDown)p.x+=(pointerX-p.x)*Math.min(1,dt*14);
    p.x=Math.max(p.w/2+8,Math.min(W-p.w/2-8,p.x));
    if(b.stuck){b.x=p.x;b.y=p.y-35;return}

    b.x+=b.vx*dt;b.y+=b.vy*dt;
    if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx);tone(300)}
    else if(b.x>W-b.r){b.x=W-b.r;b.vx=-Math.abs(b.vx);tone(300)}
    if(b.y<b.r+25){b.y=b.r+25;b.vy=Math.abs(b.vy);tone(300)}

    if(b.y>p.y-10&&b.y<p.y+18&&b.x>p.x-p.w/2&&b.x<p.x+p.w/2&&b.vy>0){
      b.y=p.y-b.r;
      b.vy=-Math.max(260,Math.abs(b.vy));
      b.vx=Math.max(-440,Math.min(440,b.vx+(b.x-p.x)/p.w*260));
      tone(540);
    }

    for(const brick of game.bricks){
      if(!brick.alive||b.x<=brick.x-b.r||b.x>=brick.x+brick.w+b.r||b.y<=brick.y-b.r||b.y>=brick.y+brick.h+b.r)continue;
      const incomingY=b.vy;
      brick.hp--;
      if(brick.hp<=0){brick.alive=false;setScore(score+1);coins+=1}
      b.y=incomingY>0?brick.y-b.r:brick.y+brick.h+b.r;
      b.vy=-incomingY;
      tone(470);
      break;
    }

    if(game.bricks.every(br=>!br.alive)){
      game.level=(game.level||1)+1;
      game.bricks.forEach((br,index)=>{const row=Math.floor(index/8);br.alive=true;br.hp=game.level>=3&&row<3?2:1});
      b.vx=Math.max(-650,Math.min(650,b.vx*1.08));
      b.vy=-Math.min(850,Math.max(260,Math.abs(b.vy)*1.06));
      setScore(score+15);
    }
    if(b.y>H+20){
      game.lives--;
      if(game.lives<=0){endGame();return}
      b.stuck=true;b.vx=220;b.vy=-480;
    }
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
    if(swipeStart&&(current==='runner'||current==='racer')){
      const dx=e.clientX-swipeStart.x,dy=e.clientY-swipeStart.y;
      if(Math.abs(dx)>25||Math.abs(dy)>25){
        if(Math.abs(dx)>Math.abs(dy))action(dx>0?1:-1,0);
        else action(0,dy);
      }else if(current==='runner'&&state==='playing'&&game.runnerMode==='run'){
        // A light tap pauses; tap again to resume. Swipe gestures remain movement.
        game.runnerMode='paused';syncRunnerPauseButton();
      }
    }
    if(current==='jumper')game.player.vx=0;
    swipeStart=null;
  }
  function pointerCancelHandler(){
    pointerDown=false;swipeStart=null;
    if(current==='jumper'&&game.player)game.player.vx=0;
  }
  canvas.addEventListener('pointerdown',pointerDownHandler);
  canvas.addEventListener('pointermove',pointerMoveHandler);
  window.addEventListener('pointerup',pointerUpHandler);
  window.addEventListener('pointercancel',pointerCancelHandler);
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('keydown',e=>{
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key))e.preventDefault();
    if(e.key==='Escape'&&screen.classList.contains('active'))closeGame();
    if(e.key===' '&&current==='flappy'){flap();return}
    if(e.key==='ArrowLeft')action(-1,0);if(e.key==='ArrowRight')action(1,0);if(e.key==='ArrowUp')action(0,-1);if(e.key==='ArrowDown')action(0,1);
    if(e.key===' '&&state==='ready')startGame();
  },{passive:false});
  document.querySelectorAll('[data-game]').forEach(card=>card.addEventListener('click',()=>openGame(card.dataset.game)));
  $('startButton').addEventListener('click',startGame);
  $('restartButton').addEventListener('click',(event)=>{
    event.preventDefault();
    event.stopPropagation();
    if(current==='runner'&&state==='playing'){
      if(game.runnerMode!=='select')runSaveResult();
      runStart();
      return;
    }
    if(current)startGame();
  });
  $('backButton').addEventListener('click',closeGame);
  $('leaderboardButton').addEventListener('click',()=>showGameLeaderboard(current));
  $('closeLeaderboard').addEventListener('click',()=>{$('leaderboardModal').classList.remove('active');$('leaderboardModal').setAttribute('aria-hidden','true')});
  $('leaderboardBackdrop').addEventListener('click',()=>{$('leaderboardModal').classList.remove('active');$('leaderboardModal').setAttribute('aria-hidden','true')});
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('leaderboardModal').classList.contains('active')){$('leaderboardModal').classList.remove('active');$('leaderboardModal').setAttribute('aria-hidden','true')}});
  soundToggle.addEventListener('click',()=>{soundOn=!soundOn;soundToggle.innerHTML=(soundOn?'♫':'♪')+' <span>Sound '+(soundOn?'ON':'OFF')+'</span>';if(soundOn)tone(640)});
  window.addEventListener('resize',()=>{if(current&&state!=='playing'){draw();finishPixelFrame()}});
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
  const SPACE_SHIP_IMAGES=Object.create(null);
  function getSpaceShipImage(name){
    let image=SPACE_SHIP_IMAGES[name];
    if(!image){
      image=new Image();image.decoding='async';
      image.src='assets/ships/'+name+'.svg';SPACE_SHIP_IMAGES[name]=image;
    }
    return image.complete&&image.naturalWidth?image:null;
  }
  function drawSpaceShipSprite(name,x,y,width,height,rotation=0,alpha=1){
    const image=getSpaceShipImage(name);
    ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.globalAlpha=alpha;
    if(image)ctx.drawImage(image,-width/2,-height/2,width,height);
    else{
      ctx.fillStyle='#91b7c4';ctx.strokeStyle='#263e5b';ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(0,-height*.48);ctx.lineTo(width*.38,height*.24);ctx.lineTo(0,height*.13);ctx.lineTo(-width*.38,height*.24);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle='#9be0e5';ctx.beginPath();ctx.ellipse(0,-height*.06,width*.075,height*.17,0,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function drawSpaceThrusters(x,y,spread,length,direction,color,phase){
    for(let i=0;i<2;i++){
      const offset=(i===0?-1:1)*spread*.5;
      const pulse=.84+.16*Math.sin(game.time*23+(phase||0)+i*1.7);
      const x0=x+offset,tip=y+direction*length*pulse;
      ctx.save();
      const flame=ctx.createLinearGradient(x0,y,x0,tip);
      flame.addColorStop(0,color);flame.addColorStop(.23,'rgba(183,237,235,.88)');
      flame.addColorStop(.58,'rgba(89,180,211,.4)');flame.addColorStop(1,'rgba(89,180,211,0)');
      ctx.fillStyle=flame;ctx.beginPath();
      ctx.moveTo(x0-spread*.1,y);
      ctx.quadraticCurveTo(x0-spread*.14,y+direction*length*.35,x0,tip);
      ctx.quadraticCurveTo(x0+spread*.14,y+direction*length*.35,x0+spread*.1,y);
      ctx.closePath();ctx.fill();
      ctx.globalAlpha=.6;ctx.fillStyle='#e9f4dc';
      ctx.beginPath();ctx.ellipse(x0,y+direction*4,spread*.065,5,0,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
  }
  function drawSpaceBackdrop(){
    const sky=artGrad(0,0,0,H,[[0,'#050b1c'],[.42,'#0b1730'],[1,'#101b32']]);
    ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);

    // A single distant ringed world anchors the composition.
    ctx.save();ctx.translate(574,286);ctx.rotate(-.24);
    ctx.strokeStyle='rgba(137,177,191,.28)';ctx.lineWidth=13;
    ctx.beginPath();ctx.ellipse(0,0,138,34,0,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='rgba(211,190,153,.22)';ctx.lineWidth=3;
    ctx.beginPath();ctx.ellipse(0,0,154,41,0,0,Math.PI*2);ctx.stroke();
    const planet=ctx.createRadialGradient(-23,-28,8,0,0,91);
    planet.addColorStop(0,'#7a8296');planet.addColorStop(.42,'#414d6c');
    planet.addColorStop(.82,'#202e4e');planet.addColorStop(1,'#111a31');
    ctx.fillStyle=planet;ctx.beginPath();ctx.arc(0,0,73,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.beginPath();ctx.arc(0,0,72,0,Math.PI*2);ctx.clip();
    ctx.strokeStyle='rgba(185,197,190,.14)';ctx.lineWidth=8;
    for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(-12+i*8,-25+i*18,90,12+i*2,-.2,0,Math.PI*2);ctx.stroke()}
    const shadow=ctx.createLinearGradient(-55,-20,62,24);
    shadow.addColorStop(0,'rgba(4,9,22,0)');shadow.addColorStop(1,'rgba(3,7,20,.72)');
    ctx.fillStyle=shadow;ctx.fillRect(-74,-74,148,148);ctx.restore();
    ctx.strokeStyle='rgba(191,213,208,.32)';ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(0,0,73,73,0,0,Math.PI*2);ctx.stroke();ctx.restore();

    // Restrained parallax starfield with depth variation.
    game.stars.forEach((star,i)=>{
      const speed=9+(i%5)*7;
      const x=(star.x+(i%2?1:-1)*game.time*(5+i%4)+W*12)%W;
      const y=(star.y+game.time*speed)%H;
      const twinkle=.72+.28*Math.sin(game.time*1.7+i*1.31);
      const radius=Math.max(.8,star.r*(i%6===0?1.25:.72));
      ctx.globalAlpha=star.a*twinkle;ctx.fillStyle=i%9===0?'#e7d2ad':'#b8d1e0';
      ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
    });
    ctx.globalAlpha=1;
    for(let i=0;i<9;i++){
      const x=(i*97+game.time*(i%2?8:-5)+W*5)%W;
      const y=(i*131+game.time*(13+i%3*5))%H;
      ctx.fillStyle='rgba(143,181,197,.18)';ctx.beginPath();ctx.arc(x,y,1.2+(i%3)*.45,0,Math.PI*2);ctx.fill();
    }
    const vignette=ctx.createRadialGradient(W*.5,H*.45,260,W*.5,H*.45,730);
    vignette.addColorStop(0,'rgba(1,5,16,0)');vignette.addColorStop(1,'rgba(1,5,16,.38)');
    ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
  }
  function drawStarShip(x,y){
    const p=game.player;
    const desiredBank=Math.max(-.19,Math.min(.19,(p.vx||0)/1900));
    p.bank=(p.bank||0)+(desiredBank-(p.bank||0))*.18;
    const hover=Math.sin(game.time*2.4)*2;
    drawSpaceThrusters(x,y+59+hover,27,48,1,'#ffe3b4',.4);
    drawSpaceShipSprite('player-interceptor',x,y+hover,116,145,p.bank,1);
    if(game.spaceInvuln>0&&Math.floor(game.time*12)%2===0){
      ctx.save();ctx.globalAlpha=.34+.12*Math.sin(game.time*13);
      ctx.strokeStyle='#9edce2';ctx.lineWidth=2.2;
      ctx.beginPath();ctx.ellipse(x,y+hover,61,77,p.bank*.3,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
  }
  function drawCosmicVisitor(enemy){
    const scout=enemy.kind==='scout',heavy=enemy.kind==='heavy';
    const spec=scout?{name:'enemy-scout',w:72,h:82,exhaust:31,length:29}:heavy?{name:'enemy-heavy',w:142,h:125,exhaust:47,length:34}:{name:'enemy-fighter',w:112,h:118,exhaust:36,length:31};
    const driftBank=Math.max(-.16,Math.min(.16,Math.cos(game.time*enemy.frequency+enemy.phase)*enemy.amplitude*enemy.frequency/1900));
    const alpha=enemy.hit>0 ? .76 : 1;
    drawSpaceThrusters(enemy.x,enemy.y-spec.h*.39,spec.exhaust,spec.length,-1,'#f2d2a3',enemy.phase);
    drawSpaceShipSprite(spec.name,enemy.x,enemy.y,spec.w,spec.h,Math.PI+driftBank,alpha);
    if(enemy.maxHp>1){
      const width=45*(enemy.size||1),ratio=Math.max(0,enemy.hp/enemy.maxHp);
      ctx.save();ctx.fillStyle='rgba(5,11,24,.72)';ctx.fillRect(enemy.x-width/2,enemy.y+spec.h*.43,width,4);
      ctx.fillStyle='#c9b18b';ctx.fillRect(enemy.x-width/2,enemy.y+spec.h*.43,width*ratio,4);ctx.restore();
    }
  }
  function drawCosmicBoss(boss){
    drawSpaceThrusters(boss.x,boss.y-77,82,48,-1,'#f0d0a0',1.2);
    drawSpaceShipSprite('eclipse-dreadnought',boss.x,boss.y,310,185,Math.PI+(boss.bank||0),boss.hit>0 ? .84 : 1);
    const width=276,ratio=Math.max(0,boss.hp/boss.maxHp);
    ctx.save();ctx.fillStyle='rgba(4,9,20,.78)';ctx.beginPath();ctx.roundRect(W/2-width/2,258,width,13,5);ctx.fill();
    ctx.fillStyle=artGrad(W/2-width/2,0,W/2+width/2,0,[[0,'#c59a79'],[1,'#e3cda7']]);
    ctx.beginPath();ctx.roundRect(W/2-width/2,258,width*ratio,13,5);ctx.fill();
    ctx.strokeStyle='rgba(223,222,201,.5)';ctx.lineWidth=1;ctx.strokeRect(W/2-width/2,258,width,13);
    ctx.fillStyle='#d9e3dc';ctx.font='bold 12px "DM Mono"';ctx.textAlign='center';
    ctx.fillText('ECLIPSE DREADNOUGHT',W/2,248);ctx.restore();
  }
  function drawSpace(){
    drawSpaceBackdrop();
    game.bullets.forEach(b=>{
      ctx.save();const beam=ctx.createLinearGradient(b.x,b.y-20,b.x,b.y+18);
      beam.addColorStop(0,'rgba(163,232,237,0)');beam.addColorStop(.28,'#d8f5eb');
      beam.addColorStop(.55,'#f5e5c0');beam.addColorStop(1,'rgba(114,186,208,0)');
      ctx.strokeStyle=beam;ctx.lineWidth=4;ctx.beginPath();
      ctx.moveTo(b.x,b.y-20);ctx.lineTo(b.x,b.y+18);ctx.stroke();ctx.restore();
    });
    game.enemies.forEach(enemy=>{if(!enemy.dead)drawCosmicVisitor(enemy)});
    (game.spaceParticles||[]).forEach(part=>{
      const alpha=Math.max(0,part.life/part.maxLife);
      ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=part.color;ctx.lineWidth=Math.max(1,part.size*.7);
      ctx.beginPath();ctx.moveTo(part.x,part.y);ctx.lineTo(part.x-part.vx*.022,part.y-part.vy*.022);ctx.stroke();ctx.restore();
    });
    if(game.spaceBoss)drawCosmicBoss(game.spaceBoss);
    drawStarShip(game.player.x,game.player.y);

    // Compact instrument-style HUD.
    ctx.save();ctx.fillStyle='rgba(5,12,25,.56)';
    ctx.beginPath();ctx.roundRect(22,20,166,68,8);ctx.fill();
    ctx.strokeStyle='rgba(158,191,195,.28)';ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle='#c5d9d7';ctx.font='bold 11px "DM Mono"';ctx.fillText('SHIELD',34,43);
    for(let i=0;i<3;i++){ctx.fillStyle=i<game.lives?'#a8d5cf':'rgba(168,213,207,.14)';ctx.fillRect(34+i*43,56,32,7)}
    ctx.fillStyle='#d2d9cc';ctx.font='bold 12px "DM Mono"';ctx.textAlign='right';
    ctx.fillText('SECTOR '+String(game.spaceStage||1).padStart(2,'0'),690,40);
    ctx.fillStyle='rgba(205,220,216,.58)';ctx.font='10px "DM Mono"';ctx.fillText('LUNAR DEFENCE WING',690,58);
    if(game.spaceBossWarning>0){
      ctx.textAlign='center';ctx.fillStyle='rgba(7,13,25,.84)';
      ctx.beginPath();ctx.roundRect(192,355,336,42,6);ctx.fill();
      ctx.strokeStyle='rgba(221,189,143,.5)';ctx.strokeRect(192,355,336,42);
      ctx.fillStyle='#e2c79f';ctx.font='bold 14px "DM Mono"';ctx.fillText('HOSTILE CAPITAL SHIP DETECTED',360,381);
    }
    ctx.restore();
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
    setScore(Math.floor(distance/35)+coins);
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
    game.obstacles=game.obstacles.filter(o=>o.z<1.1);setScore(Math.floor(distance/35)+coins);
  }
  function draw(){
    if(!current){
      if(window.LunaRun3D)window.LunaRun3D.hide();
      return;
    }
    if(current!=='runner'&&window.LunaRun3D)window.LunaRun3D.hide();
    if(current==='flappy')drawFlappy();
    else if(current==='runner')drawSubwayRunner();
    else if(current==='racer')drawRunner(true);
    else if(current==='jumper')drawJumper();
    else if(current==='space')drawSpace();
    else if(current==='brick')drawBrick();
  }
  function update(dt){
    if(current==='flappy')updateFlappy(dt);
    else if(current==='runner'){
      if(game.runnerMode==='run')updateSubwayRunner(dt);
      else if(game.runnerMode==='over')lunaRunUpdateFX(dt);
    }
    else if(current==='racer')updateRunner(dt,true);else if(current==='jumper')updateJumper(dt);else if(current==='space')updateSpace(dt);else if(current==='brick')updateBrick(dt);
  }
  function action(dx,dy){
    if(state!=='playing')return;
    if(current==='runner'){if(dx){game.targetLane=runnerClampV2(game.targetLane+dx,0,2);game.lane=game.targetLane}if(dy<0&&game.jump<=0&&game.slide<=0){game.jump=1;game.jumpV=735;tone(600)}if(dy>0){game.slide=.78;tone(340)}return}
    if(current==='racer'){if(dx)game.targetLane=runnerClampV2(game.targetLane+dx,0,2),game.lane=game.targetLane;if(dy<0&&game.jump<=0){game.jump=1;game.jumpV=620;tone(600)}if(dy>0)game.slide=.55}
    if(current==='jumper')game.player.vx=dx*560;
    if(current==='brick'&&game.ball.stuck){game.ball.stuck=false;game.ball.vy=-480;tone(520)}
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
    g.addColorStop(0,st.sky[0]);g.addColorStop(.42,st.sky[1]);g.addColorStop(1,st.sky[2]);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    const sx=548,sy=242;
    ctx.fillStyle='rgba(255,231,170,.18)';ctx.fillRect(sx-112,sy-112,224,224);
    ctx.fillStyle='#ffe0a0';ctx.fillRect(sx-76,sy-76,152,152);ctx.fillStyle='#ffcb79';ctx.fillRect(sx-68,sy-68,136,136);
    ctx.fillStyle=st.sky[1];ctx.fillRect(sx-58,sy+38,116,28);ctx.fillRect(sx-46,sy+68,92,12);
    for(let i=0;i<6;i++){
      const x=((i*157-game.time*10)%920+920)%920-100,y=94+(i%3)*55,shade=i%2?'rgba(255,226,204,.55)':'rgba(255,245,218,.7)';
      ctx.fillStyle='rgba(106,61,67,.22)';ctx.fillRect(x-22,y+10,86,18);
      ctx.fillStyle=shade;ctx.fillRect(x-10,y,48,17);ctx.fillRect(x+2,y-10,36,27);ctx.fillRect(x+30,y+4,34,13);
      ctx.fillStyle='rgba(255,255,255,.25)';ctx.fillRect(x+4,y-8,24,5);
    }
    runPoly([[0,398],[82,324],[145,365],[235,288],[322,376],[410,310],[505,372],[612,294],[720,375],[720,520],[0,520]],st.far);
    runPoly([[0,442],[95,378],[170,420],[262,348],[350,430],[456,365],[545,425],[635,356],[720,420],[720,565],[0,565]],st.mid);
    for(let layer=0;layer<3;layer++){
      const base=374+layer*45,step=68-layer*9,shift=(game.time*(layer+1)*2.3)%step;
      for(let i=-1;i<13;i++){
        const x=Math.floor(i*step-shift),w=30+((i*17+80)%23),h=48+((i*31+layer*23+900)%104),y=base-h;
        ctx.fillStyle=layer===0?st.far:layer===1?st.mid:'#28384b';ctx.fillRect(x,y,w,h);
        ctx.fillStyle='rgba(255,224,172,.42)';
        for(let wy=y+12;wy<base-8;wy+=19)for(let wx=x+6;wx<x+w-4;wx+=12)if(((Math.floor(wx/12)+Math.floor(wy/19)+i+layer)&1)===0)ctx.fillRect(wx,wy,5,7);
        ctx.fillStyle='rgba(20,34,49,.22)';ctx.fillRect(x+w-5,y,5,h);
      }
    }
    ctx.fillStyle='rgba(37,43,53,.52)';ctx.fillRect(0,332,720,12);ctx.fillRect(0,348,720,5);
    for(let side=0;side<2;side++)for(let i=0;i<7;i++){
      const x=side?545+i*35:175-i*35,y=380+(i%2)*16;
      ctx.fillStyle='#60432f';ctx.fillRect(x-4,y+13,9,48);ctx.fillStyle='#174d45';ctx.fillRect(x-19,y-7,39,28);
      ctx.fillStyle='#287653';ctx.fillRect(x-25,y-17,29,24);ctx.fillRect(x-5,y-25,32,24);
      ctx.fillStyle='#4d9a60';ctx.fillRect(x-18,y-15,13,8);ctx.fillRect(x+5,y-22,13,8);
    }
    ctx.fillStyle='rgba(38,48,56,.7)';
    for(let x=28;x<720;x+=172){ctx.fillRect(x,252,8,155);ctx.fillRect(x-16,250,42,8);}
    ctx.strokeStyle='rgba(37,48,58,.7)';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,264);ctx.quadraticCurveTo(360,310,720,264);ctx.stroke();
    ctx.strokeStyle='rgba(255,224,172,.3)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,273);ctx.quadraticCurveTo(360,319,720,273);ctx.stroke();
    ctx.fillStyle='#38261f';ctx.fillRect(492,330,132,9);ctx.fillRect(500,339,7,45);ctx.fillRect(610,339,7,45);
    ctx.fillStyle='#f2bc69';ctx.fillRect(497,312,123,24);ctx.fillStyle='#633b26';
    ctx.font='bold 12px "Press Start 2P"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('LUNA LINE',558,324);ctx.textAlign='left';
  }
  function runTracks(){
    const horizon=366,st=runStage();
    ctx.fillStyle=st.ground;ctx.fillRect(0,horizon,720,634);ctx.fillStyle='#283c35';ctx.fillRect(0,horizon,720,18);
    ctx.fillStyle='#79b84e';ctx.fillRect(0,horizon+3,720,7);ctx.fillStyle='#b4a36c';ctx.fillRect(0,horizon+13,720,5);
    ctx.fillStyle='#4c574f';ctx.fillRect(0,horizon+18,720,616);
    runPoly([[265,horizon],[455,horizon],[850,H],[-130,H]],'#4a4c4b');
    runPoly([[287,horizon],[433,horizon],[790,H],[-70,H]],'#62594e');
    runPoly([[300,horizon],[420,horizon],[760,H],[-40,H]],'#776957');
    runPoly([[0,horizon],[265,horizon],[-130,H],[0,H]],'#49744c');
    runPoly([[455,horizon],[720,horizon],[720,H],[850,H]],'#49744c');
    for(let i=0;i<90;i++){
      const x=(i*83+((game.time*37)|0))%720,y=390+(i*47)%600,s=2+(i%3)*2;
      ctx.fillStyle=i%2?'rgba(220,194,145,.34)':'rgba(35,39,39,.35)';ctx.fillRect(x,y,s,s);
    }
    for(let lane=0;lane<3;lane++){
      const a=runProject(lane,0),b=runProject(lane,1),wa=a.laneWidth*.48,wb=b.laneWidth*.48;
      runPoly([[a.x-wa,horizon],[a.x+wa,horizon],[b.x+wb,H],[b.x-wb,H]],lane===1?'rgba(25,31,35,.18)':'rgba(244,220,178,.05)');
      for(let i=0;i<22;i++){
        const z=((i/22)+(game.time*.46)%1)%1,p=runProject(lane,z),w=p.laneWidth*.9,h=3+z*15;
        ctx.fillStyle='rgba(25,25,24,.65)';ctx.fillRect(p.x-w/2,p.y-h/2+5,w,h);
        ctx.fillStyle=i%2?'#80644b':'#967653';ctx.fillRect(p.x-w/2,p.y-h/2,w,h);
        ctx.fillStyle='rgba(245,215,164,.48)';ctx.fillRect(p.x-w/2,p.y-h/2,w,h*.22);
        ctx.fillStyle='rgba(38,30,24,.42)';ctx.fillRect(p.x-w/2,p.y+h*.12,w,h*.2);
      }
      const railA=a.laneWidth*.27,railB=b.laneWidth*.27;
      [-1,1].forEach(side=>{
        ctx.lineCap='butt';ctx.strokeStyle='#272f32';ctx.lineWidth=14;ctx.beginPath();ctx.moveTo(a.x+side*railA,horizon);ctx.lineTo(b.x+side*railB,H);ctx.stroke();
        ctx.strokeStyle='#aab4ac';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(a.x+side*railA,horizon);ctx.lineTo(b.x+side*railB,H);ctx.stroke();
        ctx.strokeStyle='#e7e5c8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(a.x+side*railA-1,horizon);ctx.lineTo(b.x+side*railB-1,H);ctx.stroke();
      });
    }
    ctx.strokeStyle='rgba(241,211,153,.3)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(280,horizon);ctx.lineTo(-40,H);ctx.moveTo(440,horizon);ctx.lineTo(760,H);ctx.stroke();
    ctx.fillStyle='#3b4644';ctx.fillRect(238,260,9,130);ctx.fillRect(474,260,9,130);ctx.fillRect(230,255,260,8);
    ctx.fillStyle='#c8c7ad';ctx.fillRect(248,262,224,3);ctx.fillStyle='#394542';ctx.fillRect(354,264,12,103);
    ctx.strokeStyle='rgba(255,247,213,.42)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(240,283);ctx.lineTo(480,283);ctx.moveTo(285,315);ctx.lineTo(435,315);ctx.stroke();
    for(let i=0;i<64;i++){
      const x=(i*47+Math.floor(game.time*115))%720,y=980+(i%3)*5;
      ctx.fillStyle=i%3?'#91cf54':'#d4dc77';ctx.fillRect(x,y,3,8+(i%4)*3);ctx.fillRect(x+4,y+4,2,5);
    }
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
    const p=runProject(o.lane,o.z),s=p.scale,w=124*s,h=42*s,x=Math.round(p.x),y=Math.round(p.y-13*s),u=Math.max(2,Math.round(7*s));
    ctx.save();ctx.fillStyle='#49352a';ctx.fillRect(x-w*.38,y+h*.55,u*2,h*.9);ctx.fillRect(x+w*.33,y+h*.55,u*2,h*.9);
    ctx.fillStyle='#301f17';ctx.fillRect(x-w/2-u,y-u,w+u*2,h+u*2);
    ctx.fillStyle='#f4c34f';ctx.fillRect(x-w/2,y,w,h);ctx.fillStyle='#fff0b7';ctx.fillRect(x-w/2,y,w,u);
    ctx.fillStyle='#d95b45';
    for(let i=0;i<5;i++){const sx=x-w/2+i*w/5;runPoly([[sx,y+h],[sx+w/10,y+h],[sx+w/5,y],[sx+w/10,y]],'#d95b45')}
    ctx.fillStyle='#8c4a35';ctx.fillRect(x-w/2,y+h-u,u,h*.25);ctx.fillRect(x+w/2-u,y+h-u,u,h*.25);ctx.restore();
  }
  function runOverhead(o){
    const p=runProject(o.lane,o.z),s=p.scale,w=142*s,x=Math.round(p.x),y=Math.round(p.y),u=Math.max(2,Math.round(7*s));
    ctx.save();ctx.fillStyle='#37413f';ctx.fillRect(x-w*.42,y-138*s,u*2,138*s);ctx.fillRect(x+w*.34,y-138*s,u*2,138*s);
    ctx.fillStyle='#271b16';ctx.fillRect(x-w/2-u,y-151*s,w+u*2,34*s);ctx.fillStyle='#f2c76e';ctx.fillRect(x-w/2,y-147*s,w,25*s);
    ctx.fillStyle='#ffe6a8';ctx.fillRect(x-w/2,y-147*s,w,5*s);ctx.fillStyle='#75452d';ctx.fillRect(x-w/2+u,y-122*s,w-u*2,5*s);
    ctx.fillStyle='#6c4029';ctx.font='bold '+Math.max(6,10*s)+'px "Press Start 2P"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('DUCK',x,y-135*s);ctx.restore();
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
    const c=RUN_HEROES[index]||RUN_HEROES[0],s=scale,step=Math.round(Math.sin(phase||0)*2);
    const block=(bx,by,bw,bh,color)=>{ctx.fillStyle=color;ctx.fillRect(bx,by,bw,bh)};
    ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(s,sliding?.58:1);block(-42,2,84,12,'rgba(10,18,24,.38)');
    block(-20,-137,22,12,c.scarf);block(-38,-131,20,10,c.scarf);block(-56,-123,19,9,c.scarf);block(-70,-115,17,8,c.scarf);block(-54,-114,19,7,'#9d554e');
    block(-22+step*5,-62,18,50,c.dark);block(5-step*5,-62,18,50,c.dark);
    block(-26+step*5,-17,28,12,'#202a35');block(4-step*5,-17,29,12,'#202a35');
    block(-29+step*5,-10,33,12,c.accent);block(2-step*5,-10,34,12,c.accent);
    block(-23+step*5,-23,18,8,'#e7e1cf');block(7-step*5,-23,18,8,'#e7e1cf');
    block(-39,-134,15,47,c.dark);block(-43,-113+step*2,18,19,c.skin);block(24,-134,15,47,c.dark);block(27,-113-step*2,18,19,c.skin);
    block(-45,-99+step*2,15,15,c.skin);block(29,-99-step*2,15,15,c.skin);
    block(-33,-143,66,85,'#25283a');block(-29,-143,58,77,c.body);block(-25,-139,18,65,c.shine);
    block(-7,-136,8,67,c.dark);block(8,-135,20,61,c.body);block(-33,-66,66,12,c.dark);block(-28,-62,56,5,c.accent);
    block(-22,-133,44,43,'#202d3b');block(-18,-129,36,35,c.pack);block(-17,-132,34,8,c.accent);
    block(-12,-116,24,5,'rgba(255,245,215,.7)');block(-27,-137,7,63,c.dark);block(20,-137,7,63,c.dark);
    block(-12,-158,24,18,c.skin);block(-27,-193,54,43,'#3b2d30');block(-23,-197,46,11,c.hair);
    block(-31,-185,10,21,c.hair);block(21,-185,10,21,c.hair);block(-23,-154,46,8,c.hair);
    block(-19,-174,38,16,c.skin);block(-19,-174,38,5,'rgba(255,226,196,.38)');
    block(-27,-190,54,12,c.hair);block(-19,-198,38,8,c.accent);block(-8,-205,16,7,c.accent);
    if(jumping){block(-51,-30,12,6,'#fff0bd');block(39,-30,12,6,'#fff0bd')}ctx.restore();
  }
  function runDrawHUD(){
    const panel=(x,y,w,h)=>{
      ctx.fillStyle='#23140e';ctx.fillRect(x-4,y-4,w+8,h+8);ctx.fillStyle='#b77a3f';ctx.fillRect(x,y,w,h);
      ctx.fillStyle='#e5b66e';ctx.fillRect(x+5,y+5,w-10,h-10);ctx.fillStyle='#422516';ctx.fillRect(x+10,y+10,w-20,h-20);
      ctx.fillStyle='#754327';ctx.fillRect(x+14,y+14,w-28,4);
    };
    ctx.save();panel(18,18,180,86);panel(522,18,180,86);ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='#ffe5a2';ctx.font='bold 15px "Press Start 2P"';ctx.fillText('SCORE',108,39);
    ctx.fillStyle='#fff9e8';ctx.font='bold 23px "Press Start 2P"';ctx.fillText(String(score),108,75);
    ctx.fillStyle='#ffe5a2';ctx.font='bold 15px "Press Start 2P"';ctx.fillText('BEST',612,39);
    ctx.fillStyle='#fff9e8';ctx.font='bold 23px "Press Start 2P"';ctx.fillText(String(Math.max(game.runnerBest||0,score)),612,75);
    ctx.fillStyle='#24150e';ctx.fillRect(224,20,272,72);ctx.fillStyle='#b77a3f';ctx.fillRect(230,26,260,60);
    ctx.fillStyle='#422516';ctx.fillRect(236,32,248,48);ctx.fillStyle='#f6d38d';
    ctx.font='bold 10px "Press Start 2P"';ctx.fillText('LUNA RUN',360,46);ctx.fillStyle='#130e0a';ctx.fillRect(260,59,200,13);
    ctx.fillStyle='#4a3020';ctx.fillRect(263,62,194,7);const pct=runnerClampV2((game.speed||430)/870,0,1);
    ctx.fillStyle=pct>.78?'#ed7554':'#83d05b';ctx.fillRect(263,62,Math.round(194*pct),7);
    ctx.fillStyle='#ffe8ab';ctx.font='bold 8px "Press Start 2P"';ctx.fillText('SPEED '+Math.round(game.speed||430),360,76);
    ctx.fillStyle='rgba(27,18,13,.88)';ctx.fillRect(26,112,170,32);ctx.strokeStyle='#d5a75f';ctx.lineWidth=3;ctx.strokeRect(26,112,170,32);
    ctx.fillStyle='#ffcf55';ctx.fillRect(37,122,12,12);ctx.fillStyle='#fff0b2';ctx.fillRect(41,118,4,4);
    ctx.fillStyle='#fff1cc';ctx.font='bold 11px "Press Start 2P"';ctx.textAlign='left';ctx.fillText(String(coins),57,132);
    ctx.fillStyle='#e9bd69';ctx.fillRect(110,121,13,6);ctx.fillRect(116,115,6,18);
    ctx.fillStyle='#fff1cc';ctx.fillText(String(game.runnerKeys||0),132,132);ctx.restore();
  }
  function runDrawMenu(){
    runSky();runTracks();ctx.fillStyle='rgba(20,12,12,.42)';ctx.fillRect(0,0,W,H);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#24160f';ctx.font='bold 55px "Press Start 2P"';ctx.fillText('LUNA RUN',365,145);
    ctx.fillStyle='#fff0bf';ctx.fillText('LUNA RUN',360,140);ctx.fillStyle=runStage().accent;
    ctx.font='bold 15px "Press Start 2P"';ctx.fillText('CHOOSE YOUR RUNNER',360,205);
    RUN_HEROES.forEach((hero,i)=>{
      const x=38+i*232,y=300,w=216,h=350,selected=i===game.heroIndex;
      ctx.fillStyle='#21150f';ctx.fillRect(x-5,y-5,w+10,h+10);ctx.fillStyle=selected?'#c78b4e':'#765033';ctx.fillRect(x,y,w,h);
      ctx.fillStyle='#392317';ctx.fillRect(x+7,y+7,w-14,h-14);ctx.fillStyle=selected?hero.accent:'rgba(255,255,255,.2)';ctx.fillRect(x+12,y+12,w-24,5);
      runDrawHero(i,x+w/2,y+255,.72,game.time*4+i,false,false);
      ctx.fillStyle=hero.accent;ctx.font='bold 17px "Press Start 2P"';ctx.fillText(hero.name,x+w/2,y+45);
      ctx.fillStyle='#f5e0bd';ctx.font='bold 8px "Press Start 2P"';ctx.fillText(hero.tag,x+w/2,y+76);
      ctx.fillStyle=selected?'#fff0b8':'#c5b5a3';ctx.font='bold 9px "Press Start 2P"';ctx.fillText(selected?'SELECTED':'TAP TO SELECT',x+w/2,y+320);
    });
    ctx.fillStyle='#23140e';ctx.fillRect(198,752,324,96);ctx.fillStyle='#d5a060';ctx.fillRect(204,758,312,84);
    ctx.fillStyle='#4b2b18';ctx.fillRect(211,765,298,70);ctx.fillStyle='#ffe0a0';
    ctx.font='bold 19px "Press Start 2P"';ctx.fillText('START RUN',360,795);ctx.fillStyle='#fff2d6';
    ctx.font='bold 8px "Press Start 2P"';ctx.fillText('SWIPE OR USE BUTTONS BELOW',360,900);ctx.textAlign='left';
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
    const heroTrack=runProject(lane,.965);
    const heroY=heroTrack.y-9-(game.jump||0)*.85-(game.runnerEffects.jet>0?125:0)-(game.rideT>0?105:0);
    runDrawHero(game.heroIndex,heroTrack.x,heroY,1.02,game.time*14,game.slide>0,game.jump>30);
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
  function syncRunnerPauseButton(){
    const button=$('runnerPauseBtn');
    if(button)button.textContent=game.runnerMode==='paused'?'▶ RESUME':'Ⅱ PAUSE';
  }
  function runStart(){
    game.runnerMode='run';syncRunnerPauseButton();game.spawn=0;game.runnerInvul=1.1;
    game.lane=1;game.targetLane=1;game.laneVisual=1;
    game.obstacles=[];game.pickups=[];game.jump=0;game.jumpV=0;game.slide=0;
    game.runnerEffects={magnet:0,x2:0,jet:0,shoes:0,board:0};
    game.runnerFX=[];game.runnerShake=0;game.runnerFlash=0;game.runnerSaved=false;game.rideT=0;
    game.runnerDistance=0;game.speed=430;game.runnerBest=bestOf('runner');setScore(0);coins=0;
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
    if(game.runnerEffects.board>0){game.runnerEffects.board=0;game.runnerInvul=1.5;game.runnerShake=8;game.runnerFlash=.16;game.obstacles=game.obstacles.filter(o=>o.z<.84);tone(260);return}
    game.runnerMode='over';syncRunnerPauseButton();game.runnerShake=18;game.runnerFlash=.34;
    const impact=runProject(game.laneVisual===undefined?1:game.laneVisual,.965);
    lunaRunAddBurst(impact.x,impact.y-105,'#ff9b8f',20);
    if(game.runnerKeys<1)runSaveResult();
    tone(150,.18);
  }
  function runSaveResult(){
    if(game.runnerSaved)return;
    setScore(Math.floor((game.runnerDistance||0)/90)+coins);
    game.runnerSaved=true;saveResult();game.runnerBest=bestOf('runner');
  }
  function runRetry(){
    runSaveResult();
    game.runnerEffects={magnet:0,x2:0,jet:0,shoes:0,board:0};
    game.runnerKeys=runRead('keys',game.runnerKeys);game.rideT=0;
    game.runnerMode='select';game.runnerSaved=false;syncRunnerPauseButton();
    game.obstacles=[];game.pickups=[];game.runnerDistance=0;game.speed=430;game.spawn=0;
    game.jump=0;game.jumpV=0;game.slide=0;setScore(0);coins=0;
  }
  function runContinue(){
    if(game.runnerKeys<1)return;
    game.runnerKeys--;runWrite('keys',game.runnerKeys);
    game.runnerMode='run';syncRunnerPauseButton();game.runnerInvul=2.5;game.obstacles=game.obstacles.filter(o=>o.z<.7);
    game.jump=0;game.jumpV=0;game.slide=0;tone(880);
  }
  function runHandleTap(x,y){
    if(game.runnerMode==='select'){
      if(y>=285&&y<=670){game.heroIndex=runnerClampV2(Math.floor(x/240),0,2);runWrite('hero',game.heroIndex);tone(600);return}
      if(y>=735&&y<=865)runStart();
      return;
    }
    if(game.runnerMode==='paused'){game.runnerMode='run';syncRunnerPauseButton();return}
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
    game.runnerStage=Math.floor(game.runnerDistance/5300)%RUN_STAGES.length;

    const travel=dt*(.36+game.speed/1900);
    const difficulty=Math.min(1,game.runnerDistance/15000);
    const interval=Math.max(.94,1.28-difficulty*.22-(game.speed-430)/2200);
    game.spawn+=dt;

    // New obstacle patterns only use lanes that are not already occupied ahead.
    if(game.spawn>=interval){
      const busyLanes=Array.from(new Set(game.obstacles
        .filter(obstacle=>obstacle.z>.30&&obstacle.z<1.08)
        .map(obstacle=>obstacle.lane)));
      const available=[0,1,2].filter(lane=>!busyLanes.includes(lane));

      // Skip a beat rather than creating an unavoidable wall.
      if(available.length>=2){
        const lane=available[Math.floor(Math.random()*available.length)];
        const roll=Math.random();
        const type=roll<(.23+difficulty*.08)?'train'
          :roll<(.61+difficulty*.04)?'barrier'
          :roll<(.83-difficulty*.03)?'overhead':'ramp';

        if(type==='ramp'){
          game.obstacles.push({lane,z:.015,type:'ramp',collisionHandled:false});
          game.obstacles.push({lane,z:-.22,type:'train',collisionHandled:false});
          game.pickups.push({lane,z:.11,type:'super',raised:true});
        }else{
          game.obstacles.push({lane,z:.015,type,collisionHandled:false});
        }

        const otherLanes=available.filter(value=>value!==lane);
        let extraLane=-1;
        if(otherLanes.length>1&&game.runnerDistance>5000&&Math.random()<Math.min(.28,(game.runnerDistance-5000)/30000)){
          extraLane=otherLanes[Math.floor(Math.random()*otherLanes.length)];
          game.obstacles.push({lane:extraLane,z:-.26,type:Math.random()<.55?'barrier':'overhead',collisionHandled:false});
        }

        const safeLanes=otherLanes.filter(value=>value!==extraLane);
        if(safeLanes.length){
          const safeLane=safeLanes[Math.floor(Math.random()*safeLanes.length)];
          for(let i=0;i<6;i++){
            game.pickups.push({lane:safeLane,z:-.12+i*.105,type:i%4===3?'super':'coin'});
          }
          if(Math.random()<.23){
            const typeNames=['magnet','x2','jet','shoes','board','mystery','key'];
            game.pickups.push({lane:safeLane,z:.18,type:typeNames[Math.floor(Math.random()*typeNames.length)]});
          }
        }
        game.spawn=0;
      }
    }

    // Keep the previous depth to make collision windows robust on dropped frames.
    game.obstacles.forEach(obstacle=>{obstacle.prevZ=obstacle.z;obstacle.z+=travel;});
    game.pickups.forEach(item=>{item.prevZ=item.z;item.z+=travel;});

    game.runnerInvul=Math.max(0,game.runnerInvul-dt);
    game.rideT=Math.max(0,(game.rideT||0)-dt);
    Object.keys(game.runnerEffects).forEach(key=>game.runnerEffects[key]=Math.max(0,game.runnerEffects[key]-dt));
    game.laneVisual+=(game.targetLane-game.laneVisual)*Math.min(1,dt*12);

    if(game.jump>0||game.jumpV>0){
      game.jump=Math.max(0,game.jump+game.jumpV*dt);
      game.jumpV-=1650*dt;
      if(game.jump===0)game.jumpV=0;
    }
    if(game.slide>0)game.slide=Math.max(0,game.slide-dt);
    lunaRunUpdateFX(dt);

    // Swept pickup checks prevent coins from disappearing between animation frames.
    game.pickups=game.pickups.filter(item=>{
      const previous=item.prevZ===undefined?item.z:item.prevZ;
      const crossed=item.z>=.88&&previous<=1.04;
      const magnet=game.runnerEffects.magnet>0&&item.type==='coin'&&item.z>.68&&item.z<1.12;
      const laneMatch=Math.abs(item.lane-game.laneVisual)<(magnet?1.08:.34);
      if((crossed||magnet)&&laneMatch){
        const point=runProject(item.lane,item.z);
        if(item.type==='coin'||item.type==='super'){
          const value=item.type==='super'?5:1;
          coins+=value*(game.runnerEffects.x2>0?2:1);
          lunaRunAddBurst(point.x,point.y-38*point.scale,item.type==='super'?'#8eeaff':'#ffd36b',7);
          tone(item.type==='super'?980:810);
          return false;
        }
        lunaRunAddBurst(point.x,point.y-48*point.scale,(RUN_ITEMS[item.type]||RUN_ITEMS.mystery).color,10);
        runUseItem(item.type);
        return false;
      }
      return item.z<1.12;
    });

    // Resolve each obstacle only once. Ramps cannot repeatedly reset the ride timer.
    if(game.runnerInvul<=0&&game.runnerEffects.jet<=0){
      for(const obstacle of game.obstacles){
        if(obstacle.collisionHandled||Math.abs(obstacle.lane-game.laneVisual)>.36)continue;
        const previous=obstacle.prevZ===undefined?obstacle.z:obstacle.prevZ;
        const crossed=obstacle.z>=.91&&previous<=1.035;
        if(!crossed)continue;

        obstacle.collisionHandled=true;
        if(obstacle.type==='barrier'&&game.jump>78)continue;
        if(obstacle.type==='overhead'&&game.slide>0)continue;
        if(obstacle.type==='ramp'){
          game.rideT=2.7;game.jump=Math.max(game.jump,70);game.jumpV=0;
          const point=runProject(obstacle.lane,obstacle.z);
          lunaRunAddBurst(point.x,point.y-20,'#9ff5ee',12);
          continue;
        }
        if(obstacle.type==='train'&&game.rideT>0)continue;
        runCrash();
        return;
      }
    }

    game.obstacles=game.obstacles.filter(obstacle=>obstacle.z<1.15);
    setScore(Math.floor(game.runnerDistance/90)+coins);
  }
  function action(dx,dy){
    if(state!=='playing')return;
    if(current==='runner'){
      if(game.runnerMode==='select'){if(dx){game.heroIndex=runnerClampV2(game.heroIndex+dx,0,2);runWrite('hero',game.heroIndex)}else if(dy<0)runStart();return}
      if(game.runnerMode==='paused'){if(dy!==0||dx!==0){game.runnerMode='run';syncRunnerPauseButton()}return}
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
    else if((e.key==='p'||e.key==='P')&&game.runnerMode==='run'){e.preventDefault();game.runnerMode='paused';syncRunnerPauseButton()}
    else if((e.key==='Enter'||e.key===' ')&&game.runnerMode==='paused'){e.preventDefault();game.runnerMode='run';syncRunnerPauseButton()}
    else if((e.key==='r'||e.key==='R')&&game.runnerMode==='over'){e.preventDefault();if(game.runnerKeys>0)runContinue();else runRetry()}
  });
  // Touch deck shown only while Luna Run is open.
  $('runnerLeft').addEventListener('click',()=>action(-1,0));
  $('runnerRight').addEventListener('click',()=>action(1,0));
  $('runnerJump').addEventListener('click',()=>action(0,-1));
  $('runnerRoll').addEventListener('click',()=>action(0,1));
  $('runnerHeroBtn').addEventListener('click',()=>{
    if(current!=='runner'||state!=='playing')return;
    game.heroIndex=(Math.max(0,Math.floor(game.heroIndex||0))+1)%RUN_HEROES.length;
    runWrite('hero',game.heroIndex);
    lunaRunAddBurst(360,690,RUN_HEROES[game.heroIndex].accent,14);
    tone(640);
  });
  $('runnerPauseBtn').addEventListener('click',()=>{
    if(current!=='runner'||state!=='playing')return;
    if(game.runnerMode==='run')game.runnerMode='paused';
    else if(game.runnerMode==='paused')game.runnerMode='run';
    syncRunnerPauseButton();
  });
  $('runnerSoundBtn').addEventListener('click',()=>{soundOn=!soundOn;$('runnerSoundBtn').textContent=soundOn?'♫ SOUND ON':'♫ SOUND OFF';if(soundOn)tone(540)});
  $('runnerSoundBtn').textContent=soundOn?'♫ SOUND ON':'♫ SOUND OFF';

  // Subway Hero Run finishing pass: longer metro trains, station detail and
  // clearer mobile-game visuals, while retaining Luna's original characters.
  function runDrawTrainCar(lane,z,isFront){
    const p=runProject(lane,z),s=p.scale,w=150*s,h=205*s,x=Math.round(p.x),y=Math.round(p.y);
    const left=Math.round(x-w/2),top=Math.round(y-h),u=Math.max(2,Math.round(8*s));
    ctx.save();ctx.fillStyle='rgba(10,19,23,.32)';ctx.fillRect(left+u*2,top+h-u*2,w,h);
    ctx.fillStyle='#142f42';ctx.fillRect(left-u,top-u,w+u*2,h+u*2);
    ctx.fillStyle='#267f8b';ctx.fillRect(left,top,w,h);ctx.fillStyle='#4eb6ad';ctx.fillRect(left+u,top+u,w-u*2,u*3);
    ctx.fillStyle='#1e6175';ctx.fillRect(left+w-u*3,top+u*2,u*3,h-u*4);
    ctx.fillStyle='#143d53';ctx.fillRect(left+u*2,top+u*4,w-u*4,h*.38);
    ctx.fillStyle='#a8d9d0';ctx.fillRect(left+u*3,top+u*5,w-u*6,h*.29);
    ctx.fillStyle='#d7eee0';ctx.fillRect(left+u*3,top+u*5,w*.36,u);
    ctx.fillStyle='#5a9eaa';ctx.fillRect(left+u*3,top+h*.33,w-u*6,u);
    ctx.fillStyle='#173e50';ctx.fillRect(left+w*.48,top+u*5,u,h*.28);
    ctx.fillStyle='#e0b95d';ctx.fillRect(left+u,top+h*.62,w-u*2,u*2);
    ctx.fillStyle='#fff0af';ctx.fillRect(left+u*2,top+h*.79,u*2,u);ctx.fillRect(left+w-u*4,top+h*.79,u*2,u);
    ctx.fillStyle='#163a49';ctx.fillRect(left+u,top+h*.9,w-u*2,h*.07);ctx.fillStyle='#cfdfcb';ctx.fillRect(left+u*2,top+h*.92,w-u*4,u);
    ctx.fillStyle='#153a4a';ctx.fillRect(left+w*.28,top+h*.48,w*.44,u*2);
    ctx.fillStyle='#ffe2a1';ctx.font='bold '+Math.max(5,8*s)+'px "Press Start 2P"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('LUNA',x,top+h*.48+u);
    runPoly([[left+w,top+u],[left+w+u*3,top+u*3],[left+w+u*3,top+h-u],[left+w,top+h]],'#174e60');
    ctx.fillStyle='#8bc9bd';
    for(let i=0;i<3;i++){const wx=left+w+u*(.5+i*.9),wy=top+h*.2;ctx.fillRect(wx,wy,u*.7,h*.16);ctx.fillStyle='rgba(255,244,202,.55)';ctx.fillRect(wx+u*.15,wy+u,u*.2,h*.11);ctx.fillStyle='#8bc9bd'}
    ctx.fillStyle='#172b36';ctx.fillRect(left+u*2,top+h-u*2,w*.27,u*2);ctx.fillRect(left+w*.64,top+h-u*2,w*.27,u*2);
    ctx.restore();
  }
  function runTrain(o){
    // A connected three-car metro approaches along the chosen railway.
    runDrawTrainCar(o.lane,Math.max(.08,o.z-.30),false);
    runDrawTrainCar(o.lane,Math.max(.08,o.z-.15),false);
    runDrawTrainCar(o.lane,o.z,true);
  }
  function runBarrier(o){
    const p=runProject(o.lane,o.z),s=p.scale,w=124*s,h=42*s,x=Math.round(p.x),y=Math.round(p.y-13*s),u=Math.max(2,Math.round(7*s));
    ctx.save();ctx.fillStyle='#49352a';ctx.fillRect(x-w*.38,y+h*.55,u*2,h*.9);ctx.fillRect(x+w*.33,y+h*.55,u*2,h*.9);
    ctx.fillStyle='#301f17';ctx.fillRect(x-w/2-u,y-u,w+u*2,h+u*2);ctx.fillStyle='#f4c34f';ctx.fillRect(x-w/2,y,w,h);
    ctx.fillStyle='#fff0b7';ctx.fillRect(x-w/2,y,w,u);ctx.fillStyle='#d95b45';
    for(let i=0;i<5;i++){const sx=x-w/2+i*w/5;runPoly([[sx,y+h],[sx+w/10,y+h],[sx+w/5,y],[sx+w/10,y]],'#d95b45')}
    ctx.fillStyle='#8c4a35';ctx.fillRect(x-w/2,y+h-u,u,h*.25);ctx.fillRect(x+w/2-u,y+h-u,u,h*.25);ctx.restore();
  }
  function runOverhead(o){
    const p=runProject(o.lane,o.z),s=p.scale,w=142*s,x=Math.round(p.x),y=Math.round(p.y),u=Math.max(2,Math.round(7*s));
    ctx.save();ctx.fillStyle='#37413f';ctx.fillRect(x-w*.42,y-138*s,u*2,138*s);ctx.fillRect(x+w*.34,y-138*s,u*2,138*s);
    ctx.fillStyle='#271b16';ctx.fillRect(x-w/2-u,y-151*s,w+u*2,34*s);ctx.fillStyle='#f2c76e';ctx.fillRect(x-w/2,y-147*s,w,25*s);
    ctx.fillStyle='#ffe6a8';ctx.fillRect(x-w/2,y-147*s,w,5*s);ctx.fillStyle='#75452d';ctx.fillRect(x-w/2+u,y-122*s,w-u*2,5*s);
    ctx.fillStyle='#6c4029';ctx.font='bold '+Math.max(6,10*s)+'px "Press Start 2P"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('DUCK',x,y-135*s);ctx.restore();
  }
  function drawSubwayRunnerLegacy(){
    if(game.runnerMode==='select'){runDrawMenu();return}
    const st=runStage();runSky();runTracks();
    for(let i=0;i<10;i++){
      const z=((i/10)+(game.time*.2)%1)%1,lane=i%2?0:2,p=runProject(lane,z);
      const px=Math.round(p.x+(lane===0?-30:30)*p.scale),py=p.y-118*p.scale;
      ctx.fillStyle='#273b39';ctx.fillRect(px-3,py,7,118*p.scale);ctx.fillStyle='#d7a65d';ctx.fillRect(px-9,py-8,19,10);
      ctx.fillStyle='#fff0b8';ctx.fillRect(px-5,py-5,11,4);
      if(i%3===0){
        const sw=48*p.scale,sy=p.y-151*p.scale;ctx.fillStyle='#261a14';ctx.fillRect(p.x-sw/2-3,sy-3,sw+6,20*p.scale);
        ctx.fillStyle='#e5b568';ctx.fillRect(p.x-sw/2,sy,sw,14*p.scale);ctx.fillStyle='#50311e';
        ctx.font='bold '+Math.max(5,8*p.scale)+'px "Press Start 2P"';ctx.textAlign='center';ctx.fillText('LINE 01',p.x,sy+9*p.scale);
      }
    }
    game.pickups.filter(o=>o.type==='coin'||o.type==='super').slice().sort((a,b)=>a.z-b.z).forEach(runDrawCoin);
    game.pickups.filter(o=>o.type!=='coin'&&o.type!=='super').slice().sort((a,b)=>a.z-b.z).forEach(runDrawPickup);
    game.obstacles.slice().sort((a,b)=>a.z-b.z).forEach(runDrawObstacle);
    const lane=game.laneVisual===undefined?1:game.laneVisual,track=runProject(lane,.965),heroX=Math.round(track.x);
    const flying=game.runnerEffects.jet>0,heroY=Math.round(track.y-10-(game.jump||0)*.85-(flying?125:0)-(game.rideT>0?105:0));
    if(game.runnerEffects.board>0){
      ctx.fillStyle='#202b39';ctx.fillRect(heroX-55,heroY+3,110,15);ctx.fillStyle='#28bfdb';ctx.fillRect(heroX-52,heroY-2,104,12);
      ctx.fillStyle='#fff0bd';ctx.fillRect(heroX-35,heroY,70,4);ctx.fillStyle='#20232b';ctx.fillRect(heroX-36,heroY+12,14,8);ctx.fillRect(heroX+22,heroY+12,14,8);
    }
    if(flying)for(let i=-1;i<=1;i++){
      const flame=24+Math.sin(game.time*22+i)*8;ctx.fillStyle='#fff2b0';ctx.fillRect(heroX+i*14-4,heroY+52,8,flame*.35);
      ctx.fillStyle='#ffab4c';ctx.fillRect(heroX+i*14-3,heroY+52+flame*.35,6,flame*.45);
    }
    runDrawHero(game.heroIndex,heroX,heroY,1.02,game.time*14,game.slide>0,game.jump>30);
    if(game.runnerInvul>0&&Math.floor(game.time*16)%2===0){ctx.strokeStyle='rgba(255,255,255,.62)';ctx.lineWidth=4;ctx.strokeRect(heroX-49,heroY-202,98,208)}
    runDrawHUD();
    ctx.fillStyle='#29170f';ctx.fillRect(242,157,236,30);ctx.fillStyle='#c18b4c';ctx.fillRect(246,161,228,22);
    ctx.fillStyle='#3e2618';ctx.fillRect(250,165,220,14);ctx.fillStyle=st.accent;ctx.font='bold 8px "Press Start 2P"';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(st.name,360,172);
    if(game.runnerMode==='paused')runDrawOverlay('PAUSED','Your run is paused.','RESUME',null);
    if(game.runnerMode==='over')runDrawOverlay(game.runnerKeys>0?'CRASHED':'RUN OVER',
      game.runnerKeys>0?'Use one Luna Key to continue?':'Distance '+Math.floor(game.runnerDistance/10)+' · Coins '+coins,
      game.runnerKeys>0?'CONTINUE · '+game.runnerKeys+' KEY':'TRY AGAIN',game.runnerKeys>0?'END RUN / RETRY':null);
  }




  // LUNA RUN: authored Canvas2D scene. Simulation and presentation are kept separate.
  function lunaRunPanel(x,y,w,h,fill,stroke,radius){
    ctx.beginPath();ctx.roundRect(x,y,w,h,radius||14);
    if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}
  }
  function lunaRunPoly(points,fill,stroke,width){
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));
    ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width||2;ctx.stroke();}
  }
  function lunaRunText(value,x,y,size,color,align,font){
    ctx.fillStyle=color||'#fff';ctx.font='700 '+size+'px '+(font||'"Space Grotesk",sans-serif');
    ctx.textAlign=align||'left';ctx.textBaseline='middle';ctx.fillText(String(value),x,y);
  }
  function lunaRunAddBurst(x,y,color,count){
    if(!Array.isArray(game.runnerFX))game.runnerFX=[];
    for(let i=0;i<(count||8);i++){
      const angle=Math.random()*Math.PI*2,speed=45+Math.random()*190;
      game.runnerFX.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-28,
        life:.28+Math.random()*.46,maxLife:.74,size:1.8+Math.random()*3.4,color});
    }
    if(game.runnerFX.length>150)game.runnerFX.splice(0,game.runnerFX.length-150);
  }
  function lunaRunUpdateFX(dt){
    if(!Array.isArray(game.runnerFX))game.runnerFX=[];
    game.runnerShake=Math.max(0,(game.runnerShake||0)-dt*42);
    game.runnerFlash=Math.max(0,(game.runnerFlash||0)-dt*1.8);
    game.runnerFX.forEach(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=170*dt;});
    game.runnerFX=game.runnerFX.filter(p=>p.life>0);
  }
  function lunaRunDrawFX(){
    if(!Array.isArray(game.runnerFX))return;
    ctx.save();
    game.runnerFX.forEach(p=>{
      ctx.globalAlpha=Math.max(0,p.life/p.maxLife);ctx.fillStyle=p.color;
      ctx.shadowBlur=12;ctx.shadowColor=p.color;ctx.beginPath();
      ctx.arc(p.x,p.y,p.size*Math.max(.1,p.life/p.maxLife),0,Math.PI*2);ctx.fill();
    });
    ctx.restore();
  }
  function lunaRunDrawBackdrop(){
    const stage=runStage(),sky=ctx.createLinearGradient(0,0,0,520);
    sky.addColorStop(0,stage.sky[0]);sky.addColorStop(.46,stage.sky[1]);sky.addColorStop(1,stage.sky[2]);
    ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    const glow=ctx.createRadialGradient(548,188,5,548,188,250);
    glow.addColorStop(0,'rgba(255,231,183,.30)');glow.addColorStop(1,'rgba(255,231,183,0)');
    ctx.fillStyle=glow;ctx.fillRect(290,0,430,440);
    ctx.save();ctx.shadowBlur=38;ctx.shadowColor='rgba(255,224,170,.65)';
    ctx.fillStyle=stage.name==='NEON NIGHT'?'#dce9ff':'#ffe4ae';
    ctx.beginPath();ctx.arc(548,188,46,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.fillStyle=stage.sky[1];ctx.beginPath();ctx.arc(566,172,42,0,Math.PI*2);ctx.fill();

    for(let i=0;i<5;i++){
      const x=((i*193-game.time*(7+i%2*3))%930+930)%930-90,y=112+(i%3)*38;
      ctx.save();ctx.globalAlpha=.12+(i%2)*.05;ctx.fillStyle='#fff3dc';
      ctx.beginPath();ctx.ellipse(x,y,48,13,0,0,Math.PI*2);ctx.ellipse(x+25,y-8,30,16,0,0,Math.PI*2);
      ctx.ellipse(x+55,y+1,38,12,0,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    lunaRunPoly([[0,375],[84,315],[158,354],[252,282],[342,360],[448,300],[540,354],[635,286],[720,344],[720,510],[0,510]],stage.far);
    lunaRunPoly([[0,414],[90,365],[174,402],[270,336],[360,408],[460,350],[555,410],[650,344],[720,390],[720,550],[0,550]],stage.mid);

    // Three parallax skyline layers; all windows are placed deterministically.
    for(let layer=0;layer<3;layer++){
      const step=78-layer*12,shift=((game.runnerDistance||0)*(.012+layer*.006))%step,base=370+layer*43;
      for(let i=-2;i<13;i++){
        const x=i*step-shift,seed=Math.abs((i*29+layer*41+900)%97);
        const width=42+(seed%25),height=58+(seed%7)*15,top=base-height;
        ctx.fillStyle=layer===0?stage.far:layer===1?stage.mid:'#202d42';ctx.fillRect(x,top,width,height);
        ctx.fillStyle='rgba(255,220,166,'+(.20+layer*.08)+')';
        for(let row=0;row<5;row++)for(let col=0;col<3;col++){
          if(((row*3+col+seed)%4)!==0)ctx.fillRect(x+8+col*13,top+12+row*17,5,8);
        }
        ctx.fillStyle='rgba(7,16,30,.28)';ctx.fillRect(x+width-5,top,5,height);
        if(seed%3===0){ctx.fillStyle='#273b4c';ctx.fillRect(x+width*.48,top-13,3,13);ctx.fillRect(x+width*.48-8,top-13,19,3);}
      }
    }
    const canopy=ctx.createLinearGradient(0,315,0,354);
    canopy.addColorStop(0,'rgba(19,33,49,.92)');canopy.addColorStop(1,'rgba(30,44,55,.38)');
    ctx.fillStyle=canopy;ctx.fillRect(0,326,W,31);ctx.fillStyle='rgba(230,197,145,.55)';ctx.fillRect(0,350,W,3);
    for(let x=35;x<720;x+=86){
      ctx.fillStyle='rgba(255,222,164,.18)';ctx.fillRect(x,358,28,3);
      ctx.fillStyle='#ffe2a6';ctx.shadowBlur=13;ctx.shadowColor='#ffe2a6';ctx.fillRect(x+7,358,13,3);ctx.shadowBlur=0;
    }
    if(stage.rain){
      ctx.save();ctx.strokeStyle='rgba(211,232,255,.24)';ctx.lineWidth=1.2;
      for(let i=0;i<42;i++){const x=(i*97+game.time*260)%760-20,y=(i*53+game.time*410)%570;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-7,y+20);ctx.stroke();}
      ctx.restore();
    }
    const haze=ctx.createLinearGradient(0,345,0,520);
    haze.addColorStop(0,'rgba(255,222,191,0)');haze.addColorStop(1,'rgba(255,222,191,.18)');
    ctx.fillStyle=haze;ctx.fillRect(0,345,W,190);
    const vignette=ctx.createRadialGradient(360,470,250,360,470,760);
    vignette.addColorStop(0,'rgba(2,7,14,0)');vignette.addColorStop(1,'rgba(2,7,14,.40)');
    ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
  }
  function lunaRunDrawTracks(){
    const stage=runStage();
    const ground=ctx.createLinearGradient(0,352,0,H);
    ground.addColorStop(0,stage.ground);
    ground.addColorStop(.32,'#344a48');
    ground.addColorStop(1,'#111d29');
    ctx.fillStyle=ground;ctx.fillRect(0,352,W,H-352);

    // Ballast shoulders frame one coherent three-track railway.
    lunaRunPoly([[0,352],[270,352],[-90,H],[0,H]],'#5d6756');
    lunaRunPoly([[450,352],[720,352],[810,H],[720,H]],'#5d6756');
    lunaRunPoly([[0,470],[250,374],[0,H]],'rgba(188,190,145,.11)');
    lunaRunPoly([[470,374],[720,470],[720,H]],'rgba(188,190,145,.11)');

    const phase=((game.runnerDistance||0)*.0032)%1;
    const lanes=[];
    for(let lane=0;lane<3;lane++){
      const far=runProject(lane,.015),near=runProject(lane,1.12);
      const bedFar=far.laneWidth*.52,bedNear=near.laneWidth*.52;
      const bed=ctx.createLinearGradient(far.x,far.y,near.x,near.y);
      bed.addColorStop(0,'#454e50');
      bed.addColorStop(.34,'#3a4549');
      bed.addColorStop(1,'#222d37');
      lunaRunPoly([
        [far.x-bedFar,far.y],[far.x+bedFar,far.y],
        [near.x+bedNear,near.y],[near.x-bedNear,near.y]
      ],bed,'rgba(198,215,205,.17)',1.4);
      lanes.push({lane,far,near});
    }

    // Wooden sleepers move toward the camera at a measured speed. Each has
    // a bevel, a grain highlight and rail fasteners instead of flat neon bars.
    for(const track of lanes){
      for(let i=0;i<18;i++){
        const z=((i/18)+phase)%1;
        const p=runProject(track.lane,z);
        const half=p.laneWidth*.435;
        const depth=2.2+z*8.2;
        const y=p.y;
        const wood=ctx.createLinearGradient(0,y-depth,0,y+depth);
        wood.addColorStop(0,'#b08a66');
        wood.addColorStop(.28,'#80644e');
        wood.addColorStop(1,'#3a3432');
        ctx.save();
        ctx.globalAlpha=.55+z*.45;
        ctx.fillStyle='rgba(3,9,16,.48)';
        ctx.beginPath();ctx.roundRect(p.x-half-2,y-depth*.15+depth*.65,half*2+4,depth*1.35,depth*.38);ctx.fill();
        ctx.fillStyle=wood;
        ctx.beginPath();ctx.roundRect(p.x-half,y-depth*.5,half*2,depth,depth*.32);ctx.fill();
        ctx.strokeStyle='rgba(227,190,143,'+(.18+z*.22)+')';
        ctx.lineWidth=Math.max(.7,depth*.11);
        ctx.beginPath();ctx.moveTo(p.x-half*.8,y-depth*.22);ctx.lineTo(p.x+half*.8,y-depth*.22);ctx.stroke();
        const plateW=Math.max(2,2.2+z*5);
        [-1,1].forEach(side=>{
          const px=p.x+side*p.laneWidth*.27;
          ctx.fillStyle='#27343b';
          ctx.beginPath();ctx.roundRect(px-plateW*1.2,y-depth*.75,plateW*2.4,depth*1.5,plateW*.35);ctx.fill();
          ctx.fillStyle='#d1c7a4';ctx.beginPath();ctx.arc(px,y,Math.max(.7,depth*.12),0,Math.PI*2);ctx.fill();
        });
        ctx.restore();
      }
    }

    // Six continuous steel rails: dark web, rounded foot and a narrow
    // brushed-metal highlight so the perspective reads as real rail stock.
    for(const track of lanes){
      [-1,1].forEach(side=>{
        const top=runProject(track.lane,.008),bottom=runProject(track.lane,1.12);
        const ax=top.x+top.laneWidth*.27*side;
        const bx=bottom.x+bottom.laneWidth*.27*side;
        ctx.lineCap='butt';
        ctx.strokeStyle='rgba(3,9,16,.78)';
        ctx.lineWidth=4.5+bottom.scale*6.5;
        ctx.beginPath();ctx.moveTo(ax+2,top.y+4);ctx.lineTo(bx+2,bottom.y+4);ctx.stroke();

        const steel=ctx.createLinearGradient(ax,top.y,bx,bottom.y);
        steel.addColorStop(0,'#c4d3ca');
        steel.addColorStop(.24,'#657982');
        steel.addColorStop(.52,'#e1e6d6');
        steel.addColorStop(.76,'#788c91');
        steel.addColorStop(1,'#d0d6c8');
        ctx.strokeStyle=steel;
        ctx.lineWidth=2.1+bottom.scale*4.4;
        ctx.beginPath();ctx.moveTo(ax,top.y);ctx.lineTo(bx,bottom.y);ctx.stroke();

        ctx.strokeStyle='rgba(255,255,239,.60)';
        ctx.lineWidth=.8+bottom.scale*.75;
        ctx.beginPath();ctx.moveTo(ax-1.1,top.y);ctx.lineTo(bx-3,bottom.y);ctx.stroke();
      });
    }

    // Trackside lamps and small ballast glints create motion cues without
    // filling the playfield with particle noise.
    for(let i=0;i<17;i++){
      const z=((i/17)+phase*.82)%1;
      const pLeft=runProject(0,z),pRight=runProject(2,z);
      [-1,1].forEach(side=>{
        const p=side<0?pLeft:pRight;
        const x=p.x+side*p.laneWidth*.61;
        const r=1+z*2.3;
        ctx.fillStyle='rgba(255,222,164,'+(.16+z*.38)+')';
        ctx.beginPath();ctx.arc(x,p.y,r,0,Math.PI*2);ctx.fill();
      });
    }
    const edgeFade=ctx.createLinearGradient(0,830,0,H);
    edgeFade.addColorStop(0,'rgba(5,12,21,0)');
    edgeFade.addColorStop(1,'rgba(5,12,21,.38)');
    ctx.fillStyle=edgeFade;ctx.fillRect(0,830,W,170);
  }
  function lunaRunDrawStationArchitecture(){
    // Platform canopy and catenary supports recede toward a single vanishing point.
    for(let i=0;i<7;i++){
      const z=.08+i*.145;
      const left=runProject(0,z),right=runProject(2,z);
      const scale=.18+z*.95;
      const roofY=Math.max(258,left.y-248*scale);
      const pillarW=3+z*5;
      const sideOffset=left.laneWidth*.72;
      const leftX=left.x-sideOffset,rightX=right.x+sideOffset;
      const steel=ctx.createLinearGradient(leftX,0,leftX+pillarW*2,0);
      steel.addColorStop(0,'#172b38');steel.addColorStop(.48,'#8fa5a0');steel.addColorStop(1,'#213b46');
      ctx.fillStyle='rgba(3,9,17,.32)';
      ctx.fillRect(leftX-pillarW,roofY+2,pillarW*2,left.y-roofY+20);
      ctx.fillStyle=steel;
      ctx.fillRect(leftX-pillarW*.5,roofY,pillarW,Math.max(12,left.y-roofY));
      ctx.fillRect(rightX-pillarW*.5,roofY,pillarW,Math.max(12,right.y-roofY));
      const beam=ctx.createLinearGradient(0,roofY,0,roofY+pillarW*2);
      beam.addColorStop(0,'#9eb1aa');beam.addColorStop(.5,'#405c64');beam.addColorStop(1,'#142c3c');
      ctx.fillStyle=beam;
      ctx.fillRect(leftX-pillarW,roofY,rightX-leftX+pillarW*2,pillarW*1.45);
      ctx.fillStyle=runStage().accent;
      ctx.shadowBlur=8+z*8;ctx.shadowColor=runStage().accent;
      ctx.fillRect(leftX-pillarW,roofY+pillarW*1.1,pillarW*2,.9+z*2);
      ctx.fillRect(rightX-pillarW,roofY+pillarW*1.1,pillarW*2,.9+z*2);
      ctx.shadowBlur=0;
      // Small maintenance brackets give the supports believable structure.
      ctx.fillStyle='rgba(8,19,30,.76)';
      ctx.fillRect(leftX-pillarW*1.8,roofY+pillarW*2,pillarW*2.6,pillarW*.72);
      ctx.fillRect(rightX-pillarW*.8,roofY+pillarW*2,pillarW*2.6,pillarW*.72);
      const lampY=roofY+pillarW*2.8;
      ctx.fillStyle='rgba(255,232,184,.88)';
      ctx.shadowBlur=7+z*8;ctx.shadowColor='#ffe5af';
      ctx.fillRect(leftX-pillarW*.8,lampY,Math.max(2,pillarW*.7),2+z);
      ctx.fillRect(rightX+pillarW*.1,lampY,Math.max(2,pillarW*.7),2+z);
      ctx.shadowBlur=0;
    }

    // Three overhead power lines, with a small rhythmic sag between gantries.
    ctx.save();
    ctx.lineCap='round';
    for(let line=0;line<3;line++){
      const offset=(line-1)*16;
      const g=ctx.createLinearGradient(0,264+offset,0,348+offset);
      g.addColorStop(0,'rgba(16,31,44,.95)');
      g.addColorStop(.55,'rgba(114,145,147,.85)');
      g.addColorStop(1,'rgba(24,44,54,.94)');
      ctx.strokeStyle=g;ctx.lineWidth=line===1?2.5:1.6;
      ctx.beginPath();
      ctx.moveTo(0,282+offset);
      ctx.quadraticCurveTo(360,316+offset,720,282+offset);
      ctx.stroke();
    }
    ctx.restore();

    // Platform edge lighting and station fascia create a readable horizon.
    const fascia=ctx.createLinearGradient(0,335,0,380);
    fascia.addColorStop(0,'rgba(14,30,43,.1)');
    fascia.addColorStop(.35,'rgba(9,24,37,.82)');
    fascia.addColorStop(1,'rgba(22,43,49,.55)');
    ctx.fillStyle=fascia;ctx.fillRect(0,337,W,42);
    ctx.fillStyle='rgba(239,205,143,.62)';ctx.fillRect(0,372,W,2);
    for(let i=0;i<16;i++){
      const x=i*52+((game.runnerDistance||0)*.025)%52;
      ctx.fillStyle='rgba(255,226,166,.22)';
      ctx.fillRect(x,362,23,2);
      ctx.fillStyle='#ffe6b4';ctx.shadowBlur=6;ctx.shadowColor='#ffe6b4';
      ctx.fillRect(x+5,361,11,2);ctx.shadowBlur=0;
    }
    // Distant signal lamps: restrained, non-flashing colour cues.
    [-1,1].forEach(side=>{
      const x=360+side*226;
      ctx.fillStyle='#172b38';ctx.fillRect(x-3,294,6,83);
      lunaRunPanel(x-11,292,22,34,'#11273b','rgba(223,237,222,.35)',5);
      ctx.fillStyle=side<0?'#f1b66e':'#82e0c5';
      ctx.shadowBlur=10;ctx.shadowColor=ctx.fillStyle;
      ctx.beginPath();ctx.arc(x,302,4,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;
    });
  }

  function lunaRunDrawSpeedLines(){
    const speed=game.speed||430;if(speed<560)return;
    const strength=runClamp((speed-560)/310,0,1);
    ctx.save();ctx.globalAlpha=.12+strength*.20;ctx.strokeStyle='#d5f4ed';ctx.lineWidth=1.5;
    for(let i=0;i<15;i++){
      const x=((i*83+game.time*(210+speed*.42))%790)-35;
      const y=535+(i*67%430),length=10+strength*(18+i%4*5);
      if(x<125||x>595){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-5,y+length);ctx.stroke();}
    }
    ctx.restore();
  }
  function lunaRunDrawStationSign(){
    ctx.save();lunaRunPanel(254,284,212,39,'rgba(8,18,31,.72)','rgba(255,226,171,.42)',10);
    ctx.fillStyle=runStage().accent;ctx.font='700 11px "DM Mono",monospace';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('LUNA  /  '+runStage().name,360,304);ctx.restore();
  }
  const LUNA_RUN_METRO_IMAGE = new Image();
  let lunaRunMetroRequested = false;
  function lunaRunGetMetroImage(){
    if(!lunaRunMetroRequested){
      lunaRunMetroRequested=true;
      LUNA_RUN_METRO_IMAGE.decoding='async';
      LUNA_RUN_METRO_IMAGE.src='/assets/luna-run-metro.svg';
    }
    return LUNA_RUN_METRO_IMAGE.complete&&LUNA_RUN_METRO_IMAGE.naturalWidth
      ?LUNA_RUN_METRO_IMAGE:null;
  }
  function lunaRunDrawTrain(obstacle){
    const p=runProject(obstacle.lane,obstacle.z);
    const s=p.scale,w=206*s,h=298*s;
    const sway=Math.sin(game.time*4.2+obstacle.lane*1.7)*1.25*s;
    const x=p.x+sway,y=p.y;
    const pulse=.78+.22*Math.sin(game.time*7.5+obstacle.lane);
    const fade=runClamp((obstacle.z+.10)/.28,.58,1);
    ctx.save();
    ctx.globalAlpha=fade;
    ctx.fillStyle='rgba(2,8,15,.46)';
    ctx.beginPath();ctx.ellipse(x,y-2,w*.43,Math.max(4,12*s),0,0,Math.PI*2);ctx.fill();

    // Headlights cast a restrained beam onto the rails as the train approaches.
    const beam=ctx.createRadialGradient(x,y-h*.12,2,x,y-h*.12,w*.66);
    beam.addColorStop(0,'rgba(255,230,164,'+(0.10+pulse*.13)+')');
    beam.addColorStop(1,'rgba(255,230,164,0)');
    ctx.fillStyle=beam;ctx.fillRect(x-w*.76,y-h*.28,w*1.52,h*.44);

    const image=lunaRunGetMetroImage();
    if(image){
      ctx.shadowColor='rgba(4,13,22,.55)';
      ctx.shadowBlur=13*s;
      ctx.drawImage(image,x-w/2,y-h,w,h);
    }else{
      // Refined vector fallback while the authored metro artwork loads.
      const shell=ctx.createLinearGradient(x-w/2,y-h,x+w/2,y);
      shell.addColorStop(0,'#d0e7d9');shell.addColorStop(.24,'#56b4b0');
      shell.addColorStop(.72,'#1c6079');shell.addColorStop(1,'#0d293e');
      lunaRunPoly([[x-w*.19,y-h],[x+w*.19,y-h],[x+w*.5,y-h*.18],
        [x+w*.44,y],[x-w*.44,y],[x-w*.5,y-h*.18]],shell,'#d5e8d9',Math.max(1,3*s));
      lunaRunPanel(x-w*.35,y-h*.43,w*.7,h*.2,'#153b52','#b9dcd1',7*s);
      lunaRunPanel(x-w*.30,y-h*.40,w*.60,h*.14,'#8ac9c4','#e5f3dc',5*s);
      lunaRunPanel(x-w*.34,y-h*.13,w*.68,h*.09,'#18374a','#9ac8bd',5*s);
      ctx.fillStyle='#fff0b4';ctx.shadowBlur=14*s;ctx.shadowColor='#ffe3a0';
      ctx.beginPath();ctx.arc(x-w*.29,y-h*.08,4*s,0,Math.PI*2);
      ctx.arc(x+w*.29,y-h*.08,4*s,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function lunaRunDrawBarrier(obstacle){
    const p=runProject(obstacle.lane,obstacle.z),s=p.scale,w=132*s,h=43*s,x=p.x,y=p.y-13*s;
    ctx.save();ctx.fillStyle='rgba(4,10,17,.46)';ctx.beginPath();ctx.ellipse(x,y+h*.68,w*.62,8*s,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#44342b';ctx.fillRect(x-w*.37,y+h*.55,10*s,h*.74);ctx.fillRect(x+w*.29,y+h*.55,10*s,h*.74);
    const face=ctx.createLinearGradient(x,y-h/2,x,y+h);face.addColorStop(0,'#fff0a5');face.addColorStop(.4,'#f4bd4c');face.addColorStop(1,'#ba762d');
    lunaRunPanel(x-w/2,y,w,h,face,'#fff0b9',6*s);
    ctx.save();ctx.beginPath();ctx.roundRect(x-w/2+3*s,y+3*s,w-6*s,h-6*s,4*s);ctx.clip();
    ctx.strokeStyle='#d45447';ctx.lineWidth=Math.max(4,15*s);
    for(let k=-2;k<8;k++){ctx.beginPath();ctx.moveTo(x-w+k*w/5,y+h);ctx.lineTo(x-w+k*w/5+h,y);ctx.stroke();}
    ctx.restore();ctx.fillStyle='#fff7d3';ctx.fillRect(x-w*.4,y+5*s,w*.8,3*s);ctx.restore();
  }
  function lunaRunDrawOverhead(obstacle){
    const p=runProject(obstacle.lane,obstacle.z),s=p.scale,w=150*s,x=p.x,y=p.y,post=Math.max(3,8*s);
    ctx.save();ctx.fillStyle='rgba(3,9,17,.35)';ctx.beginPath();ctx.ellipse(x,y-2,w*.66,8*s,0,0,Math.PI*2);ctx.fill();
    const metal=ctx.createLinearGradient(x-w/2,0,x+w/2,0);
    metal.addColorStop(0,'#263c49');metal.addColorStop(.5,'#8d9690');metal.addColorStop(1,'#253c4a');
    ctx.fillStyle=metal;ctx.fillRect(x-w*.42,y-152*s,post,152*s);ctx.fillRect(x+w*.36,y-152*s,post,152*s);
    const sign=ctx.createLinearGradient(0,y-158*s,0,y-122*s);
    sign.addColorStop(0,'#ffe5a0');sign.addColorStop(1,'#c28a43');
    lunaRunPanel(x-w*.54,y-157*s,w*1.08,32*s,sign,'#fff0be',5*s);
    ctx.fillStyle='#603f28';ctx.font='900 '+Math.max(6,10*s)+'px "Space Grotesk",sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('MIND YOUR HEAD',x,y-141*s);
    ctx.fillStyle='#fff2bc';ctx.shadowBlur=12*s;ctx.shadowColor='#fff2bc';ctx.fillRect(x-w*.44,y-120*s,w*.88,3*s);ctx.restore();
  }
  function lunaRunDrawRamp(obstacle){
    const p=runProject(obstacle.lane,obstacle.z),s=p.scale,w=132*s,h=86*s,x=p.x,y=p.y;
    ctx.save();ctx.fillStyle='rgba(4,10,16,.42)';ctx.beginPath();ctx.ellipse(x,y-2,w*.6,9*s,0,0,Math.PI*2);ctx.fill();
    const ramp=ctx.createLinearGradient(x-w/2,y-h,x+w/2,y);
    ramp.addColorStop(0,'#8de0d5');ramp.addColorStop(.45,'#258fa5');ramp.addColorStop(1,'#1a4f73');
    lunaRunPoly([[x-w/2,y],[x+w/2,y],[x+w*.34,y-h],[x-w*.34,y-h]],ramp,'#b8f1e7',Math.max(1,3*s));
    ctx.strokeStyle='rgba(255,238,185,.86)';ctx.lineWidth=Math.max(1.5,3*s);
    for(let i=0;i<4;i++){const yy=y-h*(.22+i*.16);ctx.beginPath();ctx.moveTo(x-w*.26,yy);ctx.lineTo(x+w*.26,yy);ctx.stroke();}
    ctx.restore();
  }
  function lunaRunDrawObstacle(obstacle){
    if(obstacle.z<-.04)return;
    if(obstacle.type==='train')lunaRunDrawTrain(obstacle);
    else if(obstacle.type==='overhead')lunaRunDrawOverhead(obstacle);
    else if(obstacle.type==='ramp')lunaRunDrawRamp(obstacle);
    else lunaRunDrawBarrier(obstacle);
  }
  function lunaRunDrawCoin(item){
    const p=runProject(item.lane,item.z),r=(item.type==='super'?15:11)*p.scale+4;
    const spin=.30+Math.abs(Math.sin(game.time*8+item.z*7))*.70,y=p.y-43*p.scale-Math.sin(game.time*4+item.z*3)*5;
    ctx.save();ctx.translate(p.x,y);ctx.scale(spin,1);ctx.shadowBlur=18*p.scale;
    ctx.shadowColor=item.type==='super'?'#91eaff':'#ffd66c';
    const coin=ctx.createLinearGradient(-r,-r,r,r);
    coin.addColorStop(0,'#fff8d1');coin.addColorStop(.45,item.type==='super'?'#73dff1':'#ffc747');
    coin.addColorStop(1,item.type==='super'?'#2e8ca7':'#c57b29');
    ctx.fillStyle=coin;ctx.strokeStyle='#fff2bb';ctx.lineWidth=Math.max(1,2*p.scale);
    ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
    ctx.fillStyle=item.type==='super'?'#e8ffff':'#fff3bd';
    ctx.font='900 '+Math.max(8,r*1.2)+'px "Space Grotesk",sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(item.type==='super'?'✦':'☾',0,1);ctx.restore();
  }
  function lunaRunDrawPickup(item){
    const p=runProject(item.lane,item.z),data=RUN_ITEMS[item.type]||RUN_ITEMS.mystery,size=25*p.scale+8;
    const y=p.y-62*p.scale+Math.sin(game.time*3+item.z*4)*5;
    ctx.save();ctx.translate(p.x,y);ctx.rotate(Math.sin(game.time*1.8+item.z*5)*.08);
    ctx.shadowBlur=22*p.scale;ctx.shadowColor=data.color;
    const box=ctx.createLinearGradient(-size,-size,size,size);
    box.addColorStop(0,'#fff');box.addColorStop(.33,data.color);box.addColorStop(1,'#182b46');
    lunaRunPanel(-size,-size,size*2,size*2,box,'rgba(255,255,255,.9)',8*p.scale+3);
    lunaRunPanel(-size*.62,-size*.62,size*1.24,size*1.24,'rgba(13,25,42,.72)','rgba(255,255,255,.36)',5*p.scale+2);
    ctx.fillStyle='#fff';ctx.font='900 '+Math.max(10,18*p.scale)+'px "Space Grotesk",sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(data.mark,0,1);ctx.restore();
  }
  function lunaRunLimb(x1,y1,x2,y2,width,color,highlight){
    ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='rgba(7,13,22,.42)';ctx.lineWidth=width+7;
    ctx.beginPath();ctx.moveTo(x1+2,y1+3);ctx.lineTo(x2+2,y2+3);ctx.stroke();
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    if(highlight){ctx.strokeStyle=highlight;ctx.lineWidth=Math.max(2,width*.18);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
  }
  function lunaRunDrawHero(index,x,groundY,scale,phase,sliding,jumping,jet,board,invulnerable,groundShadowY,groundShadowScale){
    const hero=RUN_HEROES[index]||RUN_HEROES[0],stride=Math.sin(phase||0),swing=Math.cos(phase||0);
    const shadowY=Number.isFinite(groundShadowY)?groundShadowY:groundY;
    const shadowScale=Number.isFinite(groundShadowScale)?runClamp(groundShadowScale,.38,1):1;
    const laneDrift=runClamp((game.targetLane===undefined?(game.lane||1):game.targetLane)-(game.laneVisual===undefined?(game.lane||1):game.laneVisual),-1,1);
    const jumpTilt=jumping?runClamp(-(game.jumpV||0)/6200,-.12,.12):0;
    const lean=laneDrift*.13+jumpTilt;
    const bob=jumping?Math.sin((phase||0)*2)*2.8:Math.abs(Math.sin((phase||0)*2))*5.2;
    ctx.save();ctx.globalAlpha=.72;ctx.fillStyle='rgba(4,9,17,.44)';
    ctx.beginPath();ctx.ellipse(x,shadowY+5,(42+(jumping?12:0))*shadowScale,10*shadowScale,0,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.save();ctx.translate(x,groundY-bob);ctx.rotate(lean);
    ctx.scale(scale,scale*(sliding?.66:1));if(sliding)ctx.translate(0,49);
    if(!jumping&&!sliding&&game.runnerMode==='run'){
      ctx.save();ctx.globalAlpha=.14+.08*Math.sin((phase||0)*2);
      ctx.fillStyle=hero.accent;ctx.beginPath();ctx.ellipse(-42-7*stride,-3,7,2.2,-.18,0,Math.PI*2);
      ctx.ellipse(40+7*stride,-2,6,1.8,.16,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    if(board){
      ctx.save();ctx.shadowBlur=18;ctx.shadowColor='#65e8ff';
      lunaRunPanel(-48,-8,96,13,'#173f57','#8df4ff',7);lunaRunPanel(-35,-6,70,5,'#4de1ee','#e0ffff',3);
      ctx.fillStyle='#182b3b';ctx.beginPath();ctx.arc(-29,7,8,0,Math.PI*2);ctx.arc(29,7,8,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    if(jet){
      for(let i=-1;i<=1;i++){
        const flame=24+( .72+.28*Math.sin(game.time*24+i*2))*22;
        const fire=ctx.createLinearGradient(0,-65,0,-65+flame);
        fire.addColorStop(0,'#fff5c6');fire.addColorStop(.45,'#ffb44e');fire.addColorStop(1,'rgba(247,83,64,0)');
        ctx.fillStyle=fire;ctx.beginPath();ctx.moveTo(i*13-5,-67);
        ctx.quadraticCurveTo(i*13-9,-43+flame*.35,i*13,-67+flame);
        ctx.quadraticCurveTo(i*13+9,-43+flame*.35,i*13+5,-67);ctx.fill();
      }
      lunaRunPanel(-31,-125,62,58,'#b45f3f','#f5c27d',12);
    }

    lunaRunPanel(19,-133,32,54,hero.pack,'rgba(255,255,255,.26)',9);
    ctx.fillStyle=hero.scarf;ctx.beginPath();ctx.moveTo(-17,-132);
    ctx.bezierCurveTo(-43,-147-15*stride,-58,-128+10*stride,-83,-115+15*stride);
    ctx.lineTo(-73,-104+12*stride);ctx.bezierCurveTo(-55,-111+10*stride,-38,-106-10*stride,-15,-113);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.34)';ctx.lineWidth=2;ctx.stroke();
    const leftElbow={x:-34-15*stride,y:-105+8*swing},rightElbow={x:34+15*stride,y:-105-8*swing};
    const leftHand={x:-43-22*stride,y:-79+12*swing},rightHand={x:43+22*stride,y:-79-12*swing};
    lunaRunLimb(-23,-125,leftElbow.x,leftElbow.y,15,hero.body,hero.shine);
    lunaRunLimb(leftElbow.x,leftElbow.y,leftHand.x,leftHand.y,12,hero.body,hero.shine);
    lunaRunLimb(23,-125,rightElbow.x,rightElbow.y,15,hero.body,hero.shine);
    lunaRunLimb(rightElbow.x,rightElbow.y,rightHand.x,rightHand.y,12,hero.body,hero.shine);
    ctx.fillStyle=hero.skin;ctx.beginPath();ctx.arc(leftHand.x,leftHand.y,8.5,0,Math.PI*2);
    ctx.arc(rightHand.x,rightHand.y,8.5,0,Math.PI*2);ctx.fill();

    const jacket=ctx.createLinearGradient(-26,-145,27,-63);
    jacket.addColorStop(0,hero.shine);jacket.addColorStop(.42,hero.body);jacket.addColorStop(1,hero.dark);
    lunaRunPanel(-27,-143,54,79,jacket,'rgba(255,255,255,.38)',13);
    lunaRunPanel(-20,-133,40,34,'rgba(255,255,255,.10)','rgba(255,255,255,.12)',7);
    ctx.fillStyle=hero.accent;ctx.fillRect(-3,-138,6,66);
    ctx.fillStyle=hero.scarf;ctx.beginPath();ctx.moveTo(-26,-138);ctx.lineTo(0,-126);ctx.lineTo(25,-138);
    ctx.lineTo(17,-120);ctx.lineTo(0,-113);ctx.lineTo(-17,-120);ctx.closePath();ctx.fill();

    const leftKnee={x:-21-25*stride,y:-39-13*Math.max(0,swing)},rightKnee={x:21+25*stride,y:-39-13*Math.max(0,-swing)};
    const leftAnkle={x:-29+27*stride,y:-10-17*Math.max(0,swing)},rightAnkle={x:29-27*stride,y:-10-17*Math.max(0,-swing)};
    lunaRunLimb(-12,-69,leftKnee.x,leftKnee.y,19,hero.dark,'rgba(255,255,255,.13)');
    lunaRunLimb(leftKnee.x,leftKnee.y,leftAnkle.x,leftAnkle.y,14,hero.body,hero.shine);
    lunaRunLimb(12,-69,rightKnee.x,rightKnee.y,19,hero.dark,'rgba(255,255,255,.13)');
    lunaRunLimb(rightKnee.x,rightKnee.y,rightAnkle.x,rightAnkle.y,14,hero.body,hero.shine);
    [[leftAnkle.x,leftAnkle.y,stride],[rightAnkle.x,rightAnkle.y,-stride]].forEach(([sx,sy,footPhase])=>{
      ctx.save();ctx.translate(sx,sy);ctx.rotate(-footPhase*.20);
      lunaRunPanel(-17,-7,34,15,hero.accent,'rgba(255,255,255,.62)',6);
      lunaRunPanel(-12,-10,22,5,'#fff4d9','rgba(255,255,255,.25)',3);
      ctx.restore();
    });
    ctx.save();ctx.translate(0,-169);ctx.rotate(stride*.035+laneDrift*.045);ctx.translate(0,169);
    ctx.fillStyle=hero.skin;ctx.beginPath();ctx.ellipse(0,-169,25,29,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=hero.hair;ctx.beginPath();ctx.moveTo(-26,-173);ctx.quadraticCurveTo(-31,-205,-5,-211);
    ctx.quadraticCurveTo(25,-212,29,-184);ctx.lineTo(22,-170);ctx.quadraticCurveTo(8,-187,0,-177);
    ctx.quadraticCurveTo(-12,-188,-26,-173);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(-22,-188);ctx.lineTo(-33,-178);ctx.lineTo(-19,-176);ctx.closePath();
    ctx.moveTo(20,-189);ctx.lineTo(32,-178);ctx.lineTo(17,-177);ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.18)';ctx.beginPath();ctx.ellipse(-9,-197,10,4,-.25,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#352b38';ctx.beginPath();ctx.ellipse(-9,-169,3,4,0,0,Math.PI*2);ctx.ellipse(9,-169,3,4,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(92,48,52,.65)';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(-5,-157);ctx.quadraticCurveTo(0,-154,5,-157);ctx.stroke();
    lunaRunPanel(-22,-198,44,6,hero.accent,null,3);
    ctx.restore();
    if(invulnerable){
      ctx.strokeStyle='rgba(170,239,255,.78)';ctx.lineWidth=3;ctx.shadowBlur=18;ctx.shadowColor='#8deaff';
      ctx.beginPath();ctx.ellipse(0,-102,54,115,0,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();
  }
  function lunaRunDrawHUD(){
    ctx.save();
    lunaRunPanel(18,18,176,88,'rgba(9,20,34,.84)','rgba(220,236,231,.18)',15);
    lunaRunPanel(526,18,176,88,'rgba(9,20,34,.84)','rgba(220,236,231,.18)',15);
    lunaRunPanel(207,18,306,88,'rgba(9,20,34,.76)','rgba(220,236,231,.14)',15);
    lunaRunText('SCORE',36,41,10,'#a9c1cb','left','"DM Mono",monospace');
    lunaRunText(Number(score||0).toLocaleString('en-IN'),36,76,25,'#fff2dc','left');
    lunaRunText('PERSONAL BEST',544,41,9,'#a9c1cb','left','"DM Mono",monospace');
    lunaRunText(Number(Math.max(game.runnerBest||0,score||0)).toLocaleString('en-IN'),544,76,23,'#ffdc99','left');
    lunaRunText('LUNA RUN',360,41,14,'#f7e9d0','center');
    lunaRunText(runStage().name,360,62,9,runStage().accent,'center','"DM Mono",monospace');
    lunaRunPanel(247,78,226,10,'rgba(255,255,255,.12)',null,5);
    const ratio=runClamp((game.speed||430)/870,0,1),speed=ctx.createLinearGradient(247,0,473,0);
    speed.addColorStop(0,'#67d8c1');speed.addColorStop(1,'#f4c46e');lunaRunPanel(247,78,226*ratio,10,speed,null,5);
    lunaRunPanel(24,118,164,38,'rgba(8,19,32,.78)','rgba(244,216,169,.22)',11);
    ctx.fillStyle='#ffd36d';ctx.beginPath();ctx.arc(45,137,8,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff4d2';ctx.font='900 12px "Space Grotesk"';ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.fillText('× '+Number(coins||0).toLocaleString('en-IN'),61,137);
    ctx.fillStyle='#b7d8e0';ctx.font='700 10px "DM Mono",monospace';ctx.fillText('KEYS '+Number(game.runnerKeys||0),124,137);
    const active=[];
    Object.keys(RUN_ITEMS).forEach(key=>{if(game.runnerEffects&&game.runnerEffects[key]>0)active.push({data:RUN_ITEMS[key],remaining:game.runnerEffects[key]});});
    active.slice(0,4).forEach((item,index)=>{
      const x=720-24-(index+1)*58;
      lunaRunPanel(x,118,51,34,'rgba(8,19,32,.8)',item.data.color,10);
      lunaRunText(item.data.mark,x+25.5,135,10,'#fff','center');
      ctx.fillStyle=item.data.color;ctx.fillRect(x+7,148,37*runClamp(item.remaining/item.data.duration,0,1),2);
    });
    ctx.restore();
  }
  function lunaRunDrawSelect(){
    lunaRunDrawBackdrop();lunaRunDrawTracks();ctx.fillStyle='rgba(5,13,26,.66)';ctx.fillRect(0,0,W,H);
    ctx.save();
    lunaRunText('LUNA RUN',360,126,38,'#fff1d9','center');
    lunaRunText('CHOOSE YOUR RUNNER',360,190,12,'#d7e1ec','center','"DM Mono",monospace');
    lunaRunText('THREE RUNNERS  /  ONE CITY AFTER DARK',360,220,8,'#9cb6c1','center','"DM Mono",monospace');
    RUN_HEROES.forEach((hero,index)=>{
      const x=22+index*232,y=282,w=212,h=382,selected=index===game.heroIndex;
      const card=ctx.createLinearGradient(x,y,x+w,y+h);
      card.addColorStop(0,selected?'rgba(35,70,91,.96)':'rgba(14,28,46,.94)');card.addColorStop(1,'rgba(9,17,31,.96)');
      lunaRunPanel(x,y,w,h,card,selected?hero.accent:'rgba(218,231,238,.18)',16);
      if(selected){ctx.save();ctx.shadowBlur=18;ctx.shadowColor=hero.accent;ctx.strokeStyle=hero.accent;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x+5,y+5,w-10,h-10,13);ctx.stroke();ctx.restore();}
      lunaRunPanel(x+15,y+17,w-30,32,'rgba(255,255,255,.07)',null,8);
      lunaRunText('0'+(index+1),x+31,y+33,9,hero.accent,'left','"DM Mono",monospace');
      lunaRunText(hero.name,x+w/2,y+76,17,'#fff2dc','center');
      lunaRunText(hero.tag,x+w/2,y+99,7,'#a9c2cf','center','"DM Mono",monospace');
      lunaRunDrawHero(index,x+w/2,y+284,.76,game.time*2+index,false,false,false,false,false);
      lunaRunPanel(x+17,y+334,w-34,31,selected?'rgba(244,212,150,.20)':'rgba(255,255,255,.06)',null,8);
      lunaRunText(selected?'SELECTED':'TAP TO SELECT',x+w/2,y+349,8,selected?hero.accent:'#b5c6d2','center','"DM Mono",monospace');
    });
    lunaRunPanel(175,722,370,126,'rgba(8,19,34,.82)','rgba(240,220,184,.28)',18);
    const start=ctx.createLinearGradient(190,744,530,824);
    start.addColorStop(0,'#f6d596');start.addColorStop(1,'#df9d65');
    lunaRunPanel(193,742,334,70,start,'#fff0c9',14);
    lunaRunText('START RUN',360,778,17,'#1b2635','center');
    lunaRunText('SWIPE TO CHANGE TRACKS  ·  UP TO JUMP  ·  DOWN TO SLIDE',360,826,7,'#c4d2da','center','"DM Mono",monospace');
    ctx.restore();
  }
  function lunaRunDrawOverlay(title,subtitle,primary,secondary){
    ctx.save();ctx.fillStyle='rgba(4,10,20,.73)';ctx.fillRect(0,0,W,H);
    ctx.shadowBlur=36;ctx.shadowColor='rgba(0,0,0,.36)';
    const card=ctx.createLinearGradient(120,325,600,690);
    card.addColorStop(0,'rgba(24,43,64,.98)');card.addColorStop(1,'rgba(9,19,34,.98)');
    lunaRunPanel(105,326,510,368,card,'rgba(226,236,234,.28)',22);ctx.shadowBlur=0;
    lunaRunPanel(310,350,100,4,runStage().accent,null,2);
    lunaRunText(title,360,408,31,'#fff0d7','center');
    lunaRunText(subtitle,360,454,12,'#bccbd6','center','"DM Mono",monospace');
    const button=ctx.createLinearGradient(175,510,545,590);
    button.addColorStop(0,'#f7d99d');button.addColorStop(1,'#e2aa70');
    lunaRunPanel(175,510,370,78,button,'rgba(255,245,211,.75)',15);
    lunaRunText(primary,360,549,16,'#1c2a3b','center');
    if(secondary){lunaRunPanel(175,615,370,66,'rgba(255,255,255,.07)','rgba(229,237,241,.38)',13);lunaRunText(secondary,360,648,12,'#f0e7d8','center','"DM Mono",monospace');}
    ctx.restore();
  }
  function lunaRunDrawHeroBack(index,x,groundY,scale,phase,sliding,jumping,jet,board,invulnerable,groundShadowY,groundShadowScale){
    const hero=RUN_HEROES[index]||RUN_HEROES[0];
    const gait=Math.sin(phase||0),swing=Math.cos(phase||0);
    const shadowY=Number.isFinite(groundShadowY)?groundShadowY:groundY;
    const shadowScale=Number.isFinite(groundShadowScale)?runClamp(groundShadowScale,.36,1):1;
    const laneDrift=runClamp((game.targetLane??game.laneVisual??1)-(game.laneVisual??1),-1,1);
    const bob=jumping?Math.sin((phase||0)*2)*2.4:Math.abs(Math.sin((phase||0)*2))*4.2;
    ctx.save();ctx.globalAlpha=.62;ctx.fillStyle='rgba(2,8,15,.55)';
    ctx.beginPath();ctx.ellipse(x,shadowY+5,44*shadowScale,11*shadowScale,0,0,Math.PI*2);ctx.fill();ctx.restore();

    ctx.save();
    ctx.translate(x,groundY-bob);
    ctx.rotate(laneDrift*.10+(jumping?runClamp(-(game.jumpV||0)/6800,-.10,.10):0));
    ctx.scale(scale,scale*(sliding?.62:1));
    if(sliding)ctx.translate(0,52);

    // Hoverboard and jet exhaust sit behind the runner's silhouette.
    if(board){
      ctx.save();ctx.shadowBlur=15;ctx.shadowColor='#63e7fa';
      lunaRunPoly([[-51,-2],[-35,-12],[37,-12],[52,-1],[40,8],[-40,8]],
        '#1a5168','#9af6ff',3);
      ctx.fillStyle='#132a3a';
      [-31,31].forEach(wx=>{ctx.beginPath();ctx.arc(wx,8,7,0,Math.PI*2);ctx.fill()});
      ctx.restore();
    }
    if(jet){
      for(let i=-1;i<=1;i++){
        const flame=22+( .68+.32*Math.sin(game.time*24+i*1.7))*28;
        const fire=ctx.createLinearGradient(0,-74,0,-74+flame);
        fire.addColorStop(0,'#fff6d2');fire.addColorStop(.42,'#ffc064');
        fire.addColorStop(1,'rgba(242,75,55,0)');
        ctx.fillStyle=fire;ctx.beginPath();ctx.moveTo(i*13-5,-76);
        ctx.quadraticCurveTo(i*13-8,-48+flame*.3,i*13,-76+flame);
        ctx.quadraticCurveTo(i*13+8,-48+flame*.3,i*13+5,-76);ctx.fill();
      }
      lunaRunPanel(-30,-129,60,52,'#9c5c42','#f7c786',11);
      lunaRunPanel(-21,-121,42,34,'#354b5b','#edc17c',8);
    }

    // Arms are drawn first so shoulders naturally disappear under the jacket.
    const leftElbow={x:-35-13*gait,y:-106+8*swing};
    const rightElbow={x:35+13*gait,y:-106-8*swing};
    const leftHand={x:-43-20*gait,y:-77+13*swing};
    const rightHand={x:43+20*gait,y:-77-13*swing};
    lunaRunLimb(-22,-132,leftElbow.x,leftElbow.y,16,hero.dark,hero.shine);
    lunaRunLimb(leftElbow.x,leftElbow.y,leftHand.x,leftHand.y,12,hero.body,hero.shine);
    lunaRunLimb(22,-132,rightElbow.x,rightElbow.y,16,hero.dark,hero.shine);
    lunaRunLimb(rightElbow.x,rightElbow.y,rightHand.x,rightHand.y,12,hero.body,hero.shine);
    ctx.fillStyle=hero.skin;ctx.beginPath();
    ctx.arc(leftHand.x,leftHand.y,8.5,0,Math.PI*2);
    ctx.arc(rightHand.x,rightHand.y,8.5,0,Math.PI*2);ctx.fill();

    // A proper two-panel backpack, shoulder straps, buckles and a stitched
    // lower pocket replace the flat rectangular pack.
    ctx.save();ctx.translate(0,-2*gait);
    const pack=ctx.createLinearGradient(-28,-154,28,-68);
    pack.addColorStop(0,hero.shine);pack.addColorStop(.30,hero.pack);
    pack.addColorStop(1,hero.dark);
    lunaRunPanel(-28,-151,56,82,pack,'rgba(232,250,239,.46)',14);
    lunaRunPanel(-22,-141,44,34,'rgba(7,23,39,.28)','rgba(232,250,239,.24)',8);
    lunaRunPanel(-22,-101,44,24,hero.dark,'rgba(255,255,255,.20)',7);
    lunaRunPanel(-14,-95,28,4,hero.accent,null,2);
    ctx.strokeStyle='rgba(243,247,226,.56)';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(-21,-143);ctx.lineTo(-21,-79);
    ctx.moveTo(21,-143);ctx.lineTo(21,-79);ctx.stroke();
    ctx.fillStyle=hero.accent;ctx.fillRect(-4,-134,8,8);
    ctx.restore();

    // Jacket back: hood, shoulder yoke, seam piping and natural fabric folds.
    const jacket=ctx.createLinearGradient(-32,-151,32,-65);
    jacket.addColorStop(0,hero.shine);jacket.addColorStop(.37,hero.body);
    jacket.addColorStop(1,hero.dark);
    lunaRunPanel(-29,-145,58,82,jacket,'rgba(244,255,244,.40)',15);
    lunaRunPoly([[-25,-137],[0,-149],[25,-137],[17,-119],[0,-112],[-17,-119]],
      hero.dark,'rgba(255,255,255,.20)',1.3);
    lunaRunPoly([[-23,-135],[0,-124],[23,-135],[16,-113],[0,-106],[-16,-113]],
      hero.body,'rgba(255,255,255,.22)',1);
    ctx.strokeStyle='rgba(244,255,239,.28)';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(-20,-100);ctx.quadraticCurveTo(-8,-88,-14,-70);
    ctx.moveTo(20,-100);ctx.quadraticCurveTo(8,-88,14,-70);ctx.stroke();
    ctx.fillStyle=hero.accent;ctx.fillRect(-3,-108,6,32);
    lunaRunPanel(-14,-69,28,8,hero.dark,'rgba(255,255,255,.15)',4);

    // Two scarf tails flutter behind the shoulders.
    ctx.fillStyle=hero.scarf;ctx.strokeStyle='rgba(255,255,255,.36)';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(-17,-137);
    ctx.bezierCurveTo(-43,-153-10*gait,-57,-131+8*gait,-76,-120+12*gait);
    ctx.lineTo(-70,-108+10*gait);
    ctx.bezierCurveTo(-53,-116+6*gait,-36,-109-7*gait,-12,-119);
    ctx.closePath();ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(15,-137);
    ctx.bezierCurveTo(40,-150+8*gait,50,-128-6*gait,66,-117-10*gait);
    ctx.lineTo(59,-105-8*gait);
    ctx.bezierCurveTo(43,-111-5*gait,30,-107+6*gait,12,-119);
    ctx.closePath();ctx.fill();ctx.stroke();

    // Neck and rear-facing head. No facial features are drawn: the camera is
    // now following the runner into the station, as in a third-person chase.
    lunaRunPanel(-10,-173,20,27,hero.skin,'rgba(74,43,48,.35)',7);
    ctx.fillStyle=hero.skin;ctx.beginPath();ctx.ellipse(0,-184,24,28,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=hero.hair;
    ctx.beginPath();ctx.moveTo(-26,-185);
    ctx.quadraticCurveTo(-31,-214,-10,-219);
    ctx.quadraticCurveTo(19,-226,28,-198);
    ctx.lineTo(24,-174);ctx.quadraticCurveTo(12,-164,0,-169);
    ctx.quadraticCurveTo(-14,-162,-24,-174);ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.16)';
    ctx.beginPath();ctx.ellipse(-9,-211,11,4,-.25,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=hero.accent;ctx.lineWidth=5;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-22,-198);ctx.quadraticCurveTo(0,-189,22,-198);ctx.stroke();
    ctx.strokeStyle='rgba(255,247,224,.45)';ctx.lineWidth=1.1;
    ctx.beginPath();ctx.moveTo(-19,-197);ctx.quadraticCurveTo(0,-189,19,-197);ctx.stroke();

    if(index===0){
      // Luna's tied hair follows the run cycle with a small independent swing.
      ctx.save();ctx.rotate(gait*.09);
      ctx.fillStyle=hero.hair;ctx.beginPath();
      ctx.moveTo(14,-184);ctx.quadraticCurveTo(37,-175,32,-150);
      ctx.quadraticCurveTo(29,-135,17,-132);
      ctx.quadraticCurveTo(25,-154,12,-166);ctx.closePath();ctx.fill();
      ctx.fillStyle=hero.shine;ctx.beginPath();ctx.moveTo(22,-168);
      ctx.quadraticCurveTo(28,-151,20,-141);ctx.strokeStyle=hero.shine;ctx.lineWidth=2;ctx.stroke();ctx.restore();
    }else if(index===1){
      ctx.fillStyle=hero.hair;ctx.beginPath();
      ctx.moveTo(-24,-202);ctx.lineTo(-34,-196);ctx.lineTo(-25,-191);
      ctx.moveTo(19,-207);ctx.lineTo(31,-199);ctx.lineTo(23,-193);ctx.fill();
    }else{
      ctx.fillStyle=hero.hair;ctx.beginPath();
      ctx.moveTo(-20,-202);ctx.quadraticCurveTo(-7,-222,9,-216);
      ctx.quadraticCurveTo(25,-218,30,-198);ctx.lineTo(18,-193);
      ctx.lineTo(7,-203);ctx.lineTo(-3,-192);ctx.closePath();ctx.fill();
    }

    // Alternating knees, ankle roll and shoe soles create a readable run cycle.
    const leftKnee={x:-21-24*gait,y:-43-12*Math.max(0,swing)};
    const rightKnee={x:21+24*gait,y:-43-12*Math.max(0,-swing)};
    const leftAnkle={x:-29+25*gait,y:-12-16*Math.max(0,swing)};
    const rightAnkle={x:29-25*gait,y:-12-16*Math.max(0,-swing)};
    lunaRunLimb(-12,-69,leftKnee.x,leftKnee.y,18,hero.dark,'rgba(255,255,255,.12)');
    lunaRunLimb(leftKnee.x,leftKnee.y,leftAnkle.x,leftAnkle.y,14,hero.body,hero.shine);
    lunaRunLimb(12,-69,rightKnee.x,rightKnee.y,18,hero.dark,'rgba(255,255,255,.12)');
    lunaRunLimb(rightKnee.x,rightKnee.y,rightAnkle.x,rightAnkle.y,14,hero.body,hero.shine);
    [[leftAnkle.x,leftAnkle.y,gait],[rightAnkle.x,rightAnkle.y,-gait]].forEach(([sx,sy,turn])=>{
      ctx.save();ctx.translate(sx,sy);ctx.rotate(-turn*.17);
      lunaRunPanel(-18,-8,36,16,hero.dark,'rgba(255,255,255,.42)',6);
      lunaRunPanel(-15,-11,30,7,hero.accent,'rgba(255,255,255,.36)',4);
      ctx.fillStyle='#f6f0df';ctx.fillRect(-11,-3,22,2);
      ctx.restore();
    });
    if(invulnerable){
      ctx.strokeStyle='rgba(151,238,255,.72)';ctx.lineWidth=3;
      ctx.shadowBlur=16;ctx.shadowColor='#8deaff';
      ctx.beginPath();ctx.ellipse(0,-106,55,116,0,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();
  }

  function drawSubwayRunner(){
    if(game.runnerMode==='select'){
      if(window.LunaRun3D)window.LunaRun3D.hide();
      lunaRunDrawSelect();
      return;
    }
    const renderer=window.LunaRun3D;
    const rendered=renderer&&renderer.render({
      stage:game.runnerStage||0,
      time:game.time||0,
      speed:game.speed||430,
      distance:game.runnerDistance||0,
      lane:game.laneVisual===undefined?1:game.laneVisual,
      targetLane:game.targetLane===undefined?1:game.targetLane,
      jump:game.jump||0,
      slide:game.slide||0,
      rideT:game.rideT||0,
      effects:game.runnerEffects||{},
      hero:RUN_HEROES[game.heroIndex]||RUN_HEROES[0],
      obstacles:game.obstacles||[],
      pickups:game.pickups||[],
      runnerInvul:game.runnerInvul||0,
      shake:game.runnerShake||0,
      flash:game.runnerFlash||0,
      coins:coins,
      mode:game.runnerMode
    });
    if(!rendered){
      const shake=game.runnerShake||0;
      const laneSway=runClamp((game.targetLane??1)-(game.laneVisual??1),-1,1);
      ctx.save();
      ctx.translate((shake?Math.sin(game.time*47)*shake:0)+laneSway*3.5,shake?Math.cos(game.time*39)*shake*.55:0);
      ctx.rotate(laneSway*.0025);
      lunaRunDrawBackdrop();lunaRunDrawStationArchitecture();lunaRunDrawTracks();lunaRunDrawStationSign();lunaRunDrawSpeedLines();
      game.pickups.filter(item=>item.type==='coin'||item.type==='super').slice().sort((a,b)=>a.z-b.z).forEach(lunaRunDrawCoin);
      game.pickups.filter(item=>item.type!=='coin'&&item.type!=='super').slice().sort((a,b)=>a.z-b.z).forEach(lunaRunDrawPickup);
      game.obstacles.slice().sort((a,b)=>a.z-b.z).forEach(lunaRunDrawObstacle);
      const lane=game.laneVisual===undefined?1:game.laneVisual,track=runProject(lane,.965);
      const lift=(game.jump||0)*.85+(game.runnerEffects&&game.runnerEffects.jet>0?125:0)+(game.rideT>0?105:0);
      lunaRunDrawFX();
      lunaRunDrawHeroBack(game.heroIndex,track.x,track.y-7-lift,Math.max(.94,track.scale*.88),game.time*13,
        game.slide>0,game.jump>30||game.rideT>0,
        !!(game.runnerEffects&&game.runnerEffects.jet>0),
        !!(game.runnerEffects&&game.runnerEffects.board>0),game.runnerInvul>0,track.y-7,Math.max(.36,1-lift/250));
      if(game.runnerFlash>0){ctx.fillStyle='rgba(255,224,195,'+(game.runnerFlash*.30)+')';ctx.fillRect(0,0,W,H);}
      ctx.restore();
    }else{
      ctx.clearRect(0,0,W,H);
      lunaRunDrawFX();
      if(game.runnerFlash>0){ctx.fillStyle='rgba(255,224,195,'+(game.runnerFlash*.30)+')';ctx.fillRect(0,0,W,H);}
    }
    lunaRunDrawHUD();
    if(game.runnerMode==='paused')lunaRunDrawOverlay('PAUSED','Your run is paused.','RESUME',null);
    else if(game.runnerMode==='over'){
      lunaRunDrawOverlay(game.runnerKeys>0?'RUN INTERRUPTED':'RUN COMPLETE',
        game.runnerKeys>0?'Use one Luna Key to continue?':'Distance '+Math.floor(game.runnerDistance/10)+'  ·  Coins '+coins,
        game.runnerKeys>0?'CONTINUE  /  '+game.runnerKeys+' KEY':'TRY AGAIN',
        game.runnerKeys>0?'END RUN  /  START OVER':null);
    }
  }

  // Telegram BotFather short names map to the internal GameZone IDs.
  // Keep internal slugs working too, so normal website links remain compatible.
  const TELEGRAM_GAME_ALIASES = {
    luna_flappy: 'flappy',
    luna_run: 'runner',
    luna_sky_jumper: 'jumper',
    luna_star_defender: 'space',
    luna_neon_race: 'racer'
  };
  try {
    const rawGame = new URLSearchParams(window.location.search).get('game');
    const requestedGame = Object.prototype.hasOwnProperty.call(games, rawGame)
      ? rawGame
      : TELEGRAM_GAME_ALIASES[rawGame];
    if (requestedGame === 'racer') {
      window.location.replace('/racer.html');
    } else if (requestedGame) {
      openGame(requestedGame);
      startGame();
    }
  } catch (error) {
    console.warn('Luna direct game launch could not start:', error);
  }

  })();
