import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { TemperatureRecord, Equipment, ProductTrace, OilChangeRecord } from '../types';

export function generateTemperaturePDF(
  records: TemperatureRecord[],
  equipment: Equipment[],
  establishmentName: string,
  periodLabel: string
) {
  const doc = new jsPDF();
  const equipMap = new Map(equipment.map(e => [e.id, e]));

  // Header
  doc.setFontSize(18);
  doc.text('Relevés de Température HACCP', 14, 22);
  doc.setFontSize(11);
  doc.text(establishmentName, 14, 30);
  doc.text(`Période : ${periodLabel}`, 14, 36);

  // Summary section
  const totalRecords = records.length;
  const compliant = records.filter(r => r.isCompliant).length;
  const nonCompliant = totalRecords - compliant;
  const complianceRate = totalRecords > 0 ? Math.round((compliant / totalRecords) * 100) : 100;

  // Equipment with anomalies
  const anomalyEquipIds = new Set(records.filter(r => !r.isCompliant).map(r => r.equipmentId));
  const anomalyEquipNames = Array.from(anomalyEquipIds).map(id => equipMap.get(id)?.name ?? 'Inconnu');

  let summaryY = 44;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Résumé', 14, summaryY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  summaryY += 7;
  doc.text(`Total relevés : ${totalRecords}`, 14, summaryY);
  summaryY += 5;
  doc.text(`Conformes : ${compliant} (${complianceRate}%)`, 14, summaryY);
  summaryY += 5;

  if (nonCompliant > 0) {
    doc.setTextColor(239, 68, 68);
    doc.setFont('helvetica', 'bold');
    doc.text(`Non conformes : ${nonCompliant}`, 14, summaryY);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    summaryY += 5;
    doc.text(`Équipements concernés : ${anomalyEquipNames.join(', ')}`, 14, summaryY);
  } else {
    doc.setTextColor(34, 197, 94);
    doc.setFont('helvetica', 'bold');
    doc.text('Aucune anomalie détectée', 14, summaryY);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
  }
  summaryY += 4;

  // Separator line
  summaryY += 4;
  doc.setDrawColor(200, 200, 200);
  doc.line(14, summaryY, 196, summaryY);
  summaryY += 6;

  // Data table
  const tableData = records
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .map(r => {
      const equip = equipMap.get(r.equipmentId);
      return [
        format(new Date(r.timestamp), 'dd/MM/yyyy', { locale: fr }),
        format(new Date(r.timestamp), 'HH:mm', { locale: fr }),
        equip?.name ?? 'Inconnu',
        `${r.temperature}°C`,
        equip ? `${equip.minTemp} / ${equip.maxTemp}°C` : '-',
        r.isCompliant ? 'OUI' : 'NON',
        r.signature ? 'Oui' : '-',
      ];
    });

  autoTable(doc, {
    startY: summaryY,
    head: [['Date', 'Heure', 'Équipement', 'Temp.', 'Plage', 'Conforme', 'Signé']],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 64, 175] },
    bodyStyles: { textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    didParseCell(data) {
      if (data.section === 'body') {
        // Check if this row is non-compliant (column 5 = Conforme)
        const rowData = tableData[data.row.index];
        const isNonCompliant = rowData && rowData[5] === 'NON';

        if (isNonCompliant) {
          data.cell.styles.fillColor = [254, 226, 226];
        }

        if (data.column.index === 5) {
          const val = data.cell.raw as string;
          if (val === 'NON') {
            data.cell.styles.textColor = [239, 68, 68];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [34, 197, 94];
          }
        }
      }
    },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Généré le ${format(new Date(), "dd/MM/yyyy 'à' HH:mm", { locale: fr })} — Page ${i}/${pageCount}`,
      14,
      doc.internal.pageSize.height - 10
    );
  }

  doc.save(`temperatures_haccp_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

export function generateOilChangePDF(
  records: OilChangeRecord[],
  establishmentName: string,
  periodLabel: string,
) {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("Feuille de changement d'huile", 14, 22);
  doc.setFontSize(11);
  doc.text(establishmentName || 'Mon etablissement', 14, 30);
  doc.text(`Periode : ${periodLabel}`, 14, 36);

  const tableData = records
    .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
    .map((record) => [
      format(new Date(record.changedAt), 'dd/MM/yyyy', { locale: fr }),
      format(new Date(record.changedAt), 'HH:mm', { locale: fr }),
      record.fryerId,
      'OK',
      'OK',
      'N/A',
      '-',
      record.operator || '-',
      'Huile changee',
    ]);

  autoTable(doc, {
    startY: 44,
    head: [['Date', 'Heure', 'Friteuse', 'Visuel', 'Olfactif', 'Test chimique', 'Temp huile', 'Operateur', 'Action']],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 64, 175] },
    alternateRowStyles: { fillColor: [241, 245, 249] },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Genere le ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: fr })} - Page ${i}/${pageCount}`,
      14,
      doc.internal.pageSize.height - 10,
    );
  }

  doc.save(`huile_friteuse_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

export function generateTraceabilityPDF(
  traces: ProductTrace[],
  establishmentName: string,
  periodLabel: string
) {
  const doc = new jsPDF('landscape');

  doc.setFontSize(18);
  doc.text('Traçabilité des Produits', 14, 22);
  doc.setFontSize(11);
  doc.text(establishmentName, 14, 30);
  doc.text(`Période : ${periodLabel}`, 14, 36);

  const tableData = traces
    .sort((a, b) => new Date(b.receptionDate).getTime() - new Date(a.receptionDate).getTime())
    .map(t => [
      t.productName,
      t.supplier,
      t.lotNumber,
      t.category,
      format(new Date(t.receptionDate), 'dd/MM/yyyy', { locale: fr }),
      format(new Date(t.expirationDate), 'dd/MM/yyyy', { locale: fr }),
      t.barcode ?? '-',
    ]);

  autoTable(doc, {
    startY: 42,
    head: [['Produit', 'Fournisseur', 'N° Lot', 'Catégorie', 'Réception', 'DLC/DDM', 'Code-barres']],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175] },
    alternateRowStyles: { fillColor: [241, 245, 249] },
  });

  doc.save(`tracabilite_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

export function generateTraceabilityCSV(traces: ProductTrace[]): string {
  const headers = ['Produit', 'Fournisseur', 'N° Lot', 'Catégorie', 'Date réception', 'DLC/DDM', 'Code-barres'];
  const rows = traces.map(t => [
    t.productName,
    t.supplier,
    t.lotNumber,
    t.category,
    format(new Date(t.receptionDate), 'dd/MM/yyyy'),
    format(new Date(t.expirationDate), 'dd/MM/yyyy'),
    t.barcode ?? '',
  ]);

  const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  return csv;
}

export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
