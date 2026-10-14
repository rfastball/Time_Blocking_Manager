---
name: BLOKKY
description: 분리망 Windows 업무 PC에서 일을 블록으로 가공해 시간표에 싣고 차례로 끝내는 평면 블록 업무 화면
colors:
  text: "#1b1e23"
  text-muted: "#5b6270"
  canvas: "#f7f8fa"
  surface: "#fff"
  panel: "#fff"
  border: "#d9dce1"
  divider: "#e4e6ea"
  structure: "#1b1e23"
  control: "#fff"
  control-border: "#d9dce1"
  control-hover: "#f0f3fa"
  input: "#fff"
  input-border: "#898f98"
  action: "#2b55d6"
  action-hover: "#2145b7"
  on-action: "#fff"
  selection: "#f4f7fe"
  selection-border: "#2b55d6"
  text-selection: "#e3eafb"
  block: "#e3eafb"
  block-completed: "#f7f8fa"
  now: "#ac351d"
  error: "#ac351d"
  error-surface: "#fbf3ef"
  warning-surface: "#fff2e7"
  overdue: "#b4451f"
  overdue-surface: "#fbf3ef"
  overdue-border: "#f0c9b8"
  unavailable: "#e6e8ec"
  unavailable-soft: "#f1f2f4"
  scrollbar: "#b5bbc7"
  backdrop: "#1b24334d"
typography:
  capture:
    fontFamily: '"Segoe UI", "Malgun Gothic", sans-serif'
    fontSize: "24px"
    fontWeight: 400
  composer:
    fontFamily: '"Segoe UI", "Malgun Gothic", sans-serif'
    fontSize: "20px"
    fontWeight: 400
  headline:
    fontFamily: '"Segoe UI", "Malgun Gothic", sans-serif'
    fontSize: "20px"
    fontWeight: 600
    letterSpacing: "-.01em"
  title:
    fontFamily: '"Segoe UI", "Malgun Gothic", sans-serif'
    fontSize: "16px"
    fontWeight: 600
  body:
    fontFamily: '"Segoe UI", "Malgun Gothic", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  prose:
    fontFamily: '"Segoe UI", "Malgun Gothic", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.7
  summary:
    fontFamily: '"Segoe UI", "Malgun Gothic", sans-serif'
    fontSize: "13px"
    fontWeight: 500
  label:
    fontFamily: '"Segoe UI", "Malgun Gothic", sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
  micro:
    fontFamily: '"Segoe UI", "Malgun Gothic", sans-serif'
    fontSize: "11px"
    fontWeight: 400
rounded:
  indicator: "2px"
  control: "6px"
  block: "6px"
  panel: "10px"
  dialog: "12px"
  chip: "18px"
  capture: "18px"
spacing:
  hairline: "2px"
  tight: "4px"
  small: "6px"
  related: "8px"
  row: "10px"
  control: "12px"
  section: "16px"
  panel: "20px"
  frame: "24px"
  empty: "48px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-secondary:
    backgroundColor: "{colors.control}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
    height: "34px"
  button-secondary-hover:
    backgroundColor: "{colors.control-hover}"
  button-icon:
    backgroundColor: "{colors.control}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    width: "34px"
    height: "34px"
  input:
    backgroundColor: "{colors.input}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "9px 11px"
  period-selected:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    height: "28px"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
  time-block:
    backgroundColor: "{colors.block}"
    textColor: "{colors.text}"
    typography: "{typography.summary}"
    rounded: "{rounded.block}"
  time-block-next:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.block}"
  time-block-completed:
    backgroundColor: "{colors.block-completed}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.block}"
  day-selected:
    backgroundColor: "{colors.selection}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
  capture-input:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.capture}"
---

# Design System: BLOKKY

## Overview

**Creative North Star: "평면 블록, 물리적 움직임"**

BLOKKY의 모든 것은 시간 블록이라는 하나의 사물에서 시작한다. 블록·칩·패널은 단색 면과 1px 선뿐인 평면이고, 두께·광택·그라데이션·글자 그림자로 입체를 흉내 내지 않는다. 물리감은 움직임이 맡는다. 블록은 손에 들리면 그림자로 떠오르고, 이웃은 160ms 안에 비켜 주며, 레일에 밀어 넣으면 걸쇠가 착 물린다. 시간축에서 블록의 높이는 곧 소요시간이고, 블록은 놓일 곳의 형태(주 열, 2주 줄, 월 막대)를 따라 모양을 바꾼다.

화면은 분리망 업무 PC의 차분한 Windows 업무 화면이다. 위 막대 아래 **작업 화면**은 왼쪽 준비 도크(일을 블록으로 가공하는 작업대)와 오른쪽 캘린더(블록을 날짜에 배분하는 시간표)로 이루어지고, **몰입 화면**은 오늘 하루의 시간표와 ‘다음’ 블록만 남긴다. 기본 테마는 파랑 하나와 회색 바탕이며, 사용자는 종이 플래너(G1)·톤 레이어(G3)·사무 장부(G4)를 고를 수 있다. 테마는 역할 토큰의 값만 바꾸고 화면 구조와 블록의 기하는 바꾸지 않는다.

