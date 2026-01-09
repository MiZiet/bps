const ExcelJS = require('exceljs');

async function generateLargeSample() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Reservations');

  // Number of records to generate
  const RECORD_COUNT = 100_000; // e.g. 10_000 / 100_000 / 500_000

  // Define worksheet columns
  worksheet.columns = [
    { header: 'reservation_id', key: 'reservation_id', width: 18 },
    { header: 'guest_name', key: 'guest_name', width: 25 },
    { header: 'status', key: 'status', width: 15 },
    { header: 'check_in_date', key: 'check_in_date', width: 15 },
    { header: 'check_out_date', key: 'check_out_date', width: 15 },
  ];

  // Sample data pools
  const firstNames = ['Jan', 'Anna', 'Adam', 'Maria', 'Piotr', 'Katarzyna'];
  const lastNames = ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kaczmarek'];
  const statuses = ['oczekująca', 'zrealizowana', 'anulowana'];

  const baseDate = new Date('2024-01-01');

  // Generate rows
  for (let i = 1; i <= RECORD_COUNT; i++) {
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[i % lastNames.length];
    const status = statuses[i % statuses.length];

    // Calculate check-in date
    const checkIn = new Date(baseDate);
    checkIn.setDate(checkIn.getDate() + (i % 365));

    // Calculate check-out date
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkOut.getDate() + (2 + (i % 10)));

    worksheet.addRow({
      reservation_id: String(100000 + i),
      guest_name: `${firstName} ${lastName}`,
      status,
      check_in_date: checkIn.toISOString().split('T')[0],
      check_out_date: checkOut.toISOString().split('T')[0],
    });

    // Progress log for large datasets
    if (i % 10_000 === 0) {
      console.log(`Generated ${i} records`);
    }
  }

  // Write XLSX file to disk
  await workbook.xlsx.writeFile('sample-reservations-large.xlsx');
  console.log(`File created: sample-reservations-large.xlsx (${RECORD_COUNT} records)`);
}

generateLargeSample().catch(console.error);
