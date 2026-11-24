'use client'

import { useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { WriteOnly } from '@/components/shell/viewing'
import { todayInKorea } from '@/lib/analytics/dates'
import { buildImportPlan, type ImportPlan } from '@/lib/contacts/plan'
import type { ReadProblem } from '@/lib/contacts/workbook'
import type { CompanyFields, ContactBook } from '@/types/contacts'
import { planCounts } from './import/changeLabels'
import { FileProblemDialog } from './import/FileProblemDialog'
import { ImportDoneNotice } from './import/ImportDoneNotice'
import { ImportPreview } from './import/ImportPreview'
import { TEMPLATE_DOWNLOADED, TemplateLink } from './import/TemplateLink'
import { UploadButton, type UploadRead } from './import/UploadButton'
import { CompanyDetail } from './parts/CompanyDetail'
import { CompanyList } from './parts/CompanyList'
import { CompanyPanel } from './parts/CompanyPanel'
import { AddCompanyButton, ContactsHeader } from './parts/ContactsHeader'
import { EmptyBook } from './parts/EmptyBook'
import { FindRow } from './parts/FindRow'
import { look } from './parts/look'
import { NoSelection } from './parts/NoSelection'
import { ShortNotice, useShortNotice } from './parts/ShortNotice'
import type { ChipValue, SaveResult } from './parts/types'
import { useContacts } from './useContacts'

// 주소록 화면(spec contacts REQ-6505·REQ-6506, design.md '화면' ContactsScreen, 시안 docs/mockups/contacts/index.html contactsHtml).
// 자료는 useContacts(읽기·저장·넣기), 그리기는 parts/·import/ 부품이다. 화면은 고른 업체·찾는 말·칩·판·미리 보기·알림 상태만 쥔다.
// 차례(시안): 머리 줄(h1·업체 수·[엑셀 올리기][양식 받기][+ 업체 더하기]) → 넣은 뒤 초록 줄 → 찾기 줄 → 두 칸 틀(왼쪽 목록 · 오른쪽 자세히).
// 읽는 동안은 h1만, 읽기 실패는 목록 자리에 오류 카드 + [다시 읽기], 빈 주소록은 빈 화면만, 엑셀 미리 보기 동안은 그 한 화면만(자기 h1).
// 폰 전용 모양 없음(사용자 규칙 2026-11-21): 두 칸 틀은 최소 폭 720px이고 그보다 좁으면 감싼 칸 안에서만 옆으로 밀린다.
// 목록 칸만 시안대로 1024px 미만 300px · 이상 360px(자세히 왼쪽 여백 24px · 32px)
// 보는 중(admin-view AC-8011.1, 관리자가 다른 의원을 읽기만)에는 [엑셀 올리기]·[업체 더하기]를 그리지 않는다(WriteOnly) — 넣기·업체 판도 열 길이 없다.
// [양식 받기]·찾기·목록·자세히는 그대로다(자세히의 쓰기 단추는 CompanyDetail이 숨긴다)

type Panel = { mode: 'new' } | { mode: 'edit'; companyId: string }
type Preview = { plan: ImportPlan; fileName: string; saving: boolean; failed: boolean }
type FileProblem = { problem: ReadProblem; fileName: string }
type Done = { added: number; changed: number; skipped: number }

export function ContactsScreen({ initialCompanyId }: { initialCompanyId?: string }) {
  const data = useContacts()
  const { load } = data
  const [today] = useState(todayInKorea)
  // 없는 id(?c=)는 고른 업체를 찾지 못해 아무것도 안 고른 모양이 된다
  const [selectedId, setSelectedId] = useState<string | null>(initialCompanyId ?? null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ChipValue>('all')
  const [panel, setPanel] = useState<Panel | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [fileProblem, setFileProblem] = useState<FileProblem | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const { notice, say } = useShortNotice()

  const book: ContactBook | null = load.status === 'ready' ? load.book : null
  const selected = book && selectedId !== null ? (book.companies.find((c) => c.id === selectedId) ?? null) : null

  const downloaded = () => say(TEMPLATE_DOWNLOADED)
  const openNew = () => setPanel({ mode: 'new' })

  /** 고른 파일: 못 쓰는 파일이면 확인 창, 읽었으면 지금 주소록과 견준 미리 보기(아무것도 보내지 않는다) */
  const onRead = ({ fileName, result }: UploadRead) => {
    if (!book) return
    if (typeof result === 'string') {
      setFileProblem({ problem: result, fileName })
      return
    }
    setFileProblem(null)
    setPanel(null)
    setPreview({ plan: buildImportPlan(result, book), fileName, saving: false, failed: false })
  }

  /** [넣기]: 넣기 한 번 → 되면 다시 읽은 목록으로 돌아가 초록 줄(숫자는 넣기 전 계획에서), 실패면 미리 보기 그대로 오류 카드 */
  async function runImport() {
    if (!preview || preview.saving) return
    const counts = planCounts(preview.plan)
    setPreview({ ...preview, saving: true, failed: false })
    const result = await data.importBook(preview.plan.payload)
    if (result === 'failed') {
      setPreview((prev) => prev && { ...prev, saving: false, failed: true })
      return
    }
    setPreview(null)
    setSelectedId(null)
    setDone({ added: counts.added, changed: counts.changed, skipped: counts.skipped })
  }

  /** 업체 판 [저장]: 되면 그 업체를 고른다(새 업체는 답 id). 판 닫기·알림은 판이 한다 */
  async function saveCompany(fields: CompanyFields): Promise<SaveResult> {
    const result = await data.saveCompany(panel?.mode === 'edit' ? panel.companyId : null, fields)
    if (result.ok && result.id) setSelectedId(result.id)
    return result
  }

  /** 업체 지우기: 되면 고른 업체를 비운다(알림은 자세히가 한다) */
  async function deleteCompany(id: string): Promise<SaveResult> {
    const result = await data.deleteCompany(id)
    if (result.ok) setSelectedId((prev) => (prev === id ? null : prev))
    return result
  }

  const doneLine = done && (
    <div className="mt-4">
      <ImportDoneNotice added={done.added} changed={done.changed} skipped={done.skipped} onClose={() => setDone(null)} />
    </div>
  )

  let body
  if (load.status === 'loading') {
    body = <ContactsHeader count={0} />
  } else if (load.status === 'failed') {
    body = (
      <>
        <ContactsHeader count={0} />
        {doneLine}
        <div className="mt-4 flex max-w-180 flex-col items-start gap-2">
          <ErrorCard code="E-CONTACTS-READ-FAILED" />
          <button type="button" onClick={data.reload} className={look.buttonSmall}>
            다시 읽기
          </button>
        </div>
      </>
    )
  } else if (preview) {
    body = (
      <ImportPreview
        plan={preview.plan}
        fileName={preview.fileName}
        saving={preview.saving}
        failed={preview.failed}
        onCancel={() => setPreview(null)}
        onImport={() => void runImport()}
      />
    )
  } else if (load.book.companies.length === 0) {
    body = (
      <>
        <ContactsHeader count={0} />
        <EmptyBook
          actions={
            <>
              <TemplateLink onDownloaded={downloaded} />
              <WriteOnly>
                <UploadButton onRead={onRead} />
                <AddCompanyButton onClick={openNew} />
              </WriteOnly>
            </>
          }
        />
      </>
    )
  } else {
    const shown = load.book
    body = (
      <>
        <ContactsHeader
          count={shown.companies.length}
          actions={
            <>
              <WriteOnly>
                <UploadButton onRead={onRead} />
              </WriteOnly>
              <TemplateLink onDownloaded={downloaded} />
              <WriteOnly>
                <AddCompanyButton onClick={openNew} />
              </WriteOnly>
            </>
          }
        />
        {doneLine}
        <FindRow book={shown} query={query} onQuery={setQuery} category={category} onCategory={setCategory} />
        <div className="mt-4 overflow-x-auto">
          <div data-contacts-frame className="grid min-w-180 grid-cols-[300px_minmax(0,1fr)] border-t border-line-strong lg:grid-cols-[360px_minmax(0,1fr)]">
            <div data-contacts-list className="min-w-0 border-r border-line">
              <CompanyList book={shown} query={query} category={category} today={today} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            </div>
            <div className="min-w-0 pt-5 pl-6 lg:pl-8">
              {selected ? (
                <CompanyDetail
                  book={shown}
                  company={selected}
                  today={today}
                  onEdit={() => setPanel({ mode: 'edit', companyId: selected.id })}
                  onDeleteCompany={deleteCompany}
                  onSavePerson={data.savePerson}
                  onDeletePerson={data.deletePerson}
                  onSaveEquipment={data.saveEquipment}
                  onDeleteEquipment={data.deleteEquipment}
                  onSaveRepair={data.saveRepair}
                  onDeleteRepair={data.deleteRepair}
                  onNotice={say}
                />
              ) : (
                <NoSelection />
              )}
            </div>
          </div>
        </div>
      </>
    )
  }

  // 업체 판: 고칠 업체가 (다른 PC에서 지워져) 없으면 열지 않는다
  const editing = panel?.mode === 'edit' && book ? (book.companies.find((c) => c.id === panel.companyId) ?? null) : null
  const panelOpen = book !== null && !preview && panel !== null && (panel.mode === 'new' || editing !== null)

  // 뿌리는 본문 글자(text-body 14px/22px, 시안 body): 앱 틀은 글자 크기를 주지 않아(Preflight 없음) 크기를 따로 주지 않은 글이 브라우저 기본 16px이 된다.
  // 업체 판·확인 창·짧은 알림도 포털 없이 이 안에 그려 같은 크기를 물려받는다
  return (
    <div className="text-body">
      {body}
      {panelOpen && (
        <CompanyPanel
          mode={panel.mode}
          company={editing}
          category={category}
          companies={book.companies}
          onSave={saveCompany}
          onClose={() => setPanel(null)}
          onNotice={say}
        />
      )}
      {fileProblem && !preview && (
        <FileProblemDialog problem={fileProblem.problem} fileName={fileProblem.fileName} onClose={() => setFileProblem(null)} onDownloaded={downloaded} onRead={onRead} />
      )}
      <ShortNotice notice={notice} />
    </div>
  )
}
