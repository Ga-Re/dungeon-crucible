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
| E-28 | Ebenen (Zeichenebenen) | **Eigene, benannte Ebenen** in der Kartenschmiede plus Grundebene „Karte“; Wände, Bereiche, Lichter und Assets gehören je zu einer Ebene. Zwei Schalter: **im Editor sichtbar** (nur DM-Fenster, Arbeitshilfe; dazu Sperre gegen Bearbeiten) und **in der Szene aktiv** (wirkt für Spieler: inaktive Ebenen gibt es für Sicht, Wände, Licht und TV nicht; je Szene, Start und Spiel getrennt). Standard aktiv/inaktiv je Ebene. Auslöser: von Hand im Orchestrator, optional automatisch über einen Bereich (Spielerfigur betritt ihn → aktiv; beim Verlassen wieder inaktiv, einstellbar). **Gegenebene** (Innen ↔ Außen): wird die eine aktiv, wird die andere inaktiv. Ein Element wirkt nur, wenn seine Ebene aktiv und es selbst nicht ausgeblendet ist (DC-103 bleibt). **Höhen-Level** = Zeichenreihenfolge der Assets (keine Höhe für die Sicht). Bedienung: Ebenenliste im Browser (anlegen, umbenennen, löschen → Elemente auf „Karte“, Reihenfolge, Auge, Schloss, im Orchestrator „aktiv“), aktuelle Ebene für Neues, Elemente verschieben, Einstellungen je Ebene. Format: Karte Version 4, Szene Version 6, mit Migration. | Eigene Ebenen statt fester Art-Ebenen; zusätzlich szenenwirksam |
| E-29 | Smart Prefabs und Innenräume | **Anker** am Asset (im Asset-Editor gesetzt): Drehpunkt, rastet am Raster und an Wänden ein (Ausrichtung entlang der Wand). **Tür-Asset**: bringt eine im Asset-Editor gezeichnete Türlinie mit; auf eine Wand gelegt, rastet es ein und schneidet die Wand dort auf; danach wie eine gezeichnete Tür (öffnen, schließen, verschlossen). **Innenräume als Asset-Varianten**: ein Haus-Asset wählt ein anderes Asset seiner Gruppe als Innenansicht und bringt Innenwände, -türen und -fenster mit (im Asset-Editor gezeichnet, gelten überall). Außen blockiert die Deckungsmaske (DC-108), innen gelten statt ihrer die Innenwände; Wechsel mit Überblendung. **Auslöser**: DM-Klick, Spielerfigur betritt das Haus, Spielerfigur kommt auf einen Abstand heran – je optional mit Rückfrage (Hinweis mit Ja/Nein im DM-Fenster, blockiert nicht, ohne Antwort bleibt es außen). Standard am Asset, je Platzierung abweichend einstellbar. Beim Verlassen aller Spielerfiguren wieder außen (einstellbar). **TV**: ist ein Haus innen, sieht ihn jeder; Sicht und Nebel regeln weiter, was drinnen sichtbar ist. **DM-Fenster**: Dächer für den DM per Schalter im Orchestrator durchsichtig. Format: Asset Version 3, Karte Version 5, Szene Version 7 (Innen/Außen je Haus und Türzustände der Asset-Türen; Start und Spiel getrennt), mit Migration. Reihenfolge: Anker → Tür → Innenräume. | Innenräume am Asset statt nur über Ebenen |
| E-30 | Dokument-Tabs und TV | **Alle Dokumente** werden Tabs, gestaffelt: DC-034 bringt die Tab-Leiste mit **Szenen und Karten**; Kreaturen, Assets, Notizen/Handouts folgen als eigene Aufgaben auf derselben Leiste. **Eine gemeinsame Tab-Leiste** (Titelleiste); ein Tab öffnet sich im passenden Arbeitsbereich, eine Szene bleibt im aktuellen Szenen-Bereich (Schmiede/Orchestrator). Jeder Tab behält seine Änderungen und sein Rückgängig. **TV nur per Befehl**: „Szene auf den TV“ (Menüband, Kontextmenü des Tabs), TV-Markierung am Tab; ein Tab-Wechsel ändert den TV nie – im Orchestrator fragt ein Hinweis „Auf den TV? Ja/Nein“ (blockiert nicht, ohne Antwort bleibt der TV). Die **TV-Szene läuft im Hintergrund** weiter (Sicht, Effekte, Darstellung), während ein anderer Tab bearbeitet wird. **Kartenänderungen** an der Karte der TV-Szene (Kartenschmiede) erreichen den TV erst über den Hinweis „Auf den TV übernehmen“ (löst E-25 ab); Szenenänderungen im Orchestrator gehen sofort hin. Schließen des Tabs der TV-Szene **fragt vorher**, danach ist der TV schwarz; eine Szene kommt **nie von selbst** auf den TV (DM-Entscheidung nach dem Review). Offene Tabs und TV-Szene werden **je Kampagne** als Geräte-Einstellung gemerkt; nach dem Start ist der TV **geschwärzt bis zur Freigabe**. | Alle Dokumente statt nur Szenen; TV-Szene live im Hintergrund statt nur bei aktivem Tab |
| E-31 | Asset-Objekte und Varianten | **Objekte mit Varianten**: eine eigene **Objekt-Datei** neben den Bildern (z. B. `library/dorf/einfache-huette.object.json`, neue Dateiart „object“ Version 1) mit Name, Hauptvariante (Vorschaubild, Standard beim Platzieren), Varianten (Datei + Variantenname wie „Innen“, „Zerstört“) und den **gemeinsamen Feldern** Art, Unterart, Umgebungen, Größe, Sammlungen, Favorit; **je Variante** im Sidecar der Datei: Tags, Maske, Licht, Anker, Tür, Innenraum. Ein **Einzelbild bleibt ein einfaches Asset**; mit der zweiten Variante entsteht die Objekt-Datei. Bestehende **Gruppen werden automatisch zu Objekten** (ab zwei Dateien; Name = Gruppe, gemeinsame Felder und Hauptvariante von der ersten Datei); der Pack-Import legt Objekte an. Vault: **eine Karte je Objekt**, die Varianten rechts zum Auswählen/Bearbeiten. **Unterarten** im Browser unter ihrer Art (mit Anzahl). **Suche mit Vorschlägen** beim Tippen (Präfix, z. B. „Bre“ → „Brennend“) aus Tags, Art/Unterart, Umgebungen, Sammlungen und Namen; ein Objekt passt, wenn eine seiner Varianten passt. **Zufällige Variante**: Schalter im Assets-Panel (Geräte-Einstellung), jedes Ablegen eines Objekts legt eine zufällige Variante (keine, die als Innenansicht dient). **Drehgriff** am ausgewählten Asset auf der Karte: stufenlos um den Anker (sonst die Mitte), ein Rückgängig-Schritt. Platzierungen verweisen weiter auf die Variante (Datei). | Objekt-Datei statt Gruppe je Datei (löst E-27 „Varianten je Datei“ ab) |
| E-32 | Kartenkatalog und Kartendateien | Die **Kartenschmiede** zeigt in der Mitte einen **Katalog aller Karten** der Bibliothek (Vorschaubilder), solange keine Karte offen ist; ein fester Tab **„Karten“** ganz links in der Tab-Leiste führt jederzeit dorthin. **Browser**: Kartentyp (mit Anzahl), Tags, Biom, benutzt/unbenutzt. **Details rechts**: Infos (Name, Typ, Tags direkt änderbar; Größe, Raster, Vorschau), **„Bearbeiten“** öffnet den Karteneditor (Karten-Tab) – ebenso Doppelklick und Rechtsklick › Öffnen; die Szenen der offenen Kampagne auf dieser Karte (Öffnen) plus Hinweis auf Szenen anderer Kampagnen; „Neue Szene auf dieser Karte“; Papierkorb (mit Hinweis, wo benutzt). **Kartenbilder sind fest**: eine neue Karte entsteht mit einem Bild, das nicht ausgetauscht wird. **Duplizieren** fragt „nur die Karte“ (Bild, Raster, Typ, Tags, Biom) oder „mit allem“ (auch Wände, Bereiche, Lichter, Assets, Ebenen, Start-Nebel; neue IDs); Szenen werden nicht kopiert. Eine Kopie ist eine **eigene Kartendatei `library/<name>.map.json`**, die auf das vorhandene Bild verweist (kein doppelter Speicher); bestehende Karten (`bild.dm.json`) bleiben gültig. | Kartenbild nicht ersetzbar; Duplikat als eigene Kartendatei statt Bildkopie |
| E-33 | Karten-Editor (DC-107, `docs/KARTENEDITOR.md`) | **Gezeichnete Karten ohne Bild** (neue Kartendatei `library/<name>.map.json` ohne Bild) **und Zeichnen über Bildkarten**, mit denselben Werkzeugen (Ergänzung zu E-32). **Gezeichnete Mauern sind die Quelle**: Linienzüge mit Stil, Dicke und Seed; Sicht- und Bewegungs-Wände werden daraus abgeleitet. Die heutigen unsichtbaren Wände bleiben unverändert und überall als zweites Werkzeug (Fenster, Klippen, Barrieren); keine Umwandlung alter Karten. **Türen sitzen auf der Mauer** (Position, Breite), offen/zu/geheim; „verschlossen“ später einheitlich für alle Türen. Geheime Tür: unentdeckt auf dem TV Mauer – je Tür optional ein dezenter **Riss** (Schalter, neu aus; bewusste Ausnahme vom TV-Grundsatz). **Fläche wächst mit** (Gezeichnetes plus Rand, auf Felder gerundet), in alle Richtungen über einen gespeicherten **Ursprung** (Koordinaten bleiben, Szenen unberührt), **ohne Größengrenze**. **Untergrund**: außen Fels, innen passend zur nächsten Mauer mit weichem Übergang; ein **Boden-Pinsel** malt Böden mit sauberem Übergang an Mauern. **Stile**: Dungeon-Stein, Höhlenfels, Ziegel, Holz. **Optik**: Formen, Ecken, Kreuzungen, Durchbrüche, Zittern, Schatten und Übergänge im eigenen Code (Seeds, keine neue Abhängigkeit); **Texturen** für Flächen und Einzelteile (Ecksteine, Türrahmen, Pfeiler) mit Higgsfield erzeugt und mit der App ausgeliefert (DM: Rechte geklärt). **Zeichnen**: Klick-Klick, Doppelklick/Enter beendet, Startpunkt schließt den Ring; rastet an Feldecken und Mauern ein, Alt frei; Modi Raster/halbes Raster/Winkel/frei. **Bearbeiten**: Punkte ziehen, einfügen, löschen; teilen und verbinden; Stil, Dicke, Seed im Eigenschaften-Panel. **Menüband**: neuer Tab „Bauen“ in der Kartenschmiede. **Szenen** dürfen eigene gezeichnete Mauern haben (wie E-24) und speichern Türzustände. Format: Karte Version 6, Szene Version 8, mit Migration. Reihenfolge: DC-107a → b → c; Wege, Flüsse, Brücken, Räume, Dächer und Streuung danach. | Kein Bild nötig (E-32); Texturen im Repo |
| E-34 | Gezeichnete Klippen und Abhänge (DC-107d) | **Wirkung wie heutige Klippen** (DC-014): Einweg-Sicht – von oben sieht man hinunter, von unten nicht hinauf; Bewegung darüber blockiert; ein flacher **Abhang** ist nur Optik. **Arten**: Felsklippe, Erdabhang, Grube/Senke, Plateau/Hügel, Schlucht/Graben, Geröllhalde, Terrassen/Stufen, Abgrund/Kluft. **Zeichnen**: offene Kante als Linie wie eine Mauer, die Oberseite per Pfeil („Richtung umdrehen“); ein geschlossener Ring ist Grube (innen tiefer) oder Plateau (innen höher); Schlucht: ein Strich mit Breite. **Aussehen nach Kartenbiom** (bzw. dem Biom eines Bereichs): Schnee, Moos, Sand – kein eigener Stil je Klippe. **Bewuchs** (Gras, Büsche, Moos) an der Oberkante automatisch nach Biom, mit festen Seeds, je Klippe abschaltbar. **Geröllhalde**: Optik und Markierung „schwieriges Gelände“ für den DM; Bewegungskosten kommen mit DC-026 und gelten dann auch hier. **Wirkung** (Klarstellung 2026-11-26): Einweg-Sicht; Bewegung blockiert die App bisher nirgends (auch nicht bei Wänden). **Untergrund** (DM 2026-11-26): fern von Mauern (über 3 Felder, außerhalb geschlossener Mauerringe) natürlicher Boden nach Biom – Gras/Erde, Schnee, Sand (Wüste, Küste), Asche, Sumpf; nahe Mauern weiter deren Boden; Feinarbeit mit dem Boden-Pinsel (DC-107b). | Ergänzung zu E-33 (DM-Wunsch mit Beispielbildern) |

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
  Interview 2026-11-25: E-33. Pakete:
  - ◐ **DC-107a Mauern und Türen**: Datenmodell (Karte v6), Graph mit Ecken/Kreuzungen, Türen auf Mauern
    (offen/zu/geheim, Riss-Schalter), Sicht und Bewegung abgeleitet, vier Stile mit Texturen, automatischer Untergrund,
    mitwachsende Fläche, „Neue gezeichnete Karte“ im Katalog, Tab „Bauen“, Zeichnen und Bearbeiten.
    Erledigt: Kern (`core/build/masonry.ts`: Linienzüge, Türen auf Mauern, abgeleitete Sicht-Wände, Graph, Umriss,
    Ausdehnung mit Ursprung); Format: Karte Version 6 (`masonry`, `masonryDoors`, `origin`), gezeichnete Karte =
    `library/<name>.map.json` mit `resource: "drawn:"`, im Katalog gelistet; Türzustände und „gefunden“
    (`<id>:found`) im `doors` der Szene (keine neue Szenenversion); Duplizieren: bei einer gezeichneten Karte gehört
    die Zeichnung zu „nur die Karte“, über einem Bild gezeichnete Mauern nur zu „mit allem“ (DM 2026-11-25).
    Anschluss: Sicht, Licht und Nebel nehmen die abgeleiteten Wände (Ebenen der Szene); Türen per Klick, eine
    geöffnete Geheimtür bleibt gefunden, ebenso beim Entdecken eines geheimen Bereichs. Gezeichnete Karten öffnen
    ohne Bild; der Renderer legt Karte, Raster, Licht, Erinnerung und Nebel an den Ursprung (`render/pixi/origin.ts`),
    über Bildkarten liegt die Zeichnung als eigene Ebene. TV: `map.drawn` im Frame (Version 4) nur mit Mauern aktiver
    Ebenen, sichtbaren Türen und eingeschalteten Rissen – eine unentdeckte Geheimtür wird nie gesendet (Test).
    Geprüft in der App (Kartenschmiede, Spiel, TV). Vorläufige flache Optik (`render/drawnMap.ts`).
    Darstellung (`render/drawnMap.ts`, `render/build/textures.ts`, `core/build/handDrawn.ts`): Böden nach der nächsten
    Mauer mit weichen Übergängen, Mauern mit Textur, zitterndem Umriss (ortsfest, flackert nicht), Schatten,
    Lichtkante und Kontur, Ecksteine/Pfeiler an Knoten, Türen, Risse und die Geheimtür-Markierung des DM als eigene
    kleine Bilder (ein Türklick malt die Karte nicht neu). Die Karte malt sich kachelweise (`PaintedImage`), also ohne
    Canvas-Grenze; gemessen: 200 × 200 Felder, 400 Räume – Öffnen blockiert ≤ 0,7 s. Textur-Plätze (11) mit
    erzeugten Mustern als Ersatz, bis die Higgsfield-Bilder da sind (DM lädt Credits auf; Free-Tarif: Rechte vor dem
    Einchecken prüfen).
    Tab „Bauen“ (`app/build.ts`, `core/build/editing.ts`, `panels/BuildCommandPanel.tsx`): Bearbeiten, Mauer, Tür,
    Einrasten. Mauer: Befehls-Panel mit Stil, Dicke (ft) und Einrasten (Raster, halbes Raster, 45°, frei; Alt frei),
    Klick für Klick, Doppelklick/Enter beendet, Klick auf den Anfang schließt den Ring, Rücktaste nimmt den letzten
    Punkt zurück; jede Mauer ist ein Schritt. Tür: Klick auf eine Mauer, mittig auf einem Feld, „geheim“ im Panel.
    Bearbeiten: Punkte ziehen (rasten an anderen Mauern ein), Klick auf die Linie der ausgewählten Mauer fügt einen
    Punkt ein, ein Ende auf ein anderes gezogen verbindet (auf das eigene: Ring), Entf löscht Punkt/Tür/Mauer, Türen
    entlang der Mauer ziehen; Türen behalten bei Änderungen ihren Platz. Eigenschaften: Stil, Dicke, „Neu würfeln“,
    „Hier teilen“, Löschen; Tür: Breite, geheim, Riss. Die Fläche einer gezeichneten Karte folgt dem Gezeichneten.
    Katalog: „Neue gezeichnete Karte“ (Karte mit offener Kampagne), Karte mit Mauer-Symbol statt Vorschaubild,
    „Kartendatei: Gezeichnete Karte“. Geprüft in der App (Raum mit Tür, Höhlenwand, Auswahl, Speichern).
    Texturen (2026-11-26): 11 Bilder mit Higgsfield (Seedream 5.5) erzeugt, als WebP (~650 KB) in
    `app/src/render/build/textures/`; Herkunft dort im README; Rechte laut DM durch den Higgsfield-Tarif geklärt.
    Mauern werden dunkler als jeder Boden gezeichnet (lesbar auch auf gleichem Stein).
    Katalog: gezeichnete Karten mit gemaltem Vorschaubild (verkleinert gemalt, nie in voller Größe), Karte und Details.
    Nur Geändertes neu malen (`core/build/dirty.ts`): eine Änderung malt nur den Bereich der geänderten Mauern, ihrer
    Türen und der Böden mit neuer nächster Mauer neu (Renderer `repaint`); Umrisse werden je Gruppe sich berührender
    Mauern zwischengespeichert. Gemessen (200 × 200 Felder, 400 Räume): eine Mauer zeichnen blockiert ~0,18 s (vorher
    ~0,7 s); wächst die Fläche, wird alles neu gemalt.
    Offen: `npm run bench` (braucht das 4K-Testvideo und den TV) – DM.
  - **DC-107b Boden-Pinsel** mit sauberem Übergang an Mauern.
  - **DC-107c Eigene Mauern in Szenen** (Szene v8).
  - **DC-107d Klippen und Abhänge** (E-34, DM-Wunsch 2026-11-26): Klippen, Abhänge, Gruben, Plateaus, Schluchten,
    Geröllhalden, Terrassen und Abgründe zeichnen; Einweg-Sicht und Bewegungsblock wie die Klippen aus DC-014;
    Aussehen nach Biom, Bewuchs an der Oberkante. Reihenfolge der Pakete b–d wählt der DM.
  - Danach (eigene Pakete): Wege/Flüsse/Brücken, Räume und Dächer, Detailstreuung, Wildnis-/Stadt-Modus.
