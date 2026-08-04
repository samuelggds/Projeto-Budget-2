-- Add status column to track completion/cancellation per maintenance plan
ALTER TABLE maintenance_plans
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'concluida', 'cancelada'));
