import { describe, it, expect } from 'vitest';
import {
    loadScenarioV2,
    listScenariosV2,
 } from './scenario-loader-v2.js';
import { ScenarioNotFoundError } from './scenario-loader.js';

import { createInitialPlayDataV2 } from './play-engine-v2.js';
import { buildPlayViewV2 } from './play-view-builder-v2.js';

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


    it.each([
    'apartment_fire_01',
    'blackout_resource_01',
    'lost_hiking_01',
    'basement_flood_01',
        'office_fire_01',
    ])('%s 시나리오를 로딩하고 초기 장면을 구성한다', async (scenarioId) => {
    const scenario = await loadScenarioV2(scenarioId);

    const playData = createInitialPlayDataV2(
        scenario,
        1,
        0,
    );

    const view = buildPlayViewV2(playData, scenario);

    expect(view.scenarioId).toBe(scenarioId);
    expect(view.currentSceneId).toBe(scenario.initialSceneId);
    expect(view.sceneDescription.length).toBeGreaterThan(0);
    expect(view.actions.length).toBeGreaterThan(0);
    });

});

describe('listScenariosV2', () => {

    it('공개된 시나리오만 반환한다', async () => {
        const scenarios = await listScenariosV2();

        expect(scenarios.map(scenario => scenario.scenarioId))
            .toEqual(['office_fire_01']);
    });

    it('시나리오의 제목과 버전이 실제 JSON과 일치한다', async () => {
        const scenarios = await listScenariosV2();

        const original = await loadScenarioV2('office_fire_01');

        expect(scenarios[0]).toEqual({
            scenarioId: original.scenarioId,
            title: original.title,
            version: original.version,
        });
    });

    it('비공개 게임 데이터를 반환하지 않는다', async () => {
        const scenarios = await listScenariosV2();

        for (const scenario of scenarios) {
            expect(Object.keys(scenario).sort()).toEqual([
                'scenarioId',
                'title',
                'version',
            ]);
        }
    });

    it('false를 전달하면 공개 시나리오만 반환한다', async () => {
        const scenarios = await listScenariosV2(false);

        expect(scenarios.map(scenario => scenario.scenarioId))
            .toEqual(['office_fire_01']);
    });

    it('true를 전달하면 비공개 시나리오도 반환한다', async () => {
        const scenarios = await listScenariosV2(true);

        expect(scenarios.map(scenario => scenario.scenarioId).sort())
            .toEqual([
                'apartment_fire_01',
                'basement_flood_01',
                'blackout_resource_01',
                'lost_hiking_01',
                'office_fire_01',
            ]);
    });

});