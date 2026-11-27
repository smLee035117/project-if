import type { Request } from 'express';

export function isLoopbackRequest(request: Request): boolean {


    const clientIp = request.ip ?? request.socket.remoteAddress ?? '';

    const isLoopback = [
        '127.0.0.1',
        '::1',
        '::ffff:127.0.0.1',
    ].includes(clientIp);

    return isLoopback;
}