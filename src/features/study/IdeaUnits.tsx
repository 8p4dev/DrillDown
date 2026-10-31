import { useState } from 'react'

/** 애매 노드 자기채점: 의미 단위별 체크박스. 체크 개수를 알린다 */
export default function IdeaUnits({ units, onChange }: { units: string[]; onChange: (checked: number) => void }) {
  const [on, setOn] = useState(() => units.map(() => false))
  const toggle = (i: number) => {
    const next = on.map((v, j) => (j === i ? !v : v))
    setOn(next)
    onChange(next.filter(Boolean).length)
  }
  return (
    <span className="idea-units" role="group" aria-label="자기채점">
      {units.map((u, i) => (
        <label key={i}>
          <input type="checkbox" aria-label={`의미 단위 ${u}`} checked={on[i]} onChange={() => toggle(i)} /> {u}
        </label>
      ))}
    </span>
  )
}
