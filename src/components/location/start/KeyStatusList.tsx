import type { KeysReply, KeyState } from '@/types/location'
import { KeyIcon } from './icons'
import { KEY_ROWS, KEY_STATE_TEXT, keyStates, type MapKeyState } from './keys'
import { look } from './look'

// 열쇠 셋 줄(시안 .kstat .ks): 열쇠 이름 · `받는 자료: {목록}` · 상태 표. 열쇠를 넣는 칸은 없다(넣었는지만 보인다)

const CHIP: Record<KeyState, string> = {
  ok: look.chipOk,
  missing: look.chipMissing,
  rejected: look.chipRejected,
  failed: look.chipFailed,
}

export function KeyStatusList({ keys, mapKey }: { keys: KeysReply; mapKey: MapKeyState }) {
  const states = keyStates(keys, mapKey)
  return (
    <div role="list" aria-label="열쇠 상태" className="mt-5 border-t border-line-strong">
      {KEY_ROWS.map((row) => (
        <div key={row.id} role="listitem" className="flex items-start justify-between gap-4 border-b border-line py-3">
          <div className="min-w-0">
            <b className="inline-flex items-center gap-2 font-semibold text-ink">
              <KeyIcon />
              {row.name}
            </b>
            <p className="mt-0.5 text-small text-ink-2">받는 자료: {row.gets}</p>
          </div>
          <span className={`${CHIP[states[row.id]]} mt-0.5`}>{KEY_STATE_TEXT[states[row.id]]}</span>
        </div>
      ))}
    </div>
  )
}
