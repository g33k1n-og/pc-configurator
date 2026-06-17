// ─── БАЗА ДАННЫХ: 28 РЕАЛЬНЫХ СБОРОК 2026 ГОДА ───────────────────────────────

const DB = window.DB;

// ─── UI HELPERS ──────────────────────────────────────────────────────────────

const fmt = n => n.toLocaleString('ru-RU') + ' ₽';

const slMin = document.getElementById('slider-min');
const slMax = document.getElementById('slider-max');
const valMin = document.getElementById('val-min');
const valMax = document.getElementById('val-max');
const fill = document.getElementById('range-fill');

function updateSliders() {
  let a = parseInt(slMin.value), b = parseInt(slMax.value);
  if (a > b - 10000) { a = b - 10000; slMin.value = a; }
  valMin.textContent = fmt(a);
  valMax.textContent = fmt(b);
  const mn = parseInt(slMin.min), mx = parseInt(slMin.max);
  const pct1 = (a-mn)/(mx-mn)*100, pct2 = (b-mn)/(mx-mn)*100;
  fill.style.left = pct1 + '%';
  fill.style.width = (pct2-pct1) + '%';
}
slMin.addEventListener('input', updateSliders);
slMax.addEventListener('input', updateSliders);
updateSliders();

document.getElementById('purpose-chips').addEventListener('click', e => {
  if (!e.target.classList.contains('chip')) return;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  e.target.classList.add('active');
});

// ─── SCORING / FILTERING ─────────────────────────────────────────────────────

function scorePC(pc, { purpose, budgetMin, budgetMax, cpu, gpu, ram, storage }) {
  let score = 0;
  let reasons = [];

  // Бюджет — обязательное условие
  if (pc.price < budgetMin || pc.price > budgetMax) return null;

  // Цель: совпадение
  if (pc.purposes.includes(purpose)) { score += 40; reasons.push('purpose'); }
  else return null; // строго: только нужные категории

  // Процессор
  if (cpu !== 'any') {
    if (cpu === 'intel' && pc.cpuBrand !== 'intel') score -= 10;
    if (cpu === 'amd' && pc.cpuBrand !== 'amd') score -= 10;
    if (cpu === 'intel-high' && (pc.cpuBrand !== 'intel' || pc.cpuTier < 7)) score -= 20;
    if (cpu === 'amd-high' && (pc.cpuBrand !== 'amd' || pc.cpuTier < 7)) score -= 20;
    if (cpu === 'intel' && pc.cpuBrand === 'intel') score += 10;
    if (cpu === 'amd' && pc.cpuBrand === 'amd') score += 10;
    if (cpu === 'intel-high' && pc.cpuBrand === 'intel' && pc.cpuTier >= 7) score += 15;
    if (cpu === 'amd-high' && pc.cpuBrand === 'amd' && pc.cpuTier >= 7) score += 15;
  }

  // Видеокарта
  if (gpu !== 'any') {
    if (gpu === 'integrated' && pc.gpuBrand !== 'integrated') score -= 5;
    if (gpu === 'integrated' && pc.gpuBrand === 'integrated') score += 15;
    if (gpu === 'nvidia' && pc.gpuBrand !== 'nvidia') score -= 15;
    if (gpu === 'nvidia' && pc.gpuBrand === 'nvidia') score += 10;
    if (gpu === 'amd-gpu' && pc.gpuBrand !== 'amd-gpu') score -= 15;
    if (gpu === 'amd-gpu' && pc.gpuBrand === 'amd-gpu') score += 10;
    if (gpu === 'rtx40' && (pc.gpuBrand !== 'nvidia' || pc.gpuTier < 4)) { score -= 20; }
    if (gpu === 'rtx40' && pc.gpuBrand === 'nvidia' && pc.gpuTier >= 4) score += 15;
    if (gpu === 'rtx-high' && (pc.gpuBrand !== 'nvidia' || pc.gpuTier < 7)) { score -= 25; }
    if (gpu === 'rtx-high' && pc.gpuBrand === 'nvidia' && pc.gpuTier >= 7) score += 20;
  }

  // RAM
  const ramMap = { 'any': 0, '8': 8, '16': 16, '32': 32, '64': 64 };
  const minRam = ramMap[ram] || 0;
  if (pc.ramGb < minRam) return null; // не проходит фильтр
  if (pc.ramGb >= minRam) score += 10;
  if (pc.ramGb >= minRam * 2) score += 5; // с запасом

  // Storage
  const storMap = { 'any': 0, 'ssd-256': 0.256, 'ssd-512': 0.512, 'ssd-1tb': 1, 'ssd-2tb': 2 };
  const minStor = storMap[storage] || 0;
  if (pc.storageTb < minStor) return null;
  if (pc.storageTb >= minStor) score += 8;

  // Бонус за близость к оптимальной точке бюджета (75% от макс — оптимально)
  const optimal = budgetMin + (budgetMax - budgetMin) * 0.75;
  const dist = Math.abs(pc.price - optimal) / (budgetMax - budgetMin);
  score += Math.round((1 - dist) * 15);

  return score;
}

