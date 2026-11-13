import { describe, it, expect } from 'vitest';
import { loadScenarioV2 } from './scenario-loader-v2.js';
import { ScenarioNotFoundError } from './scenario-loader.js';

describe('loadScenarioV2', () => {
    it('등록된 V2 시나리오를 불러온다', async () => {
        const scenario = await loadScenarioV2('apartment_fire_01');

        expect(scenario.schemaVersion).toBe(2);
        expect(scenario.scenarioId).toBe('apartment_fire_01');
        expect(scenario.scenes.length).toBeGreaterThan(0);
    });

    it('등록되지 않은 시나리오를 거부한다', async () => {
        await expect(
            loadScenarioV2('unknown_scenario'),
        ).rejects.toBeInstanceOf(ScenarioNotFoundError);
    });
});