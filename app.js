/* ============================================
   Google Maps Clone — Main Application
   Uses: Leaflet + OpenStreetMap + Nominatim + OSRM
   ============================================ */

// ── DOM References ───────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const mapEl = $('#map');
const searchInput = $('#searchInput');
const searchResults = $('#searchResults');
const searchPanel = $('#searchPanel');
const clearSearch = $('#clearSearch');
const directionsPanel = $('#directionsPanel');
const originInput = $('#originInput');
const destInput = $('#destInput');
const routeInfo = $('#routeInfo');
const routeSteps = $('#routeSteps');
const placeDetails = $('#placeDetails');
const placeName = $('#placeName');
const placeContent = $('#placeContent');
const loadingOverlay = $('#loadingOverlay');
const toast = $('#toast');
const mapScale = $('#mapScale');

// ── State ───────────────────────────────────
let map;
let currentLayer = 'satellite';
let tileLayers = {};
let searchMarker = null;
let originMarker = null;
let destMarker = null;
let routeLine = null;
let routeStepMarkers = [];
let userLocationMarker = null;
let userLocationCircle = null;
let activePanel = 'search'; // 'search' | 'directions' | 'place'
let currentRouteData = null;

// ── Tile Layer Definitions ──────────────────
const TILE_LAYERS = {
  standard: {
    name: 'Standard',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
  },
  terrain: {
    name: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> contributors',
  },
  dark: {
    name: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
};

// ── Initialize Map ──────────────────────────
function initMap() {
  map = L.map('map', {
    center: [40.7128, -74.006], // New York City
    zoom: 13,
    zoomControl: false,
    attributionControl: true,
  });

  // Add all tile layers (only show active one)
  Object.entries(TILE_LAYERS).forEach(([key, layer]) => {
    tileLayers[key] = L.tileLayer(layer.url, {
      attribution: layer.attribution,
      maxZoom: 19,
    });
    if (key === currentLayer) {
      tileLayers[key].addTo(map);
    }
  });

  // Scale control
  L.control.scale({
    position: 'bottomleft',
    imperial: false,
    maxWidth: 120,
  }).addTo(map);

  // Update scale text
  map.on('zoomend moveend', updateScaleInfo);

  // Click on map to get coordinates
  map.on('click', (e) => {
    if (activePanel === 'directions') {
      // If directions panel is open, clicking sets destination
      const lat = e.latlng.lat.toFixed(6);
      const lon = e.latlng.lng.toFixed(6);
      destInput.value = `${lat}, ${lon}`;
      reverseGeocode(e.latlng.lat, e.latlng.lng, (addr) => {
        if (addr) destInput.value = addr;
      });
      if (originInput.value.trim()) calculateRoute();
    }
  });

  // Right-click for coordinates
  map.on('contextmenu', (e) => {
    const lat = e.latlng.lat.toFixed(6);
    const lon = e.latlng.lng.toFixed(6);
    showToast(`📍 ${lat}, ${lon}`);
    L.popup()
      .setLatLng(e.latlng)
      .setContent(`<b>Coordinates</b><br>${lat}, ${lon}`)
      .openOn(map);
  });

  updateScaleInfo();
}

// ── Scale Info ──────────────────────────────
function updateScaleInfo() {
  const z = map.getZoom();
  const c = map.getCenter();
  mapScale.textContent = `Zoom: ${z} | Lat: ${c.lat.toFixed(4)}° Lng: ${c.lng.toFixed(4)}°`;
}

// ── Layer Switching ─────────────────────────
$$('.layer-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const layer = btn.dataset.layer;
    switchLayer(layer);
  });
});

function switchLayer(layer) {
  if (currentLayer === layer) return;
  // Remove current layer
  if (tileLayers[currentLayer]) map.removeLayer(tileLayers[currentLayer]);
  // Add new layer
  if (tileLayers[layer]) tileLayers[layer].addTo(map);
  currentLayer = layer;
  // Update buttons
  $$('.layer-btn').forEach(b => b.classList.toggle('active', b.dataset.layer === layer));
  showToast(`Map: ${TILE_LAYERS[layer].name}`);
}

