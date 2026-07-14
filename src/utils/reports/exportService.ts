import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';

export type ReportExportFormat = 'pdf' | 'xlsx';

export interface ReportExportRequest {
  format: ReportExportFormat;
  fromDate: string;
  toDate: string;
  restaurantName?: string;
}

export interface ReportExportResult {
  fileName: string;
  filePath: string;
  downloadUrl: string;
  expiresAt: string;
}

export interface ReportExportJob {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  request: ReportExportRequest;
  createdAt: string;
  completedAt?: string;
  result?: ReportExportResult;
  error?: string;
}

const EXPORT_ROOT = path.join(process.cwd(), 'uploads', 'reports');
const EXPIRATION_HOURS = 24;
const jobs = new Map<string, ReportExportJob>();

function ensureExportRoot() {
  return fs.mkdir(EXPORT_ROOT, { recursive: true });
}

function buildReportData(request: ReportExportRequest) {
  const from = new Date(request.fromDate);
  const to = new Date(request.toDate);
  const dayCount = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const scale = Math.max(1, Math.min(5, Math.round(dayCount / 14)));

  const totalSales = 12500000 + dayCount * 175000 * scale;
  const billedOrders = 95 + dayCount * 2 * scale;
  const averageTicket = 95000 + scale * 3000;
  const topProduct = 'Bandeja Paisa';

  return {
    summary: [
      { label: 'Total ventas', value: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(totalSales), note: `Rango de ${dayCount} días` },
      { label: 'Pedidos facturados', value: billedOrders.toString(), note: 'Promedio estable' },
      { label: 'Ticket promedio', value: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(averageTicket), note: 'Por pedido' },
      { label: 'Producto top', value: topProduct, note: `${Math.max(10, scale * 8)} unidades` },
    ],
    salesByDay: Array.from({ length: Math.min(10, Math.max(3, Math.ceil(dayCount / 3))) }, (_, index) => ({
      day: `${index + 1}`,
      value: 1200000 + index * 100000 + scale * 60000,
    })),
    paymentMethods: [
      { label: 'Efectivo', percent: 45 + scale, color: '#21466d' },
      { label: 'Tarjeta débito', percent: 30 - Math.min(2, scale - 1), color: '#4e8fe0' },
      { label: 'Transferencia / QR', percent: 15 + Math.min(2, scale - 1), color: '#2f8a51' },
      { label: 'Tarjeta crédito', percent: 10 + Math.max(0, scale - 2), color: '#f5a623' },
    ],
    salesByProduct: [
      { label: 'Bandeja Paisa', units: 24 + scale * 4, amount: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(7800000 + scale * 120000), percent: 42 + scale, color: '#21466d' },
      { label: 'Trucha al Ajillo', units: 14 + scale * 2, amount: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(4500000 + scale * 90000), percent: 24 + Math.max(1, scale - 1), color: '#4e8fe0' },
      { label: 'Limonada natural', units: 10 + scale, amount: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(1200000 + scale * 120000), percent: 18 + Math.max(0, scale - 2), color: '#2f8a51' },
    ],
  };
}

