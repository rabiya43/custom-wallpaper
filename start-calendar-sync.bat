@echo off
echo Starting Dashboard Local API Sync...
cd %~dp0
python -m pip install flask flask-cors icalendar pytz requests beautifulsoup4
python calendar_sync.py
pause
