// Round-end American double-zero roulette: game currency only.
// Standard US single-number, even-money, dozen, column, four-number corner
// and six-number double-street line payouts.
import { ROULETTE_WHEEL_CLOCKWISE } from './roulette3d.js?v=buildings-roulette-20261106-2';

const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const CHIPS = [[1,'#e9e4cf'],[5,'#e05b5b'],[10,'#468fdc'],[20,'#168b67'],[50,'#7d5ed3'],[100,'#25282d']];
const OUTSIDE = [
  ['red','RED','1:1'],['black','BLACK','1:1'],
  ['even','EVEN','1:1'],['odd','ODD','1:1'],
  ['low','1–18','1:1'],['high','19–36','1:1'],
  ['dozen1','1st 12','2:1'],['dozen2','2nd 12','2:1'],['dozen3','3rd 12','2:1'],
  ['col1','Column 1','2:1'],['col2','Column 2','2:1'],['col3','Column 3','2:1']
];
const money = n => '$'+Number(n).toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
function outcome(){
  const limit=0x100000000-(0x100000000%38);
  const array=new Uint32Array(1);
  let n;
  do {
    if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(array);
    else array[0]=Math.floor(Math.random()*0x100000000);
    n=array[0];
  } while(n>=limit);
  return ROULETTE_WHEEL_CLOCKWISE[n%38];
}
function numbersForInside(key){
  if(key.startsWith('corner:')){
    const m=/^corner:(\\d+):([01])$/.exec(key);
    if(!m)return [];
    const c=Number(m[1]),r=Number(m[2]);
    if(c<0||c>10)return [];
    return [c*3+3-r,c*3+2-r,(c+1)*3+3-r,(c+1)*3+2-r];
  }
  if(key.startsWith('line:')){
    const m=/^line:(\\d+)$/.exec(key);
    if(!m)return [];
    const c=Number(m[1]);
    return c>=0&&c<=10?Array.from({length:6},(_,i)=>c*3+i+1):[];
  }
  return [];
}
function validBetKey(key){
  if(key.startsWith('number:'))return /^(?:0|00|[1-9]|[12]\\d|3[0-6])$/.test(key.slice(7));
  if(key.startsWith('corner:')||key.startsWith('line:'))return numbersForInside(key).length>0;
  return OUTSIDE.some(([v])=>v===key);
}
function winner(bet,number){
  const value=String(number);
  if(bet.key.startsWith('number:'))return bet.key.slice(7)===value;
  if(bet.key.startsWith('corner:')||bet.key.startsWith('line:'))
    return numbersForInside(bet.key).includes(Number(number))&&number!=='0'&&number!=='00';
  const n=Number(number);
  if(number==='0'||number==='00')return false;
  if(bet.key==='red')return RED.has(n);
  if(bet.key==='black')return !RED.has(n);
  if(bet.key==='even')return n%2===0;
  if(bet.key==='odd')return n%2===1;
  if(bet.key==='low')return n<=18;
  if(bet.key==='high')return n>=19;
  if(bet.key.startsWith('dozen'))return Math.ceil(n/12)===Number(bet.key.slice(5));
  if(bet.key.startsWith('col'))return ((n-1)%3)+1===Number(bet.key.slice(3));
  return false;
}
const odds = key => key.startsWith('number:')?35:key.startsWith('corner:')?8:key.startsWith('line:')?5:(key.startsWith('dozen')||key.startsWith('col'))?2:1;
const labelOf = key => key.startsWith('number:')?key.slice(7):
  key.startsWith('corner:')?'Corner '+numbersForInside(key).join('/'):
  key.startsWith('line:')?'Six-line '+numbersForInside(key).join('/'):
  (OUTSIDE.find(([k])=>k===key)?.[1]||key);
const totalOf = bets => bets.reduce((sum,b)=>sum+b.amount,0);
const activePlayer = (game,s) => game.players[s.sequence[s.cursor]];
const chosenBets = (s,id) => s.bets[id]||[];
function ensureSession(game){
  const s=game.roulette;
  if(!s || !Array.isArray(s.sequence) || !Array.isArray(s.bets))return null;
  if(typeof s.roundEnd!=='boolean')s.roundEnd=true;
  return s;
}

