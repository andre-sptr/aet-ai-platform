CREATE TABLE "AiSetting" (
  "id" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSetting_pkey" PRIMARY KEY ("id")
);
