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
   PART 0: CONVOLUTION ANIMATOR
────────────────────────────────────────── */
let animData = {}, playing = false, playTimer = null, curPos = 0, totalPos = 0;

function randInt(lo, hi) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }

function buildInputMatrix(n) {
  const m = [];
  for (let r = 0; r < n; r++) {
    m.push([]);
    for (let c = 0; c < n; c++) m[r].push(randInt(20, 240));
  }
  return m;
}

function getKernel(op, ks) {
  if (op === 'edge') {
    if (ks === 1) return { k: [1], label: 'Identity (1×1 edge is trivial)' };
    if (ks === 3) return { k: [-1,0,1,-2,0,2,-1,0,1], label: 'Sobel X' };
    if (ks === 5) return { k: [2,1,0,-1,-2,2,1,0,-1,-2,4,2,0,-2,-4,2,1,0,-1,-2,2,1,0,-1,-2], label: 'Sobel X (5×5)' };
  }
  if (op === 'blur') {
    if (ks === 1) return { k: [1], label: 'Blur (1×1 = identity)' };
    if (ks === 3) return { k: [1,2,1,2,4,2,1,2,1].map(v => v/16), label: 'Gaussian blur (3×3)' };
    if (ks === 5) return { k: Array(25).fill(1/25), label: 'Box blur (5×5)' };
  }
  if (op === 'avgpool') return { k: Array(ks*ks).fill(1/(ks*ks)), label: `Avg pool (${ks}×${ks})` };
  // identity
  return { k: Array(ks*ks).fill(0).map((v,i) => i === Math.floor(ks*ks/2) ? 1 : 0), label: 'Identity' };
}

function checkImpossible() {
  const n = +document.getElementById('inSize').value;
  const ks = +document.getElementById('ks').value;
  const stride = +document.getElementById('stride').value;
  const pad = +document.getElementById('padding').value;
  const notice = document.getElementById('impossibleNotice');
  const txt = document.getElementById('impossibleText');

  const eff = pad > 0 ? n : n;
  const outs = Math.floor((eff - (pad > 0 ? 0 : ks - 1) - 1) / stride) + 1;

  if (ks > n && pad === 0) {
    notice.style.display = 'flex';
    txt.textContent = `Impossible: window (${ks}×${ks}) is larger than the input (${n}×${n}) with no padding. The kernel cannot fit anywhere inside the input. Either increase the input size, reduce the window size, or enable zero-padding.`;
    return false;
  }
  if (outs <= 0) {
    notice.style.display = 'flex';
    txt.textContent = `Impossible: stride ${stride} is too large for this input/kernel combination — there are no valid positions. The output would have 0×0 dimensions. Reduce the stride or increase the input size.`;
    return false;
  }
  notice.style.display = 'none';
  return true;
}

function getPaddedMatrix(mat, n, ks, pad) {
  if (pad === 0) return mat;
  const p = Math.floor(ks / 2);
  const big = [];
  for (let r = 0; r < n + 2*p; r++) {
    big.push([]);
    for (let c = 0; c < n + 2*p; c++) {
      big[r].push((r < p || r >= n+p || c < p || c >= n+p) ? 0 : mat[r-p][c-p]);
    }
  }
  return big;
}

function rebuildAnim() {
  if (!checkImpossible()) return;
  const n = +document.getElementById('inSize').value;
  const ks = +document.getElementById('ks').value;
  const stride = +document.getElementById('stride').value;
  const pad = +document.getElementById('padding').value;
  const op = document.getElementById('opMode').value;
  const mat = buildInputMatrix(n);
  const { k, label } = getKernel(op, ks);
  const padMat = getPaddedMatrix(mat, n, ks, pad);
  const pn = padMat.length;
  const outs = Math.floor((pn - ks) / stride) + 1;
  totalPos = outs * outs;
  animData = { n, ks, stride, pad, op, mat, padMat, pn, outs, k, label };
  curPos = 0;
  const slider = document.getElementById('posSlider');
  slider.max = Math.max(0, totalPos - 1);
  slider.value = 0;
  updatePosLabel();
  renderKernelDisplay(k, ks, label);
  document.getElementById('inputSizeLabel').textContent = pad > 0 ? `${n}×${n} + padding` : `${n}×${n}`;
  document.getElementById('outputSizeLabel').textContent = `${outs}×${outs}`;
  const outLbl = document.getElementById('animOutLabel');
  if (outLbl) outLbl.textContent = `Output (${outs}×${outs})`;
  stopPlay();
  drawAnimCanvases(0); // shows position 0 with computation immediately
}

const CELL_MAX = 48, CELL_MIN = 28;
function cellSz(n) { return Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor(260 / n))); }

function kCellColor(v, mx) {
  const t = mx > 0 ? Math.abs(v) / mx : 0;
  if (v > 0) return { bg: `rgba(28,109,255,${(0.12 + t*0.6).toFixed(2)})`, col: '#1048a0' };
  if (v < 0) return { bg: `rgba(255,72,34,${(0.12 + t*0.6).toFixed(2)})`, col: '#a02010' };
  return { bg: 'rgba(14,14,14,0.06)', col: '#6e6860' };
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
    d.textContent = Number.isInteger(v) ? v : v.toFixed(2);
    g.appendChild(d);
  });
  document.getElementById('kernelOpLabel').textContent = label;
}

