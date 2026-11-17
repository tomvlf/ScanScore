'use strict';
function formatPoints(points){return new Intl.NumberFormat('nl-BE',{maximumFractionDigits:2}).format(points)}
function renderScores(state,view,list,table){
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const players=[...state.players].sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'nl'));
 const name=p=>escape(p.name)+(p.deleted?' <small>(verwijderd)</small>':'');
 list.classList.toggle('hidden',view!=='total');
 table.classList.toggle('hidden',view!=='questions');
 list.innerHTML=players.map(p=>`<li><span class="score-name">${name(p)}</span><b class="scorepoints">${formatPoints(p.score)}</b></li>`).join('')||'<li class="empty">Nog geen deelnemers</li>';
 const questions=state.game?.questions||[];
 table.innerHTML=questions.length?`<table><caption>Punten per vraag</caption><thead><tr><th scope="col">Speler</th>${questions.map(q=>`<th scope="col">${escape(q.label||'Vraag '+q.ordinal)}</th>`).join('')}<th scope="col">Totaal</th></tr></thead><tbody>${players.map(p=>`<tr><th scope="row">${name(p)}</th>${questions.map(q=>`<td>${formatPoints(p.scores[q.id]||0)}</td>`).join('')}<td><b>${formatPoints(p.score)}</b></td></tr>`).join('')}</tbody></table>`:'<p class="muted">Er is nog geen spel gestart.</p>';
}
