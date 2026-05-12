#!/bin/bash
cd /Users/xiaoyaguang/Documents/code/python/home_sticker_design
python test_api.py > /tmp/test_api_output.txt 2>&1
echo "EXIT=$?" >> /tmp/test_api_output.txt

