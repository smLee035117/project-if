import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateScenarioV2 } from './scenario-validator-v2.js';

describe('validateScenarioV2', () => {
    it('정상적인 V2 시나리오를 통과시킨다', () => {

        const filePath = resolve(
            process.cwd(),
            '..',
            'data',
            'apartment_fire_01.json',
        );

        const jsonText = readFileSync(filePath, 'utf-8');
        const scenario: unknown = JSON.parse(jsonText);

        expect(() => validateScenarioV2(scenario)).not.toThrow();
    });

    function loadTestScenario(): unknown {
        const filePath = resolve(
            process.cwd(),
            '..',
            'data',
            'apartment_fire_01.json',
        );

        return JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
    }

    it('존재하지 않는 상태 경로를 거부한다', () => {
        const scenario = loadTestScenario();

        validateScenarioV2(scenario);

        scenario.scenes[0].actions[0].when.path = 'player.ggoggo';
        expect(() => validateScenarioV2(scenario)).toThrow();

    });

    it('effects 값의 자료형이 다르면 거부한다', () => {
        const scenario = loadTestScenario();

        validateScenarioV2(scenario);

        const effect = scenario.scenes[0].actions[0].effects[0];

        if (!effect) {
            throw new Error('테스트할 effect가 없습니다.');
        }

        // 기존 effect 값과 다른 자료형으로 변경
        if (typeof effect.value === 'boolean') {
            effect.value = 'invalid';
        } else {
            effect.value = false;
        }

        expect(() => validateScenarioV2(scenario))
            .toThrow('값 형식이 다릅니다.');
    });

    
});