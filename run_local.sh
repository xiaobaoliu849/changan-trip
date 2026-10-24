#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "已创建 .env，请填入 GEMINI_API_KEY 和 EVEROS_API_KEY 后再运行本脚本。"
  exit 1
fi
python3 -m pip install -q -r requirements.txt
(cd frontend && npm install --silent && npm run build)
echo "启动游戏：http://localhost:8000"
python3 -m uvicorn backend.main:app --port 8000
