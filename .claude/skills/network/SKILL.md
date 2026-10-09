---
name: network
description: "Find people for the user to talk to at a company and draft outreach (informational interview asks, referral requests, alumni notes, recruiter messages). Use when the user asks who to contact, wants a referral, or wants to reach out to someone."
---

# /network

Usage: `/network <company, person, or job folder>` (or just ask in plain English).

Target: `$ARGUMENTS`.

1. **Who.** Check `contacts/contacts.csv` first (people the user already knows, from `/import-linkedin` or prior chats). Then suggest the kinds of people to find, best first:
   1. Former colleagues/managers (for students, co-op/internship colleagues too) who now work there or know someone there. People the user hasn't spoken to in years count; acquaintances often help more than close friends.
   2. Alumni of the user's school at the company (search tip: on LinkedIn, the company's "People" tab → filter by the school named in `profile/master-resume.md`)
   3. People in the target team (title search: the target role title + company)
   4. The recruiter for the posting
   For senior and specialist roles, also **executive search firms and agency recruiters** (headhunters) who place people in the user's field: they work for the employer, never charge the candidate (a fee request is a scam signal), and want a short, specific note with target roles, level and location. Ask the user to say which firm sent them to which employer, so the same job isn't submitted twice through two routes.
   Use public web search to find names and titles where possible. Never browse LinkedIn for the user or log in. Give them the search steps to do themselves, and they paste back what they find. Suggest 2–3 people per company rather than one: most people won't answer, and that's normal, not personal.
2. **Draft the message** (see `references/outreach-examples.md` for the shape and length of each type) into `outbox/` as a file (format in AGENTS.md "Outbox"), `channel: linkedin` or `email`:
   - LinkedIn connection note (`kind: connection-note`): **≤ 200 characters** (free accounts; personalized invites are limited each month, so use them on people who matter). Who the user is, the shared link (school, past employer, same field), one specific ask. For someone they're already connected to, use `kind: message` (≤ ~600 characters).
   - Informational interview email: under 100 words. Shared link first; no mention of jobs or referrals; a general interest (their path, their team's work); the ask as a question; more about them than the user. Subject line specific (e.g. "Fellow Example State alum, question about product marketing at Acme"), offer 2 time windows, easy to say no to.
   - Referral ask: only after a conversation, or with a warm contact. Include the job link and a 2-line pitch they can forward.
   - Recruiter (or likely hiring manager) message: once the user has applied or is about to. Role title and job ID, two lines of fit, one question (right person? next steps?). Never "what jobs do you have?"
   - Run `truth-checker`, then `voice-editor`, on the draft.
3. **Track:** add the person if new (`status=to-contact`, `job` if it's about a specific posting); never lower an existing status. Nothing changes until the message is sent. Then, when the user has sent it (they say so, the Outbox panel reports it, or `sync-inbox` finds it in their Sent mail): follow the playbook rule "When the user sends someone a message". `touches` and `next_followup` are only for people who haven't answered yet (`to-contact`, `contacted`): a thank-you, update or referral ask to someone at `replied`, `talked` or `referred` sets `last_contact` only. Set `next_followup` to 5 business days after the send only for pure networking (blank once `touches` reaches 2: stop there); if the contact's job is `applied` or later, the job row's `next_action_date` owns the follow-up. Log the change in `history/activity.md`. In Claude Code the user can record the send, replies, conversations and referrals themselves on the `/contacts` board; a `[Contacts]` note tells you what changed. Don't re-apply a change the note already made. (Codex has no panels; there the `contacts` chat skill does the same.)
4. Remind them: no reply in 3 business days → fine to try a second person there; one bump to the first when the follow-up date comes; then move on, no hard feelings.
5. Before a conversation happens, offer 5 smart questions for that person and a 30-second intro for the user (`references/conversation-guide.md`, which also covers nervous networkers, career changers and experienced hires).

## Former managers (from `profile/master-resume.md`): the warmest path

Draft a short, specific note for each (one at a time, the user approves): what the user is doing now, what they're looking for (target role and earliest start from `profile/preferences.md`), and **one clear ask**: (a) is there an opening on their team or elsewhere in the company; (b) would they be a reference; (c) could they introduce the user to a hiring manager or recruiter. Offer to attach the resume (the user attaches it in Gmail; Outbox drafts can't carry files). Mark them `relationship=former-manager`. If the user is a student or new grad (`career_stage` in preferences), this includes co-op and internship managers, and the ask can be about new-grad roles.

## After a conversation (this is how chats become referrals)

1. **Within 24 hours:** draft a thank-you note into `outbox/` that mentions one specific thing they said, for the user to send. Log what was said in the contact's `notes`, set `status=talked` (unless already `referred`) and `touches=0`. (If the user pressed "We talked" on `/contacts`, the status is already set.)
2. **Ask "who else should I talk to?"** if the user didn't in the call; add any names as new contacts (`relationship` noted, `how_we_met` = "intro from <name>").
3. **Referral ask:** when a matching posting exists at their company (check `jobs/tracker.csv` and their careers page), draft a short ask 1–2 weeks after the chat: the job link and job ID, a 2-line pitch they can forward, and the user's resume. Outbox drafts carry no attachments: write "I'll attach my resume" only if the user will attach the PDF in Gmail themselves, and tell them which file (`jobs/<folder>/<Name>-Resume-<Company>.pdf`) when the draft is ready; otherwise offer to send it on request. Make it easy to say no.
4. **Close the loop:** when the user applies, interviews, or gets an answer, draft a one-line update and thanks into `outbox/` (run `truth-checker` and `voice-editor` on it) for the user to send themselves. People who referred them want to know.
5. Two unanswered touches → stop (`status=cold`) and move on.
