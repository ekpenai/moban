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
const wx_user_entity_1 = require("./wx-user.entity");
const template_dto_1 = require("./dto/template.dto");
const profile_dto_1 = require("./dto/profile.dto");
const wechat_login_dto_1 = require("./dto/wechat-login.dto");
const user_data_dto_1 = require("./dto/user-data.dto");
const arabic_reshape_dto_1 = require("./dto/arabic-reshape.dto");
const render_job_dto_1 = require("./dto/render-job.dto");
const logger_service_1 = require("./logger.service");
const wechat_auth_service_1 = require("./wechat-auth.service");
const user_data_service_1 = require("./user-data.service");
const auth_guard_1 = require("./auth.guard");
const current_user_decorator_1 = require("./current-user.decorator");
const arabic_reshape_service_1 = require("./arabic-reshape.service");
const render_job_service_1 = require("./render-job.service");
const coze_cutout_service_1 = require("./coze-cutout.service");
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
const ALLOWED_FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2']);
let AppController = class AppController {
    psdService;
    s3Service;
    renderQueue;
    templateRepo;
    settingRepo;
    wxUserRepo;
    logger;
    wechatAuthService;
    userDataService;
    arabicReshapeService;
    renderJobService;
    cozeCutoutService;
    constructor(psdService, s3Service, renderQueue, templateRepo, settingRepo, wxUserRepo, logger, wechatAuthService, userDataService, arabicReshapeService, renderJobService, cozeCutoutService) {
        this.psdService = psdService;
        this.s3Service = s3Service;
        this.renderQueue = renderQueue;
        this.templateRepo = templateRepo;
        this.settingRepo = settingRepo;
        this.wxUserRepo = wxUserRepo;
        this.logger = logger;
        this.wechatAuthService = wechatAuthService;
        this.userDataService = userDataService;
        this.arabicReshapeService = arabicReshapeService;
        this.renderJobService = renderJobService;
        this.cozeCutoutService = cozeCutoutService;
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
        try {
            const result = await this.psdService.parsePsd(file.path);
            return { data: result };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'PSD parse failed';
            this.logger.error(`[upload/psd] parse failed path=${file.path} name=${file.originalname} size=${file.size}: ${message}`, error instanceof Error ? (error.stack ?? '') : '');
            throw new common_1.BadRequestException(`PSD 解析失败: ${message}`);
        }
        finally {
            try {
                if (file.path && fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            }
            catch (cleanupError) {
                this.logger.error(`[upload/psd] cleanup failed path=${file.path}`, cleanupError instanceof Error ? (cleanupError.stack ?? '') : '');
            }
        }
    }
    async importPsdTemplate(file, req) {
        if (!file) {
            throw new common_1.BadRequestException('未接收到 PSD 文件，或文件超过上传上限');
        }
        this.logger.log('[import-psd] Starting import: name=' + file.originalname + ' size=' + file.size);
        try {
            const psdResult = await this.psdService.parsePsd(file.path);
            const layers = await this.convertLayersToTemplateFormat(psdResult.layers, req);
            const thumbnailUrl = await this.generateThumbnail(layers, psdResult.width, psdResult.height, req);
            const template = new template_entity_1.Template();
            template.id = 'template_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            template.name = file.originalname.replace('.psd', '');
            template.width = psdResult.width;
            template.height = psdResult.height;
            template.layers = layers;
            template.thumbnail = thumbnailUrl || '';
            template.category = 'PSD导入';
            const saved = await this.templateRepo.save(template);
            this.logger.log('[import-psd] Template saved: id=' + saved.id);
            return {
                success: true,
                templateId: saved.id,
                data: this.normalizeTemplateData(saved, req),
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Import failed';
            this.logger.error('[import-psd] Import failed: ' + message, '');
            throw new common_1.BadRequestException('PSD 导入失败: ' + message);
        }
        finally {
            try {
                if (file.path && fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            }
            catch (cleanupError) {
                this.logger.error('[import-psd] Cleanup failed', '');
            }
        }
    }
    async convertLayersToTemplateFormat(layers, req) {
        const convertedLayers = [];
        for (const layer of layers) {
            const convertedLayer = {
                id: layer.id || 'layer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                type: layer.type || 'image',
                x: layer.x || 0,
                y: layer.y || 0,
                width: layer.width || 0,
                height: layer.height || 0,
                rotate: layer.rotation || 0,
                scale: layer.scaleX || 1,
                opacity: layer.opacity !== undefined ? layer.opacity : 1,
                editable: layer.editable !== false,
                zIndex: layer.zIndex || 0,
            };
            if (layer.type === 'text') {
                convertedLayer.text = layer.text;
                convertedLayer.fontSize = layer.fontSize;
                convertedLayer.fontFamily = layer.fontFamily;
                convertedLayer.color = layer.color;
                convertedLayer.alignment = layer.textAlign;
                convertedLayer.direction = layer.direction;
            }
            if (layer.url && layer.url.startsWith('data:image')) {
                try {
                    const imageUrl = await this.s3Service.uploadBase64(layer.url, 'templates');
                    convertedLayer.url = imageUrl;
                }
                catch (uploadError) {
                    this.logger.warn('[import-psd] Failed to upload layer image: ' + uploadError.message);
                    convertedLayer.url = layer.url;
                }
            }
            else if (layer.url) {
                convertedLayer.url = layer.url;
            }
            if (layer.maskUrl && layer.maskUrl.startsWith('data:image')) {
                try {
                    const maskUrl = await this.s3Service.uploadBase64(layer.maskUrl, 'templates');
                    convertedLayer.maskUrl = maskUrl;
                }
                catch (uploadError) {
                    this.logger.warn('[import-psd] Failed to upload mask: ' + uploadError.message);
                    convertedLayer.maskUrl = layer.maskUrl;
                }
            }
            else if (layer.maskUrl) {
                convertedLayer.maskUrl = layer.maskUrl;
            }
            convertedLayers.push(convertedLayer);
        }
        return convertedLayers;
    }
    async generateThumbnail(layers, width, height, req) {
        try {
            const { createCanvas } = require('canvas');
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            const imageLayer = layers.find(function (l) { return l.type === 'image' && l.url; });
            if (imageLayer) {
                const { JSDOM } = require('jsdom');
                const html = '<!DOCTYPE html><html><body><img src="' + imageLayer.url + '" /></body></html>';
                const dom = new JSDOM(html);
                const img = dom.window.document.querySelector('img');
                if (img && img.complete) {
                    ctx.drawImage(img, 0, 0, width, height);
                }
            }
            const thumbnailBase64 = canvas.toDataURL('image/png');
            return await this.s3Service.uploadBase64(thumbnailBase64, 'thumbnails');
        }
        catch (error) {
            this.logger.warn('[import-psd] Failed to generate thumbnail: ' + error.message);
            return null;
        }
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
    async removeImageBackground(inputUrl) {
        const url = await this.cozeCutoutService.removeBackground(inputUrl);
        return { success: true, url, imageUrl: url };
    }
    async uploadSysFont(file) {
        if (!file)
            throw new common_1.BadRequestException('No file uploaded');
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (!ALLOWED_FONT_EXTENSIONS.has(ext)) {
            throw new common_1.BadRequestException('Only ttf, otf, woff, woff2 font files are supported');
        }
        const mimeType = file.mimetype || 'font/ttf';
        const url = await this.s3Service.uploadFile(file.buffer, file.originalname, mimeType, 'fonts');
        return {
            url,
            name: path.basename(file.originalname, ext),
            ext,
        };
    }
    async wechatLogin(body) {
        return this.wechatAuthService.login(body);
    }
    async reshapeArabic(body) {
        return this.arabicReshapeService.reshapeText(body.text, body.mode);
    }
    async getProfile(user) {
        return this.wechatAuthService.getProfile(user.userId);
    }
    async updateProfile(user, body) {
        return this.wechatAuthService.updateProfile(user.userId, body);
    }
    async listFavorites(user) {
        return this.userDataService.listFavorites(user.userId);
    }
    async saveFavorite(user, body) {
        return this.userDataService.saveFavorite(user.userId, body);
    }
    async deleteFavorite(user, templateId) {
        return this.userDataService.deleteFavorite(user.userId, templateId);
    }
    async listDrafts(user) {
        return this.userDataService.listDrafts(user.userId);
    }
    async saveDraft(user, body) {
        return this.userDataService.saveDraft(user.userId, body);
    }
    async deleteDraft(user, id) {
        return this.userDataService.deleteDraft(user.userId, id);
    }
    async getSetting(key) {
        const setting = await this.settingRepo.findOne({ where: { key } });
        return { data: setting ? setting.value : null };
    }
    async getAdminDashboard() {
        const [userCount, templateCount] = await Promise.all([
            this.wxUserRepo.count(),
            this.templateRepo.count(),
        ]);
        const settings = await this.settingRepo.find();
        const settingsMap = new Map(settings.map((item) => [item.key, item.value]));
        const categoriesValue = settingsMap.get('categories');
        const fontsValue = settingsMap.get('fonts');
        const categoriesCount = Array.isArray(categoriesValue) ? categoriesValue.length : 0;
        const fontsCount = Array.isArray(fontsValue) ? fontsValue.length : 0;
        const vipSetting = settingsMap.get('admin_vip_user_ids');
        const adminSetting = settingsMap.get('admin_admin_user_ids');
        const vipUserIds = Array.isArray(vipSetting) ? vipSetting.map((item) => String(item)) : [];
        const adminUserIds = Array.isArray(adminSetting) ? adminSetting.map((item) => String(item)) : [];
        return {
            success: true,
            data: {
                userCount,
                templateCount,
                vipCount: vipUserIds.length,
                adminCount: adminUserIds.length,
                categoriesCount,
                fontsCount,
                systemStatus: 'ONLINE',
                miniProgramStatus: 'READY',
            },
        };
    }
    async getAdminUsers() {
        const [users, settings] = await Promise.all([
            this.wxUserRepo.find({ order: { updatedAt: 'DESC' } }),
            this.settingRepo.find({
                where: [
                    { key: 'admin_vip_user_ids' },
                    { key: 'admin_admin_user_ids' },
                ],
            }),
        ]);
        const settingsMap = new Map(settings.map((item) => [item.key, item.value]));
        const vipUserIds = new Set(Array.isArray(settingsMap.get('admin_vip_user_ids'))
            ? settingsMap.get('admin_vip_user_ids').map((item) => String(item))
            : []);
        const adminUserIds = new Set(Array.isArray(settingsMap.get('admin_admin_user_ids'))
            ? settingsMap.get('admin_admin_user_ids').map((item) => String(item))
            : []);
        return {
            success: true,
            data: users.map((user) => {
                const userId = String(user.id);
                const isAdmin = adminUserIds.has(userId);
                return {
                    id: userId,
                    name: user.nickName || '微信用户',
                    phone: user.openid ? `openid:${user.openid.slice(0, 6)}...` : '',
                    role: isAdmin ? 'Admin' : 'User',
                    vip: vipUserIds.has(userId),
                    status: user.lastLoginAt ? '活跃' : '待接入',
                    note: user.city || user.province || user.country || '微信登录用户',
                    avatarUrl: user.avatarUrl || '',
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt,
                    lastLoginAt: user.lastLoginAt,
                };
            }),
        };
    }
    async updateAdminUserFlags(id, body) {
        const user = await this.wxUserRepo.findOne({ where: { id } });
        if (!user) {
            throw new common_1.BadRequestException('user not found');
        }
        const keys = ['admin_vip_user_ids', 'admin_admin_user_ids'];
        const settings = await this.settingRepo.find({ where: keys.map((key) => ({ key })) });
        const settingsMap = new Map(settings.map((item) => [item.key, item]));
        const ensureSetting = (key) => {
            const existing = settingsMap.get(key);
            if (existing)
                return existing;
            const created = this.settingRepo.create({ key, value: [] });
            settingsMap.set(key, created);
            return created;
        };
        const updateIdList = (key, enabled) => {
            const setting = ensureSetting(key);
            const current = Array.isArray(setting.value) ? setting.value.map((item) => String(item)) : [];
            const next = new Set(current);
            if (enabled) {
                next.add(String(id));
            }
            else {
                next.delete(String(id));
            }
            setting.value = Array.from(next);
            return setting;
        };
        const pendingSaves = [];
        if (typeof body.vip === 'boolean') {
            pendingSaves.push(updateIdList('admin_vip_user_ids', body.vip));
        }
        if (body.role === 'Admin' || body.role === 'User') {
            pendingSaves.push(updateIdList('admin_admin_user_ids', body.role === 'Admin'));
        }
        if (pendingSaves.length > 0) {
            await this.settingRepo.save(pendingSaves);
        }
        return {
            success: true,
            data: {
                id: String(user.id),
                vip: typeof body.vip === 'boolean' ? body.vip : undefined,
                role: body.role,
            },
        };
    }
    async getAdminSettings() {
        const settings = await this.settingRepo.find();
        return {
            success: true,
            data: settings.map((item) => ({
                key: item.key,
                value: item.value,
            })),
        };
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
    async getTemplateReplaceLayer(id, req) {
        const template = await this.templateRepo.findOne({ where: { id } });
        if (!template) {
            return { data: null, message: 'Template not found' };
        }
        const layers = Array.isArray(template.layers) ? template.layers : [];
        let replaceLayer = layers.find((l) => l.name === '替换');
        if (!replaceLayer) {
            replaceLayer = layers.find((l) => l.name && l.name.includes('替换'));
        }
        if (!replaceLayer) {
            return { data: null, message: '未找到名称为“替换”的图层' };
        }
        return {
            data: {
                id: replaceLayer.id,
                name: replaceLayer.name,
                x: replaceLayer.maskRect ? replaceLayer.maskRect.x : replaceLayer.x,
                y: replaceLayer.maskRect ? replaceLayer.maskRect.y : replaceLayer.y,
                width: replaceLayer.maskRect ? replaceLayer.maskRect.width : replaceLayer.width,
                height: replaceLayer.maskRect ? replaceLayer.maskRect.height : replaceLayer.height,
                url: this.normalizeUploadUrl(replaceLayer.maskUrl || replaceLayer.url, req),
                type: replaceLayer.type,
            }
        };
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
    async renderTemplate(user, body, req) {
        this.logger.log(`Received render request for template`);
        if (!body?.template || !Array.isArray(body.template.layers)) {
            throw new common_1.BadRequestException('template.layers is required');
        }
        try {
            const sourceHeader = String(req.headers['x-render-source'] || '').trim().toLowerCase();
            const userAgent = String(req.headers['user-agent'] || '').toLowerCase();
            const source = sourceHeader === 'mini_program' || userAgent.includes('miniprogram') || userAgent.includes('micromessenger')
                ? 'mini_program'
                : 'web';
            const enqueuePromise = this.renderQueue.add('render-job', {
                template: body.template,
                userId: user.userId,
                source,
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
                setTimeout(() => reject(new Error('enqueue_timeout')), 1800);
            });
            const job = await Promise.race([enqueuePromise, timeoutPromise]);
            await this.renderJobService.createJob({
                jobId: String(job.id),
                userId: user.userId,
                source,
                status: 'queued',
                stage: 'queued',
                progress: 0,
                message: 'Render job queued',
            });
            this.logger.log(`Job ${job.id} added successfully.`);
            return {
                jobId: String(job.id),
                status: 'queued',
            };
        }
        catch (err) {
            this.logger.error('Failed to add job to Redis', err.stack);
            if (err?.message === 'enqueue_timeout') {
                throw new common_1.ServiceUnavailableException('render queue unavailable');
            }
            throw new common_1.ServiceUnavailableException('failed to submit render job');
        }
    }
    async getRenderStatus(user, jobId) {
        const ownedJob = await this.renderJobService.getJobForUser(jobId, user.userId);
        const job = await this.renderQueue.getJob(jobId);
        if (!job) {
            return {
                jobId,
                status: 'failed',
                stage: ownedJob.stage || 'failed',
                progress: ownedJob.progress || 0,
                message: ownedJob.failedReason || ownedJob.message || 'job not found or expired',
                updatedAt: ownedJob.updatedAt?.toISOString?.() || null,
                durationMs: ownedJob.startedAt ? Math.max(0, (ownedJob.completedAt || ownedJob.updatedAt).getTime() - ownedJob.startedAt.getTime()) : null,
            };
        }
        const state = await job.getState();
        const progressValue = job.progress();
        const progress = typeof progressValue === 'number'
            ? progressValue
            : typeof progressValue === 'object' && typeof progressValue?.percent === 'number'
                ? progressValue.percent
                : state === 'completed'
                    ? 100
                    : state === 'active'
                        ? 1
                        : 0;
        if (state === 'completed') {
            const returnValue = job.returnvalue;
            const imageUrl = returnValue?.imageUrl || job.data?.uploadedImageUrl;
            let imageBase64 = returnValue?.imageBase64;
            if (!imageUrl && typeof returnValue === 'string' && returnValue.startsWith('data:image/')) {
                imageBase64 = returnValue;
            }
            const detail = await this.renderJobService.getJobDetailForUser(jobId, user.userId);
            return {
                jobId,
                status: 'completed',
                progress: 100,
                stage: detail.stage || 'completed',
                message: detail.message,
                imageUrl,
                result: !imageUrl ? imageBase64 : undefined,
                updatedAt: detail.updatedAt,
                durationMs: detail.durationMs,
                recentLogs: detail.recentLogs,
            };
        }
        if (state === 'failed') {
            const detail = await this.renderJobService.getJobDetailForUser(jobId, user.userId);
            return {
                jobId,
                status: 'failed',
                progress,
                stage: detail.stage || 'failed',
                message: detail.failedReason || detail.message || String(job.failedReason || 'render failed'),
                updatedAt: detail.updatedAt,
                durationMs: detail.durationMs,
                recentLogs: detail.recentLogs,
            };
        }
        const normalizedStatus = state === 'active'
            ? 'processing'
            : state === 'waiting' || state === 'delayed' || state === 'paused'
                ? 'queued'
                : state;
        const detail = await this.renderJobService.getJobDetailForUser(jobId, user.userId);
        return {
            jobId,
            status: normalizedStatus,
            progress,
            stage: detail.stage || normalizedStatus,
            message: detail.message,
            updatedAt: detail.updatedAt,
            durationMs: detail.durationMs,
            recentLogs: detail.recentLogs,
        };
    }
    async listRenderJobs(user, req) {
        const query = req.query;
        return {
            success: true,
            data: await this.renderJobService.listJobsForUser(user.userId, query),
        };
    }
    async getRenderJobDetail(user, jobId) {
        return {
            success: true,
            data: await this.renderJobService.getJobDetailForUser(jobId, user.userId),
        };
    }
    async getRenderJobLogs(user, jobId) {
        return {
            success: true,
            data: await this.renderJobService.getJobLogsForUser(jobId, user.userId),
        };
    }
    async streamRenderJob(user, jobId, res) {
        await this.renderJobService.getJobForUser(jobId, user.userId);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();
        const writeEvent = (event, payload) => {
            res.write(`event: ${event}\n`);
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        };
        writeEvent('snapshot', await this.renderJobService.getJobDetailForUser(jobId, user.userId));
        writeEvent('logs', await this.renderJobService.getJobLogsForUser(jobId, user.userId));
        const unsubscribe = this.renderJobService.subscribe(jobId, (event) => {
            writeEvent(event.type, event.payload);
        });
        const heartbeat = setInterval(() => {
            res.write(': ping\n\n');
        }, 15000);
        res.on('close', () => {
            clearInterval(heartbeat);
            unsubscribe();
            res.end();
        });
    }
    async recordRenderJobEvent(jobId, body, req) {
        const internalToken = (process.env.WORKER_INTERNAL_TOKEN || '').trim();
        if (internalToken) {
            const authorization = String(req.headers.authorization || '');
            const expected = `Bearer ${internalToken}`;
            if (authorization !== expected) {
                throw new common_1.UnauthorizedException({ success: false, message: 'invalid worker token' });
            }
        }
        await this.renderJobService.recordEvent({
            jobId,
            userId: body.userId,
            status: body.status,
            stage: body.stage,
            progress: typeof body.progress === 'number' ? body.progress : undefined,
            message: body.message,
            level: body.level,
            imageUrl: body.imageUrl,
            failedReason: body.failedReason,
            startedAt: body.startedAt,
            completedAt: body.completedAt,
            meta: body.meta,
        });
        return { success: true };
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
    (0, common_1.Post)('templates/import-psd'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { dest: './uploads', limits: { fileSize: PSD_UPLOAD_LIMIT_BYTES } })),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "importPsdTemplate", null);
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
    (0, common_1.Post)('image/remove-background'),
    __param(0, (0, common_1.Body)('inputUrl')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "removeImageBackground", null);
__decorate([
    (0, common_1.Post)('upload/sys-font'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { storage: (0, multer_1.memoryStorage)() })),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "uploadSysFont", null);
__decorate([
    (0, common_1.Post)('auth/wechat-login'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [wechat_login_dto_1.WechatLoginDto]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "wechatLogin", null);
__decorate([
    (0, common_1.Post)('api/arabic/reshape'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [arabic_reshape_dto_1.ArabicReshapeDto]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "reshapeArabic", null);
__decorate([
    (0, common_1.Get)('me/profile'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Post)('me/profile'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, profile_dto_1.UpdateProfileDto]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.Get)('me/favorites'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "listFavorites", null);
__decorate([
    (0, common_1.Post)('me/favorites'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, user_data_dto_1.SaveFavoriteDto]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "saveFavorite", null);
__decorate([
    (0, common_1.Delete)('me/favorites/:templateId'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('templateId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "deleteFavorite", null);
__decorate([
    (0, common_1.Get)('me/drafts'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "listDrafts", null);
__decorate([
    (0, common_1.Post)('me/drafts'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, user_data_dto_1.SaveDraftDto]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "saveDraft", null);
__decorate([
    (0, common_1.Delete)('me/drafts/:id'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "deleteDraft", null);
__decorate([
    (0, common_1.Get)('settings/:key'),
    __param(0, (0, common_1.Param)('key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getSetting", null);
__decorate([
    (0, common_1.Get)('admin/dashboard'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getAdminDashboard", null);
__decorate([
    (0, common_1.Get)('admin/users'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getAdminUsers", null);
__decorate([
    (0, common_1.Patch)('admin/users/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "updateAdminUserFlags", null);
__decorate([
    (0, common_1.Get)('admin/settings'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getAdminSettings", null);
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
    (0, common_1.Get)('templates/:id/replace-layer'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getTemplateReplaceLayer", null);
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
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, template_dto_1.RenderTemplateDto, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "renderTemplate", null);
__decorate([
    (0, common_1.Get)('render/:jobId'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getRenderStatus", null);
__decorate([
    (0, common_1.Get)('me/render-jobs'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "listRenderJobs", null);
__decorate([
    (0, common_1.Get)('me/render-jobs/:jobId'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getRenderJobDetail", null);
__decorate([
    (0, common_1.Get)('me/render-jobs/:jobId/logs'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getRenderJobLogs", null);
__decorate([
    (0, common_1.Get)('me/render-jobs/:jobId/stream'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('jobId')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "streamRenderJob", null);
__decorate([
    (0, common_1.Post)('internal/render-jobs/:jobId/events'),
    __param(0, (0, common_1.Param)('jobId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, render_job_dto_1.CreateRenderEventDto, Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "recordRenderJobEvent", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __param(2, (0, bull_1.InjectQueue)('renderQueue')),
    __param(3, (0, typeorm_1.InjectRepository)(template_entity_1.Template)),
    __param(4, (0, typeorm_1.InjectRepository)(setting_entity_1.Setting)),
    __param(5, (0, typeorm_1.InjectRepository)(wx_user_entity_1.WxUser)),
    __metadata("design:paramtypes", [psd_service_1.PsdService,
        s3_service_1.S3Service, Object, typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        logger_service_1.WinstonLoggerService,
        wechat_auth_service_1.WechatAuthService,
        user_data_service_1.UserDataService,
        arabic_reshape_service_1.ArabicReshapeService,
        render_job_service_1.RenderJobService,
        coze_cutout_service_1.CozeCutoutService])
], AppController);
//# sourceMappingURL=app.controller.js.map