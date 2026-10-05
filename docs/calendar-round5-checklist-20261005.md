# Calendar Round 5 — 원문 1–23 및 최신 정정 체크리스트

- 기준일: 2026-10-05
- 기준: 대표님 최초 1–21 원문, 추가 22–23 원문, 두 영상 이후 정정 및 본 스레드 최신 지시
- 판정 원칙: 필수 하위 조건 하나라도 실패·미검증이면 상위 항목은 완료하지 않는다.
- 상태: `[ ] 미검증`, `[~] 일부 통과/제한`, `[x] 완료`, `[!] 실패`
- 실제 인증 대상: Tailnet 8443 KAP, `ACTIVE`, `menuPermissions.calendar=WRITE`
- 테스트 데이터: `KAP-R5-*` 및 `R5 UI VERIFY *`로 식별되는 이번 검증 전용 일정만 생성·변경·삭제한다.
- **2026-10-05 후속 판정**: 원문 3은 빈 영역 선택 해제·다른 일정 선택 전환·선택/편집 분리, 원문 4는 참여자 다중 선택·해제와 제목 토큰 분리, 원문 12는 일반 타이핑 지연 제거, 원문 17은 WON/LOST Opportunity 검색 제외, 원문 18은 저장 확인 팝업 디자인, 원문 19는 시스템 UI 영어화다. occurrence/series 범위 선택은 원문 완료 조건이 아니며 신규 DB/API/migration을 추가하지 않는다. 시간 영역은 09:00–18:00만 스크롤하고 상단·종일·시간 미지정 영역은 고정한다. 실제 인증 및 fixture 증거는 `docs/calendar-round5-evidence/` 문서에 연결한다.

## 1. Loading / Processing 및 부분 갱신
- **원문·최신 정정**: 최초 Calendar 진입만 화면 전체 `Processing` 표시. 월·연도 변경은 달력 영역만, 저장·수정·삭제·이동·resize·토글 등 일정 작업은 해당 일정만 갱신한다. 검색·저장·수정·삭제·이동·resize·토글 전 과정에서 화면 깜박임, 포커스·스크롤 손실이 없어야 한다.
- **기대 동작**:
  - [ ] 최초 진입 전체 Processing 1회
  - [ ] 월·연도 변경 시 달력만 갱신
  - [ ] 일정 작업 시 해당 카드만 pending/rollback
  - [ ] 검색 포함 모든 동작에서 document/달력 재마운트·깜박임 없음
  - [ ] 입력 포커스와 스크롤 위치 유지
  - [ ] 지연 응답 및 실패 시 화면 유지, 서버 확정값으로 복구
- **수정 내용**: 대기
- **테스트 절차**: DOM identity, focus, scrollTop, 네트워크 지연·실패 주입 전후 비교
- **실제 결과·증거**: 대기
- **완료 여부**: [ ]

## 2. 팝업 기준 위치와 패널 이탈 금지
- **원문·최신 정정**: 팝업은 관련 컨트롤 가까이에 열리고 화면/Calendar 패널 밖으로 나가지 않는다.
- **기대 동작**: [ ] 옵션·검색·Recurrence·Save changes 팝업의 데스크톱/모바일 bounding box가 viewport 및 패널 안에 있음
- **수정 내용**: 대기
- **테스트 절차**: 실제 클릭 후 DOM rect 측정
- **실제 결과·증거**: 대기
- **완료 여부**: [ ]

## 3. 일정 카드 선택·편집 상태
- **원문·최신 정정**: 모든 저장 일정은 기존 카드 모양을 유지하고 보더·색상으로만 선택을 표현한다. 흰색 중앙 제목이나 자동 편집 전환을 금지한다. 다른 일정 선택·빈 공간 해제·단일 선택을 보장하며 제목 더블클릭으로만 편집한다.
- **기대 동작**:
  - [~] 저장 카드 기본 모양 유지(코드·정적 계약, 실제 computed-style 비교 미완료)
  - [x] 단일 선택 및 보더/색상 강조만 적용
  - [x] 단일 클릭은 선택만, 자동 편집 금지
  - [ ] 제목 더블클릭만 편집 진입 실제 브라우저 검증
  - [x] 다른 일정 클릭 시 선택 이동
  - [x] 빈 공간 클릭 시 선택 해제
