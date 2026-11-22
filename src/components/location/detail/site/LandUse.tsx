import { SourceLine } from '@/components/location/common/SourceLine'
import { eumUrl, NEW_TAB } from '@/lib/location/links'
import { sourceOf } from '@/lib/location/sources'
import type { SourceId } from '@/types/location'
import { ExtIcon, LINK_BUTTON, Section, type HeadProp, type HowProp } from './parts'

// 후보 자세히 › 땅 쓰임·계획(specs/location AC-7909.4, 시안 ?s=candidate 'land' 묶음, 글은 requirements '화면 글 기본값').
// 땅 쓰임(용도지역)·지구단위계획·도로 계획·재개발은 받아 오지 않고, 그 필지(PNU 19자리)의 토지이음 화면을 새 창으로 연다.
// 필지 번호는 카카오 좌표→주소(k-point)에서 열 때마다 만든다(저장 안 함, ADR-045) — 부르는 쪽이 넘긴다. props만 받는다

export type LandUseProps = HeadProp & HowProp & {
  /** 후보 필지 번호(PNU 19자리). undefined = 아직 찾는 중, null = 만들지 못함(그 자리에 SOURCES 없음 글) */
  pnu: string | null | undefined
  onOpenSource?: (id: SourceId) => void
}

const LINK_TEXT = '토지이음에서 이 땅 보기'

function landUrl(pnu: string): string | null {
  try {
    return eumUrl(pnu)
  } catch {
    return null
  }
}

export function LandUse({ pnu, onOpenSource, head, howCtx, howOpen, onHow }: LandUseProps) {
  const url = typeof pnu === 'string' ? landUrl(pnu) : null
  return (
    <Section id="land" title="땅 쓰임·계획" aside="토지이음 링크로 봐요" head={head} howCtx={howCtx} howOpen={howOpen} onHow={onHow}>
      <p className="text-body text-ink">땅 쓰임(용도지역)·지구단위계획·도로 계획·재개발은 이 앱이 받아 오지 않아요. 토지이음에서 이 땅을 열어 직접 봐요.</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {url ? (
          <a href={url} {...NEW_TAB} className={LINK_BUTTON}>
            {LINK_TEXT}
            <ExtIcon />
          </a>
        ) : pnu === undefined ? (
          <span aria-disabled="true" aria-busy="true" className={LINK_BUTTON}>
            {LINK_TEXT}
            <ExtIcon />
          </span>
        ) : (
          <p className="text-small text-muted">{sourceOf('land')?.noneText}</p>
        )}
        <SourceLine src="land" onOpen={onOpenSource} />
      </div>
    </Section>
  )
}
