import type { ReactNode } from 'react'
import { ui } from '@/components/ui/classes'
import { MIN_EXTENSION, MIN_HELPER } from '@/lib/bridge/versions'
import { errorInfo, isErrorCode } from '@/lib/errors'
import type { HelloResult } from '@/types/bridge'
import { HELPER_RELEASES_URL } from './links'
import type { StepGuideKind } from './steps'

// 안 된 단계 아래 안내 상자(목업 화면 1 '.guide': danger-soft·6px·안쪽 12px 14px, 굵은 첫 줄 danger, 순서 글 table ink-2, 단추 줄).
// 굵은 첫 줄은 그 번호의 errors.ts '무엇이'다. 순서 글은 설치·등록 방법(목업 문구, 도우미 zip 설치는 helper/install/README.md 순서)이다

type GuideProps = {
  kind: StepGuideKind
  code?: string
  hello: HelloResult | null
  storeUrl: string | null
  disabled: boolean
  onRetry(): void
  onRegister(): void
}

// 바깥 주소로 가는 단추 모양 링크. 새 탭으로 열고 이 창(연결)은 그대로 둔다. 랜딩 a 규칙(밑줄)이 닿지 않게 no-underline
function OutLink({ href, primary = true, children }: { href: string; primary?: boolean; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${primary ? ui.button.primarySmall : ui.button.secondarySmall} no-underline`}
    >
      {children}
    </a>
  )
}

/** 안내 글 안의 버전 숫자(목업: 굵은 ink) */
const V = ({ children }: { children: ReactNode }) => <b className="font-semibold text-ink">{children}</b>

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="grid list-decimal gap-0.5 pl-4.5 text-table text-ink-2">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  )
}

export function StepGuide({ kind, code, hello, storeUrl, disabled, onRetry, onRegister }: GuideProps) {
  const retry = (
    <button type="button" className={ui.button.secondarySmall} onClick={onRetry} disabled={disabled}>
      다시 확인
    </button>
  )
  const register = (label: '처음 등록' | '다시 등록') => (
    <button type="button" className={ui.button.primarySmall} onClick={onRegister} disabled={disabled}>
      {label}
    </button>
  )
  const extensionZip = <OutLink href={HELPER_RELEASES_URL}>확장 내려받기</OutLink>

  let items: ReactNode[] = []
  let actions: ReactNode = retry
  switch (kind) {
    case 'install-extension':
      items = storeUrl
        ? [
            '[확장 설치하러 가기]를 눌러 크롬 웹스토어를 여세요. 이 확장은 웹스토어 검색에 나오지 않아서 꼭 이 단추로 열어야 해요.',
            '[Chrome에 추가]를 누르세요.',
            '이 화면으로 돌아와 [다시 확인]을 누르세요.',
          ]
        : [
            '[확장 내려받기]를 눌러 precheck-extension-버전.zip을 받고, 오른쪽 클릭 → [모두 압축 풀기]로 푸세요.',
            '크롬 주소창에 chrome://extensions 를 넣고, 오른쪽 위 [개발자 모드]를 켜세요.',
            '[압축해제된 확장 프로그램을 로드합니다]를 눌러 푼 폴더를 고르세요.',
            '이 화면으로 돌아와 [다시 확인]을 누르세요.',
          ]
      actions = (
        <>
          {storeUrl ? <OutLink href={storeUrl}>확장 설치하러 가기</OutLink> : extensionZip}
          {retry}
        </>
      )
      break
    case 'update-extension':
      items = [
        <>
          이 PC 확장은 <V>{hello?.extensionVersion ?? '—'}</V>이에요. <V>{MIN_EXTENSION}</V> 이상이 필요해요.
        </>,
        storeUrl
          ? '크롬 주소창에 chrome://extensions 를 넣고, 오른쪽 위 [개발자 모드]를 켠 뒤 [업데이트]를 누르세요.'
          : '[확장 내려받기]로 새 zip을 받아 푼 뒤, chrome://extensions 에서 [압축해제된 확장 프로그램을 로드합니다]로 다시 불러오세요.',
        '이 화면으로 돌아와 [다시 확인]을 누르세요.',
      ]
      actions = storeUrl ? (
        retry
      ) : (
        <>
          {extensionZip}
          {retry}
        </>
      )
      break
    case 'install-helper':
      items = [
        '[도우미 내려받기]를 눌러 precheck-helper-버전.zip을 받으세요.',
        '받은 zip을 오른쪽 클릭 → [모두 압축 풀기]로 푼 뒤, 푼 폴더의 install.cmd를 두 번 누르세요. "Windows의 PC 보호" 창이 뜨면 [추가 정보]를 누른 뒤 [실행]을 누르세요.',
        '설치가 끝나면 [다시 확인]을 누르세요. 크롬은 다시 켤 필요가 없어요.',
      ]
      actions = (
        <>
          <OutLink href={HELPER_RELEASES_URL}>도우미 내려받기</OutLink>
          {retry}
        </>
      )
      break
    case 'update-helper':
      items = [
        <>
          이 PC 도우미는 <V>{hello?.helperVersion ?? '—'}</V>이에요. <V>{MIN_HELPER}</V> 이상이 필요해요.
        </>,
        '[새 도우미 내려받기]를 눌러 설치하면 예전 것을 바꿔요. 고치던 메모는 그대로 남아요.',
        '설치가 끝나면 [다시 확인]을 누르세요.',
      ]
      actions = (
        <>
          <OutLink href={HELPER_RELEASES_URL}>새 도우미 내려받기</OutLink>
          {retry}
        </>
      )
      break
    case 'register':
      items = [
        '[처음 등록]을 누르면 이 PC에 비트 로그인 창이 떠요. 비트에 로그인하세요.',
        '이 PC에 뜨는 확인 창에서 기관기호를 보고 [확인]을 누르세요.',
      ]
      actions = (
        <>
          {register('처음 등록')}
          {retry}
        </>
      )
      break
    case 'reregister':
      items = [
        '[다시 등록]을 누르면 이 PC에 비트 로그인 창이 떠요. 비트에 로그인하세요.',
        '이 PC에 뜨는 확인 창에서 전 등록 값과 새 값을 보고 [확인]을 누르세요.',
      ]
      actions = (
        <>
          {register('다시 등록')}
          {retry}
        </>
      )
      break
    case 'retry':
      break
  }

  const what = code && isErrorCode(code) ? errorInfo(code).what : null
  return (
    <div className="col-start-2 col-end-4 mt-2 grid gap-2 rounded-card bg-danger-soft px-3.5 py-3 max-md:col-start-1">
      {what && <p className="text-body font-semibold text-danger">{what}</p>}
      {items.length > 0 && <Steps items={items} />}
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  )
}
