import { createClient } from '@supabase/supabase-js';
import { MY_CITY_SUPABASE_URL, MY_CITY_SUPABASE_PUBLISHABLE_KEY } from './online-config.js';
import { BOARD, COLORS, MONEY } from './board-data.js';
import { MyCityScene } from './scene3d.js?v=circle-board-v1';

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
let diceSyncChannel=null;
let finishRedirectTimer=null;
let finishedRedirecting=false;

// All players receive the shared "finished" status through room-state polling.
// Show the end notice briefly, then send each browser back to the homepage.
function goHomeNow(){
  // Navigation needs no RPC and never depends on host permissions.
  localStorage.removeItem(storageKey);
  unloading=true;
  window.location.replace('./index.html');
}
function returnEveryoneHome(){
  if(finishedRedirecting || unloading)return;
  finishedRedirecting=true;
  localStorage.removeItem(storageKey);
  if(pollHandle){clearInterval(pollHandle);pollHandle=null;}
  // Navigate even if a scene redraw or animation is still running.
  const notice=$('endedGameNotice');
  const explanation=$('endedGameExplanation');
  if(notice)notice.hidden=false;
  if(explanation)explanation.textContent='Returning all players to the home screen…';
  finishRedirectTimer=setTimeout(goHomeNow,1200);
}

