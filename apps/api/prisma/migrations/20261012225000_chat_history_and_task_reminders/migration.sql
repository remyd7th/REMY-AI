-- Persist authenticated chat history and task reminder details.
ALTER TABLE "Task"
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "remindAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE INDEX "Task_workspaceId_remindAt_status_idx" ON "Task"("workspaceId", "remindAt", "status");

CREATE TABLE "ChatConversation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'New conversation',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "actions" JSONB NOT NULL DEFAULT '[]',
  "clientMessageId" TEXT,
  "replyToId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatConversation_userId_workspaceId_updatedAt_idx"
  ON "ChatConversation"("userId", "workspaceId", "updatedAt");
CREATE INDEX "ChatMessage_conversationId_createdAt_idx"
  ON "ChatMessage"("conversationId", "createdAt");
CREATE UNIQUE INDEX "ChatMessage_clientMessageId_key" ON "ChatMessage"("clientMessageId");
CREATE UNIQUE INDEX "ChatMessage_replyToId_key" ON "ChatMessage"("replyToId");

ALTER TABLE "ChatConversation"
  ADD CONSTRAINT "ChatConversation_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
