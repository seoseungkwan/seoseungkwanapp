// 과목 고르기 판이 설정을 바꾸는 순수 함수(design.md 18절). 검사·채우기·처음 값은 depts.ts 한 곳을 쓴다
import { DEFAULT_DEPT_RULE, DEPTS, fillDeptRule, type DeptRole } from '@/lib/location/depts'
import type { DeptId, DeptRule } from '@/types/location'

/** 과목 하나를 경쟁·둘레로 보기·안 보기로 옮긴 새 설정. 두 목록 모두 목록 차례, 겹치지 않는다 */
export function withRole(rule: DeptRule, id: DeptId, role: DeptRole): DeptRule {
  const rival = DEPTS.filter((d) => (d.id === id ? role === 'rival' : rule.rival.includes(d.id))).map((d) => d.id)
  const hide = DEPTS.filter((d) => (d.id === id ? role === 'hide' : rule.hide.includes(d.id) && !rival.includes(d.id))).map((d) => d.id)
  return { v: 1, rival, hide }
}

/** [기본값으로]: 처음 값의 새 객체(얼려 둔 DEFAULT_DEPT_RULE을 그대로 넘기지 않는다) */
export const defaultRule = (): DeptRule => fillDeptRule(DEFAULT_DEPT_RULE)

/** 같은 설정인지 견줄 글(차례·모르는 id를 fillDeptRule로 맞춘 JSON) */
export const ruleKey = (rule: unknown) => JSON.stringify(fillDeptRule(rule))

/** 경쟁 과목 이름(요약, 목록 차례) */
export const rivalNames = (rule: DeptRule): string[] => DEPTS.filter((d) => rule.rival.includes(d.id)).map((d) => d.name)
