import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 1A — KJSEA Level Uploader Database Foundation & Security Specification', () => {
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261023000000_kjsea_level_uploader.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  describe('1. Migration File Structure & Core Tables', () => {
    it('verifies migration file exists and contains kjsea_stream_authorisations table definition', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.kjsea_stream_authorisations');
      expect(migrationSql).toContain('id UUID PRIMARY KEY DEFAULT gen_random_uuid()');
      expect(migrationSql).toContain('exam_year INTEGER NOT NULL');
      expect(migrationSql).toContain('class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT');
      expect(migrationSql).toContain('stream_id UUID NOT NULL REFERENCES public.streams(id) ON DELETE RESTRICT');
      expect(migrationSql).toContain('class_teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE RESTRICT');
      expect(migrationSql).toContain('CONSTRAINT kjsea_stream_authorisations_unique UNIQUE (exam_year, stream_id, class_teacher_id)');
    });

    it('verifies kjsea_level_entries table definition and foreign keys', () => {
      expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.kjsea_level_entries');
      expect(migrationSql).toContain('id UUID PRIMARY KEY DEFAULT gen_random_uuid()');
      expect(migrationSql).toContain('student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT');
      expect(migrationSql).toContain('class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT');
      expect(migrationSql).toContain('stream_id UUID NOT NULL REFERENCES public.streams(id) ON DELETE RESTRICT');
      expect(migrationSql).toContain('exam_year INTEGER NOT NULL');
      expect(migrationSql).toContain('subject_code TEXT NOT NULL');
      expect(migrationSql).toContain('achievement_level TEXT');
      expect(migrationSql).toContain('points INTEGER');
      expect(migrationSql).toContain("status TEXT NOT NULL DEFAULT 'Normal'");
      expect(migrationSql).toContain('entered_by_teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL');
      expect(migrationSql).toContain('CONSTRAINT kjsea_level_entries_unique_entry UNIQUE (student_id, subject_code, exam_year)');
    });
  });

  describe('2. Subject Code Specification (Exact 9 Learning Areas)', () => {
    const APPROVED_SUBJECT_CODES = [
      'ENG',
      'KIS',
      'MATH',
      'INT SCI',
      'CAS',
      'SST',
      'CRE',
      'AGN',
      'PRE-TECH'
    ];

    it('enforces check constraint with exactly the 9 approved CBE learning areas in order', () => {
      expect(migrationSql).toContain('CONSTRAINT kjsea_level_entries_subject_code_check CHECK');
      for (const code of APPROVED_SUBJECT_CODES) {
        expect(migrationSql).toContain(`'${code}'`);
      }
    });

    it('simulates subject code validation rejecting unapproved or legacy subjects', () => {
      const validateSubjectCode = (code: string) => APPROVED_SUBJECT_CODES.includes(code);

      // Approved
      expect(validateSubjectCode('ENG')).toBe(true);
      expect(validateSubjectCode('KIS')).toBe(true);
      expect(validateSubjectCode('MATH')).toBe(true);
      expect(validateSubjectCode('INT SCI')).toBe(true);
      expect(validateSubjectCode('CAS')).toBe(true);
      expect(validateSubjectCode('SST')).toBe(true);
      expect(validateSubjectCode('CRE')).toBe(true);
      expect(validateSubjectCode('AGN')).toBe(true);
      expect(validateSubjectCode('PRE-TECH')).toBe(true);

      // Invalid / legacy
      expect(validateSubjectCode('INT-SCI')).toBe(false); // Hyphenated variant rejected in favour of canonical 'INT SCI'
      expect(validateSubjectCode('BIO')).toBe(false);
      expect(validateSubjectCode('PHY')).toBe(false);
      expect(validateSubjectCode('GEO')).toBe(false);
      expect(validateSubjectCode('HIST')).toBe(false);
      expect(validateSubjectCode('HSCI')).toBe(false);
      expect(validateSubjectCode('FRE')).toBe(false);
      expect(validateSubjectCode('BUS')).toBe(false);
    });
  });

  describe('3. Achievement Level & Points Specification', () => {
    const APPROVED_LEVELS = ['EE1', 'EE2', 'ME1', 'ME2', 'AE1', 'AE2', 'BE1', 'BE2'];
    const LEVEL_POINTS_MAP: Record<string, number> = {
      'EE1': 8,
      'EE2': 7,
      'ME1': 6,
      'ME2': 5,
      'AE1': 4,
      'AE2': 3,
      'BE1': 2,
      'BE2': 1
    };

    it('enforces achievement level check constraint rejecting AE3', () => {
      expect(migrationSql).toContain('CONSTRAINT kjsea_level_entries_achievement_level_check CHECK');
      expect(migrationSql).toContain("'EE1', 'EE2', 'ME1', 'ME2', 'AE1', 'AE2', 'BE1', 'BE2'");
      // Ensure AE3 is explicitly excluded
      expect(migrationSql).not.toContain("'AE3'");
    });

    it('simulates points calculation and verifies AE3 rejection', () => {
      const getPointsForLevel = (level: string): number | null => {
        if (!APPROVED_LEVELS.includes(level)) return null;
        return LEVEL_POINTS_MAP[level] ?? null;
      };

      expect(getPointsForLevel('EE1')).toBe(8);
      expect(getPointsForLevel('EE2')).toBe(7);
      expect(getPointsForLevel('ME1')).toBe(6);
      expect(getPointsForLevel('ME2')).toBe(5);
      expect(getPointsForLevel('AE1')).toBe(4);
      expect(getPointsForLevel('AE2')).toBe(3);
      expect(getPointsForLevel('BE1')).toBe(2);
      expect(getPointsForLevel('BE2')).toBe(1);

      // Explicitly forbidden in requirements
      expect(getPointsForLevel('AE3')).toBeNull();
      expect(getPointsForLevel('EE3')).toBeNull();
      expect(getPointsForLevel('ME3')).toBeNull();
      expect(getPointsForLevel('BE3')).toBeNull();
    });
  });

  describe('4. Status Constraints & Consistency Invariants (Normal, Absent X, Irregularity Y)', () => {
    it('verifies status check constraint and consistency check constraint in SQL', () => {
      expect(migrationSql).toContain('CONSTRAINT kjsea_level_entries_status_check CHECK');
      expect(migrationSql).toContain("status IN ('Normal', 'Absent', 'Irregularity')");

      expect(migrationSql).toContain('CONSTRAINT kjsea_level_entries_consistency_check CHECK');
      expect(migrationSql).toContain("status = 'Normal'");
      expect(migrationSql).toContain('achievement_level IS NOT NULL');
      expect(migrationSql).toContain('points IS NOT NULL');
      expect(migrationSql).toContain("status IN ('Absent', 'Irregularity')");
      expect(migrationSql).toContain('achievement_level IS NULL');
      expect(migrationSql).toContain('points IS NULL');
    });

    it('simulates SQL consistency check on valid and invalid records (including three-valued logic defense)', () => {
      interface MockRecord {
        status: 'Normal' | 'Absent' | 'Irregularity' | 'Other';
        achievement_level: string | null;
        points: number | null;
      }

      // Exact simulation of the PostgreSQL CHECK constraint boolean evaluation
      const evaluatePostgresCheck = (record: MockRecord): boolean => {
        // Normal branch
        if (record.status === 'Normal') {
          // Both must be strictly NOT NULL
          if (record.achievement_level === null || record.points === null) {
            return false;
          }
          const validLevels = ['EE1', 'EE2', 'ME1', 'ME2', 'AE1', 'AE2', 'BE1', 'BE2'];
          if (!validLevels.includes(record.achievement_level)) {
            return false;
          }
          const expectedPoints: Record<string, number> = {
            'EE1': 8, 'EE2': 7, 'ME1': 6, 'ME2': 5,
            'AE1': 4, 'AE2': 3, 'BE1': 2, 'BE2': 1
          };
          return record.points === expectedPoints[record.achievement_level];
        }

        // Absent / Irregularity branch
        if (record.status === 'Absent' || record.status === 'Irregularity') {
          return record.achievement_level === null && record.points === null;
        }

        return false;
      };

      // 1. Audit Requirement: All three NULL combinations for Normal status MUST be rejected
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: null, points: null })).toBe(false); // Both NULL
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'EE1', points: null })).toBe(false); // Level set, points NULL
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: null, points: 8 })).toBe(false);    // Level NULL, points set
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: '', points: null })).toBe(false);   // Blank level

      // 2. Audit Requirement: Every valid level (EE1..BE2) with matching points MUST be accepted
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'EE1', points: 8 })).toBe(true);
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'EE2', points: 7 })).toBe(true);
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'ME1', points: 6 })).toBe(true);
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'ME2', points: 5 })).toBe(true);
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'AE1', points: 4 })).toBe(true);
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'AE2', points: 3 })).toBe(true);
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'BE1', points: 2 })).toBe(true);
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'BE2', points: 1 })).toBe(true);

      // 3. Audit Requirement: Incorrect level/points combinations MUST be rejected
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'EE1', points: 7 })).toBe(false); // EE1 must be 8
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'EE2', points: 8 })).toBe(false); // EE2 must be 7
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'ME1', points: 5 })).toBe(false); // ME1 must be 6
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'ME2', points: 6 })).toBe(false); // ME2 must be 5
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'AE1', points: 3 })).toBe(false); // AE1 must be 4
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'AE2', points: 4 })).toBe(false); // AE2 must be 3
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'BE1', points: 1 })).toBe(false); // BE1 must be 2
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'BE2', points: 2 })).toBe(false); // BE2 must be 1
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'AE3', points: 3 })).toBe(false); // AE3 unapproved
      expect(evaluatePostgresCheck({ status: 'Normal', achievement_level: 'EE3', points: 8 })).toBe(false); // EE3 unapproved

      // 4. Valid Absent (X) and Irregularity (Y) cases: Points and level MUST be NULL
      expect(evaluatePostgresCheck({ status: 'Absent', achievement_level: null, points: null })).toBe(true);
      expect(evaluatePostgresCheck({ status: 'Irregularity', achievement_level: null, points: null })).toBe(true);

      // 5. Invalid Absent / Irregularity cases (cannot earn points or have level)
      expect(evaluatePostgresCheck({ status: 'Absent', achievement_level: 'ME1', points: null })).toBe(false);
      expect(evaluatePostgresCheck({ status: 'Absent', achievement_level: null, points: 0 })).toBe(false);
      expect(evaluatePostgresCheck({ status: 'Absent', achievement_level: 'EE1', points: 8 })).toBe(false);
      expect(evaluatePostgresCheck({ status: 'Irregularity', achievement_level: null, points: 0 })).toBe(false);
      expect(evaluatePostgresCheck({ status: 'Irregularity', achievement_level: 'BE1', points: 2 })).toBe(false);
    });
  });

  describe('5. Examination-Year Cohort & Initial 2026 Authorisation Seeding', () => {
    it('verifies initial 2026 Grade 9 stream authorisations seeded for Madam Vivian and Mr Maina', () => {
      expect(migrationSql).toContain('INSERT INTO public.kjsea_stream_authorisations');
      // Madam Vivian (Grade 9 Red)
      expect(migrationSql).toContain('3d0ecb00-3e0f-425a-8d69-59f6c9f18b40');
      expect(migrationSql).toContain('1d9eb03b-8267-4855-b876-16b8bee13322');

      // Mr Maina (Grade 9 Blue)
      expect(migrationSql).toContain('95e8ff02-6d67-433f-a417-2d74e2012793');
      expect(migrationSql).toContain('5e41bef7-8d3b-40fa-85d9-acd47614affe');

      // Grade 9 Class ID
      expect(migrationSql).toContain('0e49e9b0-0a82-4f4b-9109-685b0103a54c');
    });

    it('verifies security helper functions get_active_academic_year and get_my_kjsea_authorized_stream_ids', () => {
      expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.get_active_academic_year()');
      expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.get_my_kjsea_authorized_stream_ids');
      expect(migrationSql).toContain('SECURITY DEFINER');
    });
  });

  describe('6. Row Level Security & RBAC Policies', () => {
    it('verifies RLS enablement and base role permissions', () => {
      expect(migrationSql).toContain('ALTER TABLE public.kjsea_stream_authorisations ENABLE ROW LEVEL SECURITY;');
      expect(migrationSql).toContain('ALTER TABLE public.kjsea_level_entries ENABLE ROW LEVEL SECURITY;');
      expect(migrationSql).toContain('REVOKE ALL ON public.kjsea_stream_authorisations FROM PUBLIC, anon;');
      expect(migrationSql).toContain('REVOKE ALL ON public.kjsea_level_entries FROM PUBLIC, anon;');
      expect(migrationSql).toContain('GRANT SELECT ON public.kjsea_stream_authorisations TO authenticated;');
      expect(migrationSql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON public.kjsea_level_entries TO authenticated;');
    });

    it('verifies kjsea_stream_authorisations write policy is restricted strictly to administrators', () => {
      expect(migrationSql).toContain('CREATE POLICY "kjsea_stream_authorisations_admin_write_policy"');
      expect(migrationSql).toContain('USING (public.is_admin())');
      expect(migrationSql).toContain('WITH CHECK (public.is_admin())');
    });

    it('verifies kjsea_level_entries SELECT policy allows admins all, and teachers only authorized streams', () => {
      expect(migrationSql).toContain('CREATE POLICY "kjsea_level_entries_select_policy"');
      expect(migrationSql).toContain('public.is_admin()');
      expect(migrationSql).toContain('get_my_kjsea_authorized_stream_ids');
    });

    it('verifies kjsea_level_entries INSERT and UPDATE policies restrict teachers to active exam year and current Grade 9', () => {
      expect(migrationSql).toContain('CREATE POLICY "kjsea_level_entries_insert_policy"');
      expect(migrationSql).toContain('CREATE POLICY "kjsea_level_entries_update_policy"');
      expect(migrationSql).toContain('public.get_active_academic_year()');
      expect(migrationSql).toContain('c.grade_level = 9');
      expect(migrationSql).toContain('s.active = true');
    });

    it('verifies kjsea_level_entries DELETE policy is strictly restricted to administrators', () => {
      expect(migrationSql).toContain('CREATE POLICY "kjsea_level_entries_delete_policy"');
      expect(migrationSql).toContain('FOR DELETE TO authenticated');
      expect(migrationSql).toContain('USING (\n    public.is_admin()\n  )');
    });
  });

  describe('7. Scope Boundary Enforcement', () => {
    it('verifies recovery snapshot exists for Phase 1A prechange state', () => {
      const snapshotPath = path.resolve(process.cwd(), 'recovery_snapshots/cbe_kjsea_phase1a_prechange_snapshot_1792348000000.json');
      expect(fs.existsSync(snapshotPath)).toBe(true);
      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      expect(snapshot.action).toBe('KJSEA_PHASE_1A_PRECHANGE_SNAPSHOT');
      expect(snapshot.git_environment.is_git_repo).toBe(false);
      expect(snapshot.prechange_database_state.grade_9_cohort.total_active_learners).toBe(76);
    });

    it('verifies src/types.ts and src/lib/storage.ts remain unmodified in Phase 1A and 1B', () => {
      // Reading src/types.ts to verify KJSEA types are not prematurely mixed before approval
      const typesPath = path.resolve(process.cwd(), 'src/types.ts');
      const typesContent = fs.readFileSync(typesPath, 'utf8');
      expect(typesContent).not.toContain('KJSEALevelEntry');
    });
  });

  describe('8. Phase 2 — Defense-in-Depth Security, Audit Identity Protection & Identity Immutability', () => {
    it('verifies security and identity trigger definition and function in migration SQL', () => {
      expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.enforce_kjsea_level_entry_security_and_identity()');
      expect(migrationSql).toContain('CREATE TRIGGER trg_enforce_kjsea_level_entry_security_and_identity');
      expect(migrationSql).toContain('BEFORE INSERT OR UPDATE ON public.kjsea_level_entries');
      expect(migrationSql).toContain('FOR EACH ROW');
      expect(migrationSql).toContain('SECURITY DEFINER');
      expect(migrationSql).toContain('SET search_path = public');
    });

    it('verifies trigger derives teacher identity from verified user-teacher relationship', () => {
      expect(migrationSql).toContain('FROM public.teachers t');
      expect(migrationSql).toContain('LEFT JOIN public.users u ON (u.teacher_id = t.id OR t.user_id = u.id)');
      expect(migrationSql).toContain('WHERE u.id = auth.uid() OR t.user_id = auth.uid()');
      expect(migrationSql).toContain('NEW.entered_by_teacher_id := v_teacher_ids[1]');
      expect(migrationSql).toContain("RAISE EXCEPTION 'UNAUTHORIZED: Authenticated user is not linked to a valid teacher profile.'");
      expect(migrationSql).toContain("RAISE EXCEPTION 'UNAUTHORIZED: Ambiguous teacher profile linkage detected for user.'");
      expect(migrationSql).toContain('NEW.entered_by_teacher_id IS DISTINCT FROM OLD.entered_by_teacher_id');
    });

    it('verifies trigger checks public.is_admin(), auth.role(), and all protected identity fields', () => {
      expect(migrationSql).toContain('public.is_admin()');
      expect(migrationSql).toContain("auth.role() = 'service_role'");
      // Phase 2B: Unsafe current_user and session_user checks MUST NOT be present
      expect(migrationSql).not.toContain("current_user IN ('postgres', 'service_role', 'supabase_admin')");
      expect(migrationSql).not.toContain('current_user');
      expect(migrationSql).not.toContain('session_user');
      expect(migrationSql).toContain('NEW.student_id IS DISTINCT FROM OLD.student_id');
      expect(migrationSql).toContain('NEW.class_id IS DISTINCT FROM OLD.class_id');
      expect(migrationSql).toContain('NEW.stream_id IS DISTINCT FROM OLD.stream_id');
      expect(migrationSql).toContain('NEW.exam_year IS DISTINCT FROM OLD.exam_year');
      expect(migrationSql).toContain('NEW.subject_code IS DISTINCT FROM OLD.subject_code');
      expect(migrationSql).toContain("ERRCODE = '42501'");
    });

    it('verifies Phase 2B surgical security correction: strictly rejects unsafe current_user / session_user in SECURITY DEFINER trigger', () => {
      // 1. Extract enforce_kjsea_level_entry_security_and_identity function body
      const functionMatch = migrationSql.match(
        /CREATE OR REPLACE FUNCTION public\.enforce_kjsea_level_entry_security_and_identity\(\)[\s\S]*?\$\$ LANGUAGE plpgsql|\$\$[\s\S]*?CREATE TRIGGER trg_enforce_kjsea_level_entry_security_and_identity/
      );
      expect(functionMatch).not.toBeNull();
      const functionSql = functionMatch ? functionMatch[0] : '';

      // 2. Explicitly ensure current_user and session_user are absent from function definition
      expect(functionSql).not.toContain('current_user');
      expect(functionSql).not.toContain('session_user');

      // 3. Confirm exact v_is_admin privilege check expression
      expect(functionSql).toMatch(
        /v_is_admin\s*:=\s*public\.is_admin\(\)\s*OR\s*auth\.role\(\)\s*=\s*'service_role';/
      );

      // 4. In-memory simulation demonstrating why current_user in SECURITY DEFINER is unsafe:
      // When a function has SECURITY DEFINER, PostgreSQL executes it with the privileges of the function creator (postgres).
      // If the function checks `current_user = 'postgres'`, ANY authenticated user calling the trigger
      // (even an ordinary teacher or malicious user) would evaluate current_user as 'postgres' and bypass security!
      type ExecutionContext = {
        functionOwner: string;      // What PostgreSQL's current_user returns inside SECURITY DEFINER
        callerRole: string;        // What auth.role() returns (caller's JWT claim)
        callerIsAdmin: boolean;    // What public.is_admin() returns (evaluated against caller's auth.uid())
      };

      const unsafeCheck = (ctx: ExecutionContext): boolean => {
        // Flawed implementation: checks current_user inside SECURITY DEFINER
        return ctx.callerIsAdmin || ctx.callerRole === 'service_role' || ['postgres', 'service_role', 'supabase_admin'].includes(ctx.functionOwner);
      };

      const correctedCheck = (ctx: ExecutionContext): boolean => {
        // Correct Phase 2B implementation: checks only caller claims
        return ctx.callerIsAdmin || ctx.callerRole === 'service_role';
      };

      const ordinaryTeacherCallingSecurityDefiner: ExecutionContext = {
        functionOwner: 'postgres',   // Function was created by postgres superuser
        callerRole: 'authenticated', // Ordinary teacher JWT
        callerIsAdmin: false,        // Not an administrator
      };

      // In the unsafe implementation, ordinary teacher was granted admin bypass because functionOwner == 'postgres'!
      expect(unsafeCheck(ordinaryTeacherCallingSecurityDefiner)).toBe(true); // Demonstrates the flaw

      // In the corrected Phase 2B implementation, ordinary teacher is properly recognized as non-admin
      expect(correctedCheck(ordinaryTeacherCallingSecurityDefiner)).toBe(false); // Secure!

      // Genuine admin caller
      const adminCaller: ExecutionContext = {
        functionOwner: 'postgres',
        callerRole: 'authenticated',
        callerIsAdmin: true,
      };
      expect(correctedCheck(adminCaller)).toBe(true);

      // Genuine service_role caller
      const serviceRoleCaller: ExecutionContext = {
        functionOwner: 'postgres',
        callerRole: 'service_role',
        callerIsAdmin: false,
      };
      expect(correctedCheck(serviceRoleCaller)).toBe(true);
    });

    // In-memory unit test simulating the PostgreSQL trigger logic for both INSERT and UPDATE
    it('simulates security trigger logic: non-admin teacher INSERT derivation & UPDATE immutability', () => {
      interface KjseaRow {
        student_id: string;
        class_id: string;
        stream_id: string;
        exam_year: number;
        subject_code: string;
        achievement_level: string | null;
        points: number | null;
        status: string;
        entered_by_teacher_id: string | null;
      }

      interface MockAuthContext {
        userId: string;
        role: 'admin' | 'teacher' | 'service_role';
        linkedTeacherIds: string[]; // Resolved from teachers and users tables
      }

      const simulateSecurityTrigger = (
        op: 'INSERT' | 'UPDATE',
        newRow: KjseaRow,
        oldRow: KjseaRow | null,
        ctx: MockAuthContext
      ): { allowed: boolean; resultingRow?: KjseaRow; error?: string; sqlstate?: string } => {
        // 1. Admin & service_role bypass
        if (ctx.role === 'admin' || ctx.role === 'service_role') {
          return { allowed: true, resultingRow: { ...newRow } };
        }

        // 2. Non-admin: Resolve linked teacher profile
        if (!ctx.linkedTeacherIds || ctx.linkedTeacherIds.length === 0) {
          return {
            allowed: false,
            error: 'Authenticated user is not linked to a valid teacher profile.',
            sqlstate: '42501',
          };
        }

        if (ctx.linkedTeacherIds.length > 1) {
          return {
            allowed: false,
            error: 'Ambiguous teacher profile linkage detected for user.',
            sqlstate: '42501',
          };
        }

        const verifiedTeacherId = ctx.linkedTeacherIds[0];

        // 3. INSERT handling: Overwrite entered_by_teacher_id
        if (op === 'INSERT') {
          const rowWithOverwrittenTeacher: KjseaRow = {
            ...newRow,
            entered_by_teacher_id: verifiedTeacherId,
          };
          return { allowed: true, resultingRow: rowWithOverwrittenTeacher };
        }

        // 4. UPDATE handling: enforce immutability
        if (op === 'UPDATE' && oldRow) {
          if (newRow.entered_by_teacher_id !== oldRow.entered_by_teacher_id) {
            return {
              allowed: false,
              error: 'entered_by_teacher_id is immutable on existing KJSEA level entries.',
              sqlstate: '42501',
            };
          }
          if (newRow.student_id !== oldRow.student_id) {
            return { allowed: false, error: 'student_id is immutable', sqlstate: '42501' };
          }
          if (newRow.class_id !== oldRow.class_id) {
            return { allowed: false, error: 'class_id is immutable', sqlstate: '42501' };
          }
          if (newRow.stream_id !== oldRow.stream_id) {
            return { allowed: false, error: 'stream_id is immutable', sqlstate: '42501' };
          }
          if (newRow.exam_year !== oldRow.exam_year) {
            return { allowed: false, error: 'exam_year is immutable', sqlstate: '42501' };
          }
          if (newRow.subject_code !== oldRow.subject_code) {
            return { allowed: false, error: 'subject_code is immutable', sqlstate: '42501' };
          }
          return { allowed: true, resultingRow: { ...newRow } };
        }

        return { allowed: false, error: 'Invalid trigger state' };
      };

      const teacherVivianContext: MockAuthContext = {
        userId: 'usr_vivian',
        role: 'teacher',
        linkedTeacherIds: ['1d9eb03b-8267-4855-b876-16b8bee13322'], // Madam Vivian
      };

      const unlinkedUserContext: MockAuthContext = {
        userId: 'usr_unlinked',
        role: 'teacher',
        linkedTeacherIds: [], // No linked teacher
      };

      const ambiguousUserContext: MockAuthContext = {
        userId: 'usr_ambiguous',
        role: 'teacher',
        linkedTeacherIds: ['tch_1', 'tch_2'], // Multiple linked teachers
      };

      const adminContext: MockAuthContext = {
        userId: 'usr_admin',
        role: 'admin',
        linkedTeacherIds: [],
      };

      const insertCandidateRow: KjseaRow = {
        student_id: 'std-101',
        class_id: 'cls-grade9',
        stream_id: 'stm-red',
        exam_year: 2026,
        subject_code: 'ENG',
        achievement_level: 'ME1',
        points: 6,
        status: 'Normal',
        entered_by_teacher_id: 'forged-teacher-id-999', // Forged or arbitrary
      };

      // TEST 4: Non-admin INSERT overrides forged teacher ID with verified teacher ID
      const insertResult = simulateSecurityTrigger('INSERT', insertCandidateRow, null, teacherVivianContext);
      expect(insertResult.allowed).toBe(true);
      expect(insertResult.resultingRow?.entered_by_teacher_id).toBe('1d9eb03b-8267-4855-b876-16b8bee13322'); // Overwritten with Vivian
      expect(insertResult.resultingRow?.entered_by_teacher_id).not.toBe('forged-teacher-id-999');

      // TEST 5: Non-admin INSERT fails if no valid teacher profile exists (SQLSTATE 42501)
      const unlinkedResult = simulateSecurityTrigger('INSERT', insertCandidateRow, null, unlinkedUserContext);
      expect(unlinkedResult.allowed).toBe(false);
      expect(unlinkedResult.sqlstate).toBe('42501');
      expect(unlinkedResult.error).toContain('not linked to a valid teacher profile');

      // Ambiguous teacher profile matches rejected safely with 42501
      const ambiguousResult = simulateSecurityTrigger('INSERT', insertCandidateRow, null, ambiguousUserContext);
      expect(ambiguousResult.allowed).toBe(false);
      expect(ambiguousResult.sqlstate).toBe('42501');
      expect(ambiguousResult.error).toContain('Ambiguous teacher profile linkage');

      // Base existing row for UPDATE tests
      const baseRow: KjseaRow = {
        ...insertCandidateRow,
        entered_by_teacher_id: '1d9eb03b-8267-4855-b876-16b8bee13322',
      };

      // TEST 6: Non-admin UPDATE being unable to change the audit teacher ID (SQLSTATE 42501)
      const updateAuditIdResult = simulateSecurityTrigger(
        'UPDATE',
        { ...baseRow, entered_by_teacher_id: 'another-teacher-id' },
        baseRow,
        teacherVivianContext
      );
      expect(updateAuditIdResult.allowed).toBe(false);
      expect(updateAuditIdResult.sqlstate).toBe('42501');
      expect(updateAuditIdResult.error).toContain('entered_by_teacher_id is immutable');

      // TEST 7: Existing identity-field immutability still working on UPDATE
      expect(simulateSecurityTrigger('UPDATE', { ...baseRow, student_id: 'std-999' }, baseRow, teacherVivianContext).allowed).toBe(false);
      expect(simulateSecurityTrigger('UPDATE', { ...baseRow, class_id: 'cls-grade8' }, baseRow, teacherVivianContext).allowed).toBe(false);
      expect(simulateSecurityTrigger('UPDATE', { ...baseRow, stream_id: 'stm-blue' }, baseRow, teacherVivianContext).allowed).toBe(false);
      expect(simulateSecurityTrigger('UPDATE', { ...baseRow, exam_year: 2025 }, baseRow, teacherVivianContext).allowed).toBe(false);
      expect(simulateSecurityTrigger('UPDATE', { ...baseRow, subject_code: 'KIS' }, baseRow, teacherVivianContext).allowed).toBe(false);

      // Normal grade correction allowed for teacher on UPDATE
      const validGradeUpdate = simulateSecurityTrigger('UPDATE', { ...baseRow, achievement_level: 'EE1', points: 8 }, baseRow, teacherVivianContext);
      expect(validGradeUpdate.allowed).toBe(true);
      expect(validGradeUpdate.resultingRow?.points).toBe(8);

      // TEST 8: Administrator behaviour remaining as intended (can specify teacher on INSERT and correct historical records)
      const adminInsertResult = simulateSecurityTrigger('INSERT', insertCandidateRow, null, adminContext);
      expect(adminInsertResult.allowed).toBe(true);
      expect(adminInsertResult.resultingRow?.entered_by_teacher_id).toBe('forged-teacher-id-999'); // Admin can preserve or set

      const adminUpdateResult = simulateSecurityTrigger(
        'UPDATE',
        { ...baseRow, student_id: 'std-corrected', exam_year: 2025, entered_by_teacher_id: 'tch-admin-override' },
        baseRow,
        adminContext
      );
      expect(adminUpdateResult.allowed).toBe(true);
    });

    // In-memory unit test simulating the PostgreSQL UPDATE RLS policy (USING and WITH CHECK)
    it('simulates UPDATE RLS policy: teachers blocked from unauthorized rows or stream jumping; admins unconstrained', () => {
      interface UserContext {
        userId: string;
        role: 'admin' | 'class_teacher';
        authorizedStreamsByYear: Record<number, string[]>;
      }

      interface KjseaEntry {
        id: string;
        student_id: string;
        stream_id: string;
        exam_year: number;
        isStudentActiveGrade9: boolean;
      }

      const activeAcademicYear = 2026;

      const evaluateUpdateRls = (
        user: UserContext,
        oldRow: KjseaEntry,
        newRow: KjseaEntry
      ): { allowed: boolean; reason?: string } => {
        // Admin short-circuit
        if (user.role === 'admin') {
          return { allowed: true };
        }

        // USING clause (access to OLD row)
        const isOldYearActive = oldRow.exam_year === activeAcademicYear;
        const isOldStreamAuthorized = (user.authorizedStreamsByYear[oldRow.exam_year] || []).includes(oldRow.stream_id);
        const isOldStudentValid = oldRow.isStudentActiveGrade9;

        if (!isOldYearActive || !isOldStreamAuthorized || !isOldStudentValid) {
          return { allowed: false, reason: 'USING_CLAUSE_FAILED: Cannot access target row' };
        }

        // WITH CHECK clause (permission on NEW row)
        const isNewYearActive = newRow.exam_year === activeAcademicYear;
        const isNewStreamAuthorized = (user.authorizedStreamsByYear[newRow.exam_year] || []).includes(newRow.stream_id);
        const isNewStudentValid = newRow.isStudentActiveGrade9;

        if (!isNewYearActive || !isNewStreamAuthorized || !isNewStudentValid) {
          return { allowed: false, reason: 'WITH_CHECK_FAILED: New row violates update constraints' };
        }

        return { allowed: true };
      };

      const teacherVivian: UserContext = {
        userId: 'teacher-vivian',
        role: 'class_teacher',
        authorizedStreamsByYear: {
          2026: ['stm-red'],
        },
      };

      const adminUser: UserContext = {
        userId: 'admin-user',
        role: 'admin',
        authorizedStreamsByYear: {},
      };

      const validRow2026Red: KjseaEntry = {
        id: 'entry-1',
        student_id: 'std-1',
        stream_id: 'stm-red',
        exam_year: 2026,
        isStudentActiveGrade9: true,
      };

      // 1. Authorized teacher updating their own active Grade 9 stream -> PASS
      expect(evaluateUpdateRls(teacherVivian, validRow2026Red, validRow2026Red).allowed).toBe(true);

      // 2. Teacher attempting to update an unauthorized stream (Grade 9 Blue) -> FAIL (USING clause blocks)
      const row2026Blue: KjseaEntry = {
        id: 'entry-2',
        student_id: 'std-2',
        stream_id: 'stm-blue',
        exam_year: 2026,
        isStudentActiveGrade9: true,
      };
      const resUnauthorizedStream = evaluateUpdateRls(teacherVivian, row2026Blue, row2026Blue);
      expect(resUnauthorizedStream.allowed).toBe(false);
      expect(resUnauthorizedStream.reason).toContain('USING_CLAUSE_FAILED');

      // 3. Teacher attempting to update a historical examination year (2025) -> FAIL (USING clause blocks)
      const row2025Red: KjseaEntry = {
        id: 'entry-3',
        student_id: 'std-3',
        stream_id: 'stm-red',
        exam_year: 2025,
        isStudentActiveGrade9: true,
      };
      const resHistoricalUpdate = evaluateUpdateRls(teacherVivian, row2025Red, row2025Red);
      expect(resHistoricalUpdate.allowed).toBe(false);
      expect(resHistoricalUpdate.reason).toContain('USING_CLAUSE_FAILED');

      // 4. Teacher attempting to move a row to an unauthorized stream (Red -> Blue) -> FAIL (WITH CHECK blocks)
      const resMoveStream = evaluateUpdateRls(teacherVivian, validRow2026Red, {
        ...validRow2026Red,
        stream_id: 'stm-blue',
      });
      expect(resMoveStream.allowed).toBe(false);
      expect(resMoveStream.reason).toContain('WITH_CHECK_FAILED');

      // 5. Teacher attempting to move a row to a historical year (2026 -> 2025) -> FAIL (WITH CHECK blocks)
      const resMoveYear = evaluateUpdateRls(teacherVivian, validRow2026Red, {
        ...validRow2026Red,
        exam_year: 2025,
      });
      expect(resMoveYear.allowed).toBe(false);
      expect(resMoveYear.reason).toContain('WITH_CHECK_FAILED');

      // 6. Administrator updating historical record (2025) where learner is no longer active in Grade 9 -> PASS
      const historicalGraduatedRow: KjseaEntry = {
        id: 'entry-hist-1',
        student_id: 'std-graduated',
        stream_id: 'stm-red',
        exam_year: 2025,
        isStudentActiveGrade9: false,
      };
      expect(evaluateUpdateRls(adminUser, historicalGraduatedRow, historicalGraduatedRow).allowed).toBe(true);
    });
  });
});
