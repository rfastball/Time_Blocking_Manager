# Cycle 2 — 확인된 세 문제의 최소 수정

근거: `docs/cycle2-assessment-a.md`, `docs/cycle2-assessment-b.md`의 동일한 P2 세 건. 확정 B/D 화면, PRODUCT.md, DESIGN.md, `todo-app-engineering-principles.md`를 유지했다. impeccable clarify/harden/adapt/polish/craft-floor 및 ponytail, write-lean-tests 지침을 적용했다. context·detector·브라우저 검사를 반복하지 않았다.

## 변경

1. **설정 오류 위치와 복구:** `src/settings.ts`의 순수 파서가 요일과 실제 줄 번호(빈 줄 포함)를 가진 문법 오류를 반환한다. 해당 입력 바로 아래에 예시를 포함한 오류를 표시하고 `aria-invalid`, `aria-describedby`, 포커스로 연결한다. 검증 오류 상태는 기존 저장소/큐 오류와 별도다. 문법이 수정되어 제출되거나 변경을 버리면 이 오류만 제거한다. 설정 저장 성공이 전역 오류를 일괄 지우던 경로도 제외했다. 큐 재시도/실패 요청 해제의 기존 오류 해제 동작은 유지한다.
2. **날짜 문맥:** 실제 오늘에만 ‘오늘 순서’를 쓰고 다른 날은 선택 날짜를 제목에 명시한다. 왼쪽 ‘오늘’ 메뉴는 실제 오늘로 복귀한다. 날짜와 관계없는 설정 화면의 날짜 이동 버튼은 숨긴다.
3. **짧은 창의 상세 편집:** 기존 상세창 안에서 상단 제목·닫기와 하단 주요 행동·저장 상태를 유지하고 입력·체크리스트·보조 행동 영역만 스크롤한다. 높이 740px 이하에서 메모의 초기 높이를 100px로 줄이고 세로 resize는 유지한다. 미리보기 저장 피드백은 ‘미리보기에 반영했습니다’로 구분한다.

DESIGN.md에 위 상호작용/배치 맥락을 기록하고 `.impeccable/design.json`에는 실제 추가된 높이 기준과 오늘 메뉴 의미만 동기화했다. 새 제품 기능, 외부 의존성, 저장 모델 변경은 없다.

## 검증과 비용

- `npm test`: 5/5 통과, 전체 97.4975ms. 기존 큐 테스트 3개 유지 + 설정 입력 순수 테스트 2개 추가.
- 새 테스트는 정상 구간/이름/빈 줄 보존과 잘못된 요일·실제 줄 위치를 각각 검출한다. 기존 owner 검색 및 test delta brief/result는 `docs/test-policy.md`에 기록했다.
- `npm run build`: TypeScript와 Vite 통과. 첫 실행은 esbuild의 상위 디렉터리 읽기가 sandbox에서 거부되었으며 동일 명령의 권한 검토 실행에서 성공했다. 번들 11 modules, CSS 14.80 kB / JS 36.63 kB, Vite 105ms.
- 브라우저·native·detector·패키징 실행은 이 단계에서 수행하지 않았다. 새 heavy-resource 테스트 실행 0, Node 테스트 파일 worker 1개 추가, coverage 기준 변경 없음. 신뢰할 수 있는 변경 전 baseline이 없어 runtime delta는 미측정이다.

## 마지막 확인 담당에게

별도 브라우저 한 번의 묶음 확인에서 960×640 / 넓은 창 상세의 주요 행동·상태 노출과 본문 resize/스크롤, 설정 잘못된 입력의 요일·빈 줄 포함 줄 번호·포커스·aria 연결·수정 및 버리기, 날짜 이동 후 제목과 왼쪽 오늘 복귀를 확인한다. 문법 오류는 이제 전역 footer가 아닌 해당 필드에 표시된다. 저장소·실패 큐 오류의 실제 native 재현, SQLite·백업·복원 성공을 이번 순수 테스트/정적 빌드의 증거로 주장하지 않는다.
