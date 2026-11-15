import { useId } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { THEMES, backgroundPick, isThemePick, withArt, withTheme } from '@/lib/forms/themes'
import { MAX_BACKGROUNDS, MAX_BG_WORDS, type SavedBackground } from '@/types/formBackground'
import type { ThemeArt, ThemeId, ThemePick } from '@/types/forms'
import { canSaveTrial, isFull, type PosterLook } from './backgroundState'
import type { Backgrounds } from './useBackgrounds'

// 휴진 안내 만들기 맨 아래 '배경' 칸 (specs/forms-themes REQ-4610~4612, design.md 10-3절, 승인 시안 docs/mockups/forms-themes/screen.html).
// 묶음 '배경 종류' [테마 그림] — 테마 고르기(옵션 24개)·그림 1·2 / [내 배경] — AI 배경 만들기·만든 배경·내 배경 목록.
// 고른 그림 값(pick = 안내문 theme)은 부르는 쪽 상태에 있고, 바꾸면 새 값을 onPick으로 보낸다. 부르기·저장은 hook(useBackgrounds)이 한다.
// 앱 화면 색·글자는 토큰과 ds만 쓴다(작은 그림은 data: 주소 <img>)

const HELP = '카드 이름에 공휴일 이름이 있으면 그 공휴일, 없으면 안내 달의 그림이 저절로 골라져요'
const BG_NOTE = '적은 말만 OpenAI 그림 AI로 보내요. 전화번호·주민번호·메일 주소는 적지 마세요. 한 장에 10초쯤 걸리고 약 80원이 들어요(하루 20장까지)'
const MAKING_NOTE = '그림을 만드는 중이에요. 10초쯤 걸려요'
const TRIAL_NOTE = '미리보기에 얹어 보았어요. 저장해야 이 안내문에 쓰고 뽑을 수 있어요'
const FULL_NOTE = '내 배경은 30장까지예요. 안 쓰는 배경을 지워 주세요'
const GONE_NOTE = '고른 내 배경이 지워져 저절로 고른 테마로 보여요'
const THUMB_PREFIX = 'data:image/jpeg;base64,'
const SECTION_TITLE = 'text-body font-semibold text-ink'
const NOTE_TEXT = 'text-small text-ink-2'
const KINDS: readonly ['theme' | 'mine', string][] = [
  ['theme', '테마 그림'],
  ['mine', '내 배경'],
]
const ARTS: readonly ThemeArt[] = [1, 2]
const HOLIDAYS = THEMES.filter((theme) => theme.kind === 'holiday')
const MONTHS = THEMES.filter((theme) => theme.kind === 'month')
const isThemeId = (value: string): value is ThemeId => THEMES.some((theme) => theme.id === value)
// 작은 그림 단추: 고른 것은 accent 테두리·바탕·1px 고리(시안 .thumb[aria-pressed])
const THUMB = `flex w-full min-w-0 cursor-pointer flex-col gap-1 rounded-control border p-1 text-left transition ${ds.focusRing}`
const THUMB_ON = 'border-accent bg-accent-soft ring-1 ring-accent'
const THUMB_OFF = 'border-line bg-surface hover:bg-canvas'

type Props = {
  pick: ThemePick | null // 안내문 theme(고른 그림 값)
  autoName: string // 저절로 고를 테마 이름 — '저절로(지금: …)'
  bg: Backgrounds
  note: PosterLook['note'] // 미리보기 그림 상태(내 배경 불러오는 중·실패·지워짐)
  onPick: (pick: ThemePick | null) => void
}

