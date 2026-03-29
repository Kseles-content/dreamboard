import { MigrationInterface, QueryRunner } from 'typeorm';

export class SoftDeleteBoards1710000002000 implements MigrationInterface {
  name = 'SoftDeleteBoards1710000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE boards ADD COLUMN deletedAt datetime NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // sqlite rollback omitted for MVP baseline simplicity
    // would require table recreation without deletedAt
  }
}
