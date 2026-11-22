'use client'

// 저장한 매물 (spec location AC-7910.2·AC-7910.4, 시안 ?s=listings '저장한 매물').
// 평수 칩(○평~○평, listings.ts filterByPyeong — 화면 평으로 양 끝 넣음) · 표(넓이 areaText · 만 원 칸 돈 manText · 평당 월세 compareListings는 wonText) ·
// 줄마다 [매물 화면 열기](새 창) · 중개사 [주소록에 넣기](매물 중개사 글로 만든 주소록 몸통) · [후보로 저장](후보 더하기 판을 부르는 쪽이 연다)
import { useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { todayInKorea } from '@/lib/analytics/dates'
import { areaText } from '@/lib/location/area'
import { filterByPyeong, type ListingComparison, type PyeongRange } from '@/lib/location/listings'
import { NEW_TAB } from '@/lib/location/links'
import { manText, wonText } from '@/lib/location/money'
import type { Listing } from '@/types/location'
import { SourceLine } from '../common/SourceLine'
import { brokerBody, brokerFromNote, type BrokerBody } from './broker'
import { look } from './look'
import { ExtIcon, Section } from './Section'

export type PyeongChipId = 'all' | 'u30' | '30' | '50' | '70'

// 시안 PYF 다섯. 평은 화면 평(0.1평 단위)이라 'n평 아래'는 n − 0.1평까지다
export const PYEONG_CHIPS: readonly { id: PyeongChipId; label: string; range: PyeongRange }[] = [
  { id: 'all', label: '전체', range: { from: null, to: null } },
  { id: 'u30', label: '30평 아래', range: { from: null, to: 29.9 } },
  { id: '30', label: '30~50평', range: { from: 30, to: 49.9 } },
  { id: '50', label: '50~70평', range: { from: 50, to: 69.9 } },
  { id: '70', label: '70평 넘게', range: { from: 70, to: null } },
]

export type AddBroker = (listingId: string, broker: BrokerBody) => Promise<void> | void

const DASH = '–'
export const listingName = (l: Pick<Listing, 'title' | 'floorLabel'>) => `${l.title} ${l.floorLabel}`.trim()

/** 적은 날(한국 날짜) `11월 12일 적음` */
function writtenText(createdAt: string): string {
  const at = new Date(createdAt)
  if (Number.isNaN(at.getTime())) return ''
  const day = todayInKorea(at)
  return `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일 적음`
}

export function SavedListings({
  listings,
  shown,
  chip,
  onChip,
  comparison,
  candidateName,
  onAddBroker,
  onMakeCandidate,
}: {
  listings: readonly Listing[]
  shown: readonly Listing[]
  chip: PyeongChipId
  onChip: (id: PyeongChipId) => void
  comparison: ListingComparison
  candidateName: (id: string) => string | null
  onAddBroker: AddBroker
  onMakeCandidate?: (listing: Listing) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  async function addBroker(listing: Listing, body: BrokerBody) {
    if (busy !== null) return
    setBusy(listing.id)
    setFailed(false)
    try {
      await onAddBroker(listing.id, body)
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section title="저장한 매물" count={listings.length} aside="평당 월세 = 월세 ÷ 전용 평수">
      <div role="group" aria-label="평수로 거르기" className={look.chips}>
        {PYEONG_CHIPS.map((c) => (
          <button key={c.id} type="button" className={look.chip} aria-pressed={chip === c.id} onClick={() => onChip(c.id)}>
            {c.label}
            <span className={look.chipCount}>{filterByPyeong(listings, c.range).length}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className={look.empty}>{listings.length === 0 ? '아직 저장한 매물이 없어요.' : '이 평수 매물이 없어요.'}</p>
      ) : (
        <div className={look.tableWrap}>
          <table className={look.table}>
            <thead>
              <tr>
                <th scope="col" className={look.th}>
                  매물
                </th>
                <th scope="col" className={look.thNum}>
                  전용 넓이
                </th>
                <th scope="col" className={look.thNum}>
                  보증금
                </th>
                <th scope="col" className={look.thNum}>
                  월세
                </th>
                <th scope="col" className={look.thNum}>
                  관리비
                </th>
                <th scope="col" className={look.thNum}>
                  권리금
                </th>
                <th scope="col" className={look.thNum}>
                  평당 월세
                </th>
                <th scope="col" className={look.th}>
                  중개사
                </th>
                <th scope="col" className={look.th}>
                  후보
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => {
                const perPy = comparison.items[l.id]?.rent?.perPy ?? null
                const body = l.brokerId === null ? brokerBody(brokerFromNote(l.brokerNote)) : null
                const cand = l.candidateId === null ? null : (candidateName(l.candidateId) ?? '')
                const written = writtenText(l.createdAt)
                return (
                  <tr key={l.id} className={look.row}>
                    <td className={look.td}>
                      <b className={look.strong}>{listingName(l)}</b>
                      {l.url !== '' && (
                        <a className={look.iconLink} href={l.url} {...NEW_TAB} aria-label="매물 화면 열기">
                          <ExtIcon />
                        </a>
                      )}
                      {written && <span className={look.sub}>{written}</span>}
                      {l.memo !== '' && (
                        <span className={look.subLine} title={l.memo}>
                          {l.memo}
                        </span>
                      )}
                    </td>
                    <td className={look.tdNum}>{l.areaM2 === null ? DASH : areaText(l.areaM2)}</td>
                    <td className={look.tdNum}>{manText(l.deposit)}</td>
                    <td className={look.tdNum}>{manText(l.rent)}</td>
                    <td className={look.tdNum}>{manText(l.mgmt)}</td>
                    <td className={look.tdNum}>{manText(l.premium)}</td>
                    <td className={look.tdNum}>
                      <b className={look.strong}>{perPy === null ? DASH : wonText(perPy)}</b>
                    </td>
                    <td className={look.td}>
                      {l.brokerNote === '' ? DASH : <span className="block">{l.brokerNote}</span>}
                      {l.brokerId !== null && <span className={look.sub}>주소록에 있어요</span>}
                      {body && (
                        <button type="button" className={look.textButton} aria-busy={busy === l.id || undefined} onClick={() => void addBroker(l, body)}>
                          주소록에 넣기
                        </button>
                      )}
                    </td>
                    <td className={look.tdNoWrap}>
                      {cand !== null ? (
                        <span className={look.chipTag}>{cand === '' ? '후보' : `후보 ${cand}`}</span>
                      ) : (
                        onMakeCandidate && (
                          <button type="button" className={look.buttonSmall} onClick={() => onMakeCandidate(l)}>
                            후보로 저장
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <SourceLine src="user" />
      {failed && (
        <div className="mt-3">
          <ErrorCard code="E-LOC-SAVE-FAILED" />
        </div>
      )}
    </Section>
  )
}
