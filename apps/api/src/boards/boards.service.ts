import { Injectable, NotFoundException } from '@nestjs/common';

type Board = {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

type Card = {
  id: string;
  boardId: string;
  type: 'text';
  text: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class BoardsService {
  private boards: Board[] = [];
  private cards: Card[] = [];
  private seq = 1;
  private cardSeq = 1;

  findAll() {
    return this.boards;
  }

  create(payload: { title?: string; description?: string }) {
    const now = new Date().toISOString();
    const board: Board = {
      id: String(this.seq++),
      title: payload.title?.trim() || 'Untitled board',
      description: payload.description,
      createdAt: now,
      updatedAt: now,
    };

    this.boards.push(board);
    return board;
  }

  findOne(boardId: string) {
    const board = this.boards.find((b) => b.id === boardId);
    if (!board) {
      throw new NotFoundException(`Board ${boardId} not found`);
    }
    return board;
  }

  update(boardId: string, payload: { title?: string; description?: string }) {
    const board = this.findOne(boardId);

    if (payload.title !== undefined) {
      board.title = payload.title.trim() || 'Untitled board';
    }
    if (payload.description !== undefined) {
      board.description = payload.description;
    }

    board.updatedAt = new Date().toISOString();
    return board;
  }

  remove(boardId: string) {
    const idx = this.boards.findIndex((b) => b.id === boardId);
    if (idx === -1) {
      throw new NotFoundException(`Board ${boardId} not found`);
    }

    const [deleted] = this.boards.splice(idx, 1);
    this.cards = this.cards.filter((c) => c.boardId !== boardId);
    return { deleted: true, board: deleted };
  }

  listCards(boardId: string) {
    this.findOne(boardId);
    return this.cards.filter((c) => c.boardId === boardId);
  }

  createCard(boardId: string, payload: { type?: 'text'; text?: string }) {
    this.findOne(boardId);
    const now = new Date().toISOString();
    const card: Card = {
      id: String(this.cardSeq++),
      boardId,
      type: 'text',
      text: payload.text?.trim() || '',
      createdAt: now,
      updatedAt: now,
    };
    this.cards.push(card);
    return { created: card };
  }

  updateCard(boardId: string, cardId: string, payload: { text?: string }) {
    this.findOne(boardId);
    const card = this.cards.find((c) => c.boardId === boardId && c.id === cardId);
    if (!card) {
      throw new NotFoundException(`Card ${cardId} not found`);
    }
    if (payload.text !== undefined) {
      card.text = payload.text;
    }
    card.updatedAt = new Date().toISOString();
    return card;
  }

  removeCard(boardId: string, cardId: string) {
    this.findOne(boardId);
    const idx = this.cards.findIndex((c) => c.boardId === boardId && c.id === cardId);
    if (idx === -1) {
      throw new NotFoundException(`Card ${cardId} not found`);
    }
    const [deleted] = this.cards.splice(idx, 1);
    return { deleted: true, card: deleted };
  }
}
