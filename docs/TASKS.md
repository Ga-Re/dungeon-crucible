# Dungeon Crucible – Abgleich mit Dungeon-Manager und Taskliste

Stand: 2026-11-24. Grundlage: [Ga-Re/Dungeon-Manager](https://github.com/Ga-Re/Dungeon-Manager) (`docs/SPEC.md`,
`docs/ARCHITECTURE.md`, ADR-0001 bis ADR-0022, `TASKS.md` mit den dort festgehaltenen DM-Entscheidungen bis
2026-11-23) verglichen mit dem Stand von `main` plus Branch `feature/start-screen-map-forge`.

Verweise wie **T-176a** meinen die Task im Dungeon-Manager, **ADR-0012** dessen Entscheidungen. Tasks hier heißen
**DC-…**, Grundsatzentscheidungen **E-…** (Abschnitt 1). In den Abgleich-Tabellen (Abschnitt 2) steht ein Verweis
auf E-…, wo die Entscheidung das Ziel festlegt.

Legende Status: ✓ vorhanden · ◐ teilweise / anders gelöst · ✗ fehlt

---

## 1. Grundsatzentscheidungen (Interview 2026-11-24/25)

Geklärt im Interview mit dem DM (Skill `topic-interviewer`). „Wie DM“ heißt: wie in SPEC/ADRs des Dungeon-Managers.

| Nr. | Thema | Entscheidung | Abweichung von DM |
|---|---|---|---|
| E-1 | Bibliothek | **Globale Bibliothek** `library/` für Karten, Assets und Kreaturen; Kampagnen unter `campaigns/<slug>/` verweisen darauf. **Ein Wurzelordner** mit beiden, beim ersten Start gewählt (Vorschlag: Dokumente/Dungeon Crucible, Hinweis auf Sync per iCloud/Dropbox), in den Einstellungen änderbar. Bibliothek **flach**, geordnet über Tags, Typ und Suche. Löschen einer benutzten Datei: Warnung mit den nutzenden Kampagnen/Szenen, dann Papierkorb; Szenen zeigen einen Platzhalter. **Spielercharaktere global**, die Kampagne führt ihre Spieler und verknüpft deren Figuren. **Keine Migration** der bisherigen Test-Kampagnen. | Bibliothek flach statt Ordner/Packs; SC global + verknüpft statt `characters/` |
| E-2 | Karte vs. Szene | Szene verweist auf die Karte und **überschreibt einzelne Elemente per ID** (Wände, Türen, Bereiche, Lichter); Kartenänderungen erreichen alle Szenen, eine Szene auf dem TV erst nach Bestätigung; verwaiste Overrides werden gemeldet. | – |
| E-3 | Start- vs. Spielzustand | **Getrennt:** Atlas/Kartenschmiede bearbeiten den Startzustand (Nebel, Tokens, Türen, Lichter), der Orchestrator den Spielzustand; „Szene zurücksetzen“. | – |
| E-4 | Szenenstruktur | **Sessions** (geordnete Szenenlisten, eine Szene in mehreren Sessions möglich) und **Unterszenen**; **mehrere Szenen als Tabs** mit eigener Rückgängig-Historie; der TV wechselt nur auf „Szene auf den TV“. | – |
| E-5 | Sprache | Oberfläche folgt der **Systemsprache** (Deutsch oder Englisch). | DM: Deutsch zuerst |
| E-6 | Werkzeuge | **Gemischt:** Zeichnen und Spielen direkt auf der Karte; **Befehls-Panels** (OK/Abbrechen) für Werkzeuge mit Optionen (Bereich anlegen, Raster einmessen, Import); Objekt-Einstellungen aus dem Browser. | DM: alle Werkzeuge mit Befehls-Panel |
| E-7 | Raster einmessen | **N×N-Box** (Standard 3), Raster verschieben, Pfeiltasten-Feinschliff; die 3-Punkt-Kalibrierung entfällt. **Nur Quadratraster: das Hex-Raster wird entfernt.** | – |
| E-8 | TV-Kalibrierung | **Prüfquadrat** mit dem Lineal messen; Feldgröße in **Zoll oder cm**, Standard-Einheit in den Einstellungen. | – |
| E-9 | Tokens und Raster | Wie DM: Positionen in Rasterfeldern, **Rastermodus je Szene** (Kampagnen-Standard), **Kampfschalter** mit Einrasten, **Belegungsregeln** (bis 4 Winzige), Alt = frei. | – |
| E-10 | Sichtbarkeit | **Pro Element** sichtbar / verborgen / ungefähr, mit Standard je Typ. | – |
| E-11 | Dateiregeln | Wie DM: unbekannte Felder bleiben erhalten, neuere Dateiversionen werden nicht überschrieben, Migrationen schrittweise, IDs klein geschrieben. | – |
| E-12 | Plattform | **Electron bleibt** (echte schwebende Fenster mit geteiltem Zustand). | ADR-0002 (Tauri) gilt hier nicht |
| E-13 | Begleit-Webseite | Keine App: Spieler und DM scannen einen **QR-Code** und öffnen eine synchronisierte **Webseite, die der Rechner im WLAN ausliefert** (offline, nichts verlässt den Raum). Spätere Stufe. | – |
| E-14 | Notizen | **Markdown**, das mit **jedem Editor** funktioniert (Obsidian-kompatibel, aber nicht darauf angewiesen). | DM: Obsidian im Fokus |
| E-15 | Hardware | **Licht-Hardware** und **Kamera-Erkennung** werden als spätere Stufen eingeplant. | – |
| E-16 | Kartenschmiede | Die Kartenschmiede bearbeitet die **globale Karte** (Wände, Bereiche, Lichter, Raster); alle Szenen auf ihr erhalten die Änderung. Szenen-Overrides entstehen nur im Atlas/Orchestrator. | – |
| E-17 | Startzustand bis zum Atlas | Bis es den Kampagnen-Atlas gibt, wird der Startzustand im **Orchestrator per Schalter** „Startzustand bearbeiten“ bearbeitet (Nebel, Tokens, Türen, Lichter wirken dann auf den Start); später zieht das in den Atlas um. | Übergangslösung |
| E-18 | Ebenen | **Stockwerke** (eigenes Bild gleicher Größe, eigener Nebel, Freigabe auf dem TV) **und Zeichenebenen** (Wände, Bereiche, Props, Lichter … mit Sichtbarkeit und Sperre beim Bearbeiten). | Zeichenebenen zusätzlich |
| E-19 | TV außerhalb des Orchestrators | Der TV **läuft weiter** mit der Szene, die auf ihm ist; Pause nur per Knopf. Keine Einstellung dafür. | DM: Einstellung |
| E-20 | Gegenstände | Vorerst **nur im Handout-Stil** auf dem TV eingeblendet; kein eigenes Item-/Beute-System. | DM: Item-Karten (offen) |
| E-21 | Papierkorb | Nur **von Hand** leeren (Ansicht mit Wiederherstellen und Leeren); nichts verschwindet automatisch. | DM: 30 Tage automatisch |
| E-22 | Vorschau auf zusätzlichem Monitor | **Umschaltbar**: folgt der TV-Drehung oder immer aufrecht. | – |
| E-24 | Szeneneigene Elemente | Eine Szene darf **eigene Wände, Lichter und Bereiche** haben, die es auf der Karte nicht gibt (z. B. ein eingestürzter Gang); die Karte bleibt unberührt. | DM: nur Overrides |
| E-25 | Kartenänderung und TV | Bis zu den Szenen-Tabs (DC-034) erscheinen Kartenänderungen aus der Kartenschmiede **sofort** auf dem TV; die Bestätigung vor dem Übernehmen kommt mit DC-034. | Übergang |
| E-26 | Was die Kartenschmiede zeigt | **Nur die Karte** mit allem, was zu ihr gehört (Raster, Wände, Bereiche, Lichter, Props, Assets, Eigenschaften) und ihrem **Start-Nebel** (dort gemalt; jede neue Szene auf der Karte beginnt damit, je Szene anpassbar über E-17). **Tokens gehören zur Szene** und erscheinen in der Schmiede nicht. | – |
| E-23 | Arbeitsweise | **Sammel-Branch** je Thema, ein PR am Ende, der DM gibt den Merge frei. Nachfragen bei Abhängigkeiten, Dateiformat/Ordnern, Abweichungen vom Plan, Sicherheit und wenn etwas nicht ganz klar ist. Regeln in `CLAUDE.md`; Skills `topic-interviewer`, `next-task`, `finish-task`, `ui-design` und Agent `reviewer` in `.claude/`. | DM: PR je Task, Agent merged selbst |
| E-27 | Assets | **Bibliothek zuerst**, dann Pack-Import, Asset-Editor, Platzieren, Deckung, szeneneigene Assets. **Arten fest** (Prop, Kartenteil, Textur, Effekt, Lichtquelle, Geräusch, Handout) mit **Unterarten** als Vorschlag plus eigene; **Umgebungen** als Vorschlagsliste plus eigene, mehrere je Asset. Der **Asset-Vault** zeigt alle Bibliotheksdateien außer Karten und Kreaturen (auch Audio). **Sidecar je Datei** (Asset-Format Version 2): Name, Art, Unterart, Tags, Umgebungen, Größe in Feldern, Gruppe (Varianten), Sammlungen, Favorit, später Maske/Licht/Effekt-Verhalten; „zuletzt benutzt“ ist Geräte-Einstellung. Formate PNG, WebP, JPG, WebM (mit Transparenz), MP4. Import: mehrere Dateien/Ziehen, Pack mit Unterordner-Wahl, aus Karte/Handout heraus; Duplikate per Hash; Ordnernamen → Tags plus „pack: …“; Größe aus „_2x2“, Art aus Dateityp, Varianten gebündelt (je Datei ein Asset, gemeinsame Gruppe); Namenskonflikte automatisch umbenennen. Vault: Vorschau-Raster in der Mitte, Filter/Sammlungen links, Eigenschaften mit 5-ft-Vorschau rechts; Mehrfachauswahl, Stern, Ziehen auf Sammlung, Sammlungen verwalten. **Vorschaubild-Cache im App-Datenordner**; das Asset-Protokoll liefert daraus nur Bilder und nur an das DM-Fenster (DM-Freigabe Sicherheit). Editor in der Vault-Mitte: Größe, Deckungsmaske (Kreis/Polygon, Vorschlag aus Transparenz), Licht (hell/dämmrig, Farbe, Flackern), Effekt-Verhalten je Effekt einstellbar (Dauerschleife an/aus, einmal auslösen, mit Licht/Ton). Platzieren auf der Karte, Szenen blenden aus; **szeneneigene Assets** als Ausnahme zu DC-103 (Start oder Spiel, Maske/Licht nur in der Szene). TV: Assets unter dem Nebel, Effekte animiert, ausgeblendete nie. | Bibliothek vor Durchstich; Varianten je Datei statt gebündelt im Sidecar |

