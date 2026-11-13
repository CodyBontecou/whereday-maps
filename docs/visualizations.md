# Individual visualizations

Insert one compact figure wherever it belongs in a note. Each uses the normal
export loader, deduplication and refresh controls. No journal or generated report
is required. The figures only read exports; they do not write notes or place state.

````markdown
```whereday
source: exports
view: stay-strip
date: 2026-11-11
auto_refresh: true
```
````

| `view` | Figure | Explore |
| --- | --- | --- |
| `stay-strip` | One local day of stays; overlaps occupy separate rows | Hover, focus or click a span |
| `day-dial` | Circular view of the same stays | Select a stay; change the date |
| `route-card` | Recorded GPS geometry and a sample cursor | Play/pause, scrub, fit; change the date |
| `return-calendar` | Monthly arrival frequency | Choose an exported place name, click a day, change the month |
| `weekly-rhythm` | Weekday/hour arrival frequency across loaded exports | Click a cell or use arrow keys |

Use **Whereday Maps: Insert Stay Strip**, **Insert Day Dial**, **Insert Route Card**,
**Insert Return Calendar**, or **Insert Weekly Rhythm** in the command palette.
Each inserts one block using the configured exports folder. The Route Card
command includes `tile_provider: osm` for a street map.

Optional settings:

- `title`: your own short heading.
- `date`: starting local date; the first four views have independent date controls.
- `place`: exact exported name, ignoring case, for calendar/rhythm filtering.
- `min_stop_minutes`: hide shorter stays in the strip/dial (default 1).
- `height`: route map height in pixels (120–480, default 200).
- `tile_provider`: route basemap; `osm` shows OpenStreetMap streets; `none` shows a local grid
  with no tile requests. CARTO endpoints may require an API key; configure an
  authenticated custom tile URL if your provider requires one. Tile
  providers receive tile requests for the visible map area.
- `appearance: native`: inherit the vault's palette instead of Whereday's paper/ink colors.
- `show_receipt: true`: optionally show the source receipt and refresh button.
- `auto_refresh: true`: refresh when a referenced export changes in the vault.

`view` takes precedence over journal options. Other existing map blocks keep their
behavior. Changing a visualization's controls does not rewrite its YAML.

Blank areas mean no matching records, not confirmed absence. Stays are clipped to
local midnight; open visits stop at the export snapshot. Overlaps remain visible.
On DST days, dial/strip positions use elapsed fractions of the 23/25-hour day.
Calendar/rhythm cells count arrivals, not occupancy or dwell time; equal exported
names may represent different venues. Route distance and lines break at local
midnight or gaps over 30 minutes and exclude marked outliers. Playback steps
through actual samples without interpolating across gaps. Outing summaries and
visit positions never supply missing GPS routes.

For local renderer QA, run `node scripts/preview-visualizations.mjs` and open
`http://127.0.0.1:4319/?date=2026-05-04`. It uses the synthetic example. An explicit
third argument selects a local JSON export; the server binds only to localhost
and serves only that fixture, the compiled preview, and styles.
