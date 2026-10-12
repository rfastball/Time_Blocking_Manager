# 검증 범위

## 형태 맞춤: 든 블록과 착지의 목적지 모양 (2026-10-12)

- Unique risk: 든 블록이 영역마다 목적지의 모양(주 기둥·2주 한 줄·월 부하 조각·준비 선반·날짜 기둥)을 잘못 계산하거나, 모양 전환이 잡은 지점을 손에서 떼어 놓거나, 드래그 없는 이동이 날아가지 않는 문제. 시각 결과라 순수 함수 테스트로 대체할 수 없다.
- Existing owner / selected layer: 기존 `scripts/ui-check/plan.mjs`에 계획 드로어의 블록을 주 머리·2주 칸·월 칸 위로 들어 각 모양을 재는 시나리오 1개, 기존 `inbox.mjs`의 날짜 기둥 드롭과 Alt+→ 시나리오에 든 블록 너비와 비행 복사본 단언을 더했다.
- Added / extended / removed: **1 / 2 / 0**, plan **20→21**, 전체 UI **73/73 · 328초**. Node **66/66**, Rust 변경 없음.
- 기본 suite의 heavy-resource launch·새 파일·의존성·lane·coverage floor 변화 **0**. Runtime delta는 동일 조건 baseline이 없어 **not measured**. 동작 줄이기 환경과 실제 Windows 설치본은 별도 미검증이다.

## 준비 탭: 들어옴·선반·날짜 기둥 (2026-10-12)

- Unique risk: 자유 캔버스를 들어옴과 하나의 선반으로 바꾸면서 저장 위치(예약 더미 `shelf`)·v8 이하 이관·날짜에서 돌아오는 자리·판의 30분 확정이 Rust와 미리보기 저장소에서 달라지거나, 시간 축척 카드·드롭 순서·날짜 기둥 미리보기가 실제 저장 결과와 어긋나는 문제.
- Existing owner / selected layer: 저장 규칙은 기존 `src-tauri/tests/storage.rs`와 `src/bench.test.ts`·`src/intent.test.ts`, 화면 조작은 기존 `scripts/ui-check/inbox.mjs`가 맡는다. 자유 캔버스 좌표·확대·올가미 시나리오는 제품에서 없어져 퇴역했다.
- Added / extended / removed: Rust **1 / 6 / 0**(v8 → v9 이관·선반의 판 확정 추가, 날짜에서 돌아오는 자리를 선반으로 바꾼 6건 갱신) **28→29**. Node **4 / 3 / 6**(작업대 좌표·더미 이름 테스트 퇴역) **68→66**. inbox UI **9 / 0 / 11**, 다른 UI 소유자의 표기 갱신 4건, 전체 UI **72/72**.
- 기본 suite의 heavy-resource launch·새 파일·의존성·lane·coverage floor 변화 **0**. Runtime delta는 동일 조건 baseline이 없어 **not measured**이며, 이번 전체 UI 실행은 **319초**, Rust storage **5.88초**였다.
- TypeScript·Vite 빌드 통과. 실제 Windows 설치본과 실제 v8 사용자 DB 이관은 별도 미검증이다.

## 주 뷰 날짜 왕복 드래그 등록 복구 (2026-10-12)

- Unique risk: 다른 날짜로 미리보기한 블록을 퇴장 애니메이션 중 원래 날짜로 되돌리면 화면에 남은 블록의 draggable 등록이 사라져 다음 드래그가 시작되지 않는다. 기존 날짜 이동 시나리오는 빠른 왕복 이후 재드래그를 확인하지 않는다.
- Existing owner / selected layer: 기존 `scripts/ui-check/plan.mjs`의 브라우저 UI owner에 시나리오 하나 추가. React 마운트·퇴장·실제 포인터 센서 경합이므로 순수 배치 함수 테스트로 대체할 수 없다. registry 내부 구조 대신 두 날짜의 DOM 중첩, 드래그 복사본 생성, 최종 날짜 이동을 관찰한다.
- Expected cost / evidence to retire: 기존 명시적 Edge runner 안에서 실행. 새 테스트 파일·의존성·CI lane·기본 suite heavy-resource launch·coverage floor 변화 0. 기존 정상 날짜 이동 검사는 다른 위험을 검증하므로 유지한다.
- Added / extended / removed: **1 / 0 / 0**, plan 수집 **19→20**. 빠른 왕복 후 놓기·재드래그, Escape 취소 후 재드래그·날짜 저장을 한 시나리오에서 확인한다.
- 수정 전 재드래그 실패를 확인했고 수정 후 좁은 실행은 **1/1 · 6.746초** 통과. Runtime delta는 수정 전 통과 baseline이 없어 **not measured**이며, 이 시간은 추가 시나리오 단일 실행 비용이다.
- 최종 관련 UI **30/30**(plan 20 + today 10) 통과. 기존 날짜 이동·레일 고정/해제·본문 순서·일 뷰 연결과 공용 day 블록 드래그를 확인했고, 새 회귀 사례는 이 묶음에서도 **6.720초**에 통과했다. 기본 suite의 브라우저 실행 증가 0이며 명시적 UI 묶음은 기존 Edge 한 개를 공유한다.
- TypeScript·Vite 빌드 **2.23초**, 기존 Node **68/68 · 199.7519ms** 통과. 실제 Windows 설치본은 별도 미검증이다.

