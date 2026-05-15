import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AuthTokenService } from './auth-token.service';
import { UpdateProfileDto } from './dto/profile.dto';
import { WechatLoginDto } from './dto/wechat-login.dto';
import { WxUser } from './wx-user.entity';
type ClientWechatUser = {
    id: number;
    nickName: string;
    avatarUrl: string;
    gender: number;
    country: string;
    province: string;
    city: string;
    language: string;
    createdAt: Date;
    updatedAt: Date;
    lastLoginAt: Date | null;
};
export declare class WechatAuthService {
    private readonly configService;
    private readonly wxUserRepo;
    private readonly authTokenService;
    constructor(configService: ConfigService, wxUserRepo: Repository<WxUser>, authTokenService: AuthTokenService);
    login(body: WechatLoginDto): Promise<{
        success: true;
        token: string;
        user: ClientWechatUser;
    }>;
    getProfile(userId: string): Promise<{
        success: true;
        user: ClientWechatUser;
    }>;
    updateProfile(userId: string, body: UpdateProfileDto): Promise<{
        success: true;
        user: ClientWechatUser;
    }>;
    private normalizeProfile;
    private safeString;
    private getWechatSession;
    private toClientUser;
}
export {};
