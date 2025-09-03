// tools/scrape-madrid.js
// Scrapea títulos "a la venta" en cadenas principales y guarda data/madrid-cartelera.json
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const SOURCES = [
  { chain: "Kinepolis", url: "https://kinepolis.es/?main_section=ya+a+la+venta" },
  { chain: "Cinesa",    url: "https://www.cinesa.es/peliculas/" },
  { chain: "Yelmo",     url: "https://www.yelmocines.es/cartelera" }
];

const CITY = "Madrid";
const norm = (s="") => s.replace(/\s+/g, " ").trim();

async function extractTitles(page, chain, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000); // deja cargar JS
  let titles = [];
  if (chain === "Kinepolis") {
    titles = await page.$$eval("a[href*='/peliculas/'], .views-row a, article a",
      els => els.map(e => e.textContent?.trim()).filter(Boolean));
  } else if (chain === "Cinesa") {
    titles = await page.$$eval("a[href*='/peliculas/'], .movie-card a, a.c-link",
      els => els.map(e => e.textContent?.trim()).filter(Boolean));
  } else if (chain === "Yelmo") {
    titles = await page.$$eval("a[href*='/pelicula/'], .movie-card a",
      els => els.map(e => e.textContent?.trim()).filter(Boolean));
  }
  titles = titles.map(norm).filter(t => t.length > 2 && t.length < 140);
  return [...new Set(titles)];
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let all = [];

  for (const src of SOURCES) {
    try {
      const list = await extractTitles(page, src.chain, src.url);
      console.log(`✔ ${src.chain}: ${list.length} títulos`);
      all.push(...list);
    } catch (e) {
      console.warn(`⚠ ${src.chain}: ${e.message}`);
    }
  }
  await browser.close();

  // De-dupe global
  const seen = new Set();
  const unique = [];
  for (const t of all) {
    const key = t.toLowerCase();
    if (!seen.has(key)) { seen.add(key); unique.push(t); }
  }

  const data = { city: CITY, updated_at: new Date().toISOString(), titles: unique };
  const outFile = path.join("data", "madrid-cartelera.json");
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2), "utf8");
  console.log(`💾 Guardado: ${outFile}`);
}
run();
