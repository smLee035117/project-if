import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  Res,
} from '@nestjs/common';

import type { Request, Response } from 'express';

import { PlaysService } from './plays.service.js';
import { StartPlayDto } from './dto/start-play.dto.js';

import type { PlayViewV2 } from './types/play-view-v2.js';

import { HttpCode } from '@nestjs/common';
import { SubmitActionV2Dto } from './dto/submit-action-v2.dto.js';



@Controller('v2/plays')
export class PlaysV2Controller {
  constructor(
    private readonly playsService: PlaysService,
  ) {}

  @Post()
  async startPlay(
    @Body() body: StartPlayDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{
    playId: string;
    view: PlayViewV2;
  }> {
    const token: unknown =
      request.cookies?.guest_token;

    const { playId, view, newToken } =
      await this.playsService.startPlayV2(
        body.scenarioId,
        typeof token === 'string'
          ? token
          : undefined,
      );

    if (newToken !== null) {
      response.cookie('guest_token', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    }

    return {
      playId,
      view,
    };
  }

  @Get(':playId')
  async getPlay(
    @Param('playId') playId: string,
    @Req() request: Request,
  ): Promise<PlayViewV2> {
    const token: unknown =
      request.cookies?.guest_token;

    return this.playsService.getPlayViewV2ForGuest(
      playId,
      typeof token === 'string'
        ? token
        : undefined,
    );
  }


  @Post(':playId/actions')
  @HttpCode(200)
  async submitAction(
    @Param('playId') playId: string,
    @Body() body: SubmitActionV2Dto,
    @Req() request: Request,
  ): Promise<{
    resultText: string;
    view: PlayViewV2;
  }> {
    const token: unknown =
      request.cookies?.guest_token;

    return this.playsService.submitActionV2(
      playId,
      body.actionId,
      body.expectedVersion,
      typeof token === 'string'
        ? token
        : undefined,
    );
  }
}