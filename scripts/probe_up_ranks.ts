import {
  calculateBatchCohortSubjectRanks,
  CBE_8_POINT_GRADES,
} from '../src/services/analysisEngine';
import { resolveUpperPrimaryReportStructure } from '../src/utils/upperPrimaryReportUtils';
import { Student, School, Examination, ClassStream, Subject, Mark } from '../types';

const upSubjects: Subject[] = [
  { id: 'sb_up_eng', subject_name: 'English Language', subject_code: 'ENG', category: 'Core', education_level: 'Upper Primary' },
  { id: 'sb_up_comp', subject_name: 'English Composition', subject_code: 'COMP', category: 'Core', education_level: 'Upper Primary' },
  { id: 'sb_up_kis', subject_name: 'Kiswahili Lugha', subject_code: 'KIS', category: 'Core', education_level: 'Upper Primary' },
  { id: 'sb_up_insha', subject_name: 'Kiswahili Insha', subject_code: 'INSHA', category: 'Core', education_level: 'Upper Primary' },
  { id: 'sb_up_mat', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core', education_level: 'Upper Primary' },
  { id: 'sb_up_sci', subject_name: 'Integrated Science', subject_code: 'INT-SCI', category: 'Core', education_level: 'Upper Primary' },
  { id: 'sb_up_cas', subject_name: 'Creative Arts and Sports', subject_code: 'CAS', category: 'Core', education_level: 'Upper Primary' },
  { id: 'sb_up_ss_cre', subject_name: 'Social Studies & CRE', subject_code: 'SS&CRE', category: 'Core', education_level: 'Upper Primary' },
];

const upExam: Examination = {
  id: 'ex_up_opener_2026',
  exam_name: 'Opener Assessment Term 1 2026',
  term: 'Term 1',
  year: 2026,
  status: 'Approved',
  education_level: 'Upper Primary',
  assessment_structure: 'Composite',
};

const classes: ClassStream[] = [
  { id: 'c_g5_blue', class_name: 'Grade 5', stream: 'Blue', education_level: 'Upper Primary', stream_id: 'str_g5_blue' },
];

const students: Student[] = [
  { id: 'st_1', admission_number: 'ADM-5001', first_name: 'Student1', last_name: 'UP', full_name: 'Student1 UP', class_id: 'c_g5_blue', stream_id: 'str_g5_blue', grade: 'Grade 5', active: true },
  { id: 'st_2', admission_number: 'ADM-5002', first_name: 'Student2', last_name: 'UP', full_name: 'Student2 UP', class_id: 'c_g5_blue', stream_id: 'str_g5_blue', grade: 'Grade 5', active: true },
];

const marks: Mark[] = [
  { id: 'm1', student_id: 'st_1', subject_id: 'sb_up_eng', exam_id: 'ex_up_opener_2026', score: 45, marks: 45, raw_score: 45, out_of: 100, special_status: 'Normal' },
  { id: 'm2', student_id: 'st_1', subject_id: 'sb_up_comp', exam_id: 'ex_up_opener_2026', score: 35, marks: 35, raw_score: 35, out_of: 100, special_status: 'Normal' },
  { id: 'm3', student_id: 'st_1', subject_id: 'sb_up_mat', exam_id: 'ex_up_opener_2026', score: 80, marks: 80, raw_score: 80, out_of: 100, special_status: 'Normal' },
  { id: 'm4', student_id: 'st_2', subject_id: 'sb_up_eng', exam_id: 'ex_up_opener_2026', score: 40, marks: 40, raw_score: 40, out_of: 100, special_status: 'Normal' },
  { id: 'm5', student_id: 'st_2', subject_id: 'sb_up_comp', exam_id: 'ex_up_opener_2026', score: 30, marks: 30, raw_score: 30, out_of: 100, special_status: 'Normal' },
  { id: 'm6', student_id: 'st_2', subject_id: 'sb_up_mat', exam_id: 'ex_up_opener_2026', score: 85, marks: 85, raw_score: 85, out_of: 100, special_status: 'Normal' },
];

const ranksMap = calculateBatchCohortSubjectRanks(
  upExam.id,
  students,
  students,
  classes,
  marks,
  upSubjects
);

const st1Ranks = ranksMap.get('st_1');
console.log('st_1 precalculated keys:', Array.from(st1Ranks?.keys() || []));
console.log('st_1 values:', Object.fromEntries(st1Ranks || []));
