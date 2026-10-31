// 기관기호 가리기 (design.md 9-1, AC-006.4). 기관기호는 서버에 올리지 않고, 화면에는 뒤 4자리를 가려 보인다.
// 4자리 이하면 모두 가린다(가린 글자 수는 그대로)
const HIDDEN = 4

export function maskInstitution(code: string): string {
  const shown = Math.max(0, code.length - HIDDEN)
  return code.slice(0, shown) + '*'.repeat(code.length - shown)
}
