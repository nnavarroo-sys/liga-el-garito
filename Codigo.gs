/**
 * Liga El Garito: servidor en Google Apps Script.
 *
 * Guarda el ranking, el calendario y el torneo de cada fecha en una planilla de Google
 * y responde a la página publicada en GitHub Pages. Pasos de instalación en README.md.
 *
 *   1. Cambia PIN_ORGANIZADOR (abajo) por un PIN que solo conozcas tú.
 *      No lo subas a GitHub: cámbialo solo aquí, en el editor de Apps Script.
 *   2. Ejecuta la función setup() una vez (crea la planilla de datos).
 *   3. Implementar > Nueva implementación > Aplicación web
 *      Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario.
 *   4. Copia la URL que termina en /exec y pégala en config.js.
 *   5. Abre la página, toca «Soy el organizador» y escribe el PIN.
 *      La primera vez se suben solos los datos actuales de la liga.
 */

const PIN_ORGANIZADOR = 'CAMBIA-ESTE-PIN';

const TZ = 'America/Santiago';
const PART = 40000;                    // caracteres por celda (Google Sheets admite hasta 50.000)
const CACHE_PART = 90000;              // caracteres por entrada de caché (hasta 100 KB)
const CACHE_SECS = 21600;              // 6 horas
const MAX_DOC = 3000000;               // tamaño máximo de los datos
const KEEP_BACKUPS = 40;               // copias de seguridad que se conservan
const BACKUP_EVERY_MS = 6 * 3600 * 1000;
const HOJAS = { ranking: 'Ranking', resultados: 'Resultados', registro: 'Registro', respaldos: 'Respaldos', datos: 'Datos' };

/* ---------------- instalación ---------------- */

/** Ejecútala una vez desde el editor. Crea la planilla «Liga El Garito · Datos» en tu Drive. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  const id = props.getProperty('SPREADSHEET_ID');
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (ss) { Logger.log('La planilla ya existe: ' + ss.getUrl()); return ss.getUrl(); }

  ss = SpreadsheetApp.create('Liga El Garito · Datos');
  props.setProperties({ SPREADSHEET_ID: ss.getId(), DOC_V: '0', DOC_UPDATED: '', DOC_LEN: '0' });
  encabezado(ss, HOJAS.ranking, ['Puesto', 'Jugador', 'Puntos', 'Fechas jugadas', 'Fechas ganadas', 'Podios', 'Mejor puesto', 'Clasifica al Master Final']);
  encabezado(ss, HOJAS.resultados, ['Fecha', 'Día', 'Categoría', 'Puesto', 'Jugador', 'Puntos', 'Ajuste', 'Total', 'Nota']);
  encabezado(ss, HOJAS.registro, ['Cuándo', 'Acción', 'Detalle']);
  encabezado(ss, HOJAS.respaldos, ['Cuándo', 'Versión', 'Motivo', 'Partes', 'Datos (no editar)']);
  encabezado(ss, HOJAS.datos, ['Parte', 'Datos de la liga (no editar)']);
  const nombres = Object.keys(HOJAS).map(function (k) { return HOJAS[k]; });
  ss.getSheets().forEach(function (sh) { if (nombres.indexOf(sh.getName()) < 0) ss.deleteSheet(sh); });
  registrar(ss, 'instalación', 'Planilla creada. Para subir los datos, entra a la página como organizador.');
  Logger.log('Planilla creada: ' + ss.getUrl());
  return ss.getUrl();
}

function encabezado(ss, nombre, cols) {
  const sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

/* ---------------- web ---------------- */

/** Lectura pública. ?since=N responde solo «sin cambios» si la versión sigue siendo N. */
function doGet(e) {
  try {
    const q = (e && e.parameter) || {};
    const m = meta(false);
    if (q.since !== undefined && q.since !== '' && Number(q.since) === m.v) return json({ ok: true, v: m.v, updated: m.updated, same: true });
    if (!m.v) return json({ ok: true, v: 0, updated: '', doc: null });
    return conDoc('{"ok":true', m);
  } catch (err) {
    return json({ ok: false, msg: amable(err) });
  }
}

