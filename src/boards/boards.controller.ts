import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BoardEntity } from './board.entity';
import { BoardsService } from './boards.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithId } from '../common/request-with-id';
import { UpdateBoardDto } from './dto/update-board.dto';
import { ListBoardsQueryDto } from './dto/list-boards-query.dto';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { CreateUploadIntentDto } from './dto/create-upload-intent.dto';
import { FinalizeUploadDto } from './dto/finalize-upload.dto';
import { ListVersionsQueryDto } from './dto/list-versions-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('v1/boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Get()
  listBoards(
    @Req() req: RequestWithId,
    @Query() query: ListBoardsQueryDto,
  ): Promise<Array<{ id: string; title: string; description: string | null; createdAt: string; updatedAt: string }>> {
    return this.boardsService.listBoards(req.user!.sub, query.limit ?? 20, query.cursor);
  }

  @Get(':boardId')
  getBoardById(@Param('boardId', ParseIntPipe) id: number, @Req() req: RequestWithId): Promise<BoardEntity> {
    return this.boardsService.getBoardById(id, req.user!.sub);
  }

  @Post()
  createBoard(@Body() input: CreateBoardDto, @Req() req: RequestWithId): Promise<{ id: string; title: string; description: string | null; createdAt: string; updatedAt: string }> {
    return this.boardsService.createBoard(input, req.user!.sub, req.requestId);
  }

  @Patch(':boardId')
  updateBoard(
    @Param('boardId', ParseIntPipe) id: number,
    @Body() input: UpdateBoardDto,
    @Req() req: RequestWithId,
  ): Promise<{ id: string; title: string; description: string | null; createdAt: string; updatedAt: string }> {
    return this.boardsService.updateBoard(id, input, req.user!.sub);
  }

  @Delete(':boardId')
  deleteBoard(@Param('boardId', ParseIntPipe) id: number, @Req() req: RequestWithId): Promise<{ deleted: boolean; board: { id: string; title: string; description: string | null; createdAt: string; updatedAt: string } }> {
    return this.boardsService.deleteBoard(id, req.user!.sub);
  }

  @Get(':boardId/cards')
  listCards(@Param('boardId', ParseIntPipe) boardId: number, @Req() req: RequestWithId) {
    return this.boardsService.listCards(boardId, req.user!.sub);
  }

  @Post(':boardId/cards')
  createCard(
    @Param('boardId', ParseIntPipe) boardId: number,
    @Req() req: RequestWithId,
    @Body() input: CreateCardDto,
  ) {
    return this.boardsService.createCard(boardId, req.user!.sub, input);
  }

  @Patch(':boardId/cards/:cardId')
  updateCard(
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('cardId') cardId: string,
    @Req() req: RequestWithId,
    @Body() input: UpdateCardDto,
  ) {
    return this.boardsService.updateCard(boardId, cardId, req.user!.sub, input);
  }

  @Delete(':boardId/cards/:cardId')
  deleteCard(
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('cardId') cardId: string,
    @Req() req: RequestWithId,
  ) {
    return this.boardsService.deleteCard(boardId, cardId, req.user!.sub);
  }

  @Post(':boardId/uploads/intents')
  createUploadIntent(
    @Param('boardId', ParseIntPipe) boardId: number,
    @Req() req: RequestWithId,
    @Body() input: CreateUploadIntentDto,
  ) {
    return this.boardsService.createUploadIntent(boardId, req.user!.sub, input);
  }

  @Post(':boardId/uploads/finalize')
  finalizeUpload(
    @Param('boardId', ParseIntPipe) boardId: number,
    @Req() req: RequestWithId,
    @Body() input: FinalizeUploadDto,
  ) {
    return this.boardsService.finalizeUpload(boardId, req.user!.sub, input);
  }

  @Get(':boardId/versions')
  listVersions(
    @Param('boardId', ParseIntPipe) boardId: number,
    @Req() req: RequestWithId,
    @Query() query: ListVersionsQueryDto,
  ) {
    return this.boardsService.listVersions(boardId, req.user!.sub, query.limit ?? 20, query.cursor);
  }

  @Post(':boardId/versions')
  createVersion(@Param('boardId', ParseIntPipe) boardId: number, @Req() req: RequestWithId) {
    return this.boardsService.createVersion(boardId, req.user!.sub);
  }

  @Post(':boardId/versions/:versionId/restore')
  restoreVersion(
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @Req() req: RequestWithId,
  ) {
    return this.boardsService.restoreVersion(boardId, versionId, req.user!.sub);
  }

  @Get(':boardId/share-links')
  listShareLinks(@Param('boardId', ParseIntPipe) boardId: number, @Req() req: RequestWithId) {
    return this.boardsService.listShareLinks(boardId, req.user!.sub);
  }

  @Post(':boardId/share-links')
  createShareLink(@Param('boardId', ParseIntPipe) boardId: number, @Req() req: RequestWithId) {
    return this.boardsService.createShareLink(boardId, req.user!.sub);
  }

  @Delete(':boardId/share-links/:linkId')
  revokeShareLink(
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('linkId', ParseIntPipe) linkId: number,
    @Req() req: RequestWithId,
  ) {
    return this.boardsService.revokeShareLink(boardId, linkId, req.user!.sub);
  }
}
