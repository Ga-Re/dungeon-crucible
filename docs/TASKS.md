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
| Rastereinmessung | ✓ N×N-Box | ✓ 3-Punkt | E-7 |
| Ebenen (Stockwerke) mit eigenem Bild, Freigabe auf dem TV | ✓ | ✗ | |
| Bereiche/Räume als Polygon, Ellipse, Lasso, je Ebene, geheim | ✓ | ◐ | DC: nur Rechtecke, Biom-Override ohne UI |
| Bereiche additiv zeichnen (Vereinigung) | ✓ | ✗ | |
| Wände, Türen, Geheimtüren, Fenster | ✗ | ✓ | DC weiter (DM: Stufe 5) |
| Wände bearbeiten (auswählen, verschieben, löschen) | ✗ | ◐ | DC: nur letzte Wand zurück |
| Lichtquellen der Karte | ✗ | ✓ | |
| Klippen/Galerien (Einweg), Deckung (Kreis/Polygon) | ✗ | ✗ | T-193 |
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
- **DC-103 Overrides bearbeiten**: je Element „Auf Karte zurücksetzen“, verwaiste Overrides anzeigen und aufräumen,
  Kennzeichnung geänderter Elemente im Orchestrator (T-145).
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
- **DC-001 Kartendaten beim Speichern nicht mehr verlieren** (Teil von DC-090). Tags, Biom, Kartentyp, POIs und Assets aus dem
  Sidecar beim Laden übernehmen und unverändert zurückschreiben; unbekannte Felder erhalten (zod `passthrough`).
  Test: Rundreise einer Datei mit allen Feldern.
- **DC-002 Ältere/neuere Dateiversionen** (Teil von DC-090). Neuere `schemaVersion` ablehnen statt überschreiben;
  Migrationsgerüst für Kampagne, Karte, Szene, Kreatur.
- **DC-003 Rettungskopie bei fehlgeschlagenem Speichern** (Gerätespeicher, Angebot beim nächsten Start) und
  Absturzerkennung (TV bleibt nach Absturz dunkel). Nach T-114b, T-238.
- **DC-004 PixiJS-Warnung beim Kartenwechsel** (Textur wird freigegeben, während sie noch gebunden ist) beheben.

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
- **DC-013 Bereiche als Polygon/Ellipse/Lasso**, additiv zeichnen, bearbeiten, Biom-Override, Name, geheim
  (T-108c1, T-260); Begriff „Bereich“ (T-262); „Bereich anlegen“ als Befehls-Panel (E-6).
- **DC-014 Wände bearbeiten**: auswählen, Endpunkte verschieben, löschen, Ketten; Objekte als Polygon; Einweg-Wände
  (Klippen/Galerien) und Deckung (T-193).
- **DC-015 Assets und Ebenen** – Props siehe DC-041, Stockwerke DC-020, Zeichenebenen DC-101 (E-18).

### 3.3 Kartenschmiede (weiter)

- **DC-101 Zeichenebenen** (E-18): Wände, Bereiche, Props, Lichter, Tokens … als Ebenen im Browser mit
  Sichtbarkeit und Sperre beim Bearbeiten.
- **DC-020 Ebenen (Stockwerke)**: anlegen, umbenennen, eigenes Bild gleicher Größe, Arbeitsebene vs. TV-Ebene,
  Freigabe, Nebel je Ebene (T-118a/c/d).
- **DC-021 Rastereinmessung per N×N-Box** statt 3-Punkt, als Befehls-Panel; Raster verschieben; Schwenken während
  des Einmessens (T-177, T-251).
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

- **DC-040 Asset-Bibliothek**: Import, Metadaten (Typ, Umgebung, Herkunft/Lizenz), Tags, Sammlungen, Favoriten,
  Duplikat-Erkennung, Pack-Import (flach mit Tags statt Ordnerstruktur) (T-178, T-179, T-231).
- **DC-041 Props auf der Karte**: platzieren, drehen in 15°-Schritten, skalieren, Sichtblocker aus Alpha (T-144).
- **DC-042 Smart Prefabs, Innenräume als Asset-Varianten** (T-202, T-146).
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
