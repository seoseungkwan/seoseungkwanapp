import { ds } from '@/components/ui/classes'
import { distText } from '@/lib/location/coords'
import { WATCH_DEPTS } from '@/lib/location/watch'
import type { LocationEvent } from '@/types/location'

// 대시보드 새 경쟁 의원 알림 줄 (specs/location REQ-7915 AC-7915.2, design.md 12절, 시안 docs/mockups/location/index.html ?s=dashboard의
// .wnote·.wnr·.wn·[닫기]). 받은 안 본 줄만 그린다(읽기·본 것 적기는 useLocationWatch, 자리는 무상 수리 알림 바로 아래 — DashboardHome).
// 최근 차례(일어난 날 → 넣은 시각이 늦은 것 먼저) 셋까지, 넷 이상이면 넷째 줄이 '… {n}건 더'다. 줄마다 오른쪽 [닫기](시안 승인 때 더함)는 그 줄만 닫는다.
// 줄 링크는 Next의 화면 안 이동 링크 부품이 아니라 평범한 a 링크다: 입지 화면만 카카오 CSP라, 화면 안에서 넘어가면 첫 문서의 CSP가 남아
// 지도가 막힌다(design.md 13절) → 문서를 새로 불러온다. 후보 이름은 받지 않는다(알림 확인용 후보 읽기에 이름 칸이 없다) — 의원 이름·거리·날짜로 쓴다.
// 모양은 무상 수리 알림(WarrantyNotice)과 같은 옅은 회색 바탕·폭이고, 그 묶음 바로 뒤면 위 간격만 8px(시안 .wnote + .wnote)다. PC 모양 하나

const SHOWN = 3

// 줄 하나 = 링크 + [닫기](시안 .wnr). 줄 사이 1px 선(시안 .wnr + .wnr)
const LINE = 'grid grid-cols-[minmax(0,1fr)_auto] items-start'
const DIVIDED = 'border-t border-line'
// 링크: 핀 16 · 글(남는 폭) · '입지 분석에서 보기'. [닫기] 쪽 안쪽 여백은 8(시안 .wnr .wn)
const LINK = `group grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-2 rounded-control py-3 text-body text-ink-2 no-underline ${ds.focusRing}`
const ROW = `${LINK} pr-2 pl-4`
const MORE = `${LINK} px-4`
// [닫기](시안 .tbtn.mut.wx): 회색 작은 글자 단추. 높이를 본문 한 줄(22px)로 두고 위 12px — 첫 줄 글과 같은 높이에 선다
const CLOSE = `mt-3 mr-3 inline-flex h-5.5 cursor-pointer items-center rounded-control px-1 text-small font-medium whitespace-nowrap text-ink-2 underline-offset-3 hover:underline ${ds.focusRing}`
const TEXT = 'min-w-0 text-ink underline-offset-3 group-hover:underline'

/** 줄의 과목(없으면 이름)에 든 경쟁 과목 + 조사. 못 찾으면 '경쟁 의원이' */
function subjectOf(e: LocationEvent): string {
  const dept = WATCH_DEPTS.find((d) => e.dept.includes(d)) ?? WATCH_DEPTS.find((d) => e.clinicName.includes(d))
  return dept === undefined ? '경쟁 의원이' : `${dept}가`
}

/** 'YYYY-MM-DD' → 'M월 D일' */
const dayText = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`

/** 아래 줄: 의원 이름 · 거리(AC-7905.6) · 날짜. 거리가 틀린 값이면 그 조각만 뺀다(그리다 멈추지 않게) */
const detailOf = (e: LocationEvent) => [e.clinicName, Number.isFinite(e.distM) && e.distM >= 0 ? distText(e.distM) : null, dayText(e.eventOn)].filter((part) => part !== null).join(' · ')

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const recentFirst = (a: LocationEvent, b: LocationEvent) => order(b.eventOn, a.eventOn) || order(b.createdAt, a.createdAt) || order(b.id, a.id)

const detailHref = (candidateId: string) => `/location?c=${encodeURIComponent(candidateId)}&tab=detail`

// 핀(시안 ICON.pin). 꾸밈이고 색은 주황. 본문 한 줄 높이(22px) 칸 가운데에 16px 그림 — 시안 위 3px와 같은 자리다
function Pin() {
  return (
    <span aria-hidden="true" className="flex h-5.5 items-center text-warning">
      <svg aria-hidden="true" width={16} height={16} viewBox="0 0 16 16">
        <path d="M8 15s-5-4.6-5-8.4A5 5 0 0 1 13 6.6C13 10.4 8 15 8 15z" fill="currentColor" />
        <circle cx="8" cy="6.5" r="1.8" className="fill-surface" />
      </svg>
    </span>
  )
}

// 줄 오른쪽 '입지 분석에서 보기' + 오른쪽 화살표(시안 .go · ICON.right)
function Go() {
  return (
    <span className="inline-flex items-center gap-0.5 text-small leading-5.5 font-medium whitespace-nowrap text-accent">
      <span>입지 분석에서 보기</span>
      <svg aria-hidden="true" width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M6 3.5 10.5 8 6 12.5" />
      </svg>
    </span>
  )
}

export function LocationAlert({ events, onClose }: { events: readonly LocationEvent[]; onClose: (id: string) => void }) {
  if (events.length === 0) return null
  const lines = [...events].sort(recentFirst)
  const rest = lines.length - SHOWN
  return (
    <div role="status" aria-label="입지 알림" className="mt-3 max-w-130 rounded-control bg-canvas [[role=status]+&]:mt-2">
      {lines.slice(0, SHOWN).map((e, i) => (
        <div key={e.id} className={i === 0 ? LINE : `${LINE} ${DIVIDED}`}>
          <a href={detailHref(e.candidateId)} className={ROW}>
            <Pin />
            <span className={TEXT}>
              {e.kind === 'open' ? '저장한 후보 둘레에' : '저장한 후보 둘레에서'} {subjectOf(e)}{' '}
              <b className="font-semibold text-warning">{e.kind === 'open' ? '새로 문을 열었어요' : '문을 닫았어요'}</b>
              <small className="block text-small text-ink-2">{detailOf(e)}</small>
            </span>
            <Go />
          </a>
          <button type="button" className={CLOSE} aria-label={`${e.clinicName} 알림 닫기`} onClick={() => onClose(e.id)}>
            닫기
          </button>
        </div>
      ))}
      {rest > 0 && (
        // eslint-disable-next-line @next/next/no-html-link-for-pages -- 일부러 새 문서로 연다(입지 화면만 카카오 CSP, 위 주석)
        <a href="/location" className={`${MORE} ${DIVIDED}`}>
          <Pin />
          <span className={TEXT}>… {rest}건 더</span>
          <Go />
        </a>
      )}
    </div>
  )
}
