import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateScenarioV2 } from './scenario-validator-v2.js';
import type { ScenarioV2 } from './types/scenario-v2.js';

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

        scenario.scenes[0].actions[0].when[0].path = 'player.ggoggo';
        expect(() => validateScenarioV2(scenario)).toThrow();

    });

    it('effects 값의 자료형이 다르면 거부한다', () => {
        const scenario = loadTestScenario();

        validateScenarioV2(scenario);

        const effect = scenario.scenes[0].actions[0].outcomes[0].effects[0];

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


    it('존재하지 않는 GOTO 장면을 거부한다', () => {
        const scenario = loadTestScenario();

        validateScenarioV2(scenario);

        scenario.scenes[0].actions[0].outcomes[0].transition = {
            type: 'GOTO',
            sceneId: 'NOT_FOUND',
        };

        expect(() => validateScenarioV2(scenario))
            .toThrow('해당하는 장면이 없습니다.');
    });


    it('NEQ 조건 연산자를 허용한다', () => {
        const scenario = loadTestScenario() as ScenarioV2;

        scenario.scenes[0].actions[0].when[0].op = 'NEQ';

        expect(() => validateScenarioV2(scenario)).not.toThrow();
    });



    it('숫자 비교 조건을 허용한다', () => {
        const data = loadTestScenario();
        validateScenarioV2(data);

        data.scenes[0].actions[0].outcomes[0].when = [{
            path: 'world.fireFloor',
            op: 'GT',
            value: 5,
        }];

        expect(() => validateScenarioV2(data)).not.toThrow();
    });

    it('숫자 비교에 문자열을 사용하면 거부한다', () => {
        const data = loadTestScenario();
        validateScenarioV2(data);

        data.scenes[0].actions[0].outcomes[0].when = [{
            path: 'world.fireFloor',
            op: 'GT',
            value: '5',
        }];

        expect(() => validateScenarioV2(data)).toThrow();
    });

    it('action.when에서 비공개 world 상태를 사용하면 거부한다', () => {
        const data = loadTestScenario();
        validateScenarioV2(data);

        data.scenes[0].actions[0].when = [{
            path: 'world.fireFloor',
            op: 'GT',
            value: 5,
        }];

        expect(() => validateScenarioV2(data))
            .toThrow('비공개 world 상태를 행동 실행 조건에 사용할 수 없습니다.');
    });



    it('정상적인 INCLUDES 조건을 허용한다', () => {
        const scenario = loadTestScenario();

        validateScenarioV2(scenario);

        scenario.scenes[0].actions[0].when = [{
            path: 'knowledge.knownFacts',
            op: 'INCLUDES',
            value: 'alarm_heard',
        }];

        expect(() => validateScenarioV2(scenario)).not.toThrow();
    });

    it('INCLUDES 비교값이 숫자이면 거부한다', () => {
        const scenario = loadTestScenario();

        validateScenarioV2(scenario);

        scenario.scenes[0].actions[0].when = [{
            path: 'knowledge.knownFacts',
            op: 'INCLUDES',
            value: 123,
        }];

        expect(() => validateScenarioV2(scenario)).toThrow();
    });

    it('배열이 아닌 경로에 INCLUDES를 사용하면 거부한다', () => {
        const scenario = loadTestScenario();

        validateScenarioV2(scenario);

        scenario.scenes[0].actions[0].when = [{
            path: 'player.reported119',
            op: 'INCLUDES',
            value: 'alarm_heard',
        }];

        expect(() => validateScenarioV2(scenario)).toThrow();
    });



    // 신규 EffectV2 검증 테스트
    function validateWithEffect(effect: unknown): void {
        const scenario = loadTestScenario() as ScenarioV2;
        const outcome = scenario.scenes[0]?.actions[0]?.outcomes[0];

        if (!outcome) {
            throw new Error('테스트용 outcome이 없습니다.');
        }

        outcome.effects = [
            effect as (typeof outcome.effects)[number],
        ];

        validateScenarioV2(scenario);
    }

    it('ADD 숫자 효과를 허용한다', () => {
        expect(() => validateWithEffect({
            type: 'ADD',
            path: 'world.fireFloor',
            value: 2,
        })).not.toThrow();
    });

    it('ADD 대상이 숫자가 아니면 거부한다', () => {
        expect(() => validateWithEffect({
            type: 'ADD',
            path: 'player.reported119',
            value: 1,
        })).toThrow();
    });

    it('ADD 변경값이 숫자가 아니면 거부한다', () => {
        expect(() => validateWithEffect({
            type: 'ADD',
            path: 'world.fireFloor',
            value: '2',
        })).toThrow();
    });

    it('APPEND_UNIQUE 효과를 허용한다', () => {
        expect(() => validateWithEffect({
            type: 'APPEND_UNIQUE',
            path: 'knowledge.knownFacts',
            value: 'smoke_seen',
        })).not.toThrow();
    });

    it('REMOVE 효과를 허용한다', () => {
        expect(() => validateWithEffect({
            type: 'REMOVE',
            path: 'knowledge.knownFacts',
            value: 'alarm_heard',
        })).not.toThrow();
    });

    it('APPEND_UNIQUE의 잘못된 경로를 거부한다', () => {
        expect(() => validateWithEffect({
            type: 'APPEND_UNIQUE',
            path: 'player.location',
            value: 'smoke_seen',
        })).toThrow();
    });

    it('REMOVE의 숫자 값을 거부한다', () => {
        expect(() => validateWithEffect({
            type: 'REMOVE',
            path: 'knowledge.knownFacts',
            value: 123,
        })).toThrow();
    });

    it('지원하지 않는 효과 연산자를 거부한다', () => {
        expect(() => validateWithEffect({
            type: 'MULTIPLY',
            path: 'world.fireFloor',
            value: 2,
        })).toThrow();
    });



    // 시간 이벤트 검증용 시나리오
    function createTimeEventScenario(): ScenarioV2 {
        const scenario = loadTestScenario() as ScenarioV2;

        scenario.timeEvents = [
            {
                id: 'SMOKE_SPREAD',
                atMinute: 3,
                when: [
                    {
                        path: 'world.insideSmoke',
                        op: 'EQ',
                        value: false,
                    },
                ],
                effects: [
                    {
                        type: 'SET',
                        path: 'world.insideSmoke',
                        value: true,
                    },
                ],
            },
        ];

        return scenario;
    }

    it('정상적인 시간 이벤트를 허용한다', () => {
        const scenario = createTimeEventScenario();

        expect(() => validateScenarioV2(scenario)).not.toThrow();
    });

    it('timeEvents가 빈 배열이어도 허용한다', () => {
        const scenario = createTimeEventScenario();
        scenario.timeEvents = [];

        expect(() => validateScenarioV2(scenario)).not.toThrow();
    });

    it('timeEvents가 배열이 아니면 거부한다', () => {
        const scenario = {
            ...createTimeEventScenario(),
            timeEvents: 'invalid',
        };

        expect(() => validateScenarioV2(scenario))
            .toThrow('timeEvents는 배열이어야 합니다.');
    });

    it('시간 이벤트 ID가 중복되면 거부한다', () => {
        const scenario = createTimeEventScenario();

        scenario.timeEvents!.push({
            id: 'SMOKE_SPREAD',
            atMinute: 5,
            when: [],
            effects: [
                {
                    type: 'SET',
                    path: 'world.insideSmoke',
                    value: true,
                },
            ],
        });

        expect(() => validateScenarioV2(scenario))
            .toThrow('id가 중복되었습니다.');
    });

    it('0분에 발생하는 이벤트를 거부한다', () => {
        const scenario = createTimeEventScenario();

        scenario.timeEvents![0]!.atMinute = 0;

        expect(() => validateScenarioV2(scenario))
            .toThrow('atMinute가 올바르지 않습니다.');
    });

    it('무한대 시간값을 거부한다', () => {
        const scenario = createTimeEventScenario();

        scenario.timeEvents![0]!.atMinute = Infinity;

        expect(() => validateScenarioV2(scenario))
            .toThrow('atMinute가 올바르지 않습니다.');
    });

    it('존재하지 않는 상태 조건을 거부한다', () => {
        const scenario = createTimeEventScenario();

        scenario.timeEvents![0]!.when = [
            {
                path: 'world.notFound',
                op: 'EQ',
                value: true,
            },
        ];

        expect(() => validateScenarioV2(scenario)).toThrow();
    });

    it('시간 이벤트의 효과 자료형이 다르면 거부한다', () => {
        const scenario = createTimeEventScenario();

        scenario.timeEvents![0]!.effects = [
            {
                type: 'SET',
                path: 'world.insideSmoke',
                value: 123,
            },
        ];

        expect(() => validateScenarioV2(scenario))
            .toThrow('값 형식이 다릅니다.');
    });

    it('시간 이벤트가 knownFacts를 직접 변경하면 거부한다', () => {
        const scenario = createTimeEventScenario();

        scenario.timeEvents![0]!.effects = [
            {
                type: 'APPEND_UNIQUE',
                path: 'knowledge.knownFacts',
                value: 'smoke_seen',
            },
        ];

        expect(() => validateScenarioV2(scenario))
            .toThrow('지식 정보를 직접 변경할 수 없습니다.');
    });

    it('동일 시각에 서로 다른 이벤트가 발생하는 것은 허용한다', () => {
        const scenario = createTimeEventScenario();

        scenario.timeEvents!.push({
            id: 'DANGER_INCREASE',
            atMinute: 3,
            when: [],
            effects: [
                {
                    type: 'ADD',
                    path: 'world.fireFloor',
                    value: 1,
                },
            ],
        });

        expect(() => validateScenarioV2(scenario)).not.toThrow();
    });


    it('장면 ID가 중복되면 거부한다', () => {
        const scenario = loadTestScenario() as ScenarioV2;

        const duplicateScene = structuredClone(scenario.scenes[0]!);
        scenario.scenes.push(duplicateScene);

        expect(() => validateScenarioV2(scenario))
            .toThrow('scenes[1].id가 중복되었습니다.');
    });

    it('동일 장면에서 행동 ID가 중복되면 거부한다', () => {
        const scenario = loadTestScenario() as ScenarioV2;

        const duplicateAction = structuredClone(
            scenario.scenes[0]!.actions[0]!,
        );

        scenario.scenes[0]!.actions.push(duplicateAction);

        expect(() => validateScenarioV2(scenario))
            .toThrow('scenes[0].actions[1].id가 중복되었습니다.');
    });


});