## 오늘 완료 영역 높이 제한 Test delta (2026-10-12)

- Unique risk / owner: 완료 블록과 긴 제목이 많이 쌓이면 오늘 시간표가 아래로 밀리거나, 높이를 제한한 뒤 마지막 완료 항목을 편집·완료 취소할 수 없는 문제. 실제 CSS 높이·스크롤·포커스를 소유하는 기존 `scripts/ui-check/today.mjs`에 화면 크기별 시나리오 하나를 추가했다.
- Added / extended / removed: **1 / 0 / 0**, today 수집 **8→9**. 기본 suite의 heavy-resource launch·새 파일·의존성·lane·coverage floor 변화 **0**. 기존 빈 완료 목록의 배치 검증은 서로 다른 위험을 다뤄 유지했다.
- 완료 40개로 1440×900·960×640·760×640·720×900을 확인해 **1/1 시나리오 · 14.788초** 통과. 영역 내부 스크롤, 마지막 항목 키보드 편집·완료 취소, 시간표 스크롤 독립성을 확인했다. 1440×900에서 완료 영역 **229→110px**, 시간표 **523→642px**; 960×640에서 **151→110px**, 시간표 **341→382px**였다.
- 최종 빌드 **1.84초**, `git diff --check` 통과. Runtime delta는 동일 조건의 통과 baseline이 없어 **not measured**. Sol이 CSS·UI 검증을 맡고 root는 코드·화면 검토 및 높이 기준 문서 통합을 맡았다. 실제 Windows 설치본은 미검증이다.

## 캡처·설정·백업 조작 복구 Test delta (2026-10-12)

- Unique risk / owner: 손상 초안으로 잠긴 캡처의 복구 조작 누락, 빈 정기 업무 추가 무반응, 백업 검사 대기·오류 시 취소 누락을 기존 `scripts/ui-check/capture.mjs`, `settings.mjs`, `backups.mjs`에서 검증한다. 초안 파싱 자체는 기존 Node owner가 맡고 UI 버튼 연결만 확장했다.
- Added / extended / removed: **1 / 2 / 0**, 담당 owner 수집 **16→17**. 새 테스트 파일·의존성·lane·coverage floor·기본 suite heavy-resource launch 변화 **0**. Runtime delta는 같은 조건의 baseline 부재로 **not measured**.
- 대상 UI **3/3 통과**: 캡처 **6.682초**, 정기 업무 **5.016초**, 백업 **3.234초**. 초안 버리기 확인 취소/승인·저장된 작업 보존·입력 복구, 빈 추가 안내와 정상 CRUD, 검사 취소 후 늦은 응답 무시·포커스 복원을 확인했다. 캡처 대역의 dialog IPC 반환 형식을 바로잡은 뒤 실패한 사례만 재실행했다.
- 캡처 **620×176**과 백업 오류 화면을 육안 확인했다. 실제 Windows 저장소·확인창은 실행하지 않았으며 브라우저의 Tauri IPC 대역 검증이다. Sol 두 명이 영역별 구현·검증, root가 코드·화면 검토와 문서 통합·공통 빌드를 맡았다.

## 작업 생성·도마 저장 복구 Test delta (2026-10-12)

- Unique risk / owner: 오늘 메뉴의 생성 입력이 보이지 않음, 단일 조각 이름 변경 유실, 모달 저장 실패 후 복구 경로 차단을 기존 `scripts/ui-check/editor.mjs`에서 검증한다. 순수 조각 계산 테스트로는 UI와 저장 연결의 결함을 잡을 수 없다.
- Added / extended / removed: **1 / 2 / 0**, editor 수집 **11→12**. 기존 메뉴 표시만으로 생성 경로를 검증하던 단언을 실제 배치 완료까지 확장했다. 새 파일·의존성·lane·coverage floor·기본 suite heavy-resource launch 변화 **0**.
- 검증: editor **12개 모두 통과**(첫 묶음 10개, 수정한 복구 사례 1개와 초기 로딩 실패 사례 1개만 재실행). 도마 복구 **5.721초**, 기존 편집 **2.778초**. 저장 큐 실패 시 대기 중에도 복구 버튼이 활성화되고, 키보드 재시도·입력 유지 후 저장·단일 이름 수정이 동작한다.
- 최종 TypeScript·Vite 빌드 **1.87초**, 기존 Node **63/63 · 191.8664ms**. Runtime delta는 같은 조건의 변경 전 baseline 부재로 **not measured**. 720px 복구 화면과 생성 입력 화면을 육안 확인했다. IPC 대역으로 저장 실패를 검증했으며 실제 Windows 설치본 조작은 미실시했다.

## 카드·상세 삭제 버튼 Test delta (2026-10-12)

