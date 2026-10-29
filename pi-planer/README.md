# Pi-Planer

Persönliche To-dos, Kalender, Briefing (9 Uhr / 14 Uhr) und Veranstaltungen – als Web-App auf dem Raspberry Pi.
Handy, Tablet und PC öffnen dieselbe Adresse und sehen immer denselben Stand.

## Was kann sie?

- **To-dos:** übersichtliche Liste, einzelne Aufgaben als 🔥 *dringend* markieren, optional mit **Zeitlimit**.
  Dringende stehen oben, Überfälliges ist rot.
- **Benachrichtigung** aufs Handy: *30 Min. vor* dem Zeitlimit (dringend: *60 Min.*) und *wenn es erreicht ist*.
  Außerdem 15 Min. vor jedem Termin.
- **Kalender:** Termine anlegen; als Abo-Adresse (ICS) in Handy-, Google- oder Apple-Kalender einbindbar
  (Mehr → „Kalender abonnieren“).
- **Briefing um 09:00 und 14:00** (einstellbar): Termine heute, Überfälliges, heute Fälliges, Dringendes
  und Veranstaltungen – als Push und im Tab „Heute“. War der Pi kurz aus, wird es bis 90 Min. später nachgeholt.
- **Veranstaltungen** aus deiner Stadt (Ticketmaster) und/oder aus beliebigen ICS-Feeds.
- **Telegram** (optional): Briefing und Erinnerungen als Nachricht, mit Knöpfen „✅ Erledigt“ und „⏰ +1 Std.“.
  Befehle: `/heute`, `/neu Text`, `/dringend Text`, `/offen`. Funktioniert auch ohne HTTPS.

## Telegram einrichten

1. In Telegram **@BotFather** öffnen, `/newbot` schreiben, Namen wählen. Du bekommst einen Token (`123456789:AAH…`).
2. Den Token bei der Installation eingeben (oder `TELEGRAM_TOKEN=…` in `/etc/pi-planer.env`, dann `sudo systemctl restart pi-planer`).
3. Deinem neuen Bot in Telegram `/start` schreiben.
4. In der App unter **Mehr → Telegram** auf **Verbinden** drücken.

Nur der verbundene Chat kann den Bot bedienen; Nachrichten anderer werden ignoriert.

## Auf dem Pi einrichten

**Am einfachsten – ein Befehl** (im Terminal des Pi; installiert alles, fragt nach PIN und Stadt,
startet die App automatisch bei jedem Hochfahren, auf Wunsch mit Tailscale für unterwegs):

```bash
curl -fsSL https://raw.githubusercontent.com/captain-crunchy/indie-assist/claude/pi-planer/pi-planer/install.sh | bash
```

Derselbe Befehl aktualisiert später auf die neueste Version (PIN und Daten bleiben).
Die Daten liegen dann in `~/pi-planer-data/data.json` – diese Datei sichern.
PIN oder Stadt ändern: `sudo nano /etc/pi-planer.env`, danach `sudo systemctl restart pi-planer`.

Oder von Hand:

```bash
sudo apt install -y nodejs npm        # Node 20 oder neuer nötig (node -v prüfen)
git clone https://github.com/captain-crunchy/indie-assist && cd indie-assist/pi-planer
npm ci --omit=dev
APP_PIN=123456 TZ=Europe/Berlin node server.js     # zum Ausprobieren
```

Dauerhaft: `pi-planer.service` anpassen und als systemd-Dienst installieren (Anleitung steht in der Datei).
Bei der Installation von Hand liegen die Daten in `data/data.json` – diese Datei sichern.

### Einstellungen (Umgebungsvariablen)

| Variable | Bedeutung | Standard |
|---|---|---|
| `APP_PIN` | PIN zum Anmelden (**Pflicht**, mind. 4 Zeichen) | – |
| `PORT` | Port | 3000 |
| `TZ` | Zeitzone für Briefing und Anzeige | Europe/Berlin |
| `BRIEFING_TIMES` | Briefing-Zeiten | 09:00,14:00 |
| `EVENTS_CITY`, `TICKETMASTER_KEY` | Veranstaltungen aus Ticketmaster ([kostenloser Key](https://developer.ticketmaster.com)) | – |
| `EVENTS_ICS_URLS` | Kommagetrennte ICS-Feeds mit Veranstaltungen | – |
| `TELEGRAM_TOKEN` | Token des eigenen Telegram-Bots (von @BotFather) | – |
| `DATA_FILE` | Speicherort | `data/data.json` (Installationsskript: `~/pi-planer-data/data.json`) |

## Von Handy/Tablet erreichen – und warum HTTPS nötig ist

Im Heimnetz geht `http://<pi-adresse>:3000`. **Benachrichtigungen funktionieren aber nur über HTTPS** (Vorgabe der Browser).
Am einfachsten und ohne Port-Freigabe im Router: [Tailscale](https://tailscale.com) auf Pi und Handy installieren, dann

```bash
sudo tailscale serve --bg --https=10444 http://127.0.0.1:3000   # Port der App eintragen
```

Der eigene Port 10444 ist Absicht: Ohne `--https=…` würde die Hauptadresse des Pi (`https://<name>.ts.net`)
überschrieben – läuft dort schon eine andere App (z. B. Indie Assist), wäre sie danach nicht mehr erreichbar.
Die Adresse ist dann `https://<name-des-pi>.<tailnet>.ts.net:10444`. Das Installationsskript macht das automatisch.

Diese Adresse am Handy öffnen → „Zum Home-Bildschirm“ → in der App unter **Mehr** *Benachrichtigungen einschalten*.
iPhone/iPad: Push geht nur, wenn die App vom Home-Bildschirm geöffnet wird (iOS 16.4+).
Die App nicht ungeschützt ins offene Internet stellen: Der PIN ist nur ein einfacher Schutz.

## Entwickeln

```bash
npm test
```
