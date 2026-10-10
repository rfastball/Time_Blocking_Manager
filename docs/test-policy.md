# 검증 범위

## 창 닫기 설정 Test delta brief

- Unique risk: 종료 옵션이 재시작 후 사라지거나 읽기·저장 실패가 성공으로 표시됨.
- Existing owner: 파일 저장 경계는 Rust가 소유하지만 desktop 전용 운영 설정은 기존 storage.rs와 Node 설정 시험에서 실행되지 않음. 관련 main.rs 운영 설정 함수 옆의 단위 시험에 배치한다.
- Selected layer: 실제 GUI 없이 임시 디렉터리에서 기본값·저장/재조회·손상 값·쓰기 실패를 묶어 검증한다.
- Expected cost delta: desktop binary unit test에 동기 사례1개. native 의존성 컴파일이 필요하지만 GUI·네트워크 실행이나 기본 Node 경로 증가는0. 새 테스트 파일·의존성·CI lane 없음.
- Evidence to retire: 없음. DB 복원/일정 검증과 다른 기기별 설정 경계이며 coverage 기준 변경 없음.

## 개발 서버 포트 Test delta brief

- Unique risk: 1420이 사용 중이면 미리보기가 시작하지 않거나 데스크톱이 다른 서버를 열고, 종료·실패 후 개발 포트가 남음.
- Existing owner: `src/*.test.ts`와 실행 스크립트 검색 결과 개발 서버 실행 경계의 owner 없음. 기존 순수 큐·시간표·설정 사례는 포트 확보와 Tauri 주소 전달을 실행하지 않음.
- Selected layer: `node --test scripts/desktop.test.mjs` 명시적 리소스 확인. 실제 Vite listener와 임시 HTTP blocker를 사용하고 네이티브 실행 함수만 대체해 정상/충돌·설정 우선순위·실패 종료를 확인. 기본 `npm test` 순수 경로에 포함하지 않음.
- Expected cost delta: 명시적 확인에서 Node worker 1개·Vite 서버 3회와 임시 HTTP listener를 사용함. 기본 suite·브라우저·앱·DB·native build·CI lane 증가0. 확보한 포트를 반환한 뒤 blocker로 사용하며 기존 프로세스를 종료하지 않음.
- Evidence to retire: 없음. 신규 실행 경계이며 기존 테스트와 실패 신호가 다름. coverage 기준 변경0.
- Baseline: 변경 전 `npm test` 18/18, 126.7843ms (단일 실행).

Test delta 결과: 명시적 `scripts/desktop.test.mjs` owner에 사례1개 추가(added/extended/removed **1/0/0**), 기본 수집18개 유지·worker/리소스 실행 증가0. 별도 확인1/1은 본체156.3298ms·전체397.3657ms이며 Vite3회와 임시 HTTP listener4회를 사용했다(포트 반환 probe3회 포함). 기존1420 listener를 유지한 환경에서 최초1421, blocker 이후1422 주소로 실제 HTML을 읽고, 전달 옵션·동일 키 config 우선순위·정상/실패 후 포트 재확보·blocker 생존을 검증했다. 새 명시적 확인의 baseline이 없어 runtime delta는 미측정, coverage floor 영향0. 기본 `npm test` 18/18·139.8398ms, `npm run build` 성공(Vite238ms). 기본 suite 시간은 동시 명령 실행이라 baseline과 성능 비교하지 않는다. 실제 `npm run dev` 충돌 전환1421·ready260ms와 Ctrl+C 종료, `npm run desktop -- --help` 실제 CLI API·선택주소1421·exit0를 확인했다. 종료 후 listener는 기존1420 프로세스만 남았다. GUI·Rust build·사용자 DB 실행0이며 네이티브 앱 연결/종료는 이 확인으로 합격 처리하지 않는다.

## 캘린더 품질 목표 1단계 Test delta brief

