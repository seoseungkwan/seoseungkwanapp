import type { PatientIds } from '@/types/consumption'

// 차트번호(앞뒤 공백 뺀 글자) → 1, 2, 3… 한 번 분석하는 동안(넣은 파일 전체에서) 같은 표를 쓴다.
// 표는 이 함수 안에만 있다. 원래 번호를 꺼내는 길(목록·크기·직렬화)은 만들지 않는다
export function createPatientIds(): PatientIds {
  const ids = new Map<string, number>()
  return {
    idOf(chartNo: string): number {
      const key = chartNo.trim()
      let id = ids.get(key)
      if (id === undefined) {
        id = ids.size + 1
        ids.set(key, id)
      }
      return id
    },
  }
}
