/* ==========================================
   NIMBUS WEATHER DASHBOARD — app.js
   Uses OpenWeatherMap Free API (v2.5 + v3)
   ========================================== */
'use strict';
// ── Constants ─────────────────────────────────────────────────────────────────
const BASE      = 'https://api.openweathermap.org/data/2.5';
const BASE_GEO  = 'https://api.openweathermap.org/geo/1.0';
const LS_KEY    = 'nimbus_api_key';
const LS_CITY   = 'nimbus_last_city';
const LS_UNIT   = 'nimbus_unit';
// ── State ─────────────────────────────────────────────────────────────────────
let apiKey   = localStorage.getItem(LS_KEY) || '9b40123be0978ea7262aa4e27e998295';
let unit     = localStorage.getItem(LS_UNIT) || 'metric';
let currentCoords = null;
let debounceTimer = null;
let isDemoMode = false;
let mockCityName = 'London';
let mockCountryCode = 'GB';

// ── DOM Refs ──────────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const el = {
  modal:          $('api-modal'),
  apiInput:       $('api-key-input'),
  apiSubmit:      $('api-key-submit'),
  btnDemo:        $('btn-demo'),
  apiError:       $('api-key-error'),
  app:            $('app'),
  citySearch:     $('city-search'),
  suggestions:    $('suggestions'),
  todayCity:      $('today-city'),
  todayDate:      $('today-date'),
  todayTemp:      $('today-temp'),
  todayFeels:     $('today-feels'),
  todayIcon:      $('today-icon'),
  todayDesc:      $('today-desc'),
  todayMin:       $('today-min'),
  todayMax:       $('today-max'),
  loading:        $('loading-overlay'),
  errorBanner:    $('error-banner'),
  errorMsg:       $('error-msg'),
  errorDismiss:   $('error-dismiss'),
  lastUpdated:    $('last-updated'),
  btnRefresh:     $('btn-refresh'),
  btnCelsius:     $('btn-celsius'),
  btnFahrenheit:  $('btn-fahrenheit'),
  btnLocate:      $('btn-locate'),
  btnChangeKey:   $('btn-change-key'),
  statHumidity:   $('stat-humidity'),
  barHumidity:    $('bar-humidity'),
  statWind:       $('stat-wind'),
  statWindDir:    $('stat-wind-dir'),
  statPressure:   $('stat-pressure'),
  statVis:        $('stat-visibility'),
  statUv:         $('stat-uv'),
  statUvLabel:    $('stat-uv-label'),
  statSunrise:    $('stat-sunrise'),
  statSunset:     $('stat-sunset'),
  hourlyContainer:$('hourly-container'),
  dailyContainer: $('daily-container'),
  aqiValue:       $('aqi-value'),
  aqiLabel:       $('aqi-label'),
  aqiRing:        $('aqi-ring'),
  aqiDetails:     $('aqi-details'),
  compassNeedle:  $('compass-needle'),
  wcSpeed:        $('wc-speed'),
  wcDir:          $('wc-dir'),
  wcGust:         $('wc-gust'),
};
function weatherEmoji(iconCode) {
  const map = {
    '01d': '☀️',  '01n': '🌙',
    '02d': '⛅',  '02n': '☁️',
    '03d': '☁️',  '03n': '☁️',
    '04d': '☁️',  '04n': '☁️',
    '09d': '🌧️', '09n': '🌧️',
    '10d': '🌦️', '10n': '🌧️',
    '11d': '⛈️', '11n': '⛈️',
    '13d': '❄️',  '13n': '❄️',
    '50d': '🌫️', '50n': '🌫️',
  };
  return map[iconCode] || '🌡️';
}
function fmtTemp(k) { return `${Math.round(k)}°${unit === 'metric' ? 'C' : 'F'}`; }
function fmtSpeed(v) { return unit === 'metric' ? `${v.toFixed(1)} m/s` : `${(v * 2.237).toFixed(1)} mph`; }
function fmtTime(unix, tz) { return new Date((unix + tz) * 1000).toISOString().slice(11, 16); }
function degToDir(deg) { const dirs = ['N','NE','E','SE','S','SW','W','NW']; return dirs[Math.round(deg / 45) % 8]; }
function fmtDate(unix, tz) { return new Date((unix + tz) * 1000).toUTCString().slice(0, 16); }
function fmtDayName(unix, tz) { const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']; return days[new Date((unix + tz) * 1000).getUTCDay()]; }
function uvCategory(uv) {
  if (uv <= 2) return { label: 'Low', color: '#4ade80' };
  if (uv <= 5) return { label: 'Moderate', color: '#facc15' };
  if (uv <= 7) return { label: 'High', color: '#fb923c' };
  if (uv <= 10) return { label: 'Very High', color: '#f87171' };
  return { label: 'Extreme', color: '#c084fc' };
}
function aqiCategory(aqi) {
  const cats = [
    null,
    { label: 'Good',      color: '#4ade80', shadow: 'rgba(74,222,128,0.3)' },
    { label: 'Fair',      color: '#a3e635', shadow: 'rgba(163,230,53,0.3)' },
    { label: 'Moderate',  color: '#facc15', shadow: 'rgba(250,204,21,0.3)' },
    { label: 'Poor',      color: '#fb923c', shadow: 'rgba(251,146,60,0.3)' },
    { label: 'Very Poor', color: '#f87171', shadow: 'rgba(248,113,113,0.3)' },
  ];
  return cats[aqi] || { label: '—', color: '#94a3b8', shadow: 'rgba(0,0,0,0)' };
}
function showLoading() { el.loading.classList.remove('hidden'); }
function hideLoading() { el.loading.classList.add('hidden'); }
function showError(msg) { el.errorMsg.textContent = msg; el.errorBanner.classList.remove('hidden'); }
function hideError() { el.errorBanner.classList.add('hidden'); }
const MOCK_CITIES = [
  { name: 'London', state: 'England', country: 'GB', lat: 51.5074, lon: -0.1278 },
  { name: 'New York', state: 'New York', country: 'US', lat: 40.7128, lon: -74.0060 },
  { name: 'Tokyo', state: 'Tokyo', country: 'JP', lat: 35.6762, lon: 139.6503 },
  { name: 'Paris', state: 'Île-de-France', country: 'FR', lat: 48.8566, lon: 2.3522 },
  { name: 'Sydney', state: 'New South Wales', country: 'AU', lat: -33.8688, lon: 151.2093 },
  { name: 'Mumbai', state: 'Maharashtra', country: 'IN', lat: 19.0760, lon: 72.8777 },
  { name: 'Cairo', state: 'Cairo', country: 'EG', lat: 30.0444, lon: 31.2357 },
  { name: 'Rio de Janeiro', state: 'Rio de Janeiro', country: 'BR', lat: -22.9068, lon: -43.1729 }
];

function getMockGeocode(query) {
  const q = query.toLowerCase();
  return MOCK_CITIES.filter(c => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q));
}

