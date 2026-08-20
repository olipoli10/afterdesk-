import { PrismaClient } from "@prisma-client";

// Singleton — survives dev hot-reload, one pool in serverless.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
