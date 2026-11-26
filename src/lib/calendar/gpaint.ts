import { G_COLOR_ID, G_COLOR_NAME } from './gshapes'
import type { GColor, GKind, GLook, GPaint, GStaff, PaintAppt, PaintCtx } from './gshapes'
import { josa } from './josa'

// 예약 칸 색 고르기·같은 색 경고(spec google-link REQ-8521, notes-calendar '색 규칙'·colors 경고). 순수 함수다.
// 칸 색 차례: ① 취소 → 취소 색 ② 변경(처음 자리 있음·g_moved) → 변경 색 ③ 구글에서 온 색 → 그 일정 색(없으면 캘린더 기본 색)
// ④ 그 밖 → 종류 고정 색, 없으면 시행자 색. 구글에 적을 colorId도 같은 차례다(캘린더 기본 색은 colorId 없음)

const paint = (key: GColor | 'default', why: GPaint['why']): GPaint => ({ key, colorId: key === 'default' ? null : G_COLOR_ID[key], why })

/** ④ 설정 색만: 종류 고정 색, 없으면 시행자 색. 시행자 없는 예약은 종류 고정 색만, 목록에서 지운 종류·시행자는 캘린더 기본 색 */
export function settingColor(appt: Pick<PaintAppt, 'kindId' | 'staffId'>, ctx: Pick<PaintCtx, 'kinds' | 'staff'>): GColor | 'default' {
  const kind = ctx.kinds.find((k) => k.id === appt.kindId)
  if (!kind) return 'default'
  const staff = appt.staffId === null ? null : ctx.staff.find((s) => s.id === appt.staffId)
  if (staff === undefined) return 'default'
  return kind.color ?? staff?.color ?? 'default'
}

export function apptPaint(appt: PaintAppt, ctx: PaintCtx): GPaint {
  if (appt.status === 'cancel') return paint(ctx.look.cancel, 'cancel')
  if (appt.origDay !== null || appt.origStart !== null || appt.gMoved) return paint(ctx.look.change, 'change')
  if (appt.colorFrom === 'google') return paint(appt.gColor ?? 'default', 'google')
  return paint(settingColor(appt, ctx), 'setting')
}

type WarnInput = {
  staff: readonly Pick<GStaff, 'id' | 'name' | 'mark' | 'color'>[]
  kinds: readonly Pick<GKind, 'id' | 'name' | 'color'>[]
  look: Pick<GLook, 'cancel' | 'change' | 'offColor'>
}

/** 같은 색 경고(막지는 않음). notes-calendar colors 다섯 글, 조사는 낱말 끝에 맞춘다 */
export function colorWarnings({ staff, kinds, look }: WarnInput): string[] {
  const out: string[] = []
  const label = (s: Pick<GStaff, 'name' | 'mark'>) => `(${s.mark}) ${s.name}`
  const nm = (c: GColor) => G_COLOR_NAME[c]

  staff.forEach((s, i) => {
    const first = staff.findIndex((t) => t.color === s.color)
    if (first === i) return
    const a = label(staff[first])
    const b = label(s)
    out.push(`${a}${josa(a, '와/과')} ${b}${josa(b, '이/가')} 같은 색(${nm(s.color)})이에요. 시행자 글이 없는 구글 예약은 색으로 누구인지 알아볼 수 없어요.`)
  })

  for (const k of kinds) {
    if (k.color === null || k.color === 'default') continue
    const s = staff.find((t) => t.color === k.color)
    if (s) out.push(`'${k.name}' 색(${nm(k.color)})이 ${label(s)} 색과 같아요. 색만으로는 종류와 시행자를 가려낼 수 없어요.`)
  }

  if (kinds.some((k) => k.color === look.offColor) || staff.some((s) => s.color === look.offColor)) {
    out.push(`휴무 줄 색(${nm(look.offColor)})을 시행자·종류도 쓰고 있어요.`)
  }

  for (const [c, word] of [
    [look.cancel, '취소'],
    [look.change, '변경'],
  ] as const) {
    const who = [
      ...staff.filter((s) => s.color === c).map(label),
      ...kinds.filter((k) => k.color === c).map((k) => `'${k.name}'`),
      ...(look.offColor === c ? ['휴무 줄'] : []),
    ]
    if (who.length) {
      out.push(`${word} 색(${nm(c)})을 ${who.join('·')}도 쓰고 있어요. 구글에서 이 색 일정은 모두 '${word}'${josa(word, '로/으로')} 알아봐요. 다른 색을 골라 주세요.`)
    }
  }

  if (look.cancel === look.change) out.push(`취소 색과 변경 색이 같아요(${nm(look.cancel)}). 구글에서 취소와 변경을 가려낼 수 없어요.`)
  return out
}
