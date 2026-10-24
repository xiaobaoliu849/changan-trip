import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { STOPS, type Hero, type StopId } from '../api'

interface Props {
  hero: Hero
  sprite: string
  inGame?: string
  stamps: StopId[]
  comment: string
  runNo: number
  photo?: string
}

/** 通关文牒 — doubles as the track's required 主角卡. */
export default function Passport({ hero, sprite, inGame, stamps, comment, runNo, photo }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)

  const download = async () => {
    if (!ref.current) return
    setBusy(true)
    try {
      const url = await toPng(ref.current, { pixelRatio: 2, cacheBust: true })
      const a = document.createElement('a')
      a.href = url
      a.download = `通关文牒-${hero.name}.png`
      a.click()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="passport-wrap">
      <div className="passport" ref={ref}>
        <div className="pp-head">
          <span>长安通关文牒</span>
          <small>第 {runNo} 次入城</small>
        </div>
        <div className="pp-body">
          <div className="pp-col">
            <div className="pp-label">一句话</div>
            <div className="pp-prompt">
              {photo ? <img src={photo} alt="照片" /> : null}「{hero.prompt || '一张照片'}」
            </div>
            <div className="pp-label">生成的主角</div>
            <img className="pp-sprite" src={sprite} alt={hero.name} />
            <div className="pp-name">
              {hero.name}
              <small>{hero.title}</small>
            </div>
          </div>
          <div className="pp-col">
            <div className="pp-label">游戏中的样子</div>
            {inGame ? <img className="pp-shot" src={inGame} alt="游戏画面" /> : <div className="pp-shot empty">未留影</div>}
            <div className="pp-label">印章</div>
            <div className="pp-stamps">
              {(Object.keys(STOPS) as StopId[]).map((s) => (
                <div key={s} className={stamps.includes(s) ? 'seal on' : 'seal'}>
                  {STOPS[s].stamp}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="pp-foot">
          <img src="/assets/img/xiaoyong_happy.png" alt="" />
          <span>小俑批注：{comment}</span>
        </div>
      </div>
      <button className="btn ghost" onClick={download} disabled={busy}>
        {busy ? '生成中…' : '⬇ 保存通关文牒（主角卡）'}
      </button>
    </div>
  )
}
