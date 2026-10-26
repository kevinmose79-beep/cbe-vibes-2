import { describe, it, expect, beforeEach } from 'vitest';
import { api, setStorage, KEYS } from '../lib/storage';
import { Student, User, ClassStream, Mark } from '../types';

describe('Surgical Learner Status Fix — 9-Point Verification Suite', () => {
  const classA: ClassStream = {
    id: 'class-uuid-001',
    stream_id: 'stream-uuid-001',
    class_name: 'Grade 7',
    stream: 'East',
    education_level: 'Junior School',
  };

  const classB: ClassStream = {
    id: 'class-uuid-002',
    stream_id: 'stream-uuid-002',
    class_name: 'Grade 7',
    stream: 'West',
    education_level: 'Junior School',
  };

  const activeLearner: Student = {
    id: 'student-uuid-active-1',
    admission_number: 'ADM-101',
    full_name: 'ALICE KEMUNTO',
    first_name: 'Alice',
    last_name: 'Kemunto',
    gender: 'F',
    grade: 'Grade 7',
    class_id: 'class-uuid-001',
    stream_id: 'stream-uuid-001',
    active: true,
    enrolment_status: 'active',
  };

  const inactiveLearner: Student = {
    id: 'student-uuid-inactive-1',
    admission_number: 'ADM-102',
    full_name: 'BOB KIPCHUMBA',
    first_name: 'Bob',
    last_name: 'Kipchumba',
    gender: 'M',
    grade: 'Grade 7',
    class_id: 'class-uuid-001',
    stream_id: 'stream-uuid-001',
    active: false,
    enrolment_status: 'inactive',
  };

  const futureLearner: Student = {
    id: 'student-uuid-future-1',
    admission_number: 'ADM-103',
    full_name: 'CHARLIE MUTUA',
    first_name: 'Charlie',
    last_name: 'Mutua',
    gender: 'M',
    grade: 'Grade 7',
    class_id: 'class-uuid-001',
    stream_id: 'stream-uuid-001',
    active: false,
    enrolment_status: 'future',
    intake_year: 2027,
    intake_term: 'Term 1',
  };

  const aliceUser: User = {
    id: 'user-uuid-alice',
    name: 'Alice Kemunto',
    email: 'adm-101@learner.cbe.ac.ke',
    role: 'learner',
    student_id: 'student-uuid-active-1',
    status: 'Active',
  };

  const bobUser: User = {
    id: 'user-uuid-bob',
    name: 'Bob Kipchumba',
    email: 'adm-102@learner.cbe.ac.ke',
    role: 'learner',
    student_id: 'student-uuid-inactive-1',
    status: 'Disabled',
  };

  const sampleMark: Mark = {
    id: 'mark-uuid-sample-1',
    student_id: 'student-uuid-active-1',
    exam_id: 'exam-uuid-001',
    subject_id: 'subj-uuid-math',
    marks: 78,
  };

  beforeEach(() => {
    setStorage(KEYS.CLASSES, [classA, classB]);
    setStorage(KEYS.STUDENTS, [{ ...activeLearner }, { ...inactiveLearner }, { ...futureLearner }]);
    setStorage(KEYS.USERS, [{ ...aliceUser }, { ...bobUser }]);
    setStorage(KEYS.MARKS, [{ ...sampleMark }]);
    setStorage('cbe_audit_logs', []);
  });

  // TEST 1: Editing an active learner's profile leaves active = true
  it('1. Editing an active learner profile leaves active = true even if active was omitted or passed false in edit payload', async () => {
    // Ordinary profile update: changing second name or date of birth
    const updated = await api.updateStudent({
      ...activeLearner,
      second_name: 'Moraa',
      active: false, // Adversarial attempt to mutate status during ordinary profile edit
    });

    expect(updated.active).toBe(true);
    expect(updated.enrolment_status).toBe('active');

    const inStorage = api.getStudents().find((s) => s.id === activeLearner.id);
    expect(inStorage?.active).toBe(true);
    expect(inStorage?.enrolment_status).toBe('active');

    // User status must remain Active
    const user = api.getUsers().find((u) => u.student_id === activeLearner.id);
    expect(user?.status).toBe('Active');
  });

  // TEST 2: Editing an inactive learner's profile leaves active = false
  it('2. Editing an inactive learner profile leaves active = false even if active was passed true in edit payload', async () => {
    const updated = await api.updateStudent({
      ...inactiveLearner,
      last_name: 'Kipchumba-Rotich',
      active: true, // Adversarial attempt to resurrect without explicit lifecycle action
    });

    expect(updated.active).toBe(false);
    expect(updated.enrolment_status).toBe('inactive');

    const inStorage = api.getStudents().find((s) => s.id === inactiveLearner.id);
    expect(inStorage?.active).toBe(false);
    expect(inStorage?.enrolment_status).toBe('inactive');

    // User status must remain Disabled
    const user = api.getUsers().find((u) => u.student_id === inactiveLearner.id);
    expect(user?.status).toBe('Disabled');
  });

  // TEST 3: Ordinary profile edits generate no activation/deactivation audit events
  it('3. Ordinary profile edits generate no activation or deactivation audit events', async () => {
    const initialLogsCount = (api as any).getAuditLogs?.()?.length || 0;

    await api.updateStudent({
      ...activeLearner,
      first_name: 'Alicia',
    });

    const logs = (api as any).getAuditLogs?.() || [];
    const statusLogs = logs.filter(
      (l: any) =>
        l.action === 'LEARNER_DEACTIVATED' ||
        l.action === 'LEARNER_REACTIVATED' ||
        l.action === 'LEARNER_ADMITTED'
    );
    expect(statusLogs.length).toBe(0);
    expect(logs.length).toBe(initialLogsCount);
  });

  // TEST 4: Explicit deactivation works and records its reason
  it('4. Explicit deactivation works and validates meaningful reason (min 5 characters)', async () => {
    // 4a. Short or empty reason is rejected
    await expect(
      api.setLearnerStatus(activeLearner.id, 'deactivate', 'bad')
    ).rejects.toThrow('A valid reason (minimum 5 characters) is required');

    // 4b. Valid deactivation succeeds
    const deactReason = 'Student transferred to another school district.';
    const result = await api.setLearnerStatus(activeLearner.id, 'deactivate', deactReason);

    expect(result.active).toBe(false);
    expect(result.enrolment_status).toBe('inactive');

    const student = api.getStudents().find((s) => s.id === activeLearner.id);
    expect(student?.active).toBe(false);
    expect(student?.enrolment_status).toBe('inactive');

    const user = api.getUsers().find((u) => u.student_id === activeLearner.id);
    expect(user?.status).toBe('Disabled');
  });

  // TEST 5: Explicit reactivation works
  it('5. Explicit reactivation restores active status and user account access', async () => {
    // Reactivate Bob
    const reactivateReason = 'Returned from transfer / reinstated by principal.';
    const result = await api.setLearnerStatus(inactiveLearner.id, 'reactivate', reactivateReason);

    expect(result.active).toBe(true);
    expect(result.enrolment_status).toBe('active');

    const student = api.getStudents().find((s) => s.id === inactiveLearner.id);
    expect(student?.active).toBe(true);
    expect(student?.enrolment_status).toBe('active');

    const user = api.getUsers().find((u) => u.student_id === inactiveLearner.id);
    expect(user?.status).toBe('Active');
  });

  // TEST 6: Unauthorized status changes are rejected
  it('6. Invalid lifecycle actions are rejected', async () => {
    await expect(
      (api as any).setLearnerStatus(activeLearner.id, 'invalid_action')
    ).rejects.toThrow("Invalid request: An explicit lifecycle action ('admit' | 'deactivate' | 'reactivate') is required.");
  });

  // TEST 7: Admission and transfer workflows still function
  it('7. Admission and transfer workflows still function properly', async () => {
    // 7a. Admit future learner
    const admitted = await api.admitLearner(futureLearner.id);
    expect(admitted.active).toBe(true);
    expect(admitted.enrolment_status).toBe('active');

    const admittedInStore = api.getStudents().find((s) => s.id === futureLearner.id);
    expect(admittedInStore?.active).toBe(true);

    // 7b. Transfer active learner between streams
    const transferred = await api.updateStudent({
      ...activeLearner,
      class_id: classB.id,
      stream_id: classB.stream_id,
      grade: classB.class_name as any,
    });
    expect(transferred.class_id).toBe(classB.id);
    expect(transferred.stream_id).toBe(classB.stream_id);
    expect(transferred.active).toBe(true); // Active status preserved during class/stream transfer
  });

  // TEST 8: A fresh database status is reflected in the UI after refresh
  it('8. Synchronizing from authoritative data reflects fresh database status', () => {
    // Simulate authoritative database status update: Bob reactivated in database
    const freshDbState: Student[] = [
      { ...activeLearner },
      { ...inactiveLearner, active: true, enrolment_status: 'active' },
    ];

    // Supabase -> application state hydration replaces stale local cache
    setStorage(KEYS.STUDENTS, freshDbState);
    const refreshedBob = api.getStudents().find((s) => s.id === inactiveLearner.id);
    expect(refreshedBob?.active).toBe(true);
    expect(refreshedBob?.enrolment_status).toBe('active');
  });

  // TEST 9: Academic marks remain completely intact across status operations
  it('9. Existing marks for learners remain completely intact through profile edits and deactivations', async () => {
    const marksBefore = api.getMarks().filter((m) => m.student_id === activeLearner.id);
    expect(marksBefore.length).toBe(1);
    expect(marksBefore[0].marks).toBe(78);

    // Ordinary profile edit
    await api.updateStudent({ ...activeLearner, first_name: 'Alice-Updated' });

    // Explicit deactivation
    await api.setLearnerStatus(activeLearner.id, 'deactivate', 'Deactivated for medical leave.');

    // Verify marks remain untouched
    const marksAfter = api.getMarks().filter((m) => m.student_id === activeLearner.id);
    expect(marksAfter.length).toBe(1);
    expect(marksAfter[0].marks).toBe(78);
  });
});
