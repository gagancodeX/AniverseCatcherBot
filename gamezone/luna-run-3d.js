/* Luna Run WebGL renderer.
 * Isolated 3D presentation layer; gameplay, scoring and Telegram input remain in gamezone.js.
 * Reference inspiration: adhithyaarun/subway_surfers (MIT); see THIRD_PARTY_LICENSES.md.
 */
(function () {
  'use strict';
  const gameCanvas=document.getElementById('gameCanvas');
  if(!gameCanvas)return;
  let canvas=null,gl=null,program=null,ready=false,failed=false,meshes={},uniforms={},attributes={},observer=null,lastTheme=-1;
  const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const themes=[
    {sky:'linear-gradient(180deg,#30205f 0%,#8d4d79 42%,#f2b77c 100%)',fog:'#c18e9b',accent:'#ffe0a0',train:'#287c87',ground:'#52685a',lamp:'#ffd797'},
    {sky:'linear-gradient(180deg,#101b43 0%,#3c3975 46%,#b65b92 100%)',fog:'#62527d',accent:'#75e7ff',train:'#286b98',ground:'#35475d',lamp:'#91eaff'},
    {sky:'linear-gradient(180deg,#129bd0 0%,#75d9ca 48%,#e7f6bc 100%)',fog:'#a2d8cf',accent:'#fff0a2',train:'#278d8b',ground:'#5c8062',lamp:'#fff0ae'},
    {sky:'linear-gradient(180deg,#302052 0%,#68668f 48%,#c5b8d8 100%)',fog:'#93849d',accent:'#f3a6d4',train:'#695d8f',ground:'#455c60',lamp:'#ffd4ed'}
  ];
  function hexColor(value){
    const s=String(value||'#ffffff').replace('#','');
    const n=parseInt(s.length===3?s.split('').map(ch=>ch+ch).join(''):s,16);
    if(!Number.isFinite(n))return [1,1,1];
    return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255];
  }
  function shader(type,source){
    const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(sh)||'Shader compilation failed';gl.deleteShader(sh);throw new Error(message);}
    return sh;
  }
  function createProgram(){
    const vsSource=[
      'attribute vec3 aPosition;','attribute vec3 aNormal;',
      'uniform mat4 uMvp;','uniform mat4 uModelView;','uniform mat4 uModel;',
      'varying vec3 vNormal;','varying vec3 vViewPosition;','varying vec3 vWorldPosition;',
      'void main(void){',
      'vec4 viewPosition=uModelView*vec4(aPosition,1.0);',
      'vViewPosition=viewPosition.xyz;vNormal=normalize(mat3(uModelView)*aNormal);',
      'vWorldPosition=(uModel*vec4(aPosition,1.0)).xyz;',
      'gl_Position=uMvp*vec4(aPosition,1.0);','}'
    ].join('\n');
    const fsSource=[
      'precision mediump float;','uniform vec3 uColor;','uniform vec3 uFogColor;',
      'uniform float uEmission;','uniform float uMetal;','uniform float uPattern;',
      'varying vec3 vNormal;','varying vec3 vViewPosition;','varying vec3 vWorldPosition;',
      'float hash31(vec3 p){p=fract(p*0.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}',
      'void main(void){',
      'vec3 N=normalize(vNormal);vec3 L=normalize(vec3(-0.42,0.83,0.36));vec3 V=normalize(-vViewPosition);',
      'float diffuse=max(dot(N,L),0.0);float rim=pow(1.0-max(dot(N,V),0.0),3.0);',
      'vec3 H=normalize(L+V);float specular=pow(max(dot(N,H),0.0),mix(18.0,58.0,uMetal));',
      'vec3 base=uColor;',
      'if(uPattern>1.5&&uPattern<2.5){float grain=hash31(floor(vWorldPosition*43.0));base*=0.84+grain*0.24;}',
      'else if(uPattern>0.5&&uPattern<1.5){float seam=step(0.965,fract(vWorldPosition.z*0.22));base=mix(base,base*0.70,seam*0.45);}',
      'else if(uPattern>2.5){float panel=step(0.985,fract(vWorldPosition.x*0.52));base=mix(base,base*0.76,panel*0.55);}',
      'vec3 lit=base*(0.27+diffuse*0.76)+vec3(0.72,0.86,1.0)*specular*(0.10+uMetal*0.25);',
      'lit+=base*uEmission+vec3(0.22,0.38,0.55)*rim*0.12;',
      'float fog=smoothstep(31.0,78.0,length(vViewPosition));gl_FragColor=vec4(mix(lit,uFogColor,fog),1.0);','}'
    ].join('\n');
    const vs=shader(gl.VERTEX_SHADER,vsSource),fs=shader(gl.FRAGMENT_SHADER,fsSource),p=gl.createProgram();
    gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'Program link failed');
    gl.deleteShader(vs);gl.deleteShader(fs);return p;
  }
  function makeMesh(positions,normals){
    const pb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(positions),gl.STATIC_DRAW);
    const nb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,nb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(normals),gl.STATIC_DRAW);
    return {position:pb,normal:nb,count:positions.length/3};
  }
  function cubeMeshData(){
    const p=[],n=[],faces=[
      [[0,0,1],[[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]]],
      [[0,0,-1],[[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]]],
      [[1,0,0],[[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]]],
      [[-1,0,0],[[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]]],
      [[0,1,0],[[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]]],
      [[0,-1,0],[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]]
    ],order=[0,1,2,0,2,3];
    faces.forEach(face=>order.forEach(i=>{p.push(...face[1][i]);n.push(...face[0]);}));
    return {p,n};
  }
  function makeSphere(){
    const p=[],n=[],lat=20,lon=28;
    for(let y=0;y<lat;y++)for(let x=0;x<lon;x++){
      const a0=Math.PI*y/lat-Math.PI/2,a1=Math.PI*(y+1)/lat-Math.PI/2,b0=2*Math.PI*x/lon,b1=2*Math.PI*(x+1)/lon;
      const point=(a,b)=>[Math.cos(a)*Math.cos(b),Math.sin(a),Math.cos(a)*Math.sin(b)];
      const q=[point(a0,b0),point(a1,b0),point(a1,b1),point(a0,b1)];
      [0,1,2,0,2,3].forEach(i=>{p.push(...q[i]);n.push(...q[i]);});
    }return makeMesh(p,n);
  }
  function makeCylinder(){
    const p=[],n=[],segments=16;
    for(let i=0;i<segments;i++){
      const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
      const p0=[Math.cos(a),-.5,Math.sin(a)],p1=[Math.cos(b),-.5,Math.sin(b)],p2=[Math.cos(b),.5,Math.sin(b)],p3=[Math.cos(a),.5,Math.sin(a)];
      const n0=[Math.cos(a),0,Math.sin(a)],n1=[Math.cos(b),0,Math.sin(b)];
      [[p0,n0],[p2,n1],[p1,n1],[p0,n0],[p3,n0],[p2,n1]].forEach(v=>{p.push(...v[0]);n.push(...v[1]);});
      p.push(0,-.5,0,...p0,...p1);n.push(0,-1,0,0,-1,0,0,-1,0);
      p.push(0,.5,0,...p2,...p3);n.push(0,1,0,0,1,0,0,1,0);
    }return makeMesh(p,n);
  }
  function makeTorus(){
    const p=[],n=[],major=.38,tube=.085,radial=9,tubular=28;
    for(let i=0;i<tubular;i++)for(let j=0;j<radial;j++){
      const u=i/tubular*Math.PI*2,v=j/radial*Math.PI*2,u1=(i+1)/tubular*Math.PI*2,v1=(j+1)/radial*Math.PI*2;
      const point=(a,b)=>[(major+tube*Math.cos(b))*Math.cos(a),(major+tube*Math.cos(b))*Math.sin(a),tube*Math.sin(b)];
      const normal=(a,b)=>[Math.cos(b)*Math.cos(a),Math.cos(b)*Math.sin(a),Math.sin(b)];
      const q=[point(u,v),point(u1,v),point(u1,v1),point(u,v1)],nn=[normal(u,v),normal(u1,v),normal(u1,v1),normal(u,v1)];
      [0,1,2,0,2,3].forEach(k=>{p.push(...q[k]);n.push(...nn[k]);});
    }return makeMesh(p,n);
  }
  function makeBoxBatch(boxes){
    const base=cubeMeshData(),p=[],n=[];
    boxes.forEach(b=>{for(let i=0;i<base.p.length;i+=3){
      p.push(base.p[i]*b.w+b.x,base.p[i+1]*b.h+b.y,base.p[i+2]*b.d+b.z);
      n.push(base.n[i],base.n[i+1],base.n[i+2]);
    }});return makeMesh(p,n);
  }
  function matIdentity(){return new Float32Array(identity);}
  function multiply(a,b){
    const o=new Float32Array(16);
    for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
    return o;
  }
  function translate(x,y,z){const m=matIdentity();m[12]=x;m[13]=y;m[14]=z;return m;}
  function scale(x,y,z){const m=matIdentity();m[0]=x;m[5]=y;m[10]=z;return m;}
  function rotateX(a){const m=matIdentity(),c=Math.cos(a),s=Math.sin(a);m[5]=c;m[6]=s;m[9]=-s;m[10]=c;return m;}
  function rotateY(a){const m=matIdentity(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m;}
  function rotateZ(a){const m=matIdentity(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[1]=s;m[4]=-s;m[5]=c;return m;}
  function compose(x,y,z,sx,sy,sz,rx,ry,rz){
    let m=translate(x,y,z);if(ry)m=multiply(m,rotateY(ry));if(rx)m=multiply(m,rotateX(rx));if(rz)m=multiply(m,rotateZ(rz));
    return multiply(m,scale(sx,sy,sz));
  }
  function perspective(fov,aspect,near,far){
    const f=1/Math.tan(fov/2),nf=1/(near-far),o=new Float32Array(16);
    o[0]=f/aspect;o[5]=f;o[10]=(far+near)*nf;o[11]=-1;o[14]=2*far*near*nf;return o;
  }
  function normalize(v){const l=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l];}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function lookAt(eye,center,up){
    const z=normalize([eye[0]-center[0],eye[1]-center[1],eye[2]-center[2]]),x=normalize(cross(up,z)),y=cross(z,x),o=matIdentity();
    o[0]=x[0];o[1]=y[0];o[2]=z[0];o[4]=x[1];o[5]=y[1];o[6]=z[1];o[8]=x[2];o[9]=y[2];o[10]=z[2];
    o[12]=-dot(x,eye);o[13]=-dot(y,eye);o[14]=-dot(z,eye);return o;
  }
  function ensureCanvas(){
    if(failed)return false;if(ready)return true;
    try{
      canvas=document.createElement('canvas');canvas.className='luna-run-3d-canvas';canvas.setAttribute('aria-hidden','true');
      canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:none;pointer-events:none;z-index:1;background:#263b54;';
      const stage=gameCanvas.parentElement;if(!stage)return false;
      if(getComputedStyle(stage).position==='static')stage.style.position='relative';
      stage.insertBefore(canvas,gameCanvas);gameCanvas.style.position='relative';gameCanvas.style.zIndex='2';gameCanvas.style.background='transparent';
      gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,stencil:false,powerPreference:'high-performance',preserveDrawingBuffer:false})
        ||canvas.getContext('experimental-webgl',{alpha:true,antialias:true,depth:true});
      if(!gl)throw new Error('WebGL is unavailable in this Telegram WebView');
      program=createProgram();attributes.position=gl.getAttribLocation(program,'aPosition');attributes.normal=gl.getAttribLocation(program,'aNormal');
      uniforms.mvp=gl.getUniformLocation(program,'uMvp');uniforms.modelView=gl.getUniformLocation(program,'uModelView');uniforms.model=gl.getUniformLocation(program,'uModel');
      uniforms.color=gl.getUniformLocation(program,'uColor');uniforms.fog=gl.getUniformLocation(program,'uFogColor');uniforms.emission=gl.getUniformLocation(program,'uEmission');
      uniforms.metal=gl.getUniformLocation(program,'uMetal');uniforms.pattern=gl.getUniformLocation(program,'uPattern');
      const cube=cubeMeshData();meshes.cube=makeMesh(cube.p,cube.n);meshes.sphere=makeSphere();meshes.cylinder=makeCylinder();meshes.torus=makeTorus();buildWorld();
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);
      if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(()=>resize());observer.observe(stage);}
      window.addEventListener('resize',resize,{passive:true});ready=true;return true;
    }catch(error){failed=true;if(canvas)canvas.style.display='none';console.warn('Luna Run WebGL renderer fallback:',error);return false;}
  }
  function resize(){
    if(!canvas||!gl)return;const rect=gameCanvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const dpr=Math.min(1.65,Math.max(1,window.devicePixelRatio||1)),width=Math.max(1,Math.round(rect.width*dpr)),height=Math.max(1,Math.round(rect.height*dpr));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}gl.viewport(0,0,width,height);
  }
  function buildWorld(){
    const gravel=[{x:0,y:-.28,z:3,w:10.8,h:.34,d:76}],sleepers=[],railBeds=[],rails=[],clips=[],platforms=[],posts=[],beams=[],lampHousings=[],buildingBoxes=[],windowBoxes=[],signBoxes=[],wireBoxes=[],cityBoxes=[],cityWindows=[];
    const laneXs=[-2.55,0,2.55];
    for(let z=38;z>-30;z-=1.55){sleepers.push({x:0,y:-.02,z,w:9.9,h:.17,d:.48});laneXs.forEach(lane=>[-.79,.79].forEach(off=>clips.push({x:lane+off,y:.105,z,w:.34,h:.09,d:.24})));}
    laneXs.forEach(lane=>[-.79,.79].forEach(off=>{const x=lane+off;railBeds.push({x,y:.12,z:3,w:.28,h:.23,d:70});rails.push({x,y:.255,z:3,w:.14,h:.09,d:70});}));
    platforms.push({x:-5.55,y:-.02,z:3,w:1.05,h:.42,d:72},{x:5.55,y:-.02,z:3,w:1.05,h:.42,d:72},{x:-6.12,y:-.16,z:3,w:.22,h:.13,d:72},{x:6.12,y:-.16,z:3,w:.22,h:.13,d:72});
    // Space overhead gantries farther apart: one clean crossbeam per station span.
    for(let i=0;i<3;i++){
      const z=24-i*22;
      [-1,1].forEach(side=>{
        posts.push({x:side*5.2,y:2.35,z,w:.18,h:4.7,d:.18});
        lampHousings.push({x:side*4.88,y:4.1,z,w:.34,h:.16,d:.46});
      });
      beams.push({x:0,y:4.58,z,w:10.35,h:.095,d:.14});
      wireBoxes.push({x:0,y:5.02,z,w:10.2,h:.018,d:.018});
    }
    for(let sideIndex=0;sideIndex<2;sideIndex++){
      const side=sideIndex===0?-1:1;
      for(let i=0;i<18;i++){
        const z=28-i*3.7,variant=(i*7+sideIndex*5)%5,x=side*(8.6+variant*.62),w=3+(variant%3)*.55,h=5.2+variant*1.45,d=3.1+(variant%2)*1.1;
        buildingBoxes.push({x,y:h/2-.05,z,w,h,d});
        for(let row=0;row<Math.floor(h/1.25);row++)for(let col=0;col<2+(variant%2);col++){
          const wx=x+(col-(1+(variant%2))/2)*(w/(2+(variant%2))),wy=.85+row*1.04;
          windowBoxes.push({x:wx,y:wy,z:z+d/2+.035,w:.28,h:.42,d:.035});
        }
      }
    }
    // Distant skyline fills the horizon without crowding the three playable tracks.
    for(let i=0;i<17;i++){
      const x=-24+i*3,variant=(i*7)%5,w=2.2+(variant%2)*.55,h=4.4+variant*1.08,z=-34-(i%3)*1.4;
      cityBoxes.push({x,y:h/2-.05,z,w,h,d:2.0});
      const cols=2+(variant%2);
      for(let row=0;row<Math.floor(h/1.25);row++)for(let col=0;col<cols;col++){
        cityWindows.push({x:x+(col-(cols-1)/2)*(w/(cols+.3)),y:.75+row*1.02,z:z+1.035,w:.20,h:.34,d:.025});
      }
    }
    // Station signs sit beside the platforms, never across the playable lanes.
    for(let z=24;z>-24;z-=18){
      [-1,1].forEach(side=>{
        signBoxes.push(
          {x:side*6.05,y:1.55,z,w:.12,h:3.1,d:.12},
          {x:side*6.35,y:3.05,z,w:.72,h:.46,d:.16}
        );
      });
    }
    meshes.gravel=makeBoxBatch(gravel);meshes.sleepers=makeBoxBatch(sleepers);meshes.railBeds=makeBoxBatch(railBeds);meshes.rails=makeBoxBatch(rails);
    meshes.clips=makeBoxBatch(clips);meshes.platforms=makeBoxBatch(platforms);meshes.posts=makeBoxBatch(posts);meshes.beams=makeBoxBatch(beams);
    meshes.lamps=makeBoxBatch(lampHousings);meshes.buildings=makeBoxBatch(buildingBoxes);meshes.windows=makeBoxBatch(windowBoxes);meshes.signs=makeBoxBatch(signBoxes);meshes.wires=makeBoxBatch(wireBoxes);meshes.city=makeBoxBatch(cityBoxes);meshes.cityWindows=makeBoxBatch(cityWindows);
  }
  let viewMatrix=matIdentity(),projectionMatrix=matIdentity();
  function draw(mesh,model,color,emission,metal,pattern){
    if(!mesh||!mesh.count)return;
    const mv=multiply(viewMatrix,model),mvp=multiply(projectionMatrix,mv);
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.position);gl.vertexAttribPointer(attributes.position,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(attributes.position);
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.normal);gl.vertexAttribPointer(attributes.normal,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(attributes.normal);
    gl.uniformMatrix4fv(uniforms.mvp,false,mvp);gl.uniformMatrix4fv(uniforms.modelView,false,mv);gl.uniformMatrix4fv(uniforms.model,false,model);
    gl.uniform3fv(uniforms.color,hexColor(color));gl.uniform1f(uniforms.emission,emission||0);gl.uniform1f(uniforms.metal,metal||0);gl.uniform1f(uniforms.pattern,pattern||0);
    gl.drawArrays(gl.TRIANGLES,0,mesh.count);
  }
  function box(x,y,z,w,h,d,color,emission,metal,pattern,rx,ry,rz){draw(meshes.cube,compose(x,y,z,w,h,d,rx||0,ry||0,rz||0),color,emission,metal,pattern);}
  function sphere(x,y,z,sx,sy,sz,color,emission,metal){draw(meshes.sphere,compose(x,y,z,sx,sy,sz,0,0,0),color,emission,metal,0);}
  function segment(a,b,r,color,emission,metal){
    const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz)||.001,y=normalize([dx,dy,dz]),helper=Math.abs(y[1])<.9?[0,1,0]:[0,0,1];
    const x=normalize(cross(helper,y)),z=normalize(cross(x,y)),cx=(a[0]+b[0])/2,cy=(a[1]+b[1])/2,cz=(a[2]+b[2])/2;
    const m=new Float32Array([x[0]*r,x[1]*r,x[2]*r,0,y[0]*len,y[1]*len,y[2]*len,0,z[0]*r,z[1]*r,z[2]*r,0,cx,cy,cz,1]);
    draw(meshes.cylinder,m,color,emission||0,metal||0,0);
  }
  function worldZ(z){return 31-clamp(z,-.2,1.18)*31;}
  function drawWorld(theme,time,speed){
    const worldFlow=(time||0)*(.36+(speed||430)/1900),tieOffset=worldFlow%1.55,stationOffset=worldFlow%22;
    draw(meshes.city,identity,'#35445d',0,.12,3);draw(meshes.cityWindows,identity,theme.lamp,.42,.08,0);sphere(2.2,14.3,-29,1.10,1.10,1.10,theme.accent,.72,0);draw(meshes.gravel,identity,theme.ground,0,.12,2);draw(meshes.platforms,identity,'#59656a',0,.42,3);
    draw(meshes.sleepers,translate(0,0,tieOffset),'#6c4e3b',0,.08,2);draw(meshes.railBeds,identity,'#303b43',0,.5,1);
    draw(meshes.rails,identity,'#c0cbd0',.05,.92,1);draw(meshes.clips,translate(0,0,tieOffset),'#d2a95e',.03,.75,0);
    draw(meshes.buildings,identity,'#45546b',0,.18,3);draw(meshes.windows,identity,theme.lamp,.23,.1,0);
    draw(meshes.posts,translate(0,0,stationOffset),'#384754',0,.55,1);draw(meshes.beams,translate(0,0,stationOffset),'#485b67',0,.62,1);
    draw(meshes.wires,translate(0,0,stationOffset),'#242e3d',0,.7,0);draw(meshes.lamps,translate(0,0,stationOffset),theme.lamp,.85,.2,0);draw(meshes.signs,translate(0,0,stationOffset%18),'#183a4b',0,.32,1);
    // Gantry-mounted lamps are part of the shared static station geometry.
    for(let i=0;i<4;i++){const z=23-i*15;box(-7.2,.8,z,.16,1.6,1.1,'#3b5961',0,.12,0);box(7.2,.8,z,.16,1.6,1.1,'#3b5961',0,.12,0);}
    for(let i=0;i<10;i++){const z=25-i*6.7,x=(i%2?1:-1)*(8.1+(i%3)*1.2),h=1.8+(i%4)*.55;box(x,h/2,z,.75,h,.65,i%2?'#294a53':'#365b55',0,.05,2);sphere(x,h+.32,z,.52,.23,.5,'#477b66',0,.02);}
  }
  function drawTrainModel(x,z,theme,time,s=1){
    const b=(dx,y,dz,w,h,d,color,emission,metal,pattern,rx,ry,rz)=>box(
      x+dx*s,y*s,z+dz*s,w*s,h*s,d*s,color,emission,metal,pattern,rx,ry,rz
    );
    // Rounded commuter body, polished roof and continuous destination stripe.
    b(0,1.66,-.72,2.28,3.30,8.65,theme.train,0,.48,1);
    b(0,3.33,-.72,2.18,.16,8.35,'#aebfc4',.02,.86,1);
    b(0,1.88,-.72,2.34,.12,8.30,'#d9b66f',.02,.72,0);
    b(0,.72,-.72,2.35,.22,8.28,'#263744',0,.72,1);
    // Front cab faces the runner, with a wide windscreen and warm headlamps.
    b(0,2.55,3.63,1.94,1.12,.14,'#15374a',.04,.52,1);
    b(0,2.61,3.715,1.67,.76,.035,'#8bcbd4',.12,.34,0);
    b(0,2.62,3.742,.075,.70,.025,'#d6e5de',.08,.18,0);
    b(0,1.66,3.69,1.98,.52,.15,'#185366',0,.54,1);
    b(0,1.28,3.76,2.22,.17,.30,'#d6ae65',.02,.68,1);
    b(0,.52,3.72,2.24,.25,.42,'#283946',0,.76,0);
    b(0,.97,3.81,.34,.16,.06,'#fff0bd',.8,.06,0);
    for(const side of [-1,1]){
      b(side*1.16,1.68,-.72,.10,2.72,8.24,'#153f50',0,.35,1);
      b(side*1.205,1.96,-.72,.055,.10,8.0,'#d3b16c',.02,.4,0);
      for(let i=0;i<5;i++){
        const wz=2.55-i*1.72;
        b(side*1.225,2.54,wz,.045,.72,1.08,'#8bcbd4',.10,.3,0);
        b(side*1.255,2.54,wz,.025,.055,1.02,'#f1d69a',.08,.1,0);
      }
      for(let i=0;i<2;i++){
        const wz=.95-i*4.05;
        sphere(x+side*1.13*s,.40*s,(z+wz*s),.27*s,.27*s,.34*s,'#172631',0,.72);
        sphere(x+side*1.18*s,.40*s,(z+wz*s),.12*s,.12*s,.36*s,'#8fa6af',.02,.88);
      }
    }
    // Front safety stripe, coupler and twin lamps make the locomotive readable at distance.
    b(-.78,.84,3.80,.24,.22,.08,theme.lamp,.95,.06,0);
    b(.78,.84,3.80,.24,.22,.08,theme.lamp,.95,.06,0);
    b(0,.20,3.88,.56,.18,.32,'#202c35',0,.52,0);
    b(0,3.47,-.68,.88,.13,7.95,'#657985',.02,.74,1);
    for(let i=0;i<3;i++)b(0,3.58,-2.45+i*1.7,.40,.10,.48,'#65747c',0,.76,1);
  }
  function drawTrain(obstacle,theme,time){
    drawTrainModel((obstacle.lane-1)*2.55,worldZ(obstacle.z),theme,time,1);
  }
  function drawChaseTrain(theme,time){
    // A distant locomotive loops toward the runner along the centre rail.
    const approach=(time*.12)%1,z=-18.2+approach*6.1;
    drawTrainModel(0,z,theme,time,.72);
    const pulse=.72+Math.sin(time*5.5)*.18;
    sphere(-.52,.66,z+2.42,.11,.11,.08,theme.lamp,pulse,0);
    sphere(.52,.66,z+2.42,.11,.11,.08,theme.lamp,pulse,0);
  }
  function drawBarrier(obstacle){
    const x=(obstacle.lane-1)*2.55,z=worldZ(obstacle.z);
    box(x,.47,z,1.88,.88,.42,'#d99c43',0,.25,1);box(x,.94,z,.15,.78,.16,'#343b43',0,.52,0);
    for(let i=-2;i<=2;i++)box(x+i*.34,.48,z+.225,.13,.82,.035,i%2?'#f4d27d':'#28343d',0,.18,0,0,0,-.36);
    for(let side=-1;side<=1;side+=2){box(x+side*.92,.28,z,.22,.52,.58,'#3e4a50',0,.48,0);box(x+side*.92,.08,z,.52,.12,.78,'#242f38',0,.3,0);}
  }
  function drawOverhead(obstacle){
    const x=(obstacle.lane-1)*2.55,z=worldZ(obstacle.z);
    for(let side=-1;side<=1;side+=2){box(x+side*.98,.94,z,.12,1.88,.16,'#394b56',0,.42,0);box(x+side*.98,.08,z,.38,.16,.52,'#263641',0,.28,0);}
    box(x,1.58,z,2.12,.36,.24,'#253d50',.08,.35,0);box(x,1.58,z+.135,1.7,.1,.035,'#e4a45e',.2,.25,0);
    box(x-.68,1.58,z+.16,.12,.12,.04,'#fff0bd',.55,.08,0);box(x+.68,1.58,z+.16,.12,.12,.04,'#fff0bd',.55,.08,0);
  }
  function drawRamp(obstacle){
    const x=(obstacle.lane-1)*2.55,z=worldZ(obstacle.z);
    box(x,.30,z,1.86,.28,3.15,'#2e737d',.03,.45,0,-.22,0,0);
    box(x-.82,.34,z,.12,.3,3.25,'#d2ad6b',.06,.62,0,-.22,0,0);box(x+.82,.34,z,.12,.3,3.25,'#d2ad6b',.06,.62,0,-.22,0,0);
    for(let i=0;i<5;i++)box(x,.47+i*.015,z+1.12-i*.48,1.55,.035,.055,'#8ed8d5',.14,.35,0);
  }
  function drawPickup(item,theme,time){
    const x=(item.lane-1)*2.55,z=worldZ(item.z),phase=time*2.4+(item.lane||0);
    if(item.type==='coin'||item.type==='super'){
      const y=(item.raised?2.35:1.16)+Math.sin(phase)*.06,s=item.type==='super'?1.08:.68;
      draw(meshes.torus,compose(x,y,z,s,s,s,0,time*3,0),item.type==='super'?'#8eeaff':'#f5c451',.45,.86,0);
      sphere(x,y,z,.20*s,.20*s,.1,'#fff0bc',.35,.5);return;
    }
    const meta={magnet:['#ef5575','M'],x2:['#438bff','2'],jet:['#ff9c42','J'],shoes:['#48d58c','S'],board:['#2dc9ee','B'],mystery:['#a879ef','?'],key:['#ffcf56','K']}[item.type]||['#a879ef','?'];
    const y=1.28+Math.sin(phase)*.13;sphere(x,y,z,.27,.27,.27,meta[0],.38,.24);
    draw(meshes.torus,compose(x,y,z,.60,.60,.60,0,time*1.4,0),meta[0],.38,.4,0);box(x,y,z,.09,.46,.09,'#ffffff',.4,.1,0,0,time*.5,0);
  }
  function drawHero(data,theme){
    const hero=data.hero||{body:'#9069b8',shine:'#d8b8f0',dark:'#302746',scarf:'#f1c58b',hair:'#28233c',skin:'#e8b99c',pack:'#5c9f9d',accent:'#ffe3a6'};
    const x=(data.lane-1)*2.55,z=.25,time=data.time||0,phase=time*12.8,gait=Math.sin(phase),gait2=Math.cos(phase);
    const laneLean=clamp((data.targetLane-data.lane)*.16,-.18,.18);
    const jump=clamp((data.jump||0)/86,0,1.95)+(data.effects&&data.effects.jet>0?1.25:0)+(data.rideT>0?.2:0);
    const slide=data.slide>0,baseY=jump+(slide?-.32:0),bob=Math.abs(gait)*.055;
    sphere(x,.035,z,.62,.055,.78,'#0b1d28',0,.1);
    if(data.effects&&data.effects.board>0){
      box(x,.22,z,.98,.14,1.48,'#1e667b',.15,.65,0,0,Math.sin(time*5)*.12,0);
      box(x,.30,z,.74,.035,1.12,'#8deaff',.36,.35,0);
    }
    const torsoY=1.27+baseY+bob,headY=2.04+baseY+bob-(slide?.24:0),bodyScale=slide?.74:1;
    // Soft silhouette replaces the square torso; panel seams retain the runner's outfit identity.
    sphere(x,torsoY,z,.43,.57*bodyScale,.31,hero.body,data.runnerInvul>0?.14:0,.18);
    sphere(x,torsoY+.02,z+.245,.31,.45*bodyScale,.145,hero.pack,0,.16);
    box(x,torsoY+.04,z+.386,.055,.62*bodyScale,.025,hero.dark,0,.12,0,0,0,laneLean);
    box(x-.18,torsoY+.25,z+.34,.075,.45,.035,hero.shine,.05,.12,0,0,0,-.16);
    box(x+.18,torsoY+.25,z+.34,.075,.45,.035,hero.shine,.05,.12,0,0,0,.16);
    box(x,torsoY-.24,z+.36,.48,.10,.045,hero.dark,0,.1,0);
    // Backpack straps, top roll and compact side pouches.
    sphere(x,torsoY+.48,z+.34,.33,.16,.22,hero.dark,0,.12);
    box(x-.29,torsoY+.06,z+.30,.11,.52,.09,hero.accent,.02,.15,0,0,0,-.12);
    box(x+.29,torsoY+.06,z+.30,.11,.52,.09,hero.accent,.02,.15,0,0,0,.12);
    sphere(x-.36,torsoY-.18,z+.27,.11,.16,.12,hero.shine,0,.1);
    sphere(x+.36,torsoY-.18,z+.27,.11,.16,.12,hero.shine,0,.1);
    // Head, neck and layered hair silhouette from the rear.
    sphere(x,headY-.36,z,.20,.20,.20,hero.skin,0,.02);
    sphere(x,headY,z,.345,.395,.325,hero.skin,0,.03);
    sphere(x,headY+.22,z+.055,.365,.245,.355,hero.hair,0,.06);
    sphere(x-.25,headY+.10,z+.08,.13,.18,.22,hero.hair,0,.02);
    sphere(x+.25,headY+.10,z+.08,.13,.18,.22,hero.hair,0,.02);
    sphere(x-.13,headY-.08,z+.285,.105,.19,.09,hero.hair,0,.02);
    sphere(x+.13,headY-.08,z+.285,.105,.19,.09,hero.hair,0,.02);
    // Scarf folds and a pair of animated tails stream behind the runner.
    box(x,1.69+baseY+bob,z,.49,.17,.54,hero.scarf,.08,.16,0,0,0,laneLean);
    box(x+.37,1.76+baseY+bob,z+.48,.16,.10,.92,hero.scarf,.06,.1,0,.05,0,Math.sin(phase)*.30);
    box(x-.37,1.73+baseY+bob,z+.43,.15,.09,.76,hero.accent,.06,.1,0,-.08,0,-Math.sin(phase)*.25);
    const hipL=[x-.20,.94+baseY,z],hipR=[x+.20,.94+baseY,z];
    const kneeL=[x-.22+gait*.15,.52+baseY+Math.max(0,-gait)*.12,z+gait*.22];
    const kneeR=[x+.22-gait*.15,.52+baseY+Math.max(0,gait)*.12,z-gait*.22];
    const ankleL=[x-.22+gait*.30,.15+baseY+Math.max(0,-gait)*.17,z+gait*.45];
    const ankleR=[x+.22-gait*.30,.15+baseY+Math.max(0,gait)*.17,z-gait*.45];
    segment(hipL,kneeL,.145,hero.dark,0,.05);segment(kneeL,ankleL,.12,hero.body,0,.05);
    segment(hipR,kneeR,.145,hero.dark,0,.05);segment(kneeR,ankleR,.12,hero.body,0,.05);
    sphere(kneeL[0],kneeL[1],kneeL[2],.15,.15,.15,hero.body,0,0);
    sphere(kneeR[0],kneeR[1],kneeR[2],.15,.15,.15,hero.body,0,0);
    box(ankleL[0],ankleL[1]-.025,ankleL[2]-.13,.34,.20,.55,'#202b3e',.02,.28,0,0,-gait*.18,0);
    box(ankleR[0],ankleR[1]-.025,ankleR[2]-.13,.34,.20,.55,'#202b3e',.02,.28,0,0,gait*.18,0);
    box(ankleL[0],ankleL[1]+.075,ankleL[2]-.32,.23,.045,.13,hero.accent,.10,.18,0);
    box(ankleR[0],ankleR[1]+.075,ankleR[2]-.32,.23,.045,.13,hero.accent,.10,.18,0);
    const shoulderY=1.54+baseY+bob-(slide?.25:0),shoulderL=[x-.40,shoulderY,z],shoulderR=[x+.40,shoulderY,z];
    const elbowL=[x-.57+gait2*.12,shoulderY-.31+gait*.20,z-gait*.19];
    const elbowR=[x+.57-gait2*.12,shoulderY-.31-gait*.20,z+gait*.19];
    const handL=[x-.58+gait2*.25,shoulderY-.64+gait*.24,z-gait*.40];
    const handR=[x+.58-gait2*.25,shoulderY-.64-gait*.24,z+gait*.40];
    segment(shoulderL,elbowL,.12,hero.body,0,.04);segment(elbowL,handL,.09,hero.skin,0,0);
    segment(shoulderR,elbowR,.12,hero.body,0,.04);segment(elbowR,handR,.09,hero.skin,0,0);
    sphere(handL[0],handL[1],handL[2],.12,.12,.12,hero.skin,0,0);
    sphere(handR[0],handR[1],handR[2],.12,.12,.12,hero.skin,0,0);
    if(data.effects&&data.effects.jet>0){
      box(x-.25,1.28+baseY,z+.55,.22,.56,.24,'#c16b35',.12,.25,0,0,0,-.10);
      box(x+.25,1.28+baseY,z+.55,.22,.56,.24,'#c16b35',.12,.25,0,0,0,.10);
      sphere(x-.25,.82+baseY,z+.58,.10,.32,.10,'#ffb14f',.85,0);
      sphere(x+.25,.82+baseY,z+.58,.10,.32,.10,'#ffb14f',.85,0);
    }
    if(data.runnerInvul>0)draw(meshes.torus,compose(x,1.12+baseY,z,.95,.95,.95,Math.PI/2,time*2.2,0),'#a8efff',.45,.2,0);
  }
  function render(data){
    if(!data||!ensureCanvas())return false;
    canvas.style.display='block';const rect=gameCanvas.getBoundingClientRect();if(!rect.width||!rect.height)return false;resize();
    const stageIndex=clamp(Math.floor(data.stage||0),0,themes.length-1),theme=themes[stageIndex];
    if(lastTheme!==stageIndex){canvas.style.background=theme.sky;lastTheme=stageIndex;}
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);gl.uniform3fv(uniforms.fog,hexColor(theme.fog));
    const shake=data.shake||0,eye=[Math.sin((data.time||0)*38)*shake*.004,6.15+Math.cos((data.time||0)*31)*shake*.003,11.8];
    viewMatrix=lookAt(eye,[0,1.10,-17.5],[0,1,0]);projectionMatrix=perspective(54*Math.PI/180,canvas.width/canvas.height,.1,110);
    drawWorld(theme,data.time||0,data.speed||430);drawChaseTrain(theme,data.time||0);
    (data.pickups||[]).filter(item=>item.z<1.14).forEach(item=>drawPickup(item,theme,data.time||0));
    (data.obstacles||[]).filter(item=>item.z<1.14).forEach(item=>{
      if(item.type==='train')drawTrain(item,theme,data.time||0);else if(item.type==='barrier')drawBarrier(item);else if(item.type==='overhead')drawOverhead(item);else if(item.type==='ramp')drawRamp(item);
    });
    drawHero(data,theme);
    if(stageIndex===3)for(let i=0;i<36;i++){
      const t=(data.time||0)*18+i*1.73,x=Math.sin(i*12.37)*9.5,y=4.4+((i*7)%8),z=22-((t*2.4+i*4.1)%62);
      box(x,y,z,.018,.42,.018,'#b8dcff',.32,.1,0,.12,0,.1);
    }
    return true;
  }
  function hide(){if(canvas)canvas.style.display='none';}
  window.LunaRun3D={render,hide,isReady:()=>ready,hasFailed:()=>failed};
})();