#!/bin/bash
cd /Users/xiaoyaguang/Documents/code/python/home_sticker_design

# Kill any existing
pkill -f "python start.py" 2>/dev/null
pkill -f "python main.py" 2>/dev/null
sleep 2

# Start server
nohup python start.py > /tmp/sticker_server.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID" > /tmp/sticker_launch.txt

# Wait for startup
sleep 10

# Check if running
echo "Port check:" >> /tmp/sticker_launch.txt
lsof -i :8080 >> /tmp/sticker_launch.txt 2>&1

# Run test
python test_api.py >> /tmp/sticker_launch.txt 2>&1

echo "=== COMPLETE ===" >> /tmp/sticker_launch.txt