조작은 설명 문구가 아니라 형태가 말한다. 손잡이·레일 홈·천장·눈금·입력 위치가 할 수 있는 일을 보여 주고, 화면에는 이름·상태·오류와 복구만 글로 남는다. 시간이 흘러도 화면은 아무것도 재촉하지 않는다. 현재선은 얇은 회색 선일 뿐이고 지연·남은 시간·초과를 그리지 않는다.

실행 시 디자인 값의 기준은 `src/tokens.css`다. 위 YAML은 기본 테마 값의 기록이며, 선택 테마의 값은 tokens.css가 우선한다. 함께 두는 `.impeccable/design.json`의 8단계 색상 램프는 미리보기용으로 합성한 것이라 앱의 색 단계가 아니고, 컴포넌트 예시는 외형과 CSS 상태만 재현한다. 한 화면 구조(위 막대·준비 도크·몰입)는 브랜치 `exp/one-screen`에서 만들어 2026-10-13 채택했다(근거는 `docs/decisions.md`).

**Key Characteristics:**

- 단색 면과 1px 선의 평면 객체, 그림자는 들린 블록과 대화상자에만.
- 시간축에서 높이 = 소요시간(몰입·준비 1.2px/분 기준, 1시간 72px).
- 파랑 하나가 다음 블록·주 동작·선택을 맡고, 나머지는 회색 위계.
- 근무 외·휴식·넘침은 색이 아니라 무늬(점·사선·점선)와 글자로 함께 구별.
- 160ms 감속 전환, 지연 없이 손을 따르는 블록, 동작 줄이기에서는 즉시 전환.

## Colors

회색 바탕 위에 파랑 하나가 ‘지금 할 일과 고른 것’을 표시하고, 미완료·근무 외만 적갈색 계열로 따로 말한다.

### Primary

- **업무 파랑 (`action`)**: 다음 블록 면, 주 동작 버튼(몰입·저장·완료), 고른 기간, 선택 날짜의 선, 키보드 포커스와 캐럿. 화면당 넓은 면으로는 ‘다음’ 블록과 주 동작 하나만 쓴다. 호버는 `action-hover`.
- **옅은 파랑 블록 (`block`)**: 유동 블록과 준비 블록의 면. 테두리는 동작색을 섞어 만든다.

### Neutral

- **먹색 (`text`, `structure`)**: 본문과 구조선. 선반 천장, 근무 종료선, 고정 블록의 걸쇠판이 `structure`를 쓴다.
- **회색 보조 글자 (`text-muted`)**: 시간·길이·개수·영역 이름·배분 수치. 네 테마 모두 표면 위 4.5:1 이상이다.
- **바탕과 표면 (`canvas`, `surface`, `panel`)**: 앱 바탕은 canvas, 막대·대화상자·카드는 surface, 영역 판은 panel(G3에서만 surface와 다르다).
- **선 (`border`, `divider`, `control-border`)**: 패널 외곽, 격자와 행 구분, 버튼 외곽. G3는 border·control-border가 투명한 무테 체계다.
- **입력 경계 (`input-border`)**: 입력란 테두리용 3:1 값. 현재는 편집기 제목의 포커스에만 쓰고, 모든 입력란 적용은 결정 대기다.
- **상태 바탕 (`control-hover`, `selection`, `text-selection`)**: 호버, 선택 날짜·선택 결과, 텍스트 선택.
- **완료 (`block-completed`)**: 완료 블록과 칩. 회색 면에 취소선을 함께 쓴다.

### Semantic

- **적갈 미완료 (`overdue`, `overdue-surface`, `overdue-border`)**: 지난 미완료의 원래 날짜, 근무 외 수치(보조색과 70% 섞음), 넘친 부분의 사선과 점선.
- **오류·현재 (`error`, `now`, `error-surface`, `warning-surface`)**: 저장 오류와 현재선은 같은 값이어도 별개 역할이다. 설정 충돌은 warning-surface.
- **금지 시간 (`unavailable`, `unavailable-soft`)**: 휴식 사선과 근무 외 점무늬의 재료. 무늬는 text-muted에서 따로 만들어 두 값이 같은 G3에서도 보인다.
- **배분 막대**: 날짜 머리·선택 날짜·몰입이 같은 막대를 쓴다. 빈 몫은 text-muted 16%를 surface에 섞은 값, 완료·유동·고정 몫은 그 위에 1px 간격으로 놓이고 가용을 넘친 몫만 사선이다.

**The One Blue Rule.** 넓은 파랑 면은 ‘다음’ 블록과 화면의 주 동작 하나뿐이다. 위 막대에서 action 색 버튼은 ‘몰입’ 하나다.

**The Color-Plus-Form Rule.** 선택·완료·고정·근무 외·오류는 색만으로 구별하지 않는다. 글자(‘다음’, ‘근무 외 2h’), 무늬(점·사선), 형태(걸쇠, 취소선, 점선)를 함께 쓴다.

