# Seeing in Pixels — Computer Vision Blog

An interactive educational blog about spatial filters and Canny edge detection, built for CS students.

## Files

```
cv-blog/
├── index.html   — HTML structure (all 4 parts)
├── style.css    — Design system, layout, typography
├── script.js    — All interactive logic (convolution animator, filter explorer, Canny pipeline)
└── README.md    — This file
```

## Deploying to GitHub Pages

1. Create a new GitHub repo (e.g. `cv-blog`)
2. Copy these three files into the repo root
3. Go to **Settings → Pages → Branch: main / root** → Save
4. Your blog will be live at `https://<your-username>.github.io/cv-blog/`

## Adding your own image (optional)

In `script.js`, find the line:
```js
const IMG_SRC = '__LIZARD_PLACEHOLDER__';
```

Replace with either:
- A relative path: `const IMG_SRC = 'lizard.jpg';` (and put `lizard.jpg` in the repo root)
- An absolute URL: `const IMG_SRC = 'https://your-cdn.com/image.jpg';`
- A base64 data URI (for self-contained deployment)

If `IMG_SRC` stays as the placeholder, the "Image" sample will fail silently — the other 4 drawn samples (Portrait, Textures, Architecture, Cityscape) will work fine without any image file.

## Structure

| Part | ID | Content |
|------|----|---------|
| 0 | `#part0` | Convolution animator — sliding kernel on a numeric grid |
| 1 | `#part1` | Filter explorer — draw and apply 6 classic kernels with worked examples |
| 2 | `#part2` | Canny pipeline — step through 4 stages with narrative |
| 3 | `#part3` | Hyperparameter tuning — interactive sliders + presets |

## Design

- **Typography**: Syne (display/UI) + Instrument Serif (italic accents) + DM Mono (equations, labels)
- **Palette**: Paper warm (#f4efe6) / Ink (#0e0e0e) / Accent red (#ff4822)
- **Theme**: Editorial × Scientific — grain texture, scanlines, generous whitespace, precise monospace labels

## No dependencies

Zero build steps, zero npm, zero frameworks. Pure HTML + CSS + JS. Runs as static files.
