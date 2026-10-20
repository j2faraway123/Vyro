"""Writes the two test tones the stand-in YouTube Music page plays."""
import math
import struct
import sys
import wave
from pathlib import Path

out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent)
for name, freq in [("a.wav", 330), ("b.wav", 440)]:
    with wave.open(str(out / name), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(22050)
        w.writeframes(b"".join(struct.pack("<h", int(3000 * math.sin(2 * math.pi * freq * i / 22050))) for i in range(22050 * 90)))
