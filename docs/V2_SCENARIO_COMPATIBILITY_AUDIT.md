# Project IF — 블록 A: 4종 RC2.1 JSON ↔ V2 엔진 호환성 감사

- 기준일: 2026-11-17
- 저장소: `smLee035117/project-if`
- 기준 브랜치: `wip/f1-timeline-integration`
- 확인 커밋: `62b27aca0a221f60297682c5c8d6c405c9110fd1`
- 범위: JSON 4종, `ScenarioV2`/`PlayDataV2`, 로더·검증기, Action/State/Time 엔진, 공개 View, Play Service/Controller, 제품 정책 D-01~D-10
- 작업 범위: **정적 코드·JSON 검사 및 JavaScript로 작성한 제한적 상태 전이 모사**. 실제 NestJS/Redis/MySQL을 이 감사 환경에서 재실행하지 않음. 이용자가 별도로 공유한 전체 Vitest **165/165 통과**는 해당 로컬 실행 사실로만 기록.

## 최종 판단

**스키마 동결 보류.** 4개 JSON은 로더에 등록되어 있고 장면·엔딩 참조, 조건·효과의 상태 필드 경로, 시작 장면의 위치 일치는 정적 검사에서 정상입니다. 그러나 다음 P0 두 가지는 실제 엔딩 도달 가능성을 제한합니다.

1. `timeline.after` 상대 시간 이벤트가 **행동 실행 경로에서 예약되지 않음**.
2. 화재 `initialVariants` X/Y/Z가 **플레이 생성 시 반영되지 않음**(기본 X만 사용).

추가로 종료 후 행동별 리뷰(D-06·D-10)에 필요한 **행동/결과/근거 식별 계약**을 동결 전에 정의할 필요가 있습니다. 이 경우 구현 자체는 후속 블록으로 미룰 수 있어도 데이터 구조 확장 방식은 고려해야 합니다.

## 1. 콘텐츠 구조 현황

| 작품 | 장면 | 행동 | 엔딩 | 시간 이벤트 (절대/상대) | 현재 기본 실행 세계선 |
|---|---:|---:|---:|---:|---|
| 아파트 화재 `apartment_fire_01` | 14 | 28 | 6 | 7 / 1 | X |
| 정전 `blackout_resource_01` | 4 | 16 | 4 | 2 / 0 | 단일 |
| 산악 조난 `lost_hiking_01` | 5 | 15 | 4 | 2 / 1 | 단일 |
| 침수 `basement_flood_01` | 8 | 16 | 3 | 3 / 1 | 단일 |
| **합계** | **31** | **75** | **17** | **14 / 3** | |

정적 검사 결과:
- 4종 모두 초기 장면 ID가 존재하며 그래프상 모든 장면에 연결 경로가 있음. **그래프상 연결은 실제 조건 충족 도달성을 보장하지 않음**.
- 모든 `GOTO` 목적지와 `END` 엔딩 ID가 존재하며 중복으로 참조되지 않는 잘못된 이름을 발견하지 못함.
- 검사한 조건/효과 `path`는 모두 `initialState`에 정의된 상태 필드를 가리킴.
- 모든 장면에 행동과 `location`, 적어도 하나의 `narratives` 항목이 있고 모든 초기 위치는 초기 장면 위치와 일치.
- `action.when`에서 비공개 `world.*` 조건을 직접 사용하지 않음. 각 장면의 서술은 현재 JSON에서는 하나의 무조건(`when: []`) 서술. **복수 조건별 서술의 실제 콘텐츠 동작은 아직 미검증**.
- 행동의 `durationMinutes`가 0인 항목은 발견하지 못함. 무한 반복 가능성 전체를 배제하는 결과는 아님.
- 정전·조난에서 음수 `ADD`는 자원 소모 목적. **음수 ADD 자체는 정상 계약이며 금지할 대상이 아님.** 자원 하한은 별도 불변식 검증이 필요.

## 2. 발견 사항 — 수정 우선순위

### A-01 [P0 / 엔진 연결] 상대 시간 이벤트가 예약·완료 처리되지 않음

**근거**
- `api/src/plays/time-engine-v2.ts`: `scheduleRelativeEventsV2`, `buildScheduledTimeEventsV2`, `completeHandledEventsV2` 구현 존재.
- `api/src/plays/action-engine-v2.ts`: 현재 `executeActionV2`는 `buildScheduledTimeEventsV2(..., playData.timelineProgress)`와 `advanceTimeV2()`만 호출. **`scheduleRelativeEventsV2()`·`completeHandledEventsV2()` 호출이 없고, 반환 `playData.timelineProgress`도 갱신하지 않음**.
- 초기 `timelineProgress = { pending: {}, processed: [] }`이므로 예약 이벤트는 스스로 나타나지 않음.

