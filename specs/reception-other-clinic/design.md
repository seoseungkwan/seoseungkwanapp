# 설계: 다른 병원용 접수 현황 — 설정 화면·혼자 설치

> 기능 ID: `reception-other-clinic` · 바탕: 갈래 `feat-reception-arrange-tune`(2550eb1) 위, 새 갈래 `feat-reception-other-clinic`. 시안 `docs/mockups/reception-other-clinic/`.
> 고치는 곳은 접수 현황 프로그램(`helper/src/Precheck.Core/Reception/**`, `helper/src/Precheck.Reception/**`, `Bit/Sql.cs` 허용 목록 한 줄), 설치 파일(`helper/install/*reception*`), 화면(`reception/www/**`)뿐이다. 운영 웹사이트·청구 도우미 동작·크롬 확장·DB는 건드리지 않는다.

## 1. 설정 문서 (REQ-5701)

### 모양 (저장 파일 = `GET /api/settings` 답 = `POST /api/settings` 몸)
```json
{
  "rev": 7,
  "logo": { "mode": "pic", "text": null, "ver": 3 },
  "tab": true,
  "setup": { "logo": true, "tab": true, "done": true },
  "nextX": 2,
  "cols": [
    { "k": "xray", "name": "X-RAY", "kind": "rx", "steps": 2, "show": true, "added": false, "rule": true, "codes": [] },
    { "k": "sono", "name": "SONO",  "kind": "rx", "steps": 3, "show": true, "added": false, "codes": ["SONO1", "SONO", "EB422", "EB466", "HA280"] },
    { "k": "carm", "name": "C-ARM", "kind": "rx", "steps": 3, "show": true, "added": false, "codes": ["CARM1", "G0400"] },
    { "k": "pt",   "name": "PT",    "kind": "mn", "steps": 2, "show": true, "added": false, "codes": [] },
    { "k": "ds",   "name": "도수",  "kind": "mn", "steps": 2, "show": true, "added": false, "codes": [] },
    { "k": "eswt", "name": "충격파", "kind": "mn", "steps": 2, "show": true, "added": false, "codes": [] },
    { "k": "trac", "name": "견인",  "kind": "mn", "steps": 2, "show": true, "added": false, "codes": [] },
    { "k": "x1",   "name": "IMS",   "kind": "mn", "steps": 2, "show": true, "added": true,  "codes": [] }
  ],
  "picks": { "carm": {…}, "sono": {…}, "pt": […], "ds": […], "eswt": { "hits": […], "counts": […] }, "trac": […], "extra": { "x1": ["목", "어깨", "허리", "무릎"] } }
}
```
- `cols` 차례 = 표 차례. 이름은 화면 글 전부의 근원이다(머리·쓰는 법·안내 줄·띠).
- `kind`는 처방으로 저절로 채우는지만 정한다. 어느 칸이든 빈 칸을 눌러 직접 넣을 수 있다(지금 X-RAY·SONO·C-ARM과 같음).
- 칸 열쇠에 붙은 특별한 모양은 열쇠로 정하고 종류와 상관없다: `xray` = X-ray 표시(`XrayMarks`)와 함께 쓰기·넣기 "X-ray 찍기"·rule, `sono` = 쪽·부위·부위 없이·같이 하는 것, `carm` = 시술·약재, `eswt` = 타수·부위 수 두 줄. 순서 번호는 열쇠가 아니라 설정으로 정한다: 단계 3인 처방 칸(종류 rx)마다(사용자 결정 2026-11-17). 그 밖(pt·ds·trac·더한 칸)은 한 줄 목록이다.
- `codes`는 칸이 rx일 때만 쓴다. 종류를 mn으로 바꿔도 지우지 않아(되돌려도 남게) 다시 rx로 바꾸면 그대로다.
- `logo.text`는 mode가 text가 아닐 때도 남긴다(다시 text로 바꾸면 그 글).
- `logo.ver`는 0이면 로고 그림 파일이 없다는 뜻이고, 옮기기(우리 의원 1)·그림 올리기마다 서버만 1 올린다. 화면은 ver > 0이면 [로고 그림]을 바로 저장한다(AC-5712.2).
- `nextX`는 더한 칸 열쇠 번호. 칸을 빼도 줄이지 않는다(오늘 표시 파일에 남은 옛 칸 표시가 새 칸에 붙지 않게).

