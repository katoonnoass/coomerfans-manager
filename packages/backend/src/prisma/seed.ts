import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  await prisma.user.upsert({
    where: { id: 'local-user' },
    update: {},
    create: {
      id: 'local-user',
      email: 'local@coomerfans.app',
      username: 'local',
      passwordHash: 'login-disabled',
      role: 'ADMIN',
    },
  });

  const models = [
    {
      externalId: 'fansly:181710',
      service: 'fansly',
      name: 'Pupprincess',
      slug: 'pupprincess24',
      thumbnailUrl: 'https://coomerfans.com/istorage/181710.jpg',
      postCount: 45,
      mediaCount: 120,
      isVerified: true,
      metadata: { source: 'coomerfans-catalog', catalogSlug: 'pupprincess24' },
    },
    {
      externalId: 'onlyfans:209177',
      service: 'onlyfans',
      name: 'FreeBliss',
      slug: 'freeblisss',
      thumbnailUrl: 'https://coomerfans.com/istorage/209177.jpg',
      postCount: 32,
      mediaCount: 89,
      isVerified: false,
      metadata: { source: 'coomerfans-catalog', catalogSlug: 'freeblisss' },
    },
    {
      externalId: 'fansly:317129',
      service: 'fansly',
      name: 'Neko Chan',
      slug: 'nnnnekochan',
      thumbnailUrl: 'https://coomerfans.com/istorage/317129.jpg',
      postCount: 67,
      mediaCount: 210,
      isVerified: true,
      metadata: { source: 'coomerfans-catalog', catalogSlug: 'nnnnekochan' },
    },
    {
      externalId: 'onlyfans:380397',
      service: 'onlyfans',
      name: 'Ana Manzano',
      slug: 'anamanzanorein',
      thumbnailUrl: 'https://coomerfans.com/istorage/380397.jpg',
      postCount: 28,
      mediaCount: 74,
      isVerified: false,
      metadata: { source: 'coomerfans-catalog', catalogSlug: 'anamanzanorein' },
    },
    {
      externalId: 'onlyfans:360651',
      service: 'onlyfans',
      name: 'Super Bunny',
      slug: 'super8unny',
      thumbnailUrl: 'https://coomerfans.com/istorage/360651.jpg',
      postCount: 53,
      mediaCount: 156,
      isVerified: true,
      metadata: { source: 'coomerfans-catalog', catalogSlug: 'super8unny' },
    },
  ];

  for (const model of models) {
    const exists = await prisma.model.findUnique({
      where: { slug: model.slug },
    });

    if (!exists) {
      await prisma.model.create({ data: model });
      console.log(`  Created model: ${model.name}`);
    } else {
      await prisma.model.update({
        where: { slug: model.slug },
        data: model,
      });
      console.log(`  Updated model: ${model.name}`);
    }
  }

  console.log('Seed complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
