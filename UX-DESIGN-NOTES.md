# ScoreScan v8 UI/UX

## Primair ontwerpdoel
Tijdens het spel moet de quizmaster bijna uitsluitend drie dingen zien: actieve ronde/vraag, camera en bevestiging. Beheerfuncties zijn naar aparte pagina's verplaatst.

## Belangrijkste verbeteringen
- Mobiele bottom navigation en desktop-zijrail.
- Vaste, grote knop Volgende vraag op mobiel.
- Scanfeedback met naam, punten, kleur, trilling en een korte viering.
- Contextuele invoer: alleen vaste punten of plaatsvelden tonen, nooit beide.
- Winnaars van de huidige vraag permanent naast de scanner.
- Deelnemersregistratie als één begeleide handeling: naam invullen, kaart scannen, klaar.
- Gevaarlijke correctie beschikbaar maar visueel ondergeschikt.
- Read-only scorescherm heeft een eigen rustige presentatie.
- Donkere modus en reduced-motion ondersteuning.
- Grote touch targets, duidelijke focusringen, skip-link en live statusmeldingen.

## Integratie
Vervang `public/index.html`, `public/app.css`, `public/app.js`, `public/scoreboard.html` en `public/scoreboard.js` in Production v7. De WebSocket- en HTTP-contracten blijven gelijk.
