# 검증 범위

## 테마 Test delta brief

- Unique risk: 저장된 테마가 재시작 시 사라지거나, 알 수 없는 값 때문에 화면이 깨지거나, 저장 실패를 성공으로 표시함.
- Existing owner: `src/settings.test.ts`의 개인 설정 해석. 기존 테스트에는 외형 설정의 저장·복원 검증이 없음.
- Selected layer: 기존 Node owner에서 메모리 저장소로 실제 테마 read/save/resolve 함수 실행. UI 연결·다른 창 동기화·색/형태는 수동 브라우저 묶음 검증.
- Expected cost delta: 기존 worker에 동기 사례 1개 추가. 브라우저·DB·네트워크 자동 실행 증가 0.
- Evidence to retire: 없음. 기존 일정·단축키 검증과 별개의 실패 신호. coverage 기준 변경 없음.
- Baseline: Node 10/10, 111.1746ms (단일 실행).

Test delta 결과: 설정 owner에 순수 상태 사례 1개 추가, 수정/삭제 0. 수집 10→11, worker 및 heavy-resource 자동 실행 증가 0, coverage 기준 변경 0. 전체 117.303ms, baseline 대비 +6.1284ms는 단일 실행 차이이며 성능 추정이 아니다. 새 사례 본체 0.6724ms. 테마의 저장·복원·기본값·실패 전파를 검증한다.

## 유연근무 Test delta brief

- Unique risk: 날짜 예외가 다음 주까지 전파되거나, 휴가와 겹친 작업이 동의 없이 미배치가 되거나, 예외/목표가 재시작·백업에서 사라짐.
- Existing owner: `src/settings.test.ts`는 삭제되는 텍스트 문법의 소유자. `src-tauri/tests/storage.rs`의 scheduling/retry/restore가 저장 경계의 소유자.
- Selected layer: 설정 순수 함수 테스트를 날짜 해석·주간 합계로 교체하고 기존 Rust 저장 테스트 파일을 확장. 기존 schedule 테스트의 기간 경계 사례에 주 보기를 추가.
- Expected cost delta: Node 사례 수 유지, Rust 통합 2개 추가. 새 브라우저/네트워크/프로세스 기반 테스트 없음.
- Evidence to retire: 사용자가 직접 문법을 입력하던 parseBreaks 테스트 2개와 더 이상 사용하지 않는 파서. CI/coverage 기준 변경 없음.
- Baseline: Node 9개 117.33ms, Rust 6개 본체 3.16초. 컴파일 시간 제외.

## Cycle 3 Test delta brief