// ─── SEARCH ──────────────────────────────────────────────────────────────────

function doSearch() {
  const purpose = document.querySelector('.chip.active')?.dataset.val || 'gaming';
  const budgetMin = parseInt(slMin.value);
  const budgetMax = parseInt(slMax.value);
  const cpu = document.getElementById('req-cpu').value;
  const gpu = document.getElementById('req-gpu').value;
  const ram = document.getElementById('req-ram').value;
  const storage = document.getElementById('req-storage').value;

  const params = { purpose, budgetMin, budgetMax, cpu, gpu, ram, storage };

  // Скоринг
  let scored = DB.map(pc => ({ pc, score: scorePC(pc, params) }))
    .filter(x => x.score !== null && x.score > 0)
    .sort((a, b) => b.score - a.score);

  // Взять лучшие 5, но из разных ценовых сегментов
  let results = [];
  if (scored.length > 0) {
    // Всегда берём топ-1
    results.push(scored[0].pc);
    // Добавляем разнообразие: берём из нижней и верхней части бюджета
    const range = budgetMax - budgetMin;
    const low = budgetMin + range * 0.35;
    const high = budgetMin + range * 0.75;
    const fromLow = scored.filter(x => x.pc.price <= low && !results.includes(x.pc));
    const fromMid = scored.filter(x => x.pc.price > low && x.pc.price <= high && !results.includes(x.pc));
    const fromHigh = scored.filter(x => x.pc.price > high && !results.includes(x.pc));
    if (fromLow.length) results.unshift(fromLow[0].pc);
    if (fromMid.length && results.length < 3) results.splice(1, 0, fromMid[0].pc);
    if (fromHigh.length && results.length < 4) results.push(fromHigh[0].pc);
    // Добираем из общего пула до 4
    for (const s of scored) {
      if (results.length >= 4) break;
      if (!results.includes(s.pc)) results.push(s.pc);
    }
  }

  // Сортируем финал по цене
  results.sort((a, b) => a.price - b.price);

  // Помечаем "лучший выбор" — самый высокий скор
  const topId = scored.length ? scored[0].pc.id : null;

  renderResults(results, topId, scored, params);
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

function renderResults(pcs, topId, scored, params) {
  const container = document.getElementById('results-container');
  if (!pcs.length) {
    container.innerHTML = `
      <div class="no-results">
        <i class="ti ti-search-off"></i>
        <div style="font-size:16px; font-weight:500; margin-bottom:8px; color:var(--text);">Сборки не найдены</div>
        <div style="font-size:14px;">Попробуйте расширить бюджет или изменить фильтры</div>
      </div>`;
    return;
  }
  container.innerHTML = `
    <div class="results-section">
      <div class="results-header">
        <div class="results-title">Подходящие сборки</div>
        <div class="results-count">${pcs.length} из ${scored.length} совпадений</div>
      </div>
      ${pcs.map((pc, i) => renderCard(pc, i, pc.id === topId, scored.find(s => s.pc.id === pc.id)?.score)).join('')}
    </div>`;
}

function renderCard(pc, idx, isBest, score) {
  const matchBars = (pc.matches||[]).map(m =>
    `<div class="match-bar"><div class="match-dot good"></div><span>${m}</span></div>`
  ).join('') + (pc.weaknesses||[]).map(w =>
    `<div class="match-bar"><div class="match-dot ok"></div><span style="color:var(--muted);">${w}</span></div>`
  ).join('');

  const scoreBadge = score >= 60
    ? `<div class="score-badge high"><i class="ti ti-star-filled" style="font-size:10px;"></i> Отличное совпадение</div>`
    : score >= 40
    ? `<div class="score-badge med"><i class="ti ti-thumb-up" style="font-size:10px;"></i> Хорошее совпадение</div>`
    : '';

  return `<div class="pc-card${isBest ? ' best' : ''}">
    ${isBest ? '<div class="best-badge">★ Лучший выбор</div>' : ''}
    <div class="pc-name">${pc.name}</div>
    <div class="pc-desc">${pc.desc}</div>
    ${scoreBadge}
    <div class="match-bars">${matchBars}</div>
    <div class="specs-grid">
      <div class="spec-item"><div class="spec-label">Процессор</div><div class="spec-val">${pc.cpu}</div></div>
      <div class="spec-item"><div class="spec-label">Видеокарта</div><div class="spec-val">${pc.gpu}</div></div>
      <div class="spec-item"><div class="spec-label">Память</div><div class="spec-val">${pc.ramLabel}</div></div>
      <div class="spec-item"><div class="spec-label">Накопитель</div><div class="spec-val">${pc.storageLabel}</div></div>
      <div class="spec-item"><div class="spec-label">Материнская плата</div><div class="spec-val">${pc.motherboard}</div></div>
      <div class="spec-item"><div class="spec-label">Блок питания</div><div class="spec-val">${pc.psu}</div></div>
    </div>
    <div class="pc-footer">
      <div class="pc-price">${fmt(pc.price)}</div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <button class="fav-btn ${isFav(pc.id) ? 'active' : ''}" onclick="toggleFav(${pc.id}, this)" id="fav-btn-${pc.id}">
          <i class="ti ${isFav(pc.id) ? 'ti-heart-filled' : 'ti-heart'}"></i>
          ${isFav(pc.id) ? 'В избранном' : 'В избранное'}
        </button>
        <button class="stores-btn" onclick="toggleStores(${idx}, this)" data-idx="${idx}">
          <i class="ti ti-building-store" style="font-size:16px;"></i>
          Где купить
        </button>
      </div>
    </div>
    <div id="stores-${idx}" style="display:none;" data-stores='${JSON.stringify(pc.stores)}'></div>
  </div>`;
}

function toggleStores(idx, btn) {
  const panel = document.getElementById('stores-' + idx);
  if (panel.style.display === 'block') {
    panel.style.display = 'none';
    btn.innerHTML = '<i class="ti ti-building-store" style="font-size:16px;"></i> Где купить';
    return;
  }
  panel.style.display = 'block';
  btn.innerHTML = '<i class="ti ti-x" style="font-size:16px;"></i> Скрыть';
  if (panel.dataset.loaded) return;
  panel.dataset.loaded = '1';
  const stores = JSON.parse(panel.dataset.stores || '[]');
  renderStores(panel, stores);
}

function renderStores(panel, stores) {
  const sorted = [...stores].sort((a,b) => a.price - b.price);
  panel.innerHTML = `<div class="stores-panel">
    <div class="stores-panel-title"><i class="ti ti-building-store" style="font-size:14px; vertical-align:-2px; margin-right:6px;"></i>Магазины</div>
    ${sorted.map((s, i) => `
      <div class="store-row">
        <div class="store-info">
          <div class="store-icon">${s.icon || '🏪'}</div>
          <div>
            <div class="store-name">${s.name}</div>
            <div class="store-info-text">
              ${s.inStock
                ? '<span style="color:#97C459;">● В наличии</span>'
                : '<span style="color:var(--muted);">○ Под заказ</span>'}
              · Доставка ${s.delivery || '2-5 дней'}
              ${i === 0 ? ' <span style="color:var(--accent); font-size:11px;">• Дешевле всего</span>' : ''}
            </div>
          </div>
        </div>
        <div class="store-right">
          <div class="store-price">${s.price.toLocaleString('ru-RU')} ₽</div>
          <a class="store-link" href="${s.url}" target="_blank" rel="noopener">
            Перейти <i class="ti ti-external-link" style="font-size:12px;"></i>
          </a>
        </div>
      </div>
    `).join('')}
    <div style="padding-top:12px; font-size:12px; color:var(--muted);">
      <i class="ti ti-info-circle" style="font-size:13px; vertical-align:-2px;"></i>
      Цены ориентировочные на 2026 год. Уточняйте наличие и стоимость на сайте магазина.
    </div>
  </div>`;
}

// ─── TABS ────────────────────────────────────────────────────────────────────

function switchTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
  if (tab === 'favorites') renderFavTab();
}

