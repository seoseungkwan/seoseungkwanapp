import 'server-only'
import type { RulesFile, RuleType } from '@/types/precheck'
import { escapeTags } from '../text'

// 규칙 종류 설명과 규칙표 이름 목록(specs/rule-auto REQ-7808 AC-7808.3, design 8절). 순수 함수·상수만 둔다.
// 설명은 환자 자료 구역의 점검 처리기(lib/precheck/rules/sameDay.ts·past.ts·status.ts)를 읽고 썼다 — 구역 파일은 읽기만 했다.
// 둘 다 규칙 살피기 요청의 첫 블록(캐시)에 들어가므로 같은 규칙표면 늘 같은 글이어야 한다

/** 모든 종류가 함께 쓰는 대상 칸 설명(<type_guide> 첫 줄) */
export const TARGET_GUIDE =
  '공통: 대상 칸(`target`·`set_a`·`set_b`·`previous`·`required_prior`·`absent_same_day` 등)은 `codes`(처방코드 목록) · `code_groups`(코드 묶음 이름) · `drug_classes`(약 분류 이름) · `name_regex`(처방 이름 정규식) · `chart_regex_key`(차트 낱말 길) 가운데 하나 이상으로 처방 줄을 고른다. 차트 낱말 길은 `regions.`로 시작하는 글이다. 규칙의 grade는 기본 등급이고 params 안 grade는 그 경우의 등급이다. 규칙은 진료일이 effective_from~effective_to 안일 때만 돈다.'

