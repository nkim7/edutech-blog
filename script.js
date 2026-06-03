/* ═══════════════════════════════════════════
   SEEING IN PIXELS — SCRIPT.JS
   All interactive logic for the CV blog
═══════════════════════════════════════════ */

/* ──────────────────────────────────────────
   HERO CANVAS: live Canny-like animation
────────────────────────────────────────── */
(function initHero() {
  const cv = document.getElementById('heroCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  let W, H, pts = [], t = 0;
  function resize() {
    W = cv.width = cv.offsetWidth * devicePixelRatio;
    H = cv.height = cv.offsetHeight * devicePixelRatio;
    pts = Array.from({length: 80}, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * .4,
      vy: (Math.random() - .5) * .4,
      r: 1.5 + Math.random() * 2
    }));
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    // Scanlines
    ctx.strokeStyle = 'rgba(14,14,14,.04)';
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 4) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // Moving particles connected by edges
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    });
    ctx.strokeStyle = 'rgba(180,168,212,.22)';
    ctx.lineWidth = .7;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i+1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < W * .12) {
          ctx.globalAlpha = (1 - d/(W*.12)) * .55;
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    pts.forEach(p => {
      ctx.fillStyle = 'rgba(212,160,32,.85)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * devicePixelRatio, 0, Math.PI*2);
      ctx.fill();
    });
    t++;
    requestAnimationFrame(draw);
  }
  resize();
  window.addEventListener('resize', resize);
  draw();
})();

/* ──────────────────────────────────────────
   SECTION 01: CONVOLUTION ANIMATOR
────────────────────────────────────────── */
let animData = {}, playing = false, playTimer = null, curPos = 0, totalPos = 0;

function buildInputMatrix(n) {
  const m = [];
  for (let r = 0; r < n; r++) {
    m.push([]);
    for (let c = 0; c < n; c++) {
      m[r].push(Math.round((r + c) / (2 * (n - 1)) * 4) * 2);
    }
  }
  return m;
}

function getKernel(ks) {
  const weight = 1 / (ks * ks);
  const note = ks === 1
    ? '1×1 window: degenerate case — sees one pixel at a time, so there is no neighbourhood averaging.'
    : 'Each output is a local average computed with a uniform kernel.';
  return { k: Array(ks * ks).fill(weight), label: `${ks}×${ks} averaging blur — each weight is 1/${ks * ks}. ${note}` };
}

function checkImpossible() {
  const n = +document.getElementById('inSize').value;
  const ks = +document.getElementById('ks').value;
  const stride = +document.getElementById('stride').value;
  const pad = +document.getElementById('padding').value;
  const notice = document.getElementById('impossibleNotice');
  const txt = document.getElementById('impossibleText');

  const paddedSize = pad > 0 ? n + ks - 1 : n;
  const outs = Math.floor((paddedSize - ks) / stride) + 1;

  if (ks > n && pad === 0) {
    notice.style.display = 'flex';
    txt.textContent = `Impossible: window (${ks}×${ks}) is larger than the input (${n}×${n}) with no padding. The window cannot fit anywhere inside the input. Either increase the input size, reduce the window size, or enable zero-padding.`;
    return false;
  }
  if (outs <= 0) {
    notice.style.display = 'flex';
    txt.textContent = `Impossible: stride ${stride} is too large for this input/window combination — there are no valid positions. The output would have 0×0 dimensions. Reduce the stride or increase the input size.`;
    return false;
  }
  notice.style.display = 'none';
  return true;
}

function getPaddedMatrix(mat, n, ks, pad) {
  if (pad === 0) return { matrix: mat, before: 0, after: 0 };
  const totalPadding = ks - 1;
  const before = Math.floor(totalPadding / 2);
  const after = totalPadding - before;
  const big = [];
  for (let r = 0; r < n + before + after; r++) {
    big.push([]);
    for (let c = 0; c < n + before + after; c++) {
      big[r].push((r < before || r >= n + before || c < before || c >= n + before) ? 0 : mat[r-before][c-before]);
    }
  }
  return { matrix: big, before, after };
}

function rebuildAnim() {
  if (!checkImpossible()) return;
  const n = +document.getElementById('inSize').value;
  const ks = +document.getElementById('ks').value;
  const stride = +document.getElementById('stride').value;
  const pad = +document.getElementById('padding').value;
  const mat = buildInputMatrix(n);
  const { k, label } = getKernel(ks);
  const { matrix: padMat, before: padBefore, after: padAfter } = getPaddedMatrix(mat, n, ks, pad);
  const pn = padMat.length;
  const outs = Math.floor((pn - ks) / stride) + 1;
  totalPos = outs * outs;
  animData = { n, ks, stride, pad, padBefore, padAfter, mat, padMat, pn, outs, k, label };
  curPos = 0;
  const slider = document.getElementById('posSlider');
  slider.max = Math.max(0, totalPos - 1);
  slider.value = 0;
  updatePosLabel();
  renderKernelDisplay(k, ks, label);
  document.getElementById('inputSizeLabel').textContent = pad > 0 ? `${n}×${n} + padding` : `${n}×${n}`;
  stopPlay();
  document.getElementById('animNote').textContent =
    'The input numbers form a simple diagonal brightness ramp, making the averaging effect easier to see. Choose settings and press Play, or drag the slider.';
  drawAnimCanvases(0); // shows position 0 with computation immediately
}

const CELL_MAX = 60, CELL_MIN = 28;
function cellSz(n) { return Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor(260 / n))); }

function kCellColor(v, mx) {
  const t = mx > 0 ? Math.abs(v) / mx : 0;
  if (v > 0) return { bg: `rgba(28,109,255,${(0.12 + t*0.6).toFixed(2)})`, col: '#1048a0' };
  if (v < 0) return { bg: `rgba(255,72,34,${(0.12 + t*0.6).toFixed(2)})`, col: '#a02010' };
  return { bg: 'rgba(14,14,14,0.06)', col: '#6e6860' };
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10000) / 10000);
}

function formatKernelWeight(value, ks) {
  if (Math.abs(value - 1 / (ks * ks)) < 0.00001) return `1/${ks * ks}`;
  return formatNumber(value);
}

function clampPixel(value) {
  return Math.round(Math.min(255, Math.max(0, value)));
}

function intensityLum(value, maxValue) {
  return 92 - (value / (maxValue || 1)) * 76;
}

function renderKernelDisplay(k, ks, label) {
  const g = document.getElementById('kernelDisplay');
  g.style.gridTemplateColumns = `repeat(${ks}, 36px)`;
  g.innerHTML = '';
  const mx = Math.max(...k.map(Math.abs));
  k.forEach(v => {
    const { bg, col } = kCellColor(v, mx);
    const d = document.createElement('div');
    d.className = 'kernel-cell';
    d.style.cssText = `width:36px;height:30px;background:${bg};color:${col}`;
    d.textContent = formatKernelWeight(v, ks);
    g.appendChild(d);
  });
  document.getElementById('kernelOpLabel').textContent = '';
  const note = document.getElementById('kernelDescNote');
  if (note) note.textContent = label;
}

function renderWindowDisplay(values, ks) {
  const g = document.getElementById('windowDisplay');
  g.style.gridTemplateColumns = `repeat(${ks}, 36px)`;
  g.innerHTML = '';
  const mx = Math.max(...animData.mat.flat()) || 1;
  values.forEach(v => {
    const d = document.createElement('div');
    const lum = intensityLum(v, mx);
    d.className = 'kernel-cell';
    d.style.cssText = `width:36px;height:30px;background:hsl(0,0%,${lum}%);color:${lum > 58 ? '#111827' : '#f9fafb'}`;
    d.textContent = v;
    g.appendChild(d);
  });
}

function drawAnimCanvases(pos) {
  const { padMat, pn, ks, stride, outs, k, pad, padBefore, padAfter } = animData;
  if (!padMat) return;
  const cs = cellSz(pn);
  const W = pn * cs, H = pn * cs;
  const cvIn = document.getElementById('animIn');
  cvIn.width = W; cvIn.height = H;
  cvIn.style.width = Math.min(W, 320) + 'px';
  cvIn.style.height = Math.min(H, 320) + 'px';
  const ctxIn = cvIn.getContext('2d');
  ctxIn.clearRect(0, 0, W, H);
  const r0 = Math.floor(pos / outs) * stride;
  const c0 = (pos % outs) * stride;

  const maxInput = Math.max(...padMat.flat()) || 1;
  for (let r = 0; r < pn; r++) {
    for (let c = 0; c < pn; c++) {
      const v = padMat[r][c];
      const isPad = pad > 0 && (r < padBefore || r >= pn - padAfter || c < padBefore || c >= pn - padAfter);
      if (isPad) {
        ctxIn.fillStyle = 'rgba(28,109,255,0.12)';
      } else {
        const lum = intensityLum(v, maxInput);
        ctxIn.fillStyle = `hsl(0,0%,${lum}%)`;
      }
      ctxIn.fillRect(c*cs, r*cs, cs-1, cs-1);
      const lum = intensityLum(v, maxInput);
      ctxIn.fillStyle = isPad ? '#1d4ed8' : (lum > 58 ? '#111827' : '#f9fafb');
      ctxIn.font = `bold ${cs > 38 ? 11 : 9}px "DM Mono",monospace`;
      ctxIn.textAlign = 'center'; ctxIn.textBaseline = 'middle';
      ctxIn.fillText(isPad ? '0' : v, c*cs + cs/2, r*cs + cs/2);
    }
  }
  // Active window border
  ctxIn.strokeStyle = '#ff4822';
  ctxIn.lineWidth = 2.5;
  ctxIn.strokeRect(c0*cs+1, r0*cs+1, ks*cs-2, ks*cs-2);

  // Output canvas
  const csO = cellSz(outs);
  const WO = outs*csO, HO = outs*csO;
  const cvOut = document.getElementById('animOut');
  cvOut.width = WO; cvOut.height = HO;
  cvOut.style.width = Math.min(WO, 320) + 'px';
  cvOut.style.height = Math.min(HO, 320) + 'px';
  const ctxO = cvOut.getContext('2d');
  ctxO.fillStyle = 'rgba(14,14,14,0.04)';
  ctxO.fillRect(0, 0, WO, HO);

  for (let p = 0; p <= pos; p++) {
    const or = Math.floor(p / outs);
    const oc2 = p % outs;
    const pr = or * stride, pc = oc2 * stride;
    let sum = 0;
    for (let ki = 0; ki < ks; ki++) {
      for (let kj = 0; kj < ks; kj++) {
        const gv = (padMat[pr+ki] && padMat[pr+ki][pc+kj] !== undefined) ? padMat[pr+ki][pc+kj] : 0;
        sum += gv * k[ki*ks + kj];
      }
    }
    const val = clampPixel(sum);
    const lum = intensityLum(val, maxInput);
    ctxO.fillStyle = `hsl(0,0%,${lum}%)`;
    ctxO.fillRect(oc2*csO, or*csO, csO-1, csO-1);
    ctxO.fillStyle = lum > 58 ? '#222' : '#ddd';
    ctxO.font = `bold ${csO > 38 ? 11 : 9}px "DM Mono",monospace`;
    ctxO.textAlign = 'center'; ctxO.textBaseline = 'middle';
    ctxO.fillText(val, oc2*csO + csO/2, or*csO + csO/2);
  }
  // Current output highlight
  const cr2 = Math.floor(pos / outs), cc2 = pos % outs;
  ctxO.strokeStyle = '#ff4822';
  ctxO.lineWidth = 2.5;
  ctxO.strokeRect(cc2*csO+1, cr2*csO+1, csO-2, csO-2);

  updateCalcDisplay(pos);
}

function updateCalcDisplay(pos) {
  const { padMat, ks, stride, outs, k } = animData;
  if (!padMat) return;
  const r0 = Math.floor(pos / outs) * stride;
  const c0 = (pos % outs) * stride;
  const terms = [];
  let sum = 0;
  const windowVals = [];
  for (let ki = 0; ki < ks; ki++) {
    for (let kj = 0; kj < ks; kj++) {
      const gv = (padMat[r0+ki] && padMat[r0+ki][c0+kj] !== undefined) ? padMat[r0+ki][c0+kj] : 0;
      const kv = k[ki*ks + kj];
      windowVals.push(gv);
      if (kv !== 0) {
        terms.push(`${gv}×${formatKernelWeight(kv, ks)}`);
      }
      sum += gv * kv;
    }
  }
  renderWindowDisplay(windowVals, ks);
  const clamped = clampPixel(sum);
  const raw = Math.round(sum * 10000) / 10000;
  const shown = terms.join(' + ') || '0';
  document.getElementById('animCalc').textContent = shown;
  document.getElementById('animResult').textContent = clamped;
  const or = Math.floor(pos / outs), oc = pos % outs;
  const adj = raw < 0 || raw > 255 ? ' · clamped to [0, 255]' : (raw !== clamped ? ' · rounded' : '');
  document.getElementById('animResultSub').textContent = `out[${or}][${oc}]${adj}`;
  document.getElementById('animNote').textContent =
    `Window at input rows ${r0}–${r0+animData.ks-1}, cols ${c0}–${c0+animData.ks-1}. The sum is written to output [${or},${oc}].`;

}

function seekAnim(pos) {
  if (!animData.padMat) return;
  curPos = +pos;
  updatePosLabel();
  drawAnimCanvases(curPos);
}
function updatePosLabel() {
  document.getElementById('posLabel').textContent = `${curPos+1} / ${totalPos||1}`;
}
function togglePlay() {
  if (playing) stopPlay(); else startPlay();
}
function startPlay() {
  if (!animData.padMat) { rebuildAnim(); return; }
  if (curPos >= totalPos - 1) { curPos = 0; document.getElementById('posSlider').value = 0; }
  playing = true;
  document.getElementById('playIcon').textContent = '⏸';
  tick();
}
function stopPlay() {
  playing = false; clearTimeout(playTimer);
  document.getElementById('playIcon').textContent = '▶';
}
function tick() {
  if (!playing) return;
  drawAnimCanvases(curPos);
  document.getElementById('posSlider').value = curPos;
  updatePosLabel();
  if (curPos < totalPos - 1) {
    curPos++;
    playTimer = setTimeout(tick, 1000);
  } else {
    stopPlay();
    document.getElementById('animNote').textContent = 'Complete — all output positions computed. Reset to run again.';
  }
}
function resetAnim() { stopPlay(); rebuildAnim(); }

// Wire controls
['inSize','ks','stride','padding'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => { rebuildAnim(); });
});
document.getElementById('posSlider').addEventListener('input', e => seekAnim(+e.target.value));

/* ──────────────────────────────────────────
   SECTION 02: FILTER EXPLORER
────────────────────────────────────────── */
const dc = document.getElementById('dc');
const oc = document.getElementById('oc');
const dctx = dc.getContext('2d');
const octx = oc.getContext('2d');
let BS = 10, drawing = false, curF = 'blur';

const FILTERS = {
  blur: {
    label: 'Gaussian blur',
    k: [1,2,1,2,4,2,1,2,1], div: 16, kl: 'Gaussian ≈ 3×3 · normalized by 1/16',
    desc: 'Smooths the image before detecting edges. This weighted neighbourhood average approximates a 2D Gaussian: all weights are positive and sum to 1, with the centre contributing most. Gaussian blur is separable, so implementations often compute it as two 1D passes.',
    eq: 'G_σ(x,y) = (1/(2πσ²))·exp(−(x²+y²)/(2σ²))\n\n≈  discrete 3×3 kernel (σ ≈ 0.85):\n\n   | 1  2  1 |\n   | 2  4  2 |  ÷ 16\n   | 1  2  1 |',
    exPatch: [[0,0,0,0],[0,160,0,0],[0,0,0,0],[0,0,0,0]],
    exNote: 'A single bright pixel spreads into nearby outputs because each overlapping window computes a weighted average.'
  },
  sobel: {
    label: 'Sobel',
    kd:  [-1,0,1,-2,0,2,-1,0,1], kd2: [-1,-2,-1,0,0,0,1,2,1],
    kl: 'Sobel X + Y → |∇I| = √(Gx²+Gy²)',
    desc: 'Sobel X measures horizontal intensity change, ∂I/∂x, and is sensitive to vertical edges. Sobel Y measures vertical intensity change, ∂I/∂y, and is sensitive to horizontal edges. Canny combines them as |∇I| = √(Gx² + Gy²). This drawing demo uses a white-paper convention; later pipeline views use bright edges on a dark background.',
    eq: 'Gx = I * k_x\nGy = I * k_y\n|∇I| = √(Gx² + Gy²)\nθ  = atan2(Gy, Gx)',
    exPatch: [[10,10,10,50],[10,10,10,50],[10,10,10,50],[10,10,10,50]],
    exNote: 'The left windows span a flat region — Gx and Gy cancel to ~0. The right windows cross a vertical boundary, producing a large Gx and therefore a large gradient magnitude.'
  },
  laplacian: {
    label: 'Laplacian',
    group: 'explore',
    k: [0,1,0,1,-4,1,0,1,0], kl: 'Laplacian (3×3)',
    desc: 'The Laplacian is a second-derivative filter that responds to curvature in the intensity surface. In the full signed response, zero-crossings can indicate edge centres. This simplified display shows response strength, not the full signed zero-crossing structure. It is noise-sensitive, so it is often paired with Gaussian blur.',
    eq: '∇²I = ∂²I/∂x² + ∂²I/∂y²\n\n        = I *  | 0   1   0 |\n               | 1  -4   1 |\n               | 0   1   0 |',
    exPatch: [[20,20,20,20],[20,100,20,20],[20,20,20,20],[20,20,20,20]],
    exNote: 'An isolated bright pixel differs sharply from its neighbours, so the second derivative responds around that point.'
  },
  sharpen: {
    label: 'Sharpen',
    group: 'explore',
    k: [0,-1,0,-1,5,-1,0,-1,0], kl: 'Unsharp mask (3×3)',
    desc: 'Identity minus a scaled Laplacian: I − α∇²I with α=1. It amplifies local contrast, making edges appear crisper. The centre weight 5 boosts the pixel relative to its neighbours.',
    eq: 'S = I − α∇²I  (α = 1)\n\n  = I *  |  0  -1   0 |\n         | -1   5  -1 |\n         |  0  -1   0 |',
    exPatch: [[30,30,90,90],[30,30,90,90],[30,30,90,90],[30,30,90,90]],
    exNote: 'Across the boundary, sharpening darkens the darker side and brightens the lighter side, increasing local contrast.'
  },
  emboss: {
    label: 'Emboss',
    group: 'explore',
    k: [-2,-1,0,-1,1,1,0,1,2], kl: 'Emboss (3×3)',
    desc: 'Emboss is a directional relief effect, not a pure derivative edge detector. Negative weights on the top-left subtract and positive weights on the bottom-right add. The shifted response puts undrawn white background areas near mid-gray; drawn regions and edges may become lighter or darker.',
    eq: 'E = I * k_emb + 128',
    exPatch: [[0,0,0,0],[0,20,0,0],[0,0,0,0],[0,0,0,0]],
    exNote: 'The single 20 lands on a different kernel weight as the window slides. The +128 offset makes positive responses lighter than the middle gray and negative responses darker.'
  },
  identity: {
    label: 'Identity',
    group: 'explore',
    k: [0,0,0,0,1,0,0,0,0], kl: 'Identity (3×3)',
    desc: 'The centre weight is 1 and every other weight is 0, so each output copies the centre input pixel. The image stays unchanged, making this a useful pipeline baseline.',
    eq: 'I * identity = I',
    exPatch: [[10,20,30,40],[50,60,70,80],[90,100,110,120],[130,140,150,160]],
    exNote: 'Identity copies the centre pixel of each window unchanged. The four outputs are the four interior input values.'
  }
};

