import type { PlayData, ChoiceGrade } from './types/play.js';

// 새로운 플레이의 초기 상태 생성
export function createInitialPlayData(
  scenarioId: string,
  userId: number,
  userType: number,
): PlayData {
  return {
    userId,
    userType,
    score: 100,
    state: 'PLAYING',
    currentStep: 0,
    scenarioId,
  };
}

// 선택 결과에 따른 점수 및 진행 상태 변경
export function changeScore(
  data: PlayData,
  scoreVal: ChoiceGrade,
  totalSteps: number,
): void {
  switch (scoreVal) {
    case 'BAD':
      data.score -= 5;
      break;

    case 'WORST':
      data.score -= 25;
      break;

    default:
      break;
  }

  // 즉사 또는 점수 소진
  if (scoreVal === 'INSTANT_DEATH' || data.score <= 0) {
    data.state = 'FAILED';
    return;
  }

  // 마지막 단계 완료
  if (data.currentStep === totalSteps - 1) {
    data.state = 'CLEARED';
    return;
  }

  data.currentStep += 1;
}
