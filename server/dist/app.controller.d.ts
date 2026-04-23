import type { Queue } from 'bull';
import { PsdService } from './psd.service';
import { Repository } from 'typeorm';
import { Template } from './template.entity';
import { Setting } from './setting.entity';
import { SaveTemplateDto, RenderTemplateDto } from './dto/template.dto';
import { WinstonLoggerService } from './logger.service';
import type { Request } from 'express';
export declare class AppController {
    private readonly psdService;
    private renderQueue;
    private templateRepo;
    private settingRepo;
    private readonly logger;
    constructor(psdService: PsdService, renderQueue: Queue, templateRepo: Repository<Template>, settingRepo: Repository<Setting>, logger: WinstonLoggerService);
    private getPublicBaseUrl;
    private toPublicUploadUrl;
    private normalizeUploadUrl;
    private normalizeTemplateData;
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
    getSetting(key: string): Promise<{
        data: any;
    }>;
    saveSetting(key: string, body: any): Promise<{
        success: boolean;
        data: any;
    }>;
    saveTemplate(body: SaveTemplateDto, req: Request): Promise<{
        data: Template;
    }>;
    listTemplates(req: Request): Promise<{
        data: Template[];
    }>;
    getTemplateDetail(id: string, req: Request): Promise<{
        data: Template | null;
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
