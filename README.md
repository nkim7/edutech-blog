# Seeing in Pixels — Computer Vision Blog

An interactive educational blog about spatial filters and Canny edge detection, built for CS students.

## Files

```
cv-blog/
├── index.html   — HTML structure (all 6 sections)
├── style.css    — Design system, layout, typography
├── script.js    — All interactive logic (convolution animator, filter explorer, Canny pipeline)
└── README.md    — This file
```

## Deploying to GitHub Pages

1. Create a new GitHub repo (e.g. `cv-blog`)
2. Copy these three files into the repo root
3. Go to **Settings → Pages → Branch: main / root** → Save
4. Your blog will be live at `https://<your-username>.github.io/cv-blog/`

## Structure

| Section | ID | Content |
|---------|----|---------|
| 01 | `#part0` | Convolution — animate a sliding kernel on a numeric grid |
| 02 | `#part1` | Spatial Filters — draw and apply 6 classic kernels with worked examples |
| 03 | `#part2` | Non-Maximum Suppression — thin gradient responses to local maxima |
| 04 | `#part3` | Double Thresholding — classify strong, weak, and discarded responses |
| 05 | `#part4` | Canny Edge Detection — step through the 5-stage pipeline |
| 06 | `#part5` | Hyperparameter Tuning — adjust the Canny parameters and compare edge maps |

## Design

- **Typography**: Unbounded (display) + Inter (body/UI) + system monospace (equations, labels)
- **Palette**: White background / dark ink / blue accent
- **Theme**: Minimal scientific explainer with interactive canvases

## No dependencies

Zero build steps, zero npm, zero frameworks. Pure HTML + CSS + JS. Runs as static files.
