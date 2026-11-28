# Dungeon Crucible – Abgleich mit Dungeon-Manager und Taskliste

Stand: 2026-11-24, ergänzt 2026-11-27 (E-46 – E-77 und DC-121 – DC-137: prozedurale Kartenschmiede). Grundlage: [Ga-Re/Dungeon-Manager](https://github.com/Ga-Re/Dungeon-Manager) (`docs/SPEC.md`,
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
| E-24 | Szeneneigene Elemente | **Eingeschränkt durch E-59 (2026-11-27):** szeneneigene Zeichnung nur noch Wege und Assets; unsichtbare Wände, Lichter und Bereiche bleiben. Eine Szene darf **eigene Wände, Lichter und Bereiche** haben, die es auf der Karte nicht gibt (z. B. ein eingestürzter Gang); die Karte bleibt unberührt. | DM: nur Overrides |
| E-25 | Kartenänderung und TV | Bis zu den Szenen-Tabs (DC-034) erscheinen Kartenänderungen aus der Kartenschmiede **sofort** auf dem TV; die Bestätigung vor dem Übernehmen kommt mit DC-034. | Übergang |
| E-26 | Was die Kartenschmiede zeigt | **Nur die Karte** mit allem, was zu ihr gehört (Raster, Wände, Bereiche, Lichter, Props, Assets, Eigenschaften) und ihrem **Start-Nebel** (dort gemalt; jede neue Szene auf der Karte beginnt damit, je Szene anpassbar über E-17). **Tokens gehören zur Szene** und erscheinen in der Schmiede nicht. | – |
| E-23 | Arbeitsweise | **Sammel-Branch** je Thema, ein PR am Ende, der DM gibt den Merge frei. Nachfragen bei Abhängigkeiten, Dateiformat/Ordnern, Abweichungen vom Plan, Sicherheit und wenn etwas nicht ganz klar ist. Regeln in `CLAUDE.md`; Skills `topic-interviewer`, `next-task`, `finish-task`, `ui-design` und Agent `reviewer` in `.claude/`. | DM: PR je Task, Agent merged selbst |
| E-27 | Assets | **Bibliothek zuerst**, dann Pack-Import, Asset-Editor, Platzieren, Deckung, szeneneigene Assets. **Arten fest** (Prop, Kartenteil, Textur, Effekt, Lichtquelle, Geräusch, Handout) mit **Unterarten** als Vorschlag plus eigene; **Umgebungen** als Vorschlagsliste plus eigene, mehrere je Asset. Der **Asset-Vault** zeigt alle Bibliotheksdateien außer Karten und Kreaturen (auch Audio). **Sidecar je Datei** (Asset-Format Version 2): Name, Art, Unterart, Tags, Umgebungen, Größe in Feldern, Gruppe (Varianten), Sammlungen, Favorit, später Maske/Licht/Effekt-Verhalten; „zuletzt benutzt“ ist Geräte-Einstellung. Formate PNG, WebP, JPG, WebM (mit Transparenz), MP4. Import: mehrere Dateien/Ziehen, Pack mit Unterordner-Wahl, aus Karte/Handout heraus; Duplikate per Hash; Ordnernamen → Tags plus „pack: …“; Größe aus „_2x2“, Art aus Dateityp, Varianten gebündelt (je Datei ein Asset, gemeinsame Gruppe); Namenskonflikte automatisch umbenennen. Vault: Vorschau-Raster in der Mitte, Filter/Sammlungen links, Eigenschaften mit 5-ft-Vorschau rechts; Mehrfachauswahl, Stern, Ziehen auf Sammlung, Sammlungen verwalten. **Vorschaubild-Cache im App-Datenordner**; das Asset-Protokoll liefert daraus nur Bilder und nur an das DM-Fenster (DM-Freigabe Sicherheit). Editor in der Vault-Mitte: Größe, Deckungsmaske (Kreis/Polygon, Vorschlag aus Transparenz), Licht (hell/dämmrig, Farbe, Flackern), Effekt-Verhalten je Effekt einstellbar (Dauerschleife an/aus, einmal auslösen, mit Licht/Ton). Platzieren auf der Karte, Szenen blenden aus; **szeneneigene Assets** als Ausnahme zu DC-103 (Start oder Spiel, Maske/Licht nur in der Szene). TV: Assets unter dem Nebel, Effekte animiert, ausgeblendete nie. | Bibliothek vor Durchstich; Varianten je Datei statt gebündelt im Sidecar |
| E-28 | Ebenen (Zeichenebenen) | **Eigene, benannte Ebenen** in der Kartenschmiede plus Grundebene „Karte“; Wände, Bereiche, Lichter und Assets gehören je zu einer Ebene. Zwei Schalter: **im Editor sichtbar** (nur DM-Fenster, Arbeitshilfe; dazu Sperre gegen Bearbeiten) und **in der Szene aktiv** (wirkt für Spieler: inaktive Ebenen gibt es für Sicht, Wände, Licht und TV nicht; je Szene, Start und Spiel getrennt). Standard aktiv/inaktiv je Ebene. Auslöser: von Hand im Orchestrator, optional automatisch über einen Bereich (Spielerfigur betritt ihn → aktiv; beim Verlassen wieder inaktiv, einstellbar). **Gegenebene** (Innen ↔ Außen): wird die eine aktiv, wird die andere inaktiv. Ein Element wirkt nur, wenn seine Ebene aktiv und es selbst nicht ausgeblendet ist (DC-103 bleibt). **Höhen-Level** = Zeichenreihenfolge der Assets (keine Höhe für die Sicht). Bedienung: Ebenenliste im Browser (anlegen, umbenennen, löschen → Elemente auf „Karte“, Reihenfolge, Auge, Schloss, im Orchestrator „aktiv“), aktuelle Ebene für Neues, Elemente verschieben, Einstellungen je Ebene. Format: Karte Version 4, Szene Version 6, mit Migration. | Eigene Ebenen statt fester Art-Ebenen; zusätzlich szenenwirksam |
| E-29 | Smart Prefabs und Innenräume | **Anker** am Asset (im Asset-Editor gesetzt): Drehpunkt, rastet am Raster und an Wänden ein (Ausrichtung entlang der Wand). **Tür-Asset**: bringt eine im Asset-Editor gezeichnete Türlinie mit; auf eine Wand gelegt, rastet es ein und schneidet die Wand dort auf; danach wie eine gezeichnete Tür (öffnen, schließen, verschlossen). **Innenräume als Asset-Varianten**: ein Haus-Asset wählt ein anderes Asset seiner Gruppe als Innenansicht und bringt Innenwände, -türen und -fenster mit (im Asset-Editor gezeichnet, gelten überall). Außen blockiert die Deckungsmaske (DC-108), innen gelten statt ihrer die Innenwände; Wechsel mit Überblendung. **Auslöser**: DM-Klick, Spielerfigur betritt das Haus, Spielerfigur kommt auf einen Abstand heran – je optional mit Rückfrage (Hinweis mit Ja/Nein im DM-Fenster, blockiert nicht, ohne Antwort bleibt es außen). Standard am Asset, je Platzierung abweichend einstellbar. Beim Verlassen aller Spielerfiguren wieder außen (einstellbar). **TV**: ist ein Haus innen, sieht ihn jeder; Sicht und Nebel regeln weiter, was drinnen sichtbar ist. **DM-Fenster**: Dächer für den DM per Schalter im Orchestrator durchsichtig. Format: Asset Version 3, Karte Version 5, Szene Version 7 (Innen/Außen je Haus und Türzustände der Asset-Türen; Start und Spiel getrennt), mit Migration. Reihenfolge: Anker → Tür → Innenräume. | Innenräume am Asset statt nur über Ebenen |
| E-30 | Dokument-Tabs und TV | **Alle Dokumente** werden Tabs, gestaffelt: DC-034 bringt die Tab-Leiste mit **Szenen und Karten**; Kreaturen, Assets, Notizen/Handouts folgen als eigene Aufgaben auf derselben Leiste. **Eine gemeinsame Tab-Leiste** (Titelleiste); ein Tab öffnet sich im passenden Arbeitsbereich, eine Szene bleibt im aktuellen Szenen-Bereich (Schmiede/Orchestrator). Jeder Tab behält seine Änderungen und sein Rückgängig. **TV nur per Befehl**: „Szene auf den TV“ (Menüband, Kontextmenü des Tabs), TV-Markierung am Tab; ein Tab-Wechsel ändert den TV nie – im Orchestrator fragt ein Hinweis „Auf den TV? Ja/Nein“ (blockiert nicht, ohne Antwort bleibt der TV). Die **TV-Szene läuft im Hintergrund** weiter (Sicht, Effekte, Darstellung), während ein anderer Tab bearbeitet wird. **Kartenänderungen** an der Karte der TV-Szene (Kartenschmiede) erreichen den TV erst über den Hinweis „Auf den TV übernehmen“ (löst E-25 ab); Szenenänderungen im Orchestrator gehen sofort hin. Schließen des Tabs der TV-Szene **fragt vorher**, danach ist der TV schwarz; eine Szene kommt **nie von selbst** auf den TV (DM-Entscheidung nach dem Review). Offene Tabs und TV-Szene werden **je Kampagne** als Geräte-Einstellung gemerkt; nach dem Start ist der TV **geschwärzt bis zur Freigabe**. | Alle Dokumente statt nur Szenen; TV-Szene live im Hintergrund statt nur bei aktivem Tab |
| E-31 | Asset-Objekte und Varianten | **Objekte mit Varianten**: eine eigene **Objekt-Datei** neben den Bildern (z. B. `library/dorf/einfache-huette.object.json`, neue Dateiart „object“ Version 1) mit Name, Hauptvariante (Vorschaubild, Standard beim Platzieren), Varianten (Datei + Variantenname wie „Innen“, „Zerstört“) und den **gemeinsamen Feldern** Art, Unterart, Umgebungen, Größe, Sammlungen, Favorit; **je Variante** im Sidecar der Datei: Tags, Maske, Licht, Anker, Tür, Innenraum. Ein **Einzelbild bleibt ein einfaches Asset**; mit der zweiten Variante entsteht die Objekt-Datei. Bestehende **Gruppen werden automatisch zu Objekten** (ab zwei Dateien; Name = Gruppe, gemeinsame Felder und Hauptvariante von der ersten Datei); der Pack-Import legt Objekte an. Vault: **eine Karte je Objekt**, die Varianten rechts zum Auswählen/Bearbeiten. **Unterarten** im Browser unter ihrer Art (mit Anzahl). **Suche mit Vorschlägen** beim Tippen (Präfix, z. B. „Bre“ → „Brennend“) aus Tags, Art/Unterart, Umgebungen, Sammlungen und Namen; ein Objekt passt, wenn eine seiner Varianten passt. **Zufällige Variante**: Schalter im Assets-Panel (Geräte-Einstellung), jedes Ablegen eines Objekts legt eine zufällige Variante (keine, die als Innenansicht dient). **Drehgriff** am ausgewählten Asset auf der Karte: stufenlos um den Anker (sonst die Mitte), ein Rückgängig-Schritt. Platzierungen verweisen weiter auf die Variante (Datei). | Objekt-Datei statt Gruppe je Datei (löst E-27 „Varianten je Datei“ ab) |
| E-32 | Kartenkatalog und Kartendateien | Die **Kartenschmiede** zeigt in der Mitte einen **Katalog aller Karten** der Bibliothek (Vorschaubilder), solange keine Karte offen ist; ein fester Tab **„Karten“** ganz links in der Tab-Leiste führt jederzeit dorthin. **Browser**: Kartentyp (mit Anzahl), Tags, Biom, benutzt/unbenutzt. **Details rechts**: Infos (Name, Typ, Tags direkt änderbar; Größe, Raster, Vorschau), **„Bearbeiten“** öffnet den Karteneditor (Karten-Tab) – ebenso Doppelklick und Rechtsklick › Öffnen; die Szenen der offenen Kampagne auf dieser Karte (Öffnen) plus Hinweis auf Szenen anderer Kampagnen; „Neue Szene auf dieser Karte“; Papierkorb (mit Hinweis, wo benutzt). **Kartenbilder sind fest**: eine neue Karte entsteht mit einem Bild, das nicht ausgetauscht wird. **Duplizieren** fragt „nur die Karte“ (Bild, Raster, Typ, Tags, Biom) oder „mit allem“ (auch Wände, Bereiche, Lichter, Assets, Ebenen, Start-Nebel; neue IDs); Szenen werden nicht kopiert. Eine Kopie ist eine **eigene Kartendatei `library/<name>.map.json`**, die auf das vorhandene Bild verweist (kein doppelter Speicher); bestehende Karten (`bild.dm.json`) bleiben gültig. | Kartenbild nicht ersetzbar; Duplikat als eigene Kartendatei statt Bildkopie |
| E-33 | Karten-Editor (DC-107, `docs/KARTENEDITOR.md`) | **Teilweise abgelöst (2026-11-27):** gezeichnete Mauern → Fels-Raster und Wandlinien (E-48); Zeichnen über Bildkarten bleibt (E-60). **Gezeichnete Karten ohne Bild** (neue Kartendatei `library/<name>.map.json` ohne Bild) **und Zeichnen über Bildkarten**, mit denselben Werkzeugen (Ergänzung zu E-32). **Gezeichnete Mauern sind die Quelle**: Linienzüge mit Stil, Dicke und Seed; Sicht- und Bewegungs-Wände werden daraus abgeleitet. Die heutigen unsichtbaren Wände bleiben unverändert und überall als zweites Werkzeug (Fenster, Klippen, Barrieren); keine Umwandlung alter Karten. **Türen sitzen auf der Mauer** (Position, Breite), offen/zu/geheim; „verschlossen“ später einheitlich für alle Türen. Geheime Tür: unentdeckt auf dem TV Mauer – je Tür optional ein dezenter **Riss** (Schalter, neu aus; bewusste Ausnahme vom TV-Grundsatz). **Fläche wächst mit** (Gezeichnetes plus Rand, auf Felder gerundet), in alle Richtungen über einen gespeicherten **Ursprung** (Koordinaten bleiben, Szenen unberührt), **ohne Größengrenze**. **Untergrund**: außen Fels, innen passend zur nächsten Mauer mit weichem Übergang; ein **Boden-Pinsel** malt Böden mit sauberem Übergang an Mauern. **Stile**: Dungeon-Stein, Höhlenfels, Ziegel, Holz. **Optik**: Formen, Ecken, Kreuzungen, Durchbrüche, Zittern, Schatten und Übergänge im eigenen Code (Seeds, keine neue Abhängigkeit); **Texturen** für Flächen und Einzelteile (Ecksteine, Türrahmen, Pfeiler) mit Higgsfield erzeugt und mit der App ausgeliefert (DM: Rechte geklärt). **Zeichnen**: Klick-Klick, Doppelklick/Enter beendet, Startpunkt schließt den Ring; rastet an Feldecken und Mauern ein, Alt frei; Modi Raster/halbes Raster/Winkel/frei. **Bearbeiten**: Punkte ziehen, einfügen, löschen; teilen und verbinden; Stil, Dicke, Seed im Eigenschaften-Panel. **Menüband**: neuer Tab „Bauen“ in der Kartenschmiede. **Szenen** dürfen eigene gezeichnete Mauern haben (wie E-24) und speichern Türzustände. Format: Karte Version 6, Szene Version 8, mit Migration. Reihenfolge: DC-107a → b → c; Wege, Flüsse, Brücken, Räume, Dächer und Streuung danach. | Kein Bild nötig (E-32); Texturen im Repo |
| E-34 | Gezeichnete Klippen und Abhänge (DC-107d) | **Abgelöst durch E-46 (2026-11-27):** Klippen entstehen aus Höhenstufen. **Wirkung wie heutige Klippen** (DC-014): Einweg-Sicht – von oben sieht man hinunter, von unten nicht hinauf; Bewegung darüber blockiert; ein flacher **Abhang** ist nur Optik. **Arten**: Felsklippe, Erdabhang, Grube/Senke, Plateau/Hügel, Schlucht/Graben, Geröllhalde, Terrassen/Stufen, Abgrund/Kluft. **Zeichnen**: offene Kante als Linie wie eine Mauer, die Oberseite per Pfeil („Richtung umdrehen“); ein geschlossener Ring ist Grube (innen tiefer) oder Plateau (innen höher); Schlucht: ein Strich mit Breite. **Aussehen nach Kartenbiom** (bzw. dem Biom eines Bereichs): Schnee, Moos, Sand – kein eigener Stil je Klippe. **Bewuchs** (Gras, Büsche, Moos) an der Oberkante automatisch nach Biom, mit festen Seeds, je Klippe abschaltbar. **Geröllhalde**: Optik und Markierung „schwieriges Gelände“ für den DM; Bewegungskosten entfallen (DM 2026-11-26, DC-026). **Wirkung** (Klarstellung 2026-11-26): Einweg-Sicht; Bewegung blockiert die App bisher nirgends (auch nicht bei Wänden). **Untergrund** (DM 2026-11-26): fern von Mauern (über 3 Felder, außerhalb geschlossener Mauerringe) natürlicher Boden nach Biom – Gras/Erde, Schnee, Sand (Wüste, Küste), Asche, Sumpf; nahe Mauern weiter deren Boden; Feinarbeit mit dem Boden-Pinsel (DC-107b). | Ergänzung zu E-33 (DM-Wunsch mit Beispielbildern) |
| E-35 | Karten-Editor wie Tiny Glade, Wasser, 2,5D (DC-107e–g) | **Teilweise abgelöst (2026-11-27):** Wasser → E-47, Lichtrichtung erweitert durch E-71; die Bedienung (Ziehen, Shift, Alt) bleibt (E-67). Vorbild im Bedienen und in der Automatik (ziehen, das Programm denkt mit, Details entstehen von selbst, alles organisch formbar) – **ohne** Aussehen oder Inhalte des Spiels zu übernehmen. **Zeichnen** (ändert E-33): Ziehen mit gedrückter Maus zeichnet frei (geglättet, danach bearbeitbare Punkte), **Shift** zieht gerade Linien, Klick-Klick bleibt – für alle Werkzeuge. **Wasser**: Fluss/Bach (Strich mit Breite und Fließrichtung; Strömung, Schaum an Steinen und Ufern), See/Teich (Fläche; sanfte Wellen), Meer/Küste (Brandung, Wellen zum Ufer), **Wasserfall automatisch**, wo ein Fluss eine Klippe von oben nach unten kreuzt; Animation **je Karte** an/aus; Wasser ist **nur Optik** (keine Regelwirkung). **2,5D von oben**: die Karte bleibt Draufsicht (Raster, TV, Nebel, Sicht unverändert), Mauern, Klippen und Gebäude zeigen ihre Höhe (Krone versetzt, sichtbare Seitenfläche, Schatten); **Lichtrichtung je Karte** einstellbar. **Automatik**: Türme an Mauerecken, Zinnen und Mauerkrone, Ufer-Details (Steine, Schilf, Kies, Schaum nach Biom), weiche Übergänge (Gras an Mauerfüßen, ausgetretene Kanten, Böden fließen ineinander), jeweils abschaltbar. **Fenster** in gezeichneten Mauern und Häusern (wie Türen auf der Mauer); sie verdecken weder Sicht noch Licht, inneres Licht scheint hinaus. Reihenfolge: Pinsel (DC-107e) → Wasser (DC-107f) → 2,5D mit Automatik und Fenstern (DC-107g). **Ergänzung** (DM 2026-11-26): Türme und Zinnen nur an Mauern mit dem Schalter **„Wehrmauer“** (je Mauer); **Höhe** je Stil vorgegeben (Holz niedrig, Stein/Ziegel mittel, Wehrmauer hoch), je Mauer änderbar; **Fenster** im Tür-Werkzeug (Tür / Geheimtür / Fenster). | DM-Wunsch 2026-11-26 |
| E-36 | Lebendige Karten: Varianz und Generator (DC-119) | **Teilweise abgelöst (2026-11-27):** „Optik überall neu“ bestätigt (E-51); der Generator entfällt mit dem Umbau und kommt später neu (E-66). **Optik überall neu** – gilt sofort für alle gezeichneten Karten, die Dateien bleiben unverändert (nur Formen und Seeds sind gespeichert). **Böden**: je Material mehrere Texturvarianten, je Feld deterministisch aus Position+Seed gewählt und gedreht/gespiegelt; Regel-Kacheln (Ränder an Mauern, Übergänge zwischen Materialien); Großflächen-Rauschen (zwei Lagen gemischt + große helle/dunkle Flecken); abgewetzte Wege zwischen Türen. **Mauern/Klippen**: Textur folgt der Linie (Steinreihen biegen sich mit der Spline), Kantenrauheit je Seed, **Verfallsgrad je Element** (Risse, fehlende Steine, Geröll – optionales Feld). **Wasser**: organische Uferlinie je Seed, Textur und Animation folgen der Strömung, Flachzonen mit sichtbarem Grund und Tiefenvarianz. **Generator** in zwei Formen: **Fläche füllen** (Bereich aufziehen, Werkzeug im Bauen-Tab) und **ganze Karte** („Karte generieren …“ im Kartenkatalog); Live-Regler mit sichtbarem Seed, gerechnet im Worker (Vorschau verkleinert, Reglerantwort < ~100 ms); erzeugt Mauern+Türen+Böden, Klippen+Wasser, Ausstattung/Details und Lichtquellen; Stile zum Start **Dungeon** (WFC) und **Höhle** (Cellular Automata + WFC-Detail), Gebäude/Burg und Wildnis später. **Übernehmen backt ein**: alles wird zu normalen Elementen, von Hand editierbar; Seed+Parameter bleiben als Metadaten-Notiz an der Karte (Nachwürfeln in der UI später). **Texturen**: alle Materialien in einem Higgsfield-Durchlauf (Varianten, Randkacheln, Übergänge). Grenzen: TV hält 60 FPS (Bench), nur optionale Zusatzfelder in der Kartendatei (v7, triviale Migration), der TV sieht weiterhin nur die Projektion. Reihenfolge: Optik zuerst (Böden → Mauern/Klippen → Wasser), dann Flächen-Generator, dann Ganz-Karte. **Präzisierung** (DM 2026-11-26): Der Dungeon-Stil nutzt einen **Raumgraph** (Räume platzieren, Gänge als Spannbaum – immer zusammenhängend, Regler wirken direkt); WFC bleibt für flächige Muster und das Höhlen-Detail. **Ohne Worker** (DM 2026-11-26): gemessen ~10 ms bei 120×90 Feldern; ein Worker kommt erst, wenn ein Stil spürbar teurer wird. | DM-Interview 2026-11-26 |
| E-37 | Klangquellen auf der Karte (DC-104) | **Hörposition**: die Spielerfiguren – jede Quelle klingt so laut wie für die ihr nächste Figur; ohne Figuren auf der Karte die Mitte des TV-Ausschnitts. **Zusätzlich** zur Szenen-Ambience des Soundboards (das bleibt unverändert). **Wiedergabe nur im Orchestrator** (Ausgabe des DM-Rechners), in der Kartenschmiede „Probehören“ je Quelle. **Wände dämpfen** (leiser und dumpfer, nicht stumm). **Im Spiel**: Quelle an/aus (Ausblenden, Ebenen), Lautstärke je Szene, globalen Sound überschreiben, szeneneigene Quellen; Start und Spiel getrennt. **TV nie** (Quellen nur im DM-Fenster als Symbol mit Radius), **Mono**. **Platzieren**: Geräusch-Assets aus dem Assets-Panel ziehen; auch die eingebauten Soundboard-Klänge als Quelle oder globaler Sound. **Format**: Karte v9 (Quellen, globaler Sound), Szene v11 (Steuerung), nur optionale Felder, triviale Migration. Reihenfolge: Quellen → Wände → Szene. **Nach dem Review** (DM 2026-11-26): Es klingt immer die **TV-Szene** (wie das Soundboard, E-30) – auch wenn ein anderer Tab vorbereitet wird oder die Kartenschmiede offen ist; ohne TV-Szene die im Orchestrator offene. Die **Lautstärke einer Quelle je Szene ist Spielzustand** wie An/Aus (Start und Spiel getrennt, „Szene zurücksetzen“ holt den Start). | DM-Interview 2026-11-26 |
| E-38 | Szenenübergang auf dem TV (DC-105) | **Arten** wie T-135: Überblenden (Standard), über Schwarz, sofort; thematische Übergänge später (T-147). **Standard je Karte** (Karteneinstellungen; ohne Angabe Überblenden, 1 s) und eine **einmalige Wahl für den nächsten Wechsel** (Panel „Tisch-Anzeige“ – das Menüband kennt nur einfache Knöpfe). **Videokarten**: das alte Bild steht während des Übergangs still (Standbild dessen, was die Spieler sahen) statt zweier laufender Videos. **Auch** Verdunkeln (aus- nach Schwarz) und Freigabe (aus Schwarz ein); „Kartenänderung übernehmen“ wechselt weiter hart. **TV-Grundsatz**: über die neue Szene kommen nur das Standbild des bisher Gezeigten und Schwarz; ein veralteter Frame beendet den Übergang sofort. Format: Karte v10 (`transition`, triviale Migration), Frame v5 (Zähler, Art, Dauer). | DM 2026-11-26 |
| E-39 | Panels je Arbeitsbereich (DC-120) | Jeder Arbeitsbereich bietet eine **eigene Auswahl an Panels** an: ein sinnvoller Standard je Bereich, den der DM ändert. **Einstellen im Menü „Fenster“** („Panels auswählen …“ mit Häkchen, „Standard wiederherstellen“). Ein **abgewähltes Panel verschwindet ganz** aus Layout und Menü dieses Bereichs, bis es wieder gewählt wird; ein Menüband-Knopf für ein solches Panel nimmt es wieder auf. Geräteeinstellung (App-Datenordner, wie die Layouts). | DM 2026-11-26 |
| E-40 | Stockwerke (DC-020) | Ein Stockwerk liegt **eine Ebene höher (oder als Keller tiefer)** im selben Koordinatenraum wie die Karte. Ist ein Stockwerk aktiv, ist **alles darunter weichgezeichnet und abgedunkelt** (je tiefer, desto stärker), alles darüber unsichtbar. Ein Stockwerk hat **eigene Elemente** (Wände, gezeichnete Mauern, Böden, Bereiche, Lichter, Klänge, Assets) und **eigenen Nebel**, optional ein **eigenes Bild** (z. B. PNG mit Transparenz) über der Karte; Zeichenebenen (E-28) gelten innerhalb jedes Stockwerks. **Figuren** stehen auf einem Stockwerk und werden von Hand umgesetzt (Treppen später, DC-026). **TV**: zeigt das vom DM gewählte Stockwerk (Arbeits- und TV-Stockwerk getrennt, eigener Befehl, mit Szenenübergang E-38); die Stockwerke darunter **nur mit ihrem Nebel** (nur Erkundetes), weichgezeichnet. Format: Karte und Szene bekommen Stockwerke als optionale Felder, mit Migration. **Grundfläche** (DM 2026-11-26): ein Stockwerk deckt nur seine Grundfläche ab – automatisch aus geschlossenen Mauern und Böden, von Hand erweiterbar; innerhalb gelten sein Nebel und Inhalt, außerhalb sieht man das Stockwerk darunter unscharf mit dessen Nebel. Reihenfolge: Varianten vor Stockwerken. **Initiative** (DM 2026-11-26, nach dem Review): gilt für das Arbeits-Stockwerk (die Figuren dort); Gruppe aufstellen und neue Szenen berücksichtigen trotzdem die Figuren aller Stockwerke. | DM-Interview 2026-11-26 |
| E-41 | Kartenvarianten (DC-023) | Eine Variante (Tag/Nacht, zerstört, geflutet …) bringt **ein anderes Bild je Stockwerk** und optional ein **anderes Umgebungslicht**; Wände, Bereiche und Nebel bleiben gemeinsam (bauliche Änderungen weiter über Zeichenebenen). **Wahl je Szene im Orchestrator**, Start und Spiel getrennt; ein Wechsel im Spiel blendet auf dem TV über (E-38). | DM-Interview 2026-11-26 |
| E-42 | Zuschneiden, Drehen, Bildanpassung (DC-022) | **Nicht-destruktiv**, Werte in der Kartendatei, TV und DM-Fenster sehen gleich aus. **Drehen in 90°-Schritten, alles dreht mit** (Bild, Raster, Wände, Bereiche, Lichter, Klänge, Assets, gezeichnete Elemente, Start-Nebel und der Nebel der Szenen). **Helligkeit, Kontrast, Sättigung, Farbton** und **Zuschnitt** (Rahmen auf der Karte) im Befehls-Panel „Bild anpassen“ mit Live-Vorschau. **Umsetzung bestätigt** (DM 2026-11-26): Drehen dreht die **Ansicht** (DM-Fenster und TV), die gespeicherten Daten bleiben unverändert; Beschriftungen im DM-Fenster bleiben aufrecht. | DM-Interview 2026-11-26 |
| E-43 | Leck-Prüfung (DC-025) | **Testfigur** in der Kartenschmiede: ziehbar, zeigt live, was eine Figur dort sähe (Dunkelsicht einstellbar), nur im DM-Fenster, nichts wird gespeichert. **Lücken markieren**: offene Wandenden, kleine Lücken zwischen Wänden, Türen ohne Anschluss – auf der Karte markiert und als klickbare Liste. Wände aus Bereichen (T-141) nicht jetzt. **UVTT-Import (DC-024) zurückgestellt** (DM 2026-11-26). | DM-Interview 2026-11-26 |
| E-44 | Treppen (DC-026) | Eine Treppe ist ein **Feld auf zwei Stockwerken** an derselben Stelle (Werkzeug „Treppe“: Felder aufziehen, Ziel = nächstes Stockwerk darüber, sonst darunter; Ziel und Richtung nach oben in den Eigenschaften). Eine Figur, die auf einer Treppe abgestellt wird, löst eine **Rückfrage** aus („… nach oben? Hinübergehen / Bleibt hier“, blockiert nicht). Sind danach **alle Spielerfiguren** auf dem neuen Stockwerk und ist die Szene auf dem TV, **folgt der TV** mit Übergang. Auf dem TV **gezeichnete Stufen** unter dem Nebel. Format: Karte v12 `stairs`. | DM 2026-11-26 |
| E-45 | Parametrische Räume (DC-026) | **Abgelöst durch E-48 (2026-11-27):** Räume schreiben ins Fels-Raster. **Formen**: Rechteck, Rund, Gang (Weg mit Breite) und Vieleck. Ein Raum **bleibt ein Raum** und ist jederzeit änderbar (Griffe an Ecken/Mittelpunkt/Rand/Punkten, verschieben, Stil, Dicke, Boden, Gangbreite); Mauern, Türen und Boden werden **daraus abgeleitet**, nicht gespeichert. Überlappende Räume verschmelzen zu einem Umriss; **an gemeinsamen Kanten** stoßender Räume steht eine Mauer **mit Tür** in der Mitte. **Hand-Mauern** werden dort abgeschnitten, wo ein Raum sie überdeckt (ihre Türen wandern mit). Nur in der Kartenschmiede (Bauen › Raum), je Stockwerk. „Räume in Mauern umwandeln“ macht die Räume des Stockwerks zu gewöhnlichen Mauern, Türen und Böden. Format: Karte v13 `rooms`. | DM 2026-11-26 |

**Bleibt aus Dungeon Crucible:** Pergament als drittes Theme, das eigene Docking mit echten Fenstern und
Hover-Flyout (statt dockview und Kanten-Leisten), Export/Import ganzer Kampagnen als Archiv – beim Export wählbar:
nur Kampagnendaten oder vollständig mit den benutzten Bibliotheksdateien (Duplikate beim Import erkennen).

**Reihenfolge:** Fundament zuerst (Dateiregeln, Wurzelordner und Bibliothek, Karte/Szene mit Overrides und
Startzustand), dann die Kartenschmiede auf dieser Basis.

### Nachtrag: Interview 2026-11-27 – Prozedurale Kartenschmiede

Geklärt im Interview mit dem DM nach dem Abgleich des Plans mit dem Code. Details, Begründungen, Datenformat v14 und
Roadmap: `docs/KARTENSCHMIEDE-PROZEDURAL.md` (Teil A gilt vorrangig).

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

### Nachtrag: Start Phase 0 (DM, 2026-11-27)

| Nr. | Thema | Entscheidung | Verhältnis zu Bestehendem |
|---|---|---|---|
| E-78 | Standard-Geländebiom (O-A7) | Eine neue Karte vom Kartentyp „Dungeon“ startet im Geländebiom **Dungeon/Höhle**, jede andere nach ihrem Nebelbiom: nebel, kueste, arkan → Gemäßigt; schnee → Winter; wueste, asche → Wüste; sumpf → Sumpf; dunkel → Dungeon/Höhle. | beantwortet O-A7 |
| E-79 | Umfang Karte v14 | **Alle Felder aus A.6 jetzt**, als optionale Felder; die endgültigen Namen legt DC-121 fest (`app/src/core/build/intent.ts`). Bis zum Merge von Phase 0 dürfen DC-123 bis DC-125 sie noch anpassen. | wie A.6 |
| E-80 | Migration | Die Migration v13→v14 löscht zusätzlich `autoShore`, `autoGrowth` (E-50) und `generated` (E-66); in Szenen-Zeichnungen auch `hidden` (es verwies nur auf gelöschte Elemente). `waterAnimated`, `lightAngle` und `origin` bleiben. | ergänzt E-57 |
| E-81 | Vorab | Die Bench-Basis mit großer alter gezeichneter Karte **entfällt** (das Bench kann nur die Videokarte, DC-126 baut die neue Szene); Vergleichsbasis ist der Lauf vom 23.11. Der DM legt den Archiv-Export an, bevor die App auf dem Branch mit dem echten Wurzelordner startet. | ändert „Vorab“ in 3.9 |
| E-82 | Umbau ohne Bauwerkzeuge (DC-122) | Der Tab **„Bauen“ entfällt** in Kartenschmiede und Orchestrator, bis DC-129 ihn neu bringt. **„Neue gezeichnete Karte“ bleibt** im Katalog (eine leere Fläche, 20 × 20 Felder), „Karte generieren …“ entfällt (E-66). Der TV-Frame verliert seinen Teil `drawn` sofort. `dirty.ts`, `sight.ts`, `sceneDrawing.ts` und `playerDrawing.ts` werden **gelöscht** und mit DC-124, DC-125 und DC-129 neu gebaut; neutral weiterverwendet bleiben `editing.ts` (generisch, ohne Tür-Kopplung), `strokes.ts`, `noise2`/`jitterRing`, `hashNoise`/`variantBlobs`/`lineStrips` und das Textur-Slot-System (`textures.ts`, `variantSheet.ts`) samt WebP-Dateien. | ändert A.3 |
| E-83 | Rastergröße (O-A1) | **Vorerst keine Binärdatei**: die Raster bleiben in der `.map.json`. Gemessen (150 × 150 Felder): leer 1,6 KB, typisch 56–516 KB (je nach Feinhöhe), reines Rauschen ≈ 7,3 MB. Eine Kartendatei über 8 MB wird geschrieben und im Protokoll mit einem Hinweis gemeldet; erst eine echte Karte darüber macht die Binärdatei zur neuen Entscheidung. | beantwortet O-A1 |
| E-84 | Einbau der Raster | DC-123 liefert den reinen Kern (Blöcke, Codec, Patches, Rasterzustand mit geteilten Blöcken, Kodieren nur geänderter Blöcke) und die Rettungskopie in IndexedDB. Der **Einbau in Speichern, Öffnen und Rückgängig** kommt mit dem ersten Werkzeug in **DC-128**; bis dahin reisen die Raster kodiert mit (DC-121). | teilt DC-123 |
| E-85 | Raster auf dem TV | Der TV bekommt Rasterdaten **nur im Erkundeten** (aufgedeckt und erinnert) plus **2 Felder Rand**, nie einen unentdeckten geheimen Bereich und nie die Felder, die ihn berühren; alles andere ist „unbekannt“. Patches aktiver Ebenen werden beim DM **fertig verrechnet**, inaktive Ebenen verlassen den DM nie; nur der Stapel des gezeigten Stockwerks. **Übertragung per Prüfsumme**: der Frame nennt je Block eine Prüfsumme, ein eigener Einweg-Kanal (`table:raster`, DM → Hauptprozess → TV) bringt nur fehlende Blöcke; nach „TV geladen/geschlossen“ alles neu. Der TV nimmt einen Block nur ganz und mit passender Prüfsumme, ein fehlender bleibt schwarz. Umfang jetzt: alles außer dem Anschluss an den Rasterzustand (der kommt mit DC-128, E-84). Nach dem Review (DM 2026-11-27): als geheim gilt jedes Feld, durch das ein Rand des Bereichs läuft oder dessen Mitte darin liegt (auch schmale und schräge Bereiche); der Ring um einen geheimen Bereich im Erkundeten wird **aus dem nächsten bekannten Feld aufgefüllt** (keine Lücke in Form des Raums, nichts von ihm). | konkretisiert E-61 |
| E-86 | Reihenfolge Phase 0 | **DC-126 (Prüfwerkzeuge) kommt nach DC-128**: Bench-Szene und Bildvergleiche messen erst sinnvoll, wenn Gelände gemalt wird; die Bench-Szene wächst mit Wasser und Streuung. Als Nächstes DC-127; seine Referenzkarte (Klippe in Draufsicht) erzeugt Claude mit Higgsfield, abgelegt außerhalb des Repos. | ändert die Reihenfolge in 3.9 |
| E-87 | Gelände-Paket b (DC-128b) | **Klippen je Biom schon in b** (zieht einen Teil von e vor), auf der ganzen Karte nach ihrem Standard-Biom, bis c die Biom-Raster bringt: Gemäßigt Sandstein + Grasüberhang (abgenommen, DC-127), Dungeon Höhlenfels mit blanker Kante, Sumpf dunkle Erde + Moos/Schilf, Wüste heller Sandstein + Sandkante, Winter grauer Fels + Schneekappe. Darunter ein **Boden nach Biom**, alle fünf neu und passend zu den Bändern. Texturen erzeugt Claude mit Higgsfield; sie kommen als WebP-Slots mit Herkunft ins Repo wie die Wandtexturen vom 26.11.; Abnahme per Vergleichsbild vor dem Einbau. Werkzeug **Stufe** (Tab GELÄNDE, nur gezeichnete Karten, auf Bild-/Videokarten ausgegraut): Pinsel rund, eckig (Feldraster), Lasso; **Viertelfeld-Fang** als Schalter im Tab; Befehls-Panel Heben · Senken · Auf Stufe [Zahl] mit Pipette, Alt kehrt um, Shift gerade Linie, ein Strich setzt Startstufe ± 1; malt ins Grundraster des gezeigten Stockwerks (Ebenen-Patches DC-133). Vorschau in den Geräte-Einstellungen umstellbar, ab Werk **Live-Klippen**, sonst Umriss und Klippen beim Loslassen. **Jeder Stufenwechsel** sperrt Sicht und Licht einseitig (von oben hinunter ja, von unten hinauf nein). **Bandbreite je Karte** einstellbar (0,2–1,0, Standard 0,45): Karte v15 mit optionalem Feld, ältere Karten werden beim Lesen ohne Änderung hochgestuft. | konkretisiert DC-128, E-46, E-52, E-67 |
| E-88 | Gelände-Paket c (DC-128c) | **Alle neun Bodenklassen** (Gras, Hohes Gras, Erde, Fels, Sand/Kies, Moos, Laub, Pflaster, Schnee) nach der Tabelle in Teil B §13.1 – 35 konkrete Texturen; wo die Tabelle „–“ hat, zeigt die Palette die Klasse nicht und gemalt gilt dort Auto. **Auto** = Grundboden des Bioms, dazu Kies/Geröll in Flecken am Klippenfuß; die übrigen Regeln (Hang, Feuchte, Besonnung, Wege) mit d und DC-131. **Übergänge ausgefranst**: weiche Kante, durch Rauschen aufgebrochen (Inseln, Zungen), zwischen Bodenklassen wie zwischen Biomen. Bis zu vier Biome je Karte (Palette); an einer Klippe bestimmt das **Biom der Oberseite** Band und Kante, längs der Kante weich überblendet. Werkzeuge im Tab GELÄNDE: **Bodenklasse** (Palette mit der echten Textur des Bioms unter dem Zeiger, Stärke, Alt = zurück auf Auto), **Biom** (feldgenau, weich), **Füllen** (gleiche Fläche, Toleranz). Gegen Wiederholung je Textur ein Grundbild und **eine Variante**, in großen Flecken überblendet (auch für die fünf Grundböden). Texturen erzeugt Claude mit Higgsfield; Abnahme je Biom per Vergleichsbild vor dem Einbau. Nachtrag (DM 2026-11-27): Texturen abgenommen; **Pflaster ohne Variante** (verlegte Steine in zwei Maßstäben wirken unnatürlich). | konkretisiert DC-128, E-49, E-70 |
| E-89 | Gelände-Paket d (DC-128d) | **Schummerung + Schattenwurf + AO**: Hänge hell und dunkel nach dem Licht, Klippen und Hügel werfen weiche Schatten auf tieferes Gelände (Raymarching über die Höhe), Mulden und Klippenfuß dunkler; Objekte werfen Schatten, wenn es sie gibt. Sonnenhöhe fest 50°, Stärke fest und per Vergleichsbild abgenommen (Regler mit DC-134). **Böschung**: ab halber Stärke wird die Klippe zum Hang – Klippe und Einweg-Sicht entfallen dort, die Enden laufen spitz aus, die Schummerung zeigt den Hang. **Feinhöhe** mit allen fünf Modi: Heben/Senken (Alt), Glätten, Ebnen (auf die Höhe am Startpunkt), Aufrauen, Gefälle (A nach B). **Erosionskanten** (S9) schon in d: an steiler Feinhöhe kleine Abbruchbänder ohne Wand, ab Werk an, je Karte abschaltbar (optionales Feld der noch nicht ausgelieferten Karte v15). **Höhenlinien** (alle 2 ft) als Schalter im Tab GELÄNDE, nur in der DM-Ansicht. | konkretisiert DC-128, E-46, E-52 |

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
- ✓ **DC-093 Bibliothek** (E-1): Karten, Audio, Kreaturen flach in `library/`, Sidecars daneben; Import kopiert
  hinein, Duplikate per Hash erkennen; Kartenliste mit Suche (Name, Tags, Typ); Löschen mit Warnung und Papierkorb
  (benutzte Karten: nur das Bild, die Kartendaten bleiben). Vorschaubilder im Katalog kamen mit DC-117, Tags
  bearbeiten mit DC-011; Papierkorb wiederherstellen ist DC-035.
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
- ✓ **DC-003 Rettungskopie bei fehlgeschlagenem Speichern** und Absturzerkennung. Nach T-114b, T-238.
  Entscheidungen des SL: Kopien liegen im App-Speicher des Geräts (nie im Wurzelordner, nie synchronisiert); sie
  werden **beim Öffnen der Kampagne** angeboten (Dialog je Dokument: Wiederherstellen / Verwerfen / Später
  entscheiden); nach einem Absturz zeigt der Startbildschirm **nur einen Hinweis**; wurde die Datei seit der Kopie
  geändert, **warnt** der Dialog und überschreibt erst nach „Trotzdem überschreiben“, eine Datei einer neueren
  App-Version nie. Umsetzung: `core/rescue.ts` (eine Kopie je Datei und Sitzung, die neueste – ein späteres
  Fehlschlagen überschreibt die Kopie einer früheren Sitzung nie; ein späteres erfolgreiches Speichern löscht nur
  eine Kopie derselben Sitzung; Fingerabdruck der Datei als Grundlage der Kopie), `app/rescue.ts` (Anschluss an
  `writeDoc`, Absturzmarke bis `beforeunload`), `RescueDialog.tsx`. Ein Speicherlauf versucht alle geänderten
  Dokumente, auch nach einem Fehler, damit jedes seine Kopie bekommt. Wiederherstellen schreibt die Datei zurück und
  liest die Kampagne ohne vorheriges Speichern neu ein. Der TV bleibt
  nach einem Neustart ohnehin dunkel, bis eine Szene auf ihn gelegt wird (DC-034).
- ✓ **DC-004 PixiJS-Warnung beim Kartenwechsel** („destroyed while still bound“): beim Abbau des lebendigen Nebels
  und der Nebel-Überblendung wurden Texturen vor ihrem Shader zerstört (bei der Überblendung hing das Aufräumen an
  der Ebene, die PixiJS erst nach ihren Kindern abbaut); jetzt geht der Shader zuerst, am Mesh selbst. Nebenbei:
  die Dunkelheit der Licht-Ebene gab ihre Maskentextur nie frei (Speicherleck je Lichtänderung) – behoben.
  Bekannt und nicht von uns lösbar: mit lebendigem Nebel warnt PixiJS weiter, wenn sich die Canvas-Größe ändert
  (sein `TexturePool` verwirft Filter-Texturen, die sein globaler Batch-Cache noch kennt; auch in 8.23).
- ✓ **DC-106 Benchmark-Anleitung aktualisieren**: `app/README.md` beschreibt für `npm run bench` noch `maps/` im
  Kampagnenordner; seit dem Wurzelordner liegen Karten in `library/`. Erledigt: Das Testvideo kommt nach
  `<Wurzelordner>/library/bench-4k.mp4` (die App liefert Medien nur aus der Bibliothek aus; der Wurzelordner wird
  beim Start aus den Geräteeinstellungen geladen); Schritte, Skript-Meldung (`bench/make-video.sh`) und die
  Kommentare in `src/bench/main.ts` und `src/platform/asset-url.ts` nachgezogen; Hinweis, dass das Video im
  Kartenkatalog auftaucht. Ein Benchmark mit großer **gezeichneter** Karte (statt Video) gibt es noch nicht.

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
  den globalen Sound bei Bedarf überschreiben. Interview 2026-11-26: E-37. Pakete (ein Branch
  `feature/sound-sources`, ein PR):
  - ✓ **DC-104a Quellen und globaler Sound**: Geräusch-Assets aus dem Assets-Panel auf die Karte ziehen, Radius am
    Griff, Lautstärke, „zum Rand leiser“, Ebene; globaler Sound je Karte; eingebaute Klänge wählbar; Probehören in
    der Kartenschmiede; Wiedergabe im Orchestrator nach der nächsten Spielerfigur; Karte v9. Erledigt: Klangquellen
    sind eine vierte Elementart neben Wänden, Bereichen und Lichtern (`sounds` in Karte v9, `added.sounds` in Szene
    v11, triviale Migration) – Overrides, Ausblenden, Ebenen und szeneneigene Quellen laufen über die vorhandene
    Mechanik. Lautstärke rein in `core/sound.ts` (nächste Spielerfigur, sonst Mitte des TV-Ausschnitts; „zum Rand
    leiser“ quadratisch). Assets-Panel zeigt Geräusche und die fünf eingebauten Klänge; Klick/Ziehen/Enter setzt
    eine Quelle (auf die Feldmitte, Alt frei). Karte: Lautsprecher-Symbol, Radius-Ring (halber Ring bei „leiser“),
    Verschieben, Radius-Griff (5-ft-Schritte). Eigenschaften: Klang, Radius, Lautstärke (ein Schritt beim
    Loslassen), Rand-leiser, Ebene, Probehören (4 s), Entfernen. Karteneinstellungen: Klang der Karte und
    Lautstärke. Wiedergabe `app/mapSound.ts` nur im Orchestrator, eigene Schlüssel neben dem Soundboard; Projektion
    unverändert (Test: nichts davon im TV-Frame). Im Orchestrator kann eine Quelle schon verschoben, geändert und
    (Werkzeug Ausblenden) ausgeblendet werden; die eigene Bedienung dafür kommt mit DC-104c.
    **Eingebaute Klänge** (DM 2026-11-26): 12 nahtlose Loops mit Higgsfield erzeugt (Mirelo, je 25 s → 21 s
    Loop, −20 LUFS, Opus mono, zusammen 1,3 MB; Rechte vom DM bestätigt, Herkunft in
    `app/src/audio/sounds/README.md`) – Höhlenwind, Tropfen, Fackeln, Regen, Chor, Wasserfall, Bach, Lagerfeuer,
    Wald, Sturm, Brandung, Taverne. Sie ersetzen die synthetischen fünf (die bleiben als Rückfall, wenn eine Datei
    nicht abspielbar ist) und gelten auch im Soundboard.
  - ✓ **DC-104b Dämpfung durch Wände**: Wand zwischen Figur und Quelle → leiser und dumpfer (Tiefpass). Erledigt:
    Es zählen die Wände, die auch die Sicht nutzt (gezeichnete Mauern, Asset-Türen eingeschlossen): Wände und
    geschlossene Türen dämpfen je Wand auf 40 % (höchstens drei zählen), offene Türen, Fenster und Klippen nicht.
    Dumpfer über einen Tiefpass je Loop (eine Wand ~1,5 kHz, zwei oder mehr 500 Hz, sanft übergeblendet). Es zählt
    die Spielerfigur, die die Quelle am lautesten hört – der freie Weg schlägt den näheren durch die Wand. Rein in
    `core/sound.ts` (Tests); in der App geprüft (Wasserfall hinter der Wand neben Thorin: 1512 Hz, offene Quellen
    20 kHz).
  - ✓ **DC-104c Szenen-Steuerung**: Quelle an/aus (Ausblenden, Ebenen), Lautstärke je Szene, globalen Sound
    überschreiben oder stumm, szeneneigene Quellen; Start und Spiel getrennt; Szene v11. Erledigt: neues Panel
    **„Kartenklänge“** im Orchestrator (rechts; Menüband Audio): Klang der Szene (wie die Karte / stumm / eigener
    Klang mit Lautstärke; Szenendatei `ambientSound`, im Start getrennt, „Szene zurücksetzen“ holt den Start), alle
    Quellen mit An/Aus (= Ausblenden in der Szene, DC-103) und Lautstärke je Szene (Override), Klick auf den Namen
    markiert die Quelle auf der Karte. Ausgeschaltete Quellen lassen sich auf der Karte anklicken. Szeneneigene
    Quellen über das Assets-Panel im Orchestrator (`added.sounds`); Ebenen schalten Quellen wie andere Elemente.
    Das Eigenschaften-Panel zeigt dieselbe Bedienung, wenn es eingeblendet ist. Nach dem Review: Lautstärke je
    Szene als Zustand (`soundLevels` in Spiel und Start, kein Override); Kartenklänge folgen der TV-Szene;
    „Alles stoppen“ und der Schalter „Kartenklänge stumm“ im Panel schalten sie für die Sitzung stumm; Klick auf
    eine ausgeschaltete Quelle wählt sie nur aus (vorher Absturz); im Spiel gehen Lichter und Assets beim Klick
    vor; Stoß zweier Wandstücke zählt als eine Wand; Wände werden nur gerechnet, wenn jemand eine Quelle hört;
    nicht abspielbare Dateien stehen im Protokoll; Einmal-Effekte (sfx) sind keine Quellen. Das Soundboard-Panel ist für eine
    weitere Spalte zu schmal. ✓ Behoben (DM 2026-11-26, `feature/soundboard-layout`): Die Spalten des Soundboards
    überlappten in schmalen Panels; jetzt brechen sie unter 200 px Breite in Zeilen um, Regler und
    Effekt-Knöpfe passen sich an (in der App auf Deutsch geprüft: schmal untereinander, breit nebeneinander).
- ✓ **DC-120 Panels je Arbeitsbereich** (E-39, DM-Wunsch 2026-11-26): Das Menü „Fenster“ zeigt nur die Panels, die
  der Arbeitsbereich anbietet (vorher zusätzlich alle anderen unter „Weitere Panels“); „Panels auswählen …“ mit
  Häkchen und „Standard wiederherstellen“. `app/panelChoice.ts` (Standard je Bereich, Speicherung `dc.panels.<ws>`,
  Tests), `DockManager.setExcluded` (abgewählte Panels verlassen das Layout, wieder gewählte kommen an ihren
  Standardplatz oder verborgen zurück, Test). In der App geprüft: Log in der Kartenschmiede abgewählt (weg, im
  Orchestrator weiter da), Würfel dazugenommen, Standard wiederhergestellt.
- ✓ **DC-105 Szenenübergang** (T-135, E-38): Übergang beim Szenenwechsel auf dem TV (z. B. Ausblenden über Schwarz,
  Dauer), danach als Standard je Karte (T-176b). Erledigt: `core/transition.ts` (rein, Tests); Karte v10
  `transition`, Karteneinstellungen „Szenenübergang“ und „Dauer (s)“; Frame v5 `cut` (Zähler, Art, Dauer – keine
  Szenendaten); Store zählt bei Szenenwechsel (Karte der neuen Szene oder einmalige Wahl „Nächster Szenenwechsel“ in
  der Tisch-Anzeige), erster Szene/Freigabe („in“), Verdunkeln („out“). Das TV-Fenster legt ein Standbild
  (`Renderer.snapshot`, Videobild eingeschlossen, mit Schablonen/Pings) und Schwarz über die neue Szene. Dazu
  fail-closed: Beim Kartenwechsel wird das alte Kartenbild sofort entfernt (vorher stand es bis zum Laden des neuen
  unter dem neuen Nebel). In der App geprüft (Helligkeit des TV-Fensters über die Zeit): Überblenden 83→42,
  über Schwarz 34/12/16/58/83, Verdunkeln 52→0, Freigabe 24→83. Benchmark auf dem TV steht aus (ein Standbild je
  Übergang, eine 2D-Fläche für ~1 s). Nach dem Review: Beim Szenenwechsel auf derselben Karte kommt der Nebel der neuen
  Szene sofort (vorher wuchs er aus dem alten und zeigte die neue Szene kurz, wo die alte offen war); die einmalige
  Wahl gilt auch auf einer Karte mit „Sofort“; die Freigabe derselben Szene blendet nur ein und übernimmt keine
  Kartenänderungen (E-30); nach dem Verdunkeln bleibt keine Zeichenarbeit; der Übergang landet nur in der
  Kartendatei, wenn er vom Standard abweicht.
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
- **DC-107 Kontextsensitiver Karten-Editor** – **entfallen mit E-57/DC-122** (neu geplant in 3.9); der Text bleibt als
  Geschichte, die offenen Bench-Läufe DC-107a/f entfallen (E-81). (DM-Wunsch 2026-11-25, `docs/KARTENEDITOR.md`): Dungeon- und
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
  - ✓ **DC-107b Boden-Pinsel** mit sauberem Übergang an Mauern. DM 2026-11-26: Böden = die 4 Mauerböden, die 5
    natürlichen und neu Teppich, Marmor, Kies, Lehmweg, Moos (Higgsfield); Rand weich, an Mauern sauber (endet unter
    der Mauer); Ziehen malt, Alt radiert, Shift gerade Bahnen, Größe in Feldern; gleicher Boden verschmilzt.
    Umgesetzt: Kern (`core/build/floors.ts`: gleicher Boden wird eine Fläche, Übermalen ersetzt, Radieren nimmt weg),
    Karte Version 6 um `floors` erweitert, TV-Freigabe (aktive Ebenen), Änderungsbereich und Fläche der Karte;
    Darstellung über den automatischen Böden mit weichem Rand, nahe Mauern scharf (dort deckt die Mauer ab);
    Werkzeug „Boden“ im Tab „Bauen“ mit Boden, Pinselgröße und Pinselvorschau. 5 Texturen mit Higgsfield.
    Nebenbei behoben: Alt löste in allen Bau-Werkzeugen einen Ping aus statt „frei“ bzw. „radieren“ (seit DC-107a).
    Geprüft in der App (Teppich, Lehmweg mit Shift, Radieren mit Alt).
  - ✓ **DC-107c Eigene Mauern in Szenen** (Szene v8). DM 2026-11-26: gezeichnet im Tab „Bauen“ des Spielleiters
    (Spielstand, oder mit „Startzustand bearbeiten“ der Start); eine Szene darf Mauern/Türen/Fenster, Klippen, Wasser
    und Böden haben und gezeichnete Elemente der Karte ausblenden. Umgesetzt: Szene Version 8 mit `drawing` im
    Spielstand und im Start (eigene Zeichnung + `hidden`), „Szene zurücksetzen“ holt die des Starts zurück;
    `core/build/sceneDrawing.ts` (was die Szene zeigt: Karte ohne Ausgeblendetes plus Eigenes) für Sicht, TV und
    DM-Fenster; die Werkzeuge zeichnen in die Szene, die Karte bleibt unberührt (ihre Fläche wächst nicht mit);
    Karten-Elemente werden in der Szene ausgewählt und mit Entf/„In dieser Szene ausblenden“ ausgeblendet,
    „Wieder zeigen“ im Kartenbereich. Geprüft in der App (Barrikade nur in der Szene, auf dem TV, Karte
    unverändert).
  - Review (2026-11-26) behoben: Bearbeiten in einer Szene kopierte Karten-Elemente in die Szene (blockierend);
    zurück auf eine unveränderte gezeichnete Karte blieb das Bild der vorigen Karte stehen (blockierend); Tür →
    Fenster malte nicht neu; Türbilder und bewegtes Wasser außerhalb der Kartenfläche lagen nicht unter dem Nebel
    (jetzt auf die Fläche begrenzt); leerer Rückgängig-Schritt beim Teilen eines Sees; Geröll-Markierung nach der
    Szene; ausgeblendete Ids geprüft; `freshId` kennt alle gezeichneten Listen. Neue Tests dafür (auch auf
    Frame-Ebene). Offen: Serialisieren je Frame bei sehr großen Karten (`npm run bench`, DM).
  - ✓ **DC-107d Klippen und Abhänge** (E-34, DM-Wunsch 2026-11-26): Klippen, Abhänge, Gruben, Plateaus, Schluchten,
    Geröllhalden, Terrassen und Abgründe zeichnen; Einweg-Sicht und Bewegungsblock wie die Klippen aus DC-014;
    Aussehen nach Biom, Bewuchs an der Oberkante. Reihenfolge der Pakete b–d wählt der DM.
    Stand 2026-11-26: Kern (`core/build/cliffs.ts`: Kanten mit Oberseite links, Schlucht, Terrassen, Ring als Grube
    oder Plateau, Einweg-Sichtlinien), Karte Version 6 um `cliffs` erweitert (leer als Vorgabe), TV-Freigabe (aktive
    Ebenen, Biom; Biom eines Bereichs, aber nie eines unentdeckten geheimen), Darstellung (`render/cliffsPaint.ts`:
    Wand der Klippe, Schatten, Lippe, Geröll, Abgrund, Schnee, Bewuchs nach Biom), natürlicher Boden nach Biom fern von
    Mauern, Werkzeug „Klippe“ im Tab „Bauen“ mit Befehls-Panel und Eigenschaften (Art, Form, steil, Breite, Stufen,
    innen, Bewuchs, Richtung umdrehen, neu würfeln, teilen, löschen). 14 Texturen mit Higgsfield erzeugt.
    Geröllhalde: im DM-Fenster als „schwieriges Gelände“ markiert (gestrichelt, nur DM). Eine Klippe wird auch auf
    ihrer Wand getroffen, nicht nur an der Oberkante; nach einem Werkzeugwechsel ist nichts ausgewählt, der erste
    Klick wählt aus (fügt nie einen Punkt ein). Geprüft in der App: alle Formen und Arten, Schnee-Biom, Zeichnen,
    Auswählen und Eigenschaften im Tab „Bauen“, Markierung. ✓ bis auf die Abnahme durch den DM.
  - ✓ **DC-107e Pinsel** (E-35): Ziehen zeichnet frei (geglättet zu bearbeitbaren Punkten), Shift gerade Linien,
    Klick-Klick bleibt – für Mauer, Klippe und die folgenden Werkzeuge. Umgesetzt (`core/build/strokes.ts`,
    `addBuildStroke`): ein Strich wird geglättet und auf wenige Punkte reduziert (Ramer–Douglas–Peucker, ein Achtel
    Feld), seine Enden rasten an Punkten anderer Linien ein; endet er am Anfang, wird er ein Ring (Klippe: Grube);
    für sich allein wird er sofort Mauer/Klippe, nach geklickten Punkten führt er die Linie fort. Shift + Ziehen:
    gerades Stück, eingerastet wie Klicks. Ein Klick ohne Bewegung bleibt ein Punkt. Vorschau beim Ziehen. Geprüft in
    der App (Wellenmauer, gerade Mauer mit Shift, Grube als Schleife).
  - ◐ **DC-107f Wasser** (E-35): Fluss/Bach, See/Teich, Meer/Küste, automatische Wasserfälle an Klippen; animierte
    Strömung, Wellen, Schaum und Brandung, je Karte abschaltbar; nur Optik. 60 FPS auf dem TV (`npm run bench`).
    Umgesetzt: Kern (`core/build/water.ts`: Fluss als Linie mit Breite, See/Meer als Ring, Wasserfälle wo ein Fluss
    eine steile Klippe von oben nach unten kreuzt, Rundung nach Chaikin), Karte Version 6 um `waters` und
    `waterAnimated` (an) erweitert, TV-Freigabe (aktive Ebenen); Ruhebild (`render/waterPaint.ts`: nasses Ufer, beim
    Meer Sandstreifen, zur Mitte tiefer, Schaumlinie, Wasserfall mit Gischt); bewegtes Wasser als eigene Ebene mit
    Shadern (`render/pixi/water-layer.ts`: Strömung in Zeichenrichtung mit Schaum an Uferstellen, Wellen und
    Glitzern, Wellen zum Ufer – Brandung beim Meer, sanft beim See –, fallendes Wasser), unter Figuren und Nebel;
    Werkzeug „Wasser“ im Tab „Bauen“ (Pinsel, Shift, Klicks; See/Meer schließen sich selbst), Eigenschaften (Art,
    Breite, Fließrichtung umdrehen, teilen, löschen), Schalter „Wasser bewegt sich (diese Karte)“. 3 Texturen mit
    Higgsfield. Geprüft in der App (alle Arten, Wasserfall, Bewegung, Zeichnen). Offen: `npm run bench` – DM.
  - ✓ **DC-107g 2,5D und Automatik** (E-35): Höhe und Seitenflächen von Mauern und Klippen, Lichtrichtung je Karte;
    Türme an Ecken, Zinnen, Ufer-Details, weiche Übergänge (je abschaltbar); Fenster in Mauern und Häusern.
    Umgesetzt: Karte Version 6 um `lightAngle` (45°), `autoShore`, `autoGrowth` erweitert, Mauern um `height` und
    `fortified`, Türen um `window`. Fenster: Fenster-Wand in der Lücke (verdeckt weder Sicht noch Licht), nie geheim,
    nie per Klick geöffnet, auf dem TV immer als Fenster. 2,5D (`render/drawnMap.ts`): Mauern stehen in ihrer Höhe
    (je Stil, Wehrmauer höher, je Mauer änderbar) mit Seitenfläche und angehobener Krone, Schatten in Lichtrichtung;
    Wehrmauern mit Zinnen und runden Türmen an Ecken, Enden und alle sechs Felder, nie in Toren oder Fenstern;
    Klippenwände je nach Licht hell oder im Schatten. Automatik (`render/detailsPaint.ts`): Steine und Schilf an Ufern
    (Meer nur Steine, kein Schilf in Schnee/Wüste), Bewuchs am Mauerfuß auf natürlichem Boden, ausgetretener Boden
    vor Türen; weiche Übergänge der Böden gab es schon. Bedienung: Tür-Werkzeug mit Tür/Geheimtür/Fenster, Mauer-
    Werkzeug mit „Wehrmauer“, Eigenschaften mit Höhe und Wehrmauer, Kartenbereich mit Lichtrichtung und den zwei
    Automatik-Schaltern. 2 Texturen mit Higgsfield. Geprüft in der App (Burg mit Toren, Fenster, Licht aus zwei
    Richtungen, Ufer). Hinweis: der Leistungstest in `cover.test.ts` schlägt unter starker Rechnerlast fehl, allein
    läuft er durch.
  - Danach (eigene Pakete): Wege/Flüsse/Brücken, Räume und Dächer, Detailstreuung, Wildnis-/Stadt-Modus → neu
    geplant in 3.9 (E-46 ff.).
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
- ✓ **DC-119 Lebendige Karten** (E-36) – Varianz und Generator, Teilpakete (Generator, Fels und Malerei **entfallen
  mit E-57/E-66/DC-122**; Varianz-Funktionen und Texturen bleiben):
  - ✓ **DC-119a Böden**: Böden und Naturgrund wiederholen statt einer Textur einen komponierten Bogen aus 16×16
    Zellen: Flecken aus Varianten und Drehungen (`core/build/variance.ts`, deterministisch je Seed), phasengleich,
    sodass das Muster eines Fleckens in einem Stück weiterläuft – Kachelböden wechseln an Zellgrenzen in großen
    Flecken (die Fuge verdeckt den Wechsel, Dielen behalten ihre Richtung), Naturböden in weichen runden Flecken;
    Varianten werden auf die Helligkeit der Grundtextur eingeebnet; darüber großflächiges, mit dem Bogen nahtlos
    periodisches Hell/Dunkel und ein leiser Schatten je Kachel. Abgewetzte Wege zwischen Türen (A* um Mauern,
    durch Türöffnungen; im Geometrie-Cache), als weicher, leicht schlängelnder Pfad gemalt; aus mit dem
    Automatik-Schalter der Karte. 69 Varianten-Texturen (je 3 für alle Böden, Gründe, Mauern, Klippen, Wasser)
    mit Higgsfield erzeugt (~242 Credits, Herkunft im Textur-README); Mauern/Klippen/Wasser nutzen sie ab
    DC-119b/c. Offen aus der Ansicht: Dielen-Varianten unterscheiden sich im Maßstab (wirkt wie gewollter
    Bodenwechsel – beobachten); Rand-Trim an Mauern kommt mit DC-119b.
  - ✓ **DC-119b Mauern und Klippen**: Die Textur folgt der Linie – Scheiben des Bildes, je zur Laufrichtung
    gedreht, das Quellfenster wandert mit der Strecke (`lineStrips`, pur mit Tests); Mauerkronen und Klippenwände
    biegen sich mit, Varianten je Mauer/Klippe aus DC-119a. Kantenrauheit je Mauergruppe (Seed der Gruppe statt
    nur des Stils): keine zwei geraden Mauern wackeln gleich. **Verfallsgrad je Element** (Mauer und Klippe,
    Regler „Verfall“ in den Eigenschaften): Risse und fehlende Steine auf der Krone, Geröll am Fuß; Karte v7 und
    Szene v9 (optionales Feld `decay`, Leer-Migrationen), in der TV-Projektion mitgegeben (nur Optik). Dazu eine
    dunkle Fundamentlinie am Mauerfuß (der Rand-Trim aus DC-119a in schlichter Form). Nach dem Review: der
    Verfall-Regler schreibt erst beim Loslassen (ein Undo-Schritt). Beobachten: die Linien-Scheiben werden je
    GPU-Kachel nicht auf die Kachel beschnitten – auf sehr großen gezeichneten Karten ggf. Beschnitt nachrüsten.
  - ✓ **DC-119c Wasser**: Organische Uferlinie je Seed (`organicLine`, ortsbasiert und damit nahtfrei auf Ringen;
    lange Segmente werden erst unterteilt, damit auch schnurgerade Linien Buchten bekommen): Flüsse bekommen ein
    wanderndes Rückgrat und Ufer mit atmender Breite (`riverSpine`/`riverRibbon`), Seen/Meere Buchten und Zungen
    statt der glatten Offset-Linie; Anstrich, bewegtes Wasser und Ufer-Details bauen auf demselben Band auf und
    bleiben deckungsgleich. Die Flusstextur läuft in Scheiben **mit der Strömung** (die bewegte Schicht tat das
    schon über ihre UVs). **Flachzonen**: am Ufer schimmert der Grund durch (Meer: Sand, sonst Kies, zwei Bänder);
    die Wasserfläche nutzt ihre Texturvarianten je Seed (DC-119a). Tests für `organicLine`/`waterOutline`
    nachgezogen (Determinismus, Schranken).
  - ✓ **DC-119d Flächen-Generator**: Werkzeug „Generieren“ im Bauen-Tab: Bereich aufziehen (auf ganze Zellen
    gerastet, ab 4×4), der Generator füllt ihn – Stil **Dungeon** (Raumgraph: Räume, Gänge als Spannbaum, Türen an
    den Übergängen; alles zusammenhängend) oder **Höhle** (Cellular Automata, nur die größte Kaverne, organisch
    geglättete Wände); Dichte-Regler, Seed-Feld und „Neu würfeln“ wirken **sofort** auf die Vorschau in der Karte.
    Erzeugt gezeichnete Mauern (Ringe aus der Konturverfolgung), Türen darauf und eine Bodenfläche der offenen
    Form. „Fertig“ backt als **einen** Undo-Schritt ein, „Verwerfen“ (auch Werkzeugwechsel) stellt die Karte
    zurück. Kern pur mit Tests (`core/build/generate.ts`: Determinismus, Zusammenhang, Konturen, Elemente); Lichter
    und Seed-Notiz an der Karte folgen mit DC-119e. Nach dem Review abgedichtet: Ebenen-/Szenen-/Tab-Wechsel und
    `commitView` werfen die Vorschau vorher ab, **Speichern parkt sie** (nie auf der Platte), Undo/Redo während
    der Vorschau verwerfen nur sie (Verlauf unberührt), und ein alter Schnappschuss kann nie über spätere Arbeit
    zurückgeschrieben werden – alles mit Tests.
  - ✓ **DC-119e Ganz-Karten-Generator**: „Karte generieren …“ im Kartenkatalog öffnet einen Dialog mit Name,
    Stil (Dungeon/Höhle), Größe in Feldern, Dichte, Seed + „Neu würfeln“ und Schaltern für **Tümpel** (Höhle:
    Mulden abseits der Wände, nur zusammenhängende Teiche), **Fackeln** (Dungeon: 1–2 je Raum an der Wand; Höhle:
    sparsam an der Wand; mit Fackeln steht die Karte auf „Dunkel“) und **Verstreute Details** (Moos- bzw.
    Geröllflecken). Eine schematische **Live-Vorschau** zeichnet bei jeder Änderung neu. „Karte erzeugen“ backt
    alles als neue gezeichnete Karte in die Bibliothek (Mauern, Türen, Böden, Seen, Lichter; zufällige Ids) und öffnet sie;
    **Seed+Parameter** stehen als Notiz `generated` an der Karte (optionales Feld in v7). **Abweichung mit
    DM-Entscheid (2026-11-26): ohne Worker** – gemessen ~10 ms (Dungeon) / ~3 ms (Höhle) bei 120×90 Feldern,
    ein Worker käme erst, wenn ein Stil spürbar teurer wird. Klippen und Außen-Stile (Gebäude, Wildnis) folgen
    später als eigene Stile.
  - ✓ **DC-119f Massiver Fels** (DM-Wunsch 2026-11-26): Generierte Höhlen und Dungeons waren nur Mauern auf offenem
    Grund; jetzt liegen sie **eingelassen im Fels**. DM-Entscheidungen: **erhöhter Fels** (Felsoberfläche aus der
    Mauertextur, angehoben, mit Flanke zur Lichtrichtung und Schatten in die Gänge) und gespeichert als **Fels-Seite
    an geschlossenen Mauern**: optionales Feld `solid` (`outside` = Höhle/Dungeon im Stein, `inside` = Felsblock)
    und `solidReach` (wie weit der Fels außen reicht; ohne: bis zum Kartenrand). Karte v8 / Szene v10 mit
    Leer-Migrationen, TV-Projektion trägt beide Felder (nur Optik; Sicht und Bewegung bestimmen weiter die
    Mauern). Der Fels folgt den Mauern auch nach Handbearbeitung (`core/build/rock.ts`, rein, mit Tests: außen,
    Reichweite, Blöcke, zwei Höhlen füllen sich nie gegenseitig, Kartengrenze). Generator: äußere Ringe tragen Fels
    außen, Löcher (Säulen) sind Felsblöcke; der Flächen-Generator lässt den Fels nur 2,5 Felder um das Gegrabene
    reichen, die Ganz-Karte füllt bis zum Rand. In den Eigenschaften geschlossener Mauern: Auswahl „Fels“
    (keiner/außen/innen). Der Fels steht niedriger als die Mauerkrone, damit einfeldbreite Gänge lesbar bleiben.
    Nach dem Review: die Reichweite entsteht als Raster-Weitung des Rings (Kontur über die Kantenmitten geglättet,
    organischer Rand) statt als Pinselstrich – eine mittlere Höhle ~75 ms statt ~200 ms, eine 120×80-Höhle ~270 ms
    statt ~860 ms; das Ergebnis wird zwischengespeichert, Tür- und andere Mauer-Änderungen rechnen nichts neu. Die
    Katalog-Vorschau skaliert die Reichweite mit. Hinweise: ein „außen“ ohne Reichweite füllt bis zum Kartenrand;
    eine Höhle in einem Felsblock wird vom Block gefüllt; ein aufgetrennter Ring trägt keinen Fels, bis er wieder
    geschlossen ist.
- ✓ **DC-020 Ebenen (Stockwerke)** (E-40): anlegen, umbenennen, eigenes Bild gleicher Größe, Arbeitsebene vs. TV-Ebene,
  Freigabe, Nebel je Ebene (T-118a/c/d). Branch `feature/map-forge-more`. Erledigt in drei Schritten:
  (a) Karte v11 `storeys` (Name, Höhe, Bild, Grundfläche, Start-Nebel), `storey` an jedem Element und jeder
  Figur, Szene v12 `storeyFog` und `tvStorey`; eine Ansicht zeigt ein Stockwerk, die anderen werden beiseitegelegt
  und beim Speichern zusammengeführt; Browser › Stockwerke: arbeiten auf, darüber/Keller anlegen, umbenennen,
  löschen (mit allem darauf). (b) `core/storeyShape.ts` Grundfläche (geschlossene Mauern, Böden, von Hand) und
  Stockwerke darunter; TV-Frame mit `storeyClip` und `below` (je Stockwerk eigener Nebel), das TV-Fenster zeichnet
  darunter weichgezeichnet und schneidet oben auf die Grundfläche; DM-Fenster dieselbe Unterlage ohne Nebel.
  (c) „Dieses Stockwerk auf den TV“ (mit Übergang), ausgewählte Figur auf ein anderes Stockwerk setzen, Bereich zur
  Grundfläche übernehmen / gezeichnete Grundfläche leeren. In der App geprüft (Turm über der Krypta: unten
  weichgezeichnet mit eigenem Nebel, oben eigener Nebel). Bild je Stockwerk in der Kartenschmiede (Kartengröße, geprüft).
  Offen: Varianten je Stockwerk, Treppen (DC-026); die Grundfläche eines Stockwerks ist auf dem TV als
  Umriss erkennbar (folgt aus E-40). Nach dem Review: Türzustände auf anderen Stockwerken bleiben erhalten;
  Elemente/Figuren eines gelöschten Stockwerks werden nie gezeigt (aufbewahrt); die TV-Grundfläche kommt nur aus
  Sichtbarem (aktive Ebenen, nicht ausgeblendet); „Gruppe aufstellen“ und neue Szenen zählen Figuren aller
  Stockwerke; Kartenkopie erneuert Stockwerk- und Varianten-IDs; Entwürfe (Bild anpassen, Leck-Prüfung) enden beim
  Wechsel von Tab/Arbeitsbereich; Variantenname nie leer; Stockwerke darunter werden nur bei Dokumentänderungen
  neu gebaut (live, wenn der DM in der TV-Szene darunter arbeitet). Benchmark mit Stockwerk über 4K-Video steht
  aus (eigener Renderer je Stockwerk, CSS-Unschärfe).
- ✓ **DC-021 Rastereinmessung per N×N-Box** statt 3-Punkt, als Befehls-Panel; Raster verschieben; Schwenken während
  des Einmessens (T-177, T-251). Erledigt: Befehls-Panel „Raster einmessen“ (Menüband Karte › Raster): Felder je
  Seite 1–10 (Standard 3); ein auf der Karte aufgezogenes Quadrat über N×N Felder des gedruckten Rasters ergibt
  Zellgröße und Versatz, das Raster zeigt sich sofort (beim Einmessen immer sichtbar); innen ziehen verschiebt Box
  und Raster, Pfeiltasten 1 px (Umschalt 10 px), Zellgröße und Versatz auch als Zahl; OK speichert als ein
  rückgängig machbarer Schritt, Abbrechen/Esc oder ein anderes Werkzeug stellt das alte Raster wieder her, Speichern
  während des Einmessens schreibt die Vorschau nicht. Schwenken mit mittlerer/rechter Maustaste oder Leertaste. Die
  3-Punkt-Kalibrierung ist entfernt; die Box misst kein gedrehtes Raster (Drehung wird 0, das Feld bleibt in der
  Datei).
- ✓ **DC-022 Zuschneiden, Drehen, Bildanpassung** nicht-destruktiv (T-192, E-42). Branch `feature/map-forge-more`.
  Erledigt: Karte v11 `look` (Drehung 0/90/180/270, Zuschnitt, Helligkeit/Kontrast/Sättigung/Farbton). Drehen
  dreht die **Ansicht** (DM-Fenster über `render/viewTransform.ts`, TV über die Frame-Drehung = Tisch + Karte) –
  die Daten (Wände, Nebel, Figuren, Szenen) bleiben unverändert und drehen so alle mit. Zuschnitt und Anpassung
  wirken beim Laden auf eine Kopie des Bildes (`mapBinding`, Video nur Anpassung per CSS-Filter); außerhalb des
  Zuschnitts schwarz. Befehls-Panel „Bild anpassen“ (Karte › Karte) mit Vorschau, Zuschnitt auf der Karte
  aufziehen, OK als ein Schritt. Gezeichnete Karten: nur Drehen. In der App geprüft (DM-Fenster und TV).
- ✓ **DC-023 Kartenvarianten** je Ebene (Tag/Nacht/zerstört) (T-191, E-41). Branch `feature/map-forge-more`.
  Erledigt (für die Grundkarte; je Stockwerk kommt mit DC-020): Karte v11 `variants` (Name, Bild aus der
  Bibliothek in Kartengröße, optional Licht), Szene v12 `variant` in Spiel und Start. Karteneinstellungen:
  „Variante hinzufügen …“ prüft die Größe (verständliche Meldung), Name und Licht je Variante, entfernen. Im
  Orchestrator wählt der Browser unter der Karte die Variante; ihr Licht zählt für Sicht und TV, ein Wechsel im
  Spiel blendet auf dem TV über (Übergang der Karte). Das Bild der Variante wird wie das Kartenbild aufgelöst;
  bis dahin bleibt die Karte schwarz (nie kurz das andere Bild). In der App geprüft (falsche Größe abgelehnt,
  Nacht-Bild auf dem TV unter dem Nebel).
- **DC-024 UVTT-Import** mit Raster, Wänden, Türen, Lichtern (T-198). **Zurückgestellt** (DM 2026-11-26).
- ✓ **DC-025 Testfigur und Leck-Prüfung** für Wände (T-194, E-43); automatische Wände aus Bereichen (T-141) später.
  Branch `feature/map-forge-more`. Erledigt: `core/leaks.ts` (offene Wandenden, Lücken bis ½ Feld als eine
  Lücke, Türen ohne Anschluss; Klippen ausgenommen; Tests); Kartenschmiede › Hindernisse › „Leck-Prüfung“ öffnet
  ein Befehls-Panel mit Liste (Klick zeigt die Stelle) und Schalter „Testfigur“ mit Dunkelsicht; die Testfigur
  ist ziehbar, ihre Sicht wird wie die einer Spielerfigur gerechnet (Wände inkl. gezeichneter Mauern und
  Asset-Türen, Licht, Dunkelsicht) und hell gezeigt; Lücken rot markiert. Nichts davon wird gespeichert oder an
  den TV geschickt. In der App geprüft (Beispielkarte: keine Lücken, Sicht durch die Durchgänge).
- ✓ **DC-026 Parametrische Räume, Gelände mit Bewegungskosten, Treppen zwischen Ebenen** (T-195–197). Treppen
  erledigt (E-44, Branch `feature/stairs`): `core/stairs.ts` (Tests), Karte v12 `stairs`, Werkzeug „Treppe“
  (Kartenschmiede › Hindernisse), Eigenschaften (Ziel, Richtung, entfernen), Rückfrage beim Abstellen, TV folgt
  allen Spielerfiguren, Stufenbild im TV- und DM-Fenster (nur die Lage geht in den Frame). Kartenkopie erneuert
  Treppen-IDs. In der App geprüft. Parametrische Räume erledigt (E-45, Branch `feature/parametric-rooms`):
  `core/build/rooms.ts` (Ableitung, Griffe; Tests), Karte v13 `rooms`, Ableitung in `sceneMap` (Sicht, TV, DM-Bild),
  Werkzeug Bauen › Raum mit Befehls-Panel, Bearbeiten (Griffe, verschieben, Punkte einfügen/löschen),
  Eigenschaften, „Räume in Mauern umwandeln“; Türzustände der abgeleiteten Türen bleiben in der Szene. In der App
  geprüft. Gelände mit Bewegungskosten entfällt (DM 2026-11-26: wird nicht benötigt).
- **DC-027 Karte aus Kacheln, eigene Karten zeichnen** (T-190, Stufe 6) – geht in DC-107 (Zeichnen) und DC-119 (Generator) auf.
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

### 3.9 Prozedurale Kartenschmiede (E-46 – E-77)

Plan: `docs/KARTENSCHMIEDE-PROZEDURAL.md` (Teil A gilt vorrangig, Roadmap A.11). Je Phase ein Branch. Mit DC-121 und
DC-122 fallen gezeichnete Mauern, Klippen, Wasser, Böden, Räume und der Generator weg (E-57); bis Phase 2 hat die
Kartenschmiede keine Bauwerkzeuge.

**Vorab (DM):** Archiv-Export aller Kampagnen (E-57 löscht die alten Bau-Felder ohne Sicherung), bevor die App auf dem
Branch mit dem echten Wurzelordner startet. Die Bench-Basis mit alter gezeichneter Karte entfällt (E-81).

Branch: `feature/procedural-forge-phase-0`.

**Phase 0 – Fundament**

- ✓ **DC-121 Karte v14 und Migration** (E-55, E-57): neue optionale Felder (Plan A.6); Migration v13→v14 entfernt
  `masonry`, `masonryDoors`, `cliffs`, `waters`, `floors`, `rooms`, auch in Szenen-Zeichnungen; Rundreise-Test in
  `format.test.ts`; Standard-Geländebiom aus `fogBiome` (O-A7).
  Erledigt: `core/build/intent.ts` mit den Schemas aller v14-Felder (E-79) – `terrain` (Stufenhöhe, Biom-Palette mit
  höchstens 4 Biomen, Stapel `map` bzw. Stockwerk-id mit Blöcken `{ v, data }` und Patches je Ebene `{ v, data,
  mask }`, Block-Schlüssel `<bx>_<by>` vorzeichenbehaftet, Base64 geprüft), `wallLines` (Stile stone, brick, wood,
  palisade, fence, drystone, hedge), `openings` (door, double-door, portcullis, window, arrow-slit, archway, breach;
  `secret` nur bei Türen; `hinge`, `opensTo`, `material`; ohne `wall` in der Fels-Kante), `paths` (Bézier, Anfasser
  relativ zum Knoten, Breite je Knoten), `crossings` (`auto` oder fester Typ; `path` statt `origin`/`lock` der
  Skizze), `waterSources`, `prefabs` (Vierteldrehungen), `derived` (Schlüssel klein, `:` `.` `~` erlaubt), `mood`,
  `undergrounds` (Eingänge mit id und `secret`, `confirm`, `leaveOff`). Karte v14 / Szene v13; Migration nach E-57
  und E-80; Szenen-Zeichnungen haben `paths` und blenden auch abgeleitete Schlüssel aus. Die Laufzeit trägt die
  Felder unverändert (`MapInfo.intent`, `Scene.ownPaths`, alle Stockwerke), damit Speichern nichts verliert; nichts
  davon geht an den TV. `defaultTerrainBiome` nach E-78. Karte duplizieren: „nur die Karte“ behält die Absicht nur
  bei gezeichneten Karten (ohne Ebenen und Stockwerke, Stimmung immer), „mit allem“ vergibt neue IDs und zieht
  Verweise nach (Öffnung → Wandlinie, Übergang → Weg, Untergrund → Stockwerk, Rasterstapel → Stockwerk, Patches →
  Ebene). Tests: `intent.test.ts`, `format.test.ts`, `mapCopy.test.ts`. Keine sichtbare Änderung; die App wurde
  wegen E-81 nicht mit dem echten Wurzelordner gestartet. Bis DC-122 bleiben die alten Felder im Schema (leer).
  Nach dem Review: die ausgemusterten Felder fallen bei **jedem** Lesen weg, nicht nur bei der Migration – eine
  v14-Datei, die vor DC-122 noch `masonry: []` usw. bekam, behält sie nie als unbekannte Felder; Block-Schlüssel
  nur in einer Schreibweise, Biom-Palette ohne Doppelte, Prefab-Pfad nur `library/<name>.prefab.json`; Kopieren
  kennt alle IDs der Karte (auch der Absicht), neue IDs wiederholen keine; Test, dass der TV-Frame mit und ohne
  Absicht gleich ist. Offen für spätere Tasks: `keepUnknown` geht nicht in Records (unbekannte Felder in Blöcken
  und `derived` gehen beim Schreiben verloren) und `intentOf` kopiert die ganze Absicht je Ansicht – beides mit
  DC-123 (geteilte Blöcke); abgeleitete Schlüssel mit Element-IDs müssten beim Kopieren mitgehen (Schlüssel-Schema
  in DC-131).
- ✓ **DC-122 Alten Bau- und Mal-Code entfernen** (E-57, Plan A.3): Module, Ribbon-Knöpfe, Generator-Dialoge,
  i18n-Schlüssel; Tests, Typecheck und Build grün.
  Erledigt nach E-82: entfernt sind `core/build/{masonry,cliffs,water,floors,rooms,rock,generate,sight,sceneDrawing,
  playerDrawing,dirty}.ts` samt Tests, `render/{cliffsPaint,waterPaint,detailsPaint,drawnMap}.ts`,
  `render/pixi/water-layer.ts`, `app/build.ts`, `app/GenerateMapDialog.tsx`, `panels/BuildCommandPanel.tsx`, der
  Tab „Bauen“, Bau-Eigenschaften, Bau-Overlay und Geröll-Markierung im DM-Fenster, 158 Texte (en/de), die
  Generator-Styles. Schema: Karte und Szene kennen die alten Felder nicht mehr; `readDocument` wirft sie bei jedem
  Lesen weg (E-80), sie kommen also auch über `keepUnknown` nie zurück – in der echten App geprüft: eine v13-Karte
  mit Mauern, Raum und Tür wird nach einer Änderung als v14 ohne ein altes Feld geschrieben, Ursprung, Lichtrichtung
  und normale Wände bleiben. Renderer: Overlay über Bildkarten, Decals, bewegtes Wasser und kachelweise gemalte
  Karten entfallen; neu ist eine **leere Fläche** (`BlankArea`) für gezeichnete Karten – Nebel, Raster und Licht
  haben ihren Platz, ohne eine Textur anzulegen. TV-Frame Version 6: statt `drawn` nur `drawnOrigin` (wo die Fläche
  einer gezeichneten Karte beginnt). Sichtwände sind bis DC-129 nur die Wände der Karte (und Asset-Türen); die
  Stockwerk-Grundfläche ist bis dahin nur die von Hand gezeichnete. Katalog: gezeichnete Karten zeigen das
  Mauer-Symbol, bis DC-128 die Vorschau malt. Bundles kleiner (DM 575 → 500 kB, TV 831 → 739 kB). Geprüft: 699
  Tests, Typecheck, Build, Tisch-Bundle-Prüfung; in der App (eigenes Profil, Test-Wurzelordner): Menüband ohne
  „Bauen“, Katalog ohne „Karte generieren“, alte gezeichnete Karte öffnet. Nicht geprüft: das Bild einer
  gezeichneten Karte im DM-Fenster und auf dem TV – das App-Fenster lag verdeckt im Hintergrund, WebGL zeichnete
  dort nicht; offen für den DM nach dem Archiv-Export (leere dunkle Fläche mit Raster erwartet).
  Im Eigenschaften-Panel fehlen bis zur neuen Oberfläche Lichtrichtung und „Wasser bewegt sich“ (`lightAngle` und
  `waterAnimated` bleiben in der Datei, E-80; wieder bedienbar mit DC-128/DC-130/DC-134). Neue Element-IDs
  (`freshId`) meiden jetzt auch die IDs der Absicht und eigene Wege der Szene. Nach dem Review: Tests für den Wechsel
  Bildkarte ↔ gezeichnete Fläche (fail-closed), veraltete Kommentare, ungenutztes Symbol und Text entfernt.
- ✓ **DC-123 Raster-Blöcke** (E-55, E-56): Blockspeicher, Codec (Lauflänge + Deflate + Base64), Patches je Ebene,
  Historie mit geteilten Blöcken, Rettungskopie in IndexedDB; Größenmessung (O-A1).
  Erledigt nach E-83/E-84: `core/build/terrain/` – `block.ts` (32 × 32 Felder, 128 × 128 Stützpunkte, je Kanal eine
  Ebene: Stufe int8, Feinhöhe int16 in 1/16 ft, Böschung, Fels, Felsstil, Wasser, zwei Bodenklassen mit Gewicht,
  Dichte Pflanzen/Geröll mit 128 = normal; je Feld vier Biomgewichte; Blöcke ändern sich nie, eine Änderung kopiert
  nur ihre Ebene; Patches je Ebene mit Maske je Kanalgruppe, in Ebenen-Reihenfolge übereinandergelegt),
  `rle.ts` (PackBits), `codec.ts` (Ebenen → PackBits → Deflate per `CompressionStream` mit Prüfsumme → Base64;
  strenge Längenprüfung, eine kaputte Datei wird ganz abgelehnt), `state.ts` (Rasterzustand je Stapel, Ändern über
  Blockgrenzen auch ins Negative, unveränderte Stapel/Blöcke/Ebenen werden geteilt; kodiert beim Speichern nur
  Blöcke, die es noch nicht kennt). Rettungskopien liegen in IndexedDB (eine einmalige Übernahme aus dem
  localStorage; in der echten App geprüft), die Absturzmarke bleibt im localStorage. Hinweis im Protokoll ab 8 MB
  Kartendatei. Tests: 22 Kern-Tests, Rettungskopie und Übernahme, Dateigröße. Der Einbau in Speichern/Öffnen/
  Rückgängig folgt mit DC-128 (E-84). Beobachtet beim Prüfen: ein lange verdecktes App-Fenster hängt mit voller
  CPU im nativen Teil (auch auf `main`) – zum Beobachten am Tisch notiert.
- ✓ **DC-124 Worker-Pool und Scheduler** (E-53): Transferables, Dirty je Block mit Halo, veraltete Jobs verwerfen,
  Worker-taugliche Malbasis (OffscreenCanvas).
  Erledigt: `core/build/derive/scheduler.ts` (Halo in Feldern → Blöcke, geänderte Blöcke mit Nachbarn auch ins
  Negative, Reihenfolge nach Nähe zum Ausschnitt, Generationen je Block: ein veralteter Auftrag liefert nie).
  `src/derive/` (außerhalb `app/`, weil der TV dieselbe Optik rechnet, E-61): `pool.ts` (Kerne − 1, höchstens 4;
  Auftrag an den am wenigsten belegten Worker; Ergebnisse als Transferables, Eingaben als Kopie – die Blöcke des
  Hauptthreads bleiben unversehrt; ein abstürzender Worker lehnt seine Aufträge ab und wird ersetzt), `jobs.ts`
  (reine Aufträge: Patches über einen Block legen, schematische Blockvorschau; Eingaben werden an der Grenze
  geprüft, jeder Fehler kommt als Antwort), `worker.ts`. `render/paint/surface.ts`: Zeichenfläche als
  OffscreenCanvas ohne DOM, Bild als übertragbares ImageBitmap. Die Tisch-Bundle-Prüfung folgt jetzt auch
  Worker-Dateien (`new URL(…, import.meta.url)`; mit einem Probe-Build in beide Richtungen geprüft). CSP und Header
  unverändert (Modul-Worker aus `'self'`). Geprüft: Tests (Scheduler, Aufträge, Pool mit Ersatz-Worker), in der
  echten App ein Worker mit beiden Aufträgen über die DevTools (19 ms, Bitmap 32 × 32, Fehlerfall). Genutzt ab DC-128
  (wie E-84).
- ✓ **DC-125 TV-Frame v6** (E-61; Version 6 hat DC-122 schon vergeben – ohne `drawn`, mit `drawnOrigin` –, die
  Raster-Blöcke kommen auf diesem Branch dazu): Raster-Blöcke nur bei Änderung mit Prüfsumme, gefiltert nach Ebene, Stockwerk und
  geheimen Bereichen; Projektionstests je neuer Absicht-Art; fail-closed.
  Erledigt nach E-85: `core/build/terrain/tvRaster.ts` – Feldmaske je Block (Feldmitte im Erkundeten, um 2 Felder
  geweitet; ein Feld, dessen Mitte oder Ecke in einem unentdeckten geheimen Bereich liegt, und seine Nachbarn fallen
  weg; auch bei gedrehtem Raster), Block = Grundblock mit Patches aktiver Ebenen, außerhalb der Maske die Vorgaben;
  nur Blöcke mit etwas Erkundetem; Prüfsumme (zweimal FNV-1a, 16 Hex-Zeichen); Versandplanung (fehlende Blöcke, je
  Nachricht höchstens 16); TV-Seite: `parseRasterBatch` (nur ganze Blöcke mit passender Prüfsumme, alles andere
  verworfen), `RasterCache` (höchstens 256 Blöcke, die des neuesten Frames bleiben am längsten; ein fehlender
  Block bleibt schwarz). Frame: `map.raster` (Stufenhöhe, Palette, Prüfsumme je Block; Schema-geprüft). Kanal
  `table:raster` → `player-raster` nur vom DM-Fenster angenommen (ohne Electron: eigener BroadcastChannel);
  `pushRaster` in `tableOutput.ts` vergisst das Gesendete, wenn der TV lädt oder schließt. Projektionstests:
  Unerkundetes, geheimer Bereich samt Rand und Eckpunkt, inaktive Ebene, Block nur aus einer Ebene, anderes
  Stockwerk, gedrehtes Raster; die übrigen Absicht-Arten gehen gar nicht an den TV (Test aus DC-121). Geprüft:
  Tests, Build mit Tisch-Bundle-Prüfung. Nicht im echten Fenster geprüft: der TV müsste als Vollbild auf dem
  einzigen Bildschirm öffnen, und noch erzeugt nichts Raster – kommt mit DC-128.
  Nach dem Sicherheits-Review: ein schmaler oder schräger geheimer Bereich lief durch die alte Prüfung (nur Mitte
  und Ecken) – jetzt zählt jedes Feld, durch das ein Rand läuft (Tests: schräges Band, dünner Streifen, dünner
  Ausläufer, jeweils mit Wasser nur im Geheimen). Der Ring um einen geheimen Bereich wird aus dem nächsten bekannten
  Feld aufgefüllt (E-85; Test: die Wand vor dem Geheimraum bleibt Wand). Jeder erkundete Block wird genannt, auch
  ungemalt (leere Blöcke teilen eine Prüfsumme). Der DM führt das Gesendete als begrenzte Liste (224) und vergisst
  vor dem TV (256), sodass nie ein Block schwarz bleibt. Konstanten und kleine Schemas in `core/build/terrainKeys.ts`
  (das TV-Bundle zieht das Kartenschema nicht mehr). Offen für DC-128: Leistung (Masken je Zeile statt
  Punkt-in-Polygon je Feld, Zwischenspeicher je Block und Nebelstand, ggf. im Worker), ob durchscheinende
  Stockwerke darunter eigenes Raster bekommen (bis dahin `raster: null`), dass Int8/Int16-Arrays den IPC-Weg als
  solche überstehen (sonst bleibt alles schwarz), und `table:ready` fehlt ohne Electron (BroadcastChannel).
- **DC-126 Prüfwerkzeuge** (E-73; nach E-86 erst nach DC-128): Bench-Szene mit großer gezeichneter Karte, Wasser, Stockwerk und Streuung;
  Playwright-Bildvergleiche (Steckbrief vor dem Einführen).
- ✓ **DC-127 Look-Spike Klippenband** (E-46, E-52): Stufen-Raster → Kontur → Band mit Test-Textur, Fuß-AO und Lippe;
  Abnahme neben einer Referenzkarte.
  Stand: `core/build/geom/contours.ts` (Marching Squares je Stufenwechsel, Kreuzung immer mittig – zwei Stufen auf
  einer Linie, höhere Seite links, Sattel nach der Feldmitte, Chaikin) und `band.ts` (Bandbreite 0,45 Feld je 10 ft,
  höchstens 2,5 Felder; Band rechts der Kontur mit Gehrung, höchstens doppelte Breite; u entlang der Bogenlänge, v
  von Kante zu Fuß; Helligkeit nach Lichtrichtung), getestet. Spike-Seite `spike-cliff.html` (Entwicklerseite,
  `?p=` Perspektivfaktor) mit erzeugten, nahtlosen Platzhaltertexturen, Fuß-AO und Lippe; Referenz mit Higgsfield
  (außerhalb des Repos). DM 2026-11-27: Bandbreite bleibt 0,45 Feld; nachbessern – detaillierter (Felsblöcke und
  Klüfte, unruhige Oberkante, Geröll am Fuß, wechselnde Bandbreite) und der Boden soll über die Kante laufen
  (Gras/Erde hängen oben über, Erde und Schutt laufen unten in die untere Ebene).
  Schritt 2: Band mit wechselnder Breite (±35 %, an der Weltposition abgetastet, `widthFactor`), Textur aus
  Felsblöcken mit versetzten Fugen, Lichtkante links und Schattenkante rechts; Grasüberhang mit ausgefranstem
  Rand über der Kante, Randsteine, Erd- und Schuttsaum unter dem Fuß, Geröll (nach außen kleiner) mit
  Kontaktschatten. Vergleichsbild außerhalb des Repos.
  Schritt 3 (DM: „zu viele Steine, nicht überall Steine – wie in der Referenz“): Geröll nur noch in wenigen Nestern
  (großräumiges Rauschen entscheidet, wo), Randsteine ganz vereinzelt, Erdsaum in Flecken statt als Ring; Fuß-AO
  über eine stärker geglättete Linie (die Keile an Innenbiegungen fast weg – richtig mit AO aus dem Distanzfeld in
  DC-128).
  Schritt 4 (DM: Textur abwechslungsreicher wie die Referenz – oben auch glatter Stein statt Gras, unten auch weiche
  Übergänge, mehr Varianz in den Schichten): sechs Schichten in mehreren Tönen (Ocker, Sand, Rost, Graubraun) mit
  stark welligen Grenzen, die anschwellen und auslaufen, feine Zwischenfugen, verwitterte helle Oberkante; ein
  Fleckenmuster entlang der Kante (nach Bogenlänge) schaltet Gras ↔ helle Steinkappe und harten ↔ weich
  auslaufenden Fuß (nur an wenigen Stellen, unteres Drittel).
  Schritt 5 (DM: erst echte Textur im Spike): mit Higgsfield ein Klippenstreifen (Sandstein in Schichten und Blöcken)
  und eine Graskachel erzeugt, abgelegt außerhalb des Repos (`~/Documents/Dungeon Crucible Testbilder`, O-A8 offen);
  der Spike lädt sie über `?band=`/`?grass=` und macht sie beim Laden nahtlos (Ränder überblendet – die Nachbearbeitung,
  die E-75 ins Entwickler-Werkzeug legt); vom Streifen nur ein Drittel der Höhe (wenige dicke Schichten, Seitenverhältnis
  gehalten), sanfteres Licht.
  Schritt 6 (DM: das weiche Auslaufen am Fuß sieht nicht gut aus): wieder entfernt – der Fuß ist überall eine klare
  Kante mit Fuß-AO; Steinkappen und Schichtvarianz bleiben.
  Schritt 7 (DM: blanker Fels oben nicht so durchgängig, kleinere Flächen hier und da): feineres Fleckenmuster, höhere
  Schwelle, Kappen reichen weniger tief.
  **Abgenommen vom DM (2026-11-27)** mit den gemalten Texturen. Für DC-128 mitnehmen: Band 0,45 Feld je 10 ft;
  Felsblöcke mit Fugen und Schichtvarianz; Breite wandert ±35 %; oben Grasüberhang im Wechsel mit kleinen, verstreuten
  Steinkappen; Fuß überall klare Kante mit Fuß-AO (kein weiches Auslaufen); Erde in Flecken; Geröll nur in wenigen
  Nestern, Randsteine selten; gemalte Texturen (E-70) statt erzeugter. Offen dort: AO aus dem Distanzfeld (Keile an
  Innenbiegungen), Klemmung enger Innenkurven (kleine Gruben), O-A8 vor der Auslieferung der Higgsfield-Bilder.

**Phase 1 bis 10**

- ◐ **DC-128 Gelände und Render-Pipeline** (E-46, E-49, E-52, E-60, E-70; dazu aus DC-123 der Einbau des
  Rasterzustands in Speichern, Öffnen und Rückgängig nach E-84, mit Standard-Biom nach E-78): Stufe, Feinhöhe, Böschung, Klippen (Kontur,
  Band, Lippe, Material, Module), Boden- und Biom-Raster mit Splat-Shader, Schatten und AO, Chunk-Bake und
  Detailstufen, Einweg-Sicht an steilen Stufen, Viertelfeld-Fang, Raster über Bildkarten, Katalog-Vorschau;
  Ribbon-Tab GELÄNDE (E-67).
  Aufgeteilt in fünf Pakete, jedes vom DM einzeln abgenommen (DM 2026-11-27): a) Raster in Speichern/Öffnen/
  Rückgängig (E-84) und TV-Anschluss (E-85); b) Tab GELÄNDE mit Stufe, Klippen bei DM und TV, Einweg-Sicht;
  c) Boden- und Biom-Raster mit Splat-Shader, Higgsfield-Bodentexturen, Pinsel; d) Feinhöhe, Böschung, Schummerung,
  Schatten/AO; e) Klippen-Material und Module, Chunk-Bake/Detailstufen, Raster über Bildkarten, Katalog-Vorschau.
  ✓ **a)** `app/terrain.ts` hält je Kartendatei den dekodierten Rasterzustand: beim Öffnen aus dem Dokument
  genommen (Ansichten, Dokumente und Rückgängig tragen nie Base64), bei jedem Schreiben der Kartendatei wieder
  eingesetzt, kodiert werden nur geänderte Blöcke; Kopieren einer Karte nimmt es mit. Rückgängig/Wiederholen
  führen den Zustand mit (unveränderliche Blöcke, geteilt). Ein nicht lesbares Gelände (DM 2026-11-27): Karte öffnet
  ohne Gelände, schreibgeschützt, Hinweis im Protokoll (`log.terrainBroken`), die Datei wird nie überschrieben.
  TV: der Frame der TV-Szene nennt Schrittweite, Biom-Palette und je erkundetem Block eine Prüfsumme, die Blöcke
  gehen vor jedem Frame über `pushRaster` hinaus (nur fehlende). Gerechnet wird nur bei neuem Raster, neuem Nebel
  oder geänderten geheimen Bereichen, Ebenen, Stockwerk, Raster-Einmessung (Bereiche werden an Ort und Stelle
  geändert, daher nach Inhalt verglichen). Als geheim zählen auch ausgeblendete Bereiche und solche auf
  inaktiven Ebenen. Wartet eine Kartenänderung auf „Auf den TV“ (E-30), bleibt auch das Gelände des TV beim alten
  Stand. Stockwerke darunter bekommen noch kein Raster (`raster: null`). Tests (Öffnen, Speichern mit
  unveränderten Blöcken, Rückgängig/Wiederholen mit geteilten Blöcken, kaputtes Gelände, Kopie, TV-Frame nur
  Erkundetes samt Rand, Warten auf „Auf den TV“, ohne Gelände kein Raster). In der echten App (eigenes Profil,
  Test-Wurzelordner) geprüft: Öffnen, Ändern, Speichern mit dem Chromium-Kompressor, Rücklesen, Rückgängig und
  Wiederholen; TV-Raster im Renderer 9 ms beim ersten Mal, danach 0 ms aus dem Zwischenspeicher. Das TV-Fenster
  selbst nicht (Vollbild auf einem Bildschirm des DM; sichtbar wird Gelände erst mit b). Beobachtet: der
  Renderer der Entwickler-App hängt nach dem Wechsel in den Spielbereich mit TV-Szene bei voller CPU – ebenso
  auf dem Stand vor a), also älter; zum Untersuchen notiert.
  Nach dem Review: die Sperre für ein kaputtes Gelände hält jetzt, bis die Karte neu geöffnet wird (vorher hob
  jedes erneute Lesen der Datei – Katalog, Szene laden, Export – sie auf, und das nächste Speichern hätte das
  Gelände gelöscht); Rückgängig im Szenen-Layer lässt das Gelände in Ruhe (es hätte eine Änderung aus einem anderen
  Tab zurückgedreht); eine neue Szene auf einer offenen Karte nimmt deren Stand samt Gelände; die Kopie einer
  Karte mit kaputtem Gelände nimmt es so mit, wie es in der Datei steht. Tests: 10.
  **Abgenommen vom DM (2026-11-27).**
  ✓ **b)** (E-87) Texturen je Biom (Band und Boden, Higgsfield, abgenommen per Vergleichsbild) als WebP-Slots;
  Karte v15 mit `cliffPerspective` (0,2–1,0, Standard 0,45; v14 wird ohne Änderung hochgestuft), Regler in den
  Karteneinstellungen gezeichneter Karten. `core/build/terrain/cliffs.ts`: alle Stufenwechsel in einem Durchlauf je
  Block, mehrere Stufen auf einmal als eine hohe Klippe, sonst Terrassen; Linien mit Rauschen nach Weltposition
  (DM und TV zeichnen aus denselben Blöcken dieselben Klippen), Blöcke zwischengespeichert, bis sie oder ein
  gelesener Nachbar sich ändern; am TV gibt ein fehlender Block keine Kante. Ihre Oberkanten sind Einweg-Wände der
  Sicht (DM-Szene, TV-Szene auch bei wartenden Kartenänderungen, Hintergrund-Szene, Stockwerke darunter); die
  DM-Überlagerung zeichnet sie nicht. `render/pixi/terrain.ts` im gemeinsamen Renderer: Boden des Bioms, Band mit
  ±35 % Breite, Fuß-AO, Erdsaum in Flecken, Überhang aus dem Boden (nicht im Dungeon) mit kleinen Steinkappen,
  Geröll in wenigen Nestern, seltene Randsteine; Farben von Kappen, Geröll und Erde je Biom; neu gebaut nur, wenn
  sich Blöcke oder Aussehen ändern. TV-Frame v7: das Raster nennt dazu Bandbreite und Lichtrichtung; eine
  gezeichnete Karte ohne Gelände schickt ihr Standard-Biom ohne Blöcke (der Boden). Werkzeug **Stufe** im neuen Tab
  GELÄNDE (auf Bild-/Videokarten ausgegraut mit Hinweis): Heben, Senken, Auf Stufe setzen mit Pipette; Pinsel
  rund, eckig, Lasso; Schalter Viertelfeld-Fang; Alt kehrt um, Shift gerade Linie; Heben senkt nie, Senken hebt
  nie; jeder Strich ein Schritt für Rückgängig, Abbrechen nimmt alle Striche seit dem Öffnen zurück; nicht
  lesbares Gelände sperrt das Werkzeug. Die Vorschau (Live-Klippen oder Umriss) steht im Befehls-Panel und gilt für
  dieses Gerät – einen eigenen Einstellungsdialog gibt es noch nicht. Geprüft: 805 Tests, Build mit
  Tisch-Bundle-Prüfung; in der echten App (eigenes Profil) Malen mit allen Pinseln, Rückgängig, 102 Einweg-Wände,
  Panel und Ribbon im Bild; die Klippen selbst im echten Renderer offscreen je Biom (das verdeckte App-Fenster
  zeichnet kein WebGL). Das TV-Fenster nicht (Vollbild auf einem Bildschirm des DM). Beobachtet: einmal hing der
  Renderer der Entwickler-App kurz nach dem Start, danach nicht mehr reproduzierbar – wie vor a).
  Nach dem Review: ein Strich gehört fest zu seiner Karte und seinem Befehl (vorher konnte ein liegengebliebener
  Strich nach einem Tab-Wechsel auf eine andere Karte schreiben); Esc nimmt den laufenden Strich zurück, Enter
  beendet das Werkzeug; ein Strich ohne Änderung hinterlässt keinen Rückgängig-Schritt; beim Malen wird nur das
  neue Wegstück gepinselt; GPU-Puffer werden beim Neubau freigegeben; Zwischenspeicher hängen am Geländestand
  (DM und TV verdrängen sich nicht). Am TV heißt ein nicht gesendeter Punkt ausdrücklich „unbekannt“ (Stufe −128,
  E-85 unverändert: nichts Verborgenes): sonst entstanden am Rand des Bekannten Klippen, die es nicht gibt;
  teilweise erkundete leere Blöcke teilen deshalb keine Prüfsumme mehr, ganz erkundete weiter. Tests: 808.
  **Abgenommen vom DM (2026-11-27)**, auch die Vorschau-Wahl im Panel „Stufe“ (je Gerät) statt eines
  Einstellungsdialogs.
  ✓ **c)** (E-88) 75 Bodentexturen (35 Klassen je Biom, Varianten außer Pflaster, Varianten der Grundböden) als
  WebP-Slots. `core/build/terrain/groundTool.ts`: neun Bodenklassen und welche jedes Biom hat; je Stützpunkt bis zu
  zwei Klassen mit Gewicht, der Rest Auto; Malen hebt eine Klasse auf eine Stärke und drückt die anderen gleichmäßig,
  „Auto“ nimmt zurück; Biome je Feld gegen die Palette (zwei mischen sich), ein neues Biom kommt in die Palette, ein
  fünftes wird abgelehnt; weiche runde Pinsel; Füllen nimmt zusammenhängend gleichen Boden auf derselben Stufe
  (Klippen begrenzen). Zeichnen (`render/pixi/groundSplat.ts`) für DM und TV: der Grundboden des ersten Bioms über die
  Karte, je Block die anderen Biome und die gemalten Klassen im Biom, in dem sie liegen; Kanten durch Rauschen
  ausgefranst (Zungen, Inseln), Varianten in großen Flecken; Gewichte als kleine Daten-Texturen je Block samt
  Nachbarrand, neu gebaut nur bei geändertem Block. Klippen nehmen Band, Überhang und Kies am Fuß vom Biom der
  Oberseite, längs der Kante überblendet; malt man nur Boden, bleiben die Klippen stehen. Werkzeuge im Tab GELÄNDE:
  Bodenklasse (Bildpalette des Bioms unter dem Zeiger, fehlende Klassen blass mit Hinweis), Biom (fünf Bilder,
  Palette der Karte), Füllen (Toleranz); Stärke, weiche Kante, Größe; Alt = zurück auf Auto bzw. das erste Biom.
  Geprüft: 821 Tests, Build mit Tisch-Bundle-Prüfung; der echte Renderer offscreen (Klassen, Biomgrenze, Klippe über
  die Grenze); in der echten App alle drei Werkzeuge über den Store, Panel im Bild. Das Kartenbild der App selbst
  nicht: im verdeckten oder Offscreen-Fenster gehen die WebGL-Kontexte der App-Seite verloren und der Renderer hängt
  gelegentlich nach dem Start – ebenso auf `main` (2026-11-28 verglichen), also älter.
  Nach dem Review: Biomgewichte lesen einen Ring der Nachbarzellen (vorher eine Naht an jeder Blockgrenze); jede
  Schicht deckt ihren Anteil an dem, was unter ihr liegt (Auto, dann Klassen nach Nummer; erstes Biom, dann die
  anderen), mit demselben Rauschen – zwei Biome oder Klassen zu je einer Hälfte lassen keine Löcher mehr; ein
  Palettenplatz, den kein Feld mehr nutzt, wird für ein neues Biom wieder vergeben (so stimmt der Hinweis „zuerst
  übermalen“); Malen ohne Änderung hinterlässt keinen Rückgängig-Schritt. TV-Frame v8: der TV erfährt nur die Namen
  der Biome, die seine Blöcke nutzen – ein Biom nur in einem unentdeckten Geheimraum bleibt ungenannt. Tests: 823.
  DM 2026-11-28 („manche Texturen viel zu groß, z. B. Pflaster“): jede Bodenklasse hat einen eigenen Maßstab nach
  echter Größe (Kachel in Feldern: Pflaster 2–3,5 je nach Steingröße des Bildes, Kies 2, Laub 2,5, Moos 3, Gras und
  Erde 4, Fels 5, Schnee 7, Grundboden 7,3); Kies am Klippenfuß ebenso. Musterkarte je Biom mit Raster zur Abnahme.
  **Abgenommen vom DM (2026-11-28)** – vorerst; die Texturen werden ggf. später noch einmal angepasst.
