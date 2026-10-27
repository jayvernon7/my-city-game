import {createClient} from '@supabase/supabase-js';
import {MY_CITY_SUPABASE_URL, MY_CITY_SUPABASE_PUBLISHABLE_KEY} from './online-config.js';
import {BOARD,MONEY,COLORS} from './board-data.js';

const $=id=>document.getElementById(id);
const storageKey='my-city-controller-room';
const nameKey='my-city-online-name';
const dice=['⚀','⚁','⚂','⚃','⚄','⚅'];
let supabase,code='',state=null,poll=null,busy=false,toastTimer=null,renderedProperties=null;
let diceChannel=null, pendingDiceSeq=null, diceTimer=null;
const diceCompleted=new Set();
function stopDiceClock(){
  clearTimeout(diceTimer);
  diceTimer=null;
}
function diceDone(seq){
  if(!Number.isInteger(seq)||seq<1)return;
  diceCompleted.add(seq);
  if(diceCompleted.size>25)diceCompleted.delete(diceCompleted.values().next().value);
  if(pendingDiceSeq===seq){
    pendingDiceSeq=null;stopDiceClock();
    if(state)render(state);
  }
}
function startDiceChannel(){
  if(!supabase||!code||diceChannel)return;
  diceChannel=supabase.channel('mycity-dice-'+code);
  diceChannel.on('broadcast',{event:'dice_animation_complete'},({payload})=>{
    const seq=Number(payload?.roll_seq);
    if(state&&seq===state.room.roll_seq&&Number(payload.seat)===state.room.last_roll?.seat){
      diceDone(seq);
    }
  }).subscribe();
}
function stopDiceChannel(){
  stopDiceClock();pendingDiceSeq=null;diceCompleted.clear();
  if(diceChannel){
    const channel=diceChannel;diceChannel=null;
    supabase?.removeChannel(channel);
  }
}
function renderDice(room){
  const a=room.dice?.[0],b=room.dice?.[1],seq=room.roll_seq;
  const valid=Number.isInteger(a)&&a>=1&&a<=6&&Number.isInteger(b)&&b>=1&&b<=6;
  if(room.phase==='roll'||!valid||!Number.isInteger(seq)||seq<1){
    stopDiceClock();pendingDiceSeq=null;
    $('padDieA').textContent='⚀';$('padDieB').textContent='⚀';
    return;
  }
  if(!diceCompleted.has(seq)){
    if(pendingDiceSeq!==seq){
      stopDiceClock();pendingDiceSeq=seq;
      diceTimer=setTimeout(()=>diceDone(seq),7000);
    }
    $('padDieA').textContent='🎲';$('padDieB').textContent='🎲';
    return;
  }
  stopDiceClock();pendingDiceSeq=null;
  $('padDieA').textContent=dice[a-1];$('padDieB').textContent=dice[b-1];
}
function toast(message){
  const el=$('padToast');el.textContent=message;el.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3600);
}
async function rpc(name,args){
  const {data,error}=await supabase.rpc(name,args);
  if(error)throw error;
  return data;
}
function controllerLink(targetCode){
  return './online.html?room='+encodeURIComponent(targetCode);
}
function stop(){
  if(poll)clearInterval(poll);
  poll=null;
  stopDiceChannel();
}
function home(){
  stop();localStorage.removeItem(storageKey);
  location.replace('./index.html');
}
function setJoined(roomCode){
  code=roomCode;
  startDiceChannel();
  localStorage.setItem(storageKey,code);
  history.replaceState({},'',location.pathname+'?room='+encodeURIComponent(code));
  $('joinScreen').hidden=true;
  $('padScreen').hidden=false;
  $('propertyCardsDialog').hidden=true;
  $('padRoomCode').textContent=code;
  $('fullGameLink').href=controllerLink(code);
  $('fullGameLink').hidden=false;
  $('padSwitch').onclick=()=>{location.assign(controllerLink(code));};
}
function render(next){
  if(!next?.room||!next?.me||!Array.isArray(next.players))return;
  state=next;
  const {room,players,me}=next;
  $('padPlayerName').textContent=me.name;
  $('padBalance').textContent=MONEY(me.cash);
  if(room.status==='finished'){toast('Game ended. Returning home.');setTimeout(home,900);stop();return;}
  const owned=(me.properties||[]).map(index=>BOARD[index]).filter(Boolean);
  $('padPropertyCount').textContent=String(owned.length);
  $('propertyModalCount').textContent=String(owned.length);
  const propertyKey=(me.properties||[]).join(',');
  if(renderedProperties!==propertyKey){
    renderedProperties=propertyKey;
    const list=$('padProperties');list.replaceChildren();
    if(!owned.length){
      const empty=document.createElement('p');
      empty.className='propertyCardsEmpty';
      empty.textContent='You do not own any properties yet.';
      list.append(empty);
    }else{
      for(const property of owned){
        const card=document.createElement('article');
        card.className='propertyDetailCard';
        const stripe=document.createElement('div');
        stripe.className='propertyDetailStripe';
        stripe.style.background=property.color?COLORS[property.color]||'#b5d5ca':'#c4b27c';
        const type=document.createElement('small');
        type.textContent=property.type==='property'?'PROPERTY':property.type==='transport'?'CAR SHOP':'UTILITY';
        const name=document.createElement('h3');
        name.textContent=property.name;
        const price=document.createElement('p');
        price.textContent='Purchase price: '+MONEY(property.price);
        card.append(stripe,type,name,price);
        list.append(card);
      }
    }
  }
  const lobby=room.status==='lobby';
  $('waitingPanel').hidden=!lobby;
  $('activePad').hidden=lobby;
  $('padStart').hidden=!me.host||!lobby;
  $('padEndGame').hidden=!me.host||room.status!=='playing';
  if(lobby){
    $('waitingCount').textContent=players.length+' of '+room.max_players+' joined';
    $('waitingNames').replaceChildren();
    for(const p of players){const div=document.createElement('div');div.textContent=p.name+(p.seat===me.seat?' (you)':'');$('waitingNames').append(div);}
    $('padStart').disabled=players.length<2;
    return;
  }
  const self=players.find(p=>p.seat===me.seat);
  const myTurn=room.turn_seat===me.seat && !me.bankrupt && room.status==='playing';
  $('padJailNotice').hidden=!self?.jailed;
  renderDice(room);
  $('padRoll').disabled=busy||!myTurn||room.phase!=='roll';
  $('padBuy').disabled=busy||!myTurn||room.phase!=='decision';
  $('padPass').disabled=busy||!myTurn||room.phase!=='decision';
  $('padEnd').disabled=busy||!myTurn||room.phase!=='end';
  const pending=BOARD[room.pending_space];
  // Keep the four face buttons visually blank; action names are available
  // to assistive tech and on long-press, never printed inside the circles.
  const buyLabel=pending?'Buy '+(pending.name||'property')+' for '+MONEY(pending.price):'Buy property';
  $('padBuy').setAttribute('aria-label',buyLabel);
  $('padBuy').title=buyLabel;

}
async function refresh(){
  if(!code||busy||document.hidden)return;
  try{
    const next=await rpc('mc_room_state',{p_code:code});
    render(next);
  }catch(error){
    // If the host cancelled an unstarted room or membership is revoked,
    // clear the stale controller and return to the join form.
    if(/room not found|room does not exist|not a member|not a member of/i.test(error.message||'')){
      stop();code='';state=null;
      localStorage.removeItem(storageKey);
      history.replaceState({},'',location.pathname);
      $('padScreen').hidden=true;$('joinScreen').hidden=false;
      $('fullGameLink').hidden=true;
      toast('Room closed. Join or create another room.');
    }else toast('Connection: '+(error.message||'Please retry'));
  }
}
async function startRoom(){
  if(!code||busy||!state?.me.host)return;
  busy=true;$('padStart').disabled=true;
  try{await rpc('mc_start_room',{p_code:code});await refreshAfterAction();}
  catch(e){toast(e.message||'Cannot start game');}
  finally{busy=false;render(state);}
}
async function refreshAfterAction(){
  const next=await rpc('mc_room_state',{p_code:code});
  render(next);
}
async function action(name){
  if(busy||!state||state.room.status!=='playing')return;
  if(state.me.seat!==state.room.turn_seat)return;
  if(({roll:'roll',buy:'decision',pass:'decision',end:'end'})[name]!==state.room.phase)return;
  busy=true;render(state);
  try{
    const next=await rpc('mc_take_action',{p_code:code,p_action:name});
    render(next);
    if(name==='buy')toast('Property purchased!');
  }catch(error){toast(error.message||'Action failed');}
  finally{busy=false;if(state)render(state);}
}
async function endGame(){
  if(!code||!state?.me.host||state.room.status!=='playing'||busy)return;
  if(!confirm('End the game for everyone? This cannot be undone.'))return;
  busy=true;
  try{await rpc('mc_end_game',{p_code:code});home();}
  catch(e){toast(e.message||'Unable to end game');}
  finally{busy=false;}
}
async function join(){
  if(busy)return;
  const name=$('controllerName').value.trim();
  const requested=$('controllerCode').value.trim().toUpperCase();
  if(name.length<1||name.length>24){$('joinError').textContent='Enter a name between 1 and 24 characters.';$('joinError').hidden=false;return;}
  if(!/^[A-F0-9]{8}$/.test(requested)){$('joinError').textContent='Enter a valid 8-character room code.';$('joinError').hidden=false;return;}
  busy=true;$('joinError').hidden=true;$('controllerJoin').disabled=true;
  try{
    await rpc('mc_join_room',{p_code:requested,p_name:name});
    localStorage.setItem(nameKey,name);
    setJoined(requested);
    await refreshAfterAction();
    if(!poll)poll=setInterval(refresh,1300);
  }catch(e){$('joinError').textContent=e.message||'Could not join room';$('joinError').hidden=false;}
  finally{busy=false;$('controllerJoin').disabled=false;}
}
$('controllerJoin').addEventListener('click',join);
$('controllerName').addEventListener('keydown',e=>{if(e.key==='Enter')join();});
$('controllerCode').addEventListener('keydown',e=>{if(e.key==='Enter')join();});
function closePropertyCards(){
  $('propertyCardsDialog').hidden=true;
  $('padPropertiesOpen').focus();
}
$('padPropertiesOpen').addEventListener('click',()=>{
  $('propertyCardsDialog').hidden=false;
  $('padPropertiesClose').focus();
});
$('padPropertiesClose').addEventListener('click',closePropertyCards);
$('propertyCardsDialog').addEventListener('click',event=>{
  if(event.target===$('propertyCardsDialog'))closePropertyCards();
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('propertyCardsDialog').hidden)closePropertyCards();
});
$('padRoll').addEventListener('click',()=>action('roll'));
$('padBuy').addEventListener('click',()=>action('buy'));
$('padPass').addEventListener('click',()=>action('pass'));
$('padEnd').addEventListener('click',()=>action('end'));
$('padStart').addEventListener('click',startRoom);
$('padEndGame').addEventListener('click',endGame);
$('padLeave').addEventListener('click',home);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
window.addEventListener('pageshow',()=>{if(code)refresh();});
window.addEventListener('beforeunload',stop);

