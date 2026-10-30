// ============================================================
//  Plugin Internet Archive para Zynora  (v1.0.0)
//  Películas y caricaturas de dominio público de archive.org
//  /details/ID  -> ficha de la película; el video sale de /metadata/ID
// ============================================================
const WEB = "https://archive.org";
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

function pedir(url) {
  return zynora.fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json,*/*" } });
}

function buscarEnArchive(consulta, filas, orden) {
  const url = WEB + "/advancedsearch.php?q=" + encodeURIComponent(consulta) +
    "&fl[]=identifier&fl[]=title&fl[]=year" +
    "&sort[]=" + encodeURIComponent(orden || "downloads desc") +
    "&rows=" + (filas || 30) + "&page=1&output=json";
  return pedir(url).then(function (r) {
    if (!r.ok) return [];
    let docs = [];
    try { docs = JSON.parse(r.text()).response.docs || []; } catch (e) { return []; }
    return docs.filter(function (d) { return d.identifier && d.title; }).map(comoItem);
  });
}

function comoItem(d) {
  const titulo = Array.isArray(d.title) ? d.title[0] : d.title;
  return {
    id: "ia-" + d.identifier,
    ref: WEB + "/details/" + d.identifier,
    title: String(titulo).slice(0, 150),
    kind: "movie",
    year: d.year ? String(d.year) : "",
    poster: WEB + "/services/img/" + d.identifier
  };
}

export async function search(q) {
  const texto = String(q.q || "").replace(/["()]/g, " ").trim();
  if (!texto) return [];
  const consulta = "(" + texto + ") AND mediatype:movies";
  return await buscarEnArchive(consulta, 30, "downloads desc");
}

export async function home() {
  const filasDef = [
    ["clasicas", "Películas clásicas", "collection:feature_films AND mediatype:movies"],
    ["caricaturas", "Caricaturas", "collection:animationandcartoons AND mediatype:movies"],
    ["cine-mudo", "Cine mudo", "collection:silent_films AND mediatype:movies"],
    ["scifi", "Ciencia ficción y terror", "collection:SciFi_Horror AND mediatype:movies"]
  ];
  const lotes = await Promise.all(filasDef.map(async function (f) {
    try { return await buscarEnArchive(f[2], 30, "downloads desc"); } catch (e) { return []; }
  }));
  const filas = [];
  filasDef.forEach(function (f, i) {
    if (lotes[i].length >= 3) filas.push({ id: f[0], title: f[1], items: lotes[i] });
  });
  return filas;
}

function elegirVideo(archivos) {
  const mp4 = archivos.filter(function (f) { return /\.mp4$/i.test(f.name || ""); });
  const tam = function (f) { return Number(f.size) || 0; };
  const grande = function (lista) { return lista.sort(function (a, b) { return tam(b) - tam(a); })[0]; };

  const h264 = mp4.filter(function (f) { return /h\.?264/i.test(f.format || ""); });
  if (h264.length) return { f: grande(h264), mime: "video/mp4" };
  if (mp4.length) return { f: grande(mp4), mime: "video/mp4" };

  const otros = archivos.filter(function (f) { return /\.(ogv|webm|mkv)$/i.test(f.name || ""); });
  if (otros.length) {
    const f = grande(otros);
    return { f: f, mime: /\.webm$/i.test(f.name) ? "video/webm" : "video/ogg" };
  }
  return null;
}

export async function resolve(ref) {
  const m = String(ref).match(/\/details\/([^\/?#]+)/);
  if (!m) throw zynora.error("not_found", "Enlace no válido", { userMessage: "Enlace no válido" });
  const id = m[1];

  const r = await pedir(WEB + "/metadata/" + id);
  if (!r.ok) throw zynora.error("not_found", "HTTP " + r.status, { userMessage: "No se pudo abrir la película (HTTP " + r.status + ")." });

  let archivos = [];
  try { archivos = JSON.parse(r.text()).files || []; } catch (e) {}

  const v = elegirVideo(archivos);
  if (!v) throw zynora.error("not_found", "Sin video", { userMessage: "Esta película no tiene un video que se pueda reproducir." });

  const url = WEB + "/download/" + id + "/" + encodeURIComponent(v.f.name).replace(/%2F/g, "/");
  return { url: url, mime: v.mime, headers: { Referer: WEB + "/", "User-Agent": UA } };
}