// ── Zoom Controls ───────────────────────────
$('#zoomIn').addEventListener('click', () => map.zoomIn());
$('#zoomOut').addEventListener('click', () => map.zoomOut());

// ── My Location ─────────────────────────────
$('#myLocationBtn').addEventListener('click', () => {
  if (!navigator.geolocation) {
    showToast('Geolocation not supported');
    return;
  }

  $('#myLocationBtn').querySelector('i').className = 'fas fa-spinner fa-spin';
  showLoading(true);

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      map.setView([latitude, longitude], 15, { animate: true });

      // Remove old markers
      if (userLocationMarker) map.removeLayer(userLocationMarker);
      if (userLocationCircle) map.removeLayer(userLocationCircle);

      // Blue dot marker
      userLocationMarker = L.circleMarker([latitude, longitude], {
        radius: 9,
        fillColor: '#4285f4',
        fillOpacity: 1,
        color: '#ffffff',
        weight: 3,
      }).addTo(map);

      // Accuracy circle
      userLocationCircle = L.circle([latitude, longitude], {
        radius: accuracy,
        fillColor: '#4285f4',
        fillOpacity: 0.15,
        color: '#4285f4',
        weight: 1,
        opacity: 0.4,
      }).addTo(map);

      $('#myLocationBtn').querySelector('i').className = 'fas fa-location-crosshairs';
      showLoading(false);
      showToast(`📍 Location found (accuracy: ${Math.round(accuracy)}m)`);
    },
    (err) => {
      $('#myLocationBtn').querySelector('i').className = 'fas fa-location-crosshairs';
      showLoading(false);
      let msg = 'Could not get location';
      if (err.code === 1) msg = 'Location permission denied';
      else if (err.code === 2) msg = 'Location unavailable';
      else if (err.code === 3) msg = 'Location request timed out';
      showToast(msg);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
  );
});

// ── Directions FAB ──────────────────────────
$('#directionsFab').addEventListener('click', () => {
  switchPanel('directions');
  // Pre-fill origin with last search or user location
  if (!originInput.value && searchMarker) {
    const ll = searchMarker.getLatLng();
    originInput.value = `${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`;
    reverseGeocode(ll.lat, ll.lng, (addr) => {
      if (addr) originInput.value = addr;
    });
  }
  originInput.focus();
});

// ── Back to Search ──────────────────────────
$('#backToSearch').addEventListener('click', () => switchPanel('search'));
$('#closePlaceDetails').addEventListener('click', () => switchPanel('search'));

// ── Search ──────────────────────────────────
let searchTimeout;
searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim();
  clearSearch.style.display = query ? 'flex' : 'none';

  clearTimeout(searchTimeout);
  if (query.length < 2) {
    searchResults.classList.remove('active');
    searchPanel.classList.remove('has-results');
    return;
  }

  searchTimeout = setTimeout(() => performSearch(query), 400);
});

clearSearch.addEventListener('click', () => {
  searchInput.value = '';
  clearSearch.style.display = 'none';
  searchResults.classList.remove('active');
  searchPanel.classList.remove('has-results');
  searchInput.focus();
});