### 클래스 (`Precheck.Core/Reception/Settings/`)
```csharp
public sealed class SettingsCol { string K, Name, Kind; int Steps; bool Show, Added; bool? Rule; IReadOnlyList<string> Codes; }
public sealed class ReceptionSettings {
    long Rev; LogoSetting Logo; bool Tab; SetupState Setup; int NextX; IReadOnlyList<SettingsCol> Cols; PickLists Picks;
    public static bool TryParse(byte[] json, out ReceptionSettings s);   // AC-5701.1~4
    public void Write(Utf8JsonWriter w);
    public static ReceptionSettings Ours(PickLists picks);              // AC-5701.5 (지금 ArrangeMap 값)
    public static ReceptionSettings Fresh();                           // AC-5701.6
    public IReadOnlyList<string>? ChangeProblem(ReceptionSettings next); // AC-5704.2 바꿀 수 없는 것
}
public sealed class SettingsStore {   // data\reception-settings.dat, ReceptionLists와 같은 머리·IProtector·잠금·임시 파일 → File.Replace
    public SettingsStore(IStoreFolder folder, IProtector protector, Func<byte[]?> embeddedWordmark, LogoStore logo, Action<string>? report);
    public ReceptionSettings Current();                  // 없으면 Ours/Fresh를 정해 바로 저장(AC-5701.5·6), 깨졌으면 이름 바꾸고 다시 만듦(AC-5701.7)
    public SaveResult Save(ReceptionSettings next);      // rev 비교(409)·바꿀 수 없는 것(400)·setup.done 참 지키기(AC-5701.8)·rev+1
    public ReceptionSettings Update(Func<ReceptionSettings, ReceptionSettings> change); // 로고 올리기처럼 서버가 바꿀 때(rev+1)
}
```
- `PickLists`는 그대로 쓰고 `Extra`(열쇠 → 이름 목록)만 더한다. 지금 `TryParse`(저장·몸)는 extra 없이도 받던 옛 파일 규칙 그대로 두고, 설정 문서 안에서는 extra가 꼭 있다.
- '우리 의원인가'는 그 PC에 접수 현황을 쓴 흔적(`reception-lists.dat`·`reception-arrange.dat`·`reception-marks.dat`)으로만 본다. 기관기호·병원 이름을 코드에 박지 않는다. 지금까지 접수 현황을 깐 곳은 우리 의원뿐이다.
- 옮길 때 로고: 품은 `reception/logo-wordmark.png`(Core에 이미 들어 있음)를 `LogoStore`에 PNG로 쓴다. 파일은 프로그램 안에 남지만 다른 병원 화면에는 쓰이지 않는다.
- 서버가 켜질 때(`ReceptionServices`) `Current()`를 한 번 불러, 표시 파일이 생기기 전에 설정 파일이 먼저 생기게 한다(새 병원이 우리 의원으로 잘못 보이지 않게).
- 처음 일곱 칸 기본 단계·종류는 지금 동작 그대로라 우리 화면이 바뀌지 않는다.

## 2. 칸 일반화 (REQ-5702·5703)

