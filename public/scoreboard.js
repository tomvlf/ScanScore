'use strict';
const $=s=>document.querySelector(s),q=new URLSearchParams(location.search);
let ws,state;
$('#roomId').value=q.get('room')||'';
function render(s){
 state=s;$('#auth').classList.add('hidden');$('#board').classList.remove('hidden');
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
$('#connect').onclick=()=>{
 ws?.close();const socket=ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
 socket.onopen=()=>socket.send(JSON.stringify({type:'auth',roomId:$('#roomId').value.trim().toLowerCase(),role:'display',secret:$('#token').value}));
 socket.onmessage=e=>{
  if(ws!==socket)return;
  const m=JSON.parse(e.data);
  if((m.type==='auth.ok'||m.type==='state')&&(!state||m.state.revision>=state.revision))render(m.state);
 };
 socket.onclose=()=>{
  if(ws!==socket)return;
  $('#status').textContent='Offline';$('#status').classList.remove('online');
  $('#updated').textContent='Verbinding verbroken. Vernieuw de pagina en meld opnieuw aan.';
  $('#authMessage').textContent='Geen verbinding. Controleer het ruimte-ID en displaytoken en probeer opnieuw.';
 };
};