- Unique risk: 상세 Ctrl+Enter와 미계획 Enter가 한글 조합을 저장 명령으로 해석함. 날짜가 바뀌거나 절전에서 돌아올 때 달력 표시가 낡은 상태로 남거나 사용자가 선택한 날짜가 강제로 이동함. 초안 읽기/해석 실패 뒤 낡은 sequence로 새 입력을 저장해 성공으로 오인하거나 보관된 내용을 잃음.
- Existing owner: `src/queue.test.ts:35`의 캡처 Enter/IME 분기는 상세·미계획 입력 경로가 공유하지 않았다. `src/schedule.test.ts`는 표시/기간 경계 소유자지만 화면 갱신 가능 조건은 실행하지 않는다. 복구 UI는 기존 백업 컴포넌트와 Rust 파일 DB owner가 각각 UI 연결/실제 파일을 소유한다.
- Selected layer: 기존 Enter 사례를 공유 조합 판정으로 확장하고, 기존 schedule owner에서 실제 갱신 gate 함수를 가상 상태로 실행한다. 기존 queue owner에서 StoredDraft의 미로드 쓰기 거부/해석 실패 sequence 보존/명시적 초안 버리기 경계를 실행한다. UI/네이티브 연결 확인은 실행 가능한 환경에서 별도이며 순수 시험으로 대체하지 않는다.
- Expected cost delta: Node 기존 사례1개 확장·작은 동기 사례2개 추가, worker/브라우저/DB/네트워크 자동 실행 증가0. backend 파일 DB 확장은 별도 기록한다.
- Evidence to retire: 독립 캡처의 중복 조합 판정을 공유 helper로 교체하며 기존 고유 큐/표시 증거는 유지한다. 새 테스트 파일·의존성·coverage 기준 없음.

프런트 Test delta 결과: added/extended/removed **2/1/0**, 수집16→18. Node 파일 worker 증가0, heavy-resource 자동 실행 증가0, coverage floor 영향0. 최종18/18 전체123.371ms, 새 draft 사례0.1988ms·gate 사례0.5557ms. 앞선 동일환경 실행125.1684ms 대비 단일 실행차−1.7974ms이며 실행 시점 차이가 있어 안정적인 증분 runtime은 미측정이다. 중간17개 실행273.5304ms는 동시 빌드가 있어 성능 비교에 사용하지 않는다. 리뷰 후 단독 build218ms, 최종 패키징의 프런트 build282ms 성공. 실제 UI 연결·IME·시계/절전은 이 순수 시험으로 합격 처리하지 않는다.

### 손상 저장소 복구 backend Test delta brief

- Unique risk: 손상 현재 DB에서 복원에 진입하지 못하거나, 실패/중단한 교체가 원본/WAL/SHM을 잃고 빈 DB를 생성함. 건강한 저장소의 epoch/초안 보호를 우회함.
- Existing owner: `src-tauri/tests/storage.rs`의 invalid_existing_database/verified_restore/managed_backups 및 기존 test-policy를 검색·확인했다.
- Selected layer: 기존 Rust 실제 임시 SQLite owner에서 복구 성공/거부·보존 실패 2그룹 추가.
- Expected cost delta: 기존 실행 파일 안의 tempfile 시나리오+2. 새 dependency/worker/browser/network/CI lane 없음. baseline11/11 본체3.49초.
- Evidence to retire: 없음. 건강한 Store의 복원/원본 보존과 다른 실패 경계. coverage floor 변경0.

backend Test delta 결과: 기존 storage.rs owner에 added/extended/removed **2/1/0**, 수집11→13. 신규2그룹 좁은 실행0.41초. 최종 기존 손상 DB 사례 확장1/1은0.09초, 전체13/13 본체3.67초, desktop cargo check1.25초. baseline3.49초 대비+0.18초는 단일 실행차이며 성능 추정이 아니다. 새 worker/heavy-resource launch/dependency/CI lane0, coverage floor 영향0. 기존 file DB 실행 파일 안에서 Windows sharing lock으로 세 번째 SHM archive 실패를 주입하고 DB/WAL/SHM 원바이트 보존·marker 정리를 확인했다. 성공 복구의 새 epoch·task/settings·3파일 archive·과거 요청 거부·백업 초안 미복원, marker 중단 상태의 빈 DB 자동 초기화 차단과 복구 재시도도 검증했다.