- **DC-015 Assets und Ebenen** – Props siehe DC-041, Stockwerke DC-020, Zeichenebenen DC-101 (E-18).

### 3.3 Kartenschmiede (weiter)

- ✓ **DC-101 Ebenen** (E-18, E-28): eigene Ebenen mit Sichtbarkeit im Editor, Sperre, Aktiv-Schalter je Szene,
  Auslöse-Bereich, Gegenebene und Höhen-Level (Zeichenreihenfolge) – siehe E-28. Erledigt: Karte V4 und Szene V6
  mit Migration (alte Dateien: alles auf der Grundebene „Karte“). Kartenschmiede: Ebenenliste im Browser mit
  aktueller Ebene (neue Wände, Bereiche, Lichter und Assets landen darauf), Auge (im Editor ausblenden), Sperre,
  Höher/Tiefer und Einstellungen (Name, Höhe, anfangs aktiv, Auslöse-Bereich mit „beim Verlassen aus“,
  Gegenebene – gegenseitig, Löschen mit Rückfrage: Elemente gehen auf die Grundebene); „Ebene“-Auswahl in den
  Eigenschaften von Wänden, Bereichen, Lichtern und Assets. Szene/Orchestrator: Häkchen „aktiv“ je Ebene (Start und
  Spiel getrennt, Gegenebene schaltet mit), automatischer Auslöser beim Betreten eines Bereichs durch einen SC
  (aus beim Verlassen, wenn eingestellt), Protokolleintrag. Elemente inaktiver Ebenen fehlen in Sicht, Licht und
  TV-Projektion, werden aber nicht als ausgeblendet gespeichert; Assets werden nach Ebenenhöhe gezeichnet.
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
- ✓ **DC-034 Dokument-Tabs** für offene Szenen/Karten, „Szene auf den TV“ nur auf Befehl; Kartenänderungen an
  der Szene auf dem TV erst nach Bestätigung (E-25, E-30; T-223a/b, T-134b). Schritte: 1. Sitzungen je Dokument
  (Szene, Karten-/Szenendatei, Rückgängig, Speichern) und die Tab-Leiste für Szenen; 2. TV per Befehl, TV-Szene im
  Hintergrund, Rückfrage im Orchestrator, Schließen der TV-Szene; 3. Karten-Tabs und „Auf den TV übernehmen“;
  4. Tabs je Kampagne wiederherstellen, TV nach dem Start geschwärzt.
  Erledigt (Schritt 1): Jede offene Szene ist eine Sitzung (Karten- und Szenendatei, Rückgängig, ungespeicherter
  Zustand, Effekte, Rückfragen); die Tab-Leiste in der Titelleiste zeigt die offenen Szenen (aktive mit Akzentlinie
  und Punkt, solange nicht gespeichert), Klick wechselt (vorher wird gespeichert), ✕ oder Mittelklick schließt;
  eine Szene aus dem Browser oder eine neue Karte öffnet sich als Tab. Szenen auf derselben Karte teilen deren
  letzte Änderungen.
  Erledigt (Schritt 2): Der TV wechselt nur per Befehl – „Szene auf den TV“ (Menüband Spiel › Szene, Kontextmenü
  des Tabs); der Tab der TV-Szene trägt ein TV-Zeichen. Eine Szene kommt nie von selbst auf den TV (DM-Entscheidung
  nach dem Review). Während ein anderer Tab gezeigt wird, baut der TV seine Szene aus deren Dateien (sie ändert sich im
  Hintergrund nicht); die Tischmitte gehört zur Szene, Drehung/Schwärzung/Kalibrierung zum TV. Wechselt der DM im
  Orchestrator auf eine andere Szene, fragt unten rechts „… auch auf den TV?“ (blockiert nicht). Schließen des
  TV-Tabs fragt vorher, danach ist der TV schwarz (ohne Daten einer Szene im Bild). Die Hintergrundmusik gehört zur
  TV-Szene (was die Spieler hören): ein Tab-Wechsel ändert sie nicht, „Auf den TV“ übernimmt die der Szene.
  Nebenbei behoben: eine neu geöffnete Szene übernahm die Tischmitte der vorigen.
  Erledigt (Schritt 3): Karten-Tabs – ein Klick auf eine Bibliotheks-Karte öffnet sie allein als Tab (keine
  Szene); „Neue Szene auf dieser Karte“ im Kontextmenü der Karte und des Tabs. Ein Karten-Tab zeigt sich nur in der
  Kartenschmiede (Wechsel dorthin); im Orchestrator tritt die TV-Szene (sonst der letzte Szenen-Tab) an seine
  Stelle. Kartenänderungen an der Karte der TV-Szene (in deren Tab oder einem Karten-Tab derselben Karte) zeigt der
  TV erst nach „Auf den TV übernehmen“ (Hinweis unten rechts, Protokolleintrag); Szenenänderungen gehen sofort
  hin. Tabs haben eine Mindestbreite, die Leiste scrollt.
  Erledigt (Schritt 4): Offene Tabs, der gezeigte Tab und die TV-Szene werden je Kampagne als Geräte-Einstellung
  gemerkt (bei jedem Speichern, auch nur nach einem Tab-Wechsel) und beim Öffnen der Kampagne in ihrer Reihenfolge
  wiederhergestellt; fehlende Szenen/Karten bleiben zu (Protokolleintrag). Nach dem Öffnen ist der TV geschwärzt,
  bis der DM „Szene auf den TV“ wählt oder die Schwärzung aufhebt.
  Nach dem Review: Tabs im Hintergrund mit ungespeicherten Änderungen werden beim nächsten Speichern mitgeschrieben
  (Punkt am Tab), Speichern wartet auf ein laufendes Speichern; die Hintergrundmusik gehört der TV-Szene, ohne
  TV-Szene der gezeigten (Schließen der TV-Szene löscht keine Musik mehr aus einer Szenendatei); der TV ist beim
  Öffnen der Kampagne von Anfang an schwarz; sein Maßstab kommt aus dem Raster der TV-Szene; Rückgängig bleibt in
  der Ebene, in der es aufgezeichnet wurde; ein Karten-Tab erscheint nie im Orchestrator; Pings erreichen den TV
  auch, solange Kartenänderungen warten; ein geschlossener Tab kommt beim Öffnen nicht zurück.
