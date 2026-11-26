import { describe, it, expect } from 'vitest';
import type { Request } from 'express';

import { isLoopbackRequest } from './local-request.js';

describe('isLoopbackRequest', () => {

    function createRequest(
        ip?: string,
        remoteAddress?: string,
    ): Request {
        return {
            ip,
            socket: {
                remoteAddress,
            },
        } as Request;
    }

    it.each([
        '127.0.0.1',
        '::1',
        '::ffff:127.0.0.1',
    ])('루프백 주소 %s를 허용한다', (ip) => {
        expect(isLoopbackRequest(createRequest(ip)))
            .toBe(true);
    });

    it.each([
        '192.168.0.10',
        '10.0.0.1',
        '203.0.113.10',
    ])('외부 주소 %s를 거부한다', (ip) => {
        expect(isLoopbackRequest(createRequest(ip)))
            .toBe(false);
    });

    it('request.ip가 없으면 remoteAddress를 사용한다', () => {
        const request = createRequest(undefined, '127.0.0.1');

        expect(isLoopbackRequest(request)).toBe(true);
    });

    it('두 IP 정보가 모두 없으면 거부한다', () => {
        expect(isLoopbackRequest(createRequest()))
            .toBe(false);
    });

    it('request.ip를 remoteAddress보다 우선한다', () => {
        const request = createRequest(
            '192.168.0.10',
            '127.0.0.1',
        );

        expect(isLoopbackRequest(request)).toBe(false);
    });

});