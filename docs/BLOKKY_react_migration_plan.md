# BLOKKY React 전면 도입 계획

**작성일:** 2026-10-10 · **브랜치:** `react` (시험 구현 `spike/react-today`에서 이어짐)
**입력:** [블록 재설계 시안](https://claude.ai/artifact/GquAmvyNmYY3D6e9m8RkS6), [시험 결과](react-spike-today.md), [재설계안](BLOKKY_redesign_intent_and_ux.md), [구현 계획](BLOKKY_redesign_implementation_plan.md), PRODUCT.md, DESIGN.md
**성격:** 기존 DOM 문자열 화면(`main.ts` 외)을 React로 다시 만들고 블록 중심 시안을 반영하는 순서·경계·검증. 저장소(Rust)와 순수 로직은 바꾸지 않는다.

---

## 1. 결정

| # | 결정 | 근거 |
|---|---|---|
| R1 | React 19 + `motion` + `@dnd-kit/core`. 기존 `main.ts`·`calendar-gestures.ts`·`availability.ts`(HTML 부분)·`style.css`·`workspace.css`·`availability.css`는 이전이 끝나면 제거한다 | 시험 구현에서 스프링·들어 옮기기·레일 흡착이 기존 모듈 재사용으로 동작함을 확인 |
| R2 | 상태는 별도 라이브러리 없이 `useSyncExternalStore` 저장소 하나. 쓰기는 기존 `SaveQueue` 한 줄로만 | 저장 신뢰성 규칙(응답 후 반영, 실패 시 머무름·재시도)을 그대로 유지 |
| R3 | 데이터·초안·종료 저장 로직은 화면과 분리해 `src/app/store/`가 소유한다. 화면은 저장소 동작만 호출한다 | 종료 전 저장이 편집창·설정·캡처의 저장을 화면 없이 실행해야 한다 |
| R4 | 보관 초안의 JSON 형식은 기존 키(`capture`, `captureCommand`, `calendarComposer`, `editor`, `rawSchedules`, `settingsBase`, `settingsDraft`, `routineDraft`, `epoch`)를 유지한다 | 업데이트 직후에도 사용자의 기존 초안을 읽는다 |
| R5 | 객체는 평면, 움직임은 물리적으로. 기울기 ≤1.2°, 들어 올림 3%. 네 테마 토큰(`tokens.css`)을 그대로 쓴다 | 사용자 피드백. 테마 시스템 유지 |
| R6 | 본문 = 순서, 레일 = 시각. 고정 블록을 본문에 놓으면 고정이 풀리며 그 순서에 들어간다. 날짜 칸·날짜 머리에 놓으면 그날 순서 끝 | 시안의 조작 문법. 순서 변경이 시각 고정으로 바뀌지 않는다(재설계안 §4) |
| R7 | 블록 위치는 `top`, transform은 순간 효과에만 | dnd-kit은 transform을 무시하고 잰다(시험에서 발견) |
| R8 | 오늘 화면의 ‘오늘 순서’ 목록은 없앤다. 블록 공간이 목록이며, 블록 선택 시 오른쪽 상세(제목·메모 우선)에서 편집한다. 계획·미계획에서는 같은 편집기를 대화상자로 연다 | 시안. AGENTS.md ‘작업 클릭은 제목과 상세 메모를 우선’ |

## 2. 구조

```
src/
  app/                    React 앱 (index.html 진입)
    main.tsx              진입: 테마 동기화, 저장소 시작, 캡처 창 분기
    store/                데이터·초안·종료·네이티브 이벤트 (기반 소유)
    shell/                레일 메뉴, 머리글(날짜 탐색), 상태줄, 복구 화면
    space/                블록 공간·블록·레일·수거함·들어 옮기기 (기반 소유)
    today/                오늘
    plan/                 계획: 주·2주·월, 날짜 시간표, 미계획 드로어, 새 블록 입력
    inbox/                미계획 화면
    editor/               상세 편집(패널·대화상자), 우클릭 메뉴, 나누기
    settings/             근무시간·날짜 예외·정기 업무·운영 설정·테마
    backups/              백업·복원(설정 안, 복구 화면)
    capture/              빠른 캡처 창 (?capture)
    ui/                   공용 버튼·아이콘·움직임 상수
  *.ts                    순수 로직 (flow, today, placement, time-axis, availability-band, settings, format, queue, capture, theme, dates, preview, intent)
```

화면 사이의 연결은 저장소의 `ui` 상태로 한다: 열린 편집기, 우클릭 메뉴, 근무시간 팝오버, 새 블록 입력, 나누기 대상. 블록은 이 상태를 열기만 하고, 각 영역이 자기 컴포넌트를 그린다.

## 3. 단계

### 단계 1 — 기반 (직접 수행)
- `store/`: 시험 구현의 저장소를 앱 전체로 확장한다. 기존 `main.ts`의 `reload`·`loadStoredDraft`·`refreshAppInfo`·`dispatch`·`persistDraft`·`draftChanged`·`unsaved`·`saveBeforeQuit`·`refreshForConflict`·`ensureVisibleRoutines`·`refreshCalendar` 규칙, 작업 조작(완료·순서·고정·배정·크기·나누기·삭제·생성), 편집기 초안(열기·변경·저장·버리기·덮어쓰기 확인), 설정 초안(`rawSchedules`·`settingsDraft`·저장·충돌 동의), 정기 업무 초안, 캡처 초안을 옮긴다.
- `shell/`: 레일 메뉴(오늘·계획·미계획·설정), 날짜 탐색, 상태줄(저장 중·오류·다시 시도·입력 유지·초안 다시 불러오기·이어서 편집), 알림 영역, 불러오기 실패 화면 자리.
- `space/`: 여러 날짜 공간을 동시에 다루는 들어 옮기기(날짜별 공간 등록, 본문·레일·대기 선반·미계획·날짜 칸 영역 판정), 블록·레일·셔터·수거함·현재선·배치되지 않음.
- `today/`: 시험 구현을 새 기반으로 옮긴다.
- 다른 영역은 동작하는 자리표시 컴포넌트와 계약(props·저장소 동작)만 둔다.
- `scripts/ui-check.mjs`: 헤드리스 Edge CDP 확인 묶음. 기본 `npm test`에 넣지 않는 명시적 확인이다.

### 단계 2 — 영역별 병렬 구현 (서브에이전트, 각자 git worktree)

| 담당 | 범위 | 소유 디렉터리 |
|---|---|---|
| A 계획 | 주(7일 블록 공간·공유 시간축·날짜 머리 배분 막대·완료 수), 2주(제목), 월(배분량·점유 막대), 선택 날짜 시간표, 미계획 드로어(지난 미완료 포함), 기간 탐색, 하루 비우기, 빈 시간 클릭(유동 30분)·범위 드래그와 레일 클릭(고정) 새 블록 입력 | `src/app/plan/`, `space/`의 새 블록 입력 확장 |
| B 설정 | 요일별 근무·휴식 밴드 편집(드래그·경계·우클릭·키보드), 날짜 예외(시간 변경·휴가·조퇴·점심 해제), 충돌 검토와 동의, 계획·오늘의 근무시간 팝오버, 정기 업무, 운영 설정(테마 2×2, 단축키, 자동실행, 창 닫기 종료, 진단) | `src/app/settings/` |
| C 편집 | 상세 편집기(제목·메모·체크리스트·크기·날짜·시각 고정, 저장·초안·닫기 확인·덮어쓰기·완료·미계획·삭제), 나누기, 우클릭 메뉴(블록·빈 시간, Shift+F10) | `src/app/editor/` |
| D 미계획·캡처·백업 | 미계획 화면(담기·목록·크기·완료 목록·삭제), 빠른 캡처 창, 백업·복원 관리와 복구 화면 | `src/app/inbox/`, `capture/`, `backups/` |

공통 규칙: 자기 디렉터리 밖은 저장소 동작 추가 같은 최소 변경만 하고 이유를 보고한다. 기존 동작은 PRODUCT.md·DESIGN.md·`main.ts` 해당 부분을 기준으로 옮기되, 블록 중심 시안과 AGENTS.md UI 원칙을 따른다. 각자 `tsc`·`npm test`·`build`와 자기 화면의 `ui-check` 시나리오를 통과시키고 커밋한다.

### 단계 3 — 통합과 정리 (직접 수행)
- 영역 브랜치를 합치고 오늘·계획에 편집기·메뉴·팝오버를 연결한다.
- 기존 화면 코드와 CSS를 제거한다. `suppressGestureClick` 사례는 새 클릭 억제 위치로 옮기거나 퇴역 기록한다.
- PRODUCT.md·DESIGN.md·README·decisions.md·validation.md·test-policy.md를 갱신한다.
- 전체 검증 후 `master`에 합칠지 사용자에게 보고한다.

## 4. 검증

| 층 | 명령 | 기준 |
|---|---|---|
| 타입 | `npx tsc --noEmit` | 오류 0 |
| 순수 로직 | `npm test` | 전부 통과. 들어 옮기기 의도 계산(`intent.ts`) 사례 추가 |
| 저장소 | `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --locked` | 변경 없음, 통과 유지 |
| 빌드 | `npm run build` | 통과 |
| 화면 | `node scripts/ui-check.mjs` (개발 서버 필요) | 헤드리스 Edge 실제 마우스 입력. 영역별 시나리오, 콘솔 오류 0 |
| 네이티브 | `./scripts/run.ps1 package` 후 격리 데이터 폴더 | 불러오기·저장·초안 복원·종료 저장·백업 복원·캡처 창 |

PRODUCT.md의 각 항목을 이전 확인 목록으로 쓴다. 손으로 끄는 느낌과 실제 IME 입력은 자동 확인으로 합격 처리하지 않고 사용자 확인으로 남긴다.

## 5. 위험

| 위험 | 대응 |
|---|---|
| 초안·종료 저장 회귀로 입력 손실 | 기반이 소유하고 기존 규칙을 줄 단위로 옮긴다. 초안 JSON 형식 유지(R4). 네이티브 종료 시험 |
| 병렬 작업의 공용 파일 충돌 | 디렉터리 소유 분리, `ui` 상태로 연결, 기반 파일 변경은 최소·보고 |
| 드래그 좌표 어긋남 | R7, 드래그 중 레이아웃 변화 금지, `ui-check`로 들고 있는 순간 확인 |
| 시각적 회귀 | 네 테마 토큰만 사용, 헤드리스 스크린샷 비교 |
