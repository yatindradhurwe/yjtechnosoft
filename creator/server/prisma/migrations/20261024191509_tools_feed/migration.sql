-- CreateEnum
CREATE TYPE "ToolAccess" AS ENUM ('PUBLIC', 'MEMBERS', 'PRODUCT');

-- CreateEnum
CREATE TYPE "FeedVisibility" AS ENUM ('PUBLIC', 'MEMBERS', 'PAID');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "maxVideoMb" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "memberFeedPosts" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CreatorTool" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "PageStatus" NOT NULL DEFAULT 'DRAFT',
    "access" "ToolAccess" NOT NULL DEFAULT 'PUBLIC',
    "productId" UUID,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolSubmission" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "toolId" UUID NOT NULL,
    "userId" UUID,
    "inputs" JSONB NOT NULL,
    "outputs" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPost" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "thumbnailUrl" TEXT,
    "caption" TEXT,
    "visibility" "FeedVisibility" NOT NULL DEFAULT 'PUBLIC',
    "productId" UUID,
    "status" "ContentStatus" NOT NULL DEFAULT 'VISIBLE',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeedPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedLike" (
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedLike_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "FeedView" (
    "postId" UUID NOT NULL,
    "viewerKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedView_pkey" PRIMARY KEY ("postId","viewerKey")
);

-- CreateTable
CREATE TABLE "FeedComment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorTool_tenantId_slug_key" ON "CreatorTool"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "ToolSubmission_toolId_userId_createdAt_idx" ON "ToolSubmission"("toolId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedPost_tenantId_createdAt_idx" ON "FeedPost"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedComment_postId_createdAt_idx" ON "FeedComment"("postId", "createdAt");

-- AddForeignKey
ALTER TABLE "ToolSubmission" ADD CONSTRAINT "ToolSubmission_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "CreatorTool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedLike" ADD CONSTRAINT "FeedLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedView" ADD CONSTRAINT "FeedView_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