function getMockData(url) {
  if (url.includes('/weather')) {
    return {
      name: mockCityName,
      sys: { country: mockCountryCode },
      main: {
        temp: unit === 'metric' ? 18.5 : 65.3,
        feels_like: unit === 'metric' ? 18.2 : 64.8,
        temp_min: unit === 'metric' ? 15.0 : 59.0,
        temp_max: unit === 'metric' ? 22.0 : 71.6,
        humidity: 64,
        pressure: 1015
      },
      weather: [{ icon: '02d', description: 'scattered clouds', main: 'Clouds' }],
      wind: { speed: unit === 'metric' ? 4.1 : 9.2, deg: 210, gust: unit === 'metric' ? 6.2 : 13.9 },
      visibility: 10000,
      sys: { sunrise: Math.floor(Date.now() / 1000) - 20000, sunset: Math.floor(Date.now() / 1000) + 20000, country: mockCountryCode },
      timezone: 3600
    };
  } else if (url.includes('/forecast')) {
    const list = [];
    const now = Math.floor(Date.now() / 1000);
    const weatherTypes = [
      { icon: '01d', main: 'Clear' },
      { icon: '02d', main: 'Clouds' },
      { icon: '03d', main: 'Clouds' },
      { icon: '10d', main: 'Rain' },
      { icon: '09d', main: 'Rain' }
    ];
    for (let i = 0; i < 40; i++) {
      const dt = now + i * 3 * 3600;
      const tempBase = unit === 'metric' ? 18 + Math.sin(i / 3) * 4 : 64 + Math.sin(i / 3) * 7;
      const weatherIdx = Math.floor((i % 15) / 3);
      list.push({
        dt: dt,
        main: {
          temp: tempBase,
          temp_min: tempBase - 2,
          temp_max: tempBase + 2,
        },
        weather: [weatherTypes[weatherIdx % weatherTypes.length]],
        pop: (weatherIdx >= 3) ? 0.6 : 0.0
      });
    }
    return { list: list };
  } else if (url.includes('/air_pollution')) {
    return {
      list: [{
        main: { aqi: 2 },
        components: {
          co: 250.3,
          no2: 12.5,
          o3: 65.2,
          pm2_5: 11.4,
          pm10: 18.2,
          so2: 1.8
        }
      }]
    };
  }
}

