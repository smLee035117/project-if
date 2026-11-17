import type { ScenarioV2 } from '../types/scenario-v2.js';

/**
 * Stable fixture for API / Redis / MySQL infrastructure tests.
 * Do not tie these tests to mutable published disaster scenario content.
 */
export function createV2TestScenario(): ScenarioV2 {
  return {
    schemaVersion: 2,
    scenarioId: 'v2_test_01',
    version: '1.0.0',
    title: 'V2 infrastructure test scenario',
    initialSceneId: 'E01',
    initialState: {
      world: { insideSmoke: false },
      player: { reported119: false },
      knowledge: { knownFacts: [] },
    },
    scenes: [
      {
        id: 'E01',
        description: 'Test scene: the fire alarm sounds.',
        actions: [
          {
            id: 'E01-A',
            text: 'Call 119',
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
                resultText: '119에 현재 상황을 신고했습니다.',
                effects: [
                  {
                    type: 'SET',
                    path: 'player.reported119',
                    value: true,
                  },
                ],
                transition: { type: 'STAY' },
              },
            ],
          },
        ],
      },
    ],
    endings: [
      {
        id: 'TEST_DONE',
        state: 'CLEARED',
        title: 'Test completed',
        description: 'Infrastructure persistence fixture only.',
        requirements: [
          {
            path: 'player.reported119',
            op: 'EQ',
            value: true,
          },
        ],
      },
    ],
  };
}
