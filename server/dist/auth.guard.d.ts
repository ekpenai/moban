import { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthTokenService } from './auth-token.service';
export type AuthenticatedRequestUser = {
    userId: string;
    appid: string | null;
};
export type AuthenticatedRequest = Request & {
    user?: AuthenticatedRequestUser;
};
export declare class AuthGuard implements CanActivate {
    private readonly authTokenService;
    constructor(authTokenService: AuthTokenService);
    canActivate(context: ExecutionContext): boolean;
}
