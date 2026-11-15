// 서식 탭 휴진 안내 '내 배경'(AI 배경 그림) 타입과 한도 숫자 (specs/forms-themes design.md 8-5절).
// 서버 경로·브라우저 저장·화면이 같이 쓴다. 표 제약 숫자는 supabase/migrations/20261115020000_form_backgrounds.sql과 같다

export const MAX_BG_WORDS = 30 // 적은 말 글자 수(앞뒤 공백을 뗀 유니코드 글자 수, 표 words 제약과 같다)
export const BG_PER_DAY = 20 // 병원마다 하루 AI 배경 장 수(migration take_ai_image의 20과 같다, AC-4607.3)
export const MAX_BACKGROUNDS = 30 // 저장해 두는 내 배경 장 수
export const BG_IMAGE_MAX_BYTES = 3_000_000 // 큰 그림 JPEG 바이트(그림 저장소 버킷 한도와 같다)
export const BG_THUMB_MAX = 16_000 // 작은 그림 base64 글자 수(표 thumb 제약과 같다)
export const BG_THUMB_SIZE = { width: 120, height: 170 } as const

// 저장한 내 배경 한 장. thumb = 작은 그림 JPEG base64 글, path = 그림 저장소 안 '<병원 id>/<id>.jpg', createdAt = 표 created_at
export type SavedBackground = { id: string; words: string; accent: string; thumb: string; path: string; createdAt: string }
// 안내문에 얹는 배경. image = 'data:image/jpeg;base64,…', accent = 그 그림에서 뽑은 강조색
export type BackgroundLook = { image: string; accent: string }
