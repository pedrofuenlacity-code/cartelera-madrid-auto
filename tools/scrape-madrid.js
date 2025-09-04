// Scrapea títulos y guarda data/madrid-cartelera.json (crea data/ si falta)
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const SOURCES = [
  { chain: "Kinepolis", url: "https://kinepolis.es/?main_section=ya+a+la+venta" },
  { chain: "Cinesa",    url: "https://www.cinesa.es/peliculas/" },
  { chain: "Yelmo",     url: "https://www.yelmocines.es/cartelera" }
];

const CITY = "Madrid";
const OUT_DIR = path.join("data");
const OUT_FILE = path.join(OUT_DIR, "madrid-cartelera.json");
const norm = (s="") => s.replace(/\s+/g, " ").trim();
const dedupe = (arr) => { const s=new Set(), o=[]; for(const t of arr){const k=t.toLowerCase(); if(!s.has(k)){s.add(k); o.push(t);} } return o; };

async function extractTitles(page, chain) {
  let titles = [];
  if (chain === "Kinepolis") {
    titles = await page.$$eval(
      "a[href*='/peliculas/'], article a, .views-row a, .movie-card a, a.card",
      els => els.map(e => e.textContent?.trim()).filter(Boolean)
    );
  } else if (chain === "Cinesa") {
    titles = await page.$$eval(
      "a[href*='/peliculas/'], .movie-card a, a.c-link, h3, h2",
      els => els.map(e => e.textContent?.trim()).filter(Boolean)
    );
  } else if (chain === "Yelmo") {
    titles = await page.$$eval(
      "a[href*='/pelicula/'], a[href*='/peliculas/'], .movie-card a, h3, h2",
      els => els.map(e => e.textContent?.trim()).filter(Boolean)
    );
  }
  return dedupe(titles.map(norm).filter(t => t.length > 2 && t.length < 140));
}

async function gotoAndWait(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(3000);
  try { await page.waitForSelector("img, article, a, .movie-card", { timeout: 7000 }); } catch {}
  await page.waitForTimeout(1500);
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true }); // ⬅ evita ENOENT
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    viewport: { width: 1366, height: 850 }
  });
  const page = await context.newPage();

  let all = [];
  for (const src of SOURCES) {
    try { await gotoAndWait(page, src.url); const list = await extractTitles(page, src.chain);
      console.log(`✔ ${src.chain}: ${list.length} títulos`); all.push(...list);
    } catch (e) { console.warn(`⚠ ${src.chain}: ${e.message}`); }
  }

  const payload = { city: CITY, updated_at: new Date().toISOString(), titles: dedupe(all) };
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), "utf8");
  console.log(`💾 Guardado: ${OUT_FILE} (${payload.titles.length} títulos)`);
  await browser.close();
}
run().catch(e => { console.error(e); process.exit(1); });
