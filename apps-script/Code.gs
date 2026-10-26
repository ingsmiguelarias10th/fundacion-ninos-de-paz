/**
 * Backend del aplicativo de la Fundación Niños de Paz.
 *
 * Se pega en Extensiones > Apps Script de una hoja de cálculo de Google y se
 * publica como aplicación web. Guarda cada inscripción como una fila de la
 * hoja "Inscritos" y deja el PDF, la foto y la firma en una carpeta de Drive.
 *
 * Seguridad:
 *  - La contraseña nunca se guarda en texto plano (SHA-256 con sal).
 *  - Las sesiones duran 6 horas y se invalidan al cambiar la contraseña.
 *  - Tras 5 intentos fallidos el inicio de sesión se bloquea 15 minutos.
 *  - El código de recuperación vence en 15 minutos y admite 5 intentos.
 */

const HOJA = 'Inscritos';
const CARPETA = 'Fundación Niños de Paz - Inscripciones';
const ZONA = 'America/Bogota';
const SESION_SEG = 6 * 60 * 60;
const MAX_INTENTOS = 5;
const BLOQUEO_SEG = 15 * 60;

// Credenciales iniciales (solo el hash). Al primer ingreso el aplicativo obliga a cambiarlas.
const USUARIO_INICIAL = 'admin.ninosdepaz';
const SALT_INICIAL = 'ee6076bc51ccda504f1f6f52d020728c';
const HASH_INICIAL = '363bf6a1a95d84be901afb345e3f2be6928c738d8574abd1a0b2665662223296';

// clave interna -> título de la columna en la hoja
const COLUMNAS = [
  ['id', 'ID'],
  ['creado', 'Fecha de registro'],
  ['actualizado', 'Última actualización'],
  ['nombre', 'Nombre completo'],
  ['fechaNacimiento', 'Fecha de nacimiento'],
  ['edad', 'Edad'],
  ['documento', 'Documento de identidad'],
  ['telefono', 'Teléfono'],
  ['direccion', 'Dirección de residencia'],
  ['colegio', 'Colegio'],
  ['grado', 'Grado'],
  ['jornada', 'Jornada'],
  ['eps', 'EPS / Salud'],
  ['condicion', '¿Enfermedad, alergia o condición?'],
  ['condicionCual', '¿Cuál?'],
  ['observaciones', 'Observaciones adicionales'],
  ['acuNombre', 'Acudiente - Nombre completo'],
  ['acuCedula', 'Acudiente - Cédula'],
  ['acuParentesco', 'Acudiente - Parentesco'],
  ['acuOcupacion', 'Acudiente - Ocupación'],
  ['acuTelefono', 'Acudiente - Teléfono'],
  ['acuDireccion', 'Acudiente - Dirección'],
  ['acuCorreo', 'Acudiente - Correo electrónico'],
  ['autoriza', 'Autorización del acudiente'],
  ['fechaFirma', 'Fecha de firma'],
  ['pdfUrl', 'PDF'],
  ['fotoUrl', 'Foto'],
  ['firmaUrl', 'Firma'],
  ['pdfId', 'pdfId'],
  ['fotoId', 'fotoId'],
  ['firmaId', 'firmaId']
];
const CAMPOS_FORM = ['nombre', 'fechaNacimiento', 'edad', 'documento', 'telefono', 'direccion', 'colegio', 'grado',
  'jornada', 'eps', 'condicion', 'condicionCual', 'observaciones', 'acuNombre', 'acuCedula', 'acuParentesco',
  'acuOcupacion', 'acuTelefono', 'acuDireccion', 'acuCorreo', 'autoriza', 'fechaFirma'];
const OCULTAS = ['pdfId', 'fotoId', 'firmaId'];

/* =============================== Entrada HTTP =============================== */

function doGet() {
  return ContentService.createTextOutput('API de la Fundación Niños de Paz funcionando.');
}

