/* Lógica de la interfaz del aplicativo de la Fundación Niños de Paz. */
(() => {
  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

  const POR_PAGINA = 10;
  const estado = {
    registros: [],
    filtro: '',
    pagina: 1,
    editando: null,      // registro completo cuando se edita
    foto: '',            // data URL de la foto actual
    firmaPintada: false,
    previa: null,        // { contexto: 'form' | 'ver', datos }
    ocupado: false
  };

  /* ------------------------------ Utilidades ------------------------------ */

  function mostrarVista(id) {
    const enApp = ['vista-lista', 'vista-form'].includes(id);
    $('#app').hidden = !enApp;
    $$('.vista').forEach(v => { v.hidden = v.id !== id; });
    window.scrollTo(0, 0);
    const foco = $(`#${id} input:not([type=hidden])`);
    if (foco && !enApp) setTimeout(() => foco.focus(), 30);
  }

  function cargando(texto) {
    $('#cargando').hidden = !texto;
    if (texto) $('#cargando-texto').textContent = texto;
  }

  let temporizadorToast;
  function avisar(texto, malo = false) {
    const t = $('#toast');
    t.textContent = texto;
    t.classList.toggle('malo', malo);
    t.hidden = false;
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => { t.hidden = true; }, malo ? 6000 : 3500);
  }

  function errorEn(form, texto) {
    const p = $('.error', form);
    if (p) p.textContent = texto || '';
  }

  function normalizar(s) {
    return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  function edadDesde(iso) {
    if (!iso) return '';
    const n = new Date(iso + 'T00:00:00');
    if (Number.isNaN(n.getTime())) return '';
    const hoy = new Date();
    let e = hoy.getFullYear() - n.getFullYear();
    const m = hoy.getMonth() - n.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) e--;
    return e >= 0 ? String(e) : '';
  }

  function hoyIso() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  async function conBoton(boton, fn) {
    if (estado.ocupado) return;
    estado.ocupado = true;
    if (boton) boton.disabled = true;
    try { await fn(); }
    finally {
      estado.ocupado = false;
      if (boton) boton.disabled = false;
    }
  }

  function manejarError(e, form) {
    if (e && e.sesionVencida) {
      cargando(null);
      $$('dialog[open]').forEach(d => d.close());
      mostrarVista('vista-login');
      errorEn($('#form-login'), 'Tu sesión terminó. Vuelve a ingresar.');
      return;
    }
    const msg = (e && e.message) || 'Ocurrió un error inesperado.';
    if (form) errorEn(form, msg);
    else avisar(msg, true);
  }

  /* ---------------------------- Inicio de sesión ---------------------------- */

  $$('.ver-clave').forEach(b => b.addEventListener('click', () => {
    const input = b.previousElementSibling;
    const ver = input.type === 'password';
    input.type = ver ? 'text' : 'password';
    b.textContent = ver ? 'Ocultar' : 'Ver';
    b.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
  }));

  $$('[data-ir]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.ir === 'recuperar') {
      $('#form-codigo').hidden = false;
      $('#form-restablecer').hidden = true;
      $$('#vista-recuperar form').forEach(f => { f.reset(); errorEn(f, ''); });
      mostrarVista('vista-recuperar');
    } else {
      mostrarVista('vista-login');
    }
  }));

  $('#form-login').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.currentTarget;
    const usuario = f.usuario.value.trim();
    const clave = f.clave.value;
    if (!usuario || !clave) return errorEn(f, 'Escribe tu usuario y contraseña.');
    conBoton($('button[type=submit]', f), async () => {
      errorEn(f, '');
      try {
        const r = await Api.login(usuario, clave);
        f.reset();
        if (r.debeCambiar) {
          $('#form-primera').reset();
          errorEn($('#form-primera'), '');
          if (r.correo) $('#form-primera').correo.value = r.correo;
          mostrarVista('vista-primera');
        } else {
          await entrar();
        }
      } catch (err) { manejarError(err, f); }
    });
  });

  $('#form-primera').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.currentTarget;
    const correo = f.correo.value.trim();
    if (!f.correo.checkValidity() || !correo) return errorEn(f, 'Escribe un correo válido.');
    if (f.nueva.value.length < 8) return errorEn(f, 'La contraseña debe tener al menos 8 caracteres.');
    if (f.nueva.value !== f.repetir.value) return errorEn(f, 'Las contraseñas no coinciden.');
    conBoton($('button[type=submit]', f), async () => {
      try {
        await Api.actualizarCuenta({ correo, claveNueva: f.nueva.value, primera: true });
        f.reset();
        avisar('Contraseña actualizada.');
        await entrar();
      } catch (err) { manejarError(err, f); }
    });
  });

  $('#form-codigo').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.currentTarget;
    const correo = f.correo.value.trim();
    if (!correo || !f.correo.checkValidity()) return errorEn(f, 'Escribe un correo válido.');
    conBoton($('button[type=submit]', f), async () => {
      errorEn(f, '');
      try {
        await Api.solicitarCodigo(correo);
        f.hidden = true;
        const g = $('#form-restablecer');
        g.dataset.correo = correo;
        g.hidden = false;
        g.codigo.focus();
      } catch (err) { manejarError(err, f); }
    });
  });

  $('#form-restablecer').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.currentTarget;
    if (!/^\d{6}$/.test(f.codigo.value.trim())) return errorEn(f, 'El código tiene 6 dígitos.');
    if (f.nueva.value.length < 8) return errorEn(f, 'La contraseña debe tener al menos 8 caracteres.');
    if (f.nueva.value !== f.repetir.value) return errorEn(f, 'Las contraseñas no coinciden.');
    conBoton($('button[type=submit]', f), async () => {
      errorEn(f, '');
      try {
        await Api.restablecer(f.dataset.correo, f.codigo.value.trim(), f.nueva.value);
        f.reset();
        mostrarVista('vista-login');
        avisar('Listo. Ya puedes ingresar con tu nueva contraseña.');
      } catch (err) { manejarError(err, f); }
    });
  });

  $('#btn-salir').addEventListener('click', async () => {
    await Api.logout();
    estado.registros = [];
    mostrarVista('vista-login');
  });

  /* ------------------------------- Mi cuenta ------------------------------- */

  $('#btn-cuenta').addEventListener('click', async () => {
    const dlg = $('#dlg-cuenta');
    $$('form', dlg).forEach(f => { f.reset(); errorEn(f, ''); });
    try {
      cargando('Cargando cuenta...');
      const c = await Api.cuenta();
      $('#cuenta-usuario').textContent = c.usuario;
      $('#form-correo').correo.value = c.correo || '';
      cargando(null);
      dlg.showModal();
    } catch (err) { cargando(null); manejarError(err); }
  });

  $('#form-correo').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.currentTarget;
    const correo = f.correo.value.trim();
    if (correo && !f.correo.checkValidity()) return errorEn(f, 'Escribe un correo válido.');
    conBoton($('button[type=submit]', f), async () => {
      try {
        await Api.actualizarCuenta({ correo });
        errorEn(f, '');
        avisar(correo ? 'Correo de recuperación guardado.' : 'Se quitó el correo de recuperación.');
      } catch (err) { manejarError(err, f); }
    });
  });

  $('#form-clave').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.currentTarget;
    if (!f.actual.value) return errorEn(f, 'Escribe tu contraseña actual.');
    if (f.nueva.value.length < 8) return errorEn(f, 'La nueva contraseña debe tener al menos 8 caracteres.');
    if (f.nueva.value !== f.repetir.value) return errorEn(f, 'Las contraseñas no coinciden.');
    conBoton($('button[type=submit]', f), async () => {
      try {
        await Api.actualizarCuenta({ claveActual: f.actual.value, claveNueva: f.nueva.value });
        f.reset();
        errorEn(f, '');
        avisar('Contraseña cambiada.');
      } catch (err) { manejarError(err, f); }
    });
  });

  $$('[data-cerrar]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  /* --------------------------------- Lista --------------------------------- */

  async function entrar() {
    if (!Api.remoto) $('.chip-demo').hidden = false;
    mostrarVista('vista-lista');
    await cargarLista();
  }

  async function cargarLista() {
    cargando('Cargando jóvenes...');
    try {
      estado.registros = await Api.listar();
    } catch (err) {
      manejarError(err);
    } finally {
      cargando(null);
    }
    pintarLista();
  }

  function filtrados() {
    const q = normalizar(estado.filtro);
    if (!q) return estado.registros;
    return estado.registros.filter(r =>
      [r.nombre, r.documento, r.acuNombre, r.acuTelefono].some(v => normalizar(v).includes(q)));
  }

  function icono(path) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
  }

  function pintarLista() {
    const lista = filtrados();
    const total = lista.length;
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    estado.pagina = Math.min(Math.max(1, estado.pagina), paginas);
    const desde = (estado.pagina - 1) * POR_PAGINA;
    const visibles = lista.slice(desde, desde + POR_PAGINA);

    const cuerpo = $('#tabla-cuerpo');
    cuerpo.textContent = '';
    for (const r of visibles) {
      const tr = document.createElement('tr');
      const celdas = [
        [r.nombre, ''], [r.documento, ''], [r.edad ? r.edad + ' años' : '', 'col-opc'],
        [r.acuNombre, 'col-opc'], [r.acuTelefono, 'col-opc']
      ];
      for (const [valor, clase] of celdas) {
        const td = document.createElement('td');
        td.textContent = valor || '';
        if (clase) td.className = clase;
        tr.appendChild(td);
      }
      const acc = document.createElement('td');
      acc.innerHTML = `<div class="acciones">
        <button type="button" class="icono-btn" data-ver title="Ver y descargar" aria-label="Ver">${icono('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>')}</button>
        <button type="button" class="icono-btn" data-editar title="Editar" aria-label="Editar">${icono('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>')}</button>
      </div>`;
      $('[data-ver]', acc).addEventListener('click', () => verRegistro(r.id));
      $('[data-editar]', acc).addEventListener('click', () => editarRegistro(r.id));
      tr.appendChild(acc);
      cuerpo.appendChild(tr);
    }

    const vacio = $('#lista-vacia');
    vacio.hidden = total > 0;
    if (!total) {
      vacio.innerHTML = estado.registros.length
        ? '<strong>Sin resultados</strong>No hay jóvenes que coincidan con la búsqueda.'
        : '<strong>Aún no hay jóvenes registrados</strong>Usa el botón "Registrar joven" para agregar el primero.';
    }
    $('#conteo').textContent = total
      ? `Mostrando ${desde + 1} a ${desde + visibles.length} de ${total} registro${total === 1 ? '' : 's'}`
      : '';
    pintarPaginacion(paginas, total);
  }

  function pintarPaginacion(paginas, total) {
    const cont = $('#paginacion');
    cont.textContent = '';
    if (!total) return;
    const boton = (texto, pagina, opciones = {}) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = texto;
      if (opciones.actual) b.setAttribute('aria-current', 'page');
      if (opciones.desactivado) b.disabled = true;
      b.addEventListener('click', () => { estado.pagina = pagina; pintarLista(); });
      cont.appendChild(b);
    };
    boton('Anterior', estado.pagina - 1, { desactivado: estado.pagina === 1 });
    const numeros = new Set([1, 2, paginas - 1, paginas, estado.pagina - 1, estado.pagina, estado.pagina + 1]);
    let anterior = 0;
    [...numeros].filter(n => n >= 1 && n <= paginas).sort((a, b) => a - b).forEach(n => {
      if (n - anterior > 1) {
        const s = document.createElement('span');
        s.className = 'puntos';
        s.textContent = '…';
        cont.appendChild(s);
      }
      boton(String(n), n, { actual: n === estado.pagina });
      anterior = n;
    });
    boton('Siguiente', estado.pagina + 1, { desactivado: estado.pagina === paginas });
  }

  $('#buscar').addEventListener('input', e => {
    estado.filtro = e.target.value;
    estado.pagina = 1;
    pintarLista();
  });

  /* ------------------------------ Formulario ------------------------------ */

  const form = $('#form-registro');
  const firma = $('#firma');
  const ctxFirma = firma.getContext('2d');

  function limpiarFirma() {
    ctxFirma.clearRect(0, 0, firma.width, firma.height);
    estado.firmaPintada = false;
    firma.parentElement.classList.remove('con-firma');
  }

  (function prepararFirma() {
    let dibujando = false;
    let ultimo = null;
    const punto = ev => {
      const r = firma.getBoundingClientRect();
      return { x: (ev.clientX - r.left) * (firma.width / r.width), y: (ev.clientY - r.top) * (firma.height / r.height) };
    };
    firma.addEventListener('pointerdown', ev => {
      dibujando = true;
      ultimo = punto(ev);
      firma.setPointerCapture(ev.pointerId);
      ctxFirma.beginPath();
      ctxFirma.arc(ultimo.x, ultimo.y, 1.4, 0, Math.PI * 2);
      ctxFirma.fillStyle = '#1f2340';
      ctxFirma.fill();
    });
    firma.addEventListener('pointermove', ev => {
      if (!dibujando) return;
      const p = punto(ev);
      ctxFirma.strokeStyle = '#1f2340';
      ctxFirma.lineWidth = 3;
      ctxFirma.lineCap = 'round';
      ctxFirma.lineJoin = 'round';
      ctxFirma.beginPath();
      ctxFirma.moveTo(ultimo.x, ultimo.y);
      ctxFirma.lineTo(p.x, p.y);
      ctxFirma.stroke();
      ultimo = p;
      if (!estado.firmaPintada) {
        estado.firmaPintada = true;
        firma.parentElement.classList.add('con-firma');
      }
    });
    const fin = () => { dibujando = false; };
    firma.addEventListener('pointerup', fin);
    firma.addEventListener('pointercancel', fin);
    $('#firma-limpiar').addEventListener('click', limpiarFirma);
  })();

  function ponerFoto(dataUrl) {
    estado.foto = dataUrl || '';
    const img = $('#foto-preview');
    img.hidden = !dataUrl;
    if (dataUrl) img.src = dataUrl; else img.removeAttribute('src');
    $('.foto-texto').hidden = Boolean(dataUrl);
    $('#foto-quitar').hidden = !dataUrl;
  }

  function reducirImagen(archivo, lado = 700) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      lector.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
        img.onload = () => {
          const k = Math.min(1, lado / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k);
          c.height = Math.round(img.height * k);
          const cx = c.getContext('2d');
          cx.fillStyle = '#fff';
          cx.fillRect(0, 0, c.width, c.height);
          cx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.85));
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  $('#foto-input').addEventListener('change', async e => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    try { ponerFoto(await reducirImagen(archivo)); }
    catch (err) { avisar(err.message, true); }
  });
  $('#foto-quitar').addEventListener('click', () => ponerFoto(''));

  form.fechaNacimiento.addEventListener('change', () => {
    form.edad.value = edadDesde(form.fechaNacimiento.value);
  });

  function actualizarCondicion() {
    const si = form.condicion.value === 'Sí';
    form.condicionCual.disabled = !si;
    if (!si) form.condicionCual.value = '';
  }
  $$('input[name=condicion]', form).forEach(r => r.addEventListener('change', actualizarCondicion));

  $$('input, select, textarea', form).forEach(el =>
    el.addEventListener('input', () => el.classList.remove('invalido')));

  const CAMPOS_TEXTO = ['nombre', 'fechaNacimiento', 'edad', 'documento', 'telefono', 'direccion', 'colegio', 'grado',
    'jornada', 'eps', 'condicionCual', 'observaciones', 'acuNombre', 'acuCedula', 'acuParentesco', 'acuOcupacion',
    'acuTelefono', 'acuDireccion', 'acuCorreo', 'fechaFirma'];

  function recoger() {
    const d = {};
    for (const c of CAMPOS_TEXTO) d[c] = String(form[c].value || '').trim();
    d.condicion = form.condicion.value || '';
    d.autoriza = form.autoriza.checked ? 'Sí' : '';
    d.foto = estado.foto || '';
    d.firma = estado.firmaPintada ? firma.toDataURL('image/png') : '';
    if (estado.editando) d.id = estado.editando.id;
    return d;
  }

  function validar(d) {
    $$('.invalido', form).forEach(el => el.classList.remove('invalido'));
    const faltan = [];
    const requeridos = { nombre: 'nombre', fechaNacimiento: 'fecha de nacimiento', documento: 'documento',
      acuNombre: 'nombre del acudiente', acuCedula: 'cédula del acudiente', acuTelefono: 'teléfono del acudiente' };
    for (const [campo, etiqueta] of Object.entries(requeridos)) {
      if (!d[campo]) { faltan.push(etiqueta); form[campo].classList.add('invalido'); }
    }
    if (!d.autoriza) faltan.push('autorización del acudiente');
    if (faltan.length) return 'Falta completar: ' + faltan.join(', ') + '.';
    if (d.fechaNacimiento > hoyIso()) { form.fechaNacimiento.classList.add('invalido'); return 'La fecha de nacimiento no puede ser futura.'; }
    if (d.acuCorreo && !form.acuCorreo.checkValidity()) { form.acuCorreo.classList.add('invalido'); return 'El correo del acudiente no es válido.'; }
    if (d.condicion === 'Sí' && !d.condicionCual) { form.condicionCual.classList.add('invalido'); return 'Indica cuál enfermedad, alergia o condición presenta.'; }
    return '';
  }

  function cargarEnFormulario(r) {
    form.reset();
    errorEn(form, '');
    $$('.invalido', form).forEach(el => el.classList.remove('invalido'));
    for (const c of CAMPOS_TEXTO) form[c].value = r[c] || '';
    $$('input[name=condicion]', form).forEach(x => { x.checked = x.value === r.condicion; });
    actualizarCondicion();
    if (r.condicionCual) form.condicionCual.value = r.condicionCual;
    form.autoriza.checked = r.autoriza === 'Sí';
    if (!form.fechaFirma.value) form.fechaFirma.value = hoyIso();
    ponerFoto(r.foto || '');
    limpiarFirma();
    if (r.firma) {
      const img = new Image();
      img.onload = () => {
        ctxFirma.drawImage(img, 0, 0, firma.width, firma.height);
        estado.firmaPintada = true;
        firma.parentElement.classList.add('con-firma');
      };
      img.src = r.firma;
    }
  }

  function abrirFormulario(registro) {
    estado.editando = registro || null;
    cargarEnFormulario(registro || {});
    $('#titulo-form').textContent = registro ? 'Editar joven' : 'Registrar joven';
    $('#btn-exportar').lastChild.textContent = registro ? ' Guardar y exportar' : ' Exportar';
    mostrarVista('vista-form');
  }

  $('#btn-registrar').addEventListener('click', () => abrirFormulario(null));
  $('#btn-volver').addEventListener('click', () => {
    mostrarVista('vista-lista');
    pintarLista();
  });

  async function editarRegistro(id) {
    cargando('Abriendo registro...');
    try {
      const r = await Api.obtener(id);
      cargando(null);
      abrirFormulario(r);
    } catch (err) { cargando(null); manejarError(err); }
  }

  /* ----------------------- Vista previa y exportación ----------------------- */

  function nombreArchivo(d) {
    const limpio = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
    return `Inscripcion_${limpio(d.nombre) || 'joven'}_${limpio(d.documento)}.pdf`.replace(/_\.pdf$/, '.pdf');
  }

  async function abrirPrevia(datos, contexto) {
    estado.previa = { datos, contexto };
    cargando('Preparando vista previa...');
    try {
      const canvas = await Plantilla.render(datos);
      const lienzo = $('#previa-lienzo');
      lienzo.textContent = '';
      lienzo.appendChild(canvas);
      $('#previa-editar').hidden = contexto !== 'ver';
      $('#previa-exportar').textContent = contexto === 'ver' ? 'Descargar PDF' : (estado.editando ? 'Guardar y exportar' : 'Exportar');
      $('#dlg-previa').showModal();
    } catch (err) {
      manejarError(err);
    } finally {
      cargando(null);
    }
  }

  async function verRegistro(id) {
    cargando('Abriendo registro...');
    try {
      const r = await Api.obtener(id);
      await abrirPrevia(r, 'ver');
    } catch (err) { cargando(null); manejarError(err); }
  }

  $('#btn-vista-previa').addEventListener('click', () => {
    errorEn(form, '');
    abrirPrevia(recoger(), 'form');
  });

  $('#previa-editar').addEventListener('click', () => {
    const r = estado.previa && estado.previa.datos;
    $('#dlg-previa').close();
    if (r) abrirFormulario(r);
  });

  $('#previa-exportar').addEventListener('click', () => {
    if (!estado.previa) return;
    if (estado.previa.contexto === 'ver') {
      conBoton($('#previa-exportar'), async () => {
        cargando('Generando PDF...');
        try {
          const doc = await Plantilla.pdf(estado.previa.datos);
          doc.save(nombreArchivo(estado.previa.datos));
        } catch (err) { manejarError(err); }
        finally { cargando(null); }
      });
    } else {
      $('#dlg-previa').close();
      exportar();
    }
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    exportar();
  });

  function exportar() {
    const datos = recoger();
    const problema = validar(datos);
    if (problema) {
      errorEn(form, problema);
      const primero = $('.invalido', form) || form.autoriza;
      primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    errorEn(form, '');
    conBoton($('#btn-exportar'), async () => {
      let doc;
      try {
        cargando('Generando PDF...');
        doc = await Plantilla.pdf(datos);
      } catch (err) {
        cargando(null);
        return manejarError(err, form);
      }
      try {
        cargando(Api.remoto ? 'Guardando en la hoja de cálculo...' : 'Guardando...');
        const pdf = Api.remoto ? doc.output('datauristring').split(',')[1] : null;
        await Api.guardar(datos, pdf);
        doc.save(nombreArchivo(datos));
        cargando(null);
        avisar(Api.remoto ? 'PDF descargado y registro guardado en Google Sheets.' : 'PDF descargado y registro guardado (modo demostración).');
        estado.editando = null;
        mostrarVista('vista-lista');
        await cargarLista();
      } catch (err) {
        cargando(null);
        if (err.sesionVencida) return manejarError(err);
        errorEn(form, 'No se pudo guardar el registro: ' + err.message);
      }
    });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#cargando').hidden) e.preventDefault();
  });

  /* --------------------------------- Inicio --------------------------------- */

  $('.aviso-demo').hidden = Api.remoto;
  if (Api.tieneSesion()) {
    entrar();
  } else {
    mostrarVista('vista-login');
  }
})();
