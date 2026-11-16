'use strict';const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];let ws,state,roomId,scanner,pairScanner,lastScan='',lastAt=0,cameraTask=Promise.resolve();
function send(x){if(ws?.readyState===1)ws.send(JSON.stringify(x))}function wsUrl(){return `${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`}function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function total(p){return Object.values(p.scores||{}).reduce((a,b)=>a+Number(b),0)}function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2200)}function status(t,on=false){$('#status').textContent=t;$('#status').classList.toggle('online',on)}function feedback(kind,title,text){const e=$('#feedback');e.className=`feedback ${kind}`;e.innerHTML=`<b>${kind==='success'?'✓':kind==='error'?'!':'◎'}</b><div><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`}function confetti(){if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;const box=$('#confetti'),colors=['#6657e8','#0e9f6e','#f5b82e','#e84d75'];for(let i=0;i<18;i++){const s=document.createElement('i');s.className='spark';s.style.left=`${45+Math.random()*10}%`;s.style.top='45%';s.style.background=colors[i%4];s.style.setProperty('--x',`${(Math.random()-.5)*340}px`);s.style.setProperty('--y',`${80+Math.random()*260}px`);box.append(s);setTimeout(()=>s.remove(),900)}}
function page(name){return cameraAction(async()=>{await stopCameras();$$('.page').forEach(x=>x.classList.toggle('active',x.id===name));$$('[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===name));scrollTo({top:0,behavior:'smooth'})}).catch(error=>{const message=cameraError(error);$('#pairStatus').textContent=message;toast(message)})}$$('[data-page]').forEach(x=>x.onclick=()=>page(x.dataset.page));
function displayUrl(){return `/scoreboard.html?room=${encodeURIComponent(roomId)}`}function render(){if(!state)return;$('#round').innerHTML=state.rounds.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('');$('#round').value=state.activeRoundId;$('#question').value=state.question;$('#mode').value=state.mode;$('#fixed').value=state.fixedPoints;$('#places').value=state.placePoints.join(', ');$('#once').checked=state.oncePerQuestion;const active=state.rounds.find(r=>r.id===state.activeRoundId);$('#playTitle').textContent=`${active?.name||'Ronde'} · Vraag ${state.question}`;$('#fixedField').classList.toggle('hidden',state.mode!=='fixed');$('#placesField').classList.toggle('hidden',state.mode!=='places');$('#winnerCount').textContent=state.winners.length;$('#winners').innerHTML=state.winners.length?state.winners.map((w,i)=>`<li><span class="rank">${i+1}</span><strong>${esc(w.name)}</strong><b>${w.points>=0?'+':''}${w.points}</b></li>`).join(''):'<li class="empty"><strong>Nog geen winnaars</strong><small>De eerste geldige scan verschijnt hier.</small></li>';const sorted=[...state.players].sort((a,b)=>total(b)-total(a)||a.name.localeCompare(b.name,'nl'));$('#scoreList').innerHTML=sorted.map(p=>`<li><span class="score-name">${esc(p.name)}</span><span class="scorepoints">${total(p)}</span></li>`).join('')||'<li class="empty">Nog geen deelnemers</li>';$('#playerCount').textContent=`${state.players.length} ${state.players.length===1?'deelnemer':'deelnemers'}`;$('#playerCards').innerHTML=state.players.map(p=>`<article class="playercard"><div><span class="avatar">${esc(p.name.slice(0,2).toUpperCase())}</span><span><h3>${esc(p.name)}</h3><p>${p.kind==='team'?'Ploeg':'Persoon'} · ${total(p)} punten</p></span></div></article>`).join('');for(const id of ['display','displayTop','displayMore'])$('#'+id).href=displayUrl()}
function loginMessage(message){$('#loginMessage').classList.remove('hidden');$('#loginMessage').textContent=message}
function connect(name=$('#roomName').value.trim(),password=$('#secret').value){status('Verbinden…');ws?.close();const socket=ws=new WebSocket(wsUrl());socket.onopen=()=>socket.send(JSON.stringify({type:'auth',roomName:name,role:'host',secret:password}));socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='auth.ok'){state=m.state;roomId=m.roomId;$('#login').classList.add('hidden');$('#app').classList.remove('hidden');$('#mobileNav').classList.remove('hidden');status('Live',true);render();feedback('ready','Klaar voor de eerste winnaar','Start de camera en scan een persoonlijke QR-code.')}else if(m.type==='state'){state=m.state;render()}else if(m.type==='scan.result'){if(m.ok){feedback('success',m.name,`${m.points>=0?'+':''}${m.points} punten toegekend`);navigator.vibrate?.([55,35,80]);confetti();setTimeout(()=>feedback('ready','Klaar voor de volgende winnaar','Laat de persoonlijke QR-code zien.'),1800)}else{const text={duplicate:'Deze deelnemer kreeg al punten voor deze vraag.',unknown:'Deze QR-code is niet gekoppeld.',no_more_places:'Alle ingestelde plaatsen zijn al toegekend.'}[m.code]||'De score kon niet worden toegekend.';feedback('error','Niet toegekend',text);navigator.vibrate?.(180)}}else if(m.type==='error')toast('Actie geweigerd. Controleer je invoer.')};socket.onclose=e=>{if(ws!==socket)return;status(e.code===4403?'Aanmelding mislukt':'Offline');if(!state)loginMessage(e.code===4403?'Ruimtenaam of wachtwoord is onjuist.':'Verbinding verbroken. Probeer opnieuw aan te melden.')}}
$('#loginForm').onsubmit=e=>{e.preventDefault();connect()};$('#create').onclick=async()=>{
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
  $('#displayToken').value=d.displayToken;$('#displayCredentials').classList.remove('hidden');
  loginMessage('Ruimte aangemaakt. Je wordt aangemeld.');connect(name,password);
 }catch{
  const message='Ruimte kon niet worden aangemaakt. Controleer de velden en je verbinding.';
  loginMessage(message);toast(message);
 }finally{$('#create').disabled=false}
};
$('#mode').onchange=()=>{$('#fixedField').classList.toggle('hidden',$('#mode').value!=='fixed');$('#placesField').classList.toggle('hidden',$('#mode').value!=='places')};$('#save').onclick=()=>send({type:'context.set',roundId:$('#round').value,question:Number($('#question').value),mode:$('#mode').value,fixedPoints:Number($('#fixed').value),placePoints:$('#places').value.split(',').map(x=>Number(x.trim())).filter(Number.isFinite),oncePerQuestion:$('#once').checked});$('#next').onclick=()=>send({type:'question.next'});$('#undo').onclick=()=>send({type:'award.undo'});$('#addRound').onclick=()=>{const n=$('#roundName').value.trim();if(!n)return toast('Geef de ronde een naam.');send({type:'round.add',name:n});$('#roundName').value=''};
function cameraAction(action){const task=cameraTask.then(action);cameraTask=task.catch(error=>console.warn('camera_operation_failed',error));return task}
function cameraError(error){
 const reason=String(error?.name||'')+' '+String(error?.message||error);
 if(reason.includes('https_required'))return 'Open ScoreScan via HTTPS om de camera te gebruiken.';
 if(reason.includes('camera_unsupported'))return 'Deze browser ondersteunt geen cameratoegang. Open ScoreScan in Chrome of Safari.';
 if(reason.includes('scanner_unavailable'))return 'De QR-scanner kon niet laden. Vernieuw de pagina en probeer opnieuw.';
 if(reason.includes('connection_closed'))return 'Verbinding verbroken. Meld je opnieuw aan voordat je een speler toevoegt.';
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
async function stopCameras(){
 if(scanner){
  if(scanner.isScanning)await scanner.stop();
  scanner.clear();scanner=null;
  $('#stop').classList.add('hidden');$('#start').classList.remove('hidden');
  feedback('ready','Scanner gestopt','Start de camera wanneer de volgende winnaar klaarstaat.');
 }
 if(pairScanner){
  if(pairScanner.isScanning)await pairScanner.stop();
  pairScanner.clear();pairScanner=null;$('#pairStatus').textContent='Camera gestopt.';
 }
}
$('#start').onclick=async()=>{
 $('#start').disabled=true;
 try{await cameraAction(async()=>{
  await stopCameras();cameraPreflight();scanner=new Html5Qrcode('reader');
  await scanner.start({facingMode:'environment'},{fps:15,qrbox:{width:240,height:240}},code=>{const now=Date.now();if(code===lastScan&&now-lastAt<1200)return;lastScan=code;lastAt=now;send({type:'scan.award',code,idempotencyKey:crypto.randomUUID()})},()=>{});
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
  $('#pairStatus').textContent='Camera actief. Houd de QR-code voor de camera.';
 })}catch(error){const message=cameraError(error);$('#pairStatus').textContent=message;toast(message)}finally{$('#pair').disabled=false}
};
