import {BOARD,COLORS,PLAYER_COLORS,MONEY} from './board-data.js';
import {MyCityScene} from './scene3d.js';

const $=id=>document.getElementById(id);
const SAVE_KEY='my-city-threejs-demo-v1';
const SYMBOLS=['⚀','⚁','⚂','⚃','⚄','⚅'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const buyable=i=>['property','transport','utility'].includes(BOARD[i].type);
let game,scene,epoch=0,botTimeout=null,selected=0;

try {
  scene=new MyCityScene($('viewport'),{onSelect:i=>{selected=i;renderDetails()}});
  $('sceneLoading').hidden=true;
} catch(err) {
  $('sceneLoading').innerHTML='<div class="load-symbol">!</div><strong>3D VIEW IS UNAVAILABLE</strong><span>Your browser may not support WebGL. Try Chrome or Edge on your computer.</span>';
  console.error(err);
  throw err;
}

function makeNewGame(mode='solo'){
  const count=mode==='solo'?2:Number(mode);
  const names=mode==='solo'?['You','Computer']:Array.from({length:count},(_,i)=>'Player '+(i+1));
  return {version:1,mode,round:1,turn:0,phase:'roll',pending:-1,dice:[1,1],rollTotal:0,
    players:names.map((name,i)=>({name,cash:1500,at:0,jailed:0,bankrupt:false,bot:mode==='solo'&&i===1})),
    owners:Array(40).fill(-1),logs:['Welcome to My City! Each player starts with $1,500.'],
    message:'Roll the dice to begin your journey.',winner:null};
}
function save(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(game))}catch{}}
function load(){
  try {
    const x=JSON.parse(localStorage.getItem(SAVE_KEY));
    if(!x||x.version!==1||x.owners?.length!==40||!Array.isArray(x.players)||!['solo','2','3','4'].includes(x.mode)||x.players.length!==(x.mode==='solo'?2:Number(x.mode)))return null;
    if(x.turn<0||x.turn>=x.players.length)return null;
    if(x.players.some(p=>!Number.isInteger(p.at)||p.at<0||p.at>39||typeof p.cash!=='number'))return null;
    if(!['roll','end','decision','over'].includes(x.phase))x.phase='roll';
    return x;
  }catch{return null}
}
function reset(mode){
  epoch++;clearTimeout(botTimeout);
  game=makeNewGame(mode);
  scene.setPlayers(game.players);scene.updateOwners(game.owners);scene.focus(0);scene.updatePositions(game.players,0);
  selected=0;scene.makeSelection(selected);
  $('mode').value=mode;
  log('New '+(mode==='solo'?'solo':'local multiplayer')+' game started.');
  save();render();scheduleBot();
}
function current(){return game.players[game.turn]}
function log(msg){game.message=msg;game.logs.unshift(msg);game.logs=game.logs.slice(0,18)}
function changeCash(p,delta){
  p.cash+=delta;
  if(p.cash<0&&!p.bankrupt){p.bankrupt=true;p.cash=0;log(p.name+' has gone bankrupt.');
    const id=game.players.indexOf(p);game.owners=game.owners.map(o=>o===id?-1:o);
  }
}
function ownsSet(owner,color){return BOARD.every((s,i)=>s.type!=='property'||s.color!==color||game.owners[i]===owner)}
function rentFor(i,roll=7){
  const s=BOARD[i],owner=game.owners[i];if(owner===-1)return 0;
  if(s.type==='transport'){
    const n=BOARD.filter((other,j)=>other.type==='transport'&&game.owners[j]===owner).length;
    return 25*Math.pow(2,n-1);
  }
  if(s.type==='utility'){
    const n=BOARD.filter((other,j)=>other.type==='utility'&&game.owners[j]===owner).length;
    return roll*(n===2?10:4);
  }
  return Math.max(2,Math.round(s.price*.12))*(ownsSet(owner,s.color)?2:1);
}
function winnerCheck(){
  const alive=game.players.filter(p=>!p.bankrupt);
  if(alive.length===1){game.winner=game.players.indexOf(alive[0]);game.phase='over';log('🏆 '+alive[0].name+' won My City!');return true}
  return false;
}
function setPhase(phase){game.phase=phase;save();render()}
const CHANCE=[
  ['Pay for a car repair: $100.',-100],['Surprise bonus! Collect $150.',150],
  ['Pay a $50 ticket.',-50],['Collect $75 from a lucky find.',75],['You earned $100 from your side hustle!',100]
];
const CHEST=[
  ['Community grant: collect $100.',100],['Unexpected bill: pay $50.',-50],
  ['Birthday gift: collect $50.',50],['Home repair: pay $75.',-75],['Find $25 on the sidewalk.',25]
];
async function landed(i,roll,moveEpoch){
  const s=BOARD[i],p=current();selected=i;scene.makeSelection(i);
  if(s.type==='go'){log(p.name+' landed on GO.');}
  else if(s.type==='jail'){log(p.name+' is just visiting Jail.');}
  else if(s.type==='gojail'){
    log('🚨 '+p.name+' was sent directly to Jail!');save();render();
    await scene.movePawn(game.turn,10,820);
    if(moveEpoch!==epoch)return;
    p.at=10;p.jailed=1;selected=10;scene.makeSelection(10);
  }
  else if(s.type==='tax'){
    const amount=i===4?200:100;changeCash(p,-amount);log(p.name+' paid '+MONEY(amount)+' in '+s.name+'.');
  }
  else if(s.type==='casino'){
    const amount=Math.random()<.5?125:-75;
    changeCash(p,amount);log('🎰 Casino! '+p.name+(amount>0?' won '+MONEY(amount):' lost '+MONEY(-amount))+'.');
  }
  else if(s.type==='chance'||s.type==='chest'){
    const cards=s.type==='chance'?CHANCE:CHEST;
    const [text,amount]=cards[Math.floor(Math.random()*cards.length)];
    changeCash(p,amount);log((s.type==='chance'?'❔ ':'🎁 ')+text);
  }
  else if(buyable(i)){
    const owner=game.owners[i];
    if(owner!==-1 && owner!==game.turn){
      const price=rentFor(i,roll);
      // In this starter game rent is transferred directly to the owner.
      const payment=Math.min(price,Math.max(p.cash,0));
      changeCash(p,-price);changeCash(game.players[owner],payment);
      log(p.name+' paid '+MONEY(payment)+' rent to '+game.players[owner].name+' on '+s.name+'.');
    }
    else if(owner===game.turn)log(p.name+' owns '+s.name+'.');
    else if(p.cash>=s.price){game.pending=i;game.phase='decision';log(p.name+' can buy '+s.name+' for '+MONEY(s.price)+'.');}
    else log(p.name+' cannot afford '+s.name+'.');
  }
  scene.updateOwners(game.owners);
  if(!winnerCheck() && game.phase!=='decision')game.phase='end';
  save();render();scheduleBot();
}
async function roll(){
  if(game.phase!=='roll'||current().bankrupt||current().bot)return;
  await doRoll();
}
async function doRoll(){
  if(game.phase!=='roll'||current().bankrupt)return;
  const actor=game.turn,p=current(),thisEpoch=++epoch;
  if(p.jailed>0){
    p.jailed--;game.dice=[0,0];game.rollTotal=0;
    log(p.name+' misses this turn in Jail.');setPhase('end');scheduleBot();return;
  }
  const a=Math.floor(Math.random()*6)+1,b=Math.floor(Math.random()*6)+1,steps=a+b;
  const from=p.at;game.dice=[a,b];game.rollTotal=steps;
  scene.focus(actor);
  game.phase='moving';log(p.name+' rolled '+a+' + '+b+'. Watch the piece move!');
  $('dieA').textContent=SYMBOLS[a-1];$('dieB').textContent=SYMBOLS[b-1];
  $('diceDisplay').classList.add('rolling');
  save();render();
  try{
    await scene.rollDice(a,b);
    if(thisEpoch!==epoch)return;
    $('diceDisplay').classList.remove('rolling');
    for(let step=1;step<=steps;step++){
      const target=(from+step)%40;
      await scene.movePawn(actor,target,340);
      if(thisEpoch!==epoch)return;
      p.at=target;
      scene.updatePositions(game.players,actor);
      // Keep HUD readable while the cinematic camera follows the pawn.
      $('players').querySelectorAll('.player-sub')[actor].textContent='Moving · '+BOARD[target].name;
    }
    if(from+steps>=40){changeCash(p,200);log(p.name+' passed GO and collected $200.');}
    game.pending=-1;
    await landed(p.at,steps,thisEpoch);
  }catch(e){console.error(e);game.phase='end';log('Animation interrupted; you can end the turn.');render()}
  finally{$('diceDisplay').classList.remove('rolling')}
}
function buy(){
  if(game.phase!=='decision'||current().bot)return;
  doBuy();
}
function doBuy(){
  if(game.phase!=='decision')return;
  const i=game.pending,p=current();
  if(!buyable(i)||game.owners[i]!==-1||p.cash<BOARD[i].price)return;
  changeCash(p,-BOARD[i].price);game.owners[i]=game.turn;game.pending=-1;
  log('🏠 '+p.name+' bought '+BOARD[i].name+' for '+MONEY(BOARD[i].price)+'.');
  scene.updateOwners(game.owners);
  setPhase('end');scheduleBot();
}
function pass(){if(game.phase!=='decision'||current().bot)return;doPass()}
function doPass(){if(game.phase!=='decision')return;log(current().name+' skipped buying '+BOARD[game.pending].name+'.');game.pending=-1;setPhase('end');scheduleBot()}
function endTurn(){if(game.phase!=='end'||current().bot)return;doEndTurn()}
function doEndTurn(){
  if(game.phase!=='end')return;
  if(winnerCheck()){save();render();return}
  let next=game.turn;
  for(let k=0;k<game.players.length;k++){
    next=(next+1)%game.players.length;
    if(!game.players[next].bankrupt)break;
  }
  if(next<=game.turn)game.round++;
  game.turn=next;game.phase='roll';game.pending=-1;game.rollTotal=0;game.dice=[1,1];
  scene.focus(game.turn);
  log('It’s '+current().name+'’s turn.');save();render();scheduleBot();
}
function scheduleBot(){
  clearTimeout(botTimeout);
  if(!game||!current().bot||game.phase==='moving'||game.phase==='over')return;
  botTimeout=setTimeout(async()=>{
    if(!game||!current().bot)return;
    if(game.phase==='roll')await doRoll();
    else if(game.phase==='decision'){
      if(game.pending>=0&&current().cash>=BOARD[game.pending].price+230)doBuy();else doPass();
    }
    else if(game.phase==='end')doEndTurn();
  },900);
}
function render(){
  const actor=current(),human=!actor.bot;
  $('roundBadge').textContent='ROUND '+game.round;
  const label={roll:'ROLL',moving:'MOVING',decision:'BUY OR PASS',end:'TURN COMPLETE',over:'GAME OVER'};
  $('phaseLabel').textContent=label[game.phase]||'READY';
  $('turnTitle').textContent=game.phase==='over'?'Game over':actor.name+'’s turn';
  $('message').textContent=game.message;
  $('dieA').textContent=game.dice[0]?SYMBOLS[game.dice[0]-1]:'—';
  $('dieB').textContent=game.dice[1]?SYMBOLS[game.dice[1]-1]:'—';
  $('rollTotal').textContent=game.rollTotal?'TOTAL '+game.rollTotal:'READY TO ROLL';
  $('rollBtn').disabled=game.phase!=='roll'||!human;
  $('buyBtn').disabled=game.phase!=='decision'||!human;
  $('passBtn').disabled=game.phase!=='decision'||!human;
  $('endBtn').disabled=game.phase!=='end'||!human;
  $('buyBtn').textContent=game.phase==='decision'&&game.pending>=0?'BUY · '+MONEY(BOARD[game.pending].price):'BUY PROPERTY';
  $('players').innerHTML=game.players.map((p,i)=>{
    const props=game.owners.filter(id=>id===i).length;
    return `<div class="player ${game.turn===i?'active':''}"><span class="pawn-dot" style="--player:${PLAYER_COLORS[i]}"></span>`+
      `<div><div class="player-name">${escapeHTML(p.name)}${p.bot?' ◈':''}${p.bankrupt?' · OUT':''}</div>`+
      `<div class="player-sub">${props} properties · ${escapeHTML(BOARD[p.at].name)}</div></div><b class="player-cash">${MONEY(p.cash)}</b></div>`;
  }).join('');
  $('activity').innerHTML=game.logs.map(line=>`<li>${escapeHTML(line)}</li>`).join('');
  $('mode').value=game.mode;
  scene.updatePositions(game.players,game.turn);
  renderDetails();
}
function renderDetails(){
  if(!game)return;
  const s=BOARD[selected];
  $('spaceNumber').textContent='#'+String(selected+1).padStart(2,'0');
  $('detailTitle').textContent=s.name;
  const types={property:s.color+' property',transport:'transportation',utility:'utility',chance:'chance card',chest:'community chest',go:'start',jail:'jail / visiting',gojail:'go to jail',casino:'special event',tax:'tax'};
  $('detailType').textContent=types[s.type];
  $('detailColor').style.background=s.color?COLORS[s.color]:'#f4ca78';
  let detail='';
  if(buyable(selected)){
    const owner=game.owners[selected];detail=`Purchase: ${MONEY(s.price)} · ${owner===-1?'Currently unowned':'Owned by '+game.players[owner].name}`;
    if(owner!==-1)detail+=` · Estimated rent: ${MONEY(rentFor(selected,game.rollTotal||7))}`;
  }else{
    detail=({go:'Collect $200 when you pass GO.',jail:'Just visiting, unless sent here by Go To Jail.',
      gojail:'Go directly to Jail and miss your next turn.',tax:'Pay '+MONEY(selected===4?200:100)+' when you land here.',
      casino:'Prototype Casino: win $125 or lose $75.',chance:'Draw a random Chance card.',chest:'Draw a random Community Chest card.'})[s.type]||'';
  }
  $('detailBody').textContent=detail;
}