- Unique risk: 기간 제목의 연·월 경계 누락, 현재 수행 상태의 시작/종료 경계 오류, 빈 시간의 중복, 배치 거부 이유의 오표시.
- Existing owner: src/*.test.ts 검색 결과 queue와 settings 소유자는 저장 순서/초안/문법만 검사하며 시간표의 표시 모델을 실행하지 않는다.
- Selected layer: 새 순수 표시 경계 src/schedule.test.ts에서 format/agenda/placement를 검증한다. 상세창 잠금은 DOM 흐름의 문제이므로 브라우저 묶음 검증이 소유한다.
- Expected cost delta: 기존 Node 명령에 작은 worker 1개, 데이터 없는 동기 사례 추가. 브라우저·DB·네트워크 테스트 부팅 추가 0.
- Evidence to retire: 없음. 기존 큐/파서의 고유 실패 신호와 겹치지 않는다. coverage 기준 변경 없음.
- Baseline: 수정 전 npm test 5/5, 92.1662ms.

사용자가 지정한 구현원칙의 순수 로직·실제 파일 DB·패키징 앱 검증을 따른다.
신규 프로젝트이므로 기존 테스트 소유자와 CI/coverage 기준은 없다.

## Test delta brief

- Unique risk: 저장 성공 오표시, 낡은 수정의 덮어쓰기, 재시도 중복 생성, 충돌 배치,
  복원 후 이전 요청 재적용, 새 편집을 이전 저장 응답이 지우는 데이터 손실.
- Existing owner: 없음. `rg --files`로 초기 폴더에 세 입력 문서만 확인.
- Selected layer: Rust 저장 서비스의 실제 임시 SQLite 파일 통합 테스트;
  프런트 저장 큐는 Node 내장 테스트 러너와 가짜 응답으로 검증.
- Expected cost delta: 의존성 최초 컴파일 외에는 네트워크·앱 부팅 없음.
  파일 DB 테스트는 한 임시 디렉터리/시나리오, UI 큐는 프로세스 하나.
- Evidence to retire: 없음. 기존 테스트가 없는 최초 구현.

Tauri 패키징/Windows 동작은 Rust 테스트로 대체하지 않는다. 수동 확인의 결과는 별도로 기록한다.
coverage 수치 목표와 CI lane은 새로 만들지 않는다.

## 감사 1회차 Test delta brief

- Unique risk: 실패한 캡처 A를 재시도한 성공 응답이 이후 입력한 B 초안을 지움.
- Existing owner: `src/queue.test.ts`의 실패·재시도 시나리오. 기존 테스트는 쓰기 순서만 검사하여 입력 보존은 검출하지 못함.
- Selected layer: 실제 CaptureDraft 상태와 SaveQueue를 사용하는 Node 상태 테스트.
- Expected cost delta: 기존 Node 프로세스에서 1사례 추가, DB·브라우저·네트워크 부팅 없음.
- Evidence to retire: 없음. 순서 검증과 입력 보존의 실패 원인이 다름.

Test delta 결과: 기존 Node owner에 1개 추가(2→3), 삭제 0. 새 실제 리소스 실행 0, coverage 기준 변경 0.
수정 후 Node 테스트 프로세스 83.70ms. 이전 실행 96.84ms는 별도 실행 환경 시점이므로 성능 개선 수치로 해석하지 않는다. 신뢰할 수 있는 증분 실행시간은 미측정이며, 추가 사례 자체는 0.16ms였다.

## 설정 입력 회귀 Test delta brief

- Unique risk: 작업 불가 시간의 잘못된 줄을 알려줄 때 빈 줄을 제외한 번호를 표시하거나 다른 요일을 가리켜 사용자가 오류를 찾지 못함.
- Existing owner: `rg`로 `src`의 테스트에서 settings/readSettings/parseBreak/breaks를 검색한 결과 없음. 기존 `src/queue.test.ts`는 저장 큐와 캡처 초안 소유자이며 파싱을 실행하지 않음.
- Selected layer: `src/settings.test.ts`에서 실제 순수 파서의 정상 결과와 오류 위치를 검증하는 Node 테스트. 기존 Node test 명령의 파일 glob만 확장.
- Expected cost delta: 작은 사례 2개, 추가 브라우저·DB·네트워크·빌드 실행 0. 새 테스트 파일은 제품의 설정 입력 경계를 소유하며 기존 순수 로직 검증 정책 안에 있음.
- Evidence to retire: 없음. 기존 큐 증거와 실패 원인이 다름. DOM 오류 연결·포커스·복구 및 상세창 배치는 마지막 브라우저 확인이 소유하고 소스 문자열 테스트를 추가하지 않음.

Test delta 결과: 순수 설정 입력 owner에 2사례 추가, 기존 테스트 수정·삭제 0. 수집 사례 3→5.
전체 `npm test` 97.4975ms, 새 사례 0.901ms/0.2885ms. 같은 환경의 변경 전 baseline이 없어 증분 runtime은 미측정이다.
Node는 기본 격리로 파일별 테스트 프로세스를 사용하므로 작은 Node worker 1개가 늘며, 브라우저·파일 DB·네트워크 등 heavy-resource launch delta는 0이다. coverage floor 영향 없음.

Cycle 3 Test delta 결과: 새 순수 표시 owner src/schedule.test.ts 4사례 추가, 기존 owner 수정/삭제0. 총5→9. 같은 환경 baseline92.1662ms, 수정 후106.1092ms(단일 실행차+13.943ms, 성능 추정으로 사용하지 않음). Node 파일 worker+1, heavy-resource 자동 테스트 launch+0, coverage floor 변경0. UI 잠금/반응형/드래그는 기존 문서가 요청한 수동 브라우저 묶음으로 검증했다.

유연근무 결과: Node 10/10 114.14ms, Rust 8/8 3.36초. Node 순증 1(단축키의 code 없는 키 입력·한글 키보드), Rust +2, 기존 파서 2개는 날짜 해석·주간 용량 2개로 교체. worker/브라우저/네트워크 자동 테스트 실행 증가 0, coverage 기준 변경 0. 단일 baseline 대비 시간 차이는 성능 개선으로 해석하지 않는다. 네이티브에서 Ctrl+Alt+K 기록·등록·캡처 열기와 날짜별 점심 해제 후 재시작 보존을 확인했다.
