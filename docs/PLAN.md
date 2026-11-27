# Dungeon Crucible – Produktplan

Ein Werkzeug, das eine D&D-5e-Kampagne vom ersten Entwurf bis zur letzten Sitzung begleitet:
planen, Karten bauen, Kreaturen pflegen und am Tisch leiten – mit Tisch-Display für die Spieler.

Stand: Desktop-App in `app/` (Electron); Phase 1 abgeschlossen, Phase 2 und 3 begonnen (siehe Abschnitt 9).
Die Design-Demo (`design-demo/index.html`) ist abgenommen. Dieses Dokument sammelt Anforderungen, Abgleich
mit vergleichbaren Tools, Architekturvorschlag und Roadmap. Offene Entscheidungen stehen am Ende.

## 0. Getroffene Entscheidungen

| Thema | Entscheidung |
|---|---|
| Plattform | Desktop-App für **macOS und Windows** (Electron) |
| Tisch-Display | Zusätzlicher Monitor am PC der Spielleitung (kein eigener Rechner) |
| Touch am Tisch | Vorerst nicht geplant; am TV bedient niemand etwas, die SL steuert alles |
| Begleit-Webseite | Spätere Stufe: Spieler und SL scannen einen QR-Code und öffnen eine synchronisierte Webseite, die der Rechner im WLAN ausliefert (keine App, kein Internet, nur projizierte Daten) |
| Regelwerk | D&D 5e, Ausgabe 2024 (SRD 5.2) |
| Themes | Dunkel (Standard), Hell, Pergament; alle Farben über Theme-Tokens |
| Tisch-Monitor | 55″, 4K (3840×2160); Kalibrierung per **Prüfquadrat**, das die SL auf dem TV mit dem Lineal misst; Feldgröße in **Zoll oder cm** (Standard-Einheit in den Einstellungen, 1 Zoll für echte Miniaturen) |
| Kreaturdaten | Werden von der SL selbst eingegeben (2024-Werteblock); Berechnungen (Mod, RW, ÜB, EP) automatisch |
| Sprache | Folgt der Systemsprache (Deutsch oder Englisch) |
| Speicherort | Ein **Wurzelordner** (beim ersten Start gewählt, gern in iCloud/Dropbox) mit globaler **Bibliothek** `library/` und `campaigns/`; siehe §5 |
| Bibliothek | Karten, Assets, Kreaturen und Spielercharaktere global für alle Kampagnen; flach, geordnet über Tags, Typ und Suche; Löschen benutzter Dateien warnt und legt in den Papierkorb |
| Karte und Szene | Szene verweist auf die Karte und überschreibt einzelne Elemente per ID; Start- und Spielzustand getrennt, „Szene zurücksetzen“; Sessions und Unterszenen; mehrere Szenen als Tabs, der TV wechselt nur auf Befehl |
| Raster | Nur Quadrat; Einmessen per N×N-Box; Rastermodus je Szene, Kampfschalter, Belegungsregeln wie Dungeon-Manager |
| Werkzeuge | Zeichnen und Spielen direkt auf der Karte; Befehls-Panels mit OK/Abbrechen für Werkzeuge mit Optionen |
| Sichtbarkeit | Pro Element: sichtbar, verborgen, ungefähr |
| Hardware | Licht-Hardware (Home Assistant, Hue, WLED …) und Kamera-Erkennung als spätere Stufen |
| Abgleich | Mit dem Dungeon-Manager-Repo verglichen; Entscheidungen und Taskliste in [TASKS.md](TASKS.md) |
| Spieler-Vorschau | Dockbar wie jedes Panel; Knopf „Auf anderen Bildschirm verschieben“ für die Tisch-Ausgabe |
| Docking | Eigenes System nach Fusion-Vorbild (kein dockview): Zonen links/rechts/unten, Akkordeon, Einklappen mit Hover-Flyout; abgedockte Panels sind echte Fenster, auch auf anderen Monitoren |
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
- Raster: Quadrat, Zellgröße in px ↔ ft, Einmessen per **N×N-Box** (Box über N×N Felder aufziehen, Raster verschieben, Pfeiltasten-Feinschliff); Hex entfällt
- Zonen: Räume, Gebiete, Points of Interest, Geheimräume, je Zone Biom-Override und Farbe
- Hindernisse für 2D-Raycasting: Wände, Türen, Geheimtüren, Objekte (Fels, Baum, Statue als Polygon), Fenster (sichtdurchlässig, nicht passierbar) und Einweg-Wände
- Assets platzieren (Stempel), Ebenen mit Sichtbarkeit
- Nebel-Startzustand je Karte vorbereiten
- Gezeichnete Karten: **prozedurale Kartenschmiede** nach `docs/KARTENSCHMIEDE-PROZEDURAL.md` (E-46–E-77, DC-121 ff.)
  – Höhenstufen mit Klippen, Wasser, Fels und Dungeons als Raster, Wandlinien, Bézier-Wege, Regel-Streuung und eine
  neue Render-Pipeline für DM und TV. Ersetzt die gezeichneten Mauern, Klippen, Wasser, Böden, Räume und den
  Generator aus E-33–E-36 und E-45; der Generator kommt später neu (E-66).

