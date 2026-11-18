import { createMemoEngine, type Phrases } from '../index'
import { sampleVisits } from './sampleVisits'

// 처음 질문 보기 메모(AC-6614.4·AC-6614.6): 진짜 메모 엔진이 가짜 진료 3건으로 만든 글. 메모 시험 탭처럼 표 없이 돈다 [환자 자료 구역]

/** 가짜 진료 3건의 비트에 들어가는 글(fullText), sampleVisits()와 같은 차례 */
export function previewMemos(phrases: Phrases): string[] {
  const engine = createMemoEngine(phrases, {})
  return sampleVisits().map((visit) => engine.fullText(visit))
}
