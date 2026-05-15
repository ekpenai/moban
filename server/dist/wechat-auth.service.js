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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WechatAuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const auth_token_service_1 = require("./auth-token.service");
const wx_user_entity_1 = require("./wx-user.entity");
let WechatAuthService = class WechatAuthService {
    configService;
    wxUserRepo;
    authTokenService;
    constructor(configService, wxUserRepo, authTokenService) {
        this.configService = configService;
        this.wxUserRepo = wxUserRepo;
        this.authTokenService = authTokenService;
    }
    async login(body) {
        const appid = this.configService.get('WECHAT_APPID')?.trim();
        const secret = this.configService.get('WECHAT_SECRET')?.trim();
        if (!appid || !secret) {
            throw new common_1.InternalServerErrorException({
                success: false,
                message: '微信登录未配置',
            });
        }
        const session = await this.getWechatSession(body.code, appid, secret);
        const profile = this.normalizeProfile(body.userInfo);
        const now = new Date();
        let user = await this.wxUserRepo.findOne({ where: { openid: session.openid } });
        if (!user) {
            user = this.wxUserRepo.create({
                openid: session.openid,
                unionid: session.unionid ?? null,
                appid,
                ...profile,
                lastLoginAt: now,
            });
        }
        else {
            user.unionid = session.unionid ?? user.unionid ?? null;
            user.appid = appid;
            user.nickName = profile.nickName;
            user.avatarUrl = profile.avatarUrl;
            user.gender = profile.gender;
            user.country = profile.country;
            user.province = profile.province;
            user.city = profile.city;
            user.language = profile.language;
            user.lastLoginAt = now;
        }
        const savedUser = await this.wxUserRepo.save(user);
        const token = this.authTokenService.sign(savedUser.id, savedUser.appid);
        return {
            success: true,
            token,
            user: this.toClientUser(savedUser),
        };
    }
    async getProfile(userId) {
        const user = await this.wxUserRepo.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.InternalServerErrorException({
                success: false,
                message: '用户不存在',
            });
        }
        return {
            success: true,
            user: this.toClientUser(user),
        };
    }
    async updateProfile(userId, body) {
        const user = await this.wxUserRepo.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.InternalServerErrorException({
                success: false,
                message: '用户不存在',
            });
        }
        const nickName = this.safeString(body.nickName, 64);
        const hasAvatarUrl = typeof body.avatarUrl === 'string';
        const avatarUrl = this.safeString(body.avatarUrl, 512);
        if (nickName) {
            user.nickName = nickName;
        }
        if (hasAvatarUrl) {
            user.avatarUrl = avatarUrl;
        }
        const savedUser = await this.wxUserRepo.save(user);
        return {
            success: true,
            user: this.toClientUser(savedUser),
        };
    }
    normalizeProfile(userInfo) {
        return {
            nickName: this.safeString(userInfo?.nickName, 64) || '微信用户',
            avatarUrl: this.safeString(userInfo?.avatarUrl, 512),
            gender: Number.isFinite(userInfo?.gender) ? Math.max(0, Number(userInfo?.gender)) : 0,
            country: this.safeString(userInfo?.country, 64),
            province: this.safeString(userInfo?.province, 64),
            city: this.safeString(userInfo?.city, 64),
            language: this.safeString(userInfo?.language, 32),
        };
    }
    safeString(value, maxLength) {
        return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
    }
    async getWechatSession(code, appid, secret) {
        const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
        url.searchParams.set('appid', appid);
        url.searchParams.set('secret', secret);
        url.searchParams.set('js_code', code);
        url.searchParams.set('grant_type', 'authorization_code');
        let response;
        try {
            response = await fetch(url.toString(), {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });
        }
        catch {
            throw new common_1.BadGatewayException({
                success: false,
                message: '微信登录失败',
            });
        }
        let data;
        try {
            data = (await response.json());
        }
        catch {
            throw new common_1.BadGatewayException({
                success: false,
                message: '微信登录失败',
            });
        }
        if (!response.ok || !data.openid) {
            throw new common_1.BadGatewayException({
                success: false,
                message: '微信登录失败',
            });
        }
        return {
            ...data,
            openid: data.openid,
        };
    }
    toClientUser(user) {
        const numericId = Number(user.id);
        return {
            id: Number.isSafeInteger(numericId) ? numericId : 0,
            nickName: user.nickName,
            avatarUrl: user.avatarUrl,
            gender: user.gender,
            country: user.country,
            province: user.province,
            city: user.city,
            language: user.language,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            lastLoginAt: user.lastLoginAt,
        };
    }
};
exports.WechatAuthService = WechatAuthService;
exports.WechatAuthService = WechatAuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, typeorm_1.InjectRepository)(wx_user_entity_1.WxUser)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        typeorm_2.Repository,
        auth_token_service_1.AuthTokenService])
], WechatAuthService);
//# sourceMappingURL=wechat-auth.service.js.map