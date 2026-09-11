from flask import Flask, jsonify, request
from flask_cors import CORS
import json
import os
import icalendar
from datetime import datetime

app = Flask(__name__)
CORS(app)

# For Windows Calendar (reads .ics files from Outlook)
CALENDAR_PATH = os.path.expanduser('~\\AppData\\Local\\Microsoft\\Outlook')
REMINDERS_FILE = 'reminders.json'

@app.route('/api/calendar/events', methods=['GET'])
def get_calendar_events():
    """Fetch upcoming events from system calendar"""
    events = []
    try:
        if os.path.exists(CALENDAR_PATH):
            for filename in os.listdir(CALENDAR_PATH):
                if filename.endswith('.ics'):
                    with open(os.path.join(CALENDAR_PATH, filename), 'rb') as f:
                        cal = icalendar.Calendar.from_ical(f.read())
                        for component in cal.walk():
                            if component.name == "VEVENT":
                                events.append({
                                    'title': str(component.get('summary')),
                                    'start': str(component.get('dtstart').dt),
                                    'end': str(component.get('dtend').dt),
                                    'description': str(component.get('description', ''))
                                })
    except Exception as e:
        print(f"Error reading calendar: {e}")
    
    return jsonify(events)

@app.route('/api/reminders', methods=['GET'])
def get_reminders():
    """Get saved reminders"""
    if not os.path.exists(REMINDERS_FILE):
        # Return empty list if no backend reminders yet
        return jsonify([])
    with open(REMINDERS_FILE, 'r') as f:
        reminders = json.load(f)
    return jsonify(reminders)

@app.route('/api/reminders/add', methods=['POST'])
def add_reminder():
    """Add a new reminder"""
    data = request.json
    reminders = []
    if os.path.exists(REMINDERS_FILE):
        with open(REMINDERS_FILE, 'r') as f:
            reminders = json.load(f)
            
    reminders.append(data)
    
    with open(REMINDERS_FILE, 'w') as f:
        json.dump(reminders, f)
        
    return jsonify({'success': True})

@app.route('/api/reminders/sync', methods=['POST'])
def sync_reminders():
    """Overwrite all reminders (used when deleting/updating)"""
    data = request.json
    with open(REMINDERS_FILE, 'w') as f:
        json.dump(data, f)
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(port=5000)
