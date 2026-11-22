'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { TAB_ACCESS_MENU, adminOnlyTabs, type MenuPath } from '@/components/shell/menu'
import { ds } from '@/components/ui/classes'
import { readTabAccess, readTabOwner, saveTabAccess } from '@/lib/storage/tabAccess'

// 설정 맨 아래 '관리자만 보는 탭' 칸 (multi-admin REQ-7707 AC-7707.2~5, design.md '설정 칸'·기본값 24·25, 시안 docs/mockups/multi-admin/settings.html, ADR-042).
// 주 관리자(admins 내 줄의 is_owner)에게만 보인다. 확인이 거짓이거나 실패하면 칸도 오류 카드도 그리지 않는다(새로 고치면 된다).
// 칸은 확인·목록 읽기가 둘 다 끝난 뒤 나타난다(읽는 중 글 없음). 체크 = '관리자만'(줄 없는 탭도 체크 — 새로 생긴 탭은 처음엔 관리자만).
// 저장·알림·실패는 상병 연결표(DxLinks)와 같은 방식이고 번호는 설정 칸 공통 E-SETTINGS-FAILED다. 저장은 12개를 한꺼번에 함수 한 번으로 보낸다.
// 틀·머리는 병원 정보 칸, 목록 틀은 병원 정보 '진료시간' 목록과 같은 클래스다. 몸 안 새 요소에는 폰 전용 모양(max-md 접두사)을 두지 않는다 — 칸 틀의 p-4 하나는 모든 설정 칸이 같이 쓰는 값이다

type Load = 'checking' | 'none' | 'failed' | 'ready'

const TITLE = '관리자만 보는 탭'
const INTRO =
  '켜 둔 탭은 관리자 계정에만 보여요. 다른 원장 계정과 데스크 계정에서는 메뉴에서 사라지고, 주소로 들어와도 대시보드로 돌아가요. 새로 생긴 탭은 처음에 켜져 있어요.'

export function TabAccessSettings() {
  const titleId = useId()
  const [load, setLoad] = useState<Load>('checking')
  const [checked, setChecked] = useState<ReadonlySet<MenuPath>>(new Set())
  const [reloading, setReloading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [savedNote, setSavedNote] = useState(false)
  // 화면을 떠난 뒤 온 답은 버린다
  const live = useRef(true)
  const busy = useRef(false)

  const readList = useCallback(async () => {
    try {
      const rows = await readTabAccess()
      if (!live.current) return
      setChecked(new Set(adminOnlyTabs(rows)))
      setLoad('ready')
    } catch {
      if (live.current) setLoad('failed')
    }
  }, [])

  useEffect(() => {
    live.current = true
    void (async () => {
      let owner = false
      try {
        owner = await readTabOwner()
      } catch {
        owner = false
      }
      if (!live.current) return
      if (!owner) {
        setLoad('none')
        return
      }
      await readList()
    })()
    return () => {
      live.current = false
    }
  }, [readList])

  if (load === 'checking' || load === 'none') return null

  async function reload() {
    if (reloading) return
    setReloading(true)
    await readList()
    if (live.current) setReloading(false)
  }

  function toggle(path: MenuPath, on: boolean) {
    setSavedNote(false)
    setChecked((now) => {
      const next = new Set(now)
      if (on) next.add(path)
      else next.delete(path)
      return next
    })
  }

  async function save() {
    if (busy.current) return
    busy.current = true
    setSaving(true)
    const adminOnly = TAB_ACCESS_MENU.filter((item) => checked.has(item.path)).map((item) => item.path)
    const everyone = TAB_ACCESS_MENU.filter((item) => !checked.has(item.path)).map((item) => item.path)
    try {
      await saveTabAccess(adminOnly, everyone)
      if (!live.current) return
      setSaveFailed(false)
      setSavedNote(true)
    } catch {
      if (!live.current) return
      setSaveFailed(true)
      setSavedNote(false)
    } finally {
      busy.current = false
      if (live.current) setSaving(false)
    }
  }

  return (
    <section aria-labelledby={titleId} className={`${ds.panel} flex flex-col gap-4 p-5 max-md:p-4`}>
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className={ds.panelTitle}>
          {TITLE}
        </h2>
        <p className="text-small text-ink-2">{INTRO}</p>
      </div>
      {load === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <ErrorCard code="E-SETTINGS-FAILED" />
          <button type="button" className={ds.button.secondarySmall} aria-busy={reloading || undefined} onClick={() => void reload()}>
            다시 불러오기
          </button>
        </div>
      )}
      {load === 'ready' && (
        <>
          <ul aria-labelledby={titleId} className="flex max-w-90 list-none flex-col rounded-control border border-line">
            {TAB_ACCESS_MENU.map((item) => (
              <li key={item.path} className="border-b border-line last:border-b-0">
                <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-body text-ink hover:bg-canvas">
                  <span className={ds.checkboxWrap}>
                    <input
                      type="checkbox"
                      className={ds.checkbox}
                      checked={checked.has(item.path)}
                      onChange={(event) => toggle(item.path, event.target.checked)}
                    />
                    <Icon name="check" className={ds.checkboxMark} />
                  </span>
                  {item.label}
                </label>
              </li>
            ))}
          </ul>
          {saveFailed && <ErrorCard code="E-SETTINGS-FAILED" />}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={ds.button.primary} aria-busy={saving || undefined} onClick={() => void save()}>
              {saveFailed ? '다시 저장' : '저장'}
            </button>
            {savedNote && (
              <span role="status" className="text-small text-ink-2">
                저장했어요.
              </span>
            )}
          </div>
        </>
      )}
    </section>
  )
}