네이티브 실행에서 최초 `Store::open`이 손상 DB의 WAL/SHM을 제거하는 문제를 발견해 기존 invalid_existing_database owner를 확장했다. 원본에 RW connection을 열기 전에 DB/WAL/SHM의 임시 복사본으로 검증하는 helper를 startup/복구에서 공유한다. 확장 사례는 손상3파일의 정확한 바이트 보존과 정상 DB에서 WAL에만 commit된 작업을 읽을 수 있음을 검증한다. 새 사례/실행 파일 없이 같은 owner 안에서 실행했다. 복사 preflight의 시작 I/O 및 메모리/앱 최초 실행 성능 영향은 정식 측정하지 않았다.

자동 suite 밖의 격리 Windows UI 묶음 검증은 자체 시험 프로세스3개를 사용한 뒤 정리했다. 확인한 UI/IPC 연결은 파일 DB·순수 함수와 다른 경계이며 자동 worker/CI 비용에 추가하지 않았다. 이 수동 검증의 전체 runtime은 미측정이며 실제 범위/제한은 validation.md에 기록했다.

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


## 시간축·조작 개선 Test delta

- Unique risk: 압축 시간축의 좌표/시간 역변환이 어긋나 블록 이동·크기 조절 시 다른 시각에 배치되거나 자정 경계가 사라짐.
- Existing owner and layer: `src/schedule.test.ts`의 순수 시간표/배치 표시 owner. 같은 Node worker에 시간축과 확장 경계 사례 2개 추가.
- Added / extended / removed: 2 / 0 / 0. 기존 증거 중 중복·폐기 대상 없음.
- Collected-case delta: 전체 18→20, schedule owner 7→9.
- Runtime delta: 전체 단독 실행 123.5188→119.9894ms. 단일 실행 차이 −3.5294ms이며 성능 개선 추정이 아니다. 새 두 사례 본체 0.9958ms / 0.1247ms.
- Heavy-resource launch delta: 자동 suite의 worker·브라우저·DB·네트워크 증가 0. UI 연결은 수동 브라우저 묶음 검증이 소유한다.
- Coverage-floor impact: 변경 없음. 새 의존성·테스트 파일·CI lane 없음.

창 닫기 설정 Test delta 결과: `cargo test --manifest-path src-tauri/Cargo.toml --bin blokky --offline`의 기존 main.rs 인라인 owner에 사례1개 추가(added/extended/removed 1/0/0), desktop 단위 수집0→1. 본체0.01초, 최초 증분 컴파일3.74초. 신규 경계라 비교 baseline과 runtime delta는 미측정. GUI·네트워크 자동 실행 증가0, 기본 Node·no-default-features 경로 증가0, coverage 기준 변경0.


## 2026-10-09 자동 저장 종료와 시간축 Test delta

- Unique risk: 마지막 저장이나 후속 초안 쓰기가 끝나기 전에 종료하거나, 실패한 창을 무시하고 다른 창 응답만으로 종료함. 로그 압축이 있어도 근무 밖 영역이 과도하게 넓음.
- Existing owner / layer: src/queue.test.ts의 실제 SaveQueue 순수 상태, src-tauri/src/main.rs의 desktop 단위 coordinator, src/schedule.test.ts의 시간축 순수 계산. UI CRUD와 IPC 연결은 별도 수동 브라우저·격리 Windows 시험이 소유함.
- Expected cost / retired evidence: 기존 owner에 작은 사례 두 개 추가, 시간축 기존 사례 하나 확장. 제거 대상 중복 증거 없음. 새 파일·의존성·자동 GUI/DB/network launch·CI lane·coverage floor 변경 없음.
- Added / extended / removed: 2 / 1 / 0. Node 수집 20→21, desktop 단위 1→2, storage 13 유지. Node 전체 106.8831ms, 새 queue 사례 0.2056ms. desktop 2/2 본체 0.01초, storage 13/13 본체 2.46초. 전체 변경 전 동일 조건 baseline이 없어 신뢰할 runtime delta는 not measured.
- 시간축 좁은 owner schedule/settings 15개는 100.2691→92.4225ms; 단일 실행차이며 성능 개선 추정으로 사용하지 않음.
- 자동 heavy-resource launch delta 0. 수동 IPC 검증은 별도 ID의 시험 앱 3회 실행, 시험 SQLite에만 초안/오류 trigger를 준비하여 성공·실패·복구 경계를 확인했다.


