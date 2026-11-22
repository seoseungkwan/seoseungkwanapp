import 'server-only'
import type { Registry } from '@/types/location'

// 입지 분석 종류 → 읽는 곳(specs/location design.md 3·4절). 서버 경로(query·keys)가 이 판으로 종류를 찾는다.
// 지금은 빈 판이다 — TASK-45가 sources/<묶음>.ts의 Adapter를 종류마다 하나씩 잇는다. 비어 있는 종류는 경로가 'failed'로 답한다
export const REGISTRY: Registry = {}
