import { Controller, Get,Param  } from '@nestjs/common';
import { PlaysService } from './plays.service.js';

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
}
