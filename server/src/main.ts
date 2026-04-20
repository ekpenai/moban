import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Catch, ArgumentsHost, HttpException, ExceptionFilter, HttpStatus, ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { WinstonLoggerService } from './logger.service';
const compression = require('compression');

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: WinstonLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status = 
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = 
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: (exception as Error).message || 'Internal server error' };

    this.logger.error(
      `Method: ${request.method} URL: ${request.url} Status: ${status}`,
      exception instanceof Error ? (exception.stack || '') : ''
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(typeof message === 'object' ? message : { message }),
      // 生产环境通常不返回 stack
      stack: process.env.NODE_ENV === 'production' ? undefined : (exception as any).stack,
    });
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = app.get(WinstonLoggerService);
  
  app.use(compression());
  app.use(json({ limit: process.env.UPLOAD_LIMIT || '50mb' }));
  app.use(urlencoded({ extended: true, limit: process.env.UPLOAD_LIMIT || '50mb' }));
  
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new AllExceptionsFilter(logger));

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Server is running on: http://localhost:${port}`);
}
bootstrap();
