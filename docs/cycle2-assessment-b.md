# Cycle 2 — Assessment B: 독립 구현·브라우저 증거

2026-10-08. 대상 `src/main.ts`, `src/style.css`; 미리보기 `http://127.0.0.1:1420/`.
Assessment A 및 기존 감사 보고서를 읽지 않았다. `PRODUCT.md`, `DESIGN.md`, 현재 소스와 impeccable critique/audit 절차만 참조했다. context는 부모 세션에서 실행되어 반복하지 않았다. `.impeccable/critique/ignore.md` 없음.

## 결정적 검사

실행은 정확히 1회:

```text
C:/Users/rfast/.agents/skills/impeccable/scripts/impeccable.cmd detect --json src/main.ts src/style.css
exit code: 0
JSON: []
count: 0
rule names: 없음
file locations: 없음
false positives: 없음
```

검출 0은 아래 사용성 문제의 부재나 전체 접근성 통과를 뜻하지 않는다.

## 브라우저 검증 범위와 한계

- 별도 새 IAB 탭 1에서 960×640 viewport로 하나의 묶음 검증을 수행했다. 다른 브라우저 엔진은 사용하지 않았다.
- `visible:true`는 subagent에서 지원되지 않아 실패했고, `visible:false`로 새 탭을 만들었다. 사용자에게 보이는 검사 오버레이는 없다.
- 문서화된 `playwright.evaluate`는 **read-only**이므로 mutable script/title injection과 detector overlay가 지원되지 않는다. 우회 주입을 시도하지 않았으며 CLI + 실제 렌더링/AX/읽기 전용 DOM 측정을 fallback으로 사용했다. overlay console 결과는 해당 없음. 별도 overlay live-server는 시작하지 않았다.
- 브라우저는 화면에 명시된 예시 데이터 모드다. 아래 성공은 메모리 상태/피드백 성공이며 SQLite 저장·복원 성공 증명이 아니다.
- 완료 후 viewport reset 및 본인 탭 close를 실행했다. 새 임시파일 없음. 미리보기 서버 PID 33520 종료는 부모 담당이다.

## 확인된 결과

### [P2] 설정 변경을 버려도 이미 해결된 오류가 남는다

재현: 설정 → `시간 설정 저장`으로 성공 문구 확인 → 월요일 작업 불가 시간을 `잘못된 형식`으로 입력 → 저장 → `변경 버리기`.

관찰: 성공 시 footer에 `미리보기 · 변경은 종료하면 사라집니다`와 `시간 설정을 저장했습니다.`가 보인다. 잘못된 형식 제출 후 `작업 불가 시간은 “12:00-13:00 점심” 형식으로 입력하세요.`가 표시된다. 변경을 버린 뒤에도 이 오류가 그대로 남으며 오늘 화면으로 전환해도 유지된다. 변경 버리기는 초안 변수를 해제하지만 errorMessage를 해제하지 않는다.

출처: IAB status innerText, 버린 뒤 settings screenshot, 오늘 화면 AX; `src/main.ts:45`, `src/main.ts:49`, `src/main.ts:273`, `src/main.ts:278`.

영향: 입력을 복구한 뒤에도 해결 여부가 불명확하고, 관련 없는 화면까지 오류가 따라온다. 설정 취소 시 그 설정 검증 오류를 해제하고 복구 완료 상태를 표시할 필요가 있다. `$impeccable harden`/`clarify` 대상.

### [P2] 다른 날짜로 이동해도 목록 이름이 ‘오늘 순서’다

재현: 오늘 화면에서 다음 기간 클릭. 상단 날짜는 `10월 9일 금요일`, 목록은 배치 0건으로 바뀌지만 제목은 `오늘 순서`이며 왼쪽 오늘 메뉴가 선택 상태다.

출처: IAB AX와 960×640 screenshot; `src/main.ts:106`, `src/main.ts:112`, `src/main.ts:138`, `src/main.ts:148`, `src/main.ts:149`.

영향: 실제 오늘(10월 8일)과 조회 날짜의 관계가 어긋난다. 선택 날짜가 오늘이 아닐 때 목록 제목을 날짜에 맞춰 표시하거나 오늘 전용 화면의 날짜 이동 정책을 명확히 해야 한다. `$impeccable clarify` 대상. 자정이 실제 경과한 상태를 검증한 것은 아니다.

### [P2] 960×640 상세 초기 화면에서 주요 저장 행동이 화면 밖에 있다

재현: 오늘 날짜로 복귀 → `설계 문서 초안 작성` 상세 열기. 본문은 3줄이나 textarea가 약 305px 높이를 차지한다. dialog는 y=24..616, clientHeight=591, scrollHeight=841. `변경 저장`은 y≈700..734에 있어 초기 화면에 보이지 않는다. 완료·Inbox 이동도 같은 줄이다.

출처: IAB screenshot 및 읽기 전용 DOM rect 측정; `src/main.ts:234`의 rows=12, `src/style.css:2`의 dialog/textarea/detail-actions 규칙.

영향: 최소 지원 창에서 짧은 본문을 확인한 뒤 저장 버튼을 찾기 위해 추가 스크롤이 필요하다. 높이에 맞춘 본문 크기 또는 고정된 주요 행동 영역이 적합하다. **차단 결함은 아님**: 저장 버튼에서 Tab 이동으로 모달이 스크롤되어 완료 버튼에 포커스가 나타나고 저장·보조 행동 모두 화면 안으로 도달하는 것을 확인했다. `$impeccable layout` 대상.

## 유지할 점

- 미리보기의 비영속성과 데스크톱 전용 기능 제한을 화면에 명시한다.
- 설정의 성공·형식 오류가 role=status footer에 텍스트로 나타난다. 상세 모달의 필드 라벨, 제목, 닫기 이름도 AX에서 확인했다.
- 상세 폼은 960×640에서 내부 스크롤이 가능하고 키보드 포커스가 보인다. 전체 저장 기능이 막혔다고 보고하지 않는다.
- B/D 고정 스타일과 Windows 범위를 준수했다. 모바일·dark 미지원은 결함으로 집계하지 않았다.

## 미검증

실제 Windows/Tauri 저장·충돌·실패 큐의 실패 요청 해제, SQLite 및 백업·복원, 자정 실제 경과, 보조기기 발화, 모든 키보드 경로, 성능 수치와 색 대비 전수 측정은 이번 제한된 브라우저 라운드에서 검증하지 않았다. settings의 `변경 버리기`는 검증했으나 native 실패 큐의 `실패 요청 해제 · 초안 유지` 경로를 동일 증거로 취급하지 않는다. 소스 수정·테스트 추가·기존 테스트 실행 없음.