function buildFilterPills() {
  const c = document.getElementById('fpills');
  c.innerHTML = '';

  const mkLabel = text => {
    const s = document.createElement('span');
    s.className = 'filter-group-label';
    s.textContent = text;
    c.appendChild(s);
  };
  const mkPill = id => {
    const f = FILTERS[id];
    const p = document.createElement('button');
    p.className = 'pill' + (id === curF ? ' on' : '');
    p.id = 'filter-' + id;
    p.dataset.filter = id;
    p.textContent = f.label;
    p.onclick = () => selectFilter(id);
    c.appendChild(p);
  };

  mkLabel('Used in Canny:');
  mkPill('blur');
  mkPill('sobel');
  mkLabel('Explore:');
  Object.entries(FILTERS).forEach(([id, f]) => { if (f.group) mkPill(id); });
}

function selectFilter(id) {
  curF = id;
  document.querySelectorAll('#fpills .pill').forEach(p => p.classList.toggle('on', p.dataset.filter === id));
  const f = FILTERS[id];

  // Primary kernel
  const lbl = document.getElementById('kgrid-label');
  if (lbl) lbl.textContent = f.kd2 ? 'Kernel X' : 'Kernel';
  renderFilterKernel(f.kd || f.k, 3, f.kl);

  // Second kernel (Sobel Y only)
  const wrap2 = document.getElementById('kgrid2-wrap');
  if (wrap2) {
    if (f.kd2) {
      wrap2.style.display = '';
      renderFilterKernel2(f.kd2, 3);
    } else {
      wrap2.style.display = 'none';
    }
  }

  document.getElementById('fdesc').textContent = f.desc;
  document.getElementById('p1-outlabel').textContent = 'Output';
  document.getElementById('sobelDisplayConvention').style.display = id === 'sobel' ? '' : 'none';
  renderCalcExample(id, f);
  applyFilter();
}

function renderFilterKernel2(k, ks) {
  const g = document.getElementById('kgrid2');
  if (!g) return;
  g.style.gridTemplateColumns = `repeat(${ks}, 34px)`;
  g.innerHTML = '';
  const mx = Math.max(...k.map(Math.abs));
  k.forEach(v => {
    const { bg, col } = kCellColor(v, mx);
    const d = document.createElement('div');
    d.className = 'kernel-cell';
    d.style.cssText = `width:34px;height:28px;background:${bg};color:${col}`;
    d.textContent = Number.isInteger(v) ? v : v.toFixed(2);
    g.appendChild(d);
  });
}

function renderFilterKernel(k, ks, label) {
  const g = document.getElementById('kgrid');
  g.style.gridTemplateColumns = `repeat(${ks}, 34px)`;
  g.innerHTML = '';
  const mx = Math.max(...k.map(Math.abs));
  k.forEach(v => {
    const { bg, col } = kCellColor(v, mx);
    const d = document.createElement('div');
    d.className = 'kernel-cell';
    d.style.cssText = `width:34px;height:28px;background:${bg};color:${col}`;
    d.textContent = Number.isInteger(v) ? v : v.toFixed(2);
    g.appendChild(d);
  });
  document.getElementById('klabel').textContent = label;
}

let calcExampleTimer = null;

function renderCalcExample(id, f, activeOutput = 0) {
  clearTimeout(calcExampleTimer);
  const el = document.getElementById('calcExample');
  el.innerHTML = '';
  const patch = f.exPatch;
  const k = f.kd || f.k;
  const div = f.div || 1;
  const isEmboss = id === 'emboss';
  const isGaussian = id === 'blur';

  // Dynamic cell sizes — computed from the actual container width so the row
  // always fits without a scrollbar, regardless of viewport or card size.
  const COL_GAP = 8;
  const containerW = el.offsetWidth || 560;
  // Available for 4 matrix columns: subtract 6 column-gaps, two operators
  // (~16px each), a minimum arrow width (64px), and left padding (4px).
  const matrixTotalW = Math.max(200, containerW - 4 - 6 * COL_GAP - 32 - 64);
  const S = Math.floor(matrixTotalW / 4); // equal target width per matrix block
  const C_IN = Math.min(24, Math.max(14, Math.floor((S - 9) / 4))); // 4×4 cell
  const C_K  = Math.min(28, Math.max(16, Math.floor((S - 6) / 3))); // 3×3 cell
  const C_2  = Math.min(36, Math.max(22, Math.floor((S - 3) / 2))); // 2×2 cell
  const GAP = 3;

  const windowColors = ['#f59e0b', '#3b82f6', '#10b981', '#a855f7'];
  const activeRow = Math.floor(activeOutput / 2);
  const activeCol = activeOutput % 2;

  const postNoteMap = {
    blur:      'divide by 16',
    laplacian: 'clip negatives to 0',
    emboss:    'add +128 offset',
    identity:  'no adjustment',
    sharpen:   'clamp to [0, 255]',
    sobel:     '√(Gx² + Gy²)'
  };
  const postNote = postNoteMap[id] || 'no adjustment';

  const calculateOutput = (outputIndex) => {
    const row = Math.floor(outputIndex / 2), col = outputIndex % 2;
    const flat = patch.slice(row, row + 3).flatMap(values => values.slice(col, col + 3));
    let sum = 0;
    flat.forEach((v, i) => sum += v * k[i]);
    const raw = sum / div;
    const shifted = raw + (isEmboss ? 128 : 0);
    return { sum, out: clampPixel(shifted) };
  };
  const outputs = [0, 1, 2, 3].map(calculateOutput);

  // ── Layout: 7-column CSS grid ─────────────────────────────────────
  const grid = document.createElement('div');
  grid.style.cssText = [
    'display:grid',
    'grid-template-columns:auto auto auto auto auto 1fr auto',
    'grid-template-rows:auto auto',
    `column-gap:${COL_GAP}px`,
    'row-gap:0',
    'align-items:center',
    'padding:0 0 6px 6px',
  ].join(';');

  // ── Cell helpers ──────────────────────────────────────────────────

  const mkLbl = (text) => {
    const d = document.createElement('div');
    d.className = 'comp-section-label';
    d.style.cssText = 'text-align:center;margin:0 0 .35rem;justify-self:center';
    d.textContent = text;
    return d;
  };
  const mkEmpty = () => document.createElement('div');

  const mkOpCell = (sym) => {
    const d = document.createElement('div');
    d.style.cssText = 'font-size:1.25rem;color:var(--gold);font-weight:700;text-align:center;justify-self:center;align-self:center;font-family:var(--mono)';
    d.textContent = sym;
    return d;
  };

  // 4×4 input — square cells → square panel
  const mkInputGrid = () => {
    const g = document.createElement('div');
    g.style.cssText = `display:inline-grid;grid-template-columns:repeat(4,${C_IN}px);gap:${GAP}px;position:relative;justify-self:center`;
    const mx = Math.max(...patch.flat()) || 1;
    patch.flat().forEach((v, index) => {
      const row = Math.floor(index / 4), cellCol = index % 4;
      const lum = Math.round(92 - v / mx * 76);
      const d = document.createElement('div');
      d.style.cssText = `width:${C_IN}px;height:${C_IN}px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:11px;font-weight:700;border-radius:3px;background:hsl(0,0%,${lum}%);color:${lum > 58 ? '#111827' : '#f9fafb'}`;
      if (row < activeRow || row >= activeRow + 3 || cellCol < activeCol || cellCol >= activeCol + 3) d.style.opacity = '.35';
      d.textContent = v;
      g.appendChild(d);
    });
    [0,1,2,3].forEach(oi => {
      const row = Math.floor(oi / 2), col = oi % 2;
      const outline = document.createElement('div');
      outline.className = 'calc-window-outline' + (oi === activeOutput ? ' on' : '');
      // -2px offsets extend the outline 2px outside the 3×3 window area;
      // the 6px grid padding-left ensures these are not clipped.
      outline.style.cssText = `left:${col*(C_IN+GAP)-2}px;top:${row*(C_IN+GAP)-2}px;width:${3*C_IN+2*GAP+4}px;height:${3*C_IN+2*GAP+4}px;border-color:${windowColors[oi]}`;
      g.appendChild(outline);
    });
    return g;
  };

  // 3×3 kernel — square cells → square panel; always shows raw integer weights
  const mkKernelGrid = () => {
    const mx = Math.max(...k.map(Math.abs)) || 1;
    const g = document.createElement('div');
    g.style.cssText = `display:inline-grid;grid-template-columns:repeat(3,${C_K}px);gap:${GAP}px`;
    k.forEach(v => {
      const { bg, col } = kCellColor(v, mx);
      const d = document.createElement('div');
      d.style.cssText = `width:${C_K}px;height:${C_K}px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:12px;font-weight:600;border-radius:3px;background:${bg};color:${col}`;
      d.textContent = Number.isInteger(v) ? v : v.toFixed(2);
      g.appendChild(d);
    });
    return g;
  };

  // 2×2 filter response — square cells → square panel; signed coloring
  const mkFRGrid = (values) => {
    const mx = Math.max(...values.map(Math.abs)) || 1;
    const g = document.createElement('div');
    g.style.cssText = `display:grid;grid-template-columns:repeat(2,${C_2}px);gap:${GAP}px;justify-self:center`;
    values.forEach(v => {
      const { bg, col } = kCellColor(v, mx);
      const d = document.createElement('div');
      d.style.cssText = `width:${C_2}px;height:${C_2}px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:13px;font-weight:700;border-radius:3px;background:${bg};color:${col}`;
      d.textContent = Number.isInteger(v) ? v : v.toFixed(1);
      g.appendChild(d);
    });
    return g;
  };

  // 2×2 output — square cells → square panel; colored border per window
  const mkOutputGrid = (values) => {
    const g = document.createElement('div');
    g.style.cssText = `display:grid;grid-template-columns:repeat(2,${C_2}px);gap:${GAP}px;justify-self:center`;
    values.forEach((v, i) => {
      const lum = Math.round(92 - v / 255 * 76);
      const d = document.createElement('div');
      d.className = 'calc-output-cell' + (i === activeOutput ? ' on' : '');
      d.style.setProperty('--window-color', windowColors[i]);
      d.style.setProperty('--output-lum', `${lum}%`);
      d.style.cssText += `;width:${C_2}px;height:${C_2}px;font-size:13px`;
      d.style.color = v < 115 ? '#111827' : '#f9fafb';
      d.textContent = v;
      g.appendChild(d);
    });
    return g;
  };

  // Arrow — line + note stacked in one cell; the note sits directly under
  // the arrowhead so it reads as attached to the transformation.
  const mkArrowLine = () => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;align-self:center;width:100%;gap:3px';
    const arrowRow = document.createElement('div');
    arrowRow.style.cssText = 'display:flex;align-items:center;width:100%';
    const line = document.createElement('div');
    line.style.cssText = 'flex:1;height:2px;background:var(--border-med)';
    const tip = document.createElement('span');
    tip.textContent = '▶';
    tip.style.cssText = 'color:var(--border-med);font-size:.6rem;flex-shrink:0';
    arrowRow.appendChild(line);
    arrowRow.appendChild(tip);
    const note = document.createElement('div');
    note.style.cssText = 'font-size:.64rem;color:var(--muted);font-family:var(--mono);white-space:normal;word-break:break-word;text-align:center;line-height:1.3';
    note.textContent = postNote;
    wrap.appendChild(arrowRow);
    wrap.appendChild(note);
    return wrap;
  };

  // ── Assemble ──────────────────────────────────────────────────────
  const frVals  = outputs.map(o => o.sum);
  const outVals = outputs.map(o => o.out);

  // Row 1 — labels
  grid.appendChild(mkLbl('INPUT (4×4)'));
  grid.appendChild(mkEmpty());
  grid.appendChild(mkLbl('KERNEL (3×3)'));
  grid.appendChild(mkEmpty());
  grid.appendChild(mkLbl('FILTER RESPONSE'));
  grid.appendChild(mkEmpty());
  grid.appendChild(mkLbl('OUTPUT'));

  // Row 2 — all content; each cell vertically centered at the same axis
  grid.appendChild(mkInputGrid());
  grid.appendChild(mkOpCell('*'));   // plain asterisk per spec
  grid.appendChild(mkKernelGrid());
  grid.appendChild(mkOpCell('='));
  grid.appendChild(mkFRGrid(frVals));
  grid.appendChild(mkArrowLine());
  grid.appendChild(mkOutputGrid(outVals));

  el.appendChild(grid);

  calcExampleTimer = setTimeout(() => {
    if (curF === id) renderCalcExample(id, f, (activeOutput + 1) % 4);
  }, 1200);
}

function applyFilter() {
  const f = FILTERS[curF];
  if (curF === 'sobel') { sobelCanvas(dc, oc); return; }
  convCanvas(dc, oc, f.k, f.div || 1, curF === 'emboss');
}

function sobelCanvas(src, dst) {
  const w = src.width, h = src.height;
  const inp = src.getContext('2d').getImageData(0,0,w,h);
  const out = dst.getContext('2d').createImageData(w, h);
  const id = inp.data, od = out.data;
  for (let i=0; i<od.length; i+=4) od[i] = od[i+1] = od[i+2] = od[i+3] = 255;
  const kx = [-1,0,1,-2,0,2,-1,0,1], ky = [-1,-2,-1,0,0,0,1,2,1];
  for (let y=1; y<h-1; y++) for (let x=1; x<w-1; x++) {
    let gx=0, gy=0;
    for (let j=-1; j<=1; j++) for (let i=-1; i<=1; i++) {
      const px = ((y+j)*w + (x+i)) * 4;
      const l = 255 - (id[px] + id[px+1] + id[px+2]) / 3;
      const ki = (j+1)*3 + (i+1);
      gx += l * kx[ki]; gy += l * ky[ki];
    }
    const m = Math.min(255, Math.sqrt(gx*gx + gy*gy));
    const o = (y*w + x) * 4;
    od[o] = od[o+1] = od[o+2] = 255 - m; od[o+3] = 255;
  }
  dst.getContext('2d').putImageData(out, 0, 0);
}

function convCanvas(src, dst, k, div, offset) {
  const w = src.width, h = src.height;
  const inp = src.getContext('2d').getImageData(0,0,w,h);
  const out = dst.getContext('2d').createImageData(w, h);
  const id = inp.data, od = out.data;
  for (let i=0; i<od.length; i+=4) od[i] = od[i+1] = od[i+2] = od[i+3] = 255;
  for (let y=1; y<h-1; y++) for (let x=1; x<w-1; x++) {
    let r=0,g=0,b=0;
    for (let ky=-1; ky<=1; ky++) for (let kx=-1; kx<=1; kx++) {
      const px = ((y+ky)*w + (x+kx)) * 4;
      const kv = k[(ky+1)*3 + (kx+1)];
      r += (255-id[px])*kv; g += (255-id[px+1])*kv; b += (255-id[px+2])*kv;
    }
    const base = offset ? 128 : 0;
    const o = (y*w + x) * 4;
    od[o]   = 255 - clampPixel(r/div + base);
    od[o+1] = 255 - clampPixel(g/div + base);
    od[o+2] = 255 - clampPixel(b/div + base);
    od[o+3] = 255;
  }
  dst.getContext('2d').putImageData(out, 0, 0);
}

function clearDraw() {
  dctx.fillStyle = '#fff';
  dctx.fillRect(0, 0, dc.width, dc.height);
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, oc.width, oc.height);
}

function getPos(canvas, e) {
  const r = canvas.getBoundingClientRect();
  const sx = canvas.width / r.width, sy = canvas.height / r.height;
  const src = e.touches ? e.touches[0] : e;
  return { x: (src.clientX - r.left) * sx, y: (src.clientY - r.top) * sy };
}

dc.addEventListener('mousedown', e => { drawing=true; const p=getPos(dc,e); dctx.beginPath(); dctx.moveTo(p.x,p.y); });
dc.addEventListener('mousemove', e => { if(!drawing)return; const p=getPos(dc,e); dctx.lineTo(p.x,p.y); dctx.strokeStyle='#111'; dctx.lineWidth=BS; dctx.lineCap='round'; dctx.lineJoin='round'; dctx.stroke(); applyFilter(); });
dc.addEventListener('mouseup', () => drawing=false);
dc.addEventListener('mouseleave', () => drawing=false);
dc.addEventListener('touchstart', e=>{ e.preventDefault(); drawing=true; const p=getPos(dc,e); dctx.beginPath(); dctx.moveTo(p.x,p.y); }, {passive:false});
dc.addEventListener('touchmove', e=>{ e.preventDefault(); if(!drawing)return; const p=getPos(dc,e); dctx.lineTo(p.x,p.y); dctx.strokeStyle='#111'; dctx.lineWidth=BS; dctx.lineCap='round'; dctx.lineJoin='round'; dctx.stroke(); applyFilter(); }, {passive:false});
dc.addEventListener('touchend', () => drawing=false);

