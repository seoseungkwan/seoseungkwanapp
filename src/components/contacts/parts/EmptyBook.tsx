import type { ReactNode } from 'react'

// 빈 주소록(spec contacts AC-6505.8, 시안 기본값 27 · emptyHtml): 1·2·3 안내 + 단추 셋 자리 + 아래 글.
// 단추([양식 받기]·[엑셀 올리기]는 TASK-5 import/, [+ 업체 더하기]는 AddCompanyButton)는 화면이 actions로 넣는다.
// 이때 화면은 머리 줄 단추·찾기 칸·칩·'업체 {n}곳'을 그리지 않는다(같은 단추가 두 벌 보이지 않게)

const STEPS = [
  ['1', '양식 받기', "빈 엑셀 양식(주소록-양식.xlsx)을 받아요. '쓰는 법' 시트에 적는 법과 예시가 있어요."],
  ['2', '엑셀에 적기', "'연락처' 시트에 사람마다 한 줄씩 적어요. 업체 이름을 똑같이 적은 줄은 한 업체로 묶여요. 장비는 '장비' 시트에 적어요."],
  ['3', '엑셀 올리기', '올리면 넣기 전에 미리 보여 줘요. 틀린 줄은 빼고 나머지만 넣을 수 있어요.'],
] as const

export function EmptyBook({ actions }: { actions: ReactNode }) {
  return (
    <section aria-label="빈 주소록" className="mt-6 max-w-160 border-t border-line-strong pt-6">
      <h2 className="text-title font-semibold text-ink">주소록이 비어 있어요</h2>
      <p className="mt-2 text-lead text-ink-2">
        거래처와 수리·관리 업체 연락처를 한곳에 모아 둬요. 업체가 많으면 엑셀 양식에 적어 한 번에 올리고, 몇 곳 안 되면 하나씩 더해요.
      </p>
      <ol className="mt-5 border-t border-line">
        {STEPS.map(([n, title, text]) => (
          <li key={n} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 border-b border-line py-3">
            <span className="font-semibold text-accent-strong tabular-nums">{n}</span>
            <div>
              <b className="block font-semibold text-ink">{title}</b>
              <small className="block text-small text-muted">{text}</small>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap gap-2">{actions}</div>
      <p className="mt-3 text-small text-muted">수리 기록은 엑셀로 넣지 않아요. 장비를 넣은 뒤 화면에서 장비마다 더해요.</p>
    </section>
  )
}
