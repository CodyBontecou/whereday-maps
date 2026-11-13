---
plugin-id: iso-me-maps
version: 0.7.15
last-updated: 2026-11-13
---

# Security

## Network Activity

Whereday Maps (formerly iso.me Maps) does not upload vault content or location exports. The plugin's network activity is browser image loading for the selected map tile provider.

New installs default to **None (local overlays only)**. Existing saved provider choices/URLs are preserved; there is no automatic online-provider replacement. With Tile provider set to **None (local overlays only)** or `tile_provider: none`, the plugin does not create a tile layer or request map tiles for that map. Existing saved URLs and a block's `tile_url` cannot override None; an explicit online `tile_provider` can. Selecting None does not erase previously saved tile URLs/credentials and does not affect already-rendered maps until they are reloaded. This is not a network-disable switch for Obsidian, other plugins, sync services, or links the user opens.

| Host | Purpose | Data Sent | Direction |
| --- | --- | --- | --- |
| `*.basemaps.cartocdn.com` | Optional CartoDB Voyager/Positron/Dark Matter map tiles | Tile coordinates in the URL, IP address, user agent/referrer headers set by the runtime; no vault file contents | outbound/inbound |
| `*.tile.opentopomap.org` | Optional OpenTopoMap map tiles | Tile coordinates in the URL, IP address, user agent/referrer headers set by the runtime; no vault file contents | outbound/inbound |
| `server.arcgisonline.com` | Optional Esri World Imagery map tiles | Tile coordinates in the URL, IP address, user agent/referrer headers set by the runtime; no vault file contents | outbound/inbound |
| `*.tile.openstreetmap.org` | Optional OpenStreetMap map tiles | Tile coordinates in the URL, IP address, user agent/referrer headers set by the runtime; no vault file contents | outbound/inbound |
| User-configured custom tile host | Optional custom map tiles if the user chooses the Custom tile provider | Tile coordinates in the URL, IP address, user agent/referrer headers set by the runtime; no vault file contents | outbound/inbound |

## Data Collection

| Data Type | Scope | Purpose |
| --- | --- | --- |
| Location export files (`.json`, `.geojson`, `.csv`, `.md`, `.markdown`, `.gpx`) | Files explicitly referenced by a `whereday` or legacy `iso-me` code block through `source` / `sources` | Parse visits, GPS points, outing summaries/endpoints, routes, and stats for rendering in the current note |
| Vault file paths | Only the configured exports folder, explicit source folders, or glob/date-keyword search roots; bounded by the plugin's folder-depth settings | Resolve folders, globs, and date keywords to matching location export files |
| Journal state and managed note baselines | This vault’s plugin journal-state.json and backup | Persist reviewed assignments, local annotations and protected generated sections; may contain private location text |
| Generated notes | User-selected visible vault folders, only through labeled actions | Write daily journals, place passports, trip editions and saved queries while preserving prose outside managed sections |
| Plugin settings | This plugin's local settings data only | Remember tile provider, display defaults, and export-folder naming preferences |

## Third-Party Services

| Service | Purpose | Data Shared |
| --- | --- | --- |
| CartoDB basemaps | Optional map tile rendering | Tile coordinates and standard request metadata only |
| OpenTopoMap | Optional map tile rendering | Tile coordinates and standard request metadata only |
| Esri World Imagery | Optional satellite tile rendering | Tile coordinates and standard request metadata only |
| OpenStreetMap tile servers | Optional map tile rendering | Tile coordinates and standard request metadata only |
| Custom tile provider | Optional user-specified map tile rendering | Determined by the user's configured tile URL; the plugin does not append vault contents |

## Permissions

- Uses standard Obsidian vault APIs to read selected exports and, through labeled journal actions, create/update generated Markdown notes and local journal state.
- Uses Obsidian frontmatter processing for generated passport properties; user-added aliases are retained.
- Local review never writes corrections or confirmations back to the phone.
- Uses standard Obsidian vault adapter APIs to list files under configured export/search folders when resolving folders, globs, or date keywords.
- Does not use Node.js filesystem modules, shell commands, Electron bridge messaging, system copy/paste APIs, or dynamic-code execution APIs.

## Data Storage

| What | Where | Encrypted |
| --- | --- | --- |
| Tile provider, tile URL/attribution, export-folder options, display defaults, marker/route colors | Local Obsidian plugin settings (`data.json`) | No |


## Field Journal storage

Optional journal features store assignments, local review notes and exact generated-section baselines in `journal-state.json` with a previous-state `.bak` in the plugin folder under the vault's configured Obsidian config directory. These files can contain private location information; generated journals, passports and saved queries can contain coordinates, source paths, times and names. They are not encrypted by this plugin and may be copied by the user's vault synchronization/backup tools. No additional network service, remote font, geocoder or language model is used.

Location-free trip editions omit generated location names/links, coordinates, notes, source paths and live maps, but retain the user-supplied title, dates, times, durations and confirmation labels. Review the entire note before sharing. No publication occurs automatically.
