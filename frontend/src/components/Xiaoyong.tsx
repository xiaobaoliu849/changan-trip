interface Props {
  text: string
  mood?: 'idle' | 'happy' | 'confused'
  speaking?: boolean
  onPlay?: () => void
  onStop?: () => void
}

const IMG = {
  idle: '/assets/img/xiaoyong.png',
  happy: '/assets/img/xiaoyong_happy.png',
  confused: '/assets/img/xiaoyong_confused.png',
}

export default function Xiaoyong({ text, mood = 'idle', speaking, onPlay, onStop }: Props) {
  const handleAudioClick = () => {
    if (speaking) {
      onStop?.()
    } else {
      onPlay?.()
    }
  }

  return (
    <div className="xiaoyong">
      <img className={speaking ? 'xy-img talking' : 'xy-img'} src={IMG[mood]} alt="小俑" />
      <div className="bubble" onClick={onPlay ? handleAudioClick : undefined} style={onPlay ? { cursor: 'pointer' } : undefined}>
        <div className="bubble-head">
          <b>小俑</b>
          {speaking && (
            <span className="eq-bars" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
        </div>
        <p>{text}</p>
      </div>
    </div>
  )
}

export function Notebook({ items, source }: { items: string[]; source: string }) {
  if (!items.length) return null
  return (
    <div className="notebook">
      <div className="nb-title">📒 小俑的小本本</div>
      <ul>
        {items.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
      <div className="nb-src">{source === 'everos' ? '记忆来自 EverOS' : '记忆来自本机'}</div>
    </div>
  )
}
