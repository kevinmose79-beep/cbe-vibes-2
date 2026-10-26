process.env.NODE_ENV = 'test';
import '../src/test/setupLocalStorage.ts';
import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
(globalThis as any).__TEST_SUPABASE_CLIENT__ = createClient(url, key);

import { syncFromSupabase, api } from '../src/lib/storage.ts';
import { evaluateMark } from '../src/utils/markUtils.ts';

async function main() {
  await syncFromSupabase();
  const exams = api.getExaminations();
  const students = api.getStudents();
  const subjects = api.getSubjects();

  const ttExam = exams.find(e => e.exam_name.toLowerCase().includes('third trial') && e.exam_name.toLowerCase().includes('grade 6'))!;
  const marks = await api.fetchMarksForExam(ttExam.id);

  console.log('Testing all Grade 6 students for Third Trial...');
  for (const st of students.filter(s => s.grade === 'Grade 6' || (s as any).class_name === 'Grade 6')) {
    const stMarks = marks.filter(m => m.student_id === st.id);
    if (!stMarks.length) continue;

    // 1. Sum of raw scores
    const rawSum = stMarks.reduce((acc, m) => acc + Number(m.raw_score ?? m.marks ?? 0), 0);

    // 2. Sum of each mark converted to percentage (mark.score / mark.out_of * 100)
    let pctSum = 0;
    for (const m of stMarks) {
      const raw = Number(m.raw_score ?? m.marks ?? 0);
      const outOf = Number(m.out_of || 100);
      const pct = outOf > 0 ? (raw / outOf) * 100 : 0;
      pctSum += Math.round(pct);
    }

    // 3. What if evaluateMark is called on each without isUpperPrimaryCompOrInsha?
    let evalSum = 0;
    for (const m of stMarks) {
      const sub = subjects.find(s => s.id === m.subject_id);
      const ev = evaluateMark(m, { subject: sub });
      evalSum += Math.round(ev.percentage ?? 0);
    }

    if (rawSum === 755 || pctSum === 755 || evalSum === 755) {
      console.log(`MATCH 755! Student ${st.admission_number} (${st.name}): rawSum=${rawSum}, pctSum=${pctSum}, evalSum=${evalSum}`);
    }
    if (pctSum >= 750 && pctSum <= 760) {
      console.log(`CLOSE TO 755 (pctSum): Student ${st.admission_number}: pctSum=${pctSum}`);
    }
    if (evalSum >= 750 && evalSum <= 760) {
      console.log(`CLOSE TO 755 (evalSum): Student ${st.admission_number}: evalSum=${evalSum}`);
    }
  }
}
main().catch(console.error);