- ✓ **DC-034b Kreaturen als Tabs** (E-30): Ein Klick in der Kreaturen-Liste und „Neue Kreatur/Neuer Charakter“
  öffnen die Kreatur als Tab (Figur-Symbol, Name folgt dem Werteblock) im Arbeitsbereich Kreaturen; die Szene oder
  Karte dahinter und der TV bleiben. Ein Szenen-/Karten-Tab führt zurück in Kartenschmiede bzw. Orchestrator (wo
  zuletzt); Schließen zeigt den Nachbarn; Kreatur-Tabs kommen je Kampagne wieder (gelöschte bleiben zu). Nebenbei
  behoben: eine neue Kreatur bekam die id ihrer Vorlage (jetzt neu und zufällig) und einen festen englischen Namen.
  Werteblock-Änderungen haben weiter kein Rückgängig.
- ✓ **DC-034c Assets als Tabs** (E-30): „Asset bearbeiten“ (Doppelklick, Eigenschaften) öffnet den Asset-Editor als
  Tab (Würfel-Symbol) im Asset-Vault. DM-Entscheidung (2026-11-25): Der Entwurf bleibt beim Wechseln und bei „Zurück
  zum Katalog“ im Tab (Punkt am Tab); OK speichert (der Tab bleibt), Abbrechen verwirft und schließt den Tab; das ✕
  fragt bei nicht gespeichertem Entwurf „Verwerfen?“. Asset-Tabs kommen je Kampagne wieder (fehlende bleiben zu).
  Nebenbei behoben: Tabs werden bei jeder Änderung der Tab-Leiste gemerkt (vorher nur beim Speichern – ein
  Kreatur-Tab ging beim Beenden verloren); beim Öffnen werden die gemerkten Tabs gelesen, bevor sich etwas öffnet.
