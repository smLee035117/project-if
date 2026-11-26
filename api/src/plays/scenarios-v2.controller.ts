import { Controller, Get } from '@nestjs/common';

import {
    listScenariosV2,
    type ScenarioSummaryV2,
} from './scenario-loader-v2.js';

@Controller('v2/scenarios')
export class ScenariosV2Controller {

    @Get()
    async getScenarios(): Promise<ScenarioSummaryV2[]> {
        return await listScenariosV2();
    }

}