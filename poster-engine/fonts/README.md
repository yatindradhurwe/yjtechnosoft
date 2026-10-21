Put the TTF/OTF files of every font family that templates reference here (for example Poppins,
Montserrat, Mukta, Hind, Baloo 2, Noto Sans Tamil). The Dockerfile copies them into the worker
image and rebuilds the font cache. Use only fonts whose licence allows embedding in generated
images (SIL OFL fonts from Google Fonts are fine).
