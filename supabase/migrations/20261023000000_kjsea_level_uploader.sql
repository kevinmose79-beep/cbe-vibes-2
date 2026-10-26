-- ==============================================================================
-- Migration: 20261023000000_kjsea_level_uploader.sql
-- Description: Phase 1A — KJSEA Level Uploader Database Foundation & Security
-- CBE Management System
-- ==============================================================================

-- 1. Helper Function: Get Currently Active Academic Year
CREATE OR REPLACE FUNCTION public.get_active_academic_year()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT year FROM public.academic_years WHERE status = 'Active' LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_academic_year() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_active_academic_year() TO authenticated, service_role;

-- 2. Create Table: kjsea_stream_authorisations
-- Preserves immutable examination-year teacher authorisation (Option B)
CREATE TABLE IF NOT EXISTS public.kjsea_stream_authorisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_year INTEGER NOT NULL,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  stream_id UUID NOT NULL REFERENCES public.streams(id) ON DELETE RESTRICT,
  class_teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT kjsea_stream_authorisations_unique UNIQUE (exam_year, stream_id, class_teacher_id)
);

-- Performance & lookup indexes for authorisations
CREATE INDEX IF NOT EXISTS idx_kjsea_stream_auth_lookup 
  ON public.kjsea_stream_authorisations(exam_year, stream_id, class_teacher_id);
CREATE INDEX IF NOT EXISTS idx_kjsea_stream_auth_teacher 
  ON public.kjsea_stream_authorisations(class_teacher_id, exam_year);

-- Automatic timestamp trigger for kjsea_stream_authorisations
CREATE OR REPLACE FUNCTION public.set_kjsea_stream_authorisations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kjsea_stream_authorisations_updated_at ON public.kjsea_stream_authorisations;
CREATE TRIGGER trg_kjsea_stream_authorisations_updated_at
  BEFORE UPDATE ON public.kjsea_stream_authorisations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_kjsea_stream_authorisations_updated_at();

-- 3. Seed Initial 2026 Grade 9 Stream Authorisations
-- Madam Vivian (Grade 9 Red) & Mr Maina (Grade 9 Blue)
INSERT INTO public.kjsea_stream_authorisations (exam_year, class_id, stream_id, class_teacher_id)
VALUES
  (2026, '0e49e9b0-0a82-4f4b-9109-685b0103a54c', '3d0ecb00-3e0f-425a-8d69-59f6c9f18b40', '1d9eb03b-8267-4855-b876-16b8bee13322'),
  (2026, '0e49e9b0-0a82-4f4b-9109-685b0103a54c', '95e8ff02-6d67-433f-a417-2d74e2012793', '5e41bef7-8d3b-40fa-85d9-acd47614affe')
ON CONFLICT (exam_year, stream_id, class_teacher_id) DO NOTHING;

-- 4. Helper Function: Get Authorized KJSEA Stream IDs for Current User
CREATE OR REPLACE FUNCTION public.get_my_kjsea_authorized_stream_ids(p_exam_year INTEGER)
RETURNS TABLE (stream_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ksa.stream_id
  FROM public.kjsea_stream_authorisations ksa
  JOIN public.teachers t ON t.id = ksa.class_teacher_id
  JOIN public.users u ON (u.teacher_id = t.id OR t.user_id = u.id)
  WHERE u.id = auth.uid()
    AND ksa.exam_year = p_exam_year;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_kjsea_authorized_stream_ids(INTEGER) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_kjsea_authorized_stream_ids(INTEGER) TO authenticated, service_role;

-- 5. Create Table: kjsea_level_entries
CREATE TABLE IF NOT EXISTS public.kjsea_level_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  stream_id UUID NOT NULL REFERENCES public.streams(id) ON DELETE RESTRICT,
  exam_year INTEGER NOT NULL,
  subject_code TEXT NOT NULL,
  achievement_level TEXT,
  points INTEGER,
  status TEXT NOT NULL DEFAULT 'Normal',
  entered_by_teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Subject Code Constraint: Exactly the 9 Approved CBE Learning Areas
  CONSTRAINT kjsea_level_entries_subject_code_check CHECK (
    subject_code IN ('ENG', 'KIS', 'MATH', 'INT SCI', 'CAS', 'SST', 'CRE', 'AGN', 'PRE-TECH')
  ),

  -- Achievement Level Constraint: Only 8 Approved Levels or NULL (for X/Y)
  CONSTRAINT kjsea_level_entries_achievement_level_check CHECK (
    achievement_level IS NULL OR achievement_level IN ('EE1', 'EE2', 'ME1', 'ME2', 'AE1', 'AE2', 'BE1', 'BE2')
  ),

  -- Status Constraint: Normal, Absent (X), Irregularity (Y)
  CONSTRAINT kjsea_level_entries_status_check CHECK (
    status IN ('Normal', 'Absent', 'Irregularity')
  ),

  -- Unique Entry Constraint per learner, subject, and examination year
  CONSTRAINT kjsea_level_entries_unique_entry UNIQUE (student_id, subject_code, exam_year),

  -- Strict Consistency Constraint between Status, Achievement Level, and Points
  CONSTRAINT kjsea_level_entries_consistency_check CHECK (
    (
      status = 'Normal' AND
      achievement_level IS NOT NULL AND
      points IS NOT NULL AND
      achievement_level IN ('EE1', 'EE2', 'ME1', 'ME2', 'AE1', 'AE2', 'BE1', 'BE2') AND
      points = CASE achievement_level
        WHEN 'EE1' THEN 8
        WHEN 'EE2' THEN 7
        WHEN 'ME1' THEN 6
        WHEN 'ME2' THEN 5
        WHEN 'AE1' THEN 4
        WHEN 'AE2' THEN 3
        WHEN 'BE1' THEN 2
        WHEN 'BE2' THEN 1
      END
    )
    OR
    (
      status IN ('Absent', 'Irregularity') AND
      achievement_level IS NULL AND
      points IS NULL
    )
  )
);

