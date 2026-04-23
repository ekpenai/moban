"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const app_controller_1 = require("./app.controller");
const psd_service_1 = require("./psd.service");
const logger_service_1 = require("./logger.service");
const cleanup_service_1 = require("./cleanup.service");
const template_entity_1 = require("./template.entity");
const setting_entity_1 = require("./setting.entity");
const serve_static_1 = require("@nestjs/serve-static");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const bull_1 = require("@nestjs/bull");
const typeorm_1 = require("@nestjs/typeorm");
const path_1 = require("path");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            schedule_1.ScheduleModule.forRoot(),
            serve_static_1.ServeStaticModule.forRoot({
                rootPath: (0, path_1.join)(process.cwd(), 'uploads'),
                serveRoot: '/uploads',
            }, {
                rootPath: (0, path_1.join)(process.cwd(), '..', 'images'),
                serveRoot: '/images',
            }, {
                rootPath: (0, path_1.join)(process.cwd(), 'images'),
                serveRoot: '/sys-images',
            }),
            bull_1.BullModule.forRootAsync({
                imports: [config_1.ConfigModule],
                useFactory: async (configService) => {
                    const redisPassword = configService.get('REDIS_PASSWORD') ||
                        configService.get('REDIS_PASS') ||
                        undefined;
                    const redisUsername = configService.get('REDIS_USERNAME') ||
                        configService.get('REDIS_USER') ||
                        undefined;
                    return {
                        redis: {
                            host: configService.get('REDIS_HOST', 'localhost'),
                            port: configService.get('REDIS_PORT', 6379),
                            username: redisUsername,
                            password: redisPassword,
                            maxRetriesPerRequest: null,
                            enableReadyCheck: false,
                        },
                    };
                },
                inject: [config_1.ConfigService],
            }),
            bull_1.BullModule.registerQueue({
                name: 'renderQueue',
            }),
            typeorm_1.TypeOrmModule.forRootAsync({
                imports: [config_1.ConfigModule],
                useFactory: (configService) => ({
                    type: 'mysql',
                    host: configService.get('DB_HOST'),
                    port: configService.get('DB_PORT', 3306),
                    username: configService.get('DB_USER'),
                    password: configService.get('DB_PASS'),
                    database: configService.get('DB_NAME'),
                    entities: [template_entity_1.Template, setting_entity_1.Setting],
                    synchronize: true,
                }),
                inject: [config_1.ConfigService],
            }),
            typeorm_1.TypeOrmModule.forFeature([template_entity_1.Template, setting_entity_1.Setting]),
        ],
        controllers: [app_controller_1.AppController],
        providers: [psd_service_1.PsdService, logger_service_1.WinstonLoggerService, cleanup_service_1.CleanupService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map