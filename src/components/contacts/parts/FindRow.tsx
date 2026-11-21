'use client'

import { useRef } from 'react'
import { Icon } from '@/components/common/Icon'
import { CONTACT_CATEGORIES } from '@/lib/contacts/categories'
import { countByCategory, searchCompanies } from '@/lib/contacts/search'
import type { ContactBook } from '@/types/contacts'
import { SearchIcon } from './icons'
import { look } from './look'
import type { ChipValue } from './types'

// 찾기 줄(spec contacts AC-6505.1, 시안 기본값 4 · findHtml): 찾기 칸([×] = 찾기 지우기) + 분류 칩 다섯(수 = 찾은 결과 수, countByCategory).
// 치는 대로 바로 걸러진다(onQuery를 칠 때마다 부른다). 칩은 늘 하나가 눌려 있다(aria-pressed)

const PLACEHOLDER = '업체·담당자·품목·장비 찾기'
const CHIPS: readonly { id: ChipValue; label: string }[] = [{ id: 'all', label: '전체' }, ...CONTACT_CATEGORIES]

type FindRowProps = {
  book: ContactBook
  query: string
  onQuery(next: string): void
  category: ChipValue
  onCategory(next: ChipValue): void
}

export function FindRow({ book, query, onQuery, category, onCategory }: FindRowProps) {
  const input = useRef<HTMLInputElement>(null)
  const counts = countByCategory(searchCompanies(book, query, 'all'))
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="relative min-w-0 flex-[0_1_400px]">
        <SearchIcon className="pointer-events-none absolute top-3.5 left-3 text-muted" />
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={PLACEHOLDER}
          aria-label={PLACEHOLDER}
          autoComplete="off"
          className={`${look.searchInput} [&::-webkit-search-cancel-button]:appearance-none`}
        />
        {query !== '' && (
          <button
            type="button"
            aria-label="찾기 지우기"
            onClick={() => {
              onQuery('')
              input.current?.focus()
            }}
            className={`absolute top-1 right-1 grid size-9 cursor-pointer place-items-center rounded-control text-muted hover:bg-canvas ${look.focusRing}`}
          >
            <Icon name="x" />
          </button>
        )}
      </div>
      <div role="group" aria-label="분류" className="flex flex-wrap gap-1.5">
        {CHIPS.map((chip) => {
          const on = chip.id === category
          return (
            <button key={chip.id} type="button" aria-pressed={on} onClick={() => onCategory(chip.id)} className={on ? look.choiceOn : look.choice}>
              {`${chip.label} `}
              <span className={`font-medium tabular-nums ${on ? 'text-accent-strong' : 'text-muted'}`}>{counts[chip.id]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