**Bleibt aus Dungeon Crucible:** Pergament als drittes Theme, das eigene Docking mit echten Fenstern und
Hover-Flyout (statt dockview und Kanten-Leisten), Export/Import ganzer Kampagnen als Archiv – beim Export wählbar:
nur Kampagnendaten oder vollständig mit den benutzten Bibliotheksdateien (Duplikate beim Import erkennen).

**Reihenfolge:** Fundament zuerst (Dateiregeln, Wurzelordner und Bibliothek, Karte/Szene mit Overrides und
Startzustand), dann die Kartenschmiede auf dieser Basis.

---

## 2. Funktionsabgleich

### 2.1 Fundament, Daten, Sicherheit

| Funktion | DM | DC | Bemerkung |
|---|---|---|---|
| Desktop-App mit DM- und Tischfenster, fail-closed | ✓ | ✓ | DC: Whitelist-Frame, Herzschlag, eigenes Preload, Build-Prüfung |
| Kampagnenordner, Atomic Writes, Autosave | ✓ | ✓ | |
| Globale Bibliothek mit Katalog und Vorschaubildern | ✓ | ✗ | E-1 |
| Konfliktkopien von Cloud-Sync erkennen, Platzhalter-Dateien | ✓ | ✗ | |
| Papierkorb (`.trash`, 30 Tage, wiederherstellen) | ◐ | ✗ | DM: Ablegen fertig, Wiederherstellen/Leeren offen |
| Rettungskopie bei fehlgeschlagenem Speichern, Absturzerkennung | ✓ | ✗ | |
| Rückgängig/Wiederholen | ✓ je Dokument | ◐ global | |
| Startdialog mit zuletzt benutzten Kampagnen | ✓ | ✓ | DC: Startbildschirm, Neu/Öffnen/Archiv |
| Kampagne als Archiv exportieren/importieren | ◐ | ✓ | DM: Snapshot-ZIP je Session, `.dmmap` für Einzelkarten geplant |
| Migrationen, unbekannte Felder erhalten | ✓ | ✗ | E-11 |

### 2.2 Oberfläche

| Funktion | DM | DC | Bemerkung |
|---|---|---|---|
| Fünf Arbeitsbereiche mit eigenem Ribbon | ✓ | ✓ | |
| Andockbare Panels, Layout je Arbeitsbereich | ✓ | ✓ | DC: eigenes Docking nach Fusion, echte Fenster |
| Benannte Layouts | ✓ | ✗ | |
| Feste Arbeitsfläche je Arbeitsbereich (ADR-0021/0022) | ✓ | ◐ | DC: Canvas in der Mitte, Panels drumherum |
| Kanten-Leisten mit ausfahrbaren Panels | ✓ | ✓ | DC: Zonen-Einklappen mit Hover-Flyout |
| Befehls-Panels für Werkzeuge | ✓ | ✗ | E-6 |
| Dokument-Tabs (mehrere Szenen/Karten offen) | ✓ | ✗ | |
| Einstellungsdialog | ✓ | ✗ | DC: Einstellungen verstreut in Panels |
| Oberflächengröße 90–125 % | ✓ | ✗ | |
| Themes Dunkel/Hell | ✓ (2) | ✓ (3) | DC zusätzlich Pergament |