**The Role Token Rule.** 컴포넌트는 역할 토큰과 그 `color-mix`만 쓰고 테마를 선택자로 고르지 않는다. 테마별 차이는 tokens.css의 값으로만 만든다.

| 테마 | 시각 체계 |
|---|---|
| 기본 | 파랑 #2b55d6·회색, Segoe UI/맑은 고딕, 얇은 패널 경계 |
| G1 · 종이 플래너 | #f4efe6 종이, #fbf8f2 표면, #244c9e 잉크. 고운바탕 제목·고운돋움 본문, 정시 실선·반시 점선 |
| G3 · 톤 레이어 | #f3f2ef 바탕·#ecebe7 패널·흰 표면, #3f6f5e 세이지. IBM Plex Sans KR, 무테 면·둥근 블록·호버 그림자 |
| G4 · 사무 장부 | 흑백과 #c8102e 현재·미완료. Noto Sans KR, 2px 제목 괘선, 직각 블록, 검정 선택·동작 |

## Typography

**Body Font:** Segoe UI (with Malgun Gothic, sans-serif)
**Display Font:** 기본은 본문과 같다. G1은 고운바탕, G3는 IBM Plex Sans KR, G4는 Noto Sans KR.

**Character:** Windows 업무 화면의 중립적인 산세리프가 업무 제목과 작은 시간 표기를 같은 밀도로 읽힌다. 개성은 글꼴이 아니라 블록과 움직임에 있다.

### Hierarchy

- **Capture** (400, 24px): 빠른 캡처 창의 두 줄 입력만.
- **Composer / Headline** (400·600, 20px, -.01em): 새 블록 제목 입력, 위 막대의 기간 제목과 상세 제목.
- **Title** (600, 16px): 패널·영역 제목, 준비 담기 입력.
- **Body** (400, 14px, 1.5): 업무 제목(블록 안에서는 500), 버튼, 입력. 메모는 prose(1.7).
- **Summary** (500, 13px): 블록 안 제목, 요약 줄, 상태줄.
- **Label** (400, 12px, 1.6): 시간·길이·배분 수치·날짜 보조 표기·알약.
- **Micro** (400, 11px): 얇은 블록의 제목과 길이, 키캡, 선반 눈금.

**The 11px Floor Rule.** 11px보다 작은 글자는 쓰지 않는다. 얇은 블록은 글자를 줄이는 대신 체크를 숨기고 제목과 길이만 남긴다.

**The Tabular Time Rule.** 시각·길이·배분 수치는 tabular-nums다. 길이는 ‘1시간 30분’, 배분은 ‘7.75 / 8h’ 형식이다. 날짜 입력은 OS 입력을 쓰고 근무 시각은 HH:MM 표기와 시작·종료 조절로 드러낸다.

외부 글꼴 요청은 없다. 고운바탕 Bold, 고운돋움 Regular, IBM Plex Sans KR Regular/Medium/SemiBold, Noto Sans KR variable을 전체 문자 범위 WOFF2로 번들하고 OFL은 `public/fonts/<family>/OFL.txt`에 둔다.

## Layout

**앱 셸.** 위 막대와 그 아래 화면 하나다. 위 막대는 14px 위 여백, 왼쪽 36px 로고 버튼(누르면 실제 오늘) 바로 옆에 화면 전환(작업 화면에서는 primary ‘몰입’, 몰입·설정에서는 ‘작업 화면’)을 두어 눈이 처음 닿는 자리에 오게 하고, 이어서 이전·다음·오늘, 기간 제목, 기간 선택(일·주·2주·월)을, 오른쪽 한 묶음에 검색(Ctrl K 표기)·?·톱니를 둔다. 900px 초과에서 막대는 sticky로 한 줄을 지키고 길어진 제목만 말줄임으로 줄인다. 상태줄은 로딩·저장 중(0.4초 넘을 때만)·오류·이어서 편집이 필요할 때만 화면 아래에 드러난다. 문서와 독립 스크롤 영역은 `scrollbar-gutter: stable`로 폭이 흔들리지 않는다. 막대는 banner, 화면은 main, 상태줄은 그 밖의 형제다.

**작업 화면.** 왼쪽 준비 도크와 오른쪽 캘린더다. 도크는 좁게 300px·넓게 640px·접힘 48px 세 폭이며 사용자의 접기·넓히기 버튼과 `[`·`]`로만 바뀌고 기기에 기억된다. 도크는 위 막대 아래 62px에 sticky로 붙어 자체 스크롤하고, 자연 위치와 sticky 위치가 같아 폭을 바꿔도 뛰지 않는다. 폭 전환은 220ms이며 동작 줄이기에서는 즉시 바뀐다. 넓은 도크에서 도마가 열리면 캘린더는 0.35 불투명도로 흐려지고 조작을 받지 않는다.

