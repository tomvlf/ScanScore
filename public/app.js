'use strict';

/* ScoreScan host controller — server-authoritative, thin browser client. */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let ws, state, scanner, pairScanner, lastScan = '', lastAt = 0, lastQuestionId;
let cameraTask = Promise.resolve();
let draftQuiz = null, quizSaving = false;

/* ---------- Small helpers ---------- */

function send(message) {
  if (ws?.readyState !== 1) {
    toast('Verbinding verbroken. Meld je opnieuw aan.');
    return false;
  }
  ws.send(JSON.stringify(message));
  return true;
}

function wsUrl() {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function toast(text) {
  const element = $('#toast');
  element.textContent = text;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2600);
}

function status(text, online = false) {
  const element = $('#status');
  const label = element.querySelector?.('.status-label');
  if (label) label.textContent = text;
  else element.textContent = text;
  element.classList.toggle('online', online);
}

function feedback(kind, title, text) {
  const element = $('#feedback');
  element.className = `feedback ${kind}`;
  element.innerHTML = `<b>${kind === 'success' ? '✓' : kind === 'error' ? '!' : '◎'}</b><div><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
}

function avatarClass(name) {
  let hash = 0;
  for (const character of String(name)) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `av${hash % 6}`;
}

function initials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
}

function displayUrl() {
  return typeof location !== 'undefined' && location.origin ? `${location.origin}/scoreboard.html` : '/scoreboard.html';
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = $('#confetti');
  const colors = ['#6657e8', '#0e9f6e', '#f5b82e', '#e84d75', '#8b5cf6', '#38bdf8'];
  for (let i = 0; i < 26; i++) {
    const spark = document.createElement('i');
    spark.className = 'spark';
    spark.style.left = `${44 + Math.random() * 12}%`;
    spark.style.top = `${38 + Math.random() * 10}%`;
    spark.style.background = colors[i % colors.length];
    spark.style.setProperty('--x', `${(Math.random() - .5) * 420}px`);
    spark.style.setProperty('--y', `${60 + Math.random() * 320}px`);
    spark.style.animationDelay = `${Math.random() * 90}ms`;
    box.append(spark);
    setTimeout(() => spark.remove(), 1000);
  }
}

$('#questionImage').onerror = () => { $('#questionMedia').classList.add('hidden'); $('#currentQuestion').classList.add('no-media'); };

/* ---------- Navigation ---------- */

function page(name) {
  return cameraAction(async () => {
    await stopCameras();
    $$('.page').forEach(element => element.classList.toggle('active', element.id === name));
    $$('[data-page]').forEach(element => {
      const active = element.dataset.page === name;
      element.classList.toggle('active', active);
      if (active) element.setAttribute?.('aria-current', 'page');
      else element.removeAttribute?.('aria-current');
    });
    scrollTo({ top: 0, behavior: 'smooth' });
  }).catch(error => {
    const message = cameraError(error);
    $('#pairStatus').textContent = message;
    toast(message);
  });
}

$$('[data-page]').forEach(element => element.onclick = () => page(element.dataset.page));

/* ---------- Game helpers ---------- */

function currentQuestion() {
  return state?.game?.questions.find(question => question.ordinal === state.game.question);
}

function canScore() {
  return !!state?.game && state.game.id === state.activeGameId;
}

function gameAction(type, extra = {}) {
  if (!canScore()) {
    toast('Open eerst het actieve spel.');
    return false;
  }
  return send({ type, gameId: state.game.id, questionId: currentQuestion().id, ...extra });
}

/* ---------- Render ---------- */

function render() {
  if (!state) return;

  const game = state.game;
  const question = currentQuestion();
  const winners = question?.winners || [];
  const editable = canScore();

  if (lastQuestionId !== question?.id) {
    if (lastQuestionId && editable) {
      feedback('ready', `Vraag ${game.question}`, scanner ? 'Scan de eerste winnaar.' : 'Start de camera en scan een winnaar.');
    }
    lastQuestionId = question?.id;
    lastScan = '';
    lastAt = 0;
  }

  const lastQuestion = !!(game?.questionCount && game.question >= game.questionCount);
  $('#play').classList.toggle('is-playing', editable);
  $('#playActions').classList.toggle('hidden', !editable);
  $('#nextHint').textContent = winners.length ? `${winners.length} ${winners.length === 1 ? 'winnaar' : 'winnaars'} gescand` : lastQuestion ? 'Laatste vraag' : 'Klaar met scannen?';
  if ($('#nextLabel')) $('#nextLabel').textContent = lastQuestion ? 'Quiz afronden' : 'Volgende vraag';
  if ($('#nextSub')) {
    $('#nextSub').textContent = lastQuestion
      ? 'Rond de quiz af wanneer alle winnaars gescand zijn.'
      : winners.length
        ? `${formatPoints(question.points / winners.length)} punten per winnaar · volgende vraag begint leeg`
        : 'De volgende vraag begint met een lege winnaarslijst.';
  }
  $('#gameForm').classList.toggle('hidden', !!state.activeGameId);
  $('#gameControls').classList.toggle('hidden', !game);
  $('#returnToGame').classList.toggle('hidden', !state.activeGameId || editable);
  $('.play-meta').classList.toggle('hidden', !game);
  $('#reader').classList.toggle('hidden', !editable);
  $('#playTitle').textContent = game ? `${editable ? '' : 'Gestopt spel · '}Vraag ${game.question}` : 'Nog geen spel';
  const quizPrefix = game?.quizTitle ? `Quiz “${game.quizTitle}” · ` : '';
  $('#gameStatus').textContent = game
    ? (game.legacy ? 'Historische scores uit de vorige versie.' : game.endedAt ? 'Dit spel is gestopt. De scores blijven bewaard.' : `${quizPrefix}Scan alle winnaars en ga daarna naar de volgende vraag.`)
    : 'Voeg spelers toe en start een spel.';
  $('#questionSelect').innerHTML = (game?.questions || []).map(q => {
    const prompt = q.prompt ? ' · ' + q.prompt.slice(0, 48) : '';
    return `<option value="${q.id}">${esc((q.label || 'Vraag ' + q.ordinal) + prompt)}</option>`;
  }).join('');
  $('#questionSelect').value = question?.id || '';
  $('#questionSelect').disabled = !editable;
  $('#previous').disabled = !editable || game.question === 1;
  $('#next').disabled = !editable;
  $('#stopGame').disabled = !editable;
  $('#start').disabled = !editable;
  $('#undo').disabled = !editable || !winners.length;

  if ($('#potValue')) $('#potValue').textContent = question?.points ? formatPoints(question.points) : '—';
  if ($('#shareValue')) $('#shareValue').textContent = winners.length && question?.points ? formatPoints(question.points / winners.length) : '—';
  $('#poolInfo').textContent = question?.points
    ? `${formatPoints(question.points)} punten · ${winners.length} ${winners.length === 1 ? 'winnaar' : 'winnaars'} · ${formatPoints(winners.length ? question.points / winners.length : 0)} per winnaar`
    : '';

  $('#winnerCount').textContent = winners.length;
  $('#winners').innerHTML = winners.length
    ? winners.map((winner, index) => {
        const player = state.players.find(candidate => candidate.id === winner.playerId);
        const name = player?.name || 'Onbekende speler';
        return `<li>
          <span class="rank">${index + 1}</span>
          <span class="avatar ${avatarClass(name)}" aria-hidden="true">${esc(initials(name))}</span>
          <span class="winner-name">${esc(name)}</span>
          <b class="winner-points">${formatPoints(winner.points)}</b>
          ${editable ? `<button class="remove-winner" type="button" data-remove-winner="${winner.playerId}" aria-label="${esc(name)} uit deze vraag verwijderen" title="Verwijder uit deze vraag">${icon('trash')}</button>` : '<span></span>'}
        </li>`;
      }).join('')
    : `<li class="empty"><span class="icon-tile">${icon('qr')}</span><strong>Nog geen winnaars</strong><small>Scan een gekoppelde QR-code tijdens het spel.</small></li>`;

  const players = state.players.filter(player => !player.deleted);
  $('#playerCount').textContent = `${players.length} ${players.length === 1 ? 'deelnemer' : 'deelnemers'}`;
  $('#playerCards').innerHTML = players.length
    ? players.map(player => `<article class="playercard">
        <div class="playercard-main">
          <span class="avatar ${avatarClass(player.name)}" aria-hidden="true">${esc(initials(player.name))}</span>
          <div class="playercard-copy"><h3>${esc(player.name)}</h3><p>${player.kind === 'team' ? 'Ploeg' : 'Persoon'}</p></div>
          <span class="scoreline"><b>${formatPoints(player.score)}</b><small>pt</small></span>
        </div>
        <div class="playercard-foot">
          <span class="kind-tag linked">${icon('check')}QR gekoppeld</span>
          <button class="remove-player" type="button" data-remove-player="${player.id}" aria-label="${esc(player.name)} uit de ruimte verwijderen">${icon('trash')}Verwijderen</button>
        </div>
      </article>`).join('')
    : `<div class="empty-state"><span class="icon-tile">${icon('users')}</span><strong>Nog geen deelnemers</strong><small>Voeg hierboven een persoon of ploeg toe en koppel de QR-kaart.</small></div>`;

  const selected = $('#gameHistory').value;
  $('#gameHistory').innerHTML = state.games.map((entry, index) => {
    const date = new Date(entry.startedAt).toLocaleString('nl-BE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const name = entry.legacy ? 'Oude scores' : entry.quizTitle ? entry.quizTitle : `Spel ${state.games.length - index}`;
    return `<option value="${entry.id}">${esc(name)} · ${esc(date)}${entry.endedAt ? ' (gestopt)' : ' (actief)'}</option>`;
  }).join('');
  $('#gameHistory').value = state.games.some(entry => entry.id === selected) ? selected : game?.id || '';
  $('#viewGame').disabled = !state.games.length;

  renderScoreViews();
  renderQuizPicker();
  renderCurrentQuestion(game, question);
  renderQuizList();

  if ($('#displayUrl')) $('#displayUrl').textContent = displayUrl();
  for (const id of ['display', 'displayTop', 'displayMore']) $('#' + id).href = '/scoreboard.html';
  $('#roomTitle').textContent = state.title || 'Live spelstudio';

  if (scanner && !editable) cameraAction(stopCameras).catch(error => feedback('error', 'Camera kon niet stoppen', cameraError(error)));
}

function renderQuizPicker() {
  const select = $('#quizSelect');
  if (!select) return;
  const previous = select.value;
  const quizzes = state?.quizzes || [];
  select.innerHTML = '<option value="">Snel spel zonder quiz</option>' + quizzes.map(quiz =>
    `<option value="${quiz.id}">${esc(quiz.title)} · ${quiz.questions.length} ${quiz.questions.length === 1 ? 'vraag' : 'vragen'}</option>`
  ).join('');
  select.value = quizzes.some(quiz => quiz.id === previous) ? previous : '';
  updateGameFormMode();
}

function updateGameFormMode() {
  const select = $('#quizSelect');
  if (!select) return;
  const quiz = (state?.quizzes || []).find(entry => entry.id === select.value);
  $('#gameForm').classList.toggle('quiz-mode', !!quiz);
  $('#pointsField').classList.toggle('hidden', !!quiz);
  $('#presets').classList.toggle('hidden', !!quiz);
  const points = $('#pointsPerQuestion');
  points.disabled = !!quiz;
  points.required = !quiz;
  $('#startGameLabel').textContent = quiz ? 'Quiz starten' : 'Spel starten';
  if (quiz) {
    const total = quiz.questions.reduce((sum, question) => sum + question.points, 0);
    $('#quizHint').textContent = `${quiz.questions.length} ${quiz.questions.length === 1 ? 'vraag' : 'vragen'} · ${formatPoints(total)} punten in totaal. De punten per vraag komen uit de quiz.`;
  } else {
    $('#quizHint').textContent = (state?.quizzes || []).length
      ? 'Kies een quiz, of laat dit leeg voor een snel spel zonder voorbereide vragen.'
      : 'Nog geen quizzen. Maak er een via Quizzen, of start hier een snel spel.';
  }
}

function renderCurrentQuestion(game, question) {
  const box = $('#currentQuestion');
  if (!box) return;
  const hasContent = !!(game && question && (question.prompt || question.imageId));
  box.classList.toggle('hidden', !hasContent);
  if (!hasContent) return;
  const hasImage = !!question.imageId;
  box.classList.toggle('no-media', !hasImage);
  $('#questionMedia').classList.toggle('hidden', !hasImage);
  $('#questionLabel').textContent = `Vraag ${question.ordinal}${game.questionCount ? ` van ${game.questionCount}` : ''}`;
  $('#questionPrompt').textContent = question.prompt || '';
  $('#questionMeta').textContent = [game.quizTitle, `${formatPoints(question.points)} punten`, game.endedAt ? 'gestopt' : ''].filter(Boolean).join(' · ');
  if (hasImage) {
    $('#questionMedia').classList.remove('hidden');
    const image = $('#questionImage');
    const src = question.imageUrl || `/api/images/${question.imageId}`;
    if (!image.getAttribute || image.getAttribute('src') !== src) {
      image.src = src;
      image.alt = question.prompt || 'Vraagafbeelding';
    }
  }
}

function renderQuizList() {
  const box = $('#quizList');
  if (!box) return;
  const quizzes = state?.quizzes || [];
  box.innerHTML = quizzes.length
    ? quizzes.map(quiz => {
        const questions = quiz.questions || [];
        const total = questions.reduce((sum, question) => sum + question.points, 0);
        const thumbs = questions.slice(0, 4).map(question => {
          const src = question.thumbUrl || question.imageUrl;
          return src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">` : '';
        }).join('');
        const extra = questions.length > 4 ? `<span class="more-thumb">+${questions.length - 4}</span>` : '';
        const updated = quiz.updatedAt ? new Date(quiz.updatedAt).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' }) : '';
        return `<article class="quiz-card">
          <div class="quiz-card-head">
            <div><h2>${esc(quiz.title)}</h2><p class="quiz-card-meta">${questions.length} ${questions.length === 1 ? 'vraag' : 'vragen'} · ${formatPoints(total)} punten${updated ? ` · ${esc(updated)}` : ''}</p></div>
            <div class="quiz-card-tools"><button class="icon-button danger" type="button" data-delete-quiz="${quiz.id}" aria-label="${esc(quiz.title)} verwijderen" title="Quiz verwijderen">${icon('trash')}</button></div>
          </div>
          <div class="quiz-thumbs">${thumbs}${extra}</div>
          <div class="quiz-actions">
            <button class="primary" type="button" data-start-quiz="${quiz.id}">${icon('play')}Start</button>
            <button type="button" data-edit-quiz="${quiz.id}">${icon('list')}Bewerken</button>
          </div>
        </article>`;
      }).join('')
    : `<div class="empty-state"><span class="icon-tile">${icon('list')}</span><strong>Nog geen quizzen</strong><small>Bouw je eerste quiz met vragen, afbeeldingen en punten per vraag.</small><button class="primary" type="button" data-new-quiz>${icon('plus')}Nieuwe quiz</button></div>`;
}