- Unique risk / owner: 카드 삭제가 드래그·크기 조절을 시작하거나 포커스를 잃는 문제와 상세의 불필요한 메뉴를 기존 `scripts/ui-check/inbox.mjs`, `editor.mjs` 브라우저 owner에서 검증한다.
- Added / extended / removed: **1 / 4 / 0**. 기존 더보기 시나리오는 직접 삭제와 블록 메뉴의 미저장 분할 보호로 교체했다. 해당 owner 수집 **22→23**이며 새 테스트 파일·의존성·lane·coverage floor 변경은 없다.
- 검증: TypeScript·Vite 빌드 성공, UI **23/23 · 101.194초**. 15분·길이 미정 카드의 직접 삭제, 휴지통 복원, 다음/이전 카드·빈 목록 포커스, 상세 삭제와 720px 화면을 확인했다.
- Runtime delta는 같은 조건의 변경 전 baseline 부재로 **not measured**. 기본 suite의 heavy-resource launch delta **0**, 명시적 UI는 기존 Edge 실행을 공유한다.
- Sol이 구현·UI 검증을 맡았고 root는 코드·스크린샷 검토와 문서 통합을 맡았다. 실제 Windows 설치본 조작은 미실시했다.

## 미계획 드롭 위치 연결 Test delta brief (2026-10-12)

- Unique risk: 더미 이동 직후 저장 응답을 기다리는 동안 원래 카드가 다시 보이거나 드래그 복사본이 원래 자리로 돌아간 뒤 목적지에서 다시 나타남. 정상 저장의 연결을 고치면서 실패·취소의 복귀, 연속 드래그 또는 모션 감소 설정이 깨짐.
- Existing owner / Selected layer: 기존 `scripts/ui-check/inbox.mjs`의 카드·더미 드롭 owner를 확장한다. 실제 포인터와 렌더링 프레임에서 드롭 복사본·원본·목적지의 위치와 노출을 관찰하며 저장 응답을 지연시킨다. 공유 드래그 경로는 기존 today·plan owner의 관련 시나리오로 확인한다.
- Expected cost delta: 기존 명시적 Edge UI 계층을 사용하며 기본 Node suite에 브라우저·프로세스·네트워크 실행을 추가하지 않는다. 새 테스트 파일·dependency·CI lane·coverage floor 변화 0.
- Evidence to retire: 최종 카드 순서만으로 드롭 애니메이션을 검증했다고 보는 기대를 중간 프레임과 저장 성공·실패 관찰로 보완한다.

Test delta 결과: 기존 inbox UI owner **0 added / 2 extended / 0 removed**, 수집 **12→12**. 카드 이동 **1/1 · 9.224초**, 더미 손잡이 **1/1 · 6.872초** 통과. 지연 저장 중 원본 숨김·복사본 유지, 중간 프레임의 원래 자리 복귀·중복 표시 부재, 새 더미·더미 순서·날짜 배치, 드래그 중 원본 삭제, 취소 시 손잡이 복귀, IPC 대역 저장 실패의 복귀, 모션 감소 시 착지 애니메이션 0회를 확인했다. 기존 today 본문 드롭 **1/1 · 3.582초**, plan 레일 고정·이동·해제 **1/1 · 10.658초** 통과. 변경 전에는 지연 저장 중 복사본이 사라지는 실패를 재현했고, 변경 후 대기·저장 화면을 육안 확인했다.

기존 Node suite **63/63 · 209.016ms**, TypeScript·Vite 빌드 **1.88초**, UI 소스 5개 수동 impeccable detector **[]**, `git diff --check` 통과. Vite의 Windows sandbox realpath 제한은 동일 명령의 승인된 제한 외 실행으로 해결했다. 새 테스트 파일·dependency·CI lane·coverage floor·기본 suite heavy-resource launch 변화 **0**. 신뢰할 동일 조건 baseline 부재로 runtime delta는 **not measured**. Sol이 구현·UI 검증, 별도 Sol이 읽기 전용 검토, root가 문서 통합·최종 검증을 담당했다. 실제 설치본 GUI는 실행하지 않았고 브라우저 검증용 프로세스는 종료했다.

## 저장 결과 확인과 초안·재시도 분리 Test delta brief (2026-10-12)

- Unique risk: 이미 저장된 요청을 시각 검사에서 차단해 중복 저장을 유도함. 응답을 받기 전 입력을 바꾸면 기존 요청 식별자가 사라지거나, 늦은 성공 응답이 새 입력을 지움. 처리 기록이 없는 만료 요청을 복구하면서 사용자 확인 없이 새 요청으로 바꿈. 미래 시각 허용과 처리 기록 정리의 기준이 달라 정리 후 같은 요청이 다시 실행됨.
- Existing owner / Selected layer: 기존 `src/queue.test.ts`의 입력·재시도 owner, `src/bench.test.ts`의 미리보기 명령 owner, `src-tauri/tests/storage.rs`의 처리 기록·만료 owner를 확장한다. 실제 세션 연결과 복구 버튼은 기존 명시적 `scripts/ui-check/capture.mjs` owner를 갱신한다.
- Expected cost delta: 기존 실행 계층과 테스트 파일 안에서 결정적 시각 및 임시 SQLite로 검증한다. 기본 suite의 브라우저·네트워크·새 dependency·CI lane·coverage floor 변화 0. UI는 기존 명시적 Edge 실행을 공유한다.
- Evidence to retire: 처리 기록이 남은 요청도 30일 경계에서 무조건 거절한다는 기대값, 미래 1ms 거절, 만료 복구 버튼만으로 요청 식별자를 자동 해제하는 기대값을 교체한다.

