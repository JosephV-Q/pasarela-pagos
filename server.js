'use strict';

const express = require('express');
const path = require('path');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const LATENCIA_MS = 2000;          // latencia simulada de procesamiento
const TTL_IDEMPOTENCIA_MS = 10 * 60 * 1000;

app.disable('x-powered-by');

// ---------- Cabeceras de seguridad ----------
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'",
  });
  // Las respuestas de la API nunca deben quedar en caché (contienen datos de pago)
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Utilidades ----------
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const enmascarar = (numero) => `**** **** **** ${numero.slice(-4)}`;

// Idempotencia: misma Idempotency-Key => mismo resultado, sin volver a cobrar
const transacciones = new Map(); // clave -> Promise<{ status, body }>

async function procesarPago(numeroTarjeta) {
  await dormir(LATENCIA_MS);

  // Regla de negocio: tarjeta que termina en "4" => 402 Payment Required
  if (numeroTarjeta.endsWith('4')) {
    return {
      status: 402,
      body: {
        estado: 'rechazado',
        mensaje: 'El banco emisor rechazó la transacción. Prueba con otra tarjeta.',
      },
    };
  }

  return {
    status: 200,
    body: {
      estado: 'aprobado',
      mensaje: 'Pago aprobado correctamente.',
      referencia: `TX-${randomUUID().slice(0, 8).toUpperCase()}`,
    },
  };
}

// ---------- Endpoint ----------
app.post('/api/pagar', async (req, res, next) => {
  try {
    if (!req.is('application/json')) {
      return res.status(415).json({
        estado: 'error',
        mensaje: 'Content-Type debe ser application/json.',
      });
    }

    const numeroTarjeta = String(req.body?.numeroTarjeta ?? '').replace(/\s/g, '');
    if (!/^\d{16}$/.test(numeroTarjeta)) {
      return res.status(400).json({
        estado: 'error',
        mensaje: 'El número de tarjeta debe tener exactamente 16 dígitos.',
      });
    }

    const clave = req.get('Idempotency-Key');
    let promesa = clave ? transacciones.get(clave) : null;
    const repetida = Boolean(promesa);

    if (!promesa) {
      console.log(`[pago] solicitud recibida · ${enmascarar(numeroTarjeta)}`);
      promesa = procesarPago(numeroTarjeta);
      if (clave) {
        transacciones.set(clave, promesa);
        setTimeout(() => transacciones.delete(clave), TTL_IDEMPOTENCIA_MS).unref();
      }
    }

    const { status, body } = await promesa;
    if (repetida) res.set('Idempotent-Replayed', 'true');
    return res.status(status).json(body);
  } catch (err) {
    next(err);
  }
});

// ---------- Manejo de errores ----------
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ estado: 'error', mensaje: 'El JSON enviado no es válido.' });
  }
  console.error(err);
  res.status(500).json({ estado: 'error', mensaje: 'Error interno del servidor.' });
});

app.listen(PORT, () => {
  console.log(`Pasarela de pagos en http://localhost:${PORT}`);
});