-- Performance & analytical indexes for kjsea_level_entries
CREATE INDEX IF NOT EXISTS idx_kjsea_entries_lookup 
  ON public.kjsea_level_entries(exam_year, stream_id, subject_code);
CREATE INDEX IF NOT EXISTS idx_kjsea_entries_student 
  ON public.kjsea_level_entries(student_id, exam_year);
CREATE INDEX IF NOT EXISTS idx_kjsea_entries_stream 
  ON public.kjsea_level_entries(stream_id, exam_year);
CREATE INDEX IF NOT EXISTS idx_kjsea_entries_year 
  ON public.kjsea_level_entries(exam_year);

-- Automatic timestamp trigger for kjsea_level_entries
CREATE OR REPLACE FUNCTION public.set_kjsea_level_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kjsea_level_entries_updated_at ON public.kjsea_level_entries;
CREATE TRIGGER trg_kjsea_level_entries_updated_at
  BEFORE UPDATE ON public.kjsea_level_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_kjsea_level_entries_updated_at();

-- Defense-in-Depth Security & Identity Immutability Trigger for kjsea_level_entries
-- 1. For non-admin INSERT: Derives entered_by_teacher_id from verified user-teacher relationship, rejecting unverified or ambiguous links.
-- 2. For non-admin UPDATE: Strictly prevents modifying entered_by_teacher_id, student_id, class_id, stream_id, exam_year, or subject_code.
-- 3. Verified administrators and service_role retain full authority.
CREATE OR REPLACE FUNCTION public.enforce_kjsea_level_entry_security_and_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_teacher_ids UUID[];
BEGIN
  -- 1. Verify administrative or service_role authority
  -- Verifies authenticated claims securely without trusting unvalidated client headers
  v_is_admin := public.is_admin()
                OR auth.role() = 'service_role';

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- 2. Non-administrator operations: Resolve authenticated teacher identity safely
  -- Checks both users.teacher_id and teachers.user_id relationships
  SELECT ARRAY_AGG(DISTINCT t.id)
  INTO v_teacher_ids
  FROM public.teachers t
  LEFT JOIN public.users u ON (u.teacher_id = t.id OR t.user_id = u.id)
  WHERE u.id = auth.uid() OR t.user_id = auth.uid();

  -- If the authenticated non-admin has no valid teacher profile, reject with SQLSTATE 42501
  IF v_teacher_ids IS NULL OR cardinality(v_teacher_ids) = 0 THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Authenticated user is not linked to a valid teacher profile.'
      USING ERRCODE = '42501';
  END IF;

  -- Handle ambiguous or duplicate matches safely rather than selecting an arbitrary teacher
  IF cardinality(v_teacher_ids) > 1 THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Ambiguous teacher profile linkage detected for user.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Non-admin INSERT: Overwrite client-supplied entered_by_teacher_id with verified teacher ID
  IF TG_OP = 'INSERT' THEN
    NEW.entered_by_teacher_id := v_teacher_ids[1];
    RETURN NEW;
  END IF;

  -- 4. Non-admin UPDATE: Strictly enforce immutability of audit identity and protected fields
  IF TG_OP = 'UPDATE' THEN
    IF NEW.entered_by_teacher_id IS DISTINCT FROM OLD.entered_by_teacher_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED: entered_by_teacher_id is immutable on existing KJSEA level entries.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.student_id IS DISTINCT FROM OLD.student_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED: student_id is immutable on existing KJSEA level entries.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.class_id IS DISTINCT FROM OLD.class_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED: class_id is immutable on existing KJSEA level entries.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.stream_id IS DISTINCT FROM OLD.stream_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED: stream_id is immutable on existing KJSEA level entries.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.exam_year IS DISTINCT FROM OLD.exam_year THEN
      RAISE EXCEPTION 'UNAUTHORIZED: exam_year is immutable on existing KJSEA level entries.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.subject_code IS DISTINCT FROM OLD.subject_code THEN
      RAISE EXCEPTION 'UNAUTHORIZED: subject_code is immutable on existing KJSEA level entries.'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_kjsea_level_entry_security_and_identity() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.enforce_kjsea_level_entry_security_and_identity() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_enforce_kjsea_level_entry_identity_immutability ON public.kjsea_level_entries;