Test delta 결과: 기존 Node queue·bench owner **2 extended**, 수집 **63→63**, 전체 **63/63 · 264.5194ms**. 후속 단언 보강 후 해당 owner **15/15 · 117.3609ms**. Rust 처리 기록 owner **1 extended**, 수집 **23→23**, 좁은 사례 **1/1 · 0.43초**, 전체 **23/23 · 본체 5.69초**. TypeScript·Vite 최종 빌드 **1.92초**, desktop `cargo check --locked` **0.86초**, `git diff --check` 통과. Vite·Cargo는 Windows sandbox 경로 정규화 제한으로 실패한 뒤 동일 명령의 승인된 제한 외 실행으로 통과했다. 새 테스트 파일·기본 suite 실행 프로세스·dependency·CI lane·coverage floor 변화 **0**. 신뢰할 동일 조건 변경 전 baseline 부재로 runtime delta는 **not measured**. Sol 구현과 별도 Sol 읽기 전용 검토를 거쳤고, root는 문서 통합 및 필수 최종 검증을 담당했다.

명시적 capture UI **1 extended / 0 added / 0 removed**, 수집 **5→5**, **5/5** 통과. 동일 시나리오의 IPC 대역 보강 후 해당 사례만 **1/1 · 6.120초**로 재검증했다. 알 수 없는 요청의 확인 취소·승인, 이미 처리한 요청의 새 입력 보존, 빈 입력의 재시도 버튼, 초안 보관 실패 시 전송 차단, 응답 유실 후 재시작의 읽기 전용 처리 기록 확인, 처리 기록 조회 실패 시 입력·요청 보존을 확인했다. 초기 UI 실행은 개발 서버 부재와 브라우저 프로필의 Vite 파일 감시 충돌로 실패했으며, 서버 준비 및 무시 경로로 출력 이동 후 통과했다. 기본 suite의 heavy-resource launch delta는 **0**이며 실제 설치본 GUI·OS 시계 변경 시험은 수행하지 않았다. IPC 대역 검사는 실제 Rust 저장소 검사를 대신하지 않는다.

## 요청 재시도 기한·처리 기록 정리 Test delta brief (2026-10-11)

- Unique risk: 처리 기록을 지운 뒤 오래된 요청이 다시 실행되거나, 초안/재시도가 생성 시각을 갱신해 30일 기한을 우회함. 시계가 앞으로 갔다 돌아온 뒤 삭제된 요청이 되살아남. v6→v7 이관이 기존 더미 순서를 바꾸거나 오래된 초안을 자동으로 새 요청으로 저장함.
- Existing owner / Selected layer: 기존 `src/queue.test.ts`의 캡처·재시도·보관 초안 순수 owner를 확장. Rust `src-tauri/tests/storage.rs` 처리 기록 owner에 결정적 시각으로 만료·정리·시계 역행·v6 이관 사례 1개를 추가하고 기존 이관 owner를 v7로 갱신. 미리보기 명령 owner는 새 timestamp 계약을 따라 기존 사례를 갱신. 실제 복구 버튼 연결은 기존 명시적 `scripts/ui-check/capture.mjs`의 Edge owner에 만료/legacy를 한 시나리오로 확인.
- Expected cost delta: Rust 임시 SQLite 시나리오 +1, Node 기존 사례 확장으로 수집 유지, 명시적 UI +1. 새 테스트 파일·dependency·worker·CI lane·기본 suite 브라우저/네트워크 실행·coverage floor 변화 0; UI는 기존 Edge 실행을 공유.
- Evidence to retire: 무기한 요청 재시도 기대값과 저장소 v6 지원 상한. 30일 경계 및 v7 이관·이전 버전 백업 호환으로 대체.

Test delta 결과: Rust **1 added**, 기존 이관/지원 상한 owner를 v7로 갱신, 수집 **22→23**, **23/23 · 본체 4.69초**; desktop `cargo check --locked` 통과(11.84초). Node **0 added / 3 extended / 0 removed**, 수집 **63→63**, 대상 queue·bench·cut **20/20 · 122.9388ms**, 전체 **63/63 · 190.9114ms**. `npm run build` 통과(TypeScript·Vite 1.89초). 명시적 capture UI **1 added**, 수집 **4→5**, 새 만료/legacy 복구 사례 **4.262초**, 대상 **5/5** 확인. 최초 실행의 포커스 사례는 차가운 Vite에서 빈 페이지를 읽어 실패했고, 서버가 준비된 뒤 그 사례만 재실행해 **1/1 · 2.177초**로 통과했다. 상대 Edge 프로필 경로 실행은 시작하지 못해 절대 경로로 다시 실행했다. 전체 runtime delta는 같은 조건의 신뢰할 baseline 부재로 **not measured**; 기존 suite의 process·worker·브라우저 실행·CI lane·coverage floor 변화 **0**. 실제 설치본과 OS 시계 조작은 실행하지 않았으며 만료/역행은 결정적 시각 인자로 검증했다.

## 미리보기 명령 일치 Test delta brief (2026-10-11)

