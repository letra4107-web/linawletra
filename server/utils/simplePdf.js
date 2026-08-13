const toPdfText = (value = '') =>
  String(value ?? '')
    .replace(/[\\()]/g, (match) => `\\${match}`)
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');

const wrapPdfLine = (line = '', max = 92) => {
  const words = String(line || '').split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [''];
};

export const createSimplePdf = (title, lines = []) => {
  const wrappedLines = [title, '', ...lines].flatMap((line) => wrapPdfLine(line));
  const pages = [];
  for (let i = 0; i < wrappedLines.length; i += 42) {
    pages.push(wrappedLines.slice(i, i + 42));
  }

  const objects = [''];
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push(`2 0 obj << /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >> endobj`);

  pages.forEach((pageLines, index) => {
    const pageObj = 3 + index * 2;
    const contentObj = pageObj + 1;
    const content = [
      'BT',
      '/F1 11 Tf',
      '50 790 Td',
      '14 TL',
      ...pageLines.map((line, lineIndex) => `${lineIndex === 0 ? '' : 'T* '}(${toPdfText(line)}) Tj`),
      'ET',
    ].join('\n');
    objects.push(`${pageObj} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 100 0 R >> >> /Contents ${contentObj} 0 R >> endobj`);
    objects.push(`${contentObj} 0 obj << /Length ${Buffer.byteLength(content)} >> stream\n${content}\nendstream endobj`);
  });

  objects.push('100 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = Buffer.byteLength(pdf);
    pdf += `${objects[i]}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
};