- **수정 내용**: 첫 데스크톱 더블클릭은 실제 touch-open 시각이 존재할 때만 합성 이벤트로 억제하도록 초기값과 guard를 수정했다. 저장 일정 선택은 하나의 `selectedEventId`로 유지하고 빈 날짜 클릭은 이를 해제하며, 제목 더블클릭 경로는 선택과 분리했다.
- **테스트 절차**: fixture 브라우저 시나리오가 첫 더블클릭, 일정 A→B→빈 영역, 선택·액션 개수 및 09:00–18:00 재오픈을 강하게 검증한다. `npm run test:calendar-meeting-notes`의 소스 계약 회귀는 통과했다.
- **실제 결과·증거**: Engineering Lead 독립 환경에서 Playwright 실제 클릭으로 첫 데스크톱 더블클릭, 일정 A 선택→B 선택, 빈 날짜 영역 클릭 후 `.is-selected`와 action 0개를 확인했다. 09:00–18:00 재오픈도 통과했다. 신규 성공 증거: [`calendar-round5-evidence/fixture-r3-r4-20261005-engineering-run.json`](calendar-round5-evidence/fixture-r3-r4-20261005-engineering-run.json). 기존 sandbox 차단 증거는 원본 그대로 보존한다.
- **완료 여부**: [~]

## 4. 제목 검색과 Account/참여자 다중 선택
- **원문·최신 정정**: 제목의 `@Account`, `#참여자` 문맥에서만 검색한다. 체크박스로 복수 선택·해제가 가능하고, 선택 후 제목의 검색 토큰은 제거한다. 하단 관계 표시와 저장 후 유지가 필요하다.
- **기대 동작**:
  - [x] 일반 제목은 즉시 입력되고 검색이 열리지 않음
  - [~] `#` 참여자 검색은 실제 검증, `@` Account 검색은 실제 검증 미완료
  - [x] 체크박스 다중 선택·해제
  - [x] 선택 후 참여자 검색 토큰 제거
  - [x] 참여자 관계를 제목 아래 표시하고 저장/재조회 후 유지
- **수정 내용**: 참여자 편집기 내부를 document outside-click 예외에 포함했고, 접근 가능한 native checkbox의 단일 `change` 경로가 포인터·키보드 모두에서 저장된 일정의 즉시 동기화를 수행하도록 정리했다. 새 일정의 제목 `#` 선택은 draft에만 누적되고 Save 시 동기화된다.
- **테스트 절차**: fixture 브라우저 시나리오는 두 명 선택 상태에서 첫 참여자 해제→재선택→둘째 참여자 해제를 수행하며 매 단계 UI checked 상태, 정확한 API method/path/body, fixture persisted share를 함께 비교한다. 이어 reload/reopen/reselect와 saved-event 즉시 mutation, unsaved draft Save 전 0건·Save 후 create+2 share mutation을 검증한다.
- **실제 결과·증거**: Playwright 격리 fixture에서 native checkbox 두 명 선택 상태, 첫 참여자 해제→재선택→둘째 해제를 실제 클릭했다. 매 단계 UI checked 상태, 정확한 event PUT/share PUT·DELETE payload, fixture 저장 상태가 일치했고 reload 후 Share User만 유지됐다. 미저장 초안은 Save 전 mutation 0건, Save 후 event POST 1건과 share PUT 2건 및 재조회 상태를 확인했다. 신규 성공 증거: [`calendar-round5-evidence/fixture-r3-r4-20261005-engineering-run.json`](calendar-round5-evidence/fixture-r3-r4-20261005-engineering-run.json). 이는 격리 브라우저/API 동기화 증거이며 실제 2계정 ACL 증거는 아니다.
- **완료 여부**: [~]

