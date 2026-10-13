/* Wording helpers applied to authored text when it is shown. */
const CANON_REPLACEMENTS = [
  ['Baim Parkir', 'Baem Parkiran'],
  ['Raffi Antrean', 'Rafiktif Antre'],
  ['Sandiaga Dos', 'Sandobel Dua'],
  ['Anies Basudahan', 'Anisbentar Basudahan'],
  ['Ganjar Prananjak', 'Ganjer Prananjak'],
  ['Megawangi', 'Megahabis Wangi'],
  ['Vino Bastiang', 'Vinu Bastiang'],
  ['Gibran Rakabur', 'Gibur Rakabur'],
  ['Ahok Angkot', 'Basuko Angkota'],
  ['Iqbal Ramai', 'Iqbol Ramai'],
  ['Bahlil Bawa Pasir', 'Bang Lil Pasiran'],
  ['Puan Maharame', 'Puni Maharame'],
  ['Susi Pudjilaut', 'Sisilaut'],
  ['Risma Siram', 'Rismi Siramin'],
  ['Kaesang Pisang', 'Kaesong Pisangan'],
  ['Cak Iminum', 'Cak Minum'],
  ['Najwa Sihaha', 'Najwi Sihaha'],
  ['Luhut Binsarapi', 'Luhur Serbarapi'],
  ['Reza Rahaduk', 'Rezi Rahaduk'],
  ['Agnez Molor', 'Agendha Molor'],
  ['Tulus Arus', 'Tuluz Arus'],
  ['Greysia Polip', 'Gresipol Polip'],
  ['Nicholas Saputra Sampah', 'Nikopel Sapubersih'],
  ['Susi Susantuy', 'Sasabet Susantuy'],
  ['Maudy Ayunan', 'Maundur Ayunan'],
  ['Cinta Lajur', 'Cintarif Lajur'],
  ['Chicco Jeriken', 'Ciko Jeriken'],
  ['Joe Tas Lipat', 'Jotendang Taslipat'],
  ['Arnold Purnampol', 'Arnampol Purnampol'],
  ['Raisa Rasa', 'Raisambal Rasa'],
  ['Desta Starter', 'Destra Starter'],
  ['Iko Uwaspada', 'Ikuncian Uwaspada'],
  ['Raline Sawah', 'Raladang Sawah'],
  ['Denny Sumur', 'Denanjak Sumur'],
  ['Fiersa Berseri', 'Fierso Berseri'],
  ['Putri Tanjakan', 'Purintis Tanjakan'],
  ['B. J. Habis Baterai', 'Yohitung Suryasel'],
  ['Siman Sudartabung', 'Simang Selam'],
  ['Kevin Senjaya', 'Kevantul Senjaya'],
  ['Anggun Cipta Bara', 'Anggema Cipta Bara'],
  ['Kopikuskus', 'Berumadu'],
];
function canonicalText(text) {
  for (const [a, b] of CANON_REPLACEMENTS.slice().sort((a, b) => b[0].length - a[0].length))
    text = text.split(a).join(b);
  return text;
}
function immersiveCopy(s) {
  return s
    .replace(/selesaikan puzzle panel listrik/gi, 'bantu kru menyalakan listrik')
    .replace(/puzzle sudah selesai/gi, 'pekerjaan sudah selesai')
    .replace(/puzzle/gi, 'tugas warga')
    .replace(/UKS ARENA/g, 'KLINIK BETON');
}