function drawAnimCanvases(pos) {
  const { padMat, pn, ks, stride, outs, k, pad, n } = animData;
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

  for (let r = 0; r < pn; r++) {
    for (let c = 0; c < pn; c++) {
      const v = padMat[r][c];
      const isPad = pad > 0 && (r < Math.floor(ks/2) || r >= pn - Math.floor(ks/2) || c < Math.floor(ks/2) || c >= pn - Math.floor(ks/2));
      const inWin = r >= r0 && r < r0+ks && c >= c0 && c < c0+ks;
      if (isPad) {
        ctxIn.fillStyle = 'rgba(28,109,255,0.12)';
      } else {
        const lum = Math.round(v / 255 * 100);
        ctxIn.fillStyle = `hsl(0,0%,${lum}%)`;
      }
      ctxIn.fillRect(c*cs, r*cs, cs-1, cs-1);
      if (inWin && !isPad) {
        ctxIn.strokeStyle = 'rgba(28,109,255,0.7)';
        ctxIn.lineWidth = 1.5;
        ctxIn.strokeRect(c*cs+1, r*cs+1, cs-2, cs-2);
      }
      ctxIn.fillStyle = isPad ? '#5DCAA5' : (v > 128 ? '#222' : '#ddd');
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
    const val = Math.round(Math.min(255, Math.max(0, sum + 128)));
    const lum = val / 255 * 100;
    ctxO.fillStyle = `hsl(0,0%,${lum}%)`;
    ctxO.fillRect(oc2*csO, or*csO, csO-1, csO-1);
    ctxO.fillStyle = val > 128 ? '#222' : '#ddd';
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
  const { padMat, ks, stride, outs, k, op } = animData;
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
        const kd = Number.isInteger(kv) ? kv : kv.toFixed(2);
        terms.push(`${gv}×${kd}`);
      }
      sum += gv * kv;
    }
  }
  // Edge/Sobel produces values in [-255,+255]; shift by +128 to place in display range.
  // All other operations already produce values in [0,255] — no offset needed.
  const offset = op === 'edge' ? 128 : 0;
  const clamped = Math.round(Math.min(255, Math.max(0, sum + offset)));
  const raw = Math.round(sum * 100) / 100;
  const shown = terms.slice(0, 8).join(' + ') + (terms.length > 8 ? '\n  + …' : '');
  document.getElementById('animCalc').textContent = shown + '\n= ' + raw + (raw !== clamped ? ' → clamped → ' + clamped : '');
  document.getElementById('animResult').textContent = clamped;
  const or = Math.floor(pos / outs), oc = pos % outs;
  document.getElementById('animResultSub').textContent = `out[${or}][${oc}]`;
  const opLabels = {
    edge: 'Detects intensity change in one direction (gradient)',
    blur: 'Smooths by weighted neighbourhood average',
    avgpool: 'Mean of window — spatial downsampling',
    identity: 'Returns the pixel unchanged'
  };
  document.getElementById('animNote').textContent =
    `Window at input rows ${r0}–${r0+animData.ks-1}, cols ${c0}–${c0+animData.ks-1}. Output [${or},${oc}]. ${opLabels[op] || ''}`;

  // Dynamic callout
  updateCallout(op, windowVals, ks, raw, clamped, r0, c0, or, oc);
}

function updateCallout(op, windowVals, ks, raw, clamped, r0, c0, or, oc) {
  const box = document.getElementById('calloutBox');
  if (!box) return;
  const mean = Math.round(windowVals.reduce((a, b) => a + b, 0) / windowVals.length);
  const minV = Math.min(...windowVals), maxV = Math.max(...windowVals);
  const spread = maxV - minV;

  let html = '';
  if (op === 'avgpool') {
    const brightness = mean > 180 ? 'bright' : mean > 80 ? 'mid-tone' : 'dark';
    html = `<span class="callout-accent">Avg pool — window [${r0},${c0}] → out[${or},${oc}]</span> — `
      + `The ${ks}×${ks} window holds ${windowVals.length} pixels. Their mean is <strong>${mean}</strong> `
      + `(min ${minV}, max ${maxV}), a <em>${brightness}</em> region. `
      + `Every weight is 1/${ks*ks} = ${(1/(ks*ks)).toFixed(2)}, so the output is simply the average brightness. `
      + `Spatial detail within the window is discarded — only the overall tone survives. `
      + (spread < 20 ? `Low spread (${spread}) = uniform patch, pooling loses little information.`
        : spread < 80 ? `Moderate spread (${spread}) = some texture is being merged.`
        : `High spread (${spread}) = varied patch, pooling significantly reduces detail here.`);
  } else if (op === 'edge') {
    const absRaw = Math.abs(raw);
    html = `<span class="callout-accent">Sobel X gradient — out[${or},${oc}]</span> — `
      + `Raw value <strong>${raw}</strong>, clamped to <strong>${clamped}</strong>. `
      + (absRaw < 10 ? `Near-zero gradient — the pixel intensity is roughly the same on both sides. No horizontal edge here.`
        : absRaw < 60 ? `Mild gradient — a gentle horizontal transition in brightness across this window.`
        : `Strong gradient — a sharp horizontal edge exists here. The left and right sides of the window differ significantly.`)
      + ` (Output near 128 = no edge; far from 128 = strong edge.)`;
  } else if (op === 'blur') {
    html = `<span class="callout-accent">Gaussian blur — out[${or},${oc}]</span> — `
      + `Centre pixel (weight 4/16) contributes most; neighbours (2/16) next; corners (1/16) least. `
      + `Weighted sum <strong>${raw}</strong> → output <strong>${clamped}</strong>. `
      + (spread < 20 ? `Low spread (${spread}): neighbours are similar, so blur changes very little here.`
        : spread < 80 ? `Moderate spread (${spread}): some noise or detail is being softened.`
        : `High spread (${spread}): big intensity jump in this area — blurring will visibly smooth this edge.`);
  } else if (op === 'identity') {
    html = `<span class="callout-accent">Identity — out[${or},${oc}]</span> — `
      + `The centre weight is 1, all others are 0. So the output <strong>${clamped}</strong> equals the centre pixel's input value exactly. `
      + `No neighbours contribute. This is the mathematical no-op: I ★ δ = I. `
      + `Useful as a baseline — if your output doesn't match here, something in the pipeline is broken.`;
  }
  box.innerHTML = html;
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
    playTimer = setTimeout(tick, 280);
  } else {
    stopPlay();
    document.getElementById('animNote').textContent = 'Complete — all output positions computed. Reset to run again.';
  }
}
function resetAnim() { stopPlay(); rebuildAnim(); }

// Wire controls
['inSize','ks','stride','padding','opMode'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => { rebuildAnim(); });
});
document.getElementById('posSlider').addEventListener('input', e => seekAnim(+e.target.value));

/* ──────────────────────────────────────────
   PART 1: FILTER EXPLORER
────────────────────────────────────────── */
const dc = document.getElementById('dc');
const oc = document.getElementById('oc');
const dctx = dc.getContext('2d');
const octx = oc.getContext('2d');
let BS = 10, drawing = false, curF = 'sobel';

