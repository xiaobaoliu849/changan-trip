import { playBell, playMiss } from '../media'
import { H, W, drawActor, drawCover, floatText, hearts, hud, photoMode, roundRect, type GameFactory } from './engine'

// 钟楼: notes fall onto the spot where the hanging 撞木 (striking log) meets the bronze bell.
// Tapping makes the hero yank the rope, the log swings into the bell and the bell rings.
// The 晨钟 is what gets the city out of bed: ringing it on the beat wakes 长安 on time,
// while a jumbled bell (early, missed or stray strikes) leaves everyone unsure whether to get up.

// Bell: hangs from the beam at (BX, BELL_TOP); its 撞座 (striking boss) is the target.
const BEAM_Y = 160
const BX = 318
const BELL_TOP = 196
const BELL_H = 186
const TX = BX - 50 // striking point on the bell's left flank
const TY = BELL_TOP + 104

// 撞木: a log hung by two ropes; its tip rests just short of the bell.
const LOG_LEN = 178
const LOG_R = 15
const LOG_REST = TX - 10 // tip x at rest
const ROPE_LEN = TY - BEAM_Y
const ROPE_ANCHORS = [LOG_REST - 150, LOG_REST - 50]

// Hero stands behind the log and pulls a rope tied to its tail.
const HERO_X = 112
const FLOOR_Y = 566
const HERO_H = 188

// 小俑 sprite height, and its clay colours (sampled from xiaoyong.png) for the ear-covering hands
const XY_H = 124
const XY_SKIN = '#c18f6e'
const XY_LINE = '#331a13'
const XY_SLEEVE = '#b48665'

const POP_LIFE = 0.7 // every popup lives as long, so the stack keeps its order
const SPEED = 260
const WINDOW = 42
const PERFECT = 16
const PATTERN = [0.9, 0.9, 0.45, 0.45, 0.9, 0.9, 0.6, 0.6, 0.6, 0.9, 0.45, 0.45, 0.45, 0.9, 0.6, 0.6, 0.9, 0.9]
const LEAD_IN = 1.7 // seconds before the first note lands, so the "how to play" banner can be read
const TUTORIAL_NOTES = 3 // the first few notes get a big 敲! prompt

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; text?: string }