function alertError(error){
  const message=String(error?.message||error||'Something went wrong.');
  $('errorText').textContent=message;$('errorText').hidden=false;
}
function clearError(){$('errorText').hidden=true;}
function notify(message){
  const el=$('toast');el.textContent=message;el.classList.add('shown');
  clearTimeout(toastHandle);toastHandle=setTimeout(()=>el.classList.remove('shown'),3400);
}
let qrCodeRenderedFor='';
function phoneJoinLink(){
  return location.origin+location.pathname.replace(/online\.html$/,'controller.html')+
    '?room='+encodeURIComponent(roomCode);
}
function drawPhoneQr(nodeId,size){
  const holder=$(nodeId);
  holder.replaceChildren();
  if(!window.qrcode){
    const fallback=document.createElement('span');
    fallback.textContent='QR unavailable — copy the link below';
    fallback.style.cssText='font-size:10px;color:#243';
    holder.append(fallback);return;
  }
  try{
    const qr=window.qrcode(0,'M');
    qr.addData(phoneJoinLink());
    qr.make();
    const img=document.createElement('img');
    img.src=qr.createDataURL(size,4);
    img.alt='Scan to join room '+roomCode+' as a phone controller';
    holder.append(img);
  }catch(error){
    console.error('Phone QR failed:',error);
    holder.textContent='Copy the phone join link instead';
  }
}
function updatePhoneInvites(){
  if(!roomCode||qrCodeRenderedFor===roomCode)return;
  qrCodeRenderedFor=roomCode;
  drawPhoneQr('lobbyPhoneQR',4);
  drawPhoneQr('phoneQRCode',6);
  $('phoneQRCodeText').textContent=roomCode;
  $('openPhoneController').href='./controller.html?room='+encodeURIComponent(roomCode);
}
function showPhoneJoinQr(){
  closeGameMenu();
  updatePhoneInvites();
  $('phoneQRPanel').hidden=false;
}
async function copyPhoneJoinLink(){
  if(!roomCode)return;
  try{await navigator.clipboard.writeText(phoneJoinLink());notify('Phone controller link copied');}
  catch{notify('Phone controller link: '+phoneJoinLink());}
}
let activityUnavailableWarned=false;
function startDiceSync(){
  if(diceSyncChannel||!roomCode||!supabase)return;
  diceSyncChannel=supabase.channel('mycity-dice-'+roomCode,{config:{broadcast:{ack:false}}});
  diceSyncChannel.subscribe();
}
function stopDiceSync(){
  if(!diceSyncChannel)return;
  const old=diceSyncChannel;
  diceSyncChannel=null;
  supabase?.removeChannel(old);
}
function announceDiceFinished(move){
  // Broadcast only after the on-screen THREE.js dice animation resolves.
  // Each phone compares roll_seq to avoid revealing a different player's roll.
  if(!diceSyncChannel||!state?.room)return;
  diceSyncChannel.send({type:'broadcast',event:'dice_animation_complete',payload:{
    roll_seq:state.room.roll_seq,seat:move.seat
  }}).catch(error=>console.warn('Dice-sync broadcast unavailable',error));
}
async function refreshActivity(){
  if(!roomCode||!supabase||!state)return;
  const {data,error}=await supabase.rpc('mc_recent_activity',{p_code:roomCode});
  if(error){
    if(!activityUnavailableWarned){
      activityUnavailableWarned=true;
      notify('Activity log error: '+(error.message||error.code||'Unknown problem'));
      console.error('My City activity log RPC error:',error);
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
let showActivityFeed=true;
function closeGameMenu(){
  $('gameMenuDropdown').hidden=true;
  $('gameMenuToggle').setAttribute('aria-expanded','false');
}
function toggleGameMenu(){
  const nextOpen=$('gameMenuDropdown').hidden;
  $('gameMenuDropdown').hidden=!nextOpen;
  $('gameMenuToggle').setAttribute('aria-expanded',String(nextOpen));
  if(nextOpen){$('onlineSettingsPanel').hidden=true;$('phoneQRPanel').hidden=true;}
}
function showGameSettings(){
  closeGameMenu();
  $('onlineSettingsPanel').hidden=false;
}
async function endGameAsHost(){
  closeGameMenu();
  if(!roomCode||!state?.me.host||state.room.status!=='playing'||inFlight)return;
  if(!window.confirm('End this game for every player? No one will be able to take more turns. This cannot be undone.'))return;
  inFlight=true;
  $('hostEndGame').disabled=true;
  renderRoom();
  try{
    await rpc('mc_end_game',{p_code:roomCode});
    // Server committed finish. Redirect host immediately; guests will
    // observe it via their next independent state check.
    returnEveryoneHome();
  }catch(error){
    const missing=error.code==='PGRST202'||/could not find the function/i.test(error.message||'');
    notify(missing
      ? 'End Game needs the Supabase room-controls SQL setup.'
      : 'Could not end game: '+(error.message||String(error)));
    console.error('End Game failed:',error);
  }finally{
    inFlight=false;
    $('hostEndGame').disabled=false;
    renderRoom();
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
  $('activityFeed').hidden=room.status==='lobby' || !showActivityFeed;
  $('gameMenu').hidden=false;
  $('hostEndGame').hidden=!me.host || room.status!=='playing';
  $('endedGameNotice').hidden=room.status!=='finished';
  $('roomCodeText').textContent=room.code;
  updatePhoneInvites();
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

  const scenePlayers=players.map(p=>({at:p.at,bankrupt:p.bankrupt,jailed:p.jailed}));
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
  if(next.room.status==='finished'){
    lastSeenRoll=next.room.roll_seq;
    // Redirect first, before any 3D rendering can throw or block the flow.
    returnEveryoneHome();
    try{renderRoom();}catch(error){console.error('Finished room render:',error);}
    return;
  }
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
  const startPlayers=players.map(p=>({at:p.at,bankrupt:p.bankrupt,jailed:p.jailed}));
  if(startPlayers[seat]){
    startPlayers[seat].at=move.from;
    // Do not display the bars until the officer reaches Jail.
    startPlayers[seat].jailed=false;
  }
  if(lastCount!==startPlayers.length){
    scene.setPlayers(startPlayers);
    lastCount=startPlayers.length;
  }
  scene.updatePositions(startPlayers,seat);
  try{
    scene.focus(seat);scene.beginDiceView();
    await sleep(550);
    await scene.rollDice(move.a,move.b);
    announceDiceFinished(move);
    await sleep(340);
    scene.endDiceView();
    await sleep(350);
    let position=move.from;
    for(let i=0;i<move.a+move.b;i++){
      position=(position+1)%40;
      await scene.movePawn(seat,position,290);
    }
    // The jail jump is shown after the ordinary dice movement.
    if(position===30 && move.to===10){
      await scene.escortToJail(seat);
    }else if(position!==move.to){
      await scene.movePawn(seat,move.to,700);
    }
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
  if(!roomCode||unloading||finishedRedirecting)return;
  try{
    const checkedRoomCode=roomCode;
    const data=await rpc('mc_room_state',{p_code:checkedRoomCode});
    // This runs before the animation and before other state processing,
    // including when another in-flight move has set inFlight=true.
    if(data?.room?.status==='finished'){
      returnEveryoneHome();
      return;
    }
    if(checkedRoomCode!==roomCode)return;
    if(inFlight)return;
    await updateState(data);
    if(!finishRedirectTimer)await refreshActivity();
  }catch(error){
    if(!unloading)notify('Connection: '+(error.message||'Refresh failed'));
  }
}
async function connectRoom(code){
  roomCode=String(code).toUpperCase();
  startDiceSync();
  localStorage.setItem(storageKey,roomCode);
  history.replaceState({},'',location.pathname+'?room='+encodeURIComponent(roomCode));
  const next=await rpc('mc_room_state',{p_code:roomCode});
  await updateState(next);
  if(!finishRedirectTimer){
    await refreshActivity();
    if(!pollHandle)pollHandle=setInterval(refresh,1300);
  }
}
function clearRoomLocally(){
  stopDiceSync();
  if(finishRedirectTimer){clearTimeout(finishRedirectTimer);finishRedirectTimer=null;}
  finishedRedirecting=false;
  roomCode='';
  state=null;
  lastSeenRoll=null;
  lastCount=-1;
  localStorage.removeItem(storageKey);
  history.replaceState({},'',location.pathname);
  if(pollHandle){clearInterval(pollHandle);pollHandle=null;}
  $('activityFeed').hidden=true;
  $('activityEntries').replaceChildren();
  $('phoneQRPanel').hidden=true;
  qrCodeRenderedFor='';
  closeGameMenu();
  $('onlineSettingsPanel').hidden=true;
  $('gameMenu').hidden=true;
  $('endedGameNotice').hidden=true;
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
    const missing=error.code==='PGRST202'||/could not find the function/i.test(error.message||'');
    alertError(missing
      ? 'Room cancellation is not installed in Supabase yet. Run supabase/mycity_room_controls_repair.sql in your My City project.'
      : 'Could not cancel or leave room: '+(error.message||String(error)));
    console.error('Room exit failed:',error);
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

$('gameMenuToggle').addEventListener('click',toggleGameMenu);
$('showPhoneQR').addEventListener('click',showPhoneJoinQr);
$('closePhoneQR').addEventListener('click',()=>{$('phoneQRPanel').hidden=true;});
$('copyPhoneLink').addEventListener('click',copyPhoneJoinLink);
$('copyLobbyPhoneLink').addEventListener('click',copyPhoneJoinLink);
$('copyMenuRoomCode').addEventListener('click',async()=>{
  if(!roomCode)return;
  try{
    await navigator.clipboard.writeText(roomCode);
    notify('Room ID copied: '+roomCode);
  }catch{notify('Room ID: '+roomCode);}
});
$('openGameSettings').addEventListener('click',showGameSettings);
$('closeGameSettings').addEventListener('click',()=>{$('onlineSettingsPanel').hidden=true;});
$('settingFollowView').addEventListener('click',()=>{restoreView();});
$('settingBoardView').addEventListener('click',()=>{hideRoulette();scene.setMode('overview');});
$('settingActivityToggle').addEventListener('change',e=>{
  showActivityFeed=e.target.checked;
  if(state)renderRoom();
});
$('hostEndGame').addEventListener('click',endGameAsHost);
$('endedGameGoHome').addEventListener('click',goHomeNow);
document.addEventListener('pointerdown',e=>{
  if(!$('gameMenu').contains(e.target))closeGameMenu();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    closeGameMenu();
    $('onlineSettingsPanel').hidden=true;
    $('phoneQRPanel').hidden=true;
  }
});
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
$('rouletteZoomIn').addEventListener('click',()=>scene.zoomRoulette(.55));
$('rouletteZoomOut').addEventListener('click',()=>scene.zoomRoulette(1.6));
$('rouletteResetCamera').addEventListener('click',()=>scene.resetRouletteView());
$('backFromRoulette').addEventListener('click',restoreView);
$('followView').addEventListener('click',restoreView);
$('overviewView').addEventListener('click',()=>{hideRoulette();scene.setMode('overview');});
window.addEventListener('beforeunload',()=>{unloading=true;stopDiceSync();if(pollHandle)clearInterval(pollHandle);});
// On mobile a tab may be suspended while the host ends the game.
// Immediately recheck when the guest comes back, rather than relying on
// the browser to resume its old interval in a timely manner.
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden && roomCode && !finishedRedirecting)refresh();
});
window.addEventListener('pageshow',()=>{
  if(roomCode && !finishedRedirecting)refresh();
});

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
    },onRoulette:()=>{
      $('spaceCard').hidden=true;
      $('roulettePreview').hidden=false;
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