### 2.3 Kartenschmiede

| Funktion | DM | DC | Bemerkung |
|---|---|---|---|
| Karte importieren (Bild, Video), Kacheln über GPU-Limit | ✓ | ✓ | |
| Karte als Dokument öffnen, Karteneinstellungen-Dialog | ✓ | ◐ | DC: Eigenschaften-Panel |
| Name, Herkunft, Lizenz | ✓ | ◐ | DC: nur Name |
| Tags, Thema/Biom, Kartentyp, Suche | ✗ | ✗ | beide offen (T-126, T-176b) |
| Standard-Nebelbiom je Karte | ✓ | ✓ | |
| Ambient-Sound und Übergang als Kartendaten | ✗ | ✗ | T-176b |
| Raster Quadrat | ✓ | ✓ | |
| Raster Hex | ✗ | ✓ | wird entfernt (E-7, DC-098) |
| Rastereinmessung | ✓ N×N-Box | ✓ N×N-Box | E-7, DC-021 |
| Ebenen (Stockwerke) mit eigenem Bild, Freigabe auf dem TV | ✓ | ✗ | |
| Bereiche/Räume als Polygon, Ellipse, Lasso, je Ebene, geheim | ✓ | ◐ | DC: nur Rechtecke, Biom-Override ohne UI |
| Bereiche additiv zeichnen (Vereinigung) | ✓ | ✗ | |
| Wände, Türen, Geheimtüren, Fenster | ✗ | ✓ | DC weiter (DM: Stufe 5) |
| Wände bearbeiten (auswählen, verschieben, löschen) | ✗ | ✓ | DC-014: Befehls-Panel „Wände zeichnen“, Gelenke, Ketten |
| Lichtquellen der Karte | ✗ | ✓ | |
| Klippen/Galerien (Einweg), Deckung (Kreis/Polygon) | ✗ | ◐ | T-193; DC-014: Klippen ✓; Deckung am Asset: DC-108 |
| Automatische Wände, Leck-Prüfung, Testfigur | ✗ | ✗ | T-141, T-194 |
| Parametrische Räume, Gelände mit Bewegungskosten, Treppen | ✗ | ✗ | T-195–197 |
| Kartenvarianten (Tag/Nacht), Zuschneiden, Bildanpassung | ✗ | ✗ | T-191, T-192 |
| Karte aus Kacheln zusammensetzen, eigene Karten zeichnen | ✗ | ✗ | T-190 |
| UVTT-Import (`.dd2vtt`, `.uvtt`) | ✗ | ✗ | T-198 |
| Props auf der Karte (Stempel), Ebenen-Sichtbarkeit | ✗ | ✗ | T-144 |

### 2.4 Nebel, Sicht, Licht

| Funktion | DM | DC | Bemerkung |
|---|---|---|---|
| Werkzeuge Rechteck, Ellipse, Polygon, Lasso, Pinsel | ✓ | ✓ | |
| Raum mit einem Klick aufdecken, Raumliste | ✗ | ✓ | DC weiter (T-108c2 offen) |
| Geheimräume bleiben bei „alles aufdecken“ zu | ✗ | ✓ | |
| Erinnerungsnebel | ✗ | ✓ | |
| Weiche Kanten, Ausbreitung mit Geschwindigkeit, Living Fog, 8 Biome | ✓ | ✓ | aus DM übernommen |
| Nebel im DM-Fenster ausblenden | ✓ | ✓ | |
| Dynamische Sicht (Raycasting), Licht hell/dämmrig, Dunkelsicht | ✗ | ✓ | DC weiter (T-142/143) |
| Farbiges und flackerndes Licht, Tageszeit-Helligkeit | ✗ | ◐ | DC: Farbe, dunkel/hell |
| Nebel je Ebene | ✓ | ✗ | hängt an Ebenen |
| Verhalten von Spielerbewegung im Nebel je Karte | ✗ | ✗ | |

### 2.5 Tokens, Kreaturen, Kampf

| Funktion | DM | DC | Bemerkung |
|---|---|---|---|
| Tokens anlegen, bewegen, löschen, verbergen | ✓ | ✓ | |
| Tokens aus Kreaturen per Drag & Drop | ✗ | ✓ | |
| Kreaturen-Bibliothek mit 2024-Werteblock | ◐ | ✓ | DM: nur Schema; DC: Editor, aber je Kampagne (E-1) |
| Tokenbilder, Porträt, Token aus Porträt, animierte Tokens | ✗ | ✗ | T-203, T-226 |
| Klone mit Namen, Begegnungsgruppen, Gestalten | ✗ | ✗ | T-204–207 |
| SRD-Import von Werteblöcken | ✗ | ✗ | T-206 |
| Rastermodus, Kampfschalter, Belegungsregeln, Winzig-Anordnung | ✓ | ✗ | E-9 |
| Initiative mit Verzögern/Bereithalten, Schnelleingabe, Leiste auf dem TV | ✓ | ◐ | DC: Initiative, kein Verzögern, keine TV-Leiste |
| TP, temporäre TP, Zustände mit Rundendauer, Erschöpfung | ✓ | ◐ | DC: ohne Rundendauer/temp. TP prüfen |
| Begegnungs-Rechner nach EP-Budget | ✗ | ✓ | |
| Würfel mit Ausdrücken, verdeckt/offen, Protokoll | ✗ | ◐ | DC: Würfel und Protokoll, nicht auf dem TV |
| Zauberschablonen mit Trefferanzeige | ✗ | ✓ | |
| Animierte Zaubereffekte, Licht-Kopplung | ✗ | ✗ | SPEC §7 |

### 2.6 Tisch (TV)

| Funktion | DM | DC | Bemerkung |
|---|---|---|---|
| Vollbild auf gewähltem Monitor, Drehung, Blackout, Vorschau | ✓ | ✓ | |
| Echte Feldgröße per Kalibrierung | ✓ | ✓ | E-8 |
| Rasterlinien auf dem TV schaltbar | ✓ | ? | prüfen |
| Ausschnitt des TV im DM-Fenster verschieben | ✓ | ◐ | DC: Tisch-Mitte im Modell |
| Szenenübergänge (Überblenden, Schwarz, sofort) | ✗ | ◐ | DC: Blackout beim Szenenwechsel |
| Pause- und Titelbild | ✗ | ✗ | T-175 |
| Vorschau als Fenster auf weiterem DM-Monitor | ✗ | ◐ | DC: Vorschau-Panel als echtes Fenster abdockbar |
| Render-Auflösung wählbar | ✗ | ✗ | T-116 |
| Videokarten zwischen DM und TV synchron | ✗ | ✗ | T-128 |

