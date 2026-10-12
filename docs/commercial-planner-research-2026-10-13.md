# 상용 플래너 조사: 한 화면·담기→배치·몰입 (2026-10-13)

목적: 오늘·계획·준비 탭의 역할이 겹친다(준비 목록 3곳, 날짜 3곳)는 문제에서 출발해, 탭 없는 한 화면과 몰입 화면 전환을 검토하기 위해 상용 제품의 관행을 모은다. 결정 문서가 아니며 채택 여부는 [decisions.md](decisions.md)에 따로 남긴다.

시안:
- [선반 출고대 시안](https://claude.ai/artifact/YHpnL7ujr1ZDpsZDMRSN5G): 준비 탭 안에서 선반을 계획으로 넘기는 암시(1판 대기 차선, 2판 출고대·빠른 싣기).
- [한 화면 시안](https://claude.ai/artifact/ADfbhaDuo9neEpWeEfVyyn): 준비 도크 + 주 캘린더 한 화면, 도크 폭으로 가공/배분, 몰입 화면.

근거 표기: **D** 공식 도움말·변경 기록·제품 페이지, **R** 리뷰어·사용자·피드백 게시판, **I** 추정. 웹 검색으로 모았으며 일부 도움말은 이동·삭제되어 검색 요약만 확인했다(해당 항목에 적음).

## 1. 화면 구성과 탐색

| 관행 | 제품 | 근거 |
|---|---|---|
| 캘린더 옆에 날짜 없는 일 도크를 둔 한 화면. 가운데 보기만 바뀌고 도크는 남는다 | Sunsama, Reclaim Planner, Morgen, Motion(I) | D. [Sunsama 탐색](https://help.sunsama.com/docs/usage-guides/workspace-navigation), [Reclaim Planner](https://reclaim.ai/blog/announcing-planner-a-better-way-to-prioritize-your-workweek), [Morgen](https://www.morgen.so/todoist-integration) |
| 도크 위치는 제각각(오른쪽 Sunsama·Reclaim·Akiflow, 왼쪽 Amie, 버튼으로 여는 Todoist·TickTick) | — | D/R. [Todoist 캘린더](https://www.todoist.com/help/articles/use-the-calendar-layout-in-todoist-lPHRQTu0o), [TickTick](https://blog.ticktick.com/2020/11/30/ticktick-calendar-quickstart/) |
| 도크를 한 키로 접고, 숨긴 패널은 화면 가장자리에 커서를 대면 나타난다 | Sunsama(`<` `>`), Morgen(Ctrl+T), Fantastical | D. [Morgen 단축키](https://www.morgen.so/guides/mastering-morgen-web-app-shortcuts) (구 안내와 키가 다름) |
| 범위는 보이는 날 수. 숫자키로 날 수, 화살표로 그만큼 넘김 | Notion Calendar, Morgen(D/W/M/A) | D. [Notion Calendar 격자](https://cronhq.notion.site/Getting-around-the-grid-0e2e230ae42d48d2bf43dfe025f3ea55), [Morgen 이동](https://www.morgen.so/guides/how-to-navigate-your-calendar-in-morgen) |
| 오늘은 화면이 아니라 이동(T) | Morgen, Notion Calendar, Fantastical. 예외: Sunsama Today view | D. [Sunsama Today](https://help.sunsama.com/docs/today-view) |
| 편집기는 블록 옆 떠 있는 창. 편집할 때마다 캘린더가 줄어드는 문제로 오른쪽 사이드바를 없앰. 좁은 화면은 전체 화면·아래 드로어 | FlowSavvy 3.0 | D. [FlowSavvy 새 배치](https://flowsavvy.app/all-new-layout) |
| Ctrl K 명령 창(검색·이동·동작), ? 단축키 목록 | Sunsama, Amie, Morgen, Notion Calendar, Motion | D. [Sunsama 명령 창](https://help.sunsama.com/docs/usage-guides/keyboard-driven-actions/command-palette) |
| 설정은 주 탐색 밖(팝업·앱 메뉴·프로필) | FlowSavvy, Sunsama, Notion Calendar, Motion v3 | D |
| 계획과 실행은 데이터 장소가 아니라 모드로 나눈다 | Sunsama Focus(F)·Planning(P), Routine 전역 오버레이 | D. [Sunsama Focus 2.0](https://roadmap.sunsama.com/changelog/focus-mode-20) |

함정:
- 편집·추가 때 캘린더 폭이 바뀌는 고정 패널(FlowSavvy가 제거, Akiflow 사용자도 제거 요청 [R](https://akiflow.featurebase.app/p/eliminatehide-the-right-sidebar)).
- 계획 장소가 많아 익히는 데 일주일 걸렸다는 리뷰(Sunsama, [R](https://dhruvirzala.com/sunsama-review/)). 같은 목록을 여러 곳에 두지 않는다.
- 버튼 뒤에 숨긴 백로그는 잘 안 보인다(Todoist·TickTick).
- 데스크톱 폭 기준 자동 접힘을 문서화한 제품은 찾지 못했다.

## 2. 담기에서 배치까지

| 관행 | 제품 | 근거 |
|---|---|---|
| 하나의 받은 함에 담고 나중에 정리 | Things 3, Akiflow(R), Ellie | D. [Things 안내](https://culturedcode.com/things/guide/) |
| 처리 전(받은 함)과 처리 후(언젠가·백로그·하루 계획)는 다른 장소 | Things 3, Sunsama | I |
| 날짜 대신 대략의 시간대(다음 주, 다음 달, 언젠가, 안 함) | Sunsama, Akiflow, Things 3 | D. [Sunsama 백로그](https://help.sunsama.com/docs/usage-guides/backlog), [Akiflow 변경 기록](https://akiflow.featurebase.app/en/changelog/rituals-and-upcoming-improvements-sparkles) |
| 길이는 담을 때가 아니라 계획할 때. 정하지 않으면 기본 길이 | Sunsama, Reclaim(1시간), Morgen(+20% 권장), Akiflow | D. [Sunsama 하루 계획](https://help.sunsama.com/docs/usage-guides/daily-planning), [Reclaim](https://help.reclaim.ai/en/articles/5153635) |
| 한 번 누르는 길이 버튼(5·15·30분·1시간+) | Amazing Marvin | D. [Marvin 예상 시간](https://amazingmarvin.com/features/time-estimates) |
| 길이는 캘린더에서 아래 경계를 끌어 바꾼다. 시각이 있어야 길이를 정할 수 있는 제품도 있다 | Todoist, TickTick, Sunsama | D. [Todoist 길이](https://todoist.com/help/articles/set-a-task-duration-L1kYkZv8d) |
| 자동 쪼개기는 총 길이 + 최소 조각(+최대) | Motion, Reclaim(1–2시간), Morgen, FlowSavvy | D. [Motion FAQ](https://www.usemotion.com/help/project-management/task/task-scheduling-faq), [Reclaim](https://help.reclaim.ai/en/articles/4303610) |
| 하루 계획 의식: 어제 보기 → 담기 → 예상 → 용량 확인 → 순서·배치 | Sunsama, Akiflow | D. [Akiflow rituals](https://akiflow.featurebase.app/en/help/articles/0805246-rituals) |
| 초과 경고 옆에 해결 동작(미루기 D, 백로그 Z)과 예상 종료 시각 | Sunsama, Marvin(용량 막대) | D |
| 용량보다 적게 계획(9–5에 5.5시간, 20% 여유) | Sunsama, Morgen | D |
| 도크에서 시간칸으로 끌기, 반대로 끌어 날짜 풀기 | TickTick, Todoist, Sunsama, Ellie, Structured | D. [Sunsama 타임박스](https://help.sunsama.com/docs/timeboxing-how-to-timebox-a-task-to-the-calendar), [Ellie](https://guide.ellieplanner.com/features/the-timebox) |
| 못 끝낸 일은 기본으로 넘기고, N일 연속이면 자동 보관 | Sunsama(4일), Akiflow | D. [Sunsama 보관](https://help.sunsama.com/docs/usage-guides/archive) |

함정:
- 자동 보관이 중요한 일을 숨긴다(Sunsama 문서가 기준을 올리거나 끄라고 안내, D/R).
- 정리 의식은 자주 건너뛴다(R). 정리하지 않아도 무너지지 않아야 한다.
- 자동 배치는 '들어갈 곳 없음' 목록이라는 새 잡동사니를 만든다(Motion, I).
- 배치 전에 길이를 형태로 보이는 제품, 일을 합치는 기능은 찾지 못했다(없다고 확인한 것은 아님).

## 3. 몰입

| 관행 | 제품 | 근거 |
|---|---|---|
| 지금 일 하나와 그 메모·하위 작업만. 나머지는 가장자리로 숨기고 가리키면 보인다 | Sunsama, Marvin, Structured, Akiflow(R) | D. [Sunsama focus](https://help.sunsama.com/docs/focus-mode), [Marvin focus](https://amazingmarvin.com/features/focus), [Structured](https://help.structured.app/en/articles/331010) |
| 기본은 계획된 끝까지 카운트다운, 뽀모도로는 선택 | Structured, Llama Life, Tiimo, Sunsama | D |
| 끝을 넘기면 멈추지 않고 초과로 계속 세며, 반영 여부는 나중에 정한다 | Llama Life, Session, Blitzit | D. [Llama Life 초과](https://intercom.help/llama-life/en/articles/6575141) |
| 한 번 누르는 연장(+5/−5) | Llama Life, Tiimo | D |
| 완료하면 다음 일로, 다 끝나면 '오늘 끝' | Sunsama, Llama Life(자동 시작 선택) | D |
| 지금 말고 나중에: 화면을 떠나지 않고 다른 목록으로 | Llama Life | D |
| 몰입 중 담기 키(Sunsama A), 전역 명령 창(Akiflow) | Sunsama, Akiflow, Session | D |
| 앱 밖에 항상 위 타이머 창 | Sunsama Focus Bar, Marvin, Blitzit, Akiflow | D. [Sunsama Focus Bar](https://help.sunsama.com/docs/focus-bar) |
| 한 키로 들어가고 Esc로 나온다. 최소화와 타이머 정지는 별개 | Sunsama, Blitzit, Structured | D |
| 끝 전에 미리 알림(10·5·0분, 2분 전) | Sunsama, Session, Llama Life | D |
| ADHD 지향 제품은 부드럽게(남은 시간 고리, 일찍 멈춰도 벌 없음). 엄격한 쪽은 앱 차단·방해 금지 | Tiimo, Session / Reclaim, TickTick | D |

함정:
- 넘겨도 아무 신호가 없음(Sunsama, R). 끝에서 멈추는 타이머는 초과 시간을 잃는다(Structured).
- 초과가 뒤 일정을 밀어 주는 제품은 Motion뿐이다. 다른 제품의 사용자는 이를 요청한다(R).
- 캘린더를 완전히 숨기면 가장자리를 더듬게 된다는 불만(Sunsama, R).
- 몰입 자동 진입은 끌 수 있어야 한다(Sunsama 설정, D).

## BLOKKY에의 함의

이미 맞는 것: 들어옴과 선반의 분리, 판을 놓으면 30분, 지난 미완료를 들어옴에 남김(자동 보관 없음), 근무 외 넘침 표시, 날짜 블록을 준비로 되돌리기.

한 화면 시안에 보탤 것:
- 도크 접기 단축키와 가장자리 버튼. 도크 폭은 명시적 전환으로만 바뀐다.
- 편집기는 블록 옆 팝오버.
- 범위는 보이는 날 수로 키 전환(D 일, W 주, M 월, 숫자키 날 수), 오늘 T, Ctrl K, ?.
- 근무 외 넘침 옆에 '준비로' 해결 동작과 예상 종료 시각.
- 몰입: 남은 시간, 초과 계속 세기, 연장, 완료 후 다음 블록, 오늘 끝, 담기 키, 오늘 기둥 유지. 항상 위 타이머 창은 후속.

다르게 가기로 이미 정한 것: 한 번 누르는 길이 버튼은 두지 않는다(2026-10-12, 판 당김 손잡이 유지).

차별점이지만 검증되지 않은 것: 배치 전 길이를 높이로 보이는 선반, 도크 폭으로 가공·배분을 나누는 방식, 합치기.
