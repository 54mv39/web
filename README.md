# TransmissionAddTracker

> **Update 2026-11-12: now based on the official Transmission 4.0.5 web UI**
>
> - This repo now contains the **official web client of Transmission 4.0.5**, with the
>   **"Add trackers"** feature ported to it. The old classic 2.9x UI (jQuery, Ubuntu 16) is retired;
>   its text is kept below under "Previous version".
> - Tested with a mock RPC server and headless Chromium. Built for **transmission-daemon 4.0.5**
>   (Ubuntu 24.04 package, RPC version 17). It needs a 4.x daemon: the UI is the 4.0.5 client and
>   relies on its RPC API.
> - The repo root is the **built UI**, ready to deploy as-is. The modified source is in `source/`.

## Install

The repo root is what the daemon serves at `/transmission/web/`. It holds `index.html`,
`transmission-app.js`, `transmission-app.css` and `images/`, the same layout as the package's
`/usr/share/transmission/public_html`. The `source/`, `licenses/` and text files at the root
aren't needed at runtime, and leaving them in place does no harm.

**Option A: `TRANSMISSION_WEB_HOME` (recommended; package updates won't overwrite it)**

```sh
sudo git clone https://github.com/54mv39/web.git /opt/transmission-web
sudo systemctl edit transmission-daemon
#   [Service]
#   Environment=TRANSMISSION_WEB_HOME=/opt/transmission-web
sudo systemctl restart transmission-daemon
```

**Option B: replace the packaged UI.** Copy the files at the repo root into
`/usr/share/transmission/public_html/`. The next package upgrade will overwrite them.

The files must be readable by the daemon user (`debian-transmission` on Ubuntu).
Afterwards, force-reload the page in the browser (Ctrl+F5) so it loads the new JS and CSS.

## How to use "Add trackers"

1. Select one or more torrents.
2. Open **Add trackers…** from any of these:
   - the toolbar button (the radio icon next to the inspector button);
   - the torrent's right-click menu;
   - the ☰ menu → Actions.
3. Paste the tracker announce URLs, **one per line**. Accepted schemes are `http`, `https`,
   `udp` and `wss`.
   - Blank lines and duplicate URLs are skipped.
   - Trackers the torrent already has are skipped.
   - If any line is not a valid announce URL, the dialog lists it and sends **nothing**.
4. Click **Add** or press **Ctrl+Enter**. **Esc** cancels.
5. The inspector then opens on the **Tiers** tab so you can see the new trackers.

Each new tracker is added as **its own new tier**, after the torrent's existing tiers. That way
every added tracker is announced to in parallel, the same as the old classic UI (`trackerAdd`).
Trackers that share one tier are only tried as fallbacks for each other.

How it talks to the daemon (RPC version 17 or later):

1. One `torrent-get` with `fields: ["id", "trackerList"]` for the selected torrents.
2. For each torrent that gains at least one URL, one `torrent-set` with the merged `trackerList`.
   In that list, tiers are separated by blank lines.

Daemons older than RPC 17 fall back to `torrent-set` with `trackerAdd`.

## Rebuild from source

`source/` is the `web/` folder of Transmission tag `4.0.5`
(https://github.com/transmission/transmission/tree/4.0.5/web) plus these changes:

- `src/add-trackers-dialog.js` is new: the dialog, validation and RPC logic.
- `src/action-manager.js`, `src/context-menu.js`, `src/overflow-menu.js`, `src/transmission.js`,
  `src/remote.js`, `public_html/index.html` and `assets/css/transmission-app.scss`: the action,
  the menu entries, the toolbar button, the RPC helpers and the styles.
- `src/transmission.js`: keyboard shortcuts no longer fire while you type in a textarea.
- `src/torrent.js`: the tracker filter drop-down now notices trackers that were added or removed.
- `webpack.config.js`: a production build writes `transmission-app.css` as a separate file, the way
  the released bundle does, because `index.html` links to it. Upstream's config inlined the CSS
  into the JS.

```sh
cd source
npm ci
npm run build          # writes public_html/transmission-app.{js,css}
cp public_html/transmission-app.js public_html/transmission-app.css \
   public_html/transmission-app.js.LICENSE.txt public_html/index.html ..
cp -r public_html/images ..
```

Tested with Node 20.17 and npm 10.8. Upstream's `.nvmrc` says Node 16, which works as well.
`npm run lint` checks the code with eslint, stylelint and prettier.

## License

This is Transmission's web client. The upstream copyright headers are kept. Transmission may be
used under GPLv2 or GPLv3 (see `COPYING` and `licenses/`). Some files (`transmission.js`,
`remote.js` and others) are GPL-2.0-only, so the combined bundle is distributed under GPLv2.
`AUTHORS` lists the upstream authors.

---

## Previous version (Transmission 2.9x, Ubuntu 16)

### TransmissionAddTracker (classic UI)

Description:

-This Project adds tracker Functionality to Transmission Torrent Client Remote Web Interface (tested only on  ubuntu 16).

Installation:

-Just download the 'web' folder in the project root.

-Replace the 'web' folder in '/usr/share/transmission/' with the downloaded 'web' folder.

-Give necessary permisions.

How-To:

-Goto 'Transmission Web Interface' with your browser.

-Click on the upper-menu-bar last icon('ADD TRACKER' icon) on transmission-web-interface and a pop-up opens with a big text field to add new trackers.

-Seperate multiple trackers with a new line.

-Click 'ADD' to save the trackers.

-Updated trackers can be seen in the torrent info box.

