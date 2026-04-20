import { ConfigService } from '@nestjs/config';
export declare class CleanupService {
    private configService;
    private readonly logger;
    constructor(configService: ConfigService);
    handleCleanup(): void;
}
