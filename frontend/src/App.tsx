import { useEffect, useMemo, useRef, useState } from 'react'
import {
  STOPS, api, nextRunNo, pushLocalLog, resetPlayer, runCount, saveTraveler, savedTraveler,
  type Brief, type Hero, type StopId, type StopResult, type Traveler,
} from './api'
import {
  cutOutWhite, fileToBase64, loadImage, playMusic, playVoice, setMuted, speakBrowser, stopVoice, voiceTicket,
  type Track,
} from './media'
import Xiaoyong, { Notebook } from './components/Xiaoyong'
import Passport, { type Shot } from './components/Passport'
import Credits from './components/Credits'
import Prologue, { type Met } from './components/Prologue'
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
const VOICE_VERSION = 9
const clip = (name: string) => `/assets/voice/vo_${name}.mp3?v=${VOICE_VERSION}`
// Whispered from the pit before the traveler has met 小俑.
const HOME_LINE = '两千两百年了……今天，会有人带我出去看看吗？'
const OPENING_LINE = '原来你是这个样子！我叫小俑，今天跟你出门。你去哪我去哪，我都记小本本上。'
// 再游一次 when no memory-based greeting could be written: the traveler is back at the pit for 小俑.
const AGAIN_LINE = '又是你！我在坑里一直等着呢。走，接着带我出去逛！'
const FINAL_LINE = '大雁塔到了！谢谢你带我出来开眼。天亮前我要回坑里站好，临走前，有啥想对我说的？我记小本本上。'
// At each stop the traveler shows 小俑 the place (YOU_LINES, text only) and 小俑 reacts (voiced).
// 小俑 never plays tour guide: it's the one seeing everything for the first time.
// Pre-made clips mispronounce polyphones (行家 came out xíngjiā), so keep 行/长/了/得/当/朝 out of voiced lines.
const YOU_LINES: Record<StopId, string> = {
  bingmayong: '出发前，跟你的老战友们道个别？',
  chengqiang: '这是西安城墙，明朝修的，一圈 13.74 公里。',
  zhonglou: '这是钟楼，六百多岁了。从前钟一响，全城起床。',
  huiminjie: '回民街到了，西安最有名的小吃街！',
  datang: '大唐不夜城，晚上比白天还亮。',
}
const DEFAULT_LINES: Record<StopId, string> = {
  bingmayong: '糟了，他们也想溜出来！找出偷偷动的那个，把它按回去。',
  chengqiang: '比我年轻一千五百多岁！我坐车筐里，你骑！',
  zhonglou: '才六百岁？小娃娃嘛！你来敲，我捂耳朵。',
  huiminjie: '我是泥做的，不能吃……我点菜，你替我吃！辣子可别碰！',
  datang: '我那会儿晚上可没这么亮！你顶灯笼，我给你喊号子。',
}
// 小俑's reaction starts a moment after the intro appears, so the traveler's line is read first.
const INTRO_DELAY = 700

// 小俑问你: after each stop 小俑 asks about something modern; tapping an answer is also "next stop".
// It believes whatever it is told, and the answer goes into its memory for the journal and the next trip.
// Each question and reply has a pre-made clip: vo_q_<stop>.mp3 and vo_a_<stop>_<answer index>.mp3.
const QUESTIONS: Record<StopId, { q: string; answers: { say: string; reply: string }[] }> = {
  bingmayong: {
    q: '外面的人咋都不穿铠甲？不打仗了？',
    answers: [
      { say: '现在太平，不打仗啦', reply: '太平好！那我这身铠甲……改成睡衣吧。' },
      { say: '铠甲在洗衣机里洗呢', reply: '洗衣机？那是啥兵器？我记小本本上了！' },
    ],
  },
  chengqiang: {
    q: '那些人举着棍子对自己笑，是在施法吗？',
    answers: [
      { say: '那叫自拍杆，拍照用的', reply: '自拍杆……我也想要一根！' },
      { say: '对，长安独门法术', reply: '我就知道！回去教给老战友。' },
    ],
  },
  zhonglou: {
    q: '现在钟不响了，大家咋知道起床？',
    answers: [
      { say: '手机闹钟会叫', reply: '会发光的竹简还会喊人起床？厉害！' },
      { say: '西安人根本不起床', reply: '那我也不起了，明天睡到晌午！' },
    ],
  },
  huiminjie: {
    q: '肉夹馍，到底是肉夹馍，还是馍夹肉？',
    answers: [
      { say: '是「肉夹于馍」，古汉语', reply: '古汉语？那我熟啊，早该听懂的！' },
      { say: '别问，吃就完了', reply: '有道理！可我是泥做的，只能闻闻。' },
    ],
  },
  datang: {
    q: '这么亮，晚上谁睡觉啊？',
    answers: [
      { say: '灯是给游客看的', reply: '那我今天也是游客啦！头一回当游客。' },
      { say: '西安人晚上不睡觉', reply: '难怪钟楼的钟退休了！' },
    ],
  },
}
// After an answer the trip moves on by itself, but only once 小俑's reply has been heard (or, muted,
// read): at least REPLY_MIN, then the next-stop button fills up for AUTO_GO.
const REPLY_MIN = 1800
const AUTO_GO = 1200