## 정기 업무·하루 비우기 Test delta brief (2026-10-09)

- Unique risk: 이동·삭제·초기화 뒤 정기 업무가 중복 생성되거나, 복원 시 생성 이력을 잃거나, 변경된 하루 일정을 일부만 초기화하여 데이터가 유실됨.
- Existing owner / Selected layer: `src-tauri/tests/storage.rs`의 실제 임시 SQLite 통합 owner를 확장한다. 기존 설정·복구·버전 거부 사례를 함께 확장하며 새 파일·의존성·실행 lane은 만들지 않는다.
- Expected cost delta: 같은 storage executable 안의 시나리오 3개 추가. 새 프로세스·GUI·네트워크·CI lane 0, coverage floor 변경 0.
- Evidence to retire: 없음. 기존 작업 단일 변경과 다른 다항목 원자성·생성 이력 경계다.

Test delta 결과: added/extended/removed **3/3/0**, 수집 **13→16**. `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked` **16/16**, 본체 **2.65초**, 전체 **5.22초**(컴파일 1.99초 포함). 같은 조건의 통과 baseline이 없어 runtime delta는 미측정. 기본 sandbox에서는 기존 canonicalize 테스트 4개가 변경 전후 모두 실패하여, 승인된 제한 외 실행에서 임시 DB만 검증했다. 새 heavy-resource launch·dependency·CI lane·coverage-floor 영향 0.


## 드래그와 클릭 분리 Test delta brief (2026-10-09)

- Unique risk: pointerup 이후 지연 click이 상세·시간 팝업을 다시 열거나 다음 실제 클릭을 차단함.
- Existing owner / Selected layer: `src/schedule.test.ts`에 문서 EventTarget 대역으로 click suppression 컨트롤러를 검증한다. 기존 제스처·시간축 owner를 확장한다.
- Expected cost delta / Evidence to retire: 사례 1개, 새 실행 프로세스·브라우저·의존성·파일·CI lane 0, 퇴역할 증거 없음.

Test delta 결과: added/extended/removed **1/0/0**, 기본 Node 수집 **21→22**, `npm test` **22/22 · 101.2982ms**. 사례 본체 1.8778ms이며 같은 조건의 변경 전 baseline이 없어 runtime delta는 미측정. heavy-resource launch delta 0, coverage-floor 영향 0. 브라우저 수동 검증은 기존 미리보기 세션을 재사용하며 자동 suite에 넣지 않는다.


## 유동 배분 저장소 v4 Test delta brief (2026-10-10)

- Unique risk: v3 배치가 이관 중 사라지거나 고정 시각을 잃음, 이관 전 원본이 남지 않음, 일괄 완료가 일부만 반영됨, 지연 재시도가 배치 기준 시각을 과거로 되돌림, 순서 변경이 열린 편집을 무효화함, 하루 비우기·복원에서 기준 시각이 남거나 사라짐.
- Existing owner / Selected layer: `src-tauri/tests/storage.rs`의 실제 임시 SQLite owner. 기존 하루 비우기·정기 업무·구버전 이관·날짜 예외·백업 검사 사례를 확장하고, 유동 순서와 완료 기준 시각 시나리오 2개를 추가한다. 배치 위치 계산은 저장 경계가 아니므로 Node `src/flow.ts` owner가 소유한다.
- Expected cost delta: 같은 storage 실행 파일 안의 시나리오 2개 추가, 기존 5개 확장. 새 파일·의존성·worker·GUI·네트워크·CI lane 0, coverage floor 변경 0.
- Evidence to retire: 없음. ‘충돌 시 미계획 이동’ 단언은 같은 사례 안에서 ‘같은 날짜 유동’ 단언으로 교체했다(D8·D9).

Test delta 결과: added/extended/removed **2/5/0**, 수집 **16→18**. `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked` **18/18**, 본체 **5.18초**. baseline 16/16 4.24초(단일 실행, 별도 시점)와의 차이는 성능 추정이 아니다. 구버전 사례는 v1·v2·v3 각각 열 삭제로 실제 이전 표 형태를 재구성해 이관·`before-migration` 백업·복원을 검증한다. desktop `cargo check` 성공. heavy-resource launch·dependency·CI lane·coverage-floor 영향 0.


