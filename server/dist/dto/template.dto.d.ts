export declare class SaveTemplateDto {
    id?: string;
    name: string;
    width: number;
    height: number;
    layers: any[];
    thumbnail?: string;
    category?: string;
}
export declare class RenderTemplateDto {
    template: {
        width: number;
        height: number;
        layers: any[];
    };
}
export declare class FillTemplateDto {
    template: any;
    fieldsData: Record<string, any>;
}
