import { useEffect, useRef, useState } from 'react'
import Xiaoyong from './Xiaoyong'

export type Met = 'go' | 'talk'

interface Props {
  speaking: boolean
  /** Plays a pre-made clip by name (vo_<name>.mp3) and resolves when it ends. */
  say: (name: string) => Promise<void>
  onStop: () => void
  /** How the traveler answered 小俑; null when the prologue was skipped. */
  onDone: (met: Met | null) => void
}

// Statues standing in the front row of the pit; the one at MOVER is 小俑.
const ROW = 5
const MOVER = 3
const LINES = {
  wake: '嘘！别喊！我在坑里站了两千两百年，外面啥样都没见过……你带我出去转转呗？',
  wake_talk: '会！还会背秦律呢。走不走嘛？',
  wake_go: '好嘞！等我拍拍土……走！',
}

type Step = 'arrive' | 'spot' | 'wake' | 'talk' | 'go'

/** The traveler is the last visitor in the pit, spots one warrior moving, and 小俑 asks to come along. */
export default function Prologue({ speaking, say, onStop, onDone }: Props) {
  const [step, setStep] = useState<Step>('arrive')
  const [miss, setMiss] = useState(-1)
  const done = useRef(false)

  useEffect(() => {
    if (step !== 'arrive') return
    const id = setTimeout(() => setStep('spot'), 2600)
    return () => clearTimeout(id)
  }, [step])

  const finish = (met: Met | null) => {
    if (done.current) return
    done.current = true
    onDone(met)
  }

  const tapStatue = (i: number) => {
    if (step === 'arrive') return setStep('spot')
    if (step !== 'spot') return
    if (i !== MOVER) {
      setMiss(i)
      setTimeout(() => setMiss(-1), 600)
      return
    }
    setStep('wake')
    say('wake')
  }

  const leave = async () => {
    setStep('go')
    // Let 小俑 finish the line (the next screen's greeting would cut it off), but never hang on audio.
    const min = new Promise((r) => setTimeout(r, 1200))
    await Promise.all([min, Promise.race([say('wake_go'), new Promise((r) => setTimeout(r, 6000))])])
    finish(step === 'talk' ? 'talk' : 'go')
  }

  const awake = step === 'wake' || step === 'talk' || step === 'go'

  return (
    <div className="screen prologue">
      <button type="button" className="skip" onClick={() => finish(null)}>
        跳过 ›
      </button>
      <div className={`pit${awake ? ' awake' : ''}`} onClick={() => step === 'arrive' && setStep('spot')}>
        <div className="pit-row">
          {Array.from({ length: ROW }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`statue${i === MOVER ? ' mover' : ''}${step === 'spot' && i === MOVER ? ' wiggle' : ''}${miss === i ? ' miss' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                tapStatue(i)
              }}
              aria-label={`第 ${i + 1} 个俑`}
            >
              <img src="/assets/img/xiaoyong.png" alt="" draggable={false} />
              {miss === i && <span className="miss-tag">不是这个……</span>}
            </button>
          ))}
        </div>
        {awake && <span className="dust">💨</span>}
      </div>

      {!awake ? (
        <div className="narration" key={step}>
          {step === 'arrive' ? (
            <p>西安，兵马俑一号坑。闭馆铃响了，游客都走光了，就剩你还趴在栏杆上看。</p>
          ) : (
            <>
              <p>咦？前排那几个俑里，好像有一个……动了一下？</p>
              <p className="tap-hint">👆 点那个动了的俑</p>
            </>
          )}
        </div>
      ) : (
        <div className="meet">
          <Xiaoyong
            mood={step === 'wake' ? 'confused' : 'happy'}
            text={step === 'wake' ? LINES.wake : step === 'talk' ? LINES.wake_talk : LINES.wake_go}
            speaking={speaking}
            onPlay={() => say(step === 'wake' ? 'wake' : step === 'talk' ? 'wake_talk' : 'wake_go')}
            onStop={onStop}
          />
          {step === 'wake' && (
            <div className="meet-choices">
              <button type="button" className="btn big go" onClick={leave}>
                走，带你逛长安！
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setStep('talk')
                  say('wake_talk')
                }}
              >
                你……你会说话？！
              </button>
            </div>
          )}
          {step === 'talk' && (
            <button type="button" className="btn big go" onClick={leave}>
              走！
            </button>
          )}
        </div>
      )}
    </div>
  )
}
