import * as THREE from 'three';
import { BOARD, COLORS, PLAYER_COLORS, gridPosition } from './board-data.js';

const SIDE = 33;
const CORNER = 4.6;
const TILE = (SIDE-2*CORNER)/9;
const HALF = SIDE/2;
const CREAM = 0xf7f3e6;
const INK = '#20383b';
const ICONS = {go:'↶',chest:'✦',chance:'?',jail:'▥',gojail:'➜',casino:'◆',tax:'$',transport:'◆',utility:'⚡'};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);

function axis(c){
  if(c===0)return -HALF+CORNER/2;
  if(c===10)return HALF-CORNER/2;
  return -HALF+CORNER+(c-.5)*TILE;
}
function tileLocation(index){const {row,col}=gridPosition(index);return new THREE.Vector3(axis(col),.34,axis(row))}
function tileSize(index){const {row,col}=gridPosition(index);return {w:(col===0||col===10)?CORNER:TILE,d:(row===0||row===10)?CORNER:TILE}}
function box(w,h,d,color,roughness=.76){
  return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness,metalness:.035}));
}
function seededRng(seed){let n=seed|0;return ()=>{n=(Math.imul(n,1664525)+1013904223)|0;return(n>>>0)/4294967296}}
function wrap(ctx,str,maxWidth){
  let out=[],line='';for(const word of str.split(' ')){
    const test=line?line+' '+word:word;
    if(line&&ctx.measureText(test).width>maxWidth){out.push(line);line=word}else line=test;
  }
  if(line)out.push(line);return out;
}
function textTexture(space){
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=640;
  const c=canvas.getContext('2d');
  c.fillStyle='#f8f4e8';c.fillRect(0,0,640,640);
  c.strokeStyle='#d2d5be';c.lineWidth=9;c.strokeRect(16,16,608,608);
  c.fillStyle=INK;
  const special = space.type !== 'property';
  const name=space.name==='Jail / Just Visiting'?'JAIL':space.name;
  const fontBase=space.type==='property'? 74 : (name.length>16?62:82);
  let font=fontBase,lines;
  do{
    c.font=`900 ${font}px Georgia,serif`;
    lines=wrap(c,name,548);
    if(lines.length<=3&&lines.every(s=>c.measureText(s).width<=548))break;
    font-=4;
  }while(font>45);
  let icon=ICONS[space.type]||'';
  if(space.type==='transport')icon='▰';
  const labelMid=special?370:339;
  const lineHeight=font*1.15;
  const start=labelMid-((lines.length-1)*lineHeight)/2;
  c.fillStyle=INK;c.textAlign='center';c.textBaseline='middle';c.font=`900 ${font}px Georgia,serif`;
  lines.forEach((line,i)=>{c.fillText(line,320,start+i*lineHeight,548)});
  if(special){
    c.font='bold 125px system-ui, sans-serif';c.fillStyle=space.type==='chance'?'#e05d5b':space.type==='casino'?'#c68b3c':'#558c8a';
    c.fillText(icon,320,160);
  }
  if(space.type==='property'){
    c.fillStyle='#6a8981';c.fillRect(248,493,144,6);
    c.font='750 29px system-ui,sans-serif';c.fillText('PROPERTY',320,540);
  }
  if(space.type==='transport'){
    c.fillStyle='#618579';c.font='750 29px system-ui,sans-serif';c.fillText('CAR SHOP',320,540);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
  return texture;
}

/* All labels read left-to-right across the board, including the
   top and bottom rows. Fit complete names on each space by wrapping. */
function longTileTexture(space,index){
  const {w:tileW,d:tileD}=tileSize(index);
  // Higher resolution with one to three intentional lines, centered with
  // generous spacing. Side rotations are applied separately by labelAngle.
  const scale=260;
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(tileW*scale);
  canvas.height=Math.round(tileD*scale);
  const ctx=canvas.getContext('2d');
  const w=canvas.width,h=canvas.height;
  ctx.fillStyle='#faf7ed';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#cdd5c6';ctx.lineWidth=6;ctx.strokeRect(10,10,w-20,h-20);
  const padding=Math.max(28,Math.min(w,h)*.13);
  const usableWidth=w-2*padding;
  const usableHeight=h-2*padding;
  // Before rotation, use the long dimension of the space for labels.
  const angle=labelAngle(index);
  const rotated=Math.abs(Math.sin(angle))>.5;
  const textWidth=rotated?usableHeight:usableWidth;
  const textHeight=rotated?usableWidth:usableHeight;
  let font=Math.min(110,Math.round(Math.min(textWidth*.16,textHeight*.44)));
  let lines=[];
  while(font>=24){
    ctx.font=`800 ${font}px Arial,system-ui,sans-serif`;
    lines=wrap(ctx,space.name,textWidth);
    const lineHeight=font*1.27;
    if(lines.length<=3 && lines.every(line=>ctx.measureText(line).width<=textWidth)
      && lines.length*lineHeight<=textHeight*.82)break;
    font-=2;
  }
  const lineHeight=font*1.27;
  ctx.save();ctx.translate(w/2,h/2);
  // Rotate the lettering within each cell to read along the long side.
  // The texture itself must stay unrotated so the rectangle is not distorted.
  ctx.rotate(angle);
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle='#213b40';
  ctx.font=`800 ${font}px Arial,system-ui,sans-serif`;
  const offset=(lines.length-1)*lineHeight/2;
  lines.forEach((line,i)=>ctx.fillText(line,0,i*lineHeight-offset,textWidth));
  ctx.restore();
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=8;
  return texture;
}

// Per-side lettering orientation, in the original 40-space order.
// Devon Park → Casino: clockwise 90°
// St. Marys → Go To Jail: upside-down 180°
// Pembroke Ave → Coyle: counterclockwise 90°
function labelAngle(index){
  if(index>=11 && index<=20)return -Math.PI/2;
  if(index>=21 && index<=30)return Math.PI;
  if(index>=31 && index<=39)return Math.PI/2;
  return 0;
}

function bannerTexture(){
  const c=document.createElement('canvas');c.width=1024;c.height=512;const g=c.getContext('2d');
  g.fillStyle='#f0e7c8';g.fillRect(0,0,1024,512);
  g.fillStyle='#15383b';g.fillRect(30,35,964,442);
  g.strokeStyle='#ffd57b';g.lineWidth=11;g.strokeRect(55,60,914,392);
  g.textAlign='center';g.fillStyle='#f4f5e9';g.font='1000 174px system-ui,sans-serif';g.fillText('MY CITY',512,295);
  g.fillStyle='#ffcb77';g.font='900 30px system-ui,sans-serif';g.letterSpacing='9px';g.fillText('BUILD • BUY • EXPLORE',512,363);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function dieSideTexture(n){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const c=canvas.getContext('2d');c.fillStyle='#101316';c.fillRect(0,0,256,256);
  c.strokeStyle='#4f565f';c.lineWidth=6;c.strokeRect(8,8,240,240);
  const pts={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[-1,1],[1,-1],[1,1]],5:[[-1,-1],[-1,1],[0,0],[1,-1],[1,1]],6:[[-1,-1],[-1,0],[-1,1],[1,-1],[1,0],[1,1]]};
  c.fillStyle='#ffffff';for(const [x,y] of pts[n]){c.beginPath();c.arc(128+x*68,128+y*68,16,0,Math.PI*2);c.fill()}
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;
}

export class MyCityScene {
  constructor(container,{onSelect=()=>{}}={}){
    this.container=container;this.onSelect=onSelect;this.disposed=false;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#173844');
    this.scene.fog=new THREE.Fog('#173844',54,112);
    this.camera=new THREE.PerspectiveCamera(44,1,.1,170);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.7;
    container.appendChild(this.renderer.domElement);
    this.clock=new THREE.Clock();this.elapsed=0;
    this.mode='follow';this.zoom=1;this.azimuth=.48;this.elevation=1.01;
    this.focusIndex=0;this.selected=0;this.cinematicDice=false;
    this.exploreTarget=new THREE.Vector3(0,.6,0);
    this.currentCamTarget=new THREE.Vector3(0,0,0);this.motion=null;this.diceMotion=null;
    this.pawns=[];this.spaces=[];this.clickMeshes=[];this.ownerIndicators=[];
    this.cursor=new THREE.Group();this.scene.add(this.cursor);
    this.makeLights();this.makeBoard();this.makeCity();this.makeDice();this.makeAtmosphere();
    this.makeSelection(0);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
    this.installInteraction();
    this.animate=this.animate.bind(this);this.renderer.setAnimationLoop(this.animate);
  }
  makeLights(){
    this.scene.add(new THREE.HemisphereLight('#ffffff','#63837a',2.5));
    const sun=new THREE.DirectionalLight('#fff2d7',3.5);sun.position.set(-11,28,17);
    sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
    sun.shadow.camera.left=-23;sun.shadow.camera.right=23;
    sun.shadow.camera.top=23;sun.shadow.camera.bottom=-23;
    sun.shadow.camera.near=1;sun.shadow.camera.far=60;
    sun.shadow.bias=-.0003;sun.shadow.normalBias=.01;
    this.scene.add(sun);
    const fill=new THREE.DirectionalLight('#a0ecde',1.2);fill.position.set(15,13,-12);this.scene.add(fill);
  }
  makeBoard(){
    let outside=box(SIDE+1.2,.65,SIDE+1.2,0x0b3034);outside.position.y=-.16;outside.receiveShadow=true;this.scene.add(outside);
    let trim=box(SIDE+.72,.33,SIDE+.72,0xe7bd77);trim.position.y=.15;trim.receiveShadow=true;this.scene.add(trim);
    let base=box(SIDE+.25,.16,SIDE+.25,0x284f48);base.position.y=.365;base.receiveShadow=true;this.scene.add(base);
    let inner=box(SIDE-2*CORNER+.05,.055,SIDE-2*CORNER+.05,0xa8d2bd);inner.position.y=.47;inner.receiveShadow=true;this.scene.add(inner);
    // Tiny inner glow-frame: physical geometry rather than a flat board screenshot.
    for(const coord of [-(SIDE-2*CORNER)/2-.02,(SIDE-2*CORNER)/2+.02]){
      let a=box(.045,.03,SIDE-2*CORNER+.08,0xffefc2);a.position.set(coord,.51,0);this.scene.add(a);
      let b=box(SIDE-2*CORNER+.08,.03,.045,0xffefc2);b.position.set(0,.51,coord);this.scene.add(b);
    }
    for(const space of BOARD){
      const i=space.index,loc=tileLocation(i),{w,d}=tileSize(i);
      const tile=box(w-.055,.18,d-.055,CREAM,.89);
      tile.position.set(loc.x,.53,loc.z);tile.receiveShadow=true;tile.castShadow=true;tile.userData.index=i;this.scene.add(tile);this.clickMeshes.push(tile);
      const texture=[0,10,20,30].includes(i)?textTexture(space):longTileTexture(space,i);
      // Rotate the printed text on this space without changing its tile or color band.
      texture.center.set(.5,.5);
      // Corner cards use the old square texture, so rotate those textures.
      // All other space lettering is rotated when drawn into its own canvas.
      texture.rotation=[0,10,20,30].includes(i)?labelAngle(i):0;
      texture.needsUpdate=true;
      let label=new THREE.Mesh(new THREE.PlaneGeometry(w-.075,d-.075),new THREE.MeshBasicMaterial({map:texture,transparent:false}));
      label.rotation.x=-Math.PI/2;label.position.set(loc.x,.633,loc.z);label.userData.index=i;
      this.scene.add(label);this.clickMeshes.push(label);
      if(space.color){
        // The colored strips face the INSIDE of the ring, like a real board.
        let band;
        if (i>=1&&i<=9){band=box(w-.10,.06,.54,COLORS[space.color]);band.position.set(loc.x,.676,loc.z-d/2+.32)}
        else if(i>=11&&i<=19){band=box(.54,.06,d-.10,COLORS[space.color]);band.position.set(loc.x+w/2-.32,.676,loc.z)}
        else if(i>=21&&i<=29){band=box(w-.10,.06,.54,COLORS[space.color]);band.position.set(loc.x,.676,loc.z+d/2-.32)}
        else {band=box(.54,.06,d-.10,COLORS[space.color]);band.position.set(loc.x-w/2+.32,.676,loc.z)}
        band.castShadow=true;this.scene.add(band);
      }
      if([0,10,20,30].includes(i)){
        const corner=box(w-.30,.04,d-.30,i===20?0xd2a363:i===30?0xf7ad86:i===10?0x78a5ba:0x8ad0b0);
        corner.position.set(loc.x,.645,loc.z);this.scene.add(corner);
        // Repeat legible text on corner on top of the light color plaque.
        let cornerLabel=new THREE.Mesh(new THREE.PlaneGeometry(w-.47,d-.47),new THREE.MeshBasicMaterial({map:texture}));
        cornerLabel.rotation.x=-Math.PI/2;cornerLabel.position.set(loc.x,.676,loc.z);
        cornerLabel.userData.index=i;this.scene.add(cornerLabel);this.clickMeshes.push(cornerLabel);
      }
      this.spaces.push({index:i,loc,w,d,tile});
    }
  }
  makeCity(){
    // Keep only the MY CITY central plaque. Roads, trees, mini car,
    // plaza decorations and buildings are intentionally removed.
    const plaque=box(11.2,.10,6.8,0xe7ddba);
    plaque.position.set(-.1,.55,.55);
    plaque.receiveShadow=true;
    this.scene.add(plaque);
    const banner=new THREE.Mesh(
      new THREE.PlaneGeometry(10.35,5.8),
      new THREE.MeshBasicMaterial({map:bannerTexture()})
    );
    banner.rotation.x=-Math.PI/2;
    banner.position.set(-.1,.61,.55);
    this.scene.add(banner);
  }
  makeDice(){
    const all=Array.from({length:6},(_,i)=>dieSideTexture(i+1));
    this.faceTextures=all;
    this.dice=[];
    for(let i=0;i<2;i++){
      const mats=[0,1,2,3,4,5].map(j=>new THREE.MeshStandardMaterial({map:all[j],roughness:.36,metalness:0}));
      const die=new THREE.Mesh(new THREE.BoxGeometry(.88,.88,.88),mats);
      die.position.set(-6.5+i*1.45,1.12,6.45);die.rotation.set(0,0,0);
      die.castShadow=true;this.scene.add(die);this.dice.push(die);
    }
  }
  makeAtmosphere(){
    const ground=box(190,.12,190,0x0e343b);ground.position.y=-1.3;ground.receiveShadow=true;this.scene.add(ground);
    for(let r=0;r<5;r++){
      const ring=new THREE.Mesh(new THREE.RingGeometry(19+r*5,19.13+r*5,100),new THREE.MeshBasicMaterial({color:0x5bb8a1,side:THREE.DoubleSide,transparent:true,opacity:.14-r*.02}));
      ring.rotation.x=-Math.PI/2;ring.position.y=-1.225;this.scene.add(ring);
    }
  }
  makeSelection(index){
    this.selected=index;this.cursor.clear();
    const item=this.spaces[index],{w,d}=item,edge=.13;
    const x=item.loc.x,z=item.loc.z;
    const points=[new THREE.Vector3(-w/2+edge,0,-d/2+edge),new THREE.Vector3(w/2-edge,0,-d/2+edge),new THREE.Vector3(w/2-edge,0,d/2-edge),new THREE.Vector3(-w/2+edge,0,d/2-edge)].map(p=>p.add(new THREE.Vector3(x,.74,z)));
    const geom=new THREE.BufferGeometry().setFromPoints(points);
    const line=new THREE.LineLoop(geom,new THREE.LineBasicMaterial({color:0xffe69a,linewidth:3}));this.cursor.add(line);
  }
  tokenPosition(index,playerId){
    const loc=this.spaces[index].loc;
    const dx=[-.35,.34,-.33,.33][playerId]||0;
    const dz=[-.29,-.29,.30,.30][playerId]||0;
    return new THREE.Vector3(loc.x+dx,.75,loc.z+dz);
  }
  setPlayers(players){
    this.cinematicDice=false;
    if(this.motion){this.motion.resolve();this.motion=null}
    if(this.diceMotion){this.diceMotion.resolve();this.diceMotion=null}
    for(const p of this.pawns){this.scene.remove(p);}
    this.pawns=[];
    players.forEach((p,i)=>{
      const color=new THREE.Color(PLAYER_COLORS[i]);
      const group=new THREE.Group();
      const mat=new THREE.MeshStandardMaterial({color,roughness:.32,metalness:.25});
      const base=new THREE.Mesh(new THREE.CylinderGeometry(.3,.39,.14,24),mat);base.position.y=.06;base.castShadow=true;group.add(base);
      const body=new THREE.Mesh(new THREE.CylinderGeometry(.15,.28,.45,24),mat);body.position.y=.37;body.castShadow=true;group.add(body);
      const head=new THREE.Mesh(new THREE.SphereGeometry(.20,16,12),new THREE.MeshStandardMaterial({color:0xfff4dd,roughness:.35}));
      head.position.y=.73;head.castShadow=true;group.add(head);
      const halo=new THREE.Mesh(new THREE.TorusGeometry(.29,.055,7,26),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.72}));
      halo.rotation.x=Math.PI/2;halo.position.y=.14;group.add(halo);
      group.position.copy(this.tokenPosition(p.at,i));
      this.scene.add(group);this.pawns.push(group);
    });
  }
  updatePositions(players,activeIndex){
    this.focusIndex=activeIndex;
    for(let i=0;i<players.length;i++){
      if(this.motion?.playerId===i)continue;
      this.pawns[i]?.position.copy(this.tokenPosition(players[i].at,i));
      if(this.pawns[i])this.pawns[i].visible=!players[i].bankrupt;
    }
  }
  updateOwners(owners){
    for(const o of this.ownerIndicators)this.scene.remove(o);
    this.ownerIndicators=[];
    owners.forEach((owner,index)=>{
      if(owner<0||owner>=PLAYER_COLORS.length)return;
      const item=this.spaces[index],tag=new THREE.Group();
      const stand=box(.13,.45,.13,0x36545a);stand.position.y=.22;tag.add(stand);
      const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.2,0),new THREE.MeshStandardMaterial({color:PLAYER_COLORS[owner],emissive:PLAYER_COLORS[owner],emissiveIntensity:.3,metalness:.2}));
      gem.position.y=.58;tag.add(gem);
      tag.position.set(item.loc.x+item.w*.36,.69,item.loc.z+item.d*.34);
      this.scene.add(tag);this.ownerIndicators.push(tag);
    });
  }
  async movePawn(playerId,to,duration=390){
    if(!this.pawns[playerId])return;
    const pawn=this.pawns[playerId];
    const dest=this.tokenPosition(to,playerId);
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){pawn.position.copy(dest);return}
    if(this.motion){this.motion.resolve();this.motion=null}
    return new Promise(resolve=>{
      this.motion={playerId,from:pawn.position.clone(),to:dest,start:this.elapsed,duration:duration/1000,resolve};
    });
  }
  beginDiceView(){
    this.mode='follow';
    this.cinematicDice=true;
  }
  endDiceView(){
    this.cinematicDice=false;
    this.mode='follow';
  }
  rollDice(a,b){
    if(this.diceMotion){this.diceMotion.resolve();this.diceMotion=null}
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      this.setDice(a,b);return Promise.resolve();
    }
    // Roll on the clear central floor, above the MY CITY plaque.
    this.dice.forEach((die,i)=>{
      die.position.set(-7.3+i*1.4,1.10,6.35+i*.5);
      die.rotation.set(.08,.08,0);
    });
    return new Promise(resolve=>{
      this.diceMotion={start:this.elapsed,duration:2.0,a,b,resolve};
    });
  }
  setDice(a,b){
    [a,b].forEach((num,i)=>{
      const die=this.dice[i];
      die.material[2].map=this.faceTextures[num-1];die.material[2].needsUpdate=true;
      die.rotation.set(0,0,0);
      die.position.set(5.3+i*1.45,1.10,6.35+i*.5);
    });
  }
  setMode(mode){this.mode=mode}
  inspectSpace(index){
    const space=this.spaces[index];
    if(!space)return;
    this.mode='explore';this.exploreTarget.set(space.loc.x,.6,space.loc.z);
    this.zoom=Math.min(this.zoom,.9);
  }
  focus(playerIndex){this.focusIndex=playerIndex}
  resize(){
    const w=Math.max(100,this.container.clientWidth),h=Math.max(100,this.container.clientHeight);
    this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  }
  installInteraction(){
    const c=this.renderer.domElement,ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
    const fingers=new Map();
    let down=null,pinch=null,wasMulti=false;
    const pair=()=>{
      const [a,b]=Array.from(fingers.values());
      return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,dist:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};
    };
    const free=()=>{
      if(this.mode!=='explore'){
        this.exploreTarget.copy(this.currentCamTarget);
        this.exploreTarget.y=.6;
        this.mode='explore';
      }
    };
    const pan=(dx,dy)=>{
      free();
      const amount=this.zoom*22/Math.max(280,c.clientHeight);
      const sn=Math.sin(this.azimuth),cs=Math.cos(this.azimuth);
      this.exploreTarget.x=clamp(this.exploreTarget.x+(-dx*cs+dy*sn)*amount,-18,18);
      this.exploreTarget.z=clamp(this.exploreTarget.z+(dx*sn+dy*cs)*amount,-18,18);
    };
    c.addEventListener('contextmenu',e=>e.preventDefault());
    c.addEventListener('pointerdown',e=>{
      fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      try{c.setPointerCapture(e.pointerId)}catch{}
      if(fingers.size===1){
        down={id:e.pointerId,x:e.clientX,y:e.clientY,
          lastX:e.clientX,lastY:e.clientY,button:e.button,
          yaw:this.azimuth,elevation:this.elevation,moved:false};
        wasMulti=false;
      }else if(fingers.size===2){
        pinch=pair();wasMulti=true;down=null;free();
      }
    });
    c.addEventListener('pointermove',e=>{
      if(!fingers.has(e.pointerId))return;
      fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(fingers.size>=2 && pinch){
        const now=pair();
        this.zoom=clamp(this.zoom*pinch.dist/now.dist,.35,2.6);
        pan(now.x-pinch.x,now.y-pinch.y);
        pinch=now;return;
      }
      if(!down||down.id!==e.pointerId)return;
      const dx=e.clientX-down.x,dy=e.clientY-down.y;
      if(Math.abs(dx)+Math.abs(dy)>6)down.moved=true;
      if(down.moved){
        if(e.shiftKey||down.button===2){
          pan(e.clientX-down.lastX,e.clientY-down.lastY);
        }else{
          this.azimuth=down.yaw-dx*.008;
          this.elevation=clamp(down.elevation+dy*.006,.42,1.5);
        }
      }
      down.lastX=e.clientX;down.lastY=e.clientY;
    });
    const end=e=>{
      if(!fingers.has(e.pointerId))return;
      const tap=fingers.size===1 && down && !down.moved &&
        !wasMulti && down.button===0 && e.type==='pointerup';
      fingers.delete(e.pointerId);
      if(tap){
        const rect=c.getBoundingClientRect();
        pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
        ray.setFromCamera(pointer,this.camera);
        const hits=ray.intersectObjects(this.clickMeshes,false);
        if(hits.length&&Number.isInteger(hits[0].object.userData.index)){
          const selected=hits[0].object.userData.index;
          this.makeSelection(selected);this.inspectSpace(selected);this.onSelect(selected);
        }
      }
      if(fingers.size===2)pinch=pair();
      else {pinch=null;down=null;}
      if(fingers.size===0)wasMulti=false;
    };
    c.addEventListener('pointerup',end);
    c.addEventListener('pointercancel',end);
    c.addEventListener('wheel',e=>{
      e.preventDefault();free();
      this.zoom=clamp(this.zoom*Math.exp(e.deltaY*.001),.35,2.6);
    },{passive:false});
  }
  animate(){
    const dt=Math.min(this.clock.getDelta(),.05);this.elapsed+=dt;
    if(this.motion){
      const m=this.motion,t=clamp((this.elapsed-m.start)/m.duration,0,1),s=smooth(t),pawn=this.pawns[m.playerId];
      pawn.position.lerpVectors(m.from,m.to,s);pawn.position.y+=Math.sin(t*Math.PI)*.66;
      if(t>=1){pawn.position.copy(m.to);this.motion=null;m.resolve()}
    }
    if(this.diceMotion){
      const m=this.diceMotion,t=clamp((this.elapsed-m.start)/m.duration,0,1);
      const eased=1-Math.pow(1-t,2.3);
      this.dice.forEach((die,i)=>{
        const startX=-7.3+i*1.4,endX=5.3+i*1.45;
        const z=6.35+i*.5;
        die.position.x=lerp(startX,endX,eased);
        die.position.z=z+.25*Math.sin(t*Math.PI*3+i);
        const bounce=Math.abs(Math.sin(t*Math.PI*5+i*.35))*(1-t)*1.55;
        die.position.y=1.10+bounce;
        // Rolling rotations gradually slow before settling on the result.
        const spin=3.8*Math.PI*2*eased;
        die.rotation.set(spin*(1+i*.12),spin*(.8+i*.10),spin*.55);
      });
      if(t>=1){this.setDice(m.a,m.b);this.diceMotion=null;m.resolve()}
    }
    if(this.tinyCar){
      const time=this.elapsed*.65;
      // Drive on the inner city-loop road.
      const p=((time%32)+32)%32;
      let x,z,theta;
      if(p<8){x=-7.8+p*1.95;z=-7.8;theta=0}
      else if(p<16){x=7.8;z=-7.8+(p-8)*1.95;theta=-Math.PI/2}
      else if(p<24){x=7.8-(p-16)*1.95;z=7.8;theta=Math.PI}
      else{x=-7.8;z=7.8-(p-24)*1.95;theta=Math.PI/2}
      this.tinyCar.position.set(x,.54,z);this.tinyCar.rotation.y=theta;
    }
    const target=this.cinematicDice
      ?new THREE.Vector3((this.dice[0].position.x+this.dice[1].position.x)/2,.8,(this.dice[0].position.z+this.dice[1].position.z)/2)
      :this.mode==='overview'?new THREE.Vector3(0,.25,0)
      :this.mode==='explore'?this.exploreTarget.clone()
      :(this.pawns[this.focusIndex]?.position.clone()||new THREE.Vector3());
    if(!this.cinematicDice)target.y=this.mode==='overview'?0:.6;
    const aspect=this.camera.aspect;
    const narrow=aspect<1?1/Math.max(aspect,.47):1;
    const distance=(this.cinematicDice?11:(this.mode==='overview'?54:this.mode==='explore'?27:17))*this.zoom*
      (this.cinematicDice?Math.max(1,narrow*.6):(this.mode==='overview'?Math.max(1,narrow*.93):Math.max(1,narrow*.75)));
    const horizontal=distance*Math.cos(this.elevation),vertical=distance*Math.sin(this.elevation);
    const desired=new THREE.Vector3(target.x+horizontal*Math.sin(this.azimuth),target.y+vertical,target.z+horizontal*Math.cos(this.azimuth));
    const factor=1-Math.exp(-dt*(this.cinematicDice?5.3:this.mode==='follow'?4.1:2.3));
    if(!this.hasCameraPosition){this.camera.position.copy(desired);this.currentCamTarget.copy(target);this.hasCameraPosition=true}
    else {this.camera.position.lerp(desired,factor);this.currentCamTarget.lerp(target,factor)}
    this.camera.lookAt(this.currentCamTarget);
    // Gentle glow pulse around the currently selected cell.
    this.cursor.scale.setScalar(1+.007*Math.sin(this.elapsed*4));
    this.renderer.render(this.scene,this.camera);
  }
  dispose(){this.disposed=true;this.renderer.setAnimationLoop(null);this.resizeObserver?.disconnect();this.renderer.dispose();}
}
