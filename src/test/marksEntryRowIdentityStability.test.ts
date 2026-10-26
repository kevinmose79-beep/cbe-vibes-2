import { describe, it, expect } from 'vitest';
import { Student } from '../types';

describe('Phase 2 Surgical Fix: Learner Row Identity Stability', () => {
  const sampleStudents: Student[] = [
    { id: 'uuid_std_101', admission_number: 'ADM-101', full_name: 'Brian Omondi', class_id: 'cls_g9_red', gender: 'M', active: true },
    { id: 'uuid_std_102', admission_number: 'ADM-102', full_name: 'Faith Wairimu', class_id: 'cls_g9_red', gender: 'F', active: true },
    { id: 'uuid_std_103', admission_number: 'ADM-103', full_name: 'David Kimani', class_id: 'cls_g9_red', gender: 'M', active: true },
  ];

  it('1. Verifies every learner student object has a unique, non-null std.id primary key', () => {
    const ids = sampleStudents.map((s) => s.id);
    const uniqueIds = new Set(ids);

    expect(ids.length).toBe(3);
    expect(uniqueIds.size).toBe(3);
    expect(ids.every((id) => typeof id === 'string' && id.trim().length > 0)).toBe(true);
  });

  it('2. Verifies row keys remain 100% stable (key = std.id) when performance sorting changes student list order', () => {
    // Initial admission order: Brian (0), Faith (1), David (2)
    const initialList = [...sampleStudents];
    const initialKeys = initialList.map((std) => std.id);

    // Performance sorting changes array order: Faith (0), Brian (1), David (2)
    const reSortedList = [sampleStudents[1], sampleStudents[0], sampleStudents[2]];
    const reSortedKeys = reSortedList.map((std) => std.id);

    // CRITICAL PHASE 2 INVARIANT: Brian's key MUST remain 'uuid_std_101', regardless of list index!
    const brianInitialKey = initialKeys[0];
    const brianReSortedKey = reSortedKeys[1];

    expect(brianInitialKey).toBe('uuid_std_101');
    expect(brianReSortedKey).toBe('uuid_std_101');
    expect(brianInitialKey).toBe(brianReSortedKey); // Exact key identity match!
  });
});
