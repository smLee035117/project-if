import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';

import { createClient } from 'redis';

import type { PlayData } from '../plays/types/play.js';

@Injectable()
export class RedisService
  implements OnModuleInit, OnModuleDestroy {

  // Redis 클라이언트 속성 선언
  private readonly client: ReturnType<typeof createClient>;

  constructor() {
    this.client = createClient({
      url: 'redis://127.0.0.1:6379',
    });
  }

  async onModuleInit(): Promise<void> {
    this.client.on('error', (error) => {
      console.error('Redis 오류:', error);
    });

    await this.client.connect();

    const result = await this.client.ping();
    console.log(result);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  async savePlay(
    playId: string,
    data: PlayData,
  ): Promise<void> {

    // 1. playId를 이용해 Redis Key 생성
    const key = `play:${playId}`;

    // 2. PlayData를 JSON 문자열로 변환
    const plData = JSON.stringify(data);

    // 3. Redis SET으로 저장 (TTL 3600초)
    await this.client.set(key, plData, {
        EX: 3600,
    });

  }

  async getPlay(playId: string): Promise<PlayData | null> {
    const value = await this.client.get(`play:${playId}`);

    if (value === null) {
        return null;
    }

    const data: PlayData = JSON.parse(value);

    return data;
  }


  async getPendingPlayResult(playId: string): Promise<PlayData | null> {
    // 기존 getPlay()를 참고하여 구현
    const value = await this.client.get(`pending:play-result:${playId}`);

    if (value === null) {
        return null;
    }

     const data: PlayData = JSON.parse(value);

     return data;
    
  }




  async updatePlayIfCurrent(
    playId: string,
    expectedStep: number,
    data: PlayData,
  ): Promise<boolean> {
    const key = `play:${playId}`;

    const pendingKey = `pending:play-result:${playId}`;

    const script = `
      local value = redis.call('GET', KEYS[1])

      if not value then
        return 0
      end

      local current = cjson.decode(value)

      if current.state ~= 'PLAYING' then
        return 0
      end

      if current.currentStep ~= tonumber(ARGV[1]) then
        return 0
      end


      local valChk = cjson.decode(ARGV[2])

      if valChk.state == 'CLEARED' or
          valChk.state == 'FAILED'  then
         redis.call('SET', KEYS[2], ARGV[2])
      end

      redis.call('SET', KEYS[1], ARGV[2], 'EX', 3600)

      return 1
    `;

    const result = await this.client.eval(script, {
      keys: [key,pendingKey],
      arguments: [
        String(expectedStep),
        JSON.stringify(data),
      ],
    });

    return result === 1;
  }

  async deletePendingPlayResult(playId: string): Promise<void> {
    
      const pendingKey = `pending:play-result:${playId}`;
      await this.client.del(pendingKey);

  }
  


  async scanPendingPlayIds(): Promise<string[]> {
      const prefix = 'pending:play-result:';
      const playIds = new Set<string>();

      for await (const keys of this.client.scanIterator({
        MATCH: `${prefix}*`,
        COUNT: 100,
      })) {
        // 검색된 key에서 playId 추출

        for (const key of keys) {
          const playId = key.slice(prefix.length);
          
          // playIds에 추가
          playIds.add(playId);
        }


        
        
      }

      return [...playIds];

  }

}