// ─── FAVORITES ───────────────────────────────────────────────────────────────

let favorites = JSON.parse(localStorage.getItem('pc-favs') || '[]');
let compareList = []; // ids currently selected for compare

function saveFavs() {
  localStorage.setItem('pc-favs', JSON.stringify(favorites));
}

function isFav(id) { return favorites.includes(id); }

function updateFavBadge() {
  const badge = document.getElementById('fav-badge');
  if (favorites.length > 0) {
    badge.style.display = 'flex';
    badge.textContent = favorites.length;
  } else {
    badge.style.display = 'none';
  }
}

function toggleFav(id, btn) {
  if (isFav(id)) {
    favorites = favorites.filter(f => f !== id);
    btn.classList.remove('active');
    btn.innerHTML = '<i class="ti ti-heart"></i> В избранное';
    // Also remove from compare if was selected
    removeFromCompare(id);
  } else {
    favorites.push(id);
    btn.classList.add('active');
    btn.innerHTML = '<i class="ti ti-heart-filled"></i> В избранном';
  }
  saveFavs();
  updateFavBadge();
  // If currently on favorites tab, re-render
  if (document.getElementById('tab-favorites').classList.contains('active')) {
    renderFavTab();
  }
}

function renderFavTab() {
  const container = document.getElementById('fav-content');
  if (favorites.length === 0) {
    compareList = [];
    updateCompareBar();
    container.innerHTML = `
      <div class="fav-empty">
        <i class="ti ti-heart-off"></i>
        <div class="fav-empty-title">Избранное пусто</div>
        <div style="font-size:14px;">Добавляйте понравившиеся сборки кнопкой «В избранное» на вкладке Конфигуратор</div>
      </div>`;
    return;
  }
  const favPCs = DB.filter(pc => favorites.includes(pc.id));
  container.innerHTML = `
    <div class="fav-section-header">
      <div class="results-title">Избранные сборки <span class="results-count" style="margin-left:8px;">${favPCs.length}</span></div>
      ${favPCs.length >= 2 ? '<div class="fav-compare-hint"><i class="ti ti-checkbox" style="font-size:12px; vertical-align:-1px; margin-right:4px;"></i>Отметьте 2–4 сборки для сравнения</div>' : ''}
    </div>
    ${favPCs.map((pc, i) => renderFavCard(pc, i)).join('')}`;
  updateCompareBar();
}

