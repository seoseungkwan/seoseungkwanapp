import Link from 'next/link'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { DASHBOARD_FEATURES } from './features'
import { ARROW_MOVE, PRESS, SECTION, SECTION_HEAD, SECTION_TITLE } from './layout'

// 지금 바로 쓸 수 있어요 — 삭감 예방 사전점검 (tab-frame REQ-316 AC-316.1·316.2, design.md '대시보드 짜임', 메모 §3·§4).
// 두 모양: 연결 전은 브리핑 아래 전체 폭 한 줄(ReadyNowRow), 연결 뒤는 연결 순서 자리(브리핑 오른쪽 칸)의 묶음(ReadyNowSide). 문구는 메모 §4 그대로
const ROW_TITLE_ID = 'dashboard-ready-now-title'
const SIDE_TITLE_ID = 'dashboard-ready-now-side-title'
const KIND = '청구 탭'
const NAME = '삭감 예방 사전점검'
const DESC = '청구하기 전에 삭감될 만한 처방을 미리 찾아 줘요.'
const DESC_SUB = '청구 점검은 비트 PC의 크롬에서 엽니다.'

// 머리 옆 글의 수는 목차 자료에서 센다(기능 수 · 쓸 수 있는 수)
const total = DASHBOARD_FEATURES.length
const ready = DASHBOARD_FEATURES.filter((f) => f.ready).length

// [사전점검 열기]: 보조 단추 + 오른쪽 꾸밈 화살표 16(ink-2, 시안 .btn-sec .ic). 폰은 전체 폭(44px). 브라우저 기본 밑줄이 닿지 않게 no-underline
function OpenPrecheck() {
  return (
    <Link href="/claim" className={`${ds.button.secondary} group no-underline ${PRESS} max-md:w-full`}>
      사전점검 열기
      <Icon name="arrow" size={16} className={`${ARROW_MOVE} text-ink-2`} />
    </Link>
  )
}

// 설명 두 줄: body ink-2 + small muted(위 2)
function Desc() {
  return (
    <>
      <p className="text-body text-ink-2">{DESC}</p>
      <p className="mt-0.5 text-small text-muted">{DESC_SUB}</p>
    </>
  )
}

// 연결 전: 섹션 머리 + 줄 하나(위아래 1px line, 위아래 16 · 폰 12·16).
// 1024px 이상 이름 1~3 · 설명 4~9 · 단추 10~12(오른쪽 끝), 768~1023px 1~4 · 5~9 · 10~12, 폰은 쌓고 단추 전체 폭
export function ReadyNowRow() {
  return (
    <section aria-labelledby={ROW_TITLE_ID} className={SECTION}>
      <div className={SECTION_HEAD}>
        <h2 id={ROW_TITLE_ID} className={SECTION_TITLE}>
          지금 바로 쓸 수 있어요
        </h2>
        <p className="text-small text-muted">
          기능 {total}개 가운데 {ready}개예요. 다른 하나는 위의 비트 PC 연결이에요.
        </p>
      </div>
      <div className="border-y border-line py-4 max-md:pt-3 md:grid md:grid-cols-12 md:items-center md:gap-x-6">
        <div className="flex min-w-0 flex-col gap-0.5 md:col-span-4 lg:col-span-3">
          <span className="text-caption font-medium text-muted">{KIND}</span>
          <span className="text-subtitle font-semibold text-ink">{NAME}</span>
        </div>
        <div className="min-w-0 max-md:mt-1 md:col-span-5 md:col-start-5 lg:col-span-6 lg:col-start-4">
          <Desc />
        </div>
        <div className="max-md:mt-3 md:col-span-3 md:col-start-10 md:justify-self-end">
          <OpenPrecheck />
        </div>
      </div>
    </section>
  )
}

// 연결 뒤(브리핑 오른쪽 칸): 머리(small 600 · 폰 title) · 오른쪽 "청구 탭", 아래 8 + 1px line-strong(폰 선 없음) →
// 위 12에 이름 → 설명(위 4) → 단추 줄(위 16, 사이 8·16): [사전점검 열기] 보조 + [비트 PC 연결 다시 확인] 글자 단추. 폰은 둘 다 전체 폭으로 쌓는다.
// 글자 단추 밑줄은 색이 투명 → 글자색으로 바뀐다(150ms, 메모 §7)
export function ReadyNowSide() {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-line-strong pb-2 max-md:border-b-0 max-md:pb-0">
        <h2 id={SIDE_TITLE_ID} className="text-small font-semibold text-ink max-md:text-title">
          지금 바로 쓸 수 있어요
        </h2>
        <span className="text-small font-medium text-muted">{KIND}</span>
      </div>
      <div className="pt-3">
        <p className="text-subtitle font-semibold text-ink">{NAME}</p>
        <div className="mt-1">
          <Desc />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 max-md:grid max-md:gap-1">
          <OpenPrecheck />
          <Link
            href="/claim/setup"
            className={`${ds.textButton} ${PRESS} underline decoration-transparent not-disabled:not-aria-disabled:hover:decoration-current max-md:w-full max-md:justify-center`}
          >
            비트 PC 연결 다시 확인
          </Link>
        </div>
      </div>
    </div>
  )
}
