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

## Auf dem Pi einrichten

**Am einfachsten – ein Befehl** (im Terminal des Pi; installiert alles, fragt nach PIN und Stadt,
startet die App automatisch bei jedem Hochfahren, auf Wunsch mit Tailscale für unterwegs):

```bash
curl -fsSL https://raw.githubusercontent.com/captain-crunchy/indie-assist/claude/pi-planer/pi-planer/install.sh | bash
```

Derselbe Befehl aktualisiert später auf die neueste Version (PIN und Daten bleiben).

Oder von Hand:

```bash
sudo apt install -y nodejs npm        # Node 20 oder neuer nötig (node -v prüfen)
git clone https://github.com/captain-crunchy/indie-assist && cd indie-assist/pi-planer
npm ci --omit=dev
APP_PIN=123456 TZ=Europe/Berlin node server.js     # zum Ausprobieren
```

Dauerhaft: `pi-planer.service` anpassen und als systemd-Dienst installieren (Anleitung steht in der Datei).
Die Daten liegen in `data/data.json` – diese Datei sichern.

### Einstellungen (Umgebungsvariablen)

| Variable | Bedeutung | Standard |
|---|---|---|
| `APP_PIN` | PIN zum Anmelden (**Pflicht**, mind. 4 Zeichen) | – |
| `PORT` | Port | 3000 |
| `TZ` | Zeitzone für Briefing und Anzeige | Europe/Berlin |
| `BRIEFING_TIMES` | Briefing-Zeiten | 09:00,14:00 |
| `EVENTS_CITY`, `TICKETMASTER_KEY` | Veranstaltungen aus Ticketmaster ([kostenloser Key](https://developer.ticketmaster.com)) | – |
| `EVENTS_ICS_URLS` | Kommagetrennte ICS-Feeds mit Veranstaltungen | – |
| `DATA_FILE` | Speicherort | `data/data.json` |

## Von Handy/Tablet erreichen – und warum HTTPS nötig ist

Im Heimnetz geht `http://<pi-adresse>:3000`. **Benachrichtigungen funktionieren aber nur über HTTPS** (Vorgabe der Browser).
Am einfachsten und ohne Port-Freigabe im Router: [Tailscale](https://tailscale.com) auf Pi und Handy installieren, dann

```bash
sudo tailscale serve --bg 3000      # gibt eine https://…ts.net-Adresse aus
```

Diese Adresse am Handy öffnen → „Zum Home-Bildschirm“ → in der App unter **Mehr** *Benachrichtigungen einschalten*.
iPhone/iPad: Push geht nur, wenn die App vom Home-Bildschirm geöffnet wird (iOS 16.4+).
Die App nicht ungeschützt ins offene Internet stellen: Der PIN ist nur ein einfacher Schutz.

## Entwickeln

```bash
npm test
```
