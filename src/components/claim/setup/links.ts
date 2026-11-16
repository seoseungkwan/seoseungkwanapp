// 비트 PC 연결 화면의 바깥 주소(design.md 12절·13절). 주소는 이 파일 한 곳에 둔다

/**
 * 옛 받는 곳(GitHub 릴리스). 단계 안내·위 오류 상자의 받기 단추는 웹앱 보관함으로 바뀌었다(helper-download REQ-5103, components/install/DownloadButton).
 * 남은 쓰임은 SetupScreen의 '새 도우미가 있어요' 한 줄뿐이다 — 그 줄을 바꾸는 다음 TASK가 이 상수를 지운다
 */
export const HELPER_RELEASES_URL = 'https://github.com/seoseungkwan/seoseungkwanapp/releases'

/**
 * 크롬 웹스토어 비공개(unlisted) 등록 주소. 등록(사용자 일: 개발자 등록·심사 며칠) 전이라 아직 없다 →
 * 설치 안내는 웹앱 보관함의 확장 zip을 '압축해제된 확장 프로그램'으로 불러오는 순서로 대신한다(design.md 16절). 등록되면 여기에 주소를 넣는다
 */
export const EXTENSION_STORE_URL: string | null = null
