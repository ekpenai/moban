"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FillTemplateDto = exports.RenderTemplateDto = exports.SaveTemplateDto = void 0;
const class_validator_1 = require("class-validator");
class SaveTemplateDto {
    id;
    name;
    width;
    height;
    layers;
    thumbnail;
    category;
}
exports.SaveTemplateDto = SaveTemplateDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SaveTemplateDto.prototype, "id", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], SaveTemplateDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SaveTemplateDto.prototype, "width", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SaveTemplateDto.prototype, "height", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], SaveTemplateDto.prototype, "layers", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SaveTemplateDto.prototype, "thumbnail", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SaveTemplateDto.prototype, "category", void 0);
class RenderTemplateDto {
    template;
}
exports.RenderTemplateDto = RenderTemplateDto;
__decorate([
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], RenderTemplateDto.prototype, "template", void 0);
class FillTemplateDto {
    template;
    fieldsData;
}
exports.FillTemplateDto = FillTemplateDto;
__decorate([
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], FillTemplateDto.prototype, "template", void 0);
__decorate([
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], FillTemplateDto.prototype, "fieldsData", void 0);
//# sourceMappingURL=template.dto.js.map