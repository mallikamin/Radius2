-- Phase 9: Micro-tasks + Comment linkage
-- Branch: wip/Tasks-Subtask
-- Date: 2026-02-19

-- 1. Create micro_tasks table
CREATE TABLE IF NOT EXISTS micro_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    assignee_id UUID REFERENCES company_reps(id) ON DELETE SET NULL,
    due_date DATE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES company_reps(id),
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES company_reps(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_micro_tasks_task ON micro_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_micro_tasks_assignee ON micro_tasks(assignee_id);

-- 2. Add micro_task_id FK to task_comments
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'task_comments' AND column_name = 'micro_task_id'
    ) THEN
        ALTER TABLE task_comments ADD COLUMN micro_task_id UUID REFERENCES micro_tasks(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_task_comments_micro_task ON task_comments(micro_task_id);

COMMENT ON COLUMN task_comments.micro_task_id IS
    'If set, this comment belongs to a micro-task. task_id still references the parent subtask for aggregation queries.';
