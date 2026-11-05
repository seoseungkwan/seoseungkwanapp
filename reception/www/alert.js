// 새 접수 알림 (design.md 10절·결정 '알림 소리는 첫 누름으로 연다', REQ-1408). 화면이 열려 고리가 도는 동안만 알린다.
// - 읽기마다 판의 화면 열쇠(k)를 모든 목록(진료 순서·칸 넷)에서 모아 바로 앞 읽기와 견준다.
//   앞에 없던 열쇠가 있으면 한 번 알린다. 새 접수가 여럿이어도 한 번이다. 칸만 옮긴 환자는 열쇠가 같아 알리지 않는다(AC-1408.1)
// - 처음 열 때·끊김에서 돌아온 때·다시 보인 때의 첫 읽기(info.first)는 알리지 않고 그 판을 기준으로 삼는다(AC-1408.2).
//   기준이 없을 때(처음 만든 뒤·forget() 뒤)도 같다
// - 알리는 법: navigator.vibrate가 있으면(안드로이드) [200, 100, 200]으로 떤다. 없으면(아이폰) Web Audio로 880Hz 150ms 삐를 두 번 낸다(AC-1408.3)
// - 소리는 첫 누름에 연다(AC-1408.4): listen(document)이 누름(pointerup·touchend·click·keydown)마다 unlock()을 불러 그 누름 안에서
//   AudioContext를 만들고 resume()한다(옛 아이폰을 위해 들리지 않는 1표본도 낸다). 그 전의 알림은 소리 없이 지나간다.
//   소리가 다시 막힌 때(suspended·interrupted)의 알림은 다시 열어 보기만 하고 소리를 미뤄 두지 않는다(나중에 누를 때 옛 알림이 울리지 않는다).
//   떨기는 열 일이 없다(누르기 전 떨기는 기기가 막는다). 화면 글은 더하지 않는다
// - 알림이 실패해도(기기가 막음·오디오 오류) 던지지 않는다. draw 안에서 던지면 고리가 화면을 지운다(poll.js)
// - 앞 열쇠 모음은 메모리에만 둔다. 끊김·숨김 때 forget()으로 버린다(design.md 10절 상태)
//
// 쓰는 법 (app.js)
//   const notice = createAlert()            기본은 브라우저의 navigator·AudioContext(없으면 webkitAudioContext)
//   notice.listen(document)                 첫 누름에 소리 열기. 그만 들을 때 부를 함수를 돌려준다
//   createPoll({ …, draw: (board, info) => { notice.check(board, info); … }, wipe: () => { notice.forget(); … } })
//   notice.check(board, info) → boolean     새 접수를 알렸으면 true. info는 poll.js draw의 info({ first })
//   notice.unlock()                         소리 열기. 누름 안에서 불러야 한다(listen이 부른다)
//   notice.forget()                         앞 열쇠 모음 버리기(다음 읽기가 기준이 된다)

/** 떨기 무늬(ms): 떨기 · 쉼 · 떨기 (AC-1408.3) */
export const VIBRATE_PATTERN = Object.freeze([200, 100, 200])
/** 삐 높이(Hz)·길이(ms)·두 삐 사이 쉼(ms) (AC-1408.3) */
export const BEEP_HZ = 880
export const BEEP_MS = 150
export const BEEP_GAP_MS = 100
const BEEP_COUNT = 2
const BEEP_VOLUME = 0.3
/** 브라우저가 '사용자가 누름'으로 치는 일들. 아이폰은 touchend·click, 크롬은 pointerup·keydown도 친다 */
const UNLOCK_EVENTS = ['pointerup', 'touchend', 'click', 'keydown']

/** 판의 모든 목록에서 화면 열쇠를 모은다 */
function keysOf(board) {
  const keys = new Set()
  const lists = board && typeof board === 'object' ? board.lists : null
  if (!lists || typeof lists !== 'object') return keys
  for (const rows of Object.values(lists)) {
    if (!Array.isArray(rows)) continue
    for (const row of rows) if (row && typeof row.k === 'string') keys.add(row.k)
  }
  return keys
}

/**
 * 새 접수 알림을 만든다.
 * @param {{ navigator?: { vibrate?: Function }, AudioContext?: Function }} [deps] 바꿔 끼우기(기본은 브라우저 것)
 */
export function createAlert({
  navigator: device = globalThis.navigator,
  AudioContext: Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext,
} = {}) {
  /** 앞 읽기의 열쇠 모음. null이면 기준이 없다 */
  let seen = null
  /** 첫 누름에 만든 오디오. 그 전에는 null(소리 없음) */
  let audio = null

  const canVibrate = () => typeof device?.vibrate === 'function'

  function check(board, info) {
    const keys = keysOf(board)
    const before = seen
    seen = keys
    if (info?.first === true || before === null) return false
    for (const k of keys) {
      if (!before.has(k)) {
        ring()
        return true
      }
    }
    return false
  }

  function ring() {
    try {
      if (canVibrate()) device.vibrate([...VIBRATE_PATTERN])
      else beep()
    } catch {
      // 기기가 막거나 오류가 나면 조용히 지나간다
    }
  }

  function beep() {
    if (!audio) return // 아직 한 번도 누르지 않음
    if (audio.state !== 'running') {
      reopen()
      return
    }
    const t0 = audio.currentTime
    for (let i = 0; i < BEEP_COUNT; i += 1) {
      const start = t0 + (i * (BEEP_MS + BEEP_GAP_MS)) / 1000
      const tone = audio.createOscillator()
      const volume = audio.createGain()
      tone.type = 'sine'
      tone.frequency.value = BEEP_HZ
      volume.gain.value = BEEP_VOLUME
      tone.connect(volume)
      volume.connect(audio.destination)
      tone.start(start)
      tone.stop(start + BEEP_MS / 1000)
    }
  }

  /** 막힌 오디오를 다시 열어 본다. 누름 밖이면 기기가 막을 수 있다 */
  function reopen() {
    const resumed = audio.resume()
    if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {})
  }

  function unlock() {
    try {
      if (canVibrate() || typeof Audio !== 'function') return
      if (!audio || audio.state === 'closed') audio = new Audio()
      if (audio.state === 'running') return
      reopen()
      // 옛 아이폰은 누름 안에서 소리를 하나 내야 열린다: 들리지 않는 1표본
      const silent = audio.createBufferSource()
      silent.buffer = audio.createBuffer(1, 1, 22050)
      silent.connect(audio.destination)
      silent.start(0)
    } catch {
      // 다음 누름에 다시 열어 본다
    }
  }

  function listen(target = globalThis.document) {
    if (!target || typeof target.addEventListener !== 'function') return () => {}
    const options = { capture: true, passive: true }
    for (const type of UNLOCK_EVENTS) target.addEventListener(type, unlock, options)
    return () => {
      for (const type of UNLOCK_EVENTS) target.removeEventListener(type, unlock, options)
    }
  }

  function forget() {
    seen = null
  }

  return { check, unlock, listen, forget }
}
