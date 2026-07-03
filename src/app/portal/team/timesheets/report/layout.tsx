export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 12mm 10mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      {children}
    </>
  );
}
