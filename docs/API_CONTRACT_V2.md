# Project IF V2 API 계약

이 문서는 `wip/f1-timeline-integration`의 공개 API를 기준으로 한다. 경로는 API 서버 기준이며 로컬 기본 주소는 `http://localhost:3000`이다. 본문이 있는 POST는 `Content-Type: application/json`을 사용한다. 예제의 UUID는 설명용이며 실제 요청에는 생성 또는 이어하기 응답의 `playId`를 사용한다.

## 게스트 인증과 수명

- 브라우저는 `guest_token` 쿠키를 자동으로 전송한다. 동일 출처의 상대 경로와 `fetch`의 기본 `credentials: 'same-origin'`을 사용하면 된다. 백엔드에는 별도 CORS 설정이 없으므로 로컬 프론트엔드도 동일 출처 개발 프록시를 통해 연결할 수 있다. 개발용 접근 제한 확인은 API 서버에 직접 루프백으로 접속한다.
- 시작 성공 시 유효한 기존 쿠키를 재사용한다. 쿠키가 없거나 형식이 잘못됐거나 MySQL에서 유효한 세션을 찾을 수 없으면 신규 게스트와 세션을 생성하고 `201` 응답에 `Set-Cookie`를 보낸다. 토큰은 32바이트 난수의 16진수 표현이며 MySQL에는 SHA-256 해시를 저장한다.
- 쿠키는 `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=604800`이며 `NODE_ENV=production`에서 `Secure`가 추가된다. 쿠키와 MySQL 세션은 발급 시점부터 7일간 유효하며 시작 시 재사용, 조회, 행동으로 갱신되지 않는다. 프론트엔드는 JS로 쿠키를 읽을 필요가 없다.
- 플레이와 활성 인덱스는 생성 시 3600초 TTL을 갖는다. Redis CAS에 성공하면 플레이 TTL은 다시 3600초가 된다. 계속 `PLAYING`인 경우 해당 플레이를 가리키는 활성 인덱스의 TTL도 갱신하고, 성공·실패·포기 시에는 해당 인덱스를 삭제한다. 조회와 거절된 변경 요청은 TTL을 갱신하지 않는다.
- 종료 또는 포기한 플레이의 조회 가능 시간도 마지막 반영부터 최대 3600초이며 유효한 게스트 세션이 필요하다. Redis에서 사라지면 ID 조회는 `404`다. MySQL 결과에 대한 공개 조회 API와 별도의 `EXPIRED` 상태는 없다.

## 1. 공개 시나리오 목록

`GET /v2/scenarios`에는 쿠키와 요청 본문이 필요 없다. `200 OK`로 공개 등록된 시나리오 요약 배열을 반환한다. 목록의 `version`은 콘텐츠 버전 문자열이다.

```json
[
  {
    "scenarioId": "office_fire_01",
    "title": "퇴근하겠습니다",
    "version": "0.6.4-v2-candidate.1"
  }
]
```

공개 시나리오 파일 읽기 또는 검증 실패 시 `500`이 발생할 수 있다. `office_fire_01`만 공개 등록돼 있다. 로컬 개발 및 테스트의 비공개 생성 예외가 이 목록을 바꾸지는 않는다.

## 2. 플레이 생성

`POST /v2/plays`는 게스트 쿠키 없이 호출할 수 있다. `scenarioId`는 비어 있지 않은 문자열이다.

```json
{
  "scenarioId": "office_fire_01"
}
```

`201 Created` 응답의 `view.version`은 0이다.