/* ──────────────────────────────────────────
   SECTION 03: NON-MAXIMUM SUPPRESSION
────────────────────────────────────────── */
const NMS_PRESETS = [
  { label: 'Keep the peak', values: [2, 5, 9, 4, 1] },
  { label: 'Suppress a non-peak pixel', values: [2, 8, 5, 7, 1] },
  { label: 'Tie case: equal peaks', values: [1, 4, 7, 7, 2] }
];
let activeNmsPreset = 0;

function buildNmsDemo() {
  const controls = document.getElementById('nmsPresets');
  if (!controls) return;
  controls.innerHTML = '';
  NMS_PRESETS.forEach((preset, index) => {
    const button = document.createElement('button');
    button.className = 'pill' + (index === activeNmsPreset ? ' on' : '');
    button.textContent = preset.label;
    button.onclick = () => {
      activeNmsPreset = index;
      buildNmsDemo();
    };
    controls.appendChild(button);
  });
  renderNmsProfile(NMS_PRESETS[activeNmsPreset].values);
}

function renderNmsProfile(values) {
  const profile = document.getElementById('nmsProfile');
  const comparison = document.getElementById('nmsComparison');
  if (!profile || !comparison) return;

  const ci = 2; // candidate index
  const left = values[ci - 1], center = values[ci], right = values[ci + 1];
  const keep = center >= left && center >= right;
  const maxVal = Math.max(...values) || 1;
  const ROLES = ['', 'comparison sample', 'candidate', 'comparison sample', ''];

  profile.innerHTML = values.map((v, i) => {
    const role = ROLES[i];
    const isCand = i === ci;
    const isNb   = i === ci - 1 || i === ci + 1;
    const barH = Math.max(6, Math.round(v / maxVal * 72));
    return `<div class="nms-bar-col ${isCand ? 'nms-bar-col--cand' : ''} ${isNb ? 'nms-bar-col--nb' : ''}">
      <span class="nms-bar-num">${v}</span>
      <div class="nms-bar-body" style="height:${barH}px"></div>
      ${role ? `<span class="nms-bar-role">${role}</span>` : '<span class="nms-bar-role"></span>'}
    </div>`;
  }).join('');

  const equalNeighbour = keep && (center === left || center === right);
  const verdict = keep
    ? (equalNeighbour ? 'Keep — tied with a neighbour. This demo uses ≥, so equal peaks are both kept. Some implementations use strict > to ensure single-pixel thinning.' : 'Keep — this pixel is a local maximum.')
    : 'Suppress — a neighbour is stronger, so this pixel is not a local maximum.';
  comparison.className = `nms-comparison ${keep ? 'nms-comparison--keep' : 'nms-comparison--suppress'}`;
  comparison.innerHTML = `
    <strong>NMS(${center}) = ${keep ? center : 0}</strong>
    <span>${center} ${center >= left ? '≥' : '&lt;'} ${left} and ${center} ${center >= right ? '≥' : '&lt;'} ${right}. ${verdict}</span>
  `;
}

let nmsPixelOrientation = 'vertical';
let nmsPanelData = null;

function buildNmsPixelPanel() {
  const controls = document.getElementById('nmsOrientationPills');
  const beforeCv = document.getElementById('nmsBeforeCanvas');
  const afterCv = document.getElementById('nmsAfterCanvas');
  if (!controls || !beforeCv || !afterCv) return;
  controls.innerHTML = '';
  [
    { id: 'vertical',   label: 'Vertical edge',         sub: 'compare horizontally',           detail: 'left / right of candidate' },
    { id: 'horizontal', label: 'Horizontal edge',        sub: 'compare vertically',             detail: 'above / below candidate' },
    { id: 'diagonal',   label: 'Diagonal / other angle', sub: 'interpolate comparison samples', detail: 'samples fall between pixels' }
  ].forEach(option => {
    const button = document.createElement('button');
    button.className = 'nms-orient-btn' + (option.id === nmsPixelOrientation ? ' on' : '');
    button.innerHTML =
      `<strong>${option.label}</strong>` +
      `<span class="orient-sub">${option.sub}</span>` +
      `<span class="orient-detail">${option.detail}</span>`;
    button.onclick = () => {
      nmsPixelOrientation = option.id;
      buildNmsPixelPanel();
    };
    controls.appendChild(button);
  });

  const W = beforeCv.width, H = beforeCv.height;
  const raw = new Float32Array(W * H);
  if (nmsPixelOrientation === 'vertical') {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raw[y * W + x] = x < W / 2 ? 0 : 255;
  } else if (nmsPixelOrientation === 'horizontal') {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raw[y * W + x] = y < H / 2 ? 0 : 255;
  } else {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raw[y * W + x] = x - y < (W - H) / 2 ? 0 : 255;
  }
  const blurred = gaussBlur(raw, W, H, 2.4);
  const { mag, dir, maxMag } = computeSobel(blurred, W, H);
  const nms = applyNMS(mag, dir, W, H);
  nmsPanelData = { mag, dir, nms, maxMag, W, H };
  renderNmsPanelBase();

  [beforeCv, afterCv].forEach(cv => {
    cv.onmousemove = inspectNmsPanel;
    cv.onclick = inspectNmsPanel;
    cv.onmouseleave = () => {
      renderNmsPanelBase();
      document.getElementById('nmsHoverInfo').textContent = 'Hover or click either panel to inspect a candidate pixel.';
    };
  });

  document.getElementById('nmsPixelNote').textContent =
    nmsPixelOrientation === 'vertical'
      ? 'This example uses a vertical edge, so NMS compares horizontally: immediately left and right of the candidate.'
      : nmsPixelOrientation === 'horizontal'
        ? 'This example uses a horizontal edge, so NMS compares vertically: immediately above and below the candidate.'
        : 'This example uses a diagonal edge, so NMS compares diagonally. Interpolation estimates comparison samples that fall between pixels.';
}

function renderNmsPanelBase() {
  const { mag, nms, maxMag, W, H } = nmsPanelData;
  putGrayF(document.getElementById('nmsBeforeCanvas').getContext('2d'), mag, W, H, maxMag);
  putGrayF(document.getElementById('nmsAfterCanvas').getContext('2d'), nms, W, H, maxMag);
}

function inspectNmsPanel(event) {
  const { mag, dir, nms, maxMag, W, H } = nmsPanelData;
  const cv = event.currentTarget, box = cv.getBoundingClientRect();
  const x = Math.max(0, Math.min(W - 1, Math.floor((event.clientX - box.left) / box.width * W)));
  const y = Math.max(0, Math.min(H - 1, Math.floor((event.clientY - box.top) / box.height * H)));
  const index = y * W + x, angle = dir[index], cos = Math.cos(angle), sin = Math.sin(angle);
  const interp = (fx, fy) => {
    const x0 = Math.max(0, Math.min(W - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(H - 1, Math.floor(fy)));
    const x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), dx = fx - x0, dy = fy - y0;
    return mag[y0*W+x0]*(1-dx)*(1-dy) + mag[y0*W+x1]*dx*(1-dy) + mag[y1*W+x0]*(1-dx)*dy + mag[y1*W+x1]*dx*dy;
  };
  const center = mag[index], a = interp(x - cos, y - sin), b = interp(x + cos, y + sin);
  const keep = center >= a && center >= b;
  renderNmsPanelBase();
  ['nmsBeforeCanvas','nmsAfterCanvas'].forEach(id => {
    const ctx = document.getElementById(id).getContext('2d');
    ctx.strokeStyle = keep ? '#f59e0b' : '#ef4444';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - .5, y - .5, 2, 2);
  });
  const pct = value => Math.round(value / maxMag * 100);
  document.getElementById('nmsHoverInfo').innerHTML =
    `<strong>neighbour ${pct(a)}%</strong><span>←</span><strong>candidate ${pct(center)}%</strong><span>→</span>` +
    `<strong>neighbour ${pct(b)}%</strong><b class="${keep ? 'keep' : 'suppress'}">${keep ? 'Keep — local maximum' : 'Suppress — a neighbour is stronger'}</b>`;
}

/* ──────────────────────────────────────────
   SECTION 04: DOUBLE THRESHOLDING
────────────────────────────────────────── */
const DT_PIXELS = [2,4,7,11,16,22,28,37,48,61,73,85,92].map((strength, i) => ({ index: i + 1, strength }));
let dtHoverIndex = -1;
let dtScrollSyncReady = false;
let dtResizeReady = false;
let dtDragReady = false;
let dtDragging = null;