function doPost(e) {
  let p;
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json({ ok: false, msg: 'Solicitud no válida.' }); }
  const fn = ACCIONES[p.action];
  if (!fn) return json({ ok: false, msg: 'Acción desconocida.' });
  try {
    necesitaAdmin(p);
  } catch (err) {
    return json(Object.assign({ ok: false, msg: amable(err) }, err.extra || {}));
  }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json({ ok: false, kind: 'busy', msg: 'El servidor está ocupado. Se reintentará en unos segundos.' });
  }
  try {
    return fn(p);
  } catch (err) {
    return json(Object.assign({ ok: false, msg: amable(err) }, err.extra || {}));
  } finally {
    lock.releaseLock();
  }
}

function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function crudo(texto) { return ContentService.createTextOutput(texto).setMimeType(ContentService.MimeType.JSON); }
/** Respuesta con los datos de la liga, armada como texto para no convertirlos dos veces. */
function conDoc(inicio, m) {
  return crudo(inicio + ',"v":' + m.v + ',"updated":' + JSON.stringify(m.updated) + ',"doc":' + textoDoc(m) + '}');
}
function fallar(msg, extra) { const e = new Error(msg); e.user = true; e.extra = extra; throw e; }
function amable(err) { return err && err.user ? err.message : 'Error del servidor: ' + (err && err.message ? err.message : err); }

/* ---------------- acciones del organizador ---------------- */

const ACCIONES = {
  /* Comprueba el PIN. Devuelve la versión y la planilla. */
  check: function () {
    const m = meta(true);
    return json({ ok: true, v: m.v, updated: m.updated, sheet: libro().getUrl() });
  },

  /* Guarda los datos. base es la versión sobre la que se hicieron los cambios. */
  save: function (p) {
    const ss = libro(), m = meta(true), base = Number(p.base);
    if (!(base >= 0) || base !== m.v) {
      if (!m.v) return json({ ok: false, kind: 'conflict', v: 0, updated: '', doc: null });
      return conDoc('{"ok":false,"kind":"conflict"', m);
    }
    const doc = p.doc;
    validar(doc);
    const prev = m.v ? JSON.parse(textoDoc(m)) : null;
    proteger(prev, doc);
    const res = escribir(ss, m, doc);
    const resumen = cambios(prev, doc);
    if (resumen.length) registrar(ss, 'guardado n.º ' + res.v, resumen.join(' · '));
    respaldar(ss, prev, doc, res, false);
    hojasLegibles(ss, doc);
    return json({ ok: true, v: res.v, updated: res.updated });
  },

  /* Lista las copias de seguridad, de la más nueva a la más antigua. */
  backups: function () {
    const sh = libro().getSheetByName(HOJAS.respaldos), last = sh.getLastRow(), out = [];
    if (last >= 2) {
      sh.getRange(2, 1, last - 1, 3).getValues().forEach(function (r) {
        if (String(r[1]).trim() !== '') out.push({ when: texto(r[0]), v: Number(r[1]), why: texto(r[2]) });
      });
    }
    out.reverse();
    return json({ ok: true, list: out });
  },

  /* Vuelve a una copia de seguridad. Lo de ahora queda guardado como otra copia. */
  restore: function (p) {
    const ss = libro(), m = meta(true), want = Number(p.version);
    const sh = ss.getSheetByName(HOJAS.respaldos), last = sh.getLastRow();
    let fila = null, yaRespaldada = false;
    if (last >= 2) {
      const vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
      for (let i = vals.length - 1; i >= 0; i--) {
        if (!fila && Number(vals[i][1]) === want) fila = vals[i];
        if (Number(vals[i][1]) === m.v) yaRespaldada = true;
      }
    }
    if (!fila) fallar('No encontré esa copia de seguridad.');
    const partes = Number(fila[3]) || 0;
    const txt = fila.slice(4, 4 + partes).map(function (c) { return sinMarca(texto(c)); }).join('');
    let doc;
    try { doc = JSON.parse(txt); } catch (e) { fallar('La copia de seguridad está incompleta y no se puede usar.'); }
    validar(doc);
    const prev = m.v ? JSON.parse(textoDoc(m)) : null;
    if (prev && !yaRespaldada) respaldar(ss, null, prev, { v: m.v, text: JSON.stringify(prev) }, 'antes de restaurar');
    const res = escribir(ss, m, doc);
    registrar(ss, 'restaurado', 'Se volvió a la copia n.º ' + want + ' (' + texto(fila[0]) + '). Quedó como versión n.º ' + res.v + '.');
    hojasLegibles(ss, doc);
    return json({ ok: true, v: res.v, updated: res.updated });
  }
};