function renderFavCard(pc, idx) {
  const inCompare = compareList.includes(pc.id);
  const matchBars = (pc.matches||[]).map(m =>
    `<div class="match-bar"><div class="match-dot good"></div><span>${m}</span></div>`
  ).join('') + (pc.weaknesses||[]).map(w =>
    `<div class="match-bar"><div class="match-dot ok"></div><span style="color:var(--muted);">${w}</span></div>`
  ).join('');
  return `<div class="pc-card" id="fav-card-${pc.id}">
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:4px;">
      <div class="pc-name" style="margin-bottom:0; padding-right:0;">${pc.name}</div>
      <label class="compare-check-wrap" title="Добавить к сравнению" style="margin-top:3px; flex-shrink:0;">
        <input type="checkbox" ${inCompare ? 'checked' : ''} onchange="toggleCompare(${pc.id}, this)">
        <div class="compare-check-box"></div>
        <span style="white-space:nowrap;">Сравнить</span>
      </label>
    </div>
    <div class="pc-desc">${pc.desc}</div>
    <div class="match-bars">${matchBars}</div>
    <div class="specs-grid">
      <div class="spec-item"><div class="spec-label">Процессор</div><div class="spec-val">${pc.cpu}</div></div>
      <div class="spec-item"><div class="spec-label">Видеокарта</div><div class="spec-val">${pc.gpu}</div></div>
      <div class="spec-item"><div class="spec-label">Память</div><div class="spec-val">${pc.ramLabel}</div></div>
      <div class="spec-item"><div class="spec-label">Накопитель</div><div class="spec-val">${pc.storageLabel}</div></div>
      <div class="spec-item"><div class="spec-label">Материнская плата</div><div class="spec-val">${pc.motherboard}</div></div>
      <div class="spec-item"><div class="spec-label">Блок питания</div><div class="spec-val">${pc.psu}</div></div>
    </div>
    <div class="pc-footer">
      <div class="pc-price">${fmt(pc.price)}</div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <button class="fav-btn active" onclick="removeFavFromTab(${pc.id}, this)">
          <i class="ti ti-heart-filled"></i> В избранном
        </button>
        <button class="stores-btn" onclick="toggleFavStores(${pc.id}, this)">
          <i class="ti ti-building-store" style="font-size:16px;"></i>
          Где купить
        </button>
      </div>
    </div>
    <div id="fav-stores-${pc.id}" style="display:none;" data-stores='${JSON.stringify(pc.stores)}'></div>
  </div>`;
}

