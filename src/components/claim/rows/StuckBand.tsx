import { ds } from '@/components/ui/classes'
import type { StuckPerson, StuckView } from '@/types/precheck'
import { dayLabel } from '../dateList'
import { LEFT_GROUPS } from './MemoRows'

// 쓰다 멈춘 사람 띠(AC-018.16, 빠진 화면 승인 목업 1번). 화면 맨 위 띠 하나이고 단추는 띠에 하나씩이며 쓰다 멈춘 사람 모두에게 한 번에 적용된다.
// 하나만 눌릴 때는 그 단추를 파랗게 한다. 자리 채움 값은 Worker가 도우미에 보낼 때만 쓰고 여기 오지 않는다(AC-018.15)

const when = (person: StuckPerson) => (person.date ? dayLabel(person.date) : `${Number(person.month.slice(5))}월`)

function PersonRow({ person }: { person: StuckPerson }) {
  if (person.state !== 'known') {
    const text = person.state === 'outside' ? (person.date ? '이 날을 불러와 주세요' : '이 달을 불러와 주세요') : '비트에 열려 있는 환자의 메모 칸을 확인해 주세요'
    return (
      <li className="flex flex-col gap-0.5 border-t border-line py-2">
        <span className="text-body font-semibold text-ink">{when(person)}</span>
        <span className="text-small text-ink-2">{text}</span>
      </li>
    )
  }
  return (
    <li className="flex flex-col gap-0.5 border-t border-line py-2">
      <span className="flex flex-wrap items-center gap-2">
        <span className="whitespace-nowrap text-small text-ink-2">{when(person)}</span>
        <span className="whitespace-nowrap text-small font-semibold text-ink">{person.name}</span>
        {person.reason && <span className={ds.chip.neutral}>{LEFT_GROUPS[person.reason].name}</span>}
      </span>
      <span className="text-caption text-muted">
        차트 {person.chart}
        {person.sameDay > 1 ? ` · 같은 날 진료 ${person.sameDay}건` : person.rxNames.length > 0 ? ` · 처방 ${person.rxNames.join(', ')}` : ''}
      </span>
      {person.reason && <span className="text-caption text-ink-2">{LEFT_GROUPS[person.reason].why}</span>}
      {person.reason === 'mark' && (
        <span className="rounded-control border border-line bg-canvas px-2 py-1.5 text-caption text-ink-2">
          <i className="font-medium not-italic text-muted">우리 메모 </i>
          <span className="whitespace-pre-wrap break-words">{person.text}</span>
        </span>
      )}
    </li>
  )
}

/** blocked는 묶음을 보내는 두 단추를 막는다. [자료 불러오기]는 불러와야 막힘이 풀리므로(AC-018.17) 비트 메모를 읽는 동안에만 흐리다(AC-018.24) */
export function StuckBand({ stuck, blocked, reading, onContinue, onByHand, onLoad }: { stuck: StuckView; blocked: boolean; reading: boolean; onContinue(): void; onByHand(): void; onLoad(): void }) {
  const { people, canContinue, canByHand, big, loadRange, note } = stuck
  const onlyByHand = canByHand && !canContinue
  return (
    <section aria-label="쓰다 멈춘 사람" className="flex min-w-0 flex-col gap-1.5 rounded-control border border-l-2 border-line border-l-warning bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-small font-semibold text-ink">쓰다 멈춘 사람</b>
        <span className={ds.chip.warning}>{people.length}명</span>
      </div>
      {big && <p className="text-subtitle font-semibold text-ink">비트에서 이 환자의 메모 칸을 직접 확인해 주세요</p>}
      <ul className="flex list-none flex-col">
        {people.map((person) => (
          <PersonRow key={person.key} person={person} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {loadRange && (
          <button type="button" className={ds.button.primary} disabled={reading} onClick={onLoad}>
            자료 불러오기
          </button>
        )}
        <button type="button" className={ds.button.secondary} disabled={blocked || !canContinue} onClick={onContinue}>
          이어서 입력
        </button>
        <button type="button" className={onlyByHand ? ds.button.primary : ds.button.secondary} disabled={blocked || !canByHand} onClick={onByHand}>
          직접 확인했어요
        </button>
      </div>
      {note && <p className="text-small text-ink-2">{note}</p>}
    </section>
  )
}
