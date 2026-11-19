# Project IF — 2026-11-19 개발 인계 및 이해도 검증 기준

- 기준 브랜치: `wip/f1-timeline-integration`
- 코드 기준 커밋: `d4a98f493679` (2026-11-18 KST)
- 검증 출처: 사용자 11월 18일 로컬 실행 결과 **26개 테스트 파일·203/203 통과, NestJS 빌드 성공**. 이 문서 생성 시 테스트를 별도 재실행하지 않음
- 선행 문서: [기능 구현 대조표](./IMPLEMENTATION_MATRIX.md), [기능 명세](./PRODUCT_REQUIREMENTS_V2.md). 두 문서는 11월 17일 시점의 상세 상태를 포함하므로, 11월 18일 이후 구현 현황은 **이 문서를 우선**해서 판독

## 1. 11월 18일 완료·검증한 사항

| 항목 | 현재 상태 | 코드·테스트 근거 |
|---|---|---|
| 개발용 Playground | 구현 | `api/public/dev-playground.html`, `dev-playground.controller.ts`; 로컬 개발 전용 |
| 상대 시간 이벤트 | 행동 엔진에 예약·처리·종료 정리 연결 | `action-engine-v2.ts`, `time-engine-v2.ts`, 11/18 회귀 테스트 |
| 화재 X/Y/Z 세계선 | 시작 시 무작위 선택, 결정적 단위 테스트 | `fire-variant-v2.ts`, `plays.service.ts`, `fire-variant-v2.spec.ts` |
| 화재 경로 | X/Y/Z 대표 경로·엔딩 검증, 진행 정체 경로 수정 | `apartment-fire-v2.http.integration.spec.ts` 등 |
| 행동 이력 | 행동마다 순서/장면/선택/결과/시각 누적, Redis CAS·Pending·MySQL 저장 | `types/play-v2.ts`, `action-engine-v2.ts`, `database.service.ts`, `action-history-v2.integration.spec.ts` |
| 종료 후 View | `actionHistory` 반환 | `play-view-builder-v2.ts`, `types/play-view-v2.ts` |
| DB 변경 | `user_play_log_v2.action_history JSON NULL` 추가용 마이그레이션 파일 | `db/migrations/20261118_add_action_history_v2.sql` |

**유의:** 테스트 통과는 공개용 UI 완료, 네 시나리오의 모든 동적 경로 검증 또는 운영 배포를 의미하지 않는다. 마이그레이션을 사용자의 로컬 DB에 적용했는지는 별도 확인한다.

## 2. 남은 기능 — 다음 개발 우선순위

1. **결과의 가시화:** 개발용 Playground에서 종료 후 행동 이력 목록 표시. 이미 반환되는 `view.actionHistory` 재사용. 공개 엔딩 크레딧의 근거·출처 해설과는 별개
2. **게스트 수명:** 승인된 쿠키·DB 세션 7일 정책 반영 및 만료 회귀 테스트. 현재 코드의 30일 설정과 불일치
3. **단일 이어하기:** 게스트당 활성 플레이 1개, 시작/교체 시 이전 플레이 차단, 동시 시작 경합 검증
4. **명시적 포기:** V2 API에서 `GIVEN_UP` 처리, 완료 결과 MySQL에는 기록하지 않는 정책 검증
5. **콘텐츠 계약·리뷰:** 화재 판단 근거·출처 식별, 정전·조난·침수 실제 엔딩 경로 확인, 이후 스키마 동결
6. **공개용 최소 UI와 배포:** 시나리오 선택, 행동, 만료/오류, 이어하기, 엔딩/회고, Docker·CI·운영 보안

## 3. 구조 파악·역량 검증 기준 갱신

11월 16~17일 전체 데이터/요청 흐름과 모듈 책임, 타입과 변경 위치를 이미 분석했다. 따라서 **전면적인 구조 강의는 반복하지 않는다.**

- 확인된 기반: Controller→Service→엔진→Redis/MySQL 흐름 파악, DTO/플레이 상태/공개 View 구분, 특정 요구사항의 수정 위치 판단
- 짧게 보완할 지점: 상대 이벤트의 판정 순서, Redis CAS 성공 이후 MySQL 실패 시 Pending 복구, 스스로 문제를 재현하고 수정 지점을 찾는 능력
- **미검증 ≠ 미이해:** 위 지점은 짧은 설명·실습으로 확인하고, 통과하면 다시 다루지 않는다
- 반복 코드·보일러플레이트·테스트 작성은 AI에 위임 가능. **새로운 상태 일관성·동시성·장애복구 설계 판단은 사용자에게 먼저 기회를 준다**
- 무리하게 학습을 위한 중단 기간을 만들지 않고 **실제 기능 개발 안에서 이해도를 검증**한다

## 4. 바로 다음 블록: Playground 행동 이력 표시

**요구사항**
- `PlayViewV2.state`가 `CLEARED` 또는 `FAILED`일 때만 전체 `actionHistory`를 시각화한다
- `sequence`, `actionText`, `resultText`, `startedAtMinute`, `endedAtMinute` 표시
- PLAYING 중에는 전체 이력을 노출하지 않는다. 비공개 world 상태도 노출하지 않는다
- 기존 `POST /v2/plays/:playId/actions` 및 `GET /v2/plays/:playId`의 응답을 그대로 사용하며 백엔드 모델·DB 구조를 변경하지 않는다
- 종료 직후와 종료 결과 재조회에서 동일하게 표시된다

**완료 조건**
1. 화재 플레이 완료 시 수행한 행동 수와 화면 목록 수 일치
2. 시간 순서·결과 메시지 확인 가능
3. 진행 중 화면에는 전체 이력 없음
4. 11월 18일 기준 전체 테스트를 다시 실행해 회귀 여부 확인
5. 사용자가 결과 화면을 직접 확인하고, 다음 백엔드 블록의 상태·예외 정책을 명세할 수 있음

## 5. 현 시점 유의사항

- `README.md` 및 `IMPLEMENTATION_MATRIX.md`의 일부 11월 17일 '상대 이벤트 미연결', '세계선 X만', '행동 이력 미구현' 표시는 **과거 시점 기록**이다
- `PlayViewV2.actionHistory`는 종료 후 공개되지만, 현재 `dev-playground.html`은 목록 형태로 렌더링하지 않는다
- X/Y/Z의 기존 대표 경로 확인과 전체 상태 공간의 완전한 무교착 증명은 구별한다
- 기능 완료 판정은 코드 구현, 자동 테스트, 실제 화면 확인, 문서 최신화를 구별해서 기록한다
