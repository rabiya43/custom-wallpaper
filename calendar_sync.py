from flask import Flask, jsonify, request
from flask_cors import CORS
import json
import os
import icalendar
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
import requests
from bs4 import BeautifulSoup

app = Flask(__name__)
CORS(app)

# For Windows Calendar (reads .ics files from Outlook)
CALENDAR_PATH = os.path.expanduser('~\\AppData\\Local\\Microsoft\\Outlook')
REMINDERS_FILE = 'reminders.json'
CACHE_FILE = 'theme_cache.json'

# Load or initialize theme cache
THEME_CACHE = {}
if os.path.exists(CACHE_FILE):
    try:
        with open(CACHE_FILE, 'r') as f:
            THEME_CACHE = json.load(f)
    except:
        THEME_CACHE = {}

def save_cache():
    try:
        with open(CACHE_FILE, 'w') as f:
            json.dump(THEME_CACHE, f)
    except:
        pass

# Hardcoded precise palettes for known characters
PALETTES = {
    'cherry': {'bg': '#6b2035', 'widgetBg': 'rgba(107, 32, 53, 0.6)', 'accent': '#d45d7f', 'glow': '#ff8da1', 'text': '#FFF', 'font': 'Chewy'},
    'buttercup': {'bg': '#509F8C', 'widgetBg': 'rgba(0, 0, 0, 0.18)', 'accent': '#A5C271', 'glow': '#E2F3B9', 'text': '#FFF', 'font': 'Chewy'},
    'blossom': {'bg': '#d87093', 'widgetBg': 'rgba(216, 112, 147, 0.6)', 'accent': '#ffb6c1', 'glow': '#ffe4e1', 'text': '#FFF', 'font': 'Chewy'},
    'bubbles': {'bg': '#4682b4', 'widgetBg': 'rgba(70, 130, 180, 0.6)', 'accent': '#87ceeb', 'glow': '#e0ffff', 'text': '#FFF', 'font': 'Chewy'}
}

def fetch_wiki_data(name):
    """Fast fetch for Wikipedia summary & thumbnail"""
    try:
        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(name.replace(' ', '_'))}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=1.5) as response:
            data = json.loads(response.read().decode())
            summary = data.get('extract', '').lower()
            img = data.get('thumbnail', {}).get('source') or data.get('originalimage', {}).get('source')
            return summary, img
    except Exception as e:
        return "", None

def fetch_google_image(name):
    """Fast Google image fallback search"""
    try:
        url = f"https://www.google.com/search?q=cute+{urllib.parse.quote(name)}+character+png&tbm=isch"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        res = requests.get(url, headers=headers, timeout=1.5)
        soup = BeautifulSoup(res.text, 'html.parser')
        for img in soup.find_all('img'):
            src = img.get('src')
            if src and src.startswith('http') and 'gstatic' in src:
                return src
    except:
        pass
    return None

def analyze_vibe(name, summary):
    name_lower = name.lower()
    for key, palette in PALETTES.items():
        if key in name_lower:
            return palette
            
    if any(w in summary for w in ['dark', 'evil', 'shadow', 'villain', 'demon', 'death', 'goth']):
        return {'bg': '#2b212e', 'widgetBg': 'rgba(43, 33, 46, 0.6)', 'accent': '#9b59b6', 'glow': '#8e44ad', 'text': '#FFF', 'font': 'Chewy'}
    if any(w in summary for w in ['fire', 'flame', 'anger', 'red', 'hot', 'blood', 'lava']):
        return {'bg': '#800000', 'widgetBg': 'rgba(128, 0, 0, 0.6)', 'accent': '#FF4500', 'glow': '#FF6347', 'text': '#FFF', 'font': 'Chewy'}
    if any(w in summary for w in ['cute', 'pink', 'sweet', 'love', 'fairy', 'princess']):
        return {'bg': '#d87093', 'widgetBg': 'rgba(216, 112, 147, 0.6)', 'accent': '#ffb6c1', 'glow': '#ffe4e1', 'text': '#FFF', 'font': 'Chewy'}
    if any(w in summary for w in ['water', 'ice', 'cold', 'blue', 'ocean', 'sky']):
        return {'bg': '#4682b4', 'widgetBg': 'rgba(70, 130, 180, 0.6)', 'accent': '#87ceeb', 'glow': '#e0ffff', 'text': '#FFF', 'font': 'Chewy'}
    if any(w in summary for w in ['nature', 'earth', 'plant', 'green', 'forest']):
        return {'bg': '#6C8E4E', 'widgetBg': 'rgba(70, 95, 45, 0.6)', 'accent': '#A5C271', 'glow': '#E2F3B9', 'text': '#FFF', 'font': 'Chewy'}
    if any(w in summary for w in ['sun', 'light', 'gold', 'yellow', 'star', 'electric']):
        return {'bg': '#b8860b', 'widgetBg': 'rgba(184, 134, 11, 0.6)', 'accent': '#ffd700', 'glow': '#ffffe0', 'text': '#FFF', 'font': 'Chewy'}
    
    # Fallback deterministic hash
    h = sum(ord(c) for c in name) % 360
    return {
        'bg': f'hsl({h}, 35%, 45%)',
        'widgetBg': f'hsla({h}, 50%, 20%, 0.5)',
        'accent': f'hsl({(h + 30) % 360}, 80%, 75%)',
        'glow': f'hsl({(h + 15) % 360}, 90%, 70%)',
        'text': '#F9FDF0',
        'font': 'Chewy'
    }

@app.route('/api/theme', methods=['GET'])
def get_theme():
    """Ultra-fast cached theme & image endpoint"""
    name = request.args.get('name', 'Buttercup').strip()
    cache_key = name.lower()
    
    # Return immediately if cached!
    if cache_key in THEME_CACHE:
        return jsonify(THEME_CACHE[cache_key])

    # Parallel execution for speed
    with ThreadPoolExecutor(max_workers=2) as executor:
        wiki_future = executor.submit(fetch_wiki_data, name)
        google_future = executor.submit(fetch_google_image, name)
        
        summary, wiki_img = wiki_future.result()
        google_img = google_future.result()
    
    # Prefer Wikipedia high quality image, fallback to Google image
    final_img = wiki_img or google_img
    palette = analyze_vibe(name, summary)
    
    result = {
        'colors': palette,
        'image': final_img
    }
    
    # Save to local cache
    THEME_CACHE[cache_key] = result
    save_cache()
    
    return jsonify(result)

@app.route('/api/calendar/events', methods=['GET'])
def get_calendar_events():
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
    if not os.path.exists(REMINDERS_FILE):
        return jsonify([])
    with open(REMINDERS_FILE, 'r') as f:
        reminders = json.load(f)
    return jsonify(reminders)

@app.route('/api/reminders/add', methods=['POST'])
def add_reminder():
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
    data = request.json
    with open(REMINDERS_FILE, 'w') as f:
        json.dump(data, f)
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(port=5000)
