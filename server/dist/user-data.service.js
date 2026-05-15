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
const logger_service_1 = require("./logger.service");
const user_draft_entity_1 = require("./user-draft.entity");
const user_favorite_entity_1 = require("./user-favorite.entity");
let UserDataService = class UserDataService {
    favoriteRepo;
    draftRepo;
    logger;
    constructor(favoriteRepo, draftRepo, logger) {
        this.favoriteRepo = favoriteRepo;
        this.draftRepo = draftRepo;
        this.logger = logger;
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
        const startedAt = Date.now();
        this.logger.log(`[drafts] list start userId=${userId}`);
        const list = await this.draftRepo.find({
            where: { userId },
            order: { updatedAt: 'DESC' },
        });
        const durationMs = Date.now() - startedAt;
        const elementsSummary = list.map((item) => `${item.id}:${item.elementsJson?.length || 0}`).join(',') || 'none';
        this.logger.log(`[drafts] list done userId=${userId} count=${list.length} durationMs=${durationMs} elementsJson=${elementsSummary}`);
        return {
            success: true,
            data: list.map((item) => ({
                id: item.id,
                templateId: item.templateId,
                coverImage: item.coverImage,
                templateWidth: item.templateWidth,
                templateHeight: item.templateHeight,
                elementsJson: item.elementsJson,
                updatedAt: item.updatedAt instanceof Date ? item.updatedAt.getTime() : item.updatedAt,
            })),
        };
    }
    async saveDraft(userId, body) {
        const startedAt = Date.now();
        const draftId = String(body.id || '').trim();
        if (!draftId) {
            throw new common_1.BadRequestException({ success: false, message: '缺少草稿 id' });
        }
        const templateId = String(body.templateId || body.template_id || '').trim();
        const coverImage = String(body.coverImage || body.cover_image || '').trim();
        const templateWidth = this.normalizeDimension(body.templateWidth, body.template_width, 675);
        const templateHeight = this.normalizeDimension(body.templateHeight, body.template_height, 1200);
        const elements = this.normalizeDraftElements(body);
        this.logger.log(`[drafts] save start userId=${userId} draftId=${draftId} templateId=${templateId || 'none'} hasElements=${Array.isArray(body.elements)} hasLayers=${Array.isArray(body.layers)} hasElementsJson=${typeof body.elementsJson === 'string'} hasElements_json=${typeof body.elements_json === 'string'} normalizedCount=${elements.length}`);
        if (!Array.isArray(elements) || elements.length === 0) {
            throw new common_1.BadRequestException({ success: false, message: '草稿图层为空' });
        }
        const elementsJson = JSON.stringify(elements);
        let draft = await this.draftRepo.findOne({
            where: { id: draftId, userId },
        });
        if (!draft) {
            draft = this.draftRepo.create({
                id: draftId,
                userId,
            });
        }
        draft.templateId = templateId;
        draft.coverImage = coverImage;
        draft.templateWidth = templateWidth;
        draft.templateHeight = templateHeight;
        draft.elementsJson = elementsJson;
        await this.draftRepo.save(draft);
        this.logger.log(`[drafts] save done userId=${userId} draftId=${draftId} durationMs=${Date.now() - startedAt} elementsJsonLength=${elementsJson.length}`);
        return { success: true };
    }
    async deleteDraft(userId, id) {
        await this.draftRepo.delete({ id, userId });
        return { success: true };
    }
    normalizeDraftElements(body) {
        if (typeof body.elementsJson === 'string' && body.elementsJson.trim()) {
            const parsed = this.parseElements(body.elementsJson);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        }
        if (typeof body.elements_json === 'string' && body.elements_json.trim()) {
            const parsed = this.parseElements(body.elements_json);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        }
        if (Array.isArray(body.elements)) {
            return body.elements;
        }
        if (Array.isArray(body.layers)) {
            return body.layers;
        }
        return [];
    }
    normalizeDimension(primary, fallback, defaultValue) {
        const value = Number(primary ?? fallback);
        return Number.isFinite(value) && value > 0 ? value : defaultValue;
    }
    parseElements(value) {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
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
        typeorm_2.Repository,
        logger_service_1.WinstonLoggerService])
], UserDataService);
//# sourceMappingURL=user-data.service.js.map