## 유동 배분 프런트 Test delta brief (2026-10-10)

- Unique risk: 재설계안 §10의 조기·늦은·일괄 완료 결과가 달라짐, 시간 경과만으로 블록이 움직이거나 ‘진행 중·지남’이 다시 생김, 공간 부족 블록이 앞질러 놓이거나 사라짐, 고정 예약이 완료 후 공간을 비움.
- Existing owner / Selected layer: 기존 `src/schedule.test.ts`의 시간표 표시 owner와 새 순수 `src/flow.ts` owner(`src/flow.test.ts`). 배치 계산은 DOM·DB 없이 순수 함수로 검증하고, 드래그·완료 영역·키보드 경로는 미리보기 수동 묶음이 소유한다.
- Expected cost delta: Node 파일 worker +1(flow), 동기 사례 4개 추가, 시간 기반 agenda 사례 2개를 day plan·next 상태 사례 2개로 교체. 브라우저·DB·네트워크 자동 실행 증가 0.
- Evidence to retire: ‘agenda enters current at start and overdue at end’와 ‘agenda fills only available gaps’ 사례. 현재 시각이 상태를 만드는 규칙 자체가 제거되었고, 빈 시간 계산은 새 사례가 기준 시각 이후로 대체 검증한다.

Test delta 결과: added/extended/removed **4/0/0 + 교체 2**, 기본 Node 수집 **22→26**, `npm test` **26/26 · 108.3751ms**(단일 실행, 성능 추정 아님). heavy-resource launch delta 0, coverage-floor 영향 0. 미리보기(`npm run dev`, `?now=` 주입)에서 합성 Pointer/Keyboard 이벤트로 09:40·10:20·11:30 완료, 완료 취소, Alt+↑ 순서, 수동 재배치, 본문 삽입·고정 레일·범위 드래그·빈칸 클릭·고정 블록 이동·크기 조절 키보드·우클릭 고정 해제·편집창 시각 고정·미계획 드로어·2주 날짜 칸 드롭을 확인했고 콘솔 오류는 없었다. 브라우저 창이 숨김 상태여서 시각적 스크린샷 검사는 하지 못했다.


## React 전면 도입 Test delta brief (2026-10-10)

- Unique risk: 화면 재작성으로 들어 옮기기 결과가 저장 명령과 달라지거나(순서·날짜·시각·미계획), 초안·종료 저장·충돌 처리 규칙이 회귀해 입력을 잃음. 영역별 병렬 구현에서 공용 기반이 깨짐.
- Existing owner / Selected layer: 순수 규칙은 기존 Node owner를 확장하거나 새 순수 모듈 owner를 둔다(`src/intent.ts` 드래그 의도→명령, `src/detail.ts` 편집기 체크리스트·일정 필드, `src/availability-edit.ts` 근무 밴드 편집, `src/backup-format.ts` 백업 표기). 화면 연결은 명시적 `scripts/ui-check.mjs`(헤드리스 Edge CDP, 기본 `npm test` 밖)가 소유한다. 저장 경계는 기존 Rust storage owner 그대로다.
- Expected cost delta: Node 파일 worker +4, 동기 사례 추가. ui-check는 명시적 실행이며 Edge 1개·영역별 시나리오 50개, 기본 suite·CI lane 증가 0.
- Evidence to retire: `suppressGestureClick` 사례(드래그 뒤 지연 클릭 억제 — dnd-kit 활성화 거리로 대체되어 함수와 함께 제거), `agenda` 사례(목록·빈 시간 표시 모델 제거; ‘다음’은 시계와 무관하다는 단언은 `nextFlowId` 사례로 이전).

Test delta 결과: added/replaced/removed **17/1/1**(추가: intent 1, backup-format 4, detail 6, availability-edit 6 · 교체: agenda→nextFlowId · 제거: suppressGestureClick), 기본 Node 수집 **26→42**(도입 전 master 기준), `npm test` 42/42 · 125.4121ms(단일 실행, 성능 추정 아님). Rust 18/18 변경 없음. heavy-resource launch delta: 기본 suite 0, 명시적 ui-check 50/50. coverage-floor 영향 0.