/** 18종류마다 무엇을 보는지와 params 칸 뜻(1~600자) */
export const TYPE_GUIDE: Readonly<Record<RuleType, string>> = {
  count_window:
    '기간 안 횟수. 오늘 `target` 처방이 있으면 12개월 이력과 오늘의 `target` 처방을 `window` 안에서 `count_unit`으로 센다. `window`.type: rolling_days(+days) · calendar_week · calendar_year · fiscal_year · episode · cycle · course · lifetime_available_history. `count_unit`: visit_day(진료일 수) · qty(수량 합) · cycle · episode. 센 수가 `thresholds`의 at 이상이면 그 grade·message로 알린다. 기간이 여럿이면 `windows`(window·thresholds 묶음 목록). `group_by`(lesion_group · same_joint)는 같은 병소·관절만 센다. `drug_condition`(drug_classes_any)·`dx_condition`(dx_prefixes)은 그 약·상병이 있을 때만. `scope`·`metric`이 있으면 자동 점검하지 않는다.',
  claim_code:
    '청구 형식. 규칙 번호마다 코드 안에 정한 검사(주상병 1개, 차트 기록 없는 처방, 급여로 입력한 비급여 코드 등)를 하고 params는 사람이 읽는 설명이다: `checks`·`check`(볼 것), `condition`(조건), `target`(대상), `exclude`(뺄 것), `sam_check`(청구 파일에서 볼 것). 저절로 고칠 수 없는 종류다.',
  same_day_pair:
    '같은 날 함께 청구. 그날 처방에 `set_a`와 `set_b`(대상 모양, `set_b`는 chart_regex_key 차트 기록도)가 함께 있으면 알린다. `pairs_group`(코드 묶음의 pairs)·`pairs`(코드 짝 목록)면 짝 둘 다 있을 때. `resolution`은 고치는 법: lower_points_to_U · remove_a · remove_b · keep_one · keep_main · main_only · b_to_U · replace_a_with:코드 · flag. `same_site`가 있으면 차트 부위가 여럿일 때 등급을 한 단계 낮춘다. `not_in_set_a`·`absent_same_day`·`allowed_if`·`drug_condition`은 빼는 조건. `sam_check`(U항 등 청구 파일 확인)·`outpatient_only`(외래만)는 설명이다.',
  documentation:
    '기록 요건. 그날 `target` 처방이 있으면 차트 글에 필요한 기록이 있는지 본다. `required_all`은 항목 모두, `required_any`는 하나라도 있어야 한다. 항목은 element(side 좌우 · site_or_level 부위·레벨) 또는 chart_regex_key·regex_key(차트 낱말 길)·regex. `dx_condition`(dx_prefixes)은 그 상병일 때만. `required_views`는 투시 방향, `required_per_code`는 같은 날 초음파 2종 이상일 때 코드마다 근거. `when`이 있으면(같은 날 초음파 2종 조건 밖) 자동 점검하지 않는다.',
  required_dx:
    '필수 상병. 그날 `target` 처방이 있으면 `positions`(main 주상병 · sub 부상병) 자리 상병 가운데 `dx_prefixes`(상병코드 앞자리)로 시작하는 것이 있어야 한다. `dx_prefixes_not_counting`은 세지 않는 앞자리이고, 배제상병으로만 있으면 참고. `drug_condition`은 그 약이 있을 때만. `gosi_strict`는 고시에 정한 상병 그대로인지, `on_fail`은 없을 때 할 일 설명. `any_evidence`·`requirements`·`patient_condition`·`when`이 있으면 자동 점검하지 않는다.',
  info_only:
    '안내만. 프로그램이 판정하지 않고 사람이 확인하는 규칙이다. `reason_not_automatable`은 자동 점검할 수 없는 까닭이다. 점검이 돌지 않으므로 바뀔 수 있는 것은 title·message와 설명 칸뿐이다.',
  same_day_limit:
    '같은 날 한도. 그날 `target` 처방을 `metric`으로 세어 `max`를 넘으면 알린다. `metric`: multiplier_sum(배율 합) · qty_sum(수량 합, `per`가 code면 코드마다) · distinct_ingredients(성분 수) · distinct_codes(코드 수). `per`가 subgroup이면 `subgroups`(약 분류의 아래 분류)마다 센다. `group_by`가 lesion_group이면 같은 병소 안 서로 다른 코드 수를 `max_distinct_codes`와 비교하고 둘째 차단 배율은 `second_block_factor`. `categories`(이름별 대상)는 그날 든 종류 수를 `max`와 비교한다. `drug_condition`은 그 약이 있을 때만. `limits`·`max_units`·mg 단위는 자동 점검하지 않는다.',
  interval:
    '간격. 오늘 `target` 처방이 있으면 이력에서 직전 `previous`(대상 모양 + drug_condition·same_site, 대상이 없으면 `target`) 시행일을 찾아 간격이 `min_days`일보다 짧으면 알린다. `min_interval`(months·minus_days)은 달 수, `min_months`는 직전 주기 마지막 투여 뒤 달 수. `same_site`(joint 같은 관절 · same_lesion_group 같은 병소)면 같은 부위끼리만. `outcomes`(when: same_lesion_group·different_site, grade)로 등급을 나눈다. `drug_condition`(drug_classes_any)은 그 약이 있을 때만. `tolerance_days`·`patient_condition`은 설명이고 patient_condition.any가 있으면 자동 점검하지 않는다.',
  dur:
    '약 병용(같은 날 처방). `kind`가 combination이면 그날 `a`의 drug_classes 약과 `b`의 drug_classes 약(b의 exclude_drug_classes는 뺌)이 함께 있을 때, same_class_same_day면 `target`의 drug_classes 안 서로 다른 성분이 `min_distinct_ingredients`(기본 2) 이상일 때, same_ingredient_same_day면 같은 주성분의 다른 코드가 있을 때 알린다. `pairs_source`(병용 목록 출처)·`reason_codes`(병용 사유 코드)·`outcomes`(겹친 날 수별 등급)는 설명이다.',
  multiplier_cap:
    '배율 상한. 그날 `target` 처방의 배율(수량) 합을 차트 좌우(편측·양측)·척추 분절 수와 맞춘다. `compare`가 claimed_vs_cap이면 `cap`(unilateral · bilateral · side_unknown)을 넘을 때(`max_segments`는 한 부위 최대 분절), claimed_vs_expected면 `table`(unilateral·bilateral마다 분절 수 1·2·3+ → 배율)과 `tolerance`보다 다를 때 알린다. `region_split`이 있으면 경·흉·요가 섞인 날은 보지 않는다. 그 밖: `caps`(코드마다 상한) · `per_side`(좌우 각각) · `unit_per_side`+`expected` · `site_rules`(chart_regex_key·cap 목록) · `condition`(chart_regex_key).',
  drug_requirement:
    '약 요건. 그날 `target` 처방이 있으면(`not_applicable` 코드는 뺌) 약 줄을 본다. `require_drug_classes_any`: 그 약 분류 가운데 하나는 있어야 한다(`also_require_chart_regex_key` 차트 기록도). `forbid_only_drug_classes`: 주사약이 그 분류뿐이면 안 된다(`acceptable_with`는 괜찮은 분류). `forbidden_drug_classes_any`: 그 분류가 있으면 안 된다. `require_any`: 주사약 줄이나 차트 기록 하나는 있어야 한다. `forbid_separately_billed_drug_classes`: 그 분류를 따로 청구하면 안 된다. `scope`는 같은 진료 안이라는 설명. `condition`·`kind`가 있으면 자동 점검하지 않는다.',
  dx_site_match:
    '부위 대조. 그날 `target` 처방의 시술 부위를 상병·차트 부위와 맞춘다. `mode`: unusual_code_with_msk_only_dx(`positions` 자리 상병이 모두 `msk_dx_prefixes`로 시작하면 알림) · chart_keyword_vs_code(차트 낱말 chart_regex_key가 있으면 알림, suggest_code는 권장 코드) · chart_site_vs_code(차트 관절이 `joint_sites`에 있으면 알림) · chart_site_allowed_list(차트 관절이 `allowed_sites`에 없으면 알림). `mode`가 없으면 `procedure_region`(시술 부위 표)과 `dx_region`(상병 부위 표)이 `match`(any_overlap: 하나라도 겹치면 통과)대로 겹치지 않을 때 알린다.',
  dx_master:
    '상병마스터. 심평원 상병마스터로 불완전코드(DX-01)·주상병으로 쓸 수 없는 코드(DX-02)를 코드 안에서 본다. `master`(마스터 파일·판), `field`(마스터 칸 이름), `fail_value`(걸리는 값), `positions`는 설명이다. 저절로 고칠 수 없는 종류다.',
  visit_fee:
    '진찰료. 그날 진찰료 코드(`fee_code_claimed`)가 직전 내원 간격(같은 상병 30일·90일)·진찰 기록과 맞는지 규칙 번호마다 코드 안에서 본다. `condition`(조건 설명과 차트 낱말 길), `expected_code`(맞는 코드)는 설명이다. 저절로 고칠 수 없는 종류다.',
  imaging_count:
    '단순촬영 매수. 그날 `target` 촬영 코드의 매수(코드 끝자리)·횟수를 양측 표현(`bilateral_terms_regex_key`)·`pass_if_regex`(따로 찍음 등)·PACS 매수(`max_count`)와 맞춘다. 규칙 번호마다 코드 안 검사가 정해져 있고 나머지 칸은 설명이다.',
  episode_period:
    '치료 기간. `target` 처방의 치료 묶음 첫 시행일부터 센다. `episode`의 type이 episode면 new_episode_gap_days(기본 90일)를 넘게 비면 새 묶음(같은 병소만), course면 new_course_gap_days(기본 30일). `max_period`(calendar_months 달 · days 일)를 넘으면 알린다. `exception_dx_prefixes`(이름별 상병 앞자리)에 드는 상병이면 `exception_grade`. `outcomes`(after_days·grade)는 넘은 날 수마다 등급. `max_period_by_basis`·`episode_start`가 있으면 자동 점검하지 않는다.',
  forbidden_dx_combo:
    '같은 날 상병 조합 금지. 그날 `target` 처방이 있고 배제가 아닌 상병이 `forbidden_dx_prefixes`(이름별 상병 앞자리 목록) 가운데 하나로 시작하거나 `forbidden_drug_classes` 약이 있으면 알린다.',
  prerequisite:
    '앞선 치료. 오늘 `target` 처방이 90일 안에 처음이면, 90일 안에 `required_prior`(대상 모양 + min_count 횟수(기본 4) · min_span_days 기간(기본 14일))가 채워졌는지 본다. `exceptions_regex` 차트 낱말이 있으면 넘어간다.',
}

