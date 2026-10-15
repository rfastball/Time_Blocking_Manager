# WP0 — 토큰·타입·시간 표기

근거: cycle3-fix-prompts.md와 cycle3-critique-report.md.

## 변경

색은 :root의 의미 토큰으로 모으고 overdue 3색을 추가했다. 사선과 모달 효과도 토큰화했다. 전체 대응표는 cycle3-token-map.json. 타입은 11/12/13/14/16/20px, 패널 16/600과 작업 제목 14/500을 구별한다. formatDuration과 rangeTitle은 순수 함수다. 선택 상태는 aria-pressed/aria-expanded로 나눴다.

## 검증과 비용

공통 검증과 구체 측정은 `cycle3-wp9-final-review.md`에 기록했다. Node 테스트 5→9, 브라우저/DB 자동 테스트 lane 추가 없음. Rust·SQLite 저장 규칙은 변경하지 않았다.

## 마지막 확인 담당에게

브라우저의 계획 화면에서 여섯 크기를 측정했다. 일반 날짜 텍스트는 한국어이며 날짜 입력 컨트롤 자체의 ISO 값은 유지한다.
