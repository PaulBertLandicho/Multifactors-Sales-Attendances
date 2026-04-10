export function drawPayslipOnDoc(doc, {
  payroll,
  person,
  period,
  holidayPayDetails = [],
  totalHolidayPay = 0,
  absentCount = 0,
  totalDeductions = 0,
}, yOffset = 10) {
  if (!doc || !payroll || !person) return;

  const left = 10;
  const right = 200;
  const pageWidth = doc.internal.pageSize.getWidth();
  const lineHeight = 7;
  let y = yOffset;

  // Header
  doc.setFontSize(10);
  doc.text(`Date: ${(new Date()).toISOString().slice(0, 10)}`, right - 50, y);
  y += lineHeight * 1.5;

  doc.setFontSize(12);
  doc.text('Full Name:', left, y);
  doc.text(person.name || '', left + 25, y);

  // Person image (if available and valid data URL)
  let imageDrawn = false;
  if (
    person.registration_photo &&
    typeof person.registration_photo === 'string' &&
    person.registration_photo.startsWith('data:image/')
  ) {
    try {
      doc.addImage(person.registration_photo, 'JPEG', right - 50, y - 8, 30, 20);
      imageDrawn = true;
    } catch (e) {
      try {
        doc.addImage(person.registration_photo, 'PNG', right - 50, y - 8, 30, 20);
        imageDrawn = true;
      } catch (e2) {
        // fallback below
      }
    }
  }
  if (!imageDrawn) {
    doc.rect(right - 50, y - 8, 30, 20, 'S');
    doc.text('image', right - 35, y - 5, { align: 'center' });
  }

  y += lineHeight;
  doc.setFontSize(10);
  doc.text('Period:', left, y);
  doc.text(period || '', left + 20, y);
  y += lineHeight;
  doc.text('Total Days:', left, y);
  doc.text(String(payroll.daysPresent || ''), left + 35, y);

  y += lineHeight * 1.5;
  // Use Unicode peso sign (U+20B1), fallback to 'PHP' if not supported
  let peso = 'PHP';
  try {
    doc.getStringUnitWidth(peso);
  } catch (e) {
    peso = 'PHP';
  }

  // Helper to draw left label with a line on the right and value centered above the line
  const labelX = left + 40;
  const lineStartX = right - 70;
  const lineEndX = right - 10;
  const drawLinedField = (label, value, bold = false) => {
    if (bold) doc.setFont(undefined, 'bold');
    doc.text(label, labelX, y);
    if (bold) doc.setFont(undefined, 'normal');
    doc.line(lineStartX, y, lineEndX, y);
    const text = value != null && String(value).trim() !== '' ? String(value) : '';
    if (text) {
      const valueX = (lineStartX + lineEndX) / 2;
      doc.text(text, valueX, y - 1.5, { align: 'center' });
    }
    y += lineHeight;
  };

  // Earnings block fields
  drawLinedField(
    'Basic Salary Rate:',
    `${peso} ${(payroll.dailyRate ?? 0).toFixed(2)}`
  );
  drawLinedField(
    'Total of days worked (present):',
    String(payroll.daysPresent || 0)
  );
  drawLinedField('Overtime hrs:', String(payroll.otHours || ''));
  drawLinedField('Holiday Day(s):', String(holidayPayDetails.length || 0));
  // Allowance line with no preset value
  drawLinedField('Allowance:', '');
  drawLinedField(
    'Total:',
    `${peso} ${(payroll.gross + totalHolidayPay).toLocaleString()}`,
    true
  );

  y += lineHeight;
  doc.setFont(undefined, 'bold');
  doc.text('Late / Absent', pageWidth / 2, y, { align: 'center' });
  doc.setFont(undefined, 'normal');
  y += lineHeight;
  drawLinedField('Total numbers of Late:', String(payroll.lateCount || 0));
  drawLinedField('Total numbers of Absent:', String(absentCount || 0));

  // Monthly Share = SSS + Pag-ibig + PhilHealth
  const monthlyShare =
    (person.sss ? Number(payroll.sss) : 0) +
    (person.pag_ibig ? Number(payroll.pag_ibig) : 0) +
    (person.philhealth ? Number(payroll.philhealth) : 0);
  drawLinedField('Monthly Share:', `${peso} ${monthlyShare.toLocaleString()}`);
  drawLinedField(
    'Cash Advance:',
    `${peso} ${Number(payroll.cashAdvance || 0).toLocaleString()}`
  );
  drawLinedField('Total:', `${peso} ${totalDeductions.toLocaleString()}`, true);

  y += lineHeight;
  doc.text('Approved by:  Received from MULTIFACTORS SALES', left, y);
}

// Generate a single-person payslip PDF (used by PayslipModal)
export async function generatePayslipPdf(params) {
  if (!params || !params.payroll || !params.person) return;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  drawPayslipOnDoc(doc, params);
  doc.save(`${params.person.name}_payslip.pdf`);
}

// Generate a single PDF containing payslips for many records (used by PayrollPage)
export async function generateAllPayslipsPdf(list = []) {
  if (!Array.isArray(list) || list.length === 0) return;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Layout: two payslips per page, one on top, one on bottom
  const marginY = 10;
  const pageHeight = doc.internal.pageSize.getHeight();
  // Removed unused payslipHeight

  for (let i = 0; i < list.length; i++) {
    const params = list[i];
    const isTop = i % 2 === 0;
    const yOffset = isTop ? marginY : (pageHeight / 2) + marginY;
    // Draw payslip at yOffset
    drawPayslipOnDoc(doc, params, yOffset);
    // If next payslip is top (i.e., every 2 payslips), add a new page
    if (!isTop && i < list.length - 1) {
      doc.addPage();
    }
    // Draw a line between the two payslips on the same page
    if (isTop) {
      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      doc.line(5, pageHeight / 2, pageHeight * 2, pageHeight / 2);
    }
  }

  doc.save('payroll_summary_payslips.pdf');
}
