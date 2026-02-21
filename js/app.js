/**
 * All India Public Radio – app.js
 *
 * Features:
 *  - Leaflet.js map initialised with CartoDB Dark Matter tiles (bundled vendor/leaflet)
 *  - Map is centred on India and constrained to prevent blank rendering
 *  - Click-to-pin: clicking the map drops a temporary marker and autofills the
 *    station creation form with the clicked coordinates
 *  - Station creation persists entries to localStorage and renders them on the map
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Constants                                                           */
  /* ------------------------------------------------------------------ */

  /** CartoDB Dark Matter tile layer — no API key required */
  var CARTO_DARK_URL =
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

  var CARTO_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
    'contributors &copy; <a href="https://carto.com/">CARTO</a>';

  /** Fallback: OSM standard tiles (used when CartoDB is unavailable) */
  var OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  var OSM_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  /** India geographic centre */
  var INDIA_CENTER = [20.5937, 78.9629];
  var INDIA_ZOOM = 5;

  var STORAGE_KEY = 'radio_india_stations';

  /* ------------------------------------------------------------------ */
  /*  State                                                               */
  /* ------------------------------------------------------------------ */

  var map;
  var pendingMarker = null;   // Temporary pin shown before form submit
  var stationMarkers = {};    // id -> L.marker
  var stations = [];          // Array of station objects

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function generateId() {
    return 'stn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function loadStations() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveStations(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      // localStorage may be unavailable in some environments; ignore silently
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Map initialisation                                                  */
  /* ------------------------------------------------------------------ */

  function initMap() {
    // Create the map – the container div must have explicit dimensions (set in CSS)
    map = L.map('map', {
      center: INDIA_CENTER,
      zoom: INDIA_ZOOM,
      minZoom: 3,
      zoomControl: true
    });

    // Try CartoDB Dark Matter tiles first; fall back to OSM on error
    var tileLayer = L.tileLayer(CARTO_DARK_URL, {
      attribution: CARTO_ATTRIBUTION,
      subdomains: 'abcd',
      maxZoom: 19
    });

    tileLayer.on('tileerror', function () {
      // Only swap once
      tileLayer.off('tileerror');
      tileLayer.remove();
      L.tileLayer(OSM_URL, {
        attribution: OSM_ATTRIBUTION,
        maxZoom: 19
      }).addTo(map);
    });

    tileLayer.addTo(map);

    // Leaflet requires an explicit invalidateSize call after the browser has
    // painted the flex container.  Using two nested requestAnimationFrame calls
    // guarantees we wait for the layout/paint pass that follows DOMContentLoaded,
    // avoiding the "map renders then disappears" issue caused by a zero-height
    // container at init time.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        map.invalidateSize();
      });
    });

    // Click handler for drop-a-pin
    map.on('click', onMapClick);
  }

  /* ------------------------------------------------------------------ */
  /*  Click-to-pin                                                        */
  /* ------------------------------------------------------------------ */

  var PENDING_ICON = L.divIcon({
    className: '',
    html: '<div class="pending-pin"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });

  function onMapClick(e) {
    var lat = parseFloat(e.latlng.lat.toFixed(6));
    var lng = parseFloat(e.latlng.lng.toFixed(6));

    // Remove previous pending marker
    if (pendingMarker) {
      map.removeLayer(pendingMarker);
    }

    // Drop a visual indicator at the clicked location
    pendingMarker = L.marker([lat, lng], { icon: PENDING_ICON, zIndexOffset: 1000 })
      .addTo(map)
      .bindTooltip('New station location', { permanent: false, direction: 'top' });

    // Autofill form
    document.getElementById('station-lat').value = lat;
    document.getElementById('station-lng').value = lng;

    // Enable submit button now that coordinates are set
    updateSubmitState();

    // Hide the hint after first click
    var hint = document.getElementById('map-hint');
    if (hint) hint.classList.add('hidden');
  }

  /* ------------------------------------------------------------------ */
  /*  Form & station management                                           */
  /* ------------------------------------------------------------------ */

  function updateSubmitState() {
    var lat = document.getElementById('station-lat').value;
    var lng = document.getElementById('station-lng').value;
    var name = document.getElementById('station-name').value.trim();
    var url  = document.getElementById('station-url').value.trim();
    document.getElementById('create-btn').disabled = !(lat && lng && name && url);
  }

  function createStationMarker(station) {
    var STATION_ICON = L.divIcon({
      className: '',
      html: '<div class="station-pin"></div>',
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });

    var popupHtml =
      '<span class="popup-name">' + escapeHtml(station.name) + '</span>' +
      '<span class="popup-url">' + escapeHtml(station.url) + '</span>' +
      '<br><small>' + station.lat + ', ' + station.lng + '</small>';

    var marker = L.marker([station.lat, station.lng], { icon: STATION_ICON })
      .addTo(map)
      .bindPopup(popupHtml);

    stationMarkers[station.id] = marker;
    return marker;
  }

  function renderStationsList() {
    var list = document.getElementById('stations-list');
    list.innerHTML = '';

    if (stations.length === 0) {
      list.innerHTML = '<li><span class="empty-msg">No stations yet.<br>Click the map to add one.</span></li>';
      return;
    }

    stations.forEach(function (stn) {
      var li = document.createElement('li');
      li.dataset.id = stn.id;

      var nameEl = document.createElement('span');
      nameEl.className = 'stn-name';
      nameEl.textContent = stn.name;

      var coordEl = document.createElement('span');
      coordEl.className = 'stn-coords';
      coordEl.textContent = stn.lat + ', ' + stn.lng;

      li.appendChild(nameEl);
      li.appendChild(coordEl);

      li.addEventListener('click', function () {
        var marker = stationMarkers[stn.id];
        if (marker) {
          map.setView([stn.lat, stn.lng], 8, { animate: true });
          marker.openPopup();
        }
        // Highlight active
        document.querySelectorAll('#stations-list li').forEach(function (el) {
          el.classList.remove('active');
        });
        li.classList.add('active');
      });

      list.appendChild(li);
    });
  }

  function onFormSubmit(e) {
    e.preventDefault();

    var name = document.getElementById('station-name').value.trim();
    var url  = document.getElementById('station-url').value.trim();
    var lat  = parseFloat(document.getElementById('station-lat').value);
    var lng  = parseFloat(document.getElementById('station-lng').value);

    if (!name || !url || isNaN(lat) || isNaN(lng)) return;

    var station = {
      id: generateId(),
      name: name,
      url: url,
      lat: lat,
      lng: lng
    };

    stations.push(station);
    saveStations(stations);

    // Replace the pending marker with a permanent station marker
    if (pendingMarker) {
      map.removeLayer(pendingMarker);
      pendingMarker = null;
    }

    createStationMarker(station);
    renderStationsList();

    // Reset form
    document.getElementById('station-form').reset();
    document.getElementById('create-btn').disabled = true;

    // Show the hint again
    var hint = document.getElementById('map-hint');
    if (hint) hint.classList.remove('hidden');
  }

  /* ------------------------------------------------------------------ */
  /*  Security helper                                                     */
  /* ------------------------------------------------------------------ */

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ------------------------------------------------------------------ */
  /*  Bootstrap                                                           */
  /* ------------------------------------------------------------------ */

  document.addEventListener('DOMContentLoaded', function () {
    initMap();

    // Load persisted stations
    stations = loadStations();
    stations.forEach(createStationMarker);
    renderStationsList();

    // Wire up form events
    var form = document.getElementById('station-form');
    form.addEventListener('submit', onFormSubmit);

    ['station-name', 'station-url'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', updateSubmitState);
    });
  });

}());
