'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import type { IconName } from '@/components/common/Icon'
import { ToolRow } from '@/components/patients/ToolRow'
import { AlertBar } from './AlertBar'
import { BitCodePicker } from './BitCodePicker'
import { CountTool } from './CountTool'
import { ExcelPreview, downloadTemplate } from './ExcelImport'
import { ItemsTool } from './ItemsTool'
import { MonthlyTool } from './MonthlyTool'
import { ReceiptsTool } from './ReceiptsTool'

// 재고 화면 (spec inventory REQ-7512 AC-7512.3, design.md 6절 TASK-15, 시안 docs/mockups/inventory ?s=list·count·in-list·month·excel·bit).
// h1 "재고" → 도구 단추 줄(환자 탭 ToolRow, 주소 ?tool=list|count|in|month, 처음·모르는 값은 목록) → 고른 도구.
// 도구 부품은 서로 부르지 않고 여기서 이어 준다:
// - 목록: ItemsTool 맨 위 자리에 AlertBar(챙길 것은 목록에만). [양식 받기] = downloadTemplate(실패면 E-INV-READ-FAILED 카드),
//   [엑셀 올리기]로 고른 파일은 목록 자리(챙길 것 포함)에 ExcelPreview를 열고 [넣기]·[취소] 뒤 목록으로 돌아온다. 다른 도구로 가면 미리 보기는 닫는다(같은 파일을 다시 읽지 않게).
//   [비트 코드에서 고르기] = BitCodePicker 판, 닫으면 초점을 연 단추로 돌린다.
// - 세기: [입고 적기] = 주소를 ?tool=in으로 바꾸고 ReceiptsTool을 "사진 없이 적기"로 연다. 세기 도구는 한 번 열면 숨기기만 해서
//   입고를 적고 돌아와도 적던 센 수가 그대로다(입고를 저장하면 다시 읽어 경고가 풀린다).
// - 저장 뒤 다시 읽기: 저장한 쪽이 아닌 도구의 reloadKey를 올린다. 목록·챙길 것은 제가 저장한 것은 스스로 고쳐 그린다(챙길 것은 다시 읽는 동안 줄이 접혀 [주문함]마다 깜빡이지 않게)

export type InventoryTool = 'list' | 'count' | 'in' | 'month'

export const INVENTORY_TOOLS: readonly { id: InventoryTool; label: string; icon: IconName }[] = [
  { id: 'list', label: '목록', icon: 'doc' },
  { id: 'count', label: '세기', icon: 'check' },
  { id: 'in', label: '들어온 기록', icon: 'arrowDown' },
  { id: 'month', label: '달별', icon: 'cal' },
]

/** 주소의 ?tool= 값들. 하나가 아니거나 모르는 값이면 목록 */
export function inventoryToolFrom(values: readonly string[]): InventoryTool {
  if (values.length !== 1) return 'list'
  return INVENTORY_TOOLS.find((tool) => tool.id === values[0])?.id ?? 'list'
}

export const inventoryToolHref = (tool: InventoryTool) => `/inventory?tool=${tool}`

const TOOL_ITEMS = INVENTORY_TOOLS.map(({ id, label, icon }) => ({ id, label, icon, href: inventoryToolHref(id) }))

/** 저장한 쪽. 목록·챙길 것은 저마다 세고, 나머지(세기·입고·엑셀·비트 코드)는 함께 센다 */
type SavedBy = 'items' | 'alerts' | 'other'

