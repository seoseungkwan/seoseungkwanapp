// 주소 보내기 화면(/link, design.md 8절, AC-1411.4)의 [주소 복사] 단추만. 화면 글은 도우미(LinkPage.cs)가 그린다.
// 이 화면은 이 PC 자신(127.0.0.1)에서만 열려 안전한 곳이라 클립보드가 된다. 복사할 주소는 단추의 data-url에서 읽는다(글자로 적어 두지 않는다).
// - 누르면 navigator.clipboard.writeText(주소) → 단추 글 "복사했어요" 2초 → "주소 복사"(또 누르면 2초를 새로 센다)
// - 클립보드가 없거나 거절·던지면 그 카드의 주소 글을 골라 두고(Selection) 안내 글을 보인다. 사용자가 Ctrl+C로 복사한다

const LABEL = '주소 복사'
const COPIED = '복사했어요'
const PICKED = '주소를 골라 두었어요. Ctrl+C를 눌러 복사해 주세요'
const COPIED_MS = 2000

/**
 * 화면의 주소 카드(.link-card)마다 [주소 복사]를 잇는다.
 * @param {{ doc?: Document, nav?: { clipboard?: { writeText?: (text: string) => Promise<void> } }, win?: Window }} [deps]
 * @returns {{ stop: () => void }}
 */
export function startLink(deps = {}) {
  const doc = deps.doc ?? document
  const nav = deps.nav ?? navigator
  const win = deps.win ?? doc.defaultView ?? window
  const stops = [...doc.querySelectorAll('.link-card')].map((card) => wireCard(card, doc, nav, win))
  return {
    stop() {
      for (const stop of stops) stop()
    },
  }
}

/** 카드 하나: 주소 링크(a.link-url)·단추(button.link-copy)·안내 글(.link-help) */
function wireCard(card, doc, nav, win) {
  const button = card.querySelector('button.link-copy')
  const address = card.querySelector('a.link-url')
  const help = card.querySelector('.link-help')
  if (!button || !address) return () => {}
  let timer = null
  let stopped = false

  async function copy() {
    const url = button.getAttribute('data-url') ?? ''
    let done = false
    try {
      const clipboard = nav.clipboard
      if (url !== '' && clipboard && typeof clipboard.writeText === 'function') {
        await clipboard.writeText(url)
        done = true
      }
    } catch {
      done = false
    }
    if (stopped) return
    if (done) copied()
    else picked()
  }

  function copied() {
    if (help) {
      help.hidden = true
      help.textContent = ''
    }
    button.textContent = COPIED
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      button.textContent = LABEL
    }, COPIED_MS)
  }

  function picked() {
    clearTimer()
    button.textContent = LABEL
    const selection = win.getSelection ? win.getSelection() : null
    if (selection) {
      const range = doc.createRange()
      range.selectNodeContents(address)
      selection.removeAllRanges()
      selection.addRange(range)
    }
    if (help) {
      help.textContent = PICKED
      help.hidden = false
    }
  }

  function clearTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function onClick() {
    void copy()
  }

  button.addEventListener('click', onClick)
  return () => {
    stopped = true
    button.removeEventListener('click', onClick)
    clearTimer()
  }
}

/** 브라우저가 이 파일을 부르면(주소 보내기 화면이면) 바로 잇는다 */
export const link = document.querySelector('.link-page') ? startLink() : null