- `ArrangeCol` 열거형을 없애고 칸은 열쇠 글(`string`)이다. 지금 쓰는 곳(ArrangeMap·ArrangeMarks·ArrangeWrite·ArrangeBuilder·BoardModel·CheckReport·ReceptionRouter 한 곳)을 열쇠로 바꾼다. 상수 `ArrangeKeys.Xray`·`Sono`·`Carm`·`Pt`·`Ds`·`Eswt`·`Trac`, `ArrangeKeys.Originals`(일곱), `IsAddedKey`.
- `ArrangeLayout`(설정에서 만듦): 보이는 칸 `Cols`(차례), `StepsOf(k)`, `IsVisible(k)`, `RxMatch(code, name) → IReadOnlyList<string>`(AC-5702.1, 모든 맞는 칸), `ListOf(k)`(직접 칸 목록). 테스트·옛 부르는 곳을 위해 `ArrangeLayout.Ours`(=`ReceptionSettings.Ours(PickLists.Defaults)`).
- `ArrangeMap`은 '우리 의원 처음 값'의 출처로만 남는다(`Rules`·G 규칙 글). 확인 명령 보고서의 칸 이름도 이것으로 적는다(범위 밖).
- `ArrangeBuilder.Build(..., ArrangeLayout layout)`: 처방은 `RxMatch`로 칸마다 모은다(한 처방이 여러 칸). 단계 3이면 todo → ready → done, 2면 todo → done(지금 SONO·C-ARM만 3이던 규칙을 `StepsOf`로). 순서 번호는 단계 3인 처방 칸마다(칸마다 따로, 그 칸 처방 시각 순 — 지금 sono·carm 규칙을 그대로 넓힘). 숨긴 칸·설정에 없는 열쇠의 표시는 판에 쓰지 않는다.
- `ArrangeMarks`: 칸 열쇠 모양 `^[a-z][a-z0-9]{0,7}$`이면 읽는다(모르는 열쇠는 파일에 그대로). `IsDetail` = "|"로 나눈 1~16조각 × 1~21글자. C-ARM `IsPart` 줄 1~12.
- `ArrangeWrite.Apply(..., ArrangeLayout layout)`: col이 보이는 칸이 아니면 400. set ready는 단계 3 칸만. `add`:
  | 칸 | v | t |
  |---|---|---|
  | xray | "X-ray 찍기" | 없음 |
  | sono | 지금 규칙(1~6줄, 쪽 + 부위 / 부위 없이) | 같이 하는 것 0개 이상 |
  | carm | 시술 1개 이상 "|" (목록 차례, 겹침 없음) | 약재 0개 이상, 시술이 모두 약재 없음이면 없음 |
  | eswt | 타수 0개 이상 + 부위 수 1개 이상 "|" (타수 먼저) | 없음 |
  | pt·ds·trac·더한 칸 | 목록 이름 1~8개 "|" (목록이 빈 더한 칸은 "") | 없음 |
  `part`(SONO [부위 고르기]·C-ARM [시술 고르기])도 같은 v·t 규칙. 몸 한도 1024 그대로(가장 긴 몸: C-ARM 시술 12 × 31바이트 + 약재 12 × 31바이트 ≈ 760바이트).
- `Board.ToJson(arrange, picks, cfg)`: 맨 위 `cfg`는 늘(AC-5703.1), `arrange`·`picks`는 tab이 참일 때만. `picks`에 보이는 더한 칸의 `extra`.

## 3. 화면 (`reception/www/`, REQ-5708~5713)

| 파일 | 바뀌는 것 |
|---|---|
| `api.js` | `isBoard`가 `cfg`·cells 열쇠·`picks.extra`를 본다. `getSettings`·`setSettings`(204 ok·409 conflict·32768 한도)·`getCodes`·`getCodeName`·`setLogo`(바이트, Content-Type, 2097152 한도)·`getLogo(ver)`(답을 data: URL로) |
| `board.js` | `topOf`: 로고 모양 셋(cfg.logo), [⚙ 설정](두 탭, `view.onSettings`), cfg.tab이 거짓이면 [어레인지] 탭 없음 |
| `arrange.js` | `COLS` 고정 표를 없애고 cfg.cols로 그림. 열 머리 작은 글·쓰는 법 첫 줄(아래 규칙)·여러 개 칸 글("|" → "·")·안내 줄·넣기 창 두 모드([같이 고르기])·[☰ 목록 고치기]·8칸 이상 폭 줄이기 |
| `settings.js` (새) | 설정 쪽(`renderSettings(host, settings, view)`)·처음 설정 안내·칸 고치기 창·칸 더하기 창·로고 줄이기(`shrinkLogo(file)`) |
| `picks.js` | 목록 고치기 창을 칸 하나의 [고르기 목록] 탭 부품으로 바꿔(`listEditor(col, draft)`) settings.js가 쓴다. 더한 칸 한 줄 목록 |
| `detail.js`·`charts.js` | 머리 작은 로고를 cfg.logo로 |
| `offline.js`·`index.html` | 우리 로고·'양지바른정형외과' 글을 뺌. 끊김 화면은 메모리에 남은 앞 판 로고 |
| `app.js` | 길 `#/s`, 설정 읽기·바로 저장·[되돌리기] 띠(앞 문서 다시 저장)·409 다시 읽기, 로고 data: URL 메모리 기억(ver별 하나), 넣기 창 ↔ 칸 고치기 창 오가기, wipe 때 설정·코드·로고도 비움 |
| `style.css` | 설정 쪽·칸 고치기·칸 더하기·안내 카드·안내 줄·체크 상자 모드·더한 칸 머리(회색)·8칸 이상 폭(시안 모양, `var()`만, 새 색 없음) |
| `manifest.webmanifest`·`icon.png`(새) | 7절 |