function necesitaAdmin(p) {
  if (PIN_ORGANIZADOR === 'CAMBIA-ESTE-PIN') fallar('Falta definir el PIN del organizador en el código de Apps Script.');
  const cache = CacheService.getScriptCache(), n = Number(cache.get('fallos') || 0);
  if (n >= 40) fallar('Demasiados intentos con un PIN incorrecto. Espera 10 minutos.');
  if (!p.pin || String(p.pin) !== PIN_ORGANIZADOR) {
    cache.put('fallos', String(n + 1), 600);
    fallar('PIN incorrecto.', { kind: 'pin' });
  }
}

/* ---------------- datos ---------------- */

let LIBRO = null;
function libro() {
  if (LIBRO) return LIBRO;
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) fallar('El servidor aún no está instalado: falta ejecutar setup().');
  LIBRO = SpreadsheetApp.openById(id);
  return LIBRO;
}

/** Versión actual. Se lee de la caché para que las visitas no gasten cuota; fresco=true la lee de las propiedades. */
function meta(fresco) {
  const cache = CacheService.getScriptCache();
  if (!fresco) {
    const c = cache.get('meta');
    if (c) { try { return JSON.parse(c); } catch (e) { /* se vuelve a leer */ } }
  }
  const pr = PropertiesService.getScriptProperties().getProperties();
  if (!pr.SPREADSHEET_ID) fallar('El servidor aún no está instalado: falta ejecutar setup().');
  const m = { v: Number(pr.DOC_V || 0), updated: pr.DOC_UPDATED || '', len: Number(pr.DOC_LEN || 0) };
  try { cache.put('meta', JSON.stringify(m), CACHE_SECS); } catch (e) { /* caché opcional */ }
  return m;
}

function textoDoc(m) {
  const n = Math.ceil((m.len || 0) / CACHE_PART), keys = [];
  for (let i = 0; i < n; i++) keys.push('doc_' + m.v + '_' + i);
  if (n) {
    try {
      const got = CacheService.getScriptCache().getAll(keys);
      if (keys.every(function (k) { return typeof got[k] === 'string'; })) return keys.map(function (k) { return got[k]; }).join('');
    } catch (e) { /* se lee de la planilla */ }
  }
  const txt = leerDoc(libro());
  if (!txt) fallar('No encontré los datos de la liga en la hoja «' + HOJAS.datos + '».');
  if (txt.length === m.len) cachear(m.v, txt);
  return txt;
}

function leerDoc(ss) {
  const sh = ss.getSheetByName(HOJAS.datos), last = sh.getLastRow();
  if (last < 2) return '';
  return sh.getRange(2, 2, last - 1, 1).getValues().map(function (r) { return texto(r[0]); })
    .filter(function (s) { return s !== ''; }).map(sinMarca).join('');
}

