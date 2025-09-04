// tools/scrape-madrid.js
// Cartelera Madrid desde Yelmo (página de ciudad) + Kinepolis.
// Cinesa desactivado por defecto (bloquea IPs de datacenter como GitHub Actions).

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const CITY = "Madrid";
const OUT_DIR = path.join("data");
const OUT_FILE = path.join(OUT_DIR, "madrid-cartelera.json");

// Activa Cinesa sólo si tienes proxy residencial: export CINESA_ENABLED=true
const CINESA_ENABLED = process.env.CINESA_ENABLED === "true";

// Fuentes
const SOURCES = [
  { chain: "Yelmo", url: "https://yelmocines.es/cartelera/madrid" },
  { chain: "Kinepolis", url: "https://kinepolis.es/?main_section=ya+a+la+venta" },
  ...(CINESA_ENABLED ? [{ chain: "Cinesa", url: "https://www.cinesa.es/peliculas/" }] : [])
];

const norm = (s="") => s.replace(/\s+/g, " ").replace(/\s*·\s*/g, " · ").trim();
const dedupe = arr => {
  const seen = new Set(); const out = [];
  for (const t of arr) { const k = t.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(t); } }
  return out;
};

async function closeCommonModals(page) {
  // Cookies/país/geolocalización típicos
  const candidates = [
    'button:has-text("Aceptar")',
    'button:has-text("ACEPTAR")',
    'button:has-text("Entendido")',
    'button:has-text("Cerrar")',
    'button:has-text("Continuar")',
    'button:has-text("OK")',
    'text=CAMBIAR DE PAÍS',        // Yelmo
    'text=¿Nos dejas saber',       // Yelmo
  ];
  for (const sel of candidates) {
    const el = await page.$(sel).catch(()=>null);
    if (el) { try { await el.click({ timeout: 2000 }); } catch {} }
  }
}

async function gotoAndReady(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(2500);
  await closeCommonModals(page);
  // Espera algo de contenido típico de tarjeta
  try { await page.waitForSelector("img, article, .card, .movie-card, h3", { timeout: 8000 }); } catch {}
  await page.waitForTimeout(800);
}

async function titlesForChain(page, chain) {
  let titles = [];
  if (chain === "Yelmo") {
    // Página de ciudad: /cartelera/madrid
    // Titulares de tarjetas (evitamos textos de UI)
    titles = await page.$$eval(
      "a[href*='/pelicula/'] .card-movie__title, .card-movie__title, .movie-card h3, a[href*='/pelicula/'] h3",
      els => els.map(e => e.textContent?.trim()).filter(Boolean)
    );
  } else if (chain === "Kinepolis") {
    titles = await page.$$eval(
      "a[href*='/peliculas/'] .title, .movie-card h3, .view-content a[href*='/peliculas/'], article a[href*='/peliculas/']",
      els => els.map(e => e.textContent?.trim()).filter(Boolean)
    );
  } else if (chain === "Cinesa") {
    // Solo si CINESA_ENABLED=true y usas proxy residencial
    titles = await page.$$eval(
      "a[href*='/peliculas/'] h3, .movie-card h3, a.c-link h3, .movie-card a",
      els => els.map(e => e.textContent?.trim()).filter(Boolean)
    );
  }
  // Filtrado: evita falsos positivos (botones, preguntas, textos largos)
  return dedupe(
    titles
      .map(norm)
      .filter(t => t.length >= 2 && t.length <= 120)
      .filter(t => !/¿|Por qué|CAMBIAR DE PAÍS|CATÁLOGO|En las Redes|Ingresa tus datos/i.test(t))
  );
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    locale: "es-ES",
    viewport: { width: 1366, height: 850 },
  });
  const page = await context.newPage();

  let all = [];
  for (const src of SOURCES) {
    try {
      await gotoAndReady(page, src.url);
      const list = await titlesForChain(page, src.chain);
      console.log(`✔ ${src.chain}: ${list.length} títulos`);
      all.push(...list);
    } catch (e) {
      console.warn(`⚠ ${src.chain}: ${e.message}`);
    }
  }

  const payload = { city: CITY, updated_at: new Date().toISOString(), titles: dedupe(all) };
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), "utf8");
  console.log(`💾 Guardado: ${OUT_FILE} (${payload.titles.length} títulos)`);

  await browser.close();
}

run().catch(err => { console.error(err); process.exit(1); });