DROP TRIGGER IF EXISTS trg_enforce_kjsea_level_entry_security_and_identity ON public.kjsea_level_entries;
CREATE TRIGGER trg_enforce_kjsea_level_entry_security_and_identity
  BEFORE INSERT OR UPDATE ON public.kjsea_level_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_kjsea_level_entry_security_and_identity();

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.kjsea_stream_authorisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kjsea_level_entries ENABLE ROW LEVEL SECURITY;

-- 7. Base Grants and Revocations
REVOKE ALL ON public.kjsea_stream_authorisations FROM PUBLIC, anon;
GRANT SELECT ON public.kjsea_stream_authorisations TO authenticated;
GRANT ALL ON public.kjsea_stream_authorisations TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.kjsea_stream_authorisations TO authenticated;

REVOKE ALL ON public.kjsea_level_entries FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kjsea_level_entries TO authenticated;
GRANT ALL ON public.kjsea_level_entries TO service_role;

-- 8. RLS Policies: kjsea_stream_authorisations
DROP POLICY IF EXISTS "kjsea_stream_authorisations_select_policy" ON public.kjsea_stream_authorisations;
CREATE POLICY "kjsea_stream_authorisations_select_policy" ON public.kjsea_stream_authorisations
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "kjsea_stream_authorisations_admin_write_policy" ON public.kjsea_stream_authorisations;
CREATE POLICY "kjsea_stream_authorisations_admin_write_policy" ON public.kjsea_stream_authorisations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 9. RLS Policies: kjsea_level_entries

-- SELECT: Admins see all years & streams; Teachers see streams authorized for them in that exam_year
DROP POLICY IF EXISTS "kjsea_level_entries_select_policy" ON public.kjsea_level_entries;
CREATE POLICY "kjsea_level_entries_select_policy" ON public.kjsea_level_entries
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR kjsea_level_entries.stream_id IN (
      SELECT stream_id FROM public.get_my_kjsea_authorized_stream_ids(kjsea_level_entries.exam_year)
    )
  );

-- INSERT: Admins full access; Teachers restricted to active exam_year, authorized stream, and current Grade 9 learner
DROP POLICY IF EXISTS "kjsea_level_entries_insert_policy" ON public.kjsea_level_entries;
CREATE POLICY "kjsea_level_entries_insert_policy" ON public.kjsea_level_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      kjsea_level_entries.exam_year = public.get_active_academic_year()
      AND kjsea_level_entries.stream_id IN (
        SELECT stream_id FROM public.get_my_kjsea_authorized_stream_ids(kjsea_level_entries.exam_year)
      )
      AND EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.classes c ON c.id = s.class_id
        WHERE s.id = kjsea_level_entries.student_id
          AND s.stream_id = kjsea_level_entries.stream_id
          AND c.grade_level = 9
          AND s.active = true
      )
    )
  );

-- UPDATE: Admins full access; Teachers restricted to active exam_year, authorized stream, and current Grade 9 learner
DROP POLICY IF EXISTS "kjsea_level_entries_update_policy" ON public.kjsea_level_entries;
CREATE POLICY "kjsea_level_entries_update_policy" ON public.kjsea_level_entries
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (
      kjsea_level_entries.exam_year = public.get_active_academic_year()
      AND kjsea_level_entries.stream_id IN (
        SELECT stream_id FROM public.get_my_kjsea_authorized_stream_ids(kjsea_level_entries.exam_year)
      )
      AND EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.classes c ON c.id = s.class_id
        WHERE s.id = kjsea_level_entries.student_id
          AND s.stream_id = kjsea_level_entries.stream_id
          AND c.grade_level = 9
          AND s.active = true
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      kjsea_level_entries.exam_year = public.get_active_academic_year()
      AND kjsea_level_entries.stream_id IN (
        SELECT stream_id FROM public.get_my_kjsea_authorized_stream_ids(kjsea_level_entries.exam_year)
      )
      AND EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.classes c ON c.id = s.class_id
        WHERE s.id = kjsea_level_entries.student_id
          AND s.stream_id = kjsea_level_entries.stream_id
          AND c.grade_level = 9
          AND s.active = true
      )
    )
  );

-- DELETE: Strictly administrators only! Non-admin teachers cannot delete level entries
DROP POLICY IF EXISTS "kjsea_level_entries_delete_policy" ON public.kjsea_level_entries;
CREATE POLICY "kjsea_level_entries_delete_policy" ON public.kjsea_level_entries
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
  );

-- 10. Notify PostgREST to refresh schema cache
NOTIFY pgrst, 'reload schema';