export function createRouletteController({getGame,save,render,log,scene,afterRound}){
  const root=document.getElementById('rouletteGame');
  const chips=document.getElementById('rouletteChips');
  const numbers=document.getElementById('rouletteNumbers');
  const zero=document.getElementById('rouletteZero');
  const columns=document.getElementById('rouletteColumns');
  const dozens=document.getElementById('rouletteDozens');
  const outside=document.getElementById('rouletteOutside');
  chips.innerHTML=CHIPS.map(([v,color])=>'<button type="button" class="r-chip" data-chip="'+v+'" style="--chip:'+color+';'+(v===1?'color:#141c20;':'')+'">$'+v+'</button>').join('');
  // Casino table order: top row 3–36, middle 2–35, bottom 1–34.
  // The rows match the existing col1/col2/col3 payout logic.
  const makeNumber=n=>'<button type="button" class="r-number '+(RED.has(n)?'red':'black')
    +'" data-bet="number:'+n+'" title="Straight '+n+' · 35:1">'+n+'</button>';
  numbers.innerHTML=[3,2,1].flatMap(first=>
    Array.from({length:12},(_,i)=>first+i*3)).map(makeNumber).join('');
  zero.innerHTML=['0','00'].map(n=>'<button type="button" class="r-number r-zero green" data-bet="number:'+n+'" title="Straight '+n+' · 35:1">'+n+'</button>').join('');
  const makeOutside=([key,label,returns])=>'<button type="button" class="r-outside '+key
    +'" data-bet="'+key+'" title="'+label+' · '+returns+'">'+label+'<small>'+returns+'</small></button>';
  columns.innerHTML=['col3','col2','col1'].map(k=>makeOutside(OUTSIDE.find(([key])=>key===k))).join('');
  dozens.innerHTML=['dozen1','dozen2','dozen3'].map(k=>makeOutside(OUTSIDE.find(([key])=>key===k))).join('');
  outside.innerHTML=['low','even','red','black','odd','high'].map(k=>makeOutside(OUTSIDE.find(([key])=>key===k))).join('');
  // Intersection bets sit ON the shared borders of the real betting grid.
  // 22 corners cover a 2x2 group; 11 double streets cover six numbers.
  const inside=[];
  for(let c=0;c<11;c++){
    for(let r=0;r<2;r++){
      const key='corner:'+c+':'+r;
      inside.push('<button type="button" class="r-intersection r-corner" data-bet="'+key
        +'" style="left:'+((c+1)*100/12)+'%;top:'+((r+1)*100/3)+'%" title="'+labelOf(key)+' · 8:1" aria-label="'+labelOf(key)+' · 8 to 1">4</button>');
    }
    const key='line:'+c;
    inside.push('<button type="button" class="r-intersection r-sixline" data-bet="'+key
      +'" style="left:'+((c+1)*100/12)+'%;top:50%" title="'+labelOf(key)+' · 5:1" aria-label="'+labelOf(key)+' · 5 to 1">6</button>');
  }
  numbers.insertAdjacentHTML('beforeend',inside.join(''));
  function paintWagers(s,game){
    const all=[];
    for(const id of s.sequence){
      for(const bet of chosenBets(s,id))all.push({bet,id});
    }
    for(const node of root.querySelectorAll('[data-bet]')){
      const matching=all.filter(item=>item.bet.key===node.dataset.bet);
      const prev=node.querySelector('.r-table-chips');
      if(prev)prev.remove();
      node.classList.toggle('bet-selected',matching.length>0);
      node.classList.toggle('winning-pocket',s.stage==='result'&&node.dataset.bet==='number:'+s.result);
      const total=matching.reduce((sum,item)=>sum+item.bet.amount,0);
      const label=labelOf(node.dataset.bet);
      node.setAttribute('aria-label',label+(total?' — '+money(total)+' wagered':''));
      if(!matching.length)continue;
      const stack=document.createElement('span');
      stack.className='r-table-chips';
      const chipsShown=matching.slice(-3);
      stack.innerHTML=chipsShown.map(({bet,id})=>{
        const color=CHIPS.find(([v])=>v===bet.amount)?.[1]||'#e9e4cf';
        const owner=game.players[id];
        const ring=/^#[0-9a-f]{6}$/i.test(owner.color||'')?owner.color:'#f5d89d';
        return '<span class="r-table-chip" style="--r-chip:'+color+';--r-ring:'+ring
          +'" title="'+esc(owner.name)+' · '+money(bet.amount)+'">'+money(bet.amount)+'</span>';
      }).join('')+(matching.length>3?'<span class="r-table-more">+'+(matching.length-3)+'</span>':'');
      node.appendChild(stack);
    }
  }

  function start(nextTurn,options={}){
    const game=getGame();
    const sequence=game.players.map((p,i)=>(!p.bankrupt&&(!options.onlyPlayers||options.onlyPlayers.includes(i)))?i:-1).filter(i=>i>=0);
    game.roulette={nextTurn,roundEnd:options.roundEnd!==false,sequence,cursor:0,stage:'betting',chip:5,
      bets:game.players.map(()=>[]),result:null,results:[]};
    game.phase='roulette';
    scene.setMode('roulette');
    log(options.roundEnd===false?'🎰 Casino landing! Private roulette is open for '+game.players[sequence[0]].name+'.':'🎰 Round '+game.round+' complete. Roulette is open to every active player!');
    autoBetBots();
    save();render();
  }
  function autoBetBots(){
    const game=getGame(),s=ensureSession(game);
    if(!s||s.stage!=='betting')return;
    while(s.cursor<s.sequence.length && game.players[s.sequence[s.cursor]].bot){
      const id=s.sequence[s.cursor],p=game.players[id];
      // The solo computer participates with occasional small bets.
      if(p.cash>=5 && Math.random()<.65){
        const amount=Math.min(p.cash,Math.random()<.5?5:10,100);
        s.bets[id].push({key:Math.random()<.5?'red':'black',amount});
      }
      s.cursor++;
    }
    if(s.cursor>=s.sequence.length)s.stage='ready';
  }
  function place(key){
    const game=getGame(),s=ensureSession(game);
    if(!s||game.phase!=='roulette'||s.stage!=='betting')return;
    if(!validBetKey(key))return;
    const p=activePlayer(game,s),spent=totalOf(s.bets[s.sequence[s.cursor]]);
    if(spent+s.chip>100||spent+s.chip>p.cash){
      document.getElementById('rouletteNotice').textContent='Maximum $100 per player, limited by your available balance.';
      return;
    }
    s.bets[s.sequence[s.cursor]].push({key,amount:s.chip});
    save();render();
  }
  function undo(){
    const game=getGame(),s=ensureSession(game);
    if(s?.stage!=='betting'||game.phase!=='roulette')return;
    chosenBets(s,s.sequence[s.cursor]).pop();
    save();render();
  }
  function lock(){
    const game=getGame(),s=ensureSession(game);
    if(s?.stage!=='betting'||game.phase!=='roulette')return;
    s.cursor++;
    autoBetBots();
    save();render();
  }
  async function spin(){
    const game=getGame(),s=ensureSession(game);
    if(!s||game.phase!=='roulette'||s.stage!=='ready')return;
    s.stage='spinning';
    s.result=outcome();
    save();render();
    try{
      // Result is read back from the visibly occupied wheel pocket.
      s.result=await scene.spinRoulette(s.result);
    }catch(e){
      console.warn('Roulette animation unavailable; using preselected pocket',e);
    }
    if(getGame()!==game||game.roulette!==s)return;
    const results=[];
    for(const id of s.sequence){
      const p=game.players[id],bets=chosenBets(s,id);
      const stake=totalOf(bets);
      const returned=bets.reduce((sum,b)=>sum+(winner(b,s.result)?b.amount*(odds(b.key)+1):0),0);
      const net=returned-stake;
      p.cash+=net;
      if(game.stats?.[id])game.stats[id].roulette=(game.stats[id].roulette||0)+net;
      results.push({id,stake,returned,net});
      if(stake)log('🎰 '+p.name+' '+(net>=0?'won '+money(net):'lost '+money(-net))+' on roulette.');
    }
    s.results=results;s.stage='result';
    log('🎡 Roulette landed on '+s.result+'!');
    save();render();
  }
  function continueGame(){
    const game=getGame(),s=ensureSession(game);
    if(!s||s.stage!=='result'||game.phase!=='roulette')return;
    game.roulette=null;
    root.hidden=true;
    scene.setMode('follow');
    afterRound(s.nextTurn,s.roundEnd!==false);
  }

  function renderUI(){
    const game=getGame(),s=ensureSession(game);
    if(!s||game.phase!=='roulette'){root.hidden=true;return}
    root.hidden=false;
    document.getElementById('rouletteRound').textContent=(s.roundEnd?'ROUND '+game.round+' • GROUP':'PRIVATE CASINO')+' • AMERICAN ROULETTE';
    const betting=s.stage==='betting';
    document.getElementById('rouletteBetUI').hidden=!betting;
    document.getElementById('rouletteOutcomePanel').hidden=s.stage!=='result';
    document.getElementById('rouletteNext').hidden=!betting;
    document.getElementById('rouletteUndo').hidden=!betting;
    document.getElementById('rouletteSkip').hidden=s.roundEnd||s.stage==='spinning'||s.stage==='result';
    document.getElementById('rouletteSpin').hidden=s.stage!=='ready';
    document.getElementById('rouletteContinue').hidden=s.stage!=='result';
    document.getElementById('rouletteSpinStatus').hidden=s.stage!=='spinning';
    if(betting){
      const id=s.sequence[s.cursor],p=activePlayer(game,s),bets=chosenBets(s,id),spent=totalOf(bets);
      document.getElementById('roulettePlayer').textContent=p.name+' • '+money(p.cash)+' balance';
      document.getElementById('rouletteLimit').textContent=money(spent)+' / '+money(Math.min(100,p.cash))+' in bets';
      document.getElementById('rouletteBets').innerHTML=bets.length?bets.map(b=>'<span class="r-wager">'+esc(labelOf(b.key))+' '+money(b.amount)+'</span>').join(''):'<span class="r-muted">Choose a chip, then tap a number or outside bet.</span>';
      document.getElementById('rouletteNext').textContent=spent?'LOCK BETS & NEXT →':'SKIP & NEXT →';
      document.getElementById('rouletteUndo').disabled=!bets.length;
      for(const b of chips.querySelectorAll('[data-chip]')){
        const v=Number(b.dataset.chip);
        b.classList.toggle('chosen',v===s.chip);
        b.setAttribute('aria-pressed',String(v===s.chip));
        b.disabled=spent+v>100||spent+v>p.cash;
      }
      document.getElementById('rouletteNotice').textContent='Each player may wager up to $100 total, or their available balance if lower.';
    } else if(s.stage==='ready'){
      document.getElementById('roulettePlayer').textContent='All players have finished betting';
      document.getElementById('rouletteLimit').textContent='Press SPIN WHEEL to settle all bets';
      document.getElementById('rouletteNotice').textContent='Bets are locked. Results are shared by everyone.';
    } else if(s.stage==='spinning'){
      document.getElementById('roulettePlayer').textContent='The wheel is spinning…';
      document.getElementById('rouletteLimit').textContent='No more bets';
    } else {
      const n=s.result;
      const color=n==='0'||n==='00'?'green':RED.has(Number(n))?'red':'black';
      document.getElementById('roulettePlayer').textContent='Winning number: '+n+' ('+color+')';
      document.getElementById('rouletteLimit').textContent='Round '+game.round+' settled';
      document.getElementById('rouletteResult').textContent=String(n);
      document.getElementById('rouletteResult').className='r-result '+color;
      document.getElementById('roulettePayouts').innerHTML=s.results.map(r=>{
        const p=game.players[r.id];
        return '<div class="r-payout"><strong>'+esc(p.name)+'</strong><span>Wager '+money(r.stake)+'</span><b class="'+(r.net>=0?'plus':'minus')+'">'+(r.net>=0?'+':'')+money(r.net)+'</b></div>';
      }).join('');
      document.getElementById('rouletteNotice').textContent='Payouts include the returned stake. All balances have been updated.';
    }
    // The placed colored chips remain visible while every player bets, the wheel
    // spins, and results are shown. Chip border follows the player's shirt color.
    paintWagers(s,game);
  }
  root.addEventListener('click',e=>{
    const chip=e.target.closest('[data-chip]');
    if(chip&&!chip.disabled){
      const game=getGame(),s=ensureSession(game);
      if(s?.stage==='betting'){s.chip=Number(chip.dataset.chip);save();render()}
      return;
    }
    const btn=e.target.closest('[data-bet]');
    if(btn){place(btn.dataset.bet);return}
  });
  document.getElementById('rouletteUndo').addEventListener('click',undo);
  document.getElementById('rouletteNext').addEventListener('click',lock);
  document.getElementById('rouletteSpin').addEventListener('click',spin);
  document.getElementById('rouletteSkip').addEventListener('click',()=>{
    const game=getGame(),s=ensureSession(game);
    if(!s||game.phase!=='roulette'||s.roundEnd||s.stage==='spinning'||s.stage==='result')return;
    game.roulette=null;root.hidden=true;scene.setMode('follow');afterRound(s.nextTurn,false);
  });
  document.getElementById('rouletteContinue').addEventListener('click',continueGame);
  return {start,render:renderUI,restore(){
    const g=getGame(),s=ensureSession(g);
    if(g.phase==='roulette'&&s){
      if(s.stage==='spinning'){s.stage='ready';s.result=null}
      autoBetBots();scene.setMode('roulette');save();render();
    }
  }};
}
