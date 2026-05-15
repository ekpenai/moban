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
exports.UserDataService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_draft_entity_1 = require("./user-draft.entity");
const user_favorite_entity_1 = require("./user-favorite.entity");
let UserDataService = class UserDataService {
    favoriteRepo;
    draftRepo;
    constructor(favoriteRepo, draftRepo) {
        this.favoriteRepo = favoriteRepo;
        this.draftRepo = draftRepo;
    }
    async listFavorites(userId) {
        const list = await this.favoriteRepo.find({
            where: { userId },
            order: { createdAt: 'DESC' },
        });
        return {
            success: true,
            data: list.map((item) => ({
                templateId: item.templateId,
                title: item.title,
                image: item.image,
                createdAt: item.createdAt,
            })),
        };
    }
    async saveFavorite(userId, body) {
        const finalTemplateId = String(body.templateId || body.id || '').trim();
        if (!finalTemplateId) {
            return { success: false, message: '缺少 templateId' };
        }
        let favorite = await this.favoriteRepo.findOne({
            where: { userId, templateId: finalTemplateId },
        });
        if (!favorite) {
            favorite = this.favoriteRepo.create({
                userId,
                templateId: finalTemplateId,
                title: body.title?.trim() || '',
                image: body.image?.trim() || '',
            });
        }
        else {
            favorite.title = body.title?.trim() || '';
            favorite.image = body.image?.trim() || '';
        }
        await this.favoriteRepo.save(favorite);
        return { success: true };
    }
    async deleteFavorite(userId, templateId) {
        await this.favoriteRepo.delete({ userId, templateId });
        return { success: true };
    }
    async listDrafts(userId) {
        const list = await this.draftRepo.find({
            where: { userId },
            order: { updatedAt: 'DESC' },
        });
        return {
            success: true,
            data: list.map((item) => ({
                id: item.id,
                templateId: item.templateId,
                coverImage: item.coverImage,
                templateWidth: item.templateWidth,
                templateHeight: item.templateHeight,
                elementsJson: item.elementsJson,
                elements: this.parseElements(item.elementsJson),
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
            })),
        };
    }
    async saveDraft(userId, body) {
        const draftId = String(body.id || '').trim();
        if (!draftId) {
            return { success: false, message: '缺少草稿 id' };
        }
        let draft = await this.draftRepo.findOne({
            where: { id: draftId, userId },
        });
        if (!draft) {
            draft = this.draftRepo.create({
                id: draftId,
                userId,
            });
        }
        draft.templateId = body.templateId?.trim() || '';
        draft.coverImage = body.coverImage?.trim() || '';
        draft.templateWidth = Number.isFinite(body.templateWidth) ? Number(body.templateWidth) : 675;
        draft.templateHeight = Number.isFinite(body.templateHeight) ? Number(body.templateHeight) : 1200;
        draft.elementsJson = JSON.stringify(body.elements ?? []);
        await this.draftRepo.save(draft);
        return { success: true };
    }
    async deleteDraft(userId, id) {
        await this.draftRepo.delete({ id, userId });
        return { success: true };
    }
    parseElements(value) {
        try {
            return JSON.parse(value);
        }
        catch {
            return [];
        }
    }
};
exports.UserDataService = UserDataService;
exports.UserDataService = UserDataService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_favorite_entity_1.UserFavorite)),
    __param(1, (0, typeorm_1.InjectRepository)(user_draft_entity_1.UserDraft)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], UserDataService);
//# sourceMappingURL=user-data.service.js.map