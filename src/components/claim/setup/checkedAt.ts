import { kstNow } from '@/components/shell/kstNow'

// 목업 '마지막 확인 11월 4일 (수) 09:12'. 한국 날짜·시각 읽기는 위쪽 띠 시계(kstNow → lib/analytics/dates.ts)와 같은 한 곳을 쓰고,
// 해와 '(KST)'만 뗀다
export function checkedAtText(at: Date): string {
  return kstNow(at).replace(/^\d+년 /, '').replace(/ \(KST\)$/, '')
}
