import { MigrationInterface, QueryRunner } from 'typeorm';

export class Auth1710000001000 implements MigrationInterface {
  name = 'Auth1710000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expiresAt DATETIME NOT NULL,
        createdAt DATETIME NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(userId)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS refresh_tokens');
  }
}
