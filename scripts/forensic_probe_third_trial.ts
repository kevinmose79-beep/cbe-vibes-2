process.env.NODE_ENV = 'test';
import '../src/test/setupLocalStorage.ts';
import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
(globalThis as any).__TEST_SUPABASE_CLIENT__ = createClient(url, key);

import { syncFromSupabase, api } from '../src/lib/storage.ts';
import { calculateExamResults, CBE_8_POINT_GRADES } from '../src/services/analysisEngine.ts';
import { calculateCohortAssessmentRankings, calculateSingleLearnerAssessmentRankings } from '../src/services/terminalRankingEngine.ts';
import { calculateTerminalResult } from '../src/services/terminalResultsEngine.ts';

async function main() {
  await syncFromSupabase();
  const exams = api.getExaminations();
  const students = api.getStudents();
  const classes = api.getClasses();
  const subjects = api.getSubjects();

  const thirdTrial = exams.find(e => e.exam_name.toLowerCase().includes('third trial'));
  if (!thirdTrial) {
    console.error('Third trial exam not found!');
    return;
  }
  console.log('Third trial exam:', thirdTrial.id, thirdTrial.exam_name);

  // Fetch marks for Third Trial
  const marks = await api.fetchMarksForExam(thirdTrial.id);
  console.log('Fetched marks count:', marks.length);

  // Group marks by student
  const studentMap = new Map<string, typeof marks>();
  for (const m of marks) {
    if (!studentMap.has(m.student_id)) studentMap.set(m.student_id, []);
    studentMap.get(m.student_id)!.push(m);
  }

  console.log('Total students with marks in Third Trial:', studentMap.size);

  // Check each student's results using calculateExamResults
  // First identify Grade 6 class
  const grade6Class = classes.find(c => {
    const cName = (c as any).name || (c as any).class_name || '';
    return cName.toLowerCase().includes('grade 6') || (c as any).grade_level === 6;
  });
  console.log('Grade 6 class:', grade6Class?.id, (grade6Class as any)?.name || (grade6Class as any)?.class_name);

  const studentsInGrade6 = students.filter(s => s.class_id === grade6Class?.id);
  console.log('Students in Grade 6 count:', studentsInGrade6.length);

  // Let's run calculateExamResults for thirdTrial
  const examResults = calculateExamResults(
    thirdTrial.id,
    students,
    marks,
    CBE_8_POINT_GRADES,
    classes,
    subjects,
    thirdTrial
  );

  console.log('calculateExamResults count:', examResults.length);
  if (examResults.length > 0) {
    console.log('Sample examResult keys:', Object.keys(examResults[0]));
    console.log('Sample examResult:', JSON.stringify(examResults[0], null, 2));
  }
}

main().catch(console.error);