**캘린더.** 일은 7일 날짜 머리 띠와 넓은 하루 블록 공간, 기본 기간인 주는 시간축 46px와 일곱 열(`minmax(118px,1fr)`)이 눈금을 공유하는 시간 격자다. 주 날짜 머리는 스크롤해도 위에 남고 일곱 머리가 늘 같은 높이다. 2주·월은 기간 달력과 선택 날짜 시간표의 두 열이며 분할선으로 폭을 정한다(각 최소 280px). 2주 칸은 제목 두 줄까지, 월 칸은 건수·배치시간·점유 막대를 보인다. 칸은 자기 폭에 맞춰 낱말을 쪼개지 않는다: 내용 폭 58px 이하에서 제목은 한 줄 말줄임, 배치시간은 ‘3.5h’, 근무 외 글자는 막대의 사선과 날짜 패널에 맡긴다. 38px 이하에서 ‘오늘’ 알약은 날짜 밑줄이 되고, 30px 이하에서 제목은 글자 없는 블록, 월 칸은 막대만 남는다(전체 내용은 접근성 이름에 있다). 달력과 날짜 패널 두 열은 저장된 비율과 무관하게 늘 줄을 채운다. 2주의 시작 주는 날짜 선택과 따로 유지한다. 계획 막대에는 주 요약(선택 주의 근무 가능 시간과 근무일 수를 목표와 비교)만 있다.

**몰입 화면.** 배분 막대 한 줄 아래에 하루 시간표 열과 실행 흐름 열 두 개를 분할선으로 나눈다(각 최소 280px). 실행 흐름은 ‘다음’ 카드 또는 옆 편집 패널, 남은 블록 대기열, 준비 칸 순서의 단일 스크롤이며, 남은 블록이 없으면 준비 칸이 맨 위로 온다. 두 열은 창의 남은 높이 안에서 각자 스크롤하고 완료 칸은 시간표 위에 남는다.

**시간축.** 근무 시작·종료 전후 30분은 선형으로 펼치고 바깥 00:00–24:00는 `60 × log1p(거리/60) × 배율`로 압축한다. 활성 근무일이 없으면 중심은 08:30–18:30이다. 중심 배율은 몰입 1.2px/분, 주·설정 1.1px/분, 선택 날짜 1–1.2px/분이고 준비 도크는 1시간 72px다. 포인터·미리보기·블록·현재선은 같은 변환을 공유하며, 끌기가 바깥 구간에 닿으면 그 구간을 펼치고 포인터 아래 시각을 유지한다.

**설정.** 근무 규칙과 운영 두 열(1.7fr/1fr), 요일별 근무·휴식 평행 밴드, 저장 막대는 편집 영역 아래.

**Breakpoints.**
- 1180px 이하: 검색 버튼은 아이콘만.
- 1100px 이하: 넓은 도크는 min(560px, 52vw)이고 들어옴·선반이 위아래로 놓인다. 도크가 스크롤하면 선반은 따로 스크롤하지 않는다.
- 960px 이하: 몰입은 두 열과 옆 편집 패널을 유지하고(760px까지), 실행 흐름이 따로 스크롤한다.
- 900px 이하: 위 막대는 sticky를 풀고 묶음 단위로 오른쪽 정렬 줄바꿈한다. 도크의 sticky 위치는 12px.
- 760px 이하: 도크는 캘린더 위 전체 폭, 몰입은 한 열(시간표 70dvh 뒤에 실행 흐름), 편집기는 가운데 대화상자, 위 막대와 날짜 머리의 조작은 44px 높이.
- 680px 이하: 설정 한 열.

**The Same Height Rule.** 같은 줄에 선 날짜 머리들은 무엇이 붙거나 빠져도 높이가 같다. 든 블록 아래 시간축이 손 밑에서 밀리면 안 된다.

## Elevation & Depth

평면이 기본이다. 패널·카드·블록은 바탕 톤과 1px 선으로만 구분하고, 그림자는 무언가가 실제로 떠 있을 때만 생긴다. 들린 블록, 열린 대화상자와 메뉴, 빠른 캡처 창이 그 경우다.

### Shadow Vocabulary

- **들림** (`--sp-lift`: `0 14px 28px` 18% + `0 4px 8px` 12%, 모두 `text` 색 섞음): 손에 든 블록, 날아가는 블록 사본, 시간표 위 컴포저.
- **대화상자** (`--shadow-dialog`: `0 16px 64px #16224430`, G4는 없음): 편집 대화상자, 도마, 메뉴, 검색 패널, 날짜 팝업, 선택 막대.
- **호버** (`--shadow-hover`: 기본·G1·G4는 없음, G3 `0 1px 2px`): 준비 카드의 1px 떠오름과 함께.
- **캡처** (`--shadow-capture`: 헤어라인 외곽 + 짧은 접지 + 넓은 확산, G4는 구조색 1px 외곽): 빠른 캡처 창만.
- **배경막** (`--color-backdrop`): 가운데 대화상자. 블록 옆 대화상자는 35%로 옅게 덮어 블록과 하루가 읽힌다.

**The Flat Surface Rule.** 일반 패널과 카드에 대화상자 그림자를 쓰지 않는다.

**The Lift Rule.** 블록의 그림자는 들려 있는 동안만 있다. 놓이면 그림자와 함께 평면으로 돌아가고, 반동·찌그러짐을 남기지 않는다.

