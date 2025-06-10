-- CreateTable
CREATE TABLE `Participant` (
    `id` VARCHAR(191) NOT NULL,
    `socketId` VARCHAR(191) NOT NULL,
    `workshopId` VARCHAR(191) NOT NULL,
    `participantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `description` VARCHAR(191) NOT NULL DEFAULT 'Participant',
    `avatar` VARCHAR(191) NULL,
    `micIsOn` BOOLEAN NOT NULL DEFAULT false,
    `cameraIsOn` BOOLEAN NOT NULL DEFAULT true,
    `handIsRaised` BOOLEAN NOT NULL DEFAULT false,
    `role` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Participant_socketId_key`(`socketId`),
    UNIQUE INDEX `Participant_participantId_key`(`participantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Workshop` (
    `id` VARCHAR(191) NOT NULL,
    `workshopId` VARCHAR(191) NOT NULL,
    `isVirtual` BOOLEAN NOT NULL DEFAULT false,
    `state` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Workshop_workshopId_key`(`workshopId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Message` (
    `id` VARCHAR(191) NOT NULL,
    `workshopId` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NOT NULL,
    `content` VARCHAR(191) NOT NULL,
    `type` ENUM('PARTICIPANT', 'MODERATOR', 'SUPPORT', 'EXPERT') NOT NULL DEFAULT 'PARTICIPANT',
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Participant` ADD CONSTRAINT `Participant_workshopId_fkey` FOREIGN KEY (`workshopId`) REFERENCES `Workshop`(`workshopId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_workshopId_fkey` FOREIGN KEY (`workshopId`) REFERENCES `Workshop`(`workshopId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `Participant`(`participantId`) ON DELETE RESTRICT ON UPDATE CASCADE;
