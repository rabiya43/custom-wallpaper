@echo off
echo Starting Dashboard Local API Sync...
cd /d "%~dp0"
python -m pip install -r requirements.txt
python calendar_sync.py
pause