function initDTSection() {
  if (!dtScrollSyncReady) {
    const scrollers = [...document.querySelectorAll('.dt-axis-scroll')];
    scrollers.forEach(source => source.addEventListener('scroll', () => {
      scrollers.forEach(target => {
        if (target !== source && target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft;
      });
    }));
    dtScrollSyncReady = true;
  }
  if (!dtResizeReady) {
    window.addEventListener('resize', () => updateDTGeometry(
      +document.getElementById('dtLoSlider').value,
      +document.getElementById('dtHiSlider').value
    ));
    dtResizeReady = true;
  }
  if (!dtDragReady) {
    const track = document.querySelector('.dt-scale-track');
    track.addEventListener('pointerdown', event => {
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const value = dtStrengthAtRatio(ratio);
      const lo = +document.getElementById('dtLoSlider').value;
      const hi = +document.getElementById('dtHiSlider').value;
      dtDragging = Math.abs(value - lo) <= Math.abs(value - hi) ? 'lo' : 'hi';
      updateDTFromPointer(event);
    });
    window.addEventListener('pointermove', updateDTFromPointer);
    window.addEventListener('pointerup', () => { dtDragging = null; });
    dtDragReady = true;
  }
  updateDT();
}

function dtStrengthRatio(strength) {
  if (strength <= DT_PIXELS[0].strength) return 0;
  if (strength >= DT_PIXELS[DT_PIXELS.length - 1].strength) return 1;
  for (let index = 0; index < DT_PIXELS.length - 1; index++) {
    const left = DT_PIXELS[index].strength;
    const right = DT_PIXELS[index + 1].strength;
    if (strength <= right) {
      return (index + (strength - left) / (right - left)) / (DT_PIXELS.length - 1);
    }
  }
  return 1;
}

function dtStrengthAtRatio(ratio) {
  if (ratio <= 0) return 0;
  if (ratio >= 1) return 100;
  const scaled = ratio * (DT_PIXELS.length - 1);
  const index = Math.floor(scaled);
  const fraction = scaled - index;
  const left = DT_PIXELS[index].strength;
  const right = DT_PIXELS[Math.min(DT_PIXELS.length - 1, index + 1)].strength;
  return Math.round(left + fraction * (right - left));
}

function updateDTFromPointer(event) {
  if (!dtDragging) return;
  const track = document.querySelector('.dt-scale-track');
  const rect = track.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  document.getElementById(dtDragging === 'lo' ? 'dtLoSlider' : 'dtHiSlider').value = dtStrengthAtRatio(ratio);
  updateDT(dtDragging);
}

function updateDTGeometry(lo, hi) {
  const demo = document.querySelector('.dt-demo');
  const row = document.getElementById('dtCandidateRow');
  const columns = row ? [...row.querySelectorAll('.dt-pixel-wrap')] : [];
  if (!demo || columns.length !== DT_PIXELS.length) return;
  const scrollers = [...document.querySelectorAll('.dt-axis-scroll')];
  const sharedScrollLeft = document.getElementById('dtThresholdAxis').parentElement.scrollLeft;
  scrollers.forEach(scroller => { scroller.scrollLeft = sharedScrollLeft; });

  const axisWidth = row.offsetWidth;
  const first = columns[0], last = columns[columns.length - 1];
  const rowRect = row.getBoundingClientRect();
  const firstRect = first.getBoundingClientRect();
  const lastRect = last.getBoundingClientRect();
  const axisStart = (firstRect.left + firstRect.right) / 2 - rowRect.left;
  const axisEnd = (lastRect.left + lastRect.right) / 2 - rowRect.left;
  const axisLength = axisEnd - axisStart;
  const x = percentage => axisStart + dtStrengthRatio(percentage) * axisLength;
  const setLeft = (id, percentage) => {
    document.getElementById(id).style.left = `${x(percentage)}px`;
  };
  const setSegment = (id, start, end) => {
    const segment = document.getElementById(id);
    segment.style.left = `${x(start) - axisStart}px`;
    segment.style.width = `${x(end) - x(start)}px`;
  };
  const setPill = (id, anchor) => {
    const pill = document.getElementById(id);
    const halfWidth = pill.offsetWidth / 2;
    pill.style.left = `${Math.max(halfWidth, Math.min(axisWidth - halfWidth, anchor))}px`;
  };

  demo.style.setProperty('--dt-axis-start', `${axisStart}px`);
  demo.style.setProperty('--dt-axis-length', `${axisLength}px`);

  setSegment('dtDiscardSegment', 0, lo);
  setSegment('dtWeakSegment', lo, hi);
  setSegment('dtStrongSegment', hi, 100);
  setLeft('dtLoGuide', lo);
  setLeft('dtHiGuide', hi);
  const center = (start, end) => (x(start) + x(end)) / 2;
  document.getElementById('dtDiscardLabel').style.left = `${center(0, lo)}px`;
  document.getElementById('dtWeakLabel').style.left = `${center(lo, hi)}px`;
  document.getElementById('dtStrongLabel').style.left = `${center(hi, 100)}px`;
  // Pill counters stay at fixed flex positions (left / center / right) — no dynamic positioning needed.
}

function updateDT(changed) {
  const loSlider = document.getElementById('dtLoSlider');
  const hiSlider = document.getElementById('dtHiSlider');
  if (changed === 'lo' && +loSlider.value >= +hiSlider.value) loSlider.value = +hiSlider.value - 1;
  if (changed === 'hi' && +hiSlider.value <= +loSlider.value) hiSlider.value = +loSlider.value + 1;
  const lo = +loSlider.value;
  const hi = +hiSlider.value;
  document.getElementById('dtLoVal').textContent = lo + '%';
  document.getElementById('dtHiVal').textContent = hi + '%';
  let strong = 0, weak = 0, discarded = 0;
  DT_PIXELS.forEach(({ strength }) => {
    if (strength >= hi) strong++;
    else if (strength >= lo) weak++;
    else discarded++;
  });
  document.getElementById('dtStrongCount').textContent = strong;
  document.getElementById('dtWeakCount').textContent = weak;
  document.getElementById('dtDiscardCount').textContent = discarded;
  renderDTPixelRows();
  updateDTGeometry(lo, hi);
}

function renderDTPixelRows() {
  const lo = +document.getElementById('dtLoSlider').value;
  const hi = +document.getElementById('dtHiSlider').value;
  document.getElementById('dtCandidateRow').innerHTML = DT_PIXELS.map((pixel, i) => renderDTPixel(pixel, i, 'candidate', lo, hi)).join('');
  document.getElementById('dtResultRow').innerHTML = DT_PIXELS.map((pixel, i) => renderDTPixel(pixel, i, 'result', lo, hi)).join('');
}

function renderDTPixel(pixel, i, kind, lo, hi) {
  const fate = pixel.strength >= hi ? 'strong' : pixel.strength >= lo ? 'weak' : 'discard';
  const markOpacity = Math.max(.08, pixel.strength / 100);
  const markStyle = kind === 'candidate' ? ` style="opacity:${markOpacity}"` : ` style="--strength:${pixel.strength / 100}"`;
  return `<div class="dt-pixel-wrap"><small>${pixel.strength}%</small>` +
    `<div class="dt-pixel dt-pixel--${kind} dt-pixel--${fate}" data-pixel="${i}"><i${markStyle}></i></div>` +
    `<b>${pixel.index}</b></div>`;
}

/* ──────────────────────────────────────────
   SECTIONS 05 + 06: CANNY EDGE DETECTION & HYPERPARAMETER TUNING
────────────────────────────────────────── */
const cin = document.getElementById('cin'), cout = document.getElementById('cout');
const cinctx = cin.getContext('2d'), coutctx = cout.getContext('2d');
const p3inCv = document.getElementById('p3in'), p3outCv = document.getElementById('p3out');
const p3inctx = p3inCv.getContext('2d'), p3outctx = p3outCv.getContext('2d');

let curSrc = 'sample', camStream = null, camRunning = false, rafId = null;
let curTuneSrc = 'sample', tuneCamStream = null, tuneCamRunning = false, tuneRafId = null;
let curSampleIdx = 0, curTuneSampleIdx = 0, activeStep = 0, activeTuneStep = 0;

const STEP_LABELS = [
  'Blur',
  'Gradient',
  'NMS',
  'Double Threshold',
  'Hysteresis'
];

const STEP_DESCS = [
  'Gaussian blur smooths the image before edge detection. A larger σ reduces noise and fine detail but can merge nearby edges.',
  'Sobel filters measure horizontal (Gx) and vertical (Gy) intensity changes. The output shows gradient magnitude √(Gx²+Gy²), scaled to the image maximum for display — brighter pixels indicate stronger edge responses.',
  'Non-Maximum Suppression thins the gradient ridge: for each pixel, magnitude is compared with two neighbours across the gradient direction. Only local maxima are kept.',
  'Double thresholding classifies edge candidates by strength. White = strong edge (response ≥ T_hi); blue = weak edge (T_lo ≤ response < T_hi); black = discarded.',
  'Strong-edge pixels are kept unconditionally as confirmed edges and act as anchors. The algorithm traces outward from each anchor: a weak-edge pixel survives only if it connects — directly or through a chain of other weak pixels — to a strong anchor. Isolated weak pixels with no strong connection are discarded as likely noise, not real edges.'
];

// Cross-reference links shown below each step note
const STEP_REFS = [
  { href: '#filter-blur',  section: '02 — Gaussian Blur',              question: 'How does Gaussian blur work?', filter: 'blur' },
  { href: '#filter-sobel', section: '02 — Sobel Edge Detection',       question: 'How does the Sobel filter work?', filter: 'sobel' },
  { href: '#part2', section: '03 — Non-Maximum Suppression',   question: 'How does NMS work?' },
  { href: '#part3', section: '04 — Double Thresholding',       question: 'How does double thresholding work?' },
  { href: '#part3', section: '04 — Double Thresholding',       question: 'How are weak and strong edges defined?' },
];

function renderStepRef(ref, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!ref) { el.innerHTML = ''; return; }
  el.innerHTML = `<a href="${ref.href}" class="step-ref-link">← ${ref.question} <span>Jump to ${ref.section}</span></a>`;
  if (ref.filter) {
    el.querySelector('.step-ref-link').onclick = () => selectFilter(ref.filter);
  }
}

