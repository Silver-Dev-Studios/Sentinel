-- AlterTable
ALTER TABLE "ServerConfiguration" ADD COLUMN     "giveawayDefaultChannelId" TEXT,
ADD COLUMN     "giveawayDefaultEmbed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "logChannels" JSONB;

-- AlterTable
ALTER TABLE "moderation_roles" ADD COLUMN     "discordRoleId" TEXT;
