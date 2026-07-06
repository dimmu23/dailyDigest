import { PrismaClient } from "@prisma/client";
import { slugify } from "../src/lib/text";

const prisma = new PrismaClient();

const tags = [
  "Polity",
  "Governance",
  "Economy",
  "Environment",
  "Science & Technology",
  "International Relations",
  "Social Justice",
  "Security",
  "Agriculture",
  "Reports/Indices",
  "Government Schemes"
];

async function main() {
  for (const name of tags) {
    await prisma.tag.upsert({
      where: { name },
      update: { slug: slugify(name) },
      create: { name, slug: slugify(name) }
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });

