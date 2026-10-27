// American (double-zero) roulette table: visual preview only.
// No stakes, payouts, bets or wheel results are implemented in this phase.
// Wheel-pocket sequence and red/black numbers follow standard US roulette.
export const ROULETTE_ORIGIN = Object.freeze({x:29.0,z:0});
export const ROULETTE_WHEEL_CLOCKWISE = Object.freeze([
  '0',28,9,26,30,11,7,20,32,17,5,22,34,15,3,24,36,13,1,'00',
  27,10,25,29,12,8,19,31,18,6,21,33,16,4,23,35,14,2
]);
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const COLORS = Object.freeze({
  red:'#b12232',black:'#10171a',green:'#08734c',
  gold:'#d7b26d',cream:'#fff7dd',felt:'#105739'
});
const colorOf = n => (n==='0'||n==='00')?COLORS.green:RED.has(Number(n))?COLORS.red:COLORS.black;

function rouletteFeltTexture(THREE){
  // Draw the authentic 12-street x 3-number layout, with 0 and 00 at
  // the leading end, three 2-to-1 boxes, dozens and six outside bets.
  // Rotate the finished art to run lengthwise along the physical table.
  const W=2300,H=1280;
  const canvas=document.createElement('canvas');
  canvas.width=H;canvas.height=W;
  const g=canvas.getContext('2d');
  g.fillStyle=COLORS.felt;g.fillRect(0,0,H,W);
  g.save();
  g.translate(H/2,W/2);
  g.rotate(Math.PI/2);
  g.translate(-W/2,-H/2);

  g.fillStyle='#0d4b32';g.fillRect(50,45,W-100,H-90);
  g.strokeStyle=COLORS.gold;g.lineWidth=9;g.strokeRect(52,46,W-104,H-92);
  g.textAlign='center';g.textBaseline='middle';
  g.fillStyle=COLORS.gold;g.font='900 88px Georgia,serif';
  g.fillText('ROULETTE',W/2,141);
  g.font='700 29px Arial,sans-serif';g.letterSpacing='7px';
  g.fillText('AMERICAN DOUBLE ZERO',W/2,205);

  const left=260, top=278, cellW=142,cellH=162;
  const end=left+12*cellW,gridBottom=top+3*cellH;

  function rect(x,y,w,h,fill,label,fontSize=64,stroke=true){
    g.fillStyle=fill;g.fillRect(x+2,y+2,w-4,h-4);
    if(stroke){g.strokeStyle='#f5e5bd';g.lineWidth=5;g.strokeRect(x,y,w,h);}
    if(label!==undefined&&label!==null&&label!==''){
      g.fillStyle=COLORS.cream;g.font='900 '+fontSize+'px Arial,sans-serif';
      g.fillText(String(label),x+w/2,y+h/2,w-15);
    }
  }

  // The top row reads 3,6,9...36, as it does on the casino felt.
  for(let col=0;col<12;col++){
    for(let row=0;row<3;row++){
      const number=col*3+(3-row);
      rect(left+col*cellW,top+row*cellH,cellW,cellH,
           colorOf(number),number,70);
    }
  }

  // American table: the two green zero spaces at the end of the layout.
  rect(90,top,170,cellH*1.5,COLORS.green,'0',90);
  rect(90,top+cellH*1.5,170,cellH*1.5,COLORS.green,'00',88);

  // Column bets at the far end of each numbered row.
  for(let row=0;row<3;row++){
    rect(end,top+row*cellH,154,cellH,'#125d40','2 TO 1',38);
  }

  // Three groups of twelve (one group covers four streets).
  const dozenY=gridBottom+21, dozenH=123;
  for(let section=0;section<3;section++){
    rect(left+section*4*cellW,dozenY,4*cellW,dozenH,
         '#146648',[ '1st 12','2nd 12','3rd 12'][section],65);
  }

  // Six true outside bets, spanning two streets apiece.
  const outsideY=dozenY+dozenH+20,outsideH=126;
  const bets=[
    ['1 TO 18','#146648'],
    ['EVEN','#146648'],
    ['RED',COLORS.red],
    ['BLACK',COLORS.black],
    ['ODD','#146648'],
    ['19 TO 36','#146648']
  ];
  bets.forEach(([label,color],i)=>{
    rect(left+i*2*cellW,outsideY,2*cellW,outsideH,color,label,56);
  });
  g.fillStyle='#d7c7a4';g.font='700 27px Arial,sans-serif';
  g.fillText('38 POCKETS  •  0 / 00  •  1–36',W/2,1160);
  g.restore();

  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=8;
  return texture;
}

function wheelTexture(THREE){
  const size=2048,mid=size/2,outer=953,inner=684;
  const canvas=document.createElement('canvas');
  canvas.width=size;canvas.height=size;
  const g=canvas.getContext('2d');
  g.clearRect(0,0,size,size);
  const angleStep=Math.PI*2/ROULETTE_WHEEL_CLOCKWISE.length;
  g.textAlign='center';g.textBaseline='middle';
  ROULETTE_WHEEL_CLOCKWISE.forEach((n,i)=>{
    // Number sequence is clockwise from 0.
    const start=-Math.PI/2+i*angleStep;
    const finish=start+angleStep;
    const midAngle=(start+finish)/2;
    g.beginPath();
    g.arc(mid,mid,outer,start,finish);
    g.arc(mid,mid,inner,finish,start,true);
    g.closePath();
    g.fillStyle=colorOf(n);g.fill();
    g.strokeStyle='#d4b36e';g.lineWidth=7;g.stroke();
    g.save();
    const radius=(outer+inner)/2;
    g.translate(mid+Math.cos(midAngle)*radius,mid+Math.sin(midAngle)*radius);
    g.rotate(midAngle+Math.PI/2);
    g.fillStyle=COLORS.cream;
    g.font='900 45px Arial,sans-serif';
    g.fillText(String(n),0,0,80);
    g.restore();
  });
  const tex=new THREE.CanvasTexture(canvas);
  tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;
  return tex;
}

