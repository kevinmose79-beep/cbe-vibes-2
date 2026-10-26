import { describe, it, expect } from 'vitest';
import { NextTermOpeningDateModalProps } from '../components/NextTermOpeningDateModal';

/**
 * Pure evaluation mirroring NextTermOpeningDateModal's badge and message resolution
 */
function resolveBatchModalDisplay(props: Partial<NextTermOpeningDateModalProps>) {
  const { downloadContext = 'single', totalCount, cohortCount, isProcessing = false, batchProgress } = props;
  const effectiveCount = (typeof totalCount === 'number' ? totalCount : cohortCount) || 0;

  const progressPercent = batchProgress && batchProgress.total > 0
    ? Math.min(100, Math.max(0, Math.round((batchProgress.current / batchProgress.total) * 100)))
    : null;

  const badgeText =
    downloadContext === 'batch'
      ? (effectiveCount > 0 ? `Batch: ${effectiveCount} Terminal Reports` : 'Batch: Terminal Reports')
      : downloadContext === 'zip'
      ? `ZIP Archive`
      : 'Terminal Report';

  const batchExplanation =
    downloadContext === 'batch' && effectiveCount > 0
      ? `This confirmed date will be applied uniformly to all ${effectiveCount} report cards in this batch download.`
      : null;

  const buttonText = isProcessing
    ? downloadContext === 'batch'
      ? progressPercent !== null
        ? `Generating Batch PDF (${progressPercent}%)...`
        : 'Generating Batch PDF...'
      : 'Generating PDF...'
    : downloadContext === 'batch'
    ? 'Confirm & Generate Batch PDF'
    : 'Confirm & Download PDF';

  return { effectiveCount, badgeText, batchExplanation, buttonText, progressPercent };
}

describe('NextTermOpeningDateModal Batch Count Display Verification', () => {
  it('1. Correctly formats badge when totalCount is provided (e.g. Grade 9, 76 learners)', () => {
    const res = resolveBatchModalDisplay({
      downloadContext: 'batch',
      totalCount: 76,
    });
    expect(res.effectiveCount).toBe(76);
    expect(res.badgeText).toBe('Batch: 76 Terminal Reports');
    expect(res.batchExplanation).toBe(
      'This confirmed date will be applied uniformly to all 76 report cards in this batch download.'
    );
  });

  it('2. Correctly formats badge when only cohortCount is provided (alias backwards compatibility)', () => {
    const res = resolveBatchModalDisplay({
      downloadContext: 'batch',
      cohortCount: 38,
    });
    expect(res.effectiveCount).toBe(38);
    expect(res.badgeText).toBe('Batch: 38 Terminal Reports');
    expect(res.batchExplanation).toBe(
      'This confirmed date will be applied uniformly to all 38 report cards in this batch download.'
    );
  });

  it('3. Prefeers totalCount when both totalCount and cohortCount are provided', () => {
    const res = resolveBatchModalDisplay({
      downloadContext: 'batch',
      totalCount: 76,
      cohortCount: 76,
    });
    expect(res.effectiveCount).toBe(76);
    expect(res.badgeText).toBe('Batch: 76 Terminal Reports');
  });

  it('4. Correctly displays "Terminal Report" when downloadContext is single', () => {
    const res = resolveBatchModalDisplay({
      downloadContext: 'single',
      studentName: 'Amani Wanjiku',
    });
    expect(res.badgeText).toBe('Terminal Report');
    expect(res.batchExplanation).toBeNull();
  });

  it('5. Correctly displays "ZIP Archive" when downloadContext is zip', () => {
    const res = resolveBatchModalDisplay({
      downloadContext: 'zip',
    });
    expect(res.badgeText).toBe('ZIP Archive');
    expect(res.batchExplanation).toBeNull();
  });

  it('6. Displays "Confirm & Generate Batch PDF" in batch mode when not processing', () => {
    const res = resolveBatchModalDisplay({
      downloadContext: 'batch',
      totalCount: 76,
      isProcessing: false,
    });
    expect(res.buttonText).toBe('Confirm & Generate Batch PDF');
  });

  it('7. Displays "Confirm & Download PDF" in single mode when not processing', () => {
    const res = resolveBatchModalDisplay({
      downloadContext: 'single',
      studentName: 'Amani Wanjiku',
      isProcessing: false,
    });
    expect(res.buttonText).toBe('Confirm & Download PDF');
  });

  it('8. Displays "Generating Batch PDF..." in batch mode when isProcessing is true and batchProgress is not yet available', () => {
    const resBatch = resolveBatchModalDisplay({
      downloadContext: 'batch',
      totalCount: 76,
      isProcessing: true,
    });
    expect(resBatch.buttonText).toBe('Generating Batch PDF...');

    const resSingle = resolveBatchModalDisplay({
      downloadContext: 'single',
      isProcessing: true,
    });
    expect(resSingle.buttonText).toBe('Generating PDF...');
  });

  it('9. Correctly formats loading percentage in batch mode button (e.g. 15 of 33 learners = 45%)', () => {
    const res = resolveBatchModalDisplay({
      downloadContext: 'batch',
      totalCount: 33,
      isProcessing: true,
      batchProgress: { current: 15, total: 33 },
    });
    expect(res.progressPercent).toBe(45);
    expect(res.buttonText).toBe('Generating Batch PDF (45%)...');
  });

  it('10. Correctly handles 0% and 100% progress boundary states', () => {
    const resStart = resolveBatchModalDisplay({
      downloadContext: 'batch',
      totalCount: 33,
      isProcessing: true,
      batchProgress: { current: 0, total: 33 },
    });
    expect(resStart.progressPercent).toBe(0);
    expect(resStart.buttonText).toBe('Generating Batch PDF (0%)...');

    const resDone = resolveBatchModalDisplay({
      downloadContext: 'batch',
      totalCount: 33,
      isProcessing: true,
      batchProgress: { current: 33, total: 33 },
    });
    expect(resDone.progressPercent).toBe(100);
    expect(resDone.buttonText).toBe('Generating Batch PDF (100%)...');
  });
});