/* Cada parte se guarda con «J:» delante para que la planilla nunca la lea como número o fórmula. */
function sinMarca(s) { return s.indexOf('J:') === 0 ? s.slice(2) : s; }
function partir(txt, n) { const out = []; for (let i = 0; i < txt.length; i += n) out.push(txt.slice(i, i + n)); return out; }
function texto(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss') : String(v == null ? '' : v); }

function cachear(v, txt) {
  try {
    const o = {};
    partir(txt, CACHE_PART).forEach(function (s, i) { o['doc_' + v + '_' + i] = s; });
    CacheService.getScriptCache().putAll(o, CACHE_SECS);
  } catch (e) { /* caché opcional */ }
}

/** Escribe una versión nueva y devuelve { v, updated, text }. */
function escribir(ss, m, doc) {
  doc.updated = new Date().toISOString();
  const txt = JSON.stringify(doc);
  if (txt.length > MAX_DOC) fallar('Los datos superan el tamaño máximo que acepta el servidor.');
  const sh = ss.getSheetByName(HOJAS.datos), antes = Math.max(0, sh.getLastRow() - 1);
  const filas = partir(txt, PART).map(function (s, i) { return [String(i + 1), 'J:' + s]; });
  asegurar(sh, 1 + filas.length, 2);
  const rg = sh.getRange(2, 1, filas.length, 2);
  rg.setNumberFormat('@');
  rg.setValues(filas);
  if (antes > filas.length) sh.getRange(2 + filas.length, 1, antes - filas.length, 2).clearContent();
  const v = m.v + 1, nm = { v: v, updated: doc.updated, len: txt.length };
  PropertiesService.getScriptProperties().setProperties({ DOC_V: String(v), DOC_UPDATED: nm.updated, DOC_LEN: String(nm.len) });
  try { CacheService.getScriptCache().put('meta', JSON.stringify(nm), CACHE_SECS); } catch (e) { /* caché opcional */ }
  cachear(v, txt);
  return { v: v, updated: nm.updated, text: txt };
}

function esObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
function validar(doc) {
  if (!esObj(doc) || !Array.isArray(doc.players) || !Array.isArray(doc.fechas) || !Array.isArray(doc.cats) ||
      !esObj(doc.tables) || !esObj(doc.settings) || !esObj(doc.league)) fallar('Los datos enviados no son válidos.');
}
function cerradas(d) { return d ? d.fechas.filter(function (f) { return f.status === 'cerrada'; }).length : 0; }

/* Red de seguridad: no acepta cambios que borren medio ranking de una vez. */
function proteger(prev, doc) {
  if (!prev) return;
  if (cerradas(doc) < cerradas(prev) - 1) fallar('Para proteger el ranking no se guardó: el cambio quitaba varias fechas cerradas a la vez.');
  if (doc.players.length < prev.players.length - 5) fallar('Para proteger el ranking no se guardó: el cambio quitaba muchos jugadores a la vez.');
}

function cambios(prev, doc) {
  const out = [];
  if (!prev) { out.push('Datos iniciales: ' + doc.players.length + ' jugadores y ' + doc.fechas.length + ' fechas'); return out; }
  const pf = {};
  prev.fechas.forEach(function (f) { pf[f.n] = f; });
  doc.fechas.forEach(function (f) {
    const o = pf[f.n];
    if (!o) out.push('Fecha ' + f.n + ' agregada');
    else if (o.status !== f.status) out.push('Fecha ' + f.n + ': ' + o.status + ' → ' + f.status);
  });
  prev.fechas.forEach(function (f) { if (!doc.fechas.some(function (x) { return x.n === f.n; })) out.push('Fecha ' + f.n + ' quitada'); });
  const pp = {};
  prev.players.forEach(function (p) { pp[p.id] = p; });
  const nuevos = doc.players.filter(function (p) { return !pp[p.id]; }).map(function (p) { return p.name; });
  const fuera = prev.players.filter(function (p) { return !doc.players.some(function (x) { return x.id === p.id; }); }).map(function (p) { return p.name; });
  if (nuevos.length) out.push('Jugadores nuevos: ' + nuevos.join(', '));
  if (fuera.length) out.push('Jugadores quitados: ' + fuera.join(', '));
  if (JSON.stringify(prev.tables) !== JSON.stringify(doc.tables)) out.push('Tabla de puntos cambiada');
  if (JSON.stringify(prev.settings) !== JSON.stringify(doc.settings)) out.push('Ajustes cambiados');
  return out;
}

/** Copia de seguridad al subir los datos, al cerrar o reabrir una fecha, y cada 6 horas con cambios. */
function respaldar(ss, prev, doc, res, motivo) {
  const props = PropertiesService.getScriptProperties();
  const ultima = Number(props.getProperty('BACKUP_AT') || 0), ahora = Date.now();
  let why = motivo || '';
  if (!why) {
    if (!prev) why = 'datos iniciales';
    else if (cerradas(prev) !== cerradas(doc)) why = cerradas(doc) > cerradas(prev) ? 'fecha cerrada' : 'fecha reabierta';
    else if (ahora - ultima >= BACKUP_EVERY_MS) why = 'automática';
  }
  if (!why) return;
  const sh = ss.getSheetByName(HOJAS.respaldos);
  const partes = partir(res.text, PART).map(function (s) { return 'J:' + s; });
  const fila = [Utilities.formatDate(new Date(ahora), TZ, 'yyyy-MM-dd HH:mm:ss'), String(res.v), why, String(partes.length)].concat(partes);
  asegurar(sh, sh.getLastRow() + 1, fila.length);
  sh.getRange(sh.getLastRow() + 1, 1, 1, fila.length).setNumberFormat('@').setValues([fila]);
  props.setProperty('BACKUP_AT', String(ahora));
  const sobran = sh.getLastRow() - 1 - KEEP_BACKUPS;
  if (sobran > 0) sh.deleteRows(2, sobran);
}

/* ---------------- hojas para mirar: Ranking y Resultados ---------------- */

function hojasLegibles(ss, doc) {
  const cl = doc.fechas.filter(function (f) { return f.status === 'cerrada' && Array.isArray(f.results); })
    .sort(function (a, b) { return a.n - b.n; });
  const nom = {};
  doc.players.forEach(function (p) { nom[p.id] = p.name; });
  const firma = hash(JSON.stringify([cl.map(function (f) { return [f.n, f.date, f.cat, f.results]; }), nom, doc.settings.qualify]));
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHEETS_SIG') === firma) return;

  const tot = {};
  cl.forEach(function (f) {
    f.results.forEach(function (r) {
      if (!r.p) return;
      const e = tot[r.p] || (tot[r.p] = { p: r.p, pts: 0, nf: 0, win: 0, pod: 0, best: 99, seen: {} });
      if (e.seen[f.n]) return;
      e.seen[f.n] = true;
      e.pts += (Number(r.b) || 0) + (Number(r.a) || 0); e.nf++;
      if (r.pl === 1) e.win++;
      if (r.pl <= 3) e.pod++;
      e.best = Math.min(e.best, r.pl);
    });
  });
  const arr = Object.keys(tot).map(function (k) { return tot[k]; });
  arr.sort(function (a, b) { return b.pts - a.pts || String(nom[a.p] || '').localeCompare(String(nom[b.p] || ''), 'es'); });
  const Q = Number(doc.settings.qualify) || 24;
  let pos = 0;
  const rk = arr.map(function (e, i) {
    if (i === 0 || arr[i - 1].pts !== e.pts) pos = i + 1;
    return [pos, nom[e.p] || '—', e.pts, e.nf, e.win, e.pod, e.best + '°', pos <= Q ? 'Sí' : ''];
  });
  llenar(ss.getSheetByName(HOJAS.ranking), rk, 8, [2]);

  const res = [];
  cl.forEach(function (f) {
    f.results.slice().sort(function (a, b) { return a.pl - b.pl || String(nom[a.p] || '').localeCompare(String(nom[b.p] || ''), 'es'); })
      .forEach(function (r) {
        const b = Number(r.b) || 0, a = Number(r.a) || 0;
        res.push([f.n, f.date, f.cat, r.pl, nom[r.p] || '—', b, a, b + a, r.n || '']);
      });
  });
  llenar(ss.getSheetByName(HOJAS.resultados), res, 9, [2, 3, 5, 9]);
  props.setProperty('SHEETS_SIG', firma);
}

/** Reemplaza las filas de una hoja (bajo el encabezado). Las columnas de texto se guardan como texto. */
function llenar(sh, filas, ncol, colsTexto) {
  const antes = Math.max(0, sh.getLastRow() - 1);
  if (antes) sh.getRange(2, 1, antes, ncol).clearContent();
  if (!filas.length) return;
  asegurar(sh, 1 + filas.length, ncol);
  colsTexto.forEach(function (c) { sh.getRange(2, c, filas.length, 1).setNumberFormat('@'); });
  sh.getRange(2, 1, filas.length, ncol).setValues(filas);
}

/** Agranda la hoja si hace falta, para que nunca falten filas o columnas. */
function asegurar(sh, filas, cols) {
  const mr = sh.getMaxRows(), mc = sh.getMaxColumns();
  if (filas > mr) sh.insertRowsAfter(mr, filas - mr);
  if (cols > mc) sh.insertColumnsAfter(mc, cols - mc);
}

function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + s.length.toString(36); }

function registrar(ss, accion, detalle) {
  try {
    ss.getSheetByName(HOJAS.registro).appendRow([Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'), accion, String(detalle).slice(0, 500)]);
  } catch (e) { /* registro opcional */ }
}
