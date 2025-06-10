import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv'
dotenv.config()

let prisma
export default prisma = new PrismaClient({
    datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    errorFormat: 'pretty'
});
