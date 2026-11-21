'use client'

import { Icon } from '@/components/common/Icon'
import { look } from './look'
import { useCopied } from './useCopied'

// [복사](spec contacts AC-6505.2, 시안 기본값 9·10 · copyBtn): 받은 값을 그대로 복사하고 1.6초 동안 '복사했어요'.
// 가린 값(계좌·사이트 비밀번호)도 가린 채로 복사한다. label = 화면 읽기 이름(예: '주소 복사')

export function CopyButton({ value, label }: { value: string; label: string }) {
  const { copied, copy } = useCopied()
  return (
    <button type="button" aria-label={label} onClick={() => void copy(value)} className={copied ? look.miniDone : look.mini}>
      <Icon name={copied ? 'check' : 'copy'} size={14} />
      {copied ? '복사했어요' : '복사'}
    </button>
  )
}
