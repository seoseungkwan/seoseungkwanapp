'use client'

import { useState, type MouseEvent } from 'react'
import { Icon } from '@/components/common/Icon'
import { MethodCard, type MethodCardProps } from '@/components/location/method/MethodCard'
import { METHOD } from '@/lib/location/method'
import type { DongIndex } from '@/lib/location/regions'
import type { KeysReply } from '@/types/location'
import { PlusIcon } from './icons'
import { KeyStatusList } from './KeyStatusList'
import { keyStates, type FreeTool, type MapKeyState } from './keys'
import { look } from './look'
import { StartHead } from './StartHead'

// 처음(후보 없음) 화면(spec location AC-7917.1, 시안 ?s=empty 자리·글, 열쇠 글은 requirements '화면 글 기본값'·design.md 15절).
// 동 목록(index, 동 경계 index.json)은 받아서 쓰고, 고른 시군구는 onScan(시군구 5자리)으로 넘긴다(읽기·저장 없음).
// 열쇠가 셋 다 들어 있으면 한 줄, 아니면 열쇠 셋 줄과 상태를 보인다(지도 열쇠만 없으면 지도 글도). 열쇠 넣는 칸은 없다.
// 시작 단계·단추·열쇠 글 아래에 처음 안내 '이 탭은 이렇게 분석해요' 한 장(AC-7920.1, 시안 ?s=empty #method)을 끼우고,
// 머리 [분석 방법]은 판을 열지 않고 그 장으로 내려가 초점을 옮긴다(평범한 #닻 링크, Ctrl 누르기 등은 브라우저에 맡김).
// 한 장이 받는 것(지금 무게·경쟁 과목 짧은 이름·근거와 출처로 가기)은 그대로 넘긴다

// 처음 안내 한 장 자리 id(머리 [분석 방법] 링크의 #닻)
const METHOD_SPOT = 'loc-method'

const STEPS: [string, string][] = [
  ['동네 훑기', '시·구를 고르면 행정동마다 점수 색을 칠해 보여 주고, 좋은 동 차례와 까닭을 알려 줘요.'],
  ['후보 더하기', '주소를 넣거나, 지도에서 찍거나, 네이버 부동산에서 본 매물을 붙여 넣어 후보로 저장해요.'],
  ['깊게 보고 견주기', '위험 신호·경쟁 의원·진료 시간 빈틈·건물 서류를 가지 않고 보고, 후보끼리 점수표로 견줘요.'],
  ['개원 준비', '개원 비용·손익분기·일정표·건물 요건을 챙기고, 한 장 보고서로 뽑아요.'],
]

type Props = MethodCardProps & {
  index: DongIndex | null
  keys: KeysReply
  mapKey: MapKeyState
  onScan: (code5: string) => void
  onAdd: () => void
  onOpen: (to: FreeTool) => void
}

const plainClick = (e: MouseEvent) => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey

// 머리 [분석 방법]: 한 장으로 내려가 초점을 둔다(주소 #닻은 쓰지 않음 — 시안 toc-method)
function toMethod(e: MouseEvent<HTMLAnchorElement>) {
  if (!plainClick(e)) return
  const spot = document.getElementById(METHOD_SPOT)
  if (spot === null) return
  e.preventDefault()
  spot.scrollIntoView({ block: 'start' })
  spot.focus({ preventScroll: true })
}

export function EmptyScreen({ index, keys, mapKey, onScan, onAdd, onOpen, ...method }: Props) {
  const sidos = index?.sidos ?? []
  const [sidoCode, setSidoCode] = useState<string | null>(null)
  const [sggCode, setSggCode] = useState<string | null>(null)
  const sido = sidos.find((s) => s.code2 === sidoCode) ?? sidos[0]
  const sggs = sido?.sggs ?? []
  const sgg = sggs.find((s) => s.code5 === sggCode) ?? sggs[0]
  const states = keyStates(keys, mapKey)
  const allIn = Object.values(states).every((state) => state === 'ok')

  return (
    <div>
      <StartHead>
        <a href={`#${METHOD_SPOT}`} className={look.methodLink} onClick={toMethod}>
          <Icon name="info" />
          {METHOD.button}
        </a>
      </StartHead>
      <div className="mt-6 max-w-[720px] border-t border-line-strong pt-6">
        <h2 className="text-title font-semibold text-ink">아직 후보가 없어요</h2>
        <p className="mt-2 text-lead text-ink-2">
          새로 개원할 자리를 넓게 훑고 깊게 봐요. 시·구를 고르면 동마다 점수를 매겨 좋은 동을 먼저 알려 주고, 마음에 드는 자리를 후보로 저장하면 그 둘레를 깊게
          살펴봐요.
        </p>
        <ol aria-label="시작하는 차례" className="mt-5 border-t border-line">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 border-b border-line py-3">
              <span className="font-semibold text-accent-strong tabular-nums">{i + 1}</span>
              <div>
                <b className="block font-semibold text-ink">{title}</b>
                <small className="block text-small text-muted">{text}</small>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap items-end gap-2">
          <div className={`${look.field} w-42`}>
            <label htmlFor="loc-start-sido" className={look.label}>
              시·도
            </label>
            <select
              id="loc-start-sido"
              className={look.select}
              value={sido?.code2 ?? ''}
              disabled={sido === undefined}
              onChange={(e) => {
                setSidoCode(e.target.value)
                setSggCode(null)
              }}
            >
              {sidos.map((s) => (
                <option key={s.code2} value={s.code2}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className={`${look.field} w-42`}>
            <label htmlFor="loc-start-sgg" className={look.label}>
              시·군·구
            </label>
            <select
              id="loc-start-sgg"
              className={look.select}
              value={sgg?.code5 ?? ''}
              disabled={sgg === undefined}
              onChange={(e) => setSggCode(e.target.value)}
            >
              {sggs.map((s) => (
                <option key={s.code5} value={s.code5}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className={look.primaryLarge} disabled={sgg === undefined} onClick={() => sgg && onScan(sgg.code5)}>
            동네 훑기 시작
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <button type="button" className={look.button} onClick={onAdd}>
            <PlusIcon />
            주소로 후보 더하기
          </button>
          <button type="button" className={look.button} onClick={() => onOpen('listings')}>
            매물 붙여 넣기
          </button>
        </div>
        {allIn ? (
          <p className={`${look.help} mt-3`}>자료 열쇠(공공데이터포털 · 카카오 지도 · 카카오 장소 찾기)가 들어 있어요.</p>
        ) : (
          <>
            <KeyStatusList keys={keys} mapKey={mapKey} />
            {mapKey === 'missing' && <p className={`${look.help} mt-3`}>카카오 지도 열쇠를 넣으면 지도가 보여요. 숫자는 지도 없이도 볼 수 있어요.</p>}
          </>
        )}
      </div>
      <div id={METHOD_SPOT} tabIndex={-1} className={look.methodSpot}>
        <MethodCard {...method} />
      </div>
    </div>
  )
}
