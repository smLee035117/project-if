import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Req,
    Res,
    NotFoundException,
} from '@nestjs/common';

import type { Request, Response } from 'express';

import { PlaysService } from './plays.service.js';
import { StartPlayDto } from './dto/start-play.dto.js';

import type { PlayViewV2 } from './types/play-view-v2.js';

import { HttpCode } from '@nestjs/common';
import { SubmitActionV2Dto } from './dto/submit-action-v2.dto.js';
import { GiveUpPlayV2Dto } from './dto/give-up-play-v2.dto.js';

import { isScenarioPublishedV2 } from './scenario-registry-v2.js';

import { isLoopbackRequest } from './local-request.js';

import { GUEST_SESSION_TTL_MS } from '../config/session-policy.js';


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


    const isDevelopment = process.env.NODE_ENV === 'development';
    const isTest = process.env.NODE_ENV === 'test';
    const isPublished = isScenarioPublishedV2(body.scenarioId);

    const clientIp = request.ip ?? request.socket.remoteAddress ?? '';

    const  isLoopback = isLoopbackRequest(request);

    const canAccessUnpublished =
        (isDevelopment && isLoopback) || isTest;


    if (!canAccessUnpublished && !isPublished ) {
        throw new NotFoundException();
    }


    if (
        process.env.NODE_ENV === 'production' &&
        !isScenarioPublishedV2(body.scenarioId)
    ) {
        throw new NotFoundException();
    }


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
          maxAge: GUEST_SESSION_TTL_MS,
        path: '/',
      });
    }

    return {
      playId,
      view,
    };
  }

    @Get('active/:scenarioId')
    async getActivePlay(
        @Param('scenarioId') scenarioId: string,
        @Req() request: Request,
    ): Promise<{
        activePlay: {
            playId: string;
            view: PlayViewV2;
        } | null;
    }> {
        const token: unknown =
            request.cookies?.guest_token;

        const activePlay =
            await this.playsService.getActivePlayV2ForGuest(
                scenarioId,
                typeof token === 'string'
                    ? token
                    : undefined,
            );

        return {
            activePlay,
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

    @Post(':playId/give-up')
    @HttpCode(200)
    async giveUpPlay(
        @Param('playId') playId: string,
        @Body() body: GiveUpPlayV2Dto,
        @Req() request: Request,
    ): Promise<PlayViewV2> {

        const token: unknown =
            request.cookies?.guest_token;

        return this.playsService.giveUpPlayV2(
            playId,
            body.expectedVersion,
            typeof token === 'string'
                ? token
                : undefined,
        );
    }
}