@echo off
echo Starting Dashboard server (wallpaper search, calendar, reminders)...
cd /d "%~dp0"
python -m pip install -r requirements.txt
python server.py
pause
