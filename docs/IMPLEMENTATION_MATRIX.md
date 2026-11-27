# Project IF V2 기능 명세와 구현 대조표

2026-11-27 기준으로 `wip/f1-timeline-integration`의 로컬 코드와 테스트를 대조했다. 제품 목표는 [V2 제품 요구사항](PRODUCT_REQUIREMENTS_V2.md), 프론트엔드 연동 기준은 [V2 API 계약](API_CONTRACT_V2.md), 공개 전 확인 항목은 [릴리스 체크리스트](BACKEND_RELEASE_CHECKLIST.md)를 참고한다.

| 요구사항 | 현재 코드와 검증 | 남은 범위 |
|---|---|---|
| F01 목록·첫 장면 | `GET /v2/scenarios`는 공개된 ID·제목·콘텐츠 버전 제공. 시작 응답에는 공개 첫 장면과 행동 목록 포함. | 사용자용 시나리오 선택 화면 |
| F02 게스트·수명·소유권 | 쿠키 및 MySQL 세션 발급 후 7일. ID 조회·변경은 소유권 검사. Redis 생성·변경 성공 기준 1시간 TTL, GET은 연장 없음. | 배포 HTTPS에서 쿠키 검증, 만료 세션 데이터 정리 |
| F03 시작·이어하기·포기 | 게스트·시나리오 조합별 Lua 원자 생성과 중복 차단, 활성 조회, 버전 기반 포기. 종료·포기 후 추가 행동 거절. | 이어하기·포기 확인 UI와 재시작 흐름 |
| F04 장면·행동·효과·시간 | 공통 엔진이 시작 조건, 절대·상대 이벤트, 결과 조건, 효과, 장면 전이 및 공개 View 처리. 상대 예약은 트리거가 거짓에서 참으로 변하는 행동 이후 생성. | 비공개 작품별 게임 경로 검증 |
| F05 엔딩·회고 | `CLEARED`·`FAILED`에서 엔딩과 행동 이력 반환. 행동 직후 `resultText` 반환. 결과·이력의 HTTP·Redis·MySQL 경로를 화재 시나리오 테스트에서 확인. | 사용자용 엔딩 화면과 별도 판단 근거·출처 콘텐츠 |
| F06 동시성·복구 | Redis 버전 CAS, 종료와 Pending 원자 기록, MySQL 동일 결과 재저장, 부팅·주기 복구. 실패 응답 이후에는 현재 상태 재조회. | 운영 환경의 Redis 영속성·복구, 요청 ID 기반 동일 응답 재생은 보류 |
| F07 콘텐츠·버전 | 등록 JSON을 런타임에 로드·검증. 공개 대상은 `office_fire_01`만 등록. `apartment_fire_01`의 X/Y/Z 초기 변형은 해당 시나리오 시작 시 서버에서 추첨. | 비공개 작품의 개별 출시 검증, 콘텐츠 버전 교체 시 기존 플레이 보존 정책 |
| F08 웹·운영 | 로컬 개발 Playground, 운영 V1·개발 경로 차단, Redis URL 환경변수 사용. NestJS 빌드와 Vitest 36개 파일·376/376 통과(개인 학습용 포함). | 사용자용 웹, 재현 가능한 배포 구성, 실제 환경의 보안·운영 검증 |

## 코드와 검증 근거

- 공개 목록과 접근 정책은 [등록부](../api/src/plays/scenario-registry-v2.ts), [시나리오 HTTP 테스트](../api/src/plays/scenarios-v2.http.spec.ts), [플레이 HTTP 테스트](../api/src/plays/plays-v2.http.spec.ts), [V1 HTTP 테스트](../api/src/plays/plays.http.spec.ts), [개발용 HTTP 테스트](../api/src/plays/dev-scenarios.http.spec.ts)에서 확인한다.
- 행동과 시간은 [행동 엔진](../api/src/plays/action-engine-v2.ts), [시간 엔진](../api/src/plays/time-engine-v2.ts), [시간 통합 테스트](../api/src/plays/action-engine-v2.timeline.spec.ts), [최초 공개 시나리오 HTTP 통합 테스트](../api/src/plays/office-fire-v2.http.integration.spec.ts)에서 확인한다.
- 저장과 복구는 [Redis 통합 테스트](../api/src/redis/redis.service.integration.spec.ts), [MySQL 통합 테스트](../api/src/database/database-v2.integration.spec.ts), [V2 복구 통합 테스트](../api/src/plays/plays-v2.recovery.integration.spec.ts), [복구 스케줄러](../api/src/plays/play-recovery-bootstrap.service.ts)에서 확인한다.

## 과거 기록

[MVP 초기 계획](MVP_PLAN.md), [초기 세션 설계](play-session-design.md), [RC2.1 호환성 감사](V2_SCENARIO_COMPATIBILITY_AUDIT.md), [2026-11-19 개발 인계](DEVELOPMENT_STATUS_20261119.md)는 각각 작성 시점의 설계와 개발 기록이다. 최신 구현은 이 대조표와 API 계약을 기준으로 확인한다.
