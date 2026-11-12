/* @license This file Copyright © 2026 54mv39.
   Based on the dialogs of the Transmission web client, Copyright © 2020-2023 Mnemosyne LLC.
   It may be used under GPLv2 (SPDX: GPL-2.0-only), GPLv3 (SPDX: GPL-3.0-only),
   or any future license endorsed by Mnemosyne LLC.
   License text can be found in the licenses/ folder. */

import { createDialogContainer } from './utils.js';

// RPC version that introduced the `trackerList` torrent field (Transmission 4.0)
const TRACKER_LIST_RPC_VERSION = 17;

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'udp:', 'wss:']);

export function isValidAnnounceUrl(text) {
  if (/\s/.test(text)) {
    return false;
  }
  let url = null;
  try {
    url = new URL(text);
  } catch {
    return false;
  }
  return ALLOWED_PROTOCOLS.has(url.protocol) && url.hostname.length > 0;
}

// Parse the textarea contents.
// Returns { urls, invalid } where `urls` holds the unique, trimmed
// announce URLs in input order and `invalid` lists the rejected lines.
export function parseTrackerLines(text) {
  const urls = [];
  const invalid = [];
  const seen = new Set();

  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (line.length === 0) {
      continue;
    }
    if (!isValidAnnounceUrl(line)) {
      invalid.push({ line, number: index + 1 });
      continue;
    }
    if (!seen.has(line)) {
      seen.add(line);
      urls.push(line);
    }
  }

  return { invalid, urls };
}

