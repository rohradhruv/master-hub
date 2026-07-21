#!/usr/bin/env bash
# Master Hub — server + single shared database
cd "$(dirname "$0")"
python3 server.py 2>/dev/null || python server.py