빠른 캡처 창만 재질을 가진다. 테마 표면색 알파 .97→.92 세로 그라데이션, 상단 1px 내부 하이라이트, 액션 바의 바탕색 혼합이다. Windows 바탕화면 블러는 쓰지 않고, 투명도 감소·강제 색 모드에서는 불투명 표면으로 바뀐다.

## Shapes

컨트롤은 control(6px), 블록은 block(6px), 패널은 panel(10px), 대화상자는 dialog(12px) 반경을 쓰고, 테마가 이 값을 바꾼다(G1 4/2/6/6, G3 10/10/14/14, G4 2/0/2/2). 블록·칩·태그·걸쇠·손잡이의 1–9px 반경과 999px 알약은 형상 고정값이다. 테마의 직각성을 따라야 하는 작은 부품은 `min(고정값, 테마 반경)`으로 쓴다.

선은 대부분 1px이다. 선택은 2px 선택 외곽선, 공통 키보드 포커스는 2px 바깥 윤곽과 3px 간격이며 잘리는 자리(얇은 블록, 날짜 머리 버튼, 손잡이)에서는 안쪽 윤곽으로 그린다. 키캡은 앱 전체에서 같은 모양(`--radius-control`에서 2px 뺀 반경, 아래 2px 선)이다.

무늬는 의미다. 근무 외 시간은 점무늬, 휴식은 사선과 시작·종료 경계, 근무 외로 넘친 블록 부분은 overdue 사선과 1.5px 점선 테두리다. 무늬 위에도 체크·제목·길이·걸쇠는 그대로 읽히고, 무늬는 포인터를 가로채지 않는다.

로고는 파란 둥근 정사각형 안에 길이가 다른 흰 시간 블록 셋을 놓은 기하학적 마크다. `public/logo.svg`와 앱 아이콘을 같게 두며, 앱 안의 로고는 테마 동작색을 따르고 설치 아이콘은 기본 파랑이다.

## Components

### Buttons

- **Shape:** control 반경(6px), 최소 높이 34px(760px 이하 위 막대 44px).
- **Primary:** action 면과 on-action 글자. 몰입·저장·‘다음’ 카드의 완료처럼 화면의 주 동작에만.
- **Secondary:** control 면과 control-border 1px. 호버는 control-hover, 누르면 0.96 축소.
- **Text:** 테두리·면 없이 link 색(‘준비로’, ‘보관 목록 비우기’). **Danger:** 글자만 error.
- **Icon:** 34px 정사각형. 이전·다음·닫기·검색·?·톱니, 도크의 접기·넓히기(30px 투명).
- **Hover / Focus:** 배경·테두리는 100ms ease-out, 포커스는 공통 2px 윤곽. 비활성은 불투명도 .55.

### Inputs / Fields

- **Style:** input 면, control 반경, 9px 11px 안쪽 여백. 체크박스 17px, 동작색 강조.
- **Composer:** 시간표 빈 곳을 누르거나 끌면 그 자리에 뜨는 20px 제목 입력과 아래 경계선, ‘고정’ 선택.
- **Capture:** 24px 두 줄, 경계 없음, 동작색 캐럿. 별도 윤곽은 숨기고 저장 버튼의 포커스는 남긴다.
- **Focus:** 공통 포커스 윤곽. 담기 입력처럼 감싸는 칸은 `:focus-within`으로 칸 전체에 그린다.
- **Error:** 같은 폼 안에 구체적인 문구. 한글 조합 중의 Enter는 명령으로 실행하지 않는다.

### Navigation

- **위 막대:** 레일과 탭은 없다. 로고·날짜 이동·기간 제목·기간 선택·도구 묶음. 설정에서는 날짜 이동을 숨기고 ‘작업 화면’으로 돌아온다.
- **기간 선택:** 맞붙은 세그먼트, 고른 것만 action으로 채운다. 하나의 탭 정지에서 화살표로 고른다.
- **단축키:** D·W·2·M 기간, T 오늘, `[`·`]` 도크, F 몰입, Esc 돌아가기, A 담기, ? 목록. 목록은 모달 대화상자이며 맨 아래 ‘한 글자 단축키’ 스위치로 끈다. 키가 화면을 바꿔도 포커스는 같은 블록이나 바뀐 조작에 남는다.
- **검색:** 화면 위쪽 가운데의 입력과 결과 목록만 있는 패널. 고른 결과는 selection 면과 1px 선택 선, 결과는 날짜면 작업 화면 일 보기로, 날짜가 없으면 넓은 도크로 가서 그 블록에 링을 그린다.

### Cards / Containers

- **Corner Style:** panel 반경(10px).
- **Background:** panel 또는 surface, 바탕은 canvas.
- **Shadow Strategy:** 없음(The Flat Surface Rule).
- **Border:** border 1px. G3는 무테 면.
- **Internal Padding:** panel(20px), 캘린더·도크 판은 section(16px).
- 빈 상태는 실제 입력이나 행동 컨트롤만 보이고 ‘0건’이나 안내 문장을 두지 않는다.