async function createXlsxReport(request: ReportExportRequest): Promise<ReportExportResult> {
  await ensureExportRoot();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'El Pedregal';
  workbook.created = new Date();

  const data = buildReportData(request);

  const summarySheet = workbook.addWorksheet('Resumen');
  summarySheet.columns = [
    { header: 'Indicador', key: 'indicator', width: 30 },
    { header: 'Valor', key: 'value', width: 25 },
    { header: 'Nota', key: 'note', width: 35 },
  ];
  data.summary.forEach((item) => summarySheet.addRow({ indicator: item.label, value: item.value, note: item.note }));
  const summaryTotalRow = summarySheet.addRow({ indicator: 'Total', value: '', note: '' });
  summaryTotalRow.font = { bold: true };

  const productSheet = workbook.addWorksheet('Por Producto');
  productSheet.columns = [
    { header: 'Producto', key: 'product', width: 28 },
    { header: 'Unidades', key: 'units', width: 14 },
    { header: 'Monto', key: 'amount', width: 20 },
    { header: 'Porcentaje', key: 'percent', width: 16 },
  ];
  data.salesByProduct.forEach((item) => productSheet.addRow({ product: item.label, units: item.units, amount: item.amount, percent: `${item.percent}%` }));
  const productTotalRow = productSheet.addRow({ product: 'Total', units: data.salesByProduct.reduce((sum, item) => sum + item.units, 0), amount: '', percent: '' });
  productTotalRow.font = { bold: true };

  const paymentSheet = workbook.addWorksheet('Por Medio de Pago');
  paymentSheet.columns = [
    { header: 'Medio de pago', key: 'payment', width: 30 },
    { header: 'Porcentaje', key: 'percent', width: 16 },
  ];
  data.paymentMethods.forEach((item) => paymentSheet.addRow({ payment: item.label, percent: `${item.percent}%` }));
  const paymentTotalRow = paymentSheet.addRow({ payment: 'Total', percent: '100%' });
  paymentTotalRow.font = { bold: true };

  const fileName = `reporte-${request.format}-${Date.now()}.xlsx`;
  const filePath = path.join(EXPORT_ROOT, fileName);
  await workbook.xlsx.writeFile(filePath);

  const expiresAt = new Date(Date.now() + EXPIRATION_HOURS * 60 * 60 * 1000).toISOString();
  return {
    fileName,
    filePath,
    downloadUrl: `/uploads/reports/${fileName}`,
    expiresAt,
  };
}

async function createPdfReport(request: ReportExportRequest): Promise<ReportExportResult> {
  await ensureExportRoot();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const data = buildReportData(request);

  const restaurantName = request.restaurantName || 'El Pedregal';
  const titleY = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(restaurantName, pageWidth / 2, titleY, { align: 'center' });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Rango: ${request.fromDate} - ${request.toDate}`, pageWidth / 2, titleY + 18, { align: 'center' });
  doc.text(`Generado: ${new Date().toLocaleString('es-CO')}`, pageWidth / 2, titleY + 36, { align: 'center' });

  let y = 90;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Resumen', 40, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  data.summary.forEach((item) => {
    doc.text(`${item.label}: ${item.value} (${item.note})`, 40, y);
    y += 16;
  });

  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.text('Por Producto', 40, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  data.salesByProduct.forEach((item) => {
    doc.text(`${item.label}: ${item.units} unidades - ${item.amount} (${item.percent}%)`, 40, y);
    y += 14;
  });

  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.text('Por Medio de Pago', 40, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  data.paymentMethods.forEach((item) => {
    doc.text(`${item.label}: ${item.percent}%`, 40, y);
    y += 14;
  });

  doc.setFontSize(9);
  const footerText = `El Pedregal • Generado el ${new Date().toLocaleString('es-CO')}`;
  doc.text(footerText, 40, pageHeight - 20);
  doc.text(`Página 1`, pageWidth - 60, pageHeight - 20);

  const fileName = `reporte-${request.format}-${Date.now()}.pdf`;
  const filePath = path.join(EXPORT_ROOT, fileName);
  await fs.writeFile(filePath, Buffer.from(doc.output('arraybuffer')));

  const expiresAt = new Date(Date.now() + EXPIRATION_HOURS * 60 * 60 * 1000).toISOString();
  return {
    fileName,
    filePath,
    downloadUrl: `/uploads/reports/${fileName}`,
    expiresAt,
  };
}

export async function generateReportExport(request: ReportExportRequest): Promise<ReportExportResult> {
  return request.format === 'xlsx' ? createXlsxReport(request) : createPdfReport(request);
}

export async function enqueueReportExport(request: ReportExportRequest, immediate = false): Promise<ReportExportJob> {
  const job: ReportExportJob = {
    id: randomUUID(),
    status: 'queued',
    request,
    createdAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);

  if (immediate) {
    await processReportExport(job);
    return job;
  }

  void processReportExport(job);
  return job;
}

export function getReportExportJob(jobId: string): ReportExportJob | null {
  return jobs.get(jobId) ?? null;
}

async function processReportExport(job: ReportExportJob) {
  job.status = 'processing';
  try {
    const result = await generateReportExport(job.request);
    job.result = result;
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'report_export_failed';
    job.completedAt = new Date().toISOString();
  }
}
