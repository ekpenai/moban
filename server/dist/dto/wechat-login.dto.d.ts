export declare class WechatUserInfoDto {
    nickName?: string;
    avatarUrl?: string;
    gender?: number;
    country?: string;
    province?: string;
    city?: string;
    language?: string;
}
export declare class WechatLoginDto {
    code: string;
    userInfo?: WechatUserInfoDto;
}
