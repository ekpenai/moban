import type { Queue } from 'bull';
import { PsdService } from './psd.service';
import { S3Service } from './s3.service';
import { Repository } from 'typeorm';
import { Template } from './template.entity';
import { Setting } from './setting.entity';
import { SaveTemplateDto, RenderTemplateDto, FillTemplateDto } from './dto/template.dto';
import { WechatLoginDto } from './dto/wechat-login.dto';
import { SaveDraftDto, SaveFavoriteDto } from './dto/user-data.dto';
import { WinstonLoggerService } from './logger.service';
import { WechatAuthService } from './wechat-auth.service';
import { UserDataService } from './user-data.service';
import { type AuthenticatedRequestUser } from './auth.guard';
import type { Request } from 'express';
export declare class AppController {
    private readonly psdService;
    private readonly s3Service;
    private renderQueue;
    private templateRepo;
    private settingRepo;
    private readonly logger;
    private readonly wechatAuthService;
    private readonly userDataService;
    constructor(psdService: PsdService, s3Service: S3Service, renderQueue: Queue, templateRepo: Repository<Template>, settingRepo: Repository<Setting>, logger: WinstonLoggerService, wechatAuthService: WechatAuthService, userDataService: UserDataService);
    private getPublicBaseUrl;
    private toPublicUploadUrl;
    private normalizeUploadUrl;
    private extractFieldsFromLayers;
    private normalizeTemplateData;
    fillTemplateFields(body: FillTemplateDto, req: Request): Promise<{
        data: any;
    }>;
    uploadPsd(file: Express.Multer.File): Promise<{
        data: {
            width: number;
            height: number;
            layers: any[];
        };
    }>;
    uploadImage(file: Express.Multer.File, req: Request): Promise<{
        url: string;
    }>;
    uploadSysImage(file: Express.Multer.File, req: Request): Promise<{
        url: string;
    }>;
    wechatLogin(body: WechatLoginDto): Promise<{
        success: true;
        token: string;
        user: {
            id: number;
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
        };
    }>;
    listFavorites(user: AuthenticatedRequestUser): Promise<{
        success: boolean;
        items: {
            id: number;
            templateId: string;
            title: string;
            image: string;
            createdAt: Date;
        }[];
    }>;
    saveFavorite(user: AuthenticatedRequestUser, body: SaveFavoriteDto): Promise<{
        success: boolean;
        item: {
            id: number;
            templateId: string;
            title: string;
            image: string;
            createdAt: Date;
        };
    }>;
    deleteFavorite(user: AuthenticatedRequestUser, templateId: string): Promise<{
        success: boolean;
    }>;
    listDrafts(user: AuthenticatedRequestUser): Promise<{
        success: boolean;
        items: {
            id: string;
            templateId: string;
            coverImage: string;
            templateWidth: number;
            templateHeight: number;
            elements: any;
            createdAt: Date;
            updatedAt: Date;
        }[];
    }>;
    saveDraft(user: AuthenticatedRequestUser, body: SaveDraftDto): Promise<{
        success: boolean;
        item: {
            id: string;
            templateId: string;
            coverImage: string;
            templateWidth: number;
            templateHeight: number;
            elements: any;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    deleteDraft(user: AuthenticatedRequestUser, id: string): Promise<{
        success: boolean;
    }>;
    getSetting(key: string): Promise<{
        data: any;
    }>;
    saveSetting(key: string, body: any): Promise<{
        success: boolean;
        data: any;
    }>;
    saveTemplate(body: SaveTemplateDto, req: Request): Promise<{
        data: any;
    }>;
    listTemplates(req: Request): Promise<{
        data: any[];
    }>;
    getTemplateReplaceLayer(id: string, req: Request): Promise<{
        data: null;
        message: string;
    } | {
        data: {
            id: any;
            name: any;
            x: any;
            y: any;
            width: any;
            height: any;
            url: string | undefined;
            type: any;
        };
        message?: undefined;
    }>;
    getTemplateDetail(id: string, req: Request): Promise<{
        data: any;
    }>;
    deleteTemplate(id: string): Promise<{
        success: boolean;
    }>;
    private deletePhysicalFile;
    batchDeleteTemplates(ids: string[]): Promise<{
        success: boolean;
    }>;
    renderTemplate(body: RenderTemplateDto): Promise<{
        jobId: import("bull").JobId;
    }>;
    getRenderStatus(jobId: string): Promise<{
        status: string;
        result?: undefined;
        failedReason?: undefined;
    } | {
        status: import("bull").JobStatus | "stuck";
        result: any;
        failedReason: string | undefined;
    }>;
}
