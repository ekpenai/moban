import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

type TokenPayload = {
  userId: string;
  appid: string | null;
  exp: number;
};

@Injectable()
export class AuthTokenService {
  constructor(private readonly configService: ConfigService) {}

  sign(userId: string, appid: string | null): string {
    const ttlSeconds = this.configService.get<number>('AUTH_TOKEN_TTL_SECONDS', 60 * 60 * 24 * 30);
    const payload: TokenPayload = {
      userId,
      appid,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    };
    const encodedPayload = this.encodeBase64Url(JSON.stringify(payload));
    const signature = this.signValue(encodedPayload);
    return `${encodedPayload}.${signature}`;
  }

  verify(token: string): TokenPayload {
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw new UnauthorizedException({ success: false, message: '登录已失效' });
    }

    const [encodedPayload, signature] = parts;
    const expectedSignature = this.signValue(encodedPayload);
    const left = Buffer.from(signature);
    const right = Buffer.from(expectedSignature);

    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException({ success: false, message: '登录已失效' });
    }

    let payload: TokenPayload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TokenPayload;
    } catch {
      throw new UnauthorizedException({ success: false, message: '登录已失效' });
    }

    if (!payload?.userId || !payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException({ success: false, message: '登录已失效' });
    }

    return payload;
  }

  private signValue(value: string): string {
    const secret = this.configService.get<string>('AUTH_TOKEN_SECRET')?.trim() || 'moban-default-token-secret';
    return createHmac('sha256', secret).update(value).digest('base64url');
  }

  private encodeBase64Url(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  }
}
