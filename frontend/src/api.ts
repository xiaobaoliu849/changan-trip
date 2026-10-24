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

export const STOPS: Record<StopId, { name: string; stamp: string; hint: string }> = {
  zhonglou: { name: '钟楼', stamp: '晨钟', hint: '音符飞到铜钟时点击 / 按空格敲钟，敲错或漏敲 3 次就失败' },
  huiminjie: { name: '回民街', stamp: '吃货', hint: '←→ 或拖动接住客人点的美食，每样接 3 份，接到 3 个辣子就辣晕了' },
  bingmayong: { name: '兵马俑', stamp: '战友', hint: '盯紧！有个俑会偷偷动一下，点中它。找到 3 次过关，点错 3 次失败' },
  chengqiang: { name: '城墙', stamp: '骑士', hint: '点击屏幕 / 按空格跳起来，躲开游客和自拍杆，撞 3 次失败' },
  datang: { name: '大唐不夜城', stamp: '灯会', hint: '灯笼往哪边歪，就按住哪边把它扶正（←→ 键，或按住屏幕左右半边）。前 3 秒是热身，坚持 30 秒走完步行街，掉 3 次失败' },
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

if (typeof window !== 'undefined' && (window.location.search.includes('new=1') || window.location.search.includes('reset=1'))) {
  try {
    localStorage.removeItem(LS_PLAYER)
    localStorage.removeItem(LS_LOG)
    localStorage.removeItem(LS_RUNS)
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
  } catch {
    /* ignore */
  }
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
  tts: (text: string) => post<{ audio: string }>('tts', { text }),
  postcard: (hero: Hero, sprite: string) => post<{ image: string }>('postcard', { hero, sprite }),
}
