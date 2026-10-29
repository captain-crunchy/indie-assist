#!/usr/bin/env bash
# Pi-Planer mit einem Befehl auf dem Raspberry Pi installieren oder aktualisieren:
#   curl -fsSL https://raw.githubusercontent.com/captain-crunchy/indie-assist/claude/pi-planer/pi-planer/install.sh | bash
set -euo pipefail

BRANCH="${PI_PLANER_BRANCH:-claude/pi-planer}"
REPO="https://github.com/captain-crunchy/indie-assist"
USER_NAME="$(id -un)"
DIR="$HOME/pi-planer-app"
ENV_FILE="/etc/pi-planer.env"
PORT=3000

say() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ask() { local a; read -r -p "$1" a < /dev/tty; printf '%s' "$a"; }

if [ "$(id -u)" -eq 0 ]; then echo "Bitte als normaler Benutzer starten (nicht mit sudo)."; exit 1; fi

say "Prüfe Node.js"
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/' || echo 0)
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  say "Installiere Node.js 22 (dauert ein paar Minuten)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
command -v git >/dev/null || sudo apt-get install -y git
echo "Node $(node -v)"

say "Lade den Pi-Planer"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --depth 1 origin "$BRANCH" && git -C "$DIR" reset --hard FETCH_HEAD
else
  git clone --depth 1 -b "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR/pi-planer"
npm ci --omit=dev --no-audit --no-fund

if [ ! -f "$ENV_FILE" ]; then
  say "Einstellungen"
  PIN=""
  while [ "${#PIN}" -lt 4 ]; do PIN=$(ask "PIN zum Anmelden wählen (mind. 4 Zeichen): "); done
  CITY=$(ask "Deine Stadt für Veranstaltungen (leer lassen zum Überspringen): ")
  TM_KEY=""
  [ -n "$CITY" ] && TM_KEY=$(ask "Ticketmaster-Key (leer lassen, wenn du keinen hast): ")
  sudo tee "$ENV_FILE" >/dev/null <<EOF
APP_PIN=$PIN
PORT=$PORT
TZ=Europe/Berlin
BRIEFING_TIMES=09:00,14:00
EVENTS_CITY=$CITY
TICKETMASTER_KEY=$TM_KEY
EOF
  sudo chmod 600 "$ENV_FILE"
else
  echo "Einstellungen bleiben erhalten ($ENV_FILE)."
fi

say "Richte automatischen Start ein"
sudo tee /etc/systemd/system/pi-planer.service >/dev/null <<EOF
[Unit]
Description=Pi-Planer
After=network-online.target
Wants=network-online.target

[Service]
User=$USER_NAME
WorkingDirectory=$DIR/pi-planer
EnvironmentFile=$ENV_FILE
Environment=DATA_FILE=$HOME/pi-planer-data/data.json
ExecStart=$(command -v node) server.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable pi-planer >/dev/null 2>&1
sudo systemctl restart pi-planer
sleep 2
if ! systemctl is-active --quiet pi-planer; then
  echo "Start fehlgeschlagen. Details: sudo journalctl -u pi-planer -n 30"; exit 1
fi

IP=$(hostname -I | awk '{print $1}')
say "Fertig! Der Pi-Planer läuft."
echo "Im Heimnetz öffnen:   http://$IP:$PORT"

if [ "$(ask "Auch von unterwegs erreichbar machen und Benachrichtigungen ermöglichen (Tailscale)? [j/N] ")" = "j" ]; then
  command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh
  echo "Gleich erscheint ein Link – im Browser öffnen und mit deinem Tailscale-Konto anmelden."
  sudo tailscale up
  sudo tailscale serve --bg "$PORT"
  URL=$(sudo tailscale serve status 2>/dev/null | grep -o 'https://[^ ]*' | head -1)
  echo
  echo "Von überall öffnen:  ${URL:-siehe 'sudo tailscale serve status'}"
  echo "(Am Handy die Tailscale-App installieren und mit demselben Konto anmelden.)"
fi
