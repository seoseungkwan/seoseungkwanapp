import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon } from '@/components/common/Icon'
import { WriteOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { SUNAP_HELPER } from '@/lib/bridge/versions'
import type { SunapDay, SunapSpend } from '@/lib/storage/sunap'
import { won } from './labels'
import { PanelHead, TABLE, TD, TD_MUTED, TD_NUM } from './rows/parts'
import { SPEND_LABEL, SunapCards } from './SunapCards'

// 다른 기기 수납일지(spec sunap-ilji AC-4905.7, 시안 remotePage): 도우미 없는 PC·폰·0.8.0 미만 도우미, 그리고 오늘−62일보다 이른 날.
// 서버 숫자만 그린다(마감한 날 합계 24칸·그날 지출). 고치기·마감 단추가 없다. 날짜 줄은 SunapScreen이 그린다.
// 안내 상자 아래 한 줄·[이 PC 연결하기]·[도우미 새 판 받기]는 비트 PC 연결 화면(/claim/setup)으로 간다(spec desk-setup REQ-7004, 시안 docs/mockups/desk-setup ①). 데스크·원장 같다
// 관리자가 다른 의원을 보는 중(admin-view AC-8009.2)이면 이 PC를 연결하는 한 줄·단추(/claim/setup)를 숨긴다 — 이 PC 비트로는 보는 의원 장부를 볼 수 없다
// 시안과 다른 곳: 원장님별 표를 뺐다(design.md, 서버에 원장님별 숫자를 두지 않는다 — spec sunap-doctors AC-5003.3). 읽는 중·읽기 실패·옛 도우미·62일 넘은 날·지출 없음 글은 시안에 없어 더했다

/** 서버에서 읽은 그날(마감 줄·지출). closed = null은 마감 전 */
export type ServerDayView = { status: 'loading' | 'ready' | 'failed'; closed: SunapDay | null; spends: readonly SunapSpend[] }
export type RemoteReason = 'device' | 'old-helper' | 'old-day'

const SETUP_HREF = '/claim/setup'

// more: 글 아래 한 줄, link: 연결 화면으로 가는 단추 글(없으면 단추 없음)
const AWAY: Record<RemoteReason, { title: string; body: string; more?: string; link?: string }> = {
  device: {
    title: '환자 장부는 접수 PC에서만 보여요',
    body: '이름·차트번호가 든 줄은 서버로 올리지 않아요. 고치거나 마감하려면 접수 PC에서 수납일지를 여세요.',
    more: '이 PC에 비트가 깔려 있으면 확장·도우미를 깔고 연결해서 장부를 볼 수 있어요.',
    link: '이 PC 연결하기',
  },
  'old-helper': {
    title: `도우미 새 판(${SUNAP_HELPER})을 깔면 장부가 보여요`,
    body: '이름·차트번호가 든 줄은 서버로 올리지 않아요. 새 도우미를 깐 뒤 이 화면을 다시 열어 주세요.',
    link: '도우미 새 판 받기',
  },
  'old-day': {
    title: '62일 넘게 지난 날은 합계·지출만 보여요',
    body: '비트에서 장부를 다시 읽을 수 있는 날은 오늘부터 62일 전까지예요.',
  },
}

const AWAY_TEXT = 'max-w-[44ch] text-small text-muted'

export function LockLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-2 text-small text-ink-2">
      <Icon name="lock" className="shrink-0 text-muted" />
      <span>{children}</span>
    </div>
  )
}

function SpendList({ spends }: { spends: readonly SunapSpend[] }) {
  const total = spends.reduce((sum, s) => sum + s.amount, 0)
  return (
    <section aria-label="지출 목록" className="min-w-0 rounded-control border border-line bg-surface">
      <PanelHead id="sunap-remote-spend-title" title="지출" hint={`${won(spends.length)}건 · ${won(total)}원`} />
      <div className="overflow-x-auto">
        <table className={`${TABLE} min-w-75`}>
          <tbody>
            {spends.length === 0 ? (
              <tr>
                <td colSpan={3} className={TD_MUTED}>
                  지출이 없어요
                </td>
              </tr>
            ) : (
              spends.map((spend) => (
                <tr key={spend.id}>
                  <td className={TD}>{SPEND_LABEL[spend.kind]}</td>
                  <td className={TD}>{spend.memo}</td>
                  <td className={TD_NUM}>{won(spend.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function RemoteView({ server, reason, onRetry }: { server: ServerDayView; reason: RemoteReason; onRetry(): void }) {
  const away = AWAY[reason]
  return (
    <>
      <LockLine>이 기기에서는 마감한 날의 합계·비율만 보여요. 환자 장부는 접수 PC에서만 열려요.</LockLine>
      {server.status === 'loading' && (
        <p role="status" className="text-small text-muted">
          불러오는 중이에요
        </p>
      )}
      {server.status === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="rounded-control bg-negative-soft px-4 py-3 text-small text-ink-2">
            <b className="font-semibold text-negative">서버에서 수납일지 숫자를 읽지 못했어요.</b> 인터넷 연결을 확인하고 [다시 불러오기]를 눌러 주세요.
          </p>
          <button type="button" className={ds.button.secondary} onClick={onRetry}>
            다시 불러오기
          </button>
        </div>
      )}
      {server.status === 'ready' &&
        (server.closed ? (
          <SunapCards totals={server.closed.totals} spends={server.spends} reserved={null} />
        ) : (
          <section className="grid justify-items-center gap-2 rounded-control border border-line bg-surface px-5 py-6 text-center">
            <b className="text-body font-semibold text-ink">아직 마감 전이에요</b>
          </section>
        ))}
      {server.status === 'ready' && <SpendList spends={server.spends} />}
      <section className="grid justify-items-center gap-2 rounded-control border border-line bg-surface px-5 py-6 text-center">
        <Icon name="lock" className="text-muted" />
        <b className="text-body font-semibold text-ink">{away.title}</b>
        <p className={AWAY_TEXT}>{away.body}</p>
        <WriteOnly>
          {away.more && <p className={AWAY_TEXT}>{away.more}</p>}
          {away.link && (
            <Link href={SETUP_HREF} className={`${ds.button.secondary} no-underline`}>
              {away.link}
            </Link>
          )}
        </WriteOnly>
      </section>
    </>
  )
}
