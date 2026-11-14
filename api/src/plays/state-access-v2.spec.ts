import { describe, it, expect } from 'vitest';
import { getStateValue } from './state-access-v2.js';
import type { ScenarioState } from './types/play-v2.js';

describe('getStateValue', () => {
    const state: ScenarioState = {
        world: { fireFloor: 10 },
        player: { reported119: false },
        knowledge: { knownFacts: ['alarm_heard'] },
    };

    it('기존 world, player 값을 조회한다', () => {
        expect(getStateValue(state, 'world.fireFloor')).toBe(10);
        expect(getStateValue(state, 'player.reported119')).toBe(false);
    });

    it('knowledge.knownFacts 배열을 조회한다', () => {
        expect(getStateValue(state, 'knowledge.knownFacts'))
            .toEqual(['alarm_heard']);
    });

    it('존재하지 않는 경로를 거부한다', () => {
        expect(() =>
            getStateValue(state, 'knowledge.invalid')
        ).toThrow();

        expect(() =>
            getStateValue(state, 'player.invalid')
        ).toThrow();
    });
});