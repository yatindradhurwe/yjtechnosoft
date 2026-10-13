# YJ Technosoft – Company & Founder Profiles

| File | What it is |
|------|------------|
| `company-profile.pdf` | 18-page Corporate Capability Profile (navy · white · champagne gold) |
| `founder-profile.pdf` | 2-page personal profile of the founder / director |
| `*.html`, `profile.css` | Editable source. Edit these, then rebuild the PDFs |

## Before issuing

Every highlighted yellow box (`<span class="tbc">…</span>`) is information that still has to be supplied or confirmed: director name, CGP Digital role and year, client names and years per project, supported integrations, AI features (only if delivered), certifications (only if held).
Striped boxes are screenshot placeholders. Replace each one with a redacted screenshot or one that uses sample data, e.g.
`<img src="assets/cgp-complaint.png" style="width:100%;height:62mm;object-fit:cover;border-radius:1.5mm">`.

Search for what is left: `grep -n 'class="tbc' *.html`

## Rebuild the PDFs

```bash
cd profile
chromium --headless --no-sandbox --allow-file-access-from-files --no-pdf-header-footer \
  --print-to-pdf="$PWD/company-profile.pdf" "file://$PWD/company-profile.html"
chromium --headless --no-sandbox --allow-file-access-from-files --no-pdf-header-footer \
  --print-to-pdf="$PWD/founder-profile.pdf" "file://$PWD/founder-profile.html"
```

Or open the HTML in Chrome and use **Print › Save as PDF** (A4, margins *None*, *Background graphics* on).
