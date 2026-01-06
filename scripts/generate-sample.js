// Script to generate a sample XLSX file for testing
const XLSX = require('xlsx');

const data = [
  {
    reservation_id: '12345',
    guest_name: 'Jan Nowak',
    status: 'oczekująca',
    check_in_date: '2024-05-01',
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
    check_out_date: '2024-04-27',
  },
  {
    reservation_id: '12348',
    guest_name: 'Maria Kowalska',
    status: 'oczekująca',
    check_in_date: '2024-07-01',
    check_out_date: '2024-07-10',
  },
];

const worksheet = XLSX.utils.json_to_sheet(data);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Reservations');

XLSX.writeFile(workbook, 'sample-reservations.xlsx');
console.log('Created sample-reservations.xlsx');