// 묶음 단추(ds.segment, aria-pressed). 휴대폰은 전체 폭 두 칸
function Segment<T extends string | number>({ label, labelledBy, items, on, onPick, className = '' }: {
  label?: string
  labelledBy?: string
  items: readonly (readonly [T, string])[]
  on: T
  onPick: (value: T) => void
  className?: string
}) {
  return (
    <div role="group" aria-label={label} aria-labelledby={labelledBy} className={`${ds.segment.group} max-md:grid-cols-2 ${className}`}>
      {items.map(([value, name]) => (
        <button
          key={value}
          type="button"
          aria-pressed={on === value}
          className={`${ds.segment.button} ${on === value ? ds.segment.on : ds.segment.off}`}
          onClick={() => onPick(value)}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

// 테마 고르기 값('auto' 또는 열쇠)과 그림 번호. withArt(값, 1)은 그림 번호만 1로 뗀 값이다
function themePartOf(pick: ThemePick | null): { value: string; art: ThemeArt } {
  if (pick !== null && pick.startsWith('bg-') && isThemePick(pick)) return { value: 'auto', art: 1 }
  const first = withArt(pick, 1)
  return { value: first ?? 'auto', art: first === pick ? 1 : 2 }
}

function ThemeBox({ id, pick, autoName, onPick }: { id: string; pick: ThemePick | null; autoName: string; onPick: Props['onPick'] }) {
  const { value, art } = themePartOf(pick)
  return (
    <div className="mt-3 flex flex-col gap-4">
      <div className={ds.field}>
        <label htmlFor={`${id}-theme`} className={ds.label}>
          테마
        </label>
        <select
          id={`${id}-theme`}
          className={ds.input}
          value={value}
          onChange={(e) => onPick(withTheme(pick, isThemeId(e.target.value) ? e.target.value : null))}
        >
          <option value="auto">{`저절로(지금: ${autoName})`}</option>
          <optgroup label="공휴일">
            {HOLIDAYS.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="달마다">
            {MONTHS.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <div className={ds.field}>
        <span id={`${id}-art`} className={ds.label}>
          그림
        </span>
        <Segment
          labelledBy={`${id}-art`}
          items={ARTS.map((n) => [n, `그림 ${n}`] as const)}
          on={art}
          onPick={(n) => onPick(withArt(pick, n))}
          className="self-start"
        />
        <p className={ds.help}>{HELP}</p>
      </div>
    </div>
  )
}

function MineBox({ id, pick, bg, note, onPick }: { id: string; pick: ThemePick | null; bg: Backgrounds; note: Props['note']; onPick: Props['onPick'] }) {
  const { state } = bg
  const { list, trial } = state
  const chosen: SavedBackground | null =
    list.kind === 'ok' && pick !== null && pick.startsWith('bg-') ? (list.items.find((b) => backgroundPick(b.id) === pick) ?? null) : null
  const count = Array.from(state.words).length

  return (
    <div className="mt-3 flex flex-col gap-4">
      <div className={ds.field}>
        <label htmlFor={`${id}-words`} className={ds.label}>
          AI 배경 만들기
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={`${id}-words`}
            type="text"
            className={`${ds.input} flex-1 basis-50`}
            maxLength={MAX_BG_WORDS}
            placeholder="예) 봄 벚꽃"
            autoComplete="off"
            value={state.words}
            aria-describedby={`${id}-words-note`}
            onChange={(e) => bg.setWords(e.target.value)}
          />
          <button type="button" className={ds.button.primary} disabled={state.making || state.words.trim() === ''} onClick={() => void bg.make()}>
            {state.making ? '만드는 중…' : 'AI로 배경 만들기'}
          </button>
        </div>
        <div className="flex items-start justify-between gap-3">
          <p id={`${id}-words-note`} className={ds.help}>
            {BG_NOTE}
          </p>
          <span className="shrink-0 text-caption text-muted tabular-nums">{`${count}/${MAX_BG_WORDS}`}</span>
        </div>
        {state.making && (
          <p role="status" className={NOTE_TEXT}>
            {MAKING_NOTE}
          </p>
        )}
        {state.makeError && <ErrorCard code={state.makeError} />}
      </div>

      {trial && (
        <div className="flex gap-3 rounded-float border border-accent bg-accent-soft p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- 작은 그림 data: 주소(이미지 최적화 대상이 아니다) */}
          <img src={`${THUMB_PREFIX}${trial.thumb}`} alt="" className="aspect-[12/17] w-15 shrink-0 self-start rounded-control border border-line bg-surface object-cover" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-small font-semibold text-ink [overflow-wrap:anywhere]">{`만든 배경: ${trial.words}`}</p>
            <p className={NOTE_TEXT}>{TRIAL_NOTE}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={ds.button.primarySmall}
                disabled={!canSaveTrial(state) || state.making}
                aria-busy={state.saving || undefined}
                onClick={() => void bg.saveTrial()}
              >
                {state.saving ? '저장하는 중…' : '내 배경으로 저장'}
              </button>
              <button type="button" className={ds.button.secondarySmall} disabled={state.saving || state.making} onClick={() => void bg.remake()}>
                다시 만들기
              </button>
              <button type="button" className={ds.button.ghostSmall} disabled={state.saving} onClick={bg.discard}>
                안 쓰기
              </button>
            </div>
            {isFull(state) && <p className="text-small text-warning">{FULL_NOTE}</p>}
            {state.storeError && bg.storeWork === 'save' && <ErrorCard code="E-FORMS-BG-STORE-FAILED" />}
          </div>
        </div>
      )}

      <div className={ds.field}>
        <div className="flex items-baseline gap-2">
          <h3 className={ds.label}>내 배경</h3>
          {list.kind === 'ok' && <span className="text-caption text-muted tabular-nums">{`${list.items.length}/${MAX_BACKGROUNDS}장`}</span>}
        </div>
        {(list.kind === 'idle' || list.kind === 'loading') && <p className="text-small text-muted">내 배경을 읽는 중…</p>}
        {list.kind === 'ok' && list.items.length === 0 && <p className="text-small text-muted">아직 저장한 배경이 없어요</p>}
        {list.kind === 'failed' && (
          <div className="flex flex-col items-start gap-2">
            <ErrorCard code="E-FORMS-BG-STORE-FAILED" />
            <button type="button" className={ds.button.secondarySmall} onClick={bg.retry}>
              다시 읽기
            </button>
          </div>
        )}
        {list.kind === 'ok' && list.items.length > 0 && (
          <ul className="grid max-h-90 list-none grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2 overflow-y-auto p-0.5">
            {list.items.map((item) => {
              const on = chosen?.id === item.id
              return (
                <li key={item.id} className="min-w-0">
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`${item.words} 배경`}
                    className={`${THUMB} ${on ? THUMB_ON : THUMB_OFF}`}
                    onClick={() => onPick(backgroundPick(item.id))}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- 작은 그림 data: 주소(이미지 최적화 대상이 아니다) */}
                    <img src={`${THUMB_PREFIX}${item.thumb}`} alt="" className="block aspect-[12/17] w-full rounded-control object-cover" />
                    <span className="truncate text-caption text-ink-2">{item.words}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {chosen && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-small text-ink-2 [overflow-wrap:anywhere]">{`고른 배경: ${chosen.words}`}</p>
            <button type="button" className={ds.button.danger} disabled={state.deleting} aria-busy={state.deleting || undefined} onClick={() => void bg.remove(chosen)}>
              이 배경 지우기
            </button>
          </div>
          {state.storeError && bg.storeWork === 'delete' && <ErrorCard code="E-FORMS-BG-STORE-FAILED" />}
        </div>
      )}
      {chosen && note === 'loading' && (
        <p role="status" className={NOTE_TEXT}>
          내 배경을 불러오는 중…
        </p>
      )}
      {chosen && note === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <ErrorCard code="E-FORMS-BG-STORE-FAILED" />
          <button type="button" className={ds.button.secondarySmall} onClick={bg.retry}>
            다시 읽기
          </button>
        </div>
      )}
      {note === 'missing' && (
        <p role="status" className={NOTE_TEXT}>
          {GONE_NOTE}
        </p>
      )}
    </div>
  )
}

export function ThemePicker({ pick, autoName, bg, note, onPick }: Props) {
  const id = useId()
  const mode = bg.mode
  return (
    <section aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className={SECTION_TITLE}>
          배경
        </h2>
        <Segment label="배경 종류" items={KINDS} on={mode} onPick={bg.setMode} />
      </div>
      {mode === 'theme' ? <ThemeBox id={id} pick={pick} autoName={autoName} onPick={onPick} /> : <MineBox id={id} pick={pick} bg={bg} note={note} onPick={onPick} />}
    </section>
  )
}
