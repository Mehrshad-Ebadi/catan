'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {server}=require('../server');
async function post(base,path,body){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
test('two browser sessions share a private room with a working server API',async()=>{
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const host=(await post(base,'/api/create',{name:'Alice'})).data;
    const guest=(await post(base,'/api/join',{room:host.room,name:'Bob'})).data;
    assert.notEqual(host.token,guest.token);
    const state=await (await fetch(base+`/api/state?room=${host.room}&token=${host.token}`)).json();
    assert.equal(state.players.length,2);assert.equal(state.phase,'lobby');
    const forbidden=await post(base,'/api/action',{room:host.room,token:guest.token,action:{type:'start'}});
    assert.equal(forbidden.status,400);
    const started=await post(base,'/api/action',{room:host.room,token:host.token,action:{type:'start'}});
    assert.equal(started.status,200);
    const view=await (await fetch(base+`/api/state?room=${host.room}&token=${guest.token}`)).json();
    assert.equal(view.phase,'setup');assert.ok(view.board.tiles.length===30);
    assert.ok(!('resources' in view.players[0]));
    const bad=await post(base,'/api/action',{room:host.room,token:'wrong',action:{type:'roll'}});assert.equal(bad.status,400);
  }finally{await new Promise(done=>server.close(done));}
});