### 2.2 Asset-Vault (E-27)
- Katalog aller Bibliotheksdateien außer Karten und Kreaturen: Props, Kartenteile, Texturen, Effekte (animiert), Lichtquellen, Geräusche, Handouts – Vorschau-Raster, Suche, Filter, Sammlungen, Favoriten, Mehrfachauswahl
- Eigenschaften: Name, Art und Unterart, Tags, Umgebungen, Größe in Feldern, Gruppe (Varianten), Sammlungen, Favorit – im Sidecar neben der Datei
- Import: mehrere Dateien, Packs mit Unterordner-Wahl (Ordner → Tags), Duplikate per Hash, Größe aus „_2x2“
- **Asset-Editor**: Größe, Deckungsmaske (Kreis/Polygon, Vorschlag aus Transparenz), Licht mit Flackern, Effekt-Verhalten
- Platzieren auf der Karte (Kartenschmiede) und szeneneigen; auf dem TV unter dem Nebel
- Später: **Varianten** mit Auslösern (Innen/Außen, intakt/Ruine), **Prop-Komposition**

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
- **Wurzelordner** mit globaler Bibliothek und Kampagnen. Jede Bibliotheksdatei (Bild, Video, Audio) hat ein **Sidecar** `name.dm.json` daneben (Metadaten, Raster, Ebenen, Bereiche, Wände, Lichter, Tags)
- **Szenen** `*.scene.json` verweisen auf ihre Karte und speichern Overrides je Element-ID, Startzustand und Spielzustand (Nebel, Tokens, Türen, Lichter an/aus, Ambience)
- **Sessions** als geordnete Szenenlisten, Unterszenen per Verweis auf die Elternszene
- Notizen als Markdown (Wiki-Links, Front Matter), bearbeitbar mit jedem Markdown-Editor
- Dateiregeln wie im Dungeon-Manager: `schemaVersion` mit Migrationen, unbekannte Felder bleiben erhalten, neuere Versionen werden nicht überschrieben, IDs klein geschrieben; Atomic Writes, Autosave
- Geräte-Einstellungen (Fenster, TV-Kalibrierung, zuletzt benutzte Kampagnen) liegen nicht im Wurzelordner

