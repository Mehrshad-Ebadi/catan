'use strict';
const crypto = require('node:crypto');
const TYPES = ['lumber','brick','wool','grain','ore'];
const COLORS = ['#df7162','#e8b64b','#5bb5a4','#8b83db','#70a6db','#d98cb2'];
const COST = {
  road: {lumber:1,brick:1},
  settlement: {lumber:1,brick:1,wool:1,grain:1},
  city: {ore:3,grain:2},
  dev: {ore:1,grain:1,wool:1}
};
const random = n => crypto.randomInt(n);
const shuffle = a => { for(let i=a.length-1;i>0;i--){ const j=random(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const secret = () => crypto.randomBytes(24).toString('hex');
const code = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const emptyResources=()=>Object.fromEntries(TYPES.map(t=>[t,0]));
function generateBoard(){
  const rows=[3,4,5,6,5,4,3], starts=[0,-1,-2,-3,-3,-3,-3];
  const raw=[]; const R=48;
  for(let row=0;row<rows.length;row++) for(let k=0;k<rows[row];k++){
    const r=row-3,q=starts[row]+k;
    raw.push({id:raw.length,q,r,x:500+Math.sqrt(3)*R*(q+r/2),y:398+1.5*R*r});
  }
  const terrain=shuffle([...Array(6).fill('lumber'),...Array(5).fill('brick'),...Array(6).fill('wool'),...Array(6).fill('grain'),...Array(5).fill('ore'),...Array(2).fill('desert')]);
  const numbers=shuffle([2,2,12,12,...[3,4,5,6,8,9,10,11].flatMap(n=>[n,n,n])]);
  const byCoord=new Map(raw.map(t=>[`${t.q},${t.r}`,t]));
  let numberAssignment=[];
  for(let attempt=0;attempt<250;attempt++) {
    const test=shuffle(numbers.slice()); let ii=0;
    const assigned=raw.map((t,i)=>terrain[i]==='desert'?null:test[ii++]);
    const touches=(t)=>[[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]].some(([dq,dr])=>{
      const next=byCoord.get(`${t.q+dq},${t.r+dr}`);
      return next && [6,8].includes(assigned[t.id]) && [6,8].includes(assigned[next.id]);
    });
    numberAssignment=assigned;
    if(!raw.some(t=>touches(t))) break;
  }
  const nodes=[],edges=[],nodesByPos=new Map(),edgesByEnds=new Map();
  const tiles=raw.map(t=>{
    const vertices=[];
    for(let c=0;c<6;c++){
      const angle=(-90+c*60)*Math.PI/180;
      const x=t.x+R*Math.cos(angle),y=t.y+R*Math.sin(angle);
      const key=`${Math.round(x*100)},${Math.round(y*100)}`;
      let v=nodesByPos.get(key);
      if(v===undefined){ v=nodes.length;nodesByPos.set(key,v);nodes.push({id:v,x:Math.round(x*100)/100,y:Math.round(y*100)/100,tiles:[],edges:[],owner:null,level:0}); }
      vertices.push(v); nodes[v].tiles.push(t.id);
    }
    for(let i=0;i<6;i++){
      const a=vertices[i],b=vertices[(i+1)%6],key=[a,b].sort((m,n)=>m-n).join('-');
      if(!edgesByEnds.has(key)){
        const id=edges.length;edgesByEnds.set(key,id);edges.push({id,a,b,owner:null});
        nodes[a].edges.push(id); nodes[b].edges.push(id);
      }
    }
    return {id:t.id,x:t.x,y:t.y,terrain:terrain[t.id],number:numberAssignment[t.id],vertices,robber:terrain[t.id]==='desert' && !raw.slice(0,t.id).some((_,i)=>terrain[i]==='desert')};
  });
  return {tiles,nodes,edges};
}
function makePlayer(name,index){
  return {id:secret().slice(0,10),token:secret(),name,color:COLORS[index],resources:emptyResources(),roads:[],settlements:[],cities:[],devCards:[],playedKnights:0,devPlayed:false,freeRoads:0};
}
function createRoom(name){
  const p=makePlayer(name,0);
  return {id:code(),host:p.id,players:[p],phase:'lobby',current:0,setupOrder:[],setupIndex:0,setupMode:'settlement',setupNode:null,board:null,turn:0,dice:null,deck:[],winner:null,robberReturn:'action',pendingTrade:null,longestRoadHolder:null,largestArmyHolder:null,messages:[{kind:'system',text:'Room created. Invite friends using the room link.'}],createdAt:Date.now()};
}
function playerIndex(room,token){ return room.players.findIndex(p=>p.token===token); }
function fail(msg){throw new Error(msg);}
function requireIt(value,msg){if(!value) fail(msg);}
function log(room,text,kind='system'){
  room.messages.push({kind,text,ts:Date.now()});
  if(room.messages.length>90)room.messages.splice(0,room.messages.length-90);
}
function has(p,cost){return Object.entries(cost).every(([t,n])=>p.resources[t]>=n);}
function spend(p,cost){requireIt(has(p,cost),'Not enough resources.');for(const [t,n] of Object.entries(cost))p.resources[t]-=n;}
function total(p){return TYPES.reduce((s,t)=>s+p.resources[t],0);}
function recalcAwards(room){
  const longest=room.players.map(p=>longestRoadLength(room,p));
  const best=Math.max(0,...longest),current=room.players.findIndex(p=>p.id===room.longestRoadHolder);
  if(best<5) room.longestRoadHolder=null;
  else if(current===-1 || longest[current]<5){room.longestRoadHolder=longest.filter(v=>v===best).length===1?room.players[longest.indexOf(best)].id:null;}
  else if(best>longest[current])room.longestRoadHolder=room.players[longest.indexOf(best)].id;
  const armies=room.players.map(p=>p.playedKnights),max=Math.max(0,...armies),old=room.players.findIndex(p=>p.id===room.largestArmyHolder);
  if(max<3)room.largestArmyHolder=null;
  else if(old===-1)room.largestArmyHolder=armies.filter(v=>v===max).length===1?room.players[armies.indexOf(max)].id:null;
  else if(max>armies[old])room.largestArmyHolder=room.players[armies.indexOf(max)].id;
}
function longestRoadLength(room,p){
  if(!room.board)return 0;
  const b=room.board, owns=new Set(p.roads),blocked=new Set(b.nodes.filter(n=>n.owner && n.owner!==p.id).map(n=>n.id));
  let max=0;
  function walk(node,used,length){
    if(length>max)max=length;
    if(length && blocked.has(node))return;
    for(const eId of b.nodes[node].edges){
      if(!owns.has(eId)||used.has(eId))continue;
      const e=b.edges[eId],other=e.a===node?e.b:e.a;
      used.add(eId);walk(other,used,length+1);used.delete(eId);
    }
  }
  for(const eId of owns){ const e=b.edges[eId]; walk(e.a,new Set(),0);walk(e.b,new Set(),0); }
  return max;
}
function score(room,p){
  return p.settlements.length+p.cities.length*2+p.devCards.filter(d=>d.type==='victory').length+
    (room.longestRoadHolder===p.id?2:0)+(room.largestArmyHolder===p.id?2:0);
}
function checkWinner(room,p){
  recalcAwards(room);
  if(room.phase!=='setup' && score(room,p)>=10){room.phase='finished';room.winner=p.id;log(room,`${p.name} wins with ${score(room,p)} victory points!`);}
}
function validNode(room,p,nodeId,setup){
  const b=room.board,n=b.nodes[nodeId];if(!n||n.owner)return false;
  if(n.edges.some(eId=>{const e=b.edges[eId];return b.nodes[e.a===nodeId?e.b:e.a].owner;}))return false;
  if(setup)return true;
  if(p.settlements.length>=5)return false;
  return n.edges.some(eId=>b.edges[eId].owner===p.id);
}
function validRoad(room,p,edgeId,setup){
  const b=room.board,e=b.edges[edgeId];if(!e||e.owner||p.roads.length>=15)return false;
  if(setup)return e.a===room.setupNode||e.b===room.setupNode;
  return [e.a,e.b].some(nodeId=>{
    const node=b.nodes[nodeId];
    if(node.owner===p.id)return true;
    if(node.owner && node.owner!==p.id)return false;
    return node.edges.some(near=>b.edges[near].owner===p.id);
  });
}
function eligible(room,index){
  const p=room.players[index],result={nodes:[],edges:[],cities:[],tiles:[]};
  if(room.phase==='setup' && room.current===index){
    if(room.setupMode==='settlement')result.nodes=room.board.nodes.filter(n=>validNode(room,p,n.id,true)).map(n=>n.id);
    else result.edges=room.board.edges.filter(e=>validRoad(room,p,e.id,true)).map(e=>e.id);
  }else if(room.current===index && room.phase==='action'){
    if(has(p,COST.settlement)&&p.settlements.length<5)result.nodes=room.board.nodes.filter(n=>validNode(room,p,n.id,false)).map(n=>n.id);
    if((has(p,COST.road)||p.freeRoads>0)&&p.roads.length<15)result.edges=room.board.edges.filter(e=>validRoad(room,p,e.id,false)).map(e=>e.id);
    if(has(p,COST.city)&&p.cities.length<4)result.cities=p.settlements.slice();
  }else if(room.current===index && room.phase==='robber')result.tiles=room.board.tiles.filter(t=>!t.robber).map(t=>t.id);
  return result;
}
function start(room,index){
  requireIt(room.phase==='lobby','Game has already started.');
  requireIt(room.players[index].id===room.host,'Only the room host can start.');
  requireIt(room.players.length>=2,'At least two people are needed to start.');
  room.board=generateBoard();
  room.deck=shuffle([...Array(16).fill('knight'),...Array(6).fill('victory'),...Array(3).fill('roads'),...Array(3).fill('plenty'),...Array(3).fill('monopoly')]);
  const n=room.players.length;room.setupOrder=[...Array(n).keys(),...[...Array(n).keys()].reverse()];
  room.setupIndex=0;room.current=room.setupOrder[0];room.phase='setup';room.setupMode='settlement';room.turn=0;
  log(room,`The expedition begins with ${n} players. Place a settlement, then a connecting road; each player does this twice.`);
}
function placeSettlement(room,p,nodeId){
  const setup=room.phase==='setup';
  requireIt(setup || room.phase==='action','Not building settlements right now.');
  if(setup)requireIt(room.setupMode==='settlement','Place your connecting road before your next settlement.');
  requireIt(validNode(room,p,nodeId,setup),'That settlement spot is not legal.');
  if(!setup){requireIt(p.settlements.length<5,'No settlements left.');spend(p,COST.settlement);}
  const node=room.board.nodes[nodeId];node.owner=p.id;node.level=1;p.settlements.push(nodeId);
  log(room,`${p.name} built a settlement.`);
  if(setup){
    if(room.setupIndex>=room.players.length){
      for(const tId of node.tiles){const type=room.board.tiles[tId].terrain;if(type!=='desert')p.resources[type]++;}
    }
    room.setupMode='road';room.setupNode=nodeId;
  }else checkWinner(room,p);
}
function placeRoad(room,p,edgeId){
  const setup=room.phase==='setup';
  requireIt(setup||room.phase==='action','Cannot build a road right now.');
  if(setup)requireIt(room.setupMode==='road','Place your settlement before its connecting road.');
  requireIt(validRoad(room,p,edgeId,setup),'That road placement is not legal.');
  if(!setup){if(p.freeRoads>0)p.freeRoads--;else spend(p,COST.road);}
  room.board.edges[edgeId].owner=p.id;p.roads.push(edgeId);
  log(room,`${p.name} built a road.`);
  if(setup){
    room.setupIndex++;room.setupNode=null;room.setupMode='settlement';
    if(room.setupIndex===room.setupOrder.length){room.current=0;room.phase='roll';room.turn=1;log(room,`Setups complete. ${room.players[0].name} rolls first!`);}
    else room.current=room.setupOrder[room.setupIndex];
  }else checkWinner(room,p);
}
function city(room,p,nodeId){
  requireIt(room.phase==='action','Not building a city right now.');
  requireIt(p.settlements.includes(nodeId),'You must upgrade your own settlement.');
  requireIt(p.cities.length<4,'No cities left.');spend(p,COST.city);
  p.settlements.splice(p.settlements.indexOf(nodeId),1);p.cities.push(nodeId);room.board.nodes[nodeId].level=2;
  log(room,`${p.name} upgraded a settlement into a city.`);checkWinner(room,p);
}
function roll(room,p){
  requireIt(room.phase==='roll','You have already rolled this turn.');
  const a=1+random(6),b=1+random(6),sum=a+b;room.dice={a,b,sum};
  log(room,`${p.name} rolled ${a} + ${b} = ${sum}.`);
  if(sum===7){
    for(const opponent of room.players){
      const n=total(opponent);
      if(n>7){
        const discard=Math.floor(n/2);
        for(let i=0;i<discard;i++){
          const pool=TYPES.flatMap(t=>Array(opponent.resources[t]).fill(t));
          opponent.resources[pool[random(pool.length)]]--;
        }
        log(room,`${opponent.name} discarded ${discard} random cards (held more than seven).`);
      }
    }
    room.phase='robber';room.robberReturn='action';
    log(room,`${p.name} must move the robber.`);
  }else{
    let distributed=0;
    for(const tile of room.board.tiles){
      if(tile.number!==sum||tile.robber)continue;
      for(const nId of tile.vertices){
        const node=room.board.nodes[nId];if(!node.owner)continue;
        const player=room.players.find(x=>x.id===node.owner);
        player.resources[tile.terrain]+=node.level;distributed+=node.level;
      }
    }
    log(room,distributed?`${distributed} resource card${distributed===1?' was':'s were'} produced.`:'No resources were produced.');
    room.phase='action';
  }
}
function robber(room,p,tileId){
  requireIt(room.phase==='robber','Robber is not ready to move.');
  const tile=room.board.tiles[tileId];requireIt(tile && !tile.robber,'Choose a different tile for the robber.');
  for(const t of room.board.tiles)t.robber=false;tile.robber=true;
  const eligibleIds=[...new Set(tile.vertices.map(n=>room.board.nodes[n].owner).filter(x=>x && x!==p.id))];
  const victims=room.players.filter(x=>eligibleIds.includes(x.id)&&total(x)>0);
  if(victims.length){
    const victim=victims[random(victims.length)];const pool=TYPES.flatMap(t=>Array(victim.resources[t]).fill(t));const stolen=pool[random(pool.length)];victim.resources[stolen]--;p.resources[stolen]++;
    log(room,`${p.name} moved the robber and stole a resource from ${victim.name}.`);
  }else log(room,`${p.name} moved the robber.`);
  room.phase=room.robberReturn;
}
function buyDev(room,p){
  requireIt(room.phase==='action','You can only buy development cards after rolling.');
  requireIt(room.deck.length>0,'Development deck is empty.');spend(p,COST.dev);
  const kind=room.deck.pop();p.devCards.push({type:kind,boughtTurn:room.turn});log(room,`${p.name} purchased a development card.`);
  if(kind==='victory')checkWinner(room,p);
}
function playDev(room,p,action){
  requireIt(room.phase==='action','Play development cards during your action phase.');
  requireIt(!p.devPlayed,'Only one development card may be played per turn.');
  requireIt(['knight','roads','plenty','monopoly'].includes(action.card),'Invalid development card.');
  const index=p.devCards.findIndex(d=>d.type===action.card&&d.boughtTurn<room.turn);
  requireIt(index!==-1,'No eligible card of that type; newly purchased cards must wait until your next turn.');
  if(action.card==='plenty'){
    requireIt(TYPES.includes(action.a)&&TYPES.includes(action.b),'Select two valid resources.');
    p.resources[action.a]++;p.resources[action.b]++;
  }
  if(action.card==='monopoly'){
    requireIt(TYPES.includes(action.resource),'Select a valid resource.');
    let n=0;for(const opp of room.players){if(opp.id!==p.id){n+=opp.resources[action.resource];p.resources[action.resource]+=opp.resources[action.resource];opp.resources[action.resource]=0;}}
    log(room,`${p.name} took ${n} ${action.resource} from opponents.`);
  }
  if(action.card==='roads')p.freeRoads+=2;
  if(action.card==='knight'){p.playedKnights++;room.phase='robber';room.robberReturn='action';recalcAwards(room);}
  p.devCards.splice(index,1);p.devPlayed=true;
  log(room,`${p.name} played ${ {knight:'a Knight',roads:'Road Building',plenty:'Year of Plenty',monopoly:'Monopoly'}[action.card]}.`);
  checkWinner(room,p);
}
function bankTrade(room,p,action){
  requireIt(room.phase==='action','Trade during your action phase.');
  const {give,want}=action;requireIt(TYPES.includes(give)&&TYPES.includes(want)&&give!==want,'Choose two different resources.');
  requireIt(p.resources[give]>=4,'You need four of the resource you are giving.');
  p.resources[give]-=4;p.resources[want]++;log(room,`${p.name} traded 4 ${give} for 1 ${want} with the bank.`);
}
function proposeTrade(room,p,action){
  requireIt(room.phase==='action','Trade during your action phase.');
  const {to,give,want}=action,amount=Number(action.amount),request=Number(action.request);
  requireIt(TYPES.includes(give)&&TYPES.includes(want)&&give!==want,'Choose different resources.');
  requireIt(Number.isInteger(amount)&&amount>=1&&amount<=10&&Number.isInteger(request)&&request>=1&&request<=10,'Trade amounts must be 1–10.');
  const target=room.players.find(x=>x.id===to);
  requireIt(target&&target!==p,'Choose another player.');requireIt(p.resources[give]>=amount,'You lack resources to offer.');
  room.pendingTrade={from:p.id,to:target.id,give,want,amount,request};log(room,`${p.name} offered ${amount} ${give} for ${request} ${want} to ${target.name}.`);
}
function respondTrade(room,p,action){
  const t=room.pendingTrade;requireIt(t&&t.to===p.id,'You have no incoming trade offer.');
  const from=room.players.find(x=>x.id===t.from);
  requireIt(from,'Trade proposer no longer exists.');
  if(action.accept){
    requireIt(room.phase==='action'&&room.players[room.current].id===from.id,'That offer has expired.');
    requireIt(from.resources[t.give]>=t.amount&&p.resources[t.want]>=t.request,'One player no longer has enough resources.');
    from.resources[t.give]-=t.amount;p.resources[t.give]+=t.amount;
    p.resources[t.want]-=t.request;from.resources[t.want]+=t.request;
    log(room,`${p.name} accepted ${from.name}'s trade.`);
  }else log(room,`${p.name} declined ${from.name}'s trade.`);
  room.pendingTrade=null;
}
function endTurn(room,p){
  requireIt(room.phase==='action','You must finish rolling and moving the robber first.');
  p.freeRoads=0;room.pendingTrade=null;room.current=(room.current+1)%room.players.length;
  if(room.current===0)room.turn++;
  room.dice=null;room.phase='roll';room.players[room.current].devPlayed=false;
  log(room,`It is ${room.players[room.current].name}'s turn.`);
}
function act(room,index,action){
  const p=room.players[index];requireIt(p,'Unknown player.');
  requireIt(action&&typeof action.type==='string','Missing action.');
  if(action.type==='chat'){
    const msg=String(action.message||'').trim().slice(0,180);
    requireIt(msg.length>0,'Message is empty.');log(room,`${p.name}: ${msg}`,'chat');return;
  }
  requireIt(room.phase!=='finished','This game has already ended.');
  if(action.type==='start')return start(room,index);
  if(action.type==='tradeResponse')return respondTrade(room,p,action);
  requireIt(room.phase!=='lobby','Waiting for the host to start the game.');
  requireIt(room.current===index,`It's ${room.players[room.current].name}'s turn.`);
  switch(action.type){
    case 'settlement':return placeSettlement(room,p,Number(action.node));
    case 'road':return placeRoad(room,p,Number(action.edge));
    case 'city':return city(room,p,Number(action.node));
    case 'roll':return roll(room,p);
    case 'robber':return robber(room,p,Number(action.tile));
    case 'buyDev':return buyDev(room,p);
    case 'playDev':return playDev(room,p,action);
    case 'bankTrade':return bankTrade(room,p,action);
    case 'proposeTrade':return proposeTrade(room,p,action);
    case 'endTurn':return endTurn(room,p);
    default:fail('Unknown action.');
  }
}
function publicState(room,index){
  const me=room.players[index];
  return {
    id:room.id,host:room.host,phase:room.phase,current:room.current,setupMode:room.setupMode,
    setupIndex:room.setupIndex,turn:room.turn,dice:room.dice,winner:room.winner,
    players:room.players.map(p=>({id:p.id,name:p.name,color:p.color,roads:p.roads.length,settlements:p.settlements.length,cities:p.cities.length,score:score(room,p),cards:total(p),devCount:p.devCards.filter(d=>d.type!=='victory').length,playedKnights:p.playedKnights})),
    me:{id:me.id,index,resources:me.resources,devCards:me.devCards.map(d=>({type:d.type,playable:d.boughtTurn<room.turn})),devPlayed:me.devPlayed,freeRoads:me.freeRoads},
    board:room.board,legal:room.board?eligible(room,index):{nodes:[],edges:[],cities:[],tiles:[]},
    pendingTrade:room.pendingTrade,largestArmyHolder:room.largestArmyHolder,longestRoadHolder:room.longestRoadHolder,
    devRemaining:room.deck.length,messages:room.messages.slice(-45),costs:COST
  };
}
module.exports={createRoom,makePlayer,playerIndex,act,publicState,score,TYPES,COST,generateBoard,validRoad,validNode};
