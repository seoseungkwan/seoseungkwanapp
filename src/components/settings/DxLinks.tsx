'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import { validatePhrases } from '@/lib/precheck/memo'
import { readHospitalSettings, writeHospitalSettings } from '@/lib/storage/claimSettings'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { DxLink } from '@/types/precheck'

// 설정의 '상병 연결표' 칸(AC-018.7·AC-018.18). 줄: 처방코드 · 상병코드 · 상병명 · 배제상병으로 · 출처(이 칸에서 더한 줄은 직접 추가 's'). 환자 자료가 아니다.
// 저장은 NOT NULL phrases를 함께 쓴다(design.md 19-3): 문구 줄이 없거나 틀린 병원은 저장 단추가 없다. 빈 문구 줄이 생기면 실패하거나 메모 막음이 풀린다.
// 그때 잠금 글은 E-MEMO-NO-SETTINGS 글(lib/errors)과 [설정으로 가기]다(clinic-profile AC-6607.4: precheck AC-018.18의 '처음 질문을 먼저' 글을 대신한다)

type Load = 'loading' | 'failed' | 'blocked' | 'ready'

const th = 'h-10 whitespace-nowrap border-b border-line px-2 text-left font-medium text-muted first:pl-0 last:pr-0'
const td = 'border-b border-line px-2 py-1.5 first:pl-0 last:pr-0'
const FIELD_TEXT: Record<1 | 2 | 3, string> = { 1: '처방코드', 2: '상병코드', 3: '상병명' }

/** 잠금 글(AC-6607.4): 오류처럼 빨갛게 하지 않고 파란 안내이고 오류 번호가 없다. 병원 문구 칸이 같은 설정 화면에 있다 */
function NoPhrases() {
  const info = errorInfo('E-MEMO-NO-SETTINGS')
  return (
    <div role="status" aria-label="병원 문구 없음" className="flex flex-col items-start gap-2 rounded-control bg-accent-soft px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-small font-semibold text-accent-strong">{info.what}</p>
        <p className="text-small text-ink-2">{info.fix}</p>
      </div>
      <Link href="/settings" className={ds.button.secondarySmall}>
        설정으로 가기
      </Link>
    </div>
  )
}

export function DxLinks() {
  const [load, setLoad] = useState<Load>('loading')
  const [rows, setRows] = useState<DxLink[]>([])
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [savedNote, setSavedNote] = useState(false)
  const [blank, setBlank] = useState(false)

  const read = useCallback(async () => {
    setLoad('loading')
    try {
      const row = await readHospitalSettings(supabaseBrowser())
      setRows(row?.dxLinks ?? [])
      setLoad(validatePhrases(row?.phrases).ok ? 'ready' : 'blocked')
    } catch {
      setLoad('failed')
    }
  }, [])

  useEffect(() => {
    void read()
  }, [read])

  const locked = load !== 'ready'
  const change = (index: number, next: DxLink) => {
    setSavedNote(false)
    setRows(rows.map((row, at) => (at === index ? next : row)))
  }

  async function save() {
    if (saving) return
    if (rows.some((row) => !row[0].trim() || !row[1].trim())) {
      setBlank(true)
      return
    }
    setBlank(false)
    setSaving(true)
    setSaveFailed(false)
    try {
      const sb = supabaseBrowser()
      // 문구는 그때 읽은 값을 그대로 쓴다: 다른 칸이 고친 문구를 덮지 않게
      const now = await readHospitalSettings(sb)
      if (!now || !validatePhrases(now.phrases).ok) {
        setLoad('blocked')
        return
      }
      await writeHospitalSettings(sb, { phrases: now.phrases, dxLinks: rows })
      setSavedNote(true)
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="dx-links-title" className={`${ds.panel} flex flex-col gap-3 p-5 max-md:p-4`}>
      <h2 id="dx-links-title" className={ds.panelTitle}>
        상병 연결표
      </h2>
      {load === 'loading' && <p className="text-small text-muted">상병 연결표를 읽는 중이에요…</p>}
      {load === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <ErrorCard code="E-SETTINGS-FAILED" />
          <button type="button" className={ds.button.secondarySmall} onClick={() => void read()}>
            다시 불러오기
          </button>
        </div>
      )}
      {(load === 'ready' || load === 'blocked') && (
        <>
          <div className={ds.table.wrap}>
            <table aria-label="상병 연결표" className={ds.table.table}>
              <thead>
                <tr>
                  <th className={th}>처방코드</th>
                  <th className={th}>상병코드</th>
                  <th className={th}>상병명</th>
                  <th className={th}>배제상병으로</th>
                  {!locked && <th aria-label="빼기" className={th} />}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="h-12 text-muted">
                      연결한 상병이 없어요.
                    </td>
                  </tr>
                )}
                {rows.map((row, index) => (
                  <tr key={index}>
                    {([1, 2, 3] as const).map((field) => (
                      <td key={field} className={td}>
                        <input
                          aria-label={`${index + 1}번 줄 ${FIELD_TEXT[field]}`}
                          className={ds.input}
                          autoComplete="off"
                          readOnly={locked}
                          value={row[field - 1] as string}
                          onChange={(event) => {
                            const next = [...row] as DxLink
                            next[field - 1] = field === 3 ? event.target.value : event.target.value.toUpperCase()
                            change(index, next)
                          }}
                        />
                      </td>
                    ))}
                    <td className={td}>
                      <input
                        type="checkbox"
                        aria-label={`${index + 1}번 줄 배제상병으로`}
                        disabled={locked}
                        checked={row[3] === 1}
                        onChange={(event) => {
                          const next = [...row] as DxLink
                          next[3] = event.target.checked ? 1 : 0
                          change(index, next)
                        }}
                      />
                    </td>
                    {!locked && (
                      <td className={td}>
                        <button
                          type="button"
                          className={ds.button.secondarySmall}
                          onClick={() => {
                            setSavedNote(false)
                            setRows(rows.filter((_, at) => at !== index))
                          }}
                        >
                          {index + 1}번 줄 빼기
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {load === 'blocked' && <NoPhrases />}
          {load === 'ready' && (
            <>
              {blank && <p className={ds.fieldError}>처방코드와 상병코드를 넣어 주세요.</p>}
              {saveFailed && <ErrorCard code="E-SETTINGS-FAILED" />}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={ds.button.secondary}
                  onClick={() => {
                    setSavedNote(false)
                    setRows([...rows, ['', '', '', 0, 's']])
                  }}
                >
                  줄 더하기
                </button>
                <button type="button" className={ds.button.primary} aria-busy={saving || undefined} onClick={() => void save()}>
                  {saveFailed ? '다시 저장' : '저장'}
                </button>
                {savedNote && <span role="status" className="text-small text-ink-2">저장했어요.</span>}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
