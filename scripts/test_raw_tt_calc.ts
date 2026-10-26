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
import { resolveUpperPrimaryTerminalSubjects } from '../src/services/terminalResultsEngine.ts';

async function main() {
  await syncFromSupabase();
  const exams = api.getExaminations();
  const students = api.getStudents();
  const classes = api.getClasses();
  const subjects = api.getSubjects();

  const ttExam = exams.find(e => e.exam_name.toLowerCase().includes('third trial') && e.exam_name.toLowerCase().includes('grade 6'))!;
  const g6Class = classes.find(c => {
    const n = (c as any).class_name || (c as any).name || '';
    return n.toLowerCase().includes('grade 6');
  })!;

  const ttMarks = await api.fetchMarksForExam(ttExam.id);
  const upSubjects = resolveUpperPrimaryTerminalSubjects(subjects, [ttExam], { classObj: g6Class });

  console.log('Exam assessment_structure:', ttExam.assessment_structure);
  console.log('Exam ss_cre_structure:', (ttExam as any).ss_cre_structure);

  // Call calculateExamResults on raw ttMarks for all Grade 6 students
  const res = calculateExamResults(
    ttExam.id,
    students.filter(s => s.class_id === g6Class.id),
    ttMarks,
    CBE_8_POINT_GRADES,
    [g6Class],
    upSubjects,
    ttExam as any
  );

  for (const r of res) {
    if (r.total_marks > 600 || r.total_marks === 755) {
      const st = students.find(s => s.id === r.student_id);
      console.log(`Student ${st?.admission_number} (${st?.name}): total = ${r.total_marks} / ${r.total_max_marks}, subj_count = ${r.subject_count}`);
    }
  }
}
main().catch(console.error);