- Unique risk: 브라우저에서는 오래된 편집·잘못된 날짜/길이/설정·중복 항목을 받아 실제 Rust 앱과 다른 결과를 보이거나, 거절한 정기 업무 생성이 생성 기록을 남김. 기존 일치 사례는 정상 작업대·완료·도마 전이만 확인해 거절 경계를 검출하지 못함.
- Existing owner / Selected layer: 기존 `src/bench.test.ts`의 순수 미리보기 상태 owner에 버전·제목, 거절 입력, 설정·정기 업무 사례를 추가하고 `src/cut.test.ts`의 도마 일치 사례를 확장. Rust 계약은 기존 `src-tauri/tests/storage.rs` 저장 시나리오에서 같은 대표 입력·결과로 보강.
- Expected cost delta: Node 동기 사례 +3, 도마 기존 사례 확장; Rust 기존 사례 확장으로 수집 수 유지. 새 테스트 파일·dependency·worker·CI lane·브라우저/네트워크 실행·coverage floor 변화 0.
- Evidence to retire: 없음. 기존 정상 전이는 유지하고 같은 owner에서 거절 후 원본 상태 보존을 확인.

Test delta 결과: Node **3 added / 1 extended / 0 removed**, 대상 bench·cut 수집 **11→14**, **14/14 · 118.586ms**. 전체 Node **60→63**, **63/63 · 209.3894ms**, `npm run build` 통과(TypeScript·Vite 2.49초). Rust 기존 persistence·flow 사례 **2 extended**, 수집 **22→22**, **22/22 · 본체 4.51초**. UTF-8 길이·날짜/시각·중복/버전·설정 거절, 정기 업무 생성 실패의 원본/생성 기록 보존, 도마 고정 시각 충돌과 제목 정리, 날짜 이동 후 순서 1을 확인했다. 대상 Node 변경 전 단일 실행은 129.7299ms였으며 단일 실행 차이는 성능 추정이 아니다. 전체 runtime delta는 신뢰할 동일 조건 baseline 부재로 **not measured**. 샌드박스 Windows canonicalize/realpath 제한으로 Rust·Vite는 승인된 제한 외 실행에서 통과했다. 새 heavy-resource launch·worker·CI lane·coverage floor 변화 **0**.

## 전역 검색 Test delta brief (2026-10-11)

- Unique risk: 결과의 현재 위치 표기가 화면과 다름, 미계획·날짜·완료·휴지통 중 일부를 못 찾음, 이동 뒤 블록이 보이지 않거나 포커스를 잃음, Esc가 원래 포커스로 돌아가지 않음, 한글 조합 중 결과가 멈추거나 Enter가 이동을 실행함.
- Existing owner / Selected layer: 일치·정렬·위치 표기는 새 순수 모듈 `search.ts`의 owner `src/search.test.ts`. 패널·키보드·이동·강조는 새 명시적 `scripts/ui-check/search.mjs`(새 화면 영역이라 기존 owner 없음).
- Expected cost delta: Node +2, UI +4(약 13초). 새 dependency·CI lane 없음.
- Evidence to retire: 없음.

Test delta 결과: Node **60/60**, `npm run build` 통과. UI는 실행 시간 제한 때문에 두 묶음으로 나눠 전용 개발 서버에서 돌렸다: inbox·search·editor·today **34/34**, plan·settings·backups·capture **33/33**.

## 도마(쪼개기) Test delta brief (2026-10-11)

- Unique risk: 확정한 조각이 원래 자리(더미 안·그날 순서·고정 시각)를 벗어나거나, 완료 조각이 날짜 없이 남거나, 고정 블록 조각이 다른 예약과 겹침. 솔기·칼선·키보드 글줄 조작의 길이 계산이 15분 단위와 합계 규칙을 어김. 취소가 저장하거나 닫기가 버림.
- Existing owner / Selected layer: 저장 규칙은 Rust storage owner(기존 분할 사례를 도마 사례로 교체). 조각 계산은 새 순수 모듈 `cut.ts`의 owner `src/cut.test.ts`(미리보기 일치 포함). 대화상자·포인터·포커스는 기존 `scripts/ui-check/editor.mjs` 분할 시나리오 교체와 `inbox.mjs` 흐름 2개.
- Expected cost delta: Rust 1 교체, Node +5, UI editor 1 교체·inbox +2. 새 dependency·CI lane 없음.
- Evidence to retire: ‘뒤 블록은 미계획으로 간다’는 분할 기대값과 범위 슬라이더 조작. 같은 자리 연달아 놓임·취소 단언으로 대체.

Test delta 결과: Rust storage **22/22**, Node **58/58**, UI inbox **12/12**·editor **10/10**·today·plan·settings·backups·capture **41/41**, `npm run build` 통과.

## 미계획 작업대 Test delta brief (2026-10-11)

- Unique risk: 카드가 더미 안·사이·날짜 기둥에 놓일 때 저장 관계와 미리 보인 자리가 다름, 더미 통째 이동·합치기가 다른 더미를 흔듦, 키보드만으로 길이·순서·더미 이동·싣기를 할 수 없음, 최소 창에서 날짜 기둥이 밀려남, 공용 드래그 확장으로 오늘·계획 드래그가 회귀.
- Existing owner / Selected layer: 드롭 해석은 순수 `intent.ts` owner `src/intent.test.ts`에 사례 1개. 실제 포인터·DOM 좌표·포커스는 명시적 `scripts/ui-check/inbox.mjs`를 작업대 시나리오로 교체한다. 공용 drag 변경은 기존 today/plan/editor 시나리오로 확인한다.
- Expected cost delta: Node +1. UI inbox 8→10(목록형 시나리오 6개를 작업대 시나리오로 교체, 드래그·키보드·좁은 화면 추가). 새 파일·dependency·CI lane 없음.
- Evidence to retire: 목록 행·‘배치를 기다리는 일’ 머리·‘계획에 배치하기’·‘빈 미계획은 입력만’ 기대값. 같은 위험은 더미·투입구·날짜 기둥 단언으로 대체.

