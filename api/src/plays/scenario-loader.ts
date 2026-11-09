// scenario-loader.ts

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';


import type { ChoiceGrade } from "./types/play.js";
import type { Scenario } from "./types/scenario.js";

// 기존 Scenario 타입 정의
// 기존 JSON 검증 함수





// null과 배열을 제외한 객체인지 확인
function isRecord(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

// 비어 있지 않은 문자열인지 확인
function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// 허용된 판정값인지 확인
function isChoiceGrade(value: unknown): value is ChoiceGrade {
    return (
        value === "GOOD" ||
        value === "BAD" ||
        value === "WORST" ||
        value === "INSTANT_DEATH"
    );
}

// 시나리오 전체 구조 검사
function validateScenario(value: unknown): asserts value is Scenario {
    if (!isRecord(value)) {
        throw new Error("시나리오는 객체여야 합니다.");
    }

    if (!isNonEmptyString(value.scenarioId)) {
        throw new Error("scenarioId는 비어 있지 않은 문자열이어야 합니다.");
    }

    if (!isNonEmptyString(value.title)) {
        throw new Error("title은 비어 있지 않은 문자열이어야 합니다.");
    }

    if (!Array.isArray(value.stages) || value.stages.length === 0) {
        throw new Error("stages는 비어 있지 않은 배열이어야 합니다.");
    }

    for (const [stageIndex, stage] of value.stages.entries()) {
        const stageLabel = `stages[${stageIndex}]`;

        if (!isRecord(stage)) {
            throw new Error(`${stageLabel}는 객체여야 합니다.`);
        }

        if (!isNonEmptyString(stage.stageId)) {
            throw new Error(`${stageLabel}.stageId가 올바르지 않습니다.`);
        }

        if (!isNonEmptyString(stage.description)) {
            throw new Error(`${stageLabel}.description이 올바르지 않습니다.`);
        }

        if (!Array.isArray(stage.choices) || stage.choices.length !== 2) {
            throw new Error(`${stageLabel}.choices는 선택지 2개를 가진 배열이어야 합니다.`);
        }

        for (const [choiceIndex, choice] of stage.choices.entries()) {
            const choiceLabel = `${stageLabel}.choices[${choiceIndex}]`;

            if (!isRecord(choice)) {
                throw new Error(`${choiceLabel}는 객체여야 합니다.`);
            }

            if (!isNonEmptyString(choice.id)) {
                throw new Error(`${choiceLabel}.id가 올바르지 않습니다.`);
            }

            if (!isNonEmptyString(choice.text)) {
                throw new Error(`${choiceLabel}.text가 올바르지 않습니다.`);
            }

            if (!isChoiceGrade(choice.grade)) {
                throw new Error(`${choiceLabel}.grade가 허용된 판정값이 아닙니다.`);
            }
        }
    }
}


export class ScenarioNotFoundError extends Error {
  constructor(scenarioId: string) {
    super(`존재하지 않는 시나리오입니다: ${scenarioId}`);
    this.name = 'ScenarioNotFoundError';
  }
}



// 시나리오 데이터 불러오기
export async function loadScenario(
  scenarioId: string,
): Promise<Scenario> {
  const scenarioFiles: Record<string, string> = {
    blackout_test_01: 'blackout_test_01.json',
    invalid_test_01: 'invalid_test_01.json',
  };

  // 등록된 시나리오인지 확인
  if (!Object.prototype.hasOwnProperty.call(scenarioFiles, scenarioId)) {
    throw new ScenarioNotFoundError(scenarioId);
  }

  const fileName = scenarioFiles[scenarioId];

  if (fileName === undefined) {
    throw new Error(`시나리오 파일 경로가 없습니다: ${scenarioId}`);
  }

  // 현재 실행 위치: D:\project_if\api
  const filePath = resolve(
    process.cwd(),
    '..',
    'data',
    fileName,
  );

  // 파일 읽기
  const jsonText = await readFile(filePath, 'utf-8');

  // 구조가 확인되지 않은 외부 데이터
  const scenario: unknown = JSON.parse(jsonText);

  // JSON 구조 검증
  validateScenario(scenario);

  // 요청 ID와 파일 내부 ID 비교
  if (scenario.scenarioId !== scenarioId) {
    throw new Error(
      `시나리오 ID가 일치하지 않습니다: 요청=${scenarioId}, 파일=${scenario.scenarioId}`,
    );
  }

  return scenario;
}