```json
{
  "playId": "d9729184-0d1e-48dc-aa01-f8f8597a1100",
  "view": {
    "scenarioId": "office_fire_01",
    "scenarioTitle": "퇴근하겠습니다",
    "state": "PLAYING",
    "version": 0,
    "currentSceneId": "OFFICE_START",
    "sceneDescription": "금요일 밤 10시, 사무실에 혼자 남았습니다. 컴퓨터 화면에는 작업 중인 문서가 열려 있고, 외투와 가방은 책상 옆에 있습니다. 아직 특별한 이상 징후는 없습니다.",
    "storyTimeMinutes": 0,
    "knownFacts": [],
    "actions": [
      {"id": "LEAVE_NOW", "text": "작업을 저장하고 바로 퇴근한다", "available": true},
      {"id": "FINISH", "text": "남은 문서 작업을 마무리하고 퇴근한다", "available": true},
      {"id": "RESTROOM", "text": "화장실에 다녀와 자리로 돌아온다", "available": true},
      {"id": "URGENT", "text": "퇴근 전 업무 연락을 처리한다", "available": true}
    ]
  }
}
```

- `400`은 DTO 검증 실패다.
- `404`는 미등록 시나리오 또는 공개 접근이 허용되지 않은 시나리오다. 비공개 등록 시나리오의 시작은 `development`의 루프백 요청과 `test`에서 허용한다.
- `409`는 같은 게스트·시나리오에 유효한 `PLAYING` 플레이가 있다는 뜻이다. 기존 `playId`는 오류 응답에 포함되지 않는다. 해당 시나리오의 활성 조회를 호출한다.
- `500`은 플레이 ID 충돌, 시나리오 파일 오류, 저장소 장애 등 서버 실패에 해당한다. 요청 결과가 불명확하면 활성 조회로 확인한다.

## 3. 시나리오별 활성 플레이 조회

`GET /v2/plays/active/:scenarioId`에는 유효한 게스트 쿠키가 필요하고 요청 본문은 없다. 예제 경로는 `/v2/plays/active/office_fire_01`이다.

`200 OK` 응답 예시다.

```json
{
  "activePlay": {
    "playId": "d9729184-0d1e-48dc-aa01-f8f8597a1100",
    "view": {
      "scenarioId": "office_fire_01",
      "scenarioTitle": "퇴근하겠습니다",
      "state": "PLAYING",
      "version": 0,
      "currentSceneId": "OFFICE_START",
      "sceneDescription": "금요일 밤 10시, 사무실에 혼자 남았습니다. 컴퓨터 화면에는 작업 중인 문서가 열려 있고, 외투와 가방은 책상 옆에 있습니다. 아직 특별한 이상 징후는 없습니다.",
      "storyTimeMinutes": 0,
      "knownFacts": [],
      "actions": [
        {"id": "LEAVE_NOW", "text": "작업을 저장하고 바로 퇴근한다", "available": true},
        {"id": "FINISH", "text": "남은 문서 작업을 마무리하고 퇴근한다", "available": true},
        {"id": "RESTROOM", "text": "화장실에 다녀와 자리로 돌아온다", "available": true},
        {"id": "URGENT", "text": "퇴근 전 업무 연락을 처리한다", "available": true}
      ]
    }
  }
}
```

인덱스나 플레이가 없거나 인덱스가 소유자·시나리오·진행 상태가 맞지 않는 플레이를 가리키면 다음을 반환한다. 서버는 이 조회에서 시나리오 등록 여부를 선검사하지 않는다.

```json
{
  "activePlay": null
}
```

- `401`은 게스트 쿠키가 없거나 유효하지 않다는 뜻이다. 첫 방문 시 정상적으로 발생할 수 있으며 시작 화면을 표시한다. 세션이 만료된 경우도 새 시작을 안내한다.
- 활성 데이터가 가리키는 시나리오가 등록에서 빠졌다면 `404`, 콘텐츠 로딩·렌더링 오류나 저장소 장애는 `500`이 될 수 있다.

## 4. 플레이 조회

`GET /v2/plays/:playId`에는 유효한 소유자 게스트 쿠키가 필요하고 요청 본문은 없다. `200 OK`의 본문은 `PlayViewV2`다. ID는 경로에서 알고 있어야 한다. 아래는 행동 직후 조회한 예다.