**영향 받는 이벤트**
- 화재: `F_RESCUE_READY` — `player.refugeReported` 후 6분, `world.rescueReady=true`.
- 조난: `H_SEARCH_ARRIVAL` — `player.called` 후 17분, `world.teamHere=true`.
- 침수: `D_CREW_ARRIVES` — `player.requested` 후 7분, `world.crew=true`.

**구체적인 실패 조건**
- 화재의 Z 세계선을 가정해 피난 공간에서 위치를 신고한 다음 `F_REFUGE_WAIT`를 수행하면, 구조 이벤트가 예약되지 않아 `world.rescueReady=false`인 상태로 남음. 해당 행동의 유일한 `outcome.when`은 `rescueReady=true`이므로 일치하는 결과가 0개가 되고, `selectOutcome()`이 예외를 발생시킴. **현재 기본 X만 시작할 수 있으므로 Z 경로의 문제는 세계선 기능을 도입하면 노출되는 오류**.

**권장 수정**
- 성공 행동 실행 중 `beforeState` → 시간 이벤트 처리·행동 효과 적용 후 `afterState`의 조건 상승을 확인하고, **행동 종료 시각을 기준으로** 상대 이벤트 예약.
- 이미 시간 경계를 넘겨 처리된 이벤트의 ID를 `processed`에 기록하고 예약 목록에서 제거. 절대 이벤트의 일회성 여부도 명시적으로 검증.
- 엔진 결과의 `timelineProgress`를 다음 `PlayDataV2`에 포함하여 기존 Redis CAS로 **상태 + 시각 + 예약 이력**을 함께 갱신.
- 이벤트가 예약 시각을 넘는 동작에서 정확히 1회 발화하는지, 미발화·중복·버전 충돌 시 예약이 뒤섞이지 않는지 테스트.

### A-02 [P0 / 플레이 생성] 화재 세계선 X/Y/Z 미적용

**근거**
- `data/apartment_fire_01.json`: `initialVariants.{X,Y,Z}.world.incidentVariant` 정의, `initialState.world.incidentVariant = 'X'`.
- `api/src/plays/types/scenario-v2.ts`에는 `initialVariants` 타입이 없음. `scenario-validator-v2.ts`에서도 이 필드를 검증하지 않음.
- `createInitialPlayDataV2()`는 `scenario.initialState`만 복제. `startPlayV2()`도 세계선 선택·주입을 수행하지 않음.

**영향**
- 실제 신규 화재 플레이는 항상 X에서 시작. Y/Z의 연기 관련 시간 이벤트와 일부 실패 분기가 기본 시작 경로에서는 사용되지 않음.

**권장 수정**
- 시작 시 세계선 서버 선택 정책(예: 동등 확률, 가중치, 고정 검증용 주입)을 정하고, 선택된 값이 `scenarioState.world`에 반영되도록 구현.
- 테스트에서 X/Y/Z를 강제로 선택할 수 있는 **결정적 주입 방식**을 마련. 일반 클라이언트가 비공개 세계선을 임의 지정할 수 있게 만들 필요는 없음.
- 초기 변형의 키·타입·기존 필드 외 덮어쓰기 범위를 검증하며, 선택된 세계선 또는 재현 가능한 초기 상태가 플레이와 함께 보존되는지 확인.

### A-03 [P0 / 엔딩 리뷰 계약] 행동 이력·근거 연결 구조 미정

**근거**
- 현재 JSON에는 상위 `sourceRefs` 맵과 `outcome.resultText`가 있으나 **어느 개별 행동/결과를 어느 근거로 해설할지 연결하는 데이터**는 없음.
- `OutcomeV2`에 고유 결과 ID/리뷰 메타데이터가 없고, `PlayDataV2`에는 행동 이력 배열이 없음.
- 현재 MySQL 종료 결과는 기본 엔딩 메타데이터만 기록.

**권장 수정**
- 동결 전에 *적어도* 결과 식별 전략(`outcomeId` 또는 변경 불가능한 참조 키)과 선택적 `review`/`sourceRefIds` 확장 위치를 정의.
- 실제 행동 이력 저장, 엔딩 크레딧 API/UI, DB 테이블은 이후 D-06·D-10 구현 블록에서 개발 가능.
- 공식 지침을 그대로 행동의 절대 점수로 매기기보다 **당시 공개 정보·실제 결과·설명·출처**를 구분.

### A-04 [P1 / 버전 호환] 진행 중 플레이가 콘텐츠 갱신 후 중단될 수 있음

