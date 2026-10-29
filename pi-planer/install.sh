#!/usr/bin/env bash
# Pi-Planer mit einem Befehl auf dem Raspberry Pi installieren oder aktualisieren:
#   curl -fsSL https://raw.githubusercontent.com/captain-crunchy/indie-assist/claude/pi-planer/pi-planer/install.sh | bash
# Einstellungen später ändern:  sudo nano /etc/pi-planer.env  &&  sudo systemctl restart pi-planer
set -euo pipefail

# Alles steckt in main(), das erst in der letzten Zeile aufgerufen wird: Bricht der Download
# bei "curl | bash" mittendrin ab, läuft dadurch kein halbes Skript.
main() {
  BRANCH="${PI_PLANER_BRANCH:-claude/pi-planer}"
  REPO="https://github.com/captain-crunchy/indie-assist"
  USER_NAME="$(id -un)"
  DIR="$HOME/pi-planer-app"
  DATA_DIR="$HOME/pi-planer-data"
  ENV_FILE="/etc/pi-planer.env"
  TS_PORT=10444   # eigener HTTPS-Port bei Tailscale – die Hauptadresse (443) gehört oft schon einer anderen App

  # Port der App: aus den Einstellungen übernehmen, sonst den ersten freien ab 3030 nehmen
  # (auf dem Pi laufen oft schon andere Dienste, z. B. Indie Assist).
  if [ -f "$ENV_FILE" ]; then
    PORT=$(sudo sed -n 's/^PORT=\([0-9]*\)$/\1/p' "$ENV_FILE"); PORT=${PORT:-3030}
  else
    PORT=3030
    while ! port_free "$PORT"; do PORT=$((PORT + 1)); done
  fi

  if [ "$(id -u)" -eq 0 ]; then echo "Bitte als normaler Benutzer starten (nicht mit sudo)."; exit 1; fi

  say "Prüfe Node.js und git"
  if [ "$(node_major)" -lt 20 ]; then
    say "Installiere Node.js 22 (dauert ein paar Minuten)"
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - < /dev/null
    sudo apt-get install -y nodejs < /dev/null
    hash -r
    if [ "$(node_major)" -lt 20 ]; then
      echo "Es wird immer noch $(command -v node) ($(node -v)) verwendet. Bitte die alte Node-Version entfernen und neu starten."
      exit 1
    fi
  fi
  if ! command -v git >/dev/null; then
    sudo apt-get update < /dev/null
    sudo apt-get install -y git < /dev/null
  fi
  NODE_BIN="$(command -v node)"
  echo "Node $(node -v) ($NODE_BIN)"

  say "Lade den Pi-Planer"
  if [ -d "$DIR/.git" ]; then
    git -C "$DIR" fetch --depth 1 origin "$BRANCH" && git -C "$DIR" reset --hard FETCH_HEAD
  else
    git clone --depth 1 -b "$BRANCH" "$REPO" "$DIR"
  fi
  cd "$DIR/pi-planer"
  npm ci --omit=dev --no-audit --no-fund < /dev/null

  # Wer vorher von Hand installiert hat: vorhandene Daten übernehmen statt leer anzufangen.
  mkdir -p "$DATA_DIR"
  if [ ! -f "$DATA_DIR/data.json" ]; then
    for old in "$HOME/indie-assist/pi-planer/data/data.json" "$DIR/pi-planer/data/data.json"; do
      if [ -f "$old" ]; then cp "$old" "$DATA_DIR/data.json"; echo "Vorhandene Daten übernommen aus $old"; break; fi
    done
  fi

  if [ ! -f "$ENV_FILE" ]; then
    say "Einstellungen"
    PIN=""
    until [[ "$PIN" =~ ^[A-Za-z0-9]{4,}$ ]]; do PIN=$(ask_secret "PIN zum Anmelden (mind. 4 Zeichen, nur Buchstaben und Ziffern; bleibt beim Tippen unsichtbar): "); done
    # Anführungszeichen, Backslash, $ und ` würden die Einstellungsdatei durcheinanderbringen.
    CITY='"'
    while [[ "$CITY" == *[\"\\\$\`]* ]]; do CITY=$(ask "Deine Stadt für Veranstaltungen (leer lassen zum Überspringen): "); done
    TM_KEY="-"
    if [ -n "$CITY" ]; then
      until [[ "$TM_KEY" =~ ^[A-Za-z0-9]*$ ]]; do TM_KEY=$(ask "Ticketmaster-Key (leer lassen, wenn du keinen hast): "); done
    else
      TM_KEY=""
    fi
    echo "Telegram (optional): In Telegram @BotFather öffnen, /newbot schreiben, Namen wählen –"
    echo "du bekommst einen Token wie 123456789:AAH… Den hier einfügen."
    TG="-"
    until [[ "$TG" =~ ^([0-9]+:[A-Za-z0-9_-]+)?$ ]]; do TG=$(ask "Telegram-Bot-Token (leer lassen zum Überspringen): "); done
    # install -m 600: die Datei ist von Anfang an nur für root lesbar.
    printf 'APP_PIN=%s\nPORT=%s\nTZ=Europe/Berlin\nBRIEFING_TIMES=09:00,14:00\nEVENTS_CITY="%s"\nTICKETMASTER_KEY=%s\nTELEGRAM_TOKEN=%s\n' \
      "$PIN" "$PORT" "$CITY" "$TM_KEY" "$TG" | sudo install -m 600 -o root -g root /dev/stdin "$ENV_FILE"
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
Environment=DATA_FILE=$DATA_DIR/data.json
ExecStart=$NODE_BIN server.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable pi-planer >/dev/null 2>&1
  sudo systemctl restart pi-planer

  # Warten, bis die App wirklich antwortet (ein Pi Zero braucht etwas länger).
  local ok=""
  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/"; then ok=1; break; fi
    sleep 1
  done
  if [ -z "$ok" ]; then
    echo "Die App antwortet nicht. Details: sudo journalctl -u pi-planer -n 30"
    exit 1
  fi

  IP=$(hostname -I | awk '{print $1}')
  say "Fertig! Der Pi-Planer läuft."
  echo "Im Heimnetz öffnen:   http://$IP:$PORT"
  echo "Deine Daten:          $DATA_DIR/data.json (diese Datei sichern)"
  echo "PIN/Stadt/Telegram:  sudo nano $ENV_FILE  &&  sudo systemctl restart pi-planer"
  echo "Telegram verbinden:   in der App unter Mehr → Telegram"

  if [ "$(ask "Auch von unterwegs erreichbar machen und Benachrichtigungen ermöglichen (Tailscale)? [j/N] ")" = "j" ]; then
    command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh < /dev/null
    echo "Gleich erscheint ein Link – im Browser öffnen und mit deinem Tailscale-Konto anmelden."
    # Nur anmelden, wenn Tailscale noch nicht läuft – „tailscale up“ auf einem eingerichteten Gerät kann an
    # dessen Einstellungen scheitern.
    tailscale status >/dev/null 2>&1 || sudo tailscale up < /dev/null
    # Eigener Port, nur im eigenen Tailnet (kein Funnel): bestehende Einträge anderer Apps bleiben unberührt.
    sudo tailscale serve --bg --https="$TS_PORT" "http://127.0.0.1:$PORT" < /dev/null
    HOST=$(tailscale status --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).Self.DNSName.replace(/\.$/,"")))' || true)
    URL=${HOST:+https://$HOST:$TS_PORT}
    echo
    echo "Von überall öffnen:  ${URL:-siehe 'sudo tailscale serve status'}"
    echo "(Am Handy die Tailscale-App installieren und mit demselben Konto anmelden.)"
  fi
}

say() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ask() { local a; read -r -p "$1" a < /dev/tty; printf '%s' "$a"; }
ask_secret() { local a; read -r -s -p "$1" a < /dev/tty; echo > /dev/tty; printf '%s' "$a"; }
port_free() { ! ss -ltnH "sport = :$1" 2>/dev/null | grep -q .; }
node_major() { node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/' || echo 0; }

main "$@"
