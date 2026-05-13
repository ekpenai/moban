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
var PsdService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PsdService = void 0;
const common_1 = require("@nestjs/common");
const fs = __importStar(require("fs"));
const ag_psd_1 = require("ag-psd");
const canvas_1 = require("canvas");
const uuid_1 = require("uuid");
(0, ag_psd_1.initializeCanvas)(canvas_1.createCanvas);
function isReplaceLayerName(name) {
    return !!name && name.includes('替换');
}
function buildBlackWhiteMask(layerMaskCanvas) {
    const width = layerMaskCanvas.width;
    const height = layerMaskCanvas.height;
    const output = (0, canvas_1.createCanvas)(width, height);
    const ctx = output.getContext('2d');
    const sourceCtx = layerMaskCanvas.getContext('2d');
    const imageData = sourceCtx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] || 0;
        const visible = alpha > 0;
        const value = visible ? 255 : 0;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    return output.toDataURL('image/png');
}
let PsdService = PsdService_1 = class PsdService {
    logger = new common_1.Logger(PsdService_1.name);
    async parsePsd(filePath) {
        const buffer = fs.readFileSync(filePath);
        const psd = (0, ag_psd_1.readPsd)(buffer);
        const template = {
            width: psd.width,
            height: psd.height,
            layers: [],
        };
        if (psd.children) {
            for (const layer of psd.children) {
                if (layer.hidden)
                    continue;
                let type = 'image';
                let text = undefined;
                let fontSize = undefined;
                let color = undefined;
                let url = undefined;
                let fontFamily = undefined;
                let textAlign = undefined;
                let direction = undefined;
                if (layer.text) {
                    type = 'text';
                    text = layer.text.text;
                    const textStyle = layer.text.style || (layer.text.styleRuns && layer.text.styleRuns[0] ? layer.text.styleRuns[0].style : null);
                    const paragraphStyle = layer.text.paragraphStyle || (layer.text.paragraphStyleRuns && layer.text.paragraphStyleRuns[0] ? layer.text.paragraphStyleRuns[0].style : null);
                    if (textStyle) {
                        const scaleY = layer.text.transform && layer.text.transform.length >= 4 ? layer.text.transform[3] : 1;
                        fontSize = textStyle.fontSize ? Math.round(textStyle.fontSize * scaleY) : 24;
                        fontFamily = textStyle.font ? textStyle.font.name : 'Arial';
                        if (textStyle.fillColor) {
                            const c = textStyle.fillColor;
                            if (c.r !== undefined && c.g !== undefined && c.b !== undefined) {
                                color = `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${c.a ?? 1})`;
                            }
                            else if (c.fr !== undefined && c.fg !== undefined && c.fb !== undefined) {
                                color = `rgba(${Math.round(c.fr)}, ${Math.round(c.fg)}, ${Math.round(c.fb)}, 1)`;
                            }
                            else {
                                color = '#000000';
                            }
                        }
                        else {
                            color = '#000000';
                        }
                        direction = textStyle.characterDirection === 1 ? 'rtl' : 'ltr';
                    }
                    else {
                        fontSize = 24;
                        color = '#000000';
                        fontFamily = 'Arial';
                        direction = 'ltr';
                    }
                    if (paragraphStyle) {
                        textAlign = paragraphStyle.justification || 'left';
                        if (textAlign.startsWith('justify'))
                            textAlign = 'justify';
                    }
                    else {
                        textAlign = 'left';
                    }
                }
                else if (layer.canvas) {
                    url = layer.canvas.toDataURL('image/png');
                }
                let maskUrl = undefined;
                let maskRect = undefined;
                if (layer.mask && layer.mask.canvas) {
                    maskRect = {
                        x: layer.mask.left || 0,
                        y: layer.mask.top || 0,
                        width: (layer.mask.right !== undefined && layer.mask.left !== undefined) ? (layer.mask.right - layer.mask.left) : layer.mask.canvas.width,
                        height: (layer.mask.bottom !== undefined && layer.mask.top !== undefined) ? (layer.mask.bottom - layer.mask.top) : layer.mask.canvas.height,
                    };
                    maskUrl = isReplaceLayerName(layer.name)
                        ? buildBlackWhiteMask(layer.mask.canvas)
                        : layer.mask.canvas.toDataURL('image/png');
                }
                const isReplaceable = isReplaceLayerName(layer.name);
                template.layers.push({
                    id: (0, uuid_1.v4)(),
                    name: layer.name,
                    type,
                    x: layer.left || 0,
                    y: layer.top || 0,
                    width: (layer.right !== undefined && layer.left !== undefined) ? (layer.right - layer.left) : psd.width,
                    height: (layer.bottom !== undefined && layer.top !== undefined) ? (layer.bottom - layer.top) : psd.height,
                    rotation: 0,
                    scaleX: 1,
                    scaleY: 1,
                    text,
                    fontSize,
                    color,
                    fontFamily,
                    textAlign,
                    direction,
                    url,
                    maskUrl,
                    maskRect,
                    isReplaceable,
                    editable: true,
                });
            }
        }
        return template;
    }
};
exports.PsdService = PsdService;
exports.PsdService = PsdService = PsdService_1 = __decorate([
    (0, common_1.Injectable)()
], PsdService);
//# sourceMappingURL=psd.service.js.map