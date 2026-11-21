'use client'

import { useState, type ReactNode } from 'react'
import { categoryLabel } from '@/lib/contacts/categories'
import { FIELD_LABELS, homepageHref, wonText } from '@/lib/contacts/fields'
import { warrantyState } from '@/lib/contacts/warranty'
import type { Company, CompanyFields, ContactBook, Equipment, EquipmentFields, Person, PersonFields, Repair, RepairFields } from '@/types/contacts'
import { CopyButton } from './CopyButton'
import { DeleteDialog, deleteNotice } from './DeleteDialog'
import { ExternalIcon, PlusIcon } from './icons'
import { EquipmentForm, PersonForm, RepairForm } from './InlineForms'
import { look } from './look'
import { PhoneNumber } from './PhoneNumber'
import type { SaveResult } from './types'
import { WarrantyChip } from './WarrantyChip'

// 업체 자세히(spec contacts AC-6505.2·AC-6505.5·AC-6505.6·AC-6505.7, 시안 기본값 5·6·9·10·11·14·15·16 · detailHtml·peopleHtml·infoHtml·equipHtml).
// 머리(분류 칩·업체 이름·하는 일·[고치기][지우기]) → 대표 전화(큰 번호) → 두 칸(화면 폭 1200px 이상: 왼쪽 담당자·업체 정보, 오른쪽 장비).
// 적힌 칸만 줄로 보이고, 계좌·사이트 비밀번호는 [보기]를 누른 칸만 값이 보인다(업체를 바꾸면 다시 가림 = 업체 id로 새로 그림).
// 담당자·장비·수리 기록은 그 자리 칸에서 고치고(한 번에 하나), 업체·장비 지우기만 확인 창으로 한 번 더 묻는다. 저장·지우기는 콜백이 하고 답(SaveResult)만 받는다

export type CompanyDetailProps = {
  book: ContactBook
  company: Company
  /** 한국 날짜 오늘(무상 수리 남은 날·수리 기록 날짜 기본값) */
  today: string
  /** [고치기]·업체 정보 [고치기] → 업체 고치기 판 */
  onEdit(): void
  onDeleteCompany(companyId: string): Promise<SaveResult>
  onSavePerson(companyId: string, personId: string | null, fields: PersonFields): Promise<SaveResult>
  onDeletePerson(personId: string): Promise<SaveResult>
  onSaveEquipment(companyId: string, equipmentId: string | null, fields: EquipmentFields): Promise<SaveResult>
  onDeleteEquipment(equipmentId: string): Promise<SaveResult>
  onSaveRepair(equipmentId: string, repairId: string | null, fields: RepairFields): Promise<SaveResult>
  onDeleteRepair(repairId: string): Promise<SaveResult>
  /** 짧은 알림 글(저장했어요. · 담당자를 지웠어요. · 수리 기록을 지웠어요. · {이름}을(를) 지웠어요.) */
  onNotice(text: string): void
}

/** 열린 그 자리 칸(하나만). id null = 더하기 */
type OpenForm = { kind: 'person'; id: string | null } | { kind: 'equipment'; id: string | null } | { kind: 'repair'; equipmentId: string; id: string | null }
/** 확인 창 */
type Asking = { kind: 'company' } | { kind: 'equipment'; equipment: Equipment }

export function CompanyDetail(props: CompanyDetailProps) {
  // 업체가 바뀌면 칸·가림·확인 창을 처음으로(다시 가림)
  return <Detail key={props.company.id} {...props} />
}

/** 그 장비 수리 기록: 날짜 늦은 것이 위, 같은 날은 나중에 넣은 것이 위(book 차례 = 넣은 차례, created_at·id) */
function repairsOf(repairs: readonly Repair[], equipmentId: string): Repair[] {
  return repairs
    .map((repair, order) => ({ repair, order }))
    .filter(({ repair }) => repair.equipmentId === equipmentId)
    .sort((a, b) => (a.repair.day === b.repair.day ? b.order - a.order : a.repair.day < b.repair.day ? 1 : -1))
    .map(({ repair }) => repair)
}

function SectionHead({ title, count, action }: { title: string; count?: number; action: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line-strong pb-1.5">
      <h3 className="text-subtitle font-semibold text-ink">
        {title}
        {count !== undefined && (
          <>
            {' '}
            <span className="font-medium text-muted tabular-nums">{count}</span>
          </>
        )}
      </h3>
      {action}
    </div>
  )
}

const noneText = 'border-b border-line py-3 text-small text-muted'

