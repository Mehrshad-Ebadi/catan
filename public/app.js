'use strict';
const $=id=>document.getElementById(id);
const icons={lumber:'🪵',brick:'🧱',wool:'🐑',grain:'🌾',ore:'⛏️',desert:'🏜️'};
const names={lumber:'LUMBER',brick:'BRICK',wool:'WOOL',grain:'GRAIN',ore:'ORE'};
const colors={lumber:'#377c61',brick:'#c76c53',wool:'#86b26c',grain:'#c7a04b',ore:'#8497ac',desert:'#c5af84'};
let session=null,state=null,stream=null,mode='road',toastTimer=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options=(selected,allowed=['lumber','brick','wool','grain','ore'])=>allowed.map(t=>`<option value="${t}" ${selected===t?'selected':''}>${icons[t]} ${names[t].toLowerCase()}</option>`).join('');
const nresource=p=>Object.values(p.resources).reduce((a,b)=>a+b,0);
function toast(msg,error=false){const node=$('toast');node.textContent=msg;node.className='toast show'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.className='toast',3600);}
async function request(url,data){
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  let obj={};try{obj=await res.json();}catch{}
  if(!res.ok)throw Error(obj.error||`Request failed (${res.status}).`);
  return obj;
}
async function send(action){if(!session)return;try{await request('/api/action',{...session,action});}catch(e){toast(e.message,true);}}
function persist(room,token){session={room,token};try{localStorage.setItem('hh-'+room,token);localStorage.setItem('hh-lastroom',room);localStorage.setItem('hh-name',$('name').value.trim());}catch{}}
function showHome(){session=null;state=null;if(stream){stream.close();stream=null;}try{localStorage.removeItem('hh-lastroom');}catch{}$('home').hidden=false;$('game').hidden=true;history.replaceState({},'',location.pathname);}
async function connect(room,token){
  try{
    const res=await fetch('/api/state?room='+encodeURIComponent(room)+'&token='+encodeURIComponent(token));
    const data=await res.json();if(!res.ok)throw Error(data.error||'Could not reconnect.');
    persist(room,token);$('home').hidden=true;$('game').hidden=false;
    history.replaceState({},'',location.pathname+'?room='+room);
    draw(data);
    if(stream)stream.close();
    stream=new EventSource('/api/events?room='+encodeURIComponent(room)+'&token='+encodeURIComponent(token));
    stream.addEventListener('state',event=>{try{draw(JSON.parse(event.data));$('connected').textContent='● LIVE';$('connected').style.color='var(--teal)';}catch(e){console.error(e);}});
    stream.onerror=()=>{$('connected').textContent='● RECONNECTING';$('connected').style.color='var(--red)';};
  }catch(e){toast(e.message,true);}
}
async function create(){try{const name=$('name').value.trim();if(!name)throw Error('Enter your player name first.');const result=await request('/api/create',{name});await connect(result.room,result.token);}catch(e){toast(e.message,true);}}
async function join(){try{
  const room=$('code').value.trim().toUpperCase();if(!/^[A-F0-9]{6}$/.test(room))throw Error('Enter the six-character room code.');
  const name=$('name').value.trim(),token=localStorage.getItem('hh-'+room)||undefined;
  if(!name&&!token)throw Error('Enter your player name first.');
  const result=await request('/api/join',{room,name,token});await connect(result.room,result.token);
}catch(e){toast(e.message,true);}}
function draw(s){
  const previousPhase=state?.phase;state=s;
  $('roomtag').textContent=s.id;$('seats').textContent=s.players.length+'/6';
  if(s.phase==='lobby'){
    $('lobby').hidden=false;$('playArea').hidden=true;$('bottom').hidden=true;
    drawLobby();return;
  }
  $('lobby').hidden=true;$('playArea').hidden=false;$('bottom').hidden=false;
  if(s.phase==='setup')mode=s.setupMode;
  else if(previousPhase==='setup' && s.phase==='roll')mode='road';
  drawBoard();drawPlayers();drawResources();drawActions();drawFeed();drawHeader();
}
function drawLobby(){
  const s=state;
  $('lobby').innerHTML=`<div class="eyebrow" style="justify-content:center;margin-bottom:12px">● PRIVATE GAME ROOM</div><h2>Gather your crew.</h2>
    <p>Your invite code is <b style="color:var(--gold);letter-spacing:2px">${esc(s.id)}</b>. Share the link and your friends can join this table. Room stays open until the host starts.</p>
    <div class="lobby-seats">${Array.from({length:6},(_,i)=>{
      const p=s.players[i];return `<div class="seat ${p?'filled':''}">${p?`<span class="seat-icon" style="background:${p.color}">${i+1}</span><strong>${esc(p.name)}</strong>${p.id===s.host?'<small>ROOM HOST</small>':''}`:`<span style="font-size:26px;color:#526f79">+</span><span>EMPTY SEAT ${i+1}</span>`}</div>`;
    }).join('')}</div>
    ${s.me.id===s.host?`<button class="btn btn-primary" id="start" ${s.players.length<2?'disabled':''}>Start the game (${s.players.length} players) →</button><p style="font-size:11px;margin-top:13px">At least two players required. Add up to six before starting.</p>`:`<p><strong style="color:var(--gold)">Waiting for the host to start…</strong></p>`}
    <div style="margin-top:20px"><button class="btn btn-outline btn-slim" id="copyLobby">Copy room invite link ↗</button></div>`;
}
function drawHeader(){
  const s=state,current=s.players[s.current];
  const mine=current.id===s.me.id;
  $('turnline').textContent=s.phase==='finished'?`${s.players.find(p=>p.id===s.winner)?.name||'Someone'} WINS!`:s.phase==='setup'?'OPENING PLACEMENTS':mine?'YOUR TURN':`${current.name.toUpperCase()}'S TURN`;
  $('dice').textContent=s.dice?`🎲 ${s.dice.a} + ${s.dice.b} = ${s.dice.sum}`:'🎲 —';
  let msg='';
  if(s.phase==='setup')msg=mine?`Place ${s.setupMode==='settlement'?'a settlement at any glowing intersection':'a road connected to your new settlement'}.`:`${esc(current.name)} is placing a ${s.setupMode}.`;
  if(s.phase==='roll')msg=mine?'Roll the dice to produce resources.':'Waiting for the next player to roll.';
  if(s.phase==='robber')msg=mine?'Click a glowing hex to move the robber. A nearby rival may lose a card.':'The active player is moving the robber.';
  if(s.phase==='action')msg=mine?'Build your network, trade, or end your turn when ready.':'Watch the board, chat, or respond to a trade offer.';
  if(s.phase==='finished')msg=`🏆 ${esc(s.players.find(p=>p.id===s.winner)?.name)} reached 10 victory points! Start a fresh room for another match.`;
  $('notice').textContent=msg;
}
function points(vertices,b){return vertices.map(id=>`${b.nodes[id].x.toFixed(1)},${b.nodes[id].y.toFixed(1)}`).join(' ');}
function drawBoard(){
  const s=state,b=s.board,me=s.me,current=s.players[s.current],mine=current.id===me.id;
  const legal=s.legal;
  const tileMode=mine&&s.phase==='robber';
  const settlementMode=mine&&((s.phase==='setup'&&s.setupMode==='settlement')||(s.phase==='action'&&mode==='settlement'));
  const roadMode=mine&&((s.phase==='setup'&&s.setupMode==='road')||(s.phase==='action'&&mode==='road'));
  const cityMode=mine&&s.phase==='action'&&mode==='city';
  const pieces=b.nodes.filter(n=>n.owner),roads=b.edges.filter(e=>e.owner);
  let html=`<defs><radialGradient id="ocean"><stop offset="0%" stop-color="#1a4754"/><stop offset="100%" stop-color="#102d3d"/></radialGradient><pattern id="waves" patternUnits="userSpaceOnUse" width="30" height="25"><path d="M0 10 Q8 4 16 10T32 10" fill="none" stroke="#7ba5a7" stroke-width=".6" opacity=".11"/></pattern></defs>
    <rect x="126" y="113" width="748" height="578" rx="16" class="map-sea"/>
    <rect x="126" y="113" width="748" height="578" rx="16" fill="url(#waves)"/>
    <text x="188" y="285" class="map-watermark" transform="rotate(-90 188 285)" font-size="18" style="font-size:18px;letter-spacing:9px">NORTH SEA</text>
    <text x="812" y="530" class="map-watermark" transform="rotate(90 812 530)" style="font-size:18px;letter-spacing:8px">OPEN WATER</text>`;
  for(const t of b.tiles){
    const poly=points(t.vertices,b);const fill=colors[t.terrain];
    html+=`<polygon points="${poly}" class="landhex ${tileMode&&!t.robber?'tile-target':''}" fill="${fill}"/>`;
    html+=`<text x="${t.x}" y="${t.y-23}" class="hex-type" style="font-size:22px;letter-spacing:0">${icons[t.terrain]}</text>`;
    if(t.number){
      html+=`<circle cx="${t.x}" cy="${t.y+8}" r="17" class="num-disc"/><text class="num-text ${[6,8].includes(t.number)?'num-hot':''}" x="${t.x}" y="${t.y+9}">${t.number}</text>`;
    }else html+=`<text class="hex-type" x="${t.x}" y="${t.y+12}">DESERT</text>`;
    if(t.robber)html+=`<circle class="robber-token" cx="${t.x+29}" cy="${t.y-19}" r="13"/><text class="robber-mark" x="${t.x+29}" y="${t.y-19}">R</text>`;
    if(tileMode&&!t.robber)html+=`<polygon points="${poly}" class="hex-hit" data-tile="${t.id}"/>`;
  }
  for(const e of roads){
    const a=b.nodes[e.a],z=b.nodes[e.b],p=s.players.find(p=>p.id===e.owner);
    html+=`<line x1="${a.x}" y1="${a.y}" x2="${z.x}" y2="${z.y}" class="edge-road"/><line x1="${a.x}" y1="${a.y}" x2="${z.x}" y2="${z.y}" class="edge-inner" stroke="${p?.color||'#fff'}"/>`;
  }
  for(const node of pieces){
    const p=s.players.find(p=>p.id===node.owner);
    if(node.level===2){
      html+=`<rect class="node-piece city-piece" x="${node.x-11}" y="${node.y-11}" width="22" height="22" rx="3" fill="${p?.color}"/><path d="M${node.x-11} ${node.y-11}L${node.x} ${node.y-19}L${node.x+11} ${node.y-11}" fill="${p?.color}" stroke="#fff1d7" stroke-width="2"/>`;
    }else{
      html+=`<circle class="node-piece" cx="${node.x}" cy="${node.y}" r="11" fill="${p?.color}"/><circle cx="${node.x}" cy="${node.y}" r="3" fill="#152734"/>`;
    }
  }
  if(roadMode)for(const id of legal.edges){const e=b.edges[id],a=b.nodes[e.a],z=b.nodes[e.b];html+=`<line data-edge="${id}" x1="${a.x}" y1="${a.y}" x2="${z.x}" y2="${z.y}" class="edge-target"/>`;}
  if(settlementMode)for(const id of legal.nodes){const node=b.nodes[id];html+=`<circle data-node="${id}" class="node-target" cx="${node.x}" cy="${node.y}" r="8"/>`;}
  if(cityMode)for(const id of legal.cities){const node=b.nodes[id];html+=`<circle data-city="${id}" class="node-target" cx="${node.x}" cy="${node.y}" r="17" fill-opacity=".25"/>`;}
  $('map').innerHTML=html;
}
function drawPlayers(){
  const s=state;
  $('playerList').innerHTML=s.players.map((p,i)=>`<div class="player ${s.current===i?'active':''} ${s.winner===p.id?'champ':''}"><span class="player-dot" style="background:${p.color}">${i+1}</span><span class="playername">${esc(p.name)} ${s.me.id===p.id?'(you)':''}<small>${p.cards} resources · ${p.roads} roads · ${p.devCount} devs ${s.largestArmyHolder===p.id?' · ⚔️ Army':''}${s.longestRoadHolder===p.id?' · 🛤️ Road':''}</small></span><span class="score" title="Victory points (opponents’ hidden point cards are visible in this simplified version)">${p.score}<small style="font-size:9px;color:#91afa9"> VP</small></span></div>`).join('');
}
function drawResources(){
  const p=state.me;
  $('handTotal').textContent=nresource(p)+' CARDS';
  $('resources').innerHTML=`<div class="resource-grid">${Object.entries(p.resources).map(([type,n])=>`<div class="resource-item"><div class="resource-icon">${icons[type]}</div><strong>${n}</strong><span>${names[type]}</span></div>`).join('')}</div>`;
  const types={knight:'⚔️ Knight',victory:'🏆 Victory point',roads:'🛤️ Road Building',monopoly:'💰 Monopoly',plenty:'🌱 Year of Plenty'};
  $('devList').innerHTML=p.devCards.length?`<strong style="color:#e9dfbb">Development cards:</strong> ${p.devCards.map(d=>types[d.type]+(d.playable?'':' (new)')).join(' · ')}`:'No development cards yet.';
}
function drawActions(){
  const s=state,p=s.me,current=s.players[s.current],mine=current.id===p.id;
  const box=$('actions');let html='';
  if(s.pendingTrade?.to===p.id){
    const t=s.pendingTrade,from=s.players.find(x=>x.id===t.from);
    html+=`<div class="trade-incoming"><strong>${esc(from?.name)} wants to trade!</strong><br>They offer <b>${t.amount} ${icons[t.give]} ${t.give}</b> for <b>${t.request} ${icons[t.want]} ${t.want}</b>.<div class="action-group" style="margin-top:10px;margin-bottom:0"><button class="btn btn-primary" data-act="acceptTrade">Accept</button><button class="btn btn-ghost" data-act="declineTrade">Decline</button></div></div>`;
  }
  if(s.phase==='finished'){html+='<p class="action-intro">The table has a winner. Thanks for playing!</p><button class="btn btn-primary full" data-act="newRoom">Create new room ↗</button>';box.innerHTML=html;return;}
  if(s.phase==='setup'){
    html+=`<p class="action-intro">${mine?`Your opening move: <strong>${s.setupMode==='settlement'?'choose a glowing settlement spot':'choose a connecting glowing road'}</strong> on the board.`:`Waiting for ${esc(current.name)} to finish an opening placement.`}</p>`;
    html+='<p class="action-small">Opening order snakes forward and backward, so everyone places two settlements and two roads. Your second settlement grants starting resources.</p>';
    box.innerHTML=html;return;
  }
  if(!mine){html+=`<p class="action-intro">It's ${esc(current.name)}'s turn. You can review your hand, chat, and respond to offers.</p>`;box.innerHTML=html;return;}
  if(s.phase==='roll'){html+=`<p class="action-intro">Ready to discover what the island produces?</p><button class="btn btn-primary full" data-act="roll">🎲 Roll two dice <span>→</span></button>`;box.innerHTML=html;return;}
  if(s.phase==='robber'){html+='<p class="action-intro">The robber is on the move! Choose a glowing hex on the map.</p>';box.innerHTML=html;return;}
  if(s.phase!=='action'){box.innerHTML=html;return;}
  const legal=s.legal;
  html+=`<div class="action-subtitle">BUILD ON THE MAP</div><div class="action-group">
   <button class="btn ${mode==='road'?'selected':''}" data-mode="road" ${legal.edges.length===0?'disabled':''}>🛤️ Road <small>${legal.edges.length}</small></button>
   <button class="btn ${mode==='settlement'?'selected':''}" data-mode="settlement" ${legal.nodes.length===0?'disabled':''}>🏠 House <small>${legal.nodes.length}</small></button>
   <button class="btn ${mode==='city'?'selected':''}" data-mode="city" ${legal.cities.length===0?'disabled':''}>🏰 City <small>${legal.cities.length}</small></button></div>
   <div class="action-small">${mode==='road'?'🪵 + 🧱 to build a road.':mode==='settlement'?'🪵 + 🧱 + 🐑 + 🌾 for a settlement.':'⛏️×3 + 🌾×2 for a city.'} ${p.freeRoads?`<strong>${p.freeRoads} free road(s) available.</strong>`:''} Click a glowing ${mode==='road'?'line':'intersection'} to place it.</div>
   <div class="divider"></div><div class="action-subtitle">DEVELOPMENT</div>
   <button class="btn btn-outline full" data-act="buyDev" ${s.devRemaining===0||p.resources.ore<1||p.resources.grain<1||p.resources.wool<1?'disabled':''}>✨ Buy development card <span>${s.devRemaining} left</span></button>`;
  const playable=type=>!p.devPlayed&&p.devCards.some(d=>d.type===type&&d.playable);
  if(playable('knight'))html+=`<button class="btn btn-outline full" data-dev="knight">⚔️ Play Knight: move the robber</button>`;
  if(playable('roads'))html+=`<button class="btn btn-outline full" data-dev="roads">🛤️ Play Road Building: 2 free roads</button>`;
  if(playable('plenty'))html+=`<div class="inputrow"><select id="plentyA">${options('lumber')}</select><select id="plentyB">${options('ore')}</select></div><button class="btn btn-outline full" data-dev="plenty">🌱 Play Year of Plenty</button>`;
  if(playable('monopoly'))html+=`<div class="inputrow"><select id="monopolyResource">${options('ore')}</select><button class="btn btn-outline" data-dev="monopoly">💰 Monopoly</button></div>`;
  html+=`<div class="divider"></div><div class="action-subtitle">BANK TRADE · 4 FOR 1</div><div class="inputrow"><select id="bankGive">${options('lumber')}</select><select id="bankWant">${options('ore')}</select></div><button class="btn btn-outline full" data-act="bankTrade">Trade 4 of the left for 1 of the right</button>`;
  if(s.players.length>1){
    html+=`<div class="divider"></div><div class="action-subtitle">PLAYER-TO-PLAYER TRADE</div>
      <select id="tradeTo">${s.players.filter(x=>x.id!==p.id).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select>
      <div class="action-small" style="margin-top:8px">I give:</div><div class="inputrow"><select id="tradeGive">${options('lumber')}</select><input id="tradeAmount" aria-label="Offer quantity" type="number" min="1" max="10" value="1"></div>
      <div class="action-small">I receive:</div><div class="inputrow"><select id="tradeWant">${options('ore')}</select><input id="tradeRequest" aria-label="Request quantity" type="number" min="1" max="10" value="1"></div>
      <button class="btn btn-outline full" data-act="tradeOffer">Offer trade to player →</button>`;
  }
  html+=`<div class="divider"></div><button class="btn btn-primary full" data-act="endTurn">End turn <span>→</span></button>`;
  box.innerHTML=html;
}
function drawFeed(){
  const feed=$('feed'),nearBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<60;
  feed.innerHTML=state.messages.map(m=>`<div class="event ${m.kind==='chat'?'chatmsg':''}">${esc(m.text)}</div>`).join('');
  if(nearBottom)feed.scrollTop=feed.scrollHeight;
}
async function copyInvite(){const url=location.origin+location.pathname+'?room='+session.room;try{await navigator.clipboard.writeText(url);toast('Invite link copied! Send it to your friends.');}catch{prompt('Copy this invitation link:',url);}}
$('create').addEventListener('click',create);$('join').addEventListener('click',join);
$('name').addEventListener('keydown',e=>{if(e.key==='Enter')create();});$('code').addEventListener('keydown',e=>{if(e.key==='Enter')join();});
$('leave').addEventListener('click',showHome);$('copy').addEventListener('click',copyInvite);
$('lobby').addEventListener('click',e=>{if(e.target.closest('#start'))send({type:'start'});if(e.target.closest('#copyLobby'))copyInvite();});
$('map').addEventListener('click',e=>{
  const item=e.target.closest('[data-node],[data-edge],[data-city],[data-tile]');if(!item||!state)return;
  if(item.hasAttribute('data-node'))send({type:'settlement',node:Number(item.dataset.node)});
  else if(item.hasAttribute('data-edge'))send({type:'road',edge:Number(item.dataset.edge)});
  else if(item.hasAttribute('data-city'))send({type:'city',node:Number(item.dataset.city)});
  else if(item.hasAttribute('data-tile'))send({type:'robber',tile:Number(item.dataset.tile)});
});
$('actions').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.mode){mode=b.dataset.mode;drawBoard();drawActions();return;}
  if(b.dataset.dev){
    const card=b.dataset.dev,action={type:'playDev',card};
    if(card==='plenty'){action.a=$('plentyA').value;action.b=$('plentyB').value;}
    if(card==='monopoly')action.resource=$('monopolyResource').value;
    send(action);return;
  }
  switch(b.dataset.act){
    case 'roll':send({type:'roll'});break;
    case 'endTurn':send({type:'endTurn'});break;
    case 'buyDev':send({type:'buyDev'});break;
    case 'acceptTrade':send({type:'tradeResponse',accept:true});break;
    case 'declineTrade':send({type:'tradeResponse',accept:false});break;
    case 'bankTrade':send({type:'bankTrade',give:$('bankGive').value,want:$('bankWant').value});break;
    case 'tradeOffer':send({type:'proposeTrade',to:$('tradeTo').value,give:$('tradeGive').value,amount:Number($('tradeAmount').value),want:$('tradeWant').value,request:Number($('tradeRequest').value)});break;
    case 'newRoom':showHome();break;
  }
});
$('chatForm').addEventListener('submit',e=>{e.preventDefault();const inp=$('chatInput');const msg=inp.value.trim();if(msg){send({type:'chat',message:msg});inp.value='';}});
(function boot(){
  try{const old=localStorage.getItem('hh-name');if(old)$('name').value=old;}catch{}
  const urlRoom=new URLSearchParams(location.search).get('room')?.trim().toUpperCase();
  const lastRoom=localStorage.getItem('hh-lastroom'),room=urlRoom||lastRoom;
  if(room){$('code').value=room;const token=localStorage.getItem('hh-'+room);if(token)connect(room,token);}
})();
