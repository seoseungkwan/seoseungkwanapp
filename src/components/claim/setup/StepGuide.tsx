import type { ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { errorInfo, isErrorCode } from '@/lib/errors'
import { HELPER_RELEASES_URL } from './links'
import type { ProblemGuideKind, StepGuideKind } from './steps'

// 비트 PC 연결 단계 안내 (ui-90 REQ-412, 시안 docs/mockups/ui-90/app/gen.py setup_body '.howto'·'.errc-a').
// - StepGuide: "할 차례" 단계 줄 아래 안내 상자(canvas·4px·안쪽 16px, 폰 12px). 순서 글(body ink-2) + 단추 줄([…내려받기]·[처음 등록] 주 · [다시 확인] 보조).
//   다시 확인으로 풀리는 실패(retry)는 errors.ts '무엇이'·'어떻게'와 오류 번호를 한 번 보이고 [다시 확인]만 둔다
// - ProblemActions: 진짜 문제(버전 안 맞음·의원 다름)의 단추 둘. 위 오류 상자(SetupAlert)의 단추 줄에 들어가고 그 단계 줄에는 단추가 없다
// - HelperUpdateSteps: 도우미 업데이트 순서 글. 위 오류 상자(SetupAlert) 안에 넣는다
// 단추는 기본 크기(36px), 768px 미만은 44px 전체 폭이다. 주 단추는 한 화면에 하나다

type ActionProps = {
  storeUrl: string | null
  disabled: boolean
  onRetry(): void
  onRegister(): void
}

// 바깥 주소로 가는 단추 모양 링크. 새 탭으로 열고 이 창(연결)은 그대로 둔다. 랜딩 a 규칙(밑줄)이 닿지 않게 no-underline
function OutLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${ds.button.primary} no-underline max-md:w-full`}>
      {children}
    </a>
  )
}

function RetryButton({ disabled, onRetry }: Pick<ActionProps, 'disabled' | 'onRetry'>) {
  return (
    <button type="button" className={`${ds.button.secondary} max-md:w-full`} onClick={onRetry} disabled={disabled}>
      다시 확인
    </button>
  )
}

function RegisterButton({ label, disabled, onRegister }: { label: '처음 등록' | '다시 등록' } & Pick<ActionProps, 'disabled' | 'onRegister'>) {
  return (
    <button type="button" className={`${ds.button.primary} max-md:w-full`} onClick={onRegister} disabled={disabled}>
      {label}
    </button>
  )
}

/** 단추 줄: 사이 8px, 768px 미만은 한 줄에 하나씩(전체 폭) */
export const actionsRow = 'mt-3 flex flex-wrap gap-2 max-md:grid'

/** 확장 받는 단추: 웹스토어 주소가 있으면 [확장 설치하러 가기], 없으면 릴리스의 확장 zip [확장 내려받기] */
const extensionLink = (storeUrl: string | null) =>
  storeUrl ? <OutLink href={storeUrl}>확장 설치하러 가기</OutLink> : <OutLink href={HELPER_RELEASES_URL}>확장 내려받기</OutLink>

/** 진짜 문제의 단추 둘: 내려받기·다시 등록(주) + [다시 확인](보조) */
export function ProblemActions({ kind, storeUrl, disabled, onRetry, onRegister }: { kind: ProblemGuideKind } & ActionProps) {
  return (
    <>
      {kind === 'update-extension' && extensionLink(storeUrl)}
      {kind === 'update-helper' && <OutLink href={HELPER_RELEASES_URL}>새 도우미 내려받기</OutLink>}
      {kind === 'reregister' && <RegisterButton label="다시 등록" disabled={disabled} onRegister={onRegister} />}
      <RetryButton disabled={disabled} onRetry={onRetry} />
    </>
  )
}

// 할 차례 안내 상자: 768px 미만은 번호 칸까지 전체(1~3), 이상은 이름 칸부터 끝까지(2~4). 단계 줄 격자의 넷째 줄(768px 이상 셋째 줄)
const box =
  'col-start-1 col-end-3 row-start-4 mt-3 rounded-control bg-canvas p-4 max-md:p-3 md:col-start-2 md:col-end-4 md:row-start-3'

/** 순서 글 안의 주소(시안 .howto code): surface·1px line·4px, small 500 ink. 고정폭이 아니라 본문 글꼴 */
const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded-control border border-line bg-surface px-1 py-px font-sans text-small font-medium text-ink">{children}</code>
)

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="grid list-decimal gap-1.5 pl-5 text-body text-ink-2 marker:text-muted">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  )
}

/**
 * 도우미 업데이트 순서 3줄(bit-dashboard AC-604.3, 시안 gen.py setup_v). 위 오류 상자(SetupAlert의 steps)에 넣는다.
 * 글이 부르는 단추 [새 도우미 내려받기]·[다시 확인]은 ProblemActions kind="update-helper"다
 */
export function HelperUpdateSteps() {
  return (
    <Steps
      items={[
        '[새 도우미 내려받기]를 눌러 precheck-helper-버전.zip을 받으세요.',
        '받은 zip을 오른쪽 클릭 → [모두 압축 풀기]로 푼 뒤, 푼 폴더의 install.cmd를 두 번 누르세요. "Windows의 PC 보호" 창이 뜨면 [추가 정보]를 누른 뒤 [실행]을 누르세요.',
        '설치가 끝나면 [다시 확인]을 누르세요. 크롬은 다시 켤 필요가 없어요.',
      ]}
    />
  )
}

/** "할 차례" 단계(설치·등록·다시 확인)의 안내. 진짜 문제 종류는 그리지 않는다(위 오류 상자가 맡는다) */
export function StepGuide({ kind, code, storeUrl, disabled, onRetry, onRegister }: { kind: StepGuideKind; code?: string } & ActionProps) {
  const retry = <RetryButton disabled={disabled} onRetry={onRetry} />
  let items: ReactNode[]
  let main: ReactNode
  switch (kind) {
    case 'install-extension':
      items = storeUrl
        ? [
            '[확장 설치하러 가기]를 눌러 크롬 웹스토어를 여세요. 이 확장은 웹스토어 검색에 나오지 않아서 꼭 이 단추로 열어야 해요.',
            '[Chrome에 추가]를 누르세요.',
            '이 화면으로 돌아와 [다시 확인]을 누르세요.',
          ]
        : [
            '[확장 내려받기]를 눌러 파일을 받고, 파일을 오른쪽 클릭해 [모두 압축 풀기]를 눌러요.',
            <>
              크롬 주소창에 <Code>chrome://extensions</Code> 를 넣고, 오른쪽 위 [개발자 모드]를 켜요.
            </>,
            '[압축해제된 확장 프로그램을 로드합니다]를 눌러 방금 푼 폴더를 골라요.',
            '이 화면으로 돌아와 [다시 확인]을 눌러요.',
          ]
      main = extensionLink(storeUrl)
      break
    case 'install-helper':
      items = [
        '[도우미 내려받기]를 눌러 precheck-helper-버전.zip을 받으세요.',
        '받은 zip을 오른쪽 클릭 → [모두 압축 풀기]로 푼 뒤, 푼 폴더의 install.cmd를 두 번 누르세요. "Windows의 PC 보호" 창이 뜨면 [추가 정보]를 누른 뒤 [실행]을 누르세요.',
        '설치가 끝나면 [다시 확인]을 누르세요. 크롬은 다시 켤 필요가 없어요.',
      ]
      main = <OutLink href={HELPER_RELEASES_URL}>도우미 내려받기</OutLink>
      break
    case 'register':
      items = [
        '[처음 등록]을 누르면 이 PC에 비트 로그인 창이 떠요. 비트에 로그인하세요.',
        '이 PC에 뜨는 확인 창에서 기관기호를 보고 [확인]을 누르세요.',
      ]
      main = <RegisterButton label="처음 등록" disabled={disabled} onRegister={onRegister} />
      break
    case 'retry': {
      const info = code && isErrorCode(code) ? errorInfo(code) : null
      return (
        <div className={box}>
          {info && <p className="text-body font-semibold text-ink">{info.what}</p>}
          {info && <p className="mt-0.5 text-body text-ink-2">{info.fix}</p>}
          {code && <p className="mt-1 text-caption text-ink-2">오류 번호 {code}</p>}
          <div className={actionsRow}>{retry}</div>
        </div>
      )
    }
    default:
      return null
  }
  return (
    <div className={box}>
      <Steps items={items} />
      <div className={actionsRow}>
        {main}
        {retry}
      </div>
    </div>
  )
}
