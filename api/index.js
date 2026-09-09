/**
 * api/index.js — Punto de entrada serverless para Vercel.
 * Todas las rutas /api/* (y el fallback SPA) las maneja la app Express.
 */
import app from '../server/app.js';

export default app;
