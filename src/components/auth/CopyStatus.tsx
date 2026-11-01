'use client'

import { useState } from 'react'

// 주소 [주소 복사]의 결과 (ui-90 AC-419.5, UI_GUIDE '인증 화면'). 로그인 앱 안 브라우저 안내의 로그인 주소와 거절 화면의 관리자 메일이 같이 쓴다.
// 결과 줄은 처음부터 있는 role="status" <p>라 화면 읽기가 바뀐 글을 읽어 준다. 복사가 막혀도 주소는 화면에 늘 보인다
export type CopyResult = 'done' | 'failed' | null

/** [결과, 복사하기]. 오류 내용은 보이지 않고 결과만 남긴다 */
export function useCopy(text: string): [CopyResult, () => Promise<void>] {
  const [result, setResult] = useState<CopyResult>(null)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setResult('done')
    } catch {
      setResult('failed')
    }
  }
  return [result, copy]
}

// 결과 줄. 모양(여백·글자)은 놓는 자리가 className으로 정한다
export function CopyStatus({ result, className }: { result: CopyResult; className: string }) {
  return (
    <p role="status" className={className}>
      {result === 'done' && <span className="font-medium text-positive">복사했어요.</span>}
      {result === 'failed' && '복사하지 못했어요. 위 주소를 길게 눌러 복사해 주세요.'}
    </p>
  )
}