const FILTERS = {
  sobel: {
    label: 'Sobel',
    kd: [-1,0,1,-2,0,2,-1,0,1], kl: 'Sobel X (3×3)',
    desc: 'Approximates the horizontal partial derivative ∂I/∂x. Paired with Sobel Y, the combined magnitude √(Gx²+Gy²) gives edge strength independent of orientation. Left column is negative (subtracts), right is positive (adds) — any horizontal intensity ramp produces a strong response.',
    eq: 'Gx = I ★ k_x\nGy = I ★ k_y\n|∇I| = √(Gx² + Gy²)\nθ  = atan2(Gy, Gx)',
    exPatch: [[80,80,200],[80,80,200],[80,80,200]]
  },
  laplacian: {
    label: 'Laplacian',
    k: [0,1,0,1,-4,1,0,1,0], kl: 'Laplacian (3×3)',
    desc: 'Second-order isotropic derivative ∇²I = ∂²I/∂x² + ∂²I/∂y². Responds to curvature of the intensity surface. Zero-crossings locate edge centres precisely. Highly noise-sensitive — combine with Gaussian first (LoG filter).',
    eq: '∇²I = ∂²I/∂x² + ∂²I/∂y²\n\n        = I ★  | 0   1   0 |\n               | 1  -4   1 |\n               | 0   1   0 |',
    exPatch: [[50,50,50],[50,220,50],[50,50,50]]
  },
  sharpen: {
    label: 'Sharpen',
    k: [0,-1,0,-1,5,-1,0,-1,0], kl: 'Unsharp mask (3×3)',
    desc: 'Identity minus a scaled Laplacian: I − α∇²I with α=1. Amplifies high-frequency detail by subtracting a smoothed version from the original, making edges appear crisper. The centre weight (5) preserves the original; the −1 weights subtract the mean of neighbours.',
    eq: 'S = I − α∇²I  (α = 1)\n\n  = I ★  |  0  -1   0 |\n         | -1   5  -1 |\n         |  0  -1   0 |',
    exPatch: [[100,100,100],[100,160,100],[100,100,100]]
  },
  blur: {
    label: 'Gaussian blur',
    k: [1,2,1,2,4,2,1,2,1], div: 16, kl: 'Gaussian ≈ 3×3',
    desc: 'Weighted neighbourhood average approximating a 2D Gaussian distribution. All weights positive, sum to 1 — output stays in range. Centre contributes most, diagonals least. Separable: apply as two 1D passes (horizontal then vertical) for O(k) not O(k²) per pixel.',
    eq: 'G_σ(x,y) = (1/2πσ²)·exp(−(x²+y²)/2σ²)\n\n≈  G_{0.85}  =  | 1  2  1 |\n                | 2  4  2 |  ÷ 16\n                | 1  2  1 |',
    exPatch: [[20,200,20],[200,200,200],[20,200,20]]
  },
  emboss: {
    label: 'Emboss',
    k: [-2,-1,0,-1,1,1,0,1,2], kl: 'Emboss (3×3)',
    desc: 'Asymmetric first-derivative kernel. Negative weights on the top-left subtract, positive on the bottom-right add — equivalent to a directional gradient at ~45°. Output is offset by +128 so negative gradients render as gray, not black. Produces a relief-like 3D effect.',
    eq: 'E = I ★ k_emb + 128',
    exPatch: [[200,200,80],[200,128,80],[80,80,80]]
  },
  identity: {
    label: 'Identity',
    k: [0,0,0,0,1,0,0,0,0], kl: 'Identity δ (3×3)',
    desc: 'Discrete Dirac delta — centre weight 1, all others 0. Convolution with δ is a no-op: I ★ δ = I. This is the baseline; every other kernel is a perturbation of this. Useful for verifying a pipeline is working correctly — output should equal input.',
    eq: 'I ★ δ = I\nδ[i,j] = 1 if i=j=0, else 0',
    exPatch: [[100,150,80],[70,180,120],[90,60,200]]
  }
};

function buildFilterPills() {
  const c = document.getElementById('fpills');
  c.innerHTML = '';
  Object.entries(FILTERS).forEach(([id, f]) => {
    const p = document.createElement('button');
    p.className = 'pill' + (id === 'sobel' ? ' on' : '');
    p.textContent = f.label;
    p.onclick = () => selectFilter(id);
    c.appendChild(p);
  });
}