Test delta 결과: Node **53/53**, UI inbox **10/10**, today·plan·editor·settings·backups·capture **51/51**, `npm run build` 통과.

## 완료 정책 Test delta brief (2026-10-11)

- Unique risk: 미계획 완료가 날짜 없는 기록으로 남거나 다른 날짜로 새고, 하루 비우기·미계획 이동이 완료 기록을 날짜 없이 만듦. 이전 날짜 없는 완료를 되돌릴 수 없음.
- Existing owner / Selected layer: Rust storage owner에 완료 정책 사례 1개를 추가하고 하루 비우기 사례를 새 기대값으로 확장한다. 미리보기 일치는 `src/bench.test.ts`에 1개. 화면 경계는 기존 `scripts/ui-check/inbox.mjs` 완료 시나리오를 교체한다.
- Expected cost delta: Rust +1 / 확장 2, Node +1, UI 시나리오 교체 1. 새 파일·dependency·CI lane 없음.
- Evidence to retire: ‘완료하면 접힌 완료 목록으로 간다’는 UI 기대값을 ‘오늘 완료 칸에 기록된다’로 교체.

Test delta 결과: Rust storage **22/22**, Node **52/52**, UI inbox **8/8**(완료 시나리오 3.68초), `npm run build` 통과.

## 작업대 저장소 v6 Test delta brief (2026-10-11)

- Unique risk: 더미·프로토 관계가 저장·재시작·백업 복원·v5 이관에서 깨지거나, 빈 더미·고아 위치가 남아 미계획 일이 화면에서 사라짐. 미리보기 저장소가 Rust 규칙과 달라 브라우저 확인이 실제 앱과 다른 결과를 보임.
- Existing owner / Selected layer: 실제 임시 SQLite owner `src-tauri/tests/storage.rs`에 더미·프로토 전 주기 1개와 v5 이관 1개를 추가하고, 기존 legacy·백업 검사 사례를 v6 형태로 확장한다. 순수 배치 규칙과 미리보기 일치는 새 owner `src/bench.test.ts`(새 모듈 `bench.ts`)에 둔다.
- Expected cost delta: Rust tempfile 시나리오 +2, Node 동기 사례 +5. 새 dependency·worker·브라우저·CI lane 없음.
- Evidence to retire: 없음. legacy 사례는 v5 이관까지 확장하고 다운그레이드 거부 기준을 v7로 올렸다.

Test delta 결과: Rust **2 added / 2 extended / 0 removed**, storage **19→21** 통과(4.73초). Node **46→51** 통과(145.6ms). `npm run build`, desktop `cargo check` 통과.

## 오늘 두 열 스크롤 Test delta brief (2026-10-11)

- Unique risk: 하루 높이가 전체 창을 밀거나 미계획이 세 번째 열로 분리됨, 잘린 시간표가 상단 막대의 드롭을 받음, 스크롤 뒤 고정 시각이 포인터 아래 시간과 달라짐, 완료 뒤 입력이나 키보드 순서 이동 뒤 블록 포커스가 보이지 않음.
- Existing owner / Selected layer: 명시적 `scripts/ui-check/today.mjs`의 레이아웃·실제 포인터·완료 포커스 사례를 확장한다. 렌더링·잘림·브라우저 좌표 경계이므로 순수 Node 소스 검사는 추가하지 않는다. 공용 drag 변경은 기존 plan/editor UI 사례로 확인한다.
- Expected cost delta: 기존 시나리오 확장·교체, 수집 수 변화 0. 같은 브라우저 세션의 스크롤·드래그 관찰 약 2초 추가 예상; 새 파일·의존성·worker·브라우저 launch·CI lane·coverage floor 변화 0.
- Evidence to retire: 960px에서 별도 행의 미계획을 가운데 열 바로 아래에 배치한다는 단언은 공통 실행 흐름과 독립 스크롤 단언으로 교체한다. 신뢰할 동일 환경 통과 baseline이 없어 runtime delta는 not measured; 최종 브라우저 결과는 작업 검증 기록이 소유한다.

Test delta 결과: **0 added / 5 extended / 0 removed**, today 수집 **8→8**. 기존 editor 10 / plan 18 / today 8의 36개를 확인했다. 첫 묶음 34/36 이후 놓는 순간의 고정 판정 회귀와 한국어 표시 기대값을 수정했고, 좁은 재검증에서 새 키보드 가시성 검사의 경계 잘림을 보완했다. 최종 최소 창 사례 **1/1 · 4.581초**, 나머지는 통과한 기존 결과를 유지한다. Node **46/46 · 167.9233ms**, 최종 빌드 통과. 전체 runtime delta는 동일 조건 전체 baseline 부재로 **not measured**. 기본 suite·정규 UI lane의 worker / heavy-resource launch / CI / coverage-floor 변화 **0**. 이번 수동 검증은 기존 시나리오를 소켓 대신 파이프로 연결한 임시 실행기로 실행했고 정규 실행기·의존성은 변경하지 않았다.

## 고정 변경 머무름·근무 외 표시 Test delta brief (2026-10-11)

