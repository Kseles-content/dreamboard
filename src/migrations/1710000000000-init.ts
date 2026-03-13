import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitDreamboard1710000000000 implements MigrationInterface {
  name = 'InitDreamboard1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        createdAt DATETIME NOT NULL DEFAULT (datetime('now')),
        updatedAt DATETIME NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS boards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ownerUserId INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        createdAt DATETIME NOT NULL DEFAULT (datetime('now')),
        updatedAt DATETIME NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(ownerUserId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_boards_owner_user_id ON boards(ownerUserId)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS boards');
    await queryRunner.query('DROP TABLE IF EXISTS users');
  }
}
