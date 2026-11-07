// MY CITY gameplay rules — local / solo test economy.
// Monopoly-scale starting amounts. Development and event rates are provisional
// until multiplayer playtesting balances the $10,000 cash victory.
export const RULES=Object.freeze({
  startCash:1500,go:200,winCash:10000,jailFee:50,
  blockCapacity:[3,4,5,6],unexpected:[25,50,100],
  carRent:[0,25,50,100,200],
  developments:Object.freeze({
    house:{label:'House',spots:1,cost:[50,100,150,200],rent:[15,30,45,60]},
    apartment:{label:'Apartment',spots:2,cost:[100,200,300,400],rent:[45,90,135,180]},
    business:{label:'Business',spots:3,cost:[150,300,450,600],rent:[95,190,285,380]}
  })
});
export const KINDS=['house','apartment','business'];
export const blockFor=i=>Math.min(3,Math.floor(i/10));
export const capacityFor=i=>RULES.blockCapacity[blockFor(i)];
export const mortgageValue=space=>Math.floor(space.price/2);
export const emptyBuild=()=>({house:0,apartment:0,business:0});
export const usedSpots=dev=>KINDS.reduce((sum,k)=>sum+(dev?.[k]||0)*RULES.developments[k].spots,0);
export const costFor=(i,kind)=>RULES.developments[kind]?.cost[blockFor(i)]||0;
export const rentFor=(game,board,index)=>{
  const space=board[index],owner=game.owners[index];
  if(owner==null||owner<0||game.mortgaged[index])return 0;
  if(space.type==='transport'){
    const n=board.filter((s,i)=>s.type==='transport'&&game.owners[i]===owner&&!game.mortgaged[i]).length;
    return RULES.carRent[n]||0;
  }
  if(space.type!=='property')return 0;
  const dev=game.buildings[index]||emptyBuild();
  const base=Math.max(2,Math.round(space.price*.10));
  return base+KINDS.reduce((sum,k)=>sum+(dev[k]||0)*RULES.developments[k].rent[blockFor(index)],0);
};
export const unexpectedDue=game=>{
  const total={house:0,apartment:0,business:0};
  game.buildings.forEach((dev,i)=>{
    if(game.owners[i]>=0&&dev)KINDS.forEach(k=>total[k]+=dev[k]||0);
  });
  return total;
};
export const unexpectedForPlayer=(game,id)=>{
  const total={house:0,apartment:0,business:0};
  game.buildings.forEach((dev,i)=>{
    if(game.owners[i]===id&&dev)KINDS.forEach(k=>total[k]+=dev[k]||0);
  });
  return KINDS.reduce((sum,k,j)=>sum+total[k]*RULES.unexpected[j],0);
};
export const developmentResale=(i,kind)=>Math.floor(costFor(i,kind)/2);
export const canBuild=(game,board,index,kind,id)=>{
  const space=board[index],def=RULES.developments[kind];
  if(!space||space.type!=='property'||!def)return false;
  if(game.owners[index]!==id||game.mortgaged[index])return false;
  const dev=game.buildings[index]||emptyBuild();
  return usedSpots(dev)+def.spots<=capacityFor(index)&&game.players[id].cash>=costFor(index,kind);
};
export const hasBuildings=(game,index)=>usedSpots(game.buildings[index])>0;
export const ownsAnyImprovements=(game,id)=>game.owners.some((owner,i)=>owner===id&&hasBuildings(game,i));
export const canMortgage=(game,board,index,id)=>game.owners[index]===id&&!game.mortgaged[index]
  &&!ownsAnyImprovements(game,id);