async function apiFetch(url) {
  if (isDemoMode) return getMockData(url);
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}appid=${apiKey}&units=${unit}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function geocode(query) {
  if (isDemoMode) return getMockGeocode(query);
  const res = await fetch(`${BASE_GEO}/direct?q=${encodeURIComponent(query)}&limit=5&appid=${apiKey}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function reverseGeocode(lat, lon) {
  if (isDemoMode) return { name: mockCityName, country: mockCountryCode };
  const res = await fetch(`${BASE_GEO}/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${apiKey}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data[0] || null;
}

async function fetchWeather(lat, lon) {
  showLoading(); hideError();
  if (isDemoMode) {
    const closest = MOCK_CITIES.reduce((prev, curr) => {
      const prevDiff = Math.abs(prev.lat - lat) + Math.abs(prev.lon - lon);
      const currDiff = Math.abs(curr.lat - lat) + Math.abs(curr.lon - lon);
      return currDiff < prevDiff ? curr : prev;
    });
    const dist = Math.abs(closest.lat - lat) + Math.abs(closest.lon - lon);
    if (dist > 15) {
      mockCityName = 'My Location';
      mockCountryCode = '';
    } else {
      mockCityName = closest.name;
      mockCountryCode = closest.country;
    }
  }
  try {
    const [current, forecast, aqi] = await Promise.all([
      apiFetch(`${BASE}/weather?lat=${lat}&lon=${lon}`),
      apiFetch(`${BASE}/forecast?lat=${lat}&lon=${lon}&cnt=40`),
      apiFetch(`${BASE}/air_pollution?lat=${lat}&lon=${lon}`),
    ]);
    renderAll(current, forecast, aqi);
    currentCoords = { lat, lon };
    if (!isDemoMode) {
      localStorage.setItem(LS_CITY, JSON.stringify({ lat, lon, name: current.name }));
    }
    el.lastUpdated.textContent = `Updated: ${new Date().toLocaleTimeString()} ${isDemoMode ? '(Demo Mode)' : ''}`;
  } catch (err) {
    console.error(err);
    showError('Failed to fetch weather data. Check your API key or network connection.');
  } finally {
    hideLoading();
  }
}
function renderAll(current, forecast, aqi) {
  renderSidebar(current);
  renderStats(current);
  renderHourly(forecast, current.timezone);
  renderDaily(forecast, current.timezone);
  renderAqi(aqi);
  renderCompass(current);
}
function renderSidebar(d) {
  const flag = d.sys.country ? ` ${countryFlag(d.sys.country)}` : '';
  el.todayCity.textContent  = `${d.name}${flag}`;
  el.todayDate.textContent  = new Date().toLocaleDateString(undefined, { weekday:'long', month:'short', day:'numeric' });
  el.todayTemp.textContent  = fmtTemp(d.main.temp);
  el.todayFeels.textContent = `Feels like ${fmtTemp(d.main.feels_like)}`;
  el.todayIcon.textContent  = weatherEmoji(d.weather[0].icon);
  el.todayDesc.textContent  = d.weather[0].description;
  el.todayMin.textContent   = fmtTemp(d.main.temp_min);
  el.todayMax.textContent   = fmtTemp(d.main.temp_max);
}
function countryFlag(code) {
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join('');
}
function renderStats(d) {
  el.statHumidity.textContent = `${d.main.humidity}%`;
  el.barHumidity.style.width  = `${d.main.humidity}%`;
  el.statWind.textContent     = fmtSpeed(d.wind.speed);
  el.statWindDir.textContent  = `${degToDir(d.wind.deg)} (${d.wind.deg}°)`;
  el.statPressure.textContent = d.main.pressure;
  el.statVis.textContent      = d.visibility ? (d.visibility / 1000).toFixed(1) : '—';
  el.statUv.textContent       = '—';
  el.statUvLabel.textContent  = '';
  el.statSunrise.textContent  = fmtTime(d.sys.sunrise, d.timezone);
  el.statSunset.textContent   = fmtTime(d.sys.sunset,  d.timezone);
}
function renderHourly(forecast, tz) {
  const items = forecast.list.slice(0, 8);
  el.hourlyContainer.innerHTML = items.map((item, i) => {
    const time = fmtTime(item.dt, tz);
    const rain = item.pop ? `${Math.round(item.pop * 100)}% 💧` : '';
    return `
      <div class="hourly-card${i === 0 ? ' now' : ''}">
        <div class="hourly-time">${i === 0 ? 'Now' : time}</div>
        <div class="hourly-icon">${weatherEmoji(item.weather[0].icon)}</div>
        <div class="hourly-temp">${fmtTemp(item.main.temp)}</div>
        ${rain ? `<div class="hourly-rain">${rain}</div>` : ''}
      </div>`;
  }).join('');
}
function renderDaily(forecast, tz) {
  const days = {};
  for (const item of forecast.list) {
    const dayKey = new Date((item.dt + tz) * 1000).toISOString().slice(0, 10);
    if (!days[dayKey]) days[dayKey] = [];
    days[dayKey].push(item);
  }
  const dayKeys   = Object.keys(days).slice(0, 5);
  const allTemps  = forecast.list.map(i => i.main.temp);
  const globalMin = Math.min(...allTemps);
  const globalMax = Math.max(...allTemps);
  el.dailyContainer.innerHTML = dayKeys.map((key, idx) => {
    const entries = days[key];
    const temps   = entries.map(e => e.main.temp);
    const min     = Math.min(...temps);
    const max     = Math.max(...temps);
    const noon    = entries.reduce((a,b) => Math.abs(fmtTime(b.dt, tz).slice(0,2) - 12) < Math.abs(fmtTime(a.dt, tz).slice(0,2) - 12) ? b : a);
    const dayName = idx === 0 ? 'Today' : fmtDayName(noon.dt, tz);
    const barLeft = ((min - globalMin) / (globalMax - globalMin) * 80).toFixed(1);
    const barW    = Math.max(((max - min) / (globalMax - globalMin) * 80), 8).toFixed(1);
    return `
      <div class="daily-row">
        <div class="daily-day">${dayName}</div>
        <div class="daily-icon-desc">
          <span>${weatherEmoji(noon.weather[0].icon)}</span>
          <span>${noon.weather[0].main}</span>
        </div>
        <div class="daily-range">
          <span class="daily-max">${fmtTemp(max)}</span>
          <span class="daily-min">${fmtTemp(min)}</span>
        </div>
        <div class="daily-bar-cell">
          <div style="position:relative;height:4px;border-radius:99px;background:rgba(255,255,255,0.07);">
            <div class="daily-range-bar" style="position:absolute;left:${barLeft}%;width:${barW}%;height:100%;"></div>
          </div>
        </div>
      </div>`;
  }).join('');
}
function renderAqi(aqiData) {
  const aqi = aqiData.list[0];
  const idx = aqi.main.aqi;
  const cat = aqiCategory(idx);
  el.aqiValue.textContent      = idx;
  el.aqiLabel.textContent      = cat.label;
  el.aqiRing.style.borderColor = cat.color;
  el.aqiRing.style.boxShadow   = `0 0 28px ${cat.shadow}`;
  const c = aqi.components;
  const pollutants = [
    { label: 'CO',    value: c.co?.toFixed(1)    ?? '—', unit: 'μg/m³' },
    { label: 'NO₂',   value: c.no2?.toFixed(1)   ?? '—', unit: 'μg/m³' },
    { label: 'O₃',    value: c.o3?.toFixed(1)    ?? '—', unit: 'μg/m³' },
    { label: 'PM2.5', value: c.pm2_5?.toFixed(1) ?? '—', unit: 'μg/m³' },
    { label: 'PM10',  value: c.pm10?.toFixed(1)  ?? '—', unit: 'μg/m³' },
    { label: 'SO₂',   value: c.so2?.toFixed(1)   ?? '—', unit: 'μg/m³' },
  ];
  el.aqiDetails.innerHTML = pollutants.map(p => `
    <div class="aqi-item">
      <div class="aqi-item-label">${p.label}</div>
      <div class="aqi-item-value">${p.value} <small style="font-size:0.65rem;color:#64748b;">${p.unit}</small></div>
    </div>`).join('');
}
function renderCompass(d) {
  const deg  = d.wind.deg || 0;
  const gust = d.wind.gust ? fmtSpeed(d.wind.gust) : '—';
  el.compassNeedle.style.transform = `rotate(${deg}deg)`;
  el.wcSpeed.textContent = fmtSpeed(d.wind.speed);
  el.wcDir.textContent   = `${degToDir(deg)} ${deg}°`;
  el.wcGust.textContent  = gust;
}
async function validateKey(key) {
  const res = await fetch(`${BASE}/weather?q=London&appid=${key}&units=metric`);
  return res.ok;
}
function showApp() { el.modal.classList.add('hidden'); el.app.classList.remove('hidden'); }
function showModal() { el.app.classList.add('hidden'); el.modal.classList.remove('hidden'); }
async function connectKey() {
  const key = el.apiInput.value.trim();
  if (!key) return;
  el.apiSubmit.disabled = true;
  el.apiSubmit.textContent = 'Checking…';
  el.apiError.classList.add('hidden');
  try {
    const valid = await validateKey(key);
    if (!valid) throw new Error('invalid');
    apiKey = key;
    isDemoMode = false;
    localStorage.setItem(LS_KEY, key);
    showApp();
    loadLastCity();
  } catch {
    el.apiError.classList.remove('hidden');
  } finally {
    el.apiSubmit.disabled = false;
    el.apiSubmit.textContent = 'Connect';
  }
}
function startDemoMode() {
  isDemoMode = true;
  showApp();
  fetchWeather(51.5074, -0.1278); // London
}
function loadLastCity() {
  const saved = localStorage.getItem(LS_CITY);
  if (saved && !isDemoMode) {
    const { lat, lon } = JSON.parse(saved);
    fetchWeather(lat, lon);
  } else {
    fetchWeather(51.5074, -0.1278); // Default: London
  }
}
async function handleSearch(query) {
  if (!query || query.length < 2) { el.suggestions.classList.add('hidden'); return; }
  try {
    const results = await geocode(query);
    if (!results.length) { el.suggestions.classList.add('hidden'); return; }
    el.suggestions.innerHTML = results.map(r => {
      const flag  = r.country ? countryFlag(r.country) : '';
      const label = [r.name, r.state, r.country].filter(Boolean).join(', ');
      return `<div class="suggestion-item" data-lat="${r.lat}" data-lon="${r.lon}" data-label="${r.name}">${flag} ${label}</div>`;
    }).join('');
    el.suggestions.classList.remove('hidden');
    el.suggestions.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        el.citySearch.value = item.dataset.label;
        el.suggestions.classList.add('hidden');
        fetchWeather(parseFloat(item.dataset.lat), parseFloat(item.dataset.lon));
      });
    });
  } catch { el.suggestions.classList.add('hidden'); }
}
function locateUser() {
  if (!navigator.geolocation) return showError('Geolocation not supported by your browser.');
  el.btnLocate.textContent = '⏳ Locating…';
  navigator.geolocation.getCurrentPosition(
    pos => { el.btnLocate.innerHTML = '<span>📍</span> Use My Location'; fetchWeather(pos.coords.latitude, pos.coords.longitude); },
    ()  => { el.btnLocate.innerHTML = '<span>📍</span> Use My Location'; showError('Could not get your location.'); }
  );
}
function switchUnit(newUnit) {
  if (unit === newUnit) return;
  unit = newUnit;
  localStorage.setItem(LS_UNIT, unit);
  el.btnCelsius.classList.toggle('active',    unit === 'metric');
  el.btnFahrenheit.classList.toggle('active', unit === 'imperial');
  if (currentCoords) fetchWeather(currentCoords.lat, currentCoords.lon);
}
el.apiSubmit.addEventListener('click', connectKey);
el.apiInput.addEventListener('keydown', e => { if (e.key === 'Enter') connectKey(); });
el.btnDemo.addEventListener('click', startDemoMode);
el.btnRefresh.addEventListener('click', () => { if (currentCoords) fetchWeather(currentCoords.lat, currentCoords.lon); });
el.errorDismiss.addEventListener('click', hideError);
el.btnLocate.addEventListener('click', locateUser);
el.btnChangeKey.addEventListener('click', showModal);
el.btnCelsius.addEventListener('click',    () => switchUnit('metric'));
el.btnFahrenheit.addEventListener('click', () => switchUnit('imperial'));
el.citySearch.addEventListener('input', e => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => handleSearch(e.target.value.trim()), 350);
});
document.addEventListener('click', e => {
  if (!el.suggestions.contains(e.target) && e.target !== el.citySearch) el.suggestions.classList.add('hidden');
});
// ── Init ──────────────────────────────────────────────────────────────────────
(function init() {
  el.btnCelsius.classList.toggle('active',    unit === 'metric');
  el.btnFahrenheit.classList.toggle('active', unit === 'imperial');
  if (apiKey) {
    validateKey(apiKey).then(valid => {
      if (valid) { showApp(); loadLastCity(); }
      else { localStorage.removeItem(LS_KEY); }
    });
  }
})();