# Writes out/trailer.srt from src/vo.json, with the same timing rules as src/Trailer.tsx (LEAD, TAIL, shot minimums).
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
FPS, LEAD, TAIL = 30, 0.45, 0.6
src = (root / 'src/Trailer.tsx').read_text()
mins = [float(m) for m in re.findall(r"min: ([0-9.]+)", src)]
lines = json.loads((root / 'src/vo.json').read_text())['lines']
def ts(sec):
    ms = round(sec * 1000); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
t, out = 0.0, []
for i, mn in enumerate(mins):
    line = lines[i] if i < len(lines) else None
    frames = round(max(mn, LEAD + line['seconds'] + TAIL if line else 0) * FPS)
    if line:
        a = t + round(LEAD * FPS) / FPS
        out.append(f"{len(out)+1}\n{ts(a)} --> {ts(a + line['seconds'])}\n{line['text'].rstrip('.') if line['text'].endswith('...') else line['text']}\n")
    t += frames / FPS
(root / 'out/trailer.srt').write_text("\n".join(out))
print(f"wrote out/trailer.srt, {len(out)} captions, total {t:.2f}s")
