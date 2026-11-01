import Link from 'next/link'
import { ds } from '@/components/ui/classes'
import { RequestedPath } from './RequestedPath'

// 없는 주소 화면 (ui-90 REQ-410, design.md '없는 주소 (TASK-7)', UI_GUIDE '오류 카드·확인 창' 없는 주소 화면).
// 시안 docs/mockups/ui-90/entry/screens.mjs notFoundIn(앱 안)·notFoundOut(밖)의 글자 그대로다. 서버에서 그린다. 자료를 읽지 않는다
// (Supabase·문지기·fetch 없음). 열려던 주소 자리만 브라우저 부품(RequestedPath)이다.
// - app: (app)/not-found.tsx가 앱 틀 안에서 쓴다. 패널 하나(ds.panel) 안에 가운데 정렬 — 상자 안 상자 없음
// - outside: 뿌리 not-found.tsx가 한 칸 AuthFrame 안에서 쓴다. 상자 없이 480 칸에 바로 놓는다(승인 대기 화면과 같은 짜임)
// 시안 단계 밖 값은 가까운 간격 단계로 옮겼다: 앱 안 패널 위아래 40 → 48(py-12), 좌우 32 · 휴대폰 32·16은 그대로

export type NotFoundWhere = 'outside' | 'app'

const LEAD = 'mt-2 text-body text-ink-2'
// 열려던 주소 줄(위 16): 이름표(small muted) + 경로, 줄바꿈 사이 4 · 옆 사이 12
const ADDR = 'mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1'
const ADDR_LABEL = 'text-small text-muted'

// 이름표와 경로 사이 빈칸 하나: 화면 읽기·복사에서 둘이 붙지 않게(flex 안이라 보이는 간격은 gap이 준다)
function AddressLine({ className }: { className: string }) {
  return (
    <p className={className}>
      <span className={ADDR_LABEL}>열려던 주소</span>{' '}
      <RequestedPath />
    </p>
  )
}

// 앱 안(시안 notFoundIn): 최대 640 · 가운데 · 위 24(휴대폰 0) · 안쪽 위아래 48 좌우 32(휴대폰 32·16)
function InApp() {
  return (
    <div
      className={`${ds.panel} mx-auto mt-6 flex max-w-160 flex-col items-center px-8 py-12 text-center max-md:mt-0 max-md:px-4 max-md:py-8`}
    >
      <span className={ds.chip.neutral}>없는 주소</span>
      <h1 className="mt-3 text-title font-semibold text-ink">찾는 화면이 없어요</h1>
      <p className={LEAD}>주소가 바뀌었거나 잘못 적힌 것 같아요. 위 탭에서 가려는 화면을 고르거나 대시보드로 가 주세요.</p>
      <AddressLine className={`${ADDR} justify-center`} />
      <Link href="/dashboard" className={`${ds.button.primaryLarge} mt-6 max-md:w-full`}>
        대시보드로 가기
      </Link>
    </div>
  )
}

// 밖 단추: 휴대폰은 두 단추가 140px부터 나눠 늘어난다(시안 .col480.ph .btns .btn)
const OUT_BUTTON = 'max-md:flex-[1_1_140px]'

// 밖(시안 notFoundOut): 칩 줄(위 24) → h1(heading-m → 768px 이상 heading) → 안내 → 열려던 주소 → 단추 줄(위 24 · 사이 8)
function Outside() {
  return (
    <div className="flex min-w-0 flex-col">
      <p className="mt-6 flex items-center gap-2">
        <span className={ds.chip.neutral}>없는 주소</span>
      </p>
      <h1 className="mt-2 text-heading-m font-semibold text-ink md:text-heading">찾는 화면이 없어요</h1>
      <p className={LEAD}>주소가 바뀌었거나 잘못 적힌 것 같아요. 처음 화면에서 다시 시작해 주세요.</p>
      <AddressLine className={ADDR} />
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/" className={`${ds.button.primaryLarge} ${OUT_BUTTON}`}>
          처음 화면으로
        </Link>
        {/* 보조 큰 단추: ds에 이름이 따로 없어 같은 값(보조 색 × 큰 크기)인 googleLarge 묶음을 쓴다 */}
        <Link href="/login" className={`${ds.button.googleLarge} ${OUT_BUTTON}`}>
          로그인
        </Link>
      </div>
    </div>
  )
}

export function NotFoundScreen({ where }: { where: NotFoundWhere }) {
  return where === 'app' ? <InApp /> : <Outside />
}
