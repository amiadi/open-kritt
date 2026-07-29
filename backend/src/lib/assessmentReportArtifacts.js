import { createHash } from 'node:crypto';

import ExcelJS from 'exceljs';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import PDFDocument from 'pdfkit';

function reportTitle(snapshot) {
  return `Assessment Report — ${snapshot.engagement.name}`;
}

function reportLines(snapshot) {
  return [
    `Assessment ID: ${snapshot.assessment.id}`,
    `Capability: ${snapshot.assessment.capability}`,
    `Execution mode: ${snapshot.assessment.executionMode}`,
    `Deployment mode: ${snapshot.assessment.deploymentMode}`,
    `Status: ${snapshot.assessment.status}`,
    `Generated: ${snapshot.generatedAt}`,
    '',
    'Actions',
    ...snapshot.actions.map((action) => `${action.actionType} — ${action.riskClassification} — ${action.status}`),
    '',
    'Audit events',
    ...snapshot.auditEvents.map((event) => `${event.insertedAt} — ${event.eventType} — ${event.actor}`),
  ];
}

export async function renderAssessmentReportArtifact(format, snapshot) {
  let bytes;
  if (format === 'pdf') bytes = await renderPdf(snapshot);
  else if (format === 'docx') bytes = await renderDocx(snapshot);
  else if (format === 'xlsx') bytes = await renderXlsx(snapshot);
  else throw new Error('Unsupported assessment report format.');
  const buffer = Buffer.from(bytes);
  return { buffer, digest: createHash('sha256').update(buffer).digest('hex') };
}

function renderPdf(snapshot) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ margin: 48, info: { Title: reportTitle(snapshot) } });
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    document.fontSize(18).text(reportTitle(snapshot));
    document.moveDown();
    for (const line of reportLines(snapshot))
      document.fontSize(line === 'Actions' || line === 'Audit events' ? 13 : 10).text(line);
    document.end();
  });
}

async function renderDocx(snapshot) {
  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: reportTitle(snapshot), heading: HeadingLevel.TITLE }),
          ...reportLines(snapshot).map((line) => new Paragraph({ children: [new TextRun(line)] })),
        ],
      },
    ],
  });
  return Packer.toBuffer(document);
}

async function renderXlsx(snapshot) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'open-kritt';
  const overview = workbook.addWorksheet('Overview');
  overview.columns = [{ width: 24 }, { width: 80 }];
  overview.addRows([
    ['Engagement', snapshot.engagement.name],
    ['Assessment ID', snapshot.assessment.id],
    ['Capability', snapshot.assessment.capability],
    ['Execution mode', snapshot.assessment.executionMode],
    ['Deployment mode', snapshot.assessment.deploymentMode],
    ['Status', snapshot.assessment.status],
    ['Generated', snapshot.generatedAt],
  ]);
  const actions = workbook.addWorksheet('Actions');
  actions.columns = [
    { header: 'Action type', key: 'actionType', width: 34 },
    { header: 'Risk classification', key: 'riskClassification', width: 22 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Summary', key: 'summary', width: 75 },
  ];
  actions.addRows(snapshot.actions);
  const audit = workbook.addWorksheet('Audit events');
  audit.columns = [
    { header: 'Recorded at', key: 'insertedAt', width: 28 },
    { header: 'Event type', key: 'eventType', width: 40 },
    { header: 'Actor', key: 'actor', width: 28 },
    { header: 'Details', key: 'details', width: 80 },
  ];
  audit.addRows(snapshot.auditEvents.map((event) => ({ ...event, details: JSON.stringify(event.details ?? {}) })));
  return workbook.xlsx.writeBuffer();
}

export const reportContentTypes = Object.freeze({
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});