function selectFilter(id) {
  curF = id;
  document.querySelectorAll('#fpills .pill').forEach(p => p.classList.toggle('on', p.textContent === FILTERS[id].label));
  const f = FILTERS[id];
  renderFilterKernel(f.kd || f.k, 3, f.kl);
  document.getElementById('fdesc').textContent = f.desc;
  document.getElementById('feq').textContent = f.eq;
  document.getElementById('p1-outlabel').textContent = 'Output — ' + f.label;
  renderCalcExample(id, f);
  applyFilter();
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

function renderCalcExample(id, f) {
  const el = document.getElementById('calcExample');
  el.innerHTML = '';
  const patch = f.exPatch;
  const k = f.kd || f.k;
  const div = f.div || 1;
  const isEmboss = id === 'emboss';

  const CELL = 42, CELL_H = 36;

  const mkGrid = (vals, isKernel) => {
    const mx2 = isKernel ? Math.max(...k.map(Math.abs)) : 0;
    const g = document.createElement('div');
    g.style.cssText = `display:inline-grid;grid-template-columns:repeat(3,${CELL}px);gap:3px;flex-shrink:0`;
    vals.forEach((v) => {
      const d = document.createElement('div');
      let bg, col;
      if (isKernel) {
        const c2 = kCellColor(v, mx2);
        bg = c2.bg; col = c2.col;
      } else {
        const lum = Math.round(v / 255 * 100);
        bg = `hsl(0,0%,${lum}%)`; col = v > 128 ? '#222' : '#eee';
      }
      d.style.cssText = `width:${CELL}px;height:${CELL_H}px;display:flex;align-items:center;justify-content:center;font-family:'ui-monospace','SF Mono','Fira Code',monospace;font-size:13px;font-weight:700;border-radius:3px;background:${bg};color:${col}`;
      d.textContent = Number.isInteger(v) ? v : v.toFixed(2);
      g.appendChild(d);
    });
    return g;
  };

  const flat = patch.flat();
  let sum = 0;
  flat.forEach((v, i) => sum += v * k[i]);
  const out = Math.round(Math.min(255, Math.max(0, sum / div + (isEmboss ? 128 : 128))));

  // Top row: input patch ★ kernel
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px';
  row.appendChild(mkGrid(flat, false));
  const star = document.createElement('span');
  star.style.cssText = 'font-size:1.4rem;color:var(--gold);flex-shrink:0;font-weight:700';
  star.textContent = '★';
  row.appendChild(star);
  row.appendChild(mkGrid(k, true));
  el.appendChild(row);

  // Bottom: full equation
  const eq = document.createElement('div');
  const shownTerms = flat.map((v,i) => k[i] !== 0 ? `${v}×${Number.isInteger(k[i]) ? k[i] : k[i].toFixed(2)}` : null).filter(Boolean);
  eq.style.cssText = `font-family:'ui-monospace','SF Mono','Fira Code',monospace;font-size:0.9rem;line-height:1.85;color:#9ca3af;background:#374151;padding:10px 14px;border-radius:5px;border-left:3px solid #f59e0b;white-space:pre-wrap`;
  eq.textContent = '= ' + shownTerms.slice(0,6).join(' + ') + (shownTerms.length > 6 ? '\n  + …' : '') + '\n= ' + Math.round(sum/div) + (isEmboss ? ' + 128 = ' + out : '   →   output: ' + out);
  el.appendChild(eq);
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
  const kx = [-1,0,1,-2,0,2,-1,0,1], ky = [-1,-2,-1,0,0,0,1,2,1];
  for (let y=1; y<h-1; y++) for (let x=1; x<w-1; x++) {
    let gx=0, gy=0;
    for (let j=-1; j<=1; j++) for (let i=-1; i<=1; i++) {
      const px = ((y+j)*w + (x+i)) * 4;
      const l = (id[px] + id[px+1] + id[px+2]) / 3;
      const ki = (j+1)*3 + (i+1);
      gx += l * kx[ki]; gy += l * ky[ki];
    }
    const m = Math.min(255, Math.sqrt(gx*gx + gy*gy));
    const o = (y*w + x) * 4;
    od[o] = od[o+1] = od[o+2] = m; od[o+3] = 255;
  }
  dst.getContext('2d').putImageData(out, 0, 0);
}

function convCanvas(src, dst, k, div, offset) {
  const w = src.width, h = src.height;
  const inp = src.getContext('2d').getImageData(0,0,w,h);
  const out = dst.getContext('2d').createImageData(w, h);
  const id = inp.data, od = out.data;
  for (let y=1; y<h-1; y++) for (let x=1; x<w-1; x++) {
    let r=0,g=0,b=0;
    for (let ky=-1; ky<=1; ky++) for (let kx=-1; kx<=1; kx++) {
      const px = ((y+ky)*w + (x+kx)) * 4;
      const kv = k[(ky+1)*3 + (kx+1)];
      r += id[px]*kv; g += id[px+1]*kv; b += id[px+2]*kv;
    }
    const base = offset ? 128 : (div > 1 ? 0 : 128);
    const o = (y*w + x) * 4;
    od[o]   = Math.min(255, Math.max(0, r/div + base));
    od[o+1] = Math.min(255, Math.max(0, g/div + base));
    od[o+2] = Math.min(255, Math.max(0, b/div + base));
    od[o+3] = 255;
  }
  dst.getContext('2d').putImageData(out, 0, 0);
}

function clearDraw() {
  dctx.fillStyle = '#111';
  dctx.fillRect(0, 0, dc.width, dc.height);
  octx.fillStyle = '#111';
  octx.fillRect(0, 0, oc.width, oc.height);
}

function getPos(canvas, e) {
  const r = canvas.getBoundingClientRect();
  const sx = canvas.width / r.width, sy = canvas.height / r.height;
  const src = e.touches ? e.touches[0] : e;
  return { x: (src.clientX - r.left) * sx, y: (src.clientY - r.top) * sy };
}

dc.addEventListener('mousedown', e => { drawing=true; const p=getPos(dc,e); dctx.beginPath(); dctx.moveTo(p.x,p.y); });
dc.addEventListener('mousemove', e => { if(!drawing)return; const p=getPos(dc,e); dctx.lineTo(p.x,p.y); dctx.strokeStyle='#eee'; dctx.lineWidth=BS; dctx.lineCap='round'; dctx.lineJoin='round'; dctx.stroke(); applyFilter(); });
dc.addEventListener('mouseup', () => drawing=false);
dc.addEventListener('mouseleave', () => drawing=false);
dc.addEventListener('touchstart', e=>{ e.preventDefault(); drawing=true; const p=getPos(dc,e); dctx.beginPath(); dctx.moveTo(p.x,p.y); }, {passive:false});
dc.addEventListener('touchmove', e=>{ e.preventDefault(); if(!drawing)return; const p=getPos(dc,e); dctx.lineTo(p.x,p.y); dctx.strokeStyle='#eee'; dctx.lineWidth=BS; dctx.lineCap='round'; dctx.lineJoin='round'; dctx.stroke(); applyFilter(); }, {passive:false});
dc.addEventListener('touchend', () => drawing=false);

/* ──────────────────────────────────────────
   PARTS 2 + 3: CANNY PIPELINE
────────────────────────────────────────── */
const cin = document.getElementById('cin'), cout = document.getElementById('cout');
const cinctx = cin.getContext('2d'), coutctx = cout.getContext('2d');
const p3inCv = document.getElementById('p3in'), p3outCv = document.getElementById('p3out');
const p3inctx = p3inCv.getContext('2d'), p3outctx = p3outCv.getContext('2d');

let curSrc = 'sample', camStream = null, camRunning = false, rafId = null;
let curP2Step = 'all', curP3Step = 'all';

const IMG_SRC_IMG = './lizard.jpg';
const IMG_SRC_PORTRAIT = './portrait.jpg';
const IMG_SRC_ARCHITECTURE = './architecture.jpg';

function loadImgToAll(src) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    cinctx.drawImage(img, 0, 0, cin.width, cin.height);
    p3inctx.drawImage(img, 0, 0, p3inCv.width, p3inCv.height);
    syncAll();
  };
  img.src = src;
}

function drawFace() {
  const c=cinctx, w=cin.width, h=cin.height;
  c.fillStyle='#111a22'; c.fillRect(0,0,w,h);
  c.fillStyle='#c8aa80'; c.beginPath(); c.ellipse(w*.5,h*.42,55,68,0,0,Math.PI*2); c.fill();
  c.fillStyle='#8a6825'; c.beginPath(); c.ellipse(w*.5,h*.23,56,32,0,0,Math.PI); c.fill();
  c.fillStyle='#111';
  c.beginPath(); c.ellipse(w*.37,h*.38,9,6,-.2,0,Math.PI*2); c.fill();
  c.beginPath(); c.ellipse(w*.63,h*.38,9,6,.2,0,Math.PI*2); c.fill();
  c.strokeStyle='#7a5018'; c.lineWidth=2; c.beginPath(); c.arc(w*.5,h*.52,13,.1,Math.PI-.1); c.stroke();
  c.fillStyle='#2a3a6a'; c.fillRect(w*.15,h*.65,w*.7,h*.38);
  syncAll();
}

function drawTexture() {
  const c=cinctx, w=cin.width, h=cin.height;
  c.fillStyle='#181208'; c.fillRect(0,0,w,h);
  for (let i=0; i<70; i++) {
    c.fillStyle=`hsl(${100+Math.random()*80},${30+Math.random()*40}%,${15+Math.random()*55}%)`;
    c.beginPath(); c.arc(Math.random()*w, Math.random()*h, 4+Math.random()*14, 0, Math.PI*2); c.fill();
  }
  c.strokeStyle='rgba(180,180,100,.3)'; c.lineWidth=1;
  for (let i=0; i<10; i++) { c.beginPath(); c.moveTo(Math.random()*w,0); c.lineTo(Math.random()*w,h); c.stroke(); }
  syncAll();
}

function drawArch() {
  const c=cinctx, w=cin.width, h=cin.height;
  c.fillStyle='#0a0a12'; c.fillRect(0,0,w,h);
  c.strokeStyle='#8899aa'; c.lineWidth=1.5;
  for (let i=0; i<7; i++) { const x=25+i*(w-50)/6; c.beginPath(); c.moveTo(x,h-20); c.lineTo(x,20); c.stroke(); }
  c.strokeStyle='#aabb88'; c.lineWidth=2; c.beginPath(); c.arc(w/2,h-20,110,Math.PI,0); c.stroke();
  c.strokeStyle='#aa8866'; c.lineWidth=1;
  for (let r=40; r<180; r+=28) { c.beginPath(); c.arc(w/2,h/2,r,0,Math.PI*2); c.stroke(); }
  syncAll();
}

