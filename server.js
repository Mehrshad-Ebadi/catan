'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {createRoom,makePlayer,playerIndex,act,publicState}=require('./game');
const rooms=new Map(),subscribers=new Map();
const root=path.join(__dirname,'public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const PORT=Number(process.env.PORT||3000);
function json(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
function getAuth(roomId,token){const room=rooms.get(String(roomId||'').toUpperCase());if(!room)throw Error('Room not found.');const index=playerIndex(room,token);if(index===-1)throw Error('Invalid player session. Rejoin using your original browser.');return {room,index};}
function broadcast(room){const set=subscribers.get(room.id)||new Set();for(const client of set){try{client.res.write(`event: state\ndata: ${JSON.stringify(publicState(room,client.index))}\n\n`);}catch{set.delete(client);}}}
async function readBody(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>18000)throw Error('Request too large.');}try{return JSON.parse(raw||'{}');}catch{throw Error('Invalid JSON.');}}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(req.method==='POST'&&url.pathname.startsWith('/api/')){
      const body=await readBody(req);
      if(url.pathname==='/api/create'){
        const name=String(body.name||'').trim().slice(0,22);if(!name)throw Error('Enter a player name.');
        let room=createRoom(name);while(rooms.has(room.id))room=createRoom(name);
        rooms.set(room.id,room);json(res,200,{room:room.id,token:room.players[0].token});return;
      }
      if(url.pathname==='/api/join'){
        const room=rooms.get(String(body.room||'').toUpperCase());if(!room)throw Error('That room code does not exist.');
        if(body.token){const index=playerIndex(room,body.token);if(index!==-1){json(res,200,{room:room.id,token:body.token});return;}}
        if(room.phase!=='lobby')throw Error('Game has already started. Ask the host to create a new room.');
        if(room.players.length>=6)throw Error('This room is full (6 players).');
        const name=String(body.name||'').trim().slice(0,22);if(!name)throw Error('Enter a player name.');
        const player=makePlayer(name,room.players.length);room.players.push(player);
        logJoin(room,player.name);json(res,200,{room:room.id,token:player.token});broadcast(room);return;
      }
      if(url.pathname==='/api/action'){
        const {room,index}=getAuth(body.room,body.token);act(room,index,body.action);
        json(res,200,{ok:true});broadcast(room);return;
      }
      return json(res,404,{error:'Unknown endpoint.'});
    }
    if(req.method==='GET'&&url.pathname==='/api/state'){
      const {room,index}=getAuth(url.searchParams.get('room'),url.searchParams.get('token'));
      json(res,200,publicState(room,index));return;
    }
    if(req.method==='GET'&&url.pathname==='/api/events'){
      const {room,index}=getAuth(url.searchParams.get('room'),url.searchParams.get('token'));
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
      res.write(`retry: 1600\nevent: state\ndata: ${JSON.stringify(publicState(room,index))}\n\n`);
      const client={res,index};if(!subscribers.has(room.id))subscribers.set(room.id,new Set());subscribers.get(room.id).add(client);
      const timer=setInterval(()=>{if(!res.destroyed)res.write(': ping\n\n');},22000);
      req.on('close',()=>{clearInterval(timer);subscribers.get(room.id)?.delete(client);});return;
    }
    if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
    const rel=url.pathname==='/'?'/index.html':url.pathname;
    const dest=path.resolve(root,'.'+decodeURIComponent(rel));
    if(!dest.startsWith(root+path.sep))return json(res,403,{error:'Forbidden.'});
    fs.readFile(dest,(err,data)=>{
      if(err){res.writeHead(404);res.end('Not found');return;}
      res.writeHead(200,{'Content-Type':mime[path.extname(dest)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);
    });
  }catch(e){if(!res.headersSent)json(res,400,{error:e.message||'Request error.'});else res.end();}
});
function logJoin(room,name){room.messages.push({kind:'system',text:`${name} joined the room.`,ts:Date.now()});}
if(require.main===module){server.listen(PORT,'0.0.0.0',()=>console.log(`Hex Harbor online → http://localhost:${PORT}`));}
module.exports={server,rooms};