function setStepNote() {
  const t = document.getElementById('p2-note-text');
  if (t) t.textContent = STEP_DESCS[activeStep] || '';
  renderStepRef(STEP_REFS[activeStep], 'p2-step-ref');
  const label = document.getElementById('p2-outlabel');
  if (label) label.textContent = `${STEP_LABELS[activeStep]} Output`;
}

function setTuningStepNote() {
  const label = document.getElementById('p3-outlabel');
  if (label) label.textContent = `${STEP_LABELS[activeTuneStep]} Output`;

  const controlsNote = document.getElementById('tuning-controls-note');
  if (!controlsNote) return;
  controlsNote.textContent = activeTuneStep < 3
    ? ''
    : activeTuneStep === 3
      ? 'T_low and T_high now classify gradient responses into discarded, weak, and strong edge pixels.'
      : 'Hysteresis uses the current weak / strong split: strong edges are kept, and connected weak edges survive.';
}

function buildSharedStepBar() {
  const bar = document.getElementById('sharedStepBar');
  bar.innerHTML = '';

  STEP_LABELS.forEach((label, i) => {
    const btn = document.createElement('button');
    btn.className = 'step-pill' + (i === activeStep ? ' on' : '');
    btn.textContent = label;

    btn.onclick = () => {
      activeStep = i;
      bar.querySelectorAll('.step-pill').forEach((b, idx) => {
        b.classList.toggle('on', idx === i);
      });

      setStepNote();
      p3update();
    };

    bar.appendChild(btn);
    if (i < STEP_LABELS.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'step-arrow';
      arrow.textContent = '→';
      bar.appendChild(arrow);
    }
  });

  setStepNote();

}

function buildTuningStepBar() {
  const bar = document.getElementById('tuningStepBar');
  if (!bar) return;
  bar.innerHTML = '';

  STEP_LABELS.forEach((label, i) => {
    const btn = document.createElement('button');
    btn.className = 'step-pill' + (i === activeTuneStep ? ' on' : '');
    btn.textContent = label;
    btn.onclick = () => {
      activeTuneStep = i;
      bar.querySelectorAll('.step-pill').forEach((b, idx) => {
        b.classList.toggle('on', idx === i);
      });
      setTuningStepNote();
      p3update();
    };
    bar.appendChild(btn);
    if (i < STEP_LABELS.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'step-arrow';
      arrow.textContent = '→';
      bar.appendChild(arrow);
    }
  });

  setTuningStepNote();
}

function renderCannyStage(sourceCtx, outputCtx, w, h, step, sigma, thi, tlo) {
  const g = getGray(sourceCtx.getImageData(0,0,w,h), w, h);
  const b = gaussBlur(g, w, h, sigma);
  if (step === 0) { putGrayF(outputCtx, b, w, h); return; }

  const { mag, dir, maxMag } = computeSobel(b, w, h);
  if (step === 1) { putGrayF(outputCtx, mag, w, h, maxMag); return; }

  const nms = applyNMS(mag, dir, w, h);
  if (step === 2) { putGrayF(outputCtx, nms, w, h, maxMag); return; }
  if (step === 3) { putThr(outputCtx, nms, w, h, maxMag, thi, tlo); return; }

  const final = runHysteresis(nms, w, h, maxMag, thi, tlo);
  putBin(outputCtx, final, w, h);
}

function p3ThreshInput(which) {
  const loEl = document.getElementById('p3tlo');
  const hiEl = document.getElementById('p3thi');
  let lo = +loEl.value, hi = +hiEl.value;
  if (which === 'lo') {
    lo = Math.min(lo, hi - 1);
    loEl.value = lo;
  } else {
    hi = Math.max(hi, lo + 1);
    hiEl.value = hi;
  }
  p3TloVal = lo;
  p3ThiVal = hi;
  p3update();
}

function p3update() {
  const sigma = +document.getElementById('p3sigma').value;
  const thi = p3ThiVal / 100;
  const tlo = p3TloVal / 100;

  document.getElementById('p3sv').textContent = sigma.toFixed(1);
  document.getElementById('p3tlv').textContent = p3TloVal + '%';
  document.getElementById('p3thv').textContent = p3ThiVal + '%';

  renderCannyStage(cinctx, coutctx, cin.width, cin.height, activeStep, 1.4, .3, .10);
  renderCannyStage(p3inctx, p3outctx, p3inCv.width, p3inCv.height, activeTuneStep, sigma, thi, tlo);
}

function loadImgToCanny(src) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    cinctx.drawImage(img, 0, 0, cin.width, cin.height);
    p3update();
  };
  img.src = src;
}

const SAMPLES = [
  { label: 'Lizard',       src: './lizard.jpg' },
  { label: 'Portrait',     src: './portrait.jpg' },
  { label: 'Architecture', src: './architecture.jpg' },
];

function buildSamplePills() {
  const c = document.getElementById('spills');
  if (!c) return;
  c.innerHTML = '';
  SAMPLES.forEach((s, i) => {
    const p = document.createElement('button');
    p.className = 'pill' + (i === 0 ? ' on' : '');
    p.textContent = s.label;
    p.onclick = () => {
      document.querySelectorAll('#spills .pill').forEach(x => x.classList.remove('on'));
      p.classList.add('on');
      curSampleIdx = i;
      loadImgToCanny(s.src);
    };
    c.appendChild(p);
  });
}

function loadImgToTuning(src) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    p3inctx.drawImage(img, 0, 0, p3inCv.width, p3inCv.height);
    p3update();
  };
  img.src = src;
}

function buildTuningSamplePills() {
  const c = document.getElementById('tspills');
  if (!c) return;
  c.innerHTML = '';
  SAMPLES.forEach((s, i) => {
    const p = document.createElement('button');
    p.className = 'pill' + (i === curTuneSampleIdx ? ' on' : '');
    p.textContent = s.label;
    p.onclick = () => {
      document.querySelectorAll('#tspills .pill').forEach(x => x.classList.remove('on'));
      p.classList.add('on');
      curTuneSampleIdx = i;
      loadImgToTuning(s.src);
    };
    c.appendChild(p);
  });
}

function setSrc(s) {
  // If already on webcam, clicking webcam card again freezes the frame
  if (s === 'cam' && curSrc === 'cam') {
    if (camRunning) stopCam();
    else toggleCam(); // restart if already frozen
    return;
  }
  curSrc = s;
  ['sample','upload','cam'].forEach(id => {
    const el = document.getElementById('src-'+id);
    if (el) el.style.display = id === s ? '' : 'none';
  });
  document.querySelectorAll('#srcTabs .src-card').forEach(t => t.classList.toggle('on', t.dataset.src === s));
  if (s !== 'cam' && camRunning) stopCam();
  if (s === 'sample') loadImgToCanny(SAMPLES[curSampleIdx].src);
  // Auto-start camera immediately when switching to webcam
  if (s === 'cam') toggleCam();
}

function loadFile(input) {
  const f = input.files[0]; if (!f) return;
  const img = new Image();
  img.onload = () => {
    cinctx.drawImage(img, 0, 0, cin.width, cin.height);
    p3update();
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f);
}

async function toggleCam() {
  if (camRunning) { stopCam(); return; }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 340, height: 255 } });
    const v = document.getElementById('vid');
    v.srcObject = camStream;
    v.style.display = 'none'; // keep video element hidden; feed appears on canvas only
    v.onloadedmetadata = () => {
      v.play();
      camRunning = true;
      const badge = document.getElementById('camLiveBadge');
      if (badge) badge.style.display = '';
      camLoop();
    };
  } catch(e) {
    // Camera unavailable — show brief note on canvas label
    const badge = document.getElementById('camLiveBadge');
    if (badge) { badge.textContent = 'Camera unavailable'; badge.style.display = ''; }
  }
}

function stopCam() {
  // Draw the last video frame before stopping the stream.
  const v = document.getElementById('vid');
  if (v && camRunning) {
    try {
      cinctx.drawImage(v, 0, 0, cin.width, cin.height);
    } catch(e) { /* tainted canvas guard */ }
  }
  camRunning = false;
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  v.style.display = 'none';
  const badge = document.getElementById('camLiveBadge');
  if (badge) badge.style.display = 'none';
  // Run pipeline on the frozen frame via next animation frame to let canvas settle
  requestAnimationFrame(() => p3update());
}

