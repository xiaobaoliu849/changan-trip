import { FOODS, type FoodId } from '../api'
import { H, W, drawCover, drawSprite, floatText, hearts, hud, photoMode, rand, roundRect, type GameFactory } from './engine'

interface Item {
  kind: FoodId | 'chili' | 'bonus'
  x: number
  y: number
  vy: number
}

const NEED_EACH = 3
const TIME = 35
const SIZE = 68 // falling dish, px

// Drawn sprites (python -m backend.make_food); loaded on import so they are ready by the intro screen.
// Until one arrives its emoji stands in.
const sprites = Object.fromEntries(
  (Object.keys(FOODS) as FoodId[]).map((f) => {
    const img = new Image()
    img.src = `/assets/img/food_${f}.png`
    return [f, img]
  }),
) as Record<FoodId, HTMLImageElement>

// Fits the order card; the falling tags use the same text so the two match at a glance.
const shortName = (f: FoodId) => FOODS[f].name.replace('biangbiang', 'biang').replace('羊肉泡馍', '泡馍')

/** Draw dish ``f`` fitted into a ``size`` box centred on (x, y). */
function drawFood(ctx: CanvasRenderingContext2D, f: FoodId, x: number, y: number, size: number) {
  const img = sprites[f]
  if (img.complete && img.naturalWidth) {
    const s = size / Math.max(img.naturalWidth, img.naturalHeight)
    const w = img.naturalWidth * s
    const h = img.naturalHeight * s
    ctx.drawImage(img, x - w / 2, y - h / 2, w, h)
  } else {
    ctx.font = `${Math.round(size * 0.7)}px serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(FOODS[f].emoji, x, y)
  }
}

/** Name pill under a falling item: gold when 小俑 ordered it, so the player knows what to chase. */
function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, fg: string) {
  ctx.font = 'bold 13px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = ctx.measureText(text).width + 14
  ctx.fillStyle = bg
  roundRect(ctx, x - w / 2, y - 10, w, 20, 10)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.fillText(text, x, y + 1)
}

export const catchFood: GameFactory = ({ assets, finish, options }) => {
  const order = ((options.food_order as FoodId[]) || ['roujiamo', 'biangbiang', 'liangpi']).slice(0, 3)
  const chiliRate = options.spicy_tease ? 0.3 : 0.2
  const caught: Record<string, number> = {}
  const items: Item[] = []
  const pops: { text: string; x: number; y: number; t: number; color: string }[] = []
  let x = W / 2
  let xy = W / 2 - 80 // 小俑 trails beside the hero, on whichever side has room
  let left = false
  let right = false
  let dragX: number | null = null
  let spawn = 0
  let time = TIME
  let chili = 0
  let flash = 0
  let over = false

  const remaining = () => order.reduce((n, f) => n + Math.max(0, NEED_EACH - (caught[f] || 0)), 0)

  const end = (passed: boolean) => {
    over = true
    const got = Object.entries(caught)
      .filter(([k]) => k !== 'chili' && k !== 'bonus')
      .map(([k, n]) => `${FOODS[k as FoodId].name}×${n}`)
      .join('、')
    const extra = Object.keys(caught).filter((k) => k !== 'chili' && k !== 'bonus' && !order.includes(k as FoodId))
    // 你 is the traveler, who eats for 小俑; it is swapped for the hero's name when this goes into memory.
    const detail =
      `小俑点了${order.map((f) => FOODS[f].name).join('、')}让你替它吃；${got ? `你接到${got}` : '你什么都没接到'}` +
      (extra.length ? `（还顺手接了不在单子上的${extra.map((k) => FOODS[k as FoodId].name).join('、')}）` : '') +
      `；你被辣子辣到${chili}次` +
      (passed ? `，${Math.round(TIME - time)}秒凑齐了小俑点的菜` : chili >= 3 ? '，你辣晕了' : `，时间到还差${remaining()}份`)
    finish({ passed, detail })
  }

  return {
    update(dt) {
      if (over) return
      time -= dt
      flash = Math.max(0, flash - dt)
      if (dragX !== null) x += (dragX - x) * Math.min(1, dt * 14)
      else x += ((right ? 1 : 0) - (left ? 1 : 0)) * 420 * dt
      x = Math.max(40, Math.min(W - 40, x))
      xy += (x + (x > W / 2 ? -78 : 78) - xy) * Math.min(1, dt * 5)

      spawn -= dt
      if (spawn <= 0) {
        spawn = rand(0.45, 0.8)
        const r = Math.random()
        const all = Object.keys(FOODS) as FoodId[]
        const kind: Item['kind'] =
          r < 0.04 ? 'bonus' : r < chiliRate ? 'chili' : r < 0.75 ? order[Math.floor(Math.random() * order.length)] : all[Math.floor(Math.random() * all.length)]
        items.push({ kind, x: rand(40, W - 40), y: 80, vy: rand(170, 260) + (TIME - time) * 4 })
      }
      for (const it of items) it.y += it.vy * dt
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]
        if (it.y > H - 150 && it.y < H - 60 && Math.abs(it.x - x) < 44) {
          items.splice(i, 1)
          caught[it.kind] = (caught[it.kind] || 0) + 1
          if (it.kind === 'bonus') {
            // 1024 程序员节彩蛋：解一次辣
            chili = Math.max(0, chili - 1)
            pops.push({ text: '1024 快乐！解辣', x: it.x, y: it.y - 40, t: 1, color: '#7fe0ff' })
          } else if (it.kind === 'chili') {
            chili++
            flash = 0.4
            pops.push({ text: '好辣！', x: it.x, y: it.y - 40, t: 0.8, color: '#ff5a36' })
            pops.push({ text: '快喝水！', x: xy, y: H - 140, t: 0.9, color: '#d0f0ff' })
          } else if (order.includes(it.kind) && caught[it.kind] <= NEED_EACH) {
            pops.push({ text: `+${FOODS[it.kind].name}`, x: it.x, y: it.y - 40, t: 0.8, color: '#ffe066' })
          } else {
            pops.push({ text: '顺手吃了', x: it.x, y: it.y - 40, t: 0.8, color: '#d0f0ff' })
          }
        } else if (it.y > H + 40) items.splice(i, 1)
      }
      for (const p of pops) {
        p.t -= dt
        p.y -= 40 * dt
      }
      if (chili >= 3) end(false)
      else if (remaining() === 0) end(true)
      else if (time <= 0) end(false)
    },
    draw(ctx) {
      drawCover(ctx, assets.bg)
      ctx.fillStyle = 'rgba(0,0,0,0.15)'
      ctx.fillRect(0, 0, W, H)
      if (!photoMode) {
        // Order card
        ctx.fillStyle = 'rgba(255, 246, 224, 0.93)'
        roundRect(ctx, 12, 66, W - 24, 52, 12)
        ctx.fill()
        ctx.font = 'bold 18px "PingFang SC", "Microsoft YaHei", sans-serif'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#5a2d12'
        ctx.textAlign = 'left'
        ctx.fillText('小俑点', 22, 92)
        order.forEach((f, i) => {
          const done = Math.min(NEED_EACH, caught[f] || 0)
          const left = 84 + i * ((W - 96) / 3)
          drawFood(ctx, f, left + 15, 92, 32)
          ctx.font = 'bold 15px "PingFang SC", "Microsoft YaHei", sans-serif'
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = done >= NEED_EACH ? '#2f7a64' : '#5a2d12'
          ctx.fillText(`${shortName(f)} ${done}/${NEED_EACH}`, left + 34, 92)
        })
      }
      for (const it of items) {
        if (it.kind === 'bonus') {
          ctx.save()
          ctx.fillStyle = '#ffd34d'
          ctx.beginPath()
          ctx.arc(it.x, it.y - 14, 26, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#7a3e00'
          ctx.font = 'bold 16px sans-serif'
          ctx.fillText('1024', it.x, it.y - 9)
          ctx.restore()
        } else if (it.kind === 'chili') {
          ctx.font = '50px serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('🌶️', it.x, it.y)
          tag(ctx, '辣子', it.x, it.y + 34, 'rgba(200, 40, 20, 0.92)', '#fff')
        } else {
          drawFood(ctx, it.kind, it.x, it.y, SIZE)
          const wanted = order.includes(it.kind) && (caught[it.kind] || 0) < NEED_EACH
          tag(ctx, shortName(it.kind), it.x, it.y + SIZE / 2 + 4,
            wanted ? 'rgba(255, 214, 77, 0.95)' : 'rgba(40, 24, 14, 0.7)', wanted ? '#5a2d12' : '#f0e2c8')
        }
      }
      drawSprite(ctx, assets.xiaoyong, xy, H - 40, 84, xy > x)
      drawSprite(ctx, assets.hero, x, H - 40, 130)
      for (const p of pops) if (p.t > 0) floatText(ctx, p.text, p.x, p.y, p.color, 22)
      if (flash > 0 && !photoMode) {
        ctx.fillStyle = `rgba(255, 60, 30, ${flash * 0.6})`
        ctx.fillRect(0, 0, W, H)
      }
      hud(ctx, `⏱ ${Math.max(0, Math.ceil(time))}s`, `辣度 ${'🌶️'.repeat(chili)}${'·'.repeat(3 - chili)}  ${hearts(3 - chili)}`)
    },
    pointer(px, _y, down) {
      dragX = down ? px : null
    },
    move(px) {
      if (dragX !== null) dragX = px
    },
    key(k, down) {
      if (k === 'ArrowLeft' || k === 'a') left = down
      if (k === 'ArrowRight' || k === 'd') right = down
    },
  }
}
