# 长安记得你 · Chang'an Remembers You

陪一个健忘的兵马俑「小俑」逛西安。一句话或一张照片生成你的旅行主角，闯 5 个西安景点小游戏，集齐通关文牒上的印章。
小俑用 [EverOS](https://evermind.ai) 记住你每一次旅行：你爱吃什么、在哪摔过跟头、对它说过什么。下次再来，它会翻旧账、改路线、换菜单。

WaytoAGI 1024 黑客松 · 游戏赛道作品。

## 玩法

| 站 | 小游戏 |
| --- | --- |
| 钟楼 | 跟着钟声节奏敲钟 |
| 回民街 | 接住客人点的美食，躲开辣子 |
| 兵马俑 | 找出偷偷动了一下的俑 |
| 城墙 | 骑自行车跳过游客和自拍杆 |
| 大唐不夜城 | 顶着一串灯笼保持平衡 |

终点大雁塔：小俑写今日游记（语音朗读），导出「通关文牒」主角卡，还能生成和小俑的合影明信片。

## 记忆怎么用

- 每站结束：把这站发生的事写入 EverOS（`/api/v2/memory/add`）。
- 一局结束：写入玩家对小俑说的话并 `flush`。
- 开局：`/api/v2/memory/search` 取回旧事，Gemini 生成小俑开场白、推荐路线、回民街菜单、城墙提醒。
- EverOS 不可用时，浏览器本地记录兜底，游戏照常运行。

EverOS 客户端复用自 [echo](https://github.com/xiaobaoliu849/echo) 的 `evermem_service.py`（v2 API）。

## 技术栈

- 前端：React 19 + Vite + TypeScript，小游戏用 Canvas 2D
- 后端：FastAPI，藏 Gemini 和 EverOS 的 key，并托管前端
- AI：Gemini（文本 `gemini-3.5-flash`、生图 `gemini-3.1-flash-image`、配音 `gemini-3.8-flash-tts`），EverOS Cloud 记忆

## 本地运行

```bash
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
export GEMINI_API_KEY=...   # Google AI Studio
export EVEROS_API_KEY=...   # EverOS Console
uvicorn backend.main:app --port 8000
# 打开 http://localhost:8000
```

开发时可另开 `cd frontend && npm run dev`（已代理 `/api` 到 8000 端口）。

## 部署

仓库自带 `Dockerfile`，Railway / Render / Fly.io 都可以直接用：新建服务 → 连接本仓库 → 设置环境变量 `GEMINI_API_KEY`、`EVEROS_API_KEY` → 部署。
