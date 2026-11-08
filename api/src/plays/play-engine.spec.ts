import { describe, it, expect } from 'vitest';
import {
  createInitialPlayData,
  changeScore,
} from './play-engine.js';

describe('Play Engine', () => {

  // 초기 플레이 상태 확인
  it('새 플레이는 100점, 0단계, PLAYING 상태로 시작한다', () => {
    const data = createInitialPlayData('blackout_test_01', 10, 0);

    expect(data.score).toBe(100);
    expect(data.currentStep).toBe(0);
    expect(data.state).toBe('PLAYING');
    expect(data.scenarioId).toBe('blackout_test_01');
  });

  // BAD 선택
  it('BAD 선택 시 5점 차감 후 다음 단계로 진행한다', () => {
    const data = createInitialPlayData('blackout_test_01', 10, 0);

    changeScore(data, 'BAD', 3);

    expect(data.score).toBe(95);
    expect(data.currentStep).toBe(1);
    expect(data.state).toBe('PLAYING');
  });

  // WORST 선택
  it('WORST 선택 시 25점 차감 후 다음 단계로 진행한다', () => {
    const data = createInitialPlayData('blackout_test_01', 10, 0);

    changeScore(data, 'WORST', 3);

    expect(data.score).toBe(75);
    expect(data.currentStep).toBe(1);
    expect(data.state).toBe('PLAYING');
  });

  // GOOD 선택
  it('GOOD 선택 시 점수를 유지하고 다음 단계로 진행한다', () => {
    const data = createInitialPlayData('blackout_test_01', 10, 0);

    changeScore(data, 'GOOD', 3);

    expect(data.score).toBe(100);
    expect(data.currentStep).toBe(1);
    expect(data.state).toBe('PLAYING');
  });

  // 즉사 판정
  it('INSTANT_DEATH 선택 시 즉시 실패한다', () => {
    const data = createInitialPlayData('blackout_test_01', 10, 0);

    changeScore(data, 'INSTANT_DEATH', 3);

    expect(data.state).toBe('FAILED');
    expect(data.currentStep).toBe(0);
  });

  // 점수 소진
  it('점수가 0 이하가 되면 실패한다', () => {
    const data = createInitialPlayData('blackout_test_01', 10, 0);
    data.score = 5;

    changeScore(data, 'BAD', 3);

    expect(data.score).toBe(0);
    expect(data.state).toBe('FAILED');
    expect(data.currentStep).toBe(0);
  });

  // 마지막 단계 클리어
  it('마지막 단계에서 생존하면 클리어한다', () => {
    const data = createInitialPlayData('blackout_test_01', 10, 0);
    data.currentStep = 2;

    changeScore(data, 'GOOD', 3);

    expect(data.state).toBe('CLEARED');
    expect(data.currentStep).toBe(2);
    expect(data.score).toBe(100);
  });

  // 마지막 단계에서도 실패 우선
  it('마지막 단계에서 점수가 소진되면 클리어하지 않는다', () => {
    const data = createInitialPlayData('blackout_test_01', 10, 0);
    data.currentStep = 2;
    data.score = 5;

    changeScore(data, 'BAD', 3);

    expect(data.state).toBe('FAILED');
    expect(data.score).toBe(0);
  });

});