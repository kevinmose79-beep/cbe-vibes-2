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

  console.log('Searching exams for raw mark sums...');
  for (const e of exams) {
    const marks = await api.fetchMarksForExam(e.id);
    const byStudent = new Map<string, number>();
    for (const m of marks) {
      const score = Number(m.raw_score ?? m.marks ?? 0);
      byStudent.set(m.student_id, (byStudent.get(m.student_id) || 0) + score);
    }
    for (const [sId, sum] of byStudent.entries()) {
      if (sum === 755 || sum === 584 || sum === 509 || (sum >= 700 && sum <= 800)) {
        const st = students.find(s => s.id === sId);
        console.log(`MATCH: Exam "${e.exam_name}" (${e.id}) -> Student ${st?.admission_number} ${st?.name} raw marks sum = ${sum}`);
      }
    }
  }
}
main().catch(console.error);
