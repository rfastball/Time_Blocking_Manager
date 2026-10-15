# WP2 — 내비게이션

근거: cycle3-fix-prompts.md와 cycle3-critique-report.md.

## 변경

레일 Inbox는 항상 드로어를 연다. 활성 aria-current와 미배치·미완료 건수를 동기화했다. 완료 Inbox는 접힘 영역으로 분리한다. 오늘 날짜 이동 비활성 상태, 단위별 이전/다음 접근 이름, 2/4주 범위 제목을 구현했다.

## 검증과 비용

공통 검증과 구체 측정은 `cycle3-wp9-final-review.md`에 기록했다. Node 테스트 5→9, 브라우저/DB 자동 테스트 lane 추가 없음. Rust·SQLite 저장 규칙은 변경하지 않았다.

## 마지막 확인 담당에게

Inbox→오늘→Inbox 반복에서 열린 드로어와 활성 상태 확인. 연·월 경계 제목은 Node가 소유한다.
