import { PDF_COLORS } from '../pdfHelpers';

/**
 * @see utils/pdf/generateSignoffReport.js
 */
export function drawDonutSegment(
  doc,
  cx,
  cy,
  outerR,
  innerR,
  startDeg,
  endDeg,
  color,
) {
  if (Math.abs(endDeg - startDeg) < 0.1) return;
  doc.setFillColor(color[0], color[1], color[2]);
  const steps = Math.max(4, Math.round(Math.abs(endDeg - startDeg) / 2));
  const outer = [];
  const inner = [];
  for (let i = 0; i <= steps; i++) {
    const a =
      ((startDeg + ((endDeg - startDeg) * i) / steps - 90) * Math.PI) / 180;
    outer.push([cx + outerR * Math.cos(a), cy + outerR * Math.sin(a)]);
    inner.push([cx + innerR * Math.cos(a), cy + innerR * Math.sin(a)]);
  }
  const pts = [...outer, ...[...inner].reverse()];
  const segs = pts
    .slice(1)
    .map((pt, i) => [pt[0] - pts[i][0], pt[1] - pts[i][1]]);
  doc.lines(segs, pts[0][0], pts[0][1], [1, 1], 'F', true);
}

/**
 * @see utils/pdf/generateSignoffReport.js
 */
export function drawDonutWithLegend(
  doc,
  { cx, cy, outerR, innerR, passed, failed, pending },
) {
  const total = passed + failed + pending;
  if (total === 0) return { statsY: cy + outerR + 14, hasPending: false };

  const dSegs = [
    { label: 'Passed', value: passed, color: PDF_COLORS.pass },
    { label: 'Failed', value: failed, color: PDF_COLORS.fail },
    { label: 'Pending', value: pending, color: PDF_COLORS.pending },
  ].filter((s) => s.value > 0);

  let curAngle = 0;
  for (const seg of dSegs) {
    const sweep = (seg.value / total) * 360;
    drawDonutSegment(
      doc,
      cx,
      cy,
      outerR,
      innerR,
      curAngle,
      curAngle + sweep,
      seg.color,
    );
    curAngle += sweep;
  }

  const legendY = cy + outerR + 14;
  const legendItemW = 88;
  let lx = cx - (dSegs.length * legendItemW) / 2;
  for (const seg of dSegs) {
    doc.setFillColor(seg.color[0], seg.color[1], seg.color[2]);
    doc.rect(lx, legendY, 9, 9, 'F');
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(seg.label, lx + 13, legendY + 7.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(
      `${seg.value}`,
      lx + 13 + doc.getTextWidth(seg.label) + 4,
      legendY + 7.5,
    );
    lx += legendItemW;
  }

  const statsY = legendY + 22;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.bodyGray);
  doc.text(`Total Test Cases: ${total}`, cx, statsY, { align: 'center' });
  doc.text(`Total Passed: ${passed}`, cx, statsY + 14, { align: 'center' });
  doc.text(`Total Failed: ${failed}`, cx, statsY + 28, { align: 'center' });
  const hasPending = pending > 0;
  if (hasPending) {
    doc.text(`Total Pending: ${pending}`, cx, statsY + 42, { align: 'center' });
  }
  return { statsY, hasPending };
}
