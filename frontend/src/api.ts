export type StopId = 'zhonglou' | 'huiminjie' | 'bingmayong' | 'chengqiang' | 'datang'
export type FoodId = 'roujiamo' | 'biangbiang' | 'liangpi' | 'paomo' | 'jingao'

export interface Hero {
  name: string
  title: string
  catchphrase: string
  traits: string[]
  look: string
  prompt: string
}

export interface Brief {
  greeting: string
  recalled: string[]
  route: StopId[]
  food_order: FoodId[]
  spicy_tease: boolean
  wall_warn: string
  stop_lines: Partial<Record<StopId, string>>
  memory_source: 'everos' | 'local' | 'none'
}

export interface StopResult {
  passed: boolean
  detail: string
  snapshot?: string
}

// hint: the full rules on the intro screen; tip: a few words for the bar above the game.
export const STOPS: Record<StopId, { name: string; stamp: string; hint: string; tip: string }> = {
  zhonglou: { name: '钟楼', stamp: '晨钟', hint: '晨钟一响全城起床：音符落进铜钟上的圆圈时点击 / 按空格撞钟；敲乱或漏敲 3 次就失败', tip: '跟着节拍撞钟，叫全城起床' },
  huiminjie: { name: '回民街', stamp: '吃货', hint: '←→ 或拖动接住小俑点的美食替它吃，每样 3 份，接到 3 个辣子就辣晕了', tip: '接小俑点的菜，躲辣子' },
  bingmayong: { name: '兵马俑', stamp: '战友', hint: '盯紧！有个俑会偷偷动一下，点中它。找到 3 次过关，点错 3 次失败', tip: '点那个偷偷动的俑' },
  chengqiang: { name: '城墙', stamp: '骑士', hint: '点击屏幕 / 按空格跳起来，躲开游客和自拍杆，撞 3 次失败', tip: '点屏幕跳，空中还能再跳' },
  datang: { name: '大唐不夜城', stamp: '灯会', hint: '灯笼往哪边歪，就按住哪边把它扶正（←→ 键，或按住屏幕左右半边）。前 3 秒是热身，坚持 30 秒走完步行街，掉 3 次失败', tip: '灯笼歪哪边，按住哪边' },
}

export const FOODS: Record<FoodId, { name: string; emoji: string }> = {
  roujiamo: { name: '肉夹馍', emoji: '🥙' },
  biangbiang: { name: 'biangbiang面', emoji: '🍜' },
  liangpi: { name: '凉皮', emoji: '🥗' },
  paomo: { name: '羊肉泡馍', emoji: '🥣' },
  jingao: { name: '甑糕', emoji: '🍰' },
}

const LS_PLAYER = 'changan.player'
const LS_LOG = 'changan.log'
const LS_RUNS = 'changan.runs'
// The traveler's hero, sprite and last trip's stamps, so 首页 can greet them back after a reload.
const LS_HERO = 'changan.hero'

if (typeof window !== 'undefined' && (window.location.search.includes('new=1') || window.location.search.includes('reset=1'))) {
  try {
    localStorage.removeItem(LS_PLAYER)
    localStorage.removeItem(LS_LOG)
    localStorage.removeItem(LS_RUNS)
    localStorage.removeItem(LS_HERO)
    window.history.replaceState({}, '', window.location.pathname)
  } catch {
    /* ignore */
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable: memory still lives in EverOS */
  }
}

export function resetPlayer() {
  try {
    localStorage.removeItem(LS_PLAYER)
    localStorage.removeItem(LS_LOG)
    localStorage.removeItem(LS_RUNS)
    localStorage.removeItem(LS_HERO)
  } catch {
    /* ignore */
  }
}

export interface Traveler {
  hero: Hero
  sprite: string
  stamps: StopId[]
}

export function savedTraveler(): Traveler | null {
  try {
    const t = JSON.parse(safeGet(LS_HERO) || 'null')
    return t?.hero?.name && t.sprite ? { ...t, stamps: t.stamps ?? [] } : null
  } catch {
    return null
  }
}

// The sprite is a few hundred KB of data URL; if storage is full the traveler just isn't remembered on 首页.
export function saveTraveler(t: Traveler) {
  safeSet(LS_HERO, JSON.stringify(t))
}

export function runCount(): number {
  return Number(safeGet(LS_RUNS) || '0')
}

export function playerId(): string {
  let id = safeGet(LS_PLAYER)
  if (!id) {
    id = 'traveler_' + crypto.randomUUID().slice(0, 12)
    safeSet(LS_PLAYER, id)
  }
  return id
}

export function nextRunNo(): number {
  const n = Number(safeGet(LS_RUNS) || '0') + 1
  safeSet(LS_RUNS, String(n))
  return n
}

export function localLog(): string[] {
  try {
    return JSON.parse(safeGet(LS_LOG) || '[]')
  } catch {
    return []
  }
}

export function pushLocalLog(line: string) {
  safeSet(LS_LOG, JSON.stringify([...localLog(), line].slice(-20)))
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error((await res.text()) || res.statusText)
  return res.json()
}

export const api = {
  hero: (text: string, photo?: { b64: string; mime: string }) =>
    post<{ hero: Hero; sprite: string }>('hero', { text, photo_b64: photo?.b64, photo_mime: photo?.mime }),
  brief: (hero: Hero, runNo: number) =>
    post<Brief>('brief', { player_id: playerId(), hero, run_no: runNo, local_log: localLog() }),
  stop: (runId: string, runNo: number, hero: Hero, stop: StopId, r: StopResult) =>
    post<{ saved: boolean; line: string }>('stop', {
      player_id: playerId(), run_id: runId, run_no: runNo, hero, stop, passed: r.passed, detail: r.detail,
    }),
  runEnd: (runId: string, runNo: number, hero: Hero, stamps: string[], log: string[], said: string) =>
    post<{ journal: string; comment: string; saved: boolean }>('run_end', {
      player_id: playerId(), run_id: runId, run_no: runNo, hero, stamps, log, said,
    }),
  note: (runId: string, text: string, role: 'assistant' | 'user') =>
    post<{ saved: boolean }>('note', { player_id: playerId(), run_id: runId, text, role }),
  tts: (text: string) => post<{ audio: string }>('tts', { text }),
  postcard: (hero: Hero, sprite: string) => post<{ image: string }>('postcard', { hero, sprite }),
}
