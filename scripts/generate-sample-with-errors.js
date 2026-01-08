// Script to generate a sample XLSX file for testing
const ExcelJS = require('exceljs');

async function generateSample() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Reservations');

  // Add headers
  worksheet.columns = [
    { header: 'reservation_id', key: 'reservation_id', width: 15 },
    { header: 'guest_name', key: 'guest_name', width: 20 },
    { header: 'status', key: 'status', width: 15 },
    { header: 'check_in_date', key: 'check_in_date', width: 15 },
    { header: 'check_out_date', key: 'check_out_date', width: 15 },
  ];

  // Add data rows
  const data = [
    {
      reservation_id: '12345',
      guest_name: 'Jan Nowak',
      status: 'oczekująca',
      check_out_date: '2024-05-07',
    },
    {
      reservation_id: '12346',
      guest_name: 'Anna Kowal',
      status: 'anulowana',
      check_in_date: '2024-06-10',
      check_out_date: '2024-06-15',
    },
    {
      reservation_id: '12347',
      guest_name: 'Adam Wiśniewski',
      status: 'zrealizowana',
      check_in_date: '2024-04-20',
      check_out_date: 'Not a date',
    },
    {
      reservation_id: '12348',
      guest_name: 'Maria Kowalska',
      status: 1337,
      check_in_date: '2024-07-01',
      check_out_date: '2024-07-10',
    },
  ];

  data.forEach((row) => {
    worksheet.addRow(row);
  });

  await workbook.xlsx.writeFile('sample-reservations-with-errors.xlsx');
  console.log('Created sample-reservations-with-errors.xlsx');
}

generateSample().catch(console.error);
