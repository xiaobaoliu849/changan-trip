import { useEffect, useMemo, useRef, useState } from 'react'
import {
  STOPS, api, nextRunNo, pushLocalLog, resetPlayer,
  type Brief, type Hero, type StopId, type StopResult,
} from './api'
import {
  cutOutWhite, fileToBase64, loadImage, playMusic, playVoice, setMuted, speakBrowser, stopVoice, voiceTicket,
  type Track,
} from './media'
import Xiaoyong, { Notebook } from './components/Xiaoyong'
import Passport from './components/Passport'
import Credits from './components/Credits'
import GameCanvas from './games/GameCanvas'
import type { Assets, GameFactory } from './games/engine'
import { catchFood } from './games/catchFood'
import { findMover } from './games/findMover'
import { wallRide } from './games/wallRide'
import { bellRhythm } from './games/bellRhythm'
import { lanternBalance } from './games/lanternBalance'

const GAMES: Record<StopId, GameFactory> = {
  zhonglou: bellRhythm,
  huiminjie: catchFood,
  bingmayong: findMover,
  chengqiang: wallRide,
  datang: lanternBalance,
}

// Pre-made clips in public/assets/voice/ speak these exact lines; regenerate with `python -m backend.make_voice` (keep LINES there in sync).
// Bump VOICE_VERSION after regenerating so browsers drop cached old clips.
const VOICE_VERSION = 3
const clip = (name: string) => `/assets/voice/vo_${name}.mp3?v=${VOICE_VERSION}`
const OPENING_LINE = '俺叫小俑，第一次出坑！你是谁呀？没事，俺会记住你的。'
const DEFAULT_LINES: Record<StopId, string> = {
  zhonglou: '这是钟楼，六百多岁，比俺年轻多了。跟着钟声敲，可别吵醒全城。',
  huiminjie: '回民街到啦！客人点啥你就接啥，接到辣子赶紧喝水。',
  bingmayong: '这是俺老家！俺那帮老战友里，总有一个偷偷动了一下。',
  chengqiang: '城墙一圈十三点七四公里，骑上车，躲开游客和自拍杆！',
  datang: '大唐不夜城比俺那会儿还亮堂，头顶的灯笼可稳住喽。',
}

const DEFAULT_HERO: Hero = {
  name: '小黄',
  title: '雨衣背包客',
  catchphrase: '先拍照，再吃饭！',
  traits: ['爱拍照', '爱吃'],
  look: 'young backpacker with a camera, yellow raincoat',
  prompt: '穿黄雨衣、挂着相机的背包客',
}

const WAIT_LINES = ['俺在捏你的泥人……', '俺两千年没干过这活了，稍等……', '俺在给你上色……快好了！']
const LIVES = 3

