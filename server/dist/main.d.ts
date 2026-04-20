import { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { WinstonLoggerService } from './logger.service';
export declare class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger;
    constructor(logger: WinstonLoggerService);
    catch(exception: unknown, host: ArgumentsHost): void;
}
