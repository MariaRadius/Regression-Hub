import { describe, expect, it, vi } from 'vitest';
import {
  drawPdfPageHeader,
  ensurePageSpace,
  loadPdf,
  writeText,
} from '../pdfHelpers';

/** @see utils/pdfHelpers.js */

describe('drawPdfPageHeader', () => {
  it('draws dark banner + teal accent stripe with given heights', () => {
    const doc = { setFillColor: vi.fn(), rect: vi.fn() };
    drawPdfPageHeader(doc, { width: 595, height: 100, accentHeight: 4 });
    expect(doc.setFillColor).toHaveBeenNthCalledWith(1, 15, 23, 42);
    expect(doc.rect).toHaveBeenNthCalledWith(1, 0, 0, 595, 100, 'F');
    expect(doc.setFillColor).toHaveBeenNthCalledWith(2, 13, 148, 136);
    expect(doc.rect).toHaveBeenNthCalledWith(2, 0, 0, 595, 4, 'F');
  });

  it('accepts a custom accent color (e.g. red for failure pages)', () => {
    const doc = { setFillColor: vi.fn(), rect: vi.fn() };
    drawPdfPageHeader(doc, {
      width: 800,
      height: 32,
      accentHeight: 3,
      accent: [220, 38, 38],
    });
    expect(doc.setFillColor).toHaveBeenLastCalledWith(220, 38, 38);
  });
});

describe('loadPdf', () => {
  it('returns { jsPDF, autoTable } resolved across v3/v4 export shapes', async () => {
    const { jsPDF, autoTable } = await loadPdf();
    expect(typeof jsPDF).toBe('function');
    expect(typeof autoTable).toBe('function');
  });
});

describe('writeText', () => {
  const makeDoc = () => ({
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    text: vi.fn(),
  });

  it('applies h2 style (bold, 11, black) and draws text at x,y', () => {
    const doc = makeDoc();
    writeText(doc, 'Heading', 36, 100, 'h2');
    expect(doc.setFont).toHaveBeenCalledWith('helvetica', 'bold');
    expect(doc.setFontSize).toHaveBeenCalledWith(11);
    expect(doc.setTextColor).toHaveBeenCalledWith(0, 0, 0);
    expect(doc.text).toHaveBeenCalledWith('Heading', 36, 100, {});
  });

  it('applies body style (normal, 10, bodyGray) and forwards opts', () => {
    const doc = makeDoc();
    writeText(doc, 'paragraph', 36, 120, 'body', { align: 'center' });
    expect(doc.setFont).toHaveBeenCalledWith('helvetica', 'normal');
    expect(doc.setFontSize).toHaveBeenCalledWith(10);
    expect(doc.setTextColor).toHaveBeenCalledWith(40, 40, 40);
    expect(doc.text).toHaveBeenCalledWith('paragraph', 36, 120, {
      align: 'center',
    });
  });
});

describe('ensurePageSpace', () => {
  it('returns the same y when there is room', () => {
    const doc = { addPage: vi.fn() };
    const y = ensurePageSpace(doc, 100, 50, 800);
    expect(y).toBe(100);
    expect(doc.addPage).not.toHaveBeenCalled();
  });

  it('adds a page and returns resetY when content would overflow', () => {
    const doc = { addPage: vi.fn() };
    const y = ensurePageSpace(doc, 780, 50, 800, 60);
    expect(doc.addPage).toHaveBeenCalled();
    expect(y).toBe(60);
  });
});