$('rollBtn').addEventListener('click',roll);
$('buyBtn').addEventListener('click',buy);
$('passBtn').addEventListener('click',pass);
$('endBtn').addEventListener('click',endTurn);
function changeView(mode){
  scene.setMode(mode);
  $('followView').classList.toggle('chosen',mode==='follow');$('overviewView').classList.toggle('chosen',mode==='overview');
  $('followView').setAttribute('aria-pressed',String(mode==='follow'));
  $('overviewView').setAttribute('aria-pressed',String(mode==='overview'));
  $('viewHint').textContent=mode==='follow'?'FOLLOW CAMERA':'FULL BOARD CAMERA';
}
$('followView').addEventListener('click',()=>changeView('follow'));
$('overviewView').addEventListener('click',()=>changeView('overview'));
$('restartBtn').addEventListener('click',()=>{$('dialog').hidden=false});
$('cancelDialog').addEventListener('click',()=>{$('dialog').hidden=true});
$('confirmDialog').addEventListener('click',()=>{$('dialog').hidden=true;reset($('mode').value)});
$('dialog').addEventListener('click',e=>{if(e.target===$('dialog'))$('dialog').hidden=true});
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){$('dialog').hidden=true;return}
  if(e.target?.closest('select,input,button'))return;
  if(e.key.toLowerCase()==='r'&&game.phase==='roll'&&!current().bot)roll();
  if(e.key.toLowerCase()==='v')changeView(scene.mode==='follow'?'overview':'follow');
});

game=load();
if(game){
  scene.setPlayers(game.players);scene.updateOwners(game.owners);scene.updatePositions(game.players,game.turn);scene.focus(game.turn);
  selected=game.players[game.turn].at;scene.makeSelection(selected);render();scheduleBot();
}else reset('solo');
// Public debug helpers: available only to the developer via the browser console.
window.MyCityDebug=Object.freeze({board:BOARD,getState:()=>structuredClone(game),selectSpace:i=>{if(i>=0&&i<40){selected=i;scene.makeSelection(i);renderDetails()}}});
