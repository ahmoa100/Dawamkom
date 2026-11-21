import {dateText} from './date-format.js';
import { csvReport } from './bank-payroll.js';
const encode = text => new TextEncoder().encode(text);
const xml = value => value.replace(/[<>&"']/g, character => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
})[character] ?? character);

export function zip(files) {
  const parts = [], directory = [];
  let offset = 0, size = 0;
  const header = (length, signature) => {
    const bytes = new Uint8Array(length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, signature, true);
    return [bytes, view];
  };
  for (const [path, text] of Object.entries(files)) {
    const name = encode(path), data = encode(text);
    let crc = -1;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const [local, l] = header(30, 0x04034b50);
    const [central, c] = header(46, 0x02014b50);
    l.setUint16(4, 20, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    l.setUint16(12, 33, true);
    c.setUint16(14, 33, true);
    l.setUint32(14, ~crc, true);
    c.setUint32(16, ~crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, data.length, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    l.setUint16(26, name.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    parts.push(local, name, data);
    directory.push(central, name);
    offset += local.length + name.length + data.length;
    size += central.length + name.length;
  }
  const [end, e] = header(22, 0x06054b50);
  e.setUint16(8, directory.length / 2, true);
  e.setUint16(10, directory.length / 2, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  return [...parts, ...directory, end];
}

function excelFile(report) {
  const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const spreadsheet = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = (type, target) => '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' +
    office + '/' + type + '" Target="' + target + '"/></Relationships>';
  const rows = report.rows.map((row, rowIndex) => '<row>' + row.map((cell, column) =>
    report.type === 'payroll' && rowIndex > 0 && column > (report.bankTemplate?3:1) && /^-?\d+(?:\.\d+)?$/.test(cell)
      ? '<c t="n"><v>' + cell + '</v></c>' : '<c t="inlineStr"><is><t xml:space="preserve">' +
        xml(cell.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')) + '</t></is></c>').join('') + '</row>').join('');
  const files = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': rel('officeDocument', 'xl/workbook.xml'),
    'xl/workbook.xml': '<workbook xmlns="' + spreadsheet + '" xmlns:r="' + office + '"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': rel('worksheet', 'worksheets/sheet1.xml'),
    'xl/worksheets/sheet1.xml': '<worksheet xmlns="' + spreadsheet + '"><sheetViews><sheetView workbookViewId="0" rightToLeft="' +
      (report.language === 'ar' ? '1' : '0') + '"/></sheetViews><cols><col min="1" max="1" width="16" customWidth="1"/><col min="2" max="2" width="34" customWidth="1"/><col min="3" max="' +
      report.rows[0].length + '" width="28" customWidth="1"/></cols><sheetData>' + rows + '</sheetData></worksheet>',
  };
  return new Blob(zip(files), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function pdfFile(report) {
  const canvas = document.createElement('canvas');
  const width = 1684, height = 1190;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const rtl = report.language === 'ar';
  const [headers, ...body] = report.rows;
  const pages = [];
  const payroll = report.type === 'payroll';
  const detailEnd = payroll ? headers.length - 3 : headers.length;
  for (let column = 2; column < detailEnd; column += 7) {
    for (let row = 0; row < Math.max(body.length, 1); row += 25) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.direction = rtl ? 'rtl' : 'ltr';
      ctx.textAlign = rtl ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 36px Arial';
      ctx.fillStyle = '#17343b';
      ctx.fillText(report.title, rtl ? width - 45 : 45, 55, width - 90);
      ctx.font = '24px Arial';
      ctx.fillText((report.company ? report.company + ' | ' : '') + (report.bank ? (rtl ? report.bank.name : report.bank.nameEn) + ' | ' : '') + report.start + ' – ' + report.end, rtl ? width - 45 : 45, 95, width - 90);
      const pageRows = [headers, ...body.slice(row, row + 25)];
      pageRows.forEach((cells, index) => {
        const selected = [...cells.slice(0, 2), ...cells.slice(column, Math.min(column + 7, detailEnd)), ...(payroll ? cells.slice(-3) : [])];
        const widths = [135, 300, ...selected.slice(2).map(() => (width - 525) / (selected.length - 2))];
        let x = rtl ? width - 45 : 45;
        const y = 126 + index * 39;
        ctx.font = (index === 0 ? 'bold ' : '') + (payroll ? '20px Arial' : '22px Arial');
        selected.forEach((cell, cellIndex) => {
          const w = widths[cellIndex];
          const left = rtl ? x - w : x;
          ctx.fillStyle = index === 0 ? '#dcebea' : index % 2 ? '#f4f8f8' : '#fff';
          ctx.fillRect(left, y, w, 39);
          ctx.strokeStyle = '#d3e0e2';
          ctx.strokeRect(left, y, w, 39);
          ctx.fillStyle = '#17343b';
          ctx.fillText(cell, rtl ? x - 8 : x + 8, y + 20, w - 16);
          x += rtl ? -w : w;
        });
      });
      pages.push(Uint8Array.from(atob(canvas.toDataURL('image/jpeg', 0.91).split(',')[1]), character => character.charCodeAt(0)));
    }
  }
  const parts = [], offsets = [0];
  let size = 0;
  const append = value => {
    const bytes = typeof value === 'string' ? encode(value) : value;
    parts.push(bytes);
    size += bytes.length;
  };
  const object = (number, ...content) => {
    offsets[number] = size;
    append(number + ' 0 obj\n');
    content.forEach(append);
    append('\nendobj\n');
  };
  append('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Count ' + pages.length + ' /Kids [' + pages.map((_, index) => 3 + index * 3 + ' 0 R').join(' ') + '] >>');
  pages.forEach((image, index) => {
    const page = 3 + index * 3;
    const command = 'q 842 0 0 595 0 0 cm /Image Do Q';
    object(page, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Contents ' + (page + 1) +
      ' 0 R /Resources << /XObject << /Image ' + (page + 2) + ' 0 R >> >> >>');
    object(page + 1, '<< /Length ' + command.length + ' >>\nstream\n' + command + '\nendstream');
    object(page + 2, '<< /Type /XObject /Subtype /Image /Width ' + width + ' /Height ' + height +
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + image.length + ' >>\nstream\n', image, '\nendstream');
  });
  const xref = size;
  append('xref\n0 ' + offsets.length + '\n0000000000 65535 f \n');
  for (const offset of offsets.slice(1)) append(String(offset).padStart(10, '0') + ' 00000 n \n');
  append('trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  return new Blob(parts, { type: 'application/pdf' });
}

export function downloadReport(report) {
  if(report.format!=='csv'||!report.bank)report={...report,start:dateText(report.start),end:dateText(report.end),rows:report.rows.map(row=>row.map(cell=>dateText(cell)))};
  const file = report.format === 'csv' ? new Blob([csvReport(report.rows)],{type:'text/csv;charset=utf-8'}) : report.format === 'xlsx' ? excelFile(report) : pdfFile(report);
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = (report.type ?? 'attendance-follow-up') + '-' + String(report.start).replaceAll('/','-') + '.' + report.format;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
