import { useEffect, useMemo, useRef, useState } from 'react'
import {
  STOPS, api, localLog, nextRunNo, pushLocalLog,
  type Brief, type Hero, type StopId, type StopResult,
} from './api'
import { cutOutWhite, fileToBase64, loadImage, playVoice, setMuted, stopVoice } from './media'
import Xiaoyong, { Notebook } from './components/Xiaoyong'
import Passport from './components/Passport'
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
  const firstVisit = localLog().length === 0

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

  const sayText = (line: string) => say(api.tts(line).then((r) => r.audio))

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
        greeting: '俺叫小俑，第一次出坑！没事，俺会记住你的。',
        recalled: [], route: ['huiminjie', 'bingmayong', 'chengqiang', 'datang'],
        food_order: ['roujiamo', 'biangbiang', 'liangpi'], spicy_tease: false, wall_warn: '',
        stop_lines: {}, memory_source: 'none',
      })),
    ])
    setHero(h)
    setSprite(cut)
    setBrief(b)
    setScreen('greet')
    if (no === 1 && b.memory_source === 'none') say('/assets/voice/vo_opening.mp3')
    else sayText(b.greeting)
  }

  const create = async (useDefault = false) => {
    setError('')
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
    say(`/assets/voice/vo_${stop}.mp3`)
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
      say('/assets/voice/vo_dayanta.mp3')
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
    setMuted(!muted)
    setMute(!muted)
  }

  return (
    <div className="app">
      <button className="mute" onClick={toggleMute} aria-label="静音">
        {muted ? '🔇' : '🔊'}
      </button>

      {screen === 'home' && (
        <div className="screen home">
          <h1>
            长安记得你
            <small>陪一个健忘的兵马俑逛西安</small>
          </h1>
          <Xiaoyong
            mood={firstVisit ? 'confused' : 'happy'}
            text={firstVisit ? '俺在坑里站了两千两百年，今天第一次出门！你是谁呀？用一句话告诉俺。' : '咦，你好像来过？俺翻翻小本本……先告诉俺你今天长啥样。'}
          />
          <div className="card">
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
                出发 →
              </button>
            </div>
            {photo && <img className="thumb" src={photo.url} alt="照片" />}
            <button className="link" onClick={() => create(true)}>
              懒得想？用默认主角直接玩
            </button>
            {error && <p className="error">{error}</p>}
          </div>
          <p className="tip">游戏有语音，建议开声音 · 手机和电脑都能玩</p>
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
          <Xiaoyong mood={brief.recalled.length ? 'happy' : 'confused'} text={brief.greeting} speaking={speaking} />
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
            <Xiaoyong text={brief?.stop_lines[stop] || DEFAULT_LINES[stop]} speaking={speaking} />
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
            {!ending ? (
              <>
                <Xiaoyong
                  mood="happy"
                  speaking={speaking}
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
                <Xiaoyong mood="happy" speaking={speaking} text={ending.journal} />
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
                      {postcardBusy ? '正在画合影…（约 15 秒）' : '🖼 和小俑在大雁塔合个影'}
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
                      setScreen('home')
                    }}
                  >
                    换个主角
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