const DEFAULT_HERO: Hero = {
  name: '小黄',
  title: '雨衣背包客',
  catchphrase: '先拍照，再吃饭！',
  traits: ['爱拍照', '爱吃'],
  look: 'young backpacker with a camera, yellow raincoat',
  prompt: '穿黄雨衣、挂着相机的背包客',
}

// Where each stop sits on map.jpg (pixels of the 1376×768 image), for the route pins.
const MAP_W = 1376
const MAP_H = 768
type Place = StopId | 'dayanta'
const PLACES: Record<Place, { x: number; y: number; icon: string }> = {
  zhonglou: { x: 680, y: 262, icon: '🔔' },
  huiminjie: { x: 500, y: 215, icon: '🍜' },
  bingmayong: { x: 1232, y: 385, icon: '⚔️' },
  chengqiang: { x: 1070, y: 258, icon: '🚲' },
  datang: { x: 170, y: 515, icon: '🏮' },
  dayanta: { x: 603, y: 555, icon: '🏯' },
}

// Same order as ROUTE in backend/main.py: every run visits all five stops, ending next to 大雁塔.
const ROUTE: StopId[] = ['bingmayong', 'chengqiang', 'zhonglou', 'huiminjie', 'datang']

// After the prologue, while the hero is still being drawn: 小俑 is getting a good look at the traveler.
const WAIT_LINES = ['我揉揉眼睛，好好看看你……', '两千年没见过新面孔，再看一眼……', '嗯……你的样子我记住了，马上好！']
// 再游一次 keeps the same hero; the wait is 小俑 recalling the last trip, not drawing anyone.
const RECALL_LINES = ['咦，脚步声……是你回来接我了？', '我翻翻小本本……', '想想你上回在哪摔的跤……']
const LIVES = 3
// One-tap things to tell 小俑 at the finish, so nobody has to type on a phone.
const QUICK_SAYS = ['下回再带你出来玩！', '下次带你去吃泡馍', '回坑里可别乱动哦', '你可别把我忘了']
// Tap-to-fill traveler descriptions on 首页, so nobody has to think up one on a phone keyboard.
const EXAMPLES = ['背着单反、怕辣的上海女孩', '戴墨镜的橘猫', '第一次来西安的程序员', '爱吃碳水的东北大哥']