export function createRouletteTable(THREE){
  const group=new THREE.Group();
  group.position.set(ROULETTE_ORIGIN.x,0,ROULETTE_ORIGIN.z);
  group.name='American Roulette Table — preview';
  const wood=new THREE.MeshStandardMaterial({color:0x5c3020,roughness:.47,metalness:.07});
  const darkWood=new THREE.MeshStandardMaterial({color:0x341c16,roughness:.54});
  const brass=new THREE.MeshStandardMaterial({color:0xcca65f,metalness:.8,roughness:.27});
  const green=new THREE.MeshStandardMaterial({color:0x105739,roughness:.87});
  const goldDetail=new THREE.MeshStandardMaterial({color:0xecce83,metalness:.75,roughness:.28});
  const addBox=(w,h,d,material,x,y,z)=>{
    const item=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
    item.position.set(x,y,z);
    item.castShadow=true;item.receiveShadow=true;group.add(item);
    return item;
  };

  // Full-size miniature table, physically to the right of the city board.
  addBox(15.8,.60,35.7,darkWood,0,.33,0);
  addBox(15.35,.20,35.25,wood,0,.73,0);
  addBox(14.8,.095,34.8,brass,0,.88,0);
  addBox(14.35,.06,34.3,green,0,.964,0);
  // A subtle walnut surround and gold inset border.
  for(const x of [-7.2,7.2])addBox(.24,.18,34.4,wood,x,1.015,0);
  for(const z of [-17.2,17.2])addBox(14.4,.18,.24,wood,0,1.015,z);
  for(const x of [-7.05,7.05])addBox(.07,.035,33.95,brass,x,1.12,0);
  for(const z of [-17.02,17.02])addBox(14.1,.035,.07,brass,0,1.12,z);
  for(const x of [-6.2,6.2])for(const z of [-15.4,15.4]){
    addBox(.72,1.30,.82,darkWood,x,-.54,z);
  }

  // Real betting field drawn on felt: 0, 00, 1–36 and all outside bets.
  const felt=new THREE.Mesh(
    new THREE.PlaneGeometry(11.65,20.9),
    new THREE.MeshBasicMaterial({map:rouletteFeltTexture(THREE)})
  );
  felt.rotation.x=-Math.PI/2;
  felt.position.set(0,1.075,5.73);
  felt.receiveShadow=true;
  group.add(felt);

  // Traditional circular wheel at the far end of the same table.
  const wheel=new THREE.Group();
  wheel.position.set(0,1.04,-10.55);
  group.add(wheel);
  const rim=new THREE.Mesh(new THREE.CylinderGeometry(5.2,5.2,.28,96),wood);
  rim.position.y=.17;rim.castShadow=true;wheel.add(rim);
  const rimInner=new THREE.Mesh(new THREE.CylinderGeometry(4.85,4.85,.13,96),brass);
  rimInner.position.y=.37;wheel.add(rimInner);
  const pockets=new THREE.Mesh(
    new THREE.PlaneGeometry(9.45,9.45),
    new THREE.MeshBasicMaterial({map:wheelTexture(THREE),transparent:true})
  );
  pockets.rotation.x=-Math.PI/2;
  pockets.position.y=.46;wheel.add(pockets);
  const centerField=new THREE.Mesh(new THREE.CylinderGeometry(3.15,3.15,.13,96),wood);
  centerField.position.y=.485;wheel.add(centerField);
  const centerRing=new THREE.Mesh(new THREE.TorusGeometry(3.15,.105,10,96),brass);
  centerRing.rotation.x=Math.PI/2;centerRing.position.y=.565;wheel.add(centerRing);
  const disk=new THREE.Mesh(new THREE.CylinderGeometry(2.45,2.6,.20,72),goldDetail);
  disk.position.y=.61;wheel.add(disk);
  const inset=new THREE.Mesh(new THREE.CylinderGeometry(2.16,2.16,.035,72),darkWood);
  inset.position.y=.72;wheel.add(inset);
  const spindle=new THREE.Mesh(new THREE.CylinderGeometry(.23,.47,.87,24),brass);
  spindle.position.y=1.12;spindle.castShadow=true;wheel.add(spindle);
  const knob=new THREE.Mesh(new THREE.SphereGeometry(.28,16,12),goldDetail);
  knob.position.y=1.63;wheel.add(knob);
  for(const rad of [4.88,5.17]){
    const rail=new THREE.Mesh(new THREE.TorusGeometry(rad,.075,10,110),goldDetail);
    rail.rotation.x=Math.PI/2;
    rail.position.y=rad>5?.50:.54;
    wheel.add(rail);
  }
  // Decorative stationary ivory ball on the outer racetrack.
  const ball=new THREE.Mesh(
    new THREE.SphereGeometry(.14,16,12),
    new THREE.MeshStandardMaterial({color:0xfffdf1,roughness:.28,metalness:.03})
  );
  ball.position.set(4.48,.70,-.35);
  wheel.add(ball);

  group.userData.roulettePreviewOnly=true;
  return group;
}
