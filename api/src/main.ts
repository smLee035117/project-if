import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

import { ValidationPipe } from '@nestjs/common';

import cookieParser from 'cookie-parser';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);


  app.use(cookieParser());

  // DTO 유효성 검증 설정
  app.useGlobalPipes(new ValidationPipe());

  // 서버 종료 시 생명주기 훅 활성화
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
