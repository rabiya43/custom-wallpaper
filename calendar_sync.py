from flask import Flask, jsonify, request, Response
from flask_cors import CORS
import json
import os
import icalendar
import urllib.request
import urllib.parse
import re
import requests
from bs4 import BeautifulSoup

app = Flask(__name__)
CORS(app)

CALENDAR_PATH = os.path.expanduser('~\\AppData\\Local\\Microsoft\\Outlook')
REMINDERS_FILE = 'reminders.json'
CACHE_FILE = 'theme_cache.json'

if os.path.exists(CACHE_FILE):
    try:
        os.remove(CACHE_FILE)
    except:
        pass

THEME_CACHE = {}

# Reliable Direct Character Art URLs
DEFAULT_CHARACTER_IMAGES = {
    'buttercup': 'https://upload.wikimedia.org/wikipedia/en/thumb/d/db/Buttercup_%28Powerpuff_Girls%29.png/300px-Buttercup_%28Powerpuff_Girls%29.png',
    'blossom': 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8c/Blossom_%28Powerpuff_Girls%29.png/300px-Blossom_%28Powerpuff_Girls%29.png',
    'bubbles': 'https://upload.wikimedia.org/wikipedia/en/thumb/2/23/Bubbles_%28Powerpuff_Girls%29.png/300px-Bubbles_%28Powerpuff_Girls%29.png',
    'cherry': 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8c/Blossom_%28Powerpuff_Girls%29.png/300px-Blossom_%28Powerpuff_Girls%29.png'
}

CHARACTER_PALETTES = {
    'snow white': {'bg1': '#2B3A67', 'bg2': '#E6AF2E', 'widgetBg': 'rgba(43, 58, 103, 0.65)', 'accent': '#FFD166', 'glow': '#E03616', 'text': '#FFF'},
    'snowwhite': {'bg1': '#2B3A67', 'bg2': '#E6AF2E', 'widgetBg': 'rgba(43, 58, 103, 0.65)', 'accent': '#FFD166', 'glow': '#E03616', 'text': '#FFF'},
    'buttercup': {'bg1': '#2D5A46', 'bg2': '#509F8C', 'widgetBg': 'rgba(0, 0, 0, 0.25)', 'accent': '#A5C271', 'glow': '#E2F3B9', 'text': '#FFF'},
    'blossom': {'bg1': '#D87093', 'bg2': '#FF7F50', 'widgetBg': 'rgba(216, 112, 147, 0.65)', 'accent': '#FFB6C1', 'glow': '#FFE4E1', 'text': '#FFF'},
    'bubbles': {'bg1': '#4682B4', 'bg2': '#FFD700', 'widgetBg': 'rgba(70, 130, 180, 0.65)', 'accent': '#87CEEB', 'glow': '#E0FFFF', 'text': '#FFF'},
    'cherry': {'bg1': '#6B2035', 'bg2': '#A020F0', 'widgetBg': 'rgba(107, 32, 53, 0.65)', 'accent': '#D45D7F', 'glow': '#FF8DA1', 'text': '#FFF'},
    'pikachu': {'bg1': '#E6AF2E', 'bg2': '#D62828', 'widgetBg': 'rgba(230, 175, 46, 0.65)', 'accent': '#FFE169', 'glow': '#FFD166', 'text': '#FFF'},
    'cinderella': {'bg1': '#7098DA', 'bg2': '#E5ECF4', 'widgetBg': 'rgba(112, 152, 218, 0.65)', 'accent': '#A3C4F3', 'glow': '#E0FFFF', 'text': '#FFF'},
    'barbie': {'bg1': '#E05697', 'bg2': '#9B4F96', 'widgetBg': 'rgba(224, 86, 151, 0.65)', 'accent': '#FF85A1', 'glow': '#FFC2D1', 'text': '#FFF'},
    'batman': {'bg1': '#1A1A24', 'bg2': '#4A4E69', 'widgetBg': 'rgba(26, 26, 36, 0.75)', 'accent': '#F4D03F', 'glow': '#F9E79F', 'text': '#FFF'},
}

@app.route('/api/proxy-image', methods=['GET'])
def proxy_image():
    """Proxies external image requests with a custom User-Agent to bypass 403 hotlink blocks"""
    img_url = request.args.get('url')
    if not img_url:
        return "No URL provided", 400
    try:
        req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            content_type = resp.headers.get('Content-Type', 'image/png')
            data = resp.read()
            return Response(data, mimetype=content_type)
    except Exception as e:
        return str(e), 500

def fetch_image_from_query(user_query):
    """Searches DuckDuckGo / Google / Wikipedia using the exact user-typed keyword"""
    # 1. Try DuckDuckGo image search
    try:
        search_term = urllib.parse.quote(f"{user_query} png transparent character")
        url = f"https://html.duckduckgo.com/html/?q={search_term}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            soup = BeautifulSoup(resp.read().decode('utf-8', errors='ignore'), 'html.parser')
            for a in soup.find_all('a', href=True):
                if 'duckduckgo.com/l/?uddg=' in a['href']:
                    raw_url = a['href'].split('uddg=')[1].split('&')[0]
                    decoded_url = urllib.parse.unquote(raw_url)
                    if decoded_url.endswith('.png') or decoded_url.endswith('.jpg') or 'upload.wikimedia.org' in decoded_url:
                        return f"http://localhost:5000/api/proxy-image?url={urllib.parse.quote(decoded_url)}"
    except Exception as e:
        pass

    # 2. Try Wikipedia API
    try:
        wiki_url = f"https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages|extracts&titles={urllib.parse.quote(user_query)}&pithumbsize=600&redirects=1&exintro=1"
        req = urllib.request.Request(wiki_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=2.0) as response:
            data = json.loads(response.read().decode())
            pages = data.get('query', {}).get('pages', {})
            for pid, page in pages.items():
                if pid != '-1' and page.get('thumbnail', {}).get('source'):
                    raw_img = page['thumbnail']['source']
                    return f"http://localhost:5000/api/proxy-image?url={urllib.parse.quote(raw_img)}"
    except Exception as e:
        pass

    return None

def generate_multi_color_palette(name):
    name_lower = name.lower()
    for key, palette in CHARACTER_PALETTES.items():
        if key in name_lower:
            return palette
            
    h1 = sum(ord(c) for c in name) % 360
    h2 = (h1 + 45) % 360
    
    return {
        'bg1': f'hsl({h1}, 45%, 40%)',
        'bg2': f'hsl({h2}, 55%, 30%)',
        'widgetBg': f'hsla({h1}, 45%, 20%, 0.6)',
        'accent': f'hsl({(h1 + 25) % 360}, 85%, 75%)',
        'glow': f'hsl({(h1 + 15) % 360}, 90%, 80%)',
        'text': '#FFFFFF'
    }

@app.route('/api/theme', methods=['GET'])
def get_theme():
    user_query = request.args.get('name', 'Buttercup Powerpuff Girls').strip()
    query_lower = user_query.lower()
    
    # Pre-mapped direct images for core names
    image_url = None
    for key, direct_url in DEFAULT_CHARACTER_IMAGES.items():
        if key in query_lower:
            image_url = f"http://localhost:5000/api/proxy-image?url={urllib.parse.quote(direct_url)}"
            break

    if not image_url:
        image_url = fetch_image_from_query(user_query)

    palette = generate_multi_color_palette(user_query)
    
    return jsonify({
        'colors': palette,
        'image': image_url
    })

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
