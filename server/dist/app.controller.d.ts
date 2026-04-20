import type { Queue } from 'bull';
import { PsdService } from './psd.service';
import { Repository } from 'typeorm';
import { Template } from './template.entity';
import { SaveTemplateDto, RenderTemplateDto } from './dto/template.dto';
import { WinstonLoggerService } from './logger.service';
export declare class AppController {
    private readonly psdService;
    private renderQueue;
    private templateRepo;
    private readonly logger;
    constructor(psdService: PsdService, renderQueue: Queue, templateRepo: Repository<Template>, logger: WinstonLoggerService);
    uploadPsd(file: Express.Multer.File): Promise<{
        data: {
            width: number;
            height: number;
            layers: any[];
        };
    }>;
    uploadImage(file: Express.Multer.File): Promise<{
        url: string;
    }>;
    saveTemplate(body: SaveTemplateDto): Promise<{
        data: Template;
    }>;
    listTemplates(): Promise<{
        data: Template[];
    }>;
    getTemplateDetail(id: string): Promise<{
        data: Template | null;
    }>;
    deleteTemplate(id: string): Promise<{
        success: boolean;
    }>;
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
