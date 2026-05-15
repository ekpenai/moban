export declare class SaveFavoriteDto {
    templateId: string;
    title?: string;
    image?: string;
}
declare class DraftElementDto {
    [key: string]: unknown;
}
export declare class SaveDraftDto {
    id: string;
    templateId?: string;
    coverImage?: string;
    templateWidth?: number;
    templateHeight?: number;
    elements: DraftElementDto[];
}
export {};
