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
const multer_1 = require("multer");
const bull_1 = require("@nestjs/bull");
const psd_service_1 = require("./psd.service");
const s3_service_1 = require("./s3.service");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const template_entity_1 = require("./template.entity");
const setting_entity_1 = require("./setting.entity");
const template_dto_1 = require("./dto/template.dto");
const logger_service_1 = require("./logger.service");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function parseSizeToBytes(input, fallbackBytes) {
    if (!input)
        return fallbackBytes;
    const s = String(input).trim().toLowerCase();
    const m = s.match(/^(\d+(?:\.\d+)?)\s*(b|kb|kib|mb|mib|gb|gib)?$/);
    if (!m)
        return fallbackBytes;
    const value = Number(m[1]);
    const unit = m[2] || 'b';
    const factor = unit === 'kb' || unit === 'kib' ? 1024 :
        unit === 'mb' || unit === 'mib' ? 1024 * 1024 :
            unit === 'gb' || unit === 'gib' ? 1024 * 1024 * 1024 : 1;
    return Math.max(1, Math.floor(value * factor));
}
const PSD_UPLOAD_LIMIT_BYTES = parseSizeToBytes(process.env.PSD_UPLOAD_LIMIT || '300mb', 300 * 1024 * 1024);
let AppController = class AppController {
    psdService;
    s3Service;
    renderQueue;
    templateRepo;
    settingRepo;
    logger;
    constructor(psdService, s3Service, renderQueue, templateRepo, settingRepo, logger) {
        this.psdService = psdService;
        this.s3Service = s3Service;
        this.renderQueue = renderQueue;
        this.templateRepo = templateRepo;
        this.settingRepo = settingRepo;
        this.logger = logger;
    }
    getPublicBaseUrl(req) {
        const envBase = (process.env.PUBLIC_BASE_URL || '').trim();
        if (envBase) {
            return envBase.replace(/\/+$/, '');
        }
        const protoHeader = req?.headers['x-forwarded-proto']?.split(',')[0]?.trim();
        const hostHeader = req?.headers['x-forwarded-host']?.split(',')[0]?.trim();
        const host = hostHeader || req?.get('host') || `localhost:${process.env.PORT || 3000}`;
        const proto = protoHeader || req?.protocol || 'http';
        return `${proto}://${host}`.replace(/\/+$/, '');
    }
    toPublicUploadUrl(filename, req, folder = 'uploads') {
        return `${this.getPublicBaseUrl(req)}/${folder}/${filename}`;
    }
    normalizeUploadUrl(url, req) {
        if (!url || typeof url !== 'string')
            return url;
        return url
            .replace(/^https?:\/\/localhost:3000\/uploads\//i, `${this.getPublicBaseUrl(req)}/uploads/`)
            .replace(/^https?:\/\/localhost:3000\/images\//i, `${this.getPublicBaseUrl(req)}/images/`);
    }
    extractFieldsFromLayers(layers) {
        const regex = /【(.*?)】/g;
        const fields = [];
        const fieldMap = new Map();
        for (const layer of layers) {
            if (layer.type === 'text' && layer.text) {
                let match;
                while ((match = regex.exec(layer.text)) !== null) {
                    const raw = match[1];
                    const parts = raw.split('|');
                    const keyTypeStr = parts[0];
                    const value = parts[1] || '';
                    const [key, type] = keyTypeStr.split(':');
                    let max = undefined;
                    let autoScale = false;
                    for (let i = 2; i < parts.length; i++) {
                        if (parts[i].startsWith('max=')) {
                            max = parseInt(parts[i].replace('max=', ''), 10);
                        }
                        else if (parts[i] === 'autoScale') {
                            autoScale = true;
                        }
                    }
                    const textBefore = layer.text.substring(0, match.index);
                    const labelMatch = textBefore.match(/([^\s:：\n]+)[:：]?\s*$/);
                    const label = labelMatch ? labelMatch[1] : key;
                    if (!fieldMap.has(key)) {
                        const fieldObj = {
                            key,
                            label,
                            type: type || 'text',
                            value: value,
                            ...(max !== undefined && { max }),
                            ...(autoScale && { autoScale })
                        };
                        fieldMap.set(key, fieldObj);
                        fields.push(fieldObj);
                    }
                }
            }
        }
        return fields;
    }
    normalizeTemplateData(template, req) {
        const normalizedLayers = Array.isArray(template.layers)
            ? template.layers.map((layer) => ({
                ...layer,
                url: this.normalizeUploadUrl(layer?.url, req),
            }))
            : template.layers;
        const fields = this.extractFieldsFromLayers(normalizedLayers || []);
        return {
            ...template,
            thumbnail: this.normalizeUploadUrl(template.thumbnail, req) || '',
            layers: normalizedLayers,
            fields,
        };
    }
    async fillTemplateFields(body, req) {
        const { template, fieldsData } = body;
        if (!template || !template.layers) {
            throw new common_1.BadRequestException('Invalid template provided');
        }
        const newLayers = template.layers.map((layer) => {
            if (layer.type === 'text' && layer.text) {
                let newText = layer.text;
                const regex = /【(.*?)】/g;
                let match;
                let layerAutoScale = false;
                newText = newText.replace(regex, (_, raw) => {
                    const parts = raw.split('|');
                    const [key] = parts[0].split(':');
                    let max = undefined;
                    for (let i = 2; i < parts.length; i++) {
                        if (parts[i].startsWith('max=')) {
                            max = parseInt(parts[i].replace('max=', ''), 10);
                        }
                        else if (parts[i] === 'autoScale') {
                            layerAutoScale = true;
                        }
                    }
                    let val = fieldsData[key] !== undefined ? String(fieldsData[key]) : (parts[1] || '');
                    if (max !== undefined && val.length > max) {
                        val = val.substring(0, max);
                    }
                    return val;
                });
                return {
                    ...layer,
                    text: newText,
                    autoScale: layerAutoScale || layer.autoScale
                };
            }
            return layer;
        });
        return {
            data: {
                ...template,
                layers: newLayers
            }
        };
    }
    async uploadPsd(file) {
        if (!file) {
            throw new common_1.BadRequestException('未接收到 PSD 文件，或文件超过上传上限');
        }
        const result = await this.psdService.parsePsd(file.path);
        return { data: result };
    }
    async uploadImage(file, req) {
        if (!file)
            throw new common_1.BadRequestException('No file uploaded');
        const url = await this.s3Service.uploadFile(file.buffer, file.originalname, file.mimetype, 'images');
        return { url };
    }
    async uploadSysImage(file, req) {
        if (!file)
            throw new common_1.BadRequestException('No file uploaded');
        const url = await this.s3Service.uploadFile(file.buffer, file.originalname, file.mimetype, 'sys-images');
        return { url };
    }
    async getSetting(key) {
        const setting = await this.settingRepo.findOne({ where: { key } });
        return { data: setting ? setting.value : null };
    }
    async saveSetting(key, body) {
        let setting = await this.settingRepo.findOne({ where: { key } });
        if (!setting) {
            setting = this.settingRepo.create({ key, value: body.value });
        }
        else {
            setting.value = body.value;
        }
        await this.settingRepo.save(setting);
        return { success: true, data: setting.value };
    }
    async saveTemplate(body, req) {
        this.logger.log(`Incoming save request: name=${body.name}, category=${body.category}, thumb=${body.thumbnail?.substring(0, 50)}...`);
        let thumbnailPath = body.thumbnail;
        if (body.thumbnail && body.thumbnail.startsWith('data:image')) {
            try {
                thumbnailPath = await this.s3Service.uploadBase64(body.thumbnail, 'images');
            }
            catch (err) {
                this.logger.error('Failed to upload thumbnail to S3', err);
                throw new common_1.BadRequestException('上传缩略图失败');
            }
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
        this.logger.log(`Template saved successfully: id=${saved.id}, thumbnail=${saved.thumbnail}`);
        return { data: this.normalizeTemplateData(saved, req) };
    }
    async listTemplates(req) {
        const list = await this.templateRepo.find({
            select: ['id', 'name', 'width', 'height', 'createdAt', 'thumbnail', 'category'],
            order: { createdAt: 'DESC' }
        });
        return { data: list.map((item) => this.normalizeTemplateData(item, req)) };
    }
    async getTemplateDetail(id, req) {
        const template = await this.templateRepo.findOne({ where: { id } });
        return { data: template ? this.normalizeTemplateData(template, req) : null };
    }
    async deleteTemplate(id) {
        const template = await this.templateRepo.findOne({ where: { id } });
        if (template && template.thumbnail) {
            await this.deletePhysicalFile(template.thumbnail);
        }
        await this.templateRepo.delete(id);
        return { success: true };
    }
    async deletePhysicalFile(thumbnailUrl) {
        try {
            if (thumbnailUrl.includes('objectstorageapi') || thumbnailUrl.includes('sealosbja.site') || thumbnailUrl.includes('sealos.run')) {
                await this.s3Service.deleteFile(thumbnailUrl);
                return;
            }
            const parts = thumbnailUrl.split('/');
            const filename = parts[parts.length - 1];
            if (!filename)
                return;
            const filePath = path.join(process.cwd(), '..', 'images', filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                this.logger.log(`Deleted physical file: ${filePath}`);
            }
        }
        catch (err) {
            this.logger.error(`Failed to delete physical file: ${thumbnailUrl}`, err.stack);
        }
    }
    async batchDeleteTemplates(ids) {
        if (!ids || ids.length === 0)
            return { success: true };
        const templates = await this.templateRepo.findByIds(ids);
        for (const template of templates) {
            if (template.thumbnail) {
                await this.deletePhysicalFile(template.thumbnail);
            }
        }
        await this.templateRepo.delete(ids);
        return { success: true };
    }
    async renderTemplate(body) {
        this.logger.log(`Received render request for template`);
        try {
            const enqueuePromise = this.renderQueue.add('render-job', {
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
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('enqueue_timeout')), 12000);
            });
            const job = await Promise.race([enqueuePromise, timeoutPromise]);
            const counts = await this.renderQueue.getJobCounts();
            this.logger.log(`Job ${job.id} added successfully. Queue status: ${JSON.stringify(counts)}`);
            return { jobId: job.id };
        }
        catch (err) {
            this.logger.error('Failed to add job to Redis', err.stack);
            if (err?.message === 'enqueue_timeout') {
                throw new common_1.ServiceUnavailableException('渲染队列暂时不可用，请稍后重试');
            }
            throw new common_1.ServiceUnavailableException('渲染任务提交失败，请稍后重试');
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
    (0, common_1.Post)('templates/fill'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [template_dto_1.FillTemplateDto, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "fillTemplateFields", null);
__decorate([
    (0, common_1.Post)('upload/psd'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { dest: './uploads', limits: { fileSize: PSD_UPLOAD_LIMIT_BYTES } })),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "uploadPsd", null);
__decorate([
    (0, common_1.Post)('upload/image'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { storage: (0, multer_1.memoryStorage)() })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "uploadImage", null);
__decorate([
    (0, common_1.Post)('upload/sys-image'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { storage: (0, multer_1.memoryStorage)() })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "uploadSysImage", null);
__decorate([
    (0, common_1.Get)('settings/:key'),
    __param(0, (0, common_1.Param)('key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getSetting", null);
__decorate([
    (0, common_1.Post)('settings/:key'),
    __param(0, (0, common_1.Param)('key')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "saveSetting", null);
__decorate([
    (0, common_1.Post)('templates/save'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [template_dto_1.SaveTemplateDto, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "saveTemplate", null);
__decorate([
    (0, common_1.Get)('templates'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "listTemplates", null);
__decorate([
    (0, common_1.Get)('templates/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
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
    __param(2, (0, bull_1.InjectQueue)('renderQueue')),
    __param(3, (0, typeorm_1.InjectRepository)(template_entity_1.Template)),
    __param(4, (0, typeorm_1.InjectRepository)(setting_entity_1.Setting)),
    __metadata("design:paramtypes", [psd_service_1.PsdService,
        s3_service_1.S3Service, Object, typeorm_2.Repository,
        typeorm_2.Repository,
        logger_service_1.WinstonLoggerService])
], AppController);
//# sourceMappingURL=app.controller.js.map