- **DC-034d Notizen und Handouts als Tabs** – auf der Tab-Leiste aus DC-034; hängt an DC-037 (Notizen) und den
  Handouts.
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
- ✓ **DC-109 Asset-Editor** (E-27; T-202): in der Vault-Mitte – Größe in Feldern, Deckungsmaske (Kreis/Polygon,
  Vorschlag aus Transparenz), Licht (hell/dämmrig, Farbe, Flackern), Effekt-Verhalten (Dauerschleife an/aus,
  einmal auslösen, mit Licht/Ton). DM-Entscheidungen (2026-11-25): Deckung hält auch Licht auf (wie Sicht); vorerst
  nur volle Deckung.
  Erledigt: Doppelklick auf ein Asset (oder „Asset bearbeiten …“ im Asset-Panel) öffnet es in der Vault-Mitte
  auf dem 5-ft-Raster in seiner Größe; Befehls-Panel mit Größe, Deckungsmaske (Kreis aufziehen, Polygon klicken,
  „Aus Umriss vorschlagen“ aus dem Alphakanal – größter Umriss, vereinfacht –, Griffe ziehen, Entfernen), Licht
  (bei Lichtquellen immer, sonst „Bringt ein Licht mit“: hell/dämmrig, Farbe, Flackern, Position per Klick) und
  bei Effekten Dauerschleife bzw. einmal auslösen; OK speichert, Abbrechen/Esc verwirft. Format: `cover`,
  `light`, `effect` im Asset-Sidecar (Version 2, noch nicht in `main`, daher ohne Versionssprung); Masken und
  Licht in Feld-Koordinaten der Grundfläche. Ton am Effekt kommt mit DC-104; wirksam werden Maske und Licht mit
  DC-041/DC-108.