function blankQuizQuestion(points = 50) {
  return { prompt: '', points, imageId: null, imageUrl: null };
}

function newQuizEditor() {
  draftQuiz = { id: null, title: '', questions: [blankQuizQuestion()] };
  showQuizEditor();
}

function openQuizEditor(id) {
  const quiz = (state?.quizzes || []).find(entry => entry.id === id);
  if (!quiz) {
    toast('Deze quiz is niet meer beschikbaar.');
    return;
  }
  draftQuiz = {
    id: quiz.id,
    title: quiz.title,
    questions: quiz.questions.map(question => ({
      prompt: question.prompt,
      points: question.points,
      imageId: question.imageId,
      imageUrl: question.imageUrl || (question.imageId ? `/api/images/${question.imageId}` : null),
      thumbUrl: question.thumbUrl || null
    }))
  };
  showQuizEditor();
}

function showQuizEditor() {
  if (!draftQuiz) return;
  $('#quizTitleInput').value = draftQuiz.title;
  $('#quizEditorTitle').textContent = draftQuiz.id ? 'Quiz bewerken' : 'Nieuwe quiz';
  $('#quizStatus').textContent = 'Elke vraag heeft een tekst, afbeelding en puntenwaarde nodig.';
  $('#quizEditor').classList.remove('hidden');
  $('#quizList').classList.add('hidden');
  $('#newQuiz').classList.add('hidden');
  renderQuizEditor();
  $('#quizTitleInput').focus();
}