```json
{
  "scenarioId": "office_fire_01",
  "scenarioTitle": "퇴근하겠습니다",
  "state": "PLAYING",
  "version": 1,
  "currentSceneId": "HALL6",
  "sceneDescription": "조용한 6층 공용 홀입니다. 엘리베이터 층수 표시는 정상적으로 바뀌고 있습니다. 계단실 방화문은 닫혀 있고 아래층 상황은 보이지 않습니다.",
  "storyTimeMinutes": 1,
  "knownFacts": [],
  "actions": [
    {"id": "CALL_ELEV", "text": "엘리베이터를 호출한다", "available": true},
    {"id": "STAIRS", "text": "계단실로 들어간다", "available": true},
    {"id": "STAIRS_PASS_5", "text": "계단실로 들어가 아래층까지 내려간다", "available": false},
    {"id": "CHECK_PHONE", "text": "메시지를 잠시 확인한다", "available": true},
    {"id": "CALL119_HALL", "text": "경보를 듣고 119에 현재 위치를 알린다", "available": false},
    {"id": "CHECK_LIFT_AFTER_RECALL", "text": "승강기가 다시 이용 가능한지 호출 표시를 확인한다", "available": false}
  ]
}
```

`401`은 인증 실패, `404`는 플레이 부재·만료·소유권 불일치 또는 시나리오 미등록, `500`은 콘텐츠·저장소 등 서버 오류다.

## 5. 행동 제출

`POST /v2/plays/:playId/actions`에는 유효한 소유자 게스트 쿠키가 필요하다. 2번의 초기 상태에서 보내는 요청 예시다.

```json
{
  "actionId": "LEAVE_NOW",
  "expectedVersion": 0
}
```

`200 OK`는 해당 행동의 `resultText`와 반영된 새 `view`를 반환한다.

```json
{
  "resultText": "가방과 외투를 챙겨 복도로 나섰습니다.",
  "view": {
    "scenarioId": "office_fire_01",
    "scenarioTitle": "퇴근하겠습니다",
    "state": "PLAYING",
    "version": 1,
    "currentSceneId": "HALL6",
    "sceneDescription": "조용한 6층 공용 홀입니다. 엘리베이터 층수 표시는 정상적으로 바뀌고 있습니다. 계단실 방화문은 닫혀 있고 아래층 상황은 보이지 않습니다.",
    "storyTimeMinutes": 1,
    "knownFacts": [],
    "actions": [
      {"id": "CALL_ELEV", "text": "엘리베이터를 호출한다", "available": true},
      {"id": "STAIRS", "text": "계단실로 들어간다", "available": true},
      {"id": "STAIRS_PASS_5", "text": "계단실로 들어가 아래층까지 내려간다", "available": false},
      {"id": "CHECK_PHONE", "text": "메시지를 잠시 확인한다", "available": true},
      {"id": "CALL119_HALL", "text": "경보를 듣고 119에 현재 위치를 알린다", "available": false},
      {"id": "CHECK_LIFT_AFTER_RECALL", "text": "승강기가 다시 이용 가능한지 호출 표시를 확인한다", "available": false}
    ]
  }
}
```

- `400`은 DTO 오류 또는 현재 장면에 존재하지 않는 행동 ID다. `actionId`는 비어 있지 않은 문자열이고 `expectedVersion`은 0 이상의 JSON 정수다.
- `401`은 인증 실패, `404`는 플레이 부재·만료·소유권 불일치 또는 시나리오 미등록이다.
- `409`는 이전 버전, 진행 중이 아닌 상태, 현재 실행할 수 없는 행동 또는 Redis CAS 실패다. 서비스가 읽은 직후 플레이가 만료될 경우에도 CAS가 실패해 `409`가 될 수 있다.
- `500`은 엔진·콘텐츠·저장소 오류 등이다. 특히 종료 상태가 Redis에서 반영된 뒤 MySQL 저장이나 Pending 삭제가 실패해도 `500`이 반환될 수 있다.

