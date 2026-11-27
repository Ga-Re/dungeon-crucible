# Kartenschmiede – Prozeduraler Karteneditor

**Konzept & Umsetzungsplan für einen regelbasierten 2,5D-Karteneditor im D&D-Battlemap-Stil**

**Version 2 – abgestimmt mit Dungeon Crucible** (`Ga-Re/dungeon-crucible`, Stand `bb32f31`)

Stand: 27.11.2026 · Teil A: Abgleich mit dem Repository und Entscheidungen des DM · Teil B: Fachkonzept aus dem ersten Interview (angepasst)

---

## Inhalt

**Teil A – Abstimmung mit Dungeon Crucible (gilt vorrangig)**

- [A.1 Ausgangslage](#a1-ausgangslage)
- [A.2 Entscheidungen vom 27.11.2026](#a2-entscheidungen-vom-27112026)
- [A.3 Was der Umbau im Code bedeutet](#a3-was-der-umbau-im-code-bedeutet)
- [A.4 Anpassungen ohne Rückfrage](#a4-anpassungen-ohne-rückfrage)
- [A.5 Begriffe (Plan → Repo)](#a5-begriffe-plan--repo)
- [A.6 Datenformat Karte v14 (Skizze)](#a6-datenformat-karte-v14-skizze)
- [A.7 Code-Struktur](#a7-code-struktur-ersetzt-teil-b-261)
- [A.8 Höhlen- und Dungeon-Eingänge](#a8-höhlen--und-dungeon-eingänge-e-62)
- [A.9 Haus-Generator im Asset-Editor](#a9-haus-generator-im-asset-editor-e-64)
- [A.10 Bedienung](#a10-bedienung-ersetzt-teil-b-181183-inhalt-der-modi-bleibt)
- [A.11 Roadmap als DC-Tasks](#a11-roadmap-als-dc-tasks-ersetzt-teil-b-28)
- [A.12 Offene Punkte](#a12-offene-punkte)

**Teil B – Fachkonzept**

1. [Kurzfassung](#1-kurzfassung)
2. [Getroffene Entscheidungen](#2-getroffene-entscheidungen)
3. [Stilanalyse der Referenzkarten](#3-stilanalyse-der-referenzkarten)
4. [Grundprinzipien: Warum es sich natürlich anfühlt](#4-grundprinzipien-warum-es-sich-natürlich-anfühlt)
5. [So fühlt es sich an: Arbeitsabläufe](#5-so-fühlt-es-sich-an-arbeitsabläufe)
6. [Kernkonzept: Absicht → Ableitung → Darstellung](#6-kernkonzept-absicht--ableitung--darstellung)
7. [Raster, Koordinaten und Höhenmodell](#7-raster-koordinaten-und-höhenmodell)
8. [Datenmodell](#8-datenmodell)
9. [Generierungs-Pipeline](#9-generierungs-pipeline)
10. [Wo WFC, wo Regeln, wo Meshes](#10-wo-wfc-wo-regeln-wo-meshes)
11. [Klippen-System](#11-klippen-system)
12. [Wasser-System](#12-wasser-system)
13. [Biome, Bodenarten und Regelwerk](#13-biome-bodenarten-und-regelwerk)
14. [Wege und Straßen](#14-wege-und-straßen)
15. [Treppen, Rampen, Leitern, Brücken](#15-treppen-rampen-leitern-brücken)
16. [Dungeons und Höhlen](#16-dungeons-und-höhlen)
17. [Gebäude und Linienbauten](#17-gebäude-und-linienbauten)
18. [Werkzeuge und Oberfläche](#18-werkzeuge-und-oberfläche)
19. [Bearbeitung: Verlauf, Auswahl, Smart Assets, Prefabs, Kartenzustände](#19-bearbeitung-verlauf-auswahl-smart-assets-prefabs-kartenzustände)
20. [Licht, Schatten, Atmosphäre](#20-licht-schatten-atmosphäre)
21. [Klang-Quellen](#21-klang-quellen)
22. [Rendering-Architektur (PixiJS 8)](#22-rendering-architektur-pixijs-8)
23. [Export](#23-export)
24. [Asset-Spezifikation](#24-asset-spezifikation)
25. [Asset-Pipeline mit Higgsfield](#25-asset-pipeline-mit-higgsfield)
26. [Code-Architektur](#26-code-architektur)
27. [Tests und Qualitätssicherung](#27-tests-und-qualitätssicherung)
28. [Roadmap mit Aufgaben](#28-roadmap-mit-aufgaben)
29. [Risiken](#29-risiken)
30. [Offene Punkte](#30-offene-punkte)
31. [Anhang](#31-anhang)

---

# Teil A – Abstimmung mit Dungeon Crucible

> **Teil A hat Vorrang.** Teil B (ab §1) ist das Fachkonzept aus dem ersten Interview. Er wurde für ein neues Projekt geschrieben. Wo Teil B dem Teil A widerspricht, gilt Teil A. Stark betroffene Abschnitte in Teil B sind angepasst oder verweisen hierher.
>
> **Grundlage:** Repository `Ga-Re/dungeon-crucible` (Stand `bb32f31`), Abgleich durch 5 Leser, eine Synthese und 3 Prüfer: 46 Befunde, alle gegengeprüft (33 im Detail korrigiert, keiner widerlegt). Die Entscheidungen stammen aus dem Interview mit dem DM am 27.11.2026.

## A.1 Ausgangslage

Dungeon Crucible (Electron 45, React 19, PixiJS 8.22, ein npm-Paket `app/`) hat bereits eine weit ausgebaute Kartenschmiede. Der Abgleich ergab:

| Bereich | Bestand im Repo | Was damit passiert |
|---|---|---|
| Gezeichnete Mauern, Türen, Fenster (E-33) | `masonry`, `masonryDoors`, Stile, Wehrmauer, Verfall | **entfällt** → Fels-Raster + Wandlinien (E-48) |
| Klippen (E-34) | Linien und Ringe, `cliffs.ts`, `cliffsPaint.ts` | **entfällt** → Stufen-Raster (E-46) |
| Wasser (E-35) | Linien und Ringe, Wasserfälle, `water-layer.ts` | **entfällt** → Wasser-Raster (E-47) |
| Böden (Pinsel, 14 Stile) | Polygone, Naturgrund ab 3 Feldern | **entfällt** → Boden- und Biom-Raster (E-49) |
| Parametrische Räume (E-45), Fels (DC-119f) | `rooms.ts`, `rock.ts` | **entfällt** → Raum-Werkzeug schreibt ins Fels-Raster (E-48) |
| Generator (DC-119d/e) | Raumgraph, Zellularautomat | **entfällt**, kommt später neu (E-66) |
| Feste Automatiken (`autoShore`, `autoGrowth`) | `detailsPaint.ts` | **entfällt** → Regel-Engine (E-50) |
| Canvas-2D-Kachelmalerei (`PaintedImage`) | `drawnMap.ts`, `mapBinding.ts` | **entfällt** → neue Render-Pipeline (E-52) |
| Stockwerke (E-40), Stockwerk-Treppen (E-44) | `storeys`, `stairs`, `storeyShape.ts` | **bleibt**, Grundfläche künftig aus dem Raster |
| Zeichenebenen mit Auslöser und Gegenebene (E-28) | `layers.ts`, `mapLayers.ts` | **bleibt**, Ebenen tragen künftig Raster-Patches (E-58) |
| Szenen mit Overrides (E-2, E-3, E-24) | `sidecar.ts`, `mapLayers.ts` | **bleibt**, Regeln für neue Arten nach E-59 |
| Kartenvarianten (E-41) | `mapVariantSchema` | **bleibt** (Bild und Licht), Stimmung zusätzlich |
| Lichter mit Sichtpolygonen, Living Fog, Nebel-Engine | `renderer.ts`, `fog-*.ts` | **bleibt**; Atmosphäre liegt immer unter dem Fog of War |
| Klang (E-37) | Punktquellen, `builtin:`-Loops, Hörposition, Probehören | **bleibt**, um abgeleitete Quellen erweitert (E-72) |
| Assets (E-27, E-29, E-31) | Sidecar v3, Objektdatei, Anker, Tür, Innenraum, Deckung, Licht | **bleibt**, Sidecar v4 (E-68), Haus-Generator (E-64) |
| Speicherung | `MapSidecar` v13 (`.map.json`), `readDocument`/`MIGRATIONS`, `keepUnknown`, Autosave 1,5 s, Papierkorb, Archiv | **bleibt**, Format v14 (E-55, A.6) |
| Rückgängig | `History<string>` mit JSON-Momentaufnahmen, 100 Schritte, je Tab | **bleibt** als Schnittstelle, mit geteilten Raster-Blöcken (E-56) |
| Determinismus | `rng` (mulberry32), `noise2`, `hashNoise`, `changedRegion` | **bleibt** und wird weiterverwendet |
| TV-Projektion | `PlayerFrame` v5 alle 100 ms, zod, fail-closed, `playerDrawing` filtert | **bleibt**, Frame v6 mit Raster-Blöcken (E-61) |
| Texturen | WebP-Slots in `render/build/textures/` (101 Dateien), Varianten `.N`, Ersatzmuster | **bleibt**, um neue Slot-Typen erweitert (E-70) |
| Oberfläche | Ribbon, Befehls-Panel (E-6), Dock-Panels (E-39), Statusleiste, i18n en/de, Themes | **bleibt** (E-67) |

Damit sind die offenen Punkte O1–O3 und O6 aus Teil B §30 beantwortet: Speicherung, Asset-Schema, Spielmodus-Renderer, nur Quadratraster.

## A.2 Entscheidungen vom 27.11.2026

Eingetragen in `docs/TASKS.md` §1 (Nachtrag 2026-11-27). „Ersetzt“ heißt: Die genannte Entscheidung wird in diesem Punkt aufgehoben.

| Nr. | Thema | Entscheidung | Verhältnis zu Bestehendem |
|---|---|---|---|
| E-46 | Höhenmodell | **Stufen-Raster + Feinhöhe + Böschung** (Teil B §7). Klippen entstehen nur aus Stufenwechseln, gezeichnete Klippen entfallen. | ersetzt E-34 |
| E-47 | Wasser | **Wasser-Raster** wie Teil B §12: Seen füllen bis zum Überlauf, Fließen nach Gefälle, bei flachem Gelände per Richtungsangabe; Wasserfälle an Stufenkanten; Quellen-Werkzeug. | ersetzt E-35 (Wasser-Teil) |
| E-48 | Fels und Dungeon | **Fels-Raster** (`solid`, `solidStyle`) mit Aushöhlen, Füllen und Raum-Werkzeug (Rechteck, Polygon, Kreis, Freihand) plus **Wandlinien** (Vektor) für dünne Wände und Linienbauten. Gezeichnete Mauern und parametrische Räume entfallen. | ersetzt E-33 (Mauer-Teil), E-45 |
| E-49 | Biome und Boden | **Biom- und Bodenklassen-Raster** mit weichen Übergängen. Der Boden-Pinsel mit 14 Polygon-Stilen entfällt. `fogBiome` bleibt für Living Fog und ist Standard-Biom neuer Karten. | ändert E-34 (Naturgrund) |
| E-50 | Regel-Engine | **Datengetriebene Regel-Engine** mit Streuung, Modulwahl und stabilen IDs ersetzt alle festen Automatiken (`autoShore`, `autoGrowth`, Bewuchs, Abnutzung). | neu |
| E-51 | Regelstand | **„Optik überall neu“ bleibt.** Keine Regelstand-Sperre. Fixierte Objekte bleiben eingefroren; verwaiste Overrides bleiben in der Datei, werden nicht angewandt und gemeldet. | bestätigt E-36 |
| E-52 | Rendering | **Neue Render-Pipeline für DM und TV**: Meshes, Splat-Shader, Instanzen, Chunk-Bakes, Schatten per Shader (Teil B §22). Die Canvas-2D-Kachelmalerei entfällt. Nur WebGL2 und GLSL. | ersetzt DC-107-Optik |
| E-53 | Rechnen | **Worker-Pool von Anfang an**, Daten per Transferables. Kein SharedArrayBuffer, kein WebAssembly, keine Änderung an CSP oder Headern. Malcode muss Worker-tauglich sein (OffscreenCanvas, kein DOM). | präzisiert E-36 („ohne Worker“ galt dem Generator) |
| E-54 | Code und Abhängigkeiten | **Kein Monorepo**, Ordnerstruktur von `app/` bleibt (A.7). Laufzeit-Algorithmen im eigenen Code. Jede neue Abhängigkeit einzeln mit Steckbrief. | wie CLAUDE.md, E-33 |
| E-55 | Speicherung | **Raster in der `.map.json` (Karte v14)**, je Block lauflängenkodiert und mit `CompressionStream` (Deflate) komprimiert, als Base64. Keine neue Dateiart. Die Rettungskopie wandert nach IndexedDB. Ab einer gemessenen Größe kommt eine Binärdatei als neue Entscheidung. | erweitert das Format |
| E-56 | Rückgängig | **Momentaufnahmen mit geteilten Raster-Blöcken** (copy-on-write). Historie bleibt je Tab; Ghosts nie in Historie oder Datei. | erweitert E-4, E-30 |
| E-57 | Umstellung | **Sofort umstellen, keine Migration.** Der alte Bau- und Mal-Code wird zu Beginn entfernt. Die Migration v13→v14 **löscht** `masonry`, `masonryDoors`, `cliffs`, `waters`, `floors`, `rooms` sowie dieselben Felder in Szenen-Zeichnungen, **ohne Sicherung**. Bis Phase 2 kann die Kartenschmiede keine Mauern, Klippen und kein Wasser. | DM-Entscheid; Hinweis: vorher Archiv-Export |
| E-58 | Varianten | **Raster-Patches je Zeichenebene**, z. B. Ebene „Damm gebrochen“ für Höhe und Wasser; Szenen schalten Ebenen wie heute. Stimmung (Winter, Nacht) über Variante bzw. Szenen-Stimmung. Die Kartenzustände aus Teil B §19.5 entfallen. | erweitert E-28, E-41 |
| E-59 | Szenen | Raster und Regel-Overrides gehören **nur zur Karte**. Szenen dürfen Wege, Assets, Lichter und Klang ausblenden, überschreiben und eigene haben; unsichtbare Wände und Bereiche nach E-24 bleiben. | ändert E-24, DC-107c |
| E-60 | Bild- und Videokarten | Das Raster funktioniert **auch über Bild- und Videokarten**, ausgerichtet am eingemessenen, auch gedrehten Raster. Gezeichnet wird nur Gemaltes, der Auto-Boden bleibt transparent. | erhält E-33 (Zeichnen über Bildkarten) |
| E-61 | TV-Übergabe | **Frame bleibt** (v6). Raster-Blöcke gehen nur bei Änderung mit Prüfsumme an den TV, vorher gefiltert nach Ebene, Stockwerk und geheimen Bereichen. Der TV berechnet die Optik selbst mit demselben Code. Kein Szenenpaket. | erweitert Projektion |
| E-62 | Höhlen- und Dungeon-Eingänge | Liegt an einer Klippe oder Ruine ein Eingang, wird beim Betreten das **darüberliegende Gelände über der Grundfläche des Untergrunds ausgeblendet** und die Höhlen- bzw. Dungeon-Ebene darunter gezeigt. **Tiefere Geschosse sind eigene Karten.** | erweitert E-40 (A.8) |
| E-63 | Wege | **Bézier-Splines** mit Tangenten-Anfassern und Breite je Punkt (eigenes Bearbeitungsmodell). | neu |
| E-64 | Gebäude | **Häuser bleiben Assets** (E-29). Neu ist ein **Haus-Generator im Asset-Editor**, der Bilder erzeugt und die Parameter behält (A.9). Palisade, Zaun, Hecke, Trockenmauer und Burgmauer sind **Stile der Wandlinie**. | erweitert E-29 |
| E-65 | Prefabs | Neue Dateiart **`prefab`** v1 (`library/<name>.prefab.json`) mit Raster-Ausschnitt, Assets und Parametern; Instanzen bleiben verknüpft, „Auflösen“ backt ein. „Prefab“ ist nicht „Smart Prefab“ aus E-29. | neue Dateiart |
| E-66 | Generator | Der Generator **entfällt mit dem Umbau** und kommt später neu: Dungeon, Höhle und Wildnis auf dem Raster. | ändert DC-119d/e |
| E-67 | Bedienung | **Projekt-Regeln** (ui-design, E-6, E-35, E-39): neue Ribbon-Tabs, Optionen im Befehls-Panel, Dock-Panels, Modifikatoren nach E-35, Kürzel mit DC-076 (A.10). | bestätigt |
| E-68 | Smart Assets | **Asset-Sidecar v4** mit optionalen Feldern (Grundfläche, Platzierungsort, Bedingungen, Geländewirkung, Klang, Schattenhöhe, Tönung, Herkunft); Varianten in der Objektdatei. | erweitert E-27, E-31 |
| E-69 | Biom-Pakete | **Hybrid:** Eine Basis (Boden-, Klippen-, Wasser-Slots, Regeln, Biom-Definition) kommt mit der App, große Objekt- und Decal-Sätze sind Bibliotheks-Packs. Regeln wählen Assets über Tags, Unterart und Umgebung, nicht über Pfade. | passt zu E-1, E-27 |
| E-70 | Texturen | **Slot-System erweitert** nach Teil B §24: 256 px/Feld, Höhen-Maps, Klippenbänder, Lippen, Decals; Mipmaps an; Master-PNGs außerhalb des Repos, ausgeliefert als WebP. | erweitert DC-107a |
| E-71 | Stimmung | `lightAngle` bleibt die Lichtrichtung, ergänzt um Sonnenhöhe, Tageszeit, Jahreszeit und Wetter. **Nur Optik**; `ambient` bleibt der Schalter für die Sichtregeln. Dunst und Wetter liegen unter dem Fog of War. | erweitert E-35 (`lightAngle`) |
| E-72 | Klang | **Abgeleitete Quellen in der bestehenden Engine** mit festen Schlüsseln (z. B. `water~fall~3_7`); Szenen regeln sie über `soundLevels`; Vorhören mit der Testfigur (E-43). Hörposition im Spiel bleibt nach E-37. | erweitert E-37 |
| E-73 | Prüfung | **TV-Benchmark erweitert** (große gezeichnete Karte, Wasser, Stockwerke, Streuung) plus **Playwright-Bildvergleiche** in der echten App. Playwright ist im Grundsatz freigegeben; Steckbrief beim Einführen. | erweitert CLAUDE.md „Checks“ |
| E-74 | Export | Zuerst Bild (PNG/WebP) und Foundry/UVTT, Druck als PNG-Serie, PDF später im eigenen Code. Geschrieben wird nur im Hauptprozess über einen Speichern-Dialog. | neu |
| E-75 | Asset-Erstellung | **Higgsfield nur während der Entwicklung.** Die Nachbearbeitung läuft im Entwickler-Werkzeug, die App bekommt nur fertige Assets. Kein Higgsfield-Zugriff zur Laufzeit. | präzisiert DC-107a |
| E-76 | Begriffe und Texte | Kollisionsfreie Namen (A.5). Alle Texte in `en.ts`/`de.ts`, auch Paket-, Regel- und Prefab-Namen. | wie CLAUDE.md |
| E-77 | Roadmap | Roadmap als DC-Tasks in `docs/TASKS.md` (A.11); ein Branch je Thema; Merge nur nach DM-Freigabe. | wie CLAUDE.md |

## A.3 Was der Umbau im Code bedeutet

**Entfernt (DC-122):**

- `core/build/{masonry,cliffs,water,floors,rooms,rock,generate}.ts` samt Tests, `core/cliffs.ts`
- `render/{cliffsPaint,waterPaint,detailsPaint}.ts`, der Mal-Teil von `render/drawnMap.ts`, `render/pixi/water-layer.ts`
- `app/GenerateMapDialog.tsx`, Ribbon-Knöpfe `build:wall`, `build:door`, `build:cliff`, `build:water`, `build:floor`, `build:generate`, `build:room`
- Weiterverwendet und nicht entfernt: `handDrawn.ts` (`noise2`), `variance.ts`, `strokes.ts`, `editing.ts` (Linien-Werkzeuge für Wandlinien), `dirty.ts`, `sight.ts`, `sceneDrawing.ts`, `playerDrawing.ts`. Die letzten drei werden umgebaut.

**Neu aufzubauen auf dem Raster** (nicht vergessen):

- Sicht- und Bewegungs-Wände aus Fels-Konturen, Stufenkanten (Einweg-Sicht bei steilen Klippen) und Wandlinien (`deriveWalls`)
- Leck-Prüfung (`leaks.ts`) auf Raster-Konturen
- Stockwerk-Grundfläche (`storeyShape.ts`) aus Fels- und Boden-Raster
- Katalog-Vorschaubild gezeichneter Karten (`drawingPreview`, ≤ 320 px) mit der neuen Pipeline
- Projektion (`playerDrawing`) für Raster-Blöcke, Wege, Wandlinien, Öffnungen und abgeleitete Objekte
- `mapCopy` (Karte duplizieren) für neue Listen
- Szenen-Zustand von Türen (`doors[id]`, `:found`) für die neuen Öffnungen

## A.4 Anpassungen ohne Rückfrage

Diese Punkte folgen aus festgehaltenen Regeln und gelten für Teil B:

| Thema | Anpassung (Befund) |
|---|---|
| **Einheiten** (§7.1) | Alle Koordinaten sind **Karten-px**. Das Raster richtet sich nach `GridConfig` (`cellWidth`, `cellHeight`, `originX/Y`, `rotationDeg`, Standard 70 px = 5 ft). Unterzelle = Zelle/4 in beiden Achsen, gedreht wie das Raster; neuer Einrastmodus „Viertelfeld“ nach dem Muster von „half“ (`snapToCorner`). **256 px/Feld ist nur die Master-Auflösung der Assets.** (F05) |
| **Kartengröße** (§7.1, §8.4) | Keine feste Größe: Die Fläche wächst mit dem Gezeichneten (E-33, `origin`). Block-Schlüssel sind vorzeichenbehaftet (`"-2_3"`). 150×150 ist nur Prüfkarte. (F06) |
| **Hex** (§7.1, §30) | Nur Quadratraster (E-7, DC-098). „Hex-Tiling“ in §22 ist nur eine Textur-Technik. (F07) |
| **Derived-Cache** (§8.4, §22.4) | Kein Cache in der Kartendatei. Höchstens ein Gerätecache im App-Datenordner, Schlüssel = Hash aus Absicht und App-Version, jederzeit verwerfbar. (F03) |
| **Speicherung** (§8.4, §26.3) | `MapStorageAdapter` entfällt; vorhanden sind `persistence.ts`, `readDocument`/`MIGRATIONS`, `writeDoc` mit `keepUnknown`, Autosave, Papierkorb und Archiv. Eine Karte hat keine `id`, ihr Pfad ist die Identität. (F02) |
| **IDs** (§8.3, §9.3) | Gespeicherte IDs folgen `^[a-z0-9][a-z0-9_-]{0,63}$` und werden zufällig vergeben (`newId`). Abgeleitete Schlüssel sind klein geschrieben, mit Trennzeichen außerhalb dieses Musters, z. B. `scatter:temperate.dead-tree:3_7:12`. Overrides werden als Record gespeichert, nicht als Set. (F22) |
| **Determinismus** (§9.3, P0-06) | Vorhandenes `rng`, `noise2`, `hashNoise` und `fast-check` weiterverwenden; ein Schema für Streu-IDs kommt neu dazu. (F30) |
| **Treppen** (§15) | „Treppe“ ist die Stockwerk-Treppe (E-44). Der Connector aus Teil B heißt **„Übergang“** (Klippentreppe, Rampe, Leiter, Brücke, Steg, Furt). Er geht gefiltert über die Zeichnung im Frame. (F16) |
| **Öffnungen** (§16.5) | Offen, zu und gefunden sind Szenenzustand (`doors[id]`, `<id>:found`); „verschlossen“ wird ein gemeinsamer späterer Task für alle Türen (E-33). Öffnungen in Raster-Wänden werden über ihre Position verankert, beim Ableiten rasten sie an der nächsten Fels-Kontur ein. (F18) |
| **Kopieren und Einfügen** (§19.3) | Neue IDs per `newId`, Verweise umschreiben wie `mapCopy`. Verweise auf Elemente außerhalb der Auswahl werden erkannt (keine Tür ohne Wand). Ziel sind die aktuelle Ebene und das aktuelle Stockwerk; Strg+C/X/V im globalen Handler, außer in Eingabefeldern. (F24) |
| **Ghosts** | Alle Vorschauen (Quelle, Einfügen, Übergänge) folgen dem Muster der Generator-Vorschau: nie in Historie oder Datei. |
| **TV sieht nie Verborgenes** (§9–§23) | (1) Die TV-Ableitung läuft nur auf projizierter Absicht: aktives Stockwerk, aktive Ebenen, gefundene Türen, entdeckte Bereiche, nichts Verborgenes. (2) Abgeleitete Ergebnisse des DM-Fensters gehen nie an den TV. (3) Labels, Debugger, Overlays und Klang bleiben DM-only. (4) Für jede neue Absicht-Art gibt es einen Projektionstest wie für die Geheimtür. (5) Fail-closed bleibt. Ein unentdeckter geheimer Bereich verrät weder Biom noch Boden noch abgeleitete Optik (Trampelpfade, Höhleneingang-Module, Ufer). (F14) |
| **Stockwerke** (§2, §28) | Gibt es schon (E-40, E-44). Jede neue Liste trägt `storey?` und `layer?`; das Raster liegt je Stockwerk in eigenen Blöcken. Frames für Stockwerke darunter (`below`, max. 16) beachten. (F15) |
| **i18n, Themes, Icons** | Keine fest eingebauten Texte; Paket-Metadaten zweisprachig. Karten-Overlays (Debugger, Höhenstufen) nutzen die feste Palette aus `dmOverlay.ts`, die UI-Hülle die Theme-Tokens; neue Icons kommen ins eigene Strich-Set. (F38) |
| **Lichter** (§20.4) | Lichter mit Sichtpolygonen und additiven Glows gibt es schon. Neu sind nur Einbacken für den Export und eine Nacht-Farbstimmung. (F34) |
| **Plattform** (§22.1) | WebGL2 und GLSL sind bestätigt, ebenso `pixi.js/unsafe-eval` wegen der CSP. Achtung: `renderer.ts` hat einen WebGPU-Ausweichpfad, auf dem eigene GLSL-Shader nicht laufen. Er wird abgeschaltet oder abgesichert. (F33) |
| **Klang** (§21) | Plan-Kategorien werden auf `builtin:`-Schlüssel (wind, drip, fire, rain, choir, waterfall, brook, campfire, forest, storm, sea, tavern) bzw. Geräusch-Assets abgebildet. Klang ist mono und nie auf dem TV. (F35) |
| **Bewegung** | Die App blockiert keine Bewegung. Klippen, Wasser und Brücken sind Optik plus Sicht plus Export; im Export legt ein Profil fest, ob Klippen Bewegung blockieren. |
| **Vektor-Listen** (§8.2) | Abbildung: Licht = `lights`, Klang = `sounds`, Label = `pois` bzw. Bereichsnamen, Asset = `assets` (`placementSchema`: `assetPath`, `variant`, Mitte, Drehung, Skalierung). Spiegeln wird ein optionales `flip`. (F45) |

## A.5 Begriffe (Plan → Repo)

| Begriff in Teil B | Im Projekt | Hinweis |
|---|---|---|
| `level` (Höhenstufe) | **`step`** (`terrain.step`) | `level` ist schon belegt: Stockwerkshöhe, Szenen-Lautstärke (`STATE_FIELDS`), Zeichenreihenfolge (E-28) |
| Nebel (Atmosphäre) | **Dunst** | „Nebel“ = Fog of War bzw. Living Fog |
| Raster-Ebene | **Rasterschicht** | „Ebene“ = Zeichenebene (E-28) |
| Kartenzustand | **Ebene mit Raster-Patch** (E-58) | „Zustand“ = Start- oder Spielzustand (E-3) |
| Treppe/Connector | **Übergang** (Klippentreppe …) | „Treppe“ = Stockwerk-Treppe (E-44) |
| Prefab | **Prefab** (Dateiart) | ≠ „Smart Prefab“ (E-29, einzelnes Asset) |
| `anchor` (Smart Asset) | **`placeOn`** | `anchor` = Drehpunkt eines Assets |
| Raum (Raster) | **Raum** (Werkzeug schreibt Fels-Raster) | E-45-Räume entfallen |
| Biom | **Geländebiom** | `fogBiome` = Nebelbiom, `biome` = Katalog-Landschaft |
| Variante | Kartenvariante (E-41) bzw. Asset-Variante (E-31) | je nach Kontext |
| `core/rules/` | **`core/build/rules/`** | `core/rules/` = D&D-Regeln (Würfel, 2024) |

## A.6 Datenformat Karte v14 (Skizze)

Alle neuen Felder sind **optional**. Die Migration v13→v14 setzt Standardwerte und **entfernt** die alten Bau-Felder (E-57). Endgültige Feldnamen legt der Task DC-121 fest.

> **Festgelegt mit DC-121 (E-79, E-80):** `app/src/core/build/intent.ts`. Abweichungen von der Skizze: Öffnungen haben `kind` (door, double-door, portcullis, window, arrow-slit, archway, breach) statt `type`/`window?`, dazu `material`, `hinge` (start/end) und `opensTo` (left/right); Übergänge haben `path?` statt `origin` und `lock` (ein fester `kind` ist die Sperre); Wege haben eine Grundbreite `width`; Eingänge eines Untergrunds haben eine `id` und `secret`, der Untergrund `confirm` und `leaveOff` (A.8). Jede Liste trägt `layer?` und `storey?` (A.4). Die Migration löscht zusätzlich `autoShore`, `autoGrowth` und `generated`.

```ts
// Ausschnitt MapSidecar v14 – neue Felder
terrain?: {
  stepFt: 5 | 10 | 15 | 20;                 // Höhe einer Stufe
  biomePalette: GeländeBiomId[];            // Standard aus fogBiome
  stacks: Record<StackKey, {                // StackKey = 'map' | storeyId
    base: Record<BlockKey, RasterBlock>;    // BlockKey = "cx_cy", vorzeichenbehaftet, 32×32 Felder
    layers?: Record<LayerId, Record<BlockKey, RasterPatch>>;  // Raster-Patches je Zeichenebene (E-58)
  }>;
};
// RasterBlock: { v: 1, data: string }  – Base64( Deflate( RLE( Kanäle ) ) )
// Kanäle je Stützpunkt: step:i8, relief:i16 (1/16 ft), slope:u8, solid:u8, solidStyle:u8,
//                       water:u8, ground:2×(u8 Klasse, u8 Gewicht), density:2×u8
// je Feld:             biome: 4×u8 Gewichte gegen biomePalette
// RasterPatch: wie RasterBlock plus Maske, welche Stützpunkte und Kanäle die Ebene setzt

wallLines?:  { id, points, style, thickness, height, fortified?, decay?, seed, layer?, storey? }[];
openings?:   { id, wall?: id, x, y, width, type, hinge?, style?, secret?, window? }[];   // wall fehlt = Raster-Wand
paths?:      { id, kind, nodes: { x, y, inX, inY, outX, outY, w? }[], seed, layer?, storey? }[];
crossings?:  { id, kind: 'auto' | ÜbergangsTyp, a: {x,y}, b: {x,y}, width, lock?, style?, origin: 'path' | 'manual', layer?, storey? }[];
waterSources?: { id, x, y, width, seed }[];  // nur Herkunft; das Wasser selbst ist im Raster
prefabs?:    { id, prefab: string /* wurzelrelativ */, x, y, rotation, flip?, params, layer?, storey? }[];
derived?:    { pinned: Record<Key, Pin>; suppressed: Record<Key, true>; moved: Record<Key, Xform>;
               variant: Record<Key, string>; regions: RuleRegionOverride[] };
mood?:       { sunElevation?, timeOfDay?, season?, weather?, haze?, clouds? };      // lightAngle bleibt
undergrounds?: { id, storey: storeyId, entrances: { x, y, area: Polygon }[], fade?: number }[];  // E-62, A.8
```

- **Größe:** RLE plus Deflate machen gleichförmige Flächen sehr klein. Ziel: typische Karte < 1 MB, 150×150-Prüfkarte < 3 MB. Wird das überschritten, gibt es die Entscheidung „Binärdatei“ (E-55).
- **Autosave:** Die Blöcke werden beim Speichern **pro Block** neu kodiert, nur geänderte (Dirty-Flag). `writeDoc` vergleicht wie heute.
- **Szenen:** Szenen-Zeichnungen (`drawing`) verlieren die alten Bau-Felder. Neu dürfen sie `paths` und `assets` haben (E-59); `hidden` funktioniert auch mit abgeleiteten Schlüsseln.

## A.7 Code-Struktur (ersetzt Teil B §26.1)

| Teil B nannte | Im Repo |
|---|---|
| `core` | `core/sidecar.ts`, `core/documents.ts`, `core/persistence.ts` (Schemas, Migration) und neu `core/build/terrain/` (Blöcke, Codec, Patches) |
| `geom` | `core/poly/` und neu `core/build/geom/` (Marching Squares, Offsets, Splines, Skeleton, Distanzfelder, Priority-Flood) |
| `rules` | neu `core/build/rules/` (Schema am Rand mit zod, Auswertung rein) |
| `derive` | neu `core/build/derive/` (Stufen A–J als reine Funktionen) plus `app/derive/` (Worker-Pool, Scheduler) |
| `render`, `render-fx` | `render/` und `render/pixi/` (gemeinsam für DM und TV, überwacht von `check-table-bundle`) |
| `tools` | `app/build.ts` plus neue Module in `app/` (ein Modul je Werkzeuggruppe) |
| `audio` | `core/sound.ts`, `app/audio.ts`, `app/mapSound.ts` |
| `export` | neu `core/export/` (rein: Wände, UVTT, Foundry-JSON) plus `electron/` (Schreiben über Dialog) |
| `ui` | `panels/`, `dock/`, `app/workspaces.ts` |
| Store `Zustand`, `@pixi/react` | entfällt; vorhandener Store (`useSyncExternalStore`) |
| Worker | `app/derive/worker.ts`, gebündelt von Vite. Die CSP erlaubt `worker-src 'self' blob:` schon. |

## A.8 Höhlen- und Dungeon-Eingänge (E-62)

**Ziel:** Betritt die Gruppe einen Höhleneingang an einer Klippe oder einen Dungeon-Eingang in einer Ruine, verschwindet auf dem TV das Gelände über dem Untergrund. Darunter erscheint die Höhle bzw. der Dungeon. Tiefere Geschosse sind eigene Karten.

**Umsetzung:**

1. **Untergrund = Stockwerk** (E-40) mit `level −1`, im selben Koordinatenraum, mit eigenem Fels-, Boden- und Wasser-Raster, eigenen Elementen und eigenem Nebel (`storeyFog`). Grundfläche = hohle Bereiche des Fels-Rasters (`storeyShape`).
2. **Neue Darstellungsart „Durchblick“:** Ist der Untergrund aktiv, wird die Oberfläche **nur über der Grundfläche des Untergrunds** ausgeblendet, mit weichem Rand (`fade`). Der Rest der Oberfläche bleibt sichtbar und abgedunkelt. Das ist eine Erweiterung von E-40 (dort ist heute alles darüber unsichtbar) und braucht eine Erweiterung der Projektion samt Test.
3. **Eingang:**
   - Grenzt ein Hohlraum des Untergrunds an den Fuß einer Oberflächen-Klippe, setzt die Regel-Engine dort ein **Höhleneingang-Modul** in die Klippenkette (Teil B §11.5).
   - Davor entsteht ein **Auslöse-Bereich** nach dem Muster von E-28 bzw. E-29 (`enter`, optional mit Rückfrage).
   - Dungeon-Eingänge (Treppe in einer Ruine) nutzen eine Stockwerk-Treppe (E-44) mit demselben Auslöser.
4. **Auslösen:** Eine Spielerfigur im Auslöse-Bereich schaltet die TV-Ansicht auf den Untergrund, wie bei der Gegenebene. Verlassen schaltet zurück (`leaveOff`). Der DM kann jederzeit manuell schalten.
5. **Tiefere Geschosse:** eigene Karten. Der Übergang läuft über eine **Szene je Karte** und den Szenenwechsel mit Überblendung (E-38). Eine Treppe nach unten im Untergrund bekommt einen Verweis „Weiter zu Szene …“, der den Wechsel im Orchestrator anbietet.
6. **Projektion:** Der Untergrund geht erst an den TV, wenn er ausgelöst ist. Vorher kein Höhleneingang-Detail aus einem **geheimen** Untergrund (A.4, TV-Regel). Offene Eingänge sind sichtbar, geheime erst nach Entdeckung.

## A.9 Haus-Generator im Asset-Editor (E-64)

- **Ort:** Asset-Vault › Asset-Editor (DC-109), neuer Modus „Haus erzeugen“.
- **Parameter:**
  - Grundriss auf dem Feldraster (Rechteck, L, T, U, Polygon)
  - Dachform (auto: Sattel bei Rechteck, Walm per Straight Skeleton, Kegel bei Rund) und Dachstil (Stroh, Schindel, Schiefer, Ziegel, Lehm)
  - Wandstil (Fachwerk, Bruchstein, Holz, Lehm), Türen und Fenster auf den Kanten, Schornstein, Stockwerkzahl (optisch), Seed
- **Erzeugt** (WebP in die Bibliothek, eigener Code ohne Abhängigkeit):
  - Dachbild plus Normal-Map, damit die Sonnenrichtung (E-71) stimmt
  - Jahreszeit-Varianten, z. B. Schneelast, als Varianten der Objektdatei (E-31)
  - Innenraum-Variante mit Wänden, Türen und Fenstern in Feldern (E-29), dazu Deckungsmaske (DC-108) und Anker an der Tür
- **Gespeichert:** Die Parameter liegen im Sidecar v4 unter `generator: { kind: 'house', params, seed }`. „Neu erzeugen“ überschreibt die erzeugten Bilder; wurden sie von Hand verändert, warnt der Editor vorher.
- **Verhalten auf der Karte:** wie jedes Asset mit Innenraum, also Dach für den DM durchscheinend und Innenraum auf dem TV erst nach Auslösung (E-29).

## A.10 Bedienung (ersetzt Teil B §18.1–18.3, Inhalt der Modi bleibt)

**Ribbon der Kartenschmiede:** KARTE · **GELÄNDE** · **WASSER** · **WEGE** · BAUEN · **DETAILS** · BEREICHE · HINDERNISSE · NEBEL (neu fett).

| Tab | Knöpfe (Modi aus Teil B §18.3) |
|---|---|
| GELÄNDE | Stufe · Feinhöhe · Böschung · Klippenmaterial · Biom · Boden · Viertelfeld-Fang |
| WASSER | Malen · Quelle · Wassertyp · Spiegelhöhe · Fließrichtung |
| WEGE | Weg (Bézier) · Übergang (Klippentreppe/Rampe/Leiter) · Brücke/Steg |
| BAUEN | Auswahl · Aushöhlen · Füllen · Raum · Wandlinie · Öffnung · Untergrund/Eingang |
| DETAILS | Dichte · Neu würfeln · Objekt · Asset/Stempel · Prefab |

- **Optionen** (Größe, Stärke, Stil, Typ, Modus) im schwebenden **Befehls-Panel** mit OK/Abbrechen (E-6). Ghosts übernehmen mit OK oder Enter, verwerfen mit Abbrechen oder Esc.
- **Dock-Panels** (E-39, Menü „Fenster“): Ebenen und Overlays, Eigenschaften (Inspektor), Assets und Prefabs, **Verlauf** (neu), **Regel-Debugger** (neu).
- **Modifikatoren nach E-35:** Ziehen = frei, **Shift = gerade Linie**, Klick-Klick bleibt. **Alt = Wirkung umkehren** (senken, abziehen, radieren; wie die Alt-Umkehr der Nebel-Werkzeuge) bzw. bei Linien ohne Einrasten. Alt+Klick außerhalb der Mal-Werkzeuge bleibt Ping.
- Senken, Abziehen und Ausweich-Routing gibt es zusätzlich als **Modus-Schalter im Befehls-Panel**.
- **Kürzel:** nicht in diesem Plan festgelegt, sondern mit DC-076. Nicht belegt werden dürfen: Tab (Fokus), N (DM-Nebel), R/Shift+R, V, +/− (Assets), Strg+Z/Y/S/O.
- Statusinfos (Stufe, Höhe, Bodenklasse, Biom, Rechenstatus) stehen in der vorhandenen Statusleiste.

## A.11 Roadmap als DC-Tasks (ersetzt Teil B §28)

Reihenfolge angepasst: Weil die Bauwerkzeuge sofort wegfallen (E-57), kommen **Fels, Dungeon und Wandlinien direkt nach dem Gelände**. Sie sind für Sicht und Spiel am wichtigsten. Eingetragen in `docs/TASKS.md` §3.9 (DC-121 – DC-137), je Phase ein Branch.

| Phase | Tasks | Kern-Abnahme |
|---|---|---|
| **0 Fundament** | DC-121 Format v14 + Migration (löscht alte Bau-Felder) · DC-122 alten Bau- und Mal-Code entfernen · DC-123 Raster-Blöcke, Codec, Historie mit geteilten Blöcken, Rettungskopie in IndexedDB · DC-124 Worker-Pool, Scheduler, Dirty je Block, Worker-taugliche Malbasis · DC-125 Frame v6 mit Raster-Blöcken bei Änderung + Projektionstests · DC-126 Bench-Szene erweitert, Playwright-Bildvergleiche (Steckbrief) · DC-127 Look-Spike Klippenband | Tests, Typecheck, Build grün; Bench ≥ 60 FPS; Größenmessung Format |
| **1 Gelände + Render-Pipeline** | Stufe, Feinhöhe, Böschung, Klippen (Kontur, Band, Lippe, Material, 1D-Module), Boden- und Biom-Raster mit Splat-Shader, Schatten und AO, Chunk-Bake und Detailstufen, Einweg-Sicht an steilen Stufen, Viertelfeld-Fang, Raster über Bildkarten (E-60), Katalog-Vorschau | Prüfkarten 1, 2; Bench |
| **2 Fels, Dungeon, Wandlinien** | Aushöhlen, Füllen, Raum, Wandlinien inkl. Linienbau-Stile und Wehrmauer, Öffnungen, Sicht- und Bewegungs-Wände, Leck-Prüfung, Stockwerk-Grundfläche, Raumerkennung, Bodenplatten per WFC, Untergrund mit Eingängen (A.8) | Prüfkarte 6; Projektionstests Geheimtür und Untergrund |
| **3 Wasser** | Wasser-Raster, Wasserkörper und Überlauf, Fließfeld, Wasser-Shader, Wasserfälle, Quellen-Werkzeug, Ufer | Prüfkarte 3; Bench |
| **4 Regel-Engine + Gemäßigt** | Regel-Schema, Umweltfelder, Streuung aller Typen, Overrides, Dichte-Pinsel, Debugger, Gemäßigt-Paket | „Lager am Abbruch“ wie Referenz 1 |
| **5 Wege und Übergänge** | Bézier-Wege, Wegtypen, Ausweich-Routing, Übergänge (Klippentreppe, Rampe, Leiter), Brücken, Stege, Furten | Prüfkarten 4, 5 |
| **6 Bearbeitung** | Auswahl, Kopieren und Einfügen der Absicht, Raster-Patches je Ebene (E-58), Smart Assets v4, Prefab-Dateiart, Stempel, Verlauf-Panel | Prüfkarte 9 (Ebene „Damm gebrochen“) |
| **7 Stimmung und Klang** | Sonnenhöhe, Tageszeit, Jahreszeit, Wetter, Dunst, Wolken, Nacht-Farbstimmung, abgeleitete Klangquellen, Vorhören | Positionen bleiben stabil; Bench |
| **8 Export** | Bild, Foundry-Szene, UVTT, Druck als PNG-Serie | Import in Foundry ohne Nacharbeit |
| **9 Haus-Generator** | Modus im Asset-Editor (A.9) | Haus mit L-Grundriss und Walmdach |
| **10 Biome, Generator, Stil-Modell** | Dungeon/Höhle-, Sumpf-, Wüste-, Winter-Paket; Generator neu (Dungeon, Höhle, Wildnis); Stil-LoRA | Prüfkarte je Biom |

**Grobe Größenordnung:** 55–80 Vollzeit-Wochen, Asset-Produktion parallel. Der Ersatz von Renderer, Dungeon und Wasser macht es mehr als im ersten Plan, das vorhandene Fundament (Speicherung, Szenen, Stockwerke, Projektion, UI) spart Arbeit.

**Vor Phase 0:**

- Offene Bench-Läufe DC-107a/f und den Benchmark mit Stockwerk (DC-020) dokumentieren, damit eine Vergleichsbasis besteht.
- Vom DM einen **Archiv-Export** aller Kampagnen anlegen lassen (E-57 löscht ohne Sicherung).

## A.12 Offene Punkte

| # | Punkt | Wann |
|---|---|---|
| O-A1 | Grenzwert für die Rastergröße in der `.map.json`; ab wann Binärdatei (E-55) | DC-123, nach Messung |
| O-A2 | Sichtmodell für Fallgitter (offen/zu) und Schießscharte („eingeschränkt“): neue Wandart, ändert Projektion und Frame | Öffnungs-Task Phase 2 |
| O-A3 | Untergrund: eigener Nebel vs. Kartennebel, Dauer der Überblendung, Verweis auf tiefere Karten (Szene) | Phase 2 |
| O-A4 | Druckauflösung: 256 dpi (Master) oder Hochskalieren auf 300 dpi | Phase 8 |
| O-A5 | Foundry-Zielversion (v12 oder v13) | Phase 8 |
| O-A6 | Bildverarbeitung der Entwickler-Pipeline: ohne neue Abhängigkeit über Chromium (Playwright) oder mit `sharp` (Steckbrief) | vor der Asset-Produktion |
| O-A7 | Zuordnung `fogBiome` → Standard-Geländebiom neuer Karten | entschieden: E-78 |
| O-A8 | Lizenz: Nutzungsbedingungen von Higgsfield für Auslieferung und späteren Verkauf; Rechte an einem Stil-LoRA | vor Phase 10 |

---

# Teil B – Fachkonzept (erstes Interview, angepasst)

## 1. Kurzfassung

Du malst **Absicht**, der Editor malt das **Bild**.

Du sagst nur, *was* wo sein soll: höher, tiefer, Wasser, Fels, Weg, Raum, Wand. Der Editor leitet daraus ab, *wie* es aussieht:

- Klippen mit passendem Gestein
- Wasserfälle, die exakt in die Klippe passen
- Treppen, die sich in die Kante schneiden
- Ranken, die über Abbrüche hängen
- Geröll am Klippenfuß
- zertrampelter Boden an Wegrändern

Das alles geschieht **deterministisch**, **lokal** und **sofort**.

Technisch besteht das System aus drei Schichten:

1. **Absicht (Intent):** wenige, vom Nutzer gemalte Daten-Ebenen auf einem feinen Unterraster (4×4 pro 5-ft-Feld), dazu Vektor-Objekte (Wege, Wände, Treppen, Assets). Nur das wird gespeichert.
2. **Ableitung (Derive):** eine Pipeline aus Analyse-Schritten. Sie berechnet Höhe, Klippenkonturen, Wasserflüsse, Feuchte, Besonnung, aufgelöste Bodenarten, Modulwahl (WFC/Constraint-Solving) und Streuobjekte (Regel-Scatter). Sie läuft in Web Workern, chunkweise und nur dort, wo sich etwas geändert hat.
3. **Darstellung (Render):** prozedurale Meshes (Klippenbänder, Ufer, Wände, Dächer, Wasser), Shader (Boden-Splatting, Wasser, Schatten, Atmosphäre) und instanzierte Sprites. Gezeichnet wird mit PixiJS 8.

Daraus fallen Foundry-Wände, Licht, Sound-Quellen, animierte Ebenen und Druck-Exporte automatisch mit ab.

---

## 2. Getroffene Entscheidungen

> **Stand vor dem Abgleich mit dem Repo.** Überholt durch Teil A: Speicherung → E-55, A.6 · Kartengröße und Etagen → A.4 · Bauwerke v1 und Gebäude → E-64 · Dungeon-Zeichnen → E-48 · Wege → E-63 · Ausgabe/Szenenpaket → E-61, E-74 · Bearbeitung/Kartenzustände → E-58 · Eingabe und UI → E-67 · Feedback/Renderer/Worker → E-52, E-53 · Prefabs → E-65 · Grafiken/Higgsfield → E-75.

| Bereich | Entscheidung |
|---|---|
| **Plattform** | Electron 45 · React 19 · PixiJS 8; Arbeitsbereich „Kartenschmiede“ im bestehenden D&D-Verwaltungstool |
| **Zweck** | Erst privat, später evtl. Produkt → Assets austauschbar, Lizenzen sauber dokumentieren |
| **Ausgabe** | PNG/WebP, Foundry (Wände/Licht/Sound), Druck; Übergabe an Spielmodus (TV) inkl. animierter Ebenen |
| **Speicherung** | So wie im Tool bereits gelöst → Editor liefert ein serialisierbares Kartendokument, Anbindung über Speicher-Adapter |
| **Höhenmodell** | Ganze Höhenstufen (erzeugen Klippen) + stufenlose Feinhöhe (Hügel, Böschungen); Wände als eigene Ebene; Höhlen durch Aushöhlen |
| **Formgebung** | Feines Unterraster (4×4 pro Feld) + organische Glättung |
| **Look** | Klassische D&D-Draufsicht, Klippen als Band mit Gesteinsschichten, Schlagschatten, Kantenlicht |
| **Auflösung** | 256 px pro 5-ft-Feld (Asset-Master) |
| **Kartengröße** | Bis ca. 150×150 Felder → Chunks, Streaming, gekachelter Export |
| **Etagen** | Später (Datenmodell vorbereitet) |
| **Wasser** | Malen mit automatischer Fließrichtung **und** Quellen-Werkzeug mit übernehmbarem Fluss-Vorschlag |
| **Biome** | Kartenbiom + Biom-Pinsel (grob) + Bodenart-Pinsel (fein) |
| **Biome v1** | Gemäßigt (Referenz zuerst) → Dungeon/Höhle → Sumpf/Moor → Wüste/Badlands → Winter/Hochgebirge |
| **Details** | Automatisch + gezielt übersteuern (löschen, verschieben, fixieren, Dichte-Pinsel) |
| **Bauwerke v1** | Natürliche Höhlen, gemauerte Dungeons, Gebäude mit Dächern, Brücken/Stege/Palisaden |
| **Dungeon-Zeichnen** | Grob aus dem Fels hauen + Räume als Flächen + Wandlinien zur Unterteilung, alles am feinen Unterraster |
| **Durchgänge** | Türen, Doppeltüren, Geheimtüren, Fallgitter, Fenster, Schießscharten, Torbögen, Durchbrüche |
| **Treppen** | Über Kante ziehen + automatisch aus Wegen + Klick auf Kante mit Anfassern; passen sich bei Geländeänderung an |
| **Brücken** | Typ automatisch (Spannweite, Tiefe, Biom, Wegtyp), überschreibbar |
| **Wege** | Strich wird zum Spline; Freihand, Editor ergänzt Treppen/Furten/Brücken; Umschalt = Ausweich-Routing |
| **Stimmung** | Lichtstimmung im Editor, animierte Ebenen, Licht- und Wanddaten, automatische Sound-Quellen mit Vorhören |
| **Schatten** | Sonne pro Karte einstellbar (Richtung, Länge, Tageszeit) |
| **Licht-Export** | Beim Export wählbar: eingebacken oder nur als Daten |
| **Atmosphäre** | Nebel/Dunst, Wolkenschatten, Wetter (Regen/Schnee), Jahreszeiten |
| **Feedback** | Live, ohne Animation |
| **Bearbeitung** | Kopieren der *Absicht*; eigene + mitgelieferte Prefabs; Stempel mit Variation; Undo + Kartenzustände |
| **Eingabe / UI** | Maus + Tastatur; einfach mit einblendbarer Profi-Ebene |
| **Grafiken** | Eigen erstellt + Higgsfield-KI (vorab in einer Pipeline) + Shader-Details; Stil stufenweise (Stil-Bibel → eigenes LoRA) |
| **Entwicklung** | Allein mit KI-Coding → Aufgaben mit klaren Abnahmekriterien |
| **Hardware** | Mittelklasse-PC |

### Anpassungen, die sich bei der Ausarbeitung ergeben haben

Überholt durch Teil A: Renderer und Rechnen → E-52, E-53 (WebGL2, Worker-Pool mit Transferables, kein WebAssembly); Prefabs → E-65 und E-68; Höhlen in Außenkarten → E-62 (A.8).

---

## 3. Stilanalyse der Referenzkarten

Aus den vier Referenzbildern lassen sich Stilregeln ableiten. Sie sind verbindlich für Regeln, Shader und Assets.

| # | Beobachtung | Umsetzung im Editor |
|---|---|---|
| S1 | **Kontaktschatten überall:** Klippenfüße, Waldränder und Objektbasen sind deutlich abgedunkelt (Bild 1, 4). | AO-Pass aus Höhenfeld + Distanz zum Klippenfuß + Vegetationsdichte; Kontaktschatten-Sprite unter jedem Objekt |
| S2 | **Vegetation bricht harte Kanten:** Farn- und Rankenvorhänge hängen über Klippenkanten, Büsche überlappen Ufer (Bild 1, 2). | Regeltyp „hängend“ und „Kantensaum“; Objekte werden *über* dem Klippenband gezeichnet |
| S3 | **Klippen sind geschichtete Bänder:** dunkelbraune Strata, oben heller Rand, unten tiefe Abdunklung; Bandbreite wächst mit der Höhe (Bild 1, 2 rechts). | Strip-Mesh mit Strata-Textur, v-Koordinate von Kante bis Fuß, Lippen-Overlay, Fuß-AO |
| S4 | **Nie leere Flächen:** Grundtextur + Flecken (Moos, Erde, Laub) + Kleinstreuung (Grasbüschel, Steinchen, Zweige). | Drei Detail-Ebenen pro Boden: Makro-Variation (Shader), Decals, Mikro-Scatter |
| S5 | **Erdige, gedämpfte Palette mit Akzenten:** rote Beeren, gelbe Büsche, rote Pilze (Bild 1, 3). | Paletten pro Biom; Akzent-Regeln mit geringer Dichte und Clusterbildung |
| S6 | **Klare Silhouetten:** dunkle Konturlinie um Objekte, handgemalte Texturen. | Asset-Spezifikation: 2–3 px Kontur bei 256 px/Feld |
| S7 | **Wasser:** hell und türkis am Ufer, dunkler zur Mitte; Schaumränder an Ufern und Hindernissen (Bild 2). | Wasser-Shader mit Tiefenfarbverlauf, Uferschaum aus Distanzfeld, Strömungsschaum an Hindernissen aus dem Fließfeld |
| S8 | **Waldränder:** dichter Wald als zusammenhängende Kronendecke mit dunklem Innenschatten am Rand (Bild 3, 4). | Kronendach-Cluster bei hoher Dichte; Randschatten über Distanzfeld zur Waldkante |
| S9 | **Kleine Erosionskanten:** flache Abbrüche und Gräben ohne taktische Bedeutung (Bild 1). | „Erosionskanten“ aus steiler Feinhöhe: kosmetisches, niedriges Klippenband ohne Wand-Export |
| S10 | **Nebel liegt in Senken und über Wasser** (Bild 4). | Höhenabhängiger Nebel + Wasser-Bonus, animiertes Rauschen |

---

## 4. Grundprinzipien: Warum es sich natürlich anfühlt

1. **Absicht statt Pixel.** Jeder Pinselstrich ändert Daten, keine Grafik. Dadurch kann das Ergebnis sich jederzeit neu an die Umgebung anpassen. Genau das macht Townscaper und Tiny Glades aus.
2. **Lokalität.** Eine Änderung wirkt nur in ihrer Umgebung. Jede Zufallsentscheidung wird aus der *Weltposition* abgeleitet: `seed = hash(Karten-Seed, Regel-ID, quantisierte Position)`. Malst du rechts einen Hügel, bleibt der Baum links exakt stehen.
3. **Stabilität.** Gleiche Absicht ergibt immer dasselbe Bild. Undo stellt den Zustand pixelgenau wieder her, und auch Kopieren und Einfügen ist vorhersagbar.
4. **Immer gültig.** Der Solver liefert immer ein Ergebnis. Für jede Situation gibt es ein Fallback-Modul, das notfalls schlicht aussieht, aber nie kaputt. Konflikte werden als Hinweis markiert und blockieren nichts.
5. **Ein Werkzeug, das Richtige tun.** Werkzeuge lesen den Kontext unter dem Cursor:
   - Der Treppen-Ghost rastet an der Klippe ein.
   - Der Zaun folgt der Kante.
   - Wasser über einer Klippe wird zum Wasserfall.
   - Ein Weg durch einen Bach wird zur Furt.
6. **Vorschau vor dem Klick.** Jedes Werkzeug zeigt beim Hovern einen Ghost dessen, was passieren wird: Treppe, Brücke, Flussverlauf, Raumumriss.
7. **Plateau-Logik beim Höhenmalen.** Ein Strich setzt die Fläche auf *Startstufe ± 1*, statt bei jedem Überstreichen weiter zu stapeln. So entstehen saubere Terrassen, auch wenn man mehrfach über dieselbe Stelle fährt.
8. **Übersteuern ohne Verlust.** Fixierte, gelöschte oder verschobene Details bleiben beim Neuberechnen erhalten, weil sie über stabile IDs an ihre Regeln gebunden sind.
9. **Live ohne Animation.** Grundformen (Höhe, Klippen, Wasser, Boden) aktualisieren sich in jedem Frame. Details folgen mit wenigen Frames Verzögerung, erscheinen ohne Einblend-Effekt und flackern nicht: Objekte mit gleicher ID behalten ihr Sprite.

---

## 5. So fühlt es sich an: Arbeitsabläufe

> Werkzeuge und Tasten in diesem Abschnitt sind nach A.10 zu lesen: Werkzeuge über die Ribbon-Tabs, **Alt** statt Umschalt zum Senken bzw. Umkehren, Ghosts mit OK bzw. Enter übernehmen. Neue Karten entstehen im Katalog über „Neue gezeichnete Karte“, ohne feste Größe.

### 5.1 Lager am Abbruch (wie Referenz 1)

1. Neue gezeichnete Karte im Katalog, Geländebiom „Gemäßigt“. Der Boden ist sofort „Auto“: Gras/Erde-Mix mit Grasbüscheln, Steinchen und Laub.
2. **Gelände-Werkzeug (H)**: Einen breiten Strich im Norden ziehen. Die Fläche wird Stufe +1, rundherum entsteht ein Erdklippen-Band (Δ = 10 ft). Oben hängt ein Grasüberhang über die Kante, am Fuß liegen dunkle AO und etwas Geröll. Wo der Boden oben feucht und moosig ist, hängen Farn- und Efeuvorhänge herab.
3. Mit **Alt** einen gewundenen Graben quer durch die Mitte malen (Stufe −1). Die Klippen zeigen automatisch nach innen und der Graben wird zur Schlucht.
4. **Bodenart „Fels“** auf die obere Kante malen. Das Klippenmaterial wechselt dort zu Granit, die Ranken werden spärlicher, das Geröll gröber.
5. **Asset-Browser → Prefab „Lagerplatz“** setzen. Der Boden darunter wird plattgetreten (Erde + Asche), Holzklötze entstehen als Sitze. Das Lagerfeuer bringt eine Lichtquelle und einen Feuer-Sound mit, Gras im Radius verschwindet.
6. Ein **Weg** vom Lager zum Plateau zeichnen. An der Klippe entsteht automatisch eine Erdtreppe mit Holzbohlen-Stufen, eingeschnitten in die Kante.
7. Mit dem **Dichte-Pinsel** im Süden „mehr Totholz“ malen.
8. Einen Totbaum, der stört, anklicken und löschen. Er bleibt gelöscht, auch wenn sich das Gelände später ändert.

### 5.2 Bach mit Wasserfall

1. Ein Plateau auf Stufe +2 malen, links davon tiefer Boden auf 0.
2. **Quellen-Werkzeug**: Auf das Plateau klicken. Ein Ghost-Fluss sucht sich den Weg bergab, mäandert und stürzt über die Kante. Unten füllt er eine Senke zu einem Teich und fließt über den Überlauf weiter.
3. Mit dem Mausrad die Breite anpassen, mit „Neu würfeln“ im Befehls-Panel variieren und mit **OK** übernehmen.
4. Ergebnis:
   - An der Kante wird das Klippenband zum Wasserfall-Modul mit nassem, dunklem Fels daneben, Gischt am Fuß und Moos im Sprühbereich.
   - Der Teich hat einen flachen Wasserspiegel und Uferschaum.
   - Der Bach bekommt Strömungsschaum hinter Steinen.
   - Sound-Quellen entstehen automatisch: Wasserfall (Punkt), Bach (Linie), Teich (leise).
5. Später das Plateau auf Stufe +3 anheben: Der Wasserfall wird höher und lauter, die Gischt stärker.

### 5.3 Dungeon aus dem Fels

1. Neue Karte, Kartenbiom „Dungeon“. Die Fläche ist zunächst massiver Fels (schraffierte Draufsicht).
2. **Fels-Werkzeug → Aushöhlen (Stil: gemauert)**: Einen Gang und einen großen Saal grob ausmalen. Gemauerte Wände entstehen am Rand, mit Säulen an den Ecken. Der Boden bekommt Steinplatten, die per WFC aus großen und kleinen Platten zusammengesetzt werden.
3. **Raum-Werkzeug (Rechteck)**: Eine exakte Kammer an den Saal anfügen. Die Flächen verschmelzen.
4. **Wandlinie**: Den Saal mit einer dünnen Trennwand teilen.
5. **Öffnungen → Geheimtür** auf die Trennwand setzen. Sie sieht aus wie Wand und wird nach Foundry als Geheimtür exportiert.
6. **Aushöhlen (Stil: Höhle)** an einer Ecke: Eine Naturhöhle geht organisch aus dem Mauerwerk hervor, mit einem Durchbruch-Modul (Geröll) am Übergang, Stalagmiten und Pfützen.

### 5.4 Dorf am Fluss (wie Referenz 2)

1. Mit Feinhöhe leichtes Gefälle von Norden nach Süden modellieren, dann einen Fluss als Fläche malen. Die Fließrichtung ergibt sich aus dem Gefälle.
2. Rechts mit Stufe −1 eine Schlucht malen. Erdklippen, Büsche und Beerensträucher erscheinen am Rand.
3. **Asset-Vault › Haus-Generator** (A.9): Grundriss und Satteldach aus Schindeln wählen, erzeugen. Das Haus-Asset auf der Karte platzieren; für den DM ist das Dach durchscheinend, der TV zeigt den Innenraum erst nach Auslösung (E-29).
4. Einen Weg als Spline vom Haus zur Brücke ziehen. Am Fluss setzt sich automatisch eine Holzbalkenbrücke, weil die Spannweite 3 Felder beträgt und der Wegtyp „Feldweg“ ist.

---

## 6. Kernkonzept: Absicht → Ableitung → Darstellung

```
 ┌───────────────┐   Patch    ┌───────────────┐  dirty   ┌─────────────────────┐
 │  Werkzeuge    │──────────▶│ Intent-Store  │────────▶│ Scheduler (Chunks)  │
 │ (Eingabe, UI) │  (Command) │ Raster + Vektor│  Rects   │ Prioritäten, Halo   │
 └───────────────┘            └───────────────┘          └─────────┬───────────┘
        ▲                                                           │ Jobs
        │ Ghost/Preview                                             ▼
 ┌──────┴────────┐  Mesh-/Sprite-Diffs  ┌───────────────────────────────────────┐
 │  Renderer     │◀─────────────────────│ Worker-Pool: Ableitungs-Pipeline      │
 │  (PixiJS 8)   │   (Transferables)    │ A Höhe → B Konturen → C Wasser → D    │
 └───────────────┘                      │ Felder → E Boden → F Strukturen → G   │
                                        │ Module (WFC/DP) → H Scatter → I       │
                                        │ Emitter → J Render-Daten              │
                                        └───────────────────────────────────────┘
```

- **Intent** ist klein, verlustfrei und editierbar. Er wird gespeichert und ist Grundlage für Undo, Kopieren und Raster-Patches je Ebene (E-58).
- **Derived** ist ein reiner Cache. Er wird beim Laden aus dem Intent neu berechnet und kann optional als Ladebeschleuniger mitgespeichert werden.
- **Overrides** (fixiert, unterdrückt, verschoben) sind Intent und beziehen sich auf stabile IDs abgeleiteter Objekte.

---

## 7. Raster, Koordinaten und Höhenmodell

### 7.1 Einheiten

> Angepasst nach A.4: Koordinaten in **Karten-px**, Raster nach `GridConfig`, keine feste Kartengröße, nur Quadratraster.

| Begriff | Wert | Bemerkung |
|---|---|---|
| **Feld** | `grid.cellWidth` × `grid.cellHeight` Karten-px (Standard 70 px = 5 ft) | Taktisches Raster, nur Quadrate (E-7); bei Bildkarten eingemessen und ggf. gedreht |
| **Unterzelle** | Feld/4 in beiden Achsen | Malraster aller Raster-Schichten; Einrastmodus „Viertelfeld“ |
| **Stützpunkt** | Ecke einer Unterzelle | Rasterwerte liegen auf Stützpunkten (Dual-Grid, §10) |
| **Block** | 32×32 Felder = 128×128 Unterzellen | Einheit für Berechnung, Speicherung (A.6), Render-Cache und TV-Übertragung; Schlüssel vorzeichenbehaftet |
| **Stufe** (`step`) | Standard 10 ft (pro Karte 5/10/15/20 ft) | Ganzzahl −8 … +15 |
| **Asset-Master** | 256 px pro Feld | Nur für Texturen und Assets (E-70); die Darstellung skaliert nach Kamera bzw. TV-Kalibrierung |

Die Fläche wächst mit dem Gezeichneten (E-33). Eine Prüfkarte mit 150×150 Feldern hat 601×601 Stützpunkte (≈ 361 000) in 5×5 Blöcken.

### 7.2 Höhe = Stufe + Feinhöhe

```
H(p) = level(p) · stufenhöhe + relief(p)      (in ft)
```

- **`level`** (Int8): ganze Stufe. **Nur Stufenwechsel erzeugen Klippen.** Klippen sind damit immer gewollt, planbar und taktisch eindeutig.
- **`relief`** (Float16, ±20 ft): stufenlose Feinhöhe für Hügel, Mulden, Gefälle, Flussbetten. Sie erzeugt **nie** eine taktische Klippe, beeinflusst aber:
  - Schattierung (Hillshade) und Schattenwurf
  - Fließrichtung des Wassers, Nebel, Feuchte
  - Bewuchs (Hangneigung, Exposition)
  - **Erosionskanten** (S9): Wo die Feinhöhe steiler als ein Schwellwert ist (Standard 45°), entsteht ein kosmetisches, niedriges Abbruchband ohne Wand-Export. Pro Karte abschaltbar.
- **`slopeMask`** (UInt8, Böschungsmaske): Wo gesetzt, wird der Stufensprung zu einem Hang verschmiert:
  ```
  H = lerp(H_roh, blur(H_roh, r), slopeMask)
  ```
  Dabei ist `r` die Böschungsbreite. Ab `slopeMask > 0,5` entfällt die Klippe. So entstehen Erdrampen, Böschungen und weiche Übergänge.

### 7.3 Warum dieses Modell

- Dungeons und Wände brauchen harte, exakte Kanten. Das leisten Stufen und das Fels-Feld.
- Natürliches Gelände braucht weiche Formen. Das leisten Feinhöhe und Böschung.
- Höhlen und Räume liegen auf einer eigenen Ebene (`solid`, siehe §8). Sie sind unabhängig von der Höhe und kombinierbar, etwa eine Höhle unter einem Plateau.

---

## 8. Datenmodell

### 8.1 Raster-Ebenen (Intent, pro Chunk, auf Stützpunkten)

> Nach A.5 heißen diese „Rasterschichten“, `level` heißt `step`. Speicherform siehe A.6. Böden in Räumen entstehen aus Bodenklassen im Raster.

| Ebene | Typ | Inhalt |
|---|---|---|
| `level` | Int8 | Höhenstufe |
| `relief` | Float16 | Feinhöhe in ft |
| `slopeMask` | UInt8 | Böschung / Rampe (0–255) |
| `solid` | UInt8 | Fels-Dichte, weich für glatte Konturen; ≥ 128 = massiv |
| `solidStyle` | UInt8 | Wandstil des Felsrands: Höhlenfels, Mauerwerk (Varianten), Holz, Lehm … |
| `groundClass` | 2×UInt8-Paare | Top-2-Bodenklassen + Gewicht (Splat); Klasse 0 = „Auto“ |
| `biome` | 4×UInt8 (pro **Feld**) | Gewichte gegen eine Chunk-Palette von max. 4 Biomen |
| `water` | UInt8 | Wasser-Absicht (0–255, weiche Kante) |
| `density` | 2×UInt8 (pro Feld) | Dichte-Multiplikator Vegetation / Geröll (0 = kahl, 128 = normal, 255 = doppelt) |
| `materialOverride` | UInt8 (sparse) | Übersteuertes Klippen- oder Ufermaterial |

**Speicherbedarf:** ca. 17 Byte pro Stützpunkt, also ≈ 6 MB roh bei 150×150. Komprimiert sind es typischerweise < 1 MB, weil große Flächen gleichförmig sind.

### 8.2 Vektor-Entitäten (Intent)

> Abbildung auf das Repo (A.4, A.6): `WallLine` → `wallLines` · `Opening` → `openings` · `Connector` → `crossings` („Übergang“) · `Building` entfällt (Häuser sind Assets, E-64) · `LineStructure` → Stil einer Wandlinie · `AssetInstance` → `assets` (vorhanden) · `Light`/`SoundSource` → `lights`/`sounds` (vorhanden) · `Label` → `pois` bzw. Bereichsnamen · `Path` → `paths` (Bézier, E-63).

| Entität | Kerndaten |
|---|---|
| `Path` | Bézier-Spline, Breite (variabel), Wegtyp, Kantenstil, Priorität |
| `WallLine` | Polylinie (Stützpunkte am Unterraster), Material, Dicke, Höhe (voll/halb/Geländer) |
| `Opening` | Ziel-Wand (dick oder Linie), Parameter t, Breite, Typ, Zustand (offen/zu/verschlossen), Stil |
| `Connector` | Treppe/Rampe/Leiter/Brücke/Steg/Furt: Endpunkte unten/oben bzw. Ufer A/B, Breite, Typ (auto/fest), Stil |
| `Building` | Grundriss-Polygon, Wandstil, Dachstil, Dachform (auto/fest), Dach sichtbar |
| `LineStructure` | Palisade, Zaun, Mauer, Hecke: Polylinie, Typ, Tore |
| `AssetInstance` | Asset-ID (bestehendes Asset-System), Transform, Variante, Smart-Asset-Parameter |
| `PrefabInstance` | Prefab-ID, Transform, Parameter, Verknüpfung (aktiv/aufgelöst) |
| `WaterSource` | Quellpunkt, Breite, übernommener Fluss (als Wasser-Patch) |
| `Light`, `SoundSource` | Manuell gesetzte Quellen (automatische sind abgeleitet) |
| `Label` | Raumnamen, Notizen (nicht im Bild-Export) |

### 8.3 Overrides (Intent)

> Nach A.4: Schlüssel klein geschrieben (z. B. `scatter:temperate.dead-tree:3_7:12`), gespeichert als Record (`suppressed: Record<Key, true>`), damit JSON und `keepUnknown` funktionieren.

```ts
type DerivedId = string; // z.B. "scatter:temperate.deadTree:c3_7:i12"
interface Overrides {
  pinned:     Record<DerivedId, PinnedObject>;  // eingefroren inkl. Transform/Variante
  suppressed: Set<DerivedId>;                    // gelöscht
  moved:      Record<DerivedId, Transform>;      // verschoben, bleibt regelgebunden
  variant:    Record<DerivedId, string>;         // Variante getauscht
  ruleParams: RegionOverride[];                  // z.B. „Ranken ×0.3“ in Polygon
}
```

### 8.4 Kartendokument

Ersetzt durch **A.6 (Karte v14)**. Es gibt kein eigenes `MapDocument`: Die Karte bleibt ein `MapSidecar` (`library/<name>.map.json` bzw. `<bild>.dm.json`), gelesen über `readDocument` mit Migration und geschrieben mit `keepUnknown`.

- **Entfällt:** `settings.size` (mitwachsende Fläche), Karten-`id` (der Pfad ist die Identität), `rulesetLock` (E-51: Optik überall neu), `derivedCache` (höchstens Gerätecache, A.4), `states` (E-58: Raster-Patches je Ebene).
- **Seeds** je Element bzw. Block; `baseBiome` wird `terrain.biomePalette`, Standard aus `fogBiome`.

---

## 9. Generierungs-Pipeline

### 9.1 Stufen

Jede Stufe ist eine reine Funktion `(Intent, Ergebnisse vorheriger Stufen, Chunk + Halo) → Ergebnis`. Der **Halo** gibt an, wie weit über den Chunk hinaus gelesen werden muss. Eine Änderung erweitert das Dirty-Rechteck pro Stufe um deren Halo.

| Stufe | Name | Ergebnis | Halo | Live beim Malen? |
|---|---|---|---|---|
| **A** | Höhe | `H`, Normalen, Neigung, Krümmung, Hillshade | 2 Felder (Böschungs-Blur) | ja, jeder Frame |
| **B** | Konturen | Klippenkonturen (oben/unten, Δh, Material), Fels-Ränder, Erosionskanten, Distanzfelder (zu Kante/Fuß) | 2 | ja |
| **C** | Wasser | Wasserkörper, Spiegelhöhen, Tiefe, Fließfeld, Wasserfälle, Uferlinien | ganzer Wasserkörper* | ja (vereinfacht), voll nach Strich |
| **D** | Umweltfelder | Feuchte, Besonnung/Exposition, Windexposition, Distanz zu Wasser/Wegen/Wänden, Schneemaske | 6 | gedrosselt (10 Hz) |
| **E** | Boden | Aufgelöste Bodenmaterialien (Biom × Klasse × Regeln), Decal-Masken | 1 | ja |
| **F** | Strukturen | Wege (Rasterung, Kreuzungen), Connectors (Einpassung), Wände, Öffnungen, Räume, Gebäude, Dächer | 2 | ja (betroffene Entitäten) |
| **G** | Module | Modulwahl entlang Ketten (DP) und in Flächen (WFC) | 1 Kettensegment / 2 Felder | gedrosselt |
| **H** | Scatter | Streuobjekte mit stabilen IDs | 2 | gedrosselt, voll nach Strich |
| **I** | Emitter | Lichter, Sound-Quellen, Partikel-Emitter, Animationsdaten | 1 | nach Strich |
| **J** | Render-Daten | Vertex-Puffer, Instanz-Listen, Masken-Texturen | – | jeweils nach Stufe |

\* Seen sind global: Eine Änderung am Ufer kann den Spiegel eines ganzen Sees ändern. Deshalb arbeitet Stufe C pro **Wasserkörper**, nicht pro Chunk. Das ist günstig, weil Wasserkörper klein sind und gecacht werden.

### 9.2 Scheduler

- **Während eines Strichs:** Die Stufen A, B, E und F laufen für betroffene Chunks mit höchster Priorität. Liegen sie unter etwa 4 ms, laufen sie direkt im Main-Thread-Fast-Path, sonst im Worker mit einem Frame Latenz. C, D, G und H laufen gedrosselt mit niedriger Priorität.
- **Nach dem Strich** (Pointer-Up): Voller Durchlauf aller Stufen für das Dirty-Rechteck plus Halo.
- **Veraltete Jobs** werden verworfen (Generation-Counter pro Chunk).
- **Ergebnis-Diffs:** Der Renderer bekommt nur geänderte Instanzen (nach stabiler ID) und neue Puffer. So flackert nichts.

### 9.3 Determinismus und stabile IDs

> Vorhanden und weiterverwendet: `rng` (mulberry32), `noise2`, `hashNoise`, `changedRegion`. Schlüssel nach A.4.

- PRNG: eigener PCG32 oder Hash (z.B. xxHash32/Murmur3) über `(seed, regelId, gx, gy, index)`. **Nie `Math.random()`.**
- Scatter-Kandidaten sind an **Weltgitterzellen** gebunden: Jede Regel hat ein Kandidatengitter mit einem Kandidaten pro Zelle und Jitter aus dem Hash. Ob ein Kandidat angenommen wird, entscheiden die Regeln. Ändert sich lokal etwas, ändern sich nur die Annahmen in der Nähe.
- ID eines Streuobjekts: `scatter:{regelId}:{zellX}_{zellY}:{k}`. Ein Override bleibt dadurch auch nach Neuberechnung gültig.
- **Verwaiste Pins:** Ein fixiertes Objekt, dessen Regel es nicht mehr erzeugen würde, bleibt bestehen und wird im Profi-Overlay markiert.

---

## 10. Wo WFC, wo Regeln, wo Meshes

Reine Wave Function Collapse über die ganze Karte ist für einen *interaktiven* Editor ungeeignet. Sie arbeitet global, kann sich in Widersprüche laufen und erzeugt bei kleinen Änderungen große Sprünge.

Die bewährte Lösung, so arbeiten auch Townscaper und Tiny Glades sinngemäß, kombiniert vier Techniken, jede dort, wo sie stark ist:

| Problem | Technik | Beispiele |
|---|---|---|
| **Fallunterscheidung an Gitterpunkten** (Ecke innen/außen, Endstück, T-Stück) | **Dual-Grid / Marching Squares**: Die 4 Ecken einer Zelle ergeben einen Fallindex, das Modul folgt direkt daraus. Deterministisch, ohne Backtracking. | Klippenecken, Wandecken, Säulen, Zaunpfosten, Dachgrate |
| **Kontinuierliche, organische Formen** | **Kontur → Spline → Strip-Mesh** (prozedurale Mesh-Generierung) | Klippenbänder, Ufer, Wege, Mauern, Wasserfälle, Dachflächen |
| **Diskrete Modulwahl entlang von Ketten** | **1D-Constraint-Kette, exakt gelöst per dynamischer Programmierung (Viterbi)**. Module haben „Sockets“ an den Enden; Kosten bestrafen Wiederholung und belohnen Kontexttreffer. | Klippensegmente (glatt, Riss, Wurzeln, Vorsprung, Höhleneingang, Wasserrinne), Mauerabschnitte (Pilaster, Fackelhalter, Riss), Uferränder, Zaunfelder, Brückenteile |
| **Diskrete Muster in Flächen** | **WFC mit lokaler Neulösung**: fixierter Rand aus den Nachbarn, Backtracking-Limit, garantiertes Fallback-Modul | Dungeon-Bodenplatten (1×1, 1×2, 2×2 Unterzellen), Mosaike, Beete und Feldraster, Geröllfelder, Dachziegel-Ausbesserungen |
| **Streuung von Objekten** | **Regelbasierter Scatter**: Bedingungen auf Feldern, Poisson-Disk, Ausschlussradien, Cluster | Bäume, Büsche, Grasbüschel, Pilze, Geröll, Ranken, Schilf |

### 10.1 1D-Ketten-Solver (Kernstück)

```
Eingabe:  Kette von n Segmenten (je ~1 Feld Bogenlänge)
          pro Segment: erlaubte Module M_i (Kontext: Wasserfall erzwingt "nass",
          Treppe erzwingt "Einschnitt", Höhleneingang erzwingt "Höhle")
          Socket-Kompatibilität  compat(a.rechts, b.links)
Kosten:   c(i, m) = Grundkosten(m) + Kontextkosten(i, m) − Vielfalt(m, Hash(i))
          Übergang t(a, b) = ∞ wenn inkompatibel, + Wiederholungsstrafe wenn a == b
Lösung:   Viterbi O(n · |M|²) → global optimal entlang der Kette
Lokalität: Ketten werden an "Ankern" (Ecken, Kontextzwängen) in Abschnitte zerlegt;
          neu gelöst wird nur der Abschnitt, in dem sich etwas geändert hat.
```

Sockets bei Klippen beschreiben die Höhenlage der Gesteinsschichten an den Segmentgrenzen, z.B. `strata: [0.2, 0.55, 0.8]`, und ob oben eine Rankenmatte oder Überhang anliegt. So laufen Schichtlinien nahtlos von Modul zu Modul.

### 10.2 WFC für Flächen

- Kachelsatz pro Muster mit Kanten-Sockets; Gewichte für Häufigkeit.
- Gelöst wird nur das Dirty-Rechteck. Die Zellen am Rand werden aus der bestehenden Lösung fixiert.
- Entropie-Heuristik mit deterministischem Tie-Break über den Positionshash.
- Nach 3 Backtracking-Versuchen wird lokal auf das Fallback-Modul gesetzt (z.B. eine 1×1-Platte).

---

## 11. Klippen-System

### 11.1 Konturextraktion

1. Für jeden Stufenübergang k|k+1 läuft Marching Squares auf `level` (Schwelle k + 0,5). Das ergibt Polylinien mit **Oberseite** (höher) und **Unterseite**.
2. **Mehrstufige Sprünge:** Konturen verschiedener Schwellen, die näher als ε = 0,3 Feld beieinander liegen, werden zu **einer** hohen Klippe mit Δh = Summe verschmolzen. Liegen sie weiter auseinander, entstehen Terrassen.
3. Wo `slopeMask > 0,5` ist, wird die Kontur unterbrochen. Die offenen Enden bekommen auslaufende Endmodule (Klippe verflacht in den Hang).
4. **Glättung:** Chaikin (2 Iterationen), danach Rauschversatz senkrecht zur Kontur. Amplitude und Frequenz hängen vom Material ab:

| Material | Amplitude | Charakter |
|---|---|---|
| Erde | 0,08 Feld | weich, wellig |
| Granit/Fels | 0,15 Feld | kantig, gezackt (zusätzlich Vorsprünge über Module) |
| Sandstein | 0,10 Feld | gestuft (quantisiertes Rauschen) |
| Mauerwerk/Holz | 0 | gerade, eckig (keine Glättung, nur Fasen) |

Das Rauschen wird über die **Weltposition** abgetastet, nicht über die Bogenlänge. Eine Änderung an einem Ende verformt das andere Ende nicht.

### 11.2 Geometrie des Bandes

In der Draufsicht wäre eine senkrechte Wand unsichtbar. Die D&D-Konvention zeigt sie trotzdem als Band auf der Unterseite:

```
Bandbreite b = Δh[ft] / 10 · p        p = Perspektivfaktor, Standard 0,45 Feld (einstellbar 0,2–1,0)
Beispiel:  10 ft → 0,45 Feld (115 px) · 20 ft → 0,9 Feld · 40 ft → 1,8 Feld (max. 2,5)
```

- **Strip-Mesh:** Die Oberkante liegt auf der Kontur, die Unterkante ist um `b` nach außen versetzt (Offset-Kurve mit Gehrung). Bei engen Innenkurven werden die Offsets geklemmt, damit sich nichts selbst schneidet.
- **UV:** `u = Bogenlänge / Texturlänge` (nahtlos), `v = 0` an der Kante und `v = 1` am Fuß.
- **Licht:** Die Normale des Bandes zeigt zur Unterseite. Helligkeit = `ambient + diffuse · max(0, dot(n, sonne))`. Bänder zur Sonne sind heller, abgewandte dunkler. Das ergibt automatisch die plastische Wirkung aus den Referenzen.
- **Taktische Kante** (Export-Wand) = Oberkante. Das Band liegt auf den unteren Feldern.

### 11.3 Schichten einer Klippe (Zeichenreihenfolge)

1. **Fuß-AO** auf dem unteren Boden: weicher, dunkler Saum mit einer Breite von 0,3–0,8 Feld je nach Δh (S1)
2. **Geröll/Talus** am Fuß (Scatter-Regel): Dichte ∝ Δh und Materialhärte, Größe nimmt mit der Distanz ab
3. **Band** mit Strata-Textur und Modulen aus der 1D-Kette
4. **Lippe** (Overlay auf der Oberseite): Grasüberhang, Wurzeln, bröckelnde Erde, Schneekappe, Sandkante
5. **Hängendes** (Scatter-Regel „hängend“): Ranken, Efeu, Farnvorhänge, Wurzeln. Länge ∝ Δh · Zufall, nur bei ausreichender Feuchte und Material Erde/Fels
6. **Schlagschatten** aus dem Schatten-Pass (§20.2)

### 11.4 Material-Auflösung

```
klippenMaterial = materialOverride
               ?? solidStyle (bei Fels-/Dungeonrändern)
               ?? biom.cliffRules.match({ bodenklasseOben, Δh, feuchte, biom })
```

Beispiel Gemäßigt:

- Erde bei Gras, Erde oder Waldboden oben und Δh ≤ 20 ft
- sonst Fels
- Sandstein bei Bodenklasse Sand
- Mauerwerk bei Pflaster oder Weg-Typ Kopfstein (Stützmauer)

Verfügbare Materialien v1:

- Erde, Fels (Granit), Sandstein, Kalkstein, Lehm (Badlands), Torf/Schlamm (Sumpf, nur niedrige Ufer)
- Eis, Schnee-Überzug (Overlay, kein eigenes Material)
- Höhlenfels, Mauerwerk (3 Stile), Holz (Bohlen-Stützwand)

### 11.5 Module entlang der Klippe

| Modul | Kontext/Zwang | Socket-Besonderheit |
|---|---|---|
| Glatt A/B/C | Standard | Strata durchgehend |
| Riss | Zufall, häufiger bei Fels | – |
| Wurzeln | Baum auf Oberseite < 1 Feld | Lippe „Wurzel“ |
| Vorsprung | Fels, Δh ≥ 20 ft | ragt 0,2 Feld über Band hinaus |
| Rinne (trocken) | Fließfeld zeigt über die Kante, aber kein Wasser | – |
| **Wasserfall** | Wasserkörper kreuzt Kante | Breite = Wasserbreite, erzwungen |
| **Treppen-Einschnitt** | Connector „eingeschnitten“ | Breite = Treppenbreite, erzwungen |
| **Höhleneingang** | Hohlraum (`solid`) grenzt an Unterseite | erzwungen |
| Ecke außen/innen | Krümmung > Schwelle | Dual-Grid-Fallindex |
| Auslauf | Konturende an Böschung | Band verjüngt sich auf 0 |

---

## 12. Wasser-System

### 12.1 Von der Absicht zum Wasserkörper

1. `water ≥ 128` ergibt eine Wassermaske. Zusammenhängende Komponenten **pro Stufe** sind Wasserkörper-Kandidaten.
2. **Klassifikation** über das Gefälle von `H` innerhalb der Komponente:
   - **Stehend** (See, Teich, Pfütze, Sumpfwasser): flacher Spiegel = niedrigste Randhöhe (Spill-Point). Tiefe = Spiegel − H.
   - **Fließend** (Bach, Fluss): Mittellinie (Skelett der Maske) → Richtung von hoch nach tief → Fließfeld aus dem geglätteten Gradienten entlang der Mittellinie. Die Geschwindigkeit ∝ Gefälle und invers zur Breite.
3. **Verbindung über Stufen:** Kreuzt die Maske eine Klippenkontur (Wasser oben und unten verbunden), entsteht ein **Wasserfall**. Fließrichtung immer von oben nach unten.
4. **Zufluss ohne Abfluss:** Endet ein Fluss in einer Senke, füllt er sie als See (Hinweis im Overlay, kein Fehler).

### 12.2 Quellen-Werkzeug (Fluss-Vorschlag)

```
1. Start am Klickpunkt, Richtung = steilster Abstieg in H.
2. Schritt für Schritt: Richtung = normalize(−∇H · 1.0 + Trägheit · 0.6 + Mäanderrauschen · 0.25)
3. Klippe erreicht → Wasserfall, weiter unten.
4. Senke erreicht → Priority-Flood (Barnes et al.) füllt bis zum Überlauf → See, weiter am Spill-Point.
5. Stopp: Kartenrand, bestehendes Wasser, max. Länge.
6. Breite wächst langsam mit der Länge (Zuflussgefühl), Mausrad skaliert.
```

- Ergebnis als **Ghost**. **OK** bzw. Enter übernimmt (schreibt einen `water`-Patch), **Abbrechen** bzw. Esc verwirft, „Neu würfeln“ im Befehls-Panel variiert das Mäandern.
- Übernommenes Wasser ist normale Absicht und lässt sich danach frei weitermalen.

### 12.3 Wasserfall

- **Geometrie:** derselbe Strip wie das Klippenband im Abschnitt der Wasserbreite, zusätzlich mit sanftem Bauch (leicht nach außen gewölbt) und weichen Alpha-Rändern.
- **Shader:** Flussstreifen-Textur scrollt in v-Richtung; Geschwindigkeit ∝ Fließgeschwindigkeit; Schaum nimmt nach unten zu.
- **Umgebung (Regeln):**
  - nasser, dunkler Fels links und rechts, je 0,3 Feld (Band-Shader-Maske)
  - Gischt-Decal und Partikel am Fuß, Ring aus Schaum im Becken
  - Moos- und Farnbonus im Sprühradius (Feuchtefeld +0,4)
  - Sound-Quelle mit Lautstärke ∝ Δh · Breite
- **Mehrstufig:** Bei Terrassen entstehen Kaskaden mit einem kleinen Becken pro Stufe, sofern genug Platz ist.

### 12.4 Wasser-Darstellung

| Element | Umsetzung |
|---|---|
| Farbe | Tiefe → Verlauf (Ufer hell/türkis → Mitte dunkel), Biom-Palette (klar, moorig-braun, grün-trüb) |
| Bewegung | Flow-Map-Technik (zwei phasenversetzte Normal-Map-Samples entlang des Fließfelds); stehendes Wasser: langsames Rauschen |
| Uferschaum | Distanzfeld zur Uferlinie, Rauschen, animiert |
| Strömungsschaum | Hinter Hindernissen (Steine im Wasser, Brückenpfeiler): Fließfeld-Schatten → Schaummaske |
| Ufer | Uferlinie als Kette: Modul-DP für Saum (Schlamm, Kies, Schilf, Gras, Fels) |
| Glanz | Sonnenrichtung → schwacher Glanz auf Normalen |
| Durchsicht | Bei Tiefe < 2 ft scheint der Grund durch (Kiesel, Sand), mit Sichtbarkeit = 1 − Tiefe/2 ft |
| Eis | Jahreszeit Winter / Biom Winter: gleicher Wasserkörper, Eis-Shader (Risse, Schneeverwehungen), Fließen stoppt bei Seen, Bäche bleiben optional offen |

### 12.5 Export-relevante Wasserdaten

- Regionen: flach (< 2 ft, schwieriges Gelände), tief (Schwimmen), reißend (Fließgeschwindigkeit > Schwelle)
- Animationsdaten für den Spielmodus: Flow-Map, Tiefe, Schaummaske, Wasserfall-Strips (siehe §23.4)

---

## 13. Biome, Bodenarten und Regelwerk

### 13.1 Drei Ebenen der Steuerung

1. **Kartenbiom:** Grundeinstellung und gleichzeitig Füllwert der Biom-Ebene.
2. **Biom-Pinsel:** Gewichte pro Feld mit weichen Übergängen. Maximal 2 Biome mischen sich an einer Stelle, mehr ergibt Matsch.
3. **Bodenart-Pinsel:** Gemalt werden **abstrakte Bodenklassen**. Das Biom übersetzt sie in konkrete Texturen.

| Bodenklasse | Gemäßigt | Sumpf | Wüste/Badlands | Winter | Dungeon/Höhle |
|---|---|---|---|---|---|
| Auto | Gras/Erde-Mix nach Regeln | Matsch/Moos-Mix | Sand/Hartboden-Mix | Schnee/Fels-Mix | Steinplatten / Höhlenboden |
| Gras | Wiese kurz | Sumpfgras | Trockengras | Schneegras (Herbst) / Schnee | – |
| Hohes Gras | Wildwiese | Schilf | Steppengras | – | – |
| Erde | Braunerde | Schwarzschlamm | Rote Erde | Gefrorene Erde | Erdboden |
| Fels | Granitplatte | Moosfels | Sandsteinplatte | Granit, vereist | Höhlenfels |
| Sand/Kies | Flusskies | Schlick | Dünensand | Geröll | Kies |
| Moos | Moos | Torfmoos | – | Flechten | Höhlenmoos |
| Laub | Waldboden | Fauliges Laub | – | Nadelstreu | – |
| Pflaster | Kopfstein | Bohlen | Lehmziegel | Kopfstein, verschneit | Steinplatten |
| Schnee | – | – | – | Schnee tief | – |

- Die Palette im UI zeigt immer die **konkrete** Textur des Bioms unter dem Cursor.
- „Auto“ ist der Standard. Er entscheidet anhand von Hangneigung, Feuchte, Besonnung und Nähe zu Wegen und Klippen:
  - steil → Erde
  - feucht und schattig → Moos
  - Wegrand → zertrampelt
  - Klippenfuß → Kies/Geröll
- Gemalte Klassen überschreiben Auto, aber Regeln dürfen **Decals darüberlegen**, etwa Pfützen auf Erde bei Regen.

### 13.2 Umweltfelder (Eingaben für Regeln)

| Feld | Berechnung |
|---|---|
| `slope`, `aspect` | aus H |
| `curvature` | Laplace von H (Mulden sammeln Laub, Kuppen sind kahl) |
| `moisture` | Distanz zu Wasser (exp. Abfall) + Mulden + Wasserfall-Sprühradius + Biom-Grundwert + Wetter |
| `sun` | Hillshade + Schattenmaske (gemittelt über den Tag, nicht die aktuelle Uhrzeit, damit Bewuchs stabil bleibt) |
| `wind` | Höhe über Umgebung + Offenheit (keine Bäume/Wände in der Nähe) |
| `distCliffTop`, `distCliffFoot` | Distanzfelder aus Stufe B |
| `distWater`, `distPath`, `distWall`, `distBuilding` | Distanzfelder |
| `trampled` | Wege, Gebäudeeingänge, Smart Assets (Lagerfeuer …) schreiben „Trampelwert“ mit Abfall |
| `canopy` | Kronendichte (für Unterwuchs-Regeln, Waldrand-Schatten S8) |
| `snow` | Saison/Wetter × (1 − slope) × (1 − canopy) × Höhe |
| `room`, `roomTheme` | Dungeon: Raum-ID, optionales Raumthema |

### 13.3 Regel-Typen

| Typ | Beschreibung | Beispiel |
|---|---|---|
| `point` | Einzelobjekt, Poisson-Disk mit min. Abstand | Bäume, Findlinge, Büsche |
| `cluster` | Kernpunkt + n Satelliten | Pilzringe, Blumeninseln, Steinhaufen |
| `alongLine` | Entlang einer Kette (Kontur, Ufer, Weg, Wand) mit Abstand und Ausrichtung zur Tangente | Schilfgürtel, Zaunpfosten, Kerzen an Wänden |
| `hanging` | An Klippenoberkante, hängt über das Band, Länge ∝ Δh | Ranken, Efeu, Wurzeln, Eiszapfen |
| `talus` | Am Klippenfuß, Größe nimmt mit der Distanz ab | Geröll, Schutt |
| `decal` | Flächiger Aufkleber mit Blend-Modus | Moosflecken, Pfützen, Risse, Asche, Laub |
| `canopy` | Bäume mit verschmelzender Kronendecke bei hoher Dichte | Dichter Wald |
| `module` | Wählt Module für Ketten/Flächen (§10) | Klippensegmente, Bodenplatten |
| `emitter` | Erzeugt Licht-, Sound- oder Partikelquellen | Wasserfall-Sound, Glühwürmchen im Sumpf |

### 13.4 Regel-Auswertung

1. Reihenfolge nach `layer`: `canopy (groß)` → `point (mittel)` → `cluster` → `talus` → `alongLine` → `point (klein)` → `decal`.
2. Jede Ebene hinterlässt eine **Belegungsmaske** mit den Fußabdrücken der Objekte. Spätere Ebenen respektieren `exclude` (z.B. kein Busch im Stamm, wohl aber unter der Krone).
3. Dichte = Regeldichte × `density`-Pinsel × Regel-Overrides × Bedingungsgewicht (weiche Bedingungen liefern 0–1).
4. Varianten werden per Hash gewählt. Saison und Wetter tauschen **nur die Variante, nicht die Position**: Im Winter steht derselbe Baum kahl an derselben Stelle.

### 13.5 Regel-Format (Ausschnitt)

> Nach E-69 und A.4 wählen Regeln Assets über **Tags, Unterart und Umgebung** statt über Pfade, z. B. `"assets": { "tags": ["hanging", "ivy"], "kind": "prop" }`; Regel-IDs klein geschrieben (`temperate.cliff-ivy`). Die Engine liegt in `core/build/rules/`.

```jsonc
{
  "id": "temperate.cliffIvy",
  "type": "hanging",
  "layer": "detail",
  "when": {
    "cliff.material": ["earth", "rock"],
    "cliff.deltaFt": { "min": 10 },
    "moisture": { "min": 0.35, "soft": 0.15 },
    "sun": { "max": 0.8 },
    "season": ["spring", "summer", "autumn"]
  },
  "density": 0.55,          // Anteil der Kettensegmente
  "spacing": [0.4, 1.1],    // Felder
  "length": { "perDeltaFt": 0.06, "jitter": 0.4 },
  "assets": "temperate/hanging/ivy_*",
  "seasonVariants": { "autumn": "temperate/hanging/ivy_autumn_*" },
  "tint": { "hue": [-6, 6], "value": [-0.08, 0.05] }
}
```

```jsonc
{
  "id": "temperate.talus",
  "type": "talus",
  "when": { "cliff.deltaFt": { "min": 10 }, "cliff.material": ["rock", "earth"] },
  "density": { "base": 0.4, "perDeltaFt": 0.02, "byMaterial": { "rock": 1.0, "earth": 0.45 } },
  "reach": { "perDeltaFt": 0.05, "max": 2.0 },          // Felder vom Fuß
  "sizeFalloff": [1.0, 0.35],                            // groß am Fuß → klein weiter weg
  "assets": { "rock": "common/rubble/granite_*", "earth": "common/rubble/earthclod_*" }
}
```

### 13.6 Biome v1 im Überblick

| Biom | Klippen | Boden-Akzente | Vegetation | Geröll/Details | Wasser | Klang |
|---|---|---|---|---|---|---|
| **Gemäßigt** (Referenz) | Erde, Granit, Kalkstein | Moos, Laub, Kies | Laubbäume, Totbäume (Wurzelsterne), Büsche, Beerensträucher, Farne, Efeu, Pilze, Blumen | Findlinge, Totholz, Baumstümpfe, Äste | klar, türkis-grün, Schilf, Seerosen in stillem Wasser | Bach, Wasserfall, Vögel, Wind im Laub |
| **Dungeon/Höhle** | Mauerwerk (Quader, Bruchstein, Ziegel), Höhlenfels | Steinplatten (WFC), Höhlenboden, Pfützen | Höhlenmoos, Leuchtpilze, Wurzeln von oben | Stalagmiten, Schutt, Knochen, Spinnweben (Ecken), Fackelhalter (Mauermodule) | Tropfbecken, unterirdischer Fluss | Tropfen, Raumton, Fackeln |
| **Sumpf/Moor** | Torf, Schlamm (niedrig), Moosfels | Schlick, Torfmoos, fauliges Laub | Weiden, Mangroven-ähnliche Wurzelbäume, Schilf, Rohrkolben, Seerosen, Sumpfgras | Umgestürzte Stämme, Wurzelstöcke, Knochen | stehend, braun-grün, Algenteppich, Entengrütze | Frösche, Insekten, Blubbern |
| **Wüste/Badlands** | Sandstein (Strata rot/ocker), Lehm, Hoodoos | Dünenrippel (ausgerichtet am Wind), Risse | Kakteen, Dornbüsche, Trockengras, Palmen an Oasen | Felsbrocken, Schädel, ausgewaschene Rinnen | Oasen, trockene Flussbetten (Wasser-Absicht „trocken“) | Wind, Sandrieseln |
| **Winter/Hochgebirge** | Granit, Eis, Schnee-Überzug | Schnee, Verwehungen, Flechten | Nadelbäume (verschneit), kahle Laubbäume, Krüppelkiefern | Geröllhalden, Eisbrocken, Eiszapfen (hängend) | Eis, offene Bäche mit Eisrand | Wind stark, Knirschen, Eisknacken |

---

## 14. Wege und Straßen

> Wege sind Bézier-Splines (E-63), gespeichert als `paths` (A.6). Sie sind Optik plus Export; die App blockiert keine Bewegung.

### 14.1 Zeichnen

1. **Freihandstrich** → Ramer-Douglas-Peucker → Catmull-Rom-Fit → **kubischer Bézier-Spline** mit Anfassern.
2. **Breite** über Mausrad vor dem Strich; danach pro Kontrollpunkt änderbar.
3. **Einrasten:** Startet oder endet ein Weg nahe an einem anderen Weg (≤ 0,5 Feld), entsteht ein Knoten.
4. **Ausweich-Routing** (Modus-Schalter im Befehls-Panel, A.10):
   - A* über ein Kostenfeld zwischen Stützpunkten des Strichs
   - Kosten: Hangneigung (quadratisch), Klippen = ∞ außer an Connectors, Wasser = hoch (außer Furt-tauglich), dichte Vegetation = leicht
   - Bei Steigungen über dem Maximum des Wegtyps entstehen **Serpentinen**: Zickzack-Segmente, die quer zum Hang geführt werden.

### 14.2 Wegtypen

| Typ | Darstellung | Ränder | Besonderheiten |
|---|---|---|---|
| Trampelpfad | Erde mit Grasinseln in der Mitte | stark ausgefranst (Rauschen), Gras zertrampelt | Breite 0,5–1 Feld |
| Feldweg | Zwei Spurrillen (Tangente), Grasstreifen Mitte | ausgefranst, Pfützen in Rillen bei Regen | Spurrillen als Decal entlang Spline |
| Kopfstein | Textur entlang u/v des Splines ausgerichtet | Bordsteinkette (Modul-DP) | Kreuzungen → Platz mit radialem Muster |
| Steinplatten | Einzelne Platten als Instanzen entlang Spline, Jitter | Gras zwischen Platten | Trittstein-Optik |
| Bohlenweg | Bohlen quer, Pfosten | – | Im Sumpf auch über flachem Wasser (Steg) |
| Dungeon-Pfad | – | – | In Dungeons übernimmt die Bodenklasse den Weg |

### 14.3 Wirkung auf die Umgebung

- Streuobjekte werden auf Breite + Rand freigeräumt. Bäume weichen nur mit dem Stamm aus, Kronen dürfen überhängen.
- `trampled`-Feld entlang des Wegs: Gras wird kürzer, Erde blitzt durch.
- **Kreuzungen:** Knoten mit ≥ 3 Wegen werden zu einem Platzflecken. Optionale Regel: Wegweiser bei Kreuzungen von ≥ 2 Feldwegen.
- **Hindernisse** (Freihand-Modus, Editor ergänzt):

| Weg kreuzt … | Ergebnis |
|---|---|
| Klippe Δ1 | Treppe oder Rampe (Typ aus Wegtyp/Material), siehe §15 |
| Klippe Δ ≥ 2 | Treppe mit Podest; Hinweis „Serpentine?“ |
| Wasser < 1,5 ft, langsam | Furt (Kies, Strömungsschaum) bzw. Trittsteine bei Trampelpfad |
| Wasser tiefer/schneller | Brücke (Typ auto, §15.4) |
| Wand/Fels | Hinweis, kein automatischer Durchbruch |

---

## 15. Treppen, Rampen, Leitern, Brücken

> Im Projekt heißen diese **Übergänge** (`crossings`, A.6); „Treppe“ bleibt die Stockwerk-Treppe (E-44).

### 15.1 Gemeinsames Konzept „Connector“

Ein Connector speichert **Absicht**, keine Geometrie: zwei Endpunkte (unten/oben oder Ufer A/B), Breite, Typ (`auto` oder fest) und Stil. Bei jeder Neuberechnung wird er **neu eingepasst**:

1. Klippenkontur(en) zwischen den Endpunkten suchen, Kreuzungspunkt und Tangente bestimmen.
2. Δh ermitteln und den Typ prüfen (auto: neu wählen; fest: passt er noch?).
3. Geometrie erzeugen, Klippen-Kette mit Zwangsmodul (Einschnitt) versorgen, Scatter freiräumen.

### 15.2 Treppen setzen (drei Wege)

| Methode | Ablauf |
|---|---|
| **Über die Kante ziehen** | Unten drücken, über die Klippe ziehen, oben loslassen (oder umgekehrt). Der Ghost zeigt Treppe, Laufrichtung und Stufenzahl. Breite = Pinselbreite (Mausrad). |
| **Klick auf Kante** | Beim Hovern über einer Klippenkante erscheint ein Ghost mit Standardbreite 1 Feld. Klick setzt die Treppe. Anfasser: Breite (Seiten), Position entlang Kante (Mitte), Auskragung (vorne). |
| **Automatisch aus Wegen** | Weg kreuzt Klippe → Connector mit `origin: path`. Er folgt dem Weg, wenn dieser verschoben wird. |

### 15.3 Typwahl und Bauweise

| Situation | Typ | Bauweise |
|---|---|---|
| Fels/Erde, Δ1, genug Platz | Treppe **eingeschnitten** | Band bekommt Einschnitt-Modul, Stufen im Einschnitt, Seitenwangen aus Klippenmaterial |
| Holz/Mauerwerk-Klippe oder Dungeon | Treppe **vorgebaut** | Stufen ragen auf die Unterseite, Wangen aus Mauerwerk/Holz |
| Erde, Weg Trampelpfad | Erdtreppe | Holzbohlen-Kanten, Erde dazwischen |
| `slopeMask`-Rampe oder Weg Feldweg | **Rampe** | lokale Böschung (schreibt `slopeMask` als *abgeleitete* Maske, nicht in den Intent) |
| Δ ≥ 2, Platz für Lauflänge | Treppe mit Podest | Podest alle 2 Stufen |
| Δ ≥ 2, wenig Platz | Vorschlag: Leiter/Wendeltreppe | Hinweis-Badge mit Ein-Klick-Annahme |
| Breite < 0,5 Feld | Leiter | Sprite-Kette (Holz/Seil/Eisen nach Biom) |

**Material:**

- Fels → Steinstufen, gehauen
- Erde → Holz + Erde
- Mauerwerk → Quaderstufen
- Holz → Holztreppe
- Eis → Stufen mit Schneekante

Die Stufenzahl im Bild ist dekorativ: ca. 1 Stufe pro 0,25 Feld Lauflänge.

### 15.4 Brücken und Stege

**Zeichnen:** Von Ufer zu Ufer ziehen oder automatisch aus einem Weg. Der Ghost zeigt Typ, Spannweite und Pfeiler.

**Typwahl (auto):**

| Bedingung (erste passende gewinnt) | Typ |
|---|---|
| Spannweite ≤ 1 Feld, Wasser | Planke / Baumstamm |
| Schlucht Δ ≥ 2 Stufen und Spannweite ≥ 4 | Hängebrücke (Seil, Holzplanken, durchhängend) |
| Wegtyp Kopfstein/Steinplatten und Spannweite ≤ 6 | Steinbogenbrücke (Brüstung, 1–3 Bögen) |
| Biom Sumpf oder Wasser flach & breit | Bohlensteg auf Pfählen |
| sonst, Spannweite ≤ 8 | Holzbalkenbrücke (Geländer, Pfeiler alle 3 Felder im flachen Wasser) |
| sonst | Holzbalkenbrücke mit Pfeilern + Hinweis |

- **Deckhöhe** = höheres Ufer. Bei Höhendifferenz entsteht eine Rampe auf der Brücke oder Stufen am niedrigeren Ende.
- **Pfeiler** stehen nur dort, wo die Wassertiefe < 6 ft oder Boden ist. Ist das nicht möglich, wird ein Typ ohne Pfeiler (Bogen, Hängebrücke) bevorzugt.
- **Steg-Werkzeug:** vom Ufer ins Wasser ziehen → Anlegesteg mit Pfählen. Endet er im Wasser, wird er zum Bootssteg (optionales Boot-Prefab).
- **Override:** Typ im Inspektor fest einstellen. Danach passt der Editor nur noch Länge, Pfeiler und Anschlüsse an.

### 15.5 Verhalten bei Geländeänderung

| Änderung | Reaktion |
|---|---|
| Δh ändert sich | Stufenzahl und Länge passen sich an; Podeste kommen hinzu oder fallen weg |
| Δh überschreitet Typ-Maximum | Badge „Zu steil – Serpentine/Leiter?“; bis zur Annahme bleibt die Treppe (gestreckt) erhalten |
| Klippe verschwindet | Treppe wird zum Wegstück (bei `origin: path`) bzw. zum Hinweis „Treppe ohne Klippe“ (entfernen/behalten) |
| Kante verschiebt sich | Connector wandert mit, solange der Kreuzungspunkt innerhalb von 2 Feldern bleibt |
| Ufer ändern sich | Brücke verlängert oder verkürzt sich; Typ wird bei `auto` neu bewertet |

---

## 16. Dungeons und Höhlen

### 16.1 Zwei Datenschichten, drei Werkzeuge

| Datenschicht | Wofür | Werkzeuge |
|---|---|---|
| **`solid` + `solidStyle`** (Raster, Unterraster) | Massiver Fels vs. Hohlraum; daraus entstehen **dicke Außenwände** | **Aushöhlen** (Pinsel, Stil Höhle/gemauert), **Füllen**, **Raum** (Rechteck, Polygon, Kreis, Freihand) |
| **Wand-Kantennetz** (Vektor, Stützpunkte am Unterraster) | **Dünne Wände** innerhalb von Hohlräumen (Trennwände, Zellen, Nischen) | **Wandlinie** (Polylinie; Winkel 0/45/90° rasten ein, **Alt** = frei zwischen Stützpunkten) |

Alle Öffnungen hängen an beiden Wandarten.

### 16.2 Wanderzeugung

- **Gemauert:**
  - Rand von `solid` per Marching Squares → Polygon-Vereinfachung → Ecken auf Stützpunkte gerastert → **keine Rauschverformung**
  - Wand-Strip: Draufsicht der Mauerkrone (0,25 Feld dick) + innere Kante mit Fuß-AO
  - Ecken und Säulen über Dual-Grid-Fallindex
  - Lange Wandläufe bekommen Module per 1D-DP: Pilaster alle 3–5 Felder, Fackelhalter (mit Licht-Emitter), Risse, Nischen, Wandbanner (selten)
- **Höhle:** gleicher Rand, aber mit Rauschen und Höhlenfels-Strip. Das Klippen-System wird wiederverwendet, mit Δh = Raumhöhe und dunkler, enger Bandbreite.
- **Übergang Mauer ↔ Höhle:** Treffen beide Stile aufeinander, entsteht ein **Durchbruch-Modul** mit Geröllfächer und abgebrochenen Steinen.

### 16.3 Räume

- Hohlräume werden per Flood-Fill in Räume zerlegt, begrenzt durch dicke Wände, Wandlinien und **geschlossene** Türen.
- Pro Raum: ID, Fläche, optionaler Name/Label, Bodenmaterial (überschreibbar), optionales **Raumthema** (Kerker, Krypta, Lager, Bibliothek …; ab Phase 10, Regeln für passende Einrichtung).
- Räume sind die Einheit für Raumton (Sound), Foundry-Regionen und den Raum-Zauberstab (Auswahl).

### 16.4 Böden

- Steinplatten per **WFC** auf dem Unterraster: Module 1×1, 1×2, 2×1, 2×2 Unterzellen mit Fugen; Ausrichtung am Raum; zufällige Bruch- und Moosvarianten.
- Höhlenboden: Splat aus Höhlenfels, Kies, Erde, Pfützen in Mulden (`relief`).
- Holzdielen in Gebäuden: Richtung = längere Raumachse.

### 16.5 Öffnungen

| Typ | Darstellung | Foundry-Export |
|---|---|---|
| Tür (Holz/Eisen/Stein) | Zarge ersetzt Wandsegment; Türblatt, Zustand offen/zu | Tür-Wand (door), Zustand übernommen |
| Doppeltür | 2 Felder, zwei Flügel | Tür-Wand |
| Geheimtür | sieht aus wie Wand; Overlay-Markierung nur im Editor/SL-Ansicht | Geheimtür (secret) |
| Fallgitter | Gitter-Sprite, durchsichtig | Bewegung blockiert, Sicht/Licht frei |
| Fenster | Rahmen, Glas/offen | Bewegung blockiert, Sicht/Licht frei |
| Schießscharte | schmaler Schlitz | Bewegung blockiert, Sicht eingeschränkt |
| Torbogen | offener Bogen, Pfeiler-Module | keine Wand |
| Durchbruch | Wandlücke mit Geröll | keine Wand + Region „schwieriges Gelände“ |

**Setzen:** Hover über einer Wand zeigt den Ghost an der nächsten gültigen Position, die Breite rastet in Unterzellen ein. Ziehen entlang der Wand verschiebt die Öffnung; Öffnungsrichtung und Anschlag stehen im Befehls-Panel (Kürzel mit DC-076). Zustände (offen, zu, gefunden) sind Szenenzustand (A.4). Sichtregeln für Fallgitter und Schießscharte: offener Punkt O-A2.

### 16.6 Höhlen und Überdeckung in Außenkarten

Ersetzt durch **E-62 / A.8**: Der Untergrund ist ein Stockwerk mit der Darstellungsart „Durchblick“. Betritt die Gruppe einen Eingang (Klippen-Modul „Höhleneingang“ bzw. Ruinen-Treppe), wird das Gelände über der Grundfläche des Untergrunds ausgeblendet. Tiefere Geschosse sind eigene Karten. Ein eigenes Überdeckungs-Konzept mit Taste T gibt es nicht.

### 16.7 Darstellung des massiven Felses (Dungeon-Karten)

Pro Karte wählbar:

- **Schraffur** (klassisch): dunkler Grund mit Strichschraffur entlang der Wände, ausblendend nach 1–2 Feldern
- **Fels-Draufsicht:** dunkle Felstextur
- **Schwarz**

---

## 17. Gebäude und Linienbauten

### 17.1 Gebäude

Ersetzt durch **E-64 / A.9**: Häuser bleiben **Assets** mit Innenraum, Auslösern und Deckungsmaske (E-29). Der **Haus-Generator im Asset-Editor** erzeugt aus Grundriss, Dachform (Sattel, Walm per Straight Skeleton, Kegel), Dach- und Wandstil, Türen und Fenstern die Bilder (Dach plus Normal-Map, Jahreszeit-Varianten, Innenraum, Deckungsmaske) und behält die Parameter. Die Dachflächen-Logik aus dem ersten Konzept (UV entlang der Fallrichtung, Firstkappen, Traufe, Schattierung nach Sonnenrichtung) gilt dort.

### 17.2 Linienbauten

> Nach E-64 sind das **Stile der Wandlinie** (`wallLines.style`). Die Burgmauer ist eine Wandlinie mit `fortified` (Zinnen, Türme an Ecken, Enden und alle 6 Felder, wie die bisherige Wehrmauer). Tore sind Öffnungen.

| Werkzeug | Darstellung | Blockiert | Folgt Gelände |
|---|---|---|---|
| Palisade | angespitzte Stämme, Laufgang optional | Bewegung + Sicht | rastet an Klippenoberkanten ein (Kantenfang 0,5 Feld) |
| Holzzaun | Pfosten + Latten (Modul-DP) | Bewegung (niedrig, überkletterbar) | ja |
| Trockenmauer | Bruchsteinreihe | Bewegung (halbe Deckung) | ja |
| Hecke | dichte Büsche als Kette | Bewegung + Sicht | ja |
| Burgmauer | dicke Mauer mit Zinnen (Krone), Türme an Ecken optional | Bewegung + Sicht | über Klippen hinweg mit Treppenabsätzen |

**Tore** sind Öffnungen auf Linienbauten. Kreuzt ein Linienbau einen Weg, wird automatisch ein Tor vorgeschlagen (Ghost, Klick zum Annehmen).

---

## 18. Werkzeuge und Oberfläche

### 18.1 Layout

Ersetzt durch **A.10**: Ribbon-Tabs, Befehls-Panel, Dock-Panels und Statusleiste der App.

### 18.2 Navigation

Navigation (Verschieben, Zoom, Einpassen) wie in der App. Neue Kürzel nur über DC-076 (A.10).

### 18.3 Werkzeuge im Detail

> Die **Modi** gelten. Buchstaben und Modifikatoren in den Tabellen sind durch A.10 ersetzt: Werkzeugwahl über Ribbon, **Alt** = umkehren (senken, abziehen, radieren) bzw. ohne Einrasten, **Shift** = gerade, Optionen im Befehls-Panel. Der Gebäude-Modus entfällt (E-64), Linienbauten sind Wandlinien-Stile.

#### H – Gelände

| Modus | Verhalten | Modifikatoren |
|---|---|---|
| **Stufe** (Standard) | Strich setzt Fläche auf *Startstufe + 1* (Plateau-Logik, §4.7) | **Umschalt** = −1 · **Strg** = „auf Pipetten-Stufe setzen“ · Pinselform: rund / eckig (am Feldraster) / Lasso-Füllung (Umschalter in der Optionsleiste, Taste **O**) |
| **Feinhöhe** | Weiches Heben/Senken in ft | **Umschalt** = senken · Unter-Modi: Glätten, Ebnen (auf Startwert), Aufrauen (Rauschen), Gefälle (Ziehen von A nach B legt eine Rampe in der Feinhöhe) |
| **Böschung** | Über eine Klippe malen → wird zum Hang | Breite = Pinsel; **Umschalt** = Böschung entfernen (Klippe zurück) |
| **Klippenmaterial** | Malt `materialOverride` an Klippen | Pipette übernimmt Material |

Ghost: Der Umriss der neuen Stufe zeigt beim Hovern die Kante, die entstehen würde.

#### B – Boden & Biom

| Modus | Verhalten |
|---|---|
| **Bodenklasse** | Palette (konkret fürs Biom unterm Cursor); weiche Kante über Stärke; **Umschalt** = zurück auf Auto |
| **Biom** | Grober Pinsel (Feldauflösung), weiche Übergänge; Biom-Auswahl in der Optionsleiste |
| **Füllen** | Füllt zusammenhängende Fläche gleicher Klasse (Toleranz einstellbar) |

#### W – Wasser

| Modus | Verhalten |
|---|---|
| **Malen** | Wasser-Absicht malen; Fließen und Wasserfälle ergeben sich; **Umschalt** = radieren |
| **Quelle** | Klick → Fluss-Ghost (§12.2); Mausrad = Breite; **R** = neu würfeln; Enter = übernehmen |
| **Typ** | Wasserkörper anklicken → Typ (auto, klar, trüb, Moor, gefroren, trocken) |
| **Spiegel** | Wasserkörper anklicken und ziehen → Spiegelhöhe manuell (überschreibt Spill-Point; Ghost zeigt Überflutung) |

#### P – Wege

| Modus | Verhalten |
|---|---|
| **Zeichnen** | Freihand → Spline; Mausrad = Breite; **Umschalt** = Ausweich-Routing |
| **Bearbeiten** | Anfasser verschieben; Doppelklick = Punkt einfügen; Entf = Punkt löschen; Breite pro Punkt (Alt + Mausrad) |
| **Typ** | Weg anklicken → Typ wechseln |

#### D – Fels & Dungeon

| Modus | Verhalten |
|---|---|
| **Aushöhlen** | Pinsel; Stil Höhle / gemauert (Variante wählbar) |
| **Füllen** | Pinsel; Fels zurück |
| **Raum** | Rechteck / Polygon / Kreis / Freihand; Stil gemauert/Höhle; **Umschalt** = Raum abziehen |
| **Wandlinie** | Klick-Klick-Polylinie; Winkelfang 0/45/90°; **Alt** = frei; Doppelklick beendet; Dicke dünn/normal; Höhe voll/halb/Geländer |
| **Öffnung** | Typ-Palette (Tür, Doppeltür, Geheimtür, Fallgitter, Fenster, Schießscharte, Torbogen, Durchbruch); Hover-Ghost an Wand |

#### G – Bauen

| Modus | Verhalten |
|---|---|
| **Gebäude** | Grundriss malen (wie Raum); Wand- und Dachstil in Optionsleiste |
| **Treppe/Rampe/Leiter** | Über Kante ziehen oder Klick auf Kante (§15.2); Typ auto/fest |
| **Brücke/Steg** | Von Ufer zu Ufer ziehen; Typ auto/fest |
| **Linienbau** | Palisade, Zaun, Trockenmauer, Hecke, Burgmauer; Polylinie mit Kantenfang |

#### E – Details

| Modus | Verhalten |
|---|---|
| **Dichte** | Pinsel: mehr / weniger (**Umschalt**) / kahl (**Strg**); Kategorie: alles, Vegetation, Geröll |
| **Neu würfeln** | Pinsel: Varianten und Positionen im Bereich neu (Seed-Offset pro Bereich wird als Override gespeichert) |
| **Objekt** | Klick wählt abgeleitetes oder platziertes Objekt; **Entf** = unterdrücken; Ziehen = verschieben; **N** = fixieren/lösen; **V** = nächste Variante; **Strg+Klick** = Mehrfachauswahl |
| **Asset/Stempel** | Asset oder Prefab aus Browser; Klick setzt; Ziehen = Stempel-Strich mit Abstand; Zufall für Drehung, Spiegelung, Variante, Skalierung (Optionsleiste); **R** / **Umschalt+R** = drehen; **F** = spiegeln |

#### L – Licht & Klang

| Modus | Verhalten |
|---|---|
| **Licht** | Lichtquelle setzen (Fackel, Feuer, Laterne, Magie); Radius per Ziehen |
| **Klang** | Liste automatischer Quellen; manuelle Quelle setzen (Punkt/Linie/Fläche); Klick = Inspektor |
| **Vorhören** | Hörer = Cursor; Lautstärke-Overlay; Solo/Stumm pro Kategorie |
| **Stimmung** | Panel: Tageszeit, Sonnenrichtung und Schattenlänge (Gizmo auf der Karte ziehbar), Saison, Wetter, Nebel, Wolken, Farbstimmung |

#### M – Auswahl

| Modus | Verhalten |
|---|---|
| Rechteck / Lasso | Auswahlmaske; **Umschalt** = hinzufügen, **Alt** = abziehen; weiche Kante (Feder) |
| Zauberstab | nach Stufe, Bodenklasse, Wasserkörper, Raum, Gebäude |
| Aktionen | Kopieren/Ausschneiden/Einfügen (Absicht, §19.3), Drehen 90° (**R**), Spiegeln (**F**), Höhe verschieben (**Bild↑/↓**), als Prefab speichern, Neu würfeln, Dichte setzen |

### 18.4 Overlays (Profi-Ebene)

> Overlays auf der Karte nutzen die feste Palette aus `render/dmOverlay.ts` und sind nur im DM-Fenster sichtbar.

| Overlay | Zeigt |
|---|---|
| Höhenstufen | Farbkodierte Stufen + Feinhöhen-Linien (alle 2 ft) |
| Fließen | Pfeile des Fließfelds, Wasserkörper-Grenzen, Spill-Points |
| Feuchte / Sonne / Wind | Wärmebild der Umweltfelder |
| Begehbarkeit | Wände, Klippen (taktische Kante), schwieriges Gelände, Regionen |
| Foundry-Vorschau | Exakt die exportierten Wände (Typfarben), Türen, Lichter |
| Klang | Reichweiten-Kreise, Linienquellen, Lautstärkeverlauf |
| Raster | Feld- und Unterraster |
| **Regel-Debugger** | Klick auf ein Objekt → „Erzeugt von Regel `temperate.cliffIvy`: moisture 0,52 ≥ 0,35 ✓, sun 0,41 ≤ 0,8 ✓ …“; umgekehrt: Regel auswählen → alle Objekte dieser Regel hervorheben |
| Hinweise | Konflikte (Treppe zu steil, verwaister Pin, Brücke ohne Ufer …) mit Klick → Lösungsvorschlag |

---

## 19. Bearbeitung: Verlauf, Auswahl, Smart Assets, Prefabs, Kartenzustände

### 19.1 Verlauf (Undo/Redo)

Ersetzt durch **E-56**: Die vorhandene Historie (`History`, Momentaufnahmen je Tab, E-4 und E-30) bleibt die Schnittstelle. Raster-Blöcke werden zwischen Momentaufnahmen **geteilt** (copy-on-write), nur geänderte Blöcke sind neu. Ein Strich ist ein Schritt; Ghosts kommen nie in die Historie. Neu ist ein **Verlauf-Dock-Panel** mit benannten Einträgen (Texte über i18n).

### 19.2 Auswahl

- Die Auswahl ist eine **weiche Maske** auf dem Unterraster plus eine Menge an Entitäten.
- Zauberstab-Kriterien siehe §18.3.

### 19.3 Kopieren & Einfügen der Absicht

> Nach A.4: neue IDs, Verweise wie `mapCopy` umschreiben, Ziel aktuelle Ebene und aktuelles Stockwerk; Drehen und Spiegeln über das Befehls-Panel (keine R- oder F-Kürzel, A.10).

**Kopiert werden:**

- alle Raster-Ebenen in der Maske; `level` **relativ** zur Stufe am Ankerpunkt, damit ein Hügel auf einem höheren Plateau seine Form behält
- Entitäten (geclippt bzw. ganz, wenn ihr Anker in der Maske liegt)
- Connectors, Pins und Prefab-Instanzen

**Einfügen:**

- Ghost mit **Live-Ableitung** des Einfügebereichs im Worker. Klippen und Ufer verbinden sich sofort sichtbar mit der Umgebung.
- **R** dreht in 90°-Schritten (Raster exakt). **Umschalt+R** dreht frei, nur für Vektoren; Raster werden dabei neu gerastert, mit Hinweis.
- **F** spiegelt, **Bild↑/↓** verschiebt die Stufe.
- Kantenmodus: hart oder weich ausblenden (Feder).

### 19.4 Smart Assets – Weiterentwicklung des bestehenden Asset-Systems

Nach **E-68**: Das Asset-Sidecar (heute v3: `anchor`, `door`, `interior`, `cover`, `light`, `effect`, `sizeCells`) wird **v4** mit optionalen Feldern; Migration 3→4 ist die Identität. Assets ohne neue Felder verhalten sich wie heute.

| Plan-Feld | Im Asset-Sidecar v4 |
|---|---|
| `assetId` | entfällt; Platzierungen verweisen über `assetPath` und `variant` |
| `anchor` (ground, wall, cliffTop …) | **`placeOn`** (neu); `anchor` bleibt der Drehpunkt mit Wandfang |
| `footprint` (Streu-Ausschluss) | **`footprint`** (neu, nicht dasselbe wie `sizeCells` oder `cover`) |
| `requires` | **`requires`** (neu) |
| `terrain` (ebnen, Bodenklasse, Decal, Freiräumen, Trampelwert) | **`terrain`** (neu) |
| `emitters.light` | vorhandenes **`light`** (`brightFt`, `dimFt`, `color`, `flicker`) |
| `emitters.sound` | **`sound`** (neu, `builtin:`-Schlüssel oder Geräusch-Asset) |
| `emitters.particles` | vorhandenes **`effect`** bzw. neu |
| `foundry.walls` | vorhandenes **`cover`** bzw. Innenraum-Wände |
| `shadow.heightFt` | **`shadow`** (neu) |
| `variants`, `seasonVariants` | Varianten der **Objektdatei** (E-31), Saison als Variantenname |
| `tintable` | **`tint`** (neu) |
| `provenance` | **`provenance`** (neu, optional) |
| Kategorie-Standards | über **Tags** bzw. neue eingebaute Unterarten (die heutigen sind zu grob, z. B. `prop/nature`) |

Bearbeitet wird im vorhandenen **Asset-Editor** (DC-109). **Prefabs** sind eine eigene Dateiart (E-65): `library/<name>.prefab.json` mit relativem Raster-Ausschnitt, Assets (wurzelrelative Pfade) und Parametern. Platziert werden sie über die Kartenliste `prefabs`, verknüpfte Instanzen aktualisieren sich, „Auflösen“ backt mit neuen IDs ein. Mitgelieferte Biom-Prefabs und der Stempel mit Variation bleiben wie im ersten Konzept.

### 19.5 Kartenzustände

Ersetzt durch **E-58**: Bauliche Veränderungen sind **Zeichenebenen mit Raster-Patches** (z. B. Ebene „Damm gebrochen“ ändert Höhe und Wasser, das Fließen wird neu berechnet). Szenen schalten Ebenen wie heute (E-28), auch per Auslöse-Bereich. Die Patches werden nach der Ebenen-Reihenfolge übereinandergelegt. Stimmungen (Winter, Nacht) laufen über Kartenvariante bzw. Szenen-Stimmung (E-41, E-71). Ein eigenes Zustands-System gibt es nicht.

---

## 20. Licht, Schatten, Atmosphäre

### 20.1 Sonne und Tageszeit

> Nach E-71: Die Richtung kommt aus dem vorhandenen `lightAngle` (Standard 45° = Licht von links oben = Azimut 315°). Neu sind Sonnenhöhe, Tageszeit, Jahreszeit und Wetter unter `mood` (A.6). Alles ist nur Optik; `ambient` (dunkel/hell) bleibt der Schalter für Sichtregeln.

| Parameter | Standard | Wirkung |
|---|---|---|
| Azimut | 315° (Licht von oben links, wie in den Referenzen) | Schattenrichtung, Klippenband-Helligkeit, Dachflächen |
| Elevation | 50° | Schattenlänge (`L = Höhe / tan(Elevation)`) |
| Tageszeit | Mittag | Setzt Azimut/Elevation/Farbe als Vorgabe; Gizmo auf der Karte ziehbar |
| Farbstimmung | aus Tageszeit | Licht- und Umgebungsfarbe, LUT-Farbkorrektur (Morgen, Mittag, Abend, Dämmerung, Nacht) |

### 20.2 Schattenwurf (2,5D)

1. **Verdeckungs-Höhenkarte** (halbe Auflösung): Gelände `H` + Wände (Höhe) + Objekte (Kronen als Kuppel-Sprites mit Höhenkanal, z.B. Baum 25 ft, Busch 4 ft) + Dächer.
2. **Raymarching-Pass** (Fragment-Shader): Für jeden Pixel in Richtung Sonne laufen. Liegt die Verdeckung über dem Sonnenstrahl, ist der Pixel beschattet. Die Halbschatten-Schätzung über den Abstand zum Verdecker ergibt weiche Ränder.
3. **Weichzeichnen** (separabler Blur) → Schattenmaske → multipliziert auf Boden und Wasser.
4. Neuberechnung nur für Dirty-Chunks + Schattenlänge als Halo. Bei Änderung der Sonne wird alles neu berechnet (< 200 ms angestrebt bei 150×150).

So werfen Klippen, Mauern, Bäume und Häuser konsistent Schatten, auch auf tiefere Stufen und über Klippen hinweg.

### 20.3 Umgebungsverdeckung (AO)

- **Gelände-AO:** Krümmung + Distanz zum Klippenfuß (stark, S1) + Mulden.
- **Waldrand-AO** (S8): Distanzfeld zur Kronendecken-Kante, innen dunkler.
- **Kontaktschatten:** jedes Objekt bekommt ein weiches Ellipsen-Sprite, skaliert nach dem Footprint.
- **Wand-AO:** Fuß-Saum entlang innerer Wandkanten.

### 20.4 Lichtquellen

> Vorhanden (Lichter mit Sichtpolygonen und additiven Glows). Neu sind nur Einbacken für den Export und die Nacht-Farbstimmung.

- Licht-Akkumulationspuffer mit additivem Licht. Die Verdeckung durch Wände und Klippen wird über 2D-Sichtpolygone berechnet (wie VTT-Lichter).
- Im Editor immer als **Vorschau**. Beim Export ist wählbar: **eingebacken** (Druck/Bild) oder **nur Daten** (Foundry/Spielmodus).
- Nacht: Umgebungslicht dunkel und bläulich; Lichtquellen tragen die Szene.

### 20.5 Atmosphäre

> „Nebel & Dunst“ heißt im Projekt **Dunst** (A.5). Alle Atmosphäre-Ebenen liegen **unter dem Fog of War**. Wiederverwendbar aus Living Fog sind Rauschen und Partikel-Code, nicht der Shader selbst.

| Ebene | Umsetzung | Animiert (Spielmodus) |
|---|---|---|
| **Nebel & Dunst** | Dichte = f(niedrige H, Nähe zu Wasser, Feuchte) × Karteneinstellung; 2 Rausch-Oktaven | ja, langsames Driften |
| **Wolkenschatten** | Großskaliges Rauschen, multipliziert auf die Szene | ja, Windrichtung/-geschwindigkeit |
| **Regen** | Nasser Shader (dunkler, glänzender) auf Boden/Fels; Pfützen in lokalen Minima der Feinhöhe; Ringe auf Wasser; Regenpartikel nur im Spielmodus | Partikel + Ringe |
| **Schnee** | `snow`-Feld: Schneedecke auf flachen, offenen Flächen; Schneekappen auf Klippenlippen, Dächern, Mauerkronen; Verwehungen an Hindernissen (Lee-Seite) | Schneefall-Partikel |
| **Jahreszeiten** | Regel-Eingang: Laubfarbe (Varianten), kahle Bäume (Winter), Blumen-Bonus (Frühling), Laubstreu-Decals (Herbst), Eis (Winter, je nach Biom) | – |

Wetter und Jahreszeit sind **Stimmungsparameter**: Positionen bleiben stabil, nur Varianten, Decals und Shader ändern sich.

---

## 21. Klang-Quellen

> Nach E-72: Abgeleitete Quellen entstehen in der **vorhandenen Klang-Engine** (E-37) mit festen Schlüsseln (z. B. `water~fall~3_7`); Kategorien werden auf `builtin:`-Loops bzw. Geräusch-Assets abgebildet. Szenen regeln die Lautstärke über `soundLevels`; die Hörposition im Spiel bleibt nach E-37 (die Figur, die am lautesten hört). Vorhören in der Kartenschmiede mit der Testfigur (E-43) statt mit dem Cursor. Klang ist mono und nie auf dem TV.

### 21.1 Automatische Quellen (Emitter-Regeln je Biom)

| Quelle | Geometrie | Lautstärke/Reichweite | Bedingungen |
|---|---|---|---|
| Wasserfall | Punkt am Fuß | ∝ Δh · Breite | – |
| Bach/Fluss | Linie entlang Mittellinie, segmentiert (≈ 6 Felder) | ∝ Fließgeschwindigkeit · Breite | – |
| See/Teich | Linie entlang Ufer (leise) | ∝ Fläche (gedeckelt) | – |
| Wind | Fläche: hohe Exposition + Höhe | ∝ Wind-Feld | Wetter verstärkt |
| Wald | Fläche: Kronendichte | konstant | Tageszeit: Vögel tags, Grillen/Eulen nachts |
| Sumpf | Fläche: Biom Sumpf | konstant | Frösche abends/nachts, Insekten Sommer |
| Feuer/Fackel | Punkt (von Smart Assets / Wandmodulen) | aus Asset-Metadaten | – |
| Höhlentropfen | Punkte in Höhlen nahe Feuchte | leise | – |
| Raumton | Fläche = Raum | nach Raumgröße | Dungeon |

- **Zusammenfassen:** Nahe, gleichartige Quellen werden geclustert. Ziel sind < 40 Quellen pro Karte.
- **Datenformat:** Kategorie-ID (z.B. `water.waterfall.large`), keine Datei. Das Verwaltungstool ordnet Kategorien seiner Soundbibliothek zu.
- **Übersteuern:** wie bei Streuobjekten (unterdrücken, verschieben, Lautstärke/Radius ändern, fixieren).

### 21.2 Vorhören im Editor

- Web Audio API, Hörer = Cursor (oder ein gesetzter „Hörer-Pin“)
- Distanzdämpfung nach Quelle; Linien/Flächen über nächsten Punkt; optional Dämpfung durch Wände
- Mitgelieferte **Vorschau-Loops** pro Kategorie (kurz, lizenzfrei); im Spielmodus nutzt das Verwaltungstool seine eigenen Sounds
- Solo/Stumm pro Kategorie, Master-Lautstärke, Overlay mit Reichweiten

---

## 22. Rendering-Architektur (PixiJS 8)

### 22.1 Backend-Entscheidung

Nach **E-52 und E-53**:

- **WebGL2** (`preference: 'webgl'`, wie heute), eigene Shader nur in GLSL ES 3.0, CSP-konform mit `pixi.js/unsafe-eval`. Der WebGPU-Ausweichpfad in `renderer.ts` wird abgeschaltet oder abgesichert.
- **Worker-Pool von Anfang an** (N = Kerne − 1), Daten per Transferables. Kein SharedArrayBuffer, kein WebAssembly, keine Änderung an CSP oder Headern. Die Malbasis ist Worker-tauglich (OffscreenCanvas, kein `document.createElement('canvas')`).
- Die **neue Pipeline ersetzt die Canvas-2D-Kachelmalerei** für DM und TV vollständig. Jede Ebene muss den TV-Benchmark bestehen.

### 22.2 Szenenaufbau (Zeichenreihenfolge)

> Einordnung in die vorhandene Reihenfolge von `renderer.ts`: Karte → (neu: Boden-, Höhen- und Atmosphäre-Pass) → Assets → Licht → Tokens → Erinnerung → **Nebel immer oben**. Überdeckungen entfallen (Dächer über Assets, Untergrund über A.8); die Licht-Akkumulation ist der vorhandene `lightLayer`.

```
Boden-Pass (pro Stufe aufsteigend, je Chunk):
  1  Boden-Mesh            Splat-Shader: Material-Array, Höhen-Blending, Hex-Tiling gegen Wiederholung,
                           Makro-Variation, Hillshade aus Normalen, Nässe, Schnee
  2  Boden-Decals          Wege, Spurrillen, Moos, Pfützen, Asche, Risse (Blend-Modi)
  3  Wasser                Grund-Tönung → Oberfläche (Flow-Map, Tiefe, Schaum, Glanz)
  4  Kleinstreuung         Grasbüschel, Steinchen, Blätter (instanziert)
  5  Klippen-Fuß-AO + Talus
  6  Klippenbänder + Wasserfälle (Strip-Meshes, Module)
  7  Lippen-Overlays + Hängendes
  8  Wände/Mauern, Böden in Räumen, Treppen, Brücken (Deck)
Höhen-Pass (sortiert nach Stufe, dann Objekthöhe):
  9  Mittlere Objekte      Büsche, Findlinge, Möbel, Smart Assets
  10 Hohe Objekte          Baumkronen, Brücken-Geländer
  11 Überdeckungen         Dächer, Höhlendecken (umschaltbar)
Komposition:
  12 Schatten (Multiply)  ·  13 AO  ·  14 Licht-Akkumulation  ·  15 Nebel/Wolken/Wetter
  16 Farbkorrektur (LUT)  ·  17 Overlays (Raster, Ghosts, Debug)
```

### 22.3 Performance-Strategie

| Maßnahme | Zweck |
|---|---|
| **Chunk-Meshes** (32×32 Felder) | Nur geänderte Chunks neu aufbauen |
| **Chunk-Bake** in RenderTextures (Zoom-Stufen 1/4, 1/2, 1) für statische Ebenen | Herausgezoomt wird nur noch ein Sprite pro Chunk gezeichnet |
| **Instanzierte Sprites** (ParticleContainer in v8 für statische Streuobjekte) | Zehntausende Grasbüschel/Steinchen |
| **Texture-Arrays/Atlanten** pro Biom | Wenige Draw-Calls |
| **LOD:** Kleinstreuung unter 35 % Zoom aus; Kronen-Cluster als Bake | Flüssiges Herauszoomen |
| **Culling** pro Chunk | Nur Sichtbares zeichnen |
| **Komprimierte GPU-Texturen** (KTX2/Basis; Unterstützung in PixiJS 8 vor Einsatz prüfen) | VRAM: Props-Atlanten sonst mehrere 100 MB |

### 22.4 Budgets (Ziel auf Mittelklasse-PC)

| Vorgang | Budget |
|---|---|
| Frame beim Malen (Boden, Höhe, Klippen-Vorschau) | ≤ 16 ms |
| Klippen-/Wasser-Update der berührten Region | ≤ 30 ms (1–2 Frames Latenz) |
| Volle Ableitung eines Dirty-Chunks nach dem Strich | ≤ 150 ms |
| Laden + volle Ableitung 150×150 | ≤ 8 s (Worker-Pool, ohne Cache in der Datei) |
| Sonnenwechsel (Schatten komplett) | ≤ 200 ms |
| **TV** (CLAUDE.md) | **60 FPS** mit 4K-Videokarte und Living Fog, höchstens 1 % verpasste Refreshes (`npm run bench`); gilt auch für große gezeichnete Karten mit Wasser, Stockwerken und Streuung |

---

## 23. Export

> Reihenfolge nach E-74: Bild und Foundry/UVTT zuerst, Druck als PNG-Serie, PDF später im eigenen Code. Geschrieben wird nur im Hauptprozess über einen Speichern-Dialog (Pfadprüfung, Sicherheitsfreigabe). Wände kommen aus derselben Ableitung wie die Sicht; Geheimtüren werden als „secret“ exportiert.

### 23.1 Bild (PNG/WebP)

- **Auflösung** frei (px/Feld), Vorgaben: 70, 100, 140, 200, 256.
- **Gekacheltes Offscreen-Rendering** im Export-Worker (OffscreenCanvas) und Zusammensetzen beim Schreiben.
- **Grenzen:**
  - WebP max. 16 383 × 16 383 px → darüber automatisch PNG oder Kacheln
  - VTTs vertragen oft nur bis 8192–16384 px Texturgröße → Warnung und Vorschlag
- **Optionen:** Raster an/aus (Farbe, Deckkraft), Dächer/Überdeckungen an/aus, Licht eingebacken ja/nein, Wetter/Nebel ja/nein, Zustand, Ebenen getrennt (siehe §23.4).

### 23.2 Druck

- **Maßstab** 1 Zoll = 5 ft. Bei 256 px/Feld entspricht das 256 dpi; für 300 dpi wird hochskaliert (Lanczos) oder die 256 dpi werden akzeptiert (empfohlen).
- **Seitenaufteilung** A4/A3/Letter, Überlappung 0,5 cm, Schnittmarken, Seitenindex-Übersicht.
- Ausgabe als **PDF** (eine Seite pro Kachel) oder PNG-Serie.
- Druckoptimierung: optional hellere Schatten und „Tinte sparen“ (Kontrast/Helligkeit-Profil).

### 23.3 Foundry VTT & Universal VTT

**Zwei Exportwege:**

1. **Foundry-Szene (JSON)** für Foundry v12/v13: Hintergrundbild, Raster, Wände, Türen, Lichter, Ambient-Sounds, Regionen.
2. **Universal VTT (`.dd2vtt`/`.uvtt`)**: Bild (Base64), `line_of_sight`, `portals`, `lights`, Raster-Metadaten. Funktioniert mit anderen VTTs und dem Foundry-Importmodul.

**Wand-Abbildung (Export-Profil, anpassbar):**

| Element | Bewegung | Sicht | Licht | Bemerkung |
|---|---|---|---|---|
| Mauer, Fels, Palisade, Hecke | blockiert | blockiert | blockiert | – |
| Klippe Δ1 | blockiert | frei | frei | gerichtet optional |
| Klippe Δ ≥ 2 | blockiert | eingeschränkt (Terrain) | frei | Profil wählbar |
| Erosionskante | – | – | – | kein Export |
| Tür / Doppeltür | Tür | – | – | Zustand offen/zu/verschlossen |
| Geheimtür | Geheimtür | – | – | – |
| Fenster / Fallgitter | blockiert | frei | frei | – |
| Schießscharte | blockiert | eingeschränkt | eingeschränkt | – |
| Zaun, Trockenmauer | blockiert | frei | frei | optional „schwieriges Gelände“ statt Wand |

- **Vereinfachung:** Douglas-Peucker auf Konturen (Toleranz 0,1 Feld), Ziel < 2000 Wandsegmente pro Szene, Warnung darüber.
- **Lichter:** Radius dim/bright, Farbe, Animation (torch, fire …) aus Emittern.
- **Sounds:** Ambient-Sounds mit Radius und Lautstärke; **Kategorie → Dateipfad** über eine Zuordnungstabelle im Export-Profil.
- **Regionen:** Wasser flach/tief/reißend, Durchbruch-Geröll, dichte Vegetation (optional) als Polygone mit Tags.

### 23.4 Szenenpaket für den Spielmodus (Verwaltungstool → TV)

Entfällt nach **E-61**. Der Spielmodus ist diese App selbst: Der TV bekommt den geprüften **PlayerFrame** (v6). Raster-Blöcke kommen nur bei Änderung mit Prüfsumme, vorher gefiltert nach Ebene, Stockwerk und geheimen Bereichen. Der TV berechnet Optik und Animation (Wasser, Wasserfälle, Wind, Dunst, Wolken) **selbst mit demselben Render-Code**. Gebackene Bilder gibt es nur für den externen Export (§23.1–23.3), nie als TV-Quelle.

---

## 24. Asset-Spezifikation

> Nach E-70: Die Spezifikation gilt, ausgeliefert wird aber über das vorhandene **Slot-System** (`render/build/textures/`, Dateiname = Slot, Varianten `<slot>.N.webp`, Ersatzmuster für fehlende Slots). Neue Slot-Typen: Klippenbänder, Lippen, Decals, Höhen-Maps. Mipmaps an. Bibliotheks-Assets liegen flach mit einem Sidecar je Datei (E-27) statt in Ordnerhierarchien; die Benennung `biom/kategorie/…` gilt nur für die Master-Dateien außerhalb des Repos. Das Repo ist öffentlich: nur Inhalte mit Auslieferungsrecht, Herkunft im Textur-README bzw. `provenance` im Sidecar.

### 24.1 Globale Regeln

| Regel | Wert |
|---|---|
| Maßstab | **256 px = 5 ft (1 Feld)**; Objekte werden in realer Größe angelegt (Baumkrone 20 ft → 1024 px) |
| Perspektive | Streng orthografische Draufsicht. Keine Seitenansichten, kein Horizont. Ausnahme Klippen-/Wandbänder (Ansicht der Wandfläche, siehe §24.3) |
| **Licht** | **Neutral, weich von oben.** Keine gerichteten Highlights, **keine eingebackenen Schlagschatten** (der Renderer wirft Schatten nach der einstellbaren Sonne). Leichte Eigenverschattung (AO) in Vertiefungen ist erwünscht. |
| Kontur | Dunkle Konturlinie 2–3 px bei 256 px/Feld, Farbe #1c1510 bis #2a2018, 80–90 % Deckung, leicht unregelmäßig (handgemalt) |
| Farbe | sRGB, 8 bit/Kanal; Paletten pro Biom (Stil-Bibel); gedämpfte Mitteltöne, Akzente sparsam |
| Format (Master) | PNG RGBA, ohne Vormultiplikation; Kanten sauber antialiased, **keine Halos** (Defringe) |
| Varianten | 4–8 pro Objekttyp; 2–4 pro Bodenmaterial |
| Pivot/Anker | In Metadaten (Stammposition bei Bäumen, Aufhängepunkt bei Ranken) |
| Benennung | `biom/kategorie/name_variante[_saison].png` z.B. `temperate/tree/oak_03_autumn.png` |
| Metadaten | JSON pro Asset bzw. Sammeldatei pro Ordner (§31.2) |
| Herkunft | Pro Asset: Quelle (eigen/Higgsfield/beauftragt), Modell, Prompt, Seed, Datum, Bearbeiter (für spätere Produktlizenzierung) |

### 24.2 Bodentexturen

| Eigenschaft | Spezifikation |
|---|---|
| Größe | 1024 × 1024 px (= 4×4 Felder), **nahtlos kachelbar** in beide Richtungen |
| Karten | **Albedo** (RGB) · **Höhe** (Graustufen, 16 bit empfohlen; für Höhen-Blending: Steine ragen aus Gras) · **Normale** optional (aus Höhe abgeleitet) |
| Licht | Vollständig *entleuchtet*: keine großflächigen Helligkeitsverläufe (Hochpass-Prüfung), keine gerichteten Schatten |
| Wiederholung | Keine markanten Einzelmerkmale (ein auffälliger Stein fällt bei Kachelung sofort auf); Makro-Variation macht der Shader |
| Richtung | Ungerichtet (wird per Hex-Tiling rotiert). **Ausnahme:** Weg-/Bodentexturen mit Richtung (Kopfstein, Dielen, Dünenrippel) sind nur in u kachelbar und als „ausgerichtet“ markiert |
| Anzahl | 8–12 pro Biom (siehe §13.1) + 2–4 Varianten je Material |

### 24.3 Klippenbänder

Klippen sind **horizontal kachelbare Streifen**, die entlang der Kontur gebogen werden.

```
  v=0 ┌──────────────────────────────────────────────┐  ← Oberkante (Lippe kommt als Overlay darüber)
      │  helle, bröckelnde Kante / Wurzelzone         │
      │  ───── Strata 1 ─────────────────────────     │
      │  ───── Strata 2 ─────────────────────────     │
      │  dunkler werdend nach unten                   │
  v=1 └~~~~~~~~ unregelmäßiger Fuß (Alpha) ~~~~~~~~~~~┘  ← geht in Fuß-AO über
      0                                          1024 px (= 4 Felder Bogenlänge)
```

| Eigenschaft | Spezifikation |
|---|---|
| Größe | 1024 px breit (u, nahtlos) × **256 px** (Variante „niedrig“, Δ ≤ 10 ft), **512 px** („hoch“, 20–30 ft), **768 px** („sehr hoch“, ≥ 40 ft) |
| Verzerrung | Vertikale Streckung im Renderer 0,7–1,4×; außerhalb wird die nächste Höhenvariante gewählt |
| Karten | Albedo + Alpha (Fuß unregelmäßig) · Höhe/Normale (Strata-Relief für Sonnenschattierung) · **Nässemaske** (wo Moos und Nässe zuerst erscheinen) |
| Strata-Sockets | Schichtlinien liegen bei **festen v-Werten pro Material** (z.B. Erde: 0,22 / 0,48 / 0,71), damit Module nahtlos anschließen |
| Module | Je Material: Glatt A/B/C, Riss, Wurzeln, Vorsprung, Rinne, Wasserfall-Hintergrund (nass), Treppen-Einschnitt (Wangen links/rechts), Höhleneingang, Ecke außen, Ecke innen, Auslauf. Breite 256–1024 px, gleiche Höhe wie das Band |
| Lippen-Overlays | 1024 × 128 px, kachelbar in u, Alpha: Grasüberhang, Wurzeln, Erdkrümel, Sandkante, Schneekappe, Moospolster |
| Materialien v1 | Erde, Granit, Kalkstein, Sandstein, Lehm, Torf/Schlamm, Höhlenfels, Eis, Mauerwerk (Quader, Bruchstein, Ziegel), Holz-Stützwand |

### 24.4 Hängendes und Linien-Assets

| Asset | Größe | Hinweise |
|---|---|---|
| Ranken/Efeu/Farnvorhang | 256 × 256–768 px | Anker oben Mitte; oben dicht, nach unten ausfransend; 6–10 Varianten; Saisonvarianten |
| Wurzeln (hängend) | 128–256 × 256–512 | für Klippen und Höhlendecken |
| Eiszapfen | 64–128 × 128–256 | Winter |
| Uferpflanzen (Schilf, Rohrkolben) | Einzel-Sprites 128–256 px | werden als Kette gesetzt |
| Zaun-/Palisadenfelder | Segment 256 px lang + Pfosten-Sprite | Modul-DP; Anfang/Ende/Mitte/Tor |

### 24.5 Objekte (Props)

| Kategorie | Größe (Felder) | Pixel | Pflicht-Metadaten |
|---|---|---|---|
| Laubbaum | 2–4 | 512–1024 | Stammpunkt, Kronenradius, Schattenhöhe, Saisonvarianten (Frühling, Sommer, Herbst, kahl) |
| Nadelbaum | 1,5–3 | 384–768 | wie oben; Winter: verschneit |
| Totbaum/Wurzelstern | 1–3 | 256–768 | – |
| Busch/Strauch | 0,5–1,5 | 128–384 | Varianten mit Beeren/Blüten |
| Findling/Fels | 0,25–2 | 64–512 | Höhe (Schatten), Footprint (ggf. Foundry-Wand) |
| Geröll klein | 0,1–0,3 | 24–80 | als Atlas mit 20–40 Steinen pro Material |
| Grasbüschel, Blumen, Pilze, Zweige, Blätter | 0,1–0,4 | 24–100 | Atlas; Tönbarkeit |
| Baumstamm (liegend), Stumpf | 0,5–3 | 128–768 | Ausrichtung frei |
| Stalagmiten, Knochen, Schutt | 0,2–1 | 48–256 | Dungeon |

Bäume bekommen zusätzlich eine **Kuppel-Normale**, die prozedural erzeugt und mit einer Detail-Normalen aus der Albedo kombiniert wird. Dadurch reagieren Kronen auf die Sonnenrichtung.

### 24.6 Wasser und Effekte

| Asset | Spezifikation |
|---|---|
| Wellen-Normalen | 512 × 512, kachelbar, 2 Skalen |
| Schaum | 512 × 512 kachelbar (Graustufen) + Uferschaum-Streifen 1024 × 128 |
| Wasserfall-Strip | 256 × 512, kachelbar in v (Fließrichtung), Alpha-Ränder |
| Gischt / Spritzer | Flipbook 8×8 Frames à 128 px |
| Grund-Details | Kiesel/Sand-Decals für flaches Wasser |
| Nebel/Wolken | Rausch-Texturen 1024², kachelbar |
| Feuer/Fackel/Rauch | Flipbooks (Vorschau im Editor; Spielmodus kann eigene nutzen) |

### 24.7 Bauwerke

| Asset | Spezifikation |
|---|---|
| Mauerkronen | Strip 1024 × 64 (dünn) / 128 (normal), kachelbar in u, je Stil |
| Säulen/Ecken | 128–256 px, Dual-Grid-Fälle (außen, innen, T, Kreuz, Ende) |
| Türen | 1 Feld (256 px) bzw. 2 Felder; Zustände zu/offen; Zarge separat |
| Fenster, Fallgitter, Schießscharte, Torbogen | passend zur Wanddicke |
| Bodenplatten (WFC) | Module 64/128 px auf Unterraster mit Fugen-Sockets; 3–5 Varianten je Größe |
| Dielen | 1024 × 256 kachelbar (Richtung u) |
| Dächer | Kachelbar in Reihenrichtung, 1024 × 1024; Firstkappe-Strip; Traufkante-Strip; je Stil |
| Treppen | Stufen-Strip (kachelbar in Breite) + Wangen + Podest pro Material |
| Brücken | Deck-Strip (Planken quer), Geländer-Strip, Pfeiler, Seil-Strip, Bogen-Brüstung, Planke/Baumstamm-Sprites |

### 24.8 Decals

128–512 px, Alpha mit weichem Rand. Blend-Modus in den Metadaten: `normal`, `multiply` (Nässe, Ruß), `overlay` (Moos-Tönung).

Typen: Moosflecken, Laub, Risse, Pfützen, Asche, Brandflecken, Spurrillen-Abschnitte, Fußspuren, Schnee-Flecken, Blut (optional).

### 24.9 Mengengerüst pro Biom (Richtwert)

| Kategorie | Anzahl |
|---|---|
| Bodenmaterialien (inkl. Varianten) | 20–35 Texturen |
| Klippenmaterialien × (3 Höhen + ~10 Module + 3–5 Lippen) | 3–4 Materialien → 50–70 Strips |
| Objekte (inkl. Varianten/Saisons) | 150–300 Sprites |
| Decals | 20–40 |
| Prefabs | 6–10 |

---

## 25. Asset-Pipeline mit Higgsfield

> Nach E-75: **Higgsfield nur während der Entwicklung.** Generierung und Nachbearbeitung laufen im Entwickler-Werkzeug; die App bekommt nur fertige Assets und ruft Higgsfield nie auf.

### 25.1 Überblick

```
Stil-Bibel ─┐
            ▼
  Prompt-Baukasten ──▶ Higgsfield (Bildgenerierung) ──▶ Rohbilder (+ Herkunft)
                                                             │
                     ┌───────────────────────────────────────┘
                     ▼
  Nachbearbeitung (Skripte):  Freistellen → Defringe → Kontur prüfen → Schatten entfernen
                              → Paletten-Angleich → Skalieren auf px/ft → Kachelbar machen
                              → Höhe/Normale ableiten → Metadaten-Vorlage
                     │
                     ▼
  Qualitäts-Gate (automatisch + manuell)  ──▶  Asset-Bibliothek (Biom-Paket)
                     │
                     ▼ ab 50–100 freigegebenen Assets
  Eigenes Stil-Modell (LoRA) ──▶ zurück in die Generierung
```

### 25.2 Stufe 1: Stil-Bibel und Prompt-Baukasten

- **Stil-Bibel** (ein Dokument + Moodboard):
  - Palette pro Biom (Hex-Werte), Konturregeln, Lichtregel, Maßstab
  - Do/Don't-Beispiele
  - 10–20 Referenzbilder
- **Wichtig für ein späteres Produkt:** Fremde Kartenpacks (wie die Referenzbilder, die nach kommerziellen Asset-Packs aussehen) **nur als Stil-Orientierung** verwenden, **nicht** als Trainingsdaten fürs LoRA und nicht als Bildeingabe für Varianten.
- **Prompt-Baukasten** (Bausteine, nicht frei formuliert):

```
[STIL]     top-down orthographic view, hand-painted fantasy battle map asset, painterly texture,
           thin dark ink outline, soft even overhead lighting, no cast shadow, no perspective
[MOTIV]    single gnarled oak tree crown seen from directly above
[MATERIAL] dense leaves, mossy green with yellow highlights
[PALETTE]  muted earthy greens (#4f5a2e, #6d7a3a, #9aa356), dark umber outline
[TECHNIK]  isolated on flat neutral grey background, centered, full object visible, high detail
[NEGATIV]  (falls vom Modell unterstützt) text, watermark, horizon, side view, drop shadow, frame
```

- Für Bodentexturen statt „isolated …“ den Baustein `seamless tileable texture, uniform lighting, no large features` verwenden.

### 25.3 Generierung nach Kategorie

| Kategorie | Weg | Nachbearbeitung |
|---|---|---|
| **Objekte** (Bäume, Steine, Büsche, Pilze …) | Higgsfield direkt; neutraler Hintergrund | Freistellen (Higgsfield-Hintergrundentfernung oder lokal), Defringe, Kontur vereinheitlichen, Schattenreste entfernen, Paletten-Angleich, auf px/ft skalieren, ggf. hochskalieren (Higgsfield-Upscale) |
| **Bodentexturen** | Higgsfield mit Kachel-Baustein | Nahtlos machen (Offset + Nahtretusche per Inpainting/Outpainting oder Patch-Synthese), Entleuchten (Hochpass auf Luminanz), Höhe aus Luminanz + Glättung, Normale aus Höhe |
| **Klippenbänder** | **Halbmanuell:** Higgsfield liefert Felsoberflächen/Strata-Detail; Zusammenbau im Band-Template (feste Strata-Linien, Lippe, Fuß) in Krita/Photoshop oder per Skript | Horizontal kachelbar machen, Strata-Sockets prüfen, Nässemaske malen |
| **Module** (Riss, Wurzeln, Höhleneingang …) | Aus fertigem Band abgeleitet + Higgsfield-Inpainting im Modulbereich | Ränder müssen pixelgleich zum Grundband sein (Skript prüft Nahtdifferenz) |
| **Mauern, Dächer, Dielen, Treppen** | Higgsfield für Material-Detail, Geometrie per Template | Strikte Kachelprüfung |
| **Decals** | Higgsfield, freigestellt | Weicher Alpha-Rand, Blend-Modus festlegen |
| **Flipbooks** (Gischt, Feuer) | Eher prozedural/handgemacht; KI-Video optional | Frame-Schleife nahtlos |

### 25.4 Automatisches Qualitäts-Gate

| Prüfung | Kriterium |
|---|---|
| Auflösung/Maßstab | px pro ft innerhalb ±10 % der Vorgabe |
| Alpha | Keine halbtransparenten Halos > 2 px; keine Löcher |
| Schatten | Kein dunkler, gerichteter Halbmond außerhalb der Kontur |
| Palette | Mittlere ΔE zur Biom-Palette < Schwellwert; keine Übersättigung |
| Kachelbarkeit | Naht-Differenz (Rand gegen gegenüberliegenden Rand) < Schwellwert |
| Entleuchtung | Niederfrequente Luminanz-Varianz < Schwellwert (Bodentexturen) |
| Strata-Sockets | Schichtlinien-Höhe an den Rändern innerhalb ±4 px (Klippen) |
| Herkunft | Prompt, Modell, Seed, Datum vorhanden |

Danach folgt die **manuelle Abnahme** in der Asset-Werkbank mit drei Ansichten: Einzelbild, Kachel 3×3 und **Testszene** (Asset im Editor unter drei Sonnenrichtungen).

### 25.5 Stufe 2: Eigenes Stil-Modell

- Ab 50–100 freigegebenen, **eigenen** Assets ein Stil-LoRA trainieren:
  - über Higgsfield, sofern dort Training bzw. LoRA-Import für das genutzte Bildmodell angeboten wird
  - alternativ extern
- Danach sinkt der Nachbearbeitungsaufwand, weil Kontur, Licht und Palette stabil sind.
- **Lizenz prüfen:** die Nutzungsbedingungen von Higgsfield für kommerzielle Verwendung der Ausgaben (für die Produktoption) und die Rechte am trainierten Modell. Der Herkunftsnachweis pro Asset (§24.1) deckt das ab.

### 25.6 Asset-Werkbank (Tooling)

- **Entwickler-Werkzeug im Repo** (z. B. `app/scripts/assets/`), nicht Teil der App: Import der Higgsfield-Rohbilder → Pipeline-Schritte (§25.3) → Qualitäts-Gate (§25.4) → Abnahme → Slot- bzw. Pack-Export mit Sidecars.
- **Bildverarbeitung:** möglichst ohne neue Abhängigkeit, z. B. im headless Chromium von Playwright (E-73) mit Canvas und WebGL. Sonst `sharp` per Steckbrief (O-A6).
- **Abnahme-Ansicht:** Einzelbild, Kachel 3×3 und Testszene unter drei Sonnenrichtungen, als lokale Seite des Werkzeugs.
- **Atlas-Build:** Packen zu Atlanten bzw. Texture-Arrays, getrimmte Ränder, Mipmaps.

---

## 26. Code-Architektur

Ersetzt durch **A.7** (Ordner-Zuordnung im Paket `app/`, kein Monorepo).

**Laufzeit:**

- **Main Thread:** React 19 (nur UI-Hülle, vorhandener Store über `useSyncExternalStore`), PixiJS-Anwendung, Werkzeug-Controller
- **Worker-Pool** (`app/derive/`, Transferables): Ableitungs-Stufen A–J aus `core/build/derive/`
- **Export:** gekachelt im Renderer-Prozess, geschrieben im Hauptprozess über einen Dialog
- **TV-Fenster:** eigenes Pixi mit demselben Render-Code; bekommt nur den Frame (E-61). `check-table-bundle` stellt sicher, dass kein DM-Code im TV-Bundle landet.

Die Schnittstellen `Stage`, `Command` und `Tool` aus dem ersten Konzept bleiben als Muster. `Command` liefert dabei einen Patch auf die vorhandene Momentaufnahmen-Historie. `MapStorageAdapter` entfällt (A.4).

---

## 27. Tests und Qualitätssicherung

> Nach E-73: Vitest und `fast-check` (vorhanden), **Playwright-Bildvergleiche** in der echten App (neu, Steckbrief) und der **erweiterte TV-Benchmark**. Zusätzlich gibt es für jede neue Absicht-Art einen **Projektionstest** (A.4) und einen Format-Rundreise-Test in `core/build/format.test.ts`.

| Ebene | Was | Werkzeug |
|---|---|---|
| **Unit** | Geometrie (Marching Squares, Offsets, RDP, Skeleton), Flood-Fill, Priority-Flood, DP-Solver, WFC-Fallback | Vitest |
| **Eigenschaften** | **Determinismus:** gleiche Absicht → gleicher Ergebnis-Hash. **Lokalität:** Änderung in Chunk A ändert nichts außerhalb A + Halo. **Undo-Rundreise:** Patch + Inverse = Identität. **Stabile IDs:** Pin überlebt Neuberechnung | Vitest + fast-check |
| **Golden Images** | Prüfkarten rendern und mit Referenzbild vergleichen (Toleranz) | Playwright mit Electron, Pixel-Diff |
| **Performance** | Budgets aus §22.4 als Benchmarks; Regressionen > 20 % schlagen fehl | Vitest bench / eigener Harness |
| **Export** | Foundry-JSON gegen Schema; UVTT-Import-Test; WebP-Größengrenzen | Vitest |
| **Regeln** | Biom-Pakete gegen zod-Schema; Regel-Debugger-Snapshots | CI-Schritt |

**Prüfkarten** (feste Testszenarien):

1. Plateau mit Loch (Klippen innen/außen, Ecken)
2. Mehrstufiger Abbruch (Terrassen vs. verschmolzene hohe Klippe)
3. Bach über zwei Stufen mit Teich (Kaskade, Spill-Point)
4. Gekrümmte Klippe mit Treppe (eingeschnitten) und Rampe
5. Brücke über Schlucht + Brücke über Fluss + Furt
6. Dungeon mit Mauer, Höhle, Durchbruch, Wandlinie, allen Öffnungstypen
7. L-förmiges Haus mit Walmdach, Dach ein/aus
8. Je eine Karte pro Biom inkl. Saison- und Wetterwechsel
9. Ebene „Damm gebrochen“ mit Raster-Patch (E-58)
10. Großkarte 150×150 (Performance)

---

## 28. Roadmap mit Aufgaben

Ersetzt durch **A.11** (Phasen 0–10 als DC-Tasks ab DC-121).

---

## 29. Risiken

| Risiko | Auswirkung | Gegenmaßnahme |
|---|---|---|
| Prozedurale Klippen wirken „technisch“ statt handgemalt | Kernversprechen verfehlt | Look-Spike in Phase 0; Module + Lippen + Hängendes brechen Regelmäßigkeit; Rauschen pro Material abstimmen |
| Asset-Menge (5 Biome × 200–400 Assets) | Zeitplan platzt | Referenzbiom zuerst; Pipeline-Automatisierung; LoRA ab Stufe 2; Biom-übergreifende Assets (Geröll, Decals) teilen |
| KI-Assets uneinheitlich (Licht, Kontur, Schatten) | Sichtbare Stilbrüche | Strenge Prompt-Bausteine, Qualitäts-Gate, Testszene unter drei Sonnenrichtungen |
| Performance bei 150×150 und 256 px/Feld | Ruckeln, VRAM-Probleme | Chunk-Bake, LOD, Instanzierung, komprimierte Texturen, Budgets als CI-Benchmarks |
| Lokalitäts- und Determinismus-Fehler | Flackern, „springende“ Bäume | Eigenschaftstests ab Phase 0; Weltposition-Hashing konsequent |
| Regel-Updates verändern alte Karten | Vertrauensverlust | Regelstand-Sperre pro Karte + Vorher/Nachher-Dialog |
| Doppelte Shader bei WebGPU | Wartungsaufwand | v1 nur WebGL2 |
| Lizenzen (Fremdassets, KI-Ausgaben) | Produktoption gefährdet | Herkunftsnachweis pro Asset; kein Training auf Fremdmaterial; Nutzungsbedingungen prüfen |
| Umfang (Feature-Liste ist groß) | Nie fertig | Strikte Phasen-Tore: Eine Phase ist erst fertig, wenn ihre Prüfkarten golden sind |
| **Sofort umstellen** (E-57) | Kartenschmiede bis Phase 2 ohne Mauern, Klippen, Wasser | Phasen 0–2 zügig hintereinander; laufende Kampagnen vorher fertig vorbereiten |
| **Löschen ohne Sicherung** (E-57) | Alte Karten verlieren Bau-Elemente unwiederbringlich | Archiv-Export vor DC-121 (A.11) |
| **TV-Renderer wird ersetzt** (E-52) | Ruckeln oder Schwarzbild am Spieltisch | Bench je Ebene; fail-closed bleibt; Playwright-Bildvergleiche |
| **Frame-Größe mit Raster** (E-61) | Verzögerung, IPC-Last | Blöcke nur bei Änderung mit Prüfsumme; Messung im Bench |
| **WebGPU-Ausweichpfad** | Eigene GLSL-Shader laufen dort nicht | Pfad abschalten oder absichern (A.4) |

---

## 30. Offene Punkte

Die offenen Punkte des ersten Konzepts sind beantwortet:

- **O1** Speicherung → `MapSidecar` v14 (E-55, A.6)
- **O2** Asset-Schema → Sidecar v4 (E-68)
- **O3** Spielmodus → Frame und gleicher Render-Code (E-61)
- **O4** Foundry-Version → bleibt offen (O-A5)
- **O5** Klang-Zuordnung → `builtin:`-Schlüssel (A.4)
- **O6** nur Quadratraster (A.4)
- **O7** Higgsfield-Lizenz → O-A8

Neue offene Punkte: **A.12**.

---

## 31. Anhang

### 31.1 Struktur eines Biom-Pakets

Nach **E-69 (hybrid)**:

```
app/src/render/build/textures/      Basis-Slots, mit der App ausgeliefert (Boden, Klippenbänder, Lippen, Wasser, Decals)
app/src/core/build/rules/biomes/    Biom-Definitionen + Regeln (JSON, zod-geprüft), Namen in en/de
<Pack>.zip → Bibliothek (Pack-Import) Große Objekt- und Decal-Sätze: flach, ein Sidecar je Datei,
                                    Tags „pack: …“, Unterart, Umgebung; Regeln wählen über Tags
library/<name>.prefab.json          Prefabs (E-65)
```

Die Herkunft mitgelieferter Dateien steht im Textur-README, die von Pack-Assets in `provenance` im Sidecar.

### 31.2 Asset-Metadaten (Schema-Auszug)

> Gilt als Inhalt des Asset-Sidecars v4 (§19.4): `sizeFt` → vorhandenes `sizeCells`, `pivot` → `anchor.x/y`, `category` → Tags bzw. Unterart; keine `id`, die Datei wird über ihren Pfad referenziert.

```jsonc
{
  "id": "temperate/tree/oak_03",
  "category": "tree.deciduous",
  "sizeFt": [18, 18],
  "pivot": [0.5, 0.52],
  "footprint": { "type": "circle", "r": 0.3 },
  "shadow": { "heightFt": 25, "shape": "dome" },
  "outlinePx": 3,
  "variants": { "season": { "spring": "oak_03_spring", "autumn": "oak_03_autumn", "winter": "oak_03_bare" } },
  "tint": { "hue": [-5, 5], "value": [-0.06, 0.04] },
  "provenance": { "source": "higgsfield", "model": "…", "prompt": "…", "seed": 123, "date": "2027-01-14", "editedBy": "…" },
  "license": "own"
}
```

### 31.3 Glossar

> Abbildung der Begriffe auf das Projekt: **A.5**.

| Begriff | Bedeutung |
|---|---|
| **Absicht (Intent)** | Vom Nutzer gemalte Daten. Nur sie wird gespeichert. |
| **Ableitung (Derived)** | Alles, was der Editor daraus berechnet (Cache) |
| **Stufe** | Ganzzahlige Höhenebene; Stufenwechsel = Klippe |
| **Feinhöhe** | Stufenlose Höhe ohne Klippen |
| **Band** | Darstellung der Klippenwand als Streifen auf der Unterseite |
| **Lippe** | Überhang-Overlay an der Klippenoberkante |
| **Modul** | Austauschbares Teilstück einer Kette oder Fläche |
| **Socket** | Anschlussbeschreibung eines Moduls (z.B. Strata-Höhen) |
| **Connector** | Treppe, Rampe, Leiter, Brücke, Steg, Furt |
| **Smart Asset** | Asset mit Metadaten für Einpassung und Wirkung |
| **Prefab** | Zusammengesetztes Smart Asset inkl. Intent-Ausschnitt |
| **Halo** | Lese-Reichweite einer Pipeline-Stufe über den Chunk hinaus |
| **Spill-Point** | Niedrigster Randpunkt eines Beckens; bestimmt den Seespiegel |
| **Überdeckung** | Ausblendbare Ebene über Innenräumen (Dach, Höhlendecke) |
| **Regelstand** | Version der Biom-Regeln, mit der eine Karte gebaut wurde |
| **Kartenzustand** | Entfällt; ersetzt durch Zeichenebenen mit Raster-Patch (E-58) |