function closeQuizEditor() {
  draftQuiz = null;
  $('#quizEditor').classList.add('hidden');
  $('#quizList').classList.remove('hidden');
  $('#newQuiz').classList.remove('hidden');
  $('#quizStatus').textContent = '';
  renderQuizList();
}

function renderQuizEditor() {
  if (!draftQuiz) return;
  $('#quizQuestions').innerHTML = draftQuiz.questions.map((question, index) => {
    const imageUrl = question.thumbUrl || question.imageUrl || (question.imageId ? `/api/images/${question.imageId}?thumb=1` : null);
    return `<article class="editor-question" data-question-row="${index}">
      <span class="editor-number">Vraag ${index + 1}</span>
      <label class="image-drop ${imageUrl ? 'has-image' : ''}" data-image-drop="${index}">
        ${imageUrl ? `<img src="${esc(imageUrl)}" alt="Afbeelding voor vraag ${index + 1}" loading="lazy" decoding="async">` : `${icon('image')}<strong>Afbeelding</strong><small>JPG, PNG of WebP<br>max. 5 MB</small>`}
        <span class="drop-overlay">${imageUrl ? 'Afbeelding vervangen' : 'Afbeelding kiezen'}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" data-image-input="${index}" aria-label="Afbeelding voor vraag ${index + 1} kiezen">
      </label>
      <div class="editor-fields">
        <label class="field"><span>Vraag</span><textarea data-prompt="${index}" maxlength="500" placeholder="Bijv. Welke film won de Oscar voor beste film in 2024?">${esc(question.prompt)}</textarea></label>
      </div>
      <div class="editor-side">
        <label class="field"><span>Punten</span><input data-points="${index}" type="number" min="1" max="1000000" step="1" value="${question.points}"></label>
        <div class="editor-question-actions">
          <button type="button" data-move-up="${index}" aria-label="Vraag ${index + 1} omhoog verplaatsen"${index === 0 ? ' disabled' : ''}>↑</button>
          <button type="button" data-move-down="${index}" aria-label="Vraag ${index + 1} omlaag verplaatsen"${index === draftQuiz.questions.length - 1 ? ' disabled' : ''}>↓</button>
          <button class="danger" type="button" data-remove-question="${index}" aria-label="Vraag ${index + 1} verwijderen">${icon('trash')}</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

function readQuizInputs() {
  if (!draftQuiz) return;
  draftQuiz.title = $('#quizTitleInput').value.trim();
  for (const row of document.querySelectorAll('[data-question-row]')) {
    const index = Number(row.dataset.questionRow);
    const question = draftQuiz.questions[index];
    if (!question) continue;
    question.prompt = row.querySelector('[data-prompt]').value;
    question.points = Number(row.querySelector('[data-points]').value);
  }
}

async function saveQuiz() {
  if (!draftQuiz || quizSaving) return;
  readQuizInputs();
  if (!draftQuiz.title) {
    $('#quizStatus').textContent = 'Geef de quiz eerst een titel.';
    $('#quizTitleInput').focus();
    return;
  }
  if (!draftQuiz.questions.length) {
    $('#quizStatus').textContent = 'Voeg minstens één vraag toe.';
    return;
  }
  for (let i = 0; i < draftQuiz.questions.length; i++) {
    const question = draftQuiz.questions[i];
    if (!question.prompt.trim()) {
      $('#quizStatus').textContent = `Vul de tekst van vraag ${i + 1} in.`;
      return;
    }
    if (!Number.isInteger(question.points) || question.points < 1 || question.points > 1000000) {
      $('#quizStatus').textContent = `Geef vraag ${i + 1} een geldig puntenaantal.`;
      return;
    }
    if (!question.imageId) {
      $('#quizStatus').textContent = `Kies een afbeelding voor vraag ${i + 1}.`;
      return;
    }
  }
  if ($('[data-image-drop].uploading')) {
    $('#quizStatus').textContent = 'Wacht tot de afbeeldingen klaar zijn met uploaden.';
    return;
  }
  quizSaving = true;
  $('#saveQuiz').disabled = true;
  $('#quizStatus').textContent = 'Quiz opslaan…';
  try {
    const body = {
      title: draftQuiz.title,
      questions: draftQuiz.questions.map(question => ({
        prompt: question.prompt.trim(),
        points: question.points,
        imageId: question.imageId
      }))
    };
    if (draftQuiz.id) body.quizId = draftQuiz.id;
    const response = await fetch('/api/quizzes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = response.status === 409
        ? 'Er bestaat al een quiz met deze titel.'
        : data.error === 'invalid_image'
          ? 'Een afbeelding is niet meer beschikbaar. Upload ze opnieuw.'
          : response.status === 401
            ? 'Je sessie is verlopen. Meld je opnieuw aan.'
            : 'De quiz kon niet worden opgeslagen. Controleer de velden.';
      throw Error(message);
    }
    toast(draftQuiz.id ? 'Quiz bijgewerkt.' : 'Quiz aangemaakt.');
    closeQuizEditor();
  } catch (error) {
    $('#quizStatus').textContent = error.message;
    toast(error.message);
  } finally {
    quizSaving = false;
    $('#saveQuiz').disabled = false;
  }
}

async function deleteQuiz(id) {
  const quiz = (state?.quizzes || []).find(entry => entry.id === id);
  if (!quiz) return;
  if (!(await ask('Quiz verwijderen?', `“${quiz.title}” verdwijnt uit de lijst. Lopende en eerdere sessies blijven werken.`, 'Verwijderen'))) return;
  try {
    const response = await fetch(`/api/quizzes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) throw Error('De quiz kon niet worden verwijderd.');
    toast('Quiz verwijderd.');
  } catch (error) {
    toast(error.message);
  }
}

