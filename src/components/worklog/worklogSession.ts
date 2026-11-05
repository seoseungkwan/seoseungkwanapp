import { saveWorklogDay } from '@/lib/storage/worklogDays'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { createAutosave } from '@/lib/worklog/autosave'

// 자동 저장 제어 한 벌과 창 이벤트 듣기 (specs/worklog/design.md 10·11-3절).
// 화면 밖 모듈에 두는 까닭: 앱 안 다른 탭으로 옮겨 화면이 내려가도 저장·다시 하기·떠나기 확인·로그아웃 처리가 이어져야 한다(AC-010.11)

type WorklogAutosave = ReturnType<typeof createAutosave>

let autosave: WorklogAutosave | null = null
let stopSession: (() => void) | null = null
const signedOutListeners = new Set<() => void>()

// 비트 칸 목록은 자동 저장이 바뀌었다고 넘길 때만 넷째 인자로 보낸다. 모르거나 안 바뀌었으면 인자 셋으로 불러
// bit_fields 칸이 가지 않는다(저장된 비트 표시를 지우지 않는다, AC-017.7).
// 업무사항 글씨 크기도 넘겨받을 때만 다섯째 인자로 보낸다(목록이 없으면 넷째는 undefined). 아니면 지금과 같은 인자 수다(worklog-memo-font AC-1508.8)
export function worklogAutosave(): WorklogAutosave {
  autosave ??= createAutosave({
    save: (ymd, changes, bitFields, memoFontPt) =>
      memoFontPt !== undefined
        ? saveWorklogDay(supabaseBrowser(), ymd, changes, bitFields, memoFontPt)
        : bitFields === undefined
          ? saveWorklogDay(supabaseBrowser(), ymd, changes)
          : saveWorklogDay(supabaseBrowser(), ymd, changes, bitFields),
  })
  return autosave
}

/** beforeunload·online·SIGNED_OUT 듣기를 한 번만 건다. 화면은 돌려준 함수를 부르지 않는다(시험 정리용) */
export function startWorklogSession(): () => void {
  if (stopSession) return stopSession
  const control = worklogAutosave()

  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!control.hasUnsaved()) return
    event.preventDefault()
    event.returnValue = ''
  }
  const onOnline = () => control.online()

  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('online', onOnline)
  const {
    data: { subscription },
  } = supabaseBrowser().auth.onAuthStateChange((event) => {
    if (event !== 'SIGNED_OUT') return
    // 떠나기 확인을 먼저 뗀다: 남아 있으면 IdleLogout의 /login 이동이 막혀 공용 PC 화면에 일지가 남는다(AC-010.12)
    stop()
    control.dispose()
    for (const listener of [...signedOutListeners]) listener()
  })

  // 세션을 통째로 끝낸다: 다시 로그인해 화면을 열면 떠나기 확인부터 새로 건다
  const stop = () => {
    if (stopSession !== stop) return
    stopSession = null
    window.removeEventListener('beforeunload', onBeforeUnload)
    window.removeEventListener('online', onOnline)
    subscription.unsubscribe()
  }
  stopSession = stop
  return stop
}

/** 로그아웃 때 화면 값을 지우려고 화면이 걸어 둔다. 제어를 비운 뒤에 불린다 */
export function onWorklogSignedOut(listener: () => void): () => void {
  signedOutListeners.add(listener)
  return () => {
    signedOutListeners.delete(listener)
  }
}
