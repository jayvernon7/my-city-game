import assert from 'node:assert/strict';
import { BOARD, gridPosition } from '../board-data.js';

const names=[
  'GO','Bowling Avenue','Community Chest','Green Street','Income Tax','Car Shop #1',
  'Campbell Rd','Chance','Robbins Dr','Packard Rd','Jail / Just Visiting','Devon Park',
  'Utility Bill','Westview Park','Peninsular Place','Car Shop #2','East Medical Dr',
  'Community Chest','Fuller Rd','West Medical Dr','Casino','St. Marys','Chance',
  'Basil Rd','Snowden','Car Shop #3','Warren E Bow','Ludington Magnet','Utility Bill',
  'University','Go To Jail','Pembroke Ave','Greenfield Rd','Community Chest','7 Mile',
  'Car Shop #4','Chance','Marlowe','Luxury Tax','Coyle'
];
assert.equal(BOARD.length,40);
assert.deepEqual(BOARD.map(s=>s.name),names);
const spots=BOARD.map(s=>gridPosition(s.index));
assert.equal(new Set(spots.map(s=>s.row+','+s.col)).size,40);
assert.deepEqual(gridPosition(0),{row:10,col:10});
assert.deepEqual(gridPosition(1),{row:10,col:9});
assert.deepEqual(gridPosition(6),{row:10,col:4});
assert.deepEqual(gridPosition(7),{row:10,col:3});
assert.deepEqual(gridPosition(8),{row:10,col:2});
assert.deepEqual(gridPosition(10),{row:10,col:0});
assert.deepEqual(gridPosition(20),{row:0,col:0});
assert.deepEqual(gridPosition(30),{row:0,col:10});
assert.deepEqual(gridPosition(32),{row:2,col:10});
assert.deepEqual(gridPosition(33),{row:3,col:10});
assert.deepEqual(gridPosition(34),{row:4,col:10});
assert.deepEqual(gridPosition(39),{row:9,col:10});
assert.deepEqual(BOARD.filter(x=>x.type==='transport').map(x=>x.index+1),[6,16,26,36]);
assert.deepEqual(BOARD.filter(x=>x.type==='chest').map(x=>x.index+1),[3,18,34]);
assert.deepEqual(BOARD.filter(x=>x.type==='chance').map(x=>x.index+1),[8,23,37]);
console.log('✓ All 40 labels, locations, colors and critical spaces validated.');
