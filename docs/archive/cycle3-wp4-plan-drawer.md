# WP4 — Inbox 드로어·배율

근거: cycle3-fix-prompts.md와 cycle3-critique-report.md.

## 변경

3열과 달력 숨김 규칙을 제거했다. 달력|시간표 아래 전체 폭 드로어, 손잡이·grab 커서·36px 칩·18px 반경·미완료 색을 복원했다. 인라인 할 일 추가는 기존 CaptureDraft와 create 액션을 사용해 입력을 보존한다. 시간표 실제 높이로 배율을 구하고 포인터/ghost/resize가 공유한다. 680px 이하는 드로어 sticky, 큰 창에서는 세 줄까지 칩을 스크롤한다.

## 검증과 비용

공통 검증과 구체 측정은 `cycle3-wp9-final-review.md`에 기록했다. Node 테스트 5→9, 브라우저/DB 자동 테스트 lane 추가 없음. Rust·SQLite 저장 규칙은 변경하지 않았다.

## 마지막 확인 담당에게

시안1의 드로어 패딩12/16px을 바탕으로 1440×900의 남은 높이를 맞춰 세로 패딩8px과 한 줄 헤더를 사용했다. 확대/고배율·매우 많은 칩은 추가 native 확인 대상이다.
