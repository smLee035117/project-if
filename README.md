# Project IF

사용자의 선택에 따라 진행 결과가 달라지는 인터랙티브 시나리오 서비스입니다.

재난·생존 상황 등 다양한 시나리오에서 사용자가 직접 선택하고, 그 결과에 따라 점수와 진행 상태가 달라지는 경험을 제공하는 것을 목표로 합니다.

TypeScript와 Node.js를 기반으로 개발하고 있으며, 향후 API와 MySQL을 연동해 플레이 상태 및 기록을 관리할 예정입니다.

## 현재 개발 상태

### 완료

- Node.js 및 TypeScript 개발 환경 구성
- MySQL 프로젝트 DB 및 앱 전용 계정 생성
- DB 접속 및 기본 조회 확인
- 20단계 선택지 생성 프로토타입 구현
- 선택 결과에 따른 점수 계산 및 종료 판정
- 터미널 입력 검증 및 중도 포기 처리
- TypeScript 유니언 타입 및 인터페이스 정의
- `noUncheckedIndexedAccess`를 고려한 배열 접근 코드 개선

### 진행 예정

- 플레이 상태를 `PlayData` 객체로 관리
- 입력 처리와 선택 결과 판정 로직 분리
- API 구현 및 DB 연동
- 플레이 기록 저장 및 조회
- 실제 시나리오 데이터 구조 설계 및 적용
- 동시 요청 및 데이터 정합성 처리

현재는 터미널에서 동작하는 1차 프로토타입 단계이며, API와 DB를 통한 플레이 기록 저장 기능은 아직 구현하지 않았습니다.

## 기술 스택

| 구분 | 기술 |
|---|---|
| Runtime | Node.js 26.13.0 |
| Language | TypeScript 7.0.2 |
| Package Manager | npm 11.20.0 |
| Database | MySQL 8.4.13 |
| Development OS | Windows |
| Version Control | Git, GitHub |

## 프로토타입 기능

현재 프로토타입은 임의로 생성한 선택지 데이터를 이용해 진행됩니다.

- 총 20단계, 단계별 2개 선택지
- 선택 결과: `GOOD`, `BAD`, `WORST`, `INSTANT_DEATH`
- 초기 점수: 100점
- BAD 선택 시 5점 차감
- WORST 선택 시 25점 차감
- INSTANT_DEATH 선택 시 즉시 실패
- 점수 0 이하일 경우 실패
- 마지막 단계까지 생존하면 클리어
- `gg` 입력 시 중도 포기

선택 결과는 테스트 목적으로 무작위 생성되며, 실제 시나리오에서는 각 선택지에 고정된 판정을 적용할 예정입니다.

플레이 상태는 다음과 같이 구분합니다.

```ts
type PlayState =
    | "PLAYING"
    | "CLEARED"
    | "FAILED"
    | "GIVEN_UP";
```

## 프로젝트 구조

```text
project_if/
├── src/             # TypeScript 소스 코드
├── dist/            # 컴파일 결과물 (Git 제외)
├── .env             # 실제 DB 접속 정보 (Git 제외)
├── .env.example     # 환경 변수 설정 예시
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## 실행 방법

### 1. 패키지 설치

프로젝트 루트 폴더에서 실행합니다.

```cmd
npm.cmd ci
```

### 2. TypeScript 컴파일

```cmd
npx.cmd tsc -p . --noEmitOnError
```

### 3. 프로토타입 실행

```cmd
node dist/baseAction.js
```

터미널에서 0 또는 1을 입력해 선택지를 진행할 수 있습니다.

`gg`를 입력하면 중도 포기합니다.

## MySQL 연결 확인

MySQL 서버가 실행 중이어야 하며, 다음 데이터베이스 및 계정이 필요합니다.

- 데이터베이스: `project_if`
- 계정: `project_if_app@localhost`
- 권한: `SELECT`, `INSERT`, `UPDATE`, `DELETE`

`.env.example`을 `.env`로 복사하고 실제 접속 정보를 입력합니다. 기존 `.env`가 있다면 덮어쓰지 않습니다.

컴파일 후 다음 명령으로 연결을 확인할 수 있습니다.

```cmd
node --env-file=.env dist/db-check.js
```

정상 연결 시 확인되는 값:

```text
db: project_if
account: project_if_app@localhost
ok: 1
```

현재 MySQL 연결 확인 기능과 시나리오 프로토타입은 별도로 실행됩니다.

## 접속 정보 및 보안

- 데이터베이스 접속 시 `root` 대신 권한을 제한한 앱 전용 계정을 사용합니다.
- DB 비밀번호 등 실제 접속 정보는 `.env`에 저장합니다.
- `.env`, `node_modules`, `dist`는 Git 관리 대상에서 제외합니다.
- GitHub에는 실제 비밀번호를 포함하지 않은 `.env.example`만 공개합니다.

## 개발 기록

프로젝트 기획부터 구현 과정까지 개발 블로그에 기록하고 있습니다.

- 시나리오 진행 및 선택지 구조 설계
- 플레이 상태와 기록 관리 방식 검토
- TypeScript 기반 1차 프로토타입 구현
- 이후 API 및 데이터베이스 연동 과정 기록 예정