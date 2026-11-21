'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import type { ReadResult } from '@/lib/contacts/workbook'
import { look } from '../parts/look'
import { UploadIcon } from './icons'
import { readUpload } from './readUpload'

// [엑셀 올리기]·[다른 파일 고르기](design.md '화면' import/UploadButton.tsx, AC-6506.2).
// 숨은 파일 고르기 칸(.xlsx만 보이게) → 고른 파일을 브라우저 메모리에서 읽어 onRead({ fileName, result }). 네트워크·저장은 없다.
// 보조 단추는 시안대로 올리기 그림 + 글, 주 단추([다른 파일 고르기])는 글만

export type UploadRead = { fileName: string; result: ReadResult }

export function UploadButton({
  onRead,
  label = '엑셀 올리기',
  primary = false,
}: {
  onRead: (read: UploadRead) => void
  label?: string
  primary?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState(false)

  // 읽는 동안 다시 누르면 무시한다(기다림 모양 aria-busy)
  const open = () => {
    if (!reading) inputRef.current?.click()
  }

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const file = input.files?.[0]
    input.value = '' // 같은 파일을 고쳐 다시 골라도 change가 오게
    if (!file) return
    setReading(true)
    try {
      onRead({ fileName: file.name, result: await readUpload(file) })
    } finally {
      setReading(false)
    }
  }

  return (
    <>
      <button type="button" onClick={open} aria-busy={reading || undefined} className={primary ? look.primary : look.button}>
        {!primary && <UploadIcon />}
        {label}
      </button>
      <input ref={inputRef} type="file" accept=".xlsx" hidden tabIndex={-1} onChange={onChange} />
    </>
  )
}