### Time Block (signature)

평면 블록과 그 움직임이 이 체계의 중심이다.

| 블록 | 표현 |
|---|---|
| 유동 | block 면, 동작색을 섞은 테두리. 시각은 숨기고 호버·포커스 때 ‘예상 HH:MM–HH:MM’ |
| 다음 | action 면과 ‘다음’ 태그. 색만으로 구분하지 않는다 |
| 고정 | 연한 회색 평면과 왼쪽 structure 걸쇠판(자물쇠). 시각을 늘 표시 |
| 근무 외 유동 | 유동과 같은 면, 넘친 부분만 overdue 사선·1.5px 점선. 이름에 ‘근무 외’ |
| 완료 | block-completed 면과 취소선. 고정·완료는 제자리에 남는다 |
| 여러 선택 | 2px 선택 외곽선, 이름에 ‘선택됨’ |
| 얇은 블록 | 22px 미만은 체크 없이 11px 제목과 길이만 한 줄 |

**하루 = 블록 공간.** 왼쪽부터 시간 눈금, 고정 레일, 본문이다. 고정 블록은 레일에 걸쇠판으로 걸리고, 유동 블록은 레일 홈의 러너(일 8×12px, 주 6×9px)로 얹힌 채 순서대로 쌓인다. 위에는 완료 칸(투입구 아래 검은 띠), 아래에는 근무 종료선이 있다. 셔터는 근무 시작부터 마지막 배치 기준 시각까지 내려온 줄무늬이고, 그 끝의 천장판에 첫 유동 블록이 매달린다. 천장은 현재선이 아니라 기준 시각이다. 블록 위치는 `top`으로 둔다(dnd-kit은 transform을 무시하고 잰다).

| 장면 | 움직임 |
|---|---|
| 재배치·크기 변경 | 주변 블록의 top·height는 160ms 감속(`cubic-bezier(.16,1,.3,1)`). 손잡이로 조절하는 블록은 15분 스냅 결과를 즉시 |
| 들어 올림·들고 다님 | 들림 그림자, 원래 자리는 점선 빈칸. 잡은 지점을 포인터에 유지하고 지연·기울기 없이 바로 따라온다 |
| 비켜 줌·미리보기 | 이웃은 160ms 안에 비켜 주고, 배치 예정 빈칸과 예상 시각은 즉시 보인다 |
| 레일 맞물림 | 레일 쪽으로 일 24px·주 12px 밀면 15분 눈금에 붙고 걸쇠가 0.09초에 튀어나와 튕김 없이 물린다. 일 20px·주 10px 떼면 풀린다. 최근 상하 움직임만큼 두 거리가 최대 3배로 늘어 옆으로 흘러도 붙거나 떨어지지 않는다 |
| 레일 신호 | 든 동안 모든 레일 홈은 파랑을 옅게 섞고, 맞물린 날의 레일만 파랗게 켜진다 |
| 형태 맞춤 | 영역이 목표 상자(전체·좁음·줄·막대)를 정하고 든 블록은 그 상자로 width·height를 150ms(`cubic-bezier(.2,.8,.2,1)`, 높이는 1/4 늦게) 바꾼다. 지나가는 영역은 형태를 바꾸지 않는다: 손이 그 영역에서 70ms 넘게 3px/프레임(약 190px/s)보다 느려지거나 260ms 머물러야 바뀌고, 그 전에는 직전 형태·미리보기·강조를 유지한다(놓으면 그 자리로 간다). transform scale로 글자를 늘이지 않는다 |
| 내려놓음 | 140ms 감속으로 자리에 들어간다. 오버슈트·찌그러짐 없음. 불가하면 붉은 테두리·이유·짧은 흔들림 |
| 완료 | 0.1초 움츠림 → 저장 뒤 0.3초 위로 늘어나며 투입구로 빨려 들어감 → 셔터가 기준 시각까지 내려옴 |
| 동작 줄이기 | 모두 즉시 전환. 빈칸·걸쇠·셔터의 정지 상태로 같은 의미를 읽는다 |

### 준비 도크

- **좁은 도크:** 담기 입력과 선반 → 들어옴 → 지난 미완료 목록. 제목의 개수는 접힌 도크의 개수와 같은 하나(들어옴 + 선반 + 지난 미완료)다.
- **넓은 도크(작업대):** 담기, 들어옴, 선반, 방금 완료, 날짜 없는 완료, 휴지통, 선택 막대, 도마. 4px 안쪽 여백으로 포커스 윤곽을 지킨다.
- **판:** 두께 없는 34px 면, 점선 테두리, 아래 가운데 24×6px 당김 손잡이. 당기는 동안 15분 단위로 두꺼워지고 길이와 눈금을 보인다.
- **들어옴:** 회색 우물 위에 판과 블록을 4–8px 간격으로 쌓는다.
- **선반:** 검은 천장(3px structure, 가리키면 6px)에 블록을 2px 간격으로 매달고 왼쪽 30px에 1h 눈금을 둔다. 천장을 누르면 전체 선택·운반. 760px 이하에서 눈금은 담긴 블록보다 한 시간까지만.
- **지난 미완료:** 길이 앞에 원래 날짜를 overdue 색으로.
- **굵은 포인터:** 도크 조작 44px 누름 영역, 카드 삭제는 늘 보인다.