- ✓ **DC-041 Assets auf der Karte** (E-27; T-144): in der Kartenschmiede platzieren (auch direkt eine Datei wählen),
  drehen in 15°-Schritten, skalieren, Varianten durchschalten; auf dem TV unter dem Nebel, Effekte animiert;
  Szenen blenden platzierte Assets aus wie andere Kartenelemente (DC-103).
  Erledigt: Panel „Assets“ in der Kartenschmiede (zuletzt benutzt – Geräte-Einstellung –, Suche, Arten, Import);
  Ziehen auf die Karte stellt das Asset in seiner Größe aus dem Vault (Felder × Zellgröße × Skalierung) und rastet
  ein (bei Vierteldrehungen Kanten am Raster, sonst Mitte auf einer Zelle). Mit „Auswählen“: Klick wählt, Ziehen
  verschiebt; R/Umschalt+R drehen um 15°, +/− skalieren, V nächste Variante der Gruppe, Entf entfernt; dasselbe im
  Eigenschaften-Panel; alles rückgängig machbar. Darstellung als eigene Ebene über dem Raster, unter Licht, Tokens
  und Nebel, im DM-Fenster und auf dem TV; Effekt-Videos laufen in Schleife. Der TV bekommt nur die nicht
  ausgeblendeten Platzierungen (Projektion). Fehlt die Datei, zeigt die Schmiede einen Platzhalter. Ausblenden im
  Orchestrator mit „Ein-/ausblenden“; Kartenformat unverändert (`assets` gab es schon). Maske und Licht der Assets
  wirken mit DC-108; Effekte einmal auslösen kommt mit DC-110 bzw. dem Orchestrator.
