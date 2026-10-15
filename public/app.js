'use strict';

const API_URL = '/api/pagar';
const TIMEOUT_MS = 10000;

const form = document.getElementById('form-pago');
const campos = {
  numero: document.getElementById('numero'),
  titular: document.getElementById('titular'),
  vence: document.getElementById('vence'),
  cvv: document.getElementById('cvv'),
};
const boton = document.getElementById('btn-pagar');
const botonTexto = document.getElementById('btn-texto');
const textoOriginal = botonTexto.textContent;
const resultado = document.getElementById('resultado');

const vista = {
  numero: document.getElementById('vista-numero'),
  titular: document.getElementById('vista-titular'),
  vence: document.getElementById('vista-vence'),
};

/* ---------- Utilidades de formato ---------- */
const soloDigitos = (valor) => valor.replace(/\D/g, '');

function formatearNumero(valor) {
  return soloDigitos(valor).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
}

function formatearVencimiento(valor) {
  const d = soloDigitos(valor).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/* ---------- Vista previa en vivo ---------- */
campos.numero.addEventListener('input', () => {
  campos.numero.value = formatearNumero(campos.numero.value);
  const digitos = soloDigitos(campos.numero.value).padEnd(16, '•');
  vista.numero.textContent = digitos.replace(/(.{4})(?=.)/g, '$1 ');
});

campos.titular.addEventListener('input', () => {
  vista.titular.textContent = campos.titular.value.trim().toUpperCase() || 'NOMBRE APELLIDO';
});

campos.vence.addEventListener('input', () => {
  campos.vence.value = formatearVencimiento(campos.vence.value);
  vista.vence.textContent = campos.vence.value || 'MM/AA';
});

campos.cvv.addEventListener('input', () => {
  campos.cvv.value = soloDigitos(campos.cvv.value).slice(0, 4);
});

/* ---------- Validación temprana (antes de tocar la red) ---------- */
function mostrarError(clave, mensaje) {
  const input = campos[clave];
  const aviso = document.getElementById(`error-${clave}`);
  aviso.textContent = mensaje;
  input.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
}

function validar() {
  const errores = {};

  // Requisito principal: exactamente 16 caracteres en la tarjeta
  const numero = campos.numero.value.replace(/\s/g, '');
  if (numero.length !== 16) {
    errores.numero = `La tarjeta debe tener exactamente 16 dígitos (llevas ${numero.length}).`;
  } else if (!/^\d{16}$/.test(numero)) {
    errores.numero = 'La tarjeta solo puede contener números.';
  }

  if (campos.titular.value.trim().length < 3) {
    errores.titular = 'Escribe el nombre tal como aparece en la tarjeta.';
  }

  const venc = /^(\d{2})\/(\d{2})$/.exec(campos.vence.value);
  if (!venc || Number(venc[1]) < 1 || Number(venc[1]) > 12) {
    errores.vence = 'Usa el formato MM/AA.';
  } else {
    const fin = new Date(2000 + Number(venc[2]), Number(venc[1]), 1); // 1.er día del mes siguiente
    if (fin <= new Date()) errores.vence = 'La tarjeta está vencida.';
  }

  if (!/^\d{3,4}$/.test(campos.cvv.value)) {
    errores.cvv = 'El CVV tiene 3 o 4 dígitos.';
  }

  Object.keys(campos).forEach((clave) => mostrarError(clave, errores[clave] || ''));
  const primera = Object.keys(errores)[0];
  if (primera) campos[primera].focus();
  return { valido: !primera, numero };
}

/* ---------- Estado de la interfaz ---------- */
function mostrarResultado(tipo, titulo, detalle) {
  resultado.hidden = false;
  resultado.className = `resultado resultado--${tipo}`;
  resultado.replaceChildren();
  const t = document.createElement('strong');
  t.textContent = titulo;
  resultado.append(t, detalle);
}

function ocultarResultado() {
  resultado.hidden = true;
  resultado.replaceChildren();
}

function setProcesando(activo) {
  boton.disabled = activo;
  boton.classList.toggle('cargando', activo);
  boton.setAttribute('aria-busy', String(activo));
  botonTexto.textContent = activo ? 'Procesando...' : textoOriginal;
  Object.values(campos).forEach((input) => { input.disabled = activo; });
}

/* ---------- Envío ---------- */
form.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  // Idempotencia en cliente: si ya hay un cobro en curso, ignorar
  if (boton.disabled) return;

  ocultarResultado();
  const { valido, numero } = validar();
  if (!valido) return; // no se envía ninguna petición HTTP

  setProcesando(true); // se deshabilita el botón antes de cualquier await

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const respuesta = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // Clave única por intento: el servidor no cobra dos veces la misma clave
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        numeroTarjeta: numero,
        titular: campos.titular.value.trim(),
        vencimiento: campos.vence.value,
      }), // el CVV nunca se envía en esta simulación
      signal: controlador.signal,
    });

    const datos = await respuesta.json().catch(() => ({}));

    switch (respuesta.status) {
      case 200:
        mostrarResultado('ok', 'Pago aprobado', `Referencia: ${datos.referencia ?? '—'}`);
        form.reset();
        vista.numero.textContent = '•••• •••• •••• ••••';
        vista.titular.textContent = 'NOMBRE APELLIDO';
        vista.vence.textContent = 'MM/AA';
        break;
      case 402:
        mostrarResultado('error', 'Pago rechazado', datos.mensaje ?? 'Tu tarjeta fue rechazada.');
        break;
      case 400:
      case 415:
        mostrarResultado('error', 'Datos no válidos', datos.mensaje ?? 'Revisa los datos e inténtalo de nuevo.');
        break;
      default:
        mostrarResultado('error', 'Error del servidor', 'No pudimos procesar el pago. Inténtalo más tarde.');
    }
  } catch (error) {
    const agotado = error.name === 'AbortError';
    mostrarResultado(
      'error',
      agotado ? 'Tiempo agotado' : 'Sin conexión',
      agotado ? 'El servidor tardó demasiado en responder.' : 'No pudimos contactar al servidor.'
    );
  } finally {
    clearTimeout(temporizador);
    setProcesando(false);
  }
});
