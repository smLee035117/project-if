# Project IF

사용자의 선택에 따라 진행 결과가 달라지는 인터랙티브 시나리오 서비스입니다.

재난·생존 상황 등 다양한 시나리오에서 사용자가 직접 상황을 판단하고 선택하며, 그 결과에 따라 점수와 진행 상태가 달라지는 경험을 제공하는 것을 목표로 합니다.

단순히 정답을 맞히는 방식이 아니라, 실제 상황에서 고민할 만한 선택지와 그에 따른 결과를 경험할 수 있는 서비스를 지향합니다.

현재 TypeScript와 NestJS를 기반으로 백엔드 API를 개발하고 있으며, Redis를 이용한 플레이 상태 관리와 MySQL을 이용한 최종 결과 저장 기능을 구현했습니다.

## 현재 개발 상태

### 구현 완료

**시나리오 및 플레이 엔진**
- TypeScript 기반 플레이 상태 및 점수 계산 로직
- JSON 기반 시나리오 로딩 및 데이터 구조 검증
- 선택 결과에 따른 점수 변경과 종료 판정
- `GOOD`, `BAD`, `WORST`, `INSTANT_DEATH` 등급 처리
- 플레이 상태를 `PlayData` 객체로 관리
- CLI 기반 초기 프로토타입 구현

**NestJS API**
- 시나리오 조회 및 검증
- 플레이 생성 및 진행 상태 조회
- 단계별 선택 요청 처리
- 쿠키 기반 게스트 인증 및 플레이 소유권 검증
- 잘못된 요청, 만료된 플레이, 중복 요청에 대한 예외 처리

**Redis 상태 관리**
- 플레이 상태 저장 및 조회
- 플레이 데이터 TTL 3600초 설정
- Lua 스크립트 기반 조건부 상태 갱신(CAS)
- 중복·동시 요청에서 상태 변경 충돌 방지
- MySQL 저장 대기 결과를 위한 pending 데이터 생성·조회·삭제
- SCAN 기반 pending 플레이 ID 탐색 메서드 구현

**MySQL 데이터 관리**
- 프로젝트 DB 및 앱 전용 계정 구성
- 게스트 사용자 및 세션 정보 관리
- 종료된 플레이 결과 저장
- 동일한 결과 재저장 시 멱등성 보장
- 동일한 `playId`로 서로 다른 결과를 저장하려는 경우 불일치 감지

**테스트**
- Vitest 기반 단위 테스트 및 통합 테스트
- 플레이 점수·종료 판정 테스트
- Redis CAS 순차·동시 요청 검증
- MySQL 결과 저장 및 멱등성 검증
- DB 저장 실패 상황 Mock 테스트
- pending 생성·조회·삭제 검증
- API의 실제 종료 처리와 MySQL·Redis 연동 확인

2026년 11월 11일 기준, 전체 테스트 7개 파일의 **25개 테스트가 통과**했습니다.

### 진행 중

- Redis pending 결과의 MySQL 재저장 처리
- 미저장 결과 자동 복구 및 장애 상황 테스트
- 포기하기 API 구현
- 종료 결과 조회 API 구현

### 향후 개발 예정

- 실제 서비스용 재난·생존 시나리오 확장
- 사용자가 직접 플레이할 수 있는 웹 UI
- Docker 기반 실행 환경 구성
- GitHub Actions 테스트 자동화
- 서비스 배포 및 운영 환경 구성
- README 및 기술 문서 보강

## 기술 스택

| 구분 | 기술 |
|---|---|
| Runtime | Node.js 26.13.0 |
| Language | TypeScript 7.0.2 |
| Framework | NestJS 11.x |
| API | REST API |
| Database | MySQL 8.4.13 |
| Cache / State | Redis 7.x |
| Testing | Vitest |
| Package Manager | npm 11.20.0 |
| Development OS | Windows / WSL Ubuntu |
| Version Control | Git, GitHub |

## 주요 기능 및 설계

### 플레이 상태 관리

플레이는 다음 네 가지 상태로 구분합니다.

```typescript
type PlayState =
  | 'PLAYING'
  | 'CLEARED'
  | 'FAILED'
  | 'GIVEN_UP';
```

플레이 데이터에는 사용자 ID, 시나리오 ID, 점수, 현재 단계 및 진행 상태가 포함됩니다.

진행 중인 플레이는 Redis에 저장하며, 현재 설정된 TTL은 3600초입니다.

### 선택 결과와 종료 판정

각 선택지에는 다음 등급 중 하나를 부여합니다.

| 선택 등급 | 처리 |
|---|---|
| GOOD | 점수 유지 |
| BAD | 5점 차감 |
| WORST | 25점 차감 |
| INSTANT_DEATH | 즉시 실패 |