### 2.7 Planung, Medien, Netzwerk

| Funktion | DM | DC | Bemerkung |
|---|---|---|---|
| Sessions, Unterszenen | ✓ | ✗ | E-4 |
| Notizen als Markdown (Obsidian), im Browser | ✓ | ✗ | E-14 |
| Kampagnen-Atlas: Explorer, Szenen-Editor, Weltkarte, Flussgraph, Wiki | ✗ | ✗ | „bald“-Panel in DC |
| Handouts auf dem TV, Generator, Kartenfragmente | ✗ | ✗ | T-137–139 |
| Soundboard: Ambience-Ebenen, SFX, Master, Ambience je Szene | ✗ | ✓ | DC weiter; Playlists fehlen |
| Asset-Vault: Bibliothek, Packs, Metadaten, Prefabs | ✗ | ✗ | |
| Zufallsgeneratoren, Kalender, Wetter, Session-Log mit Rückblick | ✗ | ✗ | |
| Begleit-App, DM-Fernbedienung (LAN, QR) | ✗ | ✗ | E-13 |
| Licht-Hardware, Ambilight | ✗ | ✗ | E-15 |
| Kamera-Erkennung | ✗ | ✗ | E-15 |

---

## 3. Taskliste

Reihenfolge: Abschnitt 3.0 zuerst, danach 3.1 und 3.2; innerhalb eines Abschnitts = vorgeschlagene Reihenfolge.
Verweise wie (E-1) nennen die Entscheidung aus Abschnitt 1, auf der eine Task beruht.

### 3.0 Fundament (zuerst)

- ✓ **DC-090 Dateiregeln** (E-11): unbekannte Felder erhalten, neuere `schemaVersion` ablehnen, Migrationsgerüst,
  IDs klein geschrieben. Enthält DC-001 und DC-002.
- ✓ **DC-091 Wurzelordner** (E-1): beim ersten Start wählen (Vorschlag Dokumente/Dungeon Crucible, Sync-Hinweis),
  in den Einstellungen ändern; Struktur `library/` und `campaigns/<slug>/`; Main-Prozess begrenzt Zugriffe auf den
  Wurzelordner.
- ✓ **DC-092 Startbildschirm umbauen** (E-1): Kampagnen aus `campaigns/` statt frei gewählter Ordner; „Neue
  Kampagne“ ohne Ordnerdialog; „Kampagne öffnen“ entfällt oder wird zu „Wurzelordner wechseln“; Archiv-Import
  entpackt nach `campaigns/` und benutzte Dateien in die Bibliothek.
- ◐ **DC-093 Bibliothek** (E-1): Karten, Audio, Kreaturen flach in `library/`, Sidecars daneben; Import kopiert
  hinein, Duplikate per Hash erkennen; Kartenliste mit Suche (Name, Tags, Typ); Löschen mit Warnung und Papierkorb
  (benutzte Karten: nur das Bild, die Kartendaten bleiben) – erledigt. Offen: Vorschaubilder im Katalog
  (DC-093b), Papierkorb wiederherstellen (DC-035). Tags bearbeiten: erledigt mit DC-011.
- ✓ **DC-094 Karte/Szene mit Overrides** (E-2, E-16, E-24, E-26): Szene = Kartenverweis + Overrides je Element-ID
  + eigene Elemente + Zustand (`resolveElements`/`diffElements`); die Kartenschmiede zeigt und bearbeitet die Karte
  (ohne Tokens, mit Start-Nebel), jeder andere Arbeitsbereich die Szene; der TV zeigt in der Schmiede weiter die
  Szene; verwaiste oder ungültige Overrides werden beim Öffnen gemeldet und bleiben in der Datei. Die Bestätigung
  vor dem Übernehmen auf den TV kommt mit DC-034 (E-25).
- ✓ **DC-103 Overrides bearbeiten**: je Element „Auf Karte zurücksetzen“, verwaiste Overrides anzeigen und aufräumen,
  Kennzeichnung geänderter Elemente im Orchestrator (T-145). DM-Entscheidungen (2026-11-25): Eine Szene kann
  Kartenelemente (Wände, Türen, Bereiche, Lichter) nur **ein- und ausblenden** – beim Vorbereiten
  („Startzustand bearbeiten“, später im Atlas) wirkt es auf den Start, im Spiel auf den Spielzustand; „Szene
  zurücksetzen“ übernimmt den Start (vorbereitet Ausgeblendetes bleibt weg, im Spiel Ausgeblendetes kommt
  zurück). Gespeichert als Liste `hidden` im Spielzustand und im Block `start`; Szene wird Version 4, alte
  `{ hidden: true }`-Overrides werden migriert. Kennzeichnung im Browser und auf der Karte; „Auf Karte
  zurücksetzen“ für geänderte Elemente; verwaiste Änderungen als Hinweis im Browser mit „Aufräumen“
  (Bestätigung, rückgängig machbar).
  Erledigt: Szenendatei Version 4 mit `hidden` im Spielzustand und im Start (Migration der alten Overrides);
  ausgeblendete Elemente liegen zur Laufzeit getrennt, Sicht, Licht und TV sehen sie nicht, ein ausgeblendeter
  geheimer Bereich bleibt für die Nebel-Werkzeuge gesperrt. Werkzeug „Ein-/ausblenden“ (Menüband Spiel › Szene):
  Klick auf Wand, Tür, Bereich oder Licht blendet aus oder wieder ein, rückgängig machbar; beim Bearbeiten des
  Startzustands wirkt es auf den Start. Auf der Karte: Ausgeblendetes gestrichelt und blass, Geändertes mit
  gelber Raute. Browser: Gruppe „In dieser Szene angepasst“ mit „Wieder einblenden“ bzw. „Auf Karte
  zurücksetzen“, Hinweis auf verwaiste/ungültige Änderungen mit IDs und „Aufräumen“ (Bestätigung, rückgängig
  machbar); verwaiste ausgeblendete IDs bleiben beim Speichern erhalten, bis aufgeräumt wird.
- ✓ **DC-095 Start- und Spielzustand** (E-3): die Szenendatei hält neben dem Spielzustand einen Block `start`
  (Nebel, Tokens, Türen, Lichter, entdeckte Bereiche, Ambience); bearbeitet im Orchestrator per Schalter
  „Startzustand bearbeiten“ (E-17, Hinweis auf der Karte; der TV zeigt weiter das Spiel). „Szene zurücksetzen“
  (mit Rückfrage, rückgängig machbar) setzt den Spielzustand auf den Start, dazu Kampf und Initiative auf Runde 1,
  entfernt Zauberschablonen und die Nebel-Art der Szene. Ältere Szenen starten beim ersten Öffnen im aktuellen
  Zustand. Der Start-Nebel neuer Szenen kommt aus der Karte (DC-094).