- **DC-129 Fels, Dungeon, Wandlinien** (E-48, E-62, E-64): Aushöhlen, Füllen, Raum, Wandlinien mit Linienbau-Stilen
  und Wehrmauer, Öffnungen (O-A2), Sicht- und Bewegungs-Wände, Leck-Prüfung, Stockwerk-Grundfläche, Raumerkennung,
  Bodenplatten per WFC, Untergrund mit Eingängen (O-A3).
- **DC-130 Wasser** (E-47): Wasser-Raster, Wasserkörper und Überlauf, Fließfeld und Richtungsangabe, Shader,
  Wasserfälle, Quellen-Werkzeug, Ufer; Ribbon-Tab WASSER.
- **DC-131 Regel-Engine und Biom Gemäßigt** (E-50, E-51, E-69): Regel-Schema, Umweltfelder, Streuung, Overrides,
  Dichte-Pinsel, Regel-Debugger; Ribbon-Tab DETAILS.
- **DC-132 Wege und Übergänge** (E-63): Bézier-Wege, Wegtypen, Ausweich-Routing, Klippentreppe, Rampe, Leiter, Brücke,
  Steg, Furt; Ribbon-Tab WEGE.
- **DC-133 Bearbeitung** (E-58, E-65, E-68): Auswahl, Kopieren und Einfügen der Absicht, Raster-Patches je Ebene,
  Asset-Sidecar v4, Dateiart `prefab`, Stempel, Verlauf-Panel.
