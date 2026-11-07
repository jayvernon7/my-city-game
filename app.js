import {BOARD,COLORS,PLAYER_COLORS,MONEY} from './board-data.js?v=rules-20261106-final-1';
import {MyCityScene} from './scene3d.js?v=young-male-character-20261106-1';
import {createRouletteController} from './roulette-game.js?v=roulette-inside-physics-20261106-1';
import {RULES,KINDS,blockFor,capacityFor,emptyBuild,usedSpots,costFor,rentFor as calcRent,
  unexpectedForPlayer,mortgageValue,developmentResale,canBuild,canMortgage,hasBuildings} from './rules-engine.js?v=rules-20261106-final-1';

const $=id=>document.getElementById(id);
const SAVE_KEY='my-city-threejs-demo-v1';
const PIECE_KEY='my-city-solo-piece';
const COLOR_OPTIONS=[['Coral','#fb715e'],['Blue','#55a9ff'],['Green','#64dd9b'],['Purple','#d59aff'],['Yellow','#f3ca50'],['Orange','#ec9250'],['Pink','#f074b7'],['Teal','#47c6be']];
let setup=null;
const selectedPiece=()=>localStorage.getItem(PIECE_KEY)==='female'?'female':'male';
const SYMBOLS=['⚀','⚁','⚂','⚃','⚄','⚅'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const buyable=i=>['property','transport'].includes(BOARD[i].type);
const newStats=()=>({rentCollected:0,rentPaid:0,goIncome:0,bullish:0,bearish:0,unexpected:0,roulette:0,diceBets:0,trades:0,builds:0});
let game,scene,roulette,epoch=0,botTimeout=null,selected=0;

try {
  scene=new MyCityScene($('viewport'),{onSelect:i=>{
    selected=i;
    renderDetails();
    // A space can be inspected at any time, regardless of whose turn it is.
    hideLandingCard();
    showLandingCard(i);
  },onRoulette:()=>{
    // Show navigation controls without resetting the clicked camera target.
    const prompt=$('roulettePreview');
    if(prompt)prompt.hidden=false;
    hideLandingCard();
  }});
  $('sceneLoading').hidden=true;
} catch(err) {
  $('sceneLoading').innerHTML='<div class="load-symbol">!</div><strong>3D VIEW IS UNAVAILABLE</strong><span>Your browser may not support WebGL. Try Chrome or Edge on your computer.</span>';
  console.error(err);
  throw err;
}

function makeNewGame(mode='solo',selections=[]){
  const count=mode==='solo'?2:Number(mode);
  const names=mode==='solo'?['You','Computer']:Array.from({length:count},(_,i)=>'Player '+(i+1));
  return {version:2,mode,round:1,turn:0,phase:'roll',roulette:null,pending:-1,dice:[1,1],rollTotal:0,
    buildings:Array.from({length:40},emptyBuild),mortgaged:Array(40).fill(false),debt:null,doubleCount:0,bonusRoll:false,sideBets:[],
    stats:Array.from({length:count},newStats),winnerShown:false,
    players:names.map((name,i)=>({name,cash:1500,at:0,jailed:0,bankrupt:false,bot:mode==='solo'&&i===1,
      piece:selections[i]?.piece||(i===0?selectedPiece():i===1?'female':'male'),
      color:selections[i]?.color||COLOR_OPTIONS[i][1]})),
    owners:Array(40).fill(-1),logs:['Welcome to My City! Each player starts with $1,500.'],activities:[],
    message:'Roll the dice to begin your journey.',winner:null};
}
function save(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(game))}catch{}}
function load(){
  try {
    const x=JSON.parse(localStorage.getItem(SAVE_KEY));
    if(!x||![1,2].includes(x.version)||x.owners?.length!==40||!Array.isArray(x.players)||!['solo','2','3','4'].includes(x.mode)||x.players.length!==(x.mode==='solo'?2:Number(x.mode)))return null;
    if(x.turn<0||x.turn>=x.players.length)return null;
    if(x.players.some(p=>!Number.isInteger(p.at)||p.at<0||p.at>39||typeof p.cash!=='number'))return null;
    if(!Array.isArray(x.buildings)||x.buildings.length!==40)x.buildings=Array.from({length:40},emptyBuild);
    if(!Array.isArray(x.mortgaged)||x.mortgaged.length!==40)x.mortgaged=Array(40).fill(false);
    x.debt=x.debt||null;x.doubleCount=x.doubleCount||0;x.bonusRoll=!!x.bonusRoll;x.sideBets=Array.isArray(x.sideBets)?x.sideBets:[];
    x.stats=Array.isArray(x.stats)&&x.stats.length===x.players.length?x.stats:x.players.map(newStats);
    x.winnerShown=!!x.winnerShown;x.activities=Array.isArray(x.activities)?x.activities.slice(0,40):[];x.version=2;
    if(!['roll','end','decision','over','roulette','debt'].includes(x.phase))x.phase='roll';
    if(x.phase==='roulette'&&!x.roulette)x.phase='end';
    return x;
  }catch{return null}
}
function syncPlayerColors(){
  if(!game)return;
  game.players.forEach((p,i)=>{
    const valid=COLOR_OPTIONS.some(([,hex])=>hex===p.color);
    if(!valid)p.color=COLOR_OPTIONS[i%COLOR_OPTIONS.length][1];
    PLAYER_COLORS[i]=p.color;
  });
}
function showSetup(mode='solo'){
  const selectedMode=['solo','2','3','4'].includes(mode)?mode:'solo';
  clearTimeout(botTimeout);
  setup={mode:selectedMode,index:0,choices:[],draft:{piece:selectedPiece(),color:COLOR_OPTIONS[0][1]}};
  $('characterSetup').hidden=false;
  $('setupMode').value=selectedMode;
  updateSetupUI();
}
function setupCount(){return setup?.mode==='solo'?1:Number(setup?.mode||2)}
function setupDraft(index){
  const existing=setup.choices[index];
  if(existing)return {...existing};
  const used=new Set(setup.choices.slice(0,index).map(p=>p.color));
  const color=COLOR_OPTIONS.find(([,hex])=>!used.has(hex))?.[1]||COLOR_OPTIONS[0][1];
  return {piece:index===0?selectedPiece():'male',color};
}
function updateSetupUI(){
  if(!setup)return;
  const idx=setup.index;
  const name=setup.mode==='solo'?'Your Character':'Player '+(idx+1);
  $('setupTitle').textContent='Choose '+name;
  $('setupSubtitle').textContent=setup.mode==='solo'
    ?'Pick your character and color. Your shirt and owned spaces will match.'
    :'Set up each player before the game starts. Players must use different ownership colors.';
  $('setupMode').disabled=idx!==0;
  for(const button of document.querySelectorAll('#characterSetup [data-piece]')){
    button.setAttribute('aria-pressed',String(button.dataset.piece===setup.draft.piece));
  }
  const used=new Set(setup.choices.slice(0,idx).map(p=>p.color));
  $('setupColors').innerHTML=COLOR_OPTIONS.map(([name,hex])=>{
    const active=setup.draft.color===hex,unavailable=used.has(hex);
    return '<button type="button" class="setup-swatch" data-color="'+hex+'" aria-label="'+name+'" title="'+name+'" aria-pressed="'+active+'" '+(unavailable?'disabled':'')+' style="--swatch:'+hex+'"><span></span></button>';
  }).join('');
  const colorName=COLOR_OPTIONS.find(([,hex])=>hex===setup.draft.color)?.[0]||'Custom';
  $('setupPreviewTitle').textContent=(setup.draft.piece==='female'?'Female':'Male')+' • '+colorName;
  $('setupShirtPreview').setAttribute('fill',setup.draft.color);
  $('setupHair').setAttribute('d',setup.draft.piece==='female'
    ?'M17 14Q15 -3 30 0Q47 -3 45 14L49 40L41 43L40 18Q30 9 20 18L19 43L12 40Z'
    :'M19 10Q20 -3 32 2Q40 3 41 11L37 7Q30 3 23 8Z');
  $('setupBack').textContent=idx>0?'← PREVIOUS PLAYER':'← HOME';
  $('setupNext').textContent=idx+1<setupCount()?'NEXT PLAYER →':'START GAME →';
}
function submitSetup(){
  if(!setup)return;
  setup.choices[setup.index]={...setup.draft};
  if(setup.index+1<setupCount()){
    setup.index++;
    setup.draft=setupDraft(setup.index);
    updateSetupUI();
    return;
  }
  const mode=setup.mode,choices=[...setup.choices];
  if(mode==='solo'){
    const used=choices[0].color;
    const botColor=COLOR_OPTIONS.find(([,hex])=>hex!==used)?.[1]||'#55a9ff';
    choices.push({piece:'female',color:botColor});
    localStorage.setItem(PIECE_KEY,choices[0].piece);
  }
  setup=null;
  $('characterSetup').hidden=true;
  reset(mode,choices);
}
$('setupMode').addEventListener('change',()=>{
  if(!setup)return;
  setup.mode=$('setupMode').value;
  setup.choices=[];setup.index=0;setup.draft=setupDraft(0);
  updateSetupUI();
});
$('characterSetup').addEventListener('click',event=>{
  if(!setup)return;
  const piece=event.target.closest('[data-piece]');
  if(piece){
    setup.draft.piece=piece.dataset.piece;updateSetupUI();return;
  }
  const color=event.target.closest('[data-color]');
  if(color && !color.disabled){
    setup.draft.color=color.dataset.color;updateSetupUI();
  }
});
$('setupNext').addEventListener('click',submitSetup);
$('setupBack').addEventListener('click',()=>{
  if(!setup)return;
  if(setup.index>0){
    setup.index--;
    setup.draft=setupDraft(setup.index);
    updateSetupUI();
  }else if(game){
    setup=null;
    $('characterSetup').hidden=true;
    scheduleBot();
  }else{
    window.location.href='./index.html';
  }
});
function reset(mode,selections=[]){
  hideRoulettePreview();hideLandingCard();
  $('eventCard').hidden=true;
  $('rouletteGame').hidden=true;
  for(const id of ['diceBetPanel','rulesPanel','tradePanel','managePanel','debtPanel','winnerPanel'])$(id).hidden=true;
  epoch++;clearTimeout(botTimeout);
  game=makeNewGame(mode,selections);
  syncPlayerColors();
  scene.setPlayers(game.players);scene.updateOwners(game.owners);scene.focus(0);scene.updatePositions(game.players,0);
  selected=0;scene.makeSelection(selected);
  $('mode').value=mode;
  $('soloPiece').value=game.players[0].piece||'male';
  log('New '+(mode==='solo'?'solo':'local multiplayer')+' game started.');
  save();render();scheduleBot();
}
function current(){return game.players[game.turn]}
// Separate player-action feed. Keep informational messages (rolls, movement,
// turns, ordinary landings) out of the feed while retaining the HUD message.
function activityFromLog(message){
  const plain=String(message).replace(/^[^\p{L}\p{N}]+/u,'').trim();
  const players=[...game.players].sort((a,b)=>b.name.length-a.name.length);
  const actor=players.find(p=>plain.startsWith(p.name+' '));
  if(!actor)return null;
  const action=plain.slice(actor.name.length).trim();
  // Only meaningful actions and financial changes; never movement or dice rolls.
  if(!/^(?:bought |paid |earned |passed GO and collected |sold |mortgaged |unmortgaged |added |developed |wagered |won |lost |settled |is bankrupt|resigned|was sent directly to Jail)/i.test(action))return null;
  if(/\brolled\b/i.test(action))return null;
  return {name:actor.name,action:action.replace(/[.!]+$/,'')};
}
function recordActivity(name,action){
  if(!game.activities)game.activities=[];
  game.activities.unshift({name,action});
  game.activities=game.activities.slice(0,40);
}
function log(msg){
  game.message=msg;
  game.logs.unshift(msg);
  game.logs=game.logs.slice(0,18);
  const event=activityFromLog(msg);
  if(event)recordActivity(event.name,event.action);
}
function changeCash(p,delta){p.cash=Math.max(0,p.cash+delta)}
function rentFor(i){return calcRent(game,BOARD,i)}
function winnerCheck(){
  if(game.winner!==null)return true;
  const rich=game.players.findIndex(p=>!p.bankrupt&&p.cash>=RULES.winCash);
  const alive=game.players.filter(p=>!p.bankrupt);
  if(rich>=0||alive.length===1){
    game.winner=rich>=0?rich:game.players.indexOf(alive[0]);
    game.phase='over';
    log('🏆 '+game.players[game.winner].name+' won MY CITY'+(rich>=0?' with '+MONEY(game.players[rich].cash)+'!':'!'));
    return true;
  }
  return false;
}
function redrawAssets(){
  scene.updateOwners(game.owners);
  if($('managePanel')&&!$('managePanel').hidden)renderManage();
}
function recordPayment(payerId,creditor,amount,reason){
  if(!game.stats||!Number.isInteger(payerId))return;
  const stats=game.stats[payerId];
  if(reason.startsWith('rent on')){
    stats.rentPaid+=amount;
    if(Number.isInteger(creditor)&&creditor>=0)game.stats[creditor].rentCollected+=amount;
  }else if(reason.startsWith('Unexpected Expense'))stats.unexpected+=amount;
  else if(reason.startsWith('Bearish'))stats.bearish+=amount;
}
function resolvePayment(amount,creditor,reason){
  if(amount<=0)return true;
  if(current().cash>=amount){
    current().cash-=amount;
    if(Number.isInteger(creditor)&&creditor>=0)game.players[creditor].cash+=amount;
    recordPayment(game.turn,creditor,amount,reason);
    log(current().name+' paid '+MONEY(amount)+' for '+reason+'.');
    winnerCheck();
    return true;
  }
  game.debt={amount,creditor,reason};game.phase='debt';
  log('⚠ '+current().name+' owes '+MONEY(amount)+' for '+reason+'. Raise money or declare bankruptcy.');
  return false;
}
function liquidateForDebt(){
  if(game.phase!=='debt'||!game.debt)return;
  const id=game.turn,p=current(),target=game.debt.amount;
  for(const kind of KINDS){
    for(let i=0;i<40&&p.cash<target;i++){
      while(game.owners[i]===id&&game.buildings[i][kind]>0&&p.cash<target){
        game.buildings[i][kind]--;p.cash+=developmentResale(i,kind);
        log('💵 '+p.name+' sold '+RULES.developments[kind].label+' at '+BOARD[i].name+' to cover debt.');
      }
    }
  }
  for(let i=0;i<40&&p.cash<target;i++){
    if(game.owners[i]===id&&canMortgage(game,BOARD,i,id)){
      game.mortgaged[i]=true;p.cash+=mortgageValue(BOARD[i]);
      log('🏦 '+p.name+' mortgaged '+BOARD[i].name+' to cover debt.');
    }
  }
  redrawAssets();
}
function bankruptCurrent(){
  const payer=current(),id=game.turn,debt=game.debt;
  if(!debt||game.phase!=='debt')return;
  liquidateForDebt();
  if(payer.cash>=debt.amount){payDebt();return}
  const creditor=debt.creditor,validCreditor=Number.isInteger(creditor)&&creditor>=0;
  if(validCreditor){
    game.players[creditor].cash+=payer.cash;
    game.owners.forEach((owner,i)=>{
      if(owner===id){game.owners[i]=creditor;game.buildings[i]=emptyBuild()}
    });
  }else{
    game.owners.forEach((owner,i)=>{
      if(owner===id){game.owners[i]=-1;game.mortgaged[i]=false;game.buildings[i]=emptyBuild()}
    });
  }
  payer.cash=0;payer.bankrupt=true;game.debt=null;game.bonusRoll=false;game.phase='end';
  log('💥 '+payer.name+' is bankrupt. '+(validCreditor?'Remaining assets transferred to '+game.players[creditor].name+'.':'Properties returned to the market.'));
  $('debtPanel').hidden=true;$('managePanel').hidden=true;
  redrawAssets();winnerCheck();save();render();scheduleBot();
}
function handleDebtBot(){
  if(game.phase!=='debt')return;
  liquidateForDebt();
  if(current().cash>=game.debt.amount)payDebt();else bankruptCurrent();
}
function payDebt(){
  if(game.phase!=='debt'||!game.debt||current().cash<game.debt.amount)return;
  const {amount,creditor,reason}=game.debt;
  current().cash-=amount;
  if(Number.isInteger(creditor)&&creditor>=0)game.players[creditor].cash+=amount;
  recordPayment(game.turn,creditor,amount,reason);
  log('✅ '+current().name+' settled '+MONEY(amount)+' for '+reason+'.');
  game.debt=null;game.phase=game.bonusRoll?'roll':'end';game.bonusRoll=false;
  $('debtPanel').hidden=true;winnerCheck();save();render();scheduleBot();
}
function setPhase(phase){game.phase=phase;save();render()}
function renderOwnedProperties(){
  const panel=$('ownedPropertiesPanel');
  if(!panel || panel.hidden || !game)return;
  const player=current();
  const entries=BOARD.filter((space,index)=>game.owners[index]===game.turn);
  $('ownedPropertiesTitle').textContent=player.name+'’s Properties';
  $('ownedPropertiesCount').textContent=entries.length+' '+(entries.length===1?'property':'properties')+' owned';
  const list=$('ownedPropertiesList');
  if(!entries.length){
    list.innerHTML='<div class="owned-properties-empty">No properties owned yet.</div>';
    return;
  }
  list.innerHTML=entries.map(space=>{
    const type=space.type==='transport'?'Car Shop':'Property';
    const color=PLAYER_COLORS[game.turn];
    return '<div class="owned-property">'+
      '<span class="owned-property-swatch" style="background:'+color+'"></span>'+
      '<div><div class="owned-property-name">'+escapeHTML(space.name)+'</div>'+
      '<div class="owned-property-sub">'+type+' · Space '+(space.index+1)+'</div></div>'+
      '<span class="owned-property-price">'+MONEY(space.price)+'</span></div>';
  }).join('');
}
function setOwnedPropertiesOpen(open){
  const panel=$('ownedPropertiesPanel');
  panel.hidden=!open;
  $('ownedPropertiesBtn').setAttribute('aria-expanded',String(open));
  if(open)renderOwnedProperties();
}
function hideRoulettePreview(){
  const prompt=$('roulettePreview');
  if(prompt)prompt.hidden=true;
}
function showRoulettePreview(){
  const prompt=$('roulettePreview');
  if(!prompt)return;
  prompt.hidden=false;
  scene.setMode('roulette');
  $('followView').classList.remove('chosen');
  $('overviewView').classList.remove('chosen');
  $('followView').setAttribute('aria-pressed','false');
  $('overviewView').setAttribute('aria-pressed','false');
}
function hideLandingCard(){const card=$('landingCard');if(card)card.hidden=true}
function hideEventCard(){ $('eventCard').hidden=true }
function showEventCard(type,playerName,amount,description){
  const gain=amount>=0;
  $('eventCard').classList.toggle('bullish',gain);
  $('eventCard').classList.toggle('bearish',!gain);
  $('eventCardType').textContent=type.toUpperCase();
  $('eventCardPlayer').textContent=playerName;
  $('eventCardAmount').textContent=(gain?'+':'−')+MONEY(Math.abs(amount));
  $('eventCardDescription').textContent=description;
  $('eventCard').hidden=false;
}
function showLandingCard(index){
  const space=BOARD[index];
  // Only purchasable street properties and Car Shops get a card.
  // Excludes GO, Jail, Casino, Go To Jail, both utilities,
  // Community Chest, Chance, and all tax spaces.
  if(!space||!['property','transport'].includes(space.type))return;
  const card=$('landingCard');if(!card)return;
  $('landingCardName').textContent=space.name;
  $('landingCardType').textContent=space.type==='transport'?'CAR SHOP':'PROPERTY';
  const owner=game.owners[index];
  $('landingCardStripe').style.background=owner>=0?PLAYER_COLORS[owner]:'#ffffff';
  $('landingCardPrice').textContent=MONEY(space.price);
  $('landingCardRent').textContent=owner>=0?MONEY(rentFor(index,game.rollTotal||7)):
    MONEY(space.type==='transport'?25:Math.max(2,Math.round(space.price*.10)));
  $('landingCardOwner').textContent=owner<0?'AVAILABLE TO BUY':
    'OWNED BY '+game.players[owner].name;
  card.hidden=false;
}
// Placeholder event amounts until the economy is balanced.
const BEARISH=[
  ['Pay for a car repair: $100.',-100],['Pay a $50 ticket.',-50],
  ['Unexpected penalty: pay $75.',-75]
];
const BULLISH=[
  ['Community grant: collect $100.',100],['Birthday gift: collect $50.',50],
  ['Find $25 on the sidewalk.',25]
];
async function landed(i,roll,moveEpoch){
  const s=BOARD[i],p=current();selected=i;scene.makeSelection(i);
  if(s.type==='go'){log(p.name+' landed on GO.');}
  else if(s.type==='jail'){log(p.name+' is just visiting Jail.');}
  else if(s.type==='gojail'){
    game.bonusRoll=false;game.doubleCount=0;
    log('🚨 '+p.name+' was sent directly to Jail!');save();render();
    await scene.escortToJail(game.turn);
    if(moveEpoch!==epoch)return;
    p.at=10;p.jailed=1;selected=10;scene.makeSelection(10);
    scene.updatePositions(game.players,game.turn);
  }
  else if(s.type==='freeparking'){
    log(p.name+' landed on Free Parking. No payment or action.');
  }
  else if(s.type==='casino'){
    log('🎰 '+p.name+' landed on Casino and can play a private roulette spin!');
    roulette.start(game.turn,{onlyPlayers:[game.turn],roundEnd:false});
  }
  else if(s.type==='bullish'||s.type==='bearish'){
    const cards=s.type==='bullish'?BULLISH:BEARISH;
    const [text,amount]=cards[Math.floor(Math.random()*cards.length)];
    if(amount>=0){changeCash(p,amount);game.stats[game.turn].bullish+=amount;log('📈 '+p.name+' earned '+MONEY(amount)+'. '+text)}
    else resolvePayment(-amount,null,'Bearish: '+text);
    showEventCard(s.type,p.name,amount,text);
  }
  else if(s.type==='expense'){
    const expense=unexpectedForPlayer(game,game.turn);
    if(expense>0)resolvePayment(expense,null,'Unexpected Expense');
    else log('🚨 '+p.name+' had no developments to charge on Unexpected Expense.');
  }
  else if(buyable(i)){
    const owner=game.owners[i];
    if(owner!==-1 && owner!==game.turn){
      const price=rentFor(i,roll);
      if(price>0)resolvePayment(price,owner,'rent on '+s.name);
      else log(p.name+' landed on mortgaged '+s.name+'; no rent charged.');
    }
    else if(owner===game.turn)log(p.name+' owns '+s.name+'.');
    else if(p.cash>=s.price){game.pending=i;game.phase='decision';log(p.name+' can buy '+s.name+' for '+MONEY(s.price)+'.');}
    else log(p.name+' cannot afford '+s.name+'.');
  }
  scene.updateOwners(game.owners);
  if(!winnerCheck() && game.phase!=='decision'&&game.phase!=='debt'&&game.phase!=='roulette')game.phase=game.bonusRoll?'roll':'end';
  save();render();showLandingCard(i);scheduleBot();
}
async function roll(){
  if(game.phase!=='roll'||current().bankrupt||current().bot)return;
  await doRoll();
}
async function doRoll(){
  if(game.phase!=='roll'||current().bankrupt)return;
  hideLandingCard();hideRoulettePreview();hideEventCard();
  const actor=game.turn,p=current(),thisEpoch=++epoch;
  const a=Math.floor(Math.random()*6)+1,b=Math.floor(Math.random()*6)+1,steps=a+b;
  settleDiceBets(steps);
  if(game.phase==='over'){save();render();return;}
  if(p.jailed>0){
    if(a===b){
      p.jailed=0;game.doubleCount=0;game.bonusRoll=false;
      log('🎲 '+p.name+' rolled doubles and escaped Jail!');
      scene.setJailCage(actor,false);
    }else{
      p.jailed++;
      game.dice=[a,b];game.rollTotal=steps;
      if(p.jailed>3){
        // Third unsuccessful attempt: jail fee becomes a payable obligation.
        p.jailed=0;game.bonusRoll=false;
        scene.setJailCage(actor,false);
        const paid=resolvePayment(RULES.jailFee,null,'Jail release after three attempts');
        if(!paid){save();render();scheduleBot();return;}
        log(p.name+' served three failed Jail rolls and paid '+MONEY(RULES.jailFee)+'.');
      }else{
        log('🔒 '+p.name+' did not roll doubles and remains in Jail (attempt '+p.jailed+'/3).');
        game.phase='end';save();render();scheduleBot();return;
      }
    }
  }else if(a===b){
    game.doubleCount++;
    if(game.doubleCount>=3){
      game.bonusRoll=false;game.doubleCount=0;
      game.phase='moving';log('🚓 Three doubles in a row! '+p.name+' goes directly to Jail.');
      save();render();
      await scene.escortToJail(actor);
      if(thisEpoch!==epoch)return;
      p.at=10;p.jailed=1;selected=10;scene.makeSelection(10);
      game.phase='end';save();render();scheduleBot();return;
    }
    game.bonusRoll=true;
  }else{game.doubleCount=0;game.bonusRoll=false;}
  const from=p.at;game.dice=[a,b];game.rollTotal=0;
  scene.focus(actor);
  game.phase='moving';log(p.name+' rolled '+a+' + '+b+'. Watch the dice, then follow the piece!');
  $('diceDisplay').classList.add('rolling');
  save();render();
  try{
    // First sweep the camera to the physical dice, then animate them.
    scene.beginDiceView();
    await sleep(650);
    if(thisEpoch!==epoch)return;
    await scene.rollDice(a,b);
    if(thisEpoch!==epoch)return;
    game.rollTotal=steps;
    $('diceDisplay').classList.remove('rolling');
    render();save();
    // Hold the result briefly before the camera follows the player's pawn.
    await sleep(360);
    if(thisEpoch!==epoch)return;
    scene.endDiceView();
    await sleep(410);
    if(thisEpoch!==epoch)return;
    for(let step=1;step<=steps;step++){
      const target=(from+step)%40;
      await scene.movePawn(actor,target,340);
      if(thisEpoch!==epoch)return;
      p.at=target;
      scene.updatePositions(game.players,actor);
      // Keep HUD readable while the cinematic camera follows the pawn.
      $('players').querySelectorAll('.player-sub')[actor].textContent='Moving · '+BOARD[target].name;
    }
    if(from+steps>=40){
      changeCash(p,RULES.go);game.stats[actor].goIncome+=RULES.go;
      log(p.name+' passed GO and collected '+MONEY(RULES.go)+'.');
      if(winnerCheck()){save();render();return}
    }
    game.pending=-1;
    await landed(p.at,steps,thisEpoch);
    if(thisEpoch!==epoch)return;
    // Roulette is only offered after the last active player ends their turn.
  }catch(e){console.error(e);game.phase='end';log('Animation interrupted; you can end the turn.');render()}
  finally{
    $('diceDisplay').classList.remove('rolling');
    // Clear cinematic mode if an animation was cancelled or a new game started.
    if(thisEpoch===epoch && scene.cinematicDice)scene.endDiceView();
  }
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
  showLandingCard(i);
  setPhase(game.bonusRoll?'roll':'end');scheduleBot();
}
function pass(){if(game.phase!=='decision'||current().bot)return;doPass()}
function doPass(){if(game.phase!=='decision')return;log(current().name+' skipped buying '+BOARD[game.pending].name+'.');game.pending=-1;setPhase(game.bonusRoll?'roll':'end');scheduleBot()}
function endTurn(){if(game.phase!=='end'||current().bot)return;doEndTurn()}
function advanceAfterRoulette(next,roundEnd=true){
  if(winnerCheck()){save();render();return}
  if(!roundEnd){
    game.phase=game.bonusRoll?'roll':'end';
    scene.focus(game.turn);
    log('🎰 Private Casino roulette finished. '+current().name+' may continue their turn.');
    save();render();scheduleBot();return;
  }
  game.round++;
  game.turn=next;game.phase='roll';game.pending=-1;game.rollTotal=0;game.dice=[1,1];game.doubleCount=0;game.bonusRoll=false;
  scene.focus(game.turn);
  log('🎲 Roulette finished. Round '+game.round+' begins with '+current().name+'.');
  save();render();scheduleBot();
}
function doEndTurn(){
  if(game.phase!=='end')return;
  hideRoulettePreview();hideLandingCard();
  if(winnerCheck()){save();render();return}
  let next=game.turn;
  for(let k=0;k<game.players.length;k++){
    next=(next+1)%game.players.length;
    if(!game.players[next].bankrupt)break;
  }
  if(next<=game.turn){
    roulette.start(next);
    return;
  }
  game.turn=next;game.phase='roll';game.pending=-1;game.rollTotal=0;game.dice=[1,1];
  scene.focus(game.turn);
  log('It’s '+current().name+'’s turn.');save();render();scheduleBot();
}
function canManage(){
  return game&&!setup&&!current().bot&&!current().bankrupt&&!['moving','roulette','over'].includes(game.phase);
}
function openManage(index=null){
  if(!canManage())return;
  $('debtPanel').hidden=true;$('tradePanel').hidden=true;
  $('managePanel').hidden=false;
  renderManage(index);
}
function renderManage(index=null){
  const ids=BOARD.filter((s,i)=>game.owners[i]===game.turn).map(s=>s.index);
  const currentIndex=index!==null?index:Number($('manageProperty').value);
  $('manageProperty').innerHTML=ids.map(i=>'<option value="'+i+'">'+escapeHTML(BOARD[i].name)+'</option>').join('');
  if(ids.includes(currentIndex))$('manageProperty').value=String(currentIndex);
  else if(ids.length)$('manageProperty').value=String(ids[0]);
  $('manageProperty').disabled=!ids.length;
  $('manageHelp').textContent=ids.length?'Develop, sell improvements, mortgage, or trade your spaces.':'You do not own any spaces yet.';
  $('manageDebt').hidden=game.phase!=='debt';
  if(game.phase==='debt')$('manageDebt').textContent='PAYMENT DUE: '+MONEY(game.debt.amount)+' • CASH AVAILABLE: '+MONEY(current().cash);
  const i=Number($('manageProperty').value),space=BOARD[i];
  $('manageButtons').innerHTML='';
  if(!ids.length){$('manageDetails').textContent='Purchase a property or Car Shop to manage it.';return}
  const dev=game.buildings[i],mortgaged=game.mortgaged[i];
  const stats=KINDS.map(k=>RULES.developments[k].label+': '+(dev[k]||0)).join(' • ');
  $('manageDetails').textContent=space.name+' • Block '+(blockFor(i)+1)+' • '+(space.type==='property'?usedSpots(dev)+'/'+capacityFor(i)+' slots • '+stats:'Car Shop')
    +' • Current Rent: '+MONEY(rentFor(i))+' • '+(mortgaged?'MORTGAGED':'ACTIVE');
  function addButton(label,action,kind='',disabled=false){
    const el=document.createElement('button');
    el.textContent=label;el.dataset.action=action;el.dataset.kind=kind;
    el.type='button';el.disabled=disabled;$('manageButtons').appendChild(el);
  }
  if(space.type==='property'){
    for(const kind of KINDS){
      const label=RULES.developments[kind].label;
      addButton('ADD '+label+' • '+MONEY(costFor(i,kind)),'build',kind,!canBuild(game,BOARD,i,kind,game.turn)||game.phase==='debt');
      addButton('SELL '+label+' • +'+MONEY(developmentResale(i,kind)),'sell',kind,!(dev[kind]>0));
    }
  }
  addButton('MORTGAGE • +'+MONEY(mortgageValue(space)),'mortgage','',!canMortgage(game,BOARD,i,game.turn));
  addButton('UNMORTGAGE • '+MONEY(Math.ceil(mortgageValue(space)*1.1)),'unmortgage','',!mortgaged||current().cash<Math.ceil(mortgageValue(space)*1.1)||game.phase==='debt');
}
function performManage(action,kind){
  if(!canManage())return;
  const i=Number($('manageProperty').value),p=current();
  if(game.owners[i]!==game.turn)return;
  if(action==='build'&&canBuild(game,BOARD,i,kind,game.turn)){
    p.cash-=costFor(i,kind);game.buildings[i][kind]++;game.stats[game.turn].builds++;
    log('🏠 '+p.name+' added a '+RULES.developments[kind].label+' to '+BOARD[i].name+'.');
  }else if(action==='sell'&&game.buildings[i]?.[kind]>0){
    game.buildings[i][kind]--;p.cash+=developmentResale(i,kind);
    log('💵 '+p.name+' sold a '+RULES.developments[kind].label+' on '+BOARD[i].name+'.');
  }else if(action==='mortgage'&&canMortgage(game,BOARD,i,game.turn)){
    game.mortgaged[i]=true;p.cash+=mortgageValue(BOARD[i]);
    log('🏦 '+p.name+' mortgaged '+BOARD[i].name+'.');
  }else if(action==='unmortgage'&&game.mortgaged[i]&&game.phase!=='debt'){
    const due=Math.ceil(mortgageValue(BOARD[i])*1.1);
    if(p.cash<due)return;p.cash-=due;game.mortgaged[i]=false;
    log('🏦 '+p.name+' unmortgaged '+BOARD[i].name+'.');
  }else return;
  renderManage(i);save();render();winnerCheck();save();render();
}
function openTrade(){
  if(!canManage())return;
  $('managePanel').hidden=true;$('debtPanel').hidden=true;
  $('tradePanel').hidden=false;
  $('tradeError').textContent='';
  const actor=game.turn;
  $('tradeFrom').innerHTML='<option value="'+actor+'">'+escapeHTML(current().name)+'</option>';
  const options=game.players.map((p,id)=>!p.bankrupt&&id!==actor?'<option value="'+id+'">'+escapeHTML(p.name)+'</option>':'').join('');
  $('tradeTo').innerHTML=options;
  $('tradePay').value='0';$('tradeGet').value='0';
  renderTradeOptions();
}
function renderTradeOptions(){
  if($('tradePanel').hidden)return;
  const from=game.turn,to=Number($('tradeTo').value);
  const make=(owner)=>'<option value="">No property</option>'+BOARD.filter((s,i)=>game.owners[i]===owner)
    .map(s=>'<option value="'+s.index+'">'+escapeHTML(s.name)+(game.mortgaged[s.index]?' (mortgaged)':'')+'</option>').join('');
  $('tradeGive').innerHTML=make(from);$('tradeReceive').innerHTML=make(to);
}
function submitTrade(){
  if(!canManage())return;
  const from=game.turn,to=Number($('tradeTo').value);
  const give=$('tradeGive').value===''?null:Number($('tradeGive').value);
  const take=$('tradeReceive').value===''?null:Number($('tradeReceive').value);
  const pay=Number($('tradePay').value),get=Number($('tradeGet').value);
  const error=$('tradeError');
  error.textContent='';
  if(!Number.isInteger(to)||to<0||to>=game.players.length||to===from||game.players[to].bankrupt){
    error.textContent='Choose another active player.';return;
  }
  if((give===null&&take===null)||!Number.isInteger(pay)||!Number.isInteger(get)||pay<0||get<0){
    error.textContent='Select at least one property and use valid nonnegative cash amounts.';return;
  }
  if(pay>current().cash||get>game.players[to].cash){
    error.textContent='A player cannot offer more cash than they have.';return;
  }
  if(give!==null&&(game.owners[give]!==from||hasBuildings(game,give))||
     take!==null&&(game.owners[take]!==to||hasBuildings(game,take))){
    error.textContent='Only owned spaces without developments may be traded. Sell improvements first.';return;
  }
  const description=current().name+' offers '+(give!==null?BOARD[give].name+' + ':'')+MONEY(pay)
    +' for '+(take!==null?BOARD[take].name+' + ':'')+MONEY(get)+'.';
  const accepted=game.players[to].bot
    ?(take===null&&pay>=(give===null?0:BOARD[give].price))||
      (take!==null&&pay>=BOARD[take].price*1.25+(get||0))
    :window.confirm(game.players[to].name+': Accept this offer?\n\n'+description+'\n\nOK = Accept • Cancel = Decline');
  if(!accepted){
    log('🤝 '+game.players[to].name+' declined the offer.');
    error.textContent='Offer declined. Adjust the terms to make a counteroffer.';
    save();render();return;
  }
  current().cash+=get-pay;game.players[to].cash+=pay-get;
  if(give!==null)game.owners[give]=to;
  if(take!==null)game.owners[take]=from;
  game.stats[from].trades++;game.stats[to].trades++;
  log('🤝 DEAL ACCEPTED! '+description);
  recordActivity(current().name,'completed a trade with '+game.players[to].name);
  recordActivity(game.players[to].name,'completed a trade with '+current().name);
  redrawAssets();$('tradePanel').hidden=true;
  save();render();winnerCheck();save();render();
  if(game.phase==='debt')$('debtPanel').hidden=false;
}
function showDebtUI(){
  const active=game?.phase==='debt'&&!!game.debt;
  $('debtPanel').hidden=!active||!$('managePanel').hidden||!$('tradePanel').hidden;
  if(!active)return;
  $('debtTitle').textContent=current().name+' • PAYMENT DUE';
  $('debtSummary').textContent='You owe '+MONEY(game.debt.amount)+' for '+game.debt.reason+'. Current cash: '+MONEY(current().cash)
    +'. Sell developments, mortgage property, or negotiate a trade to raise funds.';
  $('debtPay').disabled=current().cash<game.debt.amount;
}
$('manageBtn').addEventListener('click',()=>{
  setOwnedPropertiesOpen(false);
  openManage();
});
$('tradeBtn').addEventListener('click',()=>{
  setOwnedPropertiesOpen(false);
  openTrade();
});
$('rulesBtn').addEventListener('click',()=>{
  document.body.classList.remove('settings-open');
  $('settingsToggle').setAttribute('aria-expanded','false');
  $('rulesPanel').hidden=false;
});
$('closeRules').addEventListener('click',()=>{$('rulesPanel').hidden=true});
$('closeManage').addEventListener('click',()=>{$('managePanel').hidden=true;showDebtUI()});
$('closeTrade').addEventListener('click',()=>{$('tradePanel').hidden=true;showDebtUI()});
$('openMyProperties').addEventListener('click',()=>{$('managePanel').hidden=true;setOwnedPropertiesOpen(true);showDebtUI()});
$('openTrade').addEventListener('click',openTrade);
$('manageProperty').addEventListener('change',()=>renderManage());
$('manageButtons').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-action]');if(btn)performManage(btn.dataset.action,btn.dataset.kind)
});
$('tradeTo').addEventListener('change',renderTradeOptions);
$('tradeOffer').addEventListener('click',submitTrade);
$('tradeCounter').hidden=true;
$('debtManage').addEventListener('click',()=>openManage());
$('debtPay').addEventListener('click',payDebt);
$('debtBankrupt').addEventListener('click',()=>{
  if(window.confirm('Declare bankruptcy and leave the game? Try selling, mortgaging, or trading first.'))bankruptCurrent()
});
function autoInvestBot(){
  const id=game.turn;
  if(!current().bot||current().cash<450)return;
  const owned=BOARD.filter((s,i)=>game.owners[i]===id&&s.type==='property');
  if(!owned.length)return;
  const i=owned[Math.floor(Math.random()*owned.length)].index;
  const kind=current().cash>700?'apartment':'house';
  if(canBuild(game,BOARD,i,kind,id)){
    current().cash-=costFor(i,kind);game.buildings[i][kind]++;game.stats[id].builds++;
    log('🏗️ '+current().name+' developed '+BOARD[i].name+'.');
  }
}
function openDiceBet(){
  if(!game||setup||game.phase!=='roll'||current().bot)return;
  const users=game.players.map((p,i)=>p.bankrupt?'':('<option value="'+i+'">'+escapeHTML(p.name)+' ('+MONEY(p.cash)+')</option>')).join('');
  $('diceBetPlayer').innerHTML=users;
  $('diceBetAgainst').innerHTML=users;
  $('diceBetPlayer').value=String(game.turn);
  $('diceBetAgainst').value=String(game.players.findIndex((p,i)=>i!==game.turn&&!p.bankrupt));
  $('diceBetAmount').value='25';$('diceBetSide').value='high';$('diceBetError').textContent='';
  $('diceBetPanel').hidden=false;
  updateDiceBetQueue();
}
function updateDiceBetQueue(){
  const bets=game?.sideBets||[];
  $('diceBetQueue').textContent=bets.length?'Pending wagers: '+bets.map(b=>game.players[b.from].name+' vs '+game.players[b.to].name+' • '+MONEY(b.amount)+' each • '+b.side).join('; '):'No side bets for the upcoming roll.';
}
function placeDiceBet(){
  if(game.phase!=='roll'||current().bot)return;
  const from=Number($('diceBetPlayer').value),to=Number($('diceBetAgainst').value);
  const amount=Number($('diceBetAmount').value),side=$('diceBetSide').value;
  if(!Number.isInteger(from)||!Number.isInteger(to)||from===to||!game.players[from]||!game.players[to]
      ||game.players[from].bankrupt||game.players[to].bankrupt){
    $('diceBetError').textContent='Choose two different active players.';return;
  }
  if(!Number.isInteger(amount)||amount<1||amount>200||!['high','low'].includes(side)
      ||game.players[from].cash<amount||game.players[to].cash<amount){
    $('diceBetError').textContent='Stake must be $1–$200 and affordable for both players.';return;
  }
  const offer=game.players[from].name+' bets '+MONEY(amount)+' on '+(side==='high'?'HIGHER':'LOWER')+' than 7.'
    +' '+game.players[to].name+' takes the opposite side. Accept?';
  const accept=game.players[to].bot?amount<=50:window.confirm(offer);
  if(!accept){$('diceBetError').textContent='The other player declined the wager.';return}
  game.players[from].cash-=amount;game.players[to].cash-=amount;
  game.sideBets.push({from,to,amount,side,roller:game.turn});
  $('diceBetError').textContent='Wager accepted! Money held until the next dice roll.';
  log('🎲 '+game.players[from].name+' and '+game.players[to].name+' wagered '+MONEY(amount)+' each on the next dice.');
  updateDiceBetQueue();save();render();
}
function settleDiceBets(total){
  if(!Array.isArray(game.sideBets)||!game.sideBets.length)return;
  const bets=game.sideBets.filter(b=>b.roller===game.turn);
  game.sideBets=game.sideBets.filter(b=>b.roller!==game.turn);
  for(const b of bets){
    if(total===7){
      game.players[b.from].cash+=b.amount;game.players[b.to].cash+=b.amount;
      log('🎲 Side bet PUSH on 7 — '+MONEY(b.amount)+' returned to each player.');
    }else{
      const wins=(total>7&&b.side==='high')||(total<7&&b.side==='low');
      const winner=game.players[wins?b.from:b.to];
      winner.cash+=b.amount*2;
      game.stats[wins?b.from:b.to].diceBets+=b.amount;
      game.stats[wins?b.to:b.from].diceBets-=b.amount;
      log('🎲 '+winner.name+' won '+MONEY(b.amount)+' profit on the '+total+' dice roll!');
    }
  }
  winnerCheck();
}
$('diceBetBtn').addEventListener('click',openDiceBet);
$('closeDiceBet').addEventListener('click',()=>{$('diceBetPanel').hidden=true});
$('placeDiceBet').addEventListener('click',placeDiceBet);
function showFinalResults(){
  if(!game||game.phase!=='over'||game.winnerShown)return;
  game.winnerShown=true;
  const winner=game.players[game.winner];
  $('winnerTitle').textContent='🏆 '+winner.name.toUpperCase()+' WINS!';
  $('winnerSummary').textContent=winner.cash>=RULES.winCash
    ?'First to the '+MONEY(RULES.winCash)+' cash goal!'
    :'Last player standing! Other players went bankrupt or left the game.';
  $('winnerStats').innerHTML=game.players.map((p,i)=>{
    const x=game.stats?.[i]||newStats();
    const owned=game.owners.filter(o=>o===i).length;
    const item=(label,amount)=>'<span>'+label+': '+MONEY(amount)+'</span>';
    return '<div class="mc-result-row"><strong>'+escapeHTML(p.name)+(i===game.winner?' 🏆':'')+'</strong>'
      +item('Final cash',p.cash)+item('Properties',owned)+item('Rent earned',x.rentCollected)
      +item('Rent paid',x.rentPaid)+item('GO income',x.goIncome)+item('Roulette net',x.roulette)
      +item('Dice bets net',x.diceBets)+item('Bullish',x.bullish)+item('Bearish paid',x.bearish)
      +item('Unexpected expenses',x.unexpected)
      +'<span>Developments purchased: '+x.builds+'</span><span>Trades made: '+x.trades+'</span></div>';
  }).join('');
  $('winnerPanel').hidden=false;save();
}
function resignCurrent(){
  if(!game||setup||game.phase==='moving'||game.phase==='roulette'||game.phase==='over'||current().bot)return;
  if(!window.confirm('Resign as '+current().name+'? Your remaining properties will return to the market. This cannot be undone.'))return;
  if(game.phase==='debt'){bankruptCurrent();return}
  const id=game.turn;
  game.sideBets.forEach(b=>{
    game.players[b.from].cash+=b.amount;
    game.players[b.to].cash+=b.amount;
  });
  game.sideBets=[];
  game.owners.forEach((owner,i)=>{
    if(owner===id){game.owners[i]=-1;game.mortgaged[i]=false;game.buildings[i]=emptyBuild()}
  });
  current().bankrupt=true;current().cash=0;game.doubleCount=0;game.bonusRoll=false;game.phase='end';
  log('🏳️ '+current().name+' resigned. All properties are back on the market.');
  redrawAssets();
  if(winnerCheck()){save();render();return}
  doEndTurn();
}
$('resignBtn').addEventListener('click',resignCurrent);
$('closeWinner').addEventListener('click',()=>{$('winnerPanel').hidden=true});
$('winnerViewBoard').addEventListener('click',()=>{$('winnerPanel').hidden=true});
$('winnerNewGame').addEventListener('click',()=>{$('winnerPanel').hidden=true;showSetup(game.mode)});
function scheduleBot(){
  clearTimeout(botTimeout);
  if(!game||setup||!current().bot||game.phase==='moving'||game.phase==='over')return;
  botTimeout=setTimeout(async()=>{
    if(!game||!current().bot)return;
    if(game.phase==='roll')await doRoll();
    else if(game.phase==='decision'){
      if(game.pending>=0&&current().cash>=BOARD[game.pending].price+230)doBuy();else doPass();
    }
    else if(game.phase==='debt')handleDebtBot();
    else if(game.phase==='end'){autoInvestBot();doEndTurn();}
  },900);
}
function render(){
  const actor=current(),human=!actor.bot;
  $('roundBadge').textContent='ROUND '+game.round;
  // Display only the balance of the player whose turn it is.
  $('activeBalanceAmount').textContent=MONEY(actor.cash);
  renderOwnedProperties();
  const label={roll:'ROLL',moving:'MOVING',decision:'BUY OR PASS',end:'TURN COMPLETE',debt:'PAYMENT DUE',roulette:'ROULETTE',over:'GAME OVER'};
  $('phaseLabel').textContent=label[game.phase]||'READY';
  $('turnTitle').textContent=game.phase==='over'?'Game over':actor.name+'’s turn';
  $('message').textContent=game.message;
  const showingResult=game.rollTotal>0;
  const waitingForDice=game.phase==='moving'&&!showingResult;
  const diceBetReady=!showingResult&&game.phase==='roll'&&human;
  // One display: Dice Bet before the roll; dice faces + total afterwards.
  $('diceBetBtn').hidden=!diceBetReady;
  $('dieA').hidden=!showingResult;
  $('dieB').hidden=!showingResult;
  $('rollTotal').hidden=diceBetReady;
  $('dieA').textContent=showingResult?SYMBOLS[game.dice[0]-1]:'⚀';
  $('dieB').textContent=showingResult?SYMBOLS[game.dice[1]-1]:'⚀';
  $('rollTotal').textContent=showingResult?'TOTAL '+game.rollTotal:
    waitingForDice?'ROLLING…':'READY TO ROLL';
  $('manageBtn').disabled=!canManage();
  $('tradeBtn').disabled=!canManage();
  $('diceBetBtn').disabled=!diceBetReady;
  $('rollBtn').disabled=game.phase!=='roll'||!human;
  $('payJailBtn').hidden=!(actor.jailed>0&&game.phase==='roll'&&!actor.bot);
  $('payJailBtn').disabled=actor.cash<RULES.jailFee;
  $('rollBtn').textContent=game.phase==='moving'?'🎲 ROLLING…':
    game.phase==='roll'?(human?'🎲 ROLL DICE':'COMPUTER TURN'):'ROLL USED';
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
  const recent=Array.isArray(game.activities)?game.activities.slice(0,5):[];
  $('playerActivityList').innerHTML=recent.length
    ?recent.map(item=>'<li><strong>'+escapeHTML(item.name)+':</strong> <span>'+escapeHTML(item.action)+'</span></li>').join('')
    :'<li class="activity-empty">No player activity yet</li>';
  $('mode').value=game.mode;
  scene.updatePositions(game.players,game.turn);
  scene.updateDevelopments(game.buildings,game.owners);
  renderDetails();
  showDebtUI();
  showFinalResults();
  roulette?.render();
}
function renderDetails(){
  if(!game)return;
  const s=BOARD[selected];
  $('spaceNumber').textContent='#'+String(selected+1).padStart(2,'0');
  $('detailTitle').textContent=s.name;
  const types={property:'property',transport:'car shop',bullish:'bullish event',bearish:'bearish event',expense:'unexpected expense',go:'start',jail:'jail / visiting',gojail:'go to jail',casino:'special event',freeparking:'free parking'};
  $('detailType').textContent=types[s.type];
  $('detailColor').style.background=game.owners[selected]>=0?PLAYER_COLORS[game.owners[selected]]:(s.type==='property'?'#ffffff':'#f4ca78');
  let detail='';
  if(buyable(selected)){
    const owner=game.owners[selected];detail=`Purchase: ${MONEY(s.price)} · ${owner===-1?'Currently unowned':'Owned by '+game.players[owner].name}`;
    if(owner!==-1){
      detail+=' · Rent: '+MONEY(rentFor(selected))+(game.mortgaged[selected]?' (MORTGAGED)':'');
      if(s.type==='property'){
        const dev=game.buildings[selected];
        detail+=' · '+usedSpots(dev)+'/'+capacityFor(selected)+' development spots · '+KINDS.map(k=>RULES.developments[k].label+': '+dev[k]).join(', ');
      }
    }
  }else{
    detail=({go:'Collect $200 when you pass GO.',jail:'Just visiting, unless sent here by Go To Jail.',
      gojail:'Go directly to Jail and miss your next turn.',freeparking:'Free Parking: no payment or action.',
      casino:'American roulette is played after the last active player ends each round.',bullish:'Positive financial event.',bearish:'Negative financial event.',expense:'Pay '+RULES.unexpected.map((fee,i)=>['house','apartment','business'][i]+' '+MONEY(fee)).join(', ')+' per development you own.'})[s.type]||'';
  }
  $('detailBody').textContent=detail;
}

