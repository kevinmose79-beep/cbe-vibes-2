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
  console.log('All exams:');
  for (const e of exams) {
    const marks = await api.fetchMarksForExam(e.id);
    console.log(`Exam: ${e.id} | ${e.exam_name} | class_id: ${e.class_id} | marks count: ${marks.length}`);
    if (marks.length > 0) {
      // Find top student sum
      const sumByStudent = new Map<string, number>();
      for (const m of marks) {
        if (typeof m.score === 'number') {
          sumByStudent.set(m.student_id, (sumByStudent.get(m.student_id) || 0) + m.score);
        }
      }
      const sorted = Array.from(sumByStudent.entries()).sort((a, b) => b[1] - a[1]);
      const top3 = sorted.slice(0, 3).map(([sId, s]) => {
        const st = students.find(stud => stud.id === sId);
        return `${st?.admission_number || sId}: ${s}`;
      });
      console.log(`  Top scores: ${top3.join(', ')}`);
    }
  }
}
main().catch(console.error);
