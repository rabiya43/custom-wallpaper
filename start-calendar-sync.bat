@echo off
echo Starting Dashboard Local API Sync...
cd %~dp0
python -m pip install flask flask-cors icalendar pytz
python calendar_sync.py
pause
