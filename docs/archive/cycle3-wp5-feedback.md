# WP5 — 조작 피드백

근거: cycle3-fix-prompts.md와 cycle3-critique-report.md.

## 변경

배치 거부를 grid/dayOff/outside/unavailable/overlap으로 설명한다. 겹친 제목과 불가 구간 이름을 ghost에 표시하고 하단에 중복하지 않는다. 거부 표시1.5초와 종료180ms, 배치600ms 강조, 길이 변경 전후와 제한 이유를 추가했다. 손잡이는 hover/focus에서 표시하며 12px 이상이다. 성공은 mutation 완료 시 별도 polite 영역에서 알리고 일상 상태줄은 live가 아니다. 큐 내부 표현과 존재하지 않던 비교 UI 약속을 제거했다.

## 검증과 비용

공통 검증과 구체 측정은 `cycle3-wp9-final-review.md`에 기록했다. Node 테스트 5→9, 브라우저/DB 자동 테스트 lane 추가 없음. Rust·SQLite 저장 규칙은 변경하지 않았다.

## 마지막 확인 담당에게

점심 거부·정상 놓기·키보드 길이 변경을 브라우저 조작으로 확인. 포인터 취소/blur는 정리 경로를 구현했지만 실제 멀티터치·스크린리더 음성·OS 창 전환은 미검증이다. D2 되돌리기는 기본값대로 없다.
