'use strict';

/* Shared score presentation for the host screen and the public display. */

function formatPoints(points) {
  return new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 2 }).format(points);
}

function scoreEscape(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function scoreAvatarClass(name) {
  let hash = 0;
  for (const character of String(name)) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `av${hash % 6}`;
}

function scoreInitials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
}

function rankedPlayers(state) {
  return [...state.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'nl'));
}

function playerLabel(player) {
  return scoreEscape(player.name) + (player.deleted ? ' <small>(verwijderd)</small>' : '');
}

function setMeters(root, selector) {
  if (!root?.querySelectorAll) return;
  for (const meter of root.querySelectorAll(selector)) {
    const percent = Math.max(0, Math.min(100, Number(meter.dataset.percent) || 0));
    meter.style.width = `${percent}%`;
  }
}

function renderPodium(state, container) {
  if (!container) return;
  const players = rankedPlayers(state).slice(0, 3);
  container.classList.toggle('one', players.length === 1);
  container.classList.toggle('few', players.length === 2);
  if (!players.length) {
    container.innerHTML = '';
    return;
  }
  const leader = Math.max(1, ...state.players.map(player => player.score));
  container.innerHTML = players.map((player, index) => {
    const percent = player.score > 0 ? Math.round((player.score / leader) * 100) : 0;
    return `<article class="podium-card place-${index + 1}">
      <span class="podium-medal" aria-hidden="true">${index + 1}</span>
      <span class="avatar podium-avatar ${scoreAvatarClass(player.name)}" aria-hidden="true">${scoreEscape(scoreInitials(player.name))}</span>
      <span class="podium-name">${playerLabel(player)}</span>
      <b class="podium-points">${formatPoints(player.score)}</b>
      <span class="podium-sub">${index === 0 ? 'Koploper' : index === 1 ? 'Tweede plaats' : 'Derde plaats'}</span>
      <span class="podium-bar" aria-hidden="true"><i data-percent="${percent}"></i></span>
    </article>`;
  }).join('');
  setMeters(container, '.podium-bar i');
}

function renderScores(state, view, list, table, from = 0) {
  const players = rankedPlayers(state);
  const leader = Math.max(1, ...players.map(player => player.score));

  list.classList.toggle('hidden', view !== 'total');
  table.classList.toggle('hidden', view !== 'questions');

  const visible = players.slice(from);
  list.innerHTML = visible.map((player, index) => {
    const rank = from + index + 1;
    const percent = player.score > 0 ? Math.round((player.score / leader) * 100) : 0;
    return `<li>
      <span class="rank" aria-label="${rank}e plaats">${rank}</span>
      <span class="avatar ${scoreAvatarClass(player.name)}" aria-hidden="true">${scoreEscape(scoreInitials(player.name))}</span>
      <span class="score-name">${playerLabel(player)}</span>
      <span class="score-meter" aria-hidden="true"><i data-percent="${percent}"></i></span>
      <b class="scorepoints">${formatPoints(player.score)}</b>
    </li>`;
  }).join('') || '<li class="empty">Nog geen deelnemers</li>';
  setMeters(list, '.score-meter i');

  const questions = state.game?.questions || [];
  const current = state.game?.question;
  table.innerHTML = questions.length
    ? `<table>
        <caption>Punten per vraag</caption>
        <thead><tr><th scope="col">Speler</th>${questions.map(question => `<th scope="col"${question.ordinal === current ? ' class="current-question"' : ''}>${scoreEscape(question.label || 'Vraag ' + question.ordinal)}</th>`).join('')}<th scope="col">Totaal</th></tr></thead>
        <tbody>${players.map(player => `<tr><th scope="row">${playerLabel(player)}</th>${questions.map(question => `<td${question.ordinal === current ? ' class="current-question"' : ''}>${formatPoints(player.scores?.[question.id] || 0)}</td>`).join('')}<td><b>${formatPoints(player.score)}</b></td></tr>`).join('')}</tbody>
      </table>`
    : '<p class="muted">Er is nog geen spel gestart.</p>';
}