### 쓰는 법 첫 줄 만들기 (AC-5710.2)
- `A` = 보이는 칸 가운데 단계 3인 칸 이름들. 첫 마디: A가 있으면 "치료 칸을 누르면 다음 단계로 넘어가요 (준비 → 준비완료 → 완료, 준비완료는 {A ·}만).", 없으면 "치료 칸을 누르면 다음 단계로 넘어가요 (준비 → 완료)."
- `R` = 보이는 rx 칸 이름들, `M` = 보이는 mn 칸 이름들. 둘째 마디: R이 있으면 "{R ·}{은/는} 처방이 나오면 저절로 들어오고" + (보이는 sono·carm 가운데 있는 것만) "(SONO는 [부위 고르기], C-ARM은 [시술 고르기]로 골라요)"(이름은 그 칸 이름, 조사는 아래 규칙) + (M이 있으면 ", ", 없으면 "."). M이 있으면 "{M ·}{은/는} 빈 칸을 눌러 골라 넣어요(여러 개 골라도 돼요)."
- 조사: 마지막 글자가 한글이면 받침 있으면 "은", 없으면 "는". 영문이면 L·M·N·R로 끝나면 "은", 그 밖 "는". 숫자면 0·1·3·6·7·8로 끝나면 "은", 그 밖 "는". 그 밖 글자는 "는". (지금 글 "C-ARM은"·"견인은", 시안 "IMS는"과 맞음)

### 넣기 창 (AC-5711)
- 창 상태 `{ col, multi: false, picked: [] }`를 지금처럼 `onSheet`로 넘겨 다시 그리기에 남긴다. 열 때마다 multi는 거짓.
- 한 줄 칸: multi 거짓이면 단추 = 바로 `add`. 참이면 체크 상자 + [넣기 · …]. 여러 줄 칸(eswt·sono·carm): multi 거짓이면 줄마다 하나(지금), 참이면 줄마다 여러 개.
- [☰ 목록 고치기] → `view.onEditCol(col, 'list', { back: 'sheet' })` → 칸 고치기 창(표 위) → [저장]·[취소] 뒤 같은 넣기 창 상태로 돌아간다.

### 설정 쪽 바로 저장과 되돌리기 (AC-5712)
- 쪽이 `settings`(마지막으로 받은 문서)를 갖는다. 누르면 `next = 바꾼 사본`을 먼저 그리고 `setSettings(next with rev)` → ok면 `settings = next(rev+1)`, 띠 + [되돌리기](`before` 문서를 지금 rev로 다시 저장, 5초, 한 번). conflict면 `getSettings()`로 다시 그리고 409 띠. 그 밖 실패면 `before`로 되그리고 실패 띠.
- 칸 고치기·칸 더하기 창은 초안을 갖고 [저장]·[더하기]만 보낸다. 저장 뒤 설정 쪽과 판은 다음 `/api/board`·다시 읽기로 맞춰진다.
- 처음 설정 안내는 `setup`과 지금 문서로 계산한다(AC-5712.7). 저장할 문서가 셋 다 했어요면 `setup.done = true`를 함께 넣는다.

### 처방 목록 무리 (AC-5713.2~5)
- `getCodes()`는 탭을 열 때 한 번(창이 열려 있는 동안 다시 읽지 않음). 직접 넣은 코드의 이름은 `getCodeName`을 코드마다 한 번(같은 창 안 기억).
- 추천 찾은 말은 `settings.js`의 표(xray·sono·carm 처음 낱말) + 칸 이름(처음 이름과 다르거나 더한 칸). 대소문자 무시, 코드·이름 어디든.

## 4. 길과 몸 한도 (REQ-5704~5706)

