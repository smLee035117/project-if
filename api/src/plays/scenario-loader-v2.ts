
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ScenarioV2 } from './types/scenario-v2.js';
import { validateScenarioV2 } from './scenario-validator-v2.js';
import { ScenarioNotFoundError } from './scenario-loader.js';

const scenarioFiles: Record<string, string> = {
    apartment_fire_01: 'apartment_fire_01.json',
};

export async function loadScenarioV2(
    scenarioId: string,
): Promise<ScenarioV2> {

    if (!Object.hasOwn(scenarioFiles, scenarioId)) {
        throw new ScenarioNotFoundError(scenarioId);
    }

    const fileName = scenarioFiles[scenarioId];

    if (!fileName) {
        throw new Error(`시나리오 파일 경로가 없습니다: ${scenarioId}`);
    }

    const filePath = resolve(
        process.cwd(),
        '..',
        'data',
        fileName,
    );

    const jsonText = await readFile(filePath, 'utf-8');
    const scenario: unknown = JSON.parse(jsonText);

    validateScenarioV2(scenario);

    if (scenario.scenarioId !== scenarioId) {
        throw new Error(
            `시나리오 ID가 일치하지 않습니다: 요청=${scenarioId}, 파일=${scenario.scenarioId}`,
        );
    }

    return scenario;
}