// Split a `trackerList` string into its announce URLs.
function listUrls(tracker_list) {
  return (tracker_list || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// Append each new URL as its own new tier (tiers are separated by a blank line).
export function appendTiers(tracker_list, urls) {
  const existing = new Set(listUrls(tracker_list));
  const added = urls.filter((url) => !existing.has(url));
  const base = (tracker_list || '').trim();
  const parts = base.length > 0 ? [base, ...added] : added;
  return { added, list: parts.join('\n\n') };
}

export class AddTrackersDialog extends EventTarget {
  constructor(controller, remote) {
    super();

    this.controller = controller;
    this.remote = remote;
    this.elements = {};
    this.torrents = [];
    this.busy = false;
    this.closed = false;

    this.show();
  }

  show() {
    const torrents = this.controller.getSelectedTorrents();
    if (torrents.length === 0) {
      console.error('At least one selected torrent expected.');
      return;
    }

    this.torrents = torrents;
    this.elements = AddTrackersDialog._create(torrents);
    this.elements.dismiss.addEventListener('click', () => this._onDismiss());
    this.elements.confirm.addEventListener('click', () => this._onConfirm());
    this.elements.entry.addEventListener('keydown', (event_) => {
      // Enter adds a new line; Ctrl+Enter (or Cmd+Enter) submits
      if (event_.key === 'Enter' && (event_.ctrlKey || event_.metaKey)) {
        event_.preventDefault();
        this._onConfirm();
      }
    });
    this.elements.entry.addEventListener('input', () => this._setError(null));
    document.body.append(this.elements.root);

    this.elements.entry.focus();
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.elements.root.remove();
    this.dispatchEvent(new Event('close'));

    delete this.controller;
    delete this.remote;
    delete this.elements;
    delete this.torrents;
  }

  _onDismiss() {
    this.close();
  }

  _setError(message) {
    const { entry, error } = this.elements;
    if (message) {
      error.textContent = message;
      error.classList.remove('hidden');
      entry.setAttribute('aria-invalid', 'true');
    } else {
      error.textContent = '';
      error.classList.add('hidden');
      entry.removeAttribute('aria-invalid');
    }
  }

  _setBusy(busy) {
    this.busy = busy;
    const { confirm, entry } = this.elements;
    confirm.disabled = busy;
    entry.readOnly = busy;
    confirm.textContent = busy ? 'Adding…' : 'Add';
  }

  _request(function_, ...arguments_) {
    return new Promise((resolve) => {
      function_.call(this.remote, ...arguments_, (response) =>
        resolve(response)
      );
    });
  }

  async _onConfirm() {
    if (this.busy || this.closed) {
      return;
    }

    const { invalid, urls } = parseTrackerLines(this.elements.entry.value);
    if (invalid.length > 0) {
      const lines = invalid
        .slice(0, 5)
        .map(({ line, number }) => `line ${number}: ${line}`);
      if (invalid.length > 5) {
        lines.push(`…and ${invalid.length - 5} more`);
      }
      this._setError(
        `Not a valid http, https, udp or wss announce URL — nothing was sent.\n${lines.join(
          '\n'
        )}`
      );
      this.elements.entry.focus();
      return;
    }
    if (urls.length === 0) {
      this._setError('Enter at least one tracker announce URL.');
      this.elements.entry.focus();
      return;
    }

    this._setBusy(true);
    const ids = this.torrents.map((t) => t.getId());

    let result = null;
    try {
      result = await this._addTrackers(ids, urls);
    } catch (error) {
      result = { error: error.message || String(error) };
    }

    if (this.closed) {
      return;
    }
    this._setBusy(false);

    if (result.error) {
      this._setError(`The daemon reported an error: ${result.error}`);
      return;
    }
    if (result.added === 0) {
      this._setError(
        'All of these trackers are already present on the selected torrents.'
      );
      return;
    }

    const event_ = new Event('trackers-added');
    event_.ids = ids;
    this.dispatchEvent(event_);
    this.close();
  }

  async _addTrackers(ids, urls) {
    const session = this.controller.session_properties || {};
    const rpc_version = session['rpc-version'] || 0;

    if (rpc_version >= TRACKER_LIST_RPC_VERSION) {
      const response = await this._request(this.remote.getTrackerLists, ids, [
        'id',
        'trackerList',
      ]);
      if (response.result !== 'success') {
        return { error: response.result };
      }
      const { torrents } = response.arguments;
      if (torrents.every((t) => typeof t.trackerList === 'string')) {
        return this._setTrackerLists(torrents, urls);
      }
    }

    // Older daemons (RPC < 17): `trackerAdd` adds each URL as a new tier
    const response = await this._request(this.remote.addTrackers, ids, urls);
    if (response.result !== 'success') {
      return { error: response.result };
    }
    return { added: urls.length };
  }

  async _setTrackerLists(torrents, urls) {
    let added = 0;
    const requests = [];
    for (const tor of torrents) {
      const { added: new_urls, list } = appendTiers(tor.trackerList, urls);
      if (new_urls.length > 0) {
        added += new_urls.length;
        requests.push(
          this._request(this.remote.setTrackerList, [tor.id], list)
        );
      }
    }

    const responses = await Promise.all(requests);
    const failed = responses.find((r) => r.result !== 'success');
    if (failed) {
      return { error: failed.result };
    }
    return { added };
  }

  static _create(torrents) {
    const elements = createDialogContainer('add-trackers-dialog');
    elements.root.setAttribute('aria-label', 'Add trackers');
    elements.heading.textContent = 'Add trackers';
    elements.message.textContent =
      torrents.length === 1
        ? `To “${torrents[0].getName()}”. Each tracker is added as a new tier.`
        : `To ${torrents.length} selected torrents. Each tracker is added as a new tier.`;
    elements.confirm.textContent = 'Add';

    const label = document.createElement('label');
    label.setAttribute('for', 'add-trackers-urls');
    label.textContent = 'One tracker announce URL per line:';
    elements.workarea.append(label);

    const entry = document.createElement('textarea');
    entry.id = 'add-trackers-urls';
    entry.rows = 10;
    entry.spellcheck = false;
    entry.setAttribute('autocomplete', 'off');
    entry.setAttribute('autocapitalize', 'off');
    entry.setAttribute(
      'placeholder',
      'udp://tracker.example.org:1337/announce\nhttps://tracker.example.net/announce'
    );
    entry.setAttribute('aria-describedby', 'add-trackers-error');
    elements.entry = entry;
    elements.workarea.append(entry);

    const error = document.createElement('div');
    error.id = 'add-trackers-error';
    error.classList.add('add-trackers-error', 'hidden');
    error.setAttribute('role', 'alert');
    elements.error = error;
    elements.workarea.append(error);

    const hint = document.createElement('div');
    hint.classList.add('add-trackers-hint');
    hint.textContent = 'Ctrl+Enter to add, Esc to cancel.';
    elements.workarea.append(hint);

    return elements;
  }
}
