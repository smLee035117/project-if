import { describe, it, expect } from 'vitest';
import { isScenarioPublishedV2 } from './scenario-registry-v2.js';

describe('isScenarioPublishedV2', () => {

    it('공개된 시나리오는 true를 반환한다', () => {
        expect(isScenarioPublishedV2('office_fire_01'))
            .toBe(true);
    });

    it('비공개 시나리오는 false를 반환한다', () => {
        expect(isScenarioPublishedV2('apartment_fire_01'))
            .toBe(false);
    });

    it('등록되지 않은 시나리오는 false를 반환한다', () => {
        expect(isScenarioPublishedV2('unknown_scenario'))
            .toBe(false);
    });

    it.each([
        'constructor',
        'toString',
        '__proto__',
    ])('상속된 속성 %s를 등록된 시나리오로 취급하지 않는다', (id) => {
        expect(isScenarioPublishedV2(id))
            .toBe(false);
    });

});