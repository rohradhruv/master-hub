# ⬢ Master Hub — Your Personal Command Center

One app for everything a BTech student needs to keep at their fingertips:

| Section | What it does |
|---|---|
| 🏠 **Dashboard** | Live stats, quick-launch buttons, upcoming deadlines, today's focus, course momentum |
| 🔗 **Quick Links** | Every saved link becomes a one-click button; organise into your own sections |
| 📚 **Resources & PDFs** | Upload actual PDF files (stored inside the app) or save links; classify into categories you define |
| 💼 **Internships** | Track every target company: role, status pipeline, full recruitment process, expected dates (with countdown), CTC, notes, careers-page button |
| ▶️ **YouTube Vault** | Paste any YouTube URL — thumbnail auto-appears, one click plays it; tag your videos |
| 📋 **Clipboard** | Instant-copy board: save links/emails/IDs you paste all the time — one click copies, pin favourites, "paste from clipboard" button grabs what you just copied |
| 📸 **Instagram** | Save reels/posts/profiles into collections (Coding, Motivation…) with your own sub-topics inside each collection |
| 📝 **Notes** | Colourful sticky notes — instant capture for formulas, one-liners, thoughts |
| 🧮 **Toolkit** | CGPA calculator (SGPA + credits per sem) and an attendance/bunk planner that tells you exactly how many classes you can skip |
| ⏱️ **Focus** | Pomodoro timer (25/50 min + breaks) with an animated progress ring, floating mini-timer while you browse other sections, session/hours/day-streak stats, and confetti when you finish 🎉 |
| 🤖 **AI Arsenal** | Directory of every AI tool you use, categorised & launchable |
| 🎓 **Courses** | Progress bars with a slider — track current courses and index the ones queued next |
| 🏛️ **Academics** | Semester-wise, subject-wise resources (playlists, PYQs, lab manuals) |
| ✅ **Tasks** | Priorities, due dates with smart countdowns, tags |
| 🗺️ **Planner** | Big goals broken into checkable steps with progress bars |
| ✨ **Assistant** | Built-in assistant that knows your whole hub: "what's due this week?", "summary", "add task …", "find os notes". Optionally connect an Anthropic API key (🔑 button) for full conversational Claude AI |

Extras:
- **Ctrl+K command palette** — jump anywhere, add anything, or search your whole hub from the keyboard
- **⚡ Save to Hub from anywhere** — sidebar ⚡ button gives you a drag-to-bookmarks-bar button for your computer; on Android the installed app appears in Instagram/YouTube's Share menu; plus a "paste link from clipboard" quick-saver that auto-detects Instagram/YouTube links
- Global search over everything (`/` to focus), backup/restore to a JSON file, works fully offline
- **Light☀️/dark🌙 theme toggle** (cool blue glass UI), animated cursor ring + card spotlight that follows your mouse, staggered entrance animations, confetti when you complete all tasks

## ▶ Launch it (one-time setup)

1. Double-click **`Setup - create shortcuts.bat`** → creates a **Master Hub** icon on your Desktop + Start Menu, and (optional) auto-start whenever the PC turns on.
2. From then on: click **Master Hub** on your desktop like any other app. It starts the server silently and opens the app.
3. For a real app window: open http://localhost:8787 in Edge/Chrome → address-bar **"Install Master Hub"** → it gets its own window, taskbar icon, Alt-Tab entry.

(Or from a terminal: `bash start.sh` / `python server.py`.)

## 🗄️ Single shared database

All your data lives in **one database on this PC**: `master-hub/data/state.json` (+ uploaded PDFs in `data/files/`). Every device that opens the app reads and writes that same database:

- Add a company on your phone → it's on the PC within seconds (green ● in the top bar = synced).
- Wi-Fi drops? Keep working — each device keeps a local offline copy and re-syncs automatically when it reconnects.
- Uploaded PDFs are stored on the server too, so a PDF uploaded from the laptop opens on the phone.
- Bonus: the `data/` folder sits inside OneDrive, so your database is also backed up to the cloud automatically.

## 📱 On your Android phone (like a normal app)

1. Make sure the hub is running on the PC (desktop icon / auto-start), and run `FIX - allow phone connection.bat` once.
2. Tap the **📱 button** in the app's top bar on the PC — it shows the QR **and the one-time Chrome setting** that makes Android treat your PC as a trusted app source:
   - On the phone open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, put your hub address (e.g. `http://192.168.0.100:8787`) in the box, set **Enabled**, relaunch Chrome.
3. Open the hub address → Chrome menu ⋮ → **Add to Home screen → Install** → real standalone app: own icon, full screen, **no Chrome bar**, appears in Share menus, works offline.
4. Same database, same everything, on every device.

## 🔐 Privacy

Everything lives on your PC. Nothing is sent anywhere — except if you connect a Claude API key in the Assistant, in which case your chat + a summary of your hub data goes to Anthropic's API only.
