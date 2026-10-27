// One authoritative, clockwise board definition. Index 0 = GO (#1).
// Change names here; rendering and gameplay both read this file.
export const BOARD = [
  ['GO','go'],
  ['Bowling Avenue','property','brown',60],
  ['Community Chest','chest'],
  ['Green Street','property','brown',60],
  ['Income Tax','tax'],
  ['Car Shop #1','transport',null,200],
  ['Campbell Rd','property','light',100],
  ['Chance','chance'],
  ['Robbins Dr','property','light',100],
  ['Packard Rd','property','light',120],
  ['Jail / Just Visiting','jail'],
  ['Devon Park','property','pink',140],
  ['Utility Bill','utility',null,150],
  ['Westview Park','property','pink',140],
  ['Peninsular Place','property','pink',160],
  ['Car Shop #2','transport',null,200],
  ['East Medical Dr','property','orange',180],
  ['Community Chest','chest'],
  ['Fuller Rd','property','orange',180],
  ['West Medical Dr','property','orange',200],
  ['Casino','casino'],
  ['St. Marys','property','red',220],
  ['Chance','chance'],
  ['Basil Rd','property','red',220],
  ['Snowden','property','red',240],
  ['Car Shop #3','transport',null,200],
  ['Warren E Bow','property','yellow',260],
  ['Ludington Magnet','property','yellow',260],
  ['Utility Bill','utility',null,150],
  ['University','property','yellow',280],
  ['Go To Jail','gojail'],
  ['Pembroke Ave','property','green',300],
  ['Greenfield Rd','property','green',300],
  ['Community Chest','chest'],
  ['7 Mile','property','green',320],
  ['Car Shop #4','transport',null,200],
  ['Chance','chance'],
  ['Marlowe','property','blue',350],
  ['Luxury Tax','tax'],
  ['Coyle','property','blue',400]
].map(([name,type,color=null,price=0],index)=>({index,name,type,color,price}));
export const COLORS = {
  brown:'#905337',light:'#62bfe6',pink:'#ef70ae',orange:'#ed9143',
  red:'#de5350',yellow:'#f4cb43',green:'#35ac78',blue:'#3458aa'
};
export const PLAYER_COLORS = ['#fb715e','#55a9ff','#64dd9b','#d59aff'];
export const PLAYER_NAMES = ['You','Player 2','Player 3','Player 4'];

// Stable development names for future gameplay rules:
// "houses" = small silver building blocks
// "hotels" = larger gold building blocks
// Developments are allowed ONLY on a property's colored strip.
export const DEVELOPMENTS = Object.freeze({
  houses: Object.freeze({name:'houses',color:'#c0c0c0'}),
  hotels: Object.freeze({name:'hotels',color:'#e5b12e'})
});

// Visual previews only: these do not grant ownership, affect rent, or
// establish gameplay rules until the development rules are implemented.
export const DEMO_DEVELOPMENTS = Object.freeze([
  Object.freeze({index:37,kind:'houses',count:1}), // Marlowe (#38)
  Object.freeze({index:39,kind:'hotels',count:1})  // Coyle (#40)
]);


// A ring of exactly 40 cells in a logical 11-by-11 grid, following the
// board image: GO bottom-right, then LEFT, UP, RIGHT, DOWN.
export function gridPosition(i) {
  if (!Number.isInteger(i) || i < 0 || i > 39) throw Error('Invalid space index: '+i);
  if (i <= 10) return {row:10,col:10-i};
  if (i <= 20) return {row:20-i,col:0};
  if (i <= 30) return {row:0,col:i-20};
  return {row:i-30,col:10};
}
export const MONEY = n => '$'+Math.round(n).toLocaleString('en-US');

// Fail loudly if an accidental edit breaks the canonical order.
if (BOARD.length !== 40 || new Set(BOARD.map(s=>JSON.stringify(gridPosition(s.index)))).size !== 40) {
  throw Error('Invalid board: requires 40 unique spaces');
}
if (BOARD[6].name !== 'Campbell Rd' || BOARD[7].name !== 'Chance' || BOARD[8].name !== 'Robbins Dr' ||
    BOARD[32].name !== 'Greenfield Rd' || BOARD[33].name !== 'Community Chest' || BOARD[34].name !== '7 Mile') {
  throw Error('Key space positions are incorrect');
}
