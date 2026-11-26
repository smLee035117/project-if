
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ScenarioV2 } from './types/scenario-v2.js';
import { validateScenarioV2 } from './scenario-validator-v2.js';
import { ScenarioNotFoundError } from './scenario-loader.js';

import { scenarioRegistry } from './scenario-registry-v2.js';

export interface ScenarioSummaryV2 {
    scenarioId: string;
    title: string;
    version: string;
}

export async function listScenariosV2(
    includeUnpublished: boolean = false,
): Promise<ScenarioSummaryV2[]> {

    const publishedEntries = Object.entries(scenarioRegistry)
        .filter(([, registration]) => includeUnpublished || registration.published);

    const result = publishedEntries.map(async ([id]) => {

        const scenario = await loadScenarioV2(id);

        return {
            scenarioId: scenario.scenarioId,
            title: scenario.title,
            version: scenario.version,
        };

    });

    return await Promise.all(result);
}

export async function loadScenarioV2(
    scenarioId: string,
): Promise<ScenarioV2> {

    if (!Object.hasOwn(scenarioRegistry, scenarioId)) {
        throw new ScenarioNotFoundError(scenarioId);
    }

    const fileName = scenarioRegistry[scenarioId]?.fileName;

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
