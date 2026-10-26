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

  for (const e of exams) {
    const marks = await api.fetchMarksForExam(e.id);
    const results = calculateExamResults(e.id, students, marks, CBE_8_POINT_GRADES, classes, subjects, e);
    for (const r of results) {
      if (r.total_marks === 509 || r.total_marks === 584 || r.total_marks === 755) {
        const st = students.find(s => s.id === r.student_id);
        console.log(`Exam: "${e.exam_name}" (${e.id}) -> Student ${st?.admission_number} (${st?.name || st?.id}): ${r.total_marks} / ${r.total_max_marks}`);
      }
    }
  }
}
main().catch(console.error);
