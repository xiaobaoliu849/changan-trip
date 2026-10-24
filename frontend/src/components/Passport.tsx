import { useRef, useState, type ReactNode } from 'react'
import { toPng } from 'html-to-image'
import { STOPS, type Hero, type StopId } from '../api'

/** A clean frame of the hero in a mini-game, kept for the passport. */
export interface Shot {
  stop: StopId
  src: string
  passed: boolean
}

interface Props {
  hero: Hero
  sprite: string
  shots: Shot[]
  stamps: StopId[]
  route: StopId[]
  comment: string
  runNo: number
  photo?: string
  /** Shown beside the save button, same size (the 大雁塔 postcard). */
  extra?: ReactNode
}

// Seals are pressed by hand: each sits a little crooked.
const TILT = [-6, 4, -3, 7, -5]

const today = () => {
  const d = new Date()
  return `公元 ${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

/** 通关文牒 — doubles as the track's required 主角卡. */
export default function Passport({ hero, sprite, shots, stamps, route, comment, runNo, photo, extra }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  // Start on the latest stop the traveler cleared; ‹ › picks another for the saved card.
  const [pick, setPick] = useState(() => {
    const passed = shots.map((s) => s.passed).lastIndexOf(true)
    return passed >= 0 ? passed : shots.length - 1
  })
  const shot = shots[pick]
  // Fixed when the trip ends, so re-renders (flipping photos) can't move it past midnight.
  const [date] = useState(today)

  const download = async () => {
    if (!ref.current) return
    setBusy(true)
    try {
      const url = await toPng(ref.current, {
        pixelRatio: 2,
        cacheBust: true,
        // The photo picker is for choosing, not part of the document.
        filter: (node) => !(node instanceof Element && node.classList.contains('pp-pick')),
      })
      const a = document.createElement('a')
      a.href = url
      a.download = `通关文牒-${hero.name}.png`
      a.click()
    } finally {
      setBusy(false)
    }
  }

  const flip = (d: number) => setPick((i) => (i + d + shots.length) % shots.length)

  return (
    <div className="passport-wrap">
      <div className="passport" ref={ref}>
        <div className="pp-paper">
          <i className="pp-corner tl" />
          <i className="pp-corner tr" />
          <i className="pp-corner bl" />
          <i className="pp-corner br" />

          <header className="pp-head">
            <h3>长安通关文牒</h3>
            <p>
              第 {runNo} 次入城 · {date}
            </p>
          </header>

          <div className="pp-main">
            <section className="pp-holder">
              <span className="pp-tag">持牒人</span>
              <div className="pp-portrait">
                <img src={sprite} alt={hero.name} />
              </div>
              <div className="pp-name">{hero.name}</div>
              <div className="pp-role">{hero.title}</div>
              <p className="pp-self">
                {photo ? <img src={photo} alt="照片" /> : null}自述「{hero.prompt || '一张照片'}」
              </p>
            </section>

            <section className="pp-memory">
              <span className="pp-tag">游历留影</span>
              <figure className="pp-print">
                <div className="pp-shot">
                  {shot ? <img src={shot.src} alt={`在${STOPS[shot.stop].name}`} /> : <span>未留影</span>}
                  {shots.length > 1 && (
                    <div className="pp-pick">
                      <button type="button" onClick={() => flip(-1)} aria-label="上一张">
                        ‹
                      </button>
                      <span>
                        {pick + 1}/{shots.length}
                      </span>
                      <button type="button" onClick={() => flip(1)} aria-label="下一张">
                        ›
                      </button>
                    </div>
                  )}
                </div>
                <figcaption>{shot ? `摄于${STOPS[shot.stop].name}` : '下回记得留个影'}</figcaption>
              </figure>
            </section>
          </div>

          <section className="pp-route">
            <div className="pp-route-head">
              <span className="pp-tag">沿途印鉴</span>
              <span className="pp-count">
                {stamps.length}/{route.length}
              </span>
            </div>
            <ol className="pp-seals">
              {route.map((s, i) => (
                <li key={s} className={stamps.includes(s) ? 'on' : ''}>
                  <span className="pp-seal" style={{ transform: stamps.includes(s) ? `rotate(${TILT[i % TILT.length]}deg)` : undefined }}>
                    {STOPS[s].stamp}
                  </span>
                  <small>{STOPS[s].name}</small>
                </li>
              ))}
            </ol>
          </section>

          <section className="pp-note">
            <img src="/assets/img/xiaoyong_happy.png" alt="" />
            <div>
              <span className="pp-tag">小俑批注</span>
              <p>{comment}</p>
              <small>—— 小俑 押</small>
            </div>
            <span className="pp-bigseal" aria-hidden="true">
              长安县印
            </span>
          </section>

          <footer className="pp-event">WaytoAGI 1024 切磋大会 · 西安曲江京东MALL · 大雁塔纪念</footer>
        </div>
      </div>
      <div className="keep-row">
        <button type="button" className="btn ghost keep" onClick={download} disabled={busy}>
          {busy ? '生成中…' : '⬇ 通关文牒'}
          <small>{busy ? '马上就好' : '保存主角卡'}</small>
        </button>
        {extra}
      </div>
    </div>
  )
}