- ✓ **DC-110 Szeneneigene Assets** (E-27): Assets nur in einer Szene, beim Vorbereiten (Start) oder im Spiel
  (Spielzustand, „Szene zurücksetzen“ entfernt sie); Maske und Licht gelten nur in dieser Szene.
  DM-Entscheidungen (2026-11-25): Szene Version 5 (`assets` und `effects` im Spielzustand und im Start;
  Asset-Lichter im vorhandenen `lights`); dazu Asset-Lichter je Szene an/aus, Flackern darstellen, Effekte
  steuern (Schleife an/aus, einmal auslösen); Bedienung wie in der Schmiede (Panel „Assets“ auch im Orchestrator,
  mit „Auswählen“ nur szeneneigene Assets bearbeiten; Kartenassets nur ein-/ausblenden).
  Erledigt: Szenendatei Version 5; zur Laufzeit liegen die szeneneigenen Assets neben denen der Karte (Sicht,
  Licht, Darstellung, TV nehmen beide); beim Vorbereiten platziert gehören sie zum Start, im Spiel zum
  Spielzustand; „Szene zurücksetzen“ übernimmt den Start. Panel „Assets“ auch im Orchestrator (Ziehen/Enter);
  „Auswählen“ verschiebt, dreht, skaliert und löscht nur szeneneigene Assets. Ein Klick auf ein Asset schaltet sein
  Licht bzw. einen Schleifen-Effekt (rückgängig machbar, gespeichert) oder spielt einen Einmal-Effekt ab (nicht
  gespeichert; im DM-Fenster und auf dem TV einmal, dann verschwindet er); ein Effekt ohne Einstellung gilt als
  Schleife. Flackern der Asset-Lichter im DM-Fenster und auf dem TV. Robustheit: das Sichtpolygon wird immer
  aufgeräumt (ein Licht nahe einer Wandecke brachte die Clipping-Bibliothek zum Abbruch); scheitert das Zuschneiden
  eines Lichts für den TV, bleibt es dort dunkel. Bekannt: PixiJS prüft beim ersten Video mit einem `data:`-Video,
  das die CSP blockiert – harmlose Meldung in der Konsole, Pixi nimmt den Standard.
- ✓ **DC-042 Smart Prefabs, Innenräume als Asset-Varianten** (E-29; T-202, T-146). Masken, Lichter und Effekte
  am Asset sind mit DC-108/DC-109/DC-110 erledigt. Schritte: 1. Anker (Drehpunkt, Einrasten an Raster und Wänden);
  2. Tür-Asset (Türlinie, schneidet die Wand auf); 3. Innenräume (Innen-Asset, Innenwände, Auslöser mit Abstand und
  Rückfrage, Überblendung, Dächer für den DM durchsichtig). Format: Asset V3, Karte V5, Szene V7.
  Erledigt (Schritt 1): Asset Version 3 mit Anker (`anchor`: Punkt in Feldern, „an Wänden einrasten“). Im
  Asset-Editor „Anker setzen“ (rastet auf Viertelfelder ein, Griff zum Ziehen), Schalter und Entfernen. Platzierte
  Assets drehen und skalieren um den Anker; beim Ablegen rastet der Anker auf Ecken, Kantenmitten und Feldmitten
  ein – mit Wand-Rasten auf eine nahe Wand (Abstand Anker–Mitte plus ein halbes Feld), entlang gedreht, auf der
  Seite, auf der man es abgelegt hat. Platzierungen speichern weiter die Mitte (Karte unverändert).
  Erledigt (Schritt 2): Tür-Asset – im Asset-Editor „Ist eine Tür“ (Türlinie quer durch die Mitte, ohne Anker
  einer in der Mitte mit Wand-Rasten), Türlinie zeichnen und an den Enden ziehen (Viertelfelder). Platziert wird
  die Linie zur Tür; liegt sie auf einer Wand, bekommt die Wand dort eine Lücke. Beides wird beim Berechnen von
  Sicht und Licht abgeleitet – die Wände der Karte bleiben wie gezeichnet, Verschieben oder Löschen des Assets
  verschiebt bzw. schließt die Lücke. Öffnen/Schließen im Orchestrator per Klick auf Tür oder Asset (rückgängig
  machbar), gespeichert in den Türen der Szene unter `<Platzierung>:door` – dafür braucht es weder Karte V5 noch
  Szene V7. Der Anker rastet auch entlang der Wand auf das Halbfeld-Gitter (Türen sitzen mittig im Feld).
  Erledigt (Schritt 3): Innenräume – Asset Version 3 mit `interior` (Innen-Asset aus der Gruppe, Innenwände,
  -türen, -fenster in Feldern, Auslöser), Karte Version 5 (eigener Auslöser je Platzierung), Szene Version 7
  (`interiors` im Spielzustand und im Start), jeweils mit Migration. Im Asset-Editor: „Hat einen Innenraum“ (nur mit
  einem anderen Asset derselben Gruppe), Innen-Asset wählen, „Inneres zeigen und bearbeiten“ (Bühne zeigt das
  Innenbild), Wand/Tür/Fenster aufziehen (Viertelfelder), letzte entfernen; Auslöser: nur per Klick, beim Betreten,
  beim Nähern (Abstand in ft), „Vorher fragen“, „Wieder außen, wenn alle gegangen sind“. In der Kartenschmiede je
  Platzierung „Wie am Asset“ oder ein eigener Auslöser. Im Orchestrator: Klick auf das Haus schaltet innen/außen
  (rückgängig machbar, Protokoll); Spielerfiguren lösen beim Betreten/Nähern aus, mit Rückfrage als Hinweis mit
  „Zeigen“/„Jetzt nicht“ oben rechts auf der Karte (blockiert nicht). Innen: Innenbild statt Dach, Deckungsmaske
  aus, Innenwände zählen für Sicht und Licht, Innentüren öffnen per Klick (gespeichert unter `<Platzierung>:in<n>`).
  Der Wechsel wird überblendet (DM-Fenster und TV). „DM sieht durch Dächer“ im Panel Nebel (Standard an): außen
  zeigt das DM-Fenster das Innenbild unter einem halb durchsichtigen Dach; der TV nie. Die Kartenschmiede zeigt
  Häuser immer von außen. Rückfrage nur beim Hineingehen; Verlassen schaltet ohne Rückfrage zurück.
  Nach dem Review (DM-Entscheidung 2026-11-25): Das Innere gilt als unerforscht, bis es gesehen wird – beim
  Umschalten auf innen vergisst der Nebel die Erinnerung auf der Hausfläche (vom DM Aufgedecktes bleibt). Außerdem:
  Wand-Cache erkennt nachträglich ergänzte/geänderte Wände, Auslöser nach dem Laden der Bibliothek und nach
  Rückgängig neu bestimmt, Überblendung in richtiger Zeichenreihenfolge, Zustände gelöschter Häuser werden nicht
  gespeichert. „Verschlossen“ (E-29) gibt es noch nicht – auch nicht für gezeichnete Türen; kommt es, gilt es für
  Asset-Türen mit.