export function InventoryScreen({ today }: { today: string }) {
  const params = useSearchParams()
  const router = useRouter()
  const tool = inventoryToolFrom(params?.getAll('tool') ?? [])

  const [saves, setSaves] = useState<Record<SavedBy, number>>({ items: 0, alerts: 0, other: 0 })
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [bitOpen, setBitOpen] = useState(false)
  const [manual, setManual] = useState(false)
  const [templateFailed, setTemplateFailed] = useState(false)
  const [countOpened, setCountOpened] = useState(tool === 'count')
  const [shownTool, setShownTool] = useState(tool)
  const templating = useRef(false)
  const bitOpener = useRef<HTMLElement | null>(null)
  const restoreFocus = useRef(false)
  const screenRef = useRef<HTMLDivElement>(null)

  // 도구가 바뀌면(도구 단추·[입고 적기]) 목록 자리의 미리 보기·판·오류 카드를 거둔다. "사진 없이 적기"는 들어온 기록으로 갈 때만 남긴다
  if (shownTool !== tool) {
    setShownTool(tool)
    setExcelFile(null)
    setBitOpen(false)
    setTemplateFailed(false)
    if (tool !== 'in') setManual(false)
  }
  if (tool === 'count' && !countOpened) setCountOpened(true)

  const all = saves.items + saves.alerts + saves.other
  const savedBy = useCallback((by: SavedBy) => setSaves((now) => ({ ...now, [by]: now[by] + 1 })), [])
  const itemsChanged = useCallback(() => savedBy('items'), [savedBy])
  const alertsChanged = useCallback(() => savedBy('alerts'), [savedBy])
  const otherChanged = useCallback(() => savedBy('other'), [savedBy])

  const onTemplate = useCallback(async () => {
    if (templating.current) return
    templating.current = true
    setTemplateFailed(false)
    const ok = await downloadTemplate()
    templating.current = false
    setTemplateFailed(!ok)
  }, [])

  const onBitPick = useCallback(() => {
    // 연 단추(머리 줄 또는 빈 상태의 [비트 코드에서 고르기])를 기억해 닫은 뒤 초점을 돌린다
    bitOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setBitOpen(true)
  }, [])
  const closeBit = useCallback(() => {
    restoreFocus.current = true
    setBitOpen(false)
  }, [])

  useEffect(() => {
    if (bitOpen || !restoreFocus.current) return
    restoreFocus.current = false
    const opener = bitOpener.current
    bitOpener.current = null
    const target =
      opener?.isConnected === true
        ? opener
        : Array.from(screenRef.current?.querySelectorAll('button') ?? []).find((button) => button.textContent?.trim() === '비트 코드에서 고르기')
    target?.focus()
  }, [bitOpen])

  const onManualReceipt = useCallback(() => {
    setManual(true)
    router.push(inventoryToolHref('in'))
  }, [router])

  let body = null
  if (tool === 'list') {
    body = excelFile ? (
      <ExcelPreview
        file={excelFile}
        onDone={() => {
          setExcelFile(null)
          otherChanged()
        }}
        onCancel={() => setExcelFile(null)}
      />
    ) : (
      <>
        {templateFailed && (
          <div className="mb-6">
            <ErrorCard code="E-INV-READ-FAILED" />
          </div>
        )}
        <ItemsTool
          today={today}
          reloadKey={all - saves.items}
          onChanged={itemsChanged}
          alerts={<AlertBar today={today} reloadKey={all - saves.alerts} onChanged={alertsChanged} />}
          onTemplate={() => void onTemplate()}
          onUpload={(file) => {
            setTemplateFailed(false)
            setExcelFile(file)
          }}
          onBitPick={onBitPick}
        />
        {bitOpen && <BitCodePicker onAdded={otherChanged} onClose={closeBit} />}
      </>
    )
  } else if (tool === 'in') {
    body = <ReceiptsTool today={today} startManual={manual} onChanged={otherChanged} />
  } else if (tool === 'month') {
    body = <MonthlyTool today={today} />
  }

  return (
    <div ref={screenRef}>
      <h1 className="text-title font-semibold text-ink">재고</h1>
      <div className="mt-3">
        <ToolRow label="재고 도구" items={TOOL_ITEMS} current={tool} />
      </div>
      <div className="mt-6 max-md:mt-4">
        {/* 세기 도구는 한 번 열면 숨기기만 한다(적던 센 수를 잃지 않게) */}
        {countOpened && (
          <div hidden={tool !== 'count'}>
            <CountTool today={today} reloadKey={all} onChanged={otherChanged} onManualReceipt={onManualReceipt} />
          </div>
        )}
        {body}
      </div>
    </div>
  )
}