function doPost(e) {
  let p;
  try {
    p = JSON.parse(e.postData.contents);
  } catch (err) {
    return salida_({ ok: false, error: 'Solicitud inválida.' });
  }
  try {
    const publicas = { login: login_, solicitarCodigo: solicitarCodigo_, restablecer: restablecer_ };
    const privadas = {
      logout: logout_, cuenta: cuenta_, actualizarCuenta: actualizarCuenta_,
      listar: listar_, obtener: obtener_, guardar: guardar_
    };
    if (publicas[p.accion]) return salida_({ ok: true, datos: publicas[p.accion](p) });
    if (!privadas[p.accion]) throw new Error('Acción no permitida.');
    if (!sesionValida_(p.token)) {
      return salida_({ ok: false, codigo: 'SESION', error: 'Tu sesión terminó. Vuelve a ingresar.' });
    }
    return salida_({ ok: true, datos: privadas[p.accion](p) });
  } catch (err) {
    return salida_({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

function salida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ================================== Cuenta ================================== */

function props_() { return PropertiesService.getScriptProperties(); }
function cache_() { return CacheService.getScriptCache(); }

function leerCuenta_() {
  const p = props_().getProperties();
  return {
    usuario: p.usuario || USUARIO_INICIAL,
    salt: p.salt || SALT_INICIAL,
    hash: p.hash || HASH_INICIAL,
    correo: p.correo || '',
    debeCambiar: !p.hash,
    version: p.version || '1'
  };
}

function sha256_(texto) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function iguales_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function nuevaSal_() {
  return sha256_(Utilities.getUuid() + Utilities.getUuid() + Date.now()).slice(0, 32);
}

function fijarClave_(clave) {
  if (String(clave || '').length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  const c = leerCuenta_();
  const salt = nuevaSal_();
  props_().setProperties({
    salt: salt,
    hash: sha256_(salt + clave),
    version: String(Number(c.version) + 1)
  });
}

function nuevaSesion_() {
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  cache_().put('s_' + token, leerCuenta_().version, SESION_SEG);
  return token;
}

function sesionValida_(token) {
  if (!token || typeof token !== 'string') return false;
  const v = cache_().get('s_' + token);
  if (!v || v !== leerCuenta_().version) return false;
  cache_().put('s_' + token, v, SESION_SEG); // renueva mientras se usa
  return true;
}

function login_(p) {
  const cache = cache_();
  const fallos = Number(cache.get('fallos') || 0);
  if (fallos >= MAX_INTENTOS) throw new Error('Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.');
  const c = leerCuenta_();
  const usuarioOk = String(p.usuario || '').trim().toLowerCase() === c.usuario.toLowerCase();
  const claveOk = iguales_(sha256_(c.salt + String(p.clave || '')), c.hash);
  if (!usuarioOk || !claveOk) {
    cache.put('fallos', String(fallos + 1), BLOQUEO_SEG);
    throw new Error('Usuario o contraseña incorrectos.');
  }
  cache.remove('fallos');
  return { token: nuevaSesion_(), usuario: c.usuario, correo: c.correo, debeCambiar: c.debeCambiar };
}

function logout_(p) {
  cache_().remove('s_' + p.token);
  return {};
}

function cuenta_() {
  const c = leerCuenta_();
  return { usuario: c.usuario, correo: c.correo };
}

function correoValido_(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo);
}

function actualizarCuenta_(p) {
  const c = leerCuenta_();
  const r = {};
  if (p.correo !== undefined) {
    const correo = String(p.correo || '').trim().toLowerCase();
    if (correo && !correoValido_(correo)) throw new Error('El correo no es válido.');
    if (p.primera && !correo) throw new Error('Asocia un correo de recuperación.');
    props_().setProperty('correo', correo);
    r.correo = correo;
  }
  if (p.claveNueva) {
    const permitidoSinActual = p.primera && c.debeCambiar;
    if (!permitidoSinActual && !iguales_(sha256_(c.salt + String(p.claveActual || '')), c.hash)) {
      throw new Error('La contraseña actual no es correcta.');
    }
    if (iguales_(sha256_(SALT_INICIAL + p.claveNueva), HASH_INICIAL)) {
      throw new Error('Elige una contraseña diferente a la inicial.');
    }
    fijarClave_(p.claveNueva);
    cache_().remove('s_' + p.token);
    r.token = nuevaSesion_(); // las demás sesiones quedan cerradas
  }
  return r;
}

function solicitarCodigo_(p) {
  const c = leerCuenta_();
  const correo = String(p.correo || '').trim().toLowerCase();
  const cache = cache_();
  if (cache.get('reset_espera')) throw new Error('Ya enviamos un código hace poco. Espera un minuto antes de pedir otro.');
  cache.put('reset_espera', '1', 60);
  // Misma respuesta coincida o no, para no revelar cuál es el correo asociado.
  if (c.correo && correo === c.correo) {
    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    cache.put('reset', JSON.stringify({ hash: sha256_(c.salt + codigo), intentos: 0 }), BLOQUEO_SEG);
    MailApp.sendEmail({
      to: c.correo,
      name: 'Fundación Niños de Paz',
      subject: 'Código para cambiar tu contraseña',
      htmlBody:
        '<div style="font-family:Arial,sans-serif;color:#1f2340">' +
        '<p>Hola,</p><p>Recibimos una solicitud para cambiar la contraseña del panel de administración de la Fundación Niños de Paz.</p>' +
        '<p style="font-size:28px;letter-spacing:6px;font-weight:bold;color:#4f7a28">' + codigo + '</p>' +
        '<p>El código vence en 15 minutos. Si no fuiste tú, ignora este mensaje.</p></div>'
    });
  }
  return { mensaje: 'Si el correo coincide con el de la cuenta, te enviamos un código.' };
}

function restablecer_(p) {
  const c = leerCuenta_();
  const cache = cache_();
  const guardado = cache.get('reset');
  const correo = String(p.correo || '').trim().toLowerCase();
  if (!guardado || !c.correo || correo !== c.correo) throw new Error('El código no es válido o ya venció. Pide uno nuevo.');
  const r = JSON.parse(guardado);
  if (r.intentos >= MAX_INTENTOS) {
    cache.remove('reset');
    throw new Error('Demasiados intentos. Pide un código nuevo.');
  }
  if (!iguales_(sha256_(c.salt + String(p.codigo || '').trim()), r.hash)) {
    r.intentos++;
    cache.put('reset', JSON.stringify(r), BLOQUEO_SEG);
    throw new Error('El código no es correcto.');
  }
  fijarClave_(p.nueva);
  cache.remove('reset');
  cache.remove('fallos');
  return { mensaje: 'Contraseña actualizada.' };
}

/* ================================ Inscripciones ================================ */

function hoja_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(HOJA);
  if (!sh) sh = ss.insertSheet(HOJA, 0);
  if (sh.getLastRow() === 0) {
    const titulos = COLUMNAS.map(function (c) { return c[1]; });
    sh.getRange(1, 1, 1, titulos.length).setValues([titulos])
      .setFontWeight('bold').setBackground('#4f7a28').setFontColor('#ffffff').setWrap(true);
    sh.setFrozenRows(1);
    sh.setFrozenColumns(4);
    sh.getRange(2, 1, sh.getMaxRows() - 1, titulos.length).setNumberFormat('@'); // todo como texto
    OCULTAS.forEach(function (k) { sh.hideColumns(indice_(titulos, k) + 1); });
  }
  return sh;
}

function indice_(titulos, clave) {
  const titulo = COLUMNAS.filter(function (c) { return c[0] === clave; })[0][1];
  return titulos.indexOf(titulo);
}

function tabla_() {
  const sh = hoja_();
  const valores = sh.getDataRange().getDisplayValues();
  const titulos = valores[0];
  const mapa = {};
  COLUMNAS.forEach(function (c) { mapa[c[0]] = titulos.indexOf(c[1]); });
  const filas = valores.slice(1).map(function (fila, i) {
    const o = { _fila: i + 2 };
    COLUMNAS.forEach(function (c) { o[c[0]] = mapa[c[0]] >= 0 ? fila[mapa[c[0]]] : ''; });
    return o;
  }).filter(function (o) { return o.id; });
  return { sh: sh, titulos: titulos, mapa: mapa, filas: filas };
}

function listar_() {
  return tabla_().filas
    .map(function (r) {
      return { id: r.id, nombre: r.nombre, documento: r.documento, edad: r.edad,
        acuNombre: r.acuNombre, acuTelefono: r.acuTelefono, creado: r.creado };
    })
    .sort(function (a, b) { return a.creado < b.creado ? 1 : -1; });
}

function obtener_(p) {
  const r = tabla_().filas.filter(function (x) { return x.id === p.id; })[0];
  if (!r) throw new Error('No se encontró el registro.');
  const out = {};
  CAMPOS_FORM.forEach(function (k) { out[k] = r[k]; });
  out.id = r.id;
  out.creado = r.creado;
  out.pdfUrl = r.pdfUrl;
  out.foto = archivoComoDataUrl_(r.fotoId);
  out.firma = archivoComoDataUrl_(r.firmaId);
  return out;
}

function guardar_(p) {
  const d = p.registro || {};
  const faltan = ['nombre', 'fechaNacimiento', 'documento', 'acuNombre', 'acuCedula', 'acuTelefono']
    .filter(function (k) { return !String(d[k] || '').trim(); });
  if (faltan.length) throw new Error('Faltan campos obligatorios.');
  if (d.autoriza !== 'Sí') throw new Error('Falta la autorización del acudiente.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const t = tabla_();
    const documento = String(d.documento).trim();
    const duplicado = t.filas.filter(function (x) { return x.documento.trim() === documento && x.id !== d.id; })[0];
    if (duplicado) throw new Error('Ya existe un joven registrado con el documento ' + documento + ' (' + duplicado.nombre + ').');

    let previo = null;
    if (d.id) {
      previo = t.filas.filter(function (x) { return x.id === d.id; })[0];
      if (!previo) throw new Error('No se encontró el registro que intentas editar.');
    }
    const ahora = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd HH:mm:ss');
    const id = previo ? previo.id : 'NP-' + Date.now().toString(36).toUpperCase();
    const fila = {};
    CAMPOS_FORM.forEach(function (k) { fila[k] = String(d[k] == null ? '' : d[k]).slice(0, 500); });
    fila.id = id;
    fila.creado = previo ? previo.creado : ahora;
    fila.actualizado = ahora;

    const carpeta = carpeta_();
    const base = (id + ' ' + fila.nombre).replace(/[\\/:*?"<>|]/g, '').slice(0, 90);
    const archivos = [
      ['foto', d.foto, base + ' - foto'],
      ['firma', d.firma, base + ' - firma'],
      ['pdf', p.pdf ? 'data:application/pdf;base64,' + p.pdf : '', 'Inscripción ' + base + '.pdf']
    ];
    archivos.forEach(function (a) {
      const clave = a[0];
      if (previo && previo[clave + 'Id']) papelera_(previo[clave + 'Id']);
      const archivo = a[1] ? crearArchivo_(carpeta, a[1], a[2]) : null;
      fila[clave + 'Id'] = archivo ? archivo.getId() : '';
      fila[clave + 'Url'] = archivo ? archivo.getUrl() : '';
    });

    const valores = t.titulos.map(function () { return ''; });
    COLUMNAS.forEach(function (c) {
      const i = t.mapa[c[0]];
      if (i >= 0) valores[i] = seguro_(fila[c[0]]);
    });
    const numFila = previo ? previo._fila : t.sh.getLastRow() + 1;
    const rango = t.sh.getRange(numFila, 1, 1, valores.length);
    rango.setNumberFormat('@');
    rango.setValues([valores]);
    return { id: id, pdfUrl: fila.pdfUrl };
  } finally {
    lock.releaseLock();
  }
}

/** Evita que un texto que empieza por =, +, - o @ se interprete como fórmula. */
function seguro_(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/* =================================== Drive =================================== */

function carpeta_() {
  const id = props_().getProperty('carpetaId');
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (err) { /* se crea de nuevo */ }
  }
  const f = DriveApp.createFolder(CARPETA);
  props_().setProperty('carpetaId', f.getId());
  return f;
}

function crearArchivo_(carpeta, dataUrl, nombre) {
  const m = /^data:(image\/png|image\/jpeg|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m) throw new Error('Un archivo adjunto no tiene un formato válido.');
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 8 * 1024 * 1024) throw new Error('Un archivo adjunto es demasiado grande.');
  const ext = m[1] === 'image/png' ? '.png' : m[1] === 'image/jpeg' ? '.jpg' : '';
  const nombreFinal = /\.pdf$/.test(nombre) ? nombre : nombre + ext;
  return carpeta.createFile(Utilities.newBlob(bytes, m[1], nombreFinal));
}

function papelera_(id) {
  try { DriveApp.getFileById(id).setTrashed(true); } catch (err) { /* ya no existe */ }
}

function archivoComoDataUrl_(id) {
  if (!id) return '';
  try {
    const blob = DriveApp.getFileById(id).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (err) {
    return '';
  }
}

/* ============================ Funciones de mantenimiento ============================ */

/**
 * Ejecútala UNA vez desde el editor (botón "Ejecutar") para dar permisos y crear
 * la hoja "Inscritos" y la carpeta de Drive.
 */
function configurarInicial() {
  hoja_();
  carpeta_();
  MailApp.getRemainingDailyQuota(); // pide el permiso de envío de correo
  Logger.log('Listo. Hoja "%s" y carpeta "%s" preparadas.', HOJA, CARPETA);
}

/**
 * Si se pierde la contraseña y no hay correo asociado, ejecútala desde el editor.
 * Vuelve al usuario y la contraseña iniciales y cierra todas las sesiones.
 */
function restablecerAdministrador() {
  const c = leerCuenta_();
  ['usuario', 'salt', 'hash'].forEach(function (k) { props_().deleteProperty(k); });
  props_().setProperty('version', String(Number(c.version) + 1));
  cache_().remove('fallos');
  Logger.log('Cuenta restablecida a las credenciales iniciales.');
}
