import { ConfigService } from '@nestjs/config';
type TokenPayload = {
    userId: string;
    appid: string | null;
    exp: number;
};
export declare class AuthTokenService {
    private readonly configService;
    constructor(configService: ConfigService);
    sign(userId: string, appid: string | null): string;
    verify(token: string): TokenPayload;
    private signValue;
    private encodeBase64Url;
}
export {};
