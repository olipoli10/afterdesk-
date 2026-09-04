import { PrismaClient } from "@prisma-client";

// The disposable Prisma Dev/PGlite proxy serializes write-heavy integration
// transactions. Keep production defaults untouched while giving intentional
// Promise.all concurrency gates enough bounded time to acquire a transaction.
const globalForIntegrationPrisma = globalThis as unknown as {
  integrationPrisma?: PrismaClient;
};

export const prisma = globalForIntegrationPrisma.integrationPrisma ?? new PrismaClient({
  transactionOptions: {
    maxWait: 30_000,
    timeout: 120_000,
  },
});

globalForIntegrationPrisma.integrationPrisma = prisma;
