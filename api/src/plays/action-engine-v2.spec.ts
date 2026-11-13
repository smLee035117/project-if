import { test, expect } from 'vitest';
import { applyEffect } from './action-engine-v2.js';
import { createInitialPlayDataV2 } from './play-engine-v2.js';
import type { EffectV2, ScenarioV2 } from './types/scenario-v2.js';


const scenario: ScenarioV2 = {
  schemaVersion: 2,
  scenarioId: 'apartment_fire_01',
  version: '1.0.0',
  title: '경보가 울린 밤',
  initialSceneId: 'E01',
  initialState: {
    world: {
      incidentVariant: 'Y',
      fireFloor: 10,
      insideSmoke: false,
    },
    player: {
      location: 'HOME_LIVING',
      reported119: false,
    },
    knowledge: {
      knownFacts: ['alarm_heard'],
    },
    
  },
  scenes: [
    {
      id: 'E01',
      description: '거실에서 화재경보가 울린다.',
      actions: [],
    },
  ],
};

    const playDataV2 = createInitialPlayDataV2(scenario, 4, 0);


test('V2 상태값 변경 확인하기', () => {
    
    const effects: EffectV2[] = [
        {
            type: 'SET',
            path: 'player.reported119',
            value: true,
        },
    ];
    
    const nextState = applyEffect(playDataV2.scenarioState,effects);


    expect(playDataV2.scenarioState.player.reported119).toBe(false);
    expect(nextState.player.reported119).toBe(true);
    expect(nextState).not.toBe(playDataV2.scenarioState);
});


test('V2 상태값 변경 여러개 동시에 적용되는지 확인하기', () => {
    
    const effects: EffectV2[] = [
        {
            type: 'SET',
            path: 'player.reported119',
            value: true,
        },
        {
            type: 'SET',
            path: 'player.location',
            value: 'HALLWAY',
        },
    ];
    
    const nextState = applyEffect(playDataV2.scenarioState,effects);


    expect(playDataV2.scenarioState.player.reported119).toBe(false);
    expect(nextState.player.reported119).toBe(true);


    expect(playDataV2.scenarioState.player.location).toBe('HOME_LIVING');
    expect(nextState.player.location).toBe('HALLWAY');

    expect(nextState).not.toBe(playDataV2.scenarioState);
});



test('V2 다중 효과 적용 중 오류 발생 시 원본 상태를 유지한다', () => {
    
    const effects: EffectV2[] = [
        {
            type: 'SET',
            path: 'player.reported119',
            value: true,
        },
        {
            type: 'SET',
            path: 'player.unknown',
            value: 100,
        },
    ];
    //expect(() => validateScenarioV2(scenario)).toThrow();
    expect(() => applyEffect(playDataV2.scenarioState,effects)).toThrow('존재하지 않는 값입니다.');
    

    expect(playDataV2.scenarioState.player.reported119).toBe(false);
    expect(playDataV2.scenarioState.player.location).toBe('HOME_LIVING');


});



test('V2 효과의 자료형이 다르면 거부한다', () => {
    const effects: EffectV2[] = [
        {
            type: 'SET',
            path: 'player.reported119',
            value: 100,
        },
    ];

    expect(() => applyEffect(playDataV2.scenarioState, effects))
        .toThrow('값 형식이 다릅니다.');
});

test('V2 효과가 비어 있으면 상태값을 유지한다', () => {
    const originalState = playDataV2.scenarioState;

    const nextState = applyEffect(originalState, []);

    expect(nextState).toEqual(originalState);
    expect(nextState).not.toBe(originalState);
});



