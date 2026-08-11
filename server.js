import express from 'express';
import app from './server/app.js';

// Vercel detecta este punto de entrada y ejecuta la aplicación Express como función.
// La importación explícita conserva la detección del framework por parte de Vercel.
void express;

export default app;
