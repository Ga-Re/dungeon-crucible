# Dungeon Crucible – Produktplan

Ein Werkzeug, das eine D&D-5e-Kampagne vom ersten Entwurf bis zur letzten Sitzung begleitet:
planen, Karten bauen, Kreaturen pflegen und am Tisch leiten – mit Tisch-Display für die Spieler.

Stand: Design-Demo (`design-demo/index.html`). Dieses Dokument sammelt Anforderungen, Abgleich mit
vergleichbaren Tools, Architekturvorschlag und Roadmap. Offene Entscheidungen stehen am Ende.

## 0. Getroffene Entscheidungen

| Thema | Entscheidung |
|---|---|
| Plattform | Desktop-App für **macOS und Windows** (Electron) |
| Tisch-Display | Zusätzlicher Monitor am PC der Spielleitung (kein eigener Rechner, kein Netzwerk) |
| Touch am Tisch | Vorerst nicht geplant; Spieler bedienen nichts, die SL steuert alles |
| Regelwerk | D&D 5e, Ausgabe 2024 (SRD 5.2) |
| Themes | Mehrere Themes später; die UI nutzt von Anfang an Theme-Tokens (Demo: Dunkel, Hell, Pergament als Vorschau) |
| Tisch-Monitor | 55″, 4K (3840×2160) → 80,1 px/Zoll; **1 Feld = 1 Zoll** für echte Miniaturen, Feinabgleich per Lineal-Korrektur |
| Kreaturdaten | Werden von der SL selbst eingegeben (2024-Werteblock); Berechnungen (Mod, RW, ÜB, EP) automatisch |
| Sprache | Englisch als Standard, Deutsch zusätzlich |
| Spieler-Vorschau | Dockbar wie jedes Panel; Knopf „Auf anderen Bildschirm verschieben“ für die Tisch-Ausgabe |
| Signierung | Keine; Installer bleiben unsigniert (Betriebssystem warnt beim ersten Start) |
| Tischfenster | versteckt anlegen, auf den Bildschirm setzen, Vollbild („simple fullscreen“ auf macOS); Fokus bleibt beim DM |
| Nebel-Engine | Aus Dungeon-Manager übernommen (ADR-0019 dort): Polygone, PixiJS-Renderer, Ausbreitung mit Geschwindigkeit, Living Fog mit 8 Biomen |
| Renderer | Komplett PixiJS 8.22 (Karte, Raster, Tokens, Nebel) für DM-Fenster und TV |
| Token-Sicht | Deckt automatisch auf; Verlassenes wird Erinnerungsnebel; SL-Werkzeuge zusätzlich |
| Nebelwerkzeuge | Rechteck, Ellipse/Kreis, Polygon, Lasso, Raum (wie Dungeon-Manager) + Pinsel; „Nebel ausblenden“ (N) nur im DM-Fenster |
| Nebel-Einstellungen | NEBEL-Ribbon + dockbares Panel „Nebel-Engine“ |
| Benchmark | Aus Dungeon-Manager übernommen (`npm run bench`) |
| Design-Demo | Grundsätzlich abgenommen |

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
- 5e-Werteblock im **2024-Format**: RK, Initiative, TP (Formel + würfeln), Bewegung, Attribute mit Modifikator und Rettungswurf je Attribut, Fertigkeiten, Resistenzen/Immunitäten, Sinne, Sprachen, HG → EP, Übungsbonus
- Aktionen mit klickbaren Würfen (Angriff, Schaden)
- Token: Ringfarbe, Bild, Größe (winzig … gigantisch), Dunkelsicht, Lichtquelle, Sichtbarkeit von Name/TP für Spieler
- Spielercharaktere nach 2024: Spezies statt Volk, Hintergrund liefert Attributboni und Talent der 1. Stufe, Waffenmeisterungen, Unterklasse ab Stufe 3
- Import: SRD 5.2 (CC-BY-4.0), JSON, später 5e.tools-/Foundry-Format

