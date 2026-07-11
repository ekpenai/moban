import type { Queue } from 'bull';
import { PsdService } from './psd.service';
import { S3Service } from './s3.service';
import { Repository } from 'typeorm';
import { Template } from './template.entity';
import { Setting } from './setting.entity';
import { WxUser } from './wx-user.entity';
import { SaveTemplateDto, RenderTemplateDto, FillTemplateDto } from './dto/template.dto';
import { UpdateProfileDto } from './dto/profile.dto';
import { WechatLoginDto } from './dto/wechat-login.dto';
import { SaveDraftDto, SaveFavoriteDto } from './dto/user-data.dto';
import { ArabicReshapeDto } from './dto/arabic-reshape.dto';
import { CreateRenderEventDto } from './dto/render-job.dto';
import { WinstonLoggerService } from './logger.service';
import { WechatAuthService } from './wechat-auth.service';
import { UserDataService } from './user-data.service';
import { type AuthenticatedRequestUser } from './auth.guard';
import { ArabicReshapeService } from './arabic-reshape.service';
import { RenderJobService } from './render-job.service';
import { CozeCutoutService } from './coze-cutout.service';
import type { Request } from 'express';
import type { Response } from 'express';
export declare class AppController {
    private readonly psdService;
    private readonly s3Service;
    private renderQueue;
    private templateRepo;
    private settingRepo;
    private wxUserRepo;
    private readonly logger;
    private readonly wechatAuthService;
    private readonly userDataService;
    private readonly arabicReshapeService;
    private readonly renderJobService;
    private readonly cozeCutoutService;
    constructor(psdService: PsdService, s3Service: S3Service, renderQueue: Queue, templateRepo: Repository<Template>, settingRepo: Repository<Setting>, wxUserRepo: Repository<WxUser>, logger: WinstonLoggerService, wechatAuthService: WechatAuthService, userDataService: UserDataService, arabicReshapeService: ArabicReshapeService, renderJobService: RenderJobService, cozeCutoutService: CozeCutoutService);
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
            width: any;
            height: any;
            layers: any[];
        };
    }>;
    uploadImage(file: Express.Multer.File, req: Request): Promise<{
        url: string;
    }>;
    uploadSysImage(file: Express.Multer.File, req: Request): Promise<{
        url: string;
    }>;
    removeImageBackground(inputUrl: string): Promise<{
        success: boolean;
        url: string;
        imageUrl: string;
    }>;
    uploadSysFont(file: Express.Multer.File): Promise<{
        url: string;
        name: string;
        ext: string;
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
    reshapeArabic(body: ArabicReshapeDto): Promise<{
        success: true;
        original: string;
        reshaped: string;
    }>;
    getProfile(user: AuthenticatedRequestUser): Promise<{
        success: true;
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
    updateProfile(user: AuthenticatedRequestUser, body: UpdateProfileDto): Promise<{
        success: true;
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
        data: {
            templateId: string;
            title: string;
            image: string;
            createdAt: Date;
        }[];
    }>;
    saveFavorite(user: AuthenticatedRequestUser, body: SaveFavoriteDto): Promise<{
        success: boolean;
        message: string;
    } | {
        success: boolean;
        message?: undefined;
    }>;
    deleteFavorite(user: AuthenticatedRequestUser, templateId: string): Promise<{
        success: boolean;
    }>;
    listDrafts(user: AuthenticatedRequestUser): Promise<{
        success: boolean;
        data: {
            id: string;
            templateId: string;
            coverImage: string;
            templateWidth: number;
            templateHeight: number;
            elementsJson: string;
            updatedAt: number;
        }[];
    }>;
    saveDraft(user: AuthenticatedRequestUser, body: SaveDraftDto): Promise<{
        success: boolean;
    }>;
    deleteDraft(user: AuthenticatedRequestUser, id: string): Promise<{
        success: boolean;
    }>;
    getSetting(key: string): Promise<{
        data: any;
    }>;
    getAdminDashboard(): Promise<{
        success: boolean;
        data: {
            userCount: number;
            templateCount: number;
            vipCount: number;
            adminCount: number;
            categoriesCount: number;
            fontsCount: number;
            systemStatus: string;
            miniProgramStatus: string;
        };
    }>;
    getAdminUsers(): Promise<{
        success: boolean;
        data: {
            id: string;
            name: string;
            phone: string;
            role: string;
            vip: boolean;
            status: string;
            note: string;
            avatarUrl: string;
            createdAt: Date;
            updatedAt: Date;
            lastLoginAt: Date | null;
        }[];
    }>;
    updateAdminUserFlags(id: string, body: {
        vip?: boolean;
        role?: 'Admin' | 'User';
    }): Promise<{
        success: boolean;
        data: {
            id: string;
            vip: boolean | undefined;
            role: "Admin" | "User" | undefined;
        };
    }>;
    getAdminSettings(): Promise<{
        success: boolean;
        data: {
            key: string;
            value: any;
        }[];
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
    renderTemplate(user: AuthenticatedRequestUser, body: RenderTemplateDto, req: Request): Promise<{
        jobId: string;
        status: string;
    }>;
    getRenderStatus(user: AuthenticatedRequestUser, jobId: string): Promise<{
        jobId: string;
        status: string;
        stage: string;
        progress: number;
        message: string;
        updatedAt: string | null;
        durationMs: number | null;
        imageUrl?: undefined;
        result?: undefined;
        recentLogs?: undefined;
    } | {
        jobId: string;
        status: string;
        progress: number;
        stage: string;
        message: string | undefined;
        imageUrl: any;
        result: any;
        updatedAt: string | null;
        durationMs: number | null;
        recentLogs: {
            id: string;
            time: string | null;
            stage: string;
            level: string;
            message: string;
            meta: any;
        }[];
    } | {
        jobId: string;
        status: string;
        progress: any;
        stage: string;
        message: string | undefined;
        updatedAt: string | null;
        durationMs: number | null;
        recentLogs: {
            id: string;
            time: string | null;
            stage: string;
            level: string;
            message: string;
            meta: any;
        }[];
        imageUrl?: undefined;
        result?: undefined;
    }>;
    listRenderJobs(user: AuthenticatedRequestUser, req: Request): Promise<{
        success: boolean;
        data: {
            jobId: string;
            source: string;
            status: string;
            stage: string;
            progress: number;
            message: string | undefined;
            imageUrl: string | undefined;
            failedReason: string | undefined;
            createdAt: string | null;
            startedAt: string | null;
            completedAt: string | null;
            updatedAt: string | null;
            durationMs: number | null;
            recentLogs: {
                id: string;
                time: string | null;
                stage: string;
                level: string;
                message: string;
                meta: any;
            }[];
        }[];
    }>;
    getRenderJobDetail(user: AuthenticatedRequestUser, jobId: string): Promise<{
        success: boolean;
        data: {
            jobId: string;
            source: string;
            status: string;
            stage: string;
            progress: number;
            message: string | undefined;
            imageUrl: string | undefined;
            failedReason: string | undefined;
            createdAt: string | null;
            startedAt: string | null;
            completedAt: string | null;
            updatedAt: string | null;
            durationMs: number | null;
            recentLogs: {
                id: string;
                time: string | null;
                stage: string;
                level: string;
                message: string;
                meta: any;
            }[];
        };
    }>;
    getRenderJobLogs(user: AuthenticatedRequestUser, jobId: string): Promise<{
        success: boolean;
        data: {
            id: string;
            time: string | null;
            stage: string;
            level: string;
            message: string;
            meta: any;
        }[];
    }>;
    streamRenderJob(user: AuthenticatedRequestUser, jobId: string, res: Response): Promise<void>;
    recordRenderJobEvent(jobId: string, body: CreateRenderEventDto, req: Request): Promise<{
        success: boolean;
    }>;
}