- ✓ **DC-108 Deckungsmasken am Asset** (T-193, T-202; DM-Wunsch 2026-11-25): Im Asset-Editor legt der DM die
  Deckungsmaske eines Assets fest (Kreis oder Polygon auf dem Bild – Baum, Säule, Statue); ein platziertes Asset ist
  automatisch maskiert: Die Maske dreht und skaliert mit, sie wird nur am Asset geändert und gilt dann überall
  (DM-Entscheidung 2026-11-25: keine Anpassung je Platzierung). In der Sicht wirft Deckung Schatten nach hinten, das
  Objekt selbst bleibt sichtbar. Hängt an DC-040 (Bibliothek), einem Asset-Editor und DC-041 (platzieren); das
  Asset-Thema: Interview geführt (E-27, 2026-11-25); Maske kommt aus DC-109, Platzieren aus DC-041.
  Erledigt: Masken platzierter Assets werden zu Polygonen auf der Karte (mit Drehung und Skalierung; Kreise als
  Vieleck); ihre Kanten halten Sicht und Licht auf wie Wände; die Deckung selbst gilt als gesehen bzw. beleuchtet,
  soweit Wände sie nicht verdecken (das Objekt bleibt sichtbar); wer in einer Maske steht (Figur oder Licht), für
  den wirkt sie nicht. Lichter der Assets werden Lichtquellen an der gedrehten Position (immer an). DM-Sicht und
  TV rechnen mit denselben Daten; ausgeblendete Assets zählen nicht. In der Schmiede zeigt das Overlay die Masken
  gestrichelt. Robustheit: Flächen mit Deckung werden auf 1/100 px gerundet (die Clipping-Bibliothek lief bei fast
  deckungsgleichen Kanten in eine Endlosrekursion); scheitert die Berechnung dennoch, rechnet die Figur bzw. das
  Licht ohne Masken weiter. Offen: Asset-Lichter je Szene schalten und das Flackern darstellen.
  Nach dem Review: Sicht mit vielen Masken beschleunigt (40 Masken ~120 statt ~600 ms, Test als Wächter); ein
  Fehler der Clipping-Bibliothek lässt die Masken blockierend (schließt, statt zu öffnen).
  DM-Entscheidungen (2026-11-25): Kartenschmiede-Änderungen (auch platzierte Assets) erscheinen bis DC-034 sofort
  auf dem TV (E-25). Figuren in einer Maske (Zelt, Wagen) sind für die Spieler verborgen, bis eine ihrer Figuren
  in derselben Maske steht – umgesetzt in der Projektion; die Innenansicht (Inneres zeigen, wenn jemand eintritt)
  kommt über die Ebenen in Kartenschmiede und Szeneneditor (DC-101, Innenräume DC-042).
- ✓ **DC-112 Objekte mit Varianten** (E-31): Objekt-Datei `library/<name>.object.json` (Dateiart „object“ Version 1,
  gelesen mit Prüfung; unlesbare werden gemeldet und ausgelassen). Beim Lesen der Bibliothek werden Gruppen ab zwei
  Dateien ohne Objekt zu Objekten (damit legt auch der Pack-Import Objekte an). Die gemeinsamen Felder des Objekts
  gelten für alle Varianten; eine Änderung daran (am Objekt oder an einer Variante) geht in die Objekt-Datei und an
  alle Varianten. Vault: eine Karte je Objekt (Bild der Hauptvariante, Anzahl), rechts Objekt (Name, Datei,
  Varianten mit Bild – Klick wählt eine, Stern = Hauptvariante, ✕ nimmt sie heraus), „Variante hinzufügen“ (aus
  einem Einzel-Asset entsteht so ein Objekt), darunter die Felder der Auswahl (Tags nur je Variante). Ein Objekt mit
  nur noch einer Variante löst sich auf (Datei in den Papierkorb, keine Gruppe bleibt zurück). Das Feld „Gruppe“
  entfällt in der Oberfläche. Das Assets-Panel zeigt Objekte einmal und legt die Hauptvariante. Der Dateiname eines
  Objekts folgt seinem Namen nicht (Umbenennen ändert nur den Namen).