$('ownedPropertiesBtn').addEventListener('click',()=>{
  setOwnedPropertiesOpen($('ownedPropertiesPanel').hidden);
});
$('closeOwnedProperties').addEventListener('click',()=>setOwnedPropertiesOpen(false));
$('rouletteZoomIn').addEventListener('click',()=>scene.zoomRoulette(.55));
$('rouletteZoomOut').addEventListener('click',()=>scene.zoomRoulette(1.6));
$('rouletteResetCamera').addEventListener('click',()=>scene.resetRouletteView());
$('rouletteBackToBoard').addEventListener('click',()=>{
  hideRoulettePreview();
  changeView('follow');
});
$('closeLandingCard')?.addEventListener('click',hideLandingCard);
$('closeEventCard').addEventListener('click',hideEventCard);
$('rollBtn').addEventListener('click',roll);
$('buyBtn').addEventListener('click',buy);
$('passBtn').addEventListener('click',pass);
$('endBtn').addEventListener('click',endTurn);
const jailButton=document.createElement('button');
jailButton.id='payJailBtn';jailButton.type='button';jailButton.hidden=true;
jailButton.className='alt-btn';jailButton.textContent='PAY $50 TO LEAVE JAIL';
$('endBtn').parentElement.appendChild(jailButton);
jailButton.addEventListener('click',()=>{
  if(game.phase!=='roll'||current().jailed<=0||current().cash<RULES.jailFee||current().bot)return;
  current().cash-=RULES.jailFee;current().jailed=0;
  scene.setJailCage(game.turn,false);
  log(current().name+' paid '+MONEY(RULES.jailFee)+' to leave Jail and may roll.');
  save();render();
});

