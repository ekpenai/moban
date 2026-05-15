import { Repository } from 'typeorm';
import { SaveDraftDto, SaveFavoriteDto } from './dto/user-data.dto';
import { UserDraft } from './user-draft.entity';
import { UserFavorite } from './user-favorite.entity';
export declare class UserDataService {
    private readonly favoriteRepo;
    private readonly draftRepo;
    constructor(favoriteRepo: Repository<UserFavorite>, draftRepo: Repository<UserDraft>);
    listFavorites(userId: string): Promise<{
        success: boolean;
        data: {
            templateId: string;
            title: string;
            image: string;
            createdAt: Date;
        }[];
    }>;
    saveFavorite(userId: string, body: SaveFavoriteDto): Promise<{
        success: boolean;
        message: string;
    } | {
        success: boolean;
        message?: undefined;
    }>;
    deleteFavorite(userId: string, templateId: string): Promise<{
        success: boolean;
    }>;
    listDrafts(userId: string): Promise<{
        success: boolean;
        data: {
            id: string;
            templateId: string;
            coverImage: string;
            templateWidth: number;
            templateHeight: number;
            elementsJson: string;
            elements: any;
            createdAt: Date;
            updatedAt: Date;
        }[];
    }>;
    saveDraft(userId: string, body: SaveDraftDto): Promise<{
        success: boolean;
        message: string;
    } | {
        success: boolean;
        message?: undefined;
    }>;
    deleteDraft(userId: string, id: string): Promise<{
        success: boolean;
    }>;
    private parseElements;
}
