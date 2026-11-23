'use strict';

/* Public scoreboard — read-only, big-screen presentation. */

const $ = s => document.querySelector(s);

let ws, state;
let reconnectAttempt = 0, reconnectTimer;

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
  const players = next.players || [];
  const scoreView = $('#scoreView').value || 'total';
  const questionView = next.displayMode === 'question';
  const view = questionView ? 'question' : scoreView;
  if (!questionView && scoreView !== $('#scoreView').value) $('#scoreView').value = scoreView;
  $('#board').classList.toggle('mode-question', questionView);
  $('#board').classList.toggle('mode-scores', !questionView);
  document.body?.classList.toggle('display-question', questionView);
  $('.board-controls').classList.toggle('hidden', questionView);

  const current = game?.questions?.find(question => question.ordinal === game.question);
  const winners = current?.winners?.length || 0;
  const questionCount = game?.questions?.length || 0;
  const ofTotal = game?.questionCount ? ` van ${game.questionCount}` : '';
  $('#boardHeadline').textContent = game?.quizTitle || 'Klassement';
  $('#boardEyebrow').textContent = questionView ? 'Vraag' : 'Live klassement';
  $('#gameInfo').textContent = game
    ? `${game.endedAt ? 'Gestopt' : 'Actief'} · ${players.length} ${players.length === 1 ? 'deelnemer' : 'deelnemers'} · ${questionCount} ${questionCount === 1 ? 'vraag' : 'vragen'} · Vraag ${game.question}${ofTotal}${winners ? ` · ${winners} ${winners === 1 ? 'winnaar' : 'winnaars'}` : ''}`
    : 'Nog geen spel gestart';
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
  const players = next.players || [];
  const questionCount = game?.questions?.length || 0;
  const hasQuestion = !!(game && question && (question.prompt || question.imageId));
  const hasImage = !!(question && question.imageId);
  stage.classList.toggle('empty', !hasQuestion);
  stage.classList.toggle('no-media', !hasImage);
  const questionNumber = question?.ordinal || game?.question || 0;
  $('#stageEyebrow').textContent = game ? `${game.quizTitle ? `${game.quizTitle} · ` : ''}Vraag ${questionNumber}${game.questionCount ? ` van ${game.questionCount}` : ''}` : 'Huidige vraag';
  $('#stageMedia').classList.toggle('hidden', !hasImage);
  if (hasImage) {
    $('#stageMedia').classList.remove('hidden');
    const image = $('#stageImage'), backdrop = $('#stageBackdrop');
    const src = question.imageUrl || `/api/images/${question.imageId}`;
    if (!image.getAttribute || image.getAttribute('src') !== src) {
      image.src = src;
      image.alt = question.prompt || 'Vraagafbeelding';
      if (backdrop) backdrop.src = src;
    }
  }
  if (hasQuestion) {
    const language = next.displayLanguage || 'primary';
    const primary = question.prompt || '';
    const alt = question.promptAlt || '';
    let main = primary, sub = '';
    if (language === 'secondary' && alt) main = alt;
    else if (language === 'both' && alt) sub = alt;
    if (!main) main = alt;
    $('#stagePrompt').textContent = main;
    $('#stagePromptAlt').textContent = sub;
    $('#stagePromptAlt').classList.toggle('hidden', !sub);
    stage.classList.toggle('has-alt', !!sub);
    $('#stageMeta').textContent = `${formatPoints(question.points)} punten`;
  } else {
    $('#stagePrompt').textContent = game ? 'Deze sessie heeft nog geen vraag om te tonen.' : 'Er is nog geen spel gestart.';
    $('#stagePromptAlt').classList.add('hidden');
    stage.classList.remove('has-alt');
    $('#stageMeta').textContent = '';
  }
  $('#stageFooter').textContent = game
    ? `${next.title} · ${players.length} ${players.length === 1 ? 'deelnemer' : 'deelnemers'} · ${questionCount} ${questionCount === 1 ? 'vraag' : 'vragen'}`
    : next.title;
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
      if ((message.type === 'auth.ok' || message.type === 'state') && (!state || message.state.revision >= state.revision)) {
        reconnectAttempt = 0;
        clearTimeout(reconnectTimer);
        render(message.state);
      }
    };
    socket.onclose = event => {
      if (ws !== socket) return;
      setStatus('Offline', false);
      if (event.code === 4401 || event.code === 4403) {
        reconnectAttempt = 0;
        clearTimeout(reconnectTimer);
        $('#auth').classList.remove('hidden');
        $('#board').classList.add('hidden');
        $('#logout').classList.add('hidden');
        document.body?.classList.remove('display-question');
        state = null;
        $('#authMessage').classList.remove('hidden');
        $('#authMessage').textContent = event.code === 4401
          ? 'Je aanmelding is verlopen. Meld je opnieuw aan.'
          : 'Je aanmelding kon niet worden bevestigd. Probeer opnieuw.';
      } else if (++reconnectAttempt <= 3) {
        const delay = 1000 * reconnectAttempt;
        setStatus('Verbinding herstellen…', false);
        $('#updated').textContent = `Opnieuw verbinden (${reconnectAttempt}/3)…`;
        reconnectTimer = setTimeout(async () => {
          try {
            const session = await roomSession.restore('display');
            if (session) return await connect(session);
            throw Error('Je aanmelding is verlopen. Meld je opnieuw aan.');
          } catch (error) {
            $('#auth').classList.remove('hidden');
            $('#board').classList.add('hidden');
            $('#logout').classList.add('hidden');
            document.body?.classList.remove('display-question');
            state = null;
            $('#authMessage').classList.remove('hidden');
            $('#authMessage').textContent = error.message || 'Verbinding herstellen mislukt. Meld je opnieuw aan.';
          }
        }, delay);
      } else {
        $('#updated').textContent = 'Verbinding herstellen mislukt. Vernieuw de pagina.';
      }
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
