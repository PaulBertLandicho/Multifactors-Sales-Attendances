export function drawPayslipOnDoc(
  doc,
  {
    payroll,
    person,
    period,
    holidayPayDetails = [],
    totalHolidayPay = 0,
    absentCount = 0,
    totalDeductions = 0,
    // optional: total overtime hours as decimal (e.g. 1.5)
    otHours,
    // additional computed values (optional)
    daysWorked = payroll?.daysPresent || 0,
    standardPayAmount = null,
    otPay = null,
    gross = null,
    cashAdvanceEntries = [],
    cashAdvanceTotalInPeriod = 0,
  },
  yOffset = 10
) {
  if (!doc || !payroll || !person) return;

  const left = 10;
  const right = 200;
  const pageWidth = doc.internal.pageSize.getWidth();
  const lineHeight = 7;
  let y = yOffset;

  // Header
  doc.setFontSize(10);
  doc.text(`Date: ${new Date().toISOString().slice(0, 10)}`, right - 50, y);
  y += lineHeight * 1.5;

  doc.setFontSize(12);
  doc.text("Full Name:", left, y);
  doc.text(person.name || "", left + 25, y);

  // Person image (if available and valid data URL)
  let imageDrawn = false;
  if (
    person.registration_photo &&
    typeof person.registration_photo === "string" &&
    person.registration_photo.startsWith("data:image/")
  ) {
    try {
      doc.addImage(
        person.registration_photo,
        "JPEG",
        right - 50,
        y - 8,
        30,
        20
      );
      imageDrawn = true;
    } catch (e) {
      try {
        doc.addImage(
          person.registration_photo,
          "PNG",
          right - 50,
          y - 8,
          30,
          20
        );
        imageDrawn = true;
      } catch (e2) {
        // fallback below
      }
    }
  }
  if (!imageDrawn) {
    doc.rect(right - 50, y - 8, 30, 20, "S");
    doc.text("image", right - 35, y - 5, { align: "center" });
  }

  y += lineHeight;
  doc.setFontSize(10);
  doc.text("Period:", left, y);
  // Format period for readability (e.g. 2026-04-07_to_2026-04-21 -> April 07, 2026 to April 21, 2026)
  function formatPeriod(p) {
    if (!p) return "";
    try {
      const s = String(p).replace(/_/g, " ");
      const matches = Array.from(s.matchAll(/(\d{4}[-/]\d{2}[-/]\d{2})/g)).map(m => m[1]);
      if (matches.length >= 2) {
        const d1 = new Date(matches[0].replace(/\//g, '-'));
        const d2 = new Date(matches[1].replace(/\//g, '-'));
        if (!Number.isNaN(d1.getTime()) && !Number.isNaN(d2.getTime())) {
          const f1 = d1.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
          const f2 = d2.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
          return `${f1} to ${f2}`;
        }
      }
      const single = s.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
      if (single) {
        const d = new Date(single[1].replace(/\//g, '-'));
        if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
      }
      const pdate = new Date(s);
      if (!Number.isNaN(pdate.getTime())) return pdate.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
    } catch (e) {}
    return String(p);
  }

  doc.text(formatPeriod(period) || "", left + 20, y);
  y += lineHeight;
  doc.text("Total Days:", left, y);
  doc.text(String(daysWorked || payroll.daysPresent || ""), left + 35, y);

  y += lineHeight * 1.5;
  // Use Unicode peso sign (U+20B1), fallback to 'PHP' if not supported
  let peso = "PHP";
  try {
    // some jsPDF builds may throw for unsupported glyphs; if so, fallback
    doc.getStringUnitWidth(peso);
  } catch (e) {
    peso = "PHP";
  }

  // Helper to draw left label with a line on the right and value centered above the line
  const labelX = left + 40;
  const lineStartX = right - 70;
  const lineEndX = right - 10;
  const drawLinedField = (label, value, bold = false) => {
    if (bold) doc.setFont(undefined, "bold");
    doc.text(label, labelX, y);
    if (bold) doc.setFont(undefined, "normal");
    doc.line(lineStartX, y, lineEndX, y);
    const text =
      value != null && String(value).trim() !== "" ? String(value) : "";
    if (text) {
      const valueX = (lineStartX + lineEndX) / 2;
      doc.text(text, valueX, y - 1.5, { align: "center" });
    }
    y += lineHeight;
  };

  // Earnings block fields
  drawLinedField(
    "Basic Salary Rate:",
    `${peso} ${(payroll.dailyRate ?? 0).toFixed(2)}`
  );
  drawLinedField(
    "Total of days worked (present):",
    String(daysWorked || payroll.daysPresent || 0)
  );
  // Determine overtime hours to display: prefer explicit param, fallback to payroll value
  const otHoursToShow = typeof otHours !== "undefined" ? otHours : Number(payroll.otHours || 0);
  const formatHoursDecimalToLabel = (hrs) => {
    if (!hrs || Number(hrs) <= 0) return "0.00";
    const h = Math.floor(hrs);
    const m = Math.round((hrs - h) * 60);
    const parts = [];
    if (h > 0) parts.push(`${h}hr`);
    if (m > 0) parts.push(`${m}min`);
    return `${Number(hrs).toFixed(2)} (${parts.join(" and ") || "0min"})`;
  };
  drawLinedField("Overtime hrs:", formatHoursDecimalToLabel(otHoursToShow));
  drawLinedField("Holiday Day(s):", String(holidayPayDetails.length || 0));
  // Allowance line with no preset value
  // Use explicit gross if provided, otherwise fallback to payroll.gross
  const grossToShow =
    gross != null
      ? gross
      : typeof payroll.gross !== "undefined"
      ? payroll.gross
      : (standardPayAmount || 0) + (otPay || 0) + totalHolidayPay;
  drawLinedField("Total:", `${peso} ${Number(grossToShow).toLocaleString()}`, true);

  y += lineHeight;
  doc.setFont(undefined, "bold");
  doc.text("Late / Absent", pageWidth / 2, y, { align: "center" });
  doc.setFont(undefined, "normal");
  y += lineHeight;
  drawLinedField("Total numbers of Late:", String(payroll.lateCount || 0));
  drawLinedField("Total numbers of Absent:", String(absentCount || 0));

  // Monthly Share = SSS + Pag-ibig + PhilHealth
  const monthlyShare =
    (person.sss ? Number(payroll.sss) : 0) +
    (person.pag_ibig ? Number(payroll.pag_ibig) : 0) +
    (person.philhealth ? Number(payroll.philhealth) : 0);
  drawLinedField("Monthly Share:", `${peso} ${monthlyShare.toLocaleString()}`);
  drawLinedField(
    "Cash Advance:",
    `${peso} ${Number(cashAdvanceTotalInPeriod || payroll.cashAdvance || 0).toLocaleString()}`
  );
  // If there are individual cash advance entries, render a brief breakdown above the total
  if (Array.isArray(cashAdvanceEntries) && cashAdvanceEntries.length > 0) {
    y += lineHeight * 0.2;
    doc.setFontSize(9);
    doc.text("Cash Advance Details:", left + 12, y);
    y += lineHeight;
    cashAdvanceEntries.forEach((e) => {
      const label = e.created_at ? new Date(e.created_at).toLocaleString() : "";
      const value = `${peso} ${Number(e.amount || 0).toLocaleString()}`;
      drawLinedField(label, value, false);
    });
    y += lineHeight * 0.2;
    doc.setFontSize(10);
  }
  drawLinedField("Total:", `${peso} ${totalDeductions.toLocaleString()}`, true);

  y += lineHeight;
  doc.text("Approved by:  Received from MULTIFACTORS SALES", left, y);
}

// Generate a single-person payslip PDF (used by PayslipModal)
export async function generatePayslipPdf(params) {
  if (!params || !params.payroll || !params.person) return;
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  drawPayslipOnDoc(doc, params);
  doc.save(`${params.person.name}_payslip.pdf`);
}

// Generate a single PDF containing payslips for many records (used by PayrollPage)
export async function generateAllPayslipsPdf(list = []) {
  if (!Array.isArray(list) || list.length === 0) return;
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Layout: two payslips per page, one on top, one on bottom
  const marginY = 10;
  const pageHeight = doc.internal.pageSize.getHeight();
  // Removed unused payslipHeight

  for (let i = 0; i < list.length; i++) {
    const params = list[i];
    const isTop = i % 2 === 0;
    const yOffset = isTop ? marginY : pageHeight / 2 + marginY;
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

  doc.save("payroll_summary_payslips.pdf");
}
