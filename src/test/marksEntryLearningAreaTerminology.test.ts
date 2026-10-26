import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Marks Entry Learning Area Terminology', () => {
  const marksEntryPath = path.resolve('src/components/MarksEntryTable.tsx');
  const marksEntryContent = fs.readFileSync(marksEntryPath, 'utf8');

  it('verifies filter header uses "Learning Area"', () => {
    expect(marksEntryContent).toContain('Select Target Assessment, Class, Learning Area & Assessment Out Of Grid');
    expect(marksEntryContent).not.toContain('Select Target Assessment, Class, Subject & Assessment Out Of Grid');
  });

  it('verifies input label uses "Learning Area *"', () => {
    expect(marksEntryContent).toContain('Learning Area *</label>');
    expect(marksEntryContent).not.toContain('Subject *</label>');
  });

  it('verifies select option uses "Select Learning Area"', () => {
    expect(marksEntryContent).toContain('<option value="">Select Learning Area</option>');
    expect(marksEntryContent).not.toContain('<option value="">Select Subject</option>');
  });

  it('verifies selection prompt and badge use "Learning Area"', () => {
    expect(marksEntryContent).toContain('Please explicitly select an <strong>Assessment</strong>, <strong>Class/Stream</strong>, <strong>Learning Area</strong>');
    expect(marksEntryContent).toContain("Learning Area: {selectedSubject ? selectedSubject.subject_name : 'Select Learning Area'}");
  });

  it('verifies export buttons and error messages use "Learning Area"', () => {
    expect(marksEntryContent).toContain('Raw Marks — All Learning Areas');
    const hasCorrectErrorMessage =
      marksEntryContent.includes('Please select Assessment, Class, and Learning Area to export learning area assessment report.') ||
      marksEntryContent.includes('Please select Assessment, Class, and Learning Area to export learning area performance report.');
    expect(hasCorrectErrorMessage).toBe(true);
  });
});
