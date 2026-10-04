# Calendar 최신 요구사항 체크리스트

기준 branch: `fix/calendar-inline-search-feedback` (병합된 최신 `main`에서 분기)

> `feat/calendar-jet-components`와 `fix/calendar-latest-search-mentions`는 이미 병합·삭제된 과거 브랜치다. 최신 main을 되돌리지 않으며, 이 문서만 현행 사양 기준으로 사용한다.

## 구현 상태

- [x] 현재 `CalendarPage.tsx`, Git branch/diff, API helper 실제 상태 확인
- [x] 구형 `accountOptions`, `accountQuery`, `advanced`, 별도 하단 editor 참조 없음 확인
- [x] 일정 블록 내부 제목·시간 유형·날짜/시간 직접 입력 유지
- [x] 블록 전체 이동, 상·하단 resize, 10분 snap 유지
- [x] 하루종일·미지정 직접 입력 유지
- [x] 날짜 single-click 선택, desktop double-click/모바일 double-tap dialog 열기 유지
- [x] `@` 관계, `#` 사용자 검색 즉시 요청 및 stale response sequence 차단
- [x] 신규 검색 시작 시 이전 선택지를 즉시 비워 stale 옵션 클릭 경합 차단(독립 리뷰 지적 반영)
- [x] 검색 결과만 상태 변경하고 title input focus/caret 복구 유지
- [x] 검색 실패를 전역 오류/로딩 대신 검색 영역의 `role=alert`로 표시
- [x] 검색 중/검색 결과 없음/검색 실패 상태를 구분
- [x] `apiFetchQuiet`가 `credentials: include`, 401 인증 알림, HTTP 오류 전파를 유지하고 app busy count만 변경하지 않음을 테스트
- [x] 최초 Calendar 로드는 단일 `beginAppBusy()` 범위의 `finally`에서 성공·실패 모두 종료
- [x] 관계 선택이 기존 순수 제목을 비우지 않도록 수정
- [x] 첫 줄 순수 제목, 둘째 줄 실제 `@Account`, `#User`만 표시
- [x] Workload/Opportunity type/id와 Account metadata 분리 유지
- [x] Weekly Activities 세로 HTML 보기, popup 폭/모바일 viewport, 색상 draft/apply/cancel 기존 구현 유지

## 이번 변경본 검증

- [x] 회귀 테스트 RED 확인: 검색 오류/quiet fetch 계약이 구현 전 실패
- [x] `npm run test:calendar-meeting-notes`
- [x] `tests/appBusy.test.ts` 실행
- [x] `npm test -- --runInBand`
- [x] `npm run typecheck`
- [x] `npx ojet build web --release`
- [x] `git diff --check`
- [x] 운영 UI URL 실제 접근: 로그인 화면까지 확인
- [x] 실제 directory API endpoint 도달: 인증 없이 두 endpoint 모두 HTTP 401 확인
- [ ] 인증된 실제 API 결과 선택·저장·재조회: 인증 세션 부재
- [ ] iPhone long-press/scroll/double-tap/keyboard viewport: 실기기 부재

## 배포 게이트

- [ ] PR 병합
- [ ] 병합된 clean main release 재빌드
- [ ] 원자적 운영 배포 및 서비스/API/static bundle 검증
