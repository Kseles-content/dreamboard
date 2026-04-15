import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, CardType, Prisma } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required for seed');

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

type SeedTemplate = {
  id: string;
  name: string;
  description: string;
  snapshot: Prisma.JsonObject;
};

const templates: SeedTemplate[] = [
  {
    id: 'tpl-goal-vision-90d',
    name: '90-Day Goal Vision',
    description: 'Goal board starter with milestones and weekly checkpoints.',
    snapshot: {
      title: '90-Day Goal Vision',
      cards: [
        { id: 'c1', type: CardType.text, content: 'North Star Goal', position: 0, zIndex: 0 },
        { id: 'c2', type: CardType.text, content: 'Milestones (30/60/90)', position: 1, zIndex: 1 },
        { id: 'c3', type: CardType.text, content: 'Weekly Commitments', position: 2, zIndex: 2 },
      ],
    },
  },
  {
    id: 'tpl-goal-habit-tracker',
    name: 'Habit Tracker Board',
    description: 'Daily habit consistency board for routine building.',
    snapshot: {
      title: 'Habit Tracker',
      cards: [
        { id: 'c1', type: CardType.text, content: 'Top 3 Habits', position: 0, zIndex: 0 },
        { id: 'c2', type: CardType.text, content: 'Daily Streak Log', position: 1, zIndex: 1 },
      ],
    },
  },
  {
    id: 'tpl-goal-quarter-plan',
    name: 'Quarter Plan',
    description: 'Quarterly planning board with outcomes and blockers.',
    snapshot: {
      title: 'Quarter Plan',
      cards: [
        { id: 'c1', type: CardType.text, content: 'Outcomes', position: 0, zIndex: 0 },
        { id: 'c2', type: CardType.text, content: 'Risks / Blockers', position: 1, zIndex: 1 },
      ],
    },
  },
  {
    id: 'tpl-moodboard-brand-identity',
    name: 'Brand Identity Moodboard',
    description: 'Moodboard starter for visual style exploration.',
    snapshot: {
      title: 'Brand Moodboard',
      cards: [
        { id: 'c1', type: CardType.text, content: 'Color Directions', position: 0, zIndex: 0 },
        { id: 'c2', type: CardType.text, content: 'Typography Ideas', position: 1, zIndex: 1 },
      ],
    },
  },
  {
    id: 'tpl-moodboard-product-inspo',
    name: 'Product Inspiration Board',
    description: 'Collect references and interactions worth emulating.',
    snapshot: {
      title: 'Product Inspiration',
      cards: [
        { id: 'c1', type: CardType.text, content: 'Reference Gallery', position: 0, zIndex: 0 },
        { id: 'c2', type: CardType.text, content: 'Patterns to Reuse', position: 1, zIndex: 1 },
      ],
    },
  },
  {
    id: 'tpl-sprint-weekly-planning',
    name: 'Weekly Sprint Planning',
    description: 'Plan weekly tasks and commitments.',
    snapshot: {
      title: 'Weekly Sprint',
      cards: [
        { id: 'c1', type: CardType.text, content: 'Backlog Candidates', position: 0, zIndex: 0 },
        { id: 'c2', type: CardType.text, content: 'Sprint Goal', position: 1, zIndex: 1 },
        { id: 'c3', type: CardType.text, content: 'Definition of Done', position: 2, zIndex: 2 },
      ],
    },
  },
  {
    id: 'tpl-sprint-retro',
    name: 'Sprint Retrospective',
    description: 'Retro board with Keep/Stop/Start sections.',
    snapshot: {
      title: 'Sprint Retro',
      cards: [
        { id: 'c1', type: CardType.text, content: 'Keep', position: 0, zIndex: 0 },
        { id: 'c2', type: CardType.text, content: 'Stop', position: 1, zIndex: 1 },
        { id: 'c3', type: CardType.text, content: 'Start', position: 2, zIndex: 2 },
      ],
    },
  },
  {
    id: 'tpl-sprint-release-readiness',
    name: 'Release Readiness',
    description: 'Checklist board for release validation.',
    snapshot: {
      title: 'Release Readiness',
      cards: [
        { id: 'c1', type: CardType.text, content: 'Critical Checks', position: 0, zIndex: 0 },
        { id: 'c2', type: CardType.text, content: 'Known Risks', position: 1, zIndex: 1 },
      ],
    },
  },
];

async function main() {
  for (const tpl of templates) {
    await prisma.template.upsert({
      where: { id: tpl.id },
      update: {
        name: tpl.name,
        description: tpl.description,
        snapshot: tpl.snapshot,
      },
      create: tpl,
    });
  }

  console.log(`Seeded templates: ${templates.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
