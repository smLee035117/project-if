
import type { ScenarioState, StateValue } from './types/play-v2.js';

export function getStateValue(
    state: ScenarioState,
    path: string,
): StateValue | string[] {
    const parts = path.split('.');

    if (parts.length !== 2) {
        throw new Error('상태 경로 형식이 올바르지 않습니다.');
    }

    const [section, key] = parts;

    if (
        (section !== 'world' && section !== 'player' && section !== 'knowledge') ||
        !key
    ) {
        throw new Error('허용되지 않은 상태 영역입니다.');
    }

    

    switch(section) {
        case 'player':
        case 'world': {
            const target = state[section];

        if (!Object.hasOwn(target, key)) {
            throw new Error('존재하지 않는 값입니다.');
        }
        
           return target[key];
        }
        case 'knowledge':
            if (key !== 'knownFacts') {
                throw new Error('존재하지 않는 지식 항목입니다.');
            }
            return state.knowledge.knownFacts;

        default:
            throw new Error('허용되지 않은 상태 영역입니다.');



    }

}
