/*
  Warnings:

  - Added the required column `participantOwnerId` to the `Participant` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Participant` ADD COLUMN `participantOwnerId` VARCHAR(191) NOT NULL;
