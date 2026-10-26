import { config } from 'dotenv';
config();
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(url, key);

async function probe() {
  console.log('--- 1. ACADEMIC SESSIONS / TERMS ---');
  const { data: years } = await supabase.from('academic_years').select('*');
  console.log('Academic Years:', years);

  const { data: terms } = await supabase.from('terms').select('*');
  console.log('Terms:', terms);

  console.log('\n--- 2. CLASSES & STREAMS ---');
  const { data: classes } = await supabase.from('classes').select('*');
  console.log('Classes:', classes);

  const { data: streams } = await supabase.from('streams').select('*');
  console.log('Streams:', streams);

  console.log('\n--- 3. EXAMINATIONS ---');
  const { data: exams, error: exErr } = await supabase.from('examinations').select('*');
  if (exErr) console.error('Exams error:', exErr);
  console.log(`Total exams in DB: ${exams?.length}`);
  exams?.forEach(e => {
    console.log(`Exam: id="${e.id}", name="${e.exam_name}", status="${e.status}", year="${e.year}", academic_year_id="${e.academic_year_id}", term="${e.term}", term_id="${e.term_id}", target_classes=${JSON.stringify(e.target_classes)}, target_levels=${JSON.stringify(e.target_levels)}, education_level="${e.education_level}", approved_classes=${JSON.stringify(e.approved_classes)}, approved_levels=${JSON.stringify(e.approved_levels)}`);
  });

  console.log('\n--- 4. GRADE 9 STUDENTS ---');
  const { data: students, error: stErr } = await supabase.from('students').select('*');
  const grade9Students = students?.filter(s => {
    const g = s.grade || s.class_name || '';
    return g.toLowerCase().includes('9');
  }) || [];
  console.log(`Total students: ${students?.length}, Grade 9 students: ${grade9Students.length}`);
  grade9Students.slice(0, 5).forEach(s => {
    console.log(`Student: id="${s.id}", adm="${s.admission_number}", name="${s.full_name}", grade="${s.grade}", class_id="${s.class_id}", stream_id="${s.stream_id}", active=${s.active}, enrolment_status="${s.enrolment_status}"`);
  });

  console.log('\n--- 5. MARKS FOR GRADE 9 ---');
  const g9Ids = grade9Students.map(s => s.id);
  if (g9Ids.length > 0) {
    const { data: g9Marks, error: mErr } = await supabase.from('marks').select('*').in('student_id', g9Ids.slice(0, 10));
    console.log(`Sample Grade 9 marks count for first 10 students: ${g9Marks?.length}`);
    if (g9Marks && g9Marks.length > 0) {
      console.log('Sample mark:', g9Marks[0]);
    }
  }

  // Also check all marks count
  const { count: marksCount } = await supabase.from('marks').select('*', { count: 'exact', head: true });
  console.log(`Total marks count in marks table: ${marksCount}`);
}

probe().catch(console.error);
