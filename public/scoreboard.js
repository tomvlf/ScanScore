'use strict';
const $=s=>document.querySelector(s);
let ws,state;
function render(s){
 state=s;$('#auth').classList.add('hidden');$('#board').classList.remove('hidden');$('#logout').classList.remove('hidden');
 $('#title').textContent=s.title;
 $('#gameInfo').textContent=s.game?`${s.game.endedAt?'Gestopt spel':'Actief spel'} - Vraag ${s.game.question}`:'Nog geen spel gestart';
 renderScores(s,$('#scoreView').value,$('#scoreList'),$('#scoreTable'));
 const selected=$('#gameHistory').value;
 $('#gameHistory').innerHTML='<option value="">Actief / meest recente spel volgen</option>'+s.games.map((g,i)=>`<option value="${g.id}">${g.legacy?'Oude scores':'Spel '+(s.games.length-i)}${g.endedAt?' (gestopt)':' (actief)'}</option>`).join('');
 $('#gameHistory').value=s.games.some(g=>g.id===selected)?selected:'';
 $('#updated').textContent=`Bijgewerkt om ${new Date().toLocaleTimeString('nl-BE',{hour:'2-digit',minute:'2-digit'})}`;
 $('#status').textContent='Live';$('#status').classList.add('online');
}
$('#scoreView').onchange=()=>{if(state)renderScores(state,$('#scoreView').value,$('#scoreList'),$('#scoreTable'))};
$('#gameHistory').onchange=()=>{if(ws?.readyState===1)ws.send(JSON.stringify({type:'game.select',gameId:$('#gameHistory').value||null}))};
async function connect(resume=false){
 try{
 if(!resume)await roomSession.login($('#roomName').value.trim(),$('#secret').value);
 $('#secret').value='';$('#authMessage').textContent='';
 ws?.close();const socket=ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
 socket.onopen=()=>socket.send(JSON.stringify({type:'auth',role:'display'}));
 socket.onmessage=e=>{
  if(ws!==socket)return;
  const m=JSON.parse(e.data);
  if((m.type==='auth.ok'||m.type==='state')&&(!state||m.state.revision>=state.revision))render(m.state);
 };
 socket.onclose=e=>{
  if(ws!==socket)return;
  $('#status').textContent='Offline';$('#status').classList.remove('online');
  $('#updated').textContent='Verbinding verbroken. Vernieuw de pagina om de verbinding te herstellen.';
  $('#auth').classList.remove('hidden');$('#board').classList.add('hidden');$('#logout').classList.add('hidden');state=null;
  $('#authMessage').textContent=e.code===4403||e.code===4401?'Je aanmelding is verlopen. Meld je opnieuw aan.':'Geen verbinding. Probeer opnieuw.';
 };
 }catch(error){$('#authMessage').textContent=error.message}
}
$('#auth').onsubmit=e=>{e.preventDefault();return connect()};
roomSession.restore().then(session=>{
 if(session){$('#roomName').value=session.roomName;return connect(true)}
}).catch(error=>{$('#authMessage').textContent='Aanmelding herstellen mislukt. Controleer je verbinding en probeer opnieuw. '+error.message});
