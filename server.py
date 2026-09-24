"""Local server for the dashboard. Run it, then open http://localhost:5000

- /               the dashboard itself
- /api/search     finds wallpaper images for a character, movie or topic
- /api/image      fetches a chosen image so the browser can save it
- /api/calendar   serves events from .ics files (optional)
- /api/reminders  mirrors reminders to reminders.json (optional)

The clock, weather, alarm and reminders also work when index.html is opened
directly; the server is needed for wallpaper search.

Set ICS_DIR to a folder containing .ics files (exported from Outlook, Google
Calendar, etc.). It defaults to a "calendars" folder next to this script.
"""
import ipaddress
import json
import os
import socket
from urllib.parse import urljoin, urlparse

import icalendar
import requests
from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS

import image_search

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ICS_DIR = os.environ.get('ICS_DIR', os.path.join(BASE_DIR, 'calendars'))
REMINDERS_FILE = os.path.join(BASE_DIR, 'reminders.json')

# The dashboard is opened as a local file or from a local dev server
ALLOWED_ORIGINS = ['null', 'http://localhost:5000', 'http://127.0.0.1:5000',
                   'http://localhost:8000', 'http://127.0.0.1:8000',
                   'http://localhost:5500', 'http://127.0.0.1:5500']

app = Flask(__name__)
CORS(app, origins=ALLOWED_ORIGINS)


def read_reminders():
    if not os.path.exists(REMINDERS_FILE):
        return []
    try:
        with open(REMINDERS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


@app.route('/')
def index():
    return send_from_directory(BASE_DIR, 'index.html')


@app.route('/<path:name>')
def static_files(name):
    if name in ('script.js', 'style.css'):
        return send_from_directory(BASE_DIR, name)
    return jsonify({'error': 'Not found'}), 404


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'ok': True})


@app.route('/api/search', methods=['GET'])
def search_images():
    query = request.args.get('q', '').strip()
    if len(query) < 2:
        return jsonify({'error': 'Type at least 2 characters'}), 400
    return jsonify(image_search.search(query))


MAX_IMAGE_BYTES = 25 * 1024 * 1024


def is_public_url(url):
    """Only fetch http(s) URLs that resolve to public addresses (no localhost / LAN)."""
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname:
        return False
    try:
        for info in socket.getaddrinfo(parsed.hostname, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
    except (socket.gaierror, ValueError):
        return False
    return True


@app.route('/api/image', methods=['GET'])
def proxy_image():
    """Fetch an image the browser can't read directly (missing CORS headers) and pass it through."""
    url = request.args.get('url', '')
    try:
        for _ in range(4):  # follow a few redirects, re-checking every hop
            if not is_public_url(url):
                return jsonify({'error': 'URL not allowed'}), 400
            resp = requests.get(url, headers={'User-Agent': image_search.USER_AGENT}, stream=True,
                                timeout=10, allow_redirects=False)
            if resp.is_redirect:
                url = urljoin(url, resp.headers.get('Location', ''))
                continue
            break
        else:
            return jsonify({'error': 'Too many redirects'}), 502
        resp.raise_for_status()
        content_type = resp.headers.get('Content-Type', '').split(';')[0].strip()
        if content_type not in image_search.ALLOWED_MIME:
            return jsonify({'error': 'Not a supported image'}), 415
        data = b''
        for chunk in resp.iter_content(64 * 1024):
            data += chunk
            if len(data) > MAX_IMAGE_BYTES:
                return jsonify({'error': 'Image too large'}), 413
        return Response(data, mimetype=content_type, headers={'Cache-Control': 'max-age=3600'})
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 502


@app.route('/api/calendar/events', methods=['GET'])
def get_calendar_events():
    events = []
    if not os.path.isdir(ICS_DIR):
        return jsonify(events)
    for filename in os.listdir(ICS_DIR):
        if not filename.lower().endswith('.ics'):
            continue
        try:
            with open(os.path.join(ICS_DIR, filename), 'rb') as f:
                cal = icalendar.Calendar.from_ical(f.read())
            for component in cal.walk('VEVENT'):
                start = component.get('dtstart')
                end = component.get('dtend')
                events.append({
                    'title': str(component.get('summary', 'Event')),
                    'start': start.dt.isoformat() if start else '',
                    'end': end.dt.isoformat() if end else '',
                })
        except Exception as e:
            print(f'Skipping {filename}: {e}')
    return jsonify(events)


@app.route('/api/reminders', methods=['GET'])
def get_reminders():
    return jsonify(read_reminders())


@app.route('/api/reminders/sync', methods=['POST'])
def sync_reminders():
    data = request.get_json(silent=True)
    if not isinstance(data, list):
        return jsonify({'success': False, 'error': 'Expected a list'}), 400
    with open(REMINDERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    return jsonify({'success': True})


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000)