## 6. 플레이 포기

`POST /v2/plays/:playId/give-up`에는 유효한 소유자 게스트 쿠키가 필요하다. 위 행동 직후 포기를 요청하는 예시다.

```json
{
  "expectedVersion": 1
}
```

`200 OK`는 `GIVEN_UP` 상태의 `PlayViewV2`를 직접 반환한다. 활성 인덱스가 제거되며 MySQL 완료 로그에는 기록하지 않는다.

```json
{
  "scenarioId": "office_fire_01",
  "scenarioTitle": "퇴근하겠습니다",
  "state": "GIVEN_UP",
  "version": 2,
  "currentSceneId": "HALL6",
  "sceneDescription": "조용한 6층 공용 홀입니다. 엘리베이터 층수 표시는 정상적으로 바뀌고 있습니다. 계단실 방화문은 닫혀 있고 아래층 상황은 보이지 않습니다.",
  "storyTimeMinutes": 1,
  "knownFacts": [],
  "actions": []
}
```

`400`은 누락되거나 유효하지 않은 `expectedVersion`, `401`은 인증 실패, `404`는 플레이 부재·만료·소유권 불일치 또는 시나리오 미등록, `409`는 이전 버전·진행 중이 아닌 상태·CAS 실패, `500`은 콘텐츠·저장소 등 서버 오류다.

## PlayViewV2와 화면 표시

| 필드 | 타입과 의미 |
|---|---|
| `scenarioId`, `scenarioTitle` | 문자열. 시나리오 식별자와 제목 |
| `state` | `PLAYING`, `CLEARED`, `FAILED`, `GIVEN_UP` |
| `version` | 정수. 플레이 변경 버전. 생성은 0, 행동·포기가 성공하면 1 증가 |
| `currentSceneId`, `sceneDescription` | 문자열. 현재 장면 ID와 서버가 판정한 표시 문구 |
| `storyTimeMinutes` | 숫자. 가상 경과 시간(분). 소수 가능 |
| `knownFacts` | 문자열 배열. 플레이어가 획득한 사실 ID |
| `actions` | `{ id: string, text: string, available: boolean }[]`. 진행 중에는 실행할 수 없는 행동도 포함될 수 있다. 종료·포기 시 빈 배열 |
| `ending` | `{ id: string, title: string, description: string }`. `CLEARED`·`FAILED`에서만 포함 |
| `actionHistory` | `CLEARED`·`FAILED`에서만 포함. 이전 상태 데이터에 이력이 없으면 빈 배열 |

이력 항목은 순번 `sequence`(1부터 시작), 장면 ID `fromSceneId`·`toSceneId`, 행동 ID와 문구 `actionId`·`actionText`, 당시 결과 `resultText`, 가상 분 단위 숫자 `startedAtMinute`·`endedAtMinute`를 담는다. 예를 들어 5번 행동 이후 다른 행동을 이어가 성공 결말에 도달했을 때 마지막 이력 항목은 다음과 같이 반환될 수 있다.

```json
{
  "ending": {
    "id": "END_EVACUATED",
    "title": "조기 자력 대피",
    "description": "화재경보가 시작되기 전에 정면 출입구로 건물 밖에 나왔습니다. 당시에는 연기 등 화재 징후를 직접 확인하지 못했습니다. 이후의 화재 상황과 별개로 조기에 밖으로 나왔습니다."
  },
  "actionHistory": [
    {
      "sequence": 5,
      "fromSceneId": "FRONT_OUT",
      "toSceneId": "FRONT_OUT",
      "actionId": "GO_HOME",
      "actionText": "그대로 집으로 향한다",
      "resultText": "건물 밖으로 안전하게 빠져나왔습니다.",
      "startedAtMinute": 2.33,
      "endedAtMinute": 2.83
    }
  ]
}
```

