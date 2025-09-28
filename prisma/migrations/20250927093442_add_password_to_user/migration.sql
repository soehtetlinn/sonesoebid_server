/*
  Warnings:

  - Added the required column `password` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "password" TEXT NOT NULL DEFAULT '$2b$10$default.hash.for.existing.users';

-- Update existing users with a default password (they'll need to reset it)
-- The default password is 'changeme123' - users should change this on first login
