-- AlterTable
ALTER TABLE "ExchangeRate" ADD COLUMN     "buyAbove1mPer100k" INTEGER,
ADD COLUMN     "buyBelow1mPer100k" INTEGER,
ADD COLUMN     "sellAbove1mPer100k" INTEGER,
ADD COLUMN     "sellBelow1mPer100k" INTEGER;
