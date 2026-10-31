// 설치·연결 확인 화면의 바깥 주소(design.md 12절·13절). 주소는 이 파일 한 곳에 둔다

/** 도우미·확장 zip 받는 곳: GitHub 릴리스(태그 helper-v*의 precheck-helper-<버전>.zip · precheck-extension-<버전>.zip) */
export const HELPER_RELEASES_URL = 'https://github.com/seoseungkwan/seoseungkwanapp/releases'

/**
 * 크롬 웹스토어 비공개(unlisted) 등록 주소. 등록(사용자 일: 개발자 등록·심사 며칠) 전이라 아직 없다 →
 * 설치 안내는 릴리스의 확장 zip을 '압축해제된 확장 프로그램'으로 불러오는 순서로 대신한다(design.md 16절). 등록되면 여기에 주소를 넣는다
 */
export const EXTENSION_STORE_URL: string | null = null
