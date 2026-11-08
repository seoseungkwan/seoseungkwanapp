import { useLayoutEffect, useState, type RefObject } from 'react'

// 두 칸 높이(memo-split AC-3101.1, design.md '두 칸 높이'). 두 칸이 나란할 때(CSS lg = 64rem 이상) 두 칸 바깥 상자의 위 끝(창 기준 위 끝 + 스크롤)을 재어
// 처음 열었을 때 두 칸 아래 끝이 창 안에 들어오게 높이를 정한다: max(20rem, 창 높이 − 위 끝 − 16px)를 px로 돌려준다.
// 창 크기가 바뀌거나(resize) 위 도구 줄·띠의 높이가 바뀌면(ResizeObserver) 다시 잰다.
// lg 미만·enabled 아님·잴 수 없음이면 undefined다. 그때는 부른 쪽의 예전 class(lg:h-[max(30rem,calc(100dvh-8.5rem))])가 맡는다

/**
 * Tailwind lg와 같은 media query. media query의 rem은 브라우저 기본 글자 크기라(뿌리 글자 크기가 아니다) px로 바꾸지 않고
 * CSS와 같은 글로 묻는다: 기본 글자를 키운 PC에서도 CSS가 위아래로 쌓을 때 높이를 정하지 않는다
 */
const LG_QUERY = '(min-width: 64rem)'
/** 두 칸 아래 끝과 창 아래 끝 사이(px) */
const GAP = 16
/** 가장 작은 높이(rem) */
const MIN_REM = 20

function fit(box: HTMLElement | null): string | undefined {
  if (box === null || typeof window.matchMedia !== 'function' || !window.matchMedia(LG_QUERY).matches) return undefined
  const rect = box.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return undefined // 배치되지 않았다(숨김 등): 잴 수 없다
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const height = Math.floor(Math.max(MIN_REM * rem, window.innerHeight - (rect.top + window.scrollY) - GAP))
  return Number.isFinite(height) ? `${height}px` : undefined
}

/** 두 칸 바깥 상자(ref)의 높이(예: '622px'). lg(64rem) 미만·enabled 아님·잴 수 없으면 undefined */
export function useFitHeight(ref: RefObject<HTMLElement | null>, enabled: boolean): string | undefined {
  const [height, setHeight] = useState<string | undefined>(undefined)

  // 그리기 전에 잰다: 처음 열 때 예전 높이로 한 번 보였다가 바뀌지 않는다
  useLayoutEffect(() => {
    if (!enabled) return
    const update = () => setHeight(fit(ref.current))
    update()
    window.addEventListener('resize', update)
    // 위 도구 줄(불러옴 줄이 생기는 등)이나 그 위 띠가 커지면 두 칸 위 끝이 내려간다. 그것들을 담은 바깥 상자들을 지켜본다.
    // 두 칸 높이를 바꾸면 바깥 상자도 커져 한 번 더 불리지만 위 끝이 그대로라 같은 값이고 거기서 멈춘다
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    for (let box = ref.current?.parentElement ?? null; observer && box && box !== document.documentElement; box = box.parentElement) observer.observe(box)
    return () => {
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [ref, enabled])

  return enabled ? height : undefined
}