function removeFavFromTab(id, btn) {
  favorites = favorites.filter(f => f !== id);
  saveFavs();
  updateFavBadge();
  removeFromCompare(id);
  // Also update button in configurator tab if visible
  const cfgBtn = document.getElementById('fav-btn-' + id);
  if (cfgBtn) {
    cfgBtn.classList.remove('active');
    cfgBtn.innerHTML = '<i class="ti ti-heart"></i> В избранное';
  }
  renderFavTab();
}

function toggleFavStores(id, btn) {
  const panel = document.getElementById('fav-stores-' + id);
  if (panel.style.display === 'block') {
    panel.style.display = 'none';
    btn.innerHTML = '<i class="ti ti-building-store" style="font-size:16px;"></i> Где купить';
    return;
  }
  panel.style.display = 'block';
  btn.innerHTML = '<i class="ti ti-x" style="font-size:16px;"></i> Скрыть';
  if (panel.dataset.loaded) return;
  panel.dataset.loaded = '1';
  const stores = JSON.parse(panel.dataset.stores || '[]');
  renderStores(panel, stores);
}

// ─── COMPARE ─────────────────────────────────────────────────────────────────

function toggleCompare(id, checkbox) {
  if (checkbox.checked) {
    if (compareList.length >= 4) {
      checkbox.checked = false;
      showCompareLimit();
      return;
    }
    if (!compareList.includes(id)) compareList.push(id);
  } else {
    removeFromCompare(id);
  }
  updateCompareBar();
}

function removeFromCompare(id) {
  compareList = compareList.filter(c => c !== id);
  // Uncheck checkbox in fav tab if exists
  const card = document.getElementById('fav-card-' + id);
  if (card) {
    const cb = card.querySelector('input[type=checkbox]');
    if (cb) cb.checked = false;
  }
  updateCompareBar();
}

function clearCompare() {
  compareList = [];
  // Uncheck all checkboxes
  document.querySelectorAll('#fav-content input[type=checkbox]').forEach(cb => cb.checked = false);
  updateCompareBar();
}

function updateCompareBar() {
  const bar = document.getElementById('compare-bar');
  const chipsEl = document.getElementById('compare-chips');
  if (compareList.length === 0) {
    bar.classList.remove('visible');
    return;
  }
  bar.classList.add('visible');
  const pcs = compareList.map(id => DB.find(pc => pc.id === id)).filter(Boolean);
  chipsEl.innerHTML = pcs.map(pc => `
    <div class="compare-chip">
      <span>${pc.name}</span>
      <button onclick="removeFromCompare(${pc.id})" title="Убрать из сравнения">
        <i class="ti ti-x" style="font-size:12px;"></i>
      </button>
    </div>`).join('');
}

function showCompareLimit() {
  const bar = document.getElementById('compare-bar');
  const orig = bar.style.outline;
  bar.style.outline = '2px solid var(--accent)';
  setTimeout(() => { bar.style.outline = orig; }, 800);
}

