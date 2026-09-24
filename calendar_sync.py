"""Optional local helper for the dashboard.

Serves calendar events (from .ics files) and mirrors reminders to disk.
The dashboard works without it; it just adds event dots on the calendar and
keeps reminders in reminders.json.

Set ICS_DIR to a folder containing .ics files (exported from Outlook, Google
Calendar, etc.). It defaults to a "calendars" folder next to this script.
"""
import json
import os

import icalendar
from flask import Flask, jsonify, request
from flask_cors import CORS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ICS_DIR = os.environ.get('ICS_DIR', os.path.join(BASE_DIR, 'calendars'))
REMINDERS_FILE = os.path.join(BASE_DIR, 'reminders.json')

# The dashboard is opened as a local file or from a local dev server
ALLOWED_ORIGINS = ['null', 'http://localhost:8000', 'http://127.0.0.1:8000',
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
