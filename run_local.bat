@echo off
chcp 65001 >nul
cd /d %~dp0
if not exist .env (
  copy .env.example .env >nul
  echo 已创建 .env，请用记事本打开，填入 GEMINI_API_KEY 和 EVEROS_API_KEY 后再运行本脚本。
  notepad .env
  pause
  exit /b
)
echo [1/3] 安装 Python 依赖...
python -m pip install -q -r requirements.txt || goto :err
echo [2/3] 构建网页...
cd frontend
call npm install --silent || goto :err
call npm run build || goto :err
cd ..
echo [3/3] 启动游戏：http://localhost:8000
start "" http://localhost:8000
python -m uvicorn backend.main:app --port 8000
exit /b
:err
echo 出错了，请把上面的报错发给 Claude。
pause
