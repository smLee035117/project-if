# Project IF — V2 기능 명세 ↔ 구현 대조표

- **문서 ID:** IF-IMPL-V2
- **작성 기준일:** 2026-11-17
- **기준 요구사항:** `PRODUCT_REQUIREMENTS_V2.md`
- **코드 기준:** GitHub [`smLee035117/project-if`](https://github.com/smLee035117/project-if), `wip/f1-timeline-integration` 브랜치 (`62b27ac`) 파일 직접 확인
- **주의:** 현재 작업 브랜치 소스를 확인했으며 이 문서를 만들면서 로컬 Redis/MySQL 및 Vitest를 재실행하지 않았음. 사용자 제공 실행 로그상 2026-11-17 전체 테스트 165/165 통과·빌드 성공. 상세한 콘텐츠 탐색은 `V2_SCENARIO_COMPATIBILITY_AUDIT.md` 참조.

## 1. 상태 정의

| 상태 | 의미 |
|---|---|
| **구현 확인** | 핵심 코드 경로를 GitHub에서 확인함. 전체 통합/실서비스 완료를 보장하지 않음 |
| **부분 구현** | 일부 동작은 존재하지만 명세의 중요한 세부 요건이 빠져 있음 |
| **미구현 확인** | 검토한 관련 모듈/Controller에서 해당 공개 기능 또는 구현 경로를 찾지 못함 |
| **정책 확정·미반영** | 제품 정책은 확정했지만 코드가 기존 동작을 유지하는 상태 (기능별 행에서는 부분 구현/미구현으로 표시) |
| **추가 검증** | 코드가 존재하지만 실제 4종 JSON·외부 시스템·UI의 연결 검증이 남음 |

우선순위: **P0** = 사용자에게 완결된 V2 플레이를 제공하는 데 필요, **P1** = 안전한 공개 서비스에 필요하거나 이전에 승인된 핵심 품질, **P2** = 완료 후 확장/비차단 개선. P0는 무조건 당장 구현한다는 뜻이 아니라 선행 정책 및 콘텐츠 계약을 확정한 뒤 구현할 순서다.

## 2. 기능별 대조 매트릭스

| ID | 요구 기능 | 상태 | 코드 근거 | 확인된 미완료/차이 | 우선 |
|---|---|---|---|---|---|
| F01-01 | 시나리오 목록·선택 | **부분 구현** | `scenario-loader-v2.ts`, `plays-v2.controller.ts` | 로더에는 4종 등록. 공개 시나리오 목록 조회 API/화면은 아직 없음 | P0 |
| F01-02 | 첫 화면에 장면·행동 표시 | **부분 구현** | `startPlayV2`, `buildPlayViewV2` | API의 공개 View는 구성되지만 실제 웹 시작·선택 화면 없음 | P0 |
| F02-01 | 게스트 토큰 생성·확인 | **구현 확인** | `guest/guest-token.ts`, `getOrCreateGuest()`, `DatabaseService` | 쿠키 설정 및 DB 조회 경로 있음; 배포 보안 재검토 필요 | P1 |
| F02-02 | 게스트 7일 / 성공 행동 후 TTL 1시간 | **부분 구현** | `plays-v2.controller.ts`, `plays.controller.ts`, `database.service.ts`, `redis.service.ts` | Redis 3600초 및 성공 CAS 연장은 일치. 쿠키·MySQL 세션 **30일 → 7일** 변경 및 만료 테스트 필요 | P1 |
| F02-03 | 소유권 검증 | **구현 확인** | `getPlayDataV2ForGuest()` | 토큰 해시→userId→Redis userId 비교. 실제 타인 접근/만료 통합 테스트 확인 필요 | P1 |
| F03-01 | 플레이 생성·독립 초기 상태 | **구현 확인** | `startPlayV2()`, `createInitialPlayDataV2()` | 초기 상태 복제와 버전 0. 초기 세계선 다중 구성은 별도 | P0 |
| F03-02 | 게스트당 이어하기 대상 1개 | **미구현 확인** | `getPlayViewV2ForGuest()`, `startPlayV2()` | 시작마다 새 playId. 활성 대상 조회/원자적 교체/이전 ID 차단 없음. 이어하기·새 시작 확인 UI 필요 | P0 |
| F03-03 | 포기하기(영속 결과 미저장) | **부분 구현** | `plays-v2.controller.ts`, `plays.service.ts`, Redis Lua, `savePlayResultV2()` | GIVEN_UP 상태 가능·MySQL 미저장 경계는 존재하지만 V2 포기 API 및 동시성 처리 없음 | P1 |
| F03-04 | 종료 후 행동 거절 | **구현 확인** | `submitActionV2()`, `executeActionV2()`, Redis Lua | `state !== PLAYING` 거절, Redis도 검사. 충돌 및 예외 테스트는 별도 확인 | P0 |
| F04-01 | STAY/GOTO/END | **구현 확인** | `action-engine-v2.ts`, `types/scenario-v2.ts` | 전이 분기는 존재. GOTO의 장면-위치 일치는 F04-05에서 별도 추적 | P0 |
| F04-02 | 행동 가능 조건 | **구현 확인** | `buildPlayViewV2()`, `submitActionV2()`, `state-engine-v2.ts` | `available` 반환과 실행 전 검사 있음. 불가능 사유 노출 정책은 미정 | P0 |
| F04-03 | 결과별 분기/정확히 하나 선택 | **구현 확인** | `selectOutcome()`, `executeActionV2()` | 매칭 0/복수는 오류. 실제 4종 분기와 일치 테스트 필요 | P0 |
| F04-04 | SET/ADD/지식 효과 | **부분 구현** | `types/scenario-v2.ts`, `state-engine-v2.ts`, `scenario-validator-v2.ts` | 네 효과 존재. RC2의 `ADD` 적용 결과 음수 허용 범위 등 세부 불변식 검증 필요 | P0 |
| F04-05 | GOTO 시 위치 자동 일치 | **구현 확인** | `action-engine-v2.ts`, `types/scenario-v2.ts` | `GOTO` 목표 장면의 `location`을 `player.location`에 반영함. 4종 실제 경로 연동 테스트 추가 필요 | P0 |
| F04-06 | 행동에 따른 가상 시계 | **구현 확인** | `time-engine-v2.ts`, `executeActionV2()` | `storyTimeMinutes` 전진 및 검증. 장기 이동/중단 경계는 콘텐츠 계약 준수 확인 | P0 |
| F04-07 | 절대·상대 시간 이벤트 | **부분 구현·차단 이슈** | `time-engine-v2.ts`, `action-engine-v2.ts`, `PlayDataV2.timelineProgress` | 상대 이벤트 예약/완료 함수와 타입은 있으나 **실제 `executeActionV2`에서 호출되지 않음**. 조난·침수 구조 엔딩 및 화재 Z 피난 경로 영향 | P0 |
| F04-08 | world/player/knowledge 분리·비공개 | **구현 확인** | `types/play-v2.ts`, `play-view-builder-v2.ts` | 응답에 원시 world 미포함. 상태 조건이 숨은 정보 노출을 만들지 않는지 콘텐츠 테스트 필요 | P0 |
| F04-09 | JSON 구조·참조 검증 | **부분 구현** | `scenario-loader-v2.ts`, `scenario-validator-v2.ts` | 4종 로더 등록, `location`/`narratives`/`timeline` 구조 검증 존재. `initialVariants`/루트 메타데이터 검증과 조건 결과의 동적 도달성 검증 미흡 | P0 |
| F05-01 | 엔딩 조건·결과 | **구현 확인** | `executeActionV2()`, `savePlayResultV2()` | END 조건 검사, CLEARED/FAILED 기록. 실제 콘텐츠 완결 경로는 별도 | P0 |
| F05-02 | 플레이 교착 방지 | **추가 검증·차단 이슈** | 4종 JSON, `selectOutcome()` | 모든 장면에 행동·정적 GOTO 연결은 있지만, 가상 Z 세계선 `F_REFUGE_WAIT`에서 상대 이벤트 누락 시 outcome 0개로 예외 가능. 전체 경로 탐색 및 회귀 테스트 필요 | P0 |
| F05-03 | 행동 직후 메시지 | **부분 구현** | `submitActionV2()` → `resultText` + `view` | API 결과 존재. 프런트엔드 표시/정보 공개 검증 미구현 | P0 |
| F05-04 | 엔딩 크레딧·행동별 회고·근거 | **부분 구현** | `play-view-builder-v2.ts`, 4종 JSON `sourceRefs` | 엔딩 제목/설명은 응답. 출처 맵은 JSON에 있으나 개별 행동·outcome의 리뷰/근거 연결, 행동 이력, UI는 미구현 | P0 |
| F05-05 | 리뷰용 행동 이력과 종료 후 영속화 | **미구현 확인** | `types/play-v2.ts`, `action-engine-v2.ts`, `database.service.ts` | 행동 배열/결과 스냅샷·CAS 반영·MySQL 이력 저장·리뷰 조회 없음 | P0 |
| F06-01 | Redis CAS 동시성 | **구현 확인** | `RedisService.updatePlayV2IfVersion()` | 버전 비교·검사·저장, 종료 시 pending 원자 기록. 스케일 테스트는 별도 | P0 |
| F06-02 | requestId 멱등 응답 | **미구현 확인** | `SubmitActionV2Dto`, `submitActionV2()`, Redis CAS | 현재 요청은 actionId+expectedVersion만 받음. 같은 요청 재전송 시 성공 응답 재사용 불가 | P1 |
| F06-03 | 완료 결과+행동 이력 멱등 저장 | **부분 구현** | `DatabaseService.savePlayResultV2()` | 결과 메타데이터 중복 저장 비교는 구현. 행동 이력 타입·DB 보관·복구 시 동일성 검증 미구현 | P0 |
| F06-04 | Redis pending·자동 복구 | **구현 확인** | `RedisService`, `recoverPendingPlayResultsV2()`, `PlayRecoveryBootstrapService` | 시작 시 복구+60초 반복. 다중 인스턴스 동시 복구·Redis 자체 유실 위험은 별도 | P0 |
| F07-01 | 4종 공통 JSON 연동 | **부분 구현·추가 검증** | `scenario-loader-v2.ts`, `data/*.json` | **화재·정전·조난·침수 4종 모두 등록** 및 RC2.1 JSON 존재. 실제 4종 분기·종료를 TS 엔진/HTTP에서 검증할 필요 | P0 |
| F07-02 | 버전 고정·초기 세계선 | **부분 구현·차단 이슈** | `PlayDataV2.scenarioVersion`, `createInitialPlayDataV2()`, 화재 `initialVariants` | 시작 시 화재 X만 사용, Y/Z 미적용. 기존 플레이 버전에 대응하는 옛 JSON 조회도 불가 | P0 |
| F07-03 | 4종 구조 검토·화재 1종 우선 공개 | **부분 구현·추가 검증** | 4종 RC2.1 JSON, V2 엔진 | 화재 JSON 14장면·28행동·6엔딩, 나머지 3종도 저장소에 존재. 실제 엔딩 경로 및 상대 이벤트 연동 후 스키마 동결 가능 | P0 |
| F08-01 | 웹 화면과 API 연결 | **미구현 확인** | `plays-v2.controller.ts`, README | 첫 화면/행동 결과·이어하기·새로 시작·포기·엔딩 크레딧·만료 안내 UI 없음 | P0 |
| F08-02 | Docker·CI·재현 가능한 테스트 | **부분 구현** | Vitest `*.spec.ts`, 사용자 제공 테스트·빌드 로그 | 2026-11-17 사용자 로컬에서 20파일/165테스트 통과·Nest 빌드 성공. Docker·CI·새 환경 초기화 확인은 남음 | P1 |
| F08-03 | 공개 배포·운영 로그·헬스 체크 | **미구현/추가 검증** | `README.md`, `main.ts` | 배포, 운영 추적 로그, 정식 헬스 체크·롤백 등 완료 근거 확인되지 않음 | P1 |

> **상태 판독 주의:** F04-03이나 F05-01의 '구현 확인'은 엔진이 해당 종류의 처리를 지원한다는 뜻이다. 이를 이용한 **실제 4종 시나리오의 정상 종료**는 F07-03에서 별도 완료 판정한다.

## 3. 확정 정책과 현재 코드의 차이 요약 (작업 브랜치 기준)

- **D-01:** V1/V2 쿠키와 MySQL 세션은 여전히 30일 → 확정된 7일로 수정 필요.
- **D-02·D-05:** Redis 3600초 TTL, 성공 CAS 시 갱신 및 만료 후 404는 현재 정책에 부합.
- **D-03·D-04:** 게스트 단일 이어하기, 이전 플레이 접근 차단, V2 포기 API는 미구현.
- **D-06·D-07·D-10:** V2 엔딩 판정은 구현. 행동별 이력·리뷰와 MySQL 이력 저장은 미구현. V2 타입은 아직 V1 점수형 PlayData를 상속.
- **D-08·D-09:** 4종 JSON과 정적 공통 구조는 저장소에 존재. **상대 타임라인 미연결, 화재 세계선 미적용, 실제 4종 엔딩 통합 테스트 부족**으로 스키마 동결 보류.
- **README:** 일부 현재 콘텐츠 현황·링크가 구 브랜치 기준으로 작성되어 갱신 필요.

## 4. 최신 GitHub 코드에서 확인한 중요한 세부 사실

### 4.1 서비스 연결

- `api/src/app.module.ts`는 `PlaysModule`, `DatabaseModule`, `RedisModule`을 등록한다.
- `api/src/plays/plays.module.ts`는 `PlaysController`(V1), `PlaysV2Controller`(V2), `PlaysService`, `PlayRecoveryBootstrapService`를 등록한다.
- `api/src/plays/plays-v2.controller.ts`의 경로는 `POST /v2/plays`, `GET /v2/plays/:playId`, `POST /v2/plays/:playId/actions` 세 개다.
- V1·V2의 Controller는 별도지만 `PlaysService`를 공유한다. V1의 완료 검증은 V2 콘텐츠 동작의 완료 증거가 아니다.

### 4.2 현행 V2 HTTP 요청/응답 계약

| HTTP 경로 | 입력 | 대표 응답 | 중요한 정책 |
|---|---|---|---|
| `POST /v2/plays` | `scenarioId` + 선택적 기존 guest_token 쿠키 | `playId`, `view` + 필요 시 새 쿠키 | 시작 요청마다 새로운 플레이 저장. 중복 시작/기존 플레이 반환 정책 없음 |
| `GET /v2/plays/:playId` | `playId` + 쿠키 | `PlayViewV2` | 인증·소유권 확인 후 비공개 상태 제거 |
| `POST /v2/plays/:playId/actions` | `actionId`, `expectedVersion` + 쿠키 | `resultText`, `view` | 버전 충돌은 409. `requestId` 입력 없음 |

**현행 View 주요 필드:** `scenarioId`, `scenarioTitle`, `state`, `version`, `currentSceneId`, `sceneDescription`, `storyTimeMinutes`, `knownFacts`, `actions[{id,text,available}]`, 종료 시 `ending`. 내부 `world` 상태와 `userId`는 반환하지 않는다.

### 4.3 버전·저장·복구

- 진행 Redis 키: `play:v2:${playId}`, TTL 3600초. CAS 재저장 시 TTL이 다시 3600초로 설정된다.
- 종료 Redis pending 키: `pending:v2:play-result:${playId}`. CLEARED/FAILED 결과는 상태 저장과 같은 Lua 스크립트에서 기록된다.
- MySQL: `user_play_log_v2`에 `play_id`, user/scenario/ending/time/version 등을 저장한다. `ER_DUP_ENTRY` 시 기존 내용이 동일하면 정상 반환하고 다르면 오류.
- `PlayRecoveryBootstrapService`는 테스트 환경에서 비활성, 그 밖에는 부팅 시 1회 및 이후 60초 간격으로 V1/V2 pending 복구를 시도한다. **한 인스턴스 안에서만** 동시 복구 실행을 막는다.
- Redis의 영속화 설정이나 다중 인스턴스 분산 락까지 보장되는 것은 아니다.

### 4.4 콘텐츠 계약과 현재 실행 코드 간 주요 차이 (블록 A 최신 감사)

| RC2/RC2.1 요구 | 현재 작업 브랜치의 구현 | 판정 |
|---|---|---|
| 4종 JSON 로더 | 화재·정전·조난·침수 모두 등록 | **등록 확인**, 실제 종료 검증 필요 |
| `scenes[].location`, 조건별 `narratives` | 타입·검증·공개 View에 구현, `GOTO` 위치 동기화 | **구현 확인**, 실제 콘텐츠는 대부분 단일 서술 |
| 화재 `initialVariants` X/Y/Z | 타입·검증·초기화 적용 없음. X만 기본 실행 | **미구현** |
| 절대 시각 `timeline` | 시간 경계 처리 | **구현 확인** |
| 상대 예약 `timeline.after` | helper 존재, `executeActionV2` 호출·progress 반영 없음 | **차단 이슈** |
| `clock.mode=ACTION_DRIVEN` | 행동 소요시간 기반. 루트 메타데이터 검증은 없음 | **동작 방향 일치**, 계약 검증 보완 |
| `requestId` 멱등 응답 | 버전 CAS만 | **미구현** |
| 종료 후 리뷰·출처 | 결과 메시지와 루트 `sourceRefs` 존재 | **개별 outcome·출처 연결 및 이력 저장 미구현** |
| 콘텐츠 버전 유지 | `scenarioVersion` 비교, 로더는 최신 JSON만 | **릴리스 시 구 버전 진행 중단 위험** |
| `ADD` 결과 값 | 음수 델타를 허용하고 유한성 검증 | **방향 적합**, 자원 하한 경로 검증 필요 |

상세 근거와 시나리오별 경로 모사는 [4종 호환성 감사](./V2_SCENARIO_COMPATIBILITY_AUDIT.md) 참고.

## 5. 우선 구현·검증 순서 (정책 확정 이후)

### A. 기능 명세 정책 결정 게이트 — 완료

- [x] D-01~D-05: 게스트 7일, 성공 행동 후 TTL 1시간, 단일 이어하기, 포기·만료 정책
- [x] D-06~D-07: 행동 결과와 종료 후 엔딩 크레딧, V2 공통 점수 제거
- [x] D-08: 네 콘텐츠 구조 검토+화재 통합 후 스키마 동결
- [x] D-09: 화재 1종 우선 공개
- [x] D-10: 완료 결과 및 행동 이력 MySQL 저장

**미결 운영 항목:** 익명 완료 이력의 보관·삭제 기간 등. 이는 위 기능 정책 결정과 구분한다.

### B. 공통 스키마·화재 1종 수직 통합 (P0)

1. [x] **4종 RC2.1 정적 구조 대조(블록 A):** 4종 로더·참조·필드 경로 확인, 상대 시간 미연결/초기 세계선 누락 식별. **실제 TS 동작 테스트는 미완**
2. [ ] 상대 시간 이벤트 예약·완료를 실제 `executeActionV2`의 `timelineProgress`에 연결하고 회귀 테스트
3. [ ] 화재 X/Y/Z 선택·검증 및 버전 처리 정책 확정, 자원 효과 불변식 점검
4. [ ] 실제 화재 JSON으로 X/Y/Z 대표 경로→6개 엔딩→Redis/MySQL 통합 테스트; 결과/서술이 정확히 하나 매칭되는지 검증
5. [ ] 정전·조난·침수의 실제 엔딩 경로를 점검하고 리뷰용 결과 식별·출처 연결 확장 방침을 정한 후 **동결**. 3종 완성·공개는 이후 단계

### C. 게스트 흐름·행동 이력·공개 화면 (P0/P1)

6. [ ] 진행 중 CAS 성공 시 이력 누적, 엔딩 결과와 이력의 MySQL 멱등 저장 및 Pending 복구
7. [ ] 게스트 인증 쿠키/DB 세션 **7일** 일치 및 회귀 테스트
8. [ ] 게스트당 이어하기 대상 1개, 새 시작 확인·교체/이전 ID 차단, 동시 시작 경합 테스트
9. [ ] V2 포기 API 및 404 만료/소유권 오류 처리, 시나리오 목록 API
10. [ ] 행동별 회고·근거/출처 데이터 모델, 엔딩 크레딧 View/API
11. [ ] `requestId` 재전송 멱등 처리와 충돌/응답 유실 회귀 테스트
12. [ ] 웹 UI (행동·이어하기·새 시작·포기·엔딩)와 최소 사용성 검증
13. [ ] Docker·CI·외부 배포·운영 로그/보안·헬스 체크

### D. 서비스 완료 이후 (P2)

- [ ] 프로젝트 IF 실제 API 기반 k6 부하 테스트: 부하 기준선→병목 분석→개선 전후 검증
- [ ] Socket.IO 다중 인스턴스 실시간 트래픽 실습 (별도 작업, 서비스 완성을 늦추지 않는 범위)
- [ ] 정전·조난·침수 각각 별도 완성/통합/공개
- [ ] 회원가입/기기 간 기록 복원/발견 엔딩 수집/선택 비율 통계
- [ ] 제작 도구/랭킹/광고/미션 보상 등 제품 확장

## 6. 권장 검증 케이스 (명세 ID 기반)

| 테스트 그룹 | 연결 기능 | 검증 내용 |
|---|---|---|
| 소유권/세션 | F02-01~03, F03-02 | 타인 playId 조회·행동 거절, 쿠키/DB 7일, 1시간 TTL, 단일 이어하기·교체 경합 |
| 상태 분기 | F04-01~04 | STAY/GOTO/END, 같은 행동의 2가지 다른 결과, 결과 0개·2개 오류 |
| 상태 불변식 | F04-04~05 | 음수 ADD의 허용 조건, 결과 하한, GOTO 시 장면·위치 동기화 |
| 시간 경계 | F04-06~07 | atMinute 경계, 상대 예약 시각, 한 번만 적용, 이벤트 간 순서 |
| 숨김 정보 | F04-08, F05-03 | 원시 world 비노출, 행동 available을 통한 스포일러 검사 |
| 종료·교착 | F05-01~02 | 성공/사망/실패 엔딩, 종료 후 재선택, 반복 대기 루프 도달 가능성 |
| 중복/충돌 | F06-01~02 | 같은 버전의 경합은 1건 성공, 동일 requestId는 같은 결과 재사용 |
| 영속/복구 | F05-05, F06-03~04 | MySQL 실패→pending 유지→재시작 복구, 결과+행동 이력 일치/멱등성, DB 저장 후 삭제 전 장애 재현 |
| 콘텐츠 | F07-01~03 | 네 작품의 대표 경로/상태전이 결과를 TS 엔진에서 재현 및 Python 예상 결과와 비교 |
| 웹/배포 | F05-04~05, F08-01~03 | 엔딩 크레딧·행동 리뷰, 브라우저 더블클릭/새로고침/오류 안내, 새 환경 실행·CI·외부 플레이 |

## 7. 코드 확인용 경로

- [PlaysV2Controller](https://github.com/smLee035117/project-if/blob/wip/f1-timeline-integration/api/src/plays/plays-v2.controller.ts)
- [PlaysService](https://github.com/smLee035117/project-if/blob/wip/f1-timeline-integration/api/src/plays/plays.service.ts)
- [ScenarioV2 타입](https://github.com/smLee035117/project-if/blob/wip/f1-timeline-integration/api/src/plays/types/scenario-v2.ts)
- [ScenarioV2 Loader](https://github.com/smLee035117/project-if/blob/wip/f1-timeline-integration/api/src/plays/scenario-loader-v2.ts)
- [ScenarioV2 Validator](https://github.com/smLee035117/project-if/blob/wip/f1-timeline-integration/api/src/plays/scenario-validator-v2.ts)
- [Action Engine](https://github.com/smLee035117/project-if/blob/wip/f1-timeline-integration/api/src/plays/action-engine-v2.ts)
- [State Engine](https://github.com/smLee035117/project-if/blob/wip/f1-timeline-integration/api/src/plays/state-engine-v2.ts)
- [Time Engine](https://github.com/smLee035117/project-if/blob/wip/f1-timeline-integration/api/src/plays/time-engine-v2.ts)
- [View Builder](https://github.com/smLee035117/project-if/blob/wip/f1-timeline-integration/api/src/plays/play-view-builder-v2.ts)
- [RedisService](https://github.com/smLee035117/project-if/blob/wip/f1-timeline-integration/api/src/redis/redis.service.ts)
- [DatabaseService](https://github.com/smLee035117/project-if/blob/wip/f1-timeline-integration/api/src/database/database.service.ts)
- [Recovery Bootstrap](https://github.com/smLee035117/project-if/blob/wip/f1-timeline-integration/api/src/plays/play-recovery-bootstrap.service.ts)
- [작업 브랜치 화재 RC2.1 JSON](https://github.com/smLee035117/project-if/blob/wip/f1-timeline-integration/data/apartment_fire_01.json)

## 8. 업데이트 규칙

명세의 기존 기능 ID를 유지하고 F05-05(행동 이력)를 추가 추적한다. 코드가 변경될 때마다 (1) 상태, (2) 코드 경로, (3) 완료 조건 테스트, (4) 남은 작업을 같이 수정한다. 기능을 배포 완료로 표시하려면 관련 기능 테스트와 통합 경로 검증까지 확인한다. 이전 README와 11월 14일 감사 문서의 개발 상태는 **과거 시점 기록**으로 보존하되 현재 현황표의 근거를 대체하지 않는다.