export const bellRhythm: GameFactory = ({ assets, finish }) => {
  const notes: { y: number; hit: boolean; gone: boolean }[] = []
  let at = LEAD_IN
  for (const gap of PATTERN) {
    notes.push({ y: TY - at * SPEED, hit: false, gone: false })
    at += gap
  }
  let hits = 0
  let strikes = 0
  let combo = 0
  let best = 0
  let over = false
  let time = 0
  let lastMissAt = -1 // when the last note slipped past; a tap just after it is the same mistake
  let wokeAt = -1 // wall-clock ms when the 晨钟 rang through; GameCanvas stops calling update() at the end
  let doneAt = -1 // game time when the last note was hit or missed

  // Animation state
  let logX = 0 // log offset from rest (negative = pulled back)
  let logV = 0
  let hold = 0 // the log rests against the bell for a beat after contact, so the strike reads
  let bellAngle = 0
  let bellV = 0
  let glow = 0 // bell glow after a good hit
  let lunge = 0 // hero lunging forward after a tap
  let wobble = 0 // hero shaking their head after a mistake
  let shake = 0 // screen shake
  let flash = 0 // red flash on a mistake
  let xyJump = 0 // 小俑 hops when the bell rings
  let earsT = 0 // how long 小俑 keeps its ears covered after the last ring
  let ears = 0 // 0 = hands down, 1 = hands pressed over its ears
  let comboPop = 0
  const waves: { r: number; life: number; gold: boolean }[] = []
  const parts: Particle[] = []
  const pops: { text: string; t: number; color: string }[] = []

  const burst = (x: number, y: number, n: number, colors: string[], speed: number, size = 4) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const s = speed * (0.4 + Math.random() * 0.8)
      const life = 0.45 + Math.random() * 0.4
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life, max: life, color: colors[i % colors.length], size: size * (0.6 + Math.random() * 0.8) })
    }
  }

  const end = (passed: boolean) => {
    over = true
    if (passed) wokeAt = performance.now()
    finish({
      passed,
      detail: passed
        ? `在钟楼敲响晨钟，合上节拍${hits}/${notes.length}下，最高连击${best}${strikes ? `，敲乱或漏敲${strikes}次` : ''}，全城准时起床了`
        : `在钟楼敲晨钟，只合上节拍${hits}/${notes.length}下，敲乱或漏敲了${strikes}次，钟声乱了套，全城不知道该不该起床`,
    })
  }

  const strike = (why: string) => {
    strikes++
    combo = 0
    playMiss()
    wobble = 0.5
    flash = 0.35
    shake = Math.max(shake, 0.12)
    pops.push({ text: why, t: POP_LIFE, color: '#ff8a65' })
    if (strikes >= 3) end(false)
  }

  const swing = () => {
    // Yank the rope: the log flies forward into the bell.
    logV = 1700
    lunge = 1
  }

  const tap = () => {
    if (over) return
    swing()
    const n = notes.find((n) => !n.hit && !n.gone && Math.abs(n.y - TY) < WINDOW)
    if (n) {
      const perfect = Math.abs(n.y - TY) < PERFECT
      n.hit = true
      hits++
      combo++
      best = Math.max(best, combo)
      playBell(perfect)
      bellV += perfect ? 1.1 : 0.8
      glow = perfect ? 1 : 0.7
      shake = Math.max(shake, perfect ? 0.16 : 0.1)
      xyJump = 1
      earsT = 0.75
      waves.push({ r: 70, life: 1, gold: perfect })
      if (perfect) waves.push({ r: 40, life: 1.25, gold: true })
      burst(TX, TY, perfect ? 22 : 12, perfect ? ['#fff3b0', '#ffd34d', '#ffb31a'] : ['#ffe7a3', '#e9c46a'], perfect ? 260 : 180)
      // The note itself turns into little ♪ that drift upward.
      for (let i = 0; i < (perfect ? 3 : 2); i++) {
        parts.push({ x: TX + (i - 1) * 18, y: TY - 10, vx: (i - 1) * 40, vy: -120 - Math.random() * 60, life: 0.9, max: 0.9, color: '#ffe066', size: 22, text: i % 2 ? '♫' : '♪' })
      }
      if (combo >= 3) comboPop = 1
      pops.push({ text: perfect ? '咚！完美' : '咚！', t: POP_LIFE, color: perfect ? '#ffe066' : '#fff6e0' })
    } else {
      // Swung at nothing: a dull knock on the bell.
      bellV += 0.25
      burst(TX, TY, 6, ['#b9a68a', '#8d7b63'], 120, 3)
      const next = nextNote()
      // After the last note the bell has done its job: extra taps just ring out, no penalty.
      if (!next) return
      const early = TY - next.y < 120
      if (lastMissAt >= 0 && time - lastMissAt < 0.3) {
        // One late tap on the note that just slipped by: that miss was already counted,
        // even when the next note is already close (on the fast beats they overlap).
        lastMissAt = -1
        pops.push({ text: '晚了一点！', t: POP_LIFE, color: '#ffcc80' })
        return
      }
      // Taps while the how-to banner shows, before any note is near, are free warm-ups.
      if (!early && !notes.some((n) => n.hit || n.gone)) return
      strike(early ? '敲早了！' : '乱敲了！')
    }
  }

  const nextNote = () => notes.find((n) => !n.hit && !n.gone)

  return {
    update(dt) {
      time += dt
      // GameCanvas stops calling update() once finish() runs, so the final frame holds still.
      const next = nextNote()
      // Wind-up: as the next note approaches, the hero pulls the log back, hinting at the timing.
      let target = -6
      if (next && !over) {
        const d = TY - next.y
        if (d > 0 && d < 200) target = -6 - 40 * (1 - d / 200) ** 0.8
      }
      const contact = TX - LOG_REST - 1
      if (hold > 0) {
        hold -= dt
        logX = contact
        if (hold <= 0) logV = -220 // then it rebounds off the bronze
      } else {
        logV += (-(logX - target) * 260 - logV * 16) * dt
        logX += logV * dt
        if (logX > contact) {
          logX = contact
          logV = 0
          hold = 0.09
        }
      }
      bellV += (-bellAngle * 90 - bellV * 3.2) * dt
      bellAngle += bellV * dt * 0.12
      glow = Math.max(0, glow - dt * 1.6)
      lunge = Math.max(0, lunge - dt * 3.2)
      wobble = Math.max(0, wobble - dt)
      shake = Math.max(0, shake - dt)
      flash = Math.max(0, flash - dt)
      xyJump = Math.max(0, xyJump - dt * 2.5)
      earsT = Math.max(0, earsT - dt)
      // Hands fly up fast when the bell rings, and come down slowly once it falls quiet.
      ears = earsT > 0 ? Math.min(1, ears + dt * 12) : Math.max(0, ears - dt * 4)
      comboPop = Math.max(0, comboPop - dt * 2)
      for (const w of waves) {
        w.life -= dt * 1.4
        w.r += dt * 260
      }
      for (let i = waves.length - 1; i >= 0; i--) if (waves[i].life <= 0) waves.splice(i, 1)
      for (const p of parts) {
        p.life -= dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vy += (p.text ? -20 : 420) * dt
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1)
      for (const p of pops) p.t -= dt
      for (let i = pops.length - 1; i >= 0; i--) if (pops[i].t <= 0) pops.splice(i, 1)

      if (over) return
      for (const n of notes) {
        n.y += SPEED * dt
        if (!n.hit && !n.gone && n.y > TY + WINDOW) {
          n.gone = true
          lastMissAt = time
          strike('漏了一下！')
          if (over) return
        }
      }
      // Once every note is settled, give the last swing a moment to land on the bell, then finish.
      if (doneAt < 0 && notes.every((n) => n.hit || n.gone)) doneAt = time
      if (doneAt >= 0 && time - doneAt > 0.25) end(true)
    },

    draw(ctx) {
      ctx.save()
      if (shake > 0 && !photoMode) ctx.translate((Math.random() - 0.5) * shake * 40, (Math.random() - 0.5) * shake * 30)
      drawCover(ctx, assets.bg)
      ctx.fillStyle = 'rgba(20, 16, 36, 0.42)'
      ctx.fillRect(-20, -20, W + 40, H + 40)
      if (glow > 0) {
        // The whole tower warms up for a moment when the bell rings.
        const g = ctx.createRadialGradient(BX, TY, 20, BX, TY, 360)
        g.addColorStop(0, `rgba(255, 210, 110, ${0.35 * glow})`)
        g.addColorStop(1, 'rgba(255, 210, 110, 0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
      }

      drawFrame(ctx)
      drawLane(ctx)

      // Sound waves rolling out of the bell
      for (const w of waves) {
        ctx.beginPath()
        ctx.arc(BX, BELL_TOP + BELL_H * 0.55, w.r, 0, Math.PI * 2)
        ctx.strokeStyle = w.gold ? `rgba(255, 214, 92, ${0.7 * w.life})` : `rgba(255, 246, 224, ${0.5 * w.life})`
        ctx.lineWidth = 3 + 5 * w.life
        ctx.stroke()
      }

      drawBell(ctx)
      drawLog(ctx)
      drawHero(ctx)
      drawXiaoyong(ctx)
      drawNotes(ctx)

      for (const p of parts) {
        const a = Math.max(0, p.life / p.max)
        ctx.globalAlpha = a
        ctx.fillStyle = p.color
        if (p.text) {
          ctx.font = `bold ${p.size}px serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(p.text, p.x, p.y)
        } else {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * a + 0.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
      ctx.restore()

      if (flash > 0 && !photoMode) {
        ctx.fillStyle = `rgba(200, 40, 30, ${flash * 0.5})`
        ctx.fillRect(0, 0, W, H)
      }

      // 0 while playing, then 0→1 over a quarter second as the finale banner pops in
      const woke = wokeAt < 0 ? 0 : Math.max(0.001, Math.min(1, (performance.now() - wokeAt) / 250))
      if (woke === 0) {
        // Newest popup lowest, older ones stacked above it, so drifting text never crosses.
        pops
          .filter((p) => p.t > 0)
          .slice(-3)
          .reverse()
          .forEach((p, i) => floatText(ctx, p.text, BX + 40, BELL_TOP - 52 - i * 32 - (POP_LIFE - p.t) * 12, p.color))
      }
      if (combo >= 3 && woke === 0 && !photoMode) {
        const s = 1 + comboPop * 0.35
        ctx.save()
        ctx.translate(120, 92)
        ctx.scale(s, s)
        floatText(ctx, `连击 ×${combo}`, 0, 0, combo >= 8 ? '#ffd34d' : '#fff6e0', 24)
        ctx.restore()
      }
      drawGuide(ctx)
      if (woke > 0 && !photoMode) {
        // The 晨钟 rang through: the city wakes up.
        const s = 0.6 + 0.4 * (1 + 2.2 * (woke - 1) ** 3 + 1.2 * (woke - 1) ** 2) // ease-out with a little overshoot
        ctx.save()
        ctx.translate(W / 2, BEAM_Y - 46)
        ctx.scale(s, s)
        floatText(ctx, '晨钟响了，全城起床！', 0, 0, '#ffd34d', 30)
        ctx.restore()
      }
      hud(ctx, `敲中 ${hits}/${notes.length}`, `钟声不乱 ${hearts(3 - strikes)}`)
    },

    pointer(_x, _y, down) {
      if (down) tap()
    },
    key(k, down) {
      if (down && (k === ' ' || k === 'Enter')) tap()
    },
  }

  // ---- drawing helpers (closures over the animation state) ----

  function drawFrame(ctx: CanvasRenderingContext2D) {
    // 钟架: two red-lacquered posts, a beam with gold caps, and a stone floor.
    ctx.fillStyle = 'rgba(60, 40, 30, 0.75)'
    roundRect(ctx, 16, FLOOR_Y - 4, W - 32, 22, 6)
    ctx.fill()
    for (const x of [44, W - 44]) {
      const g = ctx.createLinearGradient(x - 11, 0, x + 11, 0)
      g.addColorStop(0, '#6e1a12')
      g.addColorStop(0.5, '#b8392a')
      g.addColorStop(1, '#5a140e')
      ctx.fillStyle = g
      ctx.fillRect(x - 11, BEAM_Y, 22, FLOOR_Y - BEAM_Y)
    }
    const bg = ctx.createLinearGradient(0, BEAM_Y - 14, 0, BEAM_Y + 14)
    bg.addColorStop(0, '#c6452f')
    bg.addColorStop(1, '#6b1b12')
    ctx.fillStyle = bg
    roundRect(ctx, 22, BEAM_Y - 14, W - 44, 26, 6)
    ctx.fill()
    ctx.fillStyle = '#e9b949'
    ctx.fillRect(22, BEAM_Y - 4, W - 44, 3)
    for (const x of [22, W - 50]) {
      roundRect(ctx, x, BEAM_Y - 16, 28, 30, 5)
      ctx.fill()
    }
  }

  function drawLane(ctx: CanvasRenderingContext2D) {
    if (photoMode) return
    // A faint guide where the notes fall, ending in the target on the bell's striking boss.
    ctx.save()
    ctx.setLineDash([6, 10])
    ctx.lineDashOffset = -time * 60
    ctx.strokeStyle = 'rgba(255, 246, 224, 0.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(TX, 0)
    ctx.lineTo(TX, TY - WINDOW)
    ctx.stroke()
    ctx.restore()
  }

  function drawBell(ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.translate(BX, BELL_TOP)
    ctx.rotate(bellAngle)
    // Hanger (蒲牢 loop) up to the beam
    ctx.strokeStyle = '#3d2814'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(0, BEAM_Y - BELL_TOP)
    ctx.lineTo(0, 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(0, 4, 13, 10, 0, Math.PI, 0)
    ctx.stroke()

    const body = new Path2D()
    body.moveTo(-40, 14)
    body.quadraticCurveTo(0, -6, 40, 14)
    body.bezierCurveTo(52, 60, 52, 140, 70, BELL_H)
    body.quadraticCurveTo(0, BELL_H - 12, -70, BELL_H)
    body.bezierCurveTo(-52, 140, -52, 60, -40, 14)
    body.closePath()

    if (glow > 0) {
      ctx.shadowColor = `rgba(255, 214, 92, ${glow})`
      ctx.shadowBlur = 40 * glow
    }
    const g = ctx.createLinearGradient(-70, 0, 70, 0)
    g.addColorStop(0, '#4a2d12')
    g.addColorStop(0.28, '#a8742e')
    g.addColorStop(0.45, '#e2bd68')
    g.addColorStop(0.7, '#8c5c22')
    g.addColorStop(1, '#3c240e')
    ctx.fillStyle = g
    ctx.fill(body)
    ctx.shadowBlur = 0
    ctx.lineWidth = 3
    ctx.strokeStyle = '#2e1b0a'
    ctx.stroke(body)

    ctx.save()
    ctx.clip(body)
    // Raised bands and panels
    ctx.strokeStyle = 'rgba(46, 27, 10, 0.75)'
    ctx.lineWidth = 3
    for (const y of [36, 132, 150]) {
      ctx.beginPath()
      ctx.moveTo(-80, y)
      ctx.lineTo(80, y)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(0, 36)
    ctx.lineTo(0, 132)
    ctx.stroke()
    // 钟乳: rows of bosses in the upper panels
    ctx.fillStyle = 'rgba(255, 228, 160, 0.55)'
    for (const sx of [-1, 1])
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 2; c++) {
          ctx.beginPath()
          ctx.arc(sx * (14 + c * 13), 52 + r * 14, 3, 0, Math.PI * 2)
          ctx.fill()
        }
    // 撞座: the lotus striking boss, where the log lands
    ctx.beginPath()
    ctx.arc(TX - BX + 8, TY - BELL_TOP, 15, 0, Math.PI * 2)
    ctx.fillStyle = '#c99a45'
    ctx.fill()
    ctx.strokeStyle = '#4a2d12'
    ctx.lineWidth = 2
    ctx.stroke()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(TX - BX + 8 + Math.cos(a) * 9, TY - BELL_TOP + Math.sin(a) * 9, 3, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (glow > 0) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = `rgba(255, 200, 90, ${0.45 * glow})`
      ctx.fillRect(-80, 0, 160, BELL_H + 10)
    }
    ctx.restore()

    // Dark mouth of the bell
    ctx.beginPath()
    ctx.ellipse(0, BELL_H - 4, 66, 8, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#1e1208'
    ctx.fill()
    ctx.restore()
  }

  function logPos() {
    const tip = LOG_REST + logX
    const y = TY - (logX * logX) / (2 * ROPE_LEN)
    return { tip, tail: tip - LOG_LEN, y }
  }

  function drawLog(ctx: CanvasRenderingContext2D) {
    const { tail, y } = logPos()
    // Ropes from the beam, swinging with the log
    ctx.strokeStyle = '#d9b77a'
    ctx.lineWidth = 3
    for (const ax of ROPE_ANCHORS) {
      ctx.beginPath()
      ctx.moveTo(ax, BEAM_Y + 8)
      ctx.lineTo(ax + logX, y - LOG_R + 2)
      ctx.stroke()
    }
    // The log itself: a rounded timber with a rope band near each end
    const g = ctx.createLinearGradient(0, y - LOG_R, 0, y + LOG_R)
    g.addColorStop(0, '#c7925a')
    g.addColorStop(0.5, '#8a5a2e')
    g.addColorStop(1, '#5a3618')
    ctx.fillStyle = g
    roundRect(ctx, tail, y - LOG_R, LOG_LEN, LOG_R * 2, LOG_R)
    ctx.fill()
    ctx.strokeStyle = '#3d2412'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#d9b77a'
    for (const ax of ROPE_ANCHORS) ctx.fillRect(ax + logX - 4, y - LOG_R, 8, LOG_R * 2)
    // Pull rope from the tail down to the hero's hands
    const [hx, hy] = heroHands()
    ctx.strokeStyle = '#d9b77a'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(tail + 4, y + 4)
    ctx.quadraticCurveTo((tail + hx) / 2 - 10, (y + hy) / 2 + 24, hx, hy)
    ctx.stroke()
  }

  function heroLean() {
    // Leans back as the log is drawn back, lunges forward on a swing, shakes their head on a mistake.
    const back = Math.min(0, logX) / 46
    return back * 0.14 + lunge * 0.2 + Math.sin(wobble * 40) * wobble * 0.12
  }

  function heroHands(): [number, number] {
    const lean = heroLean()
    const hx = HERO_X + lean * 70 + 18
    const hy = FLOOR_Y - HERO_H * 0.42
    return [hx, hy]
  }

  function drawHero(ctx: CanvasRenderingContext2D) {
    const lean = heroLean()
    const bob = Math.sin(time * 4) * 2 * (1 - lunge)
    const squash = 1 + lunge * 0.06
    ctx.save()
    ctx.translate(HERO_X + lean * 70, FLOOR_Y)
    ctx.rotate(lean)
    ctx.scale(1 / squash, squash)
    // Soft shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'
    ctx.beginPath()
    ctx.ellipse(0, 2, 46, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    drawActor(ctx, assets.hero, 0, bob, HERO_H)
    ctx.restore()
  }

  function drawXiaoyong(ctx: CanvasRenderingContext2D) {
    // 小俑 promised 「你来敲，我捂耳朵」: while the bell rings it presses its hands over its ears,
    // squeezes its eyes shut and hops. Positions are in xiaoyong.png's own pixels.
    const img = assets.xiaoyong
    const k = XY_H / img.height
    const at = (ix: number, iy: number): [number, number] => [(ix - img.width / 2) * k, -XY_H + iy * k]
    const hop = Math.sin(xyJump * Math.PI) * 14
    const tilt = Math.sin(xyJump * 18) * xyJump * 0.1
    ctx.save()
    ctx.translate(W - 78, H - 34 - hop)
    ctx.rotate(tilt)
    drawActor(ctx, img, 0, 0, XY_H)
    if (ears > 0) {
      const e = 1 - (1 - ears) ** 3 // ease out
      if (ears > 0.5) {
        // Eyes squeezed shut: paint over them with clay, then draw > <
        for (const [ix, iy, dir] of [[165, 258, 1], [290, 255, -1]] as const) {
          const [x, y] = at(ix, iy)
          ctx.beginPath()
          ctx.arc(x, y, 38 * k, 0, Math.PI * 2)
          ctx.fillStyle = XY_SKIN
          ctx.fill()
          ctx.beginPath()
          ctx.moveTo(x - dir * 16 * k, y - 14 * k)
          ctx.lineTo(x + dir * 14 * k, y)
          ctx.lineTo(x - dir * 16 * k, y + 14 * k)
          ctx.strokeStyle = XY_LINE
          ctx.lineWidth = 2.2
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.stroke()
        }
      }
      // Arms swing up from the shoulders and the hands press flat over the ears.
      for (const [sx, sy, ex, ey, side] of [[70, 430, 40, 262, -1], [322, 420, 348, 255, 1]] as const) {
        ctx.globalAlpha = Math.min(1, ears * 2.5)
        const [x0, y0] = at(sx, sy)
        const [x1, y1] = at(ex, ey)
        const x = x0 + (x1 - x0) * e
        const y = y0 + (y1 - y0) * e
        // Sleeve from the shoulder pad to the wrist, so it reads as an arm, not a floating disc
        ctx.lineCap = 'round'
        ctx.strokeStyle = XY_LINE
        ctx.lineWidth = 64 * k + 3
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x, y + 30 * k)
        ctx.stroke()
        ctx.strokeStyle = XY_SLEEVE
        ctx.lineWidth = 64 * k
        ctx.stroke()
        // Mitten hand: palm, three finger tips and a thumb, outlined once around the whole shape
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(side * 0.2)
        const shapes: [number, number, number, number][] = [
          [0, 4, 36, 42], // palm
          [-18, -36, 13, 15],
          [0, -42, 13, 15],
          [18, -36, 13, 15],
          [side * -34, 4, 12, 18], // thumb, toward the face
        ]
        for (const pass of [0, 1]) {
          for (const [hx, hy, rx, ry] of shapes) {
            ctx.beginPath()
            ctx.ellipse(hx * k, hy * k, rx * k, ry * k, 0, 0, Math.PI * 2)
            if (pass === 0) {
              ctx.strokeStyle = XY_LINE
              ctx.lineWidth = 3.4
              ctx.stroke()
            } else {
              ctx.fillStyle = XY_SKIN
              ctx.fill()
            }
          }
        }
        ctx.restore()
        // Little ringing marks outside the hands while the bell is loud
        if (earsT > 0 && !photoMode) {
          ctx.strokeStyle = `rgba(255, 230, 160, ${Math.min(1, earsT * 2)})`
          ctx.lineWidth = 2
          for (const r of [1, 2]) {
            ctx.beginPath()
            ctx.arc(x, y, (50 + r * 32) * k + Math.sin(time * 30) * 1.5, side > 0 ? -0.7 : Math.PI - 0.7, side > 0 ? 0.7 : Math.PI + 0.7)
            ctx.stroke()
          }
        }
        ctx.globalAlpha = 1
      }
    }
    ctx.restore()
  }

  function drawNotes(ctx: CanvasRenderingContext2D) {
    if (photoMode) return
    const next = nextNote()
    const d = next ? Math.abs(next.y - TY) : 999
    const inWindow = d < WINDOW
    const near = Math.max(0, 1 - d / 160)
    // Target ring on the striking boss: brightens as a note approaches, gold when it's time.
    ctx.save()
    ctx.translate(TX, TY)
    ctx.beginPath()
    ctx.arc(0, 0, WINDOW, 0, Math.PI * 2)
    ctx.fillStyle = inWindow ? 'rgba(255, 214, 92, 0.38)' : `rgba(255, 246, 224, ${0.08 + near * 0.15})`
    ctx.fill()
    ctx.lineWidth = 3 + near * 2
    ctx.strokeStyle = inWindow ? '#ffd34d' : `rgba(255, 230, 160, ${0.45 + near * 0.5})`
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0, PERFECT, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 246, 224, 0.6)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()

    for (const n of notes) {
      if (n.hit || n.gone || n.y < -30) continue
      ctx.save()
      ctx.translate(TX, n.y)
      ctx.beginPath()
      ctx.arc(0, 0, 20, 0, Math.PI * 2)
      ctx.fillStyle = '#c0392b'
      ctx.fill()
      ctx.strokeStyle = '#ffe6a0'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fillStyle = '#ffe6a0'
      ctx.font = 'bold 22px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('♪', 0, 1)
      ctx.restore()
    }

    // For the first few notes, a big 敲! tells players exactly when to tap.
    const idx = next ? notes.indexOf(next) : -1
    if (inWindow && idx >= 0 && idx < TUTORIAL_NOTES) {
      const s = 1 + Math.sin(time * 20) * 0.08
      ctx.save()
      ctx.translate(TX - 62, TY - 8)
      ctx.scale(s, s)
      floatText(ctx, '敲！', 0, 0, '#ffd34d', 30)
      ctx.restore()
    }
  }

  function drawGuide(ctx: CanvasRenderingContext2D) {
    // How-to banner during the lead-in, before the first note lands.
    if (photoMode || time > LEAD_IN - 0.2) return
    const a = Math.min(1, time * 3, (LEAD_IN - 0.2 - time) * 3)
    ctx.save()
    ctx.globalAlpha = a
    ctx.fillStyle = 'rgba(30, 18, 10, 0.72)'
    roundRect(ctx, 40, H - 128, W - 80, 64, 16)
    ctx.fill()
    ctx.fillStyle = '#fff6e0'
    ctx.font = 'bold 19px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('♪ 落到铜钟的圆圈里，点一下撞钟！', W / 2, H - 106)
    ctx.font = '15px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillText('敲准晨钟，叫全城起床（电脑可按空格）', W / 2, H - 82)
    ctx.restore()
  }
}
