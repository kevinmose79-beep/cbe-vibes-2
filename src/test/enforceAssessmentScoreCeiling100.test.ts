import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateMarkCellInput } from '../components/MarksEntryTable';
import { api, KEYS, setStorage, getStorage } from '../lib/storage';
import { Examination, Mark, Student, ClassStream, Subject, User, AcademicYear, SchoolTerm } from '../types';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('Enforce Assessment Score Ceiling of 100 Suite', () => {
  let upsertSpy: any;
  let insertSpy: any;

  const mockYearId = '69ebb4c9-8f38-43ec-81c1-bb41d7488363';
  const mockTermId = 'b1b46b17-c979-4824-aad7-31545b5ef212';
  const mockTeacherId = '88888888-8888-4888-8888-888888888888';

  const mockAdminUser: User = {
    id: 'user_admin_001',
    teacher_id: mockTeacherId,
    name: 'Administrator',
    email: 'admin@school.ac.ke',
    role: 'admin',
  };

  const mockExam: Examination = {
    id: '2cfb47f7-b842-45a7-96a1-9da2cb859ff7',
    academic_year_id: mockYearId,
    term_id: mockTermId,
    exam_name: 'Term 1 Mid-Term 2026',
    term: 'Term 1',
    year: 2026,
    status: 'Draft',
    exam_type: 'Mid-Term',
    max_marks: 100,
  };

  const mockClass: ClassStream = {
    id: 'cls_grade_7',
    stream_id: 'st_grade_7_blue',
    class_name: 'Grade 7',
    stream: 'Blue',
    education_level: 'Junior School',
    status: 'Active',
  };

  const mockSubject: Subject = {
    id: '3efb47f7-b842-45a7-96a1-9da2cb859ff8',
    subject_name: 'Mathematics',
    subject_code: 'MATH7',
    category: 'Core',
    education_level: 'Junior School',
    status: 'Active',
  };

  const mockStudent: Student = {
    id: '4efb47f7-b842-45a7-96a1-9da2cb859ff9',
    admission_number: 'ADM-701',
    full_name: 'Jane Doe',
    gender: 'F',
    class_id: 'cls_grade_7',
    stream_id: 'st_grade_7_blue',
    active: true,
  };

  const mockAcademicYear: AcademicYear = {
    id: mockYearId,
    year: 2026,
    status: 'Active',
  };

  const mockTerm: SchoolTerm = {
    id: mockTermId,
    academic_year_id: mockYearId,
    term_name: 'Term 1',
    year: 2026,
    status: 'Active',
    opening_date: '2026-01-05',
    closing_date: '2026-04-10',
  };

  beforeEach(() => {
    localStorage.clear();
    upsertSpy = vi.fn().mockImplementation(async (payloads: any[]) => ({ data: payloads, error: null }));
    insertSpy = vi.fn().mockImplementation(async (payloads: any[]) => ({
      data: payloads[0],
      error: null,
      select: () => ({ maybeSingle: async () => ({ data: payloads[0], error: null }) }),
    }));

    (globalThis as any).__TEST_SUPABASE_CLIENT__ = {
      from: (table: string) => ({
        upsert: upsertSpy,
        insert: (payloads: any[]) => ({
          select: () => ({
            maybeSingle: async () => ({ data: { id: payloads[0]?.id || 'generated_id', ...payloads[0] }, error: null }),
          }),
        }),
        update: (payloads: any) => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: payloads, error: null }),
            }),
            data: payloads,
            error: null,
          }),
        }),
        select: (_cols?: string) => ({
          limit: () => ({ data: [], error: null }),
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            data: [],
            error: null,
          }),
          maybeSingle: async () => ({ data: null, error: null }),
          or: () => ({ limit: () => ({ data: [], error: null }) }),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    };

    setStorage(KEYS.ACADEMIC_YEARS, [mockAcademicYear]);
    setStorage(KEYS.SCHOOL_TERMS, [mockTerm]);
    setStorage(KEYS.CLASSES, [mockClass]);
    setStorage(KEYS.SUBJECTS, [mockSubject]);
    setStorage(KEYS.STUDENTS, [mockStudent]);
    setStorage(KEYS.EXAMS, [mockExam]);
    setStorage(KEYS.MARKS, []);
  });

  // 1. Maximum-score values
  describe('1. Maximum-score configuration validation', () => {
    it('accepts valid assessment maximums: 1, 40, 50, 60, 100', () => {
      const validMaxes = ['1', '40', '50', '60', '100', 1, 40, 50, 60, 100];
      validMaxes.forEach((maxVal) => {
        const num = typeof maxVal === 'number' ? maxVal : parseFloat(maxVal);
        const isValid = !isNaN(num) && Number.isFinite(num) && num >= 1 && num <= 100;
        expect(isValid).toBe(true);
      });
    });

    it('rejects invalid assessment maximums: 0, negative numbers, 101, 500, 1000, NaN, infinity, malformed', () => {
      const invalidMaxes = ['0', '-1', '-50', '101', '105', '500', '1000', 'NaN', 'Infinity', '-Infinity', 'abc', ''];
      invalidMaxes.forEach((maxVal) => {
        const num = parseFloat(String(maxVal).trim());
        const isValid = !isNaN(num) && Number.isFinite(num) && num >= 1 && num <= 100;
        expect(isValid).toBe(false);
      });
    });
  });

  // 2. Marks for an assessment out of 100
  describe('2. Mark cell validation for an assessment out of 100', () => {
    it('accepts valid marks: 0, 50, 99.5, 100', () => {
      ['0', '50', '99.5', '100'].forEach((score) => {
        const res = validateMarkCellInput(score, 100);
        expect(res.isValid).toBe(true);
        expect(res.errorTitle).toBe('');
      });
    });

    it('rejects marks above 100 or negative: 100.1, 101, 1000, -1, -5', () => {
      ['100.1', '101', '1000'].forEach((score) => {
        const res = validateMarkCellInput(score, 100);
        expect(res.isValid).toBe(false);
        expect(res.errorType).toBe('exceeds_max');
        expect(res.errorMessage).toContain('cannot be greater than the Max Score of 100');
      });

      ['-1', '-5'].forEach((score) => {
        const res = validateMarkCellInput(score, 100);
        expect(res.isValid).toBe(false);
        expect(res.errorType).toBe('negative');
        expect(res.errorMessage).toBe('Scores must be 0 or greater.');
      });
    });
  });

  // 3. Marks for an assessment out of 50
  describe('3. Mark cell validation for an assessment out of 50', () => {
    it('accepts marks within 50: 0, 49.5, 50', () => {
      ['0', '49.5', '50'].forEach((score) => {
        const res = validateMarkCellInput(score, 50);
        expect(res.isValid).toBe(true);
      });
    });

    it('rejects marks exceeding 50: 51, 100', () => {
      ['51', '100'].forEach((score) => {
        const res = validateMarkCellInput(score, 50);
        expect(res.isValid).toBe(false);
        expect(res.errorType).toBe('exceeds_max');
        expect(res.errorMessage).toContain('cannot be greater than the Max Score of 50');
      });
    });
  });

  // 4. Marks for Composition out of 40
  describe('4. Mark cell validation for Composition/Insha out of 40', () => {
    it('accepts 40 marks', () => {
      const res = validateMarkCellInput('40', 40);
      expect(res.isValid).toBe(true);
    });

    it('rejects 41 and 100 marks', () => {
      ['41', '100'].forEach((score) => {
        const res = validateMarkCellInput(score, 40);
        expect(res.isValid).toBe(false);
        expect(res.errorType).toBe('exceeds_max');
        expect(res.errorMessage).toContain('cannot be greater than the Max Score of 40');
      });
    });
  });

  // 5. Missing or invalid maximum-score metadata
  describe('5. Missing or invalid maximum-score metadata safeguards', () => {
    it('a mark above 100 must never pass validation even if max is missing, blank, or invalid', () => {
      const invalidMaxes = ['', '0', '-10', 'NaN', 'undefined', '500', 500];
      invalidMaxes.forEach((badMax) => {
        const res = validateMarkCellInput('105', badMax as any);
        expect(res.isValid).toBe(false);
        expect(res.errorType).toBe('exceeds_max');
      });
    });

    it('invalid maximum metadata must not silently permit marks above 100', () => {
      const res1 = validateMarkCellInput('1000', 'invalid_scale');
      expect(res1.isValid).toBe(false);
      expect(res1.errorType).toBe('exceeds_max');

      const res2 = validateMarkCellInput('101', 500); // 500 is illegal ceiling
      expect(res2.isValid).toBe(false);
      expect(res2.errorType).toBe('exceeds_max');
    });
  });

  // 6. Pasted values
  describe('6. Pasted value handling', () => {
    it('pasting "105" into a 100-mark assessment triggers validation error', () => {
      const pasted = '105';
      const validation = validateMarkCellInput(pasted, '100');
      expect(validation.isValid).toBe(false);
      expect(validation.errorTitle).toBe('MARK TOO HIGH');
      expect(validation.errorMessage).toContain('100');
    });

    it('pasting non-numeric values like "100%" or "25A" triggers invalid number error', () => {
      const res1 = validateMarkCellInput('100%', 100);
      expect(res1.isValid).toBe(false);
      expect(res1.errorType).toBe('invalid_number');

      const res2 = validateMarkCellInput('25A', 100);
      expect(res2.isValid).toBe(false);
      expect(res2.errorType).toBe('invalid_number');
    });
  });

  // 7. Save-boundary bypass protection in api.saveBulkMarks
  describe('7. Save-boundary bypass protection in api.saveBulkMarks', () => {
    it('calling api.saveBulkMarks() with a mark of 105 fails before database upsert', async () => {
      const illegalMark: Mark = {
        id: 'mk_illegal_105',
        student_id: mockStudent.id,
        subject_id: mockSubject.id,
        exam_id: mockExam.id,
        marks: 105,
        raw_score: 105,
        out_of: 100,
        special_status: 'Normal',
      };

      await expect(api.saveBulkMarks([illegalMark], mockAdminUser)).rejects.toThrow(
        /cannot exceed 100/i
      );

      // Verify that Supabase upsert was NEVER called
      expect(upsertSpy).not.toHaveBeenCalled();

      // Verify that local storage was NOT updated
      const savedMarks = api.getMarks();
      expect(savedMarks.some((m) => m.marks === 105)).toBe(false);
    });

    it('rejects an otherwise valid mark that exceeds its configured out_of (e.g. 55 out of 50)', async () => {
      const illegalScoreFor50: Mark = {
        id: 'mk_illegal_55_of_50',
        student_id: mockStudent.id,
        subject_id: mockSubject.id,
        exam_id: mockExam.id,
        marks: 55,
        raw_score: 55,
        out_of: 50,
        special_status: 'Normal',
      };

      await expect(api.saveBulkMarks([illegalScoreFor50], mockAdminUser)).rejects.toThrow(
        /cannot exceed the assessment maximum of 50/i
      );

      // Verify that Supabase upsert was NEVER called
      expect(upsertSpy).not.toHaveBeenCalled();

      const savedMarks = api.getMarks();
      expect(savedMarks.some((m) => m.marks === 55)).toBe(false);
    });

    it('rejects out_of configured above 100 (e.g. out_of = 500)', async () => {
      const illegalOutOfMark: Mark = {
        id: 'mk_illegal_out_of_500',
        student_id: mockStudent.id,
        subject_id: mockSubject.id,
        exam_id: mockExam.id,
        marks: 80,
        raw_score: 80,
        out_of: 500,
        special_status: 'Normal',
      };

      await expect(api.saveBulkMarks([illegalOutOfMark], mockAdminUser)).rejects.toThrow(
        /must be a finite number between 1 and 100/i
      );

      // Verify that Supabase upsert was NEVER called
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it('rejects negative marks in saveBulkMarks before database upsert', async () => {
      const negativeMark: Mark = {
        id: 'mk_negative',
        student_id: mockStudent.id,
        subject_id: mockSubject.id,
        exam_id: mockExam.id,
        marks: -5,
        raw_score: -5,
        out_of: 100,
        special_status: 'Normal',
      };

      await expect(api.saveBulkMarks([negativeMark], mockAdminUser)).rejects.toThrow(
        /marks cannot be negative/i
      );

      expect(upsertSpy).not.toHaveBeenCalled();
    });
  });

  // 8. Assessment form validation in storage / examination management
  describe('8. Assessment creation and update validation', () => {
    it('api.addExamination rejects max_marks > 100', async () => {
      const invalidNewExam: Examination = {
        id: '5efb47f7-b842-45a7-96a1-9da2cb859ff1',
        academic_year_id: mockYearId,
        term_id: mockTermId,
        exam_name: 'Invalid Big Exam',
        term: 'Term 1',
        year: 2026,
        status: 'Draft',
        exam_type: 'Mid-Term',
        max_marks: 101,
      };

      await expect(api.addExamination(invalidNewExam)).rejects.toThrow(
        /cannot exceed 100/i
      );
    });

    it('api.updateExamination rejects max_marks = 1000 or > 100', async () => {
      const examToUpdate: Examination = {
        ...mockExam,
        max_marks: 1000,
      };

      await expect(api.updateExamination(examToUpdate, mockAdminUser)).rejects.toThrow(
        /cannot exceed 100/i
      );
    });

    it('api.addExamination and api.updateExamination accept valid max_marks between 1 and 100', async () => {
      const validExam: Examination = {
        id: '6efb47f7-b842-45a7-96a1-9da2cb859ff2',
        academic_year_id: mockYearId,
        term_id: mockTermId,
        exam_name: 'Valid 50 Marks Exam',
        term: 'Term 1',
        year: 2026,
        status: 'Draft',
        exam_type: 'Mid-Term',
        max_marks: 50,
      };

      const added = await api.addExamination(validExam);
      expect(added.max_marks).toBe(50);

      const updated = await api.updateExamination({ ...added, max_marks: 80 }, mockAdminUser);
      expect(updated.max_marks).toBe(80);
    });
  });

  // 9. Regression coverage: special statuses, decimals, blanks, sub-100 scales
  describe('9. Regression coverage', () => {
    it('accepts special status X (Absent) with 0 score', async () => {
      const xMark: Mark = {
        id: 'mk_x_status',
        student_id: mockStudent.id,
        subject_id: mockSubject.id,
        exam_id: mockExam.id,
        marks: 0,
        raw_score: null,
        out_of: 50,
        special_status: 'X',
      };

      await expect(api.saveBulkMarks([xMark], mockAdminUser)).resolves.not.toThrow();
      const saved = api.getMarks().find((m) => m.id === 'mk_x_status');
      expect(saved?.special_status).toBe('X');
    });

    it('accepts special status Y (Irregularity) with 0 score', async () => {
      const yMark: Mark = {
        id: 'mk_y_status',
        student_id: mockStudent.id,
        subject_id: mockSubject.id,
        exam_id: mockExam.id,
        marks: 0,
        raw_score: null,
        out_of: 100,
        special_status: 'Y',
        irregularity_reason: 'Collusion',
      };

      await expect(api.saveBulkMarks([yMark], mockAdminUser)).resolves.not.toThrow();
      const saved = api.getMarks().find((m) => m.id === 'mk_y_status');
      expect(saved?.special_status).toBe('Y');
    });

    it('accepts special status Blank (Unassessed) with 0 score', async () => {
      const blankMark: Mark = {
        id: 'mk_blank_status',
        student_id: mockStudent.id,
        subject_id: mockSubject.id,
        exam_id: mockExam.id,
        marks: 0,
        raw_score: null,
        out_of: 40,
        special_status: 'Blank',
      };

      await expect(api.saveBulkMarks([blankMark], mockAdminUser)).resolves.not.toThrow();
      const saved = api.getMarks().find((m) => m.id === 'mk_blank_status');
      expect(saved?.special_status).toBe('Blank');
    });

    it('accepts valid decimal scores (e.g. 23.5 out of 30, 48.75 out of 50)', async () => {
      const dec1 = validateMarkCellInput('23.5', 30);
      expect(dec1.isValid).toBe(true);

      const dec2 = validateMarkCellInput('48.75', 50);
      expect(dec2.isValid).toBe(true);

      const decimalMark: Mark = {
        id: 'mk_decimal',
        student_id: mockStudent.id,
        subject_id: mockSubject.id,
        exam_id: mockExam.id,
        marks: 23.5,
        raw_score: 23.5,
        out_of: 30,
        special_status: 'Normal',
      };

      await expect(api.saveBulkMarks([decimalMark], mockAdminUser)).resolves.not.toThrow();
      const saved = api.getMarks().find((m) => m.id === 'mk_decimal');
      expect(saved?.marks).toBe(23.5);
    });

    it('recovers out_of correctly from remarks JSON when resolving marks', () => {
      const dbRow = {
        id: '7efb47f7-b842-45a7-96a1-9da2cb859ff3',
        student_id: mockStudent.id,
        subject_id: mockSubject.id,
        exam_id: mockExam.id,
        marks: 28,
        remarks: JSON.stringify({
          raw_score: 28,
          out_of: 35,
          special_status: 'Normal',
        }),
      };

      const mapped = api.mapDatabaseMarks([dbRow]);
      expect(mapped).toHaveLength(1);
      expect(mapped[0].out_of).toBe(35);
      expect(mapped[0].raw_score).toBe(28);
    });

    it('api.resolveYMark rejects replacement score > 100 or > outOf', async () => {
      // Validation occurs strictly before RPC call
      await expect(
        api.resolveYMark({
          markId: 'mk_test_y',
          studentId: mockStudent.id,
          subjectId: mockSubject.id,
          examId: mockExam.id,
          replacementScore: 105,
          outOf: 100,
          resolutionReason: 'Audit review approved re-mark',
          currentUser: mockAdminUser,
        })
      ).rejects.toThrow(/between 0 and 100/i);

      await expect(
        api.resolveYMark({
          markId: 'mk_test_y',
          studentId: mockStudent.id,
          subjectId: mockSubject.id,
          examId: mockExam.id,
          replacementScore: 55,
          outOf: 50,
          resolutionReason: 'Audit review approved re-mark',
          currentUser: mockAdminUser,
        })
      ).rejects.toThrow(/cannot exceed assessment maximum of 50/i);
    });
  });
});
