# Project IF API

Project IF의 NestJS 백엔드입니다. 이 디렉터리에서 서버, 빌드, Vitest를 실행합니다. MySQL 스키마와 Redis 설정은 [저장소 README](../README.md#로컬-실행)를 참고하세요.

```powershell
npm.cmd ci
$env:NODE_ENV = 'development'
npm.cmd run start:dev
```

빌드와 전체 테스트는 `npm.cmd run build`, `npm.cmd test`로 실행합니다. 테스트용 MySQL·Redis와 V1 테이블 준비 조건은 저장소 README에 있습니다.

- [V2 API 계약](../docs/API_CONTRACT_V2.md)
- [백엔드 릴리스 체크리스트](../docs/BACKEND_RELEASE_CHECKLIST.md)
