import { Fragment } from 'react'
import { CONTACT_CATEGORIES } from '@/lib/contacts/categories'
import { phoneText } from '@/lib/contacts/fields'
import { highlightParts, normalizeQuery, searchCompanies, type SearchResult } from '@/lib/contacts/search'
import { soonestWarranty } from '@/lib/contacts/warranty'
import type { ContactBook } from '@/types/contacts'
import type { ChipValue } from './types'
import { WarrantyChip } from './WarrantyChip'

// 왼쪽 목록(spec contacts AC-6505.1·AC-6505.6, 시안 기본값 2·3·4 · listHtml·rowHtml).
// 목록 = searchCompanies(book, 찾는 말, 칩) 그대로(분류 차례 → 업체 이름 가나다). 전체면 분류 묶음(머리에 수), 칩을 고르면 묶음 머리 없이.
// 한 줄 = 업체 이름 [가장 급한 무상 수리 칩] / 하는 일·품목 · 대표 전화(하는 일·품목만 말줄임) / 담당자·장비에서 찾았으면 찾은 곳 줄(둘까지)

type CompanyListProps = {
  book: ContactBook
  query: string
  category: ChipValue
  today: string
  selectedId: string | null
  onSelect(companyId: string): void
}

/** 찾은 글자는 노랗게(mark) */
function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((part, i) =>
        part.hit ? (
          <mark key={i} className="bg-warning-soft text-inherit">
            {part.text}
          </mark>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}

function Row({ result, book, query, today, selected, onSelect }: { result: SearchResult; book: ContactBook; query: string; today: string; selected: boolean; onSelect(id: string): void }) {
  const { company } = result
  const soonest = soonestWarranty(
    book.equipment.filter((e) => e.companyId === company.id),
    today,
  )
  const hits = [...result.people.map((name) => ['담당자', name] as const), ...result.equipment.map((name) => ['장비', name] as const)].slice(0, 2)
  const phone = company.phone === '' ? '' : phoneText(company.phone)
  return (
    <button
      type="button"
      data-company={company.name}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(company.id)}
      className={`relative grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 border-b border-line px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
        selected ? 'bg-accent-soft' : 'hover:bg-canvas'
      }`}
    >
      {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
      <span className="truncate font-semibold text-ink">
        <Marked text={company.name} query={query} />
      </span>
      {soonest ? <WarrantyChip state={{ kind: 'soon', days: soonest.days }} /> : <span />}
      {(company.work !== '' || phone !== '') && (
        <span className="col-span-full flex min-w-0 text-small whitespace-nowrap text-muted">
          {company.work !== '' && (
            <span className="min-w-0 truncate">
              <Marked text={company.work} query={query} />
            </span>
          )}
          {company.work !== '' && phone !== '' && <span className="shrink-0 whitespace-pre"> · </span>}
          {phone !== '' && <span className="shrink-0 text-ink-2 tabular-nums">{phone}</span>}
        </span>
      )}
      {hits.length > 0 && (
        <span data-hits className="col-span-full truncate text-caption text-ink-2">
          {hits.map(([kind, name], i) => (
            <Fragment key={`${kind}-${name}`}>
              {i > 0 && ' · '}
              <span className="text-muted">{`${kind}:`}</span> <Marked text={name} query={query} />
            </Fragment>
          ))}
        </span>
      )}
    </button>
  )
}

export function CompanyList({ book, query, category, today, selectedId, onSelect }: CompanyListProps) {
  const results = searchCompanies(book, query, category)
  if (results.length === 0) {
    const asked = query.trim()
    return normalizeQuery(query) !== '' ? (
      <p className="px-3 py-6 text-ink-2">
        {`'${asked}'에 맞는 업체가 없어요.`}
        <small className="mt-1 block text-small text-muted">업체 이름·담당자 이름·하는 일·품목·장비 이름으로 찾아요.</small>
      </p>
    ) : (
      <p className="px-3 py-6 text-ink-2">이 분류에는 업체가 없어요.</p>
    )
  }

  const row = (result: SearchResult) => (
    <Row key={result.company.id} result={result} book={book} query={query} today={today} selected={result.company.id === selectedId} onSelect={onSelect} />
  )
  if (category !== 'all') return <div>{results.map(row)}</div>
  return (
    <div>
      {CONTACT_CATEGORIES.map((group, index) => {
        const inGroup = results.filter((r) => r.company.category === group.id)
        if (inGroup.length === 0) return null
        return (
          <Fragment key={group.id}>
            <div
              data-group={group.id}
              className={`flex items-baseline gap-1.5 border-b border-line px-3 pb-1.5 text-caption font-semibold text-muted ${index === 0 ? 'pt-3' : 'pt-4'}`}
            >
              {`${group.label} `}
              <span className="font-medium tabular-nums">{inGroup.length}</span>
            </div>
            {inGroup.map(row)}
          </Fragment>
        )
      })}
    </div>
  )
}
