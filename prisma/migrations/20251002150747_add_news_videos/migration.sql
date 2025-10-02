-- CreateTable
CREATE TABLE "NewsVideo" (
    "id" TEXT NOT NULL,
    "newsId" TEXT NOT NULL,
    "youtubeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsVideo_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "NewsVideo" ADD CONSTRAINT "NewsVideo_newsId_fkey" FOREIGN KEY ("newsId") REFERENCES "News"("id") ON DELETE CASCADE ON UPDATE CASCADE;