type Screen = 'home' | 'prologue' | 'making' | 'greet' | 'intro' | 'play' | 'result' | 'final'
const SCREEN_MUSIC: Record<Screen, Track> = {
  home: 'town', prologue: 'town', making: 'town', greet: 'town', intro: 'town', result: 'town', play: 'game', final: 'finale',
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
  // Stamps from the previous trip of this hero (null on a new hero), shown on the route and while recalling.
  const [lastStamps, setLastStamps] = useState<StopId[] | null>(null)
  // Custom subset of stops when the player chooses specific level(s) to make up missing badges (补章) or replay.
  const [todoStops, setTodoStops] = useState<StopId[] | null>(null)
  // Selected stop on the map screen for direct jump.
  const [pickedStop, setPickedStop] = useState<StopId | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [result, setResult] = useState<StopResult | null>(null)
  // A clean frame from each stop's game; the traveler picks one for the passport.
  const [shots, setShots] = useState<Shot[]>([])
  const [assets, setAssets] = useState<Assets | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [muted, setMute] = useState(false)
  const [waitLine, setWaitLine] = useState(0)
  const [said, setSaid] = useState('')
  const [ending, setEnding] = useState<{ journal: string; comment: string } | null>(null)
  const [endBusy, setEndBusy] = useState(false)
  const [postcard, setPostcard] = useState('')
  const [postcardBusy, setPostcardBusy] = useState(false)
  // The run's hero and brief are loaded; the trip starts once the prologue (if any) is over too.
  const [ready, setReady] = useState(false)
  const [met, setMet] = useState<Met | null>(null)
  // A traveler from an earlier visit (kept in localStorage), and whether this player said they are someone new.
  const [saved, setSaved] = useState<Traveler | null>(savedTraveler)
  const [newcomer, setNewcomer] = useState(false)
  // 出发 tapped with nothing to draw from: point at the box instead of a dead disabled button.
  const [nudge, setNudge] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [answer, setAnswer] = useState<number | null>(null)
  const [replyDone, setReplyDone] = useState(false)
  const answerTimer = useRef(0)
  // 小俑's intro line, due INTRO_DELAY after the intro opens; dropped if the intro is left first.
  const introTimer = useRef(0)
  // Guards async image loads in goStop against rapid clicks or returning to 首页.
  const navTicket = useRef(0)
  // Which answer's reply is still playing (`${runId}:${step}`), so a late reply can't move the trip on.
  const pendingReply = useRef('')
  const fileRef = useRef<HTMLInputElement>(null)

  const route = brief?.route ?? ROUTE
  const activeRoute = todoStops ?? route
  const missingStamps = useMemo(() => route.filter((s) => !stamps.includes(s)), [route, stamps])
  // 首页 greets a remembered traveler back, unless they said they are someone new.
  const welcomeBack = saved && !newcomer ? saved : null
  const stop = activeRoute[step]

  useEffect(() => {
    playMusic(SCREEN_MUSIC[screen])
    if (screen === 'home') {
      setSaved(savedTraveler())
      setNewcomer(false)
      setNudge(false)
    }
  }, [screen])

  // Remember the traveler and this trip's stamps, so 首页 can greet them back next time.
  useEffect(() => {
    if (hero && sprite && runId) saveTraveler({ hero, sprite, stamps })
  }, [hero, sprite, runId, stamps])

  // Ctrl+V a copied image anywhere on the home screen to use it as the photo.
  useEffect(() => {
    if (screen !== 'home') return
    const onPaste = async (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (!file) return
      e.preventDefault()
      setPhoto(await fileToBase64(file))
    }
    addEventListener('paste', onPaste)
    return () => removeEventListener('paste', onPaste)
  }, [screen])

  useEffect(() => {
    if (screen !== 'making') return
    const id = setInterval(() => setWaitLine((n) => (n + 1) % WAIT_LINES.length), 2500)
    return () => clearInterval(id)
  }, [screen])

  // Only the latest line clears "speaking": a line that a newer one cut off ends while the newer one plays.
  const lineNo = useRef(0)

  const say = async (src: string | Promise<string>) => {
    const no = ++lineNo.current
    setSpeaking(true)
    try {
      await playVoice(await src)
    } catch {
      /* voice is a bonus; text is always shown */
    }
    if (no === lineNo.current) setSpeaking(false)
  }

  const sayText = async (line: string) => {
    const no = ++lineNo.current
    const ticket = voiceTicket()
    setSpeaking(true)
    try {
      const { audio } = await api.tts(line)
      if (ticket === voiceTicket()) await playVoice(audio)
    } catch {
      if (ticket === voiceTicket()) await speakBrowser(line)
    }
    if (no === lineNo.current) setSpeaking(false)
  }

  // The pre-made clip only when it says exactly what is on screen.
  const sayGreeting = (greeting: string) =>
    greeting === OPENING_LINE ? say(clip('opening')) : greeting === AGAIN_LINE ? say(clip('again')) : sayText(greeting)

  const startRun = async (h: Hero, rawSprite: string, initialStamps: StopId[] = [], keepShots = false) => {
    const no = nextRunNo()
    setRunNo(no)
    setRunId(`run_${Date.now()}`)
    setTodoStops(null)
    setPickedStop(null)
    setStep(0)
    setLives(LIVES)
    setStamps(initialStamps)
    setLog([])
    setEnding(null)
    setPostcard('')
    setSaid('')
    if (!keepShots) setShots([])
    const [cut, b] = await Promise.all([
      cutOutWhite(rawSprite),
      api.brief(h, no).catch((): Brief => ({
        greeting: no > 1 ? AGAIN_LINE : OPENING_LINE,
        recalled: [], route: ROUTE,
        food_order: ['roujiamo', 'biangbiang', 'liangpi'], spicy_tease: false, wall_warn: '',
        stop_lines: {}, memory_source: 'none',
      })),
    ])
    setHero(h)
    setSprite(cut)
    setBrief(b)
    setReady(true)
  }

  // Show the run once it is loaded and nothing is in front of it (the prologue hands over to 'making').
  useEffect(() => {
    if (!ready || screen !== 'making' || !brief || !hero) return
    setScreen('greet')
    if (met) {
      const line = `${hero.name}在兵马俑坑里第一个发现小俑会动，${met === 'talk' ? '吓了一跳：「你会说话？！」，然后' : '二话不说就'}答应带小俑出去逛长安`
      pushLocalLog(line)
      api.note(runId, line, 'user').catch(() => undefined)
      setMet(null)
    }
    sayGreeting(brief.greeting)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, screen])

  const create = async (useDefault = false) => {
    if (!useDefault && !text.trim() && !photo) {
      setNudge(true)
      textRef.current?.focus()
      return
    }
    setError('')
    // A new traveler: 小俑 has never met them, so drop the old player's memory.
    resetPlayer()
    setSaved(null)
    setHero(null)
    setSprite('')
    setLastStamps(null)
    setReady(false)
    setMet(null)
    // A new traveler meets 小俑 in the pit while their hero is drawn.
    setScreen('prologue')
    try {
      if (useDefault) {
        await startRun(DEFAULT_HERO, '/assets/img/default_hero.jpg', [])
        return
      }
      const r = await api.hero(text, photo ?? undefined)
      await startRun(r.hero, r.sprite, [])
    } catch (e) {
      setError(`生成失败了：${e instanceof Error ? e.message.slice(0, 120) : e}`)
      setScreen('home')
    }
  }

  // 首页 → the remembered traveler comes back to the pit; same player, so 小俑 recalls the earlier trips.
  const resume = async () => {
    if (!saved) return
    setError('')
    stopVoice()
    setHero(saved.hero)
    setSprite(saved.sprite)
    setLastStamps(saved.stamps)
    setReady(false)
    setMet(null)
    setScreen('making')
    try {
      await startRun(saved.hero, saved.sprite, saved.stamps)
    } catch (e) {
      setError(`出发失败了：${e instanceof Error ? e.message.slice(0, 120) : e}`)
      setScreen('home')
    }
  }

  const replay = async () => {
    if (!hero) return
    setLastStamps(stamps)
    setReady(false)
    setScreen('making')
    stopVoice()
    await startRun(hero, sprite, stamps, true)
  }

  // Loads the stop's art, then opens its intro. `apply` moves the trip on (step, stamps, lives) in the same
  // render, so the screen being left never shows the next stop's name over its own result while images load.
  const goStop = async (s: StopId, apply: () => void) => {
    if (!hero) return
    const ticket = ++navTicket.current
    clearTimeout(introTimer.current)
    const [bg, heroImg, xy] = await Promise.all([
      loadImage(`/assets/img/bg_${s}.jpg`),
      loadImage(sprite),
      loadImage('/assets/img/xiaoyong.png'),
    ])
    if (ticket !== navTicket.current) return
    apply()
    setAssets({ bg, hero: heroImg, xiaoyong: xy })
    setScreen('intro')
    introTimer.current = window.setTimeout(() => sayStop(s), INTRO_DELAY)
  }

  // 选关: play just these stops (one picked stop, the ones still missing a stamp, or a retry) and then go to 大雁塔.
  const playStops = (targets: StopId[], resetStamps = false, nextLives = LIVES) => {
    if (!hero || targets.length === 0) return
    clearTimeout(answerTimer.current)
    pendingReply.current = ''
    stopVoice()
    return goStop(targets[0], () => {
      if (resetStamps) setStamps([])
      setTodoStops(targets)
      setStep(0)
      setLives(nextLives)
      setResult(null)
      setAnswer(null)
      setReplyDone(false)
    })
  }

  const sayStop = (s: StopId) => {
    const line = brief?.stop_lines[s]
    return line ? sayText(line) : say(clip(s))
  }

  const onDone = (r: StopResult) => {
    if (!stop || !hero) return
    setResult(r)
    if (r.snapshot) {
      // One photo per stop: a replay takes the old one's place, unless it would swap a cleared stop for a miss.
      const shot = { stop, src: r.snapshot, passed: r.passed }
      setShots((list) => {
        const old = list.find((s) => s.stop === stop)
        if (old?.passed && !r.passed) return list
        return old ? list.map((s) => (s === old ? shot : s)) : [...list, shot]
      })
    }
    // Game summaries call the player 你 (shown as is on the result screen); memory is told in the
    // third person, so the traveler is named there. Only catchFood uses 你 today.
    const told = r.detail.split('你').join(hero.name)
    const line = `${STOPS[stop].name}：${told}`
    setLog((l) => [...l, line])
    pushLocalLog(`第${runNo}次游西安，${hero.name}带小俑到了${line}`)
    if (r.passed) setStamps((s) => (s.includes(stop) ? s : [...s, stop]))
    else setLives((n) => n - 1)
    api.stop(runId, runNo, hero, stop, { ...r, detail: told }).catch(() => undefined)
    setAnswer(null)
    setReplyDone(false)
    setScreen('result')
    say(clip(`q_${stop}`))
  }

  const answerQuestion = (i: number) => {
    if (!stop || !hero || answer !== null) return
    const q = QUESTIONS[stop]
    setAnswer(i)
    const line = `在${STOPS[stop].name}，小俑问「${q.q}」，${hero.name}教它：「${q.answers[i].say}」`
    setLog((l) => [...l, line])
    pushLocalLog(`第${runNo}次游西安，${line}`)
    api.note(runId, `第${runNo}次游西安，${line}`, 'user').catch(() => undefined)
    const key = `${runId}:${step}`
    pendingReply.current = key
    Promise.all([say(clip(`a_${stop}_${i}`)), new Promise((r) => setTimeout(r, REPLY_MIN))]).then(() => {
      // Skip if the player already moved on, or went back to 首页.
      if (pendingReply.current !== key) return
      setReplyDone(true)
      answerTimer.current = window.setTimeout(next, AUTO_GO)
    })
  }

  useEffect(() => {
    if (screen !== 'intro') clearTimeout(introTimer.current)
  }, [screen])

  // Leaving the result screen any other way (首页, or tapping on) cancels the automatic move on.
  useEffect(() => {
    if (screen === 'result') return
    clearTimeout(answerTimer.current)
    pendingReply.current = ''
  }, [screen])

  const next = () => {
    clearTimeout(answerTimer.current)
    pendingReply.current = ''
    const out = lives <= 0 || step + 1 >= activeRoute.length
    if (out) {
      setScreen('final')
      // Back from 补章 after the journal was written: the passport just gains the new stamp and photo.
      if (!ending) say(clip('dayanta'))
    } else {
      const nextStep = step + 1
      goStop(activeRoute[nextStep], () => setStep(nextStep))
    }
  }

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
      setEnding({ journal: '今天你带我出坑逛了长安，我都记在小本本上啦。下回你再来坑里找我，我还认得你。', comment: '长安记得你' })
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

  // Back to the start screen; the home screen wipes this traveler, so ask first unless nothing is lost yet.
  const goHome = () => {
    if (screen !== 'greet' && !ending && !window.confirm('回到首页重新开始？这一趟的进度不会保留。')) return
    ++navTicket.current
    clearTimeout(introTimer.current)
    clearTimeout(answerTimer.current)
    pendingReply.current = ''
    stopVoice()
    setSpeaking(false)
    setText('')
    setPhoto(null)
    setScreen('home')
  }

  const sayHome = () => say(clip('home'))

  // Browsers allow sound only after the first tap or key press: greet right away when that has
  // already happened (e.g. back from 首页), otherwise on that first touch.
  useEffect(() => {
    // A returning traveler gets the welcome-back card, not the stranger's whisper.
    if (screen !== 'home' || welcomeBack) return
    let started = false
    const off = () => {
      removeEventListener('pointerdown', greet)
      removeEventListener('keydown', greet)
    }
    function greet(e?: Event) {
      if (started) return
      // A button does its own thing (start, mute, play the whisper), so wait for a tap that doesn't:
      // the line would only be cut off a moment later.
      if (e?.target instanceof Element && e.target.closest('button')) return
      started = true
      off()
      sayHome()
    }
    if (navigator.userActivation?.hasBeenActive) greet()
    else {
      addEventListener('pointerdown', greet)
      addEventListener('keydown', greet)
    }
    return () => {
      off()
      if (started) stopVoice()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, welcomeBack])

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

      {screen !== 'home' && screen !== 'prologue' && screen !== 'making' && (
        <button type="button" className="back" onClick={goHome} aria-label="回到首页" title="回到首页，重新开始">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          首页
        </button>
      )}

      {screen === 'home' && (
        <div className="screen home">
          {/* The traveler's view of the pit at closing time: 小俑 is still just a statue, whispering. */}
          <section className={`home-hero${speaking ? ' is-speaking' : ''}`}>
            <div className="hh-motes" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => (
                <i key={i} style={{ left: `${8 + i * 9}%`, animationDelay: `${(i * 1.7) % 7}s` }} />
              ))}
            </div>
            <div className="hh-title">
              <span className="hh-kicker">西安 · 兵马俑一号坑 · 闭馆后</span>
              <h1>长安记得你</h1>
              <p>带一个刚醒的兵马俑，逛一趟长安</p>
            </div>
            <button
              type="button"
              className="hh-statue"
              onClick={() => (speaking ? handleStopVoice() : welcomeBack ? undefined : playWithUnmute(sayHome))}
              aria-label={welcomeBack ? '小俑' : '听小俑小声嘀咕'}
            >
              <img src={welcomeBack ? '/assets/img/xiaoyong_happy.png' : '/assets/img/xiaoyong.png'} alt="" draggable={false} />
            </button>
            {welcomeBack ? (
              <p className="hh-whisper is-awake">又是你！我在坑里一直等着呢。</p>
            ) : (
              <button type="button" className="hh-whisper" onClick={() => (speaking ? handleStopVoice() : playWithUnmute(sayHome))}>
                「{HOME_LINE}」
                <span className="hh-play">{speaking ? '■ 停' : '▶ 听'}</span>
              </button>
            )}
          </section>

          <ol className="home-route" aria-label="今日路线">
            {[...ROUTE, 'dayanta' as const].map((p) => (
              <li key={p} className={p === 'dayanta' ? 'goal' : ''}>
                <span>{PLACES[p].icon}</span>
                {p === 'dayanta' ? '大雁塔' : STOPS[p].name}
              </li>
            ))}
          </ol>

          {welcomeBack ? (
            <div className="welcome-back">
              <div className="wb-who">
                <img src={welcomeBack.sprite} alt={welcomeBack.hero.name} />
                <div>
                  <small>小俑还记得你</small>
                  <b>{welcomeBack.hero.name}</b>
                  <span>
                    {welcomeBack.hero.title} · 带它出来过 {runCount() || 1} 次 · 已集 {welcomeBack.stamps.length}/{ROUTE.length} 个章
                  </span>
                </div>
              </div>
              <button type="button" className="btn big go" onClick={resume}>
                回坑里接小俑 →
              </button>
              <button type="button" className="link" onClick={() => setNewcomer(true)}>
                我是新来的旅人，重新开始
              </button>
              {error && <p className="error">{error}</p>}
            </div>
          ) : (
            <div className="ticket">
              <div className="tk-band">
                <span>长安一日游 · 入坑门票</span>
                <b>No.1024</b>
              </div>
              <div className="tk-body">
                <label htmlFor="traveler">你是个什么样的旅人？</label>
                <p className="tk-sub">写一句或传张照片，AI 把你画成 Q 版主角，小俑会一直记得你</p>
                <div className={`tk-input${nudge ? ' is-nudged' : ''}`}>
                  <textarea
                    id="traveler"
                    ref={textRef}
                    value={text}
                    maxLength={60}
                    placeholder="比如：背着单反、怕辣的上海女孩"
                    onChange={(e) => {
                      setText(e.target.value)
                      setNudge(false)
                    }}
                  />
                  <button type="button" className="tk-photo" onClick={() => fileRef.current?.click()}>
                    📷 {photo ? '换照片' : '传照片'}
                  </button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    e.target.value = '' // so picking the same file again still fires
                    if (f) {
                      setPhoto(await fileToBase64(f))
                      setNudge(false)
                    }
                  }}
                />
                {nudge && <p className="tk-nudge">先写一句你的样子，或者传张照片 ↑</p>}
                {photo ? (
                  <div className="photo-picked">
                    <img className="thumb" src={photo.url} alt="照片" />
                    <div>
                      <b>✓ 照片已选好</b>
                      <span>出发后把它画成 Q 版主角</span>
                    </div>
                    <button type="button" className="link" onClick={() => setPhoto(null)}>
                      移除
                    </button>
                  </div>
                ) : (
                  <div className="chips">
                    {EXAMPLES.map((t) => (
                      <button
                        type="button"
                        key={t}
                        className={`chip${text === t ? ' on' : ''}`}
                        onClick={() => {
                          setText(t)
                          setNudge(false)
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" className="btn big go" onClick={() => create()}>
                  出发，去兵马俑 →
                </button>
                <p className="tk-note">画像约 1 分钟，这期间你先进坑见小俑</p>
                <p className="paste-tip">💡 复制了图片？直接按 Ctrl+V 粘贴进来</p>
                {error && <p className="error">{error}</p>}
                <div className="tk-or">
                  <span>不想填？</span>
                </div>
                <button type="button" className="btn quick-play" onClick={() => create(true)}>
                  ⚡ 用默认主角「小黄」马上开玩
                </button>
                {saved && (
                  <button type="button" className="link" onClick={() => setNewcomer(false)}>
                    ← 还是我，{saved.hero.name}
                  </button>
                )}
              </div>
            </div>
          )}
          <Credits />
        </div>
      )}

      {screen === 'prologue' && (
        <Prologue
          speaking={speaking}
          say={(name) => say(clip(name))}
          onStop={handleStopVoice}
          onDone={(m) => {
            setMet(m)
            setScreen('making')
          }}
        />
      )}

      {screen === 'making' && (
        <div className="screen center">
          {lastStamps && hero ? (
            <>
              <div className="recall">
                <img className="recall-hero" src={sprite} alt={hero.name} />
                <img className="recall-xy" src="/assets/img/xiaoyong_happy.png" alt="" />
              </div>
              <p className="wait">{RECALL_LINES[waitLine]}</p>
              <p className="recall-note">
                还是你：{hero.name} · 已集 {lastStamps.length}/{ROUTE.length} 个章
              </p>
            </>
          ) : (
            <>
              <img className="spin" src="/assets/img/xiaoyong_happy.png" alt="" />
              <p className="wait">{WAIT_LINES[waitLine]}</p>
            </>
          )}
        </div>
      )}

      {screen === 'greet' && hero && brief && step === 0 && (
        <div className="screen greet">
          <div className="greet-head">第 {runNo} 次带小俑出门 · 今日行程</div>
          <div className="hero-card">
            <img src={sprite} alt={hero.name} />
            <div className="hero-info">
              <span className="hero-tag">今日主角</span>
              <h2>{hero.name}</h2>
              <p className="title">{hero.title}</p>
              <p className="quote">「{hero.catchphrase}」</p>
              {hero.traits.length > 0 && (
                <div className="traits">
                  {hero.traits.slice(0, 3).map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <Xiaoyong
            mood="happy"
            text={brief.greeting}
            speaking={speaking}
            onPlay={() => playWithUnmute(() => sayGreeting(brief.greeting))}
            onStop={handleStopVoice}
          />
          <Notebook items={brief.recalled} source={brief.memory_source} />
          <div className="map-card">
            <div className="map">
              <img src="/assets/img/map.jpg" alt="西安地图" />
              <svg className="map-path" viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="none" aria-hidden="true">
                <polyline
                  points={[...route, 'dayanta' as const].map((p) => `${PLACES[p].x},${PLACES[p].y}`).join(' ')}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {[...route, 'dayanta' as const].map((p, i) => {
                const style = {
                  left: `${(PLACES[p].x / MAP_W) * 100}%`,
                  top: `${(PLACES[p].y / MAP_H) * 100}%`,
                  animationDelay: `${0.3 + i * 0.15}s`,
                }
                if (p === 'dayanta') {
                  return (
                    <div key={p} className="pin goal" style={style} title="终点：大雁塔">
                      🏁
                    </div>
                  )
                }
                const isNext = pickedStop ? pickedStop === p : i === 0
                return (
                  <button
                    type="button"
                    key={p}
                    className={`pin is-clickable${isNext ? ' next' : ''}`}
                    style={style}
                    onClick={() => setPickedStop((prev) => (prev === p ? null : p))}
                    aria-label={`选「${STOPS[p].name}」`}
                    title={`选「${STOPS[p].name}」单独闯`}
                  >
                    {i + 1}
                  </button>
                )
              })}
            </div>
            <ol className="journey">
              {route.map((s, i) => {
                const isPicked = pickedStop === s
                const isNext = pickedStop ? isPicked : i === 0
                const hasStamp = stamps.includes(s)
                return (
                  <li
                    key={s}
                    className={`${isNext ? 'next' : ''}${isPicked ? ' is-picked' : ''} is-clickable`}
                    onClick={() => setPickedStop((prev) => (prev === s ? null : s))}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setPickedStop((prev) => (prev === s ? null : s))
                      }
                    }}
                    title={`选「${STOPS[s].name}」单独闯`}
                  >
                    <span className="j-icon">
                      {PLACES[s].icon}
                      <b>{i + 1}</b>
                    </span>
                    <span className="j-name">{STOPS[s].name}</span>
                    {isPicked ? (
                      <span className="j-last pick-hint">已选</span>
                    ) : hasStamp ? (
                      <span className="j-last done">已拿✓</span>
                    ) : (
                      stamps.length > 0 && <span className="j-last">补章</span>
                    )}
                  </li>
                )
              })}
              <li className="goal">
                <span className="j-icon">{PLACES.dayanta.icon}</span>
                <span className="j-name">大雁塔</span>
              </li>
            </ol>
            <p className="journey-note">
              {pickedStop
                ? `只闯「${STOPS[pickedStop].name}」，或从这站往后逛`
                : missingStamps.length === 0
                  ? `${route.length} 个章全集齐了 · 点一站可以单独重玩`
                  : stamps.length > 0
                    ? `已集 ${stamps.length}/${route.length} 个章 · 点一站可以单独闯`
                    : `闯 ${route.length} 站集印章，终点大雁塔 · 点一站可以单独闯`}
            </p>
          </div>
          <div className="cta cta-stack">
            {pickedStop ? (
              <>
                <button type="button" className="btn big go duo" onClick={() => playStops([pickedStop])}>
                  只闯{STOPS[pickedStop].name}
                  <small>闯完就去大雁塔</small>
                </button>
                <div className="cta-sub">
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => playStops(route.slice(route.indexOf(pickedStop)))}
                  >
                    从这站往后逛
                  </button>
                  <button type="button" className="link" onClick={() => setPickedStop(null)}>
                    取消
                  </button>
                </div>
              </>
            ) : stamps.length > 0 && missingStamps.length > 0 ? (
              <>
                <button type="button" className="btn big go duo" onClick={() => playStops(missingStamps)}>
                  补齐 {missingStamps.length} 个章
                  <small>只闯还没拿章的站</small>
                </button>
                <div className="cta-sub">
                  <button type="button" className="btn ghost" onClick={() => playStops(route)}>
                    重逛全部 {route.length} 站
                  </button>
                  <button type="button" className="link" onClick={() => playStops(route, true)}>
                    清空印章重来
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="btn big go" onClick={() => playStops(route)}>
                第一站：{stop ? STOPS[stop].name : ''} →
              </button>
            )}
          </div>
        </div>
      )}

      {screen === 'intro' && stop && assets && (
        <div className="screen intro">
          <div className="intro-hero">
            <img className="ih-bg" src={`/assets/img/bg_${stop}.jpg`} alt={STOPS[stop].name} />
            <div className="ih-title">
              <small>
                第 {route.indexOf(stop) + 1} / {route.length} 站 · 你带小俑来到
              </small>
              <h2>{STOPS[stop].name}</h2>
            </div>
          </div>
          <div className="intro-body">
            <div className="you-line">
              <div className="you-bubble">
                <b>你</b>
                <p>{YOU_LINES[stop]}</p>
              </div>
              <img src={sprite} alt={hero?.name ?? '你'} />
            </div>
            <Xiaoyong
              text={brief?.stop_lines[stop] || DEFAULT_LINES[stop]}
              speaking={speaking}
              onPlay={() => playWithUnmute(() => sayStop(stop))}
              onStop={handleStopVoice}
            />
            <div className="card how">
              <div className="how-head">
                <b>玩法</b>
                <span className="lives">{'❤️'.repeat(Math.max(0, lives))}{'🤍'.repeat(Math.max(0, LIVES - lives))}</span>
              </div>
              <p>{STOPS[stop].hint}</p>
            </div>
            {/* 小俑 keeps talking into the game instead of being cut off mid-sentence. */}
            <button className="btn big" onClick={() => setScreen('play')}>
              开始！
            </button>
          </div>
        </div>
      )}

      {screen === 'play' && stop && assets && (
        <div className="screen play">
          {/* Sits between the 首页 and sound buttons; the full rules were on the intro. */}
          <div className="play-bar">
            <b>{STOPS[stop].name}</b>
            <span>{STOPS[stop].tip}</span>
          </div>
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
          {!result.passed && (
            <div className="retry-row">
              <p className="lives">体力 {'❤️'.repeat(Math.max(0, lives))}</p>
              <button
                type="button"
                className="btn ghost retry-btn"
                // A retry gives back the heart this miss cost, then the trip carries on from here.
                onClick={() => playStops(activeRoute.slice(step), false, Math.min(LIVES, lives + 1))}
              >
                ↻ 再闯一次
              </button>
            </div>
          )}
          <div className="ask">
            <div className="ask-tag">小俑问你</div>
            <Xiaoyong
              mood={answer === null ? 'confused' : 'happy'}
              text={answer === null ? QUESTIONS[stop].q : QUESTIONS[stop].answers[answer].reply}
              speaking={speaking}
              onPlay={() => playWithUnmute(() => say(clip(answer === null ? `q_${stop}` : `a_${stop}_${answer}`)))}
              onStop={handleStopVoice}
            />
            {answer === null ? (
              <>
                <div className="answers">
                  {QUESTIONS[stop].answers.map((a, i) => (
                    <button key={a.say} type="button" className="btn ghost" onClick={() => answerQuestion(i)}>
                      {a.say}
                    </button>
                  ))}
                </div>
                <p className="ask-note">
                  答完就出发 ·{' '}
                  {lives <= 0
                    ? '体力用完了，直奔大雁塔'
                    : step + 1 >= activeRoute.length
                      ? '去终点大雁塔'
                      : `下一站：${STOPS[activeRoute[step + 1]].name}`}
                </p>
              </>
            ) : (
              <button
                className={replyDone ? 'btn big auto' : 'btn big'}
                style={{ animationDuration: `${AUTO_GO}ms` }}
                onClick={next}
              >
                {lives <= 0
                  ? '体力用完了，赶末班地铁去大雁塔 →'
                  : step + 1 >= activeRoute.length
                    ? '去终点大雁塔 →'
                    : `下一站：${STOPS[activeRoute[step + 1]].name} →`}
              </button>
            )}
          </div>
        </div>
      )}

      {screen === 'final' && hero && (
        <div className="screen final">
          <div className="final-inner">
            <div className="final-hero">
              <img className="fh-bg" src="/assets/img/bg_dayanta.jpg" alt="大雁塔" />
              <img className="fh-me" src={sprite} alt={hero.name} />
              <img className="fh-xy" src="/assets/img/xiaoyong_happy.png" alt="小俑" />
              <div className="fh-title">
                <small>第 {runNo} 次带小俑出门 · 抵达终点</small>
                <h2>大雁塔</h2>
              </div>
            </div>
            <div className="final-venue">📍 1024 主会场 · 曲江京东MALL（曲江汉华城）</div>
            {!ending ? (
              <>
                <div className="trip-sum">
                  <div className="ts-head">
                    <b>今日战绩</b>
                    <span>
                      集章 {stamps.length}/{route.length} · 体力 {'❤️'.repeat(Math.max(0, lives))}
                      {'🤍'.repeat(Math.max(0, LIVES - Math.max(0, lives)))}
                    </span>
                  </div>
                  <div className="ts-seals">
                    {route.map((s) => {
                      const has = stamps.includes(s)
                      return (
                        <button
                          type="button"
                          key={s}
                          className="ts-seal is-clickable"
                          onClick={() => playStops([s])}
                          // Not while 小俑 writes the journal: it would start reading it aloud mid-game.
                          disabled={endBusy}
                          title={has ? `重玩「${STOPS[s].name}」` : `去「${STOPS[s].name}」补章`}
                        >
                          <div className={has ? 'seal on' : 'seal'}>{STOPS[s].stamp}</div>
                          <small>{STOPS[s].name}</small>
                          {!has && <em className="ts-retry-tag">补章</em>}
                        </button>
                      )
                    })}
                  </div>
                  {missingStamps.length > 0 && (
                    <button
                      type="button"
                      className="btn ghost ts-makeup-btn"
                      onClick={() => playStops(missingStamps)}
                      disabled={endBusy}
                    >
                      {missingStamps.length === 1
                        ? `去补「${STOPS[missingStamps[0]].stamp}」章`
                        : `补齐 ${missingStamps.length} 个章`}
                    </button>
                  )}
                </div>
                <Xiaoyong
                  mood="happy"
                  speaking={speaking}
                  onPlay={() => playWithUnmute(() => say(clip('dayanta')))}
                  onStop={handleStopVoice}
                  text={FINAL_LINE}
                />
                <div className="card say-card">
                  <b className="say-title">📒 临走前，对小俑说一句</b>
                  <div className="quick-says">
                    {QUICK_SAYS.map((q) => (
                      <button key={q} type="button" className={said === q ? 'on' : ''} onClick={() => setSaid(said === q ? '' : q)}>
                        {q}
                      </button>
                    ))}
                  </div>
                  <input value={said} maxLength={50} placeholder="或者自己写一句（可以不填）" onChange={(e) => setSaid(e.target.value)} />
                  <button className="btn big go" onClick={finishRun} disabled={endBusy}>
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
                  shots={shots}
                  stamps={stamps}
                  route={route}
                  comment={ending.comment}
                  runNo={runNo}
                  photo={photo?.url}
                  extra={
                    postcard ? (
                      <a className="btn ghost keep" href={postcard} download={`大雁塔合影-${hero.name}.png`}>
                        ⬇ 保存合影
                        <small>大雁塔明信片</small>
                      </a>
                    ) : (
                      <button type="button" className="btn ghost keep" onClick={makePostcard} disabled={postcardBusy}>
                        {postcardBusy ? '正在画合影…' : '📸 大雁塔合影'}
                        <small>{postcardBusy ? '约 1 分钟' : '和小俑合个影'}</small>
                      </button>
                    )
                  }
                />
                {postcard && <img className="postcard-img" src={postcard} alt="和小俑在大雁塔的合影" />}
                <div className="card stop-picker">
                  <div className="sp-head">
                    <b>
                      {missingStamps.length > 0
                        ? `还差 ${missingStamps.length} 个章`
                        : `🎉 ${route.length} 个章全集齐了`}
                    </b>
                    <span>
                      {missingStamps.length > 0
                        ? '点一站去补，闯过就盖到文牒上'
                        : '想重玩哪站，点哪站'}
                    </span>
                  </div>
                  <div className="sp-grid">
                    {route.map((s) => {
                      const has = stamps.includes(s)
                      return (
                        <button
                          type="button"
                          key={s}
                          className={`sp-item${has ? ' is-done' : ' is-missing'}`}
                          onClick={() => playStops([s])}
                        >
                          <span className="sp-icon">{PLACES[s].icon}</span>
                          <b>{STOPS[s].name}</b>
                          <small>{has ? '✓ 已拿' : '补章'}</small>
                        </button>
                      )
                    })}
                  </div>
                  {missingStamps.length > 1 && (
                    <button type="button" className="btn ghost duo sp-all" onClick={() => playStops(missingStamps)}>
                      一口气补齐
                      <small>连闯没拿章的 {missingStamps.length} 站</small>
                    </button>
                  )}
                </div>
                <div className="final-next">
                  <button type="button" className="btn big replay" onClick={replay}>
                    再游一次
                    <small>再去坑里接小俑，它记得你</small>
                  </button>
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      stopVoice()
                      resetPlayer()
                      setText('')
                      setPhoto(null)
                      setScreen('home')
                    }}
                  >
                    换个主角，重新开始
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
