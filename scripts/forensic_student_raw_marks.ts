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

  const tt = exams.find(e => e.exam_name.toLowerCase().includes('third trial') && e.exam_name.toLowerCase().includes('grade 6'))!;
  const marks = await api.fetchMarksForExam(tt.id);

  // Group by student
  const byStudent = new Map<string, any[]>();
  for (const m of marks) {
    if (!byStudent.has(m.student_id)) byStudent.set(m.student_id, []);
    byStudent.get(m.student_id)!.push(m);
  }

  // Find students with highest marks
  for (const [sId, mList] of byStudent.entries()) {
    const st = students.find(s => s.id === sId);
    if (!['001', '002', '003', '057', '076', '077'].includes(st?.admission_number || '')) continue;

    console.log(`\nStudent: Adm ${st?.admission_number} ${st?.name} (${sId}): ${mList.length} marks`);
    let sumRaw = 0;
    for (const m of mList) {
      const sub = subjects.find(s => s.id === m.subject_id);
      const score = Number(m.raw_score ?? m.marks ?? 0);
      sumRaw += score;
      console.log(`  Subj: ${sub?.subject_code?.padEnd(8)} (${sub?.subject_name}) [${m.subject_id}]: raw=${m.raw_score}, marks=${m.marks}, out_of=${m.out_of}`);
    }
    console.log(`  Total raw sum across all mark records: ${sumRaw}`);
  }
}
main().catch(console.error);