- 초기 점수는 100점입니다.
- 점수가 0 이하가 되면 실패합니다.
- 마지막 단계까지 완료하면 클리어 처리합니다.
- 실제 시나리오에서는 선택지마다 사전에 정의된 판정을 적용합니다.

### 게스트 인증

별도의 회원가입 없이 플레이를 시작할 수 있도록 게스트 인증을 구현했습니다.

- 게스트 식별용 토큰 생성
- 토큰 해시를 이용한 서버 측 사용자 식별
- 쿠키 기반 게스트 인증
- 플레이 조회 및 선택 요청 시 소유권 확인

플레이 상태는 Redis에서 관리하고, 게스트 사용자 및 세션 정보는 MySQL에서 관리합니다.

### Redis 동시성 제어

동일한 플레이 단계에 여러 선택 요청이 동시에 들어오면 데이터가 중복 변경될 수 있습니다.

이를 방지하기 위해 Lua 스크립트 기반 CAS(Compare-And-Swap) 방식의 조건부 갱신을 구현했습니다.

갱신 전 다음 조건을 확인합니다.

1. 플레이 데이터가 존재하는지
2. 현재 상태가 `PLAYING`인지
3. 저장된 진행 단계와 요청에서 예상한 단계가 일치하는지

조건을 만족하는 요청만 상태를 변경합니다.

실제 Redis 통합 테스트에서 순차 요청과 동시 요청 중 하나만 갱신에 성공하는 동작을 확인했습니다.

### MySQL 결과 저장 및 멱등성

종료된 플레이 결과는 MySQL의 `user_play_log` 테이블에 저장합니다.

`play_id`를 기본키로 사용해 중복 기록을 방지합니다.

동일한 결과가 재전송되면 이미 저장된 데이터와 비교해 정상 처리하고, 기존 결과와 내용이 다르면 데이터 불일치 오류를 발생시키도록 구현했습니다.

이를 통해 중복 저장 요청에서도 최초 저장 결과가 유지되도록 처리했습니다.

### Redis pending 관리

Redis의 플레이 상태 갱신 이후 MySQL 저장에 실패할 경우, 종료 결과가 DB에 기록되지 않는 문제가 발생할 수 있습니다.

이를 대비해 종료 결과를 별도의 Redis pending 키에 보관하도록 구현했습니다.

- 플레이 종료 시 pending 생성
- MySQL 저장 성공 시 pending 삭제
- MySQL 저장 실패 시 pending 유지
- 저장 대기 중인 결과 조회 및 탐색

현재 pending 데이터의 생성·조회·삭제까지 구현하고 검증했습니다.

**남아 있는 pending을 자동으로 재처리하는 기능은 개발 중입니다.**

또한 Redis pending 자체만으로 영구적인 데이터 보존이 보장되지는 않으므로, 향후 Redis 영속성 및 장애 복구 정책을 추가로 검토할 예정입니다.

## API

현재 구현된 주요 API입니다.

| Method | Endpoint | 기능 |
|---|---|---|
| GET | `/plays` | API 동작 확인 |
| POST | `/plays` | 플레이 생성 |
| GET | `/plays/:playId` | 게스트 플레이 조회 |
| POST | `/plays/:playId/choices` | 선택 제출 및 상태 갱신 |

### 플레이 생성

```http
POST /plays
Content-Type: application/json
```

요청 예시:

```json
{
  "scenarioId": "blackout_test_01"
}
```

응답에는 생성된 `playId`와 초기 `playData`가 포함됩니다. 게스트 인증을 위한 쿠키도 설정됩니다.

### 선택 제출

```http
POST /plays/:playId/choices
Content-Type: application/json
```

요청 예시:

```json
{
  "stageId": "stage_01",
  "choiceId": "choice_a"
}
```

선택 결과에 따라 점수와 진행 상태가 변경됩니다.

이미 처리된 단계나 종료된 플레이에 대한 요청은 충돌 응답으로 거절됩니다.

## 프로젝트 구성

현재 개발은 초기 CLI 프로토타입과 NestJS API 프로젝트를 중심으로 구성되어 있습니다.

```text
project_if/
├── api/
│   ├── src/
│   │   ├── plays/        # 플레이 API 및 엔진
│   │   ├── redis/        # Redis 상태 관리
│   │   ├── database/     # MySQL 접근 및 결과 저장
│   │   └── guest/        # 게스트 토큰 처리
│   └── package.json
├── src/                 # 초기 CLI 프로토타입
├── dist/                # 컴파일 결과물
├── .env                 # 실제 환경 변수 (Git 제외)
├── .env.example         # 환경 변수 예시
├── .gitignore
└── README.md
```

API 구현과 관련된 단위·통합 테스트는 각 모듈의 `*.spec.ts` 파일에 작성하고 있습니다.

