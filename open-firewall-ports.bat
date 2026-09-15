@echo off
echo ============================================
echo  iTantra - Open Firewall Ports 3001 and 5173
echo ============================================
echo.
echo This script must be run as Administrator.
echo Right-click this file and choose "Run as administrator".
echo.

:: Check for admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Please right-click this file and select "Run as administrator".
    pause
    exit /b 1
)

echo Adding firewall rule for Backend (port 3001)...
netsh advfirewall firewall add rule name="iTantra Backend 3001" dir=in action=allow protocol=TCP localport=3001
echo.
echo Adding firewall rule for Frontend (port 5173)...
netsh advfirewall firewall add rule name="iTantra Frontend 5173" dir=in action=allow protocol=TCP localport=5173
echo.
echo Done! Both ports are now open.
echo Device B can now reach:
echo   Frontend : http://10.203.71.75:5173/room
echo   Backend  : http://10.203.71.75:3001/api/health
echo.
pause
