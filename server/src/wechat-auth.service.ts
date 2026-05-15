import { BadGatewayException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthTokenService } from './auth-token.service';
import { UpdateProfileDto } from './dto/profile.dto';
import { WechatLoginDto, WechatUserInfoDto } from './dto/wechat-login.dto';
import { WinstonLoggerService } from './logger.service';
import { WxUser } from './wx-user.entity';

type WechatSessionResponse = {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

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

@Injectable()
export class WechatAuthService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(WxUser) private readonly wxUserRepo: Repository<WxUser>,
    private readonly authTokenService: AuthTokenService,
    private readonly logger: WinstonLoggerService,
  ) {}

  async login(body: WechatLoginDto): Promise<{ success: true; token: string; user: ClientWechatUser }> {
    const appid = this.configService.get<string>('WECHAT_APPID')?.trim();
    const secret = this.configService.get<string>('WECHAT_SECRET')?.trim();

    if (!appid || !secret) {
      throw new InternalServerErrorException({
        success: false,
        message: '微信登录未配置',
      });
    }

    this.logger.log(
      `[wechat-login] request received appid=${appid} code=${this.maskValue(body.code, 6, 4)}`,
    );

    const session = await this.getWechatSession(body.code, appid, secret);
    this.logger.log(
      `[wechat-login] jscode2session resolved appid=${appid} openid=${this.maskValue(
        session.openid,
        6,
        4,
      )} unionid=${this.maskValue(session.unionid, 4, 4)}`,
    );

    const profile = this.normalizeProfile(body.userInfo);
    const now = new Date();

    let user = await this.wxUserRepo.findOne({ where: { openid: session.openid } });
    const action = user ? 'update-existing-user' : 'create-new-user';

    this.logger.log(
      `[wechat-login] db lookup action=${action} openid=${this.maskValue(session.openid, 6, 4)} existingUserId=${
        user?.id ?? 'none'
      }`,
    );

    if (!user) {
      user = this.wxUserRepo.create({
        openid: session.openid,
        unionid: session.unionid ?? null,
        appid,
        ...profile,
        lastLoginAt: now,
      });
    } else {
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

    this.logger.log(
      `[wechat-login] completed action=${action} userId=${savedUser.id} openid=${this.maskValue(
        savedUser.openid,
        6,
        4,
      )}`,
    );

    return {
      success: true,
      token,
      user: this.toClientUser(savedUser),
    };
  }

  async getProfile(userId: string): Promise<{ success: true; user: ClientWechatUser }> {
    const user = await this.wxUserRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new InternalServerErrorException({
        success: false,
        message: '用户不存在',
      });
    }

    return {
      success: true,
      user: this.toClientUser(user),
    };
  }

  async updateProfile(
    userId: string,
    body: UpdateProfileDto,
  ): Promise<{ success: true; user: ClientWechatUser }> {
    const user = await this.wxUserRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new InternalServerErrorException({
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

  private normalizeProfile(userInfo?: WechatUserInfoDto) {
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

  private safeString(value: string | undefined, maxLength: number): string {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
  }

  private maskValue(value: string | null | undefined, prefixLength: number, suffixLength: number): string {
    if (!value) {
      return 'none';
    }

    if (value.length <= prefixLength + suffixLength) {
      return value;
    }

    return `${value.slice(0, prefixLength)}...${value.slice(-suffixLength)}`;
  }

  private async getWechatSession(
    code: string,
    appid: string,
    secret: string,
  ): Promise<Required<Pick<WechatSessionResponse, 'openid'>> & WechatSessionResponse> {
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', appid);
    url.searchParams.set('secret', secret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new BadGatewayException({
        success: false,
        message: '微信登录失败',
      });
    }

    let data: WechatSessionResponse;
    try {
      data = (await response.json()) as WechatSessionResponse;
    } catch {
      throw new BadGatewayException({
        success: false,
        message: '微信登录失败',
      });
    }

    if (!response.ok || !data.openid) {
      throw new BadGatewayException({
        success: false,
        message: '微信登录失败',
      });
    }

    return {
      ...data,
      openid: data.openid,
    };
  }

  private toClientUser(user: WxUser): ClientWechatUser {
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
}