### 기다림 띠

- **띠:** 작업 화면 오른쪽, 도크처럼 위 막대 아래에 붙는다. 펼침 208px(안쪽 12px), 접힘 40px 버튼(개수, 충족 수는 버튼 왼쪽 바깥으로 나온 navy 배지). 바탕은 `wait-band`, 끌어 오면 `wait-band-hot`과 선택 테두리.
- **블록:** 30px 꼬리표(사람·달력 아이콘, 트리거, ‘M/D부터’ 또는 개수, 18px 네모 손잡이) 위에 1px 간격으로 32px 종이 몸통. 기다림은 조용하다: 꼬리표 `wait-tag`(회색)·글 `wait-tag-text`·몸통 `wait-body`. 충족된 날짜만 꼬리표 `wait-ready`(navy)·몸통 블록색으로 3px 떨어지고 22px 왼쪽으로 띠 밖에 나온다. 기다리는 것은 캘린더보다 크게 말하지 않는다.
- **충족:** 꼬리표가 오른쪽으로 26px 밀리며 140ms 사라진 뒤 블록이 비행으로 준비에 간다. 둥근 체크는 블록 완료에만, 네모 손잡이는 트리거 충족에만 쓴다.
- **묶음:** 앞 블록 아래 최대 두 겹이 6px씩 내려가며 ×0.95씩 작아지고 깊이마다 어두워진다. 쉬는 묶음은 줄 안에, 들린 묶음은 그 자리에 정확히 겹친 위층으로 옮겨 같은 블록들이 스프링으로 움직인다(멈춤 → 벌어짐 → 목록의 한 길). 마우스 140ms 머물면 10px로 벌어지고, 누르면 38px 줄의 목록으로 떨어지며 받침(`wait-tray`)이 묶음 윤곽에서 자라 유일한 그림자를 진다. 화면 아래에 걸리면 묶음 전체가 들려 받침이 들어간다. 펼침 ω13.5·ζ0.84와 블록 12ms 시차, 벌어짐 ω18·ζ0.9, 접힘 ω17·ζ0.95(넘침 없음). 모션 감소에서는 바로 놓인다.
- **트리거 입력:** 2px 포커스 테두리 카드에 제목, 입력(콤보박스), 고를 거리 목록. 띠 밖에서는 236px로 떠 있다.
- **이름 바꾸기:** 되살아난 블록 위에 포커스색 3px 테두리의 입력을 겹친다. 블록이 화면에 없으면 도크 위에 둔다.
- **되돌리기:** 화면 아래 가운데 40px 어두운 알림과 ‘되돌리기’. 6초 뒤 사라진다.
- **끌기:** 띠로 향하는 블록은 위 8px 꼬리표 선이 있는 종이 토큰이 되고 시간 표시를 감춘다.
- **테마:** 띠는 panel 반경과 패널 경계 두께(G3 무테), 블록은 block 반경(G1 2px, G3 10px, G4 직각), 입력·알림은 control·panel 반경을 따른다. G1·G3·G4의 몸통은 테마 표면에서 섞고, 블록 가장자리는 준비의 블록처럼 `border` 색 윤곽이다(높이를 바꾸지 않게 outline, 기본 테마는 없음). 충족 글자·겹 그늘·들림 그림자는 테마의 잉크를 쓴다.

### 날짜 머리

날짜 버튼(요일·날짜·‘오늘’ 알약) 아래에 배분 막대와 ‘7.75 / 8h’, 근무 외로 넘쳤으면 ‘근무 외 2h’, 오늘이면 ‘끝 HH:MM’이 한 줄씩 놓인다. 넘친 날의 ‘준비로’ 텍스트 버튼은 배분 막대 끝 자리를 차지하고 막대가 그만큼 짧아진다(머리 높이 불변). 지난 날짜는 보조색을 옅게 섞은 바탕과 불투명도 .65로 조용히 두되 블록은 그대로 받는다. 주 보기의 완료 칸은 그 주에 완료가 없으면 8px 얇은 우물이고, 생기면 일곱 열이 함께 44px로 펼쳐진다.

### 편집기

- **패널:** 몰입의 실행 흐름 맨 위. 제목과 메모를 먼저, 일정(길이·날짜·시각)은 접힌 영역, 체크리스트도 기본 접힘.
- **대화상자:** 510px, 최대 95vh, 위 제목·닫기와 아래 행동·오류는 고정하고 가운데만 스크롤. 작업 화면에서는 연 블록 **옆**에 놓이고(오른쪽, 자리가 없으면 왼쪽, 좁으면 420px까지 줄임) 메뉴와 같은 1px 테두리를 갖는다. 창 크기가 바뀌면 다시 놓이고, 760px 이하나 상태줄의 ‘이어서 편집’에서는 가운데다.
- **닫기:** 변경이 있으면 저장 / 초안 유지 / 버리기를 인라인으로 고른다. 옆 대화상자 밖을 누르면 Esc와 같다. 닫힌 뒤 포커스는 연 블록으로 돌아온다.
- **길이:** 15·30·60·90·120분 버튼과 직접 입력, 8칸 눈금은 보조 표시.