- **DC-134 Stimmung und Klang** (E-71, E-72): Sonnenhöhe, Tageszeit, Jahreszeit, Wetter, Dunst, Wolken, Nacht;
  abgeleitete Klangquellen, Vorhören mit der Testfigur.
- **DC-135 Export** (E-74): Bild, Foundry-Szene, UVTT, Druck als PNG-Serie (O-A4, O-A5).
- **DC-136 Haus-Generator im Asset-Editor** (E-64).
- **DC-137 Weitere Biome, Generator neu, Stil-Modell** (E-66, E-69, E-75): Dungeon/Höhle, Sumpf, Wüste, Winter;
  Generator für Dungeon, Höhle und Wildnis; Stil-LoRA (O-A8).

---

## 4. Offene Punkte

Aus dem Plan der prozeduralen Kartenschmiede (`docs/KARTENSCHMIEDE-PROZEDURAL.md` A.12), zu klären im genannten
Task:

- ✓ **O-A1** Grenzwert für die Rastergröße in der `.map.json`; ab wann eine Binärdatei (E-55) – entschieden: E-83
- **O-A2** Sichtmodell für Fallgitter (offen/zu) und Schießscharte („eingeschränkt“) – DC-129
- **O-A3** Untergrund: eigener Nebel oder Kartennebel, Überblendung, Verweis auf tiefere Karten – DC-129
- **O-A4** Druckauflösung: 256 dpi (Master) oder Hochskalieren auf 300 dpi – DC-135
- **O-A5** Foundry-Zielversion (v12 oder v13) – DC-135
- **O-A6** Bildverarbeitung der Entwickler-Pipeline: über Chromium (Playwright) oder mit `sharp` – vor der
  Asset-Produktion
- ✓ **O-A7** Standard-Geländebiom neuer Karten aus `fogBiome` – entschieden: E-78
- **O-A8** Lizenz der Higgsfield-Ausgaben für Auslieferung und späteren Verkauf; Rechte an einem Stil-LoRA – vor DC-137

Neue Fragen werden mit `/topic-interviewer` geklärt und als E-… in Abschnitt 1 eingetragen.
