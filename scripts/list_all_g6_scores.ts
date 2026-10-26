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

  console.log('List of Grade 6 students:');
  const g6Class = classes.find(c => (c as any).class_name === 'Grade 6' || (c as any).name === 'Grade 6');
  const g6Students = students.filter(s => s.class_id === g6Class?.id);

  for (const st of g6Students) {
    const op = opResults.find(r => r.student_id === st.id);
    const st_ = stResults.find(r => r.student_id === st.id);
    const tt = ttResults.find(r => r.student_id === st.id);

    console.log(`Adm: ${st.admission_number} | Opener: ${op?.total_marks}/${op?.total_max_marks} | 2ndTrial: ${st_?.total_marks}/${st_?.total_max_marks} | 3rdTrial: ${tt?.total_marks}/${tt?.total_max_marks}`);
  }
}
main().catch(console.error);
