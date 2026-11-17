'use strict';const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];let ws,state,scanner,pairScanner,lastScan='',lastAt=0,lastQuestionId,cameraTask=Promise.resolve();
function send(x){if(ws?.readyState!==1){toast('Verbinding verbroken. Meld je opnieuw aan.');return false}ws.send(JSON.stringify(x));return true}function wsUrl(){return `${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`}function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2200)}function status(t,on=false){$('#status').textContent=t;$('#status').classList.toggle('online',on)}function feedback(kind,title,text){const e=$('#feedback');e.className=`feedback ${kind}`;e.innerHTML=`<b>${kind==='success'?'✓':kind==='error'?'!':'◎'}</b><div><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`}function confetti(){if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;const box=$('#confetti'),colors=['#6657e8','#0e9f6e','#f5b82e','#e84d75'];for(let i=0;i<18;i++){const s=document.createElement('i');s.className='spark';s.style.left=`${45+Math.random()*10}%`;s.style.top='45%';s.style.background=colors[i%4];s.style.setProperty('--x',`${(Math.random()-.5)*340}px`);s.style.setProperty('--y',`${80+Math.random()*260}px`);box.append(s);setTimeout(()=>s.remove(),900)}}
function page(name){return cameraAction(async()=>{await stopCameras();$$('.page').forEach(x=>x.classList.toggle('active',x.id===name));$$('[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===name));scrollTo({top:0,behavior:'smooth'})}).catch(error=>{const message=cameraError(error);$('#pairStatus').textContent=message;toast(message)})}$$('[data-page]').forEach(x=>x.onclick=()=>page(x.dataset.page));
function displayUrl(){return '/scoreboard.html'}
function currentQuestion(){return state?.game?.questions.find(q=>q.ordinal===state.game.question)}
function canScore(){return !!state?.game&&state.game.id===state.activeGameId}
function gameAction(type,extra={}){
 if(!canScore()){toast('Open eerst het actieve spel.');return false}
 return send({type,gameId:state.game.id,questionId:currentQuestion().id,...extra});
}
function render(){
 if(!state)return;
 const game=state.game,question=currentQuestion(),winners=question?.winners||[],editable=canScore();
 if(lastQuestionId!==question?.id){lastQuestionId=question?.id;lastScan='';lastAt=0}
 $('#gameForm').classList.toggle('hidden',!!state.activeGameId);
 $('#gameControls').classList.toggle('hidden',!game);
 $('#returnToGame').classList.toggle('hidden',!state.activeGameId||editable);
 $('#playTitle').textContent=game?`${game.endedAt?'Gestopt spel':'Spel'} · Vraag ${game.question}`:'Nog geen spel';
 $('#gameStatus').textContent=game?(game.legacy?'Historische scores uit de vorige versie.':game.endedAt?'Dit spel is gestopt. De scores blijven bewaard.':'Scan alle winnaars en ga daarna naar de volgende vraag.'):'Voeg spelers toe en start een spel.';
 $('#questionSelect').innerHTML=(game?.questions||[]).map(q=>`<option value="${q.id}">${esc(q.label||'Vraag '+q.ordinal)}</option>`).join('');
 $('#questionSelect').value=question?.id||'';$('#questionSelect').disabled=!editable;
 $('#previous').disabled=!editable||game.question===1;$('#next').disabled=!editable;$('#stopGame').disabled=!editable;
 $('#start').disabled=!editable;$('#undo').disabled=!editable||!winners.length;
 $('#poolInfo').textContent=question?.points?`Puntenpot: ${formatPoints(question.points)} · ${winners.length} winnaar(s) · ${formatPoints(winners.length?question.points/winners.length:0)} per winnaar`:'';
 $('#winnerCount').textContent=winners.length;
 $('#winners').innerHTML=winners.length?winners.map((w,i)=>{
  const player=state.players.find(p=>p.id===w.playerId);
  return `<li><span class="rank">${i+1}</span><strong>${esc(player.name)}</strong><b>${formatPoints(w.points)}</b>${editable?`<button class="remove-winner" data-remove-winner="${w.playerId}" aria-label="${esc(player.name)} uit deze vraag verwijderen">Verwijder</button>`:''}</li>`;
 }).join(''):'<li class="empty"><strong>Nog geen winnaars</strong><small>Scan een gekoppelde QR-code tijdens het spel.</small></li>';
 const players=state.players.filter(p=>!p.deleted);
 $('#playerCount').textContent=`${players.length} ${players.length===1?'deelnemer':'deelnemers'}`;
 $('#playerCards').innerHTML=players.map(p=>`<article class="playercard"><div><span class="avatar">${esc(p.name.slice(0,2).toUpperCase())}</span><span><h3>${esc(p.name)}</h3><p>${p.kind==='team'?'Ploeg':'Persoon'} · ${formatPoints(p.score)} punten</p></span></div><button class="link danger" data-remove-player="${p.id}">Speler verwijderen</button></article>`).join('');
 const selected=$('#gameHistory').value;
 $('#gameHistory').innerHTML=state.games.map((g,i)=>`<option value="${g.id}">${esc(g.legacy?'Oude scores':`Spel ${state.games.length-i}`)} - ${esc(new Date(g.startedAt).toLocaleString('nl-BE'))}${g.endedAt?' (gestopt)':' (actief)'}</option>`).join('');
 $('#gameHistory').value=state.games.some(g=>g.id===selected)?selected:game?.id||'';
 $('#viewGame').disabled=!state.games.length;
 renderScores(state,$('#scoreView').value,$('#scoreList'),$('#scoreTable'));
 for(const id of ['display','displayTop','displayMore'])$('#'+id).href=displayUrl();
 if(scanner&&!editable)cameraAction(stopCameras).catch(error=>feedback('error','Camera kon niet stoppen',cameraError(error)));
}
function loginMessage(message){$('#loginMessage').classList.remove('hidden');$('#loginMessage').textContent=message}
async function connect(name=$('#roomName').value.trim(),password=$('#secret').value,resume=false){
 try{
 if(!resume)await roomSession.login(name,password);
 $('#secret').value='';
 status('Verbinden…');ws?.close();const socket=ws=new WebSocket(wsUrl());
 socket.onopen=()=>socket.send(JSON.stringify({type:'auth',role:'host'}));
 socket.onmessage=e=>{
  if(ws!==socket)return;
  const m=JSON.parse(e.data);
  if(m.type==='auth.ok'){
   state=m.state;$('#login').classList.add('hidden');$('#app').classList.remove('hidden');$('#mobileNav').classList.remove('hidden');$('#logout').classList.remove('hidden');status('Live',true);render();
   feedback('ready',canScore()?'Klaar om winnaars te scannen':'Start eerst een spel',canScore()?'Start de camera en scan een persoonlijke QR-code.':'Spelers kun je op elk moment toevoegen.');
  }else if(m.type==='state'){
   if(m.state.revision<state.revision)return;
   state=m.state;render();
  }else if(m.type==='scan.result'){
   if(m.ok){feedback('success',m.name,`Nu ${formatPoints(m.points)} punten per winnaar (${m.winnerCount} winnaars). De verdeling wordt live herberekend.`);navigator.vibrate?.([55,35,80]);confetti()}
   else{feedback('error','Niet toegevoegd',{duplicate:'Deze speler is al winnaar van deze vraag.',unknown:'Deze QR-code is nog niet gekoppeld aan een speler.'}[m.code]||'De scan kon niet verwerkt worden.');navigator.vibrate?.(180)}
  }else if(m.type==='error'){
   const message={input:'Controleer je invoer.',duplicate_qr:'Deze QR-code is al gekoppeld aan een speler.',game_running:'Er loopt al een spel in deze ruimte.',no_active_game:'Dit spel loopt niet meer. Open het actieve spel of start een nieuw spel.',stale_question:'De vraag is gewijzigd. Controleer de huidige vraag en scan opnieuw.',question_limit:'Het maximum van 10.000 vragen is bereikt.',duplicate_request:'Deze scan is al verwerkt.',nothing:'Er is geen scan om ongedaan te maken.'}[m.reason]||'Actie geweigerd. Vernieuw de pagina en probeer opnieuw.';
   toast(message);feedback('error','Actie niet uitgevoerd',message);$('#pairStatus').textContent=message;
  }
 };
 socket.onclose=e=>{
  if(ws!==socket)return;
  status(e.code===4403?'Aanmelding mislukt':'Offline');
  if(scanner||pairScanner)cameraAction(stopCameras).catch(error=>feedback('error','Camera kon niet stoppen',cameraError(error)));
  if(e.code===4403||e.code===4401){
   state=null;$('#login').classList.remove('hidden');$('#app').classList.add('hidden');$('#mobileNav').classList.add('hidden');$('#logout').classList.add('hidden');
   loginMessage('Je aanmelding is verlopen. Meld je opnieuw aan.');
  }else if(!state)loginMessage('Verbinding verbroken. Probeer opnieuw aan te melden.');
  else toast('Verbinding verbroken. Vernieuw de pagina om de verbinding te herstellen.');
 };
 }catch(error){status('Niet aangemeld');loginMessage(error.message);toast(error.message)}
}
$('#loginForm').onsubmit=e=>{e.preventDefault();return connect()};$('#create').onclick=async()=>{
 if(!$('#loginForm').reportValidity())return;
 const name=$('#roomName').value.trim(),password=$('#secret').value;
 $('#create').disabled=true;
 try{
  const r=await fetch('/api/rooms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({roomName:name,hostSecret:password})});
  if(r.status===409){
   const message='Deze ruimtenaam bestaat al. Kies een andere naam of klik op Aanmelden met het bestaande wachtwoord.';
   loginMessage(message);toast(message);$('#roomName').focus();return;
  }
  const d=await r.json();
  if(!r.ok){const message=d.error==='invalid_input'?'Vul een ruimtenaam van maximaal 80 tekens in en een wachtwoord van minstens 12 tekens of 8–16 cijfers.':'Ruimte kon niet worden aangemaakt. Probeer het later opnieuw.';loginMessage(message);toast(message);return}
  loginMessage('Ruimte aangemaakt. Je wordt aangemeld.');await connect(name,password);
 }catch{
  const message='Ruimte kon niet worden aangemaakt. Controleer de velden en je verbinding.';
  loginMessage(message);toast(message);
 }finally{$('#create').disabled=false}
};
$('#gameForm').onsubmit=e=>{
 e.preventDefault();if(!$('#gameForm').reportValidity())return;
 if(send({type:'game.start',pointsPerQuestion:Number($('#pointsPerQuestion').value)}))$('#pointsPerQuestion').value='';
};
$('#stopGame').onclick=()=>{if(confirm('Spel stoppen? De scores blijven bewaard; daarna zijn geen correcties meer mogelijk.'))gameAction('game.stop')};
$('#next').onclick=()=>gameAction('question.next');
$('#previous').onclick=()=>{
 const previous=state.game.questions.find(q=>q.ordinal===state.game.question-1);
 if(previous)gameAction('question.select',{targetQuestionId:previous.id});
};
$('#questionSelect').onchange=()=>gameAction('question.select',{targetQuestionId:$('#questionSelect').value});
$('#undo').onclick=()=>gameAction('award.undo');
$('#winners').onclick=e=>{const button=e.target.closest('[data-remove-winner]');if(button)gameAction('winner.remove',{playerId:button.dataset.removeWinner})};
$('#playerCards').onclick=e=>{
 const button=e.target.closest('[data-remove-player]');
 if(button&&confirm('Speler uit de ruimte verwijderen? Behaalde punten blijven in de spelhistoriek bewaard.'))send({type:'player.remove',playerId:button.dataset.removePlayer});
};
$('#scoreView').onchange=()=>renderScores(state,$('#scoreView').value,$('#scoreList'),$('#scoreTable'));
$('#viewGame').onclick=()=>{send({type:'game.select',gameId:$('#gameHistory').value});page('scores')};
$('#returnToGame').onclick=()=>send({type:'game.select',gameId:null});
function cameraAction(action){const task=cameraTask.then(action);cameraTask=task.catch(error=>console.warn('camera_operation_failed',error));return task}
function cameraError(error){
 const reason=String(error?.name||'')+' '+String(error?.message||error);
 if(reason.includes('https_required'))return 'Open ScoreScan via HTTPS om de camera te gebruiken.';
 if(reason.includes('camera_unsupported'))return 'Deze browser ondersteunt geen cameratoegang. Open ScoreScan in Chrome of Safari.';
 if(reason.includes('scanner_unavailable'))return 'De QR-scanner kon niet laden. Vernieuw de pagina en probeer opnieuw.';
 if(reason.includes('connection_closed'))return 'Verbinding verbroken. Meld je opnieuw aan voordat je een speler toevoegt.';
 if(reason.includes('camera_video_failed'))return 'De camera geeft geen beeld. Sluit andere camera-apps en vernieuw deze pagina.';
 if(/NotAllowed|SecurityError|Permission denied/i.test(reason))return 'Cameratoegang is geblokkeerd. Sta de camera toe in de site-instellingen van je browser.';
 if(/NotReadable|TrackStart|Could not start video source|in use/i.test(reason))return 'De camera is bezet. Sluit andere camera-apps of browsertabbladen en probeer opnieuw.';
 if(/NotFound|DevicesNotFound/i.test(reason))return 'Geen camera gevonden op dit apparaat.';
 return 'Camera kon niet starten. Controleer de cameratoegang en probeer opnieuw.';
}
function cameraPreflight(){
 if(!globalThis.isSecureContext)throw Error('https_required');
 if(!navigator.mediaDevices?.getUserMedia)throw Error('camera_unsupported');
 if(typeof Html5Qrcode!=='function')throw Error('scanner_unavailable');
}
function cameraReady(instance,id){
 if(instance.isScanning)return Promise.resolve();
 const video=$('#'+id+' video');
 if(!video)throw Error('camera_video_failed');
 return new Promise((resolve,reject)=>{
  const finish=error=>{
   clearTimeout(timer);video.removeEventListener('playing',playing);video.removeEventListener('error',failed);
   if(error){for(const track of video.srcObject?.getTracks()||[])track.stop();reject(error)}else resolve();
  };
  const playing=()=>finish(instance.isScanning?null:Error('camera_video_failed')),failed=()=>finish(Error('camera_video_failed'));
  const timer=setTimeout(failed,10000);
  video.addEventListener('playing',playing,{once:true});video.addEventListener('error',failed,{once:true});
 });
}
async function stopScanner(instance){
 const current=instance.getState();
 if(current===Html5QrcodeScannerState.SCANNING||current===Html5QrcodeScannerState.PAUSED)await instance.stop();
 instance.clear();
}
async function stopCameras(){
 if(scanner){
  await stopScanner(scanner);scanner=null;
  $('#stop').classList.add('hidden');$('#start').classList.remove('hidden');
  feedback('ready','Scanner gestopt','Start de camera wanneer de volgende winnaar klaarstaat.');
 }
 if(pairScanner){
  await stopScanner(pairScanner);pairScanner=null;$('#pairStatus').textContent='Camera gestopt.';
 }
}
$('#start').onclick=async()=>{
 if(!canScore()){toast('Start eerst een spel om winnaars te scannen.');return}
 $('#start').disabled=true;
 try{await cameraAction(async()=>{
  await stopCameras();cameraPreflight();scanner=new Html5Qrcode('reader');
  await scanner.start({facingMode:'environment'},{fps:15,qrbox:{width:240,height:240}},code=>{const now=Date.now();if(code===lastScan&&now-lastAt<1200)return;lastScan=code;lastAt=now;gameAction('scan.award',{code,idempotencyKey:crypto.randomUUID()})},()=>{});
  await cameraReady(scanner,'reader');
  $('#start').classList.add('hidden');$('#stop').classList.remove('hidden');feedback('ready','Scanner actief','Laat de winnaar zijn QR-code in beeld houden.');
 })}catch(error){feedback('error','Camera niet beschikbaar',cameraError(error))}finally{$('#start').disabled=false}
};
$('#stop').onclick=()=>cameraAction(stopCameras).catch(error=>feedback('error','Camera kon niet stoppen',cameraError(error)));
$('#pair').onclick=async()=>{
 const name=$('#playerName').value.trim(),playerType=$('#playerType').value;
 if(!name){$('#pairStatus').textContent='Vul eerst een naam in.';$('#playerName').focus();return}
 $('#pair').disabled=true;$('#pairStatus').textContent='Camera starten...';
 try{await cameraAction(async()=>{
  await stopCameras();cameraPreflight();pairScanner=new Html5Qrcode('pairReader');let paired=false;
  await pairScanner.start({facingMode:'environment'},{fps:12,qrbox:230},code=>{
   if(paired)return;paired=true;
   cameraAction(async()=>{
    await stopCameras();if(ws?.readyState!==1)throw Error('connection_closed');send({type:'player.add',name,playerType,code});$('#playerName').value='';
    $('#pairStatus').textContent='QR-code gescand en verzonden.';toast('QR-code verzonden. Controleer de deelnemerslijst.');
   }).catch(error=>{$('#pairStatus').textContent=cameraError(error)});
  },()=>{});
  await cameraReady(pairScanner,'pairReader');
  $('#pairStatus').textContent='Camera actief. Houd de QR-code voor de camera.';
 })}catch(error){const message=cameraError(error);$('#pairStatus').textContent=message;toast(message)}finally{$('#pair').disabled=false}
};
roomSession.restore().then(session=>{
 if(session){$('#roomName').value=session.roomName;return connect(undefined,undefined,true)}
}).catch(error=>loginMessage('Aanmelding herstellen mislukt. Controleer je verbinding en probeer opnieuw. '+error.message));
