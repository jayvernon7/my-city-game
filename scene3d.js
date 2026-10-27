import * as THREE from 'three';
import { createRouletteTable, ROULETTE_ORIGIN } from './roulette3d.js';
import { BOARD, COLORS, PLAYER_COLORS, gridPosition, DEVELOPMENTS, DEMO_DEVELOPMENTS } from './board-data.js';

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
  c.strokeStyle='#000000';c.lineWidth=13;c.strokeRect(12,12,616,616);
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
// GO TO JAIL points diagonally from the top-right corner toward JAIL
// in the bottom-left corner of the physical board.
function goToJailTexture(){
  const canvas=document.createElement('canvas');
  canvas.width=640;canvas.height=640;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#f8f4e8';ctx.fillRect(0,0,640,640);
  ctx.strokeStyle='#000000';ctx.lineWidth=13;ctx.strokeRect(12,12,616,616);
  ctx.save();
  ctx.translate(320,320);
  // +135° makes a right-facing arrow point down-left, toward Jail.
  // Words rotate together with the directional arrow.
  ctx.rotate(3*Math.PI/4);
  ctx.fillStyle='#20383b';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='900 67px Arial,system-ui,sans-serif';
  ctx.fillText('GO TO',0,-110,325);
  ctx.font='900 87px Arial,system-ui,sans-serif';
  ctx.fillText('JAIL',0,-25,280);
  ctx.strokeStyle='#20383b';ctx.fillStyle='#20383b';
  ctx.lineWidth=24;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(-132,89);ctx.lineTo(100,89);ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(172,89);ctx.lineTo(75,32);ctx.lineTo(75,146);
  ctx.closePath();ctx.fill();
  ctx.restore();
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
  return texture;
}

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
  ctx.strokeStyle='#000000';ctx.lineWidth=12;ctx.strokeRect(7,7,w-14,h-14);
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

