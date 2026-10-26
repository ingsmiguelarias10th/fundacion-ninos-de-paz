/*
 * Capa de datos. Habla con Google Apps Script (Google Sheets) cuando hay API_URL,
 * o con el almacenamiento del navegador en modo demostración.
 */
const Api = (() => {
  const cfg = window.APP_CONFIG || {};
  const remoto = Boolean(cfg.API_URL && String(cfg.API_URL).trim());
  const CLAVE_SESION = 'ndp_token';

  let token = null;
  try { token = sessionStorage.getItem(CLAVE_SESION); } catch (_) { token = null; }

  function guardarToken(t) {
    token = t;
    try {
      if (t) sessionStorage.setItem(CLAVE_SESION, t);
      else sessionStorage.removeItem(CLAVE_SESION);
    } catch (_) { /* sesión solo en memoria */ }
  }

  async function sha256(texto) {
    const datos = new TextEncoder().encode(texto);
    const hash = await crypto.subtle.digest('SHA-256', datos);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* ---------------------------- Google Apps Script --------------------------- */

  async function llamar(accion, datos = {}) {
    let res;
    try {
      res = await fetch(cfg.API_URL, {
        method: 'POST',
        // text/plain evita la petición previa de CORS que Apps Script no responde
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ accion, token, ...datos }),
        redirect: 'follow'
      });
    } catch (e) {
      throw new Error('No hay conexión con la base de datos. Revisa tu internet.');
    }
    let json;
    try { json = await res.json(); } catch (_) {
      throw new Error('La base de datos respondió algo inesperado. Revisa la URL en js/config.js.');
    }
    if (!json.ok) {
      const err = new Error(json.error || 'Ocurrió un error.');
      err.sesionVencida = json.codigo === 'SESION';
      if (err.sesionVencida) guardarToken(null);
      throw err;
    }
    return json.datos;
  }

  const google = {
    async login(usuario, clave) {
      const r = await llamar('login', { usuario, clave });
      guardarToken(r.token);
      return r;
    },
    async logout() {
      try { await llamar('logout'); } catch (_) { /* da igual */ }
      guardarToken(null);
    },
    solicitarCodigo: correo => llamar('solicitarCodigo', { correo }),
    restablecer: (correo, codigo, nueva) => llamar('restablecer', { correo, codigo, nueva }),
    cuenta: () => llamar('cuenta'),
    async actualizarCuenta(d) {
      const r = await llamar('actualizarCuenta', d);
      if (r && r.token) guardarToken(r.token); // al cambiar la contraseña se renueva la sesión
      return r;
    },
    listar: () => llamar('listar'),
    obtener: id => llamar('obtener', { id }),
    guardar: (registro, pdfBase64) => llamar('guardar', { registro, pdf: pdfBase64 })
  };

  /* ----------------------------- Modo demostración --------------------------- */

  const LS_REG = 'ndp_demo_registros';
  const LS_CTA = 'ndp_demo_cuenta';

  function leer(clave, porDefecto) {
    try { return JSON.parse(localStorage.getItem(clave)) ?? porDefecto; } catch (_) { return porDefecto; }
  }
  function escribir(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); }
    catch (_) { throw new Error('El navegador no tiene espacio para guardar más registros en modo demostración.'); }
  }
  function cuentaDemo() {
    return { usuario: cfg.DEMO_USUARIO, salt: cfg.DEMO_SALT, hash: cfg.DEMO_HASH, correo: '', ...leer(LS_CTA, {}) };
  }
  function exigirSesion() {
    if (!token) {
      const e = new Error('Tu sesión terminó. Vuelve a ingresar.');
      e.sesionVencida = true;
      throw e;
    }
  }
  function resumen(r) {
    return {
      id: r.id, nombre: r.nombre, documento: r.documento, edad: r.edad,
      acuNombre: r.acuNombre, acuTelefono: r.acuTelefono, creado: r.creado
    };
  }

  const demo = {
    async login(usuario, clave) {
      const c = cuentaDemo();
      const ok = usuario.trim().toLowerCase() === c.usuario.toLowerCase() && (await sha256(c.salt + clave)) === c.hash;
      if (!ok) throw new Error('Usuario o contraseña incorrectos.');
      guardarToken('demo-' + Date.now());
      return { usuario: c.usuario, correo: c.correo, debeCambiar: false, demo: true };
    },
    async logout() { guardarToken(null); },
    async solicitarCodigo() {
      throw new Error('En modo demostración no se envían correos. Conecta Google Sheets para usar la recuperación por correo.');
    },
    async restablecer() {
      throw new Error('En modo demostración no se envían correos.');
    },
    async cuenta() {
      exigirSesion();
      const c = cuentaDemo();
      return { usuario: c.usuario, correo: c.correo };
    },
    async actualizarCuenta({ correo, claveActual, claveNueva }) {
      exigirSesion();
      const c = cuentaDemo();
      const cambios = leer(LS_CTA, {});
      if (claveNueva) {
        if ((await sha256(c.salt + (claveActual || ''))) !== c.hash) throw new Error('La contraseña actual no es correcta.');
        cambios.hash = await sha256(c.salt + claveNueva);
      }
      if (correo !== undefined) cambios.correo = correo;
      escribir(LS_CTA, cambios);
      return { correo: cambios.correo ?? c.correo };
    },
    async listar() {
      exigirSesion();
      return leer(LS_REG, []).map(resumen);
    },
    async obtener(id) {
      exigirSesion();
      const r = leer(LS_REG, []).find(x => x.id === id);
      if (!r) throw new Error('No se encontró el registro.');
      return r;
    },
    async guardar(registro) {
      exigirSesion();
      const lista = leer(LS_REG, []);
      const ahora = new Date().toISOString();
      const doc = String(registro.documento || '').trim();
      if (lista.some(x => x.id !== registro.id && String(x.documento).trim() === doc)) {
        throw new Error('Ya existe un joven registrado con el documento ' + doc + '.');
      }
      if (registro.id) {
        const i = lista.findIndex(x => x.id === registro.id);
        if (i < 0) throw new Error('No se encontró el registro.');
        lista[i] = { ...lista[i], ...registro, actualizado: ahora };
      } else {
        registro = { ...registro, id: 'NP-' + Date.now().toString(36).toUpperCase(), creado: ahora, actualizado: ahora };
        lista.unshift(registro);
      }
      escribir(LS_REG, lista);
      return { id: registro.id || lista[0].id, pdfUrl: '' };
    }
  };

  const impl = remoto ? google : demo;
  return {
    ...impl,
    remoto,
    tieneSesion: () => Boolean(token)
  };
})();