## 5. 기존 일정 선택 후 인라인 편집
- **원문·최신 정정**: 기존 일정은 선택해도 카드 모습을 유지하고 자동 편집하지 않는다. 제목 더블클릭으로만 편집한다.
- **기대 동작**: [ ] 선택/열람과 편집 상태 분리, [ ] 더블클릭 전 input 부재, [ ] 더블클릭 후 해당 카드만 편집
- **수정 내용**: 대기
- **테스트 절차**: 클릭·더블클릭 전후 DOM 및 스타일 비교
- **실제 결과·증거**: 대기
- **완료 여부**: [ ]

## 6. Recurrence 팝업 디자인·흐름
- **원문·최신 정정**: Recurrence는 실제 Oracle JET/Redwood 컨트롤·간격·글꼴로 구성하고 클릭 흐름을 검증한다.
- **기대 동작**: [ ] JET/Redwood popup/controls, [ ] 카드 근처 위치, [ ] 반복·종료일·근무일수만 표시, [ ] 저장/취소 흐름 정상
- **수정 내용**: 대기
- **테스트 절차**: 아이콘 클릭→컨트롤 조작→적용→저장→재조회
- **실제 결과·증거**: 대기
- **완료 여부**: [ ]

## 7. 일정 생성 및 시간 이동·크기 조정
- **원문·최신 정정**: 빈 타임라인 드래그로 일정을 생성하고 일정 자체 drag/resize로 시간·길이를 변경한다. 일정 작업은 해당 카드만 갱신한다.
- **기대 동작**: [ ] 생성, [ ] 이동, [ ] 시작/종료 resize, [ ] 서버 저장·새로고침 유지, [ ] 실패 rollback
- **수정 내용**: 대기
- **테스트 절차**: 실제 pointer drag/resize와 API 응답·재조회 확인
- **실제 결과·증거**: 대기
- **완료 여부**: [ ]

## 8. 일정 우측 상단 액션 배치
- **원문·최신 정정**: 저장된 일정의 Recurrence·Private·Time Off·Cancel·Delete 등 액션은 일정 우측 상단에 겹치지 않게 배치하고 선택 상태에서만 명확히 노출한다.
- **기대 동작**: [ ] 우측 상단 정렬, [ ] 카드/텍스트 비침범, [ ] 선택 시 노출·해제 시 제거, [ ] 좁은 폭에서도 조작 가능
- **수정 내용**: 선택 액션 그룹과 icon-only 버튼 구조를 유지했다.
- **테스트 절차**: 선택 전후 DOM, action/card bounding box, 좁은 viewport 클릭 검증
- **실제 결과·증거**: fixture Playwright에서 선택 전후 action 1개→0개, 선택 일정 action group의 우측 절반·상단 절반 내 bounding box, Recurrence/Private/Time Off/Cancel Event/Delete 영어 버튼 가시성을 확인했다. 증거: [`calendar-round5-evidence/fixture-r3-r4-20261005-engineering-run.json`](calendar-round5-evidence/fixture-r3-r4-20261005-engineering-run.json).
- **완료 여부**: [x]

## 9. 일정 카드 2줄 요약과 툴팁
- **원문·최신 정정**: 첫 줄은 `시간 제목`, 둘째 줄은 `@Account #참여자`. 각 줄은 한 줄 말줄임이며 어느 한 줄이라도 잘리면 툴팁에 두 줄 전체를 표시한다.
- **기대 동작**: [ ] 정확한 2줄 구조, [ ] 각 줄 nowrap/ellipsis, [ ] 실제 overflow 판정, [ ] hover/focus 툴팁에 두 줄 전체
- **수정 내용**: 대기
- **테스트 절차**: 긴 전용 일정으로 line height·scrollWidth/clientWidth·툴팁 가시성 측정
- **실제 결과·증거**: 대기
- **완료 여부**: [ ]

