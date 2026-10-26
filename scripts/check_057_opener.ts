process.env.NODE_ENV = 'test';
import '../src/test/setupLocalStorage.ts';
import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
(globalThis as any).__TEST_SUPABASE_CLIENT__ = createClient(url, key);

import { syncFromSupabase, api } from '../src/lib/storage.ts';

async function main() {
  await syncFromSupabase();
  const exams = api.getExaminations();
  const students = api.getStudents();
  const subjects = api.getSubjects();

  const opExam = exams.find(e => e.exam_name.toLowerCase().includes('opener') && e.exam_name.toLowerCase().includes('grade 6'))!;
  const st057 = students.find(s => s.admission_number === '057')!;

  const opMarks = await api.fetchMarksForExam(opExam.id);
  const stMarks = opMarks.filter(m => m.student_id === st057.id);

  console.log(`Student 057 marks in Opener (${opExam.exam_name}):`);
  for (const m of stMarks) {
    const sub = subjects.find(s => s.id === m.subject_id);
    console.log(`  Subj: ${sub?.subject_code} (${sub?.name}) [${m.subject_id}]: raw=${m.raw_score}, marks=${m.marks}, out_of=${m.out_of}`);
  }
}
main().catch(console.error);
