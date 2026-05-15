export declare class WxUser {
    id: string;
    openid: string;
    unionid: string | null;
    appid: string | null;
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
}