## 10. 카드 색상과 범례
- **원문·최신 정정**: 카드 색상은 소유자/공유자 기준으로 일관되고, 범례는 Calendar 바로 위 우측에 배치한다.
- **기대 동작**: [ ] 카드·범례 색상 일치, [ ] 범례의 우측 정렬 및 surface 바로 위 위치
- **수정 내용**: 대기
- **테스트 절차**: computed color 및 bounding box 비교
- **실제 결과·증거**: 대기
- **완료 여부**: [ ]

## 11. 고정 영역과 시간 영역 스크롤
- **원문·최신 정정**: 상단·종일·시간 미지정 영역은 고정하고 09:00–18:00 시간 영역만 스크롤한다.
- **기대 동작**: [ ] 상단/종일/미지정 영역 고정, [ ] 시간 영역 전용 스크롤, [ ] 스크롤 중 고정 영역 위치 유지, [ ] 모바일 조작 가능
- **수정 내용**: 09:00–18:00 timeline을 전용 scroll container에 유지했다.
- **테스트 절차**: scrollTop 변경 전후 고정 영역·timeline bounding box 및 실제 wheel/touch 스크롤 비교
- **실제 결과·증거**: 390×600 fixture viewport에서 timeline scrollTop을 실제 변경하고 09:00–18:00 전용 scroller만 이동하며 undated 고정 영역의 y 좌표가 유지됨을 확인했다. 증거: [`calendar-round5-evidence/fixture-r3-r4-20261005-engineering-run.json`](calendar-round5-evidence/fixture-r3-r4-20261005-engineering-run.json).
- **완료 여부**: [x]

## 12. 일반 입력 지연 제거
- **원문·최신 정정**: 일반 제목 입력은 검색·저장 처리와 분리되어 즉시 화면에 반영되고 포커스가 유지되어야 한다.
- **기대 동작**: [ ] 문자별 반영 시간 측정, [ ] 포커스 유지, [ ] 일반 입력 중 검색 요청 없음, [ ] 입력 중 저장 mutation 없음
- **수정 내용**: 제목 입력 state와 `@`/`#` 문맥 검색, 최종 Save를 분리했다.
- **테스트 절차**: Playwright 연속 입력의 문자별 반영 시간·activeElement·directory 요청·mutation 수 측정
- **실제 결과·증거**: fixture Playwright에서 `R5 UNSAVED` 연속 입력이 1.5초 예산 내 반영되고 `activeElement` 유지, 일반 입력 중 directory/workload 검색 증가 0건, Save 전 mutation 0건을 확인했다. 증거: [`calendar-round5-evidence/fixture-r3-r4-20261005-engineering-run.json`](calendar-round5-evidence/fixture-r3-r4-20261005-engineering-run.json).
- **완료 여부**: [x]

## 13. Account 연결
- **원문·최신 정정**: `@` Account 검색·선택이 가능하고 제목 토큰을 제거한 뒤 하단에 표시하며 저장 후 유지한다.
- **기대 동작**: [ ] 검색, [ ] 단일 연결, [ ] 교체/해제, [ ] 서버 유지
- **수정 내용**: 대기
- **테스트 절차**: 지정 Account 검색→선택→저장→재조회
- **실제 결과·증거**: 대기
- **완료 여부**: [ ]

## 14. Private
- **원문·최신 정정**: Private 토글의 영어 툴팁·활성 상태가 명확하고 저장 후 유지되어야 한다.
- **기대 동작**: [ ] icon-only 토글, [ ] hover/focus 영어 툴팁, [ ] 활성 상태, [ ] 저장/재조회 유지
- **수정 내용**: 대기
- **테스트 절차**: 토글·저장·재조회; 타 사용자 비노출은 두 번째 계정 필요
- **실제 결과·증거**: 대기
- **완료 여부**: [ ]