위 JSON은 두 필드와 마지막 항목만 발췌한 것이다. 엔딩은 `ending`으로, 회고는 `actionHistory`의 순서로 렌더링한다. `GIVEN_UP`에는 두 필드가 모두 생략된다. 상태 원본(`world`, `player`, 원시 지식 객체), 조건·효과, 예약 타임라인, 사용자 번호, 토큰 해시 및 저장용 시나리오 버전은 공개 View에 포함되지 않는다. GET은 현재 View를 돌려주며 진행 중의 직전 `resultText`를 따로 제공하지 않는다.

## 프론트엔드 오류 처리와 재시작

1. **진입과 이어하기** — 시나리오 목록에서 선택한 ID의 활성 플레이를 조회한다. `200`에서 객체를 받으면 이어하기와 새로 시작을 제시한다. `activePlay: null`이나 첫 방문의 `401`이면 사용자 조작으로 생성한다. 인증 오류가 기존 플레이 화면에서 발생하면 이전 플레이를 더 이상 조작할 수 없음을 알리고 시나리오 선택으로 이동한다.
2. **중복 생성** — 시작 중 버튼을 비활성화한다. `409`가 오면 같은 시나리오의 활성 조회로 기존 플레이를 찾는다. 조회 사이에 종료·만료되어 `null`이면 다시 시작할 수 있다. 중복 방지 범위는 유효한 게스트·시나리오 조합이므로 첫 쿠키 발급 전의 동시 시작은 서로 다른 게스트를 만들 수 있다.
3. **새로 시작** — 사용자가 기존 진행 포기를 확인하면 활성 플레이의 ID와 최신 버전으로 포기 요청을 보낸다. `GIVEN_UP` 확인 후 같은 시나리오를 다시 생성한다. 포기와 생성은 별도 요청이며 경합으로 다시 `409`가 오면 활성 조회부터 확인한다.
4. **버전 충돌** — 행동·포기 시 표시 중인 `view.version`을 `expectedVersion`으로 보낸다. `409` 후에는 해당 ID를 GET으로 다시 조회하고 화면을 갱신한다. 최신 화면에서 사용자가 의도한 작업을 다시 결정하도록 하고, 새 버전으로 이전 선택을 자동 제출하지 않는다.
5. **통신 실패와 `500`** — 생성 결과가 불명확하면 시나리오별 활성 조회, 행동·포기 결과가 불명확하면 해당 ID 조회를 먼저 한다. 초기 생성에서 응답 쿠키를 받지 못했다면 활성 조회는 `401`일 수 있다. 변경 후 조회에서 종료 상태 또는 더 큰 버전을 받으면 그 View를 표시한다. 원래의 `resultText`를 재생하는 요청 ID 기능은 없다. 같은 버전이고 아직 `PLAYING`이면 최신 화면에서 재시도를 제시한다. `404`면 활성 조회 또는 시나리오 선택으로 돌아간다. 재조회도 실패하면 재조회 버튼을 제공한다.

Nest 오류 응답 예시는 다음과 같다. DTO 검증 오류에는 `message`가 문자열 배열일 수 있고 일반 서버 오류의 필드는 다를 수 있다. 화면 분기는 HTTP 상태와 요청의 종류를 기준으로 한다.

```json
{
  "message": "이미 진행 중인 플레이가 존재합니다.",
  "error": "Conflict",
  "statusCode": 409
}
```


```json
{
  "message": [
    "expectedVersion must be an integer number"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```


구현 근거는 [V2 컨트롤러](../api/src/plays/plays-v2.controller.ts), [목록 컨트롤러](../api/src/plays/scenarios-v2.controller.ts), [플레이 서비스](../api/src/plays/plays.service.ts), [공개 View](../api/src/plays/play-view-builder-v2.ts), [Redis 저장소](../api/src/redis/redis.service.ts)에서 확인할 수 있다.
