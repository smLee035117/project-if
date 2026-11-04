# 이벤트·미션·보상 처리 프로젝트

TypeScript와 MySQL을 사용하여 이벤트 참여, 미션 진행,
보상 지급 및 운영 기능을 구현하는 학습 프로젝트입니다.

## 현재 진행 상태

- TypeScript 컴파일·실행 확인
- MySQL 프로젝트 DB 및 앱 전용 계정 생성
- 앱 계정으로 DB 접속·조회 확인
- 서비스 기능과 테이블 설계는 아직 진행 전

## 개발 환경

- Windows
- Node.js 26.13.0
- npm 11.20.0
- TypeScript 7.0.2
- MySQL 8.4.13

## 폴더와 파일

- src/: TypeScript 소스 코드
- dist/: 컴파일 결과물, Git 제외
- .env: 실제 DB 접속 정보, Git 제외
- .env.example: 접속 설정 양식

## 실행 준비

프로젝트 루트 폴더에서 패키지를 설치합니다.

```cmd
npm.cmd ci
```

MySQL 서버가 실행 중이어야 하며, 다음 DB와 계정이 필요합니다.

- 데이터베이스: project_if
- 계정: project_if_app@localhost
- 권한: project_if DB의 SELECT, INSERT, UPDATE, DELETE

.env.example을 .env로 복사하고, 앱 계정의 실제 비밀번호를 입력합니다.
기존 .env가 있다면 덮어쓰지 않습니다.

## 컴파일 및 DB 연결 확인

프로젝트 루트 폴더에서 실행합니다.

```cmd
npx.cmd tsc -p . --noEmitOnError
```

컴파일이 성공하면 다음 명령을 실행합니다.

```cmd
node --env-file=.env dist/db-check.js
```

정상 결과:

- db: project_if
- account: project_if_app@localhost
- ok: 1
- MySQL 연결 확인 완료

## 접속 정보 관리

앱은 root 대신 권한을 제한한 전용 계정을 사용합니다.
실제 비밀번호는 .env에 보관하고 Git에 포함하지 않습니다.