function drawPortrait2() {
  const c=cinctx, w=cin.width, h=cin.height;
  c.fillStyle='#080810'; c.fillRect(0,0,w,h);
  // Buildings silhouette
  [[20,h,40,160],[70,h,50,120],[130,h,60,100],[200,h,45,140],[255,h,35,90],[295,h,45,130]].forEach(([x,bot,wi,hi])=>{
    c.fillStyle=`hsl(220,${10+Math.random()*15}%,${15+Math.random()*10}%)`;
    c.fillRect(x,bot-hi,wi,hi);
    for(let wy=bot-hi+10;wy<bot-10;wy+=15){for(let wx=x+5;wx<x+wi-5;wx+=12){if(Math.random()>.4){c.fillStyle='rgba(255,220,80,.6)';c.fillRect(wx,wy,6,8);}}}
  });
  syncAll();
}

function syncAll() {
  p3inctx.drawImage(cin, 0, 0, p3inCv.width, p3inCv.height);
  // Recompute gold standard when lizard is loaded
  if (curSrc === 'sample' && curSampleIdx === 0) computeGoldStandard();
  else goldStandard = null;
  if (_cannySlideIdx === 0) runP2();
  else p3update();
}

const SAMPLES = [
  { label: 'Image', fn: () => loadImgToAll(IMG_SRC_IMG) },
  { label: 'Portrait', fn: () => loadImgToAll(IMG_SRC_PORTRAIT) },
  { label: 'Architecture', fn: () => loadImgToAll(IMG_SRC_ARCHITECTURE) },
];

function buildSamplePills() {
  const c = document.getElementById('spills');
  c.innerHTML = '';
  SAMPLES.forEach((s, i) => {
    const p = document.createElement('button');
    p.className = 'pill' + (i === 0 ? ' on' : '');
    p.textContent = s.label;
    p.onclick = () => { document.querySelectorAll('#spills .pill').forEach(x=>x.classList.remove('on')); p.classList.add('on'); curSampleIdx = i; s.fn(); };
    c.appendChild(p);
  });
}

// STEP DEFINITIONS
const P2STEPS = [
  { id:'blur',      label:'1 · Blur',      note:'Image has been reduced to grayscale, and a 5×5 Gaussian filter with σ=1.4 has been applied.' },
  { id:'gradient',  label:'2 · Gradient',  note:'The intensity gradient of the previous image. The edges of the image have been handled by replicating.' },
  { id:'nms',       label:'3 · NMS',       note:'Non-maximum suppression applied to the previous image.' },
  { id:'threshold', label:'4 · Threshold', note:'Double thresholding applied to the previous image. Weak pixels are those with a gradient value between 0.1 and 0.3. Strong pixels have a gradient value greater than 0.3.' },
  { id:'all',       label:'Full Canny',    note:'The complete Canny result: blur + gradient + NMS + hysteresis applied in sequence.' }
];

const P3STEPS = [
  { id:'blur', label:'1 · Blur', showThr:false, note:'Only σ is active. Set σ=0 to skip blur — watch noise become edges. Increase to see detail merge. The tradeoff is fundamental: more smoothing = less noise = fewer false edges, but also less spatial precision.' },
  { id:'gradient', label:'2 · Gradient', showThr:false, note:'The gradient map directly reflects σ. More blur → smoother gradients → weaker noise response. Watch how high-frequency speckle fades while genuine edges remain bright.' },
  { id:'nms', label:'3 · NMS', showThr:false, note:'NMS is deterministic — no parameters here. But σ still matters: noisy gradients produce unstable direction estimates, breaking edges into fragments. Good σ = cleaner, more continuous thinned lines.' },
  { id:'threshold', label:'4 · Threshold', showThr:true, note:'T_hi and T_lo now become meaningful. Raise T_hi to keep only dominant edges. Lower it to accept faint ones. The blue band between T_lo and T_hi feeds hysteresis. Try extreme values to see both failure modes.' },
  { id:'all', label:'Full Canny', showThr:true, note:'All three hyperparameters live simultaneously. Try the presets: "σ=0 no blur" shows noise exploding; "High T_hi" shows only dominant contours; "T_lo ≈ T_hi" removes hysteresis — no weak edges ever recover.' }
];

function buildSharedStepBar() {
  const bar = document.getElementById('sharedStepBar');
  if (!bar) return;
  bar.innerHTML = '';
  P2STEPS.forEach(s => {
    const p = document.createElement('button');
    p.className = 'step-pill' + (s.id === curP2Step ? ' on' : '');
    p.textContent = s.label;
    p.onclick = () => {
      if (_cannySlideIdx === 0) setP2Step(s.id);
      else setP3Step(s.id);
    };
    bar.appendChild(p);
  });
}

function setP2Step(id) {
  curP2Step = id;
  document.querySelectorAll('#sharedStepBar .step-pill').forEach((p,i) => p.classList.toggle('on', P2STEPS[i].id === id));
  const cfg = P2STEPS.find(s => s.id === id);
  const lbl = document.getElementById('shared-outlabel');
  if (lbl) lbl.textContent = id === 'all' ? 'Full Canny' : cfg.label.replace(/^\d+ · /, '');
  const note = document.getElementById('p2-note');
  if (note) note.textContent = cfg.note;
  runP2();
}

function setP3Step(id) {
  curP3Step = id;
  document.querySelectorAll('#sharedStepBar .step-pill').forEach((p,i) => p.classList.toggle('on', P3STEPS[i].id === id));
  p3update();
}

// ── CANNY MATH ──
function getGray(imgd, w, h) {
  const g = new Float32Array(w*h);
  for (let i=0; i<w*h; i++) {
    const d = imgd.data;
    g[i] = d[i*4]*0.299 + d[i*4+1]*0.587 + d[i*4+2]*0.114;
  }
  return g;
}

function gaussBlur(g, w, h, sigma) {
  if (sigma === 0) return new Float32Array(g);
  const r = Math.max(1, Math.ceil(sigma*3)), size = 2*r+1;
  const k = new Float32Array(size); let sum = 0;
  for (let i=0; i<size; i++) { k[i] = Math.exp(-((i-r)**2) / (2*sigma*sigma)); sum += k[i]; }
  for (let i=0; i<size; i++) k[i] /= sum;
  const tmp = new Float32Array(w*h), out = new Float32Array(w*h);
  for (let y=0; y<h; y++) for (let x=0; x<w; x++) {
    let s=0; for (let d=-r; d<=r; d++) { const nx=Math.max(0,Math.min(w-1,x+d)); s+=g[y*w+nx]*k[d+r]; }
    tmp[y*w+x]=s;
  }
  for (let y=0; y<h; y++) for (let x=0; x<w; x++) {
    let s=0; for (let d=-r; d<=r; d++) { const ny=Math.max(0,Math.min(h-1,y+d)); s+=tmp[ny*w+x]*k[d+r]; }
    out[y*w+x]=s;
  }
  return out;
}