## 15. Time Off
- **원문·최신 정정**: Time Off 토글의 영어 툴팁·활성 상태가 명확하고 저장 후 유지되어야 한다.
- **기대 동작**: [ ] icon-only 토글, [ ] hover/focus 영어 툴팁, [ ] 활성 상태, [ ] 저장/재조회 유지
- **수정 내용**: 대기
- **테스트 절차**: 토글·저장·재조회
- **실제 결과·증거**: 대기
- **완료 여부**: [ ]

## 16. 공유 일정의 색상·열람·쓰기 차단
- **원문·최신 정정**: 공유자 식별, 달력·타임라인 색상 일치, 공유 일정 선택·열람 허용, 쓰기 차단을 함께 검증한다.
- **기대 동작**: [ ] 공유자 식별, [ ] 색상 일치, [ ] 선택/열람 가능, [ ] 편집·drag·resize·delete 차단
- **수정 내용**: 대기
- **테스트 절차**: Owner/Viewer 두 계정 필요; 지정 테스트 대상 외 공유 요청 금지
- **실제 결과·증거**: 두 번째 계정 부재 시 제한을 명시
- **완료 여부**: [ ]

## 17. WON/LOST Opportunity 검색 제외
- **원문·최신 정정**: Account/Workload/Opportunity 관계 검색에서 WON·LOST Opportunity를 결과에서 제외한다.
- **기대 동작**: [ ] OPEN Opportunity 노출, [ ] WON 제외, [ ] LOST 제외, [ ] Account/Workload 결과 유지
- **수정 내용**: 대기
- **테스트 절차**: OPEN/WON/LOST fixture를 반환해 UI 검색 결과와 요청 결과를 비교
- **실제 결과·증거**: 대기
- **완료 여부**: [ ]

## 18. 저장 확인 팝업 디자인
- **원문·최신 정정**: 저장 확인 팝업은 JET/Redwood 컨트롤·간격·글꼴로 구성하고 저장·취소 흐름을 명확히 제공한다. occurrence/series 기능은 이번 필수 범위가 아니다.
- **기대 동작**: [ ] JET/Redwood 팝업, [ ] Save changes/Cancel, [ ] 관련 편집기 근처 또는 modal 안전 위치, [ ] 저장·취소 결과 일치
- **수정 내용**: 대기
- **테스트 절차**: 변경 후 Save→확인 팝업 가시성·bounding box→취소/저장→재조회
- **실제 결과·증거**: unsaved draft에서 Escape로 `Save changes?`를 열고 Keep editing/Discard and close/Save and close를 실제 확인했으며, Keep editing 후 underlying editor를 유지하고 최종 Save까지 성공했다. 증거: [`calendar-round5-evidence/fixture-r3-r4-20261005-engineering-run.json`](calendar-round5-evidence/fixture-r3-r4-20261005-engineering-run.json).
- **완료 여부**: [x]

## 19. 시스템 UI 영어화
- **원문·최신 정정**: Calendar의 시스템 UI 라벨·버튼·툴팁·상태 문구는 영어로 통일한다. 일정 제목·사용자 데이터·공휴일 고유명은 번역 대상이 아니다.
- **기대 동작**: [ ] 버튼·라벨 영어, [ ] tooltip 영어, [ ] 상태·오류 문구 영어, [ ] 사용자 데이터 보존
- **수정 내용**: 대기
- **테스트 절차**: Calendar DOM의 시스템 문자열 allowlist와 비영어 system label 탐지
- **실제 결과·증거**: Save confirmation의 세 액션과 Calendar 주요 액션이 영어임을 fixture 브라우저에서 확인. 전체 Calendar 시스템 문자열 검사는 미완료.
- **완료 여부**: [~]

