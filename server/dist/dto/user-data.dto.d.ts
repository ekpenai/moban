export declare class SaveFavoriteDto {
    templateId?: string;
    id?: string;
    title?: string;
    image?: string;
}
declare class DraftElementDto {
    [key: string]: unknown;
}
export declare class SaveDraftDto {
    id: string;
    templateId?: string;
    template_id?: string;
    coverImage?: string;
    cover_image?: string;
    templateWidth?: number;
    template_width?: number;
    templateHeight?: number;
    template_height?: number;
    elements?: DraftElementDto[];
    layers?: DraftElementDto[];
    elementsJson?: string;
    elements_json?: string;
    updatedAt?: number;
}
export {};