async function init(){
  $('controllerName').value=localStorage.getItem(nameKey)||'';
  const requested=new URLSearchParams(location.search).get('room')||localStorage.getItem(storageKey)||'';
  $('controllerCode').value=requested.toUpperCase().slice(0,8);
  try{
    if(!MY_CITY_SUPABASE_URL||!MY_CITY_SUPABASE_PUBLISHABLE_KEY)throw Error('Supabase connection is not configured.');
    supabase=createClient(MY_CITY_SUPABASE_URL,MY_CITY_SUPABASE_PUBLISHABLE_KEY);
    const {data,error}=await supabase.auth.getSession();
    if(error)throw error;
    if(!data.session){
      const signed=await supabase.auth.signInAnonymously();
      if(signed.error)throw signed.error;
    }
    $('connectingState').textContent='Connected · ready to join';
    if(/^[A-F0-9]{8}$/.test(requested)){
      try{
        const room=await rpc('mc_room_state',{p_code:requested});
        if(room?.me){
          setJoined(requested);render(room);
          poll=setInterval(refresh,1300);
        }
      }catch{
        // New phone: room invite code is prefilled, but joining needs a name.
        $('connectingState').textContent='Enter your name to join this room.';
      }
    }
  }catch(e){
    $('joinError').textContent=e.message||'Cannot connect to Supabase';
    $('joinError').hidden=false;
    $('connectingState').textContent='Not connected';
    $('controllerJoin').disabled=true;
  }
}
init();
