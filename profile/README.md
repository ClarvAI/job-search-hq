# Your profile

Your own files: master resume, stories, preferences, writing style, references, signature, page look, and the setup checklist the assistant keeps (`setup-progress.md`). They start as blank copies (from `templates/blank/profile/`) the first time you open this folder, and `/start` fills them in with you. Once you pick a look, `templates/` here holds your resume and cover-letter templates in that look (the old copy is kept as `<name>.previous.html` when an update rebuilds one).

These files are yours: they are not part of the app's download, git ignores them, and an update never changes them (apart from rebuilding those themed templates, as above). Back them up with `/my-data` ("back up my stuff").

For the assistant: show the user the exact change and get a yes before changing `master-resume.md` or `preferences.md`, and never copy, move, delete or rewrite files here with a shell command or script (AGENTS.md, "How to work").
