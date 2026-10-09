# Applications in another language or country

Background for `/cover-letter`, `/tailor-resume`, `truth-checker` and `voice-editor`. Researched 2026-10. Labels: **Rule** = an official source states it (a government, the EU, a public employment service). **Custom** = what official or university career pages describe as usual, not required. **Opinion** = advice from coaches or vendors. Norms vary by industry and employer; the posting's own instructions always win.

## 1. The language rule (this workspace)

- **Write application documents only in a language the user can review.** Read `application_languages:` in `profile/preferences.md` (e.g. `English (native), German (B2)`). A language listed there at about B2 or higher is one the user can review. If the field is blank, ask once ("Which languages can you read well enough to check a cover letter in?") and offer to save the answer.
- **The user can't review that language** (not listed, or below B2): still write the draft if they want it, but also give a plain English gloss (a sentence-by-sentence meaning, not a polished translation) and put this line at the top of the file and in the hand-off: `Needs a native-speaker check before sending.` Suggest who could check it (a native-speaking friend, a university language centre, a professional translator). The Outbox draft for any message in that language carries the same line in the notes to the user, never in the message body.
- **Generate in the target language; don't translate sentence by sentence.** Write from the master resume's facts directly in the target language, using that country's structure and phrasing (sections 3-4). Word-for-word translation keeps English sentence shapes and idioms that read as foreign. (Opinion, widely shared by translators and career services.)
- **Facts never change with the language.** Numbers, dates, employer names and job titles are the master resume's. A job title may be given in the target language only if it's the real title or a plain description with the original in brackets (e.g. "Qualitätsingenieur (Quality Engineer)"); never a grander equivalent. Degree names: keep the original and add a common local equivalent in brackets only if the user agrees (e.g. "BSc Biomedical Engineering (vergleichbar mit Bachelor of Science)").
- **Language levels** go in CEFR terms (A1-C2) in Europe, e.g. "Deutsch: B2". Use the level the user gave; never raise it. (Rule for Europass; Custom in Germany per Make it in Germany.)
- **Checks:** `truth-checker` compares the foreign-language text fact by fact against the English master resume (section 5). `voice-editor` keeps the user's plain voice inside the target language's register (section 4).

## 2. Privacy items (all countries)

Photos, date of birth, nationality, marital status, children, religion and similar personal details are **never added unless the user explicitly chooses** to include them for that application. Where a country's custom expects one (e.g. a photo in Switzerland or Germany), say so once, plainly, and let the user decide. Never store the user's date of birth or ID numbers in this folder (AGENTS.md rule 4); if they choose to put a birth date on a CV, they type it into the final document themselves, or tell you it's fine to put it in that job's CV file only.

## 3. Country notes

**Germany and Austria (Lebenslauf + Anschreiben)**
- Package: cover letter (Anschreiben), CV (Lebenslauf), and certificates and references (Zeugnisse, Arbeitszeugnisse). Usually sent as one PDF by email or uploaded; applying by post is rare. (Custom, Make it in Germany.)
- CV: tabular, reverse-chronological; personal data, work experience, education, languages with CEFR levels, special skills. (Custom, Make it in Germany.)
- Photo: "often expected", but it differs a lot by industry (Custom, Make it in Germany). It is **not legally required**; Germany's Federal Anti-Discrimination Agency promotes applications without photo, birth date or family status (anonymised applications). So: the user's choice; default is no photo.
- Place, date and signature: a German-style CV and Anschreiben traditionally end with place and date ("München, 8. Oktober 2026") and the signature; Austria's public employment service (AMS) recommends signing the CV and shows how to add a scanned or PDF signature for online applications (Custom; AMS). For online forms it's often dropped. Add the place/date line by default for German-language PDFs; add a signature image only if the user supplies one themselves.
- Anschreiben: one page, formal "Sie" throughout, subject line ("Bewerbung als ..."), "Sehr geehrte Frau <Name>," (or "Sehr geehrte Damen und Herren," if no name), closing "Mit freundlichen Grüßen". (Custom.)
- Certificates: attach the most important ones; translate them into German or English. (Custom, Make it in Germany.)

**Switzerland**
- CV up to two A4 pages, ideally in table form; the usual package includes a covering letter, a CV **with a photograph**, copies of diplomas and employment certificates; the covering letter typed and at most one A4 page. (Custom, EURES Switzerland.) The photo and birth date stay the user's choice (section 2). Language follows the region and posting (German, French or Italian).

