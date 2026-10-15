# WP6 — 달력 정보

근거: cycle3-fix-prompts.md와 cycle3-critique-report.md.

## 변경

배치 없음 반복과 소수 시간 표기를 제거했다. 지난 날짜에는 지남과 미완료 건수만 표시하며 빈 시간은 없다. 쉬는 날은 aria-disabled인 비드롭 칸이다. 6px 셀 간격, 선택 테두리와 별도 hover, 실제 한 시간 간격의 분절 막대와 범례를 사용한다. 월 모드는 필요한 주 수만 그린다.

## 검증과 비용

공통 검증과 구체 측정은 `cycle3-wp9-final-review.md`에 기록했다. Node 테스트 5→9, 브라우저/DB 자동 테스트 lane 추가 없음. Rust·SQLite 저장 규칙은 변경하지 않았다.

## 마지막 확인 담당에게

D1 기본값에 따라 지난 날짜로의 배치는 허용하고 ghost에 지난 날짜를 붙인다. CLI URL 검출이 실패해 undersized-ui-text 0건은 주장하지 않는다. 렌더된 최소11px는 직접 측정했다.
