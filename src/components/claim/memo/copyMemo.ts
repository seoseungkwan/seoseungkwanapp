// 우리 메모를 클립보드에 넣는다(AC-3103.1·AC-3103.3). 사람이 누른 순간에만 부른다(브라우저가 그때만 허락한다).
// 브라우저 클립보드가 거절하거나 없으면 숨긴 글 칸 + execCommand('copy')로 한 번 더 한다. 오류는 환자 글이 섞일 수 있어 버리고 true/false만 돌려준다

function copyByTextarea(text: string): boolean {
  if (typeof document.execCommand !== 'function') return false
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  try {
    area.focus()
    area.select()
    return document.execCommand('copy') === true
  } catch {
    return false
  } finally {
    area.remove()
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 아래 예비 방법으로 한 번 더 한다
  }
  return copyByTextarea(text)
}
