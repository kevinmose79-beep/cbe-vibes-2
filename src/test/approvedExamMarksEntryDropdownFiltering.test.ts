import { describe, it, expect } from 'vitest';
import { Examination, ClassStream } from '../types';
import { isExaminationFullyApproved } from '../utils/examLockUtils';

describe('Marks Entry Approved Examination Dropdown Filtering', () => {
  const mockClasses: ClassStream[] = [
    { id: 'cls_g4a', class_name: 'Grade 4', stream: 'East', stream_id: 'str_g4a', education_level: 'Upper Primary', status: 'Active' },
    { id: 'cls_g4b', class_name: 'Grade 4', stream: 'West', stream_id: 'str_g4b', education_level: 'Upper Primary', status: 'Active' },
  ];

  const openExam: Examination = {
    id: 'exam_open_1',
    exam_name: 'Grade 4 Opener Term 1 2026',
    term: 'Term 1',
    year: 2026,
    education_level: 'Upper Primary',
    status: 'Open',
    exam_type: 'Opener',
    max_marks: 100,
  };

  const approvedExam: Examination = {
    id: 'exam_approved_1',
    exam_name: 'Grade 4 Mid-Term 2026',
    term: 'Term 1',
    year: 2026,
    education_level: 'Upper Primary',
    status: 'Approved',
    approved_classes: ['str_g4a', 'str_g4b'],
    approved_levels: ['Upper Primary'],
    exam_type: 'Mid-Term',
    max_marks: 100,
  };

  const draftExam: Examination = {
    id: 'exam_draft_1',
    exam_name: 'Grade 4 End-Term 2026',
    term: 'Term 1',
    year: 2026,
    education_level: 'Upper Primary',
    status: 'Draft',
    exam_type: 'End-Term',
    max_marks: 100,
  };

  // Pure filtering logic helper matching MarksEntryTable.tsx
  function filterEntryExams(exams: Examination[], classes: ClassStream[]): Examination[] {
    return exams.filter((ex) => {
      if (ex.status === 'Approved' || ex.status === 'Published') {
        return false;
      }
      if (isExaminationFullyApproved(ex, classes)) {
        return false;
      }
      return true;
    });
  }

  it('1. Excludes explicitly Approved exams from Marks Entry dropdown', () => {
    const allExams = [openExam, approvedExam, draftExam];
    const filtered = filterEntryExams(allExams, mockClasses);

    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.id)).toEqual(['exam_open_1', 'exam_draft_1']);
    expect(filtered.some((e) => e.id === 'exam_approved_1')).toBe(false);
  });

  it('2. Excludes Published exams from Marks Entry dropdown', () => {
    const publishedExam: Examination = { ...openExam, id: 'exam_pub_1', status: 'Published' };
    const allExams = [openExam, publishedExam];
    const filtered = filterEntryExams(allExams, mockClasses);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('exam_open_1');
  });

  it('3. Excludes exams where all streams are approved via stream approval flags', () => {
    const streamApprovedExam: Examination = {
      ...openExam,
      id: 'exam_stream_app_1',
      status: 'Open',
      approved_classes: ['str_g4a', 'str_g4b'], // all active streams approved
    };
    const allExams = [openExam, streamApprovedExam];
    const filtered = filterEntryExams(allExams, mockClasses);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('exam_open_1');
  });

  it('4. Re-includes exam in Marks Entry dropdown when admin disapproves / reopens it', () => {
    const allExams = [openExam, approvedExam];

    // Before disapproval/reopen: approved exam is filtered out
    const beforeReopen = filterEntryExams(allExams, mockClasses);
    expect(beforeReopen).toHaveLength(1);
    expect(beforeReopen[0].id).toBe('exam_open_1');

    // Admin disapproves / reopens exam -> status changes to 'Draft' and approval flags reset
    const reopenedExam: Examination = {
      ...approvedExam,
      status: 'Draft',
      approved_classes: [],
      approved_levels: [],
    };
    const updatedExams = [openExam, reopenedExam];

    // After disapproval/reopen: exam is now available in Marks Entry dropdown!
    const afterReopen = filterEntryExams(updatedExams, mockClasses);
    expect(afterReopen).toHaveLength(2);
    expect(afterReopen.map((e) => e.id)).toContain('exam_approved_1');
  });
});
