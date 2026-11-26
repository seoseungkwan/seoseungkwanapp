'use client'

import type { ReactNode } from 'react'
import { ds } from '@/components/ui/classes'

// 수납 안내문(spec google-link REQ-8517 AC-8517.1): 비트시트 apps-script/SETUP.md를 웹앱 말로 고친 것.
// 단계 차례(1~8 · 알아 두면 좋은 것)와 낱말 풀이 표의 낱말은 그대로, '비트시트 프로그램 [설정]'은 '비트 PC 웹앱 수납일지 탭 [설정]'으로,
// 주소를 넣으면 이 PC에 뜨는 도우미 확인 창 [바꾸기](design.md 2절 표 17)를 더했다. 구글 코드가 답하는 글은 'Seoseungkwan sheet ok'(design.md 8-1).
// 웹앱에 없는 '설정 파일을 읽지 못했어요' 줄(비트시트 설정 파일)은 뺐다. 사진·환자 값은 없다(병원 이름 예는 ○○의원).
// 탭 안에서 열린다(부르는 쪽이 설정 화면 또는 none 화면 자리에 그린다). [‹ 돌아가기]는 onClose

const H3 = 'text-subtitle font-semibold text-ink'
const P = 'text-body text-ink-2'
const OL = 'grid list-decimal gap-1.5 pl-5 text-body text-ink-2'
const UL = 'grid list-disc gap-1 pl-5 text-body text-ink-2'
const NOTE = 'rounded-control border border-line bg-canvas px-4 py-3 text-small text-ink-2'
const TH = 'h-9 whitespace-nowrap border border-line bg-canvas px-3 text-left text-caption font-semibold text-muted'
const TD = 'border border-line px-3 py-2 align-top text-small text-ink-2'
const TD_KEY = `${TD} whitespace-nowrap font-semibold text-ink`

const WORDS: [string, string][] = [
  ['앱스 스크립트', '구글 계정 안에 두는 작은 심부름꾼 프로그램입니다. 내 구글 드라이브 안에서만 일합니다.'],
  ['프로젝트', '심부름꾼 하나를 담는 상자입니다. 이름을 붙여 둡니다.'],
  ['코드', '심부름꾼이 할 일을 적은 글입니다. 웹앱이 만들어 주므로 붙여 넣기만 합니다.'],
  ['웹 앱', '인터넷 주소로 부를 수 있게 열어 둔 심부름꾼입니다. 넣는 비트 PC가 이 주소로 환자 줄을 보냅니다.'],
  ['배포', '심부름꾼을 실제로 일하게 내보내는 것입니다. 가게 문을 여는 것과 같습니다.'],
  ['버전', '코드를 고친 판입니다. 고친 코드는 새 버전으로 배포해야 실제로 바뀝니다.'],
  ['권한 승인', '심부름꾼이 내 드라이브의 시트를 열고 고쳐도 된다고 허락해 주는 것입니다.'],
  ['비밀 글자', '넣는 비트 PC와 심부름꾼만 아는 암호입니다. 코드 안에 들어 있습니다. 암호가 맞는 요청만 일합니다.'],
  ['웹 앱 URL', '심부름꾼의 인터넷 주소입니다(URL = 인터넷 주소).'],
]

