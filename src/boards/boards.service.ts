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

type Card = { id: string; text: string };
type BoardState = { cards: Card[] };

const ALLOWED_UPLOAD_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class BoardsService {
  constructor(
    @InjectRepository(BoardEntity)
    private readonly boardsRepository: Repository<BoardEntity>,
    @InjectRepository(UploadAssetEntity)
    private readonly uploadAssetsRepository: Repository<UploadAssetEntity>,
  ) {}

  async listBoards(userId: number, limit = 20, cursor?: number): Promise<{ items: BoardEntity[]; nextCursor: number | null }> {
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
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { items, nextCursor };
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

  async createBoard(input: CreateBoardDto, userId: number, requestId: string): Promise<BoardEntity> {
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

    return this.boardsRepository.save(entity);
  }

  async updateBoard(id: number, input: UpdateBoardDto, userId: number): Promise<BoardEntity> {
    const board = await this.getBoardById(id, userId);

    if (typeof input.title !== 'undefined') {
      board.title = input.title;
    }

    if (typeof input.description !== 'undefined') {
      board.description = input.description;
    }

    return this.boardsRepository.save(board);
  }

  async deleteBoard(id: number, userId: number): Promise<{ success: true }> {
    const board = await this.getBoardById(id, userId);
    await this.boardsRepository.softDelete({ id: board.id });
    return { success: true };
  }

  async listCards(boardId: number, userId: number): Promise<{ items: Card[] }> {
    const board = await this.getBoardById(boardId, userId);
    return { items: this.readState(board).cards };
  }

  async createCard(boardId: number, userId: number, input: CreateCardDto): Promise<{ items: Card[]; created: Card }> {
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

    const created: Card = { id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, text: input.text };
    state.cards.push(created);
    board.stateJson = JSON.stringify(state);
    await this.boardsRepository.save(board);

    return { items: state.cards, created };
  }

  async updateCard(boardId: number, cardId: string, userId: number, input: UpdateCardDto): Promise<{ items: Card[]; updated: Card }> {
    const board = await this.getBoardById(boardId, userId);
    const state = this.readState(board);
    const card = state.cards.find((c) => c.id === cardId);

    if (!card) {
      throw new NotFoundException(`Card ${cardId} not found`);
    }

    card.text = input.text;
    board.stateJson = JSON.stringify(state);
    await this.boardsRepository.save(board);

    return { items: state.cards, updated: card };
  }

  async deleteCard(boardId: number, cardId: string, userId: number): Promise<{ items: Card[]; success: true }> {
    const board = await this.getBoardById(boardId, userId);
    const state = this.readState(board);
    const before = state.cards.length;
    state.cards = state.cards.filter((c) => c.id !== cardId);

    if (state.cards.length === before) {
      throw new NotFoundException(`Card ${cardId} not found`);
    }

    board.stateJson = JSON.stringify(state);
    await this.boardsRepository.save(board);

    return { items: state.cards, success: true };
  }

  async createUploadIntent(boardId: number, userId: number, input: CreateUploadIntentDto) {
    await this.getBoardById(boardId, userId);

    if (!ALLOWED_UPLOAD_MIME_TYPES.has(input.mimeType)) {
      throw new HttpException(
        {
          code: 'UPLOAD_MIME_NOT_ALLOWED',
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
      maxSizeBytes: 10 * 1024 * 1024,
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
      const parsed = board.stateJson ? (JSON.parse(board.stateJson) as BoardState) : { cards: [] };
      return { cards: Array.isArray(parsed.cards) ? parsed.cards : [] };
    } catch {
      return { cards: [] };
    }
  }
}
