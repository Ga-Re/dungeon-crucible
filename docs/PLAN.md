# Dungeon Crucible – Produktplan

Ein Werkzeug, das eine D&D-5e-Kampagne vom ersten Entwurf bis zur letzten Sitzung begleitet:
planen, Karten bauen, Kreaturen pflegen und am Tisch leiten – mit Tisch-Display für die Spieler.

Stand: Design-Demo (`design-demo/index.html`). Dieses Dokument sammelt Anforderungen, Abgleich mit
vergleichbaren Tools, Architekturvorschlag und Roadmap. Offene Entscheidungen stehen am Ende.

---

## 1. Bedienkonzept (an Fusion 360 angelehnt)

| Fusion 360 | Dungeon Crucible |
|---|---|
| Arbeitsbereich-Umschalter oben links („DESIGN ▾“) | Arbeitsbereich-Umschalter: Kartenschmiede, Asset-Vault, Tokens & Kreaturen, Kampagnen-Atlas, Game-Orchestrator |
| Ribbon mit Tabs und Werkzeuggruppen („ERSTELLEN ▾“) | Ribbon je Arbeitsbereich, Gruppen mit Dropdown-Label |
| Browser (Baum links) | Browser: Karte → Zonen/POIs/Hindernisse/Assets bzw. Session → Szenen/Gruppe/Begegnungen |
| Zeitleiste unten | Szenen-Zeitleiste (Session) bzw. Kampagnen-Zeitleiste (Atlas) |
| ViewCube | Tisch-Ausrichtungs-Würfel (zeigt Rotation der Spieleransicht) |
| Navigationsleiste unten im Canvas | Auswählen, Verschieben, Zoom, Einpassen, Raster, Einrasten, Messen, DM/Spieler-Umschalter |
| Dockbare Paletten | Alle Panels: abdocken, frei schweben, links/rechts/unten andocken, Größe ändern; Layout je Arbeitsbereich |

## 2. Arbeitsbereiche und Funktionsumfang

### 2.1 Kartenschmiede
- Eigenschaften: Name, Kartendatei, Tags, Biom, Typ, Nebel-Art
- Import: `.png .jpg .webp` und Videokarten `.mp4 .webm` (Loop, stumm)
- GPU-Tiling: Bilder über 4096 px werden in Kacheln zerlegt (WebGL-Texturlimit), Mipmaps für Zoom-out
- Raster: Quadrat und Hex (spitz/flach), Zellgröße in px ↔ ft, **3-Punkt-Kalibrierung** (Ursprung, +1 Feld X, +1 Feld Y → Zellmaß, Rotation, Versatz, Verzerrung)
- Zonen: Räume, Gebiete, Points of Interest, Geheimräume, je Zone Biom-Override und Farbe
- Hindernisse für 2D-Raycasting: Wände, Türen, Geheimtüren, Objekte (Fels, Baum, Statue als Polygon), Fenster (sichtdurchlässig, nicht passierbar) und Einweg-Wände
- Assets platzieren (Stempel), Ebenen mit Sichtbarkeit
- Nebel-Startzustand je Karte vorbereiten

### 2.2 Asset-Vault
- Eigenschaften: Name, Assetdatei, Tags, Typ, Größe in Feldern, Sichtblocker ja/nein
- **Varianten** (Außen/Innen/Keller, Sommer/Winter, intakt/Ruine) mit Auslöser (Token nähert sich ≤ n Felder, betritt Zone, manuell) und Übergang (Überblenden, Dach ausblenden)
- **Prop-Komposition**: Asset aus mehreren Props zusammensetzen, Gruppieren, Sichtblocker-Polygone pro Prop
- Bibliothek mit Sammlungen, Tags, Suche

### 2.3 Tokens & Kreaturen
- 5e-Werteblock: RK, TP (Formel + würfeln), Bewegung, Attribute mit Auto-Modifikator, Rettungswürfe, Fertigkeiten, Resistenzen/Immunitäten, Sinne, Sprachen, HG → EP, Übungsbonus
- Aktionen mit klickbaren Würfen (Angriff, Schaden)
- Token: Ringfarbe, Bild, Größe (winzig … gigantisch), Dunkelsicht, Lichtquelle, Sichtbarkeit von Name/TP für Spieler
- Import: SRD 5.2 (CC-BY-4.0), JSON, später 5e.tools-/Foundry-Format

### 2.4 Kampagnen-Atlas
- Graph aus Akten, Sessions, Szenen/Begegnungen, Quests, Orten, NSC, Fraktionen
- Session-Vorbereitung nach „Lazy DM“-Checkliste
- Kampagnen-Zeitleiste und Weltkalender
- Begegnungs-Rechner (5e-EP-Schwellen, Multiplikator)
- Zufallstabellen, Handouts
- „Im Orchestrator starten“ übernimmt Karte, Nebel, Tokens, Ambience der Szene