const TROUBLE: [string, string][] = [
  ['비밀 글자가 맞지 않아요 / 구글 코드에 비밀 글자가 아직 들어가지 않았어요', '7단계대로 코드를 다시 붙이고 새 버전으로 배포'],
  ['연결 시험에서 구글이 로그인·안내 화면을 보냈다고 나온다', '4단계 액세스 권한이 있는 사용자가 모든 사용자인지 확인(배포 관리 → 수정)'],
  ['원본 시트를 열 수 없어요', '원본 시트 주소가 맞는지, 원본이 같은 병원 계정에 있는지 확인'],
  ['그날 시트를 찾지 못했어요', '원본에 1~31 날짜 시트가 다 있는지 확인'],
  ['구글이 다른 넣기를 하는 중이에요', '1분쯤 기다렸다가 다시'],
  ['빈 줄이 모자라 다 넣지 못했어요', '날짜 시트의 빈 줄이 모자랍니다. [설정] › 시트의 환자 줄(몇 줄부터 몇 줄까지)이 시트와 맞는지 확인'],
  ['구글 코드가 옛 판이에요', '웹앱이 새 판으로 바뀌었을 때 나옵니다. 7단계대로 코드를 다시 붙이고 새 버전으로 배포'],
  ['이 PC에서 비밀 글자를 읽지 못했어요', '다른 PC나 다른 윈도 사용자에서 옮겨 왔을 때 나옵니다. [구글에 붙일 코드 복사]에서 새로 만들기를 고르고, 7단계대로 다시 붙이기'],
  ['이 PC의 확인 창에서 주소를 바꾸지 않았어요', '확인 창에서 [취소]를 눌렀거나 2분이 지났을 때 나옵니다. 넣기는 전에 쓰던 주소로 해요. 다시 [저장]을 누르고 확인 창에서 [바꾸기]'],
  ['취소된 접수 n명 — 시트에서 확인해 주세요', "아래 '알아 두면 좋은 것'의 취소된 접수를 보고, 그 줄을 손으로 정리"],
]

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <h3 className={H3}>{title}</h3>
      {children}
    </section>
  )
}