## 로컬 실행 방법

현재 개발 환경은 Windows이며 Redis는 WSL Ubuntu에서 실행합니다.

### 1. 패키지 설치

PowerShell에서 API 디렉터리로 이동합니다.

```powershell
cd D:\project_if\api
npm.cmd ci
```

### 2. 환경 변수 설정

프로젝트 루트의 `.env.example`을 참고해 `.env` 파일을 구성합니다.

DB 연결에 사용하는 주요 환경 변수는 다음과 같습니다.

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=project_if_app
DB_PASSWORD=
DB_NAME=project_if
```

`DB_PASSWORD`에는 로컬에서 설정한 실제 비밀번호를 입력해야 합니다.

현재 MySQL 연결에는 사전에 생성한 DB 및 테이블이 필요합니다. 자동 마이그레이션을 통한 초기 DB 구성은 아직 제공하지 않습니다.

### 3. Redis 실행

WSL Ubuntu 터미널에서 실행합니다.

```bash
sudo service redis-server start
```

연결 확인:

```bash
redis-cli ping
```

정상 응답:

```text
PONG
```

현재 Redis 연결 주소는 다음과 같습니다.

```text
redis://127.0.0.1:6379
```

### 4. NestJS 실행

PowerShell에서 API 디렉터리로 이동한 후 실행합니다.

```powershell
cd D:\project_if\api
npm.cmd run start:dev
```

기본 서버 주소:

```text
http://localhost:3000
```

동작 확인:

```powershell
curl.exe http://localhost:3000/plays
```

정상 응답:

```text
Plays API 정상 작동
```

## 테스트 실행

Vitest를 사용해 플레이 엔진, 서비스 로직, HTTP API 및 데이터 저장 동작을 검증합니다.

PowerShell에서 다음 명령으로 전체 테스트를 실행할 수 있습니다.

```powershell
cd D:\project_if\api
npx.cmd vitest run
```

Redis 및 MySQL 통합 테스트를 실행하려면 두 서비스가 정상적으로 실행 중이어야 합니다.

### 테스트 현황

2026년 11월 11일 기준:

| 테스트 영역 | 테스트 수 |
|---|---:|
| 플레이 엔진 | 8 |
| Redis 통합 테스트 | 5 |
| MySQL 통합 테스트 | 4 |
| PlaysService 단위 테스트 | 4 |
| Plays HTTP 테스트 | 2 |
| PlaysController 테스트 | 1 |
| AppController 테스트 | 1 |
| **합계** | **25** |

전체 테스트 파일 7개, 테스트 25개 통과를 확인했습니다.

## 초기 CLI 프로토타입

프로젝트 초기에는 시나리오 진행 규칙과 점수 계산 로직을 검증하기 위한 터미널 프로토타입을 구현했습니다.

- 임의 선택지를 이용한 20단계 진행
- 단계별 2개 선택지
- 점수 변경 및 종료 판정
- 사용자 입력 검증
- `gg` 입력을 통한 중도 포기

이후 실제 JSON 시나리오와 NestJS API 기반 구조로 개발을 확장했습니다.

현재 주요 개발 대상은 API 서비스이며, CLI 프로토타입은 초기 구현 과정의 기록으로 유지합니다.

## 접속 정보 및 보안

- MySQL 접속 시 관리자 계정 대신 권한을 제한한 앱 전용 계정을 사용합니다.
- DB 접속 정보는 `.env`로 분리합니다.
- `.env`, `node_modules`, `dist` 등은 Git 관리 대상에서 제외합니다.
- GitHub에 실제 비밀번호와 게스트 인증 토큰을 공개하지 않습니다.
- 게스트 토큰은 해시 기반으로 조회합니다.
- 플레이 조회 및 선택 요청 시 사용자 소유권을 확인합니다.
- 요청 데이터 검증과 서버 측 상태 검증을 분리해 처리합니다.

추가적인 보안 점검 및 운영 환경 설정은 배포 전에 진행할 예정입니다.

## 개발 기록

프로젝트의 기획, 구현 과정, 기술 선택과 문제 해결 과정을 개발 블로그에 기록하고 있습니다.

주요 기록 주제는 다음과 같습니다.

- 인터랙티브 시나리오 서비스 기획
- 선택지 및 점수·종료 규칙 설계
- TypeScript 기반 초기 프로토타입
- JSON 시나리오와 플레이 상태 관리
- NestJS API 및 게스트 세션 구성
- Redis 기반 동시성 제어
- MySQL 결과 저장과 멱등성
- 데이터 정합성 및 장애 복구 구조

프로젝트 개발이 진행되는 동안 README와 개발 기록도 지속적으로 갱신할 예정입니다.