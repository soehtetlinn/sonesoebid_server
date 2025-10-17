-- AlterTable
ALTER TABLE "ExchangeRate" ADD COLUMN     "dateText" TEXT,
ADD COLUMN     "notes" JSONB,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "sellSpecial100to500" TEXT;