function startQuizSession(id) {
  if (!(state?.quizzes || []).some(quiz => quiz.id === id)) {
    toast('Deze quiz is niet meer beschikbaar.');
    return;
  }
  if (state.activeGameId) {
    toast('Rond eerst het actieve spel af.');
    page('play');
    return;
  }
  if (send({ type: 'game.start', quizId: id })) {
    toast('Quiz gestart.');
    page('play');
  }
}

function makeQuizThumbnail(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, 480 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url);
          resolve(blob);
        }, 'image/jpeg', .82);
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

async function uploadQuizImage(index, file) {
  if (!draftQuiz) return;
  const question = draftQuiz.questions[index];
  if (!question) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    toast('Gebruik een JPG-, PNG- of WebP-afbeelding.');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast('De afbeelding is groter dan 5 MB.');
    return;
  }
  const row = document.querySelector(`[data-question-row="${index}"]`);
  row?.classList.add('uploading');
  const drop = row?.querySelector('.image-drop');
  drop?.classList.add('uploading');
  const overlay = drop?.querySelector('.drop-overlay');
  if (overlay) overlay.textContent = 'Uploaden…';
  try {
    const response = await fetch('/api/images', {
      method: 'POST',
      headers: { 'content-type': file.type },
      body: file
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Error(response.status === 401 ? 'Je sessie is verlopen. Meld je opnieuw aan.' : 'De afbeelding kon niet worden geüpload.');
    }
    question.imageId = data.id;
    question.imageUrl = `/api/images/${data.id}`;
    question.thumbUrl = null;
    const thumbnail = await makeQuizThumbnail(file);
    if (thumbnail) {
      const thumbResponse = await fetch(`/api/images/${data.id}/thumbnail`, {
        method: 'POST',
        headers: { 'content-type': thumbnail.type || 'image/jpeg' },
        body: thumbnail
      });
      if (thumbResponse.ok) question.thumbUrl = `/api/images/${data.id}?thumb=1`;
    }
    renderQuizEditor();
    $('#quizStatus').textContent = 'Afbeelding klaar.';
  } catch (error) {
    row?.classList.remove('uploading');
    drop?.classList.remove('uploading');
    if (overlay) overlay.textContent = 'Afbeelding kiezen';
    $('#quizStatus').textContent = error.message;
    toast(error.message);
  }
}