### 2.4 Kampagnen-Atlas
- Graph aus Akten, Sessions, Szenen/Begegnungen, Quests, Orten, NSC, Fraktionen
- Session-Vorbereitung nach „Lazy DM“-Checkliste
- Kampagnen-Zeitleiste und Weltkalender
- Begegnungs-Rechner nach 2024: EP-Budget je Charakter (Niedrig/Mittel/Hoch) nach Stufe, kein Gruppen-Multiplikator
- Zufallstabellen, Handouts
- „Im Orchestrator starten“ übernimmt Karte, Nebel, Tokens, Ambience der Szene

### 2.5 Game-Orchestrator
- Karte mit DM-Sicht (durch Nebel), Spieler-Vorschau im Haupt-Canvas
- Tokens: Einrasten oder freie Bewegung, **DM-Bewegungssperre** für Spieler
- Initiative-Tracker: Reihenfolge, Runde, TP-Balken, RK, Zustände nach 2024 (u. a. Erschöpfung Stufe 1–6: −2 je Stufe auf W20-Tests, −5 ft Bewegung je Stufe), Konzentration, Schaden/Heilung
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
- Eigenes randloses Vollbildfenster auf **Monitor 2** (im Tisch eingelassen, am DM-PC angeschlossen); Monitorwahl in den Einstellungen, Mauszeiger dort ausgeblendet
- Auf dem DM-Bildschirm optional eine Vorschau-Kopie der Spieleransicht (dockbares Fenster)
- Das Tischfenster nimmt keine Eingaben an (kein Touch); Fokus bleibt immer beim DM-Fenster
- Wird Monitor 2 getrennt oder wechselt die Auflösung, schaltet die Ausgabe auf Schwarz, bis die SL sie wieder freigibt
- Rotation 0°/90°/180°/270°, **Blackout-Schalter**
- Fail-closed-Regeln:
  1. Die Spieleransicht rendert aus einer **Whitelist-Projektion** des Szenenzustands (nur Karte, Raster, aufgedeckte Zellen, sichtbare Tokens, Schablonen, Pings). Zonen, Notizen, Geheimtüren, verborgene Tokens und DM-Ebenen werden gar nicht erst an den Renderer übergeben.
  2. Nebel wird zuerst deckend gezeichnet und nur aufgedeckt, nie umgekehrt. Fehlt die Nebel-Maske, ist sie veraltet oder wirft der Renderer einen Fehler, zeigt der Tisch **Schwarz**.
  3. Weichzeichnung gibt nie unerforschte Zellen frei: nach dem Blur werden unerforschte Zellen hart deckend übermalt.
  4. Der Kartenrand ist im Nebelpuffer schwarz aufgefüllt, damit Blur dort keinen Saum öffnet.
  5. Heartbeat zwischen DM-Fenster und Tischfenster (gleicher Prozess, eigener Renderpfad): bleibt er aus, Blackout.
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

## 7. Architekturvorschlag
- **Desktop-App mit Electron** (Node-Hauptprozess, Web-UI): DM-Fenster auf Monitor 1, Tisch-Vollbild auf Monitor 2, Monitorerkennung über die Electron-Screen-API (inkl. An-/Abstecken), direkter Dateizugriff. Gewählt statt Tauri 2 (bis Nov. 2026): überall dieselbe Chromium-Engine für WebGL/Video und ausgereifte Mehrfenster-Unterstützung (schwebende Panels als echte Fenster)
- Themes: alle Farben als CSS-Tokens, Theme = eine Token-Datei (JSON/CSS); Karte und Nebel bleiben themenunabhängig
- UI: TypeScript + React (oder Svelte), eigenes Docking-System (Zonen links/rechts/unten, Akkordeon, Flyout, schwebende Fenster), eigene Ribbon-Komponenten
- Rendering: **WebGL2 via PixiJS** für Karte, Kacheln, Video-Texturen; Nebel und Living Fog als Shader; Raycasting im Worker (WASM möglich)
- Tisch-Fenster erhält nur die Whitelist-Projektion über einen eigenen IPC-Kanal (kein Zugriff auf den vollen Zustand)
- Audio: Web Audio API (Loops, Crossfade, Kanäle je Ausgabe)
- Datenmodell: TypeScript-Typen + JSON-Schema für Sidecars