function changeView(mode){
  scene.setMode(mode);
  $('followView').classList.toggle('chosen',mode==='follow');$('overviewView').classList.toggle('chosen',mode==='overview');
  $('followView').setAttribute('aria-pressed',String(mode==='follow'));
  $('overviewView').setAttribute('aria-pressed',String(mode==='overview'));
  $('viewHint').textContent=mode==='follow'?'FOLLOW CAMERA':'FULL BOARD CAMERA';
}
$('followView').addEventListener('click',()=>changeView('follow'));
$('overviewView').addEventListener('click',()=>changeView('overview'));
$('soloPiece').addEventListener('change',()=>{
  const piece=$('soloPiece').value;
  if(!['male','female'].includes(piece))return;
  localStorage.setItem(PIECE_KEY,piece);
  game.players[0].piece=piece;
  scene.setPlayers(game.players);
  scene.updatePositions(game.players,game.turn);
  save();render();
});
$('restartBtn').addEventListener('click',()=>{$('dialog').hidden=false});
$('cancelDialog').addEventListener('click',()=>{$('dialog').hidden=true});
$('confirmDialog').addEventListener('click',()=>{$('dialog').hidden=true;showSetup($('mode').value)});
$('dialog').addEventListener('click',e=>{if(e.target===$('dialog'))$('dialog').hidden=true});
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){$('dialog').hidden=true;setOwnedPropertiesOpen(false);if(!$('roulettePreview').hidden){hideRoulettePreview();changeView('follow')}return}
  if(e.target?.closest('select,input,button'))return;
  if(e.key.toLowerCase()==='r'&&game.phase==='roll'&&!current().bot)roll();
  if(e.key.toLowerCase()==='v')changeView(scene.mode==='follow'?'overview':'follow');
});

roulette=createRouletteController({
  getGame:()=>game,save,render,log,scene,afterRound:advanceAfterRoulette
});
game=load();
if(game){
  if(!['male','female'].includes(game.players[0].piece))game.players[0].piece=selectedPiece();
  syncPlayerColors();
  $('soloPiece').value=game.players[0].piece;
  scene.setPlayers(game.players);scene.updateOwners(game.owners);scene.updatePositions(game.players,game.turn);scene.focus(game.turn);
  selected=game.players[game.turn].at;scene.makeSelection(selected);
  roulette.restore();
  render();scheduleBot();
}
const params=new URLSearchParams(location.search);
if(params.get('new')==='1'){
  showSetup(params.get('mode')||'solo');
  history.replaceState({},'',location.pathname);
}else if(!game){
  showSetup('solo');
}
// Public debug helpers: available only to the developer via the browser console.
window.MyCityDebug=Object.freeze({board:BOARD,getState:()=>structuredClone(game),selectSpace:i=>{if(i>=0&&i<40){selected=i;scene.makeSelection(i);renderDetails()}}});
