// 'ERP 마감일지 입력 목록' 서비스 워커(spec erp-copy-list design.md 3절, AC-3901.3)
// - 지금 확장의 도우미 통로를 고치지 않고 불러 그대로 켠다(그 모듈 맨 아래 스스로 켜기가 맨 위에서 onMessage를 건다).
//   그래서 이 확장의 목록 화면·설정 화면이 보낸 { cmd: closing.codes | closing.day | closing.findCodes, args }와 { open: 'options' }만 받고,
//   답 모양·120초·오류 번호가 지금 확장과 같다. 남의 확장·웹 페이지가 보낸 것은 그 통로가 받지 않는다(sender.id 검사)
// - 확장 아이콘을 누르면 목록 화면(list.html)을 새 탭으로 연다(tabs 권한 없이 tabs.create). ID가 고정이라 그 주소는 즐겨찾기로도 열린다
// 지금 도우미 통로(그대로)
import '../../extension-erp/src/background.js'

/** 아이콘을 누르면 여는 화면 */
export const LIST_PAGE = 'list.html'

/** 이 서비스 워커가 쓰는 chrome의 모양만. 시험은 이 모양의 가짜를 넣는다 */
export type ListBackgroundChrome = {
  runtime: { getURL(path: string): string }
  action: { onClicked: { addListener(callback: () => void): void } }
  tabs: { create(props: { url: string }): Promise<unknown> }
}

/** 아이콘 누름 → 새 탭으로 목록 화면 */
export function startListBackground(chrome: ListBackgroundChrome): void {
  chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL(LIST_PAGE) }).catch(() => {
      // 탭을 열지 못했다(창이 닫히는 중 등). 다시 누르면 된다
    })
  })
}

// 서비스 워커로 돌 때만 스스로 켠다(시험은 가짜 chrome으로 startListBackground를 부른다).
// 듣는 함수는 맨 위에서 바로 걸어야 크롬이 서비스 워커를 다시 깨웠을 때도 누름을 받는다
if (typeof chrome !== 'undefined' && chrome.action?.onClicked && typeof chrome.tabs?.create === 'function') {
  startListBackground(chrome)
}
