
import { describe, it, expect } from 'vitest';

import { buildPlayViewV2 } from './play-view-builder-v2.js';
import { createInitialPlayDataV2 } from './play-engine-v2.js';

import type { ScenarioV2 } from './types/scenario-v2.js';

const scenario: ScenarioV2 = {
    schemaVersion: 2,
    scenarioId: 'view_test_01',
    version: '1.0.0',
    title: '화재 상황 테스트',
    initialSceneId: 'E01',

    initialState: {
        world: {
            insideSmoke: false,
        },
        player: {
            reported119: false,
        },
        knowledge: {
            knownFacts: ['alarm_heard'],
        },
    },

    scenes: [
        {
            id: 'E01',
            description: '거실에서 화재경보가 울립니다.',
            actions: [
                {
                    id: 'REPORT',
                    text: '119에 신고한다.',
                    when: [
                        {
                            path: 'player.reported119',
                            op: 'EQ',
                            value: false,
                        },
                    ],
                    durationMinutes: 1,
                    outcomes: [
                        {
                            when: [],
                            resultText: '신고했습니다.',
                            effects: [],
                            transition: { type: 'STAY' },
                        },
                    ],
                },
                {
                    id: 'REPORT_AGAIN',
                    text: '다시 신고한다.',
                    when: [
                        {
                            path: 'player.reported119',
                            op: 'EQ',
                            value: true,
                        },
                    ],
                    durationMinutes: 1,
                    outcomes: [
                        {
                            when: [],
                            resultText: '다시 신고했습니다.',
                            effects: [],
                            transition: { type: 'STAY' },
                        },
                    ],
                },
            ],
        },
    ],

    endings: [
        {
            id: 'TEST_END',
            state: 'CLEARED',
            title: '테스트 종료',
            description: '상황이 종료되었습니다.',
            requirements: [],
        },
    ],
};

describe('buildPlayViewV2', () => {
    it('현재 장면과 행동 목록을 반환한다', () => {
        const playData = createInitialPlayDataV2(scenario, 1, 0);

        const view = buildPlayViewV2(playData, scenario);

        expect(view.scenarioTitle).toBe('화재 상황 테스트');
        expect(view.currentSceneId).toBe('E01');
        expect(view.sceneDescription).toBe(
            '거실에서 화재경보가 울립니다.',
        );

        expect(view.actions).toEqual([
            {
                id: 'REPORT',
                text: '119에 신고한다.',
                available: true,
            },
            {
                id: 'REPORT_AGAIN',
                text: '다시 신고한다.',
                available: false,
            },
        ]);
    });

    it('비공개 상태와 행동 결과를 응답에 포함하지 않는다', () => {
        const playData = createInitialPlayDataV2(scenario, 1, 0);

        const view = buildPlayViewV2(playData, scenario);
        const response = JSON.stringify(view);

        expect(response).not.toContain('insideSmoke');
        expect(response).not.toContain('scenarioState');
        expect(response).not.toContain('신고했습니다.');
        expect(view.knownFacts).toEqual(['alarm_heard']);
        expect(view.ending).toBeUndefined();
    });

    it('world 조건을 사용하는 행동 조회를 거부한다', () => {
        const testScenario = structuredClone(scenario);

        testScenario.scenes[0]!.actions[0]!.when = [
            {
                path: 'world.insideSmoke',
                op: 'EQ',
                value: false,
            },
        ];

        const playData = createInitialPlayDataV2(testScenario, 1, 0);

        expect(() =>
            buildPlayViewV2(playData, testScenario),
        ).toThrow('행동 실행 조건에 비공개 world 상태를 사용할 수 없습니다.');
    });

    it('종료된 플레이에서는 행동을 숨기고 엔딩을 제공한다', () => {
        const playData = createInitialPlayDataV2(scenario, 1, 0);

        playData.state = 'CLEARED';
        playData.endingId = 'TEST_END';

        const view = buildPlayViewV2(playData, scenario);

        expect(view.actions).toEqual([]);
        expect(view.ending).toEqual({
            id: 'TEST_END',
            title: '테스트 종료',
            description: '상황이 종료되었습니다.',
        });
    });

    it('플레이와 시나리오 버전이 다르면 거부한다', () => {
        const playData = createInitialPlayDataV2(scenario, 1, 0);
        playData.scenarioVersion = '9.9.9';

        expect(() =>
            buildPlayViewV2(playData, scenario),
        ).toThrow('시나리오 정보가 일치하지 않습니다.');
    });

    it('공개 지식 배열은 원본과 별도의 객체로 반환한다', () => {
        const playData = createInitialPlayDataV2(scenario, 1, 0);

        const view = buildPlayViewV2(playData, scenario);

        view.knownFacts.push('smoke_seen');

        expect(playData.scenarioState.knowledge.knownFacts)
            .toEqual(['alarm_heard']);
    });
});
