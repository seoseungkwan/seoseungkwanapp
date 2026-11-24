'use client'

import { useId } from 'react'
import { WriteOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { TemplateLink } from './RosterList'

// 직원이 아직 없을 때 처음 화면(staff AC-7612.6, 시안 list.html ⑥). 알림 줄과 재직·퇴사 고르기는 없다
// 관리자가 다른 의원을 보는 중이면(admin-view AC-8009.3) [엑셀 올리기]·[＋ 직원 더하기]가 없다([엑셀 양식 받기]는 그대로)

export function RosterEmpty({ onAdd, onPickExcel }: { onAdd(): void; onPickExcel(): void }) {
  const excelId = useId()
  const oneId = useId()
  return (
    <div className="flex flex-col items-center gap-2 rounded-control border border-dashed border-line-strong bg-surface px-5 py-8 text-center">
      <span aria-hidden="true" className="text-heading">
        👥
      </span>
      <h2 className="text-lead font-semibold text-ink">아직 직원이 없어요</h2>
      <p className="max-w-120 text-body text-ink-2">엑셀 양식에 여러 명을 한꺼번에 적어 올리거나, 한 명씩 더할 수 있어요.</p>
      <div className="mt-2 grid w-full max-w-170 grid-cols-2 gap-3 text-left">
        <section aria-labelledby={excelId} className="flex min-w-0 flex-col gap-2 rounded-control border border-line px-4 py-4">
          <h3 id={excelId} className="text-body font-semibold text-ink">
            엑셀로 한꺼번에
          </h3>
          <ol className="flex list-decimal flex-col gap-0.5 pl-5 text-small text-ink-2">
            <li>[엑셀 양식 받기]로 양식을 받아요.</li>
            <li>한 줄에 한 명씩 채워요. &apos;올해 이미 쓴 연차&apos; 칸도 있어요.</li>
            <li>[엑셀 올리기] → 미리 보고 [넣기].</li>
          </ol>
          <div className="mt-1 flex flex-wrap gap-2">
            <TemplateLink />
            <WriteOnly>
              <button type="button" className={ds.button.secondary} onClick={onPickExcel}>
                엑셀 올리기
              </button>
            </WriteOnly>
          </div>
        </section>
        <section aria-labelledby={oneId} className="flex min-w-0 flex-col gap-2 rounded-control border border-line px-4 py-4">
          <h3 id={oneId} className="text-body font-semibold text-ink">
            한 명씩
          </h3>
          <p className="text-small text-ink-2">칸을 채우고 저장해요. 이름과 입사일만 꼭 적으면 돼요.</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <WriteOnly>
              <button type="button" className={ds.button.primary} onClick={onAdd}>
                ＋ 직원 더하기
              </button>
            </WriteOnly>
          </div>
        </section>
      </div>
      <p className={`${ds.help} mt-1.5`}>예약 시행자 목록(설정 → 병원 정보)과는 따로예요. 직원 카드에서 이어 줄 수 있어요.</p>
    </div>
  )
}
