# 长安记得你 · Chang'an Remembers You

陪一个健忘的兵马俑「小俑」逛西安。一句话或一张照片生成你的旅行主角，闯 5 个西安景点小游戏，集齐通关文牒上的印章。
小俑用 [EverOS](https://evermind.ai) 记住你每一次旅行：你爱吃什么、在哪摔过跟头、对它说过什么。下次再来，它会翻旧账、提醒你补章、换菜单。

WaytoAGI 1024 黑客松 · 游戏赛道作品。

## 玩法

每一趟都按同一条路线走完 5 站（从小俑的老家兵马俑出发，顺着地图一路到大雁塔，不走回头路）：

| 站 | 小游戏 |
| --- | --- |
| 1 兵马俑 | 找出偷偷动了一下的俑 |
| 2 城墙 | 骑自行车跳过游客和自拍杆 |
| 3 钟楼 | 跟着钟声节奏敲钟 |
| 4 回民街 | 小俑是泥做的吃不了，接住它点的美食替它吃，躲开辣子 |
| 5 大唐不夜城 | 顶着一串灯笼保持平衡 |

开场序章：你是来西安旅游的旅人，闭馆后在兵马俑坑里发现有个俑偷偷动了一下。点中它，小俑就醒了，求你带它出去看看。序章在生成主角的那一分钟里播放，不额外占时间。闯关的是你的主角，小俑一路跟着（坐在城墙那关的车筐里，跟在回民街和不夜城的你身边）。每站结算时「小俑问你」一个关于现代的傻问题，点一个答案就直接去下一站。你教它什么它都信，还会记进记忆，写进游记，下次来翻旧账。

3 点体力，没过一站扣 1 点；体力用完就直接去终点。「再游一次」沿用同一个主角（不重新生成），路线上会标出上次哪些章拿到了、哪些要补。

终点大雁塔：小俑写今日游记（语音朗读），导出「通关文牒」主角卡，还能生成和小俑的合影明信片。

## 记忆怎么用

- 每站结束：把这站发生的事写入 EverOS（`/api/v2/memory/add`）。
- 一局结束：写入玩家对小俑说的话并 `flush`。
- 开局：`/api/v2/memory/search` 取回旧事，AI 生成小俑开场白、小本本、每站台词、回民街菜单、城墙提醒。
- EverOS 不可用时，浏览器本地记录兜底，游戏照常运行。

EverOS 客户端复用自 [echo](https://github.com/xiaobaoliu849/echo) 的 `evermem_service.py`（v2 API）。

## 技术栈

- 前端：React 19 + Vite + TypeScript，小游戏用 Canvas 2D
- 后端：FastAPI，藏 AI 网关和 EverOS 的 key，并托管前端
- AI：经 [OpenAI Next](https://credits.openai-next.com) 网关调用（国内可直连）——文本与看图 `claude-sonnet-5-5`、生图 `gpt-image-2`；EverOS Cloud 记忆
- 配音：固定台词（开场、5 个景点、大雁塔）是预先用 Gemini `gemini-3.8-flash-lite-tts`（声音 Gacrux）生成好的 mp3，游戏里直接播放；AI 现写的个性化台词用 Edge 神经语音实时合成（国内可用），再不行用浏览器语音
- 背景音乐：3 首 Gemini Lyria 3.5 生成的纯器乐国风曲（逛地图 `town`、小游戏 `game`、大雁塔 `finale`），预先生成放在 `assets/music/`，按画面交叉淡入淡出循环播放，小俑说话时自动压低。重新生成：`python -m backend.make_music`，然后把 `media.ts` 里的 `MUSIC_VERSION` 加 1
- 重新生成预录语音：`python -m backend.make_voice`（需 `GEMINI_API_KEY` 和 `pip install lameenc`）。按官方 Interactions API 调用，风格只放在 `speech_metadata.style`，台词文本里不放任何提示词；每条都回听转写校对。改完把 `App.tsx` 里的 `VOICE_VERSION` 加 1

## 本地运行

**一键启动**：Windows 双击 `run_local.bat`（Mac/Linux 运行 `./run_local.sh`）。第一次会生成 `.env`，填好两个 key 再运行一次，浏览器会自动打开 http://localhost:8000。需要先装 Python 3.10+ 和 Node.js 20+。

手动启动：

```bash
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
export OPENAI_NEXT_API_KEY=...  # OpenAI Next 网关
export EVEROS_API_KEY=...       # EverOS Console
uvicorn backend.main:app --port 8000
# 打开 http://localhost:8000
```

开发时可另开 `cd frontend && npm run dev`（已代理 `/api` 到 8000 端口）。

## 部署

仓库自带 `Dockerfile`，Railway / Render / Fly.io 都可以直接用：新建服务 → 连接本仓库 → 设置环境变量 `OPENAI_NEXT_API_KEY`、`EVEROS_API_KEY` → 部署。