type Rec = Record<string, unknown>
const isRecord = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x)
const labelOf = (spec: unknown) => (isRecord(spec) && typeof spec.name === 'string' && spec.name.trim() ? ` [${spec.name.trim()}]` : '')

/** 코드 묶음의 코드(점검 엔진처럼 대문자, 겹침 뺌, 원래 차례) */
function groupCodes(spec: unknown): string[] {
  const list: unknown[] = Array.isArray(spec) ? spec : isRecord(spec) && Array.isArray(spec.codes) ? spec.codes : []
  const out: string[] = []
  for (const item of list) {
    const raw = typeof item === 'string' ? item : isRecord(item) ? item.code : ''
    const code = String(raw ?? '').trim().toUpperCase()
    if (code && !out.includes(code)) out.push(code)
  }
  return out
}

/** 차트 낱말 길: regions 맨 위 칸 모두 + chart_로 시작하는 칸의 아래 칸. _로 시작하는 칸은 설명이라 뺀다 */
function regionPaths(regions: Rec): string[] {
  const out: string[] = []
  for (const [key, value] of Object.entries(regions)) {
    if (key.startsWith('_')) continue
    out.push(`regions.${key}`)
    if (key.startsWith('chart_') && isRecord(value)) {
      for (const child of Object.keys(value)) if (!child.startsWith('_')) out.push(`regions.${key}.${child}`)
    }
  }
  return out
}

/**
 * <names> 안 글: 코드 묶음 `이름 [설명]: 코드, 코드…`(코드가 없으면 `(코드 모름)`), 약 분류 `이름 [설명] · 아래 분류: …`, 차트 낱말 길 목록.
 * 규칙표 칸 차례 그대로라 같은 규칙표면 늘 같은 글이다. 꺾쇠는 ‹·›로 바꾼다
 */
export function namesBlock(file: RulesFile): string {
  const lines: string[] = ['코드 묶음 (이름 [설명]: 코드):']
  for (const [name, spec] of Object.entries(file.code_groups)) {
    const codes = groupCodes(spec)
    lines.push(`${name}${labelOf(spec)}: ${codes.length ? codes.join(', ') : '(코드 모름)'}`)
  }
  lines.push('약 분류 (이름 [설명] · 아래 분류):')
  for (const [name, spec] of Object.entries(file.drug_classes)) {
    const subs = isRecord(spec) && isRecord(spec.subgroups) ? Object.keys(spec.subgroups) : []
    lines.push(`${name}${labelOf(spec)}${subs.length ? ` · 아래 분류: ${subs.join(', ')}` : ''}`)
  }
  lines.push('차트 낱말 길:', ...regionPaths(file.regions))
  return escapeTags(lines.map((line) => line.replace(/\p{Cc}/gu, ' ')).join('\n'))
}
