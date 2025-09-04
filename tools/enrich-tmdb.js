import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const API_KEY = process.env.TMDB_API_KEY;
const LANG = "es-ES";
if (!API_KEY) { console.error("❌ Falta TMDB_API_KEY"); process.exit(1); }

const src = path.join("data", "madrid-cartelera.json");
const out = path.join("data", "enriched", "madrid-cartelera.json");
fs.mkdirSync(path.dirname(out), { recursive: true });

async function searchTMDb(title){
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${API_KEY}&language=${LANG}&query=${encodeURIComponent(title)}&include_adult=false`;
  const r = await fetch(url); if (!r.ok) return null;
  const d = await r.json(); return d.results?.[0] || null;
}

(async ()=>{
  const base = JSON.parse(fs.readFileSync(src, "utf8"));
  const outObj = { ...base, movies: [] };
  for (const t of base.titles) {
    const hit = await searchTMDb(t);
    outObj.movies.push({
      title: t,
      poster: hit?.poster_path ? `https://image.tmdb.org/t/p/w500${hit.poster_path}` : null,
      overview: hit?.overview || null,
      release_date: hit?.release_date || null
    });
    await new Promise(r=>setTimeout(r,300));
  }
  fs.writeFileSync(out, JSON.stringify(outObj,null,2),"utf8");
  console.log(`💾 Enriched → ${out}`);
})();