export function SheetGuide({ onClose }: { onClose: () => void }) {
  return (
    <article className="grid max-w-240 gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={ds.button.ghostSmall} onClick={onClose}>
          ‹ 돌아가기
        </button>
        <h2 className="text-title font-semibold text-ink">수납일지 구글 쪽 준비하기 (처음 한 번)</h2>
      </div>

      <div className="grid gap-3">
        <p className={P}>
          웹앱이 구글 시트에 환자 줄을 넣으려면, 병원 구글 계정 안에 <b className="font-semibold text-ink">받아 주는 곳</b>을 하나 만들어야 합니다. 한 번만 해 두면
          됩니다. 20분쯤 걸립니다.
        </p>
        <p className={NOTE}>
          <b className="font-semibold text-ink">병원 하나에 넣는 PC는 한 대</b>입니다. 비밀 글자는 [구글에 붙일 코드 복사]를 누른 비트 PC에 새로 생기고 구글 코드에는 하나만
          들어가서, 다른 PC에서 [구글에 붙일 코드 복사]를 하면 먼저 쓰던 PC는 더 넣지 못합니다.
        </p>
        <p className={NOTE}>구글 화면의 글자는 때에 따라 조금씩 다를 수 있습니다. 비슷한 이름의 단추를 누르면 됩니다.</p>
      </div>

      <Step title="먼저 낱말 풀이">
        <table aria-label="먼저 낱말 풀이" className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>낱말</th>
              <th className={TH}>쉬운 뜻</th>
            </tr>
          </thead>
          <tbody>
            {WORDS.map(([word, meaning]) => (
              <tr key={word}>
                <th scope="row" className={TD_KEY}>
                  {word}
                </th>
                <td className={TD}>{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Step>

      <Step title="1. 병원 구글 계정으로 들어가기">
        <ol className={OL}>
          <li>
            인터넷 창(크롬)에서 병원의 구글 계정으로 로그인합니다. 원장님 개인 계정이 아니라 병원 계정입니다. 원본 시트, 심부름꾼, 달마다 새로 생기는 수납일지 파일이 모두 이 병원
            계정 안에 생깁니다.
          </li>
          <li>
            한 인터넷 창에 구글 계정 여러 개가 로그인되어 있으면 다음 화면이 잘 안 열릴 때가 있습니다. 그럴 때는 다른 계정에서 로그아웃하거나, 크롬 시크릿 창(오른쪽 위 점 세 개 →
            새 시크릿 창)을 열고 병원 계정으로만 로그인해서 하세요.
          </li>
        </ol>
      </Step>

      <Step title="2. 원본 시트를 병원 계정에 두기">
        <p className={P}>&apos;일일 수납일지&apos; 원본 시트가 같은 병원 계정의 구글 드라이브에 있어야 합니다. 원본이 원장님 개인 계정에 있으면, 병원 계정에 사본을 하나 만들어 그것을 원본으로 씁니다.</p>
        <ol className={OL}>
          <li>원장님 개인 계정으로 원본 시트를 엽니다. 오른쪽 위 공유를 누르고, 병원 계정 메일을 넣은 뒤 권한을 뷰어로 고르고 보내기를 누릅니다.</li>
          <li>
            병원 계정으로 로그인합니다(1단계처럼). 병원 계정 메일함의 공유 메일이나 구글 드라이브 공유 문서함에서 그 시트를 엽니다. 위쪽 파일 → 사본 만들기를 누르고, 이름을 예를 들어
            &apos;○○의원 일일수납일지 (원본)&apos;으로 정한 뒤 확인을 누릅니다. 이제 병원 계정 드라이브에 사본이 생겼습니다. 앞으로는 이 사본이 원본입니다.
          </li>
          <li>방금 만든 사본을 연 채로 인터넷 창 위쪽의 주소를 복사합니다. 비트 PC 웹앱 수납일지 탭 [설정] › 시트의 원본 시트 주소 칸에 붙여 넣습니다.</li>
        </ol>
        <ul className={UL}>
          <li>원본의 날짜 시트에 예전 환자 줄 글자가 남아 있어도 괜찮습니다. 새 달 파일을 만들 때마다 그 파일의 날짜 시트에서만 남은 글자를 저절로 지웁니다(식·서식·체크박스는 그대로, 원본은 그대로).</li>
          <li>새 달 파일은 원본이 든 폴더에 저절로 생깁니다([설정] › 시트의 넣을 폴더에서 다른 폴더를 정할 수도 있습니다).</li>
        </ul>
      </Step>

      <Step title="3. 프로젝트 만들고 코드 붙이기">
        <ol className={OL}>
          <li>인터넷 창 주소 칸에 script.google.com 을 쳐서 들어갑니다.</li>
          <li>왼쪽 위 새 프로젝트를 누릅니다.</li>
          <li>맨 위의 제목 없는 프로젝트를 눌러 이름을 정합니다. 예: &apos;수납일지&apos;. 이름 바꾸기를 누릅니다. 이 이름은 5단계 경고 화면에 그대로 나옵니다.</li>
          <li>비트 PC 웹앱 수납일지 탭에서 [설정] › 구글 연결 › [구글에 붙일 코드 복사]를 누릅니다. 코드가 복사됩니다.</li>
          <li>
            구글 화면 가운데 글 칸에 이미 적힌 글(&apos;function myFunction() {'{'}&apos;로 시작)을 모두 지웁니다. 글 칸을 한 번 누르고 Ctrl 키와 A 키를 함께 눌러 다 고른 뒤 Delete
            키를 누르면 됩니다.
          </li>
          <li>빈 글 칸에 Ctrl 키와 V 키를 함께 눌러 붙여 넣습니다.</li>
          <li>위쪽의 디스크 모양 단추(프로젝트 저장)를 누르거나 Ctrl 키와 S 키를 함께 누릅니다.</li>
        </ol>
      </Step>

      <Step title="4. 배포하기 (심부름꾼 일하게 내보내기)">
        <ol className={OL}>
          <li>오른쪽 위 파란 배포 단추 → 새 배포를 누릅니다.</li>
          <li>유형 선택 옆 톱니바퀴 모양을 누르고 웹 앱을 고릅니다.</li>
          <li>
            칸을 이렇게 채웁니다. 설명: 비워도 됩니다(예: &apos;처음&apos;). 다음 사용자 인증 정보로 실행(실행할 사용자): 나(병원 계정 메일). 액세스 권한이 있는 사용자: 모든 사용자.
            &apos;Google 계정이 있는 모든 사용자&apos;가 아닙니다. 그냥 모든 사용자를 고르세요. 이것을 고르지 않으면 웹앱이 들어오지 못합니다.
          </li>
          <li>배포를 누릅니다.</li>
        </ol>
        <p className={P}>&apos;모든 사용자&apos;라서 걱정되실 수 있습니다. 괜찮습니다.</p>
        <ul className={UL}>
          <li>심부름꾼은 비밀 글자가 맞는 요청만 일합니다. 비밀 글자는 넣는 비트 PC와 이 코드에만 있습니다.</li>
          <li>주소를 인터넷 창으로 열어 보면 &apos;Seoseungkwan sheet ok&apos;라는 짧은 글만 보이고, 시트 내용은 하나도 나오지 않습니다.</li>
        </ul>
      </Step>

      <Step title="5. 권한 승인하기">
        <ol className={OL}>
          <li>액세스 승인(권한 승인)을 누릅니다.</li>
          <li>계정 고르는 창이 나오면 병원 계정을 고릅니다.</li>
          <li>
            &quot;Google에서 확인하지 않은 앱&quot;이라는 경고가 나옵니다. 왼쪽 아래 고급을 누르고, 아래에 나온 (프로젝트 이름)(으)로 이동(안전하지 않음)을 누릅니다. 예: 수납일지(으)로
            이동(안전하지 않음).
          </li>
          <li>심부름꾼이 할 수 있는 일 목록(구글 드라이브 파일 보기·만들기·고치기, 구글 시트 보기·고치기)이 나옵니다. 허용을 누릅니다.</li>
        </ol>
        <p className={P}>왜 괜찮은가요?</p>
        <ul className={UL}>
          <li>이 경고는 &quot;구글이 따로 검사하지 않은 프로그램&quot;이라는 뜻입니다. 남이 만든 앱이 아니라 병원 계정에 직접 붙여 넣은 내 심부름꾼이라서 구글이 검사할 일이 없었던 것뿐입니다.</li>
          <li>심부름꾼은 병원 계정 안에서만 일합니다. 하는 일은 원본 시트를 복사해 그 달 파일을 만들고, 날짜 시트에 비트 환자 줄을 넣는 것뿐입니다. 다른 곳으로 자료를 보내지 않습니다.</li>
          <li>드라이브 전체 권한을 묻는 까닭: 원본을 복사하고 폴더에서 그 달 파일을 찾아야 하기 때문입니다.</li>
        </ul>
      </Step>

      <Step title="6. 주소를 웹앱에 넣고 시험하기">
        <ol className={OL}>
          <li>배포가 끝나면 웹 앱 URL이 나옵니다(https://script.google.com/macros/s/ 로 시작하고 /exec 로 끝남). 옆의 복사를 누릅니다.</li>
          <li>구글 화면은 완료를 눌러 닫습니다.</li>
          <li>비트 PC 웹앱 수납일지 탭 [설정] › 구글 연결의 구글에서 받은 주소 칸에 붙여 넣습니다.</li>
          <li>
            [연결 시험]을 누릅니다. 이 PC 화면에 도우미 확인 창(수납일지 구글 코드 주소 바꾸기)이 뜨면 주소를 보고 [바꾸기]를 누릅니다. 원본 시트 이름이 나오면 성공입니다.
          </li>
        </ol>
        <p className={P}>
          주소와 함께 쓸 직원 메일은 이 PC 도우미에만 두고, 이 PC의 확인 창에서 [바꾸기]를 눌러야 바뀝니다. 이 주소와 코드는 다른 사람에게 주지 마세요(코드 안에 비밀 글자가 들어
          있습니다).
        </p>
      </Step>

      <Step title="7. 나중에 코드를 고칠 때 (새 버전)">
        <p className={P}>웹앱이 새 코드를 붙이라고 하거나, 비밀 글자를 새로 만들었을 때 합니다.</p>
        <ol className={OL}>
          <li>script.google.com 에서 그 프로젝트(예: 수납일지)를 엽니다.</li>
          <li>3단계 4~7처럼 [구글에 붙일 코드 복사] → 옛 글 모두 지우기 → 붙여 넣기 → 저장합니다.</li>
          <li>
            코드를 붙여 넣고 저장만 해서는 실제로 일하는 심부름꾼이 바뀌지 않습니다. 꼭 새 버전으로 배포해야 합니다. 오른쪽 위 배포 → 배포 관리를 누르고, 왼쪽에서 쓰고 있는 배포를
            고른 뒤 오른쪽 위 연필 모양(수정)을 누릅니다. 버전 칸을 눌러 새 버전을 고르고 배포를 누릅니다.
          </li>
          <li>
            이렇게 하면 구글에서 받은 주소는 그대로입니다. 웹앱 설정을 바꿀 필요가 없습니다. 새 배포를 또 만들면 주소가 새로 생깁니다. 그때는 새 주소를 웹앱 [설정]에 다시 넣고 확인 창에서
            [바꾸기]를 눌러야 합니다. 되도록 배포 관리 → 수정 → 새 버전으로 하세요.
          </li>
          <li>웹앱에서 [연결 시험]을 한 번 눌러 확인합니다.</li>
        </ol>
      </Step>

      <Step title="8. 잘 안 될 때">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>웹앱에 나온 말 / 모습</th>
              <th className={TH}>해 볼 것</th>
            </tr>
          </thead>
          <tbody>
            {TROUBLE.map(([shown, todo]) => (
              <tr key={shown}>
                <td className={TD}>{shown}</td>
                <td className={TD}>{todo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Step>

      <Step title="알아 두면 좋은 것">
        <ul className={UL}>
          <li>새 달 파일이 처음 생길 때, 설정에 적은 직원 메일로 구글이 &quot;공유되었습니다&quot; 메일을 한 번 보냅니다.</li>
          <li>
            새 달 파일이 처음 생길 때, 원본에서 물려받은 날짜 시트의 옛 환자 줄 글자를 지웁니다. 그날 수납일지 탭에 &apos;새 달 파일 날짜 시트에 남아 있던 글자 n칸을 지웠어요(원본은
            그대로)&apos;가 보입니다. 이미 있던 달 파일은 건드리지 않습니다.
          </li>
          <li>이미 만든 달 파일 이름을 바꾸거나 다른 폴더로 옮겨도 그 파일을 계속 찾아 씁니다. 휴지통에 버리면 다음에 새로 만듭니다.</li>
          <li>직원이 손으로 적은 줄(비트에 없는 환자), 비고·예약·지출 칸, 식이 든 칸은 건드리지 않습니다.</li>
          <li>
            취소된 접수: 먼저 넣은 환자가 나중에 비트에서 접수 취소되고 그날 다른 내원도 없으면, 그 줄의 차트번호·이름이 그대로 맞고 돈 칸·직원 칸(기본 G·O)이 모두 비었고 바로 아래에
            이어지는 돈 줄도 없을 때만 그 줄을 지웁니다. 하나라도 적혀 있으면 지우지 않고 &apos;취소된 접수 n명 — 시트에서 확인해 주세요&apos;로 알려 줍니다.
          </li>
          <li>
            늦게 낸 돈: 환자가 나중에 돈을 또 내면 그 환자 줄 바로 아래에 줄을 하나 끼워 넣습니다. 이때 A~P 칸만 한 줄씩 아래로 밀리고 지출(R~T) 칸은 그대로입니다. 끼운 줄의 NO 칸은
            비어 있습니다. 표 맨 아래 줄까지 다 차 있으면 끼우지 않고 &apos;건너뛴 줄&apos;로 알려 줍니다. 밀어 내릴 칸은 [설정] › 시트 › 밀어 내릴 칸에서 바꿀 수 있습니다.
          </li>
          <li>
            늦게 붙은 FREE: 수납 뒤에 비트에서 할인 &apos;사용자할인(FREE)&apos;를 고르면, 먼저 들어간 그 환자의 현금·카드 줄을 FREE 한 줄(기호 6, 0원)로 바꿉니다. 금액이 비트와
            똑같은 줄만 바꾸고, 직원이 금액을 고친 줄은 그대로 둡니다.
          </li>
        </ul>
      </Step>
    </article>
  )
}