**France (CV + lettre de motivation)**
- CV no more than two pages; cover letter no more than one page, usually typed and increasingly sent by email; letter layout: sender top left, place and date top right, recipient address, subject line ("Objet : Candidature au poste de ..."), signature bottom right. (Custom, EURES France.)
- Register: "vous" throughout. Opening "Madame, Monsieur," (or "Madame <Nom>,"). Closing formula, e.g. "Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées." (Custom, consistent across French career sites such as L'Etudiant and JobTeaser; a shorter closing is fine for start-ups.) Handwritten letters are now rare; write one only if the posting asks.

**Spain**
- Unless the posting says otherwise, letter and CV in Spanish, typed, A4; CV best kept to two A4 pages; a photo is not compulsory; certificates usually brought to the interview rather than attached; the letter concise and formal (usted), written for this job. Europass is an accepted alternative. (Custom, EURES Spain.)

**Netherlands**
- CV normally at most two A4 pages, to the point; letter one A4 page, short and professional; letters preferred in Dutch unless the posting says otherwise (many international employers post in English: then English); references and certificate copies need not be attached. (Custom, EURES Netherlands.) Tone is direct and plain; less formal than German.

**Nordics (Sweden as the model; check Denmark, Norway, Finland on EURES)**
- Sweden: personal letter (personligt brev) very short, at most one A4 side, naming the job; CV one to two pages, reverse-chronological; references on request; certificates only if asked. (Custom, EURES Sweden.) EURES lists date of birth among CV personal details; it stays the user's choice here. Tone: plain, modest, first names common.

**Japan (rirekisho + shokumu keirekisho): note only**
- Two documents: the rirekisho (a fixed-format timeline of education and employment, with a photo) and the shokumu keirekisho (a freer work-history document, 1-2 pages, with dates matching the rirekisho). (Custom; Tokyo Metropolitan Government career guide, which offers official templates.)
- **Recommend the user use a native template** (the Tokyo career guide's Excel/Word templates or the employer's own form) and a native-speaker check. Don't build a rirekisho from this workspace's resume template; offer to prepare the facts (dates, roles, results) in a list they paste into the template.

**Europass (EU)**
- The EU's free CV and cover-letter tool (europass.europa.eu), in many EU languages; you can build a CV in a standard European format, with CEFR language levels. Accepted across the EU; Make it in Germany suggests using it as a guide and then adapting it, since German employers often prefer an individual design (Custom). Offer it when the posting or a public employer asks for "Europass".

**Anywhere else:** look up the country's public employment service or EURES page (EU/EEA and Switzerland), or a university career service there, and state what you found with its source. Label custom vs rule.

## 4. Register for voice-editor

Keep the user's voice (plain, specific, their real results) but use the target language's formal register for applications unless the posting is clearly informal:
- German: "Sie"/"Ihr" capitalised; "Sehr geehrte ...", "Mit freundlichen Grüßen". No "Hallo" in a first letter.
- French: "vous"; formal opening and closing formula (section 3). One-line English-style closings ("Best,") read as abrupt.
- Spanish: "usted"; "Estimado/a Sr./Sra. <Apellido>:", "Atentamente,".
- Dutch: "u" in a first letter, then follow the recruiter's lead; "Met vriendelijke groet,".
- Swedish/Danish/Norwegian: first names and "du" are normal; "Med vänliga hälsningar" (SV), "Med venlig hilsen" (DA), "Med vennlig hilsen" (NO).
- Japanese: keigo; leave to the native template and a native speaker.
The AI-tell list in `voice-editor` applies in every language (throat-clearing, grand claims, stock enthusiasm, triplets). Don't import English contractions or idioms.

## 5. Fact-checking a foreign-language document

`truth-checker` lists every number, date, employer, title, degree, tool and outcome in the foreign text, gives each one's English meaning, and matches it to the English master resume line. Flag anything that can't be traced (UNSUPPORTED), any title upgraded in translation (INFLATED, e.g. "Leiter" for "lead"/"coordinator" when the source says neither), any reformatted number that changed (CHANGED: watch decimal commas, "1.000" vs "1,000", dates written day-month-year), and any personal detail (photo, birth date, marital status) the user didn't choose.

## Sources

- Make it in Germany (German federal government), "Applying for a job" (CV contents, photo, certificates, Europass, PDF by email; retrieved 2026-10): https://www.make-it-in-germany.com/en/working-in-germany/job/application
- Antidiskriminierungsstelle des Bundes (Federal Anti-Discrimination Agency), FAQ on anonymised applications (no photo, name, birth date, family status): https://www.antidiskriminierungsstelle.de/SharedDocs/downloads/DE/projekte/faqs_anonymisierte_bewerbungsverfahren.pdf?__blob=publicationFile&v=1 ; guide "Fair in den Job!": https://www.antidiskriminierungsstelle.de/SharedDocs/downloads/DE/publikationen/Leitfaeden/leitfaden_fair_in_den_job.pdf?__blob=publicationFile&v=3
- AMS (Austrian public employment service), "Lebenslauf unterschreiben": https://www.ams.at/arbeitsuchende/topicliste/lebenslauf-unterschreiben
- EURES (European Commission), living and working conditions, "applying for a job" sections: Switzerland https://eures.europa.eu/living-and-working/living-and-working-conditions-europe/living-and-working-conditions-switzerland_en ; France https://eures.europa.eu/living-and-working/living-and-working-conditions-europe/living-and-working-conditions-france_en ; Spain https://eures.europa.eu/living-and-working/living-and-working-conditions-europe/living-and-working-conditions-spain_en ; Netherlands https://eures.europa.eu/living-and-working/living-and-working-conditions-europe/living-and-working-conditions-netherlands_en ; Sweden https://eures.europa.eu/living-and-working/living-and-working-conditions-europe/living-and-working-conditions-sweden_en
- French closing formulas (career-site custom): https://www.letudiant.fr/jobsstages/lettres-de-motivation_1/les-meilleures-formules-de-politesse-pour-les-lettres-de-motivation-et-les-mails.html ; https://www.jobteaser.com/fr/advices/meilleures-formules-politesse-lettre-motivation
- Tokyo Metropolitan Government, "Road to Tokyo" career guide (rirekisho and shokumu keirekisho, templates): https://www.tdh.metro.tokyo.lg.jp/english/road_to_tokyo/step1.php
- Europass (European Union): https://europass.europa.eu/
