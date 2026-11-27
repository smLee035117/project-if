import {
    Injectable,
    NotFoundException,
    type CanActivate,
    type ExecutionContext,
} from '@nestjs/common';

import type { Request } from 'express';

import { isLoopbackRequest } from './local-request.js';

@Injectable()
export class LegacyApiGuard implements CanActivate {

    canActivate(context: ExecutionContext): boolean {

        if (process.env.NODE_ENV === 'test') {
            return true;
        }

        const request = context
            .switchToHttp()
            .getRequest<Request>();

        if (
            process.env.NODE_ENV === 'development' &&
            isLoopbackRequest(request)
        ) {
            return true;
        }

        throw new NotFoundException();
    }
}