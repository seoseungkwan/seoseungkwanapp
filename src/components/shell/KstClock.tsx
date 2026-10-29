'use client'

import { useEffect, useState } from 'react'
import { kstNow } from './kstNow'

const MINUTE = 60_000
// 분 단위로 자른 순간. <time dateTime>과 화면 글자가 같은 분을 가리킨다
const thisMinute = () => new Date(Math.floor(Date.now() / MINUTE) * MINUTE)

// 위쪽 띠 오른쪽 한국 시각 (AC-008.6). 서버·브라우저 모두 kstNow를 그리고, 분이 바뀔 때마다 새로 그린다.
// 서버와 브라우저가 분 경계에서 다를 수 있어 이 <time> 하나만 suppressHydrationWarning(design.md '한국 시각').
// 시각이 바뀌는 것은 자동 로그아웃의 '움직임'이 아니다(이벤트를 내지 않는다). 폰에서는 숨긴다(AC-008.7)
export function KstClock() {
  const [now, setNow] = useState(thisMinute)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    // 다음 분 경계에 맞춰 다시 그린다(1분마다 setInterval이면 최대 59초 늦다)
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(thisMinute())
        schedule()
      }, MINUTE - (Date.now() % MINUTE))
    }
    // 서버가 그린 값이 늦었을 수 있다 → 브라우저 시각으로 한 번 맞춘다
    setNow(thisMinute())
    schedule()
    // 앱 화면을 떠나면 타이머를 푼다
    return () => clearTimeout(timer)
  }, [])

  return (
    <time
      dateTime={now.toISOString()}
      suppressHydrationWarning
      className="whitespace-nowrap text-table text-muted max-md:hidden"
    >
      {kstNow(now)}
    </time>
  )
}
