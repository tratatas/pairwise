import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import regularUrl from '../assets/fonts/PTSans_400Regular.ttf?url';
import boldUrl from '../assets/fonts/PTSans_700Bold.ttf?url';
import type { Inconsistencies, PairState, Scores } from '../core/analysis';
import type { Project } from '../core/types';
import { downloadBlob, safeFileName } from '../storage/file';
import { cycleText, formatNumber, formatPercent, triadText } from '../ui/format';

const FONT = 'PTSans';
/** Up to this many items the matrix header shows names on a portrait page; above it, numbers on a landscape page. */
const NAMES_IN_HEADER_UP_TO = 8;
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
  const n = project.items.length;
  const landscape = n > NAMES_IN_HEADER_UP_TO;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' });
  await addFonts(doc);
  const names = new Map(project.items.map((i) => [i.id, i.name]));
  const margin = 12;
  const width = doc.internal.pageSize.getWidth() - 2 * margin;
  const head = { font: FONT, fontStyle: 'bold' as const, fillColor: [43, 92, 138] as [number, number, number] };
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let y = margin;

  doc.setFont(FONT, 'bold').setFontSize(16).text(project.name, margin, y + 5);
  y += 12;
  doc.setFont(FONT, 'normal').setFontSize(10);
  const triads = inc.strict.length + inc.weak.length;
  const lines = [
    `Дата: ${new Date().toLocaleString('ru-RU')} · элементов: ${n} · опрос обратных пар: ${project.settings.askReverse ? 'включён' : 'выключен'}`,
    `Согласованность ответов: ${formatPercent(inc.zeta)} (коэффициент Кендалла); несогласованных троек: ${triads}`,
  ];
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, width);
    doc.text(wrapped, margin, y);
    y += 5 * wrapped.length;
  }

  // One table: ranking and matrix, rows and columns in ranking order (as on the results screen).
  const index = new Map(project.items.map((item, i) => [item.id, i]));
  const order = scores.rows;
  const numbered = n > NAMES_IN_HEADER_UP_TO;
  const fontSize = n > 20 ? 5.5 : n > 12 ? 6.5 : 8;
  doc.setFontSize(8).text('Клетка: элемент строки относительно элемента столбца — 1 важнее, 0,5 равны, 0 менее важен.', margin, y + 2);
  autoTable(doc, {
    startY: y + 5,
    head: [['Место', 'Элемент', ...order.map((r, i) => (numbered ? String(i + 1) : r.name)), 'Очки', 'Вес']],
    body: order.map((row, i) => [
      String(row.place),
      numbered ? `${i + 1}. ${row.name}` : row.name,
      ...order.map((col) => {
        const v = scores.matrix[index.get(row.id)!][index.get(col.id)!];
        return v === null ? '—' : formatNumber(v);
      }),
      formatNumber(row.score),
      formatPercent(row.weight),
    ]),
    styles: { font: FONT, fontSize, cellPadding: 0.8, halign: 'center', valign: 'middle' },
    headStyles: { ...head, fontSize },
    columnStyles: { 0: { cellWidth: 10 }, 1: { halign: 'left', cellWidth: numbered ? 42 : 35 } },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const col = data.column.index;
      if (col >= 2 && col < 2 + n) {
        const v = scores.matrix[index.get(order[data.row.index].id)!][index.get(order[col - 2].id)!];
        if (v !== null) data.cell.styles.fillColor = CELL_COLORS[String(v)];
      } else if (col >= 2 + n) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const described = project.items.filter((i) => i.note);
  if (described.length > 0) {
    autoTable(doc, {
      startY: lastY() + 8,
      head: [['Элемент', 'Описание']],
      body: described.map((i) => [i.name, i.note!]),
      styles: { font: FONT, fontSize: 9 },
      headStyles: head,
      columnStyles: { 0: { cellWidth: 50 } },
      margin: { left: margin, right: margin },
    });
  }

  if (triads > 0) {
    autoTable(doc, {
      startY: lastY() + 8,
      head: [['Несогласованные ответы (нельзя выстроить в один порядок)']],
      body: [
        ...inc.strict.map((c) => [cycleText(c, names)]),
        ...inc.weak.map((t) => [triadText(t, pairs, names)]),
      ]
        .slice(0, PROBLEMS_LIMIT)
        .concat(triads > PROBLEMS_LIMIT ? [[`…и ещё ${triads - PROBLEMS_LIMIT}; полный список на экране «Проверка»`]] : []),
      styles: { font: FONT, fontSize: 9 },
      headStyles: head,
      margin: { left: margin, right: margin },
    });
  }

  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(doc.output('blob'), `${safeFileName(project.name)}_${date}.pdf`);
}