$('#newQuiz').onclick = newQuizEditor;
$('#closeQuizEditor').onclick = closeQuizEditor;
$('#saveQuiz').onclick = saveQuiz;
$('#addQuestion').onclick = () => {
  if (!draftQuiz) return;
  if (draftQuiz.questions.length >= 100) {
    toast('Een quiz kan maximaal 100 vragen bevatten.');
    return;
  }
  const last = draftQuiz.questions[draftQuiz.questions.length - 1];
  draftQuiz.questions.push(blankQuizQuestion(last?.points || 50));
  renderQuizEditor();
};
$('#quizList').onclick = event => {
  const start = event.target.closest('[data-start-quiz]');
  if (start) return startQuizSession(start.dataset.startQuiz);
  const edit = event.target.closest('[data-edit-quiz]');
  if (edit) return openQuizEditor(edit.dataset.editQuiz);
  const remove = event.target.closest('[data-delete-quiz]');
  if (remove) return deleteQuiz(remove.dataset.deleteQuiz);
  if (event.target.closest('[data-new-quiz]')) return newQuizEditor();
};
$('#quizQuestions').oninput = event => {
  const row = event.target.closest('[data-question-row]');
  if (!row || !draftQuiz) return;
  const question = draftQuiz.questions[Number(row.dataset.questionRow)];
  if (!question) return;
  if (event.target.matches('[data-prompt]')) question.prompt = event.target.value;
  if (event.target.matches('[data-points]')) question.points = Number(event.target.value);
};
$('#quizQuestions').onchange = event => {
  const input = event.target.closest('[data-image-input]');
  if (input && input.files?.[0]) uploadQuizImage(Number(input.dataset.imageInput), input.files[0]);
};
$('#quizQuestions').onclick = event => {
  if (!draftQuiz) return;
  const row = event.target.closest('[data-question-row]');
  if (!row) return;
  const index = Number(row.dataset.questionRow);
  const up = event.target.closest('[data-move-up]');
  const down = event.target.closest('[data-move-down]');
  const remove = event.target.closest('[data-remove-question]');
  if (up && index > 0) {
    const [question] = draftQuiz.questions.splice(index, 1);
    draftQuiz.questions.splice(index - 1, 0, question);
    renderQuizEditor();
  } else if (down && index < draftQuiz.questions.length - 1) {
    const [question] = draftQuiz.questions.splice(index, 1);
    draftQuiz.questions.splice(index + 1, 0, question);
    renderQuizEditor();
  } else if (remove) {
    if (draftQuiz.questions.length === 1) draftQuiz.questions[0] = blankQuizQuestion();
    else draftQuiz.questions.splice(index, 1);
    renderQuizEditor();
  }
};

