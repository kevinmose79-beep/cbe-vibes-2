import { describe, it, expect } from 'vitest';
import { validateMarkCellInput } from '../components/MarksEntryTable';
import { SubjectStatus } from '../types';

/**
 * Pure calculation logic matching sheetProgressData in MarksEntryTable.tsx
 */
function computeSheetProgress(
  classStudentsCount: number,
  localMarks: Record<string, { rawScore: string; status: SubjectStatus }>,
  outOfMaxScore: string,
  isSelectionComplete: boolean
) {
  const totalEligible = classStudentsCount;
  if (!isSelectionComplete || totalEligible === 0) {
    return { totalEligible: 0, enteredCount: 0, remainingCount: 0, percentage: 0, isComplete: false };
  }

  const pMax = parseFloat(outOfMaxScore);
  const isPMaxValid = !isNaN(pMax) && pMax > 0;
  if (!isPMaxValid) {
    return { totalEligible, enteredCount: 0, remainingCount: totalEligible, percentage: 0, isComplete: false };
  }

  let enteredCount = 0;
  Object.values(localMarks).forEach((entry) => {
    if (!entry) return;

    if (entry.status === 'X' || entry.status === 'Y') {
      enteredCount++;
    } else if (entry.status === 'Normal' && entry.rawScore.trim() !== '') {
      const validation = validateMarkCellInput(entry.rawScore, pMax);
      if (validation.isValid) {
        enteredCount++;
      }
    }
  });

  const remainingCount = Math.max(0, totalEligible - enteredCount);
  const percentage = Math.min(100, Math.max(0, Math.round((enteredCount / totalEligible) * 100)));
  const isComplete = enteredCount >= totalEligible && totalEligible > 0;

  return { totalEligible, enteredCount, remainingCount, percentage, isComplete };
}

describe('Marks Entry Progress Indicator Unit & Verification Suite', () => {
  const totalLearners = 38;
  const maxScore = '100';

  it('Case 1: Empty — 38 eligible learners, no entries', () => {
    const localMarks = {};
    const res = computeSheetProgress(totalLearners, localMarks, maxScore, true);

    expect(res.totalEligible).toBe(38);
    expect(res.enteredCount).toBe(0);
    expect(res.remainingCount).toBe(38);
    expect(res.percentage).toBe(0);
    expect(res.isComplete).toBe(false);
  });

  it('Case 2: Zero is entered — 0 entered for one learner MUST count as entered', () => {
    const localMarks = {
      std_1: { rawScore: '0', status: 'Normal' as SubjectStatus },
    };
    const res = computeSheetProgress(totalLearners, localMarks, maxScore, true);

    expect(res.enteredCount).toBe(1);
    expect(res.remainingCount).toBe(37);
    expect(res.percentage).toBe(3); // round((1 / 38) * 100) = 3%
    expect(res.isComplete).toBe(false);
  });

  it('Case 3: Normal mark — 80 entered for another learner', () => {
    const localMarks = {
      std_1: { rawScore: '0', status: 'Normal' as SubjectStatus },
      std_2: { rawScore: '80', status: 'Normal' as SubjectStatus },
    };
    const res = computeSheetProgress(totalLearners, localMarks, maxScore, true);

    expect(res.enteredCount).toBe(2);
    expect(res.remainingCount).toBe(36);
    expect(res.percentage).toBe(5); // round((2 / 38) * 100) = 5%
  });

  it('Case 4: X status — Absent status counts as entered', () => {
    const localMarks = {
      std_1: { rawScore: '0', status: 'Normal' as SubjectStatus },
      std_2: { rawScore: '80', status: 'Normal' as SubjectStatus },
      std_3: { rawScore: 'X', status: 'X' as SubjectStatus },
    };
    const res = computeSheetProgress(totalLearners, localMarks, maxScore, true);

    expect(res.enteredCount).toBe(3);
    expect(res.remainingCount).toBe(35);
    expect(res.percentage).toBe(8); // round((3 / 38) * 100) = 8%
  });

  it('Case 5: Invalid mark — 150 when max is 100 does NOT increase entered count', () => {
    const localMarks = {
      std_1: { rawScore: '0', status: 'Normal' as SubjectStatus },
      std_2: { rawScore: '80', status: 'Normal' as SubjectStatus },
      std_3: { rawScore: 'X', status: 'X' as SubjectStatus },
      std_4: { rawScore: '150', status: 'Normal' as SubjectStatus }, // Invalid!
    };
    const res = computeSheetProgress(totalLearners, localMarks, maxScore, true);

    expect(res.enteredCount).toBe(3); // std_4 ignored due to invalid score!
    expect(res.remainingCount).toBe(35);
  });

  it('Case 6: Search filter isolation — total denominator comes strictly from classStudents.length', () => {
    const classStudentsCount = 38;
    const filteredClassStudentsCount = 1; // Only "Faith" displayed in table
    const localMarks = {
      std_1: { rawScore: '0', status: 'Normal' as SubjectStatus },
      std_2: { rawScore: '80', status: 'Normal' as SubjectStatus },
      std_3: { rawScore: 'X', status: 'X' as SubjectStatus },
    };

    // Calculate using authoritative classStudentsCount = 38
    const res = computeSheetProgress(classStudentsCount, localMarks, maxScore, true);

    expect(res.totalEligible).toBe(38);
    expect(res.totalEligible).not.toBe(filteredClassStudentsCount);
    expect(res.enteredCount).toBe(3);
  });

  it('Case 7: Complete — valid entries for all 38 learners', () => {
    const localMarks: Record<string, { rawScore: string; status: SubjectStatus }> = {};
    for (let i = 1; i <= 38; i++) {
      localMarks[`std_${i}`] = { rawScore: String(70 + (i % 20)), status: 'Normal' };
    }

    const res = computeSheetProgress(totalLearners, localMarks, maxScore, true);

    expect(res.enteredCount).toBe(38);
    expect(res.remainingCount).toBe(0);
    expect(res.percentage).toBe(100);
    expect(res.isComplete).toBe(true);
  });

  it('Case 8: Incomplete Selection — hides progress when sheet selection is incomplete', () => {
    const localMarks = {
      std_1: { rawScore: '80', status: 'Normal' as SubjectStatus },
    };

    // Selection incomplete (isSelectionComplete = false)
    const res = computeSheetProgress(totalLearners, localMarks, maxScore, false);

    expect(res.totalEligible).toBe(0);
    expect(res.enteredCount).toBe(0);
    expect(res.percentage).toBe(0);
  });
});
