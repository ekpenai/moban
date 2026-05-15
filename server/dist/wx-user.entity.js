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
exports.WxUser = void 0;
const typeorm_1 = require("typeorm");
let WxUser = class WxUser {
    id;
    openid;
    unionid;
    appid;
    nickName;
    avatarUrl;
    gender;
    country;
    province;
    city;
    language;
    createdAt;
    updatedAt;
    lastLoginAt;
};
exports.WxUser = WxUser;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', unsigned: true }),
    __metadata("design:type", String)
], WxUser.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('uniq_openid', { unique: true }),
    (0, typeorm_1.Column)({ type: 'varchar', length: 128 }),
    __metadata("design:type", String)
], WxUser.prototype, "openid", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_unionid'),
    (0, typeorm_1.Column)({ type: 'varchar', length: 128, nullable: true, default: null }),
    __metadata("design:type", Object)
], WxUser.prototype, "unionid", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 64, nullable: true, default: null }),
    __metadata("design:type", Object)
], WxUser.prototype, "appid", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'nick_name', type: 'varchar', length: 64, default: '微信用户' }),
    __metadata("design:type", String)
], WxUser.prototype, "nickName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'avatar_url', type: 'varchar', length: 512, default: '' }),
    __metadata("design:type", String)
], WxUser.prototype, "avatarUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'tinyint', unsigned: true, default: 0 }),
    __metadata("design:type", Number)
], WxUser.prototype, "gender", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 64, default: '' }),
    __metadata("design:type", String)
], WxUser.prototype, "country", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 64, default: '' }),
    __metadata("design:type", String)
], WxUser.prototype, "province", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 64, default: '' }),
    __metadata("design:type", String)
], WxUser.prototype, "city", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 32, default: '' }),
    __metadata("design:type", String)
], WxUser.prototype, "language", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'datetime' }),
    __metadata("design:type", Date)
], WxUser.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'datetime' }),
    __metadata("design:type", Date)
], WxUser.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_login_at', type: 'datetime', nullable: true, default: null }),
    __metadata("design:type", Object)
], WxUser.prototype, "lastLoginAt", void 0);
exports.WxUser = WxUser = __decorate([
    (0, typeorm_1.Entity)('wx_users')
], WxUser);
//# sourceMappingURL=wx-user.entity.js.map