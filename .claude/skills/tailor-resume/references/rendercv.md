# RenderCV (optional PDF engine)

RenderCV (https://github.com/rendercv/rendercv, MIT license) turns a YAML file into a typeset PDF using
Typst. It is **opt-in**: use it only when `profile/preferences.md` says `pdf_engine: rendercv` **and**
`rendercv` is already installed (`command -v rendercv`). Otherwise use the HTML template; nothing is lost.
Verified against RenderCV v2.8 (October 2026).

## Installing (only if the user asks)

Never install it on your own. If the user asks for it and Python 3.10+ is present (`python3 --version`,
or `py --version` on Windows), suggest one of these; the `[full]` part is required, since the plain
package has no working command:

- `uv tool install "rendercv[full]"` (if `uv` is installed)
- `pipx install "rendercv[full]"` (if `pipx` is installed)

No Python? Don't push it; the HTML route makes an equivalent PDF.

## How to use it

1. Finish and check `resume.md` first (truth-checker, then voice-editor, then recruiter-reviewer), exactly as for HTML.
2. Write `jobs/<folder>/resume.rendercv.yaml` from the checked `resume.md` only: the same facts, bullets,
   numbers, dates and order. Add nothing. Leave out any field you don't have (no empty keys, no photo).
3. Make the PDF with the same script as HTML (it runs `rendercv render`, keeps the intermediate files out of
   the job folder, names the PDF and runs the page and parse checks):
   `bash .claude/skills/tailor-resume/scripts/make-pdf.sh jobs/<folder>/resume.rendercv.yaml "First Last" "Company"`
   (Windows without bash: `make-pdf.ps1` with the same arguments.)
4. More pages than the target (one, unless country or stage norms set two): trim the weakest bullet in `resume.md` and the YAML together, then run it again.
   `render-failed` prints RenderCV's error; it is almost always a YAML typo or an unknown field name.

Cover letters always use the HTML template.

## Skeleton (valid for v2.8)

Theme `harvard` with icons off and full URLs shown: one column, black text, plain section headings, and
dates that read back in order in the parse check. (`engineeringresumes` looks similar but its project
dates read back at the end of the page, so prefer `harvard`.) Page size: `us-letter` for US/Canada,
`a4` elsewhere (same country rule as the HTML template).

```yaml
cv:
  name: First Last
  location: City, ST
  email: name@example.com
  phone: "+1 555 555 0100"        # quote it; any common format works
  social_networks:                # optional; LinkedIn only if the user confirmed the URL
    - network: LinkedIn
      username: first-last        # the part after linkedin.com/in/
  sections:                       # section titles appear as written, in this order
    Education:
      - institution: School Name
        area: Field of Study
        degree: BS
        location: City, ST
        start_date: 2022-09       # YYYY-MM or YYYY
        end_date: 2026-05         # or: present
        highlights:
          - "Minor: Second Field"
    Experience:
      - company: Company
        position: Role
        location: City, ST
        start_date: 2025-04
        end_date: 2025-09
        highlights:
          - Bullet from resume.md, word for word
    Projects:
      - name: Project Name
        start_date: 2026-09
        end_date: present
        highlights:
          - Bullet
    Skills:
      - label: Technical
        details: Tool, tool, software
      - label: Certifications
        details: Certification (issuer)
design:
  theme: harvard
  page:
    size: us-letter               # or: a4
    show_footer: false
    show_top_note: false
  header:
    connections:
      show_icons: false
      display_urls_instead_of_usernames: true
  templates:
    education_entry:
      degree_column:              # empty: the degree already shows in the main line
locale:
  language: english
settings:
  pdf_title: First Last Resume
```

Notes:
- Entry types are picked by their keys: `institution`+`area` (education), `company`+`position`
  (experience), `name` (project/normal), `label`+`details` (one-line, for skills), `bullet` (a plain list).
  All entries in one section must be the same type.
- Text supports Markdown (`**bold**`), so escape a literal `*` or `_` in a bullet: `\*` in an unquoted
  value, `\\*` inside double quotes. Quote any value containing `: ` or starting with a special
  character (`"Minor: ..."`). Don't bold keywords; keep it as plain as the HTML version.
- Tested: this skeleton renders to one Letter page (and A4 with `size: a4`) and passes the parse check.
- If one date is all you have (e.g. a single month), use `date: 2026-05` instead of start/end.
