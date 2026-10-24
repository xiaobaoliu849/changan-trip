interface Props {
  text: string
  mood?: 'idle' | 'happy' | 'confused'
  speaking?: boolean
}

const IMG = {
  idle: '/assets/img/xiaoyong.png',
  happy: '/assets/img/xiaoyong_happy.png',
  confused: '/assets/img/xiaoyong_confused.png',
}

export default function Xiaoyong({ text, mood = 'idle', speaking }: Props) {
  return (
    <div className="xiaoyong">
      <img className={speaking ? 'xy-img talking' : 'xy-img'} src={IMG[mood]} alt="小俑" />
      <div className="bubble">
        <b>小俑</b>
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
