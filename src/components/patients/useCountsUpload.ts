'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { upsertContactCount } from '@/lib/storage/contactCounts'
import type { ErrorCode } from '@/types/errors'
import type { ContactCount } from '@/types/patients'

// 연락 남은 건수 올리기(REQ-614). 서버에는 정수 둘만 간다: upsertContactCount가 checkContactCount를 거친 새 객체만 보내고, 다른 칸이 있으면 아무것도 보내지 않는다(ADR-021).
// counts가 null이면(한 명단만·한 종류 실패·연락 표시 못 불러옴·다시 읽는 중) 아무것도 보내지 않는다. null은 값이 아니라 '지금은 모른다'라서 기록을 지우지 않는다: 같은 값이 돌아오면 또 보내지 않는다.
//
// 요청은 한 번에 하나만 내보낸다. 나가 있는 사이 값이 바뀌면 답이 온 뒤 마지막 값만 보낸다: 먼저 보낸 요청이 나중에 서버에 닿아 옛 값이 남는 일이 없고, 옛 값의 실패는 오류가 아니다.
// 실패는 저절로 다시 보내지 않는다. 다시 그려도, 같은 값이 다시 와도 그대로고 [다시 올리기](retry)로만 보낸다. 다른 값이 오면 그 값을 보내고, 그 값이 저장되어야 오류가 지워진다.
// 화면을 떠나도 나가 있는 답 뒤의 마지막 값은 보낸다(휴대폰이 옛 수를 보지 않게). 그래서 정리 함수로 끊지 않는다

const SAVE_ERROR: ErrorCode = 'E-PATIENTS-COUNTS-SAVE'

type Upload = {
  sb: SupabaseClient
  /** Worker가 준 마지막 값. null로 지우지 않는다 */
  latest: ContactCount | null
  /** 지금 Worker 건수가 null이 아니다. 거짓이면 아무것도 보내지 않는다 */
  ready: boolean
  sending: boolean
  /** 서버에 있다고 믿는 값. 실패하면 null이다: 답만 잃고 서버에는 닿았을 수 있으니 그 전 값과 같아도 믿지 않는다 */
  saved: ContactCount | null
  /** 실패한 값. 이 값은 [다시 올리기]를 눌러야 다시 보낸다 */
  failed: ContactCount | null
}

// Object.is: NaN이 자기와 같아야 거절된 값을 끝없이 다시 보내지 않는다
const same = (a: ContactCount | null, b: ContactCount | null) =>
  a !== null && b !== null && Object.is(a.followup_left, b.followup_left) && Object.is(a.injection_left, b.injection_left)

export function useCountsUpload(sb: SupabaseClient, counts: ContactCount | null): { error: ErrorCode | null; retry(): void } {
  const [error, setError] = useState<ErrorCode | null>(null)
  const uploadRef = useRef<Upload>({ sb, latest: null, ready: false, sending: false, saved: null, failed: null })

  const send = useCallback(() => {
    const upload = uploadRef.current
    const value = upload.latest
    if (upload.sending || !upload.ready || value === null || same(value, upload.saved) || same(value, upload.failed)) return
    upload.sending = true
    void upsertContactCount(upload.sb, value)
      .then(
        () => true,
        () => false, // 오류 내용은 어디에도 싣지 않는다. 번호 하나로만 보인다
      )
      .then((ok) => {
        upload.sending = false
        upload.saved = ok ? value : null
        upload.failed = ok ? null : value
        // 그 사이 값이 바뀌었으면 그 값의 답이 오류 줄을 정한다. null인 동안의 실패는 아직 지금 값의 오류가 아니다: 그 값이 돌아오면 effect가 보인다
        if (same(upload.latest, value) && (ok || upload.ready)) setError(ok ? null : SAVE_ERROR)
        send()
      })
  }, [])

  useEffect(() => {
    const upload = uploadRef.current
    upload.sb = sb
    upload.ready = counts !== null
    if (counts !== null) upload.latest = counts
    if (same(counts, upload.failed)) setError(SAVE_ERROR)
    send()
  }, [sb, counts, send])

  const retry = useCallback(() => {
    const upload = uploadRef.current
    if (upload.sending || !upload.ready || !same(upload.latest, upload.failed)) return
    upload.failed = null
    send()
  }, [send])

  // 보낼 값이 없는 동안에는 눌러도 소용없으니 줄을 내린다. 값이 돌아오면 그대로 다시 보인다
  return { error: counts === null ? null : error, retry }
}
