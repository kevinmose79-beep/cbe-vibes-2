import { describe, it, expect } from 'vitest';
import { Student } from '../types';

describe('Phase 3B Surgical Fix: Performance Sort Focus Stability during Active Typing', () => {
  const sampleStudents: Student[] = [
    { id: 'uuid_std_101', admission_number: 'ADM-101', full_name: 'Brian Omondi', class_id: 'cls_g9_red', gender: 'M', active: true },
    { id: 'uuid_std_102', admission_number: 'ADM-102', full_name: 'Faith Wairimu', class_id: 'cls_g9_red', gender: 'F', active: true },
    { id: 'uuid_std_103', admission_number: 'ADM-103', full_name: 'David Kimani', class_id: 'cls_g9_red', gender: 'M', active: true },
  ];

  type CellEntry = { rawScore: string; status: 'Normal' | 'X' | 'Y' | 'Blank'; irregularityReason?: string };

  function computeSortedStudents(
    students: Student[],
    localMarks: Record<string, CellEntry>,
    sortByPerformance: boolean,
    focusedStudentId: string | null,
    lastSortedRef: { current: Student[] }
  ): Student[] {
    // Phase 3B Freeze Invariant: If an input is focused, freeze list order so DOM row does not jump
    if (focusedStudentId && lastSortedRef.current.length === students.length) {
      return lastSortedRef.current;
    }

    const list = [...students];
    if (sortByPerformance) {
      list.sort((a, b) => {
        const entryA = localMarks[a.id];
        const entryB = localMarks[b.id];

        const scoreA = entryA?.status === 'Normal' && entryA.rawScore !== '' ? parseFloat(entryA.rawScore) : -1;
        const scoreB = entryB?.status === 'Normal' && entryB.rawScore !== '' ? parseFloat(entryB.rawScore) : -1;

        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }
        return (a.admission_number || '').localeCompare(b.admission_number || '', undefined, { numeric: true });
      });
    }
    lastSortedRef.current = list;
    return list;
  }

  it('1. Freezes student list order while focusedStudentId is set during performance sort typing', () => {
    const lastSortedRef = { current: [] as Student[] };
    let localMarks: Record<string, CellEntry> = {
      uuid_std_101: { rawScore: '20', status: 'Normal' }, // Brian: 20
      uuid_std_102: { rawScore: '80', status: 'Normal' }, // Faith: 80
      uuid_std_103: { rawScore: '50', status: 'Normal' }, // David: 50
    };

    // Step 1: Initial sort by performance (Faith: 80, David: 50, Brian: 20)
    let sorted = computeSortedStudents(sampleStudents, localMarks, true, null, lastSortedRef);
    expect(sorted.map((s) => s.full_name)).toEqual(['Faith Wairimu', 'David Kimani', 'Brian Omondi']);

    // Step 2: Teacher taps Brian's input -> focusedStudentId = 'uuid_std_101'
    let focusedStudentId: string | null = 'uuid_std_101';

    // Step 3: Teacher types '9' into Brian's input -> rawScore = '9'
    localMarks = {
      ...localMarks,
      uuid_std_101: { rawScore: '9', status: 'Normal' },
    };

    // Re-evaluate list while focused
    sorted = computeSortedStudents(sampleStudents, localMarks, true, focusedStudentId, lastSortedRef);

    // CRITICAL PHASE 3B INVARIANT: List order MUST remain frozen so Brian's row does NOT move!
    expect(sorted.map((s) => s.full_name)).toEqual(['Faith Wairimu', 'David Kimani', 'Brian Omondi']);

    // Step 4: Teacher types '5' -> rawScore = '95' (multi-digit entry!)
    localMarks = {
      ...localMarks,
      uuid_std_101: { rawScore: '95', status: 'Normal' },
    };

    sorted = computeSortedStudents(sampleStudents, localMarks, true, focusedStudentId, lastSortedRef);
    expect(sorted.map((s) => s.full_name)).toEqual(['Faith Wairimu', 'David Kimani', 'Brian Omondi']);

    // Step 5: Teacher finishes typing and blurs input -> focusedStudentId = null
    focusedStudentId = null;
    sorted = computeSortedStudents(sampleStudents, localMarks, true, focusedStudentId, lastSortedRef);

    // Now sorted order updates cleanly after blur: Brian (95), Faith (80), David (50)
    expect(sorted.map((s) => s.full_name)).toEqual(['Brian Omondi', 'Faith Wairimu', 'David Kimani']);
  });
});