| 길 | 답 | 몸 한도 | 쓰기 검사 |
|---|---|---|---|
| `GET /api/settings` | 200 설정 문서 | — | 읽기 길과 같음 |
| `POST /api/settings` | 204 · 400 · 403 · 409 · 413 · 503(저장 실패) | 32768 | ClientGuard.WriteOk |
| `GET /api/codes` | 200 `{ "codes": [{ "c", "n", "v" }] }` · 503 | — | 읽기 |
| `GET /api/code/{c}` | 200 `{ "c", "n" }` · 404 · 503 | — | 읽기 |
| `POST /api/logo` | 204 · 400 · 403 · 413 · 503 | 2097152 | ClientGuard.WriteOk |
| `GET /api/logo` | 200 그림 · 404 | — | 읽기 |
| `POST /api/lists` | 404 (없앰) | — | — |
- `HttpRequestReader`: 지금은 몸 한도가 하나(`MaxBody` 8192)이고 버퍼가 그 크기로 정해져 있다. 요청 줄(메서드·경로)을 읽은 뒤 `BodyLimit(method, path)`로 길마다 한도를 정하고(위 표, 나머지 8192), Content-Length가 한도를 넘으면 몸을 읽지 않고 413. 버퍼는 Content-Length만큼만 잡는다. 머리 한도·요청 줄 한도는 그대로. `ClientGuard`의 몸 길이 검사(지금 `MaxBody`)도 같은 표를 본다. 표는 `Http/BodyLimits.cs` 한 곳.
- `/api/codes`: `ReceptionSql.RecentCodes`(@from Char(12)·@to Char(12)·@hospital) = 지금 `CheckSql.ArrangeCodes`와 같은 셈 + `AND UPPER(LTRIM(RTRIM(o.OdrCod))) NOT LIKE 'AA%'`, TOP 200, 이름은 같은 실행에서 `ReceptionSql.RxNames`. `ReceptionSql.CodeName`(@code VarChar(16)) = 코드 사전 이름 하나. 둘 다 `ReceptionSql.Parameters`와 `Sql.IsAllowed` 허용 목록에 더한다. 읽기는 `HospitalGate`(등록 확인 → 읽기 전용 → 되돌리는 트랜잭션), 8초 한도. 코드 목록 답은 메모리에 5분 둔다(창을 여닫을 때마다 비트를 읽지 않게, `CodesReader`).
- 로고: `LogoStore`(`data\reception-logo.dat`, 머리 + DPAPI, 첫 바이트 1 = PNG · 2 = JPEG). `LogoImage.TryRead(bytes, contentType, out kind, out w, out h)`가 서명·크기만 읽는다(픽셀을 풀지 않음). 저장 뒤 `SettingsStore.Update`로 mode·ver·setup.logo.
- 설정을 판에 넣기: 라우터가 `/api/board` 답을 만들 때마다 `SettingsStore.Current()`(파일 읽기 한 번, 비트 아님)로 `ArrangeLayout`·`cfg`를 만든다. 비트 읽기 캐시(`BoardCache`)는 그대로다.

## 5. 로고 줄이기는 화면 쪽에서 (AC-5712.3)
- 고른 그림(20MB까지)을 그 기기 브라우저가 `createImageBitmap`(안 되면 `<img>` + data: URL)로 열고, 가로 1200·세로 300 안으로 비율 그대로 줄인 `canvas`를 PNG(원본이 PNG) 또는 JPEG(품질 0.9, 그 밖)로 다시 만든다. 2MB를 넘으면 JPEG 품질 0.8 → 0.7로 다시 만들고, 그래도 넘으면 "로고를 올리지 못했어요".
- 까닭: Core(netstandard2.0)에는 그림 라이브러리가 없고 총괄 PC 서버에서 큰 그림을 푸는 것은 위험하다(큰 파일·악성 그림). 20MB를 와이파이로 보내지 않는다. 다시 만들면서 사진의 촬영 위치 같은 메타데이터가 빠진다. 서버는 줄어든 결과의 서명·크기만 본다.
- 시안 notes.md의 "그 PC가 줄여"는 '고른 기기가 줄여'로 읽는다(사용자에게 보이는 결과는 같다).
- 미리 보기는 `canvas.toDataURL`(data: URL)이라 CSP `img-src 'self' data:`를 바꾸지 않는다. 판의 로고는 `getLogo(ver)`가 받은 그림을 data: URL로 메모리에 두고 다시 그리기마다 그것을 쓴다(5초마다 그림을 다시 받지 않게, `Cache-Control: no-store`는 그대로).

