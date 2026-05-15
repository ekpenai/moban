import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
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
    constructor(configService: ConfigService, wxUserRepo: Repository<WxUser>);
    login(body: WechatLoginDto): Promise<{
        success: true;
        user: ClientWechatUser;
    }>;
    private normalizeProfile;
    private getWechatSession;
    private toClientUser;
}
export {};