### 2.5 Game-Orchestrator
- Karte mit DM-Sicht (durch Nebel), Spieler-Vorschau im Haupt-Canvas
- Tokens: Einrasten oder freie Bewegung, **DM-Bewegungssperre** für Spieler
- Initiative-Tracker: Reihenfolge, Runde, TP-Balken, RK, 5e-Zustände, Konzentration, Schaden/Heilung
- Zauberschablonen: Kegel, Kugel, Linie, Würfel mit Markierung der betroffenen Felder
- Messen (5e-Diagonale und euklidisch), Ping
- Soundboard: Ambience-Loops mit Einzel-Lautstärke, SFX-Pads, Master, Szenen-Playlists
- Würfel mit Ausdrücken, Vorteil/Nachteil, optional auf dem Tisch zeigen
- Notizen, Protokoll, Szenen-Zeitleiste, Handouts auf den Tisch schicken

## 3. Nebel-Engine
- Drei Zustände: **Unerforscht** (deckend), **Erinnerung** (abgedunkelt, keine Monster), **Aktive Sicht** (Raycasting-Polygon ∩ Sichtradius)
- Werkzeuge: Pinsel aufdecken/verdecken, Formen (Rechteck, später Kreis/Polygon), Raum-Werkzeug
- Geheimräume bleiben verdeckt, bis die SL sie entdeckt
- Animierte Ausbreitung (Fog Spread) vom Klickpunkt/Türpunkt
- **Soft-Masking**, das nur nach innen weichzeichnet (siehe Sicherheit)
- **Living Fog** mit 8 Biomen: Bodennebel, Schneesturm, Hitzeflimmern, Glutasche, Sumpfmiasma, Seenebel, Arkaner Dunst, Finsternis. In der App als GPU-Shader (Noise + Partikel), Biom je Karte oder je Zone

## 4. Spieleransicht und Fail-closed-Sicherheit
- Eigenes Fenster/Prozess für das **Tisch-Display** (eingelassener PC), optional zweiter Spiegel für einen DM-Monitor
- Rotation 0°/90°/180°/270°, **Blackout-Schalter**
- Fail-closed-Regeln:
  1. Die Spieleransicht rendert aus einer **Whitelist-Projektion** des Szenenzustands (nur Karte, Raster, aufgedeckte Zellen, sichtbare Tokens, Schablonen, Pings). Zonen, Notizen, Geheimtüren, verborgene Tokens und DM-Ebenen werden gar nicht erst an den Renderer übergeben.
  2. Nebel wird zuerst deckend gezeichnet und nur aufgedeckt, nie umgekehrt. Fehlt die Nebel-Maske, ist sie veraltet oder wirft der Renderer einen Fehler, zeigt der Tisch **Schwarz**.
  3. Weichzeichnung gibt nie unerforschte Zellen frei: nach dem Blur werden unerforschte Zellen hart deckend übermalt.
  4. Der Kartenrand ist im Nebelpuffer schwarz aufgefüllt, damit Blur dort keinen Saum öffnet.
  5. Heartbeat zwischen DM-App und Spielerfenster: bleibt er aus, Blackout.
  6. Beim Szenenwechsel erst Blackout, dann neue Szene laden, dann freigeben.
- In der Demo: „Renderfehler simulieren“ im Panel *Spieleransicht* zeigt das Verhalten.

## 5. Datenhaltung
- Kampagne = Ordner. Jede Ressource ist eine normale Datei (Bild, Video, Audio, Markdown) mit **Sidecar** `name.dm.json` (Metadaten, Raster, Zonen, Wände, Tags, Varianten)
- **Szenen-Overrides** `*.scene.json`: Nebelzustand, Token-Positionen, Türzustände, aktive Ambience je Session, ohne die Basiskarte zu ändern
- Notizen als Markdown mit Wiki-Links `[[…]]`, DM-Geheimblöcken `:::dm` und Rückverweisen; WYSIWYG-Editor mit Markdown-Ansicht
- Versionierung freundlich zu Git/Cloud-Sync, Autosave, Verlauf (Undo/Redo) über alle Arbeitsbereiche

```
Kampagne/
  campaign.dm.json
  maps/krypta.webp            maps/krypta.webp.dm.json
  assets/gasthaus.webp        assets/gasthaus.webp.dm.json
  creatures/thorin.dm.json
  audio/hoehlenwind.ogg       audio/hoehlenwind.ogg.dm.json
  notes/krypta.md
  sessions/session-03.scene.json
```

## 6. Abgleich mit vergleichbaren Tools

Basis: bekannte Funktionsumfänge (Stand Wissen 2026). Ziel war, Lücken im eigenen Plan zu finden.