// Per-side text orientation in canonical 40-space order.
// The top row's St. Marys → University (21–29) is flipped 180°.
// Go To Jail (30) has a separately drawn diagonal arrow toward Jail.
function labelAngle(index){
  if(index>=11 && index<=20)return Math.PI/2;
  if(index>=21 && index<=29)return Math.PI;
  if(index>=31 && index<=39)return -Math.PI/2;
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
    this.pawns=[];this.spaces=[];this.clickMeshes=[];this.ownerIndicators=[];this.developmentMeshes=[];
    this.cursor=new THREE.Group();this.scene.add(this.cursor);
    this.makeLights();this.makeBoard();this.makeDevelopments(DEMO_DEVELOPMENTS);this.makeCity();this.makeDice();this.makeRouletteTable();this.makeAtmosphere();
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
    let base=box(SIDE+.25,.16,SIDE+.25,0x000000);base.position.y=.365;base.receiveShadow=true;this.scene.add(base);
    let inner=box(SIDE-2*CORNER+.05,.055,SIDE-2*CORNER+.05,0xa8d2bd);inner.position.y=.47;inner.receiveShadow=true;this.scene.add(inner);
    // Tiny inner glow-frame: physical geometry rather than a flat board screenshot.
    for(const coord of [-(SIDE-2*CORNER)/2-.02,(SIDE-2*CORNER)/2+.02]){
      let a=box(.045,.03,SIDE-2*CORNER+.08,0x000000);a.position.set(coord,.51,0);this.scene.add(a);
      let b=box(SIDE-2*CORNER+.08,.03,.045,0x000000);b.position.set(0,.51,coord);this.scene.add(b);
    }
    for(const space of BOARD){
      const i=space.index,loc=tileLocation(i),{w,d}=tileSize(i);
      const tile=box(w-.14,.18,d-.14,CREAM,.89);
      tile.position.set(loc.x,.53,loc.z);tile.receiveShadow=true;tile.castShadow=true;tile.userData.index=i;this.scene.add(tile);this.clickMeshes.push(tile);
      const texture=i===30?goToJailTexture():[0,10,20].includes(i)?textTexture(space):longTileTexture(space,i);
      // Rotate the printed text on this space without changing its tile or color band.
      texture.center.set(.5,.5);
      // Corner cards use the old square texture, so rotate those textures.
      // All other space lettering is rotated when drawn into its own canvas.
      texture.rotation=[0,10,20,30].includes(i)?labelAngle(i):0;
      texture.needsUpdate=true;
      let label=new THREE.Mesh(new THREE.PlaneGeometry(w-.17,d-.17),new THREE.MeshBasicMaterial({map:texture,transparent:false}));
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
  makeDevelopments(placements){
    // Only draw on colored property strips; never on corners, card spaces,
    // transports, taxes, or the name area of a space.
    for(const obj of this.developmentMeshes)this.scene.remove(obj);
    this.developmentMeshes=[];
    for(const {index,kind,count=1} of placements){
      const space=BOARD[index],item=this.spaces[index];
      if(!item || space?.type!=='property' || !space.color || !DEVELOPMENTS[kind])continue;
      const isHotel=kind==='hotels';
      const bandCenter=this.colorStripCenter(index);
      if(!bandCenter)continue;
      const number=Math.min(4,Math.max(1,Math.floor(count)));
      for(let j=0;j<number;j++){
        const marker=this.makeDevelopmentBlock(kind);
        const spread=(j-(number-1)/2)*.36;
        const alongX=(index>=1&&index<=9)||(index>=21&&index<=29);
        marker.position.set(
          bandCenter.x+(alongX?spread:0),
          .708,
          bandCenter.z+(alongX?0:spread)
        );
        this.scene.add(marker);
        this.developmentMeshes.push(marker);
      }
    }
  }
  colorStripCenter(index){
    const space=BOARD[index],item=this.spaces[index];
    if(!item||!space?.color)return null;
    const {loc,w,d}=item;
    if(index>=1&&index<=9)return new THREE.Vector3(loc.x,0,loc.z-d/2+.32);
    if(index>=11&&index<=19)return new THREE.Vector3(loc.x+w/2-.32,0,loc.z);
    if(index>=21&&index<=29)return new THREE.Vector3(loc.x,0,loc.z+d/2-.32);
    if(index>=31&&index<=39)return new THREE.Vector3(loc.x-w/2+.32,0,loc.z);
    return null;
  }
  makeDevelopmentBlock(kind){
    const isHotel=kind==='hotels';
    const surface=new THREE.MeshStandardMaterial({
      color:DEVELOPMENTS[kind].color,
      metalness:isHotel?.72:.85,
      roughness:isHotel?.22:.27
    });
    const trim=new THREE.MeshStandardMaterial({
      color:isHotel?0xffe09a:0xe9f0f3,
      metalness:.7,roughness:.28
    });
    const marker=new THREE.Group();
    // Miniature architectural blocks: silver low houses, gold tall hotels.
    // Narrow footprint ensures their bases remain on the color strip.
    const body=new THREE.Mesh(
      new THREE.BoxGeometry(isHotel?.36:.29,isHotel?.69:.31,isHotel?.34:.29),
      surface
    );
    body.position.y=isHotel?.345:.155;
    body.castShadow=true;body.receiveShadow=true;marker.add(body);
    const roof=new THREE.Mesh(
      new THREE.BoxGeometry(isHotel?.40:.34,isHotel?.075:.06,isHotel?.38:.33),
      trim
    );
    roof.position.y=isHotel?.728:.345;
    roof.castShadow=true;marker.add(roof);
    marker.userData.developmentKind=kind;
    return marker;
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
  makeRouletteTable(){
    this.rouletteTable=createRouletteTable(THREE);
    this.scene.add(this.rouletteTable);
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
  makeHumanPlayer(){
    // Low-poly, readable first-player character: Black man in a
    // white short-sleeve shirt, black pants and black shoes.
    const person=new THREE.Group();
    const skin=new THREE.MeshStandardMaterial({color:0x75432c,roughness:.87});
    const skinShade=new THREE.MeshStandardMaterial({color:0x653822,roughness:.88});
    const shirt=new THREE.MeshStandardMaterial({color:0xf8f8f5,roughness:.76});
    const pants=new THREE.MeshStandardMaterial({color:0x18191d,roughness:.88});
    const shoes=new THREE.MeshStandardMaterial({color:0x0c0d10,roughness:.58});
    const hair=new THREE.MeshStandardMaterial({color:0x131212,roughness:1});
    const face=new THREE.MeshStandardMaterial({color:0x1d1614,roughness:1});
    const add=(geometry,material,x,y,z,rx=0,ry=0,rz=0)=>{
      const mesh=new THREE.Mesh(geometry,material);
      mesh.position.set(x,y,z);
      mesh.rotation.set(rx,ry,rz);
      mesh.castShadow=true;
      mesh.receiveShadow=true;
      person.add(mesh);
      return mesh;
    };
    // Forward is +Z, so the shoes project toward the front.
    for(const side of [-1,1]){
      const x=side*.14;
      add(new THREE.BoxGeometry(.21,.38,.22),pants,x,.34,0);
      add(new THREE.BoxGeometry(.23,.15,.37),shoes,x,.085,.10);
      // Short sleeves end above the exposed forearms.
      add(new THREE.CylinderGeometry(.115,.13,.28,10),shirt,side*.30,1.06,0,0,0,side*.22);
      add(new THREE.CylinderGeometry(.090,.085,.31,10),skin,side*.345,.77,0,0,0,side*.10);
      add(new THREE.SphereGeometry(.088,10,8),skinShade,side*.36,.61,.015);
    }
    // Torso / white crewneck.
    add(new THREE.BoxGeometry(.48,.53,.29),shirt,0,1.07,0);
    add(new THREE.CylinderGeometry(.11,.12,.09,12),skin,0,1.40,0);
    add(new THREE.SphereGeometry(.235,18,12),skin,0,1.64,0);
    // Close-cropped black hair, with a clear face visible underneath.
    add(new THREE.SphereGeometry(.235,18,10,0,Math.PI*2,0,Math.PI*.42),hair,0,1.685,0);
    for(const side of [-1,1]){
      add(new THREE.SphereGeometry(.021,8,6),face,side*.085,1.67,.212);
    }
    add(new THREE.SphereGeometry(.030,8,6),skinShade,0,1.59,.228);
    // A small ring keeps the avatar visible among the board spaces.
    const ring=new THREE.Mesh(
      new THREE.TorusGeometry(.34,.045,7,32),
      new THREE.MeshBasicMaterial({color:0xffcb79,transparent:true,opacity:.82})
    );
    ring.rotation.x=-Math.PI/2;ring.position.y=.015;
    person.add(ring);
    return person;
  }
  makeFemalePlayer(){
    // Player 2: Black woman, long black hair, white short-sleeve
    // shirt, black pants and white shoes. Same scale as Player 1.
    const person=new THREE.Group();
    const skin=new THREE.MeshStandardMaterial({color:0x75432c,roughness:.86});
    const shirt=new THREE.MeshStandardMaterial({color:0xf8f8f5,roughness:.77});
    const pants=new THREE.MeshStandardMaterial({color:0x17191d,roughness:.88});
    const shoes=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.53});
    const hair=new THREE.MeshStandardMaterial({color:0x101014,roughness:.94});
    const face=new THREE.MeshStandardMaterial({color:0x211715,roughness:.92});
    const make=(geometry,material,x,y,z,rx=0,ry=0,rz=0)=>{
      const mesh=new THREE.Mesh(geometry,material);
      mesh.position.set(x,y,z);
      mesh.rotation.set(rx,ry,rz);
      mesh.castShadow=true;
      mesh.receiveShadow=true;
      person.add(mesh);
      return mesh;
    };
    for(const side of [-1,1]){
      const x=side*.14;
      // Separate pant legs and bright white sneakers.
      make(new THREE.BoxGeometry(.20,.38,.21),pants,x,.34,0);
      make(new THREE.BoxGeometry(.23,.15,.35),shoes,x,.085,.095);
      // White sleeves with visible brown forearms and hands.
      make(new THREE.CylinderGeometry(.11,.12,.27,10),shirt,side*.295,1.06,0,0,0,side*.23);
      make(new THREE.CylinderGeometry(.079,.075,.31,10),skin,side*.34,.78,0,0,0,side*.11);
      make(new THREE.SphereGeometry(.082,10,8),skin,side*.35,.61,.015);
      // Long hair falls past the shoulders, behind the arms.
      make(new THREE.CapsuleGeometry(.125,.52,6,10),hair,side*.205,1.235,-.145,0,0,side*-.08);
    }
    make(new THREE.BoxGeometry(.46,.52,.29),shirt,0,1.07,0);
    make(new THREE.CylinderGeometry(.108,.118,.09,12),skin,0,1.40,0);
    // Hair on the back of the head, extending down behind the shoulders.
    make(new THREE.CapsuleGeometry(.215,.43,6,12),hair,0,1.52,-.15);
    make(new THREE.SphereGeometry(.235,18,14),skin,0,1.64,.045);
    // Crown of black hair, with the face exposed.
    make(new THREE.SphereGeometry(.242,18,12,0,Math.PI*2,0,Math.PI*.45),hair,0,1.715,.005);
    for(const side of [-1,1]){
      make(new THREE.SphereGeometry(.021,8,6),face,side*.085,1.66,.265);
    }
    make(new THREE.SphereGeometry(.026,8,6),skin,0,1.59,.278);
    const ring=new THREE.Mesh(
      new THREE.TorusGeometry(.34,.045,7,32),
      new THREE.MeshBasicMaterial({color:PLAYER_COLORS[1],transparent:true,opacity:.82})
    );
    ring.rotation.x=-Math.PI/2;
    ring.position.y=.015;
    person.add(ring);
    return person;
  }
  setPlayers(players){
    this.cinematicDice=false;
    if(this.motion){this.motion.resolve();this.motion=null}
    if(this.diceMotion){this.diceMotion.resolve();this.diceMotion=null}
    for(const p of this.pawns){this.scene.remove(p);}
    this.pawns=[];
    players.forEach((p,i)=>{
      if(i===0){
        const character=this.makeHumanPlayer();
        character.position.copy(this.tokenPosition(p.at,i));
        this.scene.add(character);
        this.pawns.push(character);
        return;
      }
      if(i===1){
        const character=this.makeFemalePlayer();
        character.position.copy(this.tokenPosition(p.at,i));
        this.scene.add(character);
        this.pawns.push(character);
        return;
      }
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
    // Different cinematic throw each time: straight, curved, diagonal,
    // and opposing rolls. Keep dice inside the open central board.
    const patterns=[
      {starts:[[-7,4.8],[-7,6.5]],ends:[[6.0,4.8],[5.1,6.2]],curve:[0.3,-0.45],duration:2.0,turns:4.0},
      {starts:[[-6.6,-5.8],[-5.3,-6.8]],ends:[[5.8,5.7],[6.5,4.3]],curve:[2.0,-1.7],duration:2.3,turns:5.0},
      {starts:[[6.5,-4.4],[5.3,-6.0]],ends:[[-5.9,5.4],[-4.6,6.6]],curve:[-2.1,1.6],duration:2.15,turns:4.5},
      {starts:[[-7.0,-2.7],[7.0,2.6]],ends:[[5.9,3.2],[-5.8,-3.0]],curve:[-2.7,2.7],duration:2.4,turns:5.6},
      {starts:[[1.6,-7.0],[3.3,-6.8]],ends:[[-2.3,6.5],[1.4,6.0]],curve:[2.9,-2.3],duration:2.2,turns:4.7}
    ];
    const pattern=patterns[Math.floor(Math.random()*patterns.length)];
    this.dice.forEach((die,i)=>{
      die.position.set(pattern.starts[i][0],1.10,pattern.starts[i][1]);
      die.rotation.set(.13+i*.15,.14,0);
    });
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      this.setDice(a,b,pattern);return Promise.resolve();
    }
    return new Promise(resolve=>{
      this.diceMotion={start:this.elapsed,duration:pattern.duration,a,b,
        pattern,resolve};
    });
  }
  setDice(a,b,pattern=null){
    [a,b].forEach((num,i)=>{
      const die=this.dice[i];
      die.material[2].map=this.faceTextures[num-1];die.material[2].needsUpdate=true;
      die.rotation.set(0,0,0);
      if(pattern)die.position.set(pattern.ends[i][0],1.10,pattern.ends[i][1]);
      else die.position.y=1.10;
    });
  }
  setMode(mode){
    this.mode=mode;
    if(mode==='roulette'){
      this.zoom=1;
      this.exploreTarget.set(ROULETTE_ORIGIN.x,1.08,ROULETTE_ORIGIN.z);
    }
  }
  // Zoom to the exact roulette felt/wheel location under a pointer.
  // This works even while looking from the opposite side of the table.
  roulettePoint(clientX,clientY){
    const rect=this.renderer.domElement.getBoundingClientRect();
    if(!rect.width||!rect.height)return null;
    const pointer=new THREE.Vector2(
      ((clientX-rect.left)/rect.width)*2-1,
      -((clientY-rect.top)/rect.height)*2+1
    );
    const ray=new THREE.Raycaster();
    ray.setFromCamera(pointer,this.camera);
    const hits=ray.intersectObject(this.rouletteTable,true);
    if(hits.length)return hits[0].point;
    // The table is a flat betting surface around y=1.1; allow aiming
    // even at the tiny gaps between number boxes.
    const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-1.1);
    const point=new THREE.Vector3();
    return ray.ray.intersectPlane(plane,point)?point:null;
  }
  focusRouletteAt(x,z){
    if(!['roulette','rouletteExplore'].includes(this.mode))return;
    this.mode='rouletteExplore';
    this.exploreTarget.set(
      clamp(x,ROULETTE_ORIGIN.x-7.2,ROULETTE_ORIGIN.x+7.2),
      1.1,
      clamp(z,ROULETTE_ORIGIN.z-16.8,ROULETTE_ORIGIN.z+16.8)
    );
  }
  zoomRoulette(factor,clientX,clientY){
    if(!['roulette','rouletteExplore'].includes(this.mode))return;
    const point=Number.isFinite(clientX)&&Number.isFinite(clientY)
      ?this.roulettePoint(clientX,clientY):null;
    if(point)this.focusRouletteAt(point.x,point.z);
    else if(this.mode==='roulette')this.mode='rouletteExplore';
    this.zoom=clamp(this.zoom*factor,.055,3.25);
  }
  resetRouletteView(){
    this.setMode('roulette');
  }
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
    const c=this.renderer.domElement;
    const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
    const fingers=new Map();
    let down=null,pinch=null,wasMulti=false;
    const pair=()=>{
      const [a,b]=Array.from(fingers.values());
      return {
        x:(a.x+b.x)/2,
        y:(a.y+b.y)/2,
        dist:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),
        angle:Math.atan2(b.y-a.y,b.x-a.x)
      };
    };
    const free=()=>{
      // Preserve roulette focus when the user first interacts, without
      // unexpectedly switching from the table to the city board.
      if(this.mode==='roulette'){
        this.exploreTarget.set(ROULETTE_ORIGIN.x,1.1,ROULETTE_ORIGIN.z);
        this.mode='rouletteExplore';
      }else if(this.mode!=='explore' && this.mode!=='rouletteExplore'){
        this.exploreTarget.copy(this.currentCamTarget);
        this.exploreTarget.y=.6;
        this.mode='explore';
      }
    };
    // Map-like movement: drag the terrain with your finger/mouse.
    // Horizontal screen direction corresponds to (cos azimuth, -sin azimuth).
    // Vertical screen direction points away from the viewer on the board.
    const pan=(dx,dy)=>{
      free();
      const roulette=this.mode==='rouletteExplore';
      const amount=(this.zoom*(roulette?38:27)/Math.max(220,c.clientHeight))*
        Math.max(.6,Math.min(2,this.camera.aspect));
      const sn=Math.sin(this.azimuth),cs=Math.cos(this.azimuth);
      const xMin=roulette?ROULETTE_ORIGIN.x-7.2:-18;
      const xMax=roulette?ROULETTE_ORIGIN.x+7.2:18;
      this.exploreTarget.x=clamp(this.exploreTarget.x+(-dx*cs-dy*sn)*amount,xMin,xMax);
      this.exploreTarget.z=clamp(this.exploreTarget.z+(dx*sn-dy*cs)*amount,
        roulette?ROULETTE_ORIGIN.z-16.8:-18,
        roulette?ROULETTE_ORIGIN.z+16.8:18);
    };
    c.style.touchAction='none';
    c.addEventListener('contextmenu',e=>e.preventDefault());
    c.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse' && ![0,1,2].includes(e.button))return;
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
      if(fingers.size===2 && pinch){
        const now=pair();
        free();
        // Two fingers: spread/pinch to zoom, twist to rotate, slide to pan.
        if(this.mode==='rouletteExplore'){
          this.zoomRoulette(pinch.dist/now.dist,now.x,now.y);
        }else{
          this.zoom=clamp(this.zoom*pinch.dist/now.dist,.3,3);
        }
        let delta=now.angle-pinch.angle;
        if(delta>Math.PI)delta-=2*Math.PI;
        if(delta< -Math.PI)delta+=2*Math.PI;
        this.azimuth-=delta;
        pan(now.x-pinch.x,now.y-pinch.y);
        pinch=now;
        return;
      }
      if(fingers.size>2 || !down || down.id!==e.pointerId)return;
      const dx=e.clientX-down.x,dy=e.clientY-down.y;
      if(Math.abs(dx)+Math.abs(dy)>5)down.moved=true;
      if(down.moved){
        if(e.shiftKey || down.button===2){
          // Right-click/Shift-drag rotates and tilts like a 3D map.
          free();
          this.azimuth=down.yaw-dx*.007;
          this.elevation=clamp(down.elevation+dy*.005,.32,1.53);
        }else{
          // A normal left-click drag or one-finger swipe pans the board.
          pan(e.clientX-down.lastX,e.clientY-down.lastY);
        }
      }
      down.lastX=e.clientX;down.lastY=e.clientY;
    });
    const end=e=>{
      if(!fingers.has(e.pointerId))return;
      const tap=fingers.size===1 && down && !down.moved &&
        !wasMulti && down.button===0 && e.type==='pointerup';
      fingers.delete(e.pointerId);
      if(tap && ['roulette','rouletteExplore'].includes(this.mode)){
        // A tap on the table moves the camera target to that numbered area;
        // the next pinch/scroll zooms close enough to read the betting field.
        const target=this.roulettePoint(e.clientX,e.clientY);
        if(target)this.focusRouletteAt(target.x,target.z);
      }else if(tap){
        const rect=c.getBoundingClientRect();
        pointer.set((e.clientX-rect.left)/rect.width*2-1,
          -(e.clientY-rect.top)/rect.height*2+1);
        ray.setFromCamera(pointer,this.camera);
        const hits=ray.intersectObjects(this.clickMeshes,false);
        if(hits.length && Number.isInteger(hits[0].object.userData.index)){
          const selected=hits[0].object.userData.index;
          this.makeSelection(selected);this.inspectSpace(selected);
          this.onSelect(selected);
        }
      }
      if(fingers.size===2)pinch=pair();
      else {pinch=null;down=null;}
      if(fingers.size===0)wasMulti=false;
    };
    c.addEventListener('pointerup',end);
    c.addEventListener('pointercancel',end);
    c.addEventListener('lostpointercapture',e=>{
      fingers.delete(e.pointerId);
      if(fingers.size<2)pinch=null;
      if(down?.id===e.pointerId)down=null;
      if(fingers.size===0)wasMulti=false;
    });
    c.addEventListener('wheel',e=>{
      e.preventDefault();
      if(['roulette','rouletteExplore'].includes(this.mode)){
        this.zoomRoulette(Math.exp(e.deltaY*.001),e.clientX,e.clientY);
      }else{
        free();
        this.zoom=clamp(this.zoom*Math.exp(e.deltaY*.001),.3,3);
      }
    },{passive:false});
    // Double-click or double-tap zooms toward an inspected location.
    c.addEventListener('dblclick',e=>{
      e.preventDefault();
      const rect=c.getBoundingClientRect();
      pointer.set((e.clientX-rect.left)/rect.width*2-1,
        -(e.clientY-rect.top)/rect.height*2+1);
      ray.setFromCamera(pointer,this.camera);
      const hits=ray.intersectObjects(this.clickMeshes,false);
      free();
      if(this.mode==='rouletteExplore'){
        this.zoomRoulette(.58,e.clientX,e.clientY);
      }else{
        if(hits.length)this.exploreTarget.set(hits[0].point.x,.6,hits[0].point.z);
        this.zoom=clamp(this.zoom*.7,.3,3);
      }
    });
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
      const eased=1-Math.pow(1-t,2.4);
      const p=m.pattern;
      this.dice.forEach((die,i)=>{
        const [x0,z0]=p.starts[i],[x1,z1]=p.ends[i];
        // Quadratic Bezier curve adds a unique sideways path per throw.
        const midX=(x0+x1)/2+p.curve[i];
        const midZ=(z0+z1)/2-p.curve[i]*.65;
        const u=1-eased;
        die.position.x=u*u*x0+2*u*eased*midX+eased*eased*x1;
        die.position.z=u*u*z0+2*u*eased*midZ+eased*eased*z1;
        // Several lively bounces decrease in height and frequency.
        const hops=4+(i%2);
        const bounce=Math.abs(Math.sin(eased*Math.PI*hops+i*.18))*(1-eased)*1.85;
        die.position.y=1.10+bounce;
        const spin=p.turns*Math.PI*2*eased;
        die.rotation.set(spin*(1+i*.13),spin*(.73+i*.11),spin*(.49+i*.07));
      });
      if(t>=1){this.setDice(m.a,m.b,p);this.diceMotion=null;m.resolve()}
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
      :this.mode==='roulette'?new THREE.Vector3(ROULETTE_ORIGIN.x,.8,ROULETTE_ORIGIN.z)
      :this.mode==='overview'?new THREE.Vector3(0,.25,0)
      :['explore','rouletteExplore'].includes(this.mode)?this.exploreTarget.clone()
      :(this.pawns[this.focusIndex]?.position.clone()||new THREE.Vector3());
    if(!this.cinematicDice)target.y=this.mode==='overview'?0:
      (this.mode==='roulette'||this.mode==='rouletteExplore')?1.1:.6;
    const aspect=this.camera.aspect;
    const narrow=aspect<1?1/Math.max(aspect,.47):1;
    const distance=(this.cinematicDice?13.2:(this.mode==='roulette'?27:this.mode==='overview'?54:this.mode==='rouletteExplore'?27:this.mode==='explore'?27:17))*this.zoom*
      (this.cinematicDice?Math.max(1,narrow*.6):(this.mode==='roulette'?Math.max(1,narrow*.79):this.mode==='overview'?Math.max(1,narrow*.93):Math.max(1,narrow*.75)));
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
