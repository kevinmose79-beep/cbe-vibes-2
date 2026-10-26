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

async function main() {
  await syncFromSupabase();
  const exams = api.getExaminations();
  const students = api.getStudents();
  const classes = api.getClasses();
  const subjects = api.getSubjects();

  const ttExam = exams.find(e => e.exam_name.toLowerCase().includes('third trial') && e.exam_name.toLowerCase().includes('grade 6'));
  const opExam = exams.find(e => e.exam_name.toLowerCase().includes('opener') && e.exam_name.toLowerCase().includes('grade 6'));
  const stExam = exams.find(e => e.exam_name.toLowerCase().includes('second trial') && e.exam_name.toLowerCase().includes('grade 6'));

  const ttMarks = await api.fetchMarksForExam(ttExam!.id);
  const opMarks = await api.fetchMarksForExam(opExam!.id);
  const stMarks = await api.fetchMarksForExam(stExam!.id);

  const ttResults = calculateExamResults(ttExam!.id, students, ttMarks, CBE_8_POINT_GRADES, classes, subjects, ttExam);
  const opResults = calculateExamResults(opExam!.id, students, opMarks, CBE_8_POINT_GRADES, classes, subjects, opExam);
  const stResults = calculateExamResults(stExam!.id, students, stMarks, CBE_8_POINT_GRADES, classes, subjects, stExam);

  console.log('Searching for student where Opener is 584 or around 584...');
  for (const st of students) {
    const opR = opResults.find(r => r.student_id === st.id);
    const ttR = ttResults.find(r => r.student_id === st.id);
    const stR = stResults.find(r => r.student_id === st.id);

    if (opR?.total_marks === 584 || ttR?.total_marks === 584 || stR?.total_marks === 509 || opR?.total_marks === 509) {
      console.log(`FOUND LEARNER: ${st.admission_number} ${st.name} (${st.id})`);
      console.log(`  Opener: ${opR?.total_marks} / ${opR?.total_max_marks}`);
      console.log(`  Second Trial: ${stR?.total_marks} / ${stR?.total_max_marks}`);
      console.log(`  Third Trial: ${ttR?.total_marks} / ${ttR?.total_max_marks}`);
    }
  }
}
main().catch(console.error);
