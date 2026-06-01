export const PDF_LAYOUT = {
  orientation: 'portrait',
  unit: 'pt',
  format: 'a4',
  marginLeft: 36,
  marginRight: 36,
  coverHeaderHeight: 100,
  coverAccentHeight: 4,
  sectionHeaderHeight: 32,
  sectionAccentHeight: 3,
  coverTitleY: 46,
  coverSubtitleY: 64,
  coverGeneratedY: 80,
  sectionTitleY: 22,
  sectionContentStartY: 44,
};

export const PDF_COLORS = {
  dark: [15, 23, 42],
  teal: [13, 148, 136],
  headSlate: [30, 41, 59],
  pass: [22, 163, 74],
  fail: [220, 38, 38],
  pending: [217, 119, 6],
  bugHead: [153, 27, 27],
  bodyGray: [40, 40, 40],
  mutedGray: [50, 50, 50],
};

export const PDF_LINE_H = 13;

const PDF_TEXT_STYLES = {
  h1: { size: 14, weight: 'bold', color: [0, 0, 0] },
  h2: { size: 11, weight: 'bold', color: [0, 0, 0] },
  h3: { size: 10, weight: 'bold', color: [0, 0, 0] },
  body: { size: 10, weight: 'normal', color: PDF_COLORS.bodyGray },
  muted: { size: 9.5, weight: 'normal', color: PDF_COLORS.mutedGray },
};

function applyStyle(doc, style) {
  const s = PDF_TEXT_STYLES[style];
  doc.setFont('helvetica', s.weight);
  doc.setFontSize(s.size);
  doc.setTextColor(...s.color);
}

/**
 * @see utils/__tests__/pdfHelpers.test.js
 */
export function advanceY(y, lines, lineH = PDF_LINE_H, extra = 0) {
  return y + lines * lineH + extra;
}

/**
 * @see utils/__tests__/pdfHelpers.test.js
 */
export function writeText(doc, text, x, y, style, opts = {}) {
  applyStyle(doc, style);
  doc.text(text, x, y, opts);
}

/**
 * @see utils/__tests__/pdfHelpers.test.js
 */
export function wrapParagraph(doc, text, x, y, maxW, style) {
  applyStyle(doc, style);
  const lines = doc.splitTextToSize(text, maxW);
  doc.text(lines, x, y);
  return lines.length;
}

/**
 * @see utils/__tests__/pdfHelpers.test.js
 */
export function writeLabeledLine(doc, { label, value, x, y }) {
  applyStyle(doc, 'h3');
  doc.text(label, x, y);
  const labelW = doc.getTextWidth(label);
  applyStyle(doc, 'body');
  doc.text(value, x + labelW, y);
  return y;
}

/**
 * @see utils/__tests__/pdfHelpers.test.js
 */
export function writeTitledParagraph(doc, { title, body, x, y, maxW }) {
  const titleText = `${title}: `;
  applyStyle(doc, 'h3');
  doc.text(titleText, x, y);
  const titleW = doc.getTextWidth(titleText);
  applyStyle(doc, 'muted');
  const firstLineW = maxW - titleW;
  const lines = doc.splitTextToSize(body, firstLineW);
  doc.text(lines[0], x + titleW, y);
  for (let i = 1; i < lines.length; i++) {
    y += PDF_LINE_H;
    doc.text(lines[i], x, y);
  }
  return y + 18;
}

/**
 * @see utils/__tests__/pdfHelpers.test.js
 */
export function ensurePageSpace(doc, y, needed, H, resetY = 50) {
  if (y + needed > H) {
    doc.addPage();
    return resetY;
  }
  return y;
}

/**
 * @see utils/__tests__/pdfHelpers.test.js
 */
export function drawPdfPageHeader(
  doc,
  { width, height, accentHeight, accent = PDF_COLORS.teal },
) {
  doc.setFillColor(...PDF_COLORS.dark);
  doc.rect(0, 0, width, height, 'F');
  doc.setFillColor(...accent);
  doc.rect(0, 0, width, accentHeight, 'F');
}

/**
 * @see utils/__tests__/pdfHelpers.test.js
 */
export async function loadPdf() {
  const jsPDFModule = await import('jspdf');
  const jsPDF = jsPDFModule.jsPDF ?? jsPDFModule.default;
  const autoTableModule = await import('jspdf-autotable');
  const autoTable = autoTableModule.default ?? autoTableModule.autoTable;
  return { jsPDF, autoTable };
}

/**
 * @see utils/pdf/__tests__/generateSignoffReport.test.js
 */
export async function createPdfDocument() {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({
    orientation: PDF_LAYOUT.orientation,
    unit: PDF_LAYOUT.unit,
    format: PDF_LAYOUT.format,
  });
  const W = doc.internal.pageSize.width;
  const H = doc.internal.pageSize.height;
  const ML = PDF_LAYOUT.marginLeft;
  const MR = PDF_LAYOUT.marginRight;
  const CW = W - ML - MR;
  return { doc, autoTable, W, H, ML, MR, CW };
}

/**
 * @see utils/pdf/generateSignoffReport.js
 */
export function drawCoverPage(doc, { W, ML, title, subtitle }) {
  drawPdfPageHeader(doc, {
    width: W,
    height: PDF_LAYOUT.coverHeaderHeight,
    accentHeight: PDF_LAYOUT.coverAccentHeight,
  });
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(title, ML, PDF_LAYOUT.coverTitleY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(subtitle, ML, PDF_LAYOUT.coverSubtitleY);
  doc.text(
    `Generated: ${new Date().toLocaleString()}`,
    ML,
    PDF_LAYOUT.coverGeneratedY,
  );
}

/**
 * @see utils/pdf/generateSignoffReport.js
 */
export function drawSectionBanner(
  doc,
  { W, ML, MR, title, subtitle, variant = 'default' },
) {
  const accent = variant === 'error' ? PDF_COLORS.fail : PDF_COLORS.teal;
  drawPdfPageHeader(doc, {
    width: W,
    height: PDF_LAYOUT.sectionHeaderHeight,
    accentHeight: PDF_LAYOUT.sectionAccentHeight,
    accent,
  });
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, ML, PDF_LAYOUT.sectionTitleY);
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(subtitle, W - MR, PDF_LAYOUT.sectionTitleY, { align: 'right' });
  }
}

/**
 * @see utils/pdf/generateSignoffReport.js
 */
export function renderTable(
  doc,
  autoTable,
  {
    head,
    body,
    startY,
    ML,
    MR,
    headFillColor,
    columns = [],
    theme = 'striped',
  },
) {
  const tableWidth = doc.internal.pageSize.getWidth() - ML - MR;
  const columnStyles = {};
  columns.forEach((c, i) => {
    if (c.width !== undefined) {
      columnStyles[i] = { cellWidth: (c.width / 100) * tableWidth };
    }
  });

  autoTable(doc, {
    startY,
    head,
    body,
    margin: { left: ML, right: MR },
    theme,
    styles: {
      fontSize: 8,
      cellPadding: 4,
      overflow: 'linebreak',
      halign: 'left',
    },
    headStyles: { fillColor: headFillColor, textColor: 255, halign: 'left' },
    columnStyles,
    didParseCell: (data) => {
      const col = columns[data.column.index];
      if (!col) return;
      if (data.section === 'head' && col.headerHalign) {
        data.cell.styles.halign = col.headerHalign;
      } else if (data.section === 'body' && col.halign) {
        data.cell.styles.halign = col.halign;
      }
    },
  });
}
