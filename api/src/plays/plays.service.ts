import { Injectable } from '@nestjs/common';
import { loadScenario } from './scenario-loader.js';

@Injectable()
export class PlaysService {
  getPlays(): string {
    return 'Plays API 정상 작동';
  }

  async getScenario(scenarioId: string) {
    const scenario = await loadScenario(scenarioId);

    return {
      scenarioId: scenario.scenarioId,
      title: scenario.title,
      totalStages: scenario.stages.length,
    };
  }
}