**근거**
- `PlayDataV2.scenarioVersion`은 시작 시 버전을 보존하고, `buildPlayViewV2()`/`executeActionV2()`는 플레이 버전과 로드한 JSON 버전의 일치를 검사.
- 현재 `loadScenarioV2(scenarioId)`는 같은 파일 이름의 **최신 JSON만** 읽고 과거 버전을 조회할 수 없음.

**영향**
- 플레이 중 파일 내용·`version`을 배포 변경하면 Redis TTL이 남아 있어도 구 버전 진행 상태를 해석할 수 없고 API 오류가 발생할 수 있음.

**권장 수정**
- 최초 공개 전 버전별 JSON 보존/조회 또는 짧은 TTL 동안 이전 버전 동시 지원 등 중단 없는 콘텐츠 갱신 전략 결정.
- 과거 플레이 재생/엔딩 크레딧까지 고려하면 시나리오 버전과 결과 문구 스냅샷을 함께 보존하는 편이 안전.

### A-05 [P1 / 계약 검증] 일부 RC2.1 루트 메타데이터는 런타임에 적용되지 않음

- 현재 JSON의 `schemaRevision`, `clock`, `description`, `sourceRefs` 및 화재의 `initialVariants`는 `ScenarioV2` 타입과 `validateScenarioV2()`에서 동일 수준으로 계약 검증되지 않음.
- `clock`의 ACTION_DRIVEN 및 '행동 끝에서 시간 사건 반영 후 결과 선택' 규칙은 현재 액션 엔진의 **실행 순서와 대체로 부합**하므로 무조건 새 시계 엔진을 만들 문제는 아님.
- `sourceRefs`는 결과 화면의 참고 링크로 활용 가능하지만, URL 실존성과 재난 대응 내용의 타당성은 이 구조 감사의 검증 대상이 아님.
- 추가 메타데이터를 **엔진 필수 의미로 지원할지, 콘텐츠 참고용으로 명시하고 검증할지** 결정해야 함. 사용하지 않는 메타데이터를 '기능 구현 완료'로 표시하면 안 됨.

### A-06 [P1 / 테스트 설계] 현재 165개 통과는 4종 완결 도달성의 증명이 아님

- 기존 Redis/HTTP 테스트 일부는 고정된 테스트용 V2 시나리오를 사용하도록 최근 분리됨. 이는 바람직한 구조.
- `plays-v2.end-to-end.integration.spec.ts`는 완결 시나리오를 테스트 안에서 별도로 주입하여 MySQL·Redis 흐름을 검증함.
- 4종 JSON의 **실제 경로**에서 시간 사건, 모든 중요 엔딩, `selectOutcome()`의 정확히 하나 매칭, 화면 서술의 정확히 하나 매칭, 진행 중 가용 행동 존재 여부를 테스트해야 함.
- 스키마 검증에서 필드 유효성이 맞더라도 **조건 0개/2개 결과**는 런타임에 발생할 수 있음. 시나리오별 경로 테스트로 보완.

## 3. 제한적 상태 전이 탐색 결과 (실제 TS 테스트 아님)

위 코드를 읽고 동일한 주요 조건·효과·시간 이벤트·전환 규칙을 JavaScript로 모사하여 상태 탐색했습니다. **상대 이벤트는 현재 서버처럼 예약되지 않는 조건**으로 두었습니다. 탐색은 상태/선택 수와 시간·깊이에 제한이 있으므로 모든 경로의 완전한 증명이 아닙니다.

| 시나리오/조건 | 확인된 엔딩 | 주의 |
|---|---|---|
| 화재 기본 X | `SAFE_OUTSIDE`, `SAFE_INSIDE` | 6개 중 탐색 중 2개 확인. X에 없는 실패/구조 분기는 당연히 기본 경로에선 제한 |
| 화재 가상 Y (초기 상태 수동 변경) | `EXPOSURE_FAILURE`, `SAFE_INSIDE`, `EXPOSURE_AT_HOME` | 실제 API는 아직 Y 선택 불가 |
| 화재 가상 Z (초기 상태 수동 변경) | `EXPOSURE_FAILURE` | `F_REFUGE_WAIT` 결과 매칭 0개 사례 확인 |
| 정전 단일 세계선 | `HOME_PLAN_FAILED`, `HOME_STOCKOUT`, `RESTORED_AT_HOME`, `SHELTER_REACHED` | 4개 모두 대표 경로 확인 (최대 22행동, 520게임분으로 탐색) |
| 조난 단일 세계선 | `RETURNED`, `OVERNIGHT` | 상대 이벤트 없음 → `RESCUED`, `DELAYED_EVAC`는 구조대 도착 상태 생성 불가 |
| 침수 단일 세계선 | `SAFE_EXIT` | 상대 이벤트 없음 → 나머지 구조 엔딩 2종의 구조대 도착 상태 생성 불가 |

