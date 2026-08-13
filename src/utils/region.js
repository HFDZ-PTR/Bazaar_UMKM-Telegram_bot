// src/utils/region.js
// Ekstrak wilayah (provinsi/region) dari lokasi + caption


const KNOWN_REGIONS = [
  "Jabodetabek",
  "Jawa Barat",
  "Banten",
  "DI Yogyakarta",
  "Jawa Tengah",
  "Jawa Timur",
  "Bali & Nusa Tenggara",
  "Sumatera",
  "Kalimantan",
  "Sulawesi",
  "Papua & Maluku",
  "Lainnya",
];


const UNKNOWN_REGION = "Lainnya";


// Mapping kota/wilayah ke region
const CITY_TO_REGION = {
  // Jabodetabek
  jakarta: "Jabodetabek",
  jkt: "Jabodetabek",
  bandung: "Jawa Barat",
  bogor: "Jawa Barat",
  depok: "Jabodetabek",
  tangerang: "Banten",
  bekasi: "Jabodetabek",
  cibubur: "Jawa Barat",
  cirebon: "Jawa Barat",
  sukabumi: "Jawa Barat",
  tasikmalaya: "Jawa Barat",
  garut: "Jawa Barat",
  purwakarta: "Jawa Barat",
  subang: "Jawa Barat",
  indramayu: "Jawa Barat",
  kuningan: "Jawa Barat",
  majalengka: "Jawa Barat",
  sumedang: "Jawa Barat",
  cianjur: "Jawa Barat",
  serang: "Banten",
  cilegon: "Banten",
  pandeglang: "Banten",
  lebak: "Banten",
  
  // Jawa Tengah
  semarang: "Jawa Tengah",
  solo: "Jawa Tengah",
  surakarta: "Jawa Tengah",
  yogyakarta: "DI Yogyakarta",
  jogja: "DI Yogyakarta",
  magelang: "Jawa Tengah",
  salatiga: "Jawa Tengah",
  pekalongan: "Jawa Tengah",
  tegal: "Jawa Tengah",
  purwokerto: "Jawa Tengah",
  kebumen: "Jawa Tengah",
  kudus: "Jawa Tengah",
  jepara: "Jawa Tengah",
  pati: "Jawa Tengah",
  rembang: "Jawa Tengah",
  blora: "Jawa Tengah",
  boyolali: "Jawa Tengah",
  klaten: "Jawa Tengah",
  sukoharjo: "Jawa Tengah",
  wonogiri: "Jawa Tengah",
  karanganyar: "Jawa Tengah",
  sragen: "Jawa Tengah",
  cilacap: "Jawa Tengah",
  banjarnegara: "Jawa Tengah",
  purworejo: "Jawa Tengah",
  wonosobo: "Jawa Tengah",
  batang: "Jawa Tengah",
  kendal: "Jawa Tengah",
  temanggung: "Jawa Tengah",
  
  // Jawa Timur
  surabaya: "Jawa Timur",
  malang: "Jawa Timur",
  mojokerto: "Jawa Timur",
  sidoarjo: "Jawa Timur",
  gresik: "Jawa Timur",
  pasuruan: "Jawa Timur",
  probolinggo: "Jawa Timur",
  lumajang: "Jawa Timur",
  jember: "Jawa Timur",
  banyuwangi: "Jawa Timur",
  bondowoso: "Jawa Timur",
  situbondo: "Jawa Timur",
  kediri: "Jawa Timur",
  blitar: "Jawa Timur",
  tulungagung: "Jawa Timur",
  trenggalek: "Jawa Timur",
  nganjuk: "Jawa Timur",
  madiun: "Jawa Timur",
  magetan: "Jawa Timur",
  ngawi: "Jawa Timur",
  bojonegoro: "Jawa Timur",
  tuban: "Jawa Timur",
  lamongan: "Jawa Timur",
  bangkalan: "Jawa Timur",
  sampang: "Jawa Timur",
  sumenep: "Jawa Timur",
  pamekasan: "Jawa Timur",
  
  // Bali & Nusa Tenggara
  bali: "Bali & Nusa Tenggara",
  denpasar: "Bali & Nusa Tenggara",
  mataram: "Bali & Nusa Tenggara",
  lombok: "Bali & Nusa Tenggara",
  sumbawa: "Bali & Nusa Tenggara",
  flores: "Bali & Nusa Tenggara",
  kupang: "Bali & Nusa Tenggara",
  nusa: "Bali & Nusa Tenggara",
  
  // Sumatera
  medan: "Sumatera",
  aceh: "Sumatera",
  banda: "Sumatera",
  padang: "Sumatera",
  pekanbaru: "Sumatera",
  jambi: "Sumatera",
  palembang: "Sumatera",
  lampung: "Sumatera",
  bandarlampung: "Sumatera",
  bengkulu: "Sumatera",
  batam: "Sumatera",
  tanjungpinang: "Sumatera",
  dumai: "Sumatera",
  bukittinggi: "Sumatera",
  solok: "Sumatera",
  sawahlunto: "Sumatera",
  padangpanjang: "Sumatera",
  payakumbuh: "Sumatera",
  pariaman: "Sumatera",
  
  // Kalimantan
  pontianak: "Kalimantan",
  banjarmasin: "Kalimantan",
  balikpapan: "Kalimantan",
  samarinda: "Kalimantan",
  palangkaraya: "Kalimantan",
  tarakan: "Kalimantan",
  bontang: "Kalimantan",
  singkawang: "Kalimantan",
  ketapang: "Kalimantan",
  sintang: "Kalimantan",
  putussibau: "Kalimantan",
  muarateweh: "Kalimantan",
  sampit: "Kalimantan",
  pangkalanbun: "Kalimantan",
  kuala: "Kalimantan",
  kapuas: "Kalimantan",
  mempah: "Kalimantan",
  ngabang: "Kalimantan",
  Bengkayang: "Kalimantan",
  
  // Sulawesi
  makassar: "Sulawesi",
  manado: "Sulawesi",
  palu: "Sulawesi",
  kendari: "Sulawesi",
  gorontalo: "Sulawesi",
  mamuju: "Sulawesi",
  parepare: "Sulawesi",
  palopo: "Sulawesi",
  masamba: "Sulawesi",
  watampone: "Sulawesi",
  sinjai: "Sulawesi",
  bulukumba: "Sulawesi",
  bantaeng: "Sulawesi",
  jeneponto: "Sulawesi",
  takalar: "Sulawesi",
  gowa: "Sulawesi",
  maros: "Sulawesi",
  pangkajene: "Sulawesi",
  barru: "Sulawesi",
  pinrang: "Sulawesi",
  polewali: "Sulawesi",
  majene: "Sulawesi",
  mamasa: "Sulawesi",
  tana: "Sulawesi",
  toraja: "Sulawesi",
  luwu: "Sulawesi",
  kolaka: "Sulawesi",
  buton: "Sulawesi",
  muna: "Sulawesi",
  bombana: "Sulawesi",
  wakatobi: "Sulawesi",
  toliko: "Sulawesi",
  morowali: "Sulawesi",
  banggai: "Sulawesi",
  tolitoli: "Sulawesi",
  buol: "Sulawesi",
  parigi: "Sulawesi",
  sigi: "Sulawesi",
  donggala: "Sulawesi",
  poso: "Sulawesi",
  tojo: "Sulawesi",
  ampana: "Sulawesi",
  luwuk: "Sulawesi",
  banggai: "Sulawesi",
  
  // Papua & Maluku
  papua: "Papua & Maluku",
  jayapura: "Papua & Maluku",
  manokwari: "Papua & Maluku",
  sorong: "Papua & Maluku",
  merauke: "Papua & Maluku",
  timika: "Papua & Maluku",
  biak: "Papua & Maluku",
  nabire: "Papua & Maluku",
  wamena: "Papua & Maluku",
  asmat: "Papua & Maluku",
  bintuni: "Papua & Maluku",
  fakfak: "Papua & Maluku",
  kaimana: "Papua & Maluku",
  teluk: "Papua & Maluku",
  ambon: "Papua & Maluku",
  ternate: "Papua & Maluku",
  tidore: "Papua & Maluku",
  sofifi: "Papua & Maluku",
  tobelo: "Papua & Maluku",
  labuha: "Papua & Maluku",
  sanana: "Papua & Maluku",
  namlea: "Papua & Maluku",
  namrole: "Papua & Maluku",
  dobo: "Papua & Maluku",
  saumlaki: "Papua & Maluku",
  moa: "Papua & Maluku",
  larat: "Papua & Maluku",
  tual: "Papua & Maluku",
  langgur: "Papua & Maluku",
  tiakur: "Papua & Maluku",
  matakus: "Papua & Maluku",
  atambua: "Papua & Maluku",
  betun: "Papua & Maluku",
  maumere: "Papua & Maluku",
  ende: "Papua & Maluku",
  ruteng: "Papua & Maluku",
  labuan: "Papua & Maluku",
  bajo: "Papua & Maluku",
  waingapu: "Papua & Maluku",
  waikabubak: "Papua & Maluku",
  lewoleba: "Papua & Maluku",
  larantuka: "Papua & Maluku",
  reo: "Papua & Maluku",
  bajawa: "Papua & Maluku",
  ngada: "Papua & Maluku",
  ende: "Papua & Maluku",
  nagekeo: "Papua & Maluku",
  mbay: "Papua & Maluku",
  soe: "Papua & Maluku",
  kefamenanu: "Papua & Maluku",
  atambua: "Papua & Maluku",
  betun: "Papua & Maluku",
  malaka: "Papua & Maluku",
};


function normalizeText(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function extractRegion(location = "", caption = "", hashtag = "") {
  const text = normalizeText(`${location} ${caption} ${hashtag || ""}`);
  
  // Cari keyword kota/wilayah yang known
  for (const [city, region] of Object.entries(CITY_TO_REGION)) {
    if (text.includes(city)) {
      return region;
    }
  }
  
  return UNKNOWN_REGION;
}


function listKnownRegions() {
  return KNOWN_REGIONS;
}


module.exports = {
  extractRegion,
  listKnownRegions,
  UNKNOWN_REGION,
  CITY_TO_REGION,
  KNOWN_REGIONS,
};