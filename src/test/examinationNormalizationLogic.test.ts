import { describe, it, expect } from 'vitest';
import { ClassStream } from '../types';

describe('Examination Edit Targeting Normalization Logic', () => {
  // Pure function replica of the normalization logic added in handleOpenEdit
  const normalizeApplicableClasses = (
    applicableClasses: string[] | undefined,
    classes: ClassStream[]
  ): string[] => {
    const rawApplicable = Array.isArray(applicableClasses) ? applicableClasses : [];
    const validTargetIds = new Set<string>();
    
    (classes || []).forEach((c) => {
      if (c.id) validTargetIds.add(c.id);
      if (c.stream_id) validTargetIds.add(c.stream_id);
    });
    
    return rawApplicable.filter((id) => validTargetIds.has(id));
  };

  // Authoritative current options mock (from Supabase schema sync)
  const currentClassOptions: ClassStream[] = [
    {
      id: '6ed8a9ed-d33b-4976-9076-fd175d22f60e', // parent class UUID
      stream_id: 'c061fdba-fa77-46d2-a63c-d6d8ec2e99c6', // Blue stream UUID
      class_name: 'Grade 6',
      stream: 'Blue',
      education_level: 'Upper Primary',
      status: 'Active',
      allocated_subject_ids: []
    },
    {
      id: '6ed8a9ed-d33b-4976-9076-fd175d22f60e', // parent class UUID
      stream_id: 'f358ed2e-fd9f-47aa-8622-a9bb997375e7', // Red stream UUID
      class_name: 'Grade 6',
      stream: 'Red',
      education_level: 'Upper Primary',
      status: 'Active',
      allocated_subject_ids: []
    }
  ];

  it('Test 1 — obsolete seed IDs are removed when not present as authoritative options', () => {
    const obsoleteInput = ['cls_g6_b', 'cls_g6_r'];
    const result = normalizeApplicableClasses(obsoleteInput, currentClassOptions);
    expect(result).toEqual([]);
  });

  it('Test 2 — valid stream IDs are strictly preserved', () => {
    const validStreamInput = [
      'c061fdba-fa77-46d2-a63c-d6d8ec2e99c6',
      'f358ed2e-fd9f-47aa-8622-a9bb997375e7'
    ];
    const result = normalizeApplicableClasses(validStreamInput, currentClassOptions);
    expect(result).toEqual([
      'c061fdba-fa77-46d2-a63c-d6d8ec2e99c6',
      'f358ed2e-fd9f-47aa-8622-a9bb997375e7'
    ]);
  });

  it('Test 3 — valid parent class ID is strictly preserved', () => {
    const validClassInput = ['6ed8a9ed-d33b-4976-9076-fd175d22f60e'];
    const result = normalizeApplicableClasses(validClassInput, currentClassOptions);
    expect(result).toEqual(['6ed8a9ed-d33b-4976-9076-fd175d22f60e']);
  });

  it('Test 4 — mixed historical/current values are correctly normalized', () => {
    const mixedInput = [
      'cls_g6_b',
      'cls_g6_r',
      '6ed8a9ed-d33b-4976-9076-fd175d22f60e',
      'c061fdba-fa77-46d2-a63c-d6d8ec2e99c6',
      'f358ed2e-fd9f-47aa-8622-a9bb997375e7'
    ];
    const result = normalizeApplicableClasses(mixedInput, currentClassOptions);
    expect(result).toEqual([
      '6ed8a9ed-d33b-4976-9076-fd175d22f60e',
      'c061fdba-fa77-46d2-a63c-d6d8ec2e99c6',
      'f358ed2e-fd9f-47aa-8622-a9bb997375e7'
    ]);
  });
});
