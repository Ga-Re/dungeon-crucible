# Kontextsensitiver Karten-Editor – Wunsch des DM (2026-11-25)

Stand: **Im Interview am 2026-11-25 entschieden: E-33** in `docs/TASKS.md`. Wo E-33 von der Spezifikation unten
abweicht (z. B. Türen nur offen/zu/geheim, keine Größengrenze, Texturen für Teile), gilt E-33. Assets (Fässer,
Felsen, Bäume …) sollen weiterhin frei platziert werden können (DC-041).

**Weitergeführt (2026-11-27):** `docs/KARTENSCHMIEDE-PROZEDURAL.md` (E-46–E-77) löst das Mauer-, Klippen- und
Zonenmodell dieser Spezifikation durch Raster mit abgeleiteter Optik ab. Diese Datei bleibt als Ursprung erhalten.

Bezüge: DC-026 (parametrische Räume, Gelände), DC-027 (eigene Karten zeichnen), DC-041 (Props), DC-101
(Zeichenebenen), DC-014 (Wände: heute einzelne Strecken mit Gelenken, Türen als eigene Strecken – die Spezifikation
sieht Linienzüge und Türen auf Wänden vor; eine Umstellung braucht eine Migration).

---

Die Spezifikation im Wortlaut:

# System-Spezifikation: Kontextsensitiver 2D-D&D-Map-Editor (Procedural & Rule-Based)

## Zielsetzung
Entwickle die Architektur und Kernlogik für einen 2D-D&D-Map-Editor, der **Top-Down-Dungeon-Maps** (mit optionalem 5-ft-Combat-Grid) und **handgezeichnete Wilderness-/Stadt-Maps** in einem einheitlichen System vereint.
Nutzer sollen Wände, Wege, Flüsse, Gebäude/Räume, Türen, Brücken und Dekorationen dynamisch ziehen/zeichnen können, während das System Ecken, Übergänge, Durchbrüche, Schatten und Details kontextsensitiv und deterministisch generiert.

---

## 1. Kernprinzipien
1. **Intent-First Datenmodell (Single Source of Truth):** Speichere Nutzer-Intentionen (`Strokes`, `Nodes`, `Features`, `Zones`) als editierbare Datenobjekte – niemals nur finale Raster-Tiles oder fertige Render-Meshes.
2. **Dual-Mode-Fähigkeit:**
   - **Dungeon Mode:** Fokus auf klare Lesbarkeit, Wände/Kanten, Räume, Türen (`open`, `closed`, `locked`, `secret`), Sichtlinien/Wall-Daten und präzises Snap-Verhalten am Grid.
   - **Wilderness & City Mode:** Fokus auf organische Linienführung, Geländeübergänge, Straßen/Flüsse, Brücken, Gebäude-Blöcke/Dächer, Küsten/Ufer und handgezeichnete Detailstreuung.
3. **Determinismus durch Seeds:** Jedes Objekt/Segment besitzt einen festen `seed`. Visuelle Variationen (Steinversatz, Linien-Jitter, Ranken, Büsche, Dachziegel) müssen daraus reproduzierbar berechnet werden, damit beim Verschieben oder Neu-Evaluieren nichts flackert.
4. **Inkrementelle Neuberechnung (Dirty Regions):** Bei Änderungen nur betroffene Bounding-Boxes / Graph-Knoten / Chunks neu evaluieren, um hohe Frameraten zu halten.

---

## 2. Datenmodell (Empfohlene Struktur)
Implementiere das Modell so, dass beide Modi darauf aufbauen können:

- **MapDocument:**
  - `mode`: `"dungeon" | "wilderness_city"`
  - `gridConfig`: `{ enabled: boolean, cellSizePx: number, feetPerCell: number, snapMode: "none" | "grid" | "half_grid" | "angle" }`
  - `entities`: Liste/Map aller Intentionen (`WallStroke`, `PathStroke`, `AreaZone`, `DoorFeature`, `BridgeFeature`, `PropRule`)
  - `graph`: Abgeleiteter topologischer Graph (`GraphNode` bei Endpunkten/Kreuzungen, `GraphEdge` zwischen Knoten) für Ecken, Loops und Schnittpunkte.
  - `resolvedCache`: Gecachte, aus den Regeln abgeleitete Geometrie-, Render- und VTT-Metadaten.

- **Basis-Entitäten:**
  - `WallStroke`: `{ id, points[], thickness, style ("dungeon_stone" | "city_wall" | "cliff_edge" | "hedge"), seed, snapOverride? }`
  - `PathStroke`: `{ id, points[], width, kind ("road" | "trail" | "river" | "stream" | "corridor"), seed }`
  - `AreaZone`: `{ id, polygon[], kind ("room_floor" | "water" | "forest" | "grass" | "sand" | "district_roof" | "elevation"), elevation, seed }`
  - `DoorFeature`: `{ id, targetEdgeId, t (0..1 entlang Segment), width, state ("open" | "closed" | "locked" | "secret"), style, seed }`
  - `BridgeFeature`: `{ id, pathId | zoneId, spanStart, spanEnd, width, style, seed }`

---

