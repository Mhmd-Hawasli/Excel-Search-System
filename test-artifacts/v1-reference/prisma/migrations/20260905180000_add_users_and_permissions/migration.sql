-- Users and permissions for system access control.

ALTER TYPE "activity_action" ADD VALUE IF NOT EXISTS 'user_created';
ALTER TYPE "activity_action" ADD VALUE IF NOT EXISTS 'user_updated';
ALTER TYPE "activity_action" ADD VALUE IF NOT EXISTS 'user_deleted';
ALTER TYPE "activity_action" ADD VALUE IF NOT EXISTS 'user_permissions_updated';

CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "username" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "display_name" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

CREATE TABLE "user_permissions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "permission" TEXT NOT NULL,
  "group_id" UUID,
  "file_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_permissions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_permissions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "user_permissions_user_id_idx" ON "user_permissions"("user_id");
CREATE INDEX "user_permissions_group_id_idx" ON "user_permissions"("group_id");
CREATE INDEX "user_permissions_file_id_idx" ON "user_permissions"("file_id");
