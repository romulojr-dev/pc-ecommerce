-- The audit log screen (docs/specs/047-admin-audit-log-view, D14): newest
-- first with an id tiebreak, and the entity filter. Indexes only: no data,
-- trigger or constraint changes. The existing (createdAt) and (actorId)
-- indexes stay.

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_id_idx" ON "AuditLog"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_entity_createdAt_idx" ON "AuditLog"("entity", "createdAt" DESC);