- ✓ **DC-096 Spielercharaktere** (E-1): Figuren sind Kreaturen der Bibliothek (Rolle SC) mit fester `id` (ältere
  Dateien bekommen ihren Namen als id, so bleiben Token-Verweise gültig). `campaign.dm.json` führt `players`
  (Name, verknüpfte Figur, am Tisch ja/nein). Panel „Gruppe“ im Orchestrator: Spieler anlegen, Figur wählen,
  anwesend setzen, entfernen; „Gruppe platzieren“ (Panel und Menüband) setzt fehlende Figuren der Anwesenden in
  die Szene (rückgängig machbar). Eine neue Szene bekommt die Gruppe, Figuren aus der bisherigen Szene mit ihren
  TP und Zuständen; ohne Spieler wie bisher die SC der Szene. Die Initiative zeigt den Spielernamen (nur DM).
- ✓ **DC-097 Archiv-Export mit Schalter**: nur Kampagne oder vollständig mit Bibliotheksdateien; Import legt
  Bibliotheksdateien ab (gleicher Inhalt wird nicht kopiert, Namenskonflikte bei Karten/Audio werden umbenannt und
  Verweise umgeschrieben).
- ✓ **DC-098 Hex-Raster entfernen** (E-7): Raster-Mathematik, Zeichnen (DM und TV), Schemas, Menüband,
  Eigenschaften, Statusleiste, Texte und Icons kennen nur noch das Quadratraster (der Knopf „Quadrat“ entfällt
  mit). Karten, die noch mit Hex gespeichert sind, werden als Quadratraster gelesen und so gespeichert.
- ✓ **DC-099 Systemsprache** als Standard (E-5): die Oberfläche nimmt die erste bevorzugte Sprache des Systems,
  die sie kennt (Deutsch oder Englisch, sonst Englisch), und folgt einem Wechsel zur Laufzeit. Die Auswahl in der
  Titelleiste bietet „System (…)“ als Standard und Deutsch/Englisch als feste Wahl; die Wahl gilt pro Gerät.
- ✓ **DC-100 Kreatur umbenennen**: nach dem Umbenennen wird die neue Datei geschrieben und die alte kommt in den
  Papierkorb; id, Token-Verweise und Spielerverknüpfungen bleiben (mit DC-096). Zwei Kreaturen gleichen Namens
  bekommen getrennte Dateien. Nebenbei behoben: neu angelegte Dokumente wurden nach einer Änderung im Speicher
  nicht mehr geschrieben.
- ✓ **DC-001 Kartendaten beim Speichern nicht mehr verlieren** (Teil von DC-090, erledigt mit ihr). Tags, Biom, Kartentyp, POIs und Assets aus dem
  Sidecar beim Laden übernehmen und unverändert zurückschreiben; unbekannte Felder erhalten (zod `passthrough`).
  Test: Rundreise einer Datei mit allen Feldern.
- ✓ **DC-002 Ältere/neuere Dateiversionen** (Teil von DC-090, erledigt mit ihr). Neuere `schemaVersion` ablehnen statt überschreiben;
  Migrationsgerüst für Kampagne, Karte, Szene, Kreatur.
- **DC-003 Rettungskopie bei fehlgeschlagenem Speichern** (Gerätespeicher, Angebot beim nächsten Start) und
  Absturzerkennung (TV bleibt nach Absturz dunkel). Nach T-114b, T-238.
- ✓ **DC-004 PixiJS-Warnung beim Kartenwechsel** („destroyed while still bound“): beim Abbau des lebendigen Nebels
  und der Nebel-Überblendung wurden Texturen vor ihrem Shader zerstört (bei der Überblendung hing das Aufräumen an
  der Ebene, die PixiJS erst nach ihren Kindern abbaut); jetzt geht der Shader zuerst, am Mesh selbst. Nebenbei:
  die Dunkelheit der Licht-Ebene gab ihre Maskentextur nie frei (Speicherleck je Lichtänderung) – behoben.
  Bekannt und nicht von uns lösbar: mit lebendigem Nebel warnt PixiJS weiter, wenn sich die Canvas-Größe ändert
  (sein `TexturePool` verwirft Filter-Texturen, die sein globaler Batch-Cache noch kennt; auch in 8.23).
- **DC-106 Benchmark-Anleitung aktualisieren**: `app/README.md` beschreibt für `npm run bench` noch `maps/` im
  Kampagnenordner; seit dem Wurzelordner liegen Karten in `library/`.

### 3.2 Laufender Branch `feature/start-screen-map-forge`

- **DC-010 Startbildschirm** – ✓ Schritt 1 erledigt; Umbau auf Wurzelordner folgt mit DC-092.
- ✓ **DC-011 Karteneigenschaften**: Dialog „Karteneinstellungen“ in der Kartenschmiede (Menüband Karte › Karte,
  Doppelklick auf die Karte im Browser, Knopf im Eigenschaften-Panel) mit Name, Kartentyp, Landschaft und Tags (mit
  Vorschlägen aus der Bibliothek), Standard-Nebel und Umgebungslicht; Übernehmen ist ein rückgängig machbarer
  Schritt. Das Eigenschaften-Panel zeigt die Karte nur noch an. Die Bibliothekssuche findet auch die Landschaft und
  aktualisiert sich nach dem Speichern. DM-Entscheidungen (2026-11-25): Dialog statt Panel; Herkunft und Lizenz
  entfallen; Sound wird DC-104, der Übergang DC-105.
- **DC-104 Klangquellen auf der Karte** (DM-Wunsch 2026-11-25): Sounds aus der Bibliothek auf die Karte ziehen,
  je Quelle ein Radius; überlagerte Radien spielen beide; einstellbar, ob eine Quelle zum Rand hin leiser wird;
  dazu ein globaler Sound je Karte (z. B. Schneesturm, Wind). Später im Szeneneditor: Quellen ein-/ausschalten und
  den globalen Sound bei Bedarf überschreiben. Offen (Interview zu Beginn): wessen Position zählt fürs Hören
  (Spielerfiguren, Kartenmitte, TV-Ausschnitt), Verhältnis zur Szenen-Ambience, Dateiformat.
- **DC-105 Szenenübergang** (T-135): Übergang beim Szenenwechsel auf dem TV (z. B. Ausblenden über Schwarz, Dauer),
  danach als Standard je Karte (T-176b).