**대표 정상 경로(조건 모사):**
- 화재 X `SAFE_OUTSIDE`: `F_START_DOOR` → `F_ENTER_HALL` → `F_CHECK_STAIR` → `F_GUIDED_DESCEND` → `F_GO_OUT` → `F_OUT_END`.
- 정전 `RESTORED_AT_HOME`: `B_WAIT` 4회 → `B_END` (365게임분).
- 조난 `RETURNED`: `H_PHOTO` → `H_MAP` → `H_NORTH` → `H_WEST` → `H_FINISH`.
- 침수 `SAFE_EXIT`: `D_TAKE_A` → `D_A_UP` → `D_END`.

## 4. 시나리오별 체크

| 작품 | JSON 수정이 지금 필수인가? | 우선 보완 | 다음 검증 |
|---|---|---|---|
| 화재 | **대규모 개작 불필요** | 엔진 초기 세계선·상대 이벤트 연결 | X/Y/Z별 안전·피해·구조 엔딩, `F_REFUGE_WAIT` 정확히 하나 결과 |
| 정전 | 현 단계에서는 명백한 구조 누락 없음 | 상태 자원 하한·장시간 시간 점프 검증 | 4종 엔딩 대표/경계 경로, `ADD` 후 음수 자원 발생 여부 |
| 조난 | 현재 구조 유지 가능 | 상대 `H_SEARCH_ARRIVAL` 예약·발화 | 전화 성공 → 17분 후 도착 → 구조/지연 엔딩, 배터리 경계 |
| 침수 | 현재 구조 유지 가능 | 상대 `D_CREW_ARRIVES` 예약·발화 | 신고 → 7분 후 접근 → 구조 엔딩 2종, 접근 상실 시각 경계 |

결론: **다른 3종의 JSON을 화재 구조에 맞춰 억지로 단순화할 필요는 없음.** 현재 오류의 중심은 스키마 데이터를 읽는 구조가 아니라 **시간 이벤트/초기 세계선의 실제 적용 경로**에 있음.

## 5. 다음 블록 B — 구현 순서와 완료 조건

| 순서 | 단위 작업 | 완료 조건 | 담당 방식 |
|---:|---|---|---|
| 1 | 상대 시간 이벤트를 `executeActionV2`에 연결 | 세 예약 이벤트의 발화/단 1회 처리, state+progress가 함께 갱신되고 4종 기존 엔진 테스트 회귀 통과 | **핵심 시간/상태 설계는 사용자 이해 후 직접 구현**, 반복 테스트/보일러플레이트는 지원 |
| 2 | 화재 X/Y/Z 세계선 시작 정책 및 검증 | 테스트에 세계선을 결정적으로 주입 가능, 실사용 서버는 비공개로 선택, 시작 상태가 올바르게 복제·보존 | 핵심 정책 판단 후 구현 |
| 3 | 실제 화재 JSON의 대표 6개 엔딩 테스트 | 모든 엔딩에 적어도 하나의 유효 경로; 사용 가능한 행동/서술에 충돌 없음; Z 피난 공간 진행 정상 | 경로 생성·테스트 파일 작성 지원 |
| 4 | 정전·조난·침수 대표 경로와 타임 이벤트 테스트 | 4종 공통 스키마에 빠진 필수 메카닉이 없는지 확인, 엔딩 도달 경계 사례 기록 | 자동화·검증 지원 |
| 5 | 리뷰 데이터 확장 방식 정의 및 스키마 동결 | 선택 결과 이력·근거 연결 확장 방침 기록, 타입/검증 계약 고정, 동결 후 JSON 콘텐츠 수정은 허용 | 설계 검토 + 문서화 |

> 유의: 현재 `README.md`와 `docs/IMPLEMENTATION_MATRIX.md`의 일부 문구는 이전 `main` 기준입니다. 이 보고서와 동봉한 구현 대조표 갱신본을 기준으로 최신 상태를 교정할 것을 권장합니다. 루트 README 링크가 실제 문서 위치인 `docs/`가 아니라 `docs/specs/`를 가리키는 문제도 별도 문서 정리 시 수정하십시오.

## 6. 이번 감사에서 수행하지 않은 일

- 원격 GitHub 코드 수정 및 PR 생성
- 실 로컬 Node/NestJS + Redis + MySQL 연결 실행
- 공식 재난안전 지침 내용의 전문 감수 및 URL 유효성 검사
- 17개 엔딩의 완전한 상태 공간 증명
- 실제 콘텐츠의 UX·문학적 개연성 전체 평가

구조적 위험을 우선 식별한 감사이므로, **버전별 실제 시나리오 경로 테스트와 완료 기준 통과 전에는 D-08 동결 완료로 표시하지 않습니다.**
