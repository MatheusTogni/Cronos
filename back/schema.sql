-- Cronos — schema PostgreSQL
-- Executar manualmente contra o banco (desenvolvimento e produção) antes de subir a API.
-- Não há migrations automáticas: o Prisma só lê e grava, não cria tabelas.
-- O banco precisa ser UTF8 (o log usa caracteres como "−" e "→").
-- Depois rode `npm run db:seed` para carregar as 9 classes e o catálogo de condições.
-- Se mudar o prisma/schema.prisma, aplique o ALTER correspondente no banco e atualize este arquivo.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MASTER', 'PLAYER');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'LOBBY', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "AbilityKind" AS ENUM ('BASIC', 'SKILL');

-- CreateEnum
CREATE TYPE "LogType" AS ENUM ('DAMAGE', 'HEAL', 'MANA', 'XP', 'LEVEL', 'ABILITY_USED', 'DICE_ROLL', 'CONDITION_ADDED', 'CONDITION_REMOVED', 'SUMMON_CREATED', 'SUMMON_REMOVED', 'SUMMON_UPDATED', 'ITEM_ADDED', 'ITEM_REMOVED', 'ITEM_UPDATED', 'CAMPAIGN', 'NOTE', 'TURN', 'NPC_CREATED', 'NPC_UPDATED', 'NPC_REMOVED');

-- CreateEnum
CREATE TYPE "ConditionPolarity" AS ENUM ('BUFF', 'DEBUFF', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "TransferKind" AS ENUM ('GIFT', 'TRADE');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "masterId" TEXT NOT NULL,
    "shownImageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "inCombat" BOOLEAN NOT NULL DEFAULT false,
    "round" INTEGER NOT NULL DEFAULT 0,
    "turnIndex" INTEGER NOT NULL DEFAULT 0,
    "turnOrder" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shopOpen" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_players" (
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_players_pkey" PRIMARY KEY ("campaignId","userId")
);

-- CreateTable
CREATE TABLE "character_classes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "categories" TEXT[],
    "identity" TEXT NOT NULL,
    "mechanicName" TEXT NOT NULL,
    "mechanicText" TEXT NOT NULL,
    "baseHp" INTEGER NOT NULL,
    "baseMana" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "artFile" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "character_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abilities" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "kind" "AbilityKind" NOT NULL,
    "name" TEXT NOT NULL,
    "manaCost" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "crits" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "unlockLevel" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "abilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "hp" INTEGER NOT NULL,
    "hpMax" INTEGER NOT NULL,
    "mana" INTEGER NOT NULL,
    "manaMax" INTEGER NOT NULL,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "summons" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hp" INTEGER NOT NULL,
    "hpMax" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "summons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "npcs" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hp" INTEGER NOT NULL,
    "hpMax" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "npcs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condition_defs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "polarity" "ConditionPolarity" NOT NULL DEFAULT 'NEUTRAL',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "condition_defs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conditions" (
    "id" TEXT NOT NULL,
    "characterId" TEXT,
    "summonId" TEXT,
    "npcId" TEXT,
    "defId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT,
    "polarity" "ConditionPolarity" NOT NULL DEFAULT 'NEUTRAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "kind" "TransferKind" NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "giveItemId" TEXT,
    "giveName" TEXT,
    "giveQty" INTEGER NOT NULL DEFAULT 1,
    "giveGold" INTEGER NOT NULL DEFAULT 0,
    "askItemId" TEXT,
    "askName" TEXT,
    "askQty" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_images" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_entries" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "characterId" TEXT,
    "type" "LogType" NOT NULL,
    "message" TEXT NOT NULL,
    "masterMessage" TEXT,
    "delta" JSONB,
    "roll" INTEGER,
    "revertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_shownImageId_key" ON "campaigns"("shownImageId");

-- CreateIndex
CREATE UNIQUE INDEX "abilities_classId_name_key" ON "abilities"("classId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "characters_campaignId_userId_key" ON "characters"("campaignId", "userId");

-- CreateIndex
CREATE INDEX "log_entries_campaignId_createdAt_idx" ON "log_entries"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "transfers_campaignId_status_idx" ON "transfers"("campaignId", "status");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_shownImageId_fkey" FOREIGN KEY ("shownImageId") REFERENCES "campaign_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_players" ADD CONSTRAINT "campaign_players_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_players" ADD CONSTRAINT "campaign_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abilities" ADD CONSTRAINT "abilities_classId_fkey" FOREIGN KEY ("classId") REFERENCES "character_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_classId_fkey" FOREIGN KEY ("classId") REFERENCES "character_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summons" ADD CONSTRAINT "summons_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_summonId_fkey" FOREIGN KEY ("summonId") REFERENCES "summons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "npcs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_defId_fkey" FOREIGN KEY ("defId") REFERENCES "condition_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_images" ADD CONSTRAINT "campaign_images_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_toId_fkey" FOREIGN KEY ("toId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

