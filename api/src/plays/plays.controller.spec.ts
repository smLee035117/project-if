import { Test, TestingModule } from '@nestjs/testing';
import { PlaysController } from './plays.controller.js';
import { PlaysService } from './plays.service.js';


import { describe, beforeEach, it, expect } from 'vitest';

describe('PlaysController', () => {
  let controller: PlaysController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlaysController],
        providers: [
          {
                provide: PlaysService,
                useValue: {},
          },
        ],
    }).compile();

    controller = module.get<PlaysController>(PlaysController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