## 20. 공식 Oracle icon-only 액션
- **원문·최신 정정**: 지정된 Oracle 공식 아이콘 갤러리와 JET Button Icons 예제를 기준으로 호환되는 icon-only 버튼을 사용한다. 실제 영어 hover/focus 툴팁과 토글 활성 상태를 확인한다.
- **기대 동작**: [ ] Recurrence/Private/Time Off/Cancel/Delete/Save 아이콘, [ ] 문자·emoji 대체 금지, [ ] 영어 hover/focus 툴팁, [ ] active/pressed 상태
- **수정 내용**: 대기
- **테스트 절차**: DOM 구조·아이콘 클래스·hover/focus tooltip·pressed state 확인
- **실제 결과·증거**: 대기
- **완료 여부**: [ ]

## 21. 모바일/반응형
- **원문·최신 정정**: Calendar는 모바일 viewport에서도 생성·선택·편집·스크롤·팝업·아이콘 액션을 사용할 수 있어야 한다.
- **기대 동작**: [ ] 390×844에서 수평 스크롤, [ ] 컨트롤 viewport 내, [ ] 44px 수준 터치 표적, [ ] 팝업 이탈 없음
- **수정 내용**: 대기
- **테스트 절차**: Chromium mobile viewport 실제 동작 및 가능한 WebKit 비교
- **실제 결과·증거**: 대기
- **완료 여부**: [ ]

## 22. Weekly Activities와 레이아웃 정합
- **원문·최신 정정**: Weekly Activities와 메뉴·제목 위치·크기·간격을 실제 화면으로 맞추고 불필요한 `ACTIVITY PLANNING`을 제거한다. 범례는 달력 바로 위 우측에 둔다.
- **기대 동작**: [ ] menu/header 좌표·제목 글꼴·간격 일치, [ ] ACTIVITY PLANNING 부재, [ ] legend 우측 및 surface 바로 위
- **수정 내용**: 대기
- **테스트 절차**: 동일 세션에서 `/weekly-activities`와 `/calendar` DOM rect/computed style 비교
- **실제 결과·증거**: 운영 기준선에서 ACTIVITY PLANNING 노출 확인 (`calendar-round5-evidence/baseline.json`)
- **완료 여부**: [!]

## 23. Recurrence 설정 단순화와 아이콘 검증
- **원문·최신 정정**: Recurrence에는 반복·종료일·근무일수만 유지한다. 지정 Oracle 공식 아이콘과 JET Button Icons 예제를 따르고 실제 영어 hover/focus 툴팁·활성 상태를 검증한다.
- **기대 동작**: [ ] 반복 유형, [ ] 종료일, [ ] 근무일수만 존재, [ ] 불필요 필드 없음, [ ] 공식 icon-only·tooltip·active state
- **수정 내용**: 대기
- **테스트 절차**: 실제 팝업 DOM/control 목록과 click/save/reload 확인
- **실제 결과·증거**: 대기
- **완료 여부**: [ ]

## 실제 인증 UI CRUD 검증 연결
- **대상**: 개발 로컬 빌드 `http://127.0.0.1:18185`, branch `fix/calendar-round5`, HEAD `894e1daf2ccfc1f77310401503da1f3a29d03c34`
- **검증 범위**: 정상 로그인, Calendar 진입, 전용 일정 UI 생성·새로고침 재조회·제목 수정·재조회·삭제·잔존 없음
- **판정 제한**: 기본 UI CRUD 성공 증거이며 운영 반영 또는 원문 1–23 전체 통과 증거가 아니다.
- **비밀정보 없는 실행 기록**: [`calendar-round5-evidence/ui-crud-20261005.md`](calendar-round5-evidence/ui-crud-20261005.md)

## 다음 실행 지점
1. 운영 기준선 실제 브라우저 재현 결과를 항목별로 기록한다.
2. 실패가 확정된 항목부터 테스트를 추가하고 구현을 수정한다.
3. release build 및 실제 인증 회귀 후 전용 데이터를 삭제한다.
4. 미충족 항목이 있으면 배포하지 않고 정확한 제한을 보고한다.
