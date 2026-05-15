import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthTokenService } from './auth-token.service';

export type AuthenticatedRequestUser = {
  userId: string;
  appid: string | null;
};

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedRequestUser;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authTokenService: AuthTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization || '';
    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException({ success: false, message: '未登录' });
    }

    const payload = this.authTokenService.verify(token);
    request.user = {
      userId: payload.userId,
      appid: payload.appid,
    };
    return true;
  }
}