async function performSearch(query) {
  showLoading(true);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=1&accept-language=en`;
    const resp = await fetch(url);
    const data = await resp.json();
    renderSearchResults(data);
    showLoading(false);
  } catch (err) {
    showLoading(false);
    showToast('Search failed. Please try again.');
  }
}

function renderSearchResults(results) {
  searchResults.innerHTML = '';
  if (results.length === 0) {
    searchResults.innerHTML =
      '<div style="padding:16px;color:var(--text-secondary);text-align:center;">No results found</div>';
    searchResults.classList.add('active');
    searchPanel.classList.add('has-results');
    return;
  }

  results.forEach((r) => {
    const div = document.createElement('div');
    div.className = 'search-result-item';
    div.innerHTML = `
      <div class="result-icon"><i class="fas fa-map-marker-alt"></i></div>
      <div class="result-info">
        <div class="result-name">${escapeHtml(r.display_name.split(',')[0])}</div>
        <div class="result-address">${escapeHtml(r.display_name)}</div>
      </div>
    `;
    div.addEventListener('click', () => selectSearchResult(r));
    searchResults.appendChild(div);
  });

  searchResults.classList.add('active');
  searchPanel.classList.add('has-results');
}

function selectSearchResult(r) {
  const lat = parseFloat(r.lat);
  const lon = parseFloat(r.lon);

  // Update search input
  searchInput.value = r.display_name;
  searchResults.classList.remove('active');
  searchPanel.classList.remove('has-results');
  clearSearch.style.display = 'flex';

  // Move map
  map.setView([lat, lon], 15, { animate: true });

  // Place marker
  if (searchMarker) map.removeLayer(searchMarker);
  searchMarker = L.marker([lat, lon], {
    icon: createMarkerIcon('#1a73e8', '#ffffff'),
  }).addTo(map)
    .bindPopup(`<b>${escapeHtml(r.display_name.split(',')[0])}</b><br><small>${escapeHtml(r.display_name)}</small>`)
    .openPopup();

  showPlaceDetails(r);
}

function showPlaceDetails(r) {
  placeName.textContent = r.display_name.split(',')[0];
  placeContent.innerHTML = `
    <div class="place-address">
      <i class="fas fa-map-pin"></i> ${escapeHtml(r.display_name)}
    </div>
    <div class="place-coords">
      Lat: ${parseFloat(r.lat).toFixed(6)} | Lng: ${parseFloat(r.lon).toFixed(6)}
    </div>
    <div class="place-actions">
      <button class="place-btn" id="directionsFromHere">
        <i class="fas fa-directions"></i> Directions from here
      </button>
      <button class="place-btn" id="directionsToHere">
        <i class="fas fa-directions"></i> Directions to here
      </button>
      <button class="place-btn" id="zoomInHere">
        <i class="fas fa-search-plus"></i> Zoom in
      </button>
    </div>
  `;

  // Button handlers
  $('#directionsFromHere').addEventListener('click', () => {
    originInput.value = r.display_name;
    switchPanel('directions');
    destInput.focus();
  });
  $('#directionsToHere').addEventListener('click', () => {
    destInput.value = r.display_name;
    switchPanel('directions');
    if (!originInput.value && userLocationMarker) {
      const ll = userLocationMarker.getLatLng();
      originInput.value = `${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`;
    }
    if (originInput.value.trim()) calculateRoute();
    else originInput.focus();
  });
  $('#zoomInHere').addEventListener('click', () => {
    map.setView([parseFloat(r.lat), parseFloat(r.lon)], 18, { animate: true });
  });

  switchPanel('place');
}

// ── Reverse Geocode ─────────────────────────
async function reverseGeocode(lat, lon, cb) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=en`;
    const resp = await fetch(url);
    const data = await resp.json();
    cb(data.display_name || null);
  } catch (err) {
    cb(null);
  }
}

// ── Directions ──────────────────────────────
$('#originInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (destInput.value.trim()) calculateRoute();
    else destInput.focus();
  }
});
$('#destInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && originInput.value.trim()) calculateRoute();
});

// Mode switching
$$('.mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.mode-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    if (originInput.value.trim() && destInput.value.trim()) calculateRoute();
  });
});