function renderScoreViews() {
  if (!state) return;
  const view = $('#scoreView').value || 'total';
  const players = state.players || [];
  if ($('#podium')) {
    renderPodium(state, $('#podium'));
    $('#podium').classList.toggle('hidden', view !== 'total' || !players.length);
  }
  renderScores(state, view, $('#scoreList'), $('#scoreTable'), 3);
  if (view === 'total' && players.length > 0 && players.length <= 3) $('#scoreList').classList.add('hidden');
}

/* ---------- Session / socket ---------- */

function ask(title, text, label = 'Verwijderen') {
  const dialog = $('#confirmDialog');
  if (!dialog?.showModal) return Promise.resolve(confirm(text));
  $('#confirmTitle').textContent = title;
  $('#confirmText').textContent = text;
  $('#confirmOk').textContent = label;
  dialog.returnValue = 'cancel';
  dialog.showModal();
  return new Promise(resolve => {
    dialog.onclose = () => resolve(dialog.returnValue === 'confirm');
  });
}

function loginMessage(message) {
  $('#loginMessage').classList.remove('hidden');
  $('#loginMessage').textContent = message;
}

async function connect(name = $('#roomName').value.trim(), password = $('#secret').value, resume = false) {
  try {
    if (!resume) await roomSession.login(name, password);
    $('#secret').value = '';
    status('Verbinden…');
    ws?.close();
    const socket = ws = new WebSocket(wsUrl());

    socket.onopen = () => socket.send(JSON.stringify(roomSession.authentication('host')));

    socket.onmessage = event => {
      if (ws !== socket) return;
      const message = JSON.parse(event.data);
      if (message.type === 'auth.ok') {
        state = message.state;
        $('#login').classList.add('hidden');
        $('#app').classList.remove('hidden');
        $('#mobileNav').classList.remove('hidden');
        $('#logout').classList.remove('hidden');
        status('Live', true);
        render();
        feedback('ready', canScore() ? 'Klaar om winnaars te scannen' : 'Start eerst een spel', canScore() ? 'Start de camera en scan een persoonlijke QR-code.' : 'Spelers kun je op elk moment toevoegen.');
      } else if (message.type === 'state') {
        if (message.state.revision < state.revision) return;
        state = message.state;
        render();
      } else if (message.type === 'scan.result') {
        if (message.ok) {
          feedback('success', message.name, `${formatPoints(message.points)} punten elk · ${message.winnerCount} ${message.winnerCount === 1 ? 'winnaar' : 'winnaars'}.`);
          navigator.vibrate?.([55, 35, 80]);
          confetti();
        } else {
          feedback('error', 'Niet toegevoegd', {
            duplicate: 'Deze speler is al winnaar van deze vraag.',
            unknown: 'Deze QR-code is nog niet gekoppeld aan een speler.'
          }[message.code] || 'De scan kon niet verwerkt worden.');
          navigator.vibrate?.(180);
        }
      } else if (message.type === 'error') {
        const text = {
          input: 'Controleer je invoer.',
          duplicate_qr: 'Deze QR-code is al gekoppeld aan een speler.',
          game_running: 'Er loopt al een spel in deze ruimte.',
          no_active_game: 'Dit spel loopt niet meer. Open het actieve spel of start een nieuw spel.',
          stale_question: 'De vraag is gewijzigd. Controleer de huidige vraag en scan opnieuw.',
          question_limit: 'Het maximum van 10.000 vragen is bereikt.',
          duplicate_request: 'Deze scan is al verwerkt.',
          question: 'Die vraag hoort niet bij dit spel.',
          quiz: 'Deze quiz bestaat niet meer.',
          quiz_empty: 'Deze quiz heeft nog geen vragen.',
          quiz_finished: 'Dit was de laatste vraag. Rond de quiz af.',
          duplicate_quiz: 'Er bestaat al een quiz met deze titel.',
          invalid_image: 'De afbeelding kon niet worden gebruikt. Upload ze opnieuw.',
          request_failed: 'De actie kon niet worden verwerkt. Probeer opnieuw.',
          nothing: 'Er is geen scan om ongedaan te maken.'
        }[message.reason] || 'Actie geweigerd. Vernieuw de pagina en probeer opnieuw.';
        toast(text);
        feedback('error', 'Actie niet uitgevoerd', text);
        $('#pairStatus').textContent = text;
      }
    };

    socket.onclose = event => {
      if (ws !== socket) return;
      status(event.code === 4403 ? 'Aanmelding mislukt' : 'Offline');
      if (scanner || pairScanner) cameraAction(stopCameras).catch(error => feedback('error', 'Camera kon niet stoppen', cameraError(error)));
      if (event.code === 4403 || event.code === 4401) {
        state = null;
        $('#login').classList.remove('hidden');
        $('#app').classList.add('hidden');
        $('#mobileNav').classList.add('hidden');
        $('#logout').classList.add('hidden');
        loginMessage('Je aanmelding is verlopen. Meld je opnieuw aan.');
      } else if (!state) {
        loginMessage('Verbinding verbroken. Probeer opnieuw aan te melden.');
      } else {
        toast('Verbinding verbroken. Vernieuw de pagina om de verbinding te herstellen.');
      }
    };
  } catch (error) {
    status('Niet aangemeld');
    loginMessage(error.message);
    toast(error.message);
  }
}

/* ---------- Login ---------- */

$('#loginForm').onsubmit = event => {
  event.preventDefault();
  return connect();
};

