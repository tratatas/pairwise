import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import regularUrl from '../assets/fonts/PTSans_400Regular.ttf?url';
import boldUrl from '../assets/fonts/PTSans_700Bold.ttf?url';
import type { Inconsistencies, PairState, Scores } from '../core/analysis';
import type { Project } from '../core/types';
import { downloadBlob, safeFileName } from '../storage/file';
import { cycleText, formatNumber, formatPercent, triadText } from '../ui/format';

const FONT = 'PTSans';
const MATRIX_ON_SEPARATE_PAGE_FROM = 13;
const PROBLEMS_LIMIT = 60;

async function toBase64(url: string): Promise<string> {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function addFonts(doc: jsPDF): Promise<void> {
  const [regular, bold] = await Promise.all([toBase64(regularUrl), toBase64(boldUrl)]);
  doc.addFileToVFS('PTSans-Regular.ttf', regular);
  doc.addFont('PTSans-Regular.ttf', FONT, 'normal');
  doc.addFileToVFS('PTSans-Bold.ttf', bold);
  doc.addFont('PTSans-Bold.ttf', FONT, 'bold');
  doc.setFont(FONT, 'normal');
}

const CELL_COLORS: Record<string, [number, number, number]> = {
  '1': [200, 236, 205],
  '0.5': [228, 228, 228],
  '0': [246, 205, 205],
};

/** Builds the results PDF (spec 6) on the device and downloads it. */
export async function exportPdf(
  project: Project,
  pairs: Map<string, PairState>,
  scores: Scores,
  inc: Inconsistencies,
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await addFonts(doc);
  const names = new Map(project.items.map((i) => [i.id, i.name]));
  const margin = 15;
  let y = margin;

  doc.setFont(FONT, 'bold').setFontSize(16).text(project.name, margin, y + 5);
  y += 12;
  doc.setFont(FONT, 'normal').setFontSize(10);
  const lines = [
    `Дата: ${new Date().toLocaleString('ru-RU')}`,
    `Элементов: ${project.items.length}`,
    `Опрос обратных пар: ${project.settings.askReverse ? 'включён' : 'выключен'}`,
    `Коэффициент согласованности Кендалла (дзета) = ${formatNumber(inc.zeta, 3)}; строгих циклов: ${inc.d} из ${inc.dMax} возможных; нестрогих противоречий: ${inc.weak.length}`,
  ];
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, 180);
    doc.text(wrapped, margin, y);
    y += 5 * wrapped.length;
  }

  autoTable(doc, {
    startY: y + 3,
    head: [['Место', 'Элемент', 'Очки', 'Вес']],
    body: scores.rows.map((r) => [String(r.place), r.name, formatNumber(r.score), formatPercent(r.weight)]),
    styles: { font: FONT, fontSize: project.items.length > 20 ? 9 : 10, cellPadding: project.items.length > 20 ? 1.2 : 2 },
    headStyles: { font: FONT, fontStyle: 'bold', fillColor: [43, 92, 138] },
    columnStyles: { 0: { halign: 'center', cellWidth: 18 }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: margin, right: margin },
  });

  const n = project.items.length;
  const separate = n >= MATRIX_ON_SEPARATE_PAGE_FROM;
  if (separate) doc.addPage('a4', 'landscape');
  const matrixStart = separate ? margin : (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.setFont(FONT, 'bold').setFontSize(12).text('Матрица парных сравнений', margin, matrixStart);
  doc.setFont(FONT, 'normal').setFontSize(8).text('1 — элемент строки важнее, 0,5 — равны, 0 — элемент столбца важнее', margin, matrixStart + 5);
  const fontSize = n > 20 ? 5 : n > 12 ? 6 : 8;
  autoTable(doc, {
    startY: matrixStart + 8,
    head: [['', ...project.items.map((_, i) => String(i + 1))]],
    body: project.items.map((item, i) => [
      `${i + 1}. ${item.name}`,
      ...scores.matrix[i].map((v) => (v === null ? '—' : formatNumber(v))),
    ]),
    styles: { font: FONT, fontSize, cellPadding: 0.8, halign: 'center' },
    headStyles: { font: FONT, fontStyle: 'bold', fillColor: [43, 92, 138] },
    columnStyles: { 0: { halign: 'left', cellWidth: separate ? 45 : 40 } },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index === 0) return;
      const v = scores.matrix[data.row.index][data.column.index - 1];
      if (v !== null) data.cell.styles.fillColor = CELL_COLORS[String(v)];
    },
  });

  if (inc.strict.length > 0 || inc.weak.length > 0) {
    if (separate) doc.addPage('a4', 'portrait');
    autoTable(doc, {
      startY: separate ? margin : undefined,
      head: [['Вид', 'Противоречие']],
      body: [
        ...inc.strict.map((c) => ['Цикл', cycleText(c, names)]),
        ...inc.weak.map((t) => ['Нестрогое', triadText(t, pairs, names)]),
      ]
        .slice(0, PROBLEMS_LIMIT)
        .concat(
          inc.strict.length + inc.weak.length > PROBLEMS_LIMIT
            ? [['', `…и ещё ${inc.strict.length + inc.weak.length - PROBLEMS_LIMIT}; полный список на экране «Проверка»`]]
            : [],
        ),
      styles: { font: FONT, fontSize: 9 },
      headStyles: { font: FONT, fontStyle: 'bold', fillColor: [43, 92, 138] },
      columnStyles: { 0: { cellWidth: 25 } },
      margin: { left: margin, right: margin },
    });
  }

  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(doc.output('blob'), `${safeFileName(project.name)}_${date}.pdf`);
}
