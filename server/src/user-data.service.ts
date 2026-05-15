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
      data: list.map((item) => ({
        templateId: item.templateId,
        title: item.title,
        image: item.image,
        createdAt: item.createdAt,
      })),
    };
  }

  async saveFavorite(userId: string, body: SaveFavoriteDto) {
    const finalTemplateId = String(body.templateId || body.id || '').trim();
    if (!finalTemplateId) {
      return { success: false, message: '缺少 templateId' };
    }

    let favorite = await this.favoriteRepo.findOne({
      where: { userId, templateId: finalTemplateId },
    });

    if (!favorite) {
      favorite = this.favoriteRepo.create({
        userId,
        templateId: finalTemplateId,
        title: body.title?.trim() || '',
        image: body.image?.trim() || '',
      });
    } else {
      favorite.title = body.title?.trim() || '';
      favorite.image = body.image?.trim() || '';
    }

    await this.favoriteRepo.save(favorite);
    return { success: true };
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
      data: list.map((item) => ({
        id: item.id,
        templateId: item.templateId,
        coverImage: item.coverImage,
        templateWidth: item.templateWidth,
        templateHeight: item.templateHeight,
        elementsJson: item.elementsJson,
        elements: this.parseElements(item.elementsJson),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  }

  async saveDraft(userId: string, body: SaveDraftDto) {
    const draftId = String(body.id || '').trim();
    if (!draftId) {
      return { success: false, message: '缺少草稿 id' };
    }

    let draft = await this.draftRepo.findOne({
      where: { id: draftId, userId },
    });

    if (!draft) {
      draft = this.draftRepo.create({
        id: draftId,
        userId,
      });
    }

    draft.templateId = body.templateId?.trim() || '';
    draft.coverImage = body.coverImage?.trim() || '';
    draft.templateWidth = Number.isFinite(body.templateWidth) ? Number(body.templateWidth) : 675;
    draft.templateHeight = Number.isFinite(body.templateHeight) ? Number(body.templateHeight) : 1200;
    draft.elementsJson = JSON.stringify(body.elements ?? []);

    await this.draftRepo.save(draft);
    return { success: true };
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
}