function camLoop() {
  if (!camRunning) return;
  const v = document.getElementById('vid');
  cinctx.drawImage(v, 0, 0, cin.width, cin.height);
  p3update();
  rafId = requestAnimationFrame(camLoop);
}

function setTuneSrc(s) {
  if (s === 'cam' && curTuneSrc === 'cam') {
    if (tuneCamRunning) stopTuneCam();
    else toggleTuneCam();
    return;
  }
  curTuneSrc = s;
  ['sample','upload','cam'].forEach(id => {
    const el = document.getElementById('tuning-src-'+id);
    if (el) el.style.display = id === s ? '' : 'none';
  });
  document.querySelectorAll('#tuningSrcTabs .src-card').forEach(t => t.classList.toggle('on', t.dataset.src === s));
  if (s !== 'cam' && tuneCamRunning) stopTuneCam();
  if (s === 'sample') loadImgToTuning(SAMPLES[curTuneSampleIdx].src);
  if (s === 'cam') toggleTuneCam();
}

function loadTuneFile(input) {
  const f = input.files[0]; if (!f) return;
  const img = new Image();
  img.onload = () => {
    p3inctx.drawImage(img, 0, 0, p3inCv.width, p3inCv.height);
    p3update();
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f);
}

async function toggleTuneCam() {
  if (tuneCamRunning) { stopTuneCam(); return; }
  try {
    tuneCamStream = await navigator.mediaDevices.getUserMedia({ video: { width: 340, height: 255 } });
    const v = document.getElementById('tvid');
    v.srcObject = tuneCamStream;
    v.style.display = 'none';
    v.onloadedmetadata = () => {
      v.play();
      tuneCamRunning = true;
      const badge = document.getElementById('tuneCamLiveBadge');
      if (badge) badge.style.display = '';
      tuneCamLoop();
    };
  } catch(e) {
    const badge = document.getElementById('tuneCamLiveBadge');
    if (badge) { badge.textContent = 'Camera unavailable'; badge.style.display = ''; }
  }
}

function stopTuneCam() {
  const v = document.getElementById('tvid');
  if (v && tuneCamRunning) {
    try {
      p3inctx.drawImage(v, 0, 0, p3inCv.width, p3inCv.height);
    } catch(e) { /* tainted canvas guard */ }
  }
  tuneCamRunning = false;
  if (tuneRafId) { cancelAnimationFrame(tuneRafId); tuneRafId = null; }
  if (tuneCamStream) { tuneCamStream.getTracks().forEach(t => t.stop()); tuneCamStream = null; }
  v.style.display = 'none';
  const badge = document.getElementById('tuneCamLiveBadge');
  if (badge) badge.style.display = 'none';
  requestAnimationFrame(() => p3update());
}

function tuneCamLoop() {
  if (!tuneCamRunning) return;
  const v = document.getElementById('tvid');
  p3inctx.drawImage(v, 0, 0, p3inCv.width, p3inCv.height);
  p3update();
  tuneRafId = requestAnimationFrame(tuneCamLoop);
}

/* ── Canny math ── */
function getGray(imgd, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    g[i] = imgd.data[i*4]*0.299 + imgd.data[i*4+1]*0.587 + imgd.data[i*4+2]*0.114;
  }
  return g;
}

function gaussBlur(g, w, h, sigma) {
  if (sigma === 0) return new Float32Array(g);
  const r = Math.max(1, Math.ceil(sigma * 3)), size = 2 * r + 1;
  const k = new Float32Array(size); let sum = 0;
  for (let i = 0; i < size; i++) { k[i] = Math.exp(-((i-r)**2) / (2*sigma*sigma)); sum += k[i]; }
  for (let i = 0; i < size; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let d = -r; d <= r; d++) { const nx = Math.max(0, Math.min(w-1, x+d)); s += g[y*w+nx] * k[d+r]; }
    tmp[y*w+x] = s;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let d = -r; d <= r; d++) { const ny = Math.max(0, Math.min(h-1, y+d)); s += tmp[ny*w+x] * k[d+r]; }
    out[y*w+x] = s;
  }
  return out;
}

function computeSobel(b, w, h) {
  const get = (y, x) => b[Math.max(0,Math.min(h-1,y))*w + Math.max(0,Math.min(w-1,x))];
  const mag = new Float32Array(w*h), dir = new Float32Array(w*h);
  const kx = [-1,0,1,-2,0,2,-1,0,1], ky = [-1,-2,-1,0,0,0,1,2,1]; let mx = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let gx = 0, gy = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const v = get(y+j, x+i), ki = (j+1)*3+(i+1);
      gx += v * kx[ki]; gy += v * ky[ki];
    }
    const m = Math.sqrt(gx*gx + gy*gy);
    mag[y*w+x] = m; if (m > mx) mx = m; dir[y*w+x] = Math.atan2(gy, gx);
  }
  return { mag, dir, maxMag: mx || 1 };
}

function applyNMS(mag, dir, w, h) {
  const out = new Float32Array(w*h);
  const interp = (fx, fy) => {
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = x0+1, y1 = y0+1;
    if (x0 < 0 || x1 >= w || y0 < 0 || y1 >= h) return 0;
    const dx = fx-x0, dy = fy-y0;
    return mag[y0*w+x0]*(1-dx)*(1-dy) + mag[y0*w+x1]*dx*(1-dy)
         + mag[y1*w+x0]*(1-dx)*dy     + mag[y1*w+x1]*dx*dy;
  };
  for (let y = 1; y < h-1; y++) for (let x = 1; x < w-1; x++) {
    const c = Math.cos(dir[y*w+x]), s = Math.sin(dir[y*w+x]);
    const p = interp(x+c, y+s), q = interp(x-c, y-s);
    out[y*w+x] = (mag[y*w+x] >= p && mag[y*w+x] >= q) ? mag[y*w+x] : 0;
  }
  return out;
}

function runHysteresis(nms, w, h, maxMag, thi, tlo) {
  const hi = maxMag*thi, lo = maxMag*tlo;
  const s = new Uint8Array(w*h);
  for (let i = 0; i < w*h; i++) { if (nms[i] >= hi) s[i]=2; else if (nms[i] >= lo) s[i]=1; }
  const stack = []; for (let i = 0; i < w*h; i++) if (s[i]===2) stack.push(i);
  while (stack.length) {
    const idx = stack.pop(), y = Math.floor(idx/w), x = idx%w;
    for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) {
      if (!dy && !dx) continue;
      const ny=y+dy, nx=x+dx;
      if (ny<0||ny>=h||nx<0||nx>=w) continue;
      const ni=ny*w+nx; if (s[ni]===1) { s[ni]=2; stack.push(ni); }
    }
  }
  const out = new Uint8Array(w*h);
  for (let i = 0; i < w*h; i++) out[i] = s[i]===2 ? 255 : 0;
  return out;
}

function putGrayF(ctx, d, w, h, mx) {
  const id = ctx.createImageData(w, h); const m = mx || Math.max(...d) || 1;
  for (let i = 0; i < w*h; i++) {
    const v = Math.min(255, Math.round(d[i]/m*255));
    id.data[i*4]=id.data[i*4+1]=id.data[i*4+2]=v; id.data[i*4+3]=255;
  }
  ctx.putImageData(id, 0, 0);
}
function putBin(ctx, d, w, h) {
  const id = ctx.createImageData(w, h);
  for (let i = 0; i < w*h; i++) {
    id.data[i*4]=id.data[i*4+1]=id.data[i*4+2]=d[i]; id.data[i*4+3]=255;
  }
  ctx.putImageData(id, 0, 0);
}
function putThr(ctx, nms, w, h, maxMag, thi, tlo) {
  const hi=maxMag*thi, lo=maxMag*tlo;
  const id = ctx.createImageData(w, h);
  for (let i = 0; i < w*h; i++) {
    if (nms[i]>=hi)      { id.data[i*4]=255; id.data[i*4+1]=255; id.data[i*4+2]=255; }
    else if (nms[i]>=lo) { id.data[i*4]=59;  id.data[i*4+1]=139; id.data[i*4+2]=212; }
    else                 { id.data[i*4]=id.data[i*4+1]=id.data[i*4+2]=0; }
    id.data[i*4+3]=255;
  }
  ctx.putImageData(id, 0, 0);
}



let p3ThiVal = 30, p3TloVal = 10;
/* ──────────────────────────────────────────
   INIT
────────────────────────────────────────── */

activeStep = 0; 


buildFilterPills();
selectFilter('blur');
clearDraw();
buildNmsDemo();
buildNmsPixelPanel();
initDTSection();
buildSamplePills(); // Sets up Lizard/Portrait/Architecture buttons
buildTuningSamplePills();

// Build the Canny step bar after resetting activeStep so the first button is selected.
buildSharedStepBar();
buildTuningStepBar();

// Update the status description text to match activeStep.
setStepNote();
setTuningStepNote();

// Initialize the convolution animator and load the default image.
rebuildAnim();
loadImgToCanny(SAMPLES[0].src);
loadImgToTuning(SAMPLES[0].src);
