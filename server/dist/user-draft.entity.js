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
exports.UserDraft = void 0;
const typeorm_1 = require("typeorm");
let UserDraft = class UserDraft {
    id;
    userId;
    templateId;
    coverImage;
    templateWidth;
    templateHeight;
    elementsJson;
    createdAt;
    updatedAt;
};
exports.UserDraft = UserDraft;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'varchar', length: 128 }),
    __metadata("design:type", String)
], UserDraft.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_user_updated'),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint', unsigned: true }),
    __metadata("design:type", String)
], UserDraft.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'template_id', type: 'varchar', length: 128, default: '' }),
    __metadata("design:type", String)
], UserDraft.prototype, "templateId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'cover_image', type: 'varchar', length: 1024, default: '' }),
    __metadata("design:type", String)
], UserDraft.prototype, "coverImage", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'template_width', type: 'int', default: 675 }),
    __metadata("design:type", Number)
], UserDraft.prototype, "templateWidth", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'template_height', type: 'int', default: 1200 }),
    __metadata("design:type", Number)
], UserDraft.prototype, "templateHeight", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'elements_json', type: 'longtext' }),
    __metadata("design:type", String)
], UserDraft.prototype, "elementsJson", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'datetime' }),
    __metadata("design:type", Date)
], UserDraft.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'datetime' }),
    __metadata("design:type", Date)
], UserDraft.prototype, "updatedAt", void 0);
exports.UserDraft = UserDraft = __decorate([
    (0, typeorm_1.Entity)('user_drafts')
], UserDraft);
//# sourceMappingURL=user-draft.entity.js.map