import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  try {
    const staleIntentResult = await prisma.uploadAsset.deleteMany({
      where: {
        status: 'INTENT_CREATED',
        finalizedAt: null,
        createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    const orphanReadyRows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT ua.id
      FROM upload_assets ua
      WHERE ua.status = 'READY'
        AND NOT EXISTS (
          SELECT 1
          FROM cards c
          WHERE c."boardId" = ua."boardId"
            AND c.type = 'image'::"CardType"
            AND (c.metadata->>'objectKey') = ua."objectKey"
        )
    `;

    const orphanIds = orphanReadyRows.map((x) => x.id);
    const orphanDeleteResult = orphanIds.length
      ? await prisma.uploadAsset.deleteMany({ where: { id: { in: orphanIds } } })
      : { count: 0 };

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        staleIntentsDeleted: staleIntentResult.count,
        orphanReadyDeleted: orphanDeleteResult.count,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