- **DC-012 Kartenkatalog der Bibliothek** – geht in DC-093 auf.
- ✓ **DC-013 Bereiche als Polygon/Ellipse/Lasso**, additiv zeichnen, bearbeiten, Biom-Override, Name, geheim
  (T-108c1, T-260); Begriff „Bereich“ (T-262); „Bereich anlegen“ als Befehls-Panel (E-6). DM-Entscheidungen
  (2026-11-25): Migration auf Version 2; nur „Bereich“ mit Schalter „geheim“; Ablauf wie Dungeon-Manager;
  Bearbeiten = Eigenschaften, Form erweitern/abziehen, Ecken verschieben, löschen.
  Erledigt (Schritt 1): Karten-Sidecar und Szene `schemaVersion` 2 – ein Bereich hat `shape` (Polygone mit
  Löchern, mehrere Teile) und `secret` statt `rect`/`kind`; Version-1-Dateien, Szenen-Overrides und
  szeneneigene Bereiche werden beim Lesen migriert und als Version 2 gespeichert; Nebel, Sperren geheimer
  Bereiche, Overlay (gerade/ungerade Füllung, Name an einem Punkt innerhalb) und Treffer rechnen mit Polygonen.
  Erledigt (Schritt 2): Befehls-Panel „Bereich anlegen“ (Menüband Bereiche) oben rechts über der Karte, nicht
  modal: Form (Rechteck, Ellipse, Polygon, Lasso), Hinzufügen/Abziehen, Name, geheim, Nebel-Art, Farbe; Teile
  verbinden sich, Abziehen schneidet aus (auch Löcher); Ecken rasten am Raster ein, Alt zeichnet frei (Lasso immer
  frei); Vorschau auf der Karte; OK speichert als ein rückgängig machbarer Schritt mit neuer zufälliger ID, Esc oder
  Abbrechen verwirft; ein anderes Werkzeug beendet den Befehl. Das alte Rechteck-Werkzeug „Zone“ ist entfernt,
  Texte sagen „Bereich“. Abweichung: „Abziehen“ ist ein Schalter im Panel, weil Alt fürs freie Zeichnen gilt.
  Erledigt (Schritt 3): „Bereich bearbeiten“ per Doppelklick auf den Bereich (Browser oder Karte) oder aus dem
  Eigenschaften-Panel – derselbe Befehl mit den Werten des Bereichs: Eigenschaften, Form erweitern/abziehen, Ecken
  ziehen (eingerastet, Alt frei; danach wird die Form bereinigt), Löschen mit Rückfrage im Panel (Szenen-Overrides
  verwaisen); OK ändert den Bereich unter derselben ID als ein Schritt. Das Eigenschaften-Panel zeigt den Bereich
  nur noch an. Nicht umgesetzt: das Panel verschieben (bleibt oben rechts); Ellipsen zeigen viele Eckgriffe.
- ✓ **DC-014 Wände bearbeiten**: auswählen, Endpunkte verschieben, löschen, Ketten; Objekte als Polygon; Einweg-Wände
  (Klippen/Galerien) und Deckung (T-193). DM-Entscheidungen (2026-11-25): drei Schritte auf `feature/map-forge`
  (1. Bearbeiten und Ketten, 2. Einweg-Wände, 3. Deckung); „Wände zeichnen“ als Befehls-Panel (Art, Kette,
  OK/Abbrechen), Bearbeiten direkt mit „Auswählen“ (Endpunkte ziehen, Entf löscht, Art im Eigenschaften-Panel);
  Ketten = Gelenke über gemeinsame Endpunkte, das Format der Wände bleibt; Klippen und Deckung bringen Karte und
  Szene auf Version 3 mit Migration. Klippe (DM, 2026-11-25): oben ist links der Zeichenrichtung, ein Pfeil zeigt
  zur unteren Seite, „Richtung umdrehen“ im Zeichnen- und im Eigenschaften-Panel; Licht verhält sich wie Sicht.
  Erledigt (Schritt 1): Befehls-Panel „Wände zeichnen“ (Menüband Wände) oben rechts über der Karte: Art (Wand,
  Tür, Geheimtür, Fenster) mit kurzer Erklärung, Kette an/aus (Wand und Fenster ketten, Türen nicht), letztes Stück
  entfernen (auch Rücktaste); Enden rasten an vorhandenen Wandenden und am Raster ein, Alt zeichnet frei;
  Doppelklick oder Esc beendet eine Kette, ein zweites Esc den Befehl; OK fügt alle Stücke als ein rückgängig
  machbarer Schritt mit neuen zufälligen IDs hinzu. Mit „Auswählen“ in der Kartenschmiede: Klick wählt eine Wand
  (Umschalt: mehrere), Doppelklick die ganze Kette; ein Ende ziehen bewegt alle Wände, die dort zusammenstoßen
  (Umschalt: nur das Ende der ausgewählten Wand), zusammengefallene Wände verschwinden; Entf löscht die Auswahl;
  das Eigenschaften-Panel zeigt Anzahl, Art (änderbar) und Länge. Die Einzel-Werkzeuge Wand/Tür/Geheimtür/Fenster
  und „Letzte entfernen“ sind entfernt. Abweichung: Das Gelenk löst Umschalt statt Alt, weil Alt beim Klick ein
  Ping ist und beim Ziehen frei setzt.
  Erledigt (Schritt 2): Wandart „Klippe oder Galerie“ – einseitig: von der oberen Seite (links der
  Zeichenrichtung) sieht man hinunter, von unten nicht hinauf; Licht ebenso (jeder Betrachter und jede Lichtquelle
  hat eigene Blocker). Im Zeichnen-Panel als fünfte Art (kettet), „Richtung umdrehen“ dort und im
  Eigenschaften-Panel; auf der Karte mit Schraffur und Pfeil zur unteren Seite. Karte und Szene sind
  `schemaVersion` 3 (Migration ohne Datenänderung: ältere App-Versionen schreiben solche Dateien nicht zurück).
  Schritt 3 (Deckung) entfällt hier – DM-Entscheidung (2026-11-25): Die Deckungsmaske gehört zum Asset und wird im
  Asset-Editor festgelegt; weiter mit DC-108.
- **DC-107 Kontextsensitiver Karten-Editor** (DM-Wunsch 2026-11-25, `docs/KARTENEDITOR.md`): Dungeon- und
  Wildnis-/Stadtkarten selbst zeichnen – Wände, Wege, Flüsse, Gebäude, Türen, Brücken als editierbare Absichten
  (Intent-Modell mit Seeds), Regel-Pipeline für Ecken, Kreuzungen, Durchbrüche, Übergänge, handgezeichnete Optik und
  Detailstreuung, daraus Sicht- und Bewegungsdaten. Assets bleiben frei platzierbar (DC-041). DM-Entscheidung
  (2026-11-25): eigenes Thema nach DC-014; zu Beginn Interview und Entscheidung zum Datenmodell (u. a. Wände als
  Linienzüge, Türen auf Wänden – heute einzelne Strecken, also Migration). Umfasst DC-026 und DC-027 ganz oder teilweise.
- **DC-015 Assets und Ebenen** – Props siehe DC-041, Stockwerke DC-020, Zeichenebenen DC-101 (E-18).

### 3.3 Kartenschmiede (weiter)

- **DC-101 Zeichenebenen** (E-18): Wände, Bereiche, Props, Lichter, Tokens … als Ebenen im Browser mit
  Sichtbarkeit und Sperre beim Bearbeiten.
- **DC-020 Ebenen (Stockwerke)**: anlegen, umbenennen, eigenes Bild gleicher Größe, Arbeitsebene vs. TV-Ebene,
  Freigabe, Nebel je Ebene (T-118a/c/d).
