'use client'

import type { KeysReply } from '@/types/location'
import { InfoIcon } from './icons'
import { KeyStatusList } from './KeyStatusList'
import type { FreeTool, MapKeyState } from './keys'
import { look } from './look'
import { StartHead } from './StartHead'

// 열쇠 없음 화면(spec location AC-7917.1, design.md 15절 글, 시안 ?s=no-key 자리).
// 공공데이터포털·카카오 장소 찾기 열쇠가 둘 다 안 넣음일 때 그린다(showNoKey). 열쇠는 사이트 서버 설정에만 넣으므로 이 화면에 열쇠 넣는 칸은 없다.
// 화면 글은 명세 글(시안의 서버 설정·도우미 이름 글은 바뀜). 열쇠 없이 되는 것 셋은 단추로 연다(onOpen)

const FREE: { to: FreeTool; label: string }[] = [
  { to: 'listings', label: '매물 붙여 넣기' },
  { to: 'memo', label: '진행 메모' },
  { to: 'costs', label: '개원 비용 계산' },
]

export function NoKeyScreen({ keys, mapKey, onOpen }: { keys: KeysReply; mapKey: MapKeyState; onOpen: (to: FreeTool) => void }) {
  return (
    <div>
      <StartHead />
      <div className="mt-6 max-w-[880px] border-t border-line-strong pt-6">
        <h2 className="text-title font-semibold text-ink">자료 열쇠를 넣으면 시작할 수 있어요</h2>
        <p className="mt-2 text-lead text-ink-2">
          공공데이터포털 열쇠와 카카오 열쇠는 사이트 서버 설정에 넣어요. 넣기 어려우면 관리자에게 알려 주세요. 열쇠는 대화창이나 메신저에 붙이지 마세요.
        </p>
        <KeyStatusList keys={keys} mapKey={mapKey} />
        <p role="note" className="mt-4 grid grid-cols-[16px_minmax(0,1fr)] gap-2 rounded-control bg-canvas px-3 py-2.5 text-small text-ink-2">
          <InfoIcon />
          <span>
            <b className="font-semibold text-ink">자료 열쇠</b>는 자료를 주는 사이트가 &apos;이 앱이 받아 가도 돼요&apos;라고 내어 주는 긴 비밀번호예요. 셋 다
            무료예요. 이 화면에는 열쇠 넣는 칸이 없어요. 열쇠는 사이트 서버 설정에 넣고, 여기서는 넣었는지만 보여요.
          </span>
        </p>
        <p className={`${look.help} mt-3`}>열쇠 없이도 되는 것: 매물 붙여 넣기 · 진행 메모 · 개원 비용 계산.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {FREE.map((item) => (
            <button key={item.to} type="button" className={look.button} onClick={() => onOpen(item.to)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