```
Dungeon Crucible/                 (Wurzelordner)
  library/
    krypta.webp                   krypta.webp.dm.json
    gasthaus.webp                 gasthaus.webp.dm.json
    hoehlenwind.ogg               hoehlenwind.ogg.dm.json
    thorin.creature.json          (Kreatur/Spielercharakter, feste id)
  campaigns/
    asche-von-vhal/
      campaign.dm.json            (Spieler und verknüpfte Figuren)
      scenes/krypta.scene.json
      sessions/session-03.json
      notes/krypta.md
  .trash/
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

Die aktuelle Reihenfolge und die Tasks stehen in [TASKS.md](TASKS.md): zuerst das Fundament (Dateiregeln, Wurzelordner und Bibliothek, Karte/Szene mit Overrides und Startzustand), dann die Kartenschmiede.

| Phase | Inhalt |
|---|---|
| 0 | Design-Demo abstimmen (dieser Stand) |
| 1 · Fundament | Desktop-Grundgerüst, Docking/Ribbon/Arbeitsbereiche, Kampagnenordner + Sidecars, Kartenimport mit Tiling, Raster + Kalibrierung |
| 2 · Spielen | Tokens, Wände/Türen, Raycasting, Nebel (3 Zustände, Werkzeuge), Tisch-Fenster fail-closed mit Rotation/Blackout, Initiative |
| 3 · Atmosphäre | Living Fog (8 Biome), Fog Spread, Lichtquellen, Zauberschablonen, Soundboard |
| 4 · Planung | Kampagnen-Atlas, Notizen-Editor mit Wiki-Links, Begegnungs-Rechner, Zufallstabellen, Handouts |
| 5 · Assets | Asset-Vault mit Varianten und Prop-Komposition, Universal-VTT-Import, SRD-Bestiarium |
| 6 · Feinschliff | Tastaturkürzel, Export/Backup, Performance |
| 7 · Am Tisch vernetzt | Begleit-Webseite für Spieler und SL per QR im WLAN |
| 8 · Hardware | Licht-Hardware und Ambilight, Kamera-Erkennung der Miniaturen |

## 9. Umsetzungsstand

**Phase 1 (Fundament) – umgesetzt in `app/`:**
- Desktop-App (anfangs Tauri 2, seit Nov. 2026 Electron) mit Monitorliste, Tischfenster randlos im Vollbild auf gewähltem Monitor, Verschieben auf anderen Monitor, Mauszeiger aus, Fokus bleibt beim DM
- React-Oberfläche: Arbeitsbereich-Umschalter, Ribbon, Statusleiste, Themes, Englisch/Deutsch
- Eigenes Docking-System (`app/src/dock/`): Zonen links/rechts/unten mit Gruppen, Akkordeon und Splittern; Zonen klappen zur Leiste ein, Hovern öffnet das Panel als Flyout; Abdocken und Andocken per Drag mit blauen Zielanzeigen; abgedockte Panels sind echte Fenster (auch auf anderen Monitoren, Rückholung bei abgestecktem Monitor); Panel-Inhalte behalten beim Umhängen ihren Zustand; Layout je Arbeitsbereich gespeichert, „Layout zurücksetzen“; Tastatur und Screenreader
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

**Phase 1 ist damit abgeschlossen.**

**Phase 2 (Spielen) – begonnen:**
- Licht und Sicht nach 2024: Lichtquellen (hell/dämmrig, Farbe, an/aus), Licht getragener Tokens (Fackel), Dunkelsicht; Spieler sehen, was in Sichtlinie liegt und beleuchtet oder in Dunkelsichtweite ist; Umgebungslicht pro Karte (dunkel/hell)
- Tokens aus der Kreaturen-Bibliothek per Drag & Drop oder Knopf auf die Karte; Werte, Größe, Sicht, Licht werden übernommen, Initiative gewürfelt; Token entfernen (Entf)
- Messung: Benchmark erfüllt (59,9 FPS, 0,2 % verpasst, 4K-Video, Living Fog)

**Phase 3 (Atmosphäre) – größtenteils umgesetzt:**
- Living Fog mit 8 Biomen, animierte Ausbreitung (Fog Spread)
- Lichtquellen (siehe Phase 2), Zauberschablonen
- Soundboard: Ambience-Loops (eingebaut und eigene Dateien aus `audio/`) mit Einzel-Lautstärke, SFX-Pads (eingebaut und `audio/sfx/`), Master, Alles stoppen; die laufende Ambience wird mit der Szene gespeichert, beim Szenenwechsel wird übergeblendet; eigene Dateien werden beim Hinzufügen in den Kampagnenordner kopiert
- Offen: Szenen-Playlists

**Nächster Schritt:** Testrunde am echten Tisch (Karte laden, Tisch öffnen, Nebel, Kampf mit Initiative und Licht), danach Feinschliff am Tisch-Workflow. Bekannt:
- Die Karte passt sich nicht an, wenn der Canvas größer wird (z. B. nach dem Einklappen einer Zone); „Einpassen“ hilft
- Das Soundboard ist unten neben Würfeln und Protokoll recht schmal
- Windows und Linux sind gebaut, aber noch nicht im Einsatz getestet

Tests insgesamt: 239 (Vitest), dazu Prüfungen in der laufenden App.

## 10. Offene Fragen
Siehe [TASKS.md §4](TASKS.md).
