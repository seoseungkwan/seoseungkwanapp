import type { LeftReason } from '@/types/precheck'

// 빠지는 사람 묶음의 이름·까닭과 왼쪽 환자 목록의 묶음 차례(memo-split AC-3101.2). 글은 MemoRows.tsx의 LEFT_GROUPS(AC-018.26) 그대로 옮겼다.
// 쓰다 멈춘 사람 띠(StuckBand, AC-018.16)·환자 목록(MemoList)·고른 환자 상세(MemoDetail)가 같이 쓴다

/** 빠지는 사람 묶음의 이름과 까닭(AC-018.26). 쓰다 멈춘 사람 줄(StuckBand)도 같은 글을 쓴다(AC-018.16) */
export const LEFT_GROUPS: Record<LeftReason, { name: string; why: string }> = {
  done: { name: '이미 입력됨', why: '비트 메모가 우리 메모와 같아요. 다시 넣지 않아요.' },
  nomemo: { name: '메모 없음', why: '이 진료에는 넣을 메모가 없어요.' },
  mark: { name: '확인 필요', why: '메모에 확인 표시가 남아 있어요. 고치면 들어가요. 묻지 않기가 켜져 있어도 넣지 않아요.' },
  manual: { name: '직접 입력', why: '같은 사람의 같은 날 진료가 여럿이라 어느 진료에 넣을지 알 수 없어요. 비트에서 직접 넣어 주세요.' },
  diff: { name: '다른 메모 있음', why: '비트에 우리 메모와 다른 메모가 있어요. [바꾸지 않기]를 눌렀거나 직접 확인한 사람이에요. [이 메모로 바꾸기]를 누르면 들어가요.' },
  unread: { name: '비트 메모를 읽지 못함', why: '비어 있다고 보고 넣으면 두 번 들어갈 수 있어 뺐어요. 자료를 다시 불러와 주세요.' },
  held: { name: '지난번 건너뜀', why: '지난 입력에서 건너뛴 뒤 메모가 그대로예요. 메모를 고치거나 [다시 하기]를 눌러 주세요.' },
}

/** 왼쪽 목록에서 입력할 사람 묶음 다음의 차례(AC-3101.2): 확인 필요 → 다른 메모 있음 → 직접 입력 → 지난번 건너뜀 → 비트 메모를 읽지 못함 → 이미 입력됨 → 메모 없음 */
export const LIST_ORDER: readonly LeftReason[] = ['mark', 'diff', 'manual', 'held', 'unread', 'done', 'nomemo']

/** 입력할 사람 묶음의 이름(목록 머리·상세 머리의 '{묶음 이름} i / n') */
export const BATCH_NAME = '입력할 사람'
