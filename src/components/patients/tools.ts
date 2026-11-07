import type { IconName } from '@/components/common/Icon'

// 환자 탭 도구 다섯과 주소(AC-610.2·AC-610.5·AC-2802.1, 시안 TOOLS). 고른 도구는 주소 ?tool=로 남는다(새로 고쳐도 같은 도구). 주소에는 도구 이름만 들어간다.
// 예약 문자 명단·장기 미방문 명단(spec patients-bit-lists)은 F/U 명단·정기 주사 문자 명단 사이·뒤에 둔다. 시안의 예약 아이콘(달력 + 체크)은 Icon에 없어 달력을 쓴다
export type PatientsTool = 'followup' | 'reservations' | 'recall' | 'lapsed' | 'messages'

type ToolLabel = 'F/U 명단' | '예약 문자 명단' | '정기 주사 문자 명단' | '장기 미방문 명단' | '문자 문구'

export const PATIENTS_TOOLS: readonly { id: PatientsTool; label: ToolLabel; icon: IconName }[] = [
  { id: 'followup', label: 'F/U 명단', icon: 'cal' },
  { id: 'reservations', label: '예약 문자 명단', icon: 'cal' },
  { id: 'recall', label: '정기 주사 문자 명단', icon: 'clock' },
  { id: 'lapsed', label: '장기 미방문 명단', icon: 'user' },
  { id: 'messages', label: '문자 문구', icon: 'doc' },
]

/** 주소의 ?tool= 값. 없거나 모르면(여러 값 포함) F/U 명단 */
export function toolFrom(param: string | string[] | undefined): PatientsTool {
  return PATIENTS_TOOLS.find((tool) => tool.id === param)?.id ?? 'followup'
}

export const toolHref = (tool: PatientsTool) => `/patients?tool=${tool}`
