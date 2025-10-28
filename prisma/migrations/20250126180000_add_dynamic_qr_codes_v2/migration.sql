-- CreateEnum
CREATE TYPE "QrCodeType" AS ENUM ('STATIC', 'DYNAMIC');

-- CreateEnum
CREATE TYPE "QrCodeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "dynamic_qr_codes" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "shortCode" TEXT NOT NULL,
    "shortUrl" TEXT NOT NULL,
    "destinationUrl" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "type" "QrCodeType" NOT NULL DEFAULT 'DYNAMIC',
    "status" "QrCodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "lastScannedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isTrial" BOOLEAN NOT NULL DEFAULT true,
    "trialEndsAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dynamic_qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_code_scans" (
    "id" TEXT NOT NULL,
    "qrCodeId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "country" TEXT,
    "city" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "referrer" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_code_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dynamic_qr_codes_shortCode_key" ON "dynamic_qr_codes"("shortCode");

-- CreateIndex
CREATE UNIQUE INDEX "dynamic_qr_codes_shortUrl_key" ON "dynamic_qr_codes"("shortUrl");

-- AddForeignKey
ALTER TABLE "dynamic_qr_codes" ADD CONSTRAINT "dynamic_qr_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_code_scans" ADD CONSTRAINT "qr_code_scans_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "dynamic_qr_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