async function calculateRoute() {
  const origin = originInput.value.trim();
  const dest = destInput.value.trim();
  if (!origin || !dest) return;

  const mode = document.querySelector('.mode-btn.active')?.dataset?.mode || 'driving';
  showLoading(true);

  try {
    // Geocode origin
    const originCoords = await geocode(origin);
    if (!originCoords) { showToast('Could not find origin'); showLoading(false); return; }

    // Geocode destination
    const destCoords = await geocode(dest);
    if (!destCoords) { showToast('Could not find destination'); showLoading(false); return; }

    // OSRM routing
    const profile = mode === 'walking' ? 'foot' : mode === 'cycling' ? 'bike' : 'car';
    const url = `https://router.project-osrm.org/route/v1/${profile}/${originCoords.lon},${originCoords.lat};${destCoords.lon},${destCoords.lat}?overview=full&geometries=geojson&steps=true&alternatives=false`;

    const resp = await fetch(url);
    const data = await resp.json();

    if (!data.routes || data.routes.length === 0) {
      showToast('No route found');
      showLoading(false);
      return;
    }

    const route = data.routes[0];
    currentRouteData = route;

    // Update route info
    const distance = (route.distance / 1000).toFixed(1);
    const duration = Math.round(route.duration / 60);
    const hours = Math.floor(duration / 60);
    const mins = duration % 60;
    const timeStr = hours > 0 ? `${hours}h ${mins}min` : `${mins} min`;

    routeInfo.style.display = 'flex';
    routeInfo.innerHTML = `
      <span><i class="fas fa-road"></i> ${distance} km</span>
      <span><i class="fas fa-clock"></i> ${timeStr}</span>
    `;

    // Draw route
    drawRoute(route, originCoords, destCoords);

    // Render steps
    renderSteps(route.legs[0].steps);

    // Fit bounds
    const bounds = L.latLngBounds(
      [originCoords.lat, originCoords.lon],
      [destCoords.lat, destCoords.lon]
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14, animate: true });

    showLoading(false);
    showToast(`Route: ${distance} km, ${timeStr}`);
  } catch (err) {
    showLoading(false);
    showToast('Routing failed. Please try again.');
    console.error(err);
  }
}

