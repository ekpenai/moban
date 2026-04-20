"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const bull_1 = require("@nestjs/bull");
const psd_service_1 = require("./psd.service");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const template_entity_1 = require("./template.entity");
const template_dto_1 = require("./dto/template.dto");
const logger_service_1 = require("./logger.service");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let AppController = class AppController {
    psdService;
    renderQueue;
    templateRepo;
    logger;
    constructor(psdService, renderQueue, templateRepo, logger) {
        this.psdService = psdService;
        this.renderQueue = renderQueue;
        this.templateRepo = templateRepo;
        this.logger = logger;
    }
    async uploadPsd(file) {
        const result = await this.psdService.parsePsd(file.path);
        return { data: result };
    }
    async uploadImage(file) {
        const url = `http://localhost:3000/uploads/${file.filename}`;
        return { url };
    }
    async saveTemplate(body) {
        let thumbnailPath = body.thumbnail;
        if (body.thumbnail && body.thumbnail.startsWith('data:image')) {
            const base64Data = body.thumbnail.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            const filename = `thumb-${Date.now()}.png`;
            const uploadDir = path.join(process.cwd(), 'uploads');
            this.logger.log(`Saving thumbnail to: ${path.join(uploadDir, filename)}`);
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            fs.writeFileSync(path.join(uploadDir, filename), buffer);
            thumbnailPath = `http://localhost:3000/uploads/${filename}`;
        }
        const template = this.templateRepo.create({
            id: body.id,
            name: body.name,
            width: body.width,
            height: body.height,
            layers: body.layers,
            thumbnail: thumbnailPath,
            category: body.category || '未分类'
        });
        const saved = await this.templateRepo.save(template);
        return { data: saved };
    }
    async listTemplates() {
        const list = await this.templateRepo.find({
            select: ['id', 'name', 'width', 'height', 'createdAt', 'thumbnail', 'category'],
            order: { createdAt: 'DESC' }
        });
        return { data: list };
    }
    async getTemplateDetail(id) {
        const template = await this.templateRepo.findOne({ where: { id } });
        return { data: template };
    }
    async deleteTemplate(id) {
        await this.templateRepo.delete(id);
        return { success: true };
    }
    async batchDeleteTemplates(ids) {
        if (!ids || ids.length === 0)
            return { success: true };
        await this.templateRepo.delete(ids);
        return { success: true };
    }
    async renderTemplate(body) {
        this.logger.log(`Received render request for template`);
        try {
            const job = await this.renderQueue.add('render-job', {
                template: body.template,
            }, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
                removeOnComplete: 100,
                removeOnFail: 500,
            });
            const counts = await this.renderQueue.getJobCounts();
            this.logger.log(`Job ${job.id} added successfully. Queue status: ${JSON.stringify(counts)}`);
            return { jobId: job.id };
        }
        catch (err) {
            this.logger.error('Failed to add job to Redis', err.stack);
            throw err;
        }
    }
    async getRenderStatus(jobId) {
        const job = await this.renderQueue.getJob(jobId);
        if (!job) {
            return { status: 'not_found' };
        }
        const state = await job.getState();
        const result = job.returnvalue;
        return {
            status: state,
            result,
            failedReason: state === 'failed' ? String(job.failedReason || '') : undefined,
        };
    }
};
exports.AppController = AppController;
__decorate([
    (0, common_1.Post)('upload/psd'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { dest: './uploads' })),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "uploadPsd", null);
__decorate([
    (0, common_1.Post)('upload/image'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { dest: './uploads' })),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "uploadImage", null);
__decorate([
    (0, common_1.Post)('templates/save'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [template_dto_1.SaveTemplateDto]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "saveTemplate", null);
__decorate([
    (0, common_1.Get)('templates'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "listTemplates", null);
__decorate([
    (0, common_1.Get)('templates/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getTemplateDetail", null);
__decorate([
    (0, common_1.Delete)('templates/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "deleteTemplate", null);
__decorate([
    (0, common_1.Post)('templates/batch-delete'),
    __param(0, (0, common_1.Body)('ids')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "batchDeleteTemplates", null);
__decorate([
    (0, common_1.Post)('render'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [template_dto_1.RenderTemplateDto]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "renderTemplate", null);
__decorate([
    (0, common_1.Get)('render/:jobId'),
    __param(0, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getRenderStatus", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __param(1, (0, bull_1.InjectQueue)('renderQueue')),
    __param(2, (0, typeorm_1.InjectRepository)(template_entity_1.Template)),
    __metadata("design:paramtypes", [psd_service_1.PsdService, Object, typeorm_2.Repository,
        logger_service_1.WinstonLoggerService])
], AppController);
//# sourceMappingURL=app.controller.js.map