### ‘다음’ 카드

몰입의 시계와 무관한 첫 유동 블록이다. 제목, ‘예상 HH:MM–HH:MM · 길이’, 메모 일부, 그리고 완료(primary)·+15분·나중에(선반 맨 위). 완료하거나 미루면 포커스는 새 ‘다음’의 완료로 간다. 남은 블록이 없으면 배분 막대 옆에 ‘오늘 끝 · 완료 N’ 알약을 둔다. 남은 시간·초과 표시는 없다.

### 도마 (나누기)

넓은 도크에서는 바로 열리고(나머지는 흐림), 그 밖에서는 대화상자다. 블록을 15분 단위 솔기로 조각내며 솔기는 도마에서만 보인다. 닫기(‘N개로 나누기’·Esc)는 확정, ‘취소’는 버림이다.

### 메뉴와 팝업

블록 우클릭(또는 Shift+F10) 메뉴는 시각 고정…·고정 해제·나누기·준비로 보내기·완료·삭제를, 준비 카드의 메뉴는 선반으로·오늘에 싣기·나누기·완료·삭제를 제공한다. 메뉴는 화면 이름이 아니라 카드에서 열렸는지로 고르고, 페이지가 스크롤되면 닫힌다. 근무시간 팝업은 근무·휴식 선택 아래 시작·종료 시각 두 열이다. 메뉴·팝업은 대화상자 그림자와 border 1px를 쓴다.

### 설정

근무 규칙은 요일 켜기/끄기와 근무·휴식 평행 밴드다. 클릭은 선택만 하고 세로 10px 이상 움직여야 그리기·이동·경계 조절이 시작된다. 그림판 전체가 하나의 탭 정지이고 화살표·Home·End로 걷는다. 정기 업무는 근무시간 영역 아래 구분선·목록·입력 폼(제목, 요일 체크박스, 시작 시각과 소요시간 두 열, 메모, 추가/저장)이다. 테마는 2×2 미리보기 라디오(이름은 접근성 이름만, 미리보기는 위 막대 띠와 블록)이고 즉시 적용되며 이 기기의 WebView localStorage `blokky.appearance.theme`에 둔다. 백업·복원은 기본 접힌 영역이며 현재 데이터 교체를 인라인으로 확인한다.

### 빠른 캡처 창

가운데 열리는 620×176 프레임 없는 native 창. 투명 여백(위 12·좌우 14·아래 20px) 안에 capture 반경의 패널 하나, 위는 30px 로고 타일과 24px 두 줄 입력, 헤어라인 아래 액션 바(상태·오류, 조용한 ‘닫기’, action ‘저장’). Enter 저장, Shift+Enter 줄바꿈, Esc는 초안을 남기고 숨김.

## Do's and Don'ts

### Do:

- **Do** 블록을 단색 면과 1px 선으로 그리고, 물리감은 160ms 감속과 들림 그림자 같은 움직임으로 낸다.
- **Do** 시간축에서 블록 높이를 소요시간에 맞추고(1.2px/분, 준비 72px/시간), 길이는 15분 단위로 스냅한다.
- **Do** 선택·완료·고정·근무 외·오류를 색과 글자·무늬·형태로 함께 구별한다.
- **Do** 역할 토큰과 `color-mix`만 쓰고 네 테마에서 본문 4.5:1, 조작 단서 3:1을 확인한다.
- **Do** 모든 동작을 키보드로 끝낼 수 있게 하고, 요소가 사라져도 포커스를 가까운 같은 자리로 옮긴다.
- **Do** 날짜 없는 일을 ‘준비’로, 그 안을 들어옴·선반으로 표기한다.

### Don't:

- **Don't** 그라데이션·광택·두께·글자 그림자로 블록이나 패널을 입체로 꾸미지 않는다(빠른 캡처 창의 재질만 예외).
- **Don't** 클릭·끌기·저장·닫기를 풀이하는 상시 안내 문구, 테마 소개, 빈 목록의 ‘0건’을 두지 않는다.
- **Don't** 시계 기준의 지연·남은 시간·초과·카운트다운을 그리지 않는다. 현재선은 아무것도 바꾸지 않는다.
- **Don't** 도크 폭이나 블록 길이를 사용자의 명시적 조작 없이 바꾸지 않는다.
- **Don't** 일반 패널에 대화상자 그림자를 쓰거나, 놓인 블록에 반동·찌그러짐을 남기지 않는다.
- **Don't** transform scale로 블록 글자를 늘이거나, 테마 선택자로 컴포넌트를 복제하지 않는다.
- **Don't** 없앤 레일·탭·4주 모드·상단 캡처를 다시 들이지 않는다.
