import { Controller, Get,Param, Post,Body ,HttpCode, Req ,Res , } from '@nestjs/common';
import { PlaysService } from './plays.service.js';

import { StartPlayDto } from './dto/start-play.dto.js';

import type { Request, Response } from 'express';


@Controller('plays')
export class PlaysController {
     constructor(private readonly playsService: PlaysService) {}
    
    @Get()
    getPlays(): string {
        return this.playsService.getPlays();
    }

    @Get('scenarios/:scenarioId')
    getScenario(@Param('scenarioId') scenarioId: string) {
        return this.playsService.getScenario(scenarioId);
    }

    @Post('echo')
    @HttpCode(200)
    echo(@Body() body: StartPlayDto) {
         return  this.playsService.getScenario(body.scenarioId);
    }


    @Post()
    async startPlay(
    @Body() body: StartPlayDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    ) {
        const guestToken: unknown = request.cookies?.guest_token;

        const { playData, newToken } =
            await this.playsService.startPlay(
            body.scenarioId,
            typeof guestToken === 'string' ? guestToken : undefined,
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

        return playData;
    }


    @Get('cookie-check')
    checkCookie(@Req() request: Request) {
        const token = request.cookies?.guest_token;

        return {
            hasGuestCookie: typeof token === 'string',
        };
    }
}