function computeSobel(b, w, h) {
  // Edge-replicated padding: clamp coordinates instead of leaving borders at 0
  const get = (y, x) => b[Math.max(0,Math.min(h-1,y))*w + Math.max(0,Math.min(w-1,x))];
  const mag=new Float32Array(w*h), dir=new Float32Array(w*h);
  const kx=[-1,0,1,-2,0,2,-1,0,1], ky=[-1,-2,-1,0,0,0,1,2,1]; let mx=0;
  for (let y=0; y<h; y++) for (let x=0; x<w; x++) {
    let gx=0, gy=0;
    for (let j=-1; j<=1; j++) for (let i=-1; i<=1; i++) {
      const v = get(y+j, x+i), ki=(j+1)*3+(i+1);
      gx+=v*kx[ki]; gy+=v*ky[ki];
    }
    const m=Math.sqrt(gx*gx+gy*gy);
    mag[y*w+x]=m; if(m>mx)mx=m; dir[y*w+x]=Math.atan2(gy,gx);
  }
  return {mag, dir, maxMag:mx||1};
}

function applyNMS(mag, dir, w, h) {
  // Sub-pixel interpolated NMS: compare along continuous gradient direction
  const out = new Float32Array(w*h);
  const interp = (fx, fy) => {
    const x0=Math.floor(fx), y0=Math.floor(fy), x1=x0+1, y1=y0+1;
    if(x0<0||x1>=w||y0<0||y1>=h) return 0;
    const dx=fx-x0, dy=fy-y0;
    return mag[y0*w+x0]*(1-dx)*(1-dy) + mag[y0*w+x1]*dx*(1-dy)
         + mag[y1*w+x0]*(1-dx)*dy     + mag[y1*w+x1]*dx*dy;
  };
  for (let y=1; y<h-1; y++) for (let x=1; x<w-1; x++) {
    const c=Math.cos(dir[y*w+x]), s=Math.sin(dir[y*w+x]);
    const p=interp(x+c, y+s), q=interp(x-c, y-s);
    out[y*w+x] = (mag[y*w+x]>=p && mag[y*w+x]>=q) ? mag[y*w+x] : 0;
  }
  return out;
}

function runHysteresis(nms, w, h, maxMag, thi, tloR) {
  const hi=maxMag*thi, lo=maxMag*thi*tloR;
  const s=new Uint8Array(w*h);
  for(let i=0;i<w*h;i++){if(nms[i]>=hi)s[i]=2;else if(nms[i]>=lo)s[i]=1;}
  const stack=[]; for(let i=0;i<w*h;i++)if(s[i]===2)stack.push(i);
  while(stack.length){
    const idx=stack.pop(),y=Math.floor(idx/w),x=idx%w;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dy&&!dx)continue;
      const ny=y+dy,nx=x+dx;
      if(ny<0||ny>=h||nx<0||nx>=w)continue;
      const ni=ny*w+nx; if(s[ni]===1){s[ni]=2;stack.push(ni);}
    }
  }
  const out=new Uint8Array(w*h);
  for(let i=0;i<w*h;i++)out[i]=s[i]===2?255:0;
  return out;
}

function putGrayF(ctx,d,w,h,mx){
  const id=ctx.createImageData(w,h); const m=mx||Math.max(...d)||1;
  for(let i=0;i<w*h;i++){const v=Math.min(255,Math.round(d[i]/m*255));id.data[i*4]=id.data[i*4+1]=id.data[i*4+2]=v;id.data[i*4+3]=255;}
  ctx.putImageData(id,0,0);
}
function putBin(ctx,d,w,h){
  const id=ctx.createImageData(w,h);
  for(let i=0;i<w*h;i++){id.data[i*4]=id.data[i*4+1]=id.data[i*4+2]=d[i];id.data[i*4+3]=255;}
  ctx.putImageData(id,0,0);
}
function putThr(ctx,nms,w,h,maxMag,thi,tloR){
  const hi=maxMag*thi,lo=maxMag*thi*tloR;
  const id=ctx.createImageData(w,h);
  for(let i=0;i<w*h;i++){
    if(nms[i]>=hi){id.data[i*4]=255;id.data[i*4+1]=255;id.data[i*4+2]=255;}
    else if(nms[i]>=lo){id.data[i*4]=59;id.data[i*4+1]=139;id.data[i*4+2]=212;}
    else{id.data[i*4]=id.data[i*4+1]=id.data[i*4+2]=0;}
    id.data[i*4+3]=255;
  }
  ctx.putImageData(id,0,0);
}

function runP2() {
  // σ=1.4 (5×5 Gaussian), thi=0.30, tlo=0.10 — matching standard Canny parameters
  const w=cin.width, h=cin.height, sigma=1.4, thi=0.30, tlo=0.10;
  const tloR = tlo / thi; // ratio for runHysteresis / putThr
  const g=getGray(cinctx.getImageData(0,0,w,h),w,h);
  const b=gaussBlur(g,w,h,sigma);
  if(curP2Step==='blur'){putGrayF(coutctx,b,w,h,255);return;}
  const {mag,dir,maxMag}=computeSobel(b,w,h);
  if(curP2Step==='gradient'){putGrayF(coutctx,mag,w,h,maxMag);return;}
  const nms=applyNMS(mag,dir,w,h);
  if(curP2Step==='nms'){putGrayF(coutctx,nms,w,h,maxMag);return;}
  if(curP2Step==='threshold'){putThr(coutctx,nms,w,h,maxMag,thi,tloR);return;}
  putBin(coutctx,runHysteresis(nms,w,h,maxMag,thi,tloR),w,h);
}

