/* The nineteen regions: story text, wild rosters, levels and badges. Regions 15 to 18 are
   chapter five, Seberang, across the sea after the League. */
// Region numbers by name, for code that needs a particular map.
const REGION = Object.freeze({
  SUKAMAJU: 0,
  PADANG_OJEK: 1,
  HUTAN: 2,
  PASAR_RAKYAT: 3,
  BALAI_BETON: 4,
  FESTIVAL: 5,
  PESISIR: 6,
  PUNCAK: 7,
  STASIUN: 8,
  WARGAMALL: 9,
  BENGKEL: 10,
  WADUK: 11,
  KALDERA: 12,
  OBSERVATORIUM: 13,
  LIGA: 14,
  TELUK_PINISI: 15,
  RIMBA_ULIN: 16,
  TONGKONAN: 17,
  DIENG: 18,
});
// The leaders whose badge closes a chapter, by their region.
const CHAPTER_LEADERS = Object.freeze({ 26: REGION.FESTIVAL, 29: REGION.PESISIR, 32: REGION.PUNCAK });
const regionOfLeader = id => CHAPTER_LEADERS[id] ?? null;
const REGIONS = [
  {
    name: 'Sukamaju',
    subtitle: 'Berangkat dari gang sendiri',
    image: 'img/maps/exterior/1-1.webp',
    tile: -1,
    levels: [3, 5],
    wild: [4, 5, 21, 24, 57, 59],
    signature: 59,
    trainers: [0, 1, 2, 9, 51],
    required: [0, 1, 2, 9],
    quest: 'parcel',
    questName: 'Bekal dari Bu Sari',
    questText:
      '{trainer2} menunggu di dekat toko. {trainer9} mengambil paket di warung Bu Sari. Temui keduanya sebelum meminta surat jalan.',
    story:
      'Bu Sari menyiapkan bekal. Pak RT mengadakan Liga Antar-Kelurahan.\n\nKenali warga Sukamaju, lalu jelajahi Padang Ojek, Gang Senggol, dan Hutan Pinggir Kota.\n\nSetelah urusan kampung selesai, lanjutkan ke Pasar Rakyat dan Arena Beton di Balai Beton.',
    goal: 'Ambil bekal Bu Sari dan tanding dengan Maundur Ayunan serta Baem Parkiran.',
    badge: 'Surat Jalan',
  },
  {
    name: 'Padang Ojek',
    subtitle: 'Aspal panas, obrolan panjang',
    image: 'img/maps/exterior/1-2.webp',
    tile: -1,
    levels: [5, 7],
    wild: [4, 5, 8, 22, 26, 38, 48, 55, 56, 60, 80],
    signature: 55,
    trainers: [3, 18, 4, 11, 20, 52],
    required: [3, 18, 4],
    quest: 'delivery',
    questName: 'Antar bekal',
    questText: 'Antar bekal dan lewati tiga penantang.',
    story:
      'Deretan kios, pangkalan ojek, dan jalan menuju jalur hijau. Pos Ojek menunggu bekal dari Sukamaju.',
    goal: 'Antar bekal ke pos dan lewati tiga penantang sepanjang padang.',
    badge: 'Akses Jalur Hijau',
  },
  {
    name: 'Hutan Pinggir Kota',
    subtitle: 'Sinyal satu bar, petualangan penuh',
    image: 'img/maps/exterior/1-4.webp',
    tile: -1,
    levels: [7, 10],
    wild: [3, 7, 8, 11, 20, 22, 23, 28, 29, 38, 57, 65, 66],
    signature: 29,
    trainers: [],
    required: [],
    quest: 'bridge',
    questName: 'Bereskan jalur warga',
    questText: 'Kumpulkan tiga kantong sampah. Mata air menyediakan dua jamu sekali selama petualangan.',
    story:
      'Ikuti jalan tanah mengitari kolam. Tidak ada penantang di sini. Kumpulkan sampah dan ambil bekal mata air sebelum menuju terminal.',
    goal: 'Jelajahi hutan, tangkap teman, dan kumpulkan tiga kantong sampah.',
    badge: 'Lencana Kilau',
  },
  {
    name: 'Pasar Rakyat',
    subtitle: 'Dua stempel, satu perjalanan',
    image: 'img/maps/exterior/2-2.webp',
    tile: -1,
    levels: [9, 12],
    wild: [21, 35, 36, 65, 56, 27, 24, 58],
    signature: 27,
    trainers: [12, 10],
    required: [12],
    quest: 'ticket',
    questName: 'Kartu perjalanan',
    questText:
      'Minta stempel Bu Sri di pelataran dan Bu Imah di balai pasar. Tukarkan kepada Pak Darto di dalam balai, lalu temui Iqbol di lapak selatan.',
    story:
      'Pasar Rakyat menyambut perjalananmu dengan lapak makanan dan dermaga. Bu Sri dan Bu Imah memberi dua stempel; Pak Darto menyiapkan kartu Arena Beton.',
    goal: 'Dua stempel → kartu Pak Darto → Iqbol → Balai Beton.',
    badge: 'Kartu Kota Beton',
  },
  {
    name: 'Balai Beton',
    subtitle: 'Kota Tua, ujian baru',
    image: 'img/maps/exterior/2-3.webp',
    tile: -1,
    levels: [12, 15],
    wild: [3, 5, 6, 11, 50, 66],
    signature: 6,
    trainers: [13, 14, 15, 23, 17, 22, 53],
    required: [13, 14, 15, 23, 17],
    quest: 'arena',
    questName: 'Arena Beton',
    questText:
      'Lewati Bang Lil Pasiran, Rido Kamiling, Puni Maharame, dan Erakit Tohoraga. Joko Widuduk memimpin ujian terakhir untuk Lencana Beton.',
    story:
      'Di balai Kota Tua, empat penantang menyiapkan ujian Arena Beton. Joko Widuduk menunggu di belakang aula; taman dan warung menghadap jalan menuju konser.',
    goal: 'Empat kualifikasi di balai → Joko → Festival Arus.',
    badge: 'Lencana Beton',
  },
  {
    name: 'Festival Arus',
    subtitle: 'Musik warga, listrik bersama',
    levels: [16, 19],
    wild: [48, 67, 5, 57, 68, 22],
    signature: 68,
    trainers: [24, 25, 26, 21],
    required: [24, 25, 26],
    quest: 'circuit',
    questName: 'Hidupkan festival',
    questText:
      'Tanding dengan Rezi dan Agendha agar panel bisa dipakai. Nyalakan sembilan lampu, lalu temui Tuluz di panggung.',
    story:
      'Panggung Festival Arus padam. Rezi dan Agendha menjaga panel sampai kamu siap membantu. Setelah listrik pulih, Tuluz menunggu di panggung.',
    goal: 'Tanding dengan Rezi dan Agendha, hidupkan panel, lalu tantang Tuluz.',
    badge: 'Lencana Sirkuit',
    image: 'img/maps/exterior/2-1.webp',
    tile: -1,
  },
  {
    name: 'Pesisir Suaka',
    subtitle: 'Arus jernih untuk rumah karang',
    levels: [26, 29],
    wild: [7, 9, 11, 22, 25, 58, 62, 2, 80],
    signature: 9,
    trainers: [27, 28, 29, 16, 7, 8],
    required: [27, 28, 29],
    quest: 'tides',
    questName: 'Pulihkan saluran suaka',
    questText:
      'Bantu dua relawan, bagi enam unit air di laboratorium, lalu tantang Sisilaut. Rajapari datang setelah lencana; menangkapnya opsional.',
    story:
      'Festival telah menyala, tetapi sensor pesisir mengirim kabar: pompa suaka membagi air ke saluran yang salah. Gresipol dan Nikopel membantu dari dermaga. Sisilaut menjaga arena dan jalur menuju pari legenda.',
    goal: 'Dua relawan → katup laboratorium → Sisilaut → Rajapari opsional.',
    badge: 'Lencana Pasang',
    image: 'img/maps/exterior/3-1.webp',
    tile: -1,
  },
  {
    name: 'Puncak Sinyal',
    subtitle: 'Langit cerah, pikiran terbuka',
    levels: [41, 46],
    wild: [10, 11, 15, 16, 20, 23, 26, 28, 18, 50, 62, 67, 83],
    signature: 10,
    trainers: [30, 31, 32, 5],
    required: [30, 31, 32],
    quest: 'orbit',
    questName: 'Selaraskan observatorium',
    questText:
      'Tanding dengan Maudy dan Cinta, ulangi tiga pola sinyal di kubah, lalu hadapi Bachar Hitung. Jalakawatt menunggu setelah final.',
    story:
      'Cahaya festival kini terlihat dari gunung. Observatorium kehilangan kalibrasi saat pemadaman. Maudy, Cinta, dan Bachar Hitung perlu bantuan untuk menyalakan kembali pemantau cuaca warga.',
    goal: 'Dua penantang → tiga pola teleskop → Bachar Hitung → Lencana Orbit.',
    badge: 'Lencana Orbit',
    image: 'img/maps/exterior/4-1.webp',
    tile: -1,
  },
  {
    name: 'Stasiun Sela',
    subtitle: 'Satu perjalanan lagi',
    levels: [38, 41],
    wild: [34, 35, 24, 26, 67, 39],
    signature: 34,
    trainers: [33, 34],
    required: [33, 34],
    quest: 'rail',
    questName: 'Sambungkan Peron 2',
    questText: 'Temui Chicco, putar rel pada panel wesel, lalu tantang Joe.',
    story:
      'Dari taman waduk, jalur melewati bengkel menuju stasiun komuter. Wesel latihan belum tersambung ke Peron 2. Chicco menjaga kopi penumpang; Joe menunggu di ujung peron.',
    goal: 'Chicco → panel wesel → Joe → penghubung Puncak Sinyal.',
    badge: 'Lencana Peron',
  },
  {
    name: 'Wargamall',
    subtitle: 'Kuliner ramai, kiriman hangat',
    levels: [19, 22],
    wild: [4, 39, 61, 67, 56, 58],
    signature: 61,
    trainers: [35, 36, 19],
    required: [35, 36],
    quest: 'orders',
    questName: 'Antar pesanan kuliner',
    questText:
      'Tanding dengan Arnampol di atrium, antar tiga pesanan dari dapur ke kedai, lalu tantang Raisambal di ruang acara.',
    story:
      'Wargamall mengumpulkan kedai kopi, tempe, dan sate di atrium. Arnampol menyiapkan kiriman; Raisambal menunggu semua kedai siap sebelum menutup bab keramaian.',
    goal: 'Arnampol → tiga kiriman hangat → Raisambal → dermaga Pasar Rakyat.',
    badge: 'Lencana Rasa',
  },
  {
    name: 'Kampung Bengkel',
    subtitle: 'Rakit, rawat, berangkat',
    levels: [30, 33],
    wild: [38, 39, 5, 8, 50, 63, 62, 83],
    signature: 63,
    trainers: [37, 38, 54],
    required: [37, 38],
    quest: 'gears',
    questName: 'Selaraskan roda servis',
    questText: 'Temui Desta, atur tiga roda servis, lalu tantang Iko.',
    story:
      'Dari pesisir suaka, rombongan naik ke bengkel dan taman waduk, lalu ke stasiun. Mesin servis macet. Desta menjaga bengkel, Iko menyiapkan pertandingan di halamannya.',
    goal: 'Desta → roda servis → Iko → Taman Waduk.',
    badge: 'Lencana Rakit',
  },
  {
    name: 'Taman Waduk',
    subtitle: 'Embun untuk seluruh taman',
    levels: [34, 37],
    wild: [40, 38, 22, 28, 39, 57, 62, 69, 44, 23, 1],
    signature: 40,
    trainers: [39, 40, 6],
    required: [39, 40],
    quest: 'irrigation',
    questName: 'Atur penyiram taman',
    questText: 'Temui Raline, cocokkan irigasi taman, lalu hadapi Denny.',
    story:
      'Taman waduk ramai warga olahraga pagi. Sensor penyiram kehilangan pengaturan; bunga kebanjiran, teratai malah kekeringan. Raline meminta bantuan sebelum pertandingan penutup Denny.',
    goal: 'Raline → irigasi → Denny → Lencana Embun.',
    badge: 'Lencana Embun',
  },
  {
    name: 'Jalur Kaldera',
    subtitle: 'Undangan di atas awan',
    levels: [50, 54],
    wild: [42, 44, 46, 38, 36, 48, 50, 56, 60, 0],
    signature: 42,
    trainers: [41, 42, 49],
    required: [41, 42],
    quest: 'kaldera',
    questName: 'Lintasi jalur kualifikasi',
    questText: 'Hadapi Fiersa dan Putri. Isi bekal sebelum naik ke observatorium.',
    story:
      'Sembilan lencana membawamu ke jalur kualifikasi Liga. Di balik kaldera, observatorium lama memancarkan sinyal yang sama setiap malam. Dua pendaki membantu mengamankan jalan.',
    goal: 'Fiersa → Putri → Observatorium Sunyi.',
  },
  {
    name: 'Observatorium Sunyi',
    subtitle: 'Mata di balik kubah',
    levels: [54, 57],
    wild: [44, 46, 18, 39, 50, 67, 64, 10],
    signature: 64,
    trainers: [43, 50],
    required: [43],
    quest: 'observatory-pass',
    questName: 'Temui peneliti kubah',
    questText:
      'Tanding dengan peneliti untuk membuka Liga. Tarsion terlihat di pelataran; quest penangkapannya terbuka setelah menjadi Juara.',
    story:
      'Tarsion masih menjaga laboratorium yang ditinggalkan saat pemadaman. Sang peneliti memulihkan datanya sambil menyiapkan ujian terakhir calon peserta Liga.',
    goal: 'Peneliti → Liga Nusantara. Tarsion menunggu setelah Liga.',
  },
  {
    name: 'Liga Nusantara',
    subtitle: 'Empat penjaga, satu Juara',
    levels: [56, 67],
    wild: [],
    trainers: [44, 45, 46, 47, 48],
    required: [44, 45, 46, 47, 48],
    quest: 'champion',
    questName: 'Menjadi Juara Liga',
    questText:
      'Daftar satu rangkaian: Empat Penjaga lalu Juara. HP dan bekal terbawa antarlaga. Keluar wilayah atau menyerah mengulang rangkaian.',
    story:
      'Semua perjalanan warga bermuara di Liga. Empat Penjaga mengawal Arus, Tempo, Bara, dan Tenaga; Prabu Wibawa mempertahankan gelar Juara dari podium.',
    goal: 'Daftar → Empat Penjaga → Lilincah Natsirup → Balai Juara.',
  },
  {
    name: 'Teluk Pinisi',
    subtitle: 'Layar tujuh, galangan satu',
    image: 'img/maps/exterior/5-1.webp',
    tile: -1,
    levels: [60, 64],
    wild: [81, 32, 73, 62, 9, 26, 31],
    signature: 32,
    trainers: [55, 56, 57, 58, 59],
    required: [55, 56, 58, 59],
    quest: 'pinisi',
    questName: 'Luncurkan pinisi',
    questText:
      'Kumpulkan tiga pasak ulin di galangan, pasar ikan, dan ujung jalan dermaga, lalu pasang di lambung pinisi. Lewati {trainer55}, usir {trainer58}, lalu tantang {trainer59}.',
    story:
      'Pinisi Pak Darto berlabuh di teluk para pembuat kapal. Panrita lopi menyiapkan peluncuran, tetapi Barisan Bara menarik "iuran labuh" dari setiap perahu.\n\nDari dermaga, jalan naik ke Rimba Ulin. Kapal-kapal besar di teluk ini berlayar terus ke Kota Sagara.',
    goal: 'Tiga pasak ulin → {trainer58} → {trainer59} → Cap Pinisi.',
    badge: 'Cap Pinisi',
  },
  {
    name: 'Rimba Ulin',
    subtitle: 'Kayu besi, hati lembut',
    image: 'img/maps/exterior/5-2.webp',
    tile: -1,
    levels: [63, 67],
    wild: [90, 91, 13, 72, 76, 23, 82],
    signature: 90,
    trainers: [60, 61, 62, 63, 64],
    required: [60, 62, 63, 64],
    quest: 'ulin',
    questName: 'Hapus tanda gergaji',
    questText:
      '{trainer62} dan {trainer63} menandai tiga pohon ulin dengan cat merah. Hapus ketiga tanda, bantu {trainer60}, lalu temui {trainer64} di pos jagawana.',
    story:
      'Hutan ulin tua menjadi rumah enggang dan orangutan. Tanda cat merah Barisan Bara muncul di batang-batang tertua: pohon yang ditandai akan ditebang malam ini.',
    goal: 'Tiga tanda merah → {trainer62} dan {trainer63} → {trainer64} → Cap Ulin.',
    badge: 'Cap Ulin',
  },
  {
    name: 'Lembah Tongkonan',
    subtitle: 'Rumah leluhur, atap perahu',
    image: 'img/maps/exterior/5-3.webp',
    tile: -1,
    levels: [66, 70],
    wild: [54, 51, 17, 53, 46, 72, 30],
    signature: 54,
    trainers: [65, 66, 67, 68, 69],
    required: [65, 67, 68, 69],
    quest: 'tongkonan',
    questName: "Pulihkan ukiran pa'ssura'",
    questText:
      'Patok palsu {trainer67} menutup halaman. Putar tiga ukiran tongkonan sesuai pesan tetua, tanding dengan {trainer68}, lalu hadapi {trainer69} di titik pandang.',
    story:
      "Di lembah Toraja, tongkonan berdiri berjajar menghadap utara. Barisan Bara datang membawa sertifikat bercap bara dan patok-patok baru. Ne' Tominaa butuh bantuan memulihkan ukiran yang dicopot.",
    goal: 'Ukiran → {trainer68} → {trainer69} → Cap Tongkonan.',
    badge: 'Cap Tongkonan',
  },
  {
    name: 'Kawah Dieng',
    subtitle: 'Asap kawah, candi tua',
    image: 'img/maps/exterior/5-4.webp',
    tile: -1,
    levels: [69, 73],
    wild: [86, 51, 43, 38, 63, 75],
    signature: 86,
    trainers: [70, 71, 72, 73, 74],
    required: [71, 72, 73, 70, 74],
    quest: 'dieng',
    questName: 'Matikan Mesin Bara',
    questText:
      'Kalahkan penjaga mesin, {trainer72} dan {trainer73}, matikan tiga Mesin Bara, minta restu {trainer70}, lalu hadapi {trainer74} di bibir kawah.',
    story:
      'Dataran tinggi Dieng berselimut kabut belerang. Mesin Bara memompa uap kawah ke pipa-pipa menuju Kota Sagara. Sejak itu candi berguncang dan elang besar penjaga langit menghilang.',
    goal: 'Tiga mesin → {trainer70} → {trainer74} → Elangkasa.',
    badge: 'Cap Dieng',
  },
];
const REGION_TRAINER_REFS = {
  0: { trainer0: 0, trainer1: 1, trainer2: 2, trainer9: 9 },
  4: {
    trainer13: [13, false],
    trainer14: [14, false],
    trainer15: [15, false],
    trainer17: [17, false],
    trainer23: [23, false],
  },
  5: { trainer7: 7, trainer24: 24, trainer25: 25, trainer26: 26 },
  6: { trainer27: 27, trainer28: 28, trainer29: 29 },
  7: { trainer30: 30, trainer31: 31, trainer32: 32 },
  8: { trainer33: 33, trainer34: 34 },
  9: { trainer35: 35, trainer36: 36 },
  10: { trainer37: 37, trainer38: 38 },
  11: { trainer39: 39, trainer40: 40 },
  12: { trainer41: 41, trainer42: 42 },
  14: { trainer47: 47, trainer48: 48 },
  15: { trainer55: 55, trainer58: 58, trainer59: 59 },
  16: { trainer60: 60, trainer62: 62, trainer63: 63, trainer64: 64 },
  17: { trainer67: 67, trainer68: 68, trainer69: 69 },
  18: { trainer70: 70, trainer72: 72, trainer73: 73, trainer74: 74 },
};
// Chapter five's local leaders give a Cap (a stamp in the Paspor Seberang) instead of a
// Lencana; the admin and the boss of Barisan Bara wait behind them. Their gates are in
// LEADER_GATES (progress.js).
const SEBERANG_LEADERS = Object.freeze({ 59: 15, 64: 16, 68: 17, 70: 18 });
const SEBERANG_GATED = Object.freeze([59, 64, 68, 69, 70, 74]);
// Region text names trainers by ID, so a renamed trainer is renamed everywhere.
for (const [region, refs] of Object.entries(REGION_TRAINER_REFS))
  for (const field of ['questText', 'story', 'goal']) {
    const original = REGIONS[region][field],
      key = `region.${region}.${field}`;
    Object.defineProperty(REGIONS[region], field, {
      configurable: true,
      enumerable: true,
      get() {
        return trainerText(key, original, refs);
      },
    });
  }
// Sukamaju's quest text names the two route opponents by ID.
Object.defineProperty(REGIONS[0], 'questText', {
  configurable: true,
  enumerable: true,
  get() {
    return trainerText(
      'region.0.routeQuest',
      '{trainer2} menunggu di dekat toko. {trainer9} mengambil paket di warung Bu Sari. Temui keduanya sebelum meminta surat jalan.',
      { trainer2: 2, trainer9: 9 },
    );
  },
});