## 6. 혼자 설치·등록 (REQ-5707)
- `ReceptionStart`: 인자가 정확히 `--register` 하나면 `register()` 대리자만 부르고 끝(뮤텍스·서버 없음). 대리자는 저장 참 → 0, 거짓 → `ExitCancelled` 3, 예외 → 1(기록에 번호). `--link`·인자 없음은 그대로.
- `Precheck.Reception/RegisterEntry.cs`(새): `ReceptionServices`와 같은 부품(`DpapiProtector`·`RegistrationStore(data\)`·`InstallationLocator`·`SqlBitConnector`·`VendorLogin`·`ConfirmWindow`)으로 `BitServices`를 만들어 `RegisterFlow.Run`. `Program.cs`가 `ReceptionStart`에 넘긴다. (부품 만들기 세 줄이 `ReceptionServices.CreateBit`와 겹치지만, 일꾼이 나란히 고칠 수 있게 파일을 나눈다. 합친 뒤 TASK-8이 하나로 모은다.)
- `install-reception.ps1`: 0단계(도우미·등록 필수)를 'zip의 app\ 파일 `Unblock-File` → 등록 없으면 `app\PrecheckReception.exe --register`를 `Start-Process -Wait -PassThru`로 돌리고 끝 번호로 가르기'로 바꾼다(AC-5707.2 글). 등록은 켜져 있던 접수 현황 끄기보다 먼저라, 취소·실패면 그 PC는 하나도 바뀌지 않는다. data\ 폴더가 없으면 만든다. 도우미가 있으면 끝 글에 "도우미는 그대로 두었습니다."를 둔다. 나머지 1~5단계는 그대로.
- `uninstall-reception.ps1`: 지금 그대로 + 끝 글 한 줄(AC-5707.4).
- zip(`helper.yml`의 precheck-reception): 구성은 그대로다(AC-5707.5). 판 번호·만들기·올리기는 합친 뒤 부모 세션이 ssk-clinic-pc-files로 한다.
- 확인 명령은 접수 현황 zip에 넣지 않는다. `ReceptionCheckEntry`는 콘솔 프로그램(PrecheckHelper.exe) 전제라 창 없는 접수 현황 exe에 붙이려면 콘솔 만들기가 따로 든다. 문제가 생긴 병원에는 지금 도우미 zip을 보내 reception-check.cmd만 누르게 한다(설치 없이 돌고, 등록 파일 자리 `PrecheckHelper\dataegistration.dat`가 같다).
- 비트 찾기(`InstallationLocator`)는 등록 없이도 폴더·레지스트리·실행 중인 비트에서 찾는다(도우미 [처음 등록]과 같은 길). 비트 로그인 창을 접수 현황 exe가 띄우는 것은 이 판이 처음이라 [의원 PC] AC-5707.6으로 확인한다.

## 7. 아이콘 (AC-5709.4)
- favicon·apple-touch-icon·manifest 아이콘은 병원과 상관없는 `icon.png`(512×512, 바탕 `--ink`, 가운데 흰 가로 막대 셋 = 목록 모양)를 쓴다. 그림은 `reception/tools/make-icon.py`(파이썬 표준 라이브러리 zlib·struct만)로 만들고 결과 PNG를 커밋한다.
- `logo-mark.png`·`logo-wordmark.png` 파일은 그대로 품는다(옮기기에 wordmark를 쓰고, 지금 품기 시험이 두 파일을 본다). 화면은 더 부르지 않는다.
- 우리 의원 태블릿에 이미 홈 화면에 더한 아이콘은 그대로 남는다(새로 더할 때부터 새 아이콘).

## 8. 데이터 흐름
```
[폰·태블릿] 5초마다 GET /api/board ─→ Router ─→ SettingsStore.Current() (data\reception-settings.dat)
                                            ├→ BoardCache(비트 SELECT) → BoardBuilder + ArrangeBuilder(ArrangeLayout) → JSON(cfg·arrange·picks)
[설정 쪽] GET /api/settings · POST /api/settings(rev) ─→ SettingsStore.Save
          GET /api/codes · GET /api/code/{c} ─→ CodesReader → HospitalGate → 비트 SELECT(RecentCodes·CodeName)
          [그림 고름] 기기 안 canvas로 줄임 → POST /api/logo ─→ LogoImage 검사 → LogoStore(data\reception-logo.dat) → SettingsStore.Update
[머리] cfg.logo.ver가 바뀌면 GET /api/logo 한 번 → data: URL(메모리)
[설치] install-reception.cmd → (등록 없으면) PrecheckReception.exe --register → 비트 로그인 → 확인 창 → data\registration.dat
웹사이트·Supabase·Claude API·인터넷: 아무것도 가지 않는다
```

