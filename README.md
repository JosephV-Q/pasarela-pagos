# Pasarela de pagos (simulación)

API en Express + formulario de checkout en HTML/CSS/JS puro.

## Ejecutar

```bash
npm install
npm start
```

Abre http://localhost:3000

## Tarjetas de prueba

| Número              | Resultado                    |
|---------------------|------------------------------|
| 4111 1111 1111 1111 | 200 OK (aprobado)            |
| 4111 1111 1111 1114 | 402 Payment Required         |

Cualquier titular, un vencimiento futuro (ej. 12/30) y CVV de 3 dígitos.

## Probar la API directamente

```bash
curl -i -X POST http://localhost:3000/api/pagar \
  -H "Content-Type: application/json" \
  -d '{"numeroTarjeta":"4111111111111114"}'
```

## Estructura

```
pasarela-pagos/
├── server.js          # Express: POST /api/pagar, latencia, regla del 4, cabeceras
├── package.json
└── public/
    ├── index.html     # Formulario
    ├── styles.css     # Estilos propios
    └── app.js         # Validación, fetch async/await y estado de la UI
```