- ✓ **DC-111 Unterarten im Browser** (E-31): unter jeder Art ihre Unterarten mit Anzahl (übersetzt sortiert), ein
  Klick filtert darauf; die Zahlen zählen den Katalog, wie er gezeigt wird (ein Objekt einmal).
- ✓ **DC-114 Suche mit Vorschlägen** (E-31): im Asset-Vault Vorschläge beim Tippen (Wortanfang, übersetzt) aus Tags,
  Arten, Unterarten, Umgebungen, Sammlungen, Namen (auch Objektnamen); Pfeiltasten/Enter oder Klick machen daraus
  einen Filter (Chip mit ✕). Ein Objekt passt über eine seiner Varianten oder seinen Namen; die Freitextsuche findet
  auch übersetzte Arten/Unterarten und Sammlungen. (Das Assets-Panel der Karte hat weiter die einfache Suche.)
- ✓ **DC-115 Zufällige Variante** (E-31): „Zufällige Variante“ – nach DM-Entscheidung im Platzier-Panel (DC-116)
  statt als Schalter im Assets-Panel; wählt nie eine Innenansicht.
- ✓ **DC-113 Drehgriff** (E-31): am ausgewählten Asset (Kartenschmiede; szeneneigene im Orchestrator) ein runder
  Griff über der Oberkante; ziehen dreht stufenlos um den Anker (sonst die Mitte), ein Rückgängig-Schritt.
- ✓ **DC-116 Platzier-Modus** (E-31; DM-Wunsch 2026-11-25): Ein Klick auf ein Asset im Assets-Panel öffnet ein
  Befehls-Panel „… platzieren“; über der Karte zeigt eine halb durchsichtige Vorschau, was der nächste Klick legt
  (Variante, Drehung, Größe schon ausgewürfelt), jeder Klick platziert eines (ein Rückgängig-Schritt je Asset), der
  Modus bleibt bis Esc, Rechtsklick, ✕/„Fertig“, einem anderen Werkzeug oder einem anderen Arbeitsbereich.
  Einstellungen (DM-Entscheidungen): Variante wählen oder „Zufällige Variante“ (ohne Innenansichten), zufällige
  Drehung in Schritten frei/15°/90° (sonst feste Drehung), zufällige Größe ± %, Einrasten am Raster. Der Schalter
  „Zufällige Variante“ aus DC-115 ist ins Panel gewandert; Ziehen aus der Seitenleiste legt die Hauptvariante. Die
  Vorschau erscheint nur im DM-Fenster. In der Kartenschmiede auf der Karte, im Orchestrator szeneneigen.
- ✓ **DC-117 Kartenkatalog** (E-32): Die Kartenschmiede zeigt ohne offene Karte/Szene (und über den festen Tab
  „Karten“ ganz links) den Katalog aller Bibliothekskarten mit Vorschaubildern und Suche; Browser: Kartentypen mit
  Anzahl, „In dieser Kampagne“ benutzt/unbenutzt, Landschaften, Tags. Details rechts: Vorschau, Name/Typ/Tags
  (änderbar, solange die Karte nicht offen ist – Dateiregeln), Datei, Größe, Raster, „Bearbeiten“ (Karten-Tab;
  ebenso Doppelklick, Enter, Rechtsklick › Öffnen), die Szenen der offenen Kampagne (öffnen) mit Hinweis auf andere
  Kampagnen, „Neue Szene auf dieser Karte“, Papierkorb mit Hinweis, wo benutzt. Die alte Kartenliste im Browser der
  Kartenschmiede entfällt.
- ✓ **DC-118 Karten duplizieren** (E-32): Eine Karte ist jetzt über ihre Kartendatei bestimmt (`state.mapFile`:
  `bild.dm.json` oder eine Kopie `library/<name>.map.json` auf demselben Bild) – Speichern, Karten-Tabs, geteilte
  Kartenstände, „Auf den TV übernehmen“ und neue Szenen richten sich danach; alte Tabs mit Bildpfad öffnen weiter.
  Im Katalog „Duplizieren“ mit Name und „Nur die Karte“ (Bild, Raster, Typ, Tags, Landschaft, Nebel-Aussehen) oder
  „Mit allem“ (auch Wände, Bereiche, Lichter, Assets, Ebenen, Punkte, Start-Nebel; neue IDs, Verweise – Ebene,
  Auslöse-Bereich, Gegenebene – folgen); offene Änderungen werden vorher gespeichert. Kopien stehen mit „Kopie“ im
  Katalog; eine unlesbare Kopie oder eine ohne Bild wird gemeldet und ausgelassen. Papierkorb: eine Kopie nur,
  solange keine Szene sie benutzt; ein Bild nicht, solange Kopien es benutzen (Hinweis).
  Nach dem Review (DM-Entscheidung 2026-11-25): Der Kampagnen-Export nimmt Kopien mit; der Import behandelt sie wie
  Kartendateien (fehlt: anlegen; gleicher Inhalt: benutzen; anderer Inhalt: freier Name `<name>-2.map.json`, die
  Szenen folgen; ein umbenanntes Bild wird in der Kopie nachgezogen). Außerdem: eine noch nie geöffnete Karte öffnet
  wieder (Bild aus dem Pfad); aus dem Katalog geht es zurück zur offenen Karte (Tab, „Bearbeiten“, Szene); eine
  Kopie überschreibt keine Datei der Bibliothek (auch keine unlesbare); solange eine Kopie unlesbar ist, kommt kein
  Bild in den Papierkorb; Tasten wirken nicht auf die Karte hinter dem Katalog, ein Werkzeug holt sie nach vorn;
  gemerkte Tabs mit Bildpfad werden auf die Kartendatei umgestellt.
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