| Tool | Stärken, die wir übernehmen | Aufgenommen als |
|---|---|---|
| **Foundry VTT** | Dynamische Beleuchtung, Wände mit Typen (Fenster, Einweg, Terrain), Szenen, Journal, Module | Wandtypen, Lichtquellen (Phase 2), Szenen-Overrides |
| **Roll20** | Dynamic Lighting, Handouts, Jukebox, Makros | Handouts auf Tisch, Soundboard-Playlists, Würfelmakros |
| **Owlbear Rodeo** | Sehr schlanke Bedienung, Fog-Werkzeuge, Tisch-taugliche Ansicht | Schnelle Werkzeuge in der Navigationsleiste, Fokus auf Tischmodus |
| **Fantasy Grounds** | Tiefe Regelautomatisierung, Kampftracker | Initiative-Tracker mit Zuständen, Schaden/Heilung |
| **Arkenforge** | Für Tisch-Displays gebaut, Spieler-Monitor, Ambience, animierte Karten | Tisch-Display + DM-Monitor, Videokarten, Living Fog |
| **EncounterPlus** | Offline, Module, Kampagnenbibliothek | Dateibasierte Kampagnenordner, Offline-first |
| **Dungeondraft / Dungeon Alchemist** | Kartenbau mit Assets, Export mit Wänden (Universal VTT `.dd2vtt`) | Import von `.dd2vtt` inkl. Wänden/Türen/Licht |
| **MapTool** | Vision/Light-Profile, Makros, frei | Licht-/Sichtprofile pro Token |
| **Alchemy RPG / Kanka / World Anvil / LegendKeeper** | Kampagnen-Wiki, Beziehungen, Zeitleisten, Kalender | Kampagnen-Atlas, Weltkalender, Wiki-Links |
| **Kobold Fight Club** | Begegnungsschwierigkeit | Begegnungs-Rechner |
| **Syrinscape / Tabletop Audio** | Szenenbasierte Soundsets | Ambience pro Szene, SFX-Pads |

**Zusätzlich in den Plan aufgenommen** (kam in der Anfrage nicht vor):
- Lichtquellen (Fackel 20/40 ft, Laterne, Zauber „Licht“), helles/dämmriges Licht, Dunkelsicht
- Fenster- und Einweg-Wände, Türen mit Zuständen (offen, verschlossen, verriegelt)
- Universal-VTT-Import (`.dd2vtt`) aus Dungeondraft/Dungeon Alchemist
- Handouts auf dem Tisch, Pings, Messwerkzeug
- Begegnungs-Rechner, Zufallstabellen, Weltkalender
- Szenenwechsel mit automatischem Blackout
- Tastaturkürzel, Undo/Redo über alle Arbeitsbereiche
- Touch-Eingabe am Tisch (Spieler bewegen eigene Tokens, sperrbar)

## 7. Architekturvorschlag
- **Desktop-App mit Tauri 2** (Rust-Kern, Web-UI): mehrere native Fenster (DM + Tisch), direkter Dateizugriff, klein
- UI: TypeScript + React (oder Svelte), Docking-Layout (z. B. Dockview), eigene Ribbon-Komponenten
- Rendering: **WebGL2 via PixiJS** für Karte, Kacheln, Video-Texturen; Nebel und Living Fog als Shader; Raycasting im Worker (WASM aus Rust möglich)
- Tisch-Fenster erhält nur die Whitelist-Projektion über IPC (kein Zugriff auf den vollen Zustand)
- Audio: Web Audio API (Loops, Crossfade, Kanäle je Ausgabe)
- Datenmodell: TypeScript-Typen + JSON-Schema für Sidecars

## 8. Roadmap

| Phase | Inhalt |
|---|---|
| 0 | Design-Demo abstimmen (dieser Stand) |
| 1 · Fundament | Tauri-Grundgerüst, Docking/Ribbon/Arbeitsbereiche, Kampagnenordner + Sidecars, Kartenimport mit Tiling, Raster + Kalibrierung |
| 2 · Spielen | Tokens, Wände/Türen, Raycasting, Nebel (3 Zustände, Werkzeuge), Tisch-Fenster fail-closed mit Rotation/Blackout, Initiative |
| 3 · Atmosphäre | Living Fog (8 Biome), Fog Spread, Lichtquellen, Zauberschablonen, Soundboard |
| 4 · Planung | Kampagnen-Atlas, Notizen-Editor mit Wiki-Links, Begegnungs-Rechner, Zufallstabellen, Handouts |
| 5 · Assets | Asset-Vault mit Varianten und Prop-Komposition, Universal-VTT-Import, SRD-Bestiarium |
| 6 · Feinschliff | Touch am Tisch, Tastaturkürzel, Export/Backup, Performance |

## 9. Offene Fragen
1. Plattform: Desktop-App (Windows? Linux auf dem Tisch-PC?) oder Browser-App?
2. Läuft der Tisch-PC als eigener Rechner im Netzwerk oder als zweiter Monitor am DM-Rechner?
3. Touch-Bedienung am Tisch durch Spieler gewünscht?
4. Regelwerk: nur 5e (2014 oder 2024) oder systemoffen?
5. Helles Fusion-Theme zusätzlich zum dunklen?
6. Woher kommen Monsterdaten (SRD, eigene, Import)?