$('#toggleSecret').onclick = () => {
  const field = $('#secret');
  const hidden = field.type === 'password';
  field.type = hidden ? 'text' : 'password';
  $('#toggleSecret').setAttribute?.('aria-pressed', hidden ? 'true' : 'false');
  $('#toggleSecret').setAttribute?.('aria-label', hidden ? 'Wachtwoord verbergen' : 'Wachtwoord tonen');
};

$('#create').onclick = async () => {
  if (!$('#loginForm').reportValidity()) return;
  const name = $('#roomName').value.trim();
  const password = $('#secret').value;
  $('#create').disabled = true;
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomName: name, hostSecret: password })
    });
    if (response.status === 409) {
      const message = 'Deze ruimtenaam bestaat al. Kies een andere naam of klik op Aanmelden met het bestaande wachtwoord.';
      loginMessage(message);
      toast(message);
      $('#roomName').focus();
      return;
    }
    const data = await response.json();
    if (!response.ok) {
      const message = data.error === 'invalid_input'
        ? 'Vul een ruimtenaam van maximaal 80 tekens in en een wachtwoord van minstens 12 tekens of 8–16 cijfers.'
        : 'Ruimte kon niet worden aangemaakt. Probeer het later opnieuw.';
      loginMessage(message);
      toast(message);
      return;
    }
    loginMessage('Ruimte aangemaakt. Je wordt aangemeld.');
    await connect(name, password);
  } catch {
    const message = 'Ruimte kon niet worden aangemaakt. Controleer de velden en je verbinding.';
    loginMessage(message);
    toast(message);
  } finally {
    $('#create').disabled = false;
  }
};

/* ---------- Game controls ---------- */

$('#gameForm').onsubmit = event => {
  event.preventDefault();
  if (!$('#gameForm').reportValidity()) return;
  const quizId = $('#quizSelect').value;
  if (quizId) {
    if (send({ type: 'game.start', quizId })) toast('Quiz gestart.');
    return;
  }
  if (send({ type: 'game.start', pointsPerQuestion: Number($('#pointsPerQuestion').value) })) $('#pointsPerQuestion').value = '';
};

$('#quizSelect').onchange = updateGameFormMode;

$$('[data-points]').forEach(button => {
  button.onclick = () => {
    $('#pointsPerQuestion').value = button.dataset.points;
    $('#pointsPerQuestion').focus();
  };
});

$('#stopGame').onclick = async () => {
  if (await ask('Spel stoppen?', 'De scores blijven bewaard, maar daarna zijn geen correcties meer mogelijk.', 'Spel stoppen')) gameAction('game.stop');
};

$('#next').onclick = async () => {
  if (state?.game?.questionCount && state.game.question >= state.game.questionCount) {
    if (await ask('Quiz afronden?', 'Alle vragen zijn gespeeld. De scores blijven bewaard in de spelhistoriek.', 'Quiz afronden')) gameAction('game.stop');
    return;
  }
  gameAction('question.next');
};

$('#previous').onclick = () => {
  const previous = state.game.questions.find(question => question.ordinal === state.game.question - 1);
  if (previous) gameAction('question.select', { targetQuestionId: previous.id });
};

$('#questionSelect').onchange = () => gameAction('question.select', { targetQuestionId: $('#questionSelect').value });
$('#undo').onclick = () => gameAction('award.undo');

$('#winners').onclick = event => {
  const button = event.target.closest('[data-remove-winner]');
  if (button) gameAction('winner.remove', { playerId: button.dataset.removeWinner });
};

$('#playerCards').onclick = async event => {
  const button = event.target.closest('[data-remove-player]');
  if (!button) return;
  const player = state?.players.find(candidate => candidate.id === button.dataset.removePlayer);
  const name = player?.name || 'Deze speler';
  if (await ask('Speler verwijderen?', `${name} verdwijnt uit de deelnemerslijst. Behaalde punten blijven in de spelhistoriek bewaard.`, 'Verwijderen')) {
    send({ type: 'player.remove', playerId: button.dataset.removePlayer });
  }
};

$('#scoreView').onchange = renderScoreViews;

$('#viewGame').onclick = () => {
  send({ type: 'game.select', gameId: $('#gameHistory').value });
  page('scores');
};

$('#returnToGame').onclick = () => send({ type: 'game.select', gameId: null });

$('#copyDisplay').onclick = () => {
  const url = displayUrl();
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => toast('Link naar het scorebord gekopieerd.')).catch(() => toast(url));
  } else {
    toast(url);
  }
};

$('#logoutMore').onclick = () => {
  const button = $('#logout');
  if (typeof button.click === 'function') button.click();
};

/* ---------- Camera ---------- */

function cameraAction(action) {
  const task = cameraTask.then(action);
  cameraTask = task.catch(error => console.warn('camera_operation_failed', error));
  return task;
}

function cameraError(error) {
  const reason = String(error?.name || '') + ' ' + String(error?.message || error);
  if (reason.includes('https_required')) return 'Open ScoreScan via HTTPS om de camera te gebruiken.';
  if (reason.includes('camera_unsupported')) return 'Deze browser ondersteunt geen cameratoegang. Open ScoreScan in Chrome of Safari.';
  if (reason.includes('scanner_unavailable')) return 'De QR-scanner kon niet laden. Vernieuw de pagina en probeer opnieuw.';
  if (reason.includes('connection_closed')) return 'Verbinding verbroken. Meld je opnieuw aan voordat je een speler toevoegt.';
  if (reason.includes('camera_video_failed')) return 'De camera geeft geen beeld. Sluit andere camera-apps en vernieuw deze pagina.';
  if (/NotAllowed|SecurityError|Permission denied/i.test(reason)) return 'Cameratoegang is geblokkeerd. Sta de camera toe in de site-instellingen van je browser.';
  if (/NotReadable|TrackStart|Could not start video source|in use/i.test(reason)) return 'De camera is bezet. Sluit andere camera-apps of browsertabbladen en probeer opnieuw.';
  if (/NotFound|DevicesNotFound/i.test(reason)) return 'Geen camera gevonden op dit apparaat.';
  return 'Camera kon niet starten. Controleer de cameratoegang en probeer opnieuw.';
}

