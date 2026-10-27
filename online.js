import { createClient } from '@supabase/supabase-js';
import { MY_CITY_SUPABASE_URL, MY_CITY_SUPABASE_PUBLISHABLE_KEY } from './online-config.js';
import { BOARD, COLORS, MONEY } from './board-data.js';
import { MyCityScene } from './scene3d.js';

const $=id=>document.getElementById(id);
const faces=['⚀','⚁','⚂','⚃','⚄','⚅'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Correct ampersand escaping is included above; user-provided names are always textContent elsewhere.
const storageKey='my-city-online-room';
const nameKey='my-city-online-name';

let supabase,scene,state=null,roomCode='',lastSeenRoll=null;
let inFlight=false,busyAnimation=false,lastCount=-1,pollHandle=null,toastHandle=null;
let pendingRefresh=null,unloading=false;

function alertError(error){
  const message=String(error?.message||error||'Something went wrong.');
  $('errorText').textContent=message;$('errorText').hidden=false;
}
function clearError(){$('errorText').hidden=true;}
function notify(message){
  const el=$('toast');el.textContent=message;el.classList.add('shown');
  clearTimeout(toastHandle);toastHandle=setTimeout(()=>el.classList.remove('shown'),3400);
}
let activityUnavailableWarned=false;
async function refreshActivity(){
  if(!roomCode||!supabase||!state)return;
  const {data,error}=await supabase.rpc('mc_recent_activity',{p_code:roomCode});
  if(error){
    if(!activityUnavailableWarned){
      activityUnavailableWarned=true;
      notify('Activity log needs its Supabase SQL setup.');
    }
    return;
  }
  const items=Array.isArray(data)?data.slice(-5):[];
  const list=$('activityEntries');
  list.replaceChildren();
  if(!items.length){
    const row=document.createElement('li');
    row.className='activityEmpty';
    row.textContent='No activity yet';
    list.append(row);
    return;
  }
  for(const item of items){
    const row=document.createElement('li');
    const name=document.createElement('strong');
    name.className='activityName';
    name.textContent=String(item.name||'Player')+': ';
    row.append(name,document.createTextNode(String(item.activity||'')));
    list.append(row);
  }
}
function myTurn(){
  return !!state && state.room.status==='playing' &&
    state.room.turn_seat===state.me.seat && !state.me.bankrupt;
}
function currentActor(){
  return state?.players.find(p=>p.seat===state.room.turn_seat);
}
function privateProperties(){
  if(!state)return [];
  return state.me.properties.map(index=>BOARD[index]).filter(Boolean);
}
function viewOwned(){
  if(!state)return;
  const props=privateProperties();
  $('myPropertyCount').textContent=props.length+' '+(props.length===1?'property':'properties')+' owned';
  $('myPropertyList').innerHTML=props.length?props.map(p=>
    '<div class="propertyItem">'+
    '<span class="swatch" style="background:'+(p.color?COLORS[p.color]:'#b8d5cd')+'"></span>'+
    '<div><strong>'+escapeHTML(p.name)+'</strong>'+
    '<small>Space '+(p.index+1)+' · '+MONEY(p.price)+'</small></div></div>'
  ).join(''):'<p>No properties owned yet.</p>';
}
function toggleOwned(open){
  $('ownedPropertiesPanel').hidden=!open;
  $('ownedPropertiesBtn').setAttribute('aria-expanded',String(open));
  if(open)viewOwned();
}
function showSpace(index){
  const p=BOARD[index];
  if(!p || !['property','transport'].includes(p.type))return;
  const mine=state?.me.properties.includes(index);
  $('spaceCardName').textContent=p.name;
  $('spaceCardStripe').style.background=p.color?COLORS[p.color]:'#8eb6b0';
  $('spaceCardInfo').textContent='Purchase: '+MONEY(p.price)+
    (mine?' · Owned by you':' · Property information');
  $('spaceCard').hidden=false;
}
function renderRoom(){
  if(!state)return;
  const {room,players,me}=state;
  $('activityFeed').hidden=room.status==='lobby';
  $('roomCodeDisplay').hidden=false;
  $('roomCodeText').textContent=room.code;
  $('lobbyCode').textContent=room.code;
  $('playerName').value=me.name;
  $('privateBalance').hidden=false;
  $('myBalanceAmount').textContent=MONEY(me.cash);
  if(!$('ownedPropertiesPanel').hidden)viewOwned();

  const gameReady=room.status!=='lobby';
  $('lobby').hidden=gameReady;
  $('lobbyEntry').hidden=true;
  $('roomLobby').hidden=false;
  $('onlineControls').hidden=!gameReady;
  $('turnStatus').hidden=!gameReady;
  $('membersList').innerHTML=players.map(p=>
    '<div class="member'+(p.seat===room.turn_seat&&gameReady?' active':'')+'">'+
    '<span>'+escapeHTML(p.name)+(p.seat===me.seat?' (You)':'')+'</span>'+
    '<span>'+(gameReady?'Space '+(p.at+1):'Ready')+'</span></div>'
  ).join('');
  $('lobbyCount').textContent=players.length+' / '+room.max_players+' players';
  $('startRoom').hidden=!me.host||gameReady;
  $('cancelRoomBtn').hidden=!me.host||gameReady;
  $('leaveRoomBtn').textContent=me.host?'← BACK TO ROOMS':'← LEAVE ROOM';
  $('startRoom').disabled=players.length<2;
  $('waitingForHost').hidden=me.host;
  const actor=currentActor();
  $('turnPlayerName').textContent=room.status==='finished'?'GAME COMPLETE':
    (actor?.name||'Player')+(room.turn_seat===me.seat?' — YOUR TURN':'’s turn');
  $('turnPhase').textContent=room.status==='finished'?'FINISHED':
    ({roll:'ROLL',decision:'BUY OR PASS',end:'END TURN'})[room.phase]||'READY';
  const allowed=myTurn()&&!inFlight&&!busyAnimation;
  $('rollBtn').disabled=!allowed||room.phase!=='roll';
  $('buyBtn').disabled=!allowed||room.phase!=='decision';
  $('passBtn').disabled=!allowed||room.phase!=='decision';
  $('endBtn').disabled=!allowed||room.phase!=='end';
  $('rollBtn').textContent=room.phase==='roll'?'🎲 ROLL DICE':'ROLL USED';
  $('buyBtn').textContent=room.pending_space!=null&&room.phase==='decision'
    ?'BUY · '+MONEY(BOARD[room.pending_space].price):'BUY PROPERTY';

  const dice=room.dice||[];
  const known=room.phase!=='roll' && room.roll_seq>0 &&
    Number.isInteger(dice[0]) && Number.isInteger(dice[1]) &&
    dice[0]>=1 && dice[1]>=1;
  $('dieA').textContent=known?faces[dice[0]-1]:'⚀';
  $('dieB').textContent=known?faces[dice[1]-1]:'⚀';
  $('diceTotal').textContent=known?'TOTAL '+(dice[0]+dice[1]):'READY';

  const scenePlayers=players.map(p=>({at:p.at,bankrupt:p.bankrupt}));
  if(!busyAnimation){
    if(lastCount!==scenePlayers.length){
      scene.setPlayers(scenePlayers);
      lastCount=scenePlayers.length;
    }
    scene.updatePositions(scenePlayers,room.turn_seat);
    const owners=new Array(40).fill(-1);
    for(const prop of me.properties)owners[prop]=me.seat;
    scene.updateOwners(owners);
  }
}
async function rpc(name,params){
  const {data,error}=await supabase.rpc(name,params);
  if(error)throw error;
  return data;
}
async function updateState(next){
  if(!next?.room || !next?.me || !Array.isArray(next.players))return;
  const hadState=!!state;
  const newRoll=hadState && next.room.roll_seq>lastSeenRoll &&
    !!next.room.last_roll;
  state=next;
  if(lastSeenRoll===null)lastSeenRoll=next.room.roll_seq;
  if(newRoll){
    lastSeenRoll=next.room.roll_seq;
    // Start the cinematic animation before copying the server's final pawn
    // position into the scene; otherwise pieces visibly teleport first.
    if(!busyAnimation){
      await replayRoll(next.room.last_roll,next.players);
      return;
    }
  }
  renderRoom();
}
async function replayRoll(move,players){
  if(busyAnimation)return;
  if(!Number.isInteger(move.a)||!Number.isInteger(move.b)||
    move.a<1||move.a>6||move.b<1||move.b>6)return;
  busyAnimation=true;
  hideRoulette();
  $('spaceCard').hidden=true;
  renderRoom();
  const seat=move.seat;
  const startPlayers=players.map(p=>({at:p.at,bankrupt:p.bankrupt}));
  if(startPlayers[seat])startPlayers[seat].at=move.from;
  if(lastCount!==startPlayers.length){
    scene.setPlayers(startPlayers);
    lastCount=startPlayers.length;
  }
  scene.updatePositions(startPlayers,seat);
  try{
    scene.focus(seat);scene.beginDiceView();
    await sleep(550);
    await scene.rollDice(move.a,move.b);
    await sleep(340);
    scene.endDiceView();
    await sleep(350);
    let position=move.from;
    for(let i=0;i<move.a+move.b;i++){
      position=(position+1)%40;
      await scene.movePawn(seat,position,290);
    }
    // The jail jump is shown after the ordinary dice movement.
    if(position!==move.to)await scene.movePawn(seat,move.to,700);
    await sleep(280);
    $('spaceCard').hidden=true;
    if(['property','transport'].includes(BOARD[move.to]?.type))showSpace(move.to);
    scene.setMode('roulette');
    $('roulettePreview').hidden=false;
  }catch(error){
    console.error('Replay issue',error);
  }finally{
    busyAnimation=false;
    if(state)renderRoom();
  }
}
function hideRoulette(){
  $('roulettePreview').hidden=true;
}
function restoreView(){
  hideRoulette();scene.setMode('follow');
}
async function refresh(){
  if(!roomCode||inFlight||unloading)return;
  try{
    const data=await rpc('mc_room_state',{p_code:roomCode});
    await updateState(data);
    await refreshActivity();
  }catch(error){
    if(!unloading)notify('Connection: '+(error.message||'Refresh failed'));
  }
}
async function connectRoom(code){
  roomCode=String(code).toUpperCase();
  localStorage.setItem(storageKey,roomCode);
  history.replaceState({},'',location.pathname+'?room='+encodeURIComponent(roomCode));
  const next=await rpc('mc_room_state',{p_code:roomCode});
  await updateState(next);
  await refreshActivity();
  if(!pollHandle)pollHandle=setInterval(refresh,1300);
}
function clearRoomLocally(){
  roomCode='';
  state=null;
  lastSeenRoll=null;
  lastCount=-1;
  localStorage.removeItem(storageKey);
  history.replaceState({},'',location.pathname);
  if(pollHandle){clearInterval(pollHandle);pollHandle=null;}
  $('activityFeed').hidden=true;
  $('activityEntries').replaceChildren();
  $('roomCodeDisplay').hidden=true;
  $('privateBalance').hidden=true;
  $('onlineControls').hidden=true;
  $('turnStatus').hidden=true;
  $('ownedPropertiesPanel').hidden=true;
  $('spaceCard').hidden=true;
  $('roulettePreview').hidden=true;
  $('lobby').hidden=false;
  $('lobbyEntry').hidden=false;
  $('roomLobby').hidden=true;
  $('joinCode').value='';
  clearError();
  scene?.setMode('overview');
}
async function leaveRoom(cancel=false){
  if(!roomCode||inFlight)return;
  if(state?.room.status!=='lobby'){
    // Returning from an active match only leaves the page; it does not
    // delete the match or surrender another player's turn.
    clearRoomLocally();
    notify('Returned to rooms. Your active game is unchanged.');
    return;
  }
  const isHost=!!state?.me.host;
  if(isHost && !cancel){
    // Host can return to the menu without deleting a room.
    const code=roomCode;
    clearRoomLocally();
    notify('Room '+code+' is still open; use its invite code to return.');
    return;
  }
  const prompt=isHost?
    'Cancel this waiting room for everyone? This cannot be undone.':
    'Leave this room? The host and remaining players can continue waiting.';
  if(!window.confirm(prompt))return;
  inFlight=true;
  $('leaveRoomBtn').disabled=true;
  $('cancelRoomBtn').disabled=true;
  try{
    await rpc('mc_exit_room',{p_code:roomCode});
    clearRoomLocally();
    notify(isHost?'Room cancelled.':'You left the room.');
  }catch(error){
    alertError(error.message||'Could not leave room');
  }finally{
    inFlight=false;
    $('leaveRoomBtn').disabled=false;
    $('cancelRoomBtn').disabled=false;
  }
}
async function action(name){
  if(!myTurn()||inFlight||busyAnimation)return;
  if(({roll:'roll',buy:'decision',pass:'decision',end:'end'})[name]!==state.room.phase)return;
  inFlight=true;renderRoom();
  try{
    const next=await rpc('mc_take_action',{p_code:roomCode,p_action:name});
    await updateState(next);
    await refreshActivity();
    if(name==='end')restoreView();
    if(name==='buy')notify('Property purchased');
  }catch(error){notify(error.message||'Action failed');}
  finally{inFlight=false;renderRoom();}
}
function setBusy(buttonsBusy){
  for(const id of ['createRoom','joinRoom','startRoom'])
    $(id).disabled=buttonsBusy;
}
async function createOrJoin(type){
  clearError();
  const name=$('playerName').value.trim();
  if(!name||name.length>24){alertError('Enter a name between 1 and 24 characters.');return;}
  localStorage.setItem(nameKey,name);
  setBusy(true);
  try{
    if(type==='create'){
      const code=await rpc('mc_create_room',{p_name:name,p_max_players:Number($('roomSize').value)});
      await connectRoom(code);
    }else{
      const code=$('joinCode').value.trim().toUpperCase();
      if(!/^[A-F0-9]{8}$/.test(code))throw Error('Use the 8-character invite code.');
      await rpc('mc_join_room',{p_code:code,p_name:name});
      await connectRoom(code);
    }
  }catch(error){alertError(error.message||'Could not join room');}
  finally{setBusy(false);}
}

$('createRoom').addEventListener('click',()=>createOrJoin('create'));
$('joinRoom').addEventListener('click',()=>createOrJoin('join'));
$('leaveRoomBtn').addEventListener('click',()=>leaveRoom());
$('cancelRoomBtn').addEventListener('click',()=>leaveRoom(true));
$('startRoom').addEventListener('click',async()=>{
  clearError();setBusy(true);
  try{
    await rpc('mc_start_room',{p_code:roomCode});
    await refresh();
  }catch(error){alertError(error);}
  finally{setBusy(false);}
});
$('copyInvite').addEventListener('click',async()=>{
  const link=location.origin+location.pathname+'?room='+encodeURIComponent(roomCode);
  try{await navigator.clipboard.writeText(link);notify('Invite link copied');}
  catch{notify('Invite code: '+roomCode);}
});
$('rollBtn').addEventListener('click',()=>action('roll'));
$('buyBtn').addEventListener('click',()=>action('buy'));
$('passBtn').addEventListener('click',()=>action('pass'));
$('endBtn').addEventListener('click',()=>action('end'));
$('ownedPropertiesBtn').addEventListener('click',()=>toggleOwned($('ownedPropertiesPanel').hidden));
$('closeProperties').addEventListener('click',()=>toggleOwned(false));
$('closeSpaceCard').addEventListener('click',()=>{$('spaceCard').hidden=true});
$('backFromRoulette').addEventListener('click',restoreView);
$('followView').addEventListener('click',restoreView);
$('overviewView').addEventListener('click',()=>{hideRoulette();scene.setMode('overview');});
window.addEventListener('beforeunload',()=>{unloading=true;if(pollHandle)clearInterval(pollHandle);});

async function init(){
  $('playerName').value=localStorage.getItem(nameKey)||'';
  const requested=new URLSearchParams(location.search).get('room');
  if(requested) $('joinCode').value=requested.toUpperCase().slice(0,8);
  if(!MY_CITY_SUPABASE_URL||!MY_CITY_SUPABASE_PUBLISHABLE_KEY){
    alertError('Online rooms need a Supabase connection. Add your project URL and publishable key to online-config.js, then run supabase/mycity_multiplayer.sql in Supabase.');
    setBusy(true);return;
  }
  try{
    supabase=createClient(MY_CITY_SUPABASE_URL,MY_CITY_SUPABASE_PUBLISHABLE_KEY);
    const {data,error}=await supabase.auth.getSession();
    if(error)throw error;
    if(!data.session){
      const signed=await supabase.auth.signInAnonymously();
      if(signed.error)throw signed.error;
    }
    scene=new MyCityScene($('viewport'),{onSelect:index=>{
      if(['property','transport'].includes(BOARD[index]?.type))showSpace(index);
      else $('spaceCard').hidden=true;
    }});
    $('onlineLoading').hidden=true;
    const restore=requested||localStorage.getItem(storageKey);
    if(restore){
      try{await connectRoom(restore);}
      catch(error){
        // Stale room membership can be corrected by explicitly joining.
        localStorage.removeItem(storageKey);
        history.replaceState({},'',location.pathname);
        $('joinCode').value=restore;
        clearError();notify('Enter your name and join the room');
      }
    }
  }catch(error){alertError(error.message||'Could not connect to Supabase');setBusy(true);}
}
init();