function p3update() {
  const sigma=+document.getElementById('p3sigma').value;
  const thi=+document.getElementById('p3thi').value/100;
  const tloR=+document.getElementById('p3tlo').value/100;
  document.getElementById('p3sv').textContent = sigma;
  document.getElementById('p3thv').textContent = Math.round(thi*100) + '%';
  document.getElementById('p3tlv').textContent = Math.round(tloR*100) + '%';
  // Render into the shared output canvas (coutctx)
  const w=p3inCv.width,h=p3inCv.height;
  const g=getGray(p3inctx.getImageData(0,0,w,h),w,h);
  const b=gaussBlur(g,w,h,sigma);
  if(curP3Step==='blur'){putGrayF(coutctx,b,w,h,255);}
  else {
    const {mag,dir,maxMag}=computeSobel(b,w,h);
    if(curP3Step==='gradient'){putGrayF(coutctx,mag,w,h,maxMag);}
    else {
      const nms=applyNMS(mag,dir,w,h);
      if(curP3Step==='nms'){putGrayF(coutctx,nms,w,h,maxMag);}
      else if(curP3Step==='threshold'){putThr(coutctx,nms,w,h,maxMag,thi,tloR);}
      else{putBin(coutctx,runHysteresis(nms,w,h,maxMag,thi,tloR),w,h);}
    }
  }
  const cfg = P3STEPS.find(s=>s.id===curP3Step);
  const notes = [cfg.note];
  if(sigma===0) notes.push('σ=0: no blur → noise creates false edges everywhere.');
  else if(sigma>=4) notes.push(`σ=${sigma}: heavy blur → fine boundaries begin to merge.`);
  if(cfg.showThr) {
    const thiPct=Math.round(thi*100);
    if(thiPct>=50) notes.push(`T_hi=${thiPct}%: strict — only dominant gradients survive as strong edges.`);
    else if(thiPct<=10) notes.push(`T_hi=${thiPct}%: permissive — risk of noise qualifying as strong edges.`);
    const tloPct=Math.round(tloR*100);
    if(tloPct>=70) notes.push(`T_lo=${tloPct}%: narrow hysteresis band, few weak edges recovered.`);
    else if(tloPct<=20) notes.push(`T_lo=${tloPct}%: wide band, many weak edges recovered.`);
  }
  const p3note = document.getElementById('p3-note');
  if (p3note) p3note.textContent = notes.join('  ·  ');
  // Update shared output label
  const lbl = document.getElementById('shared-outlabel');
  if (lbl) {
    lbl.textContent = curP3Step === 'all'
      ? `Full Canny  (σ=${sigma}, T_hi=${Math.round(thi*100)}%, T_lo=${Math.round(thi*tloR*100)}%)`
      : (P3STEPS.find(s=>s.id===curP3Step)?.label.replace(/^\d+ · /, '') || 'Output');
  }
  // Quiz score (only on Full Canny step with lizard active)
  if (curP3Step === 'all' && isQuizActive()) {
    const w2 = p3inCv.width, h2 = p3inCv.height;
    const g2 = getGray(p3inctx.getImageData(0,0,w2,h2), w2, h2);
    const b2 = gaussBlur(g2, w2, h2, sigma);
    const { mag: mag2, dir: dir2, maxMag: maxMag2 } = computeSobel(b2, w2, h2);
    const nms2 = applyNMS(mag2, dir2, w2, h2);
    const userMask = runHysteresis(nms2, w2, h2, maxMag2, thi, tloR);
    updateQuizUI(computeQuizScore(userMask), sigma, thi, tloR);
  } else {
    updateQuizUI(null, sigma, thi, tloR);
  }
}

function p3preset(s,th,tl) {
  document.getElementById('p3sigma').value=s;
  document.getElementById('p3thi').value=th;
  document.getElementById('p3tlo').value=tl;
  p3update();
}

function setSrc(s) {
  curSrc = s;
  ['sample','upload','cam'].forEach(id=>{
    document.getElementById('src-'+id).style.display = id===s ? '' : 'none';
  });
  document.querySelectorAll('.src-card').forEach(t => t.classList.toggle('on', t.dataset.src === s));
  if(s!=='cam' && camRunning) stopCam();
  if(s==='sample') SAMPLES[0].fn();
}

function loadFile(input) {
  const f = input.files[0]; if(!f) return;
  const img = new Image();
  img.onload = () => {
    cinctx.drawImage(img,0,0,cin.width,cin.height);
    p3inctx.drawImage(img,0,0,p3inCv.width,p3inCv.height);
    syncAll(); URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f);
}

async function toggleCam() {
  if(camRunning) { stopCam(); return; }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({video:{width:340,height:255}});
    const v = document.getElementById('vid');
    v.srcObject = camStream; v.style.display='block';
    v.onloadedmetadata = () => {
      camRunning=true;
      document.getElementById('cbtn').innerHTML='<span class="cam-btn-icon">⏹</span> Stop camera';
      document.getElementById('cstat').textContent='● Live';
      camLoop();
    };
  } catch(e) { document.getElementById('cstat').textContent='Camera unavailable'; }
}
function stopCam() {
  camRunning=false;
  if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null;}
  if(rafId){cancelAnimationFrame(rafId);rafId=null;}
  document.getElementById('vid').style.display='none';
  document.getElementById('cbtn').innerHTML='<span class="cam-btn-icon">▶</span> Start camera';
  document.getElementById('cstat').textContent='';
}
function camLoop() {
  if(!camRunning)return;
  cinctx.drawImage(document.getElementById('vid'),0,0,cin.width,cin.height);
  p3inctx.drawImage(document.getElementById('vid'),0,0,p3inCv.width,p3inCv.height);
  if (_cannySlideIdx === 0) runP2(); else p3update();
  rafId=requestAnimationFrame(camLoop);
}

/* ──────────────────────────────────────────
   CANNY SLIDE NAVIGATION (parts 02 ↔ 03)
────────────────────────────────────────── */
let _cannySlideIdx = 0;
function cannySlide(idx) {
  _cannySlideIdx = idx;
  const track = document.getElementById('cannyTrack');
  if (track) track.style.transform = `translateX(${-idx * 100}%)`;
  // Update big toggle button appearance
  const btn  = document.getElementById('slideNavBigBtn');
  const lbl  = document.getElementById('slideNavLabel');
  const arrow = document.getElementById('slideNavArrow');
  // Show/hide pipeline-only panel
  const panel = document.getElementById('pipelineOnlyPanel');
  if (panel) panel.classList.toggle('hidden', idx === 1);

  if (idx === 0) {
    if (lbl)   lbl.textContent   = 'Hyperparameter Tuning';
    if (arrow) arrow.textContent = '→';
    if (btn)   btn.classList.remove('is-back');
    // Sync step and render pipeline view
    curP2Step = curP3Step;
    document.querySelectorAll('#sharedStepBar .step-pill').forEach((p,i) =>
      p.classList.toggle('on', P2STEPS[i].id === curP2Step));
    const cfg2 = P2STEPS.find(s => s.id === curP2Step);
    const note = document.getElementById('p2-note');
    if (note && cfg2) note.textContent = cfg2.note;
    const outlbl = document.getElementById('shared-outlabel');
    if (outlbl && cfg2) outlbl.textContent = curP2Step === 'all' ? 'Full Canny' : cfg2.label.replace(/^\d+ · /, '');
    runP2();
  } else {
    if (lbl)   lbl.textContent   = 'Back to Pipeline';
    if (arrow) arrow.textContent = '←';
    if (btn)   btn.classList.add('is-back');
    // Force Full Canny step on entering tuning
    curP3Step = 'all';
    document.querySelectorAll('#sharedStepBar .step-pill').forEach((p,i) =>
      p.classList.toggle('on', P3STEPS[i].id === curP3Step));
    // First visit: set challenge starting params
    if (!_quizStarted) {
      _quizStarted = true;
      document.getElementById('p3sigma').value = QUIZ_START.sigma;
      document.getElementById('p3thi').value   = QUIZ_START.thi;
      document.getElementById('p3tlo').value   = QUIZ_START.tlo;
    }
    p3update();
  }
}
function cannySlideToggle() {
  cannySlide(_cannySlideIdx === 0 ? 1 : 0);
}

