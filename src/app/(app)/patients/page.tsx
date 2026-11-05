import type { Metadata } from 'next'
import { PatientsEntry } from '@/components/patients/PatientsEntry'
import { toolFrom } from '@/components/patients/tools'

// /patients 환자 탭(REQ-610). 문지기와 앱 틀은 (app)/layout이 준다. 통로·Worker는 브라우저(PatientsEntry)가 연다.
// 주소에서 읽는 것은 ?tool= 하나이고 toolFrom이 정해 둔 도구 이름으로만 바꾼다(AC-610.2·AC-610.5). 탭 이름은 고정 글자다
export const metadata: Metadata = { title: '환자' }

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ tool?: string | string[] }> }) {
  const { tool } = await searchParams
  return <PatientsEntry tool={toolFrom(tool)} />
}
