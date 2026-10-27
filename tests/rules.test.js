'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createRoom,makePlayer,act,publicState,generateBoard,score}=require('../game');
function setupRoom(n=6){
  const room=createRoom('Captain 1');for(let i=1;i<n;i++)room.players.push(makePlayer('Captain '+(i+1),i));
  act(room,0,{type:'start'});
  while(room.phase==='setup'){
    const i=room.current,p=room.players[i],legal=publicState(room,i).legal;
    if(room.setupMode==='settlement')act(room,i,{type:'settlement',node:legal.nodes[0]});
    else act(room,i,{type:'road',edge:legal.edges[0]});
  }
  return room;
}
test('30 connected hexes with correctly joined corner nodes and edges',()=>{
  const b=generateBoard();assert.equal(b.tiles.length,30);assert.equal(b.nodes.length,80);assert.equal(b.edges.length,109);
  assert.equal(b.tiles.filter(t=>t.terrain==='desert').length,2);
  assert.equal(b.tiles.filter(t=>t.number).length,28);
  assert.equal(b.tiles.filter(t=>t.robber).length,1);
});
test('six-player snake setup grants two settlements and roads to everyone',()=>{
  const r=setupRoom();assert.equal(r.phase,'roll');assert.equal(r.current,0);assert.equal(r.turn,1);
  for(const p of r.players){assert.equal(p.settlements.length,2);assert.equal(p.roads.length,2);}
  assert.equal(r.board.nodes.filter(n=>n.owner).length,12);
  assert.equal(r.board.edges.filter(e=>e.owner).length,12);
});
test('setup does not permit repeated settlements or roads out of order',()=>{
  const r=createRoom('P1');r.players.push(makePlayer('P2',1));act(r,0,{type:'start'});
  const first=publicState(r,0).legal.nodes[0];act(r,0,{type:'settlement',node:first});
  assert.throws(()=>act(r,0,{type:'settlement',node:publicState(r,0).legal.nodes[0]}),/connecting road/);
  const edge=publicState(r,0).legal.edges[0];act(r,0,{type:'road',edge});
  assert.throws(()=>act(r,1,{type:'road',edge:0}),/Place your settlement/);
});
test('resources are private and player sessions cannot take each other’s turns',()=>{
  const r=setupRoom();const own=publicState(r,0),other=publicState(r,1);
  assert.ok(Object.hasOwn(own.me,'resources'));
  assert.ok(!Object.hasOwn(own.players[1],'resources'));
  assert.notEqual(own.me.id,other.me.id);
  assert.throws(()=>act(r,1,{type:'roll'}),/turn/);
  act(r,0,{type:'roll'});if(r.phase==='robber')act(r,0,{type:'robber',tile:publicState(r,0).legal.tiles[0]});
  assert.equal(r.phase,'action');
  act(r,0,{type:'endTurn'});assert.equal(r.current,1);
});
test('bank and player trades transfer exact resources and offer may be rejected',()=>{
  const r=setupRoom();act(r,0,{type:'roll'});if(r.phase==='robber')act(r,0,{type:'robber',tile:publicState(r,0).legal.tiles[0]});
  const a=r.players[0],b=r.players[1];a.resources.lumber=8;b.resources.grain=4;const bLumberBefore=b.resources.lumber;
  act(r,0,{type:'bankTrade',give:'lumber',want:'ore'});assert.equal(a.resources.lumber,4);assert.ok(a.resources.ore>=1);
  act(r,0,{type:'proposeTrade',to:b.id,give:'lumber',want:'grain',amount:2,request:3});
  act(r,1,{type:'tradeResponse',accept:true});assert.equal(a.resources.lumber,2);assert.equal(b.resources.grain,1);assert.equal(b.resources.lumber,bLumberBefore+2);
});
test('development cards are not playable on the buying turn',()=>{
  const r=setupRoom();act(r,0,{type:'roll'});if(r.phase==='robber')act(r,0,{type:'robber',tile:publicState(r,0).legal.tiles[0]});
  const p=r.players[0];p.resources.ore=4;p.resources.grain=5;p.resources.wool=3;
  r.deck=['knight'];act(r,0,{type:'buyDev'});
  assert.ok(p.devCards.some(d=>d.type==='knight'));
  assert.throws(()=>act(r,0,{type:'playDev',card:'knight'}),/newly purchased/);
});
