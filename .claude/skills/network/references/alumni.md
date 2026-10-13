# Finding alumni

Part of the `network` skill. How to find alumni at one company, and the employers where many alumni work, without LinkedIn automation (ground rule 7: you never click, search, connect, message or scrape inside LinkedIn; the user does those steps and pastes back what they see).

"School" means any shared past: a university or college, a bootcamp or training program, or a former employer (company alumni). Take it from the education and jobs in `profile/master-resume.md`; if there are several, ask which to start with. A shared school is one of the easiest openings for a first note.

## Five ways in (use what fits; the user picks)

**(a) Warm employers, from the school's LinkedIn page.** Give the user these steps: open the school's LinkedIn page (signed in), go to the **Alumni** tab, use its filters to narrow to their target function and city, then copy the list of where those alumni work, with its counts, or take a screenshot, and paste it here. (LinkedIn renames these labels from time to time; describe what to look for rather than insisting on a button name.) Turn it into a short "warm employers" list: match each employer against `knowledge/field/target-employers.md` and `jobs/tracker.csv`; employers not on the target list are candidates to add (ask first). LinkedIn's counts include only members who listed the school, so treat them as rough.

**(b) Alumni at one company.** Steps for the user: open the company's LinkedIn page, go to **People**, and type the school's name in the search box there (or use its school filter). Ask for the count, plus the names and titles of the two or three people they'd most like to talk to; don't ask for the whole list. For company alumni, the user searches LinkedIn people with the former employer as a past company and the target company as the current one.

**(c) The school's alumni directory or mentoring platform.** The career center or alumni office can say which one the school uses (many have a directory or a mentoring network where alumni have offered to help: often the warmest cold contacts there are). The user signs in themselves in the app's built-in browser and runs the search; you read one profile at a time that they open, noting only name, title, company and how the platform says to reach them. Never bulk-copy or export a directory (most forbid it in their terms), never type into it in coach mode, and never message from it: the user uses the platform's own message button.

**(d) A company-data connector** (`knowledge/data-connectors.md`): its people or education fields can show executives, board members and senior staff who went to the user's school. A note to a senior alum should be extra short and ask for advice, not a job. The licensed-data rule applies: keep what it shows in the user's private files.

**(e) Public web pages.** Team and leadership pages, speaker bios, conference talks, papers, school news ("alumni spotlight"), press releases. Searches like `"Example State" site:acme.com` or `"Example State University" Acme`. Show the source link next to every name. Public search-result snippets are fine to read; never open LinkedIn itself in a browser.

The user's LinkedIn data export (`/import-linkedin`) lists their own connections by company, not by school, so it finds former colleagues rather than alumni.

## Where the counts go

- **Target employers:** in that company's Notes in `knowledge/field/target-employers.md`, for example `Alumni: 23 from Example State (3 in marketing), checked 2026-10-13 (school Alumni page, pasted by the user)`. Adding a new company to the list needs the user's yes.
- **One job:** on the "Way in" line of `jobs/<folder>/fit.md`, for example `Alumni: 4 Example State alumni at Acme (1 on the analytics team), checked 2026-10-13`.
- **Recheck after about 3 months:** people move. Show an older count as "checked <date>, may be out of date".
- **No new columns.** Don't add alumni columns to `jobs/tracker.csv` or `jobs/leads.csv` (that would change the files' shape); use notes or the job folder.

## People

- Add someone to `contacts/contacts.csv` only after the user says they want to reach out: `relationship=alum`, `how_we_met` = the shared school and where they were found ("Example State alum, school directory"), `status=to-contact`, `job` if it's about one posting. For company alumni, use `former-colleague` if they really overlapped, otherwise `alum` with "Initech alum" in `how_we_met`.
- Two or three alumni per company is plenty; don't write to a whole team.
- The first note leads with the shared school and asks about their path, not for a job (`references/outreach-examples.md`). A referral ask comes only after a conversation.

## How it feeds other steps

- **`find-jobs` and `evaluate-job`:** alumni in the user's function or city make a "warm path": among postings with the same fit, rank those first, and note it in `fit.md`'s "Way in". An alum is a way to ask, not a referral, until they've talked with the user.
- **`follow-up`:** the playbook sends an application follow-up to a recruiter or an alum when one can be found; use (b), (c) or (e) to find the alum.
- **Senior and executive searches:** (d) and (e) find senior alumni; a short advice ask to one often leads to the right search firm or hiring manager.

Example: Alex Rivera (Example State, marketing) pastes the school's Alumni page filtered to marketing in Austin. Acme shows 23 alumni, 3 in marketing. Acme is already a target employer, so its Notes get `Alumni: 23 from Example State (3 in marketing), checked 2026-10-13`, and Alex picks two of the three to contact.
