import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { BoardEntity } from './board.entity';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { CreateUploadIntentDto } from './dto/create-upload-intent.dto';
import { UploadAssetEntity } from './upload-asset.entity';
import { FinalizeUploadDto } from './dto/finalize-upload.dto';
import { BoardVersionEntity } from './board-version.entity';
import { ShareLinkEntity } from './share-link.entity';
import { v4 as uuidv4 } from 'uuid';

type CardBase = {
  id: string;
  boardId: string;
  createdAt: string;
  updatedAt: string;
};
type TextCard = CardBase & { type: 'text'; text: string };
type ImageCard = CardBase & { type: 'image'; imageUrl: string; objectKey: string };
type Card = TextCard | ImageCard;
type BoardState = { cards: Card[] };

type ApiBoard = {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

const ALLOWED_UPLOAD_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_ASSET_SIZE_BYTES = 10 * 1024 * 1024;

@Injectable()
export class BoardsService {
  constructor(
    @InjectRepository(BoardEntity)
    private readonly boardsRepository: Repository<BoardEntity>,
    @InjectRepository(UploadAssetEntity)
    private readonly uploadAssetsRepository: Repository<UploadAssetEntity>,
    @InjectRepository(BoardVersionEntity)
    private readonly boardVersionsRepository: Repository<BoardVersionEntity>,
    @InjectRepository(ShareLinkEntity)
    private readonly shareLinksRepository: Repository<ShareLinkEntity>,
  ) {}

  async listBoards(userId: number, limit = 20, cursor?: number): Promise<ApiBoard[]> {
    const normalizedLimit = Math.min(Math.max(limit, 1), 100);

    const where = cursor
      ? { ownerUserId: userId, id: MoreThan(cursor) }
      : { ownerUserId: userId };

    const rows = await this.boardsRepository.find({
      where,
      order: { id: 'ASC' },
      take: normalizedLimit + 1,
    });

    const hasMore = rows.length > normalizedLimit;
    const items = hasMore ? rows.slice(0, normalizedLimit) : rows;
    return items.map((board) => this.toApiBoard(board));
  }

  async getBoardById(id: number, userId: number): Promise<BoardEntity> {
    const board = await this.boardsRepository.findOne({ where: { id } });
    if (!board) {
      throw new NotFoundException(`Board ${id} not found`);
    }
    if (board.ownerUserId !== userId) {
      throw new ForbiddenException('No access to this board');
    }
    return board;
  }

  async createBoard(input: CreateBoardDto, userId: number, requestId: string): Promise<ApiBoard> {
    const boardsCount = await this.boardsRepository.count({ where: { ownerUserId: userId } });
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

    const entity = this.boardsRepository.create({
      ownerUserId: userId,
      title: input.title,
      description: input.description ?? null,
      stateJson: JSON.stringify({ cards: [] }),
    });

    const saved = await this.boardsRepository.save(entity);
    return this.toApiBoard(saved);
  }

  async updateBoard(id: number, input: UpdateBoardDto, userId: number): Promise<ApiBoard> {
    const board = await this.getBoardById(id, userId);

    if (typeof input.title !== 'undefined') {
      board.title = input.title;
    }

    if (typeof input.description !== 'undefined') {
      board.description = input.description;
    }

    const saved = await this.boardsRepository.save(board);
    return this.toApiBoard(saved);
  }

  async deleteBoard(id: number, userId: number): Promise<{ deleted: boolean; board: ApiBoard }> {
    const board = await this.getBoardById(id, userId);
    const boardView = this.toApiBoard(board);
    await this.boardsRepository.softDelete({ id: board.id });
    return { deleted: true, board: boardView };
  }

  async listCards(boardId: number, userId: number): Promise<Card[]> {
    const board = await this.getBoardById(boardId, userId);
    return this.readState(board).cards;
  }

  async createCard(boardId: number, userId: number, input: CreateCardDto): Promise<{ created: Card }> {
    const board = await this.getBoardById(boardId, userId);
    const state = this.readState(board);

    if (state.cards.length >= 200) {
      throw new HttpException(
        {
          code: 'CARD_LIMIT_REACHED',
          message: 'Card limit reached: maximum 200 cards per board',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const type = input.type ?? 'text';

    let created: Card;

    if (type === 'image') {
      if (!input.objectKey) {
        throw new HttpException(
          {
            code: 'IMAGE_OBJECT_KEY_REQUIRED',
            message: 'objectKey is required for image card',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const asset = await this.uploadAssetsRepository.findOne({
        where: {
          boardId,
          ownerUserId: userId,
          objectKey: input.objectKey,
          status: 'READY',
        },
      });

      if (!asset || !asset.publicUrl) {
        throw new HttpException(
          {
            code: 'IMAGE_ASSET_NOT_READY',
            message: 'Image asset is not finalized',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const now = new Date().toISOString();
      created = {
        id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        boardId: String(boardId),
        createdAt: now,
        updatedAt: now,
        type: 'image',
        objectKey: asset.objectKey,
        imageUrl: asset.publicUrl,
      };
    } else {
      if (!input.text) {
        throw new HttpException(
          {
            code: 'TEXT_REQUIRED',
            message: 'text is required for text card',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const now = new Date().toISOString();
      created = {
        id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        boardId: String(boardId),
        createdAt: now,
        updatedAt: now,
        type: 'text',
        text: input.text,
      };
    }

    state.cards.push(created);
    board.stateJson = JSON.stringify(state);
    await this.boardsRepository.save(board);

    return { created };
  }

  async updateCard(boardId: number, cardId: string, userId: number, input: UpdateCardDto): Promise<Card> {
    const board = await this.getBoardById(boardId, userId);
    const state = this.readState(board);
    const card = state.cards.find((c) => c.id === cardId);

    if (!card) {
      throw new NotFoundException(`Card ${cardId} not found`);
    }

    if (card.type !== 'text') {
      throw new HttpException(
        {
          code: 'CARD_TYPE_MISMATCH',
          message: 'Only text card can be updated via text endpoint',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    card.text = input.text;
    card.updatedAt = new Date().toISOString();
    board.stateJson = JSON.stringify(state);
    await this.boardsRepository.save(board);

    return card;
  }

  async deleteCard(boardId: number, cardId: string, userId: number): Promise<{ deleted: boolean; card: Card }> {
    const board = await this.getBoardById(boardId, userId);
    const state = this.readState(board);
    const card = state.cards.find((c) => c.id === cardId);

    if (!card) {
      throw new NotFoundException(`Card ${cardId} not found`);
    }

    state.cards = state.cards.filter((c) => c.id !== cardId);

    board.stateJson = JSON.stringify(state);
    await this.boardsRepository.save(board);

    return { deleted: true, card };
  }

  async createUploadIntent(boardId: number, userId: number, input: CreateUploadIntentDto) {
    await this.getBoardById(boardId, userId);

    if (input.sizeBytes > MAX_ASSET_SIZE_BYTES) {
      throw new HttpException(
        {
          code: 'ASSET_TOO_LARGE',
          message: `Asset is too large: max ${MAX_ASSET_SIZE_BYTES} bytes`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!ALLOWED_UPLOAD_MIME_TYPES.has(input.mimeType)) {
      throw new HttpException(
        {
          code: 'UNSUPPORTED_ASSET_TYPE',
          message: `Unsupported mimeType: ${input.mimeType}`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const extension = this.extensionByMimeType(input.mimeType);
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `boards/${boardId}/uploads/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}.${extension}`;

    const uploadBase = (process.env.STORAGE_UPLOAD_BASE_URL ?? 'https://uploads.local').replace(/\/$/, '');
    const publicBase = (process.env.STORAGE_PUBLIC_BASE_URL ?? 'https://cdn.local').replace(/\/$/, '');
    const expiresInSeconds = 15 * 60;
    const publicUrl = `${publicBase}/${objectKey}`;

    await this.uploadAssetsRepository.save(
      this.uploadAssetsRepository.create({
        boardId,
        ownerUserId: userId,
        objectKey,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        fileName: input.fileName,
        status: 'INTENT_CREATED',
        publicUrl,
        etag: null,
        finalizedAt: null,
      }),
    );

    return {
      method: 'PUT',
      objectKey,
      uploadUrl: `${uploadBase}/${objectKey}?signature=demo`,
      publicUrl,
      headers: {
        'content-type': input.mimeType,
      },
      maxSizeBytes: MAX_ASSET_SIZE_BYTES,
      expiresInSeconds,
    };
  }

  async finalizeUpload(boardId: number, userId: number, input: FinalizeUploadDto) {
    await this.getBoardById(boardId, userId);

    const asset = await this.uploadAssetsRepository.findOne({
      where: {
        boardId,
        ownerUserId: userId,
        objectKey: input.objectKey,
      },
    });

    if (!asset) {
      throw new NotFoundException('Upload intent not found');
    }

    asset.status = 'READY';
    asset.finalizedAt = new Date();
    asset.etag = input.etag ?? null;

    const saved = await this.uploadAssetsRepository.save(asset);

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

    const qb = this.boardVersionsRepository
      .createQueryBuilder('v')
      .where('v.boardId = :boardId', { boardId })
      .andWhere('v.ownerUserId = :userId', { userId });

    if (cursor) {
      qb.andWhere('v.id < :cursor', { cursor });
    }

    const rows = await qb.orderBy('v.id', 'DESC').take(normalizedLimit + 1).getMany();
    const hasMore = rows.length > normalizedLimit;
    const items = (hasMore ? rows.slice(0, normalizedLimit) : rows).map((v) => ({
      id: v.id,
      boardId: v.boardId,
      createdAt: v.createdAt,
    }));

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  async createVersion(boardId: number, userId: number) {
    const board = await this.getBoardById(boardId, userId);
    const snapshotJson = JSON.stringify({
      title: board.title,
      description: board.description,
      stateJson: board.stateJson,
    });

    const created = await this.boardVersionsRepository.save(
      this.boardVersionsRepository.create({
        boardId,
        ownerUserId: userId,
        snapshotJson,
      }),
    );

    return {
      id: created.id,
      boardId: created.boardId,
      createdAt: created.createdAt,
    };
  }

  async restoreVersion(boardId: number, versionId: number, userId: number) {
    const board = await this.getBoardById(boardId, userId);

    const version = await this.boardVersionsRepository.findOne({
      where: {
        id: versionId,
        boardId,
        ownerUserId: userId,
      },
    });

    if (!version) {
      throw new HttpException(
        {
          code: 'VERSION_NOT_FOUND',
          message: `Version ${versionId} not found`,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const snapshot = this.readVersionSnapshot(version.snapshotJson);

    board.title = snapshot.title;
    board.description = snapshot.description;
    board.stateJson = snapshot.stateJson;

    const restored = await this.boardsRepository.save(board);

    return {
      restoredVersionId: version.id,
      board: restored,
    };
  }

  async listShareLinks(boardId: number, userId: number) {
    await this.getBoardById(boardId, userId);

    const rows = await this.shareLinksRepository.find({
      where: { boardId, ownerUserId: userId },
      order: { id: 'DESC' },
    });

    return {
      items: rows.map((x) => ({
        id: x.id,
        boardId: x.boardId,
        token: x.token,
        url: this.buildPublicShareUrl(x.token),
        createdAt: x.createdAt,
        revokedAt: x.revokedAt,
      })),
    };
  }

  async createShareLink(boardId: number, userId: number) {
    await this.getBoardById(boardId, userId);

    const token = uuidv4().replace(/-/g, '');
    const created = await this.shareLinksRepository.save(
      this.shareLinksRepository.create({
        boardId,
        ownerUserId: userId,
        token,
        revokedAt: null,
      }),
    );

    return {
      id: created.id,
      boardId: created.boardId,
      token: created.token,
      url: this.buildPublicShareUrl(created.token),
      createdAt: created.createdAt,
      revokedAt: created.revokedAt,
    };
  }

  async revokeShareLink(boardId: number, linkId: number, userId: number) {
    await this.getBoardById(boardId, userId);

    const link = await this.shareLinksRepository.findOne({
      where: { id: linkId, boardId, ownerUserId: userId },
    });

    if (!link) {
      throw new NotFoundException(`Share link ${linkId} not found`);
    }

    link.revokedAt = new Date();
    await this.shareLinksRepository.save(link);

    return { success: true };
  }

  async getPublicBoardByToken(token: string) {
    const link = await this.shareLinksRepository.findOne({ where: { token } });

    if (!link || link.revokedAt) {
      throw new HttpException(
        {
          code: 'SHARE_LINK_NOT_FOUND',
          message: 'Share link not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const board = await this.boardsRepository.findOne({ where: { id: link.boardId } });
    if (!board) {
      throw new HttpException(
        {
          code: 'SHARE_LINK_NOT_FOUND',
          message: 'Share link not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const state = this.readState(board);

    return {
      board: {
        id: board.id,
        title: board.title,
        description: board.description,
        cards: state.cards,
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

  private readState(board: BoardEntity): BoardState {
    try {
      const parsed = board.stateJson ? (JSON.parse(board.stateJson) as { cards?: any[] }) : { cards: [] };
      const cards = Array.isArray(parsed.cards)
        ? parsed.cards
            .map((card) => {
              if (!card || typeof card !== 'object') return null;
              if (card.type === 'image' && typeof card.id === 'string' && typeof card.imageUrl === 'string' && typeof card.objectKey === 'string') {
                const now = new Date().toISOString();
                return {
                  id: card.id,
                  boardId: typeof card.boardId === 'string' ? card.boardId : String(board.id),
                  createdAt: typeof card.createdAt === 'string' ? card.createdAt : now,
                  updatedAt: typeof card.updatedAt === 'string' ? card.updatedAt : now,
                  type: 'image',
                  imageUrl: card.imageUrl,
                  objectKey: card.objectKey,
                } as ImageCard;
              }
              if (typeof card.id === 'string' && typeof card.text === 'string') {
                const now = new Date().toISOString();
                return {
                  id: card.id,
                  boardId: typeof card.boardId === 'string' ? card.boardId : String(board.id),
                  createdAt: typeof card.createdAt === 'string' ? card.createdAt : now,
                  updatedAt: typeof card.updatedAt === 'string' ? card.updatedAt : now,
                  type: 'text',
                  text: card.text,
                } as TextCard;
              }
              return null;
            })
            .filter((c): c is Card => c !== null)
        : [];
      return { cards };
    } catch {
      return { cards: [] };
    }
  }

  private readVersionSnapshot(snapshotJson: string): { title: string; description: string | null; stateJson: string | null } {
    try {
      const parsed = JSON.parse(snapshotJson) as {
        title?: unknown;
        description?: unknown;
        stateJson?: unknown;
      };

      return {
        title: typeof parsed.title === 'string' && parsed.title.trim().length > 0 ? parsed.title : 'Untitled board',
        description: typeof parsed.description === 'string' ? parsed.description : null,
        stateJson: typeof parsed.stateJson === 'string' ? parsed.stateJson : JSON.stringify({ cards: [] }),
      };
    } catch {
      return {
        title: 'Untitled board',
        description: null,
        stateJson: JSON.stringify({ cards: [] }),
      };
    }
  }

  private buildPublicShareUrl(token: string): string {
    const webBase = (process.env.PUBLIC_WEB_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
    return `${webBase}/share/${token}`;
  }

  private toApiBoard(board: BoardEntity): ApiBoard {
    return {
      id: String(board.id),
      title: board.title,
      description: board.description,
      createdAt: board.createdAt.toISOString(),
      updatedAt: board.updatedAt.toISOString(),
    };
  }
}