## 9. 결정과 트레이드오프
- **설정 문서 하나를 통째로 주고받는다(rev로 부딪힘 막기).** 칸 하나만 바꾸는 작은 길 여럿보다 검사가 한 곳이고, [되돌리기]가 '앞 문서 다시 저장' 하나로 끝난다. 문서는 20KB 안팎이라 와이파이에서 문제없다. 두 기기가 같은 때 바꾸면 늦은 쪽이 409를 받고 다시 읽는다.
- **고르기 목록을 설정 문서 안으로.** 칸 고치기 [저장] 한 번이 이름·종류·단계·처방·목록을 한 파일에 한 번에 쓴다(두 파일에 나눠 쓰다 하나만 되는 일이 없게). 옛 `reception-lists.dat`는 읽어 옮기기만 하고 지우지 않는다(옛 판으로 되돌릴 때 쓰게).
- **처방 하나 → 여러 칸.** 사용자 결정 '중복 선택'. 지금 '처음 맞는 규칙 하나'를 '맞는 칸 모두'로 바꾼다. 우리 의원 처음 값에는 두 칸에 든 코드가 없어 지금 화면과 같다.
- **칸 열쇠는 글, 특별한 모양은 열쇠에.** 이름·종류·단계를 바꿔도 SONO 부위 창·C-ARM 시술 창·X-ray 표시 연결은 그 칸을 따라간다. 더한 칸은 한 줄 목록만(시안 결정).
- **'우리 의원'은 흔적 파일로 안다.** 기관기호 같은 값을 코드에 박지 않는다. 새 병원이 설치 첫날 옛 판을 깔았다가 새 판으로 바꾸는 일은 없다(옛 판은 우리 의원에만 있었다).
- **로고는 화면에서 줄이고 서버는 검사만.** 5절.
- **아이콘은 병원 로고를 쓰지 않는다.** 로고는 가로로 긴 그림이라 네모 아이콘에 맞지 않고, 다른 병원 기기에 우리 의원 아이콘이 남으면 안 된다.
- **설정 잠금 없음.** 사용자 결정. 대신 바로 저장마다 [되돌리기], 마지막 보이는 칸 숨김·처음 일곱 칸 빼기는 막는다.

## 10. 위험
- 칸 일반화가 지금 어레인지 코드 거의 전부를 건드린다(열거형 → 글). 지금 시험(어레인지·목록·돌아옴)이 우리 의원 처음 값으로 그대로 돌아야 한다: 옛 시험은 `ArrangeLayout.Ours`로 부르게 고치고 기대값은 바꾸지 않는다.
- 되돌리기 위험: 새 판을 쓴 날 옛 판 exe로 되돌리면 옛 판은 더한 칸 열쇠·"|" 여러 개 칸 글이 든 표시 파일을 깨진 파일로 본다(그날 어레인지 표시가 사라짐). 설정 파일은 옛 판이 읽지 않으므로 고르기 목록은 옛 `reception-lists.dat`(새 판 전 값)로 돌아간다. 설치 안내에 적는다.
- 접수 현황 exe가 비트 로그인 창을 띄우는 것은 처음이다(도우미에서만 돌았음). 비트 DLL을 불러오는 설정(app.config 바인딩)이 도우미와 다르면 의원 PC에서만 드러난다 → AC-5707.6을 새 병원에 주기 전에 우리 PC에서 먼저 본다(등록 파일을 잠시 다른 이름으로 두고 `--register`).
- 다른 병원 비트의 처방 표가 우리와 다르게 쓰였을 수 있다(지금 SQL은 우리 비트에서만 확인). 확인 명령 zip이 같이 가므로 문제가 생기면 보고서를 받는다.
- 큰 사진을 폰 브라우저가 못 열 수 있다(HEIC 등) → "로고를 올리지 못했어요". 사진 앱에서 JPG로 바꾸는 안내는 설명서에 넣는다.

## 11. 의원 PC에서만 확인하는 것
- AC-5705.5 진짜 처방 목록, AC-5706.4 폰 사진 로고, AC-5707.6 도우미 없는 PC 설치·등록, AC-5707.7 우리 의원 PC 새 판(화면이 지금과 같음).