- ✓ **DC-021 Rastereinmessung per N×N-Box** statt 3-Punkt, als Befehls-Panel; Raster verschieben; Schwenken während
  des Einmessens (T-177, T-251). Erledigt: Befehls-Panel „Raster einmessen“ (Menüband Karte › Raster): Felder je
  Seite 1–10 (Standard 3); ein auf der Karte aufgezogenes Quadrat über N×N Felder des gedruckten Rasters ergibt
  Zellgröße und Versatz, das Raster zeigt sich sofort (beim Einmessen immer sichtbar); innen ziehen verschiebt Box
  und Raster, Pfeiltasten 1 px (Umschalt 10 px), Zellgröße und Versatz auch als Zahl; OK speichert als ein
  rückgängig machbarer Schritt, Abbrechen/Esc oder ein anderes Werkzeug stellt das alte Raster wieder her, Speichern
  während des Einmessens schreibt die Vorschau nicht. Schwenken mit mittlerer/rechter Maustaste oder Leertaste. Die
  3-Punkt-Kalibrierung ist entfernt; die Box misst kein gedrehtes Raster (Drehung wird 0, das Feld bleibt in der
  Datei).
- **DC-022 Zuschneiden, Drehen, Bildanpassung** nicht-destruktiv (T-192).
- **DC-023 Kartenvarianten** je Ebene (Tag/Nacht/zerstört) (T-191).
- **DC-024 UVTT-Import** mit Raster, Wänden, Türen, Lichtern (T-198).
- **DC-025 Testfigur und Leck-Prüfung** für Wände (T-194); automatische Wände aus Bereichen (T-141).
- **DC-026 Parametrische Räume, Gelände mit Bewegungskosten, Treppen zwischen Ebenen** (T-195–197).
- **DC-027 Karte aus Kacheln, eigene Karten zeichnen** (T-190, Stufe 6).
- **DC-028 Einzelkarte teilen als `.dmmap`** (T-148).

### 3.4 Kampagne, Szenen, Atlas

- **DC-030, DC-031, DC-032** – gehen in DC-091 bis DC-095 auf.
- **DC-033 Sessions und Unterszenen** im Browser (T-152, T-160a/b).
- **DC-034 Dokument-Tabs** für offene Szenen/Karten, „Szene auf den TV“ nur auf Befehl; Kartenänderungen an
  der Szene auf dem TV erst nach Bestätigung (E-25; T-223a/b, T-134b).
- **DC-035 Papierkorb-Ansicht** mit Wiederherstellen (ohne Überschreiben) und „Papierkorb leeren“ von Hand; kein
  automatisches Löschen (E-21; T-122).
- **DC-036 Konfliktkopien und Platzhalter** von Cloud-Sync erkennen (T-103a).
- **DC-037 Notizen als Markdown** für jeden Editor (Obsidian-kompatibel), im Browser und Detail-Panel
  (T-161a/b, T-163).
- **DC-038 Atlas: Explorer, Szenen-Editor** mit Tokens, Props, Startzuständen, Fallen/Triggern, Phasen
  (T-181, T-209, T-210, T-227).
- **DC-039 Atlas-Planung**: Weltkarte mit Pins, Flussgraph, Checkliste, Suche, Zeitleiste, Beziehungen, Vorlagen
  (T-184, T-216–T-230).

### 3.5 Asset-Vault und Kreaturen

- ✓ **DC-040 Asset-Bibliothek** (E-27; T-178, T-179): Asset-Format Version 2 (Sidecar je Datei); Import mehrerer
  Dateien bzw. per Ziehen mit Duplikat-Erkennung, Art aus Dateityp, Größe aus „_2x2“; Asset-Vault mit
  Vorschau-Raster, Suche, Filtern (Art, Unterart, Umgebung, Tags, Sammlungen, Favoriten), Eigenschaften mit
  5-ft-Vorschau, Mehrfachauswahl, Stern, Sammlungen verwalten und Ziehen auf Sammlung; Audio der Bibliothek
  erscheint mit; Vorschaubild-Cache im App-Datenordner (Protokoll nur Bilder, nur DM-Fenster).
  Erledigt: Asset-Format 2 (alte Audio-Sidecars werden als Geräusch-Assets gelesen, das Soundboard schreibt
  Geräusch-Assets); Asset-Vault mit Katalog (Vorschaubilder auf Schachbrett, Größenregler, Suche, Stern,
  Mehrfachauswahl mit Umschalt/Strg), Browser (Arten mit Anzahl, Favoriten, Umgebungen, Sammlungen anlegen,
  umbenennen, löschen mit Bestätigung, Assets darauf ziehen), Eigenschaften (Name, Art, Unterart, Umgebungen,
  Tags, Größe, Gruppe, Sammlungen, Favorit; bei mehreren: gemeinsame Werte, „verschieden“, Änderungen gelten für
  alle) mit Vorschau auf dem 5-ft-Raster; Import per Dialog (mehrere Dateien) oder Ziehen ins Fenster (als Bytes,
  nie als Pfad), Duplikate per Hash. Vorschaubilder erzeugt das DM-Fenster, der Hauptprozess hält sie im
  App-Datenordner (nur PNG/WebP, Schlüssel aus Pfad/Größe/Zeit) – enger als freigegeben: ohne Änderung am
  Asset-Protokoll. Die Kartenliste der Schmiede zeigt keine Assets mehr. Änderungen im Vault sind nicht
  rückgängig machbar (direkt in die Sidecars). „Zuletzt benutzt“ kommt mit DC-041 (Platzieren). Import einer
  Datei, die die Bibliothek schon als Karte, unlesbar oder aus neuerer App-Version hat: bleibt unverändert,
  Hinweis im Log (keine Umwandlung in ein Asset).
- ✓ **DC-040b Pack-Import** (E-27; T-231): Ordner wählen, Unterordner ankreuzen, Fortschritt und Abbrechen ohne
  halbe Dateien; Ordnernamen → Tags plus „pack: …“; Varianten (oak_01, oak_02 …) als Gruppe; Namenskonflikte
  automatisch umbenennen. Import aus Karte/Handout heraus kommt mit DC-041 bzw. den Handouts.
  Erledigt: „Pack importieren“ (Menüband Asset): Ordner im nativen Dialog wählen; Dialog mit Pack-Name und
  Ordnerbaum (Häkchen, Unterordner folgen, Alle/Keine, Anzahl und Größe); Import Datei für Datei mit
  Fortschritt und Abbrechen (bis dahin kopierte Dateien bleiben, keine halbe Datei: erst daneben schreiben, dann
  verlinken); Duplikate über einen Größen-/Hash-Index der Bibliothek; Tags aus den Ordnern unter dem Pack plus
  „pack: <Name>“, Varianten (nummerierte Geschwister im selben Ordner) mit Gruppe „<Pack>: <Grundname>“; Größe aus
  „_2x2“. Versteckte Dateien, Sidecars, andere Dateitypen und Verknüpfungen werden übersprungen; das Fenster
  kennt nur ein Kennzeichen des Packs und Ordnernamen aus dem Scan. Schon vorhandene Dateien bleiben
  unverändert (keine Pack-Tags nachträglich).
