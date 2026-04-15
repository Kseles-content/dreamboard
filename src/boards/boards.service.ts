import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Board, CardType, Prisma } from '@prisma/client';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { CreateUploadIntentDto } from './dto/create-upload-intent.dto';
import { FinalizeUploadDto } from './dto/finalize-upload.dto';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../database/prisma.service';

type CardBase = {
  id: string;
  boardId: string;
  createdAt: string;
  updatedAt: string;
};

type TextCard = CardBase & { type: 'text'; text: string };
type ImageCard = CardBase & { type: 'image'; imageUrl: string; objectKey: string };
type Card = TextCard | ImageCard;

type ApiBoard = {
  id: string;
  title: string;
  description: string | null;
  isPinned: boolean;
  lastOpenedAt: string | null;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
};

const ALLOWED_UPLOAD_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_ASSET_SIZE_BYTES = 10 * 1024 * 1024;

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async listBoards(userId: number, limit = 20, cursor?: number): Promise<ApiBoard[]> {
    const normalizedLimit = Math.min(Math.max(limit, 1), 100);
    const rows = await this.prisma.board.findMany({
      where: {
        ownerId: userId,
        deletedAt: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: normalizedLimit + 1,
    });

    const hasMore = rows.length > normalizedLimit;
    const items = hasMore ? rows.slice(0, normalizedLimit) : rows;
    return items.map((board) => this.toApiBoard(board));
  }

  async getBoardById(id: number, userId: number): Promise<Board> {
    const board = await this.prisma.board.findFirst({ where: { id, deletedAt: null } });
    if (!board) throw new NotFoundException(`Board ${id} not found`);
    if (board.ownerId !== userId) throw new ForbiddenException('No access to this board');

    return this.prisma.board.update({ where: { id: board.id }, data: { lastOpenedAt: new Date() } });
  }

  async createBoard(input: CreateBoardDto, userId: number, requestId: string): Promise<ApiBoard> {
    const boardsCount = await this.prisma.board.count({ where: { ownerId: userId, deletedAt: null } });
    if (boardsCount >= 50) {
      throw new HttpException(
        {
          code: 'BOARD_LIMIT_REACHED',
          message: 'Board limit reached: maximum 50 boards per user',
          requestId,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const saved = await this.prisma.board.create({
      data: {
        ownerId: userId,
        title: input.title,
        description: input.description ?? null,
        lastOpenedAt: new Date(),
      },
    });

    return this.toApiBoard(saved);
  }

  async listRecentBoards(userId: number): Promise<ApiBoard[]> {
    const rows = await this.prisma.board.findMany({
      where: {
        ownerId: userId,
        deletedAt: null,
        lastOpenedAt: { not: null },
      },
      orderBy: { lastOpenedAt: 'desc' },
      take: 10,
    });

    return rows.map((board) => this.toApiBoard(board));
  }

  async setBoardPinned(boardId: number, userId: number, pinned: boolean): Promise<ApiBoard> {
    const board = await this.getBoardById(boardId, userId);
    const saved = await this.prisma.board.update({
      where: { id: board.id },
      data: { isPinned: pinned },
    });
    return this.toApiBoard(saved);
  }

  async listTemplates(_userId: number) {
    const templates = await this.prisma.template.findMany({ orderBy: { createdAt: 'asc' } });
    return { items: templates };
  }

  async createBoardFromTemplate(
    input: { templateId: string; title?: string },
    userId: number,
    requestId: string,
  ): Promise<ApiBoard> {
    const template = await this.prisma.template.findUnique({ where: { id: input.templateId } });
    if (!template) {
      throw new HttpException(
        { code: 'TEMPLATE_NOT_FOUND', message: `Template ${input.templateId} not found`, requestId },
        HttpStatus.NOT_FOUND,
      );
    }

    const parsed = this.parseTemplateSnapshot(template.snapshot);
    const created = await this.prisma.$transaction(async (tx) => {
      const board = await tx.board.create({
        data: {
          ownerId: userId,
          title: input.title?.trim() || parsed.title || template.name,
          description: template.description ?? null,
          templateId: template.id,
          lastOpenedAt: new Date(),
        },
      });

      if (parsed.cards.length > 0) {
        await tx.card.createMany({
          data: parsed.cards.map((c, index) => ({
            id: `c_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
            boardId: board.id,
            type: c.type,
            content: c.content,
            position: c.position ?? index,
            zIndex: c.zIndex ?? index,
            metadata: c.metadata ?? Prisma.JsonNull,
          })),
        });
      }

      await tx.user.updateMany({
        where: { id: userId, onboardedAt: null },
        data: { onboardedAt: new Date() },
      });

      return board;
    });

    return this.toApiBoard(created);
  }

  async updateBoard(id: number, input: UpdateBoardDto, userId: number): Promise<ApiBoard> {
    const board = await this.getBoardById(id, userId);

    const saved = await this.prisma.board.update({
      where: { id: board.id },
      data: {
        ...(typeof input.title !== 'undefined' ? { title: input.title } : {}),
        ...(typeof input.description !== 'undefined' ? { description: input.description } : {}),
      },
    });

    return this.toApiBoard(saved);
  }

  async deleteBoard(id: number, userId: number): Promise<{ deleted: boolean; board: ApiBoard }> {
    const board = await this.getBoardById(id, userId);
    const boardView = this.toApiBoard(board);

    await this.prisma.$transaction(async (tx) => {
      await tx.card.deleteMany({ where: { boardId: id } });
      await tx.version.deleteMany({ where: { boardId: id } });
      await tx.shareLink.deleteMany({ where: { boardId: id } });
      await tx.uploadAsset.deleteMany({ where: { boardId: id } });
      await tx.board.update({ where: { id }, data: { deletedAt: new Date() } });
    });

    return { deleted: true, board: boardView };
  }

  async listCards(boardId: number, userId: number): Promise<Card[]> {
    await this.getBoardById(boardId, userId);
    const cards = await this.prisma.card.findMany({ where: { boardId }, orderBy: [{ zIndex: 'asc' }, { createdAt: 'asc' }] });
    return cards.map((c) => this.toApiCard(c));
  }

  async createCard(boardId: number, userId: number, input: CreateCardDto): Promise<{ created: Card }> {
    await this.getBoardById(boardId, userId);

    const cardCount = await this.prisma.card.count({ where: { boardId } });
    if (cardCount >= 200) {
      throw new HttpException(
        {
          code: 'CARD_LIMIT_REACHED',
          message: 'Card limit reached: maximum 200 cards per board',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const type = (input.type ?? 'text') as 'text' | 'image';
    const now = new Date();

    if (type === 'image') {
      if (!input.objectKey) {
        throw new HttpException({ code: 'IMAGE_OBJECT_KEY_REQUIRED', message: 'objectKey is required for image card' }, HttpStatus.BAD_REQUEST);
      }

      const asset = await this.prisma.uploadAsset.findFirst({
        where: { boardId, objectKey: input.objectKey, status: 'READY' },
      });

      if (!asset || !asset.publicUrl) {
        throw new HttpException({ code: 'IMAGE_ASSET_NOT_READY', message: 'Image asset is not finalized' }, HttpStatus.BAD_REQUEST);
      }

      const created = await this.prisma.card.create({
        data: {
          id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          boardId,
          type: CardType.image,
          content: asset.publicUrl,
          position: cardCount,
          zIndex: cardCount,
          metadata: { objectKey: asset.objectKey, imageUrl: asset.publicUrl } as Prisma.JsonObject,
          createdAt: now,
          updatedAt: now,
        },
      });

      return { created: this.toApiCard(created) };
    }

    if (!input.text) {
      throw new HttpException({ code: 'TEXT_REQUIRED', message: 'text is required for text card' }, HttpStatus.BAD_REQUEST);
    }

    const created = await this.prisma.card.create({
      data: {
        id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        boardId,
        type: CardType.text,
        content: input.text,
        position: cardCount,
        zIndex: cardCount,
        metadata: Prisma.JsonNull,
        createdAt: now,
        updatedAt: now,
      },
    });

    return { created: this.toApiCard(created) };
  }

  async updateCard(boardId: number, cardId: string, userId: number, input: UpdateCardDto): Promise<Card> {
    await this.getBoardById(boardId, userId);
    const card = await this.prisma.card.findFirst({ where: { id: cardId, boardId } });
    if (!card) throw new NotFoundException(`Card ${cardId} not found`);

    if (card.type !== CardType.text) {
      throw new HttpException(
        { code: 'CARD_TYPE_MISMATCH', message: 'Only text card can be updated via text endpoint' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.prisma.card.update({
      where: { id: card.id },
      data: { content: input.text, updatedAt: new Date() },
    });

    return this.toApiCard(updated);
  }

  async deleteCard(boardId: number, cardId: string, userId: number): Promise<{ deleted: boolean; card: Card }> {
    await this.getBoardById(boardId, userId);
    const card = await this.prisma.card.findFirst({ where: { id: cardId, boardId } });
    if (!card) throw new NotFoundException(`Card ${cardId} not found`);

    await this.prisma.card.delete({ where: { id: card.id } });
    return { deleted: true, card: this.toApiCard(card) };
  }

  async createUploadIntent(boardId: number, userId: number, input: CreateUploadIntentDto) {
    await this.getBoardById(boardId, userId);

    if (input.sizeBytes > MAX_ASSET_SIZE_BYTES) {
      throw new HttpException(
        { code: 'ASSET_TOO_LARGE', message: `Asset is too large: max ${MAX_ASSET_SIZE_BYTES} bytes` },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!ALLOWED_UPLOAD_MIME_TYPES.has(input.mimeType)) {
      throw new HttpException(
        { code: 'UNSUPPORTED_ASSET_TYPE', message: `Unsupported mimeType: ${input.mimeType}` },
        HttpStatus.BAD_REQUEST,
      );
    }

    const extension = this.extensionByMimeType(input.mimeType);
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `boards/${boardId}/uploads/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}.${extension}`;

    const uploadBase = this.configService.getOrThrow<string>('storage.uploadBaseUrl').replace(/\/$/, '');
    const publicBase = this.configService.getOrThrow<string>('storage.publicBaseUrl').replace(/\/$/, '');
    const publicUrl = `${publicBase}/${objectKey}`;

    await this.prisma.uploadAsset.create({
      data: {
        boardId,
        objectKey,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        fileName: input.fileName,
        status: 'INTENT_CREATED',
        publicUrl,
        etag: null,
        finalizedAt: null,
      },
    });

    return {
      method: 'PUT',
      objectKey,
      uploadUrl: `${uploadBase}/${objectKey}?signature=demo`,
      publicUrl,
      headers: { 'content-type': input.mimeType },
      maxSizeBytes: MAX_ASSET_SIZE_BYTES,
      expiresInSeconds: 15 * 60,
    };
  }

  async finalizeUpload(boardId: number, userId: number, input: FinalizeUploadDto) {
    await this.getBoardById(boardId, userId);

    const asset = await this.prisma.uploadAsset.findFirst({ where: { boardId, objectKey: input.objectKey } });
    if (!asset) throw new NotFoundException('Upload intent not found');

    const saved = await this.prisma.uploadAsset.update({
      where: { id: asset.id },
      data: { status: 'READY', finalizedAt: new Date(), etag: input.etag ?? null },
    });

    return {
      id: saved.id,
      boardId: saved.boardId,
      objectKey: saved.objectKey,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      status: saved.status,
      publicUrl: saved.publicUrl,
      finalizedAt: saved.finalizedAt,
    };
  }

  async listVersions(boardId: number, userId: number, limit = 20, cursor?: number) {
    await this.getBoardById(boardId, userId);
    const normalizedLimit = Math.min(Math.max(limit, 1), 100);

    const rows = await this.prisma.version.findMany({
      where: { boardId, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { id: 'desc' },
      take: normalizedLimit + 1,
    });

    const hasMore = rows.length > normalizedLimit;
    const items = (hasMore ? rows.slice(0, normalizedLimit) : rows).map((v) => ({
      id: v.id,
      boardId: v.boardId,
      authorUserId: v.authorUserId,
      comment: v.comment,
      createdAt: v.createdAt,
      restoredByUserId: v.restoredByUserId,
      restoredAt: v.restoredAt,
    }));

    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  async createVersion(boardId: number, userId: number, comment?: string) {
    const board = await this.getBoardById(boardId, userId);
    const cards = await this.prisma.card.findMany({ where: { boardId }, orderBy: [{ zIndex: 'asc' }, { createdAt: 'asc' }] });

    const created = await this.prisma.$transaction(async (tx) => {
      const version = await tx.version.create({
        data: {
          boardId,
          authorUserId: userId,
          comment: comment ?? null,
          snapshot: {
            title: board.title,
            description: board.description,
            cards: cards.map((c) => ({
              id: c.id,
              boardId: c.boardId,
              type: c.type,
              content: c.content,
              position: c.position,
              zIndex: c.zIndex,
              metadata: c.metadata,
              createdAt: c.createdAt.toISOString(),
              updatedAt: c.updatedAt.toISOString(),
            })),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          boardId,
          userId,
          action: 'VERSION_CREATED',
          details: { versionId: version.id, comment: comment ?? null } as Prisma.JsonObject,
        },
      });

      return version;
    });

    return {
      id: created.id,
      boardId: created.boardId,
      authorUserId: created.authorUserId,
      comment: created.comment,
      createdAt: created.createdAt,
    };
  }

  async restoreVersion(boardId: number, versionId: number, userId: number) {
    const board = await this.getBoardById(boardId, userId);
    const version = await this.prisma.version.findFirst({ where: { id: versionId, boardId } });

    if (!version) {
      throw new HttpException({ code: 'VERSION_NOT_FOUND', message: `Version ${versionId} not found` }, HttpStatus.NOT_FOUND);
    }

    const snapshot = this.readVersionSnapshot(version.snapshot);

    await this.prisma.$transaction(async (tx) => {
      await tx.board.update({ where: { id: board.id }, data: { title: snapshot.title, description: snapshot.description } });
      await tx.card.deleteMany({ where: { boardId } });
      if (snapshot.cards.length > 0) {
        await tx.card.createMany({
          data: snapshot.cards.map((c) => ({
            id: c.id,
            boardId,
            type: c.type,
            content: c.content,
            position: c.position,
            zIndex: c.zIndex,
            metadata: (c.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
            createdAt: new Date(c.createdAt),
            updatedAt: new Date(c.updatedAt),
          })),
        });
      }

      await tx.version.update({ where: { id: version.id }, data: { restoredByUserId: userId, restoredAt: new Date() } });
      await tx.auditLog.create({
        data: {
          boardId,
          userId,
          action: 'VERSION_RESTORED',
          details: { versionId: version.id } as Prisma.JsonObject,
        },
      });
    });

    return {
      restoredVersionId: version.id,
      board: await this.prisma.board.findFirst({ where: { id: board.id } }),
    };
  }

  async listShareLinks(boardId: number, userId: number) {
    await this.getBoardById(boardId, userId);

    const rows = await this.prisma.shareLink.findMany({ where: { boardId }, orderBy: { id: 'desc' } });
    return {
      items: rows.map((x) => ({
        id: x.id,
        boardId: x.boardId,
        token: x.token,
        url: this.buildPublicShareUrl(x.token),
        expiresAt: x.expiresAt,
        createdAt: x.createdAt,
        revokedAt: x.revokedAt,
      })),
    };
  }

  async createShareLink(boardId: number, userId: number) {
    await this.getBoardById(boardId, userId);

    const token = uuidv4().replace(/-/g, '');
    const created = await this.prisma.shareLink.create({
      data: {
        boardId,
        token,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revokedAt: null,
      },
    });

    return {
      id: created.id,
      boardId: created.boardId,
      token: created.token,
      url: this.buildPublicShareUrl(created.token),
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
      revokedAt: created.revokedAt,
    };
  }

  async revokeShareLink(boardId: number, linkId: number, userId: number) {
    await this.getBoardById(boardId, userId);

    const link = await this.prisma.shareLink.findFirst({ where: { id: linkId, boardId } });
    if (!link) throw new NotFoundException(`Share link ${linkId} not found`);

    await this.prisma.shareLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
    return { success: true };
  }

  async getPublicBoardByToken(token: string) {
    const link = await this.prisma.shareLink.findUnique({ where: { token } });
    if (!link || link.revokedAt || (link.expiresAt && link.expiresAt.getTime() < Date.now())) {
      throw new HttpException({ code: 'SHARE_LINK_NOT_FOUND', message: 'Share link not found' }, HttpStatus.NOT_FOUND);
    }

    const board = await this.prisma.board.findFirst({ where: { id: link.boardId, deletedAt: null } });
    if (!board) {
      throw new HttpException({ code: 'SHARE_LINK_NOT_FOUND', message: 'Share link not found' }, HttpStatus.NOT_FOUND);
    }

    const cards = await this.prisma.card.findMany({ where: { boardId: board.id }, orderBy: [{ zIndex: 'asc' }, { createdAt: 'asc' }] });

    return {
      board: {
        id: board.id,
        title: board.title,
        description: board.description,
        cards: cards.map((c) => this.toApiCard(c)),
        updatedAt: board.updatedAt,
      },
      share: {
        token: link.token,
        linkId: link.id,
      },
    };
  }

  private extensionByMimeType(mimeType: string): string {
    switch (mimeType) {
      case 'image/jpeg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      default:
        return 'bin';
    }
  }

  private toApiBoard(board: Board): ApiBoard {
    return {
      id: String(board.id),
      title: board.title,
      description: board.description,
      isPinned: board.isPinned,
      lastOpenedAt: board.lastOpenedAt ? board.lastOpenedAt.toISOString() : null,
      templateId: board.templateId ?? null,
      createdAt: board.createdAt.toISOString(),
      updatedAt: board.updatedAt.toISOString(),
    };
  }

  private toApiCard(card: {
    id: string;
    boardId: number;
    type: CardType;
    content: string;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }): Card {
    if (card.type === CardType.image) {
      const meta = (card.metadata ?? {}) as { objectKey?: string; imageUrl?: string };
      return {
        id: card.id,
        boardId: String(card.boardId),
        createdAt: card.createdAt.toISOString(),
        updatedAt: card.updatedAt.toISOString(),
        type: 'image',
        imageUrl: meta.imageUrl ?? card.content,
        objectKey: meta.objectKey ?? '',
      };
    }

    return {
      id: card.id,
      boardId: String(card.boardId),
      createdAt: card.createdAt.toISOString(),
      updatedAt: card.updatedAt.toISOString(),
      type: 'text',
      text: card.content,
    };
  }

  private readVersionSnapshot(snapshot: Prisma.JsonValue): {
    title: string;
    description: string | null;
    cards: Array<{
      id: string;
      type: CardType;
      content: string;
      position: number;
      zIndex: number;
      metadata: Prisma.JsonValue | null;
      createdAt: string;
      updatedAt: string;
    }>;
  } {
    const empty = {
      title: 'Untitled board',
      description: null as string | null,
      cards: [] as Array<{
        id: string;
        type: CardType;
        content: string;
        position: number;
        zIndex: number;
        metadata: Prisma.JsonValue | null;
        createdAt: string;
        updatedAt: string;
      }>,
    };

    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return empty;

    const s = snapshot as { title?: unknown; description?: unknown; cards?: unknown[] };
    const cards = Array.isArray(s.cards)
      ? s.cards
          .map((x, idx) => {
            if (!x || typeof x !== 'object') return null;
            const c = x as any;

            const legacyType = c.type === 'image' || c.type === 'text' ? c.type : null;
            const normalizedType =
              c.type === 'text' || c.type === 'image' || c.type === 'sticker' || c.type === 'link'
                ? (c.type as CardType)
                : null;

            if (!normalizedType && !legacyType) return null;
            if (typeof c.id !== 'string') return null;

            if (legacyType === 'image' && typeof c.imageUrl === 'string') {
              return {
                id: c.id,
                type: CardType.image,
                content: c.imageUrl,
                position: Number.isFinite(c.position) ? Number(c.position) : idx,
                zIndex: Number.isFinite(c.zIndex) ? Number(c.zIndex) : idx,
                metadata: { objectKey: typeof c.objectKey === 'string' ? c.objectKey : '', imageUrl: c.imageUrl } as Prisma.JsonObject,
                createdAt: typeof c.createdAt === 'string' ? c.createdAt : new Date().toISOString(),
                updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : new Date().toISOString(),
              };
            }

            if (legacyType === 'text' && typeof c.text === 'string') {
              return {
                id: c.id,
                type: CardType.text,
                content: c.text,
                position: Number.isFinite(c.position) ? Number(c.position) : idx,
                zIndex: Number.isFinite(c.zIndex) ? Number(c.zIndex) : idx,
                metadata: null,
                createdAt: typeof c.createdAt === 'string' ? c.createdAt : new Date().toISOString(),
                updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : new Date().toISOString(),
              };
            }

            if (normalizedType && typeof c.content === 'string') {
              return {
                id: c.id,
                type: normalizedType,
                content: c.content,
                position: Number.isFinite(c.position) ? Number(c.position) : idx,
                zIndex: Number.isFinite(c.zIndex) ? Number(c.zIndex) : idx,
                metadata: c.metadata ?? null,
                createdAt: typeof c.createdAt === 'string' ? c.createdAt : new Date().toISOString(),
                updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : new Date().toISOString(),
              };
            }

            return null;
          })
          .filter(
            (
              x,
            ): x is {
              id: string;
              type: CardType;
              content: string;
              position: number;
              zIndex: number;
              metadata: Prisma.JsonValue | null;
              createdAt: string;
              updatedAt: string;
            } => Boolean(x),
          )
      : [];

    return {
      title: typeof s.title === 'string' && s.title.trim().length > 0 ? s.title : empty.title,
      description: typeof s.description === 'string' ? s.description : null,
      cards,
    };
  }

  private parseTemplateSnapshot(snapshot: Prisma.JsonValue): {
    title: string;
    cards: Array<{
      type: CardType;
      content: string;
      position: number;
      zIndex: number;
      metadata: Prisma.JsonValue | null;
    }>;
  } {
    const fallback = { title: 'Untitled board', cards: [] as Array<{ type: CardType; content: string; position: number; zIndex: number; metadata: Prisma.JsonValue | null }> };
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return fallback;

    const s = snapshot as { title?: unknown; cards?: unknown[] };
    const cards = Array.isArray(s.cards)
      ? s.cards
          .map((x, i) => {
            if (!x || typeof x !== 'object') return null;
            const c = x as any;
            const rawType = typeof c.type === 'string' ? c.type : 'text';
            const allowed = ['text', 'image', 'sticker', 'link'];
            const type = (allowed.includes(rawType) ? rawType : 'text') as CardType;
            const content = typeof c.content === 'string' ? c.content : typeof c.text === 'string' ? c.text : '';
            if (!content) return null;
            return {
              type,
              content,
              position: Number.isFinite(c.position) ? Number(c.position) : i,
              zIndex: Number.isFinite(c.zIndex) ? Number(c.zIndex) : i,
              metadata: c.metadata ?? null,
            };
          })
          .filter(
            (
              x,
            ): x is { type: CardType; content: string; position: number; zIndex: number; metadata: Prisma.JsonValue | null } =>
              Boolean(x),
          )
      : [];

    return {
      title: typeof s.title === 'string' && s.title.trim().length > 0 ? s.title : fallback.title,
      cards,
    };
  }

  private buildPublicShareUrl(token: string): string {
    const webBase = this.configService.getOrThrow<string>('storage.publicWebBaseUrl').replace(/\/$/, '');
    return `${webBase}/share/${token}`;
  }
}
