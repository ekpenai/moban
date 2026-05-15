import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SaveDraftDto, SaveFavoriteDto } from './dto/user-data.dto';
import { UserDraft } from './user-draft.entity';
import { UserFavorite } from './user-favorite.entity';

@Injectable()
export class UserDataService {
  constructor(
    @InjectRepository(UserFavorite) private readonly favoriteRepo: Repository<UserFavorite>,
    @InjectRepository(UserDraft) private readonly draftRepo: Repository<UserDraft>,
  ) {}

  async listFavorites(userId: string) {
    const list = await this.favoriteRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return {
      success: true,
      items: list.map((item) => ({
        id: this.toNumber(item.id),
        templateId: item.templateId,
        title: item.title,
        image: item.image,
        createdAt: item.createdAt,
      })),
    };
  }

  async saveFavorite(userId: string, body: SaveFavoriteDto) {
    let favorite = await this.favoriteRepo.findOne({
      where: { userId, templateId: body.templateId },
    });

    if (!favorite) {
      favorite = this.favoriteRepo.create({
        userId,
        templateId: body.templateId,
        title: body.title?.trim() || '',
        image: body.image?.trim() || '',
      });
    } else {
      favorite.title = body.title?.trim() || '';
      favorite.image = body.image?.trim() || '';
    }

    const saved = await this.favoriteRepo.save(favorite);
    return {
      success: true,
      item: {
        id: this.toNumber(saved.id),
        templateId: saved.templateId,
        title: saved.title,
        image: saved.image,
        createdAt: saved.createdAt,
      },
    };
  }

  async deleteFavorite(userId: string, templateId: string) {
    await this.favoriteRepo.delete({ userId, templateId });
    return { success: true };
  }

  async listDrafts(userId: string) {
    const list = await this.draftRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });

    return {
      success: true,
      items: list.map((item) => ({
        id: item.id,
        templateId: item.templateId,
        coverImage: item.coverImage,
        templateWidth: item.templateWidth,
        templateHeight: item.templateHeight,
        elements: this.parseElements(item.elementsJson),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  }

  async saveDraft(userId: string, body: SaveDraftDto) {
    let draft = await this.draftRepo.findOne({
      where: { id: body.id, userId },
    });

    if (!draft) {
      draft = this.draftRepo.create({
        id: body.id,
        userId,
      });
    }

    draft.templateId = body.templateId?.trim() || '';
    draft.coverImage = body.coverImage?.trim() || '';
    draft.templateWidth = Number.isFinite(body.templateWidth) ? Number(body.templateWidth) : 675;
    draft.templateHeight = Number.isFinite(body.templateHeight) ? Number(body.templateHeight) : 1200;
    draft.elementsJson = JSON.stringify(body.elements ?? []);

    const saved = await this.draftRepo.save(draft);
    return {
      success: true,
      item: {
        id: saved.id,
        templateId: saved.templateId,
        coverImage: saved.coverImage,
        templateWidth: saved.templateWidth,
        templateHeight: saved.templateHeight,
        elements: this.parseElements(saved.elementsJson),
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      },
    };
  }

  async deleteDraft(userId: string, id: string) {
    await this.draftRepo.delete({ id, userId });
    return { success: true };
  }

  private parseElements(value: string) {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }

  private toNumber(value: string): number {
    const numericValue = Number(value);
    return Number.isSafeInteger(numericValue) ? numericValue : 0;
  }
}
