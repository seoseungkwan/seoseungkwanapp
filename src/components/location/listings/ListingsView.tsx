'use client'

// 입지 분석 › 매물 (spec location REQ-7910 AC-7910.1~AC-7910.4, design.md 11·13·14절, 시안 ?s=listings 승인 2026-11-22).
// 차례(시안 .lgrid): 매물 찾기([네이버 부동산에서 보기] 새 창) → 매물 붙여 넣기 → 저장한 매물(평수 거르기) → 매물 값 견주기 → 임대 조건 협상표.
// 부품은 props·콜백만 쓴다(읽기·저장·바깥 부르기 없음). 부동산 사이트를 긁지 않고 링크만 건다.
// 부르는 쪽(LocationScreen)이 할 일:
//   onSave(fields, broker)      — addListing(fields), broker가 있으면 addCompany(broker.company)('duplicate'면 같은 이름 업체를 찾아) ·
//                                  addPerson(그 업체, broker.person) 뒤 updateListing으로 brokerId를 잇는다
//   onAddBroker(listingId, b)   — 같은 주소록 넣기 뒤 그 매물의 brokerId를 잇는다
//   onSaveTerms(candidateId, t) — updateCandidate(id, { terms: t }) (t는 terms 전체, terms.memo 포함)
//   onMakeCandidate(listing)    — 후보 더하기 판을 '붙여 넣은 매물에서 고르기'로 연다
// 실패는 던지면 된다(그 묶음에 E-LOC-SAVE-FAILED 오류 카드, 적은 값은 그대로).
// 다른 의원을 보는 중(읽기만, admin-view AC-8010.2)이면 매물 붙여 넣기 묶음과 [주소록에 넣기]가 없고 협상표 칸은 읽기만이다
import { useState } from 'react'
import { WriteOnly } from '@/components/shell/viewing'
import { compareListings, filterByPyeong } from '@/lib/location/listings'
import type { Candidate, Listing } from '@/types/location'
import type { BrokerBody } from './broker'
import type { ListingInput } from './form'
import { look } from './look'
import { NaverFinder, type NaverPlace } from './NaverFinder'
import { PasteForm } from './PasteForm'
import { PriceCompare } from './PriceCompare'
import { PYEONG_CHIPS, SavedListings, type PyeongChipId } from './SavedListings'
import { TermsTable } from './TermsTable'

export type { BrokerBody, ListingInput, NaverPlace }

/** 매물 화면이 읽는 후보 칸(협상표 열·후보 이름 칩) */
export type ListingCandidate = Pick<Candidate, 'id' | 'name' | 'status' | 'terms'>

export type ListingsViewProps = {
  /** 저장한 매물(차례 그대로 그린다) */
  listings: readonly Listing[]
  /** 후보(내려놓은 후보는 협상표에서 뺀다) */
  candidates: readonly ListingCandidate[]
  /** [네이버 부동산에서 보기]로 열 점(동 가운데·후보 자리). 한국 범위 밖 점은 뺀다 */
  places: readonly NaverPlace[]
  /** 처음 고를 점 id(없으면 첫째) */
  defaultPlaceId?: string
  /** [매물 저장]: 매물 몸통 + 주소록 몸통([주소록에도 넣어요]를 켜고 중개사 이름을 적었을 때만, 아니면 null) */
  onSave: (fields: ListingInput, broker: BrokerBody | null) => Promise<void> | void
  /** 저장한 매물 줄 [주소록에 넣기] */
  onAddBroker: (listingId: string, broker: BrokerBody) => Promise<void> | void
  /** 협상표: 그 후보의 terms 전체 */
  onSaveTerms: (candidateId: string, terms: Record<string, unknown>) => Promise<void> | void
  /** [후보로 저장](없으면 단추 없음) */
  onMakeCandidate?: (listing: Listing) => void
}

export function ListingsView({ listings, candidates, places, defaultPlaceId, onSave, onAddBroker, onSaveTerms, onMakeCandidate }: ListingsViewProps) {
  const [chip, setChip] = useState<PyeongChipId>('all')
  const range = (PYEONG_CHIPS.find((c) => c.id === chip) ?? PYEONG_CHIPS[0]!).range
  const shown = filterByPyeong(listings, range)
  const comparison = compareListings(listings)
  const candidateName = (id: string) => candidates.find((c) => c.id === id)?.name ?? null

  return (
    <div className={look.grid}>
      <NaverFinder places={places} defaultPlaceId={defaultPlaceId} />
      <WriteOnly>
        <PasteForm onSave={onSave} />
      </WriteOnly>
      <SavedListings
        listings={listings}
        shown={shown}
        chip={chip}
        onChip={setChip}
        comparison={comparison}
        candidateName={candidateName}
        onAddBroker={onAddBroker}
        onMakeCandidate={onMakeCandidate}
      />
      <PriceCompare listings={listings} shown={shown} comparison={comparison} />
      <TermsTable candidates={candidates} onSaveTerms={onSaveTerms} />
    </div>
  )
}