type Screen = 'home' | 'making' | 'greet' | 'intro' | 'play' | 'result' | 'final'
const SCREEN_MUSIC: Record<Screen, Track> = {
  home: 'town', making: 'town', greet: 'town', intro: 'town', result: 'town', play: 'game', final: 'finale',
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<{ b64: string; mime: string; url: string } | null>(null)
  const [error, setError] = useState('')
  const [hero, setHero] = useState<Hero | null>(null)
  const [sprite, setSprite] = useState('')
  const [brief, setBrief] = useState<Brief | null>(null)
  const [runNo, setRunNo] = useState(0)
  const [runId, setRunId] = useState('')
  const [step, setStep] = useState(0)
  const [lives, setLives] = useState(LIVES)
  const [stamps, setStamps] = useState<StopId[]>([])
  const [log, setLog] = useState<string[]>([])
  const [result, setResult] = useState<StopResult | null>(null)
  const [snapshot, setSnapshot] = useState<string>()
  const [assets, setAssets] = useState<Assets | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [muted, setMute] = useState(false)
  const [waitLine, setWaitLine] = useState(0)
  const [said, setSaid] = useState('')
  const [ending, setEnding] = useState<{ journal: string; comment: string } | null>(null)
  const [endBusy, setEndBusy] = useState(false)
  const [postcard, setPostcard] = useState('')
  const [postcardBusy, setPostcardBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const route = brief?.route ?? []
  const stop = route[step]
  const firstVisit = true

  useEffect(() => {
    if (screen === 'home') resetPlayer()
    playMusic(SCREEN_MUSIC[screen])
  }, [screen])

  useEffect(() => {
    if (screen !== 'making') return
    const id = setInterval(() => setWaitLine((n) => (n + 1) % WAIT_LINES.length), 2500)
    return () => clearInterval(id)
  }, [screen])

  const say = async (src: string | Promise<string>) => {
    setSpeaking(true)
    try {
      await playVoice(await src)
    } catch {
      /* voice is a bonus; text is always shown */
    }
    setSpeaking(false)
  }

  const sayText = async (line: string) => {
    const ticket = voiceTicket()
    setSpeaking(true)
    try {
      const { audio } = await api.tts(line)
      if (ticket === voiceTicket()) await playVoice(audio)
    } catch {
      if (ticket === voiceTicket()) await speakBrowser(line)
    }
    setSpeaking(false)
  }

  const startRun = async (h: Hero, rawSprite: string) => {
    const no = nextRunNo()
    setRunNo(no)
    setRunId(`run_${Date.now()}`)
    setStep(0)
    setLives(LIVES)
    setStamps([])
    setLog([])
    setEnding(null)
    setPostcard('')
    setSaid('')
    setSnapshot(undefined)
    const [cut, b] = await Promise.all([
      cutOutWhite(rawSprite),
      api.brief(h, no).catch((): Brief => ({
        greeting: OPENING_LINE,
        recalled: [], route: ['huiminjie', 'bingmayong', 'chengqiang', 'datang'],
        food_order: ['roujiamo', 'biangbiang', 'liangpi'], spicy_tease: false, wall_warn: '',
        stop_lines: {}, memory_source: 'none',
      })),
    ])
    setHero(h)
    setSprite(cut)
    setBrief(b)
    setScreen('greet')
    // The pre-made clip only when it says exactly what is on screen.
    if (b.greeting === OPENING_LINE) say(clip('opening'))
    else sayText(b.greeting)
  }

  const create = async (useDefault = false) => {
    setError('')
    resetPlayer()
    setScreen('making')
    try {
      if (useDefault) {
        await startRun(DEFAULT_HERO, '/assets/img/default_hero.jpg')
        return
      }
      const r = await api.hero(text, photo ?? undefined)
      await startRun(r.hero, r.sprite)
    } catch (e) {
      setError(`生成失败了：${e instanceof Error ? e.message.slice(0, 120) : e}`)
      setScreen('home')
    }
  }

  const replay = async () => {
    if (!hero) return
    setScreen('making')
    stopVoice()
    await startRun(hero, sprite)
  }

  const goStop = async () => {
    if (!stop || !hero) return
    const [bg, heroImg, xy] = await Promise.all([
      loadImage(`/assets/img/bg_${stop}.jpg`),
      loadImage(sprite),
      loadImage('/assets/img/xiaoyong.png'),
    ])
    setAssets({ bg, hero: heroImg, xiaoyong: xy })
    setScreen('intro')
    const line = brief?.stop_lines[stop]
    if (line) sayText(line)
    else say(clip(stop))
  }

  const onDone = (r: StopResult) => {
    if (!stop || !hero) return
    setResult(r)
    if (r.snapshot && (r.passed || !snapshot)) setSnapshot(r.snapshot)
    const line = `${STOPS[stop].name}：${r.detail}`
    setLog((l) => [...l, line])
    pushLocalLog(`第${runNo}次游西安，${hero.name}在${line}`)
    if (r.passed) setStamps((s) => [...s, stop])
    else setLives((n) => n - 1)
    api.stop(runId, runNo, hero, stop, r).catch(() => undefined)
    setScreen('result')
  }

  const next = () => {
    const out = lives <= 0 || step + 1 >= route.length
    if (out) {
      setScreen('final')
      say(clip('dayanta'))
    } else {
      setStep(step + 1)
      setScreen('greet')
    }
  }

  useEffect(() => {
    if (screen === 'greet' && step > 0) goStop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, step])

  const finishRun = async () => {
    if (!hero) return
    setEndBusy(true)
    const stampNames = stamps.map((s) => STOPS[s].stamp + '章')
    if (said.trim()) pushLocalLog(`旅人对小俑说：${said.trim()}`)
    try {
      const r = await api.runEnd(runId, runNo, hero, stampNames, log, said)
      setEnding(r)
      sayText(r.journal)
    } catch {
      setEnding({ journal: '今天俺陪你逛了长安，都记在小本本上啦。下回你来，俺还认得你。', comment: '长安记得你' })
    }
    setEndBusy(false)
  }

  const makePostcard = async () => {
    if (!hero) return
    setPostcardBusy(true)
    try {
      setPostcard((await api.postcard(hero, sprite)).image)
    } catch {
      setPostcard('')
    }
    setPostcardBusy(false)
  }

  const options = useMemo(
    () => ({ food_order: brief?.food_order, spicy_tease: brief?.spicy_tease, wall_warn: brief?.wall_warn }),
    [brief],
  )

  const toggleMute = () => {
    const nextMuted = !muted
    setMuted(nextMuted)
    setMute(nextMuted)
    if (nextMuted) setSpeaking(false)
  }

  const handleStopVoice = () => {
    stopVoice()
    setSpeaking(false)
  }

  const playWithUnmute = (fn: () => void) => {
    if (muted) {
      setMuted(false)
      setMute(false)
    }
    fn()
  }

  const homeLine = firstVisit
    ? '俺在坑里站了两千两百年，今天第一次出门！你是谁呀？用一句话告诉俺。'
    : '咦，你好像来过？俺翻翻小本本……先告诉俺你今天长啥样。'

  return (
    <div className="app">
      <button
        type="button"
        className={`mute ${muted ? 'is-muted' : 'is-active'} ${speaking && !muted ? 'is-speaking' : ''}`}
        onClick={toggleMute}
        aria-label={muted ? '开启声音' : '静音'}
        title={muted ? '点击开启声音' : '点击静音'}
      >
        {muted ? (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 5L6 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l5 4V5z" fill="currentColor" fillOpacity="0.18" />
            <line x1="22" y1="9" x2="16" y2="15" />
            <line x1="16" y1="9" x2="22" y2="15" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 5L6 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l5 4V5z" fill="currentColor" fillOpacity="0.2" />
            <path className="wave wave-1" d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path className="wave wave-2" d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
      </button>

      {screen === 'home' && (
        <div className="screen home">
          <div className="event-header">
            <span className="event-badge">WaytoAGI 1024 切磋大会 · 游戏赛道</span>
            <span className="venue-badge">📍 西安曲江京东MALL</span>
          </div>
          <h1>
            长安记得你
            <small>陪一个健忘的兵马俑逛西安</small>
          </h1>
          <Xiaoyong
            mood={firstVisit ? 'confused' : 'happy'}
            speaking={speaking}
            onPlay={() => playWithUnmute(() => sayText(homeLine))}
            onStop={handleStopVoice}
            text={homeLine}
          />
          <div className="onboard-steps" aria-label="游玩指南">
            <div className="ob-step">
              <span className="ob-num">1</span>
              <div>
                <b>选定主角</b>
                <small>默认秒开 / AI捏人</small>
              </div>
            </div>
            <span className="ob-arrow">→</span>
            <div className="ob-step">
              <span className="ob-num">2</span>
              <div>
                <b>连闯 4 站</b>
                <small>小游戏集长安印章</small>
              </div>
            </div>
            <span className="ob-arrow">→</span>
            <div className="ob-step ob-final">
              <span className="ob-num">🏁</span>
              <div>
                <b>终点大雁塔</b>
                <small>领通关文牒·京东MALL</small>
              </div>
            </div>
          </div>
          <div className="card">
            <button className="btn fast-start" onClick={() => create(true)}>
              <span className="fast-badge">⚡ 秒开免等待</span>
              <span>用默认主角「小黄」直接出发 →</span>
            </button>
            <div className="divider">
              <span>或者用 AI 定制你的专属泥人（约 25 秒）</span>
            </div>
            <label>一句话描述你的旅行主角</label>
            <textarea
              value={text}
              maxLength={60}
              placeholder="例：背着单反、怕辣的上海女孩 / 一只戴墨镜的橘猫"
              onChange={(e) => setText(e.target.value)}
            />
            <div className="row">
              <button className="btn ghost" onClick={() => fileRef.current?.click()}>
                {photo ? '📷 已选照片' : '📷 或者传张照片'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (f) setPhoto(await fileToBase64(f))
                }}
              />
              <button className="btn" disabled={!text.trim() && !photo} onClick={() => create()}>
                ✨ 生成并出发 →
              </button>
            </div>
            {photo && <img className="thumb" src={photo.url} alt="照片" />}
            {error && <p className="error">{error}</p>}
          </div>
          <p className="tip">🔊 建议开启声音 · 点击对话气泡可重听语音 · 手机电脑皆可玩</p>
          <Credits />
        </div>
      )}

      {screen === 'making' && (
        <div className="screen center">
          <img className="spin" src="/assets/img/xiaoyong_confused.png" alt="" />
          <p className="wait">{WAIT_LINES[waitLine]}</p>
        </div>
      )}

      {screen === 'greet' && hero && brief && step === 0 && (
        <div className="screen greet">
          <div className="hero-card">
            <img src={sprite} alt={hero.name} />
            <div>
              <h2>{hero.name}</h2>
              <p className="title">{hero.title}</p>
              <p className="quote">「{hero.catchphrase}」</p>
            </div>
          </div>
          <Xiaoyong
            mood={brief.recalled.length ? 'happy' : 'confused'}
            text={brief.greeting}
            speaking={speaking}
            onPlay={() =>
              playWithUnmute(() => {
                if (brief.greeting === OPENING_LINE) say(clip('opening'))
                else sayText(brief.greeting)
              })
            }
            onStop={handleStopVoice}
          />
          <Notebook items={brief.recalled} source={brief.memory_source} />
          <div className="map">
            <img src="/assets/img/map.jpg" alt="西安地图" />
            <ol className="route">
              {route.map((s, i) => (
                <li key={s}>
                  <span>{i + 1}</span>
                  {STOPS[s].name}
                </li>
              ))}
              <li className="route-final">
                <span>🏁</span>
                终点：大雁塔（曲江京东MALL旁）
              </li>
            </ol>
          </div>
          <button className="btn big" onClick={goStop}>
            第一站：{stop ? STOPS[stop].name : ''} →
          </button>
        </div>
      )}

      {screen === 'intro' && stop && assets && (
        <div className="screen intro" style={{ backgroundImage: `url(/assets/img/bg_${stop}.jpg)` }}>
          <div className="intro-inner">
            <div className="stop-tag">
              第 {step + 1} 站 · {STOPS[stop].name}
            </div>
            <Xiaoyong
              text={brief?.stop_lines[stop] || DEFAULT_LINES[stop]}
              speaking={speaking}
              onPlay={() =>
                playWithUnmute(() => {
                  const line = brief?.stop_lines[stop]
                  if (line) sayText(line)
                  else say(clip(stop))
                })
              }
              onStop={handleStopVoice}
            />
            <div className="card how">
              <b>玩法</b>
              <p>{STOPS[stop].hint}</p>
              <p className="lives">体力 {'❤️'.repeat(lives)}</p>
            </div>
            <button
              className="btn big"
              onClick={() => {
                stopVoice()
                setScreen('play')
              }}
            >
              开始！
            </button>
          </div>
        </div>
      )}

      {screen === 'play' && stop && assets && (
        <div className="screen play">
          <div className="play-hint">{STOPS[stop].hint}</div>
          <GameCanvas factory={GAMES[stop]} assets={assets} options={options} onDone={onDone} />
        </div>
      )}

      {screen === 'result' && stop && result && (
        <div className="screen center result">
          {result.passed ? (
            <div className="seal big on">{STOPS[stop].stamp}</div>
          ) : (
            <img className="fail-img" src="/assets/img/xiaoyong_confused.png" alt="" />
          )}
          <h2>{result.passed ? `${STOPS[stop].name} · 盖章！` : `${STOPS[stop].name} · 没过去`}</h2>
          <p className="detail">{result.detail}</p>
          <p className="saved">📒 小俑记下了</p>
          {!result.passed && <p className="lives">体力 {'❤️'.repeat(Math.max(0, lives))}</p>}
          <button className="btn big" onClick={next}>
            {lives <= 0 ? '体力用完了，赶末班地铁去大雁塔 →' : step + 1 >= route.length ? '去终点大雁塔 →' : `下一站：${STOPS[route[step + 1]].name} →`}
          </button>
        </div>
      )}

      {screen === 'final' && hero && (
        <div className="screen final" style={{ backgroundImage: 'url(/assets/img/bg_dayanta.jpg)' }}>
          <div className="final-inner">
            <h2>终点 · 大雁塔</h2>
            <div className="final-venue">📍 大雁塔旁 · 西安曲江京东MALL（WaytoAGI 1024 主会场）</div>
            {!ending ? (
              <>
                <Xiaoyong
                  mood="happy"
                  speaking={speaking}
                  onPlay={() => playWithUnmute(() => say(clip('dayanta')))}
                  onStop={handleStopVoice}
                  text="大雁塔到了，咱今天这趟没白走。临走前，有啥想对俺说的？俺记小本本上，下回你来，俺还认得你。"
                />
                <div className="card">
                  <input value={said} maxLength={50} placeholder="对小俑说一句话（可以不填）" onChange={(e) => setSaid(e.target.value)} />
                  <button className="btn" onClick={finishRun} disabled={endBusy}>
                    {endBusy ? '小俑在写游记…' : '写进小本本 →'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <Xiaoyong
                  mood="happy"
                  speaking={speaking}
                  onPlay={() => playWithUnmute(() => sayText(ending.journal))}
                  onStop={handleStopVoice}
                  text={ending.journal}
                />
                <Passport
                  hero={hero}
                  sprite={sprite}
                  inGame={snapshot}
                  stamps={stamps}
                  comment={ending.comment}
                  runNo={runNo}
                  photo={photo?.url}
                />
                <div className="card postcard">
                  {postcard ? (
                    <img src={postcard} alt="合影明信片" />
                  ) : (
                    <button className="btn ghost" onClick={makePostcard} disabled={postcardBusy}>
                      {postcardBusy ? '正在画合影…（约 1 分钟）' : '🖼 和小俑在大雁塔合个影'}
                    </button>
                  )}
                </div>
                <div className="row">
                  <button className="btn big" onClick={replay}>
                    再游一次（小俑会记得这次）
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => {
                      stopVoice()
                      resetPlayer()
                      setText('')
                      setPhoto(null)
                      setScreen('home')
                    }}
                  >
                    换个主角
                  </button>
                </div>
                <Credits />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
