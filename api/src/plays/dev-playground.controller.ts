import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Request, Response } from 'express';
import { PlaysService } from './plays.service.js';

@Controller('dev')
export class DevPlaygroundController {
  constructor(private readonly playsService: PlaysService) {}

  private assertLocalDevelopment(request: Request): void {
    const clientIp = request.ip ?? request.socket.remoteAddress ?? '';
    const isLoopback = [
      '127.0.0.1',
      '::1',
      '::ffff:127.0.0.1',
    ].includes(clientIp);

    if (process.env.NODE_ENV !== 'development' || !isLoopback) {
      throw new NotFoundException();
    }
  }

  @Get('playground')
  async getPlayground(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    this.assertLocalDevelopment(request);

    const html = await readFile(
      resolve(process.cwd(), 'public', 'dev-playground.html'),
      'utf8',
    );

    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    response.type('html').send(html);
  }

  @Get('plays/:playId/debug')
  async getPlayDebugState(
    @Param('playId') playId: string,
    @Req() request: Request,
  ) {
    this.assertLocalDevelopment(request);

    const token: unknown = request.cookies?.guest_token;
    const play = await this.playsService.getPlayDataV2ForGuest(
      playId,
      typeof token === 'string' ? token : undefined,
    );

    // 내부 world 상태를 포함하므로 로컬 개발 환경 외에서는 제공하지 않습니다.
    return {
      state: play.state,
      version: play.version,
      currentSceneId: play.currentStageId,
      storyTimeMinutes: play.storyTimeMinutes,
      scenarioState: play.scenarioState,
      timelineProgress: play.timelineProgress,
    };
  }
}
