
const express = require('express');
const app = express();
const path = require('path');

const DB = require('./db');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/db', (req, res) => {
  res.json(DB);
});

app.get('/api/search', (req, res) => {
  let results = DB;

  const { purpose, min, max, cpu, gpu, ram } = req.query;

  if (purpose && purpose !== 'any') {
    results = results.filter(p => (p.purposes || []).includes(purpose));
  }

  if (min) results = results.filter(p => p.price >= Number(min));
  if (max) results = results.filter(p => p.price <= Number(max));

  if (cpu && cpu !== 'any') results = results.filter(p => p.cpuBrand.includes(cpu));
  if (gpu && gpu !== 'any') results = results.filter(p => p.gpuBrand.includes(gpu));

  if (ram && ram !== 'any') {
    const r = Number(ram);
    results = results.filter(p => p.ramGb >= r);
  }

  res.json(results);
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
