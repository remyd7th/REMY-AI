ALTER TABLE "User"
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspensionReason" TEXT,
  ADD COLUMN "platformRole" TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "lastActivityAt" TIMESTAMP(3);

CREATE INDEX "User_lastActivityAt_idx" ON "User"("lastActivityAt");
CREATE INDEX "User_lastLoginAt_idx" ON "User"("lastLoginAt");
CREATE INDEX "User_suspendedAt_idx" ON "User"("suspendedAt");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationMembership" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecurityEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "actorId" TEXT,
  "organizationId" TEXT,
  "type" TEXT NOT NULL,
  "outcome" TEXT NOT NULL DEFAULT 'success',
  "details" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_name_idx" ON "Organization"("name");
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");
CREATE INDEX "OrganizationMembership_userId_role_idx" ON "OrganizationMembership"("userId", "role");
CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");
CREATE INDEX "SecurityEvent_organizationId_createdAt_idx" ON "SecurityEvent"("organizationId", "createdAt");
CREATE INDEX "SecurityEvent_type_createdAt_idx" ON "SecurityEvent"("type", "createdAt");

ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
