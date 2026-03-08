# Export Checklist

Use this checklist when validating WriteWMe exports.

## 1. Cartographer Pack

Expected ZIP entries:

- `atlas-config.json`
- `layers.csv`
- `locations.csv`
- `pins.csv`
- `routes.csv`
- `notes.md`

Checks:

- `atlas-config.json` parses and contains `atlas.layers` and `atlas.pins`.
- `pins.csv` and `locations.csv` agree on linked location IDs when sample-checked.
- `notes.md` still reads like a handoff to a cartographer, not raw debug output.

## 2. Historian Pack

Expected ZIP entries:

- `timeline.json`
- `timeline.csv`
- `secrets.json`
- `chronicle.md`

Checks:

- `timeline.json` parses as an array.
- `timeline.csv` still includes lane, era, order, and summary fields.
- `chronicle.md` contains lane and secret coverage, even when secrets are empty.

## 3. Editorial Pack

Expected ZIP entries:

- `manuscript.md`
- `editorial-context.md`
- `book-metadata.json`

Checks:

- `book-metadata.json` parses and includes `title` and `author`.
- `manuscript.md` remains readable as a manuscript export, not just raw chapter dumps.
- `editorial-context.md` includes saga context or explicit absence of saga context.

## 4. UI Alignment

Check these UI entry points after export changes:

- `Sidebar`
- `AmazonPanel`
- status messages in `App.tsx`

The exported artifact name, the UI label, and the actual role intent must agree.
