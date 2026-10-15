# WP7 — 설정 저장·휴무일

근거: cycle3-fix-prompts.md와 cycle3-critique-report.md.

## 변경

변경 시 항상 보이는 저장 바, 쉬는 요일 입력 접힘/비활성, 월요일→화~금 초안 복사, 24:00 종료 입력을 구현했다. Rust validate_settings는 이미1440을 허용하므로 변경하지 않았다. 진단 정보는 접힘 영역으로 모으고 텍스트 문법 아래 예시를 표시한다.

## 검증과 비용

공통 검증과 구체 측정은 `cycle3-wp9-final-review.md`에 기록했다. Node 테스트 5→9, 브라우저/DB 자동 테스트 lane 추가 없음. Rust·SQLite 저장 규칙은 변경하지 않았다.

## 마지막 확인 담당에게

1280×650 저장 바 y535~594, 문법 오류 포커스/aria-describedby,24:00 평일 복사 및 버리기를 확인했다. 기존 일정과 설정 충돌 거부는 native Rust 검증이 소유하며 이번 브라우저 preview는 이를 증명하지 않는다. D4 행 입력 UI는 보류.