- Unique risk: 고정 블록을 레일에서 옮기는 동안 이웃 유동 블록이 눈금마다 고정 블록 앞뒤로 뛰어 떨리고, 근무 외로 밀릴 블록을 놓기 전에 알 수 없음.
- Existing owner / Selected layer: 새로 밀린 블록 판정은 순수 `today.ts`의 owner `src/schedule.test.ts` 기존 파일에 사례 1개. 머무름·표시는 실제 포인터 타이밍이 필요하므로 명시적 `scripts/ui-check/plan.mjs`에 시나리오 1개.
- Expected cost delta: Node 동기 사례 +1, UI 시나리오 +1(약 6초). 새 파일·의존성·worker·CI lane·coverage floor 변화 0.
- Evidence to retire: 없음. 기존 레일·길이 조절 시나리오는 최종 배치를 그대로 단언한다.

Test delta 결과: **2 added / 0 extended / 0 removed**. 기본 Node **44/44 · 155.7ms**, `npm run build` 성공. UI plan 17 / today 8 **25/25** 통과. 변경 전 코드에 새 시나리오를 돌리면 ‘neighbours hold still while the block is moving’에서 실패해 결함을 검출함을 확인했다.

## 반응형 드래그 모션 Test delta brief (2026-10-11)

- Unique risk: 본문 위에서 드래그 중인 복사본이 포인터 이동·방향 전환 뒤 두 프레임 안에 따라오지 않거나, 크기 조절 경계가 드래그 중에는 갱신되지 않아 사용자가 놓기 전 결과를 알 수 없음. 기존 최종 배치 단언은 이 상호작용 지연을 검출하지 못한다.
- Existing owner / Selected layer: 명시적 `scripts/ui-check/{plan,today}.mjs`의 실제 DOM·포인터 Edge 경계. 같은 시나리오에서 held/hollow, 드롭 결과, grip 배치까지 확인하므로 새 사례나 순수 소스 검사는 중복이다.
- Expected cost delta: 기존 시나리오 2개를 확장하고 900ms 정착 대기를 두 rAF 관찰로 교체한다. 시나리오·파일·worker·브라우저 launch·CI lane·coverage floor 증가 0.
- Evidence to retire: 본문 드래그 중 held와 hollow가 같은 좌표에서 정착한다는 구 기대값. hollow의 최종 범위·held 텍스트·드롭 결과와 포인터 추종 관찰로 대체한다.

Test delta 결과: **0 added / 2 extended / 0 removed**, 기존 today 8 / plan 16 수집 유지. 가로·세로 방향 전환과 크기 조절 중의 두 rAF 관찰을 추가하고 최종 배치 단언을 유지했다. 기본 Node **43/43 · 153.9613ms**, worker·CI lane·coverage floor 변화 0. 첫 editor/plan/today 묶음 33/34 뒤 센서 활성화와 추종 측정을 분리했으며, 계획 재검증 **16/16 · 시나리오 합계 70.542초**와 변경 없는 editor/today **18/18**로 대상 34개를 확인했다. 짧은 블록 표시 통합 보완 뒤 같은 포인터 시나리오를 별도로 재확인했다. 정규 UI lane의 브라우저 launch delta 0이며, 이번 계측·재확인용 실행은 기본 suite에 추가하지 않았다. 전체 UI runtime delta는 동일 조건 baseline 부재로 미측정이다.

## 대시보드 감사 후속 Test delta brief (2026-10-11)

- Unique risk: 대기열 완료·상세/드로어 닫기 후 포커스가 사라짐, 최소 창에서 미계획 입력이 긴 시간표 아래로 밀림, 지난 날짜 텍스트의 대비 부족, 접힌 완료·휴지통 목록의 불필요한 DOM 생성.
- Existing owner / Selected layer: 기존 `scripts/ui-check/{today,editor,plan,inbox}.mjs`의 명시적 Edge UI 경계. 실제 DOM 포커스·배치·합성 색상·접힘을 확인하므로 순수 Node 시험이나 소스 문자열 검사는 대체 증거가 아니다.
- Expected cost delta: 기존 시나리오를 확장하고 필요한 최소 창 사례만 추가한다. 기존 UI 실행기와 브라우저를 공유하며 새 파일·의존성·기본 테스트 worker·CI lane·coverage floor 변경 없음.
- Evidence to retire: 완료 시나리오의 기존 조작을 키보드 대기열 완료로 바꾸면서 원래 배치 결과 단언을 유지한다. 나머지 기존 편집·복원·영구 삭제 증거는 유지한다.
- Baseline: 기본 Node 43/43, 155.2711ms. 관련 UI 수집은 today 7 / editor 10 / plan 16 / inbox 8, 합계 41. UI 시간 baseline은 미측정이다.

Test delta 결과: 기존 UI owner에 **1 added / 7 extended / 0 removed**, 수집 **41→42**(today 8 / editor 10 / plan 16 / inbox 8). 첫 묶음 40/42에서 Next 카드의 StrictMode 포커스 복귀 결함을 보완하고, 960px 시험의 과도한 첫 화면 수용 조건을 대기열 직후 배치·입력 포커스 스크롤로 바꿨다. 영향 영역 재실행 **editor/today 18/18 · 시나리오 합계 62.708초**, 변경 없는 plan/inbox **24/24**와 합쳐 대상 42개 모두 통과했다. 새 최소 창 사례는 1.890초이며 전체 UI runtime delta는 baseline 부재로 미측정이다. 기본 Node 사례·worker·coverage floor 변화 0. 정상 lane의 Edge launch delta 0, 이번 확인에서는 첫 묶음 1회와 실패 수정 후 좁은 재검증 1회를 실행했다(샌드박스에서 Edge가 시작되지 않은 시도 1회 제외). 최종 `npm run build` 성공. 새 테스트 파일·의존성·CI lane은 없다.

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


