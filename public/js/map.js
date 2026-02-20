/* map.js — Leaflet map setup and station pin rendering */

let map;
let stationMarkers = {}; // id -> marker
let pickingCoords = false;
let onCoordsPickedCallback = null;

function initMap() {
    map = L.map('map', {
        center: [20.5937, 78.9629],
        zoom: 5,
        minZoom: 4,
        maxZoom: 12,
        zoomControl: true,
        attributionControl: true
    });

    // CartoDB Dark Matter no labels
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    // Soft bounds to India region
    const indiaBounds = L.latLngBounds(
        L.latLng(6.0, 66.0),
        L.latLng(37.5, 97.5)
    );
    map.setMaxBounds(indiaBounds.pad(0.3));

    // Click handler
    map.on('click', (e) => {
        if (pickingCoords && onCoordsPickedCallback) {
            onCoordsPickedCallback(e.latlng.lat, e.latlng.lng);
            stopPickingCoords();
        } else {
            closeStationPopup();
        }
    });
}

function renderStations(stations) {
    // Remove old markers
    Object.values(stationMarkers).forEach(m => map.removeLayer(m));
    stationMarkers = {};

    stations.forEach(station => addOrUpdatePin(station));
}

function addOrUpdatePin(station) {
    if (stationMarkers[station.id]) {
        map.removeLayer(stationMarkers[station.id]);
    }

    const isLive = !!station.is_live;
    const el = document.createElement('div');
    el.className = 'station-pin';
    const dot = document.createElement('div');
    dot.className = isLive ? 'station-pin-live' : 'station-pin-offline';
    el.appendChild(dot);

    const icon = L.divIcon({
        html: el.outerHTML,
        className: '',
        iconSize: [50, 50],
        iconAnchor: [25, 25]
    });

    const marker = L.marker([station.latitude, station.longitude], { icon, title: station.name })
        .addTo(map);

    marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        showStationPopup(station, marker);
    });

    stationMarkers[station.id] = marker;
}

function removePin(stationId) {
    if (stationMarkers[stationId]) {
        map.removeLayer(stationMarkers[stationId]);
        delete stationMarkers[stationId];
    }
}

function startPickingCoords(callback) {
    pickingCoords = true;
    onCoordsPickedCallback = callback;
    document.getElementById('map').classList.add('picking-coords');
}

function stopPickingCoords() {
    pickingCoords = false;
    onCoordsPickedCallback = null;
    document.getElementById('map').classList.remove('picking-coords');
}
