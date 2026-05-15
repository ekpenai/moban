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
exports.UserFavorite = void 0;
const typeorm_1 = require("typeorm");
let UserFavorite = class UserFavorite {
    id;
    userId;
    templateId;
    title;
    image;
    createdAt;
};
exports.UserFavorite = UserFavorite;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', unsigned: true }),
    __metadata("design:type", String)
], UserFavorite.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_user_id'),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint', unsigned: true }),
    __metadata("design:type", String)
], UserFavorite.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'template_id', type: 'varchar', length: 128 }),
    __metadata("design:type", String)
], UserFavorite.prototype, "templateId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, default: '' }),
    __metadata("design:type", String)
], UserFavorite.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 1024, default: '' }),
    __metadata("design:type", String)
], UserFavorite.prototype, "image", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'datetime' }),
    __metadata("design:type", Date)
], UserFavorite.prototype, "createdAt", void 0);
exports.UserFavorite = UserFavorite = __decorate([
    (0, typeorm_1.Entity)('user_favorites'),
    (0, typeorm_1.Index)('uniq_user_template', ['userId', 'templateId'], { unique: true })
], UserFavorite);
//# sourceMappingURL=user-favorite.entity.js.map