## 3. Regel-Engine / Resolver-Pipeline (Reihenfolge einhalten)
Baue eine deterministische Pipeline aus mehreren Pässen:

### Pass A: Snapping & Graph-Aufbau
- Wende je nach Modus und `snapMode` Grid-/Winkel-Snapping an (im Wilderness/City-Modus sanftes Endpunkt-Snapping für geschlossene Loops/Kreuzungen, optionales Grid-Snapping).
- Erkenne Schnittpunkte zwischen `WallStroke`s und `PathStroke`s. Erzeuge `GraphNode`s an Enden, Knicken und Kreuzungen.

### Pass B: Topologie- & Kontext-Regeln
- **Valenz & Winkel an GraphNodes:**
  - Valenz 1: Endkappe / Pfeiler / Abschluss.
  - Valenz 2: Gerade Linie oder Ecke (abhängig vom Winkel; im Dungeon sauber verzahnt, in Wilderness/City leicht abgerundet/organisch).
  - Valenz >= 3: T-Kreuzung oder Kreuzung mit passendem Übergang.
- **Tür- & Durchbruch-Regeln (`DoorFeature`):**
  - Schneidet das zugehörige `WallStroke`-Segment an Position `t` mit Breite `width`.
  - Erzeugt Schwellen-/Rahmen-Geometrie und verknüpft den Türzustand (`state`) mit Blockade- und Sichtlinien-Flags.
- **Weg/Fluss trifft Mauer (`PathStroke` x `WallStroke`):**
  - Bei `road`/`trail` + `city_wall`/`dungeon_wall`: Erzeuge optional einen Torbogen/Durchgang oder markiere den Schnittpunkt für manuelle/regelbasierte Torplatzierung.
  - Bei `river`/`stream` + `road`/`trail`: Erzeuge automatisch ein `BridgeFeature` über den Wasser-Korridor (inkl. Geländer/Widerlager).
- **Geschlossene Loops & Flächen (`AreaZone`):**
  - Erkannte geschlossene Wand-Loops können optional als Raum (`room_floor`) oder Gebäude-Grundriss (`district_roof`) interpretiert werden (mit Dachüberhang/Schatten im City-Modus).
  - Angrenzende `AreaZone`s mit unterschiedlicher `elevation` oder Terrain-Art erzeugen Übergangsstreifen (Uferlinie, Böschung, Schattenwurf).

### Pass C: Prozedurale 2D-Geometrie & Handgezeichnete Optik
- **Variabler Line-Jitter / Hand-Drawn Stroke:** Subdividiere Pfade in Segmente und verschiebe Zwischenpunkte senkrecht zur Tangente mithilfe eines seed-basierten 1D/2D-Noise (im Dungeon-Modus dezent/kontrolliert, im Wilderness/City-Modus stärker und mit doppelten/skizzierten Konturen).
- **Polygonale Verschmelzung ( statt unsauberer Tile-Überlappungen):** Generiere für Wände, Wege und Flüsse saubere Outlines/Polygone mit mitered/rounded Joins und konsistentem Lichteinfall (Drop Shadows / Rim Highlights).

### Pass D: Regelbasierte Detailstreuung (Scatter & Dressing)
- Platziere Details (`Fackeln`, `Säulen`, `Bäume`, `Felsen`, `Schilf`, `Kamine`, `Marktstände`) anhand von Abstand, Dichte und Kontext:
  - Fackeln/Pfeiler in regelmäßigen Abständen entlang von Innenwänden/Korridoren.
  - Bäume/Büsche in `forest`-Zonen mit Mindestabstand zueinander, aber *nicht* auf `PathStroke`s oder innerhalb von `BridgeFeature`-Zonen.
  - Uferdetails (Steine, Schilf) entlang der Schnittlinie von `water`-Zonen und Land/Wegen.

---

## 4. D&D- & VTT-Export-Schicht
Leite aus dem aufgelösten Zustand (`resolvedCache`) automatisch exportierbare Daten ab:
- **Movement / Collision Layer:** Begehbare vs. blockierte Bereiche (unter Berücksichtigung von `DoorFeature.state`).
- **Vision / Line-of-Sight Layer:** Sichtblockierende Kanten/Polygone (Wände, geschlossene/verschlossene Türen, dichte Mauern; offene Türen blockieren nicht, geheime Türen blockieren bis entdeckt).
- **Grid-Overlay & Scale:** Saubere Darstellung des 5-ft-Rasters (oder konfigurierbarer Maßstäbe) über beiden Modi.

---

## 5. Erwartetes Vorgehen / Deliverables
1. Schlage einen passenden Tech-Stack (z. B. TypeScript + HTML5 Canvas / WebGL / PixiJS / Konva oder Rust/Godot) mit klarer Trennung von **Core/Engine (headless testbar)** und **Renderer/UI** vor.
2. Definiere die TypeScript-/Datenstrukturen und den Graph-Resolver.
3. Implementiere zunächst einen lauffähigen Prototypen für **Wände + Ecken/Kreuzungen + Türen + Hand-Drawn/Grid-Rendering** inklusive Dirty-Region-Update.
4. Erweitere danach um **Wege/Flüsse/Brücken**, **Zonen/Dächer** und **Scatter-Regeln**.