function openCompareModal() {
  if (compareList.length < 2) {
    // flash the bar
    showCompareLimit();
    return;
  }
  const pcs = compareList.map(id => DB.find(pc => pc.id === id)).filter(Boolean);
  const wrap = document.getElementById('compare-table-wrap');

  // Find best values for highlighting
  const prices = pcs.map(pc => pc.price);
  const rams = pcs.map(pc => pc.ramGb);
  const storages = pcs.map(pc => pc.storageTb);
  const cpuTiers = pcs.map(pc => pc.cpuTier);
  const gpuTiers = pcs.map(pc => pc.gpuTier);

  function highlight(vals, idx, higherIsBetter) {
    const best = higherIsBetter ? Math.max(...vals) : Math.min(...vals);
    const worst = higherIsBetter ? Math.min(...vals) : Math.max(...vals);
    const v = vals[idx];
    if (pcs.length < 2) return '';
    if (v === best && vals.filter(x => x === best).length === 1) return ' cmp-best-val';
    if (v === worst && vals.filter(x => x === worst).length === 1) return ' cmp-worst-val';
    return '';
  }

  // Parse PSU wattage from string like "850W 80+ Gold"
  function parsePsuWatts(psu) {
    const m = (psu || '').match(/(\d+)\s*W/i);
    return m ? parseInt(m[1]) : 0;
  }
  // Parse PSU efficiency tier: Titanium>Platinum>Gold>Silver>Bronze>White
  function parsePsuTier(psu) {
    const s = (psu || '').toLowerCase();
    if (s.includes('titanium')) return 5;
    if (s.includes('platinum')) return 4;
    if (s.includes('gold')) return 3;
    if (s.includes('silver')) return 2;
    if (s.includes('bronze')) return 1;
    return 0;
  }
  // Parse motherboard tier by brand/series keywords
  function parseMbTier(mb) {
    const s = (mb || '').toLowerCase();
    if (s.includes('rog maximus') || s.includes('proart') || s.includes('apex')) return 5;
    if (s.includes('rog strix') || s.includes('rog crosshair') || s.includes('meg') || s.includes('hero')) return 4;
    if (s.includes('tuf gaming') || s.includes('mag') || s.includes('pro z') || s.includes('pro b6')) return 3;
    if (s.includes('prime') || s.includes('pro a') || s.includes('pro b5') || s.includes('pro b550')) return 2;
    return 1;
  }

  const psuWatts = pcs.map(pc => parsePsuWatts(pc.psu));
  const psuTiers = pcs.map(pc => parsePsuTier(pc.psu));
  const mbTiers  = pcs.map(pc => parseMbTier(pc.motherboard));

  const rows = [
    { label: 'Цена', vals: pcs.map((pc, i) => `<span class="cmp-price-cell${highlight(prices, i, false)}">${fmt(pc.price)}</span>`) },
    { label: 'Процессор', vals: pcs.map((pc, i) => `<span class="${highlight(cpuTiers, i, true)}">${pc.cpu}</span>`) },
    { label: 'Видеокарта', vals: pcs.map((pc, i) => `<span class="${highlight(gpuTiers, i, true)}">${pc.gpu}</span>`) },
    { label: 'Оперативная память', vals: pcs.map((pc, i) => `<span class="${highlight(rams, i, true)}">${pc.ramLabel}</span>`) },
    { label: 'Накопитель', vals: pcs.map((pc, i) => `<span class="${highlight(storages, i, true)}">${pc.storageLabel}</span>`) },
    { label: 'Материнская плата', vals: pcs.map((pc, i) => `<span class="${highlight(mbTiers, i, true)}">${pc.motherboard}</span>`) },
    { label: 'Блок питания', vals: pcs.map((pc, i) => {
      // highlight by wattage first, then efficiency tier if wattage equal
      const wClass = highlight(psuWatts, i, true);
      const tClass = wClass === '' ? highlight(psuTiers, i, true) : wClass;
      return `<span class="${tClass}">${pc.psu}</span>`;
    })},
    { label: 'Назначение', vals: pcs.map(pc => {
      const labels = { gaming:'Игры', office:'Офис', video:'Видео', '3d':'3D/Рендер', streaming:'Стриминг', programming:'Программирование' };
      return (pc.purposes||[]).map(p => labels[p] || p).join(', ');
    })},
  ];

  wrap.innerHTML = `
    <table class="compare-table">
      <thead>
        <tr>
          <th>Характеристика</th>
          ${pcs.map(pc => `<th><div class="cmp-pc-name">${pc.name}</div><div class="cmp-pc-desc">${pc.desc}</div></th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <th>${row.label}</th>
            ${row.vals.map(v => `<td>${v}</td>`).join('')}
          </tr>`).join('')}
        <tr>
          <th>Достоинства</th>
          ${pcs.map(pc => `<td style="font-size:12px; color:#97C459;">${(pc.matches||[]).map(m => '✓ '+m).join('<br>')}</td>`).join('')}
        </tr>
        <tr>
          <th>Недостатки</th>
          ${pcs.map(pc => `<td style="font-size:12px; color:var(--muted);">${(pc.weaknesses||[]).map(w => '– '+w).join('<br>')}</td>`).join('')}
        </tr>
      </tbody>
    </table>
    <div style="margin-top:16px; font-size:12px; color:var(--muted);">
      <span style="color:var(--green-light); font-weight:600;">Зелёным</span> — лучшее значение,
      <span style="color:var(--muted);">серым</span> — наименьшее среди сравниваемых.
    </div>`;

  document.getElementById('compare-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCompareModal() {
  document.getElementById('compare-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function handleModalClick(e) {
  if (e.target === document.getElementById('compare-modal')) closeCompareModal();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeCompareModal();
});

// Init badge on load
updateFavBadge();