## 휴지통 Test delta brief (2026-10-11)

- Unique risk: 삭제한 작업이 배치·겹침 검사에 남거나 되살아나지 않음, 복원이 날짜·순서·고정·완료를 잃거나 순서 번호를 중복시킴, 30일 정리가 일반 작업이나 기간 안 항목을 지움, 휴지통이 백업·복원에서 사라짐, v4 DB 이관이 기존 행을 휴지통으로 오인함, 삭제가 여전히 확인 창을 띄움.
- Existing owner / Selected layer: 저장 경계는 기존 `src-tauri/tests/storage.rs` 실제 임시 SQLite owner(새 시나리오 1개, 구버전 이관 사례에 v4 추가와 삭제·복원 단언 확장, 미지원 버전 값을 5→6으로 갱신). 정리 시각은 `purge_trash(now)` 인자로 주입한다. 화면 연결과 확인 창 부재는 명시적 `scripts/ui-check` owner(inbox·editor). 미리보기 대역(`src/preview.ts`)은 ui-check가 실행한다.
- Expected cost delta: storage 실행 파일 안 시나리오 +1, Node 기본 suite 변화 0, ui-check 시나리오 +2(교체 1). 새 파일·의존성·worker·CI lane 0.
- Evidence to retire: ‘delete asks first and keeps the row when declined’ ui 사례(확인 창 자체가 제거됨) — 확인 창이 없음을 단언하는 휴지통 사례로 교체.

Test delta 결과: storage added/extended/removed **1/2/0**, 수집 **18→19**, `cargo test --locked` storage **19/19 · 본체 4.25초**, desktop 단위 2/2. Node `npm test` **43/43**(변화 0), `npm run build` 성공. ui-check `--only inbox,editor` **18/18**(inbox 7→8: 교체 1·추가 1·빈 목록 사례 확장, editor 9→10). 단일 실행 시간은 성능 추정이 아니다. heavy-resource 자동 launch 0, coverage-floor 영향 0. 네이티브 앱에서의 확인 창 부재·시간별 정리 실행은 이 시험으로 합격 처리하지 않는다.

## 근무 외 배치 정책 Test delta brief (2026-10-11)

- Unique risk: 수동 고정 배치만 근무 외에서 거부되거나 설정 변경·복원 때 고정 시각을 잃음. 경계 저항이 통과 불가능한 장벽이 되거나 일부 겹침을 전체 블록으로 표시·집계함.
- Existing owner / Selected layer: `src/schedule.test.ts`의 순수 배치 owner에 경계 저항·부분 구간 2개 추가, 기존 거부 정책 사례 교체. `src-tauri/tests/storage.rs`의 기존 SQLite 사례 3개 확장. `scripts/ui-check/plan.mjs`에 실제 포인터·부분 마스크 연결 사례 1개 추가하고 settings의 동의 시나리오를 고정 보존 시나리오로 교체.
- Expected cost delta: Node 동기 사례 +2, Rust 사례 수 유지, 명시적 UI 사례 +1. 새 테스트 파일·의존성·worker·CI lane·coverage floor·기본 suite의 heavy-resource launch 변화 0.
- Evidence to retire: 근무 외 배치 거부 및 근무 설정 변경 시 고정 해제 동의 기대값. 새 정책의 허용·고정 보존 기대값으로 대체.

Test delta 결과:
- Node: added / extended / removed **2 / 1 / 0**, 수집 **44→46**, `npm test` **46/46 · 146.918ms**.
- Rust: **0 / 3 / 0**, storage **19/19 · 4.79초**, desktop `cargo check --locked` 성공. 설정 변경·백업·재시작·휴지통 복원에서 근무 외 고정을 보존한다.
- UI: 기존 plan/today/settings owner에서 **1 추가 / 3 교체**, 최종 관련 시나리오 **36개 통과**. settings 10개와 plan/today 25개를 묶음 실행했고, 드래그 활성화 거리를 바로잡은 새 경계 사례는 `--match 'working lips'`로 1개만 재실행해 통과했다. 이 필터는 실패한 사례만 다시 실행해 전체 브라우저 묶음 반복을 줄인다.
- 경계 UI 사례 본체는 5.844초. 신뢰할 동일 환경 변경 전 통과 baseline이 없어 runtime delta는 **not measured**. 기본 suite의 heavy-resource launch·worker·coverage floor 변화 **0**.
- `npm run build` 성공, `git diff --check` 성공. 실제 포인터와 네 테마 스크린샷으로 부분 마스크·배경 차이를 확인했다. Impeccable detector의 경고는 기존 레일 width transition 및 기존 반경·글자 크기에 한정되었다.
- Windows 네이티브 앱의 수동 조작은 별도 미실시. Rust 저장 경계와 브라우저 UI 검증 결과를 구분한다.
