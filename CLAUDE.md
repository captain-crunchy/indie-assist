# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Was in diesem Repo liegt

- **`README.md` (Wurzel):** Download- und Installationsseite der Desktop-App **Indie Assist** (Persönliche
  Assistenz). Deren Quellcode liegt **nicht** hier; das Repo verteilt nur die Installationsdateien über
  GitHub Releases. Texte dort richten sich an Laien (Deutsch, einfache Sprache).
- **`pi-planer/`:** eigenständige Web-App (persönliche To-dos, Kalender, Briefing 9/14 Uhr, Veranstaltungen),
  läuft als Node-Server auf einem Raspberry Pi; Handy/Tablet/PC greifen per Browser (PWA) darauf zu.
  Hat nichts mit dem Code von Indie Assist zu tun.

Sprache: Oberfläche, Kommentare, Commits und Doku sind auf Deutsch.

## Pi-Planer: Befehle

```bash
cd pi-planer
npm ci                                             # einzige Abhängigkeit: web-push
APP_PIN=1234 node server.js                        # startet auf Port 3000 (PORT=…); ohne APP_PIN bricht der Start ab
npm test                                           # node --test test/*.test.js
node --test --test-name-pattern="Scheduler" test/  # einzelnen Test ausführen
bash -n install.sh                                 # Syntax des Installationsskripts prüfen
```

Kein Build-Schritt, kein Linter, kein Framework: Backend ist reines `node:http`, Frontend reines JS ohne Bundler.

## Pi-Planer: Architektur

- **`server.js`:** eigener Mini-Router. `/api/login` ist offen, alles andere unter `/api/*` verlangt das
  Session-Cookie; `/calendar.ics?t=…` ist über ein eigenes Token geschützt (für Kalender-Abos ohne Cookie).
  Beide Tokens sind HMACs aus der PIN mit einem zufälligen Geheimnis aus dem Datenspeicher, d. h. eine
  PIN-Änderung macht alle Sitzungen und die Abo-Adresse ungültig. Todos und Termine teilen sich eine
  generische CRUD-Schleife; `cleanTodo`/`cleanEvent` übernehmen nur bekannte Felder (Whitelist).
- **`lib/store.js`:** der gesamte Zustand ist ein Objekt in einer JSON-Datei (`DATA_FILE`), atomar über
  `.tmp` + rename geschrieben. Darin liegen auch das Session-Geheimnis, die VAPID-Schlüssel und die
  Push-Abos. Wer Felder hinzufügt: Defaults in `empty()` ergänzen, alte Dateien werden damit gemergt.
- **`lib/scheduler.js`:** läuft alle 30 s im Serverprozess (kein cron). Briefings zu `BRIEFING_TIMES` werden
  über `lastBriefing["<Tag> <Zeit>"]` dedupliziert und bis 90 Min. nachgeholt. Erinnerungen setzen
  `notified`-Flags am Todo/Termin; eine geänderte Frist bzw. Startzeit setzt diese zurück (in `server.js`).
- **`lib/briefing.js`:** reine Funktion `buildBriefing(db, now, tz)`; alle Tagesgrenzen werden in `TZ`
  berechnet, nicht in der Zeitzone des Servers. Wird für Push und für den Tab „Heute“ benutzt.
- **`lib/events.js` / `lib/ics.js`:** Veranstaltungen aus Ticketmaster und ICS-Feeds, höchstens alle 6 h
  neu geladen; bei Fehlern bleibt der alte Stand. Inhalte fremder Feeds sind nicht vertrauenswürdig:
  Links laufen durch `webUrl()` (nur http/https).
- **`public/`:** `app.js` baut alle Elemente über `h()` mit `textContent`/`setAttribute`, nie `innerHTML`
  (Nutzer- und Feed-Texte). `sw.js` zeigt nur Push-Nachrichten an, kein Offline-Cache.
- **Tests** (`test/app.test.js`) setzen `DATA_FILE`, `APP_PIN` und `TZ` **vor** dem ersten `require`, weil
  Store und Server diese beim Laden lesen; der Scheduler-Test ersetzt `push.sendAll`.

## Pi-Planer: Betrieb

- `install.sh` ist für `curl … | bash` gedacht (deshalb alles in `main()`, Eingaben über `/dev/tty`). Es klont
  nach `~/pi-planer-app`, speichert Daten in `~/pi-planer-data/data.json`, Einstellungen in
  `/etc/pi-planer.env` (0600) und richtet den systemd-Dienst `pi-planer` ein. Die Install-URL in README und
  Skript zeigt auf den Branch `claude/pi-planer` – nach einem Merge beide anpassen.
- Web-Push funktioniert nur über HTTPS; vorgesehen ist `tailscale serve`. Dahinter kommen alle Anfragen von
  127.0.0.1 (relevant für die IP-basierte PIN-Sperre in `server.js`).
