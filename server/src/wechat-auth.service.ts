import { BadGatewayException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WechatLoginDto, WechatUserInfoDto } from './dto/wechat-login.dto';
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
  ) {}

  async login(body: WechatLoginDto): Promise<{ success: true; user: ClientWechatUser }> {
    const appid = this.configService.get<string>('WECHAT_APPID')?.trim();
    const secret = this.configService.get<string>('WECHAT_SECRET')?.trim();

    if (!appid || !secret) {
      throw new InternalServerErrorException({
        success: false,
        message: '微信登录未配置',
      });
    }

    const session = await this.getWechatSession(body.code, appid, secret);
    const profile = this.normalizeProfile(body.userInfo);
    const now = new Date();

    let user = await this.wxUserRepo.findOne({ where: { openid: session.openid as string } });

    if (!user) {
      user = this.wxUserRepo.create({
        openid: session.openid as string,
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

    return {
      success: true,
      user: this.toClientUser(savedUser),
    };
  }

  private normalizeProfile(userInfo?: WechatUserInfoDto) {
    const safeString = (value: string | undefined, maxLength: number): string =>
      typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

    return {
      nickName: safeString(userInfo?.nickName, 64) || '微信用户',
      avatarUrl: safeString(userInfo?.avatarUrl, 512),
      gender: Number.isFinite(userInfo?.gender) ? Math.max(0, Number(userInfo?.gender)) : 0,
      country: safeString(userInfo?.country, 64),
      province: safeString(userInfo?.province, 64),
      city: safeString(userInfo?.city, 64),
      language: safeString(userInfo?.language, 32),
    };
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