/* ──────────────────────────────────────────
   QUIZ — Lizard Challenge
────────────────────────────────────────── */
let goldStandard = null;     // binary edge mask at optimal params
let _quizStarted  = false;   // first-visit flag to set challenge start sliders
let curSampleIdx  = 0;       // which sample pill is active

// Gold standard: σ=1, T_hi=28%, T_lo ratio=38%
const QUIZ_GOLD = { sigma: 1, thi: 0.28, tloR: 0.38 };
// Challenge starting values (intentionally bad)
const QUIZ_START = { sigma: 4, thi: 60, tlo: 20 };

function computeGoldStandard() {
  const w = p3inCv.width, h = p3inCv.height;
  const g = getGray(p3inctx.getImageData(0,0,w,h), w, h);
  const b = gaussBlur(g, w, h, QUIZ_GOLD.sigma);
  const { mag, dir, maxMag } = computeSobel(b, w, h);
  const nms = applyNMS(mag, dir, w, h);
  goldStandard = runHysteresis(nms, w, h, maxMag, QUIZ_GOLD.thi, QUIZ_GOLD.tloR);
}

function isQuizActive() {
  return _cannySlideIdx === 1 && curSrc === 'sample' && curSampleIdx === 0;
}

function computeQuizScore(userEdgeMask) {
  if (!goldStandard || !userEdgeMask) return null;
  let inter = 0, union = 0;
  for (let i = 0; i < goldStandard.length; i++) {
    const g = goldStandard[i] > 0 ? 1 : 0;
    const u = userEdgeMask[i] > 0 ? 1 : 0;
    if (g && u) inter++;
    if (g || u) union++;
  }
  return union === 0 ? 0 : Math.round(inter / union * 100);
}

function updateQuizUI(score, sigma, thi, tloR) {
  const numEl  = document.getElementById('quizScoreNum');
  const ring   = document.getElementById('quizRingFill');
  const hintsEl = document.getElementById('quizHints');
  const panel  = document.getElementById('quizPanel');
  if (!panel) return;

  // Show / hide based on whether quiz is active
  const active = isQuizActive() && curP3Step === 'all';
  panel.classList.toggle('quiz-inactive', !active);

  if (active && score !== null) {
    if (numEl)  numEl.textContent = score;
    if (ring) {
      const C = 238.76; // 2π × 38
      ring.style.strokeDashoffset = C * (1 - score / 100);
      ring.style.stroke = score >= 88 ? '#10b981'
                        : score >= 68 ? '#2563eb'
                        : score >= 44 ? '#f59e0b'
                        : '#ef4444';
    }
    // Hints
    const hints = [];
    if (sigma === 0)  hints.push('⚠️ No blur — sensor noise fires as edges everywhere. Raise σ.');
    else if (sigma >= 4) hints.push('⚠️ Heavy blur — fine scale detail is merging. Try σ ≤ 2.');
    const thiPct = Math.round(thi * 100);
    if (thiPct > 55)  hints.push('⚠️ T_hi too strict — real edges are being missed. Try below 40%.');
    else if (thiPct < 12) hints.push('⚠️ T_hi too low — noise qualifies as strong edges.');
    const tloPct = Math.round(tloR * 100);
    if (tloPct > 75)  hints.push('⚠️ Narrow hysteresis band — few weak edges recovered.');
    if (score >= 88)  hints.push('🌟 Excellent! Near-optimal parameters found.');
    else if (score >= 68) hints.push('✓ Good — main edges clean. Keep fine-tuning.');
    else if (score >= 44) hints.push('Getting closer. Compare noise vs. missed outlines.');
    if (hintsEl) hintsEl.innerHTML = hints.map(h => `<div class="quiz-hint">${h}</div>`).join('');
  } else if (!active) {
    if (numEl)  numEl.textContent = '—';
    if (ring)   ring.style.strokeDashoffset = 238.76;
    if (hintsEl) {
      hintsEl.innerHTML = curP3Step !== 'all'
        ? '<div class="quiz-hint quiz-hint--info">Switch to Full Canny step to see your score.</div>'
        : curSampleIdx !== 0
          ? '<div class="quiz-hint quiz-hint--info">Return to the Lizard image to start the challenge.</div>'
          : '';
    }
  }
}

function revealOptimalParams() {
  const startSigma = +document.getElementById('p3sigma').value;
  const startThi   = +document.getElementById('p3thi').value;
  const startTlo   = +document.getElementById('p3tlo').value;
  const targetSigma = QUIZ_GOLD.sigma;
  const targetThi   = Math.round(QUIZ_GOLD.thi * 100);
  const targetTlo   = Math.round(QUIZ_GOLD.tloR * 100);
  const dur = 1400, t0 = performance.now();
  const ease = t => t < .5 ? 2*t*t : -1+(4-2*t)*t;
  const frame = now => {
    const t = Math.min(1, (now - t0) / dur);
    const e = ease(t);
    document.getElementById('p3sigma').value = Math.round(startSigma + (targetSigma - startSigma) * e);
    document.getElementById('p3thi').value   = Math.round(startThi   + (targetThi   - startThi)   * e);
    document.getElementById('p3tlo').value   = Math.round(startTlo   + (targetTlo   - startTlo)   * e);
    p3update();
    if (t < 1) requestAnimationFrame(frame);
    else showRevealExplanation();
  };
  requestAnimationFrame(frame);
  const btn = document.getElementById('quizRevealBtn');
  if (btn) btn.style.display = 'none';
}

function showRevealExplanation() {
  const el = document.getElementById('quizExplanation');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `
    <div class="quiz-reveal-block">
      <div class="quiz-reveal-title">Why these values?</div>
      <p><strong>σ = 1</strong> removes camera sensor noise while preserving the lizard's fine scale edges — which would blur away at σ ≥ 3.</p>
      <p><strong>T_hi = 28%</strong> captures the strong body contour and main outline without being so strict it misses faint scale boundaries.</p>
      <p><strong>T_lo ratio = 38%</strong> sets the hysteresis band wide enough that scale edges connected to the body outline are recovered, without dragging in unconnected noise.</p>
    </div>
  `;
}

/* ──────────────────────────────────────────
   INIT
────────────────────────────────────────── */
buildFilterPills();
selectFilter('sobel');
clearDraw();
buildSamplePills();
buildSharedStepBar();
setP2Step('all');
rebuildAnim();
SAMPLES[0].fn(); // Start with lizard image as default
