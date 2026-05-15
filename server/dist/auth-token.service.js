"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthTokenService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto_1 = require("crypto");
let AuthTokenService = class AuthTokenService {
    configService;
    constructor(configService) {
        this.configService = configService;
    }
    sign(userId, appid) {
        const ttlSeconds = this.configService.get('AUTH_TOKEN_TTL_SECONDS', 60 * 60 * 24 * 30);
        const payload = {
            userId,
            appid,
            exp: Math.floor(Date.now() / 1000) + ttlSeconds,
        };
        const encodedPayload = this.encodeBase64Url(JSON.stringify(payload));
        const signature = this.signValue(encodedPayload);
        return `${encodedPayload}.${signature}`;
    }
    verify(token) {
        const parts = token.split('.');
        if (parts.length !== 2) {
            throw new common_1.UnauthorizedException({ success: false, message: '登录已失效' });
        }
        const [encodedPayload, signature] = parts;
        const expectedSignature = this.signValue(encodedPayload);
        const left = Buffer.from(signature);
        const right = Buffer.from(expectedSignature);
        if (left.length !== right.length || !(0, crypto_1.timingSafeEqual)(left, right)) {
            throw new common_1.UnauthorizedException({ success: false, message: '登录已失效' });
        }
        let payload;
        try {
            payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
        }
        catch {
            throw new common_1.UnauthorizedException({ success: false, message: '登录已失效' });
        }
        if (!payload?.userId || !payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) {
            throw new common_1.UnauthorizedException({ success: false, message: '登录已失效' });
        }
        return payload;
    }
    signValue(value) {
        const secret = this.configService.get('AUTH_TOKEN_SECRET')?.trim() || 'moban-default-token-secret';
        return (0, crypto_1.createHmac)('sha256', secret).update(value).digest('base64url');
    }
    encodeBase64Url(value) {
        return Buffer.from(value, 'utf8').toString('base64url');
    }
};
exports.AuthTokenService = AuthTokenService;
exports.AuthTokenService = AuthTokenService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AuthTokenService);
//# sourceMappingURL=auth-token.service.js.map