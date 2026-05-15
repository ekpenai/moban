import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SaveDraftDto, SaveFavoriteDto } from './dto/user-data.dto';
import { WinstonLoggerService } from './logger.service';
import { UserDraft } from './user-draft.entity';
import { UserFavorite } from './user-favorite.entity';

@Injectable()
export class UserDataService {
  constructor(
    @InjectRepository(UserFavorite) private readonly favoriteRepo: Repository<UserFavorite>,
    @InjectRepository(UserDraft) private readonly draftRepo: Repository<UserDraft>,
    private readonly logger: WinstonLoggerService,
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
    const startedAt = Date.now();
    this.logger.log(`[drafts] list start userId=${userId}`);

    const list = await this.draftRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });

    const durationMs = Date.now() - startedAt;
    const elementsSummary =
      list.map((item) => `${item.id}:${item.elementsJson?.length || 0}`).join(',') || 'none';

    this.logger.log(
      `[drafts] list done userId=${userId} count=${list.length} durationMs=${durationMs} elementsJson=${elementsSummary}`,
    );

    return {
      success: true,
      data: list.map((item) => ({
        id: item.id,
        templateId: item.templateId,
        coverImage: item.coverImage,
        templateWidth: item.templateWidth,
        templateHeight: item.templateHeight,
        elementsJson: item.elementsJson,
        updatedAt: item.updatedAt instanceof Date ? item.updatedAt.getTime() : item.updatedAt,
      })),
    };
  }

  async saveDraft(userId: string, body: SaveDraftDto) {
    const startedAt = Date.now();
    const draftId = String(body.id || '').trim();
    if (!draftId) {
      throw new BadRequestException({ success: false, message: '缺少草稿 id' });
    }

    const templateId = String(body.templateId || body.template_id || '').trim();
    const coverImage = String(body.coverImage || body.cover_image || '').trim();
    const templateWidth = this.normalizeDimension(body.templateWidth, body.template_width, 675);
    const templateHeight = this.normalizeDimension(body.templateHeight, body.template_height, 1200);
    const elements = this.normalizeDraftElements(body);

    this.logger.log(
      `[drafts] save start userId=${userId} draftId=${draftId} templateId=${templateId || 'none'} hasElements=${
        Array.isArray(body.elements)
      } hasLayers=${Array.isArray(body.layers)} hasElementsJson=${typeof body.elementsJson === 'string'} hasElements_json=${
        typeof body.elements_json === 'string'
      } normalizedCount=${elements.length}`,
    );

    if (!Array.isArray(elements) || elements.length === 0) {
      throw new BadRequestException({ success: false, message: '草稿图层为空' });
    }

    const elementsJson = JSON.stringify(elements);

    let draft = await this.draftRepo.findOne({
      where: { id: draftId, userId },
    });

    if (!draft) {
      draft = this.draftRepo.create({
        id: draftId,
        userId,
      });
    }

    draft.templateId = templateId;
    draft.coverImage = coverImage;
    draft.templateWidth = templateWidth;
    draft.templateHeight = templateHeight;
    draft.elementsJson = elementsJson;

    await this.draftRepo.save(draft);
    this.logger.log(
      `[drafts] save done userId=${userId} draftId=${draftId} durationMs=${Date.now() - startedAt} elementsJsonLength=${elementsJson.length}`,
    );

    return { success: true };
  }

  async deleteDraft(userId: string, id: string) {
    await this.draftRepo.delete({ id, userId });
    return { success: true };
  }

  private normalizeDraftElements(body: SaveDraftDto): unknown[] {
    if (typeof body.elementsJson === 'string' && body.elementsJson.trim()) {
      const parsed = this.parseElements(body.elementsJson);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }

    if (typeof body.elements_json === 'string' && body.elements_json.trim()) {
      const parsed = this.parseElements(body.elements_json);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }

    if (Array.isArray(body.elements)) {
      return body.elements;
    }

    if (Array.isArray(body.layers)) {
      return body.layers;
    }

    return [];
  }

  private normalizeDimension(primary: number | undefined, fallback: number | undefined, defaultValue: number): number {
    const value = Number(primary ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : defaultValue;
  }

  private parseElements(value: string) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