function AddButton({ label, text, onClick }: { label: string; text: string; onClick(): void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={look.textButton}>
      <PlusIcon />
      {text}
    </button>
  )
}

function Detail({
  book,
  company,
  today,
  onEdit,
  onDeleteCompany,
  onSavePerson,
  onDeletePerson,
  onSaveEquipment,
  onDeleteEquipment,
  onSaveRepair,
  onDeleteRepair,
  onNotice,
}: CompanyDetailProps) {
  const [open, setOpen] = useState<OpenForm | null>(null)
  const [asking, setAsking] = useState<Asking | null>(null)
  const people = book.people.filter((p) => p.companyId === company.id)
  const equipment = book.equipment.filter((e) => e.companyId === company.id)
  const equipmentIds = new Set(equipment.map((e) => e.id))
  const repairCount = book.repairs.filter((r) => equipmentIds.has(r.equipmentId)).length

  const close = () => setOpen(null)
  const done = (text: string) => {
    setOpen(null)
    onNotice(text)
  }
  const isOpen = (kind: OpenForm['kind'], id: string | null, equipmentId?: string) =>
    open !== null && open.kind === kind && open.id === id && (open.kind !== 'repair' || open.equipmentId === equipmentId)

  // ── 담당자 ──
  const personForm = (person: Person | null) => (
    <PersonForm
      person={person}
      others={people.filter((p) => p.id !== person?.id).map((p) => p.name)}
      onSave={(fields) => onSavePerson(company.id, person?.id ?? null, fields)}
      onDelete={person ? () => onDeletePerson(person.id) : undefined}
      onCancel={close}
      onDone={done}
    />
  )
  const addingPerson = isOpen('person', null)
  const peopleSection = (
    <section aria-label="담당자" className="min-w-0">
      <SectionHead title="담당자" count={people.length} action={<AddButton label="담당자 더하기" text="담당자" onClick={() => setOpen({ kind: 'person', id: null })} />} />
      {people.length > 0 && (
        <ul className="list-none">
          {people.map((person) => (
            <li key={person.id}>
              {isOpen('person', person.id) ? (
                personForm(person)
              ) : (
                <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 border-b border-line py-2">
                  <div className="min-w-0">
                    <b className="font-semibold text-ink">{person.name}</b>
                    {person.role !== '' && <span className="ml-2 text-small text-muted">{person.role}</span>}
                  </div>
                  {person.mobile !== '' ? <PhoneNumber value={person.mobile} /> : <span />}
                  <button type="button" aria-label={`${person.name} 고치기`} onClick={() => setOpen({ kind: 'person', id: person.id })} className={look.textButtonMuted}>
                    고치기
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {people.length === 0 && !addingPerson && <p className={noneText}>담당자가 없어요.</p>}
      {addingPerson && personForm(null)}
    </section>
  )

  // ── 업체 정보 ──
  const infoSection = (
    <section aria-label="업체 정보" className="min-w-0">
      <SectionHead
        title="업체 정보"
        action={
          <button type="button" aria-label="업체 정보 고치기" onClick={onEdit} className={look.textButtonMuted}>
            고치기
          </button>
        }
      />
      <CompanyInfo company={company} />
    </section>
  )

  // ── 장비 ──
  const equipmentForm = (item: Equipment | null) => (
    <EquipmentForm
      equipment={item}
      onSave={(fields) => onSaveEquipment(company.id, item?.id ?? null, fields)}
      onAskDelete={item ? () => setAsking({ kind: 'equipment', equipment: item }) : undefined}
      onCancel={close}
      onDone={done}
    />
  )
  const repairForm = (item: Equipment, repair: Repair | null) => (
    <RepairForm
      repair={repair}
      today={today}
      onSave={(fields) => onSaveRepair(item.id, repair?.id ?? null, fields)}
      onDelete={repair ? () => onDeleteRepair(repair.id) : undefined}
      onCancel={close}
      onDone={done}
    />
  )
  const addingEquipment = isOpen('equipment', null)
  const equipmentSection = (
    <section aria-label="장비" className="min-w-0">
      <SectionHead title="장비" count={equipment.length} action={<AddButton label="장비 더하기" text="장비" onClick={() => setOpen({ kind: 'equipment', id: null })} />} />
      {equipment.map((item) => (
        <article key={item.id} aria-label={item.name} className="border-b border-line pt-3 pb-3.5">
          {isOpen('equipment', item.id) ? (
            equipmentForm(item)
          ) : (
            <EquipmentBlock
              item={item}
              today={today}
              repairs={repairsOf(book.repairs, item.id)}
              onEdit={() => setOpen({ kind: 'equipment', id: item.id })}
              onAddRepair={() => setOpen({ kind: 'repair', equipmentId: item.id, id: null })}
              onEditRepair={(repair) => setOpen({ kind: 'repair', equipmentId: item.id, id: repair.id })}
              repairForm={(repair) => (isOpen('repair', repair?.id ?? null, item.id) ? repairForm(item, repair) : null)}
            />
          )}
        </article>
      ))}
      {equipment.length === 0 && !addingEquipment && <p className={noneText}>장비가 없어요. 수리·관리하는 기계가 있으면 더해요.</p>}
      {addingEquipment && <div className="border-b border-line pt-1 pb-3.5">{equipmentForm(null)}</div>}
    </section>
  )

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <span className={look.chipNeutral}>{categoryLabel(company.category)}</span>
          <h2 className="mt-1.5 text-heading-m font-semibold wrap-anywhere text-ink">{company.name}</h2>
          {company.work !== '' && (
            <p data-work className="mt-0.5 text-ink-2">
              {company.work}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label={`${company.name} 고치기`} onClick={onEdit} className={look.buttonSmall}>
            고치기
          </button>
          <button type="button" aria-label={`${company.name} 지우기`} onClick={() => setAsking({ kind: 'company' })} className={look.dangerSmall}>
            지우기
          </button>
        </div>
      </div>
      {company.phone !== '' && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-line py-3">
          <span className="w-26 text-small text-muted">대표 전화</span>
          <PhoneNumber value={company.phone} big />
        </div>
      )}
      <div className="mt-6 grid items-start gap-8 min-[1200px]:grid-cols-2 min-[1200px]:gap-x-10">
        <div className="grid min-w-0 content-start gap-8">
          {peopleSection}
          {infoSection}
        </div>
        <div className="grid min-w-0 content-start gap-8">{equipmentSection}</div>
      </div>
      {asking?.kind === 'company' && (
        <DeleteDialog
          target={{ kind: 'company', name: company.name, people: people.length, equipment: equipment.length, repairs: repairCount }}
          onCancel={() => setAsking(null)}
          onConfirm={() => onDeleteCompany(company.id)}
          onDone={() => {
            setAsking(null)
            onNotice(deleteNotice(company.name))
          }}
        />
      )}
      {asking?.kind === 'equipment' && (
        <DeleteDialog
          target={{ kind: 'equipment', name: asking.equipment.name, repairs: repairsOf(book.repairs, asking.equipment.id).length }}
          onCancel={() => setAsking(null)}
          onConfirm={() => onDeleteEquipment(asking.equipment.id)}
          onDone={() => {
            setAsking(null)
            done(deleteNotice(asking.equipment.name))
          }}
        />
      )}
    </div>
  )
}

// ── 업체 정보 칸 ─────────────────────────────────────────────

type InfoKey = Exclude<keyof CompanyFields, 'category' | 'name' | 'phone' | 'work'>
type InfoKind = 'copy' | 'link' | 'secret' | 'memo'
/** 줄 차례(시안 INFO): 주소·사업자번호·사이트 아이디 [복사], 홈페이지 새 탭 링크, 계좌·사이트 비밀번호 가림 + [보기] + [복사], 업체 메모 줄바꿈 그대로 */
const INFO_ROWS: readonly (readonly [InfoKey, InfoKind])[] = [
  ['address', 'copy'],
  ['homepage', 'link'],
  ['bizNo', 'copy'],
  ['account', 'secret'],
  ['siteId', 'copy'],
  ['sitePw', 'secret'],
  ['memo', 'memo'],
]

function CompanyInfo({ company }: { company: Company }) {
  const [shown, setShown] = useState<ReadonlySet<InfoKey>>(new Set())
  const rows = INFO_ROWS.filter(([key]) => company[key] !== '')
  if (rows.length === 0) return <p className={noneText}>적힌 정보가 없어요. [고치기]로 채워요.</p>
  const toggle = (key: InfoKey) =>
    setShown((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <dl>
      {rows.map(([key, kind]) => {
        const label = FIELD_LABELS.company[key]
        const value = company[key]
        const open = shown.has(key)
        let shownValue: ReactNode = value
        if (kind === 'link') {
          shownValue = (
            <a href={homepageHref(value) ?? undefined} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 rounded-control text-accent-strong no-underline hover:underline ${look.focusRing}`}>
              {value}
              <ExternalIcon />
            </a>
          )
        } else if (kind === 'secret') {
          shownValue = open ? (
            <span className="tabular-nums">{value}</span>
          ) : (
            <>
              <span aria-hidden="true" className="text-caption tracking-widest text-ink-2">
                ●●●●●●
              </span>
              <span className="sr-only">가려 둠</span>
            </>
          )
        }
        return (
          <div key={key} className="grid grid-cols-[104px_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-b border-line py-2.25">
            <dt className="text-small text-muted">{label}</dt>
            <dd className={kind === 'memo' ? 'min-w-0 whitespace-pre-line wrap-anywhere text-ink-2' : 'min-w-0 wrap-anywhere text-ink'}>{shownValue}</dd>
            {kind === 'copy' || kind === 'secret' ? (
              <span className="flex gap-1 self-center">
                {kind === 'secret' && (
                  <button type="button" aria-label={`${label} 보기`} aria-pressed={open} onClick={() => toggle(key)} className={look.mini}>
                    {open ? '가리기' : '보기'}
                  </button>
                )}
                <CopyButton value={value} label={`${label} 복사`} />
              </span>
            ) : (
              <span />
            )}
          </div>
        )
      })}
    </dl>
  )
}

// ── 장비 한 대 ─────────────────────────────────────────────

type EquipmentBlockProps = {
  item: Equipment
  today: string
  repairs: Repair[]
  onEdit(): void
  onAddRepair(): void
  onEditRepair(repair: Repair): void
  /** 그 자리 수리 기록 칸(열려 있으면 칸, 아니면 null). null 인자 = 더하기 */
  repairForm(repair: Repair | null): ReactNode
}

function EquipmentBlock({ item, today, repairs, onEdit, onAddRepair, onEditRepair, repairForm }: EquipmentBlockProps) {
  const state = warrantyState(item.warrantyUntil, today)
  const ended = state.kind === 'ended'
  const labels = FIELD_LABELS.equipment
  const meta = [
    item.serial !== '' ? ([labels.serial, item.serial] as const) : null,
    item.boughtOn ? ([labels.boughtOn, item.boughtOn] as const) : null,
    item.warrantyUntil ? ([labels.warrantyUntil, item.warrantyUntil] as const) : null,
  ].filter((m) => m !== null)
  const adding = repairForm(null)

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <b className={ended ? 'text-body font-medium wrap-anywhere text-ink-2' : 'text-body font-semibold wrap-anywhere text-ink'}>{item.name}</b>
        <WarrantyChip state={state} />
        <button type="button" aria-label={`${item.name} 고치기`} onClick={onEdit} className={`ml-auto ${look.textButtonMuted}`}>
          고치기
        </button>
      </div>
      {meta.length > 0 && (
        <div data-meta className="mt-0.5 flex flex-wrap gap-x-3.5 text-small text-muted">
          {meta.map(([label, value]) => (
            <span key={label} className="whitespace-nowrap">
              {`${label} `}
              <em className="text-ink-2 not-italic tabular-nums">{value}</em>
            </span>
          ))}
        </div>
      )}
      <div data-repair-head className="mt-2.5 flex items-center justify-between gap-2 text-small font-semibold text-ink-2">
        <span>
          수리 기록 <span className="font-medium text-muted tabular-nums">{repairs.length}</span>
        </span>
        <AddButton label={`${item.name} 수리 기록 더하기`} text="수리 기록" onClick={onAddRepair} />
      </div>
      {adding}
      {repairs.length > 0 && (
        <ul aria-label={`${item.name} 수리 기록`} className="list-none">
          {repairs.map((repair) => (
            <li key={repair.id}>
              {repairForm(repair) ?? (
                <div className="grid grid-cols-[92px_minmax(0,1fr)_auto_auto] items-baseline gap-x-3 gap-y-0.5 border-t border-line py-1.5 text-small">
                  <span className="text-ink-2 tabular-nums">{repair.day}</span>
                  <span className="min-w-0 wrap-anywhere text-ink">{repair.content}</span>
                  {repair.cost === null ? (
                    <span className="text-right text-muted">–</span>
                  ) : (
                    <span className="text-right whitespace-nowrap text-ink tabular-nums">{`${wonText(repair.cost)}원`}</span>
                  )}
                  <button type="button" aria-label={`${repair.day} ${repair.content} 고치기`} onClick={() => onEditRepair(repair)} className={look.textButtonMuted}>
                    고치기
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {repairs.length === 0 && !adding && <p className="border-t border-line py-1.5 text-small text-muted">수리 기록이 없어요.</p>}
    </>
  )
}
