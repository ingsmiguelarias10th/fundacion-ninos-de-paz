/*
 * Dibuja una inscripción sobre la plantilla oficial de la Fundación Niños de Paz.
 * Las coordenadas están en píxeles de la imagen original (1166 x 1731).
 * El mismo canvas se usa para la vista previa y para el PDF, así ambos se ven igual.
 */
const Plantilla = (() => {
  const W = 1166;
  const H = 1731;
  const ESCALA = 2; // resolución del canvas (2x para que el PDF salga nítido)
  const FUENTE = '"Nunito", "Segoe UI", Arial, sans-serif';
  const COLOR_TEXTO = '#1f2340';

  // [x1, y1, x2, y2] de cada casilla. "pad" deja espacio para los íconos de la plantilla.
  const CAMPOS = {
    nombre:           { box: [507, 327, 1073, 373] },
    fechaNacimiento:  { box: [523, 389, 769, 435], tapar: [540, 398, 752, 428], centrar: true },
    edad:             { box: [886, 389, 1010, 435] },
    documento:        { box: [558, 453, 1073, 500] },
    telefono:         { box: [357, 548, 633, 596], pad: 34 },
    direccion:        { box: [669, 548, 1073, 596], pad: 34 },
    colegio:          { box: [226, 696, 1073, 742] },
    grado:            { box: [226, 753, 594, 799] },
    jornada:          { box: [736, 753, 1073, 799] },
    eps:              { box: [226, 811, 1073, 857] },
    condicionCual:    { box: [838, 918, 1057, 944], size: 19, base: 'bottom' },
    observaciones:    { box: [337, 978, 1057, 1041], multilinea: true, size: 18 },
    acuNombre:        { box: [316, 1139, 706, 1185] },
    acuCedula:        { box: [813, 1139, 1073, 1185] },
    acuParentesco:    { box: [260, 1196, 584, 1242] },
    acuOcupacion:     { box: [731, 1196, 1073, 1242] },
    acuTelefono:      { box: [247, 1253, 502, 1299] },
    acuDireccion:     { box: [641, 1253, 1073, 1299] },
    acuCorreo:        { box: [326, 1311, 1073, 1357] },
    fechaFirma:       { box: [485, 1556, 662, 1592], tapar: [495, 1560, 650, 1589], centrar: true, size: 19 }
  };
  const CASILLA_NO = [570, 923, 596, 948];
  const CASILLA_SI = [668, 923, 694, 948];
  const FOTO = [92, 341, 301, 621];
  const FIRMA = [152, 1538, 378, 1597];

  let imagenBase = null;

  function cargarImagen(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo cargar la imagen: ' + String(src).slice(0, 60)));
      img.src = src;
    });
  }

  async function base() {
    if (!imagenBase) imagenBase = await cargarImagen('assets/plantilla.jpg');
    return imagenBase;
  }

  function fechaLarga(iso) {
    if (!iso) return '';
    const [a, m, d] = String(iso).split('-');
    if (!a || !m || !d) return String(iso);
    return `${d} / ${m} / ${a}`;
  }

  function ajustarTexto(ctx, texto, anchoMax, size, minSize = 12) {
    let s = size;
    ctx.font = `600 ${s}px ${FUENTE}`;
    while (ctx.measureText(texto).width > anchoMax && s > minSize) {
      s -= 1;
      ctx.font = `600 ${s}px ${FUENTE}`;
    }
    if (ctx.measureText(texto).width > anchoMax) {
      while (texto.length > 1 && ctx.measureText(texto + '…').width > anchoMax) texto = texto.slice(0, -1);
      texto += '…';
    }
    return texto;
  }

  function lineas(ctx, texto, anchoMax) {
    const palabras = String(texto).replace(/\s+/g, ' ').trim().split(' ');
    const out = [];
    let actual = '';
    for (const p of palabras) {
      const prueba = actual ? actual + ' ' + p : p;
      if (ctx.measureText(prueba).width > anchoMax && actual) {
        out.push(actual);
        actual = p;
      } else {
        actual = prueba;
      }
    }
    if (actual) out.push(actual);
    return out;
  }

  function dibujarCampo(ctx, def, valor) {
    if (valor === undefined || valor === null || String(valor).trim() === '') return;
    const [x1, y1, x2, y2] = def.box;
    if (def.tapar) {
      const [a, b, c, d] = def.tapar;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(a, b, c - a, d - b);
    }
    const pad = (def.pad || 0) + 14;
    const ancho = x2 - x1 - pad - 12;
    const size = def.size || 21;
    ctx.fillStyle = COLOR_TEXTO;
    ctx.textBaseline = 'middle';

    if (def.multilinea) {
      ctx.font = `600 ${size}px ${FUENTE}`;
      let ls = lineas(ctx, valor, ancho);
      const alto = size * 1.25;
      const max = Math.max(1, Math.floor((y2 - y1 - 8) / alto));
      if (ls.length > max) {
        ls = ls.slice(0, max);
        ls[max - 1] = ajustarTexto(ctx, ls[max - 1] + '…', ancho, size, size);
      }
      const inicio = y1 + (y2 - y1 - ls.length * alto) / 2 + alto / 2;
      ls.forEach((l, i) => ctx.fillText(l, x1 + pad, inicio + i * alto));
      return;
    }

    const texto = ajustarTexto(ctx, String(valor).trim(), ancho, size);
    const y = def.base === 'bottom' ? y2 - 12 : (y1 + y2) / 2 + 1;
    if (def.centrar) {
      ctx.textAlign = 'center';
      ctx.fillText(texto, (x1 + x2) / 2, y);
      ctx.textAlign = 'left';
    } else {
      ctx.fillText(texto, x1 + pad, y);
    }
  }

  function marcar(ctx, box) {
    const [x1, y1, x2, y2] = box;
    ctx.save();
    ctx.strokeStyle = '#4f7a28';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1 + 5, y1 + 13);
    ctx.lineTo(x1 + 11, y2 - 6);
    ctx.lineTo(x2 - 3, y1 + 2);
    ctx.stroke();
    ctx.restore();
  }

  function redondeado(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function dibujarCubriendo(ctx, img, box, radio) {
    const [x1, y1, x2, y2] = box;
    const w = x2 - x1;
    const h = y2 - y1;
    const escala = Math.max(w / img.width, h / img.height);
    const sw = w / escala;
    const sh = h / escala;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    ctx.save();
    redondeado(ctx, x1, y1, w, h, radio);
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x1, y1, w, h);
    ctx.drawImage(img, sx, sy, sw, sh, x1, y1, w, h);
    ctx.restore();
  }

  function dibujarContenido(ctx, img, box) {
    const [x1, y1, x2, y2] = box;
    const w = x2 - x1;
    const h = y2 - y1;
    const escala = Math.min(w / img.width, h / img.height);
    const dw = img.width * escala;
    const dh = img.height * escala;
    ctx.drawImage(img, x1 + (w - dw) / 2, y2 - dh, dw, dh);
  }

  /** Devuelve un canvas con la inscripción dibujada sobre la plantilla. */
  async function render(datos) {
    if (document.fonts && document.fonts.load) {
      try { await document.fonts.load(`600 20px "Nunito"`); } catch (_) { /* usa la fuente de respaldo */ }
    }
    const canvas = document.createElement('canvas');
    canvas.width = W * ESCALA;
    canvas.height = H * ESCALA;
    const ctx = canvas.getContext('2d');
    ctx.scale(ESCALA, ESCALA);
    ctx.drawImage(await base(), 0, 0, W, H);

    const valores = { ...datos };
    valores.fechaNacimiento = fechaLarga(datos.fechaNacimiento);
    valores.fechaFirma = fechaLarga(datos.fechaFirma);
    for (const [clave, def] of Object.entries(CAMPOS)) dibujarCampo(ctx, def, valores[clave]);

    if (datos.condicion === 'No') marcar(ctx, CASILLA_NO);
    if (datos.condicion === 'Sí') marcar(ctx, CASILLA_SI);

    if (datos.foto) {
      try { dibujarCubriendo(ctx, await cargarImagen(datos.foto), FOTO, 22); } catch (_) { /* sin foto */ }
    }
    if (datos.firma) {
      try { dibujarContenido(ctx, await cargarImagen(datos.firma), FIRMA); } catch (_) { /* sin firma */ }
    }
    return canvas;
  }

  /** Genera el PDF (mismo tamaño de página que el documento de Word). */
  async function pdf(datos) {
    const canvas = await render(datos);
    const { jsPDF } = window.jspdf;
    const anchoMm = 197.4;
    const altoMm = anchoMm * (H / W);
    const doc = new jsPDF({ unit: 'mm', format: [anchoMm, altoMm], orientation: 'portrait', compress: true });
    doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, anchoMm, altoMm, undefined, 'FAST');
    doc.setProperties({
      title: 'Formulario de inscripción - ' + (datos.nombre || ''),
      author: 'Fundación Niños de Paz',
      subject: 'Formulario de inscripción'
    });
    return doc;
  }

  return { render, pdf, W, H };
})();
