import { Injectable, NotFoundException } from '@nestjs/common';

type Board = {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class BoardsService {
  private boards: Board[] = [];
  private seq = 1;

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
    return { deleted: true, board: deleted };
  }
}
