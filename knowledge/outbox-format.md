# Outbox file format

The exact format of an Outbox draft, read by the Claude Outbox panel, the `outbox` skill and every skill that writes a message (`follow-up`, `network`, `thank-you`, `offer`, `career-fair`, ...). The rules about sending are in AGENTS.md ("Outbox").

Write every email or LinkedIn message as its own file in `outbox/`, named `YYYY-MM-DD-<short-slug>.md`, with this header:

```
---
channel: email
kind: email
to: jane.doe@example.com
cc:
subject: Thank you, Operations Analyst interview
job: acme-operations-analyst
contact: Jane Doe
reply_to:
attach:
created: 2026-10-06
status: draft
---
Body text here, plain text, no markdown formatting.
```

Header rules (the Claude panel and the `outbox` skill read these exactly; no comments on header lines):
- `channel`: `email`, `linkedin`, or `other`. `kind` for LinkedIn: `connection-note` (a connection request; **200 characters max** on a free account) or `message` (to an existing connection; under about 600 characters).
- `to`: email address(es), comma-separated, or the person's name for LinkedIn. `contact`: the name(s) as in `contacts/contacts.csv`, separated by `;` if several.
- `job`: the job folder name, or blank. `reply_to`: the Gmail message ID when replying to an email (from `sync-inbox`), otherwise blank.
- Never save a draft with placeholders like `[Name]`, `{First name}`, `<Company>`, `{{name}}` or `___`; ask the user for the missing detail first. Every email needs a subject.
- Outbox attachments: name the job folder's checked PDF in `attach:` (file name only; two separated by a comma; blank if none). Only Gmail drafts carry it (the Claude Outbox panel attaches it; in chat or Codex, tell the user which file to attach in Gmail); Send never does.
- `status`: always `draft` when you write it. It becomes `in-gmail-drafts` (a Gmail draft exists; the user hasn't sent it yet), `sent`, or `discarded`. When it becomes `sent`, add a header line `sent: YYYY-MM-DD` (the real local date the user sent it) and move the file to `outbox/sent/`; discarded files go to `outbox/discarded/`. Never change a `sent` file otherwise. Files starting with `_` are examples (a full example is in `templates/examples/outbox-example.md`).
