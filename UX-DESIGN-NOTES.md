# ScoreScan v9 UI/UX

## Ontwerpdoel
Tijdens het spel moet de quizmaster bijna uitsluitend drie dingen zien: de actieve vraag, de camera en de bevestiging van een scan. Beheerfuncties blijven op aparte pagina's. Het publieke scherm is een rustig, donker "stage"-beeld voor tv, laptop of beamer.

## Visuele richting
- **Spelstudio (host):** licht, kalm en taakgericht, met veel witruimte en één duidelijke primaire actie per blok.
- **Publiek scherm:** diep indigo/zwart met zachte gloed, gouden koploperaccenten en grote typografie op afstand.
- **Merktaal:** indigo-violet voor actie, amber voor de winnaar, mint voor succes. Afgeronde vlakken, dunne randen en gelaagde schaduwen in plaats van zware kaders.
- **Iconen:** één inline SVG-set, consequent lijndikte en formaat. Geen emoji als icoon.

## Quizbouwer en vraagpresentatie
- Nieuwe pagina **Quizzen** met quizkaarten, vragenlijst, punten per vraag en directe start.
- Elke vraag heeft een tekst, één uploadbare afbeelding en een puntenwaarde; vragen zijn te herordenen.
- Afbeeldingen hebben een sleep-/klikvlak met preview en duidelijke limieten (JPG/PNG/WebP, 5 MB).
- De spelmodus toont de actieve vraag met afbeelding boven de scanner.
- Het publieke scherm heeft de weergave **Vraag tonen** met de actieve vraag groot in beeld.
- Een sessie houdt een snapshot van vraag, afbeelding en punten, zodat bewerken of verwijderen van de quiz de historiek niet wijzigt.

## Belangrijkste verbeteringen
- Login met duidelijke scheiding tussen **Aanmelden** en **Nieuwe ruimte**, wachtwoord tonen/verbergen en een compacte mobiele hero.
- Spelbalk met puntenpot en deel per winnaar naast de vraag, plus een scanbare pot-indicator.
- Nieuwe-spelkaart met snelle puntenkeuzes (25/50/75/100).
- Cameravlak met herkenbare lege staat, live scanlijn en scanframe.
- Winnaarslijst met avatar, rang, punten en een compacte verwijderactie in plaats van een volledige knop per rij.
- Volgende-vraagbalk met winnaarstelling en gedeelde punten; op mobiel blijft de knop binnen duimbereik.
- Deelnemers als kaarten met initialen, soort, score en QR-status. Verwijderen gebeurt in een nette bevestigingsdialoog.
- Scores met een podium voor de top drie en daaronder het volledige klassement met relatieve balken; per-vraagtabel met gemarkeerde huidige vraag en kleefkolommen.
- Publiek scherm met podium, ranglijst vanaf plaats vier, live-indicator, volgend-spelkiezer en volledigschermknop.
- Spelhistoriek en scorebordlink in één oogopslag, inclusief kopieerknop.
- Donkere modus volgt de systeeminstelling; reduced-motion wordt gerespecteerd.
- Grote touchdoelen, zichtbare focusringen, skip-link en live statusmeldingen.

## Integratie
De WebSocket- en HTTP-contracten zijn ongewijzigd. `public/index.html`, `public/app.css`, `public/app.js`, `public/scoreboard.html`, `public/scoreboard.js` en `public/scores.js` vormen samen de nieuwe interface.
