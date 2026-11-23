import { createContext } from 'react'

// 다시 받는 중(spec location AC-7917.4, design.md 15절, TASK-95): CandidateFrame이 받은 진행(progress)을
// `다시 받는 중이에요 · 자료 {done}/{total}` 글로 칸들에 내려 준다. 받는 중이 아니면 null — WhyLine·PriceSection이 읽는다
export const RefreshBusy = createContext<string | null>(null)
