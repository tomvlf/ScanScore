'use strict';

/* Public scoreboard — read-only, big-screen presentation. */

const $ = s => document.querySelector(s);

let ws, state;

function setStatus(text, online) {
  const status = $('#status');
  const label = status.querySelector?.('.status-label');
  if (label) label.textContent = text;
  else status.textContent = text;
  status.classList.toggle('online', !!online);
}

function render(next) {
  state = next;
  $('#auth').classList.add('hidden');
  $('#authMessage').classList.add('hidden');
  $('#board').classList.remove('hidden');
  $('#logout').classList.remove('hidden');
  $('#title').textContent = next.title;

  const game = next.game;
  const view = $('#scoreView').value || 'total';
  if (view !== $('#scoreView').value) $('#scoreView').value = view;

  const current = game?.questions?.find(question => question.ordinal === game.question);
  const winners = current?.winners?.length || 0;
  const quizLabel = game?.quizTitle ? `${game.quizTitle} · ` : '';
  const ofTotal = game?.questionCount ? ` van ${game.questionCount}` : '';
  $('#gameInfo').textContent = game
    ? `${quizLabel}${game.endedAt ? 'Gestopt spel' : 'Actief spel'} · Vraag ${game.question}${ofTotal}${winners ? ` · ${winners} ${winners === 1 ? 'winnaar' : 'winnaars'}` : ''}`
    : 'Nog geen spel gestart';

  const players = next.players || [];
  const questionView = view === 'question';
  renderPodium(next, $('#podium'));
  $('#podium').classList.toggle('hidden', questionView || view !== 'total' || !players.length);

  renderScores(next, view, $('#scoreList'), $('#scoreTable'), 3);
  const showList = view === 'total' && players.length > 3;
  $('#scoreList').classList.toggle('hidden', questionView || !showList);
  $('#boardEmpty').classList.toggle('hidden', questionView || players.length > 0);
  $('#questionStage').classList.toggle('hidden', !questionView);
  if (questionView) renderQuestionStage(next, game, current);
  if (!players.length) $('#podium').classList.add('hidden');

  const selected = $('#gameHistory').value;
  $('#gameHistory').innerHTML = '<option value="">Actief / meest recente spel volgen</option>' + next.games.map((entry, index) => {
    const number = next.games.length - index;
    const name = entry.legacy ? 'Oude scores' : entry.quizTitle ? entry.quizTitle : `Spel ${number}`;
    return `<option value="${entry.id}">${scoreEscape(name)}${entry.endedAt ? ' (gestopt)' : ' (actief)'}</option>`;
  }).join('');
  $('#gameHistory').value = next.games.some(entry => entry.id === selected) ? selected : '';

  $('#updated').textContent = `Bijgewerkt om ${new Date().toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}`;
  $('#footerInfo').textContent = game
    ? `${players.length} ${players.length === 1 ? 'deelnemer' : 'deelnemers'} · ${game.questions?.length || 0} ${game.questions?.length === 1 ? 'vraag' : 'vragen'} · breukdelen worden pas voor weergave afgerond.`
    : 'Breukdelen worden pas voor weergave afgerond op twee decimalen.';
  setStatus('Live', true);
}

function renderQuestionStage(next, game, question) {
  const stage = $('#questionStage');
  const hasQuestion = !!(game && question && (question.prompt || question.imageId));
  const hasImage = !!(question && question.imageId);
  stage.classList.toggle('empty', !hasQuestion);
  $('#stageEyebrow').textContent = game?.quizTitle ? `${game.quizTitle} · Vraag ${question?.ordinal || game.question}` : 'Huidige vraag';
  $('#stageMedia').classList.toggle('hidden', !hasImage);
  if (hasImage) {
    $('#stageMedia').classList.remove('hidden');
    const image = $('#stageImage');
    const src = question.imageUrl || `/api/images/${question.imageId}`;
    if (!image.getAttribute || image.getAttribute('src') !== src) {
      image.src = src;
      image.alt = question.prompt || 'Vraagafbeelding';
    }
  }
  if (hasQuestion) {
    $('#stagePrompt').textContent = question.prompt || '';
    $('#stageMeta').textContent = `Vraag ${question.ordinal}${game.questionCount ? ` van ${game.questionCount}` : ''} · ${formatPoints(question.points)} punten`;
  } else {
    $('#stagePrompt').textContent = game ? 'Deze sessie heeft nog geen vraag om te tonen.' : 'Er is nog geen spel gestart.';
    $('#stageMeta').textContent = game ? 'Start een quiz met vragen om ze hier groot te tonen.' : 'Zodra de quizmaster start, verschijnt de vraag hier.';
  }
}

$('#stageImage').onerror = () => $('#stageMedia').classList.add('hidden');

$('#scoreView').onchange = () => {
  if (state) render(state);
};

$('#gameHistory').onchange = () => {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'game.select', gameId: $('#gameHistory').value || null }));
};

$('#fullscreen').onclick = () => {
  const root = document.documentElement;
  if (!document.fullscreenElement) root.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.();
};

async function connect(resume = false) {
  try {
    let socketTicket;
    if (!resume) {
      const session = await roomSession.login($('#roomName').value.trim(), $('#secret').value, 'display');
      socketTicket = session.socketTicket;
    } else if (typeof resume === 'object') socketTicket = resume.socketTicket;
    $('#secret').value = '';
    $('#authMessage').textContent = '';
    $('#authMessage').classList.add('hidden');
    ws?.close();
    const socket = ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    socket.onopen = () => socket.send(JSON.stringify(roomSession.authentication('display', socketTicket)));
    socket.onmessage = event => {
      if (ws !== socket) return;
      const message = JSON.parse(event.data);
      if ((message.type === 'auth.ok' || message.type === 'state') && (!state || message.state.revision >= state.revision)) render(message.state);
    };
    socket.onclose = event => {
      if (ws !== socket) return;
      setStatus('Offline', false);
      $('#updated').textContent = 'Verbinding verbroken. Vernieuw de pagina om de verbinding te herstellen.';
      $('#auth').classList.remove('hidden');
      $('#board').classList.add('hidden');
      $('#logout').classList.add('hidden');
      state = null;
      $('#authMessage').classList.remove('hidden');
      $('#authMessage').textContent = event.code === 4401
        ? 'Je aanmelding is verlopen. Meld je opnieuw aan.'
        : event.code === 4403 ? 'Je aanmelding kon niet worden bevestigd. Probeer opnieuw.' : 'Geen verbinding. Probeer opnieuw.';
    };
  } catch (error) {
    $('#authMessage').classList.remove('hidden');
    $('#authMessage').textContent = error.message;
  }
}

$('#auth').onsubmit = event => {
  event.preventDefault();
  return connect();
};

roomSession.restore('display').then(session => {
  if (session) {
    $('#roomName').value = session.roomName;
    return connect(session);
  }
}).catch(error => {
  $('#authMessage').classList.remove('hidden');
  $('#authMessage').textContent = 'Aanmelding herstellen mislukt. Controleer je verbinding en probeer opnieuw. ' + error.message;
});
