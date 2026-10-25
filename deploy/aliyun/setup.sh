#!/usr/bin/env bash
# Install / update the app on a mainland-China Linux server (Aliyun ECS etc.).
# Run as root from the unpacked app folder: PORT=8001 bash deploy/aliyun/setup.sh
# No Docker needed (Docker Hub is blocked in mainland China); pip uses the Aliyun mirror.
set -euo pipefail

APP_DIR=/opt/changan
PORT=${PORT:-8001}
PIP_MIRROR=https://mirrors.aliyun.com/pypi/simple/

ok_python() { "$1" -c 'import sys; sys.exit(sys.version_info < (3, 10))' 2>/dev/null; }

PY=""
for c in python3.12 python3.11 python3.10 python3; do
  if command -v "$c" >/dev/null && ok_python "$c"; then PY=$(command -v "$c"); break; fi
done
if [ -z "$PY" ]; then
  echo "Installing Python 3..."
  if command -v apt-get >/dev/null; then
    apt-get update -y && apt-get install -y python3 python3-venv
  else
    (dnf install -y python3.11 || yum install -y python3)
  fi
  for c in python3.11 python3.10 python3; do
    if command -v "$c" >/dev/null && ok_python "$c"; then PY=$(command -v "$c"); break; fi
  done
fi
[ -n "$PY" ] || { echo "Need Python 3.10+"; exit 1; }
if command -v apt-get >/dev/null && ! "$PY" -c 'import ensurepip' >/dev/null 2>&1; then
  apt-get update -y && apt-get install -y "python3-venv" "$(basename "$PY")-venv" || apt-get install -y python3-venv
fi
echo "Using $PY"

# The service runs as its own unprivileged user; only it (and root) can read .env.
APP_USER=changan
id "$APP_USER" >/dev/null 2>&1 || useradd -r -U -M -d "$APP_DIR" -s "$(command -v nologin || echo /bin/false)" "$APP_USER"

mkdir -p "$APP_DIR"
rm -rf "$APP_DIR/backend" && cp -r backend requirements.txt "$APP_DIR/"
mkdir -p "$APP_DIR/frontend" && rm -rf "$APP_DIR/frontend/dist" "$APP_DIR/frontend/public" && cp -r frontend/dist frontend/public "$APP_DIR/frontend/"
if [ -f .env ]; then cp .env "$APP_DIR/.env"; fi
if [ -f "$APP_DIR/.env" ]; then chown "$APP_USER:$APP_USER" "$APP_DIR/.env"; chmod 600 "$APP_DIR/.env"; fi

[ -x "$APP_DIR/venv/bin/pip" ] || { rm -rf "$APP_DIR/venv"; "$PY" -m venv "$APP_DIR/venv"; }
"$APP_DIR/venv/bin/pip" install -q -i "$PIP_MIRROR" --upgrade pip
"$APP_DIR/venv/bin/pip" install -q -i "$PIP_MIRROR" -r "$APP_DIR/requirements.txt"

cat > /etc/systemd/system/changan.service <<UNIT
[Unit]
Description=长安记得你
After=network-online.target

[Service]
User=$APP_USER
Group=$APP_USER
NoNewPrivileges=true
WorkingDirectory=$APP_DIR
ExecStart=$APP_DIR/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port $PORT
Restart=always

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable changan >/dev/null
systemctl restart changan

# Open the port in the OS firewall if one is running (the Aliyun security group is separate).
if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$PORT/tcp" && firewall-cmd --reload
elif command -v ufw >/dev/null && ufw status | grep -q active; then
  ufw allow "$PORT/tcp"
fi

for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo "OK: running on port $PORT"; curl -s "http://127.0.0.1:$PORT/api/health"; echo; exit 0
  fi
  sleep 1
done
echo "Did not start; recent log:"; journalctl -u changan -n 40 --no-pager; exit 1