function cameraPreflight() {
  if (!globalThis.isSecureContext) throw Error('https_required');
  if (!navigator.mediaDevices?.getUserMedia) throw Error('camera_unsupported');
  if (typeof Html5Qrcode !== 'function') throw Error('scanner_unavailable');
}

function cameraReady(instance, id) {
  if (instance.isScanning) return Promise.resolve();
  const video = $('#' + id + ' video');
  if (!video) throw Error('camera_video_failed');
  return new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(timer);
      video.removeEventListener('playing', playing);
      video.removeEventListener('error', failed);
      if (error) {
        for (const track of video.srcObject?.getTracks() || []) track.stop();
        reject(error);
      } else {
        resolve();
      }
    };
    const playing = () => finish(instance.isScanning ? null : Error('camera_video_failed'));
    const failed = () => finish(Error('camera_video_failed'));
    const timer = setTimeout(failed, 10000);
    video.addEventListener('playing', playing, { once: true });
    video.addEventListener('error', failed, { once: true });
  });
}

async function stopScanner(instance) {
  const current = instance.getState();
  if (current === Html5QrcodeScannerState.SCANNING || current === Html5QrcodeScannerState.PAUSED) await instance.stop();
  instance.clear();
}

async function stopCameras() {
  if (scanner) {
    await stopScanner(scanner);
    scanner = null;
    $('#reader').classList.remove('live');
    $('#stop').classList.add('hidden');
    $('#start').classList.remove('hidden');
    feedback('ready', 'Scanner gestopt', 'Start de camera wanneer de volgende winnaar klaarstaat.');
  }
  if (pairScanner) {
    await stopScanner(pairScanner);
    pairScanner = null;
    $('#pairStatus').textContent = 'Camera gestopt.';
  }
}

$('#start').onclick = async () => {
  if (!canScore()) {
    toast('Start eerst een spel om winnaars te scannen.');
    return;
  }
  $('#start').disabled = true;
  try {
    await cameraAction(async () => {
      await stopCameras();
      cameraPreflight();
      scanner = new Html5Qrcode('reader');
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          aspectRatio: 1,
          qrbox: (width, height) => {
            const size = Math.min(240, Math.floor(Math.min(width, height) * .8));
            return { width: size, height: size };
          }
        },
        code => {
          const now = Date.now();
          if (code === lastScan && now - lastAt < 1200) return;
          lastScan = code;
          lastAt = now;
          gameAction('scan.award', { code, idempotencyKey: crypto.randomUUID() });
        },
        () => {}
      );
      await cameraReady(scanner, 'reader');
      $('#reader').classList.add('live');
      $('#start').classList.add('hidden');
      $('#stop').classList.remove('hidden');
      feedback('ready', 'Scanner actief', 'Scan een persoonlijke QR-code.');
    });
  } catch (error) {
    feedback('error', 'Camera niet beschikbaar', cameraError(error));
  } finally {
    $('#start').disabled = false;
  }
};

$('#stop').onclick = () => cameraAction(stopCameras).catch(error => feedback('error', 'Camera kon niet stoppen', cameraError(error)));

$('#pair').onclick = async () => {
  const name = $('#playerName').value.trim();
  const playerType = $('#playerType').value;
  if (!name) {
    $('#pairStatus').textContent = 'Vul eerst een naam in.';
    $('#playerName').focus();
    return;
  }
  $('#pair').disabled = true;
  $('#pairStatus').textContent = 'Camera starten...';
  try {
    await cameraAction(async () => {
      await stopCameras();
      cameraPreflight();
      pairScanner = new Html5Qrcode('pairReader');
      let paired = false;
      await pairScanner.start(
        { facingMode: 'environment' },
        { fps: 12, qrbox: 230 },
        code => {
          if (paired) return;
          paired = true;
          cameraAction(async () => {
            await stopCameras();
            if (ws?.readyState !== 1) throw Error('connection_closed');
            send({ type: 'player.add', name, playerType, code });
            $('#playerName').value = '';
            $('#pairStatus').textContent = 'QR-code gescand en verzonden.';
            toast('QR-code verzonden. Controleer de deelnemerslijst.');
          }).catch(error => { $('#pairStatus').textContent = cameraError(error); });
        },
        () => {}
      );
      await cameraReady(pairScanner, 'pairReader');
      $('#pairStatus').textContent = 'Camera actief. Houd de QR-code voor de camera.';
    });
  } catch (error) {
    const message = cameraError(error);
    $('#pairStatus').textContent = message;
    toast(message);
  } finally {
    $('#pair').disabled = false;
  }
};

/* ---------- Boot ---------- */

roomSession.restore().then(session => {
  if (session) {
    $('#roomName').value = session.roomName;
    return connect(undefined, undefined, true);
  }
}).catch(error => loginMessage('Aanmelding herstellen mislukt. Controleer je verbinding en probeer opnieuw. ' + error.message));
