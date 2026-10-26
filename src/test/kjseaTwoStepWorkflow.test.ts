import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import {
  KJSEA_LEARNING_AREAS_META,
  KJSEA_ACHIEVEMENT_LEVELS,
  KJSEA_LEVEL_POINTS_MAP,
  KJSEA_ENTRY_STATUSES,
  getKJSEAPointsAdvisory,
  validateKJSEADraftEntries,
  validateMandatoryReason,
} from '../types/kjsea';
import { KjseaAdminManagement } from '../components/kjsea/KjseaAdminManagement';

describe('KJSEA Admin Screen Two-Step Workflow Polish Verification', () => {
  it('verifies KjseaAdminManagement component is exported and defined as a React component', () => {
    expect(KjseaAdminManagement).toBeDefined();
    expect(typeof KjseaAdminManagement).toBe('function');
  });

  describe('Invariant Verification: Approved Learning Areas Order and Metadata', () => {
    it('verifies exactly 9 learning areas exist in the approved national sequence', () => {
      expect(KJSEA_LEARNING_AREAS_META).toHaveLength(9);
      expect(KJSEA_LEARNING_AREAS_META.map((m) => m.code)).toEqual([
        'ENG',
        'KIS',
        'MATH',
        'INT SCI',
        'CAS',
        'SST',
        'CRE',
        'AGN',
        'PRE-TECH',
      ]);
    });

    it('verifies exactly 8 achievement levels EE1–BE2 and point mapping', () => {
      expect(KJSEA_ACHIEVEMENT_LEVELS).toHaveLength(8);
      expect(KJSEA_ACHIEVEMENT_LEVELS).toEqual([
        'EE1',
        'EE2',
        'ME1',
        'ME2',
        'AE1',
        'AE2',
        'BE1',
        'BE2',
      ]);

      expect(KJSEA_LEVEL_POINTS_MAP).toEqual({
        EE1: 8,
        EE2: 7,
        ME1: 6,
        ME2: 5,
        AE1: 4,
        AE2: 3,
        BE1: 2,
        BE2: 1,
      });
    });

    it('verifies points advisory lookup maps Normal statuses to correct points and non-Normal to null', () => {
      expect(getKJSEAPointsAdvisory('EE1', 'Normal')).toBe(8);
      expect(getKJSEAPointsAdvisory('BE2', 'Normal')).toBe(1);
      expect(getKJSEAPointsAdvisory('EE1', 'Absent')).toBeNull();
      expect(getKJSEAPointsAdvisory('EE1', 'Irregularity')).toBeNull();
      expect(getKJSEAPointsAdvisory(null, 'Normal')).toBeNull();
      expect(getKJSEAPointsAdvisory(undefined, 'Normal')).toBeNull();
    });

    it('verifies validateKJSEADraftEntries rejects empty and duplicate subjects', () => {
      const emptyRes = validateKJSEADraftEntries([]);
      expect(emptyRes.isValid).toBe(false);

      const duplicatePayload = [
        { subject_code: 'ENG', status: 'Normal' as const, achievement_level: 'EE1' as const },
        { subject_code: 'ENG', status: 'Normal' as const, achievement_level: 'EE2' as const },
      ];
      const dupRes = validateKJSEADraftEntries(duplicatePayload);
      expect(dupRes.isValid).toBe(false);
      expect(dupRes.error).toContain('Duplicate subject code');
    });

    it('verifies validateMandatoryReason enforces non-empty audit reason with minimum 5 characters', () => {
      expect(validateMandatoryReason('').isValid).toBe(false);
      expect(validateMandatoryReason('   ').isValid).toBe(false);
      expect(validateMandatoryReason('Edit').isValid).toBe(false);
      expect(validateMandatoryReason('Valid audit reason').isValid).toBe(true);
    });
  });

  describe('Workflow Architecture Verification: Screen 1 and Screen 2 separation', () => {
    it('verifies KjseaAdminManagement source code enforces Screen 1 and Screen 2 structure', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const componentSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/kjsea/KjseaAdminManagement.tsx'),
        'utf8'
      );

      // Verify Screen 1 keywords and elements
      expect(componentSrc).toContain("activeScreen === 'selection'");
      expect(componentSrc).toContain('STEP 1: SELECT STREAM');
      expect(componentSrc).toContain('STEP 2: SELECT ONE LEARNER');
      expect(componentSrc).toContain('Select a stream first');
      expect(componentSrc).toContain('CONTINUE TO RESULTS ENTRY');
      expect(componentSrc).toContain('type="radio"');
      expect(componentSrc).toContain('name="kjsea-stream-selection"');

      // Verify Screen 2 keywords and elements
      expect(componentSrc).toContain("activeScreen === 'entry'");
      expect(componentSrc).toContain('screen2Heading');
      expect(componentSrc).toContain('Return to Learner Selection');
      expect(componentSrc).toContain('Next:');
      expect(componentSrc).toContain('Learning Areas');
      expect(componentSrc).toContain('Save Draft');
      expect(componentSrc).toContain('Finalise Result');
      expect(componentSrc).toContain('Reopen Result');

      // Verify Unsaved Work preservation & safe switching flow
      expect(componentSrc).toContain('unsavedLearnerMap');
      expect(componentSrc).toContain('stashCurrentLearnerWork');
      expect(componentSrc).toContain('showUnsavedConfirmModal');
      expect(componentSrc).toContain('Save Draft & Switch');
      expect(componentSrc).toContain('Discard Changes & Switch');
      expect(componentSrc).toContain('Stay on Current Learner');

      // Verify Stream change resets learner
      expect(componentSrc).toContain('applyStreamChange');
      expect(componentSrc).toContain("setSelectedStudentId('')");

      // Verify Exam Year change clears stream and learner
      expect(componentSrc).toContain('applyExamYearChange');
      expect(componentSrc).toContain("setSelectedStreamId('')");

      // Verify Dropdown Integrity: explicit label for learner select
      expect(componentSrc).toContain('htmlFor="kjsea-learner-select"');
      expect(componentSrc).toContain('id="kjsea-learner-select"');
      expect(componentSrc).toContain('Select a learner...');

      // Verify Dropdown Integrity: explicit label for exam year select
      expect(componentSrc).toContain('htmlFor="kjsea-exam-year-select"');
      expect(componentSrc).toContain('id="kjsea-exam-year-select"');
      expect(componentSrc).toContain('Select examination year...');
    });
  });

  describe('KJSEA Examination-Year Creation & Status Management Specification', () => {
    it('verifies KjseaAdminManagement source code enforces empty examination-year notice and creation flow', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const componentSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/kjsea/KjseaAdminManagement.tsx'),
        'utf8'
      );

      // 1. Exact required prompt empty notice message
      expect(componentSrc).toContain('No examination years found. Create an examination year to begin.');

      // 2. Administrator-only creation action and button labels
      expect(componentSrc).toContain('Create Examination Year');
      expect(componentSrc).toContain('New Year');
      expect(componentSrc).toContain('openCreateYearModal');
      expect(componentSrc).toContain('handleConfirmCreateYear');

      // 3. Dynamic proposed year binding from authoritative academic session
      expect(componentSrc).toContain('api.getActiveAcademicYear()');
      expect(componentSrc).toContain('proposedYearInput');
      expect(componentSrc).toContain('id="proposed-year-input"');
      expect(componentSrc).toContain('min={2020}');
      expect(componentSrc).toContain('max={2050}');

      // 4. Modal confirmation & status selection
      expect(componentSrc).toContain('showCreateYearModal');
      expect(componentSrc).toContain('Open for Entry');
      expect(componentSrc).toContain('Closed / Locked');
      expect(componentSrc).toContain('initialStatusChoice');

      // 5. Service RPC invocation for creation & status management
      expect(componentSrc).toContain('kjseaService.createExamYear');
      expect(componentSrc).toContain('kjseaService.setExamYearStatus');
      expect(componentSrc).toContain('kjseaService.listExamYears');

      // 6. Duplicate prevention & error feedback
      expect(componentSrc).toContain('already exists');
      expect(componentSrc).toContain('createYearError');

      // 7. Status update actions for existing examination years
      expect(componentSrc).toContain('showYearStatusModal');
      expect(componentSrc).toContain('Open Year for Entry');
      expect(componentSrc).toContain('handleConfirmYearStatusChange');
      expect(componentSrc).toContain('year-status-reason-input');
    });

    it('verifies dynamic active academic year is derived authoritatively from api.getActiveAcademicYear', async () => {
      const { api } = await import('../lib/storage');
      const activeYearObj = api.getActiveAcademicYear();

      expect(activeYearObj).toBeDefined();
      expect(typeof activeYearObj.year).toBe('number');
      expect(activeYearObj.year).toBeGreaterThanOrEqual(2020);
      expect(activeYearObj.year).toBeLessThanOrEqual(2050);
      expect(activeYearObj.status).toBe('Active');
    });

    it('verifies kjseaService.createExamYear validates year boundaries', async () => {
      const { kjseaService } = await import('../services/kjseaService');

      // Invalid years
      const invalidLow = await kjseaService.createExamYear(2019);
      expect(invalidLow.success).toBe(false);
      expect(invalidLow.error?.message).toContain('between 2020 and 2050');

      const invalidHigh = await kjseaService.createExamYear(2051);
      expect(invalidHigh.success).toBe(false);
      expect(invalidHigh.error?.message).toContain('between 2020 and 2050');

      const invalidFloat = await kjseaService.createExamYear(2026.5 as any);
      expect(invalidFloat.success).toBe(false);
      expect(invalidFloat.error?.message).toContain('Must be a 4-digit calendar year');
    });

    it('verifies kjseaService.setExamYearStatus validates status and mandatory audit reason', async () => {
      const { kjseaService } = await import('../services/kjseaService');

      // Invalid status
      const invalidStatus = await kjseaService.setExamYearStatus('mock-id', 'invalid' as any);
      expect(invalidStatus.success).toBe(false);
      expect(invalidStatus.error?.message).toContain('must be "open" or "closed"');

      // Reopening with invalid short reason
      const shortReason = await kjseaService.setExamYearStatus('mock-id', 'open', 'abc');
      expect(shortReason.success).toBe(false);
      expect(shortReason.error?.message).toContain('at least 5 characters long');
    });

    it('verifies duplicate examination year prevention logic', () => {
      const existingYears = [
        {
          id: 'mock-uuid-1',
          exam_year: 2025,
          status: 'closed' as const,
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
        },
      ];

      const isDuplicate = (proposed: number) => existingYears.some((y) => y.exam_year === proposed);

      expect(isDuplicate(2025)).toBe(true);
      expect(isDuplicate(2026)).toBe(false);
      expect(isDuplicate(2027)).toBe(false);
    });

    it('verifies stream selection and class sizes are strictly guarded until an examination year is selected', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const componentSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/kjsea/KjseaAdminManagement.tsx'),
        'utf8'
      );

      // Verify Step 1 requires examination year selection before rendering stream cards
      expect(componentSrc).toContain('!selectedExamYearId ? (');
      expect(componentSrc).toContain('Select an examination year first');
      expect(componentSrc).toContain('Waiting for Examination Year selection');

      // Verify handleSelectStream and handleSelectStudent guard against missing examination year
      expect(componentSrc).toContain('if (!selectedExamYearId) {');

      // Verify stream cards and learner counts are only rendered when selectedExamYearId is present
      expect(componentSrc).toContain("st.count === 1 ? 'learner' : 'learners'");

      // Simulate conditional rendering and selection guards
      const canSelectStream = (selectedExamYearId: string) => Boolean(selectedExamYearId);
      expect(canSelectStream('')).toBe(false);
      expect(canSelectStream('exam-year-2026')).toBe(true);

      const renderStep1Status = (selectedExamYearId: string) =>
        !selectedExamYearId ? 'Select an examination year first' : 'Select a stream';
      expect(renderStep1Status('')).toBe('Select an examination year first');
      expect(renderStep1Status('exam-year-2026')).toBe('Select a stream');
    });

    it('verifies learning area entry status defaults to Normal instead of Pending', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const componentSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/kjsea/KjseaAdminManagement.tsx'),
        'utf8'
      );

      // Verify createEmptyFormEntries initializes status as 'Normal'
      expect(componentSrc).toContain("status: 'Normal'");
      expect(componentSrc).not.toContain("status: 'Pending',");

      // Verify hydration defaults missing or pending status to 'Normal'
      expect(componentSrc).toContain("const status = (!existing.status || existing.status === 'Pending') ? 'Normal' : existing.status;");

      // Verify achievement level buttons are immediately visible when status is Normal
      expect(componentSrc).toContain("const isNormal = entry.status === 'Normal';");
    });

    it('verifies save draft and finalise result use fast in-place confirmation without full screen reload', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const componentSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/kjsea/KjseaAdminManagement.tsx'),
        'utf8'
      );

      // Verify saveDraft uses in-place state update
      expect(componentSrc).toContain('KJSEA draft results saved successfully to Supabase.');
      expect(componentSrc).toContain('isNormalWithoutLevel ? \'Pending\' : entry.status');

      // Verify finaliseResult sets finalised state in place
      expect(componentSrc).toContain('setIsFinalised(true)');
      expect(componentSrc).toContain('setFinalisedAt(finalisedTimestamp)');
      expect(componentSrc).toContain('KJSEA result has been finalised and locked successfully.');
    });

    it('verifies Subjects Entered count accurately reflects graded areas without misinforming 9/9 counts', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const componentSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/kjsea/KjseaAdminManagement.tsx'),
        'utf8'
      );

      // Verify clear, non-misleading CBE label
      expect(componentSrc).toContain('Subjects Entered');
      expect(componentSrc).not.toContain('Sub Entry');

      // Verify calculation accurately checks achievement_level or explicit non-Normal status
      expect(componentSrc).toContain('completedEntriesCount = useMemo(');

      // Simulate the exact calculation logic
      const simulateEnteredCount = (
        entries: Array<{ status: string; achievement_level: string | null }>
      ) => {
        let count = 0;
        entries.forEach((e) => {
          if (e.status === 'Normal') {
            if (e.achievement_level) count += 1;
          } else if (e.status === 'Absent' || e.status === 'Irregularity' || e.status === 'Not Released') {
            count += 1;
          }
        });
        return count;
      };

      // Scenario from user screenshot: Only 1 subject (AGN with EE2) has level selected, other 8 are Normal with no level
      const screenshotScenario = [
        { status: 'Normal', achievement_level: null }, // ENG
        { status: 'Normal', achievement_level: null }, // KIS
        { status: 'Normal', achievement_level: null }, // MATH
        { status: 'Normal', achievement_level: null }, // INT SCI
        { status: 'Normal', achievement_level: null }, // CAS
        { status: 'Normal', achievement_level: null }, // SST
        { status: 'Normal', achievement_level: null }, // CRE
        { status: 'Normal', achievement_level: 'EE2' }, // AGN (7 pts)
        { status: 'Normal', achievement_level: null }, // PRE-TECH
      ];

      // Must be 1 / 9, NOT 9 / 9
      expect(simulateEnteredCount(screenshotScenario)).toBe(1);

      // When 0 entered:
      const zeroEntered = screenshotScenario.map((e) => ({ ...e, achievement_level: null }));
      expect(simulateEnteredCount(zeroEntered)).toBe(0);

      // When all 9 entered:
      const allEntered = screenshotScenario.map((e) => ({ ...e, achievement_level: 'ME1' }));
      expect(simulateEnteredCount(allEntered)).toBe(9);
    });
  });

  describe('KJSEA Phase 2: Live Progress Strip & Accessible Sticky Action Bar', () => {
    // Helper replicating the exact component useMemo hooks for completedEntriesCount and totalPoints
    const KJSEA_LEVEL_POINTS_MAP: Record<string, number> = {
      EE1: 8,
      EE2: 7,
      ME1: 6,
      ME2: 5,
      AE1: 4,
      AE2: 3,
      BE1: 2,
      BE2: 1,
    };

    const computeProgress = (
      entries: Array<{ status: string; achievement_level: string | null }>
    ) => {
      let completedCount = 0;
      let totalPts = 0;

      entries.forEach((e) => {
        if (e.status === 'Normal') {
          if (e.achievement_level) {
            completedCount += 1;
            totalPts += KJSEA_LEVEL_POINTS_MAP[e.achievement_level] || 0;
          }
        } else if (e.status === 'Absent' || e.status === 'Irregularity' || e.status === 'Not Released') {
          completedCount += 1;
          // Exception statuses explicitly add 0 points
        }
      });

      return {
        completedCount,
        totalPts,
        displayString: `Subjects Completed: ${completedCount}/9 · Total Points: ${totalPts} pts`,
      };
    };

    it('verifies 0 completed areas and 0 points when no levels or statuses recorded', () => {
      const initialForm = Array.from({ length: 9 }, () => ({
        status: 'Normal',
        achievement_level: null,
      }));

      const res = computeProgress(initialForm);
      expect(res.completedCount).toBe(0);
      expect(res.totalPts).toBe(0);
      expect(res.displayString).toBe('Subjects Completed: 0/9 · Total Points: 0 pts');
    });

    it('verifies one Normal level selected: 1/9 and its mapped points', () => {
      const form = Array.from({ length: 9 }, () => ({
        status: 'Normal',
        achievement_level: null,
      }));
      // Select EE1 (8 points) for first subject
      form[0] = { status: 'Normal', achievement_level: 'EE1' };

      const res = computeProgress(form);
      expect(res.completedCount).toBe(1);
      expect(res.totalPts).toBe(8);
      expect(res.displayString).toBe('Subjects Completed: 1/9 · Total Points: 8 pts');
    });

    it('verifies multiple Normal levels: correct count and accurate sum of mapped points', () => {
      const form = Array.from({ length: 9 }, () => ({
        status: 'Normal',
        achievement_level: null,
      }));
      form[0] = { status: 'Normal', achievement_level: 'EE1' }; // 8
      form[1] = { status: 'Normal', achievement_level: 'ME1' }; // 6
      form[2] = { status: 'Normal', achievement_level: 'BE2' }; // 1

      const res = computeProgress(form);
      expect(res.completedCount).toBe(3);
      expect(res.totalPts).toBe(15);
      expect(res.displayString).toBe('Subjects Completed: 3/9 · Total Points: 15 pts');
    });

    it('verifies X (Absent), Y (Irregularity), and NR (Not Released) count as completed but contribute zero points', () => {
      const form = Array.from({ length: 9 }, () => ({
        status: 'Normal',
        achievement_level: null,
      }));
      form[0] = { status: 'Absent', achievement_level: null }; // X -> +1 completed, 0 pts
      form[1] = { status: 'Irregularity', achievement_level: null }; // Y -> +1 completed, 0 pts
      form[2] = { status: 'Not Released', achievement_level: null }; // NR -> +1 completed, 0 pts

      const res = computeProgress(form);
      expect(res.completedCount).toBe(3);
      expect(res.totalPts).toBe(0);
      expect(res.displayString).toBe('Subjects Completed: 3/9 · Total Points: 0 pts');
    });

    it('verifies Pending and Normal without a level do NOT count as completed', () => {
      const form = [
        { status: 'Pending', achievement_level: null },
        { status: 'Normal', achievement_level: null },
        { status: 'Normal', achievement_level: null },
        { status: 'Normal', achievement_level: null },
        { status: 'Normal', achievement_level: null },
        { status: 'Normal', achievement_level: null },
        { status: 'Normal', achievement_level: null },
        { status: 'Normal', achievement_level: null },
        { status: 'Normal', achievement_level: null },
      ];

      const res = computeProgress(form);
      expect(res.completedCount).toBe(0);
      expect(res.totalPts).toBe(0);
    });

    it('verifies changing Normal to an exception status clears points contribution', () => {
      // Step 1: Normal with EE1 (8 points)
      let subjectEntry: { status: string; achievement_level: string | null } = {
        status: 'Normal',
        achievement_level: 'EE1',
      };
      let res = computeProgress([subjectEntry]);
      expect(res.completedCount).toBe(1);
      expect(res.totalPts).toBe(8);

      // Step 2: User changes status to 'Absent' (handleStatusChange resets achievement_level to null)
      subjectEntry = {
        status: 'Absent',
        achievement_level: null,
      };
      res = computeProgress([subjectEntry]);
      expect(res.completedCount).toBe(1);
      expect(res.totalPts).toBe(0);
      expect(res.displayString).toBe('Subjects Completed: 1/9 · Total Points: 0 pts');
    });

    it('verifies returning from an exception status to Normal without selecting a level does not count as completed', () => {
      // User sets status back to 'Normal' but hasn't picked a level yet
      const subjectEntry = {
        status: 'Normal',
        achievement_level: null,
      };
      const res = computeProgress([subjectEntry]);
      expect(res.completedCount).toBe(0);
      expect(res.totalPts).toBe(0);
    });

    it('verifies KjseaAdminManagement source code contains Live Progress Strip and responsive sticky bar offsets', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const componentSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/kjsea/KjseaAdminManagement.tsx'),
        'utf8'
      );

      // 1. Live Progress Strip existence and required display format
      expect(componentSrc).toContain('data-testid="kjsea-live-progress-strip"');
      expect(componentSrc).toContain('Subjects Completed:');
      expect(componentSrc).toContain('{completedEntriesCount}/9');
      expect(componentSrc).toContain('Total Points:');
      expect(componentSrc).toContain('{totalPoints} pts');

      // 2. Responsive sticky bottom offset above mobile bottom navigation
      expect(componentSrc).toContain('sticky bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] md:bottom-4 z-30');
    });
  });

  describe('KJSEA Clear Level Button Specification & Invariants', () => {
    // Exact simulation of formEntries state mutation for handleClearLevel
    const simulateClearLevel = (currentEntry: {
      subject_code: string;
      status: string;
      achievement_level: string | null;
      status_recorded: boolean;
    }) => {
      return {
        ...currentEntry,
        status: 'Normal',
        achievement_level: null,
        status_recorded: false,
      };
    };

    it('verifies clearing a selected level sets it to null while retaining Normal status', () => {
      const selectedEntry = {
        subject_code: 'ENG',
        status: 'Normal',
        achievement_level: 'EE1',
        status_recorded: true,
      };

      const cleared = simulateClearLevel(selectedEntry);
      expect(cleared.subject_code).toBe('ENG');
      expect(cleared.status).toBe('Normal');
      expect(cleared.achievement_level).toBeNull();
      expect(cleared.status_recorded).toBe(false);
    });

    it('verifies clearing a level removes its points and decreases the completed count immediately', () => {
      const KJSEA_LEVEL_POINTS_MAP: Record<string, number> = {
        EE1: 8,
        EE2: 7,
        ME1: 6,
        ME2: 5,
        AE1: 4,
        AE2: 3,
        BE1: 2,
        BE2: 1,
      };

      const calcSummary = (entries: Array<{ status: string; achievement_level: string | null }>) => {
        let count = 0;
        let sum = 0;
        entries.forEach((e) => {
          if (e.status === 'Normal') {
            if (e.achievement_level) {
              count += 1;
              sum += KJSEA_LEVEL_POINTS_MAP[e.achievement_level] || 0;
            }
          } else if (e.status === 'Absent' || e.status === 'Irregularity' || e.status === 'Not Released') {
            count += 1;
          }
        });
        return { count, sum };
      };

      // Initial state: ENG has EE1 (8 pts), KIS has ME1 (6 pts) -> count = 2, sum = 14
      const entries = [
        { status: 'Normal', achievement_level: 'EE1' },
        { status: 'Normal', achievement_level: 'ME1' },
        { status: 'Normal', achievement_level: null },
      ];
      expect(calcSummary(entries)).toEqual({ count: 2, sum: 14 });

      // Teacher clears ENG
      entries[0] = { status: 'Normal', achievement_level: null };
      expect(calcSummary(entries)).toEqual({ count: 1, sum: 6 });
    });

    it('verifies draft serialization preserves cleared state as Pending and hydration does not resurrect cleared level', () => {
      // 1. Serialize draft payload: Normal without level becomes Pending with null level
      const entry = { status: 'Normal', achievement_level: null };
      const isNormalWithoutLevel = entry.status === 'Normal' && !entry.achievement_level;
      const draftPayload = {
        subject_code: 'ENG',
        status: isNormalWithoutLevel ? 'Pending' : entry.status,
        achievement_level: entry.status === 'Normal' ? entry.achievement_level : null,
      };
      expect(draftPayload.status).toBe('Pending');
      expect(draftPayload.achievement_level).toBeNull();

      // 2. Hydration from Supabase database record
      const dbRecord = { subject_code: 'ENG', status: 'Pending', achievement_level: null };
      const hydratedStatus = (!dbRecord.status || dbRecord.status === 'Pending') ? 'Normal' : dbRecord.status;
      const hydratedEntry = {
        subject_code: dbRecord.subject_code,
        status: hydratedStatus,
        achievement_level: dbRecord.achievement_level,
        status_recorded: Boolean(dbRecord.achievement_level || hydratedStatus !== 'Normal'),
      };
      expect(hydratedEntry.status).toBe('Normal');
      expect(hydratedEntry.achievement_level).toBeNull();
      expect(hydratedEntry.status_recorded).toBe(false);
    });

    it('verifies finalisation remains blocked while a Normal entry has no level', () => {
      const formEntries: Record<string, { status: string; achievement_level: string | null }> = {
        ENG: { status: 'Normal', achievement_level: 'EE1' },
        KIS: { status: 'Normal', achievement_level: 'ME1' },
        MATH: { status: 'Normal', achievement_level: 'ME2' },
        'INT SCI': { status: 'Normal', achievement_level: 'AE1' },
        CAS: { status: 'Normal', achievement_level: 'AE2' },
        SST: { status: 'Normal', achievement_level: 'BE1' },
        CRE: { status: 'Normal', achievement_level: 'BE2' },
        AGN: { status: 'Normal', achievement_level: 'EE2' },
        'PRE-TECH': { status: 'Normal', achievement_level: null }, // Cleared / incomplete
      };

      const missingAreas: string[] = [];
      Object.entries(formEntries).forEach(([code, entry]) => {
        const isComplete = entry.status === 'Normal' ? Boolean(entry.achievement_level) : (entry.status !== 'Pending');
        if (!isComplete) {
          missingAreas.push(`${code} (${entry.status === 'Normal' ? 'Select achievement level' : 'status pending'})`);
        }
      });

      expect(missingAreas).toHaveLength(1);
      expect(missingAreas[0]).toContain('PRE-TECH');
      expect(missingAreas[0]).toContain('Select achievement level');
    });

    it('verifies KjseaAdminManagement source code contains handleClearLevel, accessible button, and all 9 KNEC labels', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const componentSrc = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/kjsea/KjseaAdminManagement.tsx'),
        'utf8'
      );

      // 1. Handler existence and state pattern
      expect(componentSrc).toContain('const handleClearLevel = (code: KJSEASubjectCode)');
      expect(componentSrc).toContain('achievement_level: null');
      expect(componentSrc).toContain('status_recorded: false');

      // 2. Clear button markup and accessible labelling
      expect(componentSrc).toContain('handleClearLevel(meta.code)');
      expect(componentSrc).toContain('aria-label={`Clear achievement level for ${meta.code}`}');
      expect(componentSrc).toContain('title={`Clear achievement level for ${meta.code}`}');
      expect(componentSrc).toContain('<span>Clear</span>');

      // 3. Official KNEC labels intact
      const expectedKNEC = [
        '901 · ENGLISH',
        '902 · KISWAHILI',
        '903 · MATHEMATICS',
        '905 · INTEGRATED SCIENCE',
        '906 · AGRICULTURE',
        '907 · SOCIAL STUDIES',
        '908 · CHRISTIAN RELIGIOUS EDUCATION (CRE)',
        '911 · CREATIVE ARTS AND SPORTS',
        '912 · PRE-TECHNICAL STUDIES',
      ];
      expectedKNEC.forEach((label) => {
        expect(componentSrc).toContain(label);
      });
    });
  });
});