- **DC-109 Asset-Editor** (E-27; T-202): in der Vault-Mitte – Größe in Feldern, Deckungsmaske (Kreis/Polygon,
  Vorschlag aus Transparenz), Licht (hell/dämmrig, Farbe, Flackern), Effekt-Verhalten (Dauerschleife an/aus,
  einmal auslösen, mit Licht/Ton).
- **DC-041 Assets auf der Karte** (E-27; T-144): in der Kartenschmiede platzieren (auch direkt eine Datei wählen),
  drehen in 15°-Schritten, skalieren, Varianten durchschalten; auf dem TV unter dem Nebel, Effekte animiert;
  Szenen blenden platzierte Assets aus wie andere Kartenelemente (DC-103).
- **DC-110 Szeneneigene Assets** (E-27): Assets nur in einer Szene, beim Vorbereiten (Start) oder im Spiel
  (Spielzustand, „Szene zurücksetzen“ entfernt sie); Maske und Licht gelten nur in dieser Szene.
- **DC-042 Smart Prefabs, Innenräume als Asset-Varianten** (T-202, T-146).
- **DC-108 Deckungsmasken am Asset** (T-193, T-202; DM-Wunsch 2026-11-25): Im Asset-Editor legt der DM die
  Deckungsmaske eines Assets fest (Kreis oder Polygon auf dem Bild – Baum, Säule, Statue); ein platziertes Asset ist
  automatisch maskiert: Die Maske dreht und skaliert mit, sie wird nur am Asset geändert und gilt dann überall
  (DM-Entscheidung 2026-11-25: keine Anpassung je Platzierung). In der Sicht wirft Deckung Schatten nach hinten, das
  Objekt selbst bleibt sichtbar. Hängt an DC-040 (Bibliothek), einem Asset-Editor und DC-041 (platzieren); das
  Asset-Thema: Interview geführt (E-27, 2026-11-25); Maske kommt aus DC-109, Platzieren aus DC-041.
- **DC-043 Kreaturen global** in der Bibliothek (Werteblock-Editor umziehen); Spielercharaktere siehe DC-096.
- **DC-044 Tokenbilder**: Token und Porträt, Token aus Porträt, Fraktionsring, ausgeschnittene Figur (T-203, T-208).
- **DC-045 Klone, Begegnungsgruppen, Gestalten, SRD-Import, eigene Footprints** (T-204–207, T-241).

### 3.6 Game-Orchestrator und Tisch

- **DC-050 Rastermodus je Szene, Kampfschalter mit Einrasten, Belegungsregeln** (T-233a–e, T-242, T-243);
  Positionen in Rasterfeldern.
- **DC-051 Initiative ergänzen**: Verzögern, Bereithalten, Schnelleingabe, Gruppenwürfe, Initiative-Leiste und
  aktiver Token auf dem TV (T-111a–d, T-213).
- **DC-052 Zustände mit Rundendauer, temporäre TP** (T-112a/b) – Stand in DC prüfen.
- **DC-053 Sichtbarkeit pro Element** mit „ungefähr“ für TP (T-110).
- **DC-054 TV-Kalibrierung per Prüfquadrat**, Feldgröße in Zoll oder cm, Standard-Einheit in den Einstellungen
  (T-106d).
- **DC-055 TV-Ausschnitt im DM-Fenster ziehen, Rasterlinien auf dem TV** (T-106b/c).
- **DC-056 Szenenübergänge** (Überblenden, durch Schwarz, sofort), Vorladen (T-135, später T-147).
- **DC-057 Pause- und Titelbild** per Knopf; der TV läuft außerhalb des Orchestrators weiter (E-19; T-175).
- **DC-058 Szenenleiste** mit Vorbereitung der nächsten Szene, Gruppenübersicht (T-182).
- **DC-059 Handouts auf dem TV** und Generator, Kartenfragmente; Gegenstände vorerst als Handout (E-20)
  (T-137–139).
- **DC-060 Würfel auf dem TV**, Würfe für viele Ziele (T-211, T-222).
- **DC-061 Videokarten synchron, Render-Auflösung, kein Webview-Kontextmenü** (T-128, T-116, T-239).
- **DC-102 Vorschau-Drehung umschaltbar** (E-22): Knopf an der Vorschau – folgt der TV-Drehung oder immer aufrecht.
- **DC-062 Zaubereffekte animiert, dauerhafte Effekte mit Konzentration** (SPEC §7).

### 3.7 Oberfläche

- **DC-070 Befehls-Panels** für Werkzeuge mit Optionen (OK/Abbrechen), Objekt-Einstellungen aus dem Browser
  (T-252, T-254, T-257); Zeichnen und Spielen bleiben direkt auf der Karte (E-6).
- **DC-071 Einstellungsdialog** mit Kategorien (Darstellung, Sprache, Nebel & Animation, Wurzelordner,
  Tisch mit Standard-Einheit, Panels) (T-155).
- **DC-072 Benannte Layouts** je Arbeitsbereich (T-172c).
- **DC-073 Oberflächengröße 90–125 %** (T-162).
- **DC-074 Browser als Objektbaum des offenen Dokuments** (T-173).
- **DC-075 Einheitliche Fachbegriffe** in beiden Sprachen („Bereich“ statt „Zone“ usw.).
- **DC-076 Befehle anheften, eigene Tastenkürzel** (T-256).

### 3.8 Spätere Stufen

- **DC-080 Begleit-Webseite** für Spieler und DM per QR-Code, ausgeliefert vom Rechner im WLAN, nur projizierte
  Daten, Pairing mit Einmal-Schlüssel und Sicherheitsprüfung (ADR-0007, T-151, E-13).
- **DC-081 Szenenentwürfe aus Markdown-Notizen** (Front Matter, jeder Editor) (T-150, E-14).
- **DC-082 Licht-Hardware**: Home Assistant, WLED, Hue, Govee/Nanoleaf; Zonen mit Rollen, Szenenlicht, Effekte,
  Ambilight, Fotosensibilitäts-Modus (SPEC §10, E-15).
- **DC-083 Kamera-Erkennung** der Miniaturen mit ArUco (SPEC §5.1, E-15).
- **DC-084 Zufallsgeneratoren, Kalender, Wetter, Session-Log mit Rückblick** (T-186, T-188, T-218–221);
  Gegenstände nur als Handouts (E-20).
- **DC-085 Musik-Playlists und Mixer** im Soundboard ergänzen (T-187); Tabletop-Audio-Import.

---

## 4. Offene Punkte

Derzeit keine. Neue Fragen werden mit `/topic-interviewer` geklärt und als E-… in Abschnitt 1 eingetragen.