## 8. Roadmap

| Phase | Inhalt |
|---|---|
| 0 | Design-Demo abstimmen (dieser Stand) |
| 1 · Fundament | Desktop-Grundgerüst, Docking/Ribbon/Arbeitsbereiche, Kampagnenordner + Sidecars, Kartenimport mit Tiling, Raster + Kalibrierung |
| 2 · Spielen | Tokens, Wände/Türen, Raycasting, Nebel (3 Zustände, Werkzeuge), Tisch-Fenster fail-closed mit Rotation/Blackout, Initiative |
| 3 · Atmosphäre | Living Fog (8 Biome), Fog Spread, Lichtquellen, Zauberschablonen, Soundboard |
| 4 · Planung | Kampagnen-Atlas, Notizen-Editor mit Wiki-Links, Begegnungs-Rechner, Zufallstabellen, Handouts |
| 5 · Assets | Asset-Vault mit Varianten und Prop-Komposition, Universal-VTT-Import, SRD-Bestiarium |
| 6 · Feinschliff | Weitere Themes, Tastaturkürzel, Export/Backup, Performance |

## 9. Umsetzungsstand

**Phase 1 (Fundament) – umgesetzt in `app/`:**
- Desktop-App (anfangs Tauri 2, seit Nov. 2026 Electron) mit Monitorliste, Tischfenster randlos im Vollbild auf gewähltem Monitor, Verschieben auf anderen Monitor, Mauszeiger aus, Fokus bleibt beim DM
- React-Oberfläche: Arbeitsbereich-Umschalter, Ribbon, Docking mit dockview (andocken, abdocken, Layout je Arbeitsbereich gespeichert), Statusleiste, Themes, Englisch/Deutsch
- Kernlogik mit 29 Tests: Sichtlinien, 3-Punkt- und physische Kalibrierung, Nebel (3 Zustände, gesperrte Geheimräume), 2024-Regeln (Mod, ÜB, RW, EP-Budget, Erschöpfung), Würfel, Sidecar-Schemas, Spieler-Projektion
- Fail-closed: Whitelist-Frame, Validierung im Tischfenster, Herzschlag (2,5 s), Tisch-Fenster darf nur Frames empfangen (eigenes Preload), Build bricht ab, wenn das Tisch-Bundle DM-Code enthält
- Kartenansicht mit Auswählen, Verschieben, Messen, Ping, Wände/Türen/Geheimtüren/Fenster, Zonen, Nebelwerkzeuge, Schablonen, Kalibrierung; Initiative mit Zuständen; Würfel; Begegnungs-Budget; Werteblock-Editor
- CI (GitHub Actions): Tests, Build-Prüfung, Desktop-Builds für macOS (universal) und Windows

- Kampagnenordner: öffnen oder neu anlegen (Strg+O), Manifest, Karten-Sidecars, Szenen-Overrides und Kreaturen als lesbare JSON-Dateien; atomares Schreiben; Autosave nach 1,5 s; letzte Kampagne öffnet beim Start wieder
- Dateizugriff nur innerhalb des geöffneten Ordners (der Hauptprozess prüft jeden Pfad, `..` wird abgelehnt)
- Kartenimport (Bild/Video) kopiert die Datei nach `maps/`, legt eine neue Szene an; DM- und Tischfenster laden sie über das Asset-Protokoll `dc-asset://` (nur Dateien im Kampagnenordner)
- Szenenwechsel mit automatischem Blackout
- Rückgängig/Wiederholen (Strg+Z / Strg+Umschalt+Z) für alle Karten-, Nebel-, Token- und Kampfänderungen
- Tests: Frontend und Dateizugriff (Vitest)

**Phase 1 ist damit abgeschlossen.** Nächster Schritt: Phase 2 (Spielen) – Lichtquellen, Feinschliff am Tisch-Workflow, Token aus Kreaturen auf die Karte ziehen.

## 10. Offene Fragen
Derzeit keine.
