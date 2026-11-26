import { apptPaint } from '@/lib/calendar/gpaint'
import { DEFAULT_COLOR_NAME, G_COLOR_NAME, type GColor, type GPaint, type PaintCtx } from '@/lib/calendar/gshapes'
import { formatGoogleTitle } from '@/lib/calendar/gtitle'
import type { CalAppt, CalSettings } from '@/types/calendar'
import type { GcalLook } from '@/types/gcal'

// 예약 한 줄의 구글 쪽 모습(띠 못 보낸 목록·자세히 구역이 같이 쓴다): 칸 색(lib/calendar apptPaint)·구글 제목·색 이름

type LookColors = Pick<GcalLook, 'cancel' | 'change' | 'offColor'>

/** 칠하기 기준: 구글 연결 설정 색(취소·변경·off) + 지금 종류·시행자 */
export function paintCtx(settings: Pick<CalSettings, 'kinds' | 'staff'>, look: LookColors): PaintCtx {
  return { look: { cancel: look.cancel, change: look.change, offColor: look.offColor }, kinds: settings.kinds, staff: settings.staff }
}

export function apptGooglePaint(appt: CalAppt, settings: Pick<CalSettings, 'kinds' | 'staff'>, look: LookColors): GPaint {
  return apptPaint(appt, paintCtx(settings, look))
}

/** 구글에 적힌(적힐) 제목: 구글 제목을 그대로 두는 예약은 그 원문, 아니면 웹앱이 적는 꼴(lib/calendar formatGoogleTitle) */
export function googleTitleOf(appt: CalAppt, settings: Pick<CalSettings, 'kinds' | 'staff'>, look: GcalLook): string {
  if (appt.gKeepTitle && appt.gTitle) return appt.gTitle
  return webTitleOf(appt, settings, look)
}

/** 웹앱이 적는 제목(고치기 뒤 다시 적힐 제목) */
export function webTitleOf(appt: CalAppt, settings: Pick<CalSettings, 'kinds' | 'staff'>, look: GcalLook): string {
  return formatGoogleTitle(appt, look, settings.kinds, settings.staff)
}

/** 색 이름(구글 11색 이름 또는 '캘린더 기본 색') */
export const colorName = (key: GColor | 'default') => (key === 'default' ? DEFAULT_COLOR_NAME : G_COLOR_NAME[key])