async function geocode(query) {
  try {
    // Check if it's coordinates (lat, lng)
    const coordMatch = query.match(/^(-?\d+\.?\d*)\s*,?\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      return { lat: parseFloat(coordMatch[1]), lon: parseFloat(coordMatch[2]) };
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&accept-language=en`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display: data[0].display_name };
  } catch (err) {
    return null;
  }
}

function drawRoute(route, origin, dest) {
  // Clear old route
  if (routeLine) map.removeLayer(routeLine);
  routeStepMarkers.forEach((m) => map.removeLayer(m));
  routeStepMarkers = [];

  // Draw the main route line
  const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
  routeLine = L.polyline(coords, {
    color: '#1a73e8',
    weight: 5,
    opacity: 0.8,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(map);

  // Origin marker
  if (originMarker) map.removeLayer(originMarker);
  originMarker = L.marker([origin.lat, origin.lon], {
    icon: createMarkerIcon('#4285f4', '#ffffff', 'A'),
  }).addTo(map);

  // Destination marker
  if (destMarker) map.removeLayer(destMarker);
  destMarker = L.marker([dest.lat, dest.lon], {
    icon: createMarkerIcon('#ea4335', '#ffffff', 'B'),
  }).addTo(map);
}

function renderSteps(steps) {
  routeSteps.innerHTML = '';
  steps.forEach((step, i) => {
    const div = document.createElement('div');
    div.className = 'route-step';
    const instruction = cleanInstruction(step.maneuver.instruction || 'Continue');
    const stepDist = step.distance >= 1000
      ? `${(step.distance / 1000).toFixed(1)} km`
      : `${Math.round(step.distance)} m`;

    div.innerHTML = `
      <div class="step-icon"><i class="fas ${maneuverIcon(step.maneuver.type)}"></i></div>
      <div class="step-info">
        <div class="step-instruction">${escapeHtml(instruction)}</div>
        <div class="step-distance">${stepDist}</div>
      </div>
    `;
    div.addEventListener('click', () => {
      const [lon, lat] = step.maneuver.location;
      map.setView([lat, lon], 17, { animate: true });
      // Highlight active step
      $$('.route-step').forEach(s => s.classList.remove('active'));
      div.classList.add('active');
    });
    routeSteps.appendChild(div);
  });
}

function maneuverIcon(type) {
  const icons = {
    'turn-left': 'fa-arrow-left',
    'turn-right': 'fa-arrow-right',
    'turn-sharp-left': 'fa-arrow-left',
    'turn-sharp-right': 'fa-arrow-right',
    'turn-slight-left': 'fa-arrow-left',
    'turn-slight-right': 'fa-arrow-right',
    'continue': 'fa-arrow-up',
    'straight': 'fa-arrow-up',
    'arrive': 'fa-flag-checkered',
    'depart': 'fa-flag',
    'roundabout': 'fa-circle-notch',
    'rotary': 'fa-circle-notch',
    'merge': 'fa-code-branch',
    'fork': 'fa-code-branch',
    'off-ramp': 'fa-arrow-down',
    'on-ramp': 'fa-arrow-up',
    'end of road': 'fa-stop',
    'new name': 'fa-arrow-up',
    'notification': 'fa-info',
  };
  return icons[type] || 'fa-arrow-up';
}

function cleanInstruction(instruction) {
  // Remove HTML tags that Nominatim sometimes adds
  return instruction.replace(/<[^>]*>/g, '');
}

// ── Panel Switching ─────────────────────────
function switchPanel(panel) {
  activePanel = panel;
  searchPanel.style.display = panel === 'search' ? '' : 'none';
  directionsPanel.style.display = panel === 'directions' ? '' : 'none';
  placeDetails.style.display = panel === 'place' ? '' : 'none';

  if (panel === 'search') {
    searchResults.classList.remove('active');
    searchPanel.classList.remove('has-results');
  }
}

// ── Helpers ─────────────────────────────────
function createMarkerIcon(bgColor, textColor, letter) {
  const letterHtml = letter ? `<text x="12" y="17" text-anchor="middle" font-size="12" font-weight="bold" fill="${textColor}">${letter}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42">
    <path d="M15 0C6.7 0 0 6.7 0 15c0 11.2 15 27 15 27s15-15.8 15-27C30 6.7 23.3 0 15 0z" fill="${bgColor}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="15" cy="15" r="6" fill="${textColor}" opacity="${letter ? '0' : '1'}"/>
    ${letterHtml}
  </svg>`;
  return L.divIcon({
    className: 'custom-marker',
    html: svg,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -42],
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showLoading(show) {
  loadingOverlay.style.display = show ? 'flex' : 'none';
}

let toastTimeout;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── Keyboard Shortcuts ──────────────────────
document.addEventListener('keydown', (e) => {
  // Ctrl+K or / to focus search
  if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && document.activeElement === document.body)) {
    e.preventDefault();
    searchInput.focus();
    switchPanel('search');
  }
  // Escape to clear/close
  if (e.key === 'Escape') {
    searchInput.blur();
    searchResults.classList.remove('active');
    searchPanel.classList.remove('has-results');
    if (activePanel !== 'search') switchPanel('search');
  }
});

// ── Handle clicks outside ───────────────────
document.addEventListener('click', (e) => {
  if (!searchPanel.contains(e.target)) {
    searchResults.classList.remove('active');
    searchPanel.classList.remove('has-results');
  }
});

// ── Start App ───────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMap();

  // Auto-detect location on load (optional)
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 13, { animate: false });
      },
      () => { /* silent fail */ },
      { timeout: 5000, maximumAge: 300000 }
    );
  }

  // Initial toast
  setTimeout(() => showToast('👋 Search for a place or click the map to explore'), 1000);
});
