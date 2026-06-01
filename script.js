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
  return { k: Array(ks * ks).fill(weight), label: `${ks}×${ks} averaging blur — each weight is 1/${ks * ks}` };
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
  document.getElementById('outputSizeLabel').textContent = `${outs}×${outs}`;
  const outLbl = document.getElementById('animOutLabel');
  if (outLbl) outLbl.textContent = `Output (${outs}×${outs})`;
  stopPlay();
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

function formatOutputAdjustment(value, output) {
  if (value < 0 || value > 255) return ` → clamped → ${output}`;
  if (value !== output) return ` → rounded → ${output}`;
  return '';
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
  document.getElementById('animCalc').textContent = shown
    + formatOutputAdjustment(raw, clamped);
  document.getElementById('animInlineResult').textContent = clamped;
  document.getElementById('animResult').textContent = clamped;
  const or = Math.floor(pos / outs), oc = pos % outs;
  document.getElementById('animResultSub').textContent = `out[${or}][${oc}]`;
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
    k: [1,2,1,2,4,2,1,2,1], div: 16, kl: 'Gaussian ≈ 3×3',
    desc: 'Smooth the image before detecting edges. This weighted neighbourhood average approximates a 2D Gaussian distribution. All weights are positive and sum to 1. The centre contributes most, the diagonals least.',
    eq: 'G_σ(x,y) = (1/(2πσ²))·exp(−(x²+y²)/(2σ²))\n\n≈  G_{0.85}  =  | 1  2  1 |\n                | 2  4  2 |  ÷ 16\n                | 1  2  1 |',
    exPatch: [[0,0,0,0],[0,160,0,0],[0,0,0,0],[0,0,0,0]],
    exNote: 'A single bright pixel spreads into nearby outputs because each overlapping window computes a weighted average.'
  },
  sobel: {
    label: 'Sobel',
    kd: [-1,0,1,-2,0,2,-1,0,1], kl: 'Sobel X (3×3)',
    desc: 'Sobel X measures how quickly pixel intensity changes from left to right. Flat regions produce values near zero. A strong vertical boundary produces a large response because one side of the neighbourhood is darker than the other.',
    eq: 'Gx = I * k_x\nGy = I * k_y\n|∇I| = √(Gx² + Gy²)\nθ  = atan2(Gy, Gx)',
    exPatch: [[10,10,10,50],[10,10,10,50],[10,10,10,50],[10,10,10,50]],
    exNote: 'The left windows see a flat region and cancel to 0. The right windows cross a vertical boundary and produce a strong response.'
  },
  laplacian: {
    label: 'Laplacian',
    group: 'explore',
    k: [0,1,0,1,-4,1,0,1,0], kl: 'Laplacian (3×3)',
    desc: 'Second-order isotropic derivative ∇²I = ∂²I/∂x² + ∂²I/∂y². Responds to curvature of the intensity surface. Zero-crossings locate edge centres precisely. Highly noise-sensitive — combine with Gaussian first (LoG filter).',
    eq: '∇²I = ∂²I/∂x² + ∂²I/∂y²\n\n        = I *  | 0   1   0 |\n               | 1  -4   1 |\n               | 0   1   0 |',
    exPatch: [[20,20,20,20],[20,100,20,20],[20,20,20,20],[20,20,20,20]],
    exNote: 'An isolated bright pixel differs sharply from its neighbours, so the second derivative responds around that point.'
  },
  sharpen: {
    label: 'Sharpen',
    group: 'explore',
    k: [0,-1,0,-1,5,-1,0,-1,0], kl: 'Unsharp mask (3×3)',
    desc: 'Identity minus a scaled Laplacian: I − α∇²I with α=1. Amplifies high-frequency detail, making edges appear crisper. The centre weight 5 comes from subtracting the Laplacian\'s −4 centre from the identity\'s 1 (1 − (−4) = 5), so it amplifies the pixel relative to its neighbours rather than merely copying it.',
    eq: 'S = I − α∇²I  (α = 1)\n\n  = I *  |  0  -1   0 |\n         | -1   5  -1 |\n         |  0  -1   0 |',
    exPatch: [[30,30,90,90],[30,30,90,90],[30,30,90,90],[30,30,90,90]],
    exNote: 'Across the boundary, sharpening darkens the darker side and brightens the lighter side, increasing local contrast.'
  },
  emboss: {
    label: 'Emboss',
    group: 'explore',
    k: [-2,-1,0,-1,1,1,0,1,2], kl: 'Emboss (3×3)',
    desc: 'Asymmetric first-derivative kernel. Negative weights on the top-left subtract, positive on the bottom-right add — equivalent to a directional gradient at ~45°. Output is offset by +128 so negative gradients render as gray, not black. Produces a relief-like 3D effect.',
    eq: 'E = I * k_emb + 128',
    exPatch: [[0,0,0,0],[0,20,0,0],[0,0,0,0],[0,0,0,0]],
    exNote: 'The single 20 lands on a different kernel weight as the window slides. The +128 offset makes positive responses lighter than the middle gray and negative responses darker.'
  },
  identity: {
    label: 'Identity',
    group: 'explore',
    k: [0,0,0,0,1,0,0,0,0], kl: 'Identity (3×3)',
    desc: 'The centre weight is 1 and every other weight is 0, so each output simply copies the centre input pixel. The image stays unchanged. This identity kernel is useful for checking that a filter pipeline is working correctly.',
    eq: 'I * identity = I',
    exPatch: [[10,20,30,40],[50,60,70,80],[90,100,110,120],[130,140,150,160]],
    exNote: 'Identity copies the centre pixel of each window unchanged. The four outputs are the four interior input values.'
  }
};

function buildFilterPills() {
  const c = document.getElementById('fpills');
  c.innerHTML = '';
  Object.entries(FILTERS).forEach(([id, f]) => {
    const p = document.createElement('button');
    p.className = 'pill' + (id === curF ? ' on' : '');
    p.id = 'filter-' + id;
    p.dataset.filter = id;
    p.textContent = f.label;
    p.onclick = () => selectFilter(id);
    c.appendChild(p);
  });
}

const FILTER_MATH_DETAIL = {
  blur: {
    hdrClass: 'blur', hdrText: 'Blur — Gaussian',
    kernel: [{v:'1',c:'pos-lo'},{v:'2',c:'pos-md'},{v:'1',c:'pos-lo'},{v:'2',c:'pos-md'},{v:'4',c:'pos-hi'},{v:'2',c:'pos-md'},{v:'1',c:'pos-lo'},{v:'2',c:'pos-md'},{v:'1',c:'pos-lo'}],
    kLabel: '÷ 16 &nbsp;(Gaussian 3×3)',
    eq: 'out(x,y) = <sup>1</sup>/<sub>16</sub> Σ k(i,j)·I(x+i, y+j)',
    prop: '<strong>Σw = 1</strong> — output is a weighted local average. Flat regions reproduce exactly; rapid intensity changes are averaged away, reducing noise and fine detail.',
  },
  sobel: {
    hdrClass: 'edge', hdrText: 'Edge Detection — Sobel X',
    kernel: [{v:'−1',c:'neg'},{v:'0',c:'zero'},{v:'+1',c:'pos-md'},{v:'−2',c:'neg-hi'},{v:'0',c:'zero'},{v:'+2',c:'pos-hi'},{v:'−1',c:'neg'},{v:'0',c:'zero'},{v:'+1',c:'pos-md'}],
    kLabel: 'Sobel X &nbsp;≈ ∂I/∂x',
    eq: 'Gx(x,y) ≈ I(x+1, y) − I(x−1, y)',
    prop: '<strong>Σw = 0</strong> — left and right halves are mirror opposites. Where intensity is constant they cancel. Where intensity changes, the difference is large — that pixel is an edge.',
  },
  laplacian: {
    hdrClass: 'edge', hdrText: 'Laplacian',
    kernel: [{v:'0',c:'zero'},{v:'1',c:'pos-lo'},{v:'0',c:'zero'},{v:'1',c:'pos-lo'},{v:'−4',c:'neg-hi'},{v:'1',c:'pos-lo'},{v:'0',c:'zero'},{v:'1',c:'pos-lo'},{v:'0',c:'zero'}],
    kLabel: '∇² (3×3)',
    eq: '∇²I = ∂²I/∂x² + ∂²I/∂y²',
    prop: '<strong>Σw = 0</strong> — second-order derivative. Zero-crossings locate edge centres precisely. Highly noise-sensitive — usually combined with Gaussian blur (LoG filter).',
  },
  sharpen: {
    hdrClass: 'sharp', hdrText: 'Sharpen — Unsharp Mask',
    kernel: [{v:'0',c:'zero'},{v:'−1',c:'neg'},{v:'0',c:'zero'},{v:'−1',c:'neg'},{v:'+5',c:'pos-hi'},{v:'−1',c:'neg'},{v:'0',c:'zero'},{v:'−1',c:'neg'},{v:'0',c:'zero'}],
    kLabel: 'δ − ∇²',
    eq: 'S = I − α∇²I,&nbsp; α = 1',
    prop: '<strong>Centre = 5, ring = −1</strong> — centre weight comes from identity (1) minus Laplacian centre (−4), giving 1 − (−4) = 5. This amplifies the pixel relative to its surroundings rather than merely copying it, boosting edges.',
  },
  emboss: {
    hdrClass: 'sharp', hdrText: 'Emboss',
    kernel: [{v:'−2',c:'neg-hi'},{v:'−1',c:'neg'},{v:'0',c:'zero'},{v:'−1',c:'neg'},{v:'1',c:'pos-lo'},{v:'1',c:'pos-lo'},{v:'0',c:'zero'},{v:'1',c:'pos-lo'},{v:'2',c:'pos-md'}],
    kLabel: 'Emboss (3×3)',
    eq: 'E = I * k<sub>emb</sub> + 128',
    prop: '<strong>Asymmetric gradient</strong> — negative weights on top-left, positive on bottom-right. Output is offset by +128 so flat regions appear gray. Produces a 3D relief effect.',
  },
  identity: {
    hdrClass: 'blur', hdrText: 'Identity',
    kernel: [{v:'0',c:'zero'},{v:'0',c:'zero'},{v:'0',c:'zero'},{v:'0',c:'zero'},{v:'1',c:'pos-hi'},{v:'0',c:'zero'},{v:'0',c:'zero'},{v:'0',c:'zero'},{v:'0',c:'zero'}],
    kLabel: 'Identity (3×3)',
    eq: 'I * identity = I',
    prop: '<strong>Centre = 1, all others = 0</strong> — the filter copies the centre pixel unchanged. Output equals input exactly, making this a useful baseline for checking a processing pipeline.',
  },
};

function renderFbFilterDetail(id) {
  const el = document.getElementById('fbFilterDetail');
  if (!el) return;
  const d = FILTER_MATH_DETAIL[id];
  if (!d) { el.innerHTML = ''; return; }
  const cells = d.kernel.map(c => `<span class="fb-cell fb-cell--${c.c}">${c.v}</span>`).join('');
  el.innerHTML = `
    <div class="fb-filter-card fb-filter-card--live">
      <span class="fb-filter-header fb-filter-header--${d.hdrClass}">${d.hdrText}</span>
      <div class="fb-filter-card-body">
        <div class="fb-kernel">
          <div class="fb-kernel-grid">${cells}</div>
          <div class="fb-kernel-label">${d.kLabel}</div>
        </div>
        <div class="fb-math">
          <div class="fb-math-eq">${d.eq}</div>
          <p class="fb-math-prop">${d.prop}</p>
        </div>
      </div>
    </div>
  `;
}

function selectFilter(id) {
  curF = id;
  document.querySelectorAll('#fpills .pill').forEach(p => p.classList.toggle('on', p.dataset.filter === id));
  const f = FILTERS[id];
  renderFilterKernel(f.kd || f.k, 3, f.kl);
  document.getElementById('fdesc').textContent = f.desc;
  document.getElementById('p1-outlabel').textContent = 'Output — ' + f.label;
  renderCalcExample(id, f);
  renderFbFilterDetail(id);
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

let calcExampleTimer = null;

function renderCalcExample(id, f, activeOutput = 0) {
  clearTimeout(calcExampleTimer);
  const el = document.getElementById('calcExample');
  el.innerHTML = '';
  const patch = f.exPatch;
  const k = f.kd || f.k;
  const div = f.div || 1;
  const isEmboss = id === 'emboss';

  const CELL = 36, CELL_H = 32;
  const windowColors = ['#f59e0b', '#3b82f6', '#10b981', '#a855f7'];

  const activeRow = Math.floor(activeOutput / 2);
  const activeCol = activeOutput % 2;

  const mkGrid = (vals, isKernel, cols = 3, activeSize = 0) => {
    const mx2 = isKernel ? Math.max(...k.map(Math.abs)) : 0;
    const g = document.createElement('div');
    g.style.cssText = `display:inline-grid;grid-template-columns:repeat(${cols},${CELL}px);gap:3px;flex-shrink:0;position:relative`;
    vals.forEach((v, index) => {
      const d = document.createElement('div');
      let bg, col;
      if (isKernel) {
        const c2 = kCellColor(v, mx2);
        bg = c2.bg; col = c2.col;
      } else {
        const lum = Math.round(92 - v / 255 * 76);
        bg = `hsl(0,0%,${lum}%)`; col = lum > 58 ? '#111827' : '#f9fafb';
      }
      d.style.cssText = `width:${CELL}px;height:${CELL_H}px;display:flex;align-items:center;justify-content:center;font-family:'ui-monospace','SF Mono','Fira Code',monospace;font-size:13px;font-weight:700;border-radius:3px;background:${bg};color:${col}`;
      const row = Math.floor(index / cols), cellCol = index % cols;
      if (!isKernel && activeSize && (row < activeRow || row >= activeRow + activeSize || cellCol < activeCol || cellCol >= activeCol + activeSize)) {
        d.style.opacity = '.38';
      }
      d.textContent = Number.isInteger(v) ? v : v.toFixed(2);
      g.appendChild(d);
    });
    if (!isKernel && activeSize) {
      [0, 1, 2, 3].forEach(outputIndex => {
        const row = Math.floor(outputIndex / 2), col = outputIndex % 2;
        const outline = document.createElement('div');
        outline.className = 'calc-window-outline' + (outputIndex === activeOutput ? ' on' : '');
        outline.style.cssText = `left:${col * (CELL + 3) - 2}px;top:${row * (CELL_H + 3) - 2}px;width:${activeSize * CELL + (activeSize - 1) * 3}px;height:${activeSize * CELL_H + (activeSize - 1) * 3}px;border-color:${windowColors[outputIndex]}`;
        g.appendChild(outline);
      });
    }
    return g;
  };

  const calculateOutput = (outputIndex) => {
    const row = Math.floor(outputIndex / 2), col = outputIndex % 2;
    const flat = patch.slice(row, row + 3).flatMap(values => values.slice(col, col + 3));
    let sum = 0;
    flat.forEach((v, i) => sum += v * k[i]);
    const raw = sum / div;
    const shifted = raw + (isEmboss ? 128 : 0);
    return { flat, sum, raw, shifted, out: clampPixel(shifted) };
  };
  const outputs = [0, 1, 2, 3].map(calculateOutput);
  const { flat, sum, raw, shifted, out } = outputs[activeOutput];

  // Top row: input patch * kernel
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px';
  row.appendChild(mkGrid(patch.flat(), false, 4, 3));
  const star = document.createElement('span');
  star.style.cssText = 'font-size:1.4rem;color:var(--gold);flex-shrink:0;font-weight:700';
  star.textContent = '*';
  row.appendChild(star);
  row.appendChild(mkGrid(k, true));
  const equals = document.createElement('span');
  equals.style.cssText = 'font-size:1.4rem;color:var(--gold);flex-shrink:0;font-weight:700';
  equals.textContent = '=';
  row.appendChild(equals);
  const outputWrap = document.createElement('div');
  outputWrap.className = 'calc-output-wrap';
  outputWrap.innerHTML = '<small>Output 2×2</small>';
  const outputGrid = document.createElement('div');
  outputGrid.className = 'calc-output-grid';
  outputs.forEach(({ out: value }, index) => {
    const cell = document.createElement('div');
    cell.className = 'calc-output-cell' + (index === activeOutput ? ' on' : '');
    cell.style.setProperty('--window-color', windowColors[index]);
    cell.style.setProperty('--output-lum', `${Math.round(92 - value / 255 * 76)}%`);
    cell.style.color = value < 115 ? '#111827' : '#f9fafb';
    cell.textContent = value;
    cell.setAttribute('aria-label', `Output row ${Math.floor(index / 2) + 1}, column ${index % 2 + 1}: ${value}`);
    outputGrid.appendChild(cell);
  });
  outputWrap.appendChild(outputGrid);
  outputWrap.insertAdjacentHTML('beforeend', '<span class="calc-output-hint">Matching colors link each output to its input window. Sliding automatically.</span>');
  row.appendChild(outputWrap);
  el.appendChild(row);

  const note = document.createElement('p');
  note.className = 'calc-example-note';
  note.textContent = f.exNote;
  el.appendChild(note);

  // Bottom: full equation
  const eq = document.createElement('div');
  const shownTerms = flat.map((v,i) => v !== 0 && k[i] !== 0 ? `${v}×${formatNumber(k[i])}` : null).filter(Boolean);
  eq.style.cssText = `font-family:'ui-monospace','SF Mono','Fira Code',monospace;font-size:0.9rem;line-height:1.85;color:#9ca3af;background:#374151;padding:10px 14px;border-radius:5px;border-left:3px solid #f59e0b;white-space:pre-wrap`;
  eq.textContent = '= ' + shownTerms.join(' + ') + '  (zero terms omitted)'
    + `\n= ${formatNumber(sum)}`
    + (div !== 1 ? ` ÷ ${div}\n= ${formatNumber(raw)}` : '')
    + (isEmboss ? ` + 128\n= ${formatNumber(shifted)}` : '')
    + (formatOutputAdjustment(shifted, out) || ` → output[${activeRow}][${activeCol}]: ${out}`);
  el.appendChild(eq);

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
  { label: 'Remove a weaker pixel', values: [2, 8, 5, 7, 1] },
  { label: 'Keep equal peaks', values: [1, 4, 7, 7, 2] }
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
  const ROLES = ['', 'neighbour', 'candidate', 'neighbour', ''];

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
    ? (equalNeighbour ? 'Keep — non-strict local maximum (tied with a neighbour; this implementation uses ≥, so ties are kept).' : 'Keep — this pixel is a local maximum.')
    : 'Suppress — a neighbour is stronger.';
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
    { id: 'vertical', label: 'Vertical edge' },
    { id: 'horizontal', label: 'Horizontal edge' },
    { id: 'diagonal', label: 'Diagonal edge' }
  ].forEach(option => {
    const button = document.createElement('button');
    button.className = 'pill' + (option.id === nmsPixelOrientation ? ' on' : '');
    button.textContent = option.label;
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
  setPill('dtDiscardPill', axisStart);
  setPill('dtWeakPill', axisStart + axisLength / 2);
  setPill('dtStrongPill', axisEnd);
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

let curSrc = 'sample', camStream = null, camRunning = false, rafId = null, wasWebcamRunning = false;
let curTuneSrc = 'sample', tuneCamStream = null, tuneCamRunning = false, tuneRafId = null;
let curSampleIdx = 0, curTuneSampleIdx = 0, tuningUnlocked = true, activeStep = 0, activeTuneStep = 0;

const STEP_LABELS = [
  'Blur',
  'Gradient',
  'NMS',
  'Double Threshold',
  'Hysteresis'
];

const STEP_DESCS = [
  'Gaussian blur reduces noise and small details. High σ = smoother edges.',
  'Sobel filters detect intensity changes. Shows raw edge strength.',
  'Non-Maximum Suppression keeps local peaks along the gradient direction, thinning thick edge responses.',
  'Double thresholding identifies strong (white) and weak (blue) edges.',
  'Hysteresis keeps weak edges only when they connect to strong edges.'
];

// Cross-reference links shown below each step note
const STEP_REFS = [
  { href: '#filter-blur',  section: '02 — Gaussian Blur',              question: 'How does Gaussian blur work?', filter: 'blur' },
  { href: '#filter-sobel', section: '02 — Sobel Edge Detection',       question: 'How does the Sobel filter work?', filter: 'sobel' },
  { href: '#part2', section: '03 — Non-Maximum Suppression',   question: 'How does NMS work?' },
  { href: '#part3', section: '04 — Double Thresholding',       question: 'How does double thresholding work?' },
  { href: '#part3', section: '04 — Double Thresholding',       question: 'How does hysteresis use the weak/strong split?' },
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
}

function setTuningStepNote() {
  const t = document.getElementById('tuning-note-text');
  if (t) t.textContent = STEP_DESCS[activeTuneStep] || '';
  renderStepRef(STEP_REFS[activeTuneStep], 'tuning-step-ref');

  const label = document.getElementById('p3-outlabel');
  if (label) label.textContent = `${STEP_LABELS[activeTuneStep]} Output`;

  const controlsNote = document.getElementById('tuning-controls-note');
  if (!controlsNote) return;
  controlsNote.textContent = activeTuneStep < 3
    ? 'Adjust σ to see how smoothing changes this stage. Threshold values are editable now, but begin affecting the image at step 4.'
    : 'Adjust σ, the strong edge threshold, and the hysteresis ratio. Each change updates this stage immediately.';
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

function renderCannyStage(sourceCtx, outputCtx, w, h, step, sigma, thi, tloR) {
  const g = getGray(sourceCtx.getImageData(0,0,w,h), w, h);
  const b = gaussBlur(g, w, h, sigma);
  if (step === 0) { putGrayF(outputCtx, b, w, h); return; }

  const { mag, dir, maxMag } = computeSobel(b, w, h);
  if (step === 1) { putGrayF(outputCtx, mag, w, h, maxMag); return; }

  const nms = applyNMS(mag, dir, w, h);
  if (step === 2) { putGrayF(outputCtx, nms, w, h, maxMag); return; }
  if (step === 3) { putThr(outputCtx, nms, w, h, maxMag, thi, tloR); return; }

  const final = runHysteresis(nms, w, h, maxMag, thi, tloR);
  putBin(outputCtx, final, w, h);
}

function p3update() {
  const sigma = tuningUnlocked ? +document.getElementById('p3sigma').value : 1.4;
  const thi = (tuningUnlocked ? +document.getElementById('p3thi').value : 30) / 100;
  const tloR = (tuningUnlocked ? +document.getElementById('p3tlo').value : 33) / 100;

  if (tuningUnlocked) {
    document.getElementById('p3sv').textContent = sigma.toFixed(1);
    document.getElementById('p3thv').textContent = Math.round(thi*100) + '%';
    document.getElementById('p3tlv').textContent = Math.round(tloR*100) + '%';
  }

  renderCannyStage(cinctx, coutctx, cin.width, cin.height, activeStep, 1.4, .3, .33);
  renderCannyStage(p3inctx, p3outctx, p3inCv.width, p3inCv.height, activeTuneStep, sigma, thi, tloR);
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
    if (curTuneSrc === 'sample' && curTuneSampleIdx === 0) computeGoldStandard();
    else goldStandard = null;
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

/* Quiz logic */
let goldStandard = null;
const QUIZ_GOLD  = { sigma: 1, thi: 0.28, tloR: 0.38 };
const QUIZ_START = { sigma: 4, thi: 60,   tlo: 20    };

function computeGoldStandard() {
  const w = p3inCv.width, h = p3inCv.height;
  const g = getGray(p3inctx.getImageData(0,0,w,h), w, h);
  const b = gaussBlur(g, w, h, QUIZ_GOLD.sigma);
  const { mag, dir, maxMag } = computeSobel(b, w, h);
  const nms = applyNMS(mag, dir, w, h);
  goldStandard = runHysteresis(nms, w, h, maxMag, QUIZ_GOLD.thi, QUIZ_GOLD.tloR);
}

function computeQuizScore(userMask) {
  if (!goldStandard || !userMask) return 0;
  let inter = 0, union = 0;
  for (let i = 0; i < goldStandard.length; i++) {
    const g = goldStandard[i] > 0 ? 1 : 0;
    const u = userMask[i] > 0 ? 1 : 0;
    if (g && u) inter++;
    if (g || u) union++;
  }
  return union === 0 ? 0 : Math.round(inter / union * 100);
}

function quizUpdate() {
  const sigma = +document.getElementById('quizSigma').value;
  const thi   = +document.getElementById('quizThi').value / 100;
  const tloR  = +document.getElementById('quizTlo').value / 100;
  document.getElementById('quizSigmaBadge').textContent = sigma;
  document.getElementById('quizThiBadge').textContent   = Math.round(thi  * 100) + '%';
  document.getElementById('quizTloBadge').textContent   = Math.round(tloR * 100) + '%';
  const w = p3inCv.width, h = p3inCv.height;
  const g = getGray(p3inctx.getImageData(0,0,w,h), w, h);
  const b = gaussBlur(g, w, h, sigma);
  const { mag, dir, maxMag } = computeSobel(b, w, h);
  const nms = applyNMS(mag, dir, w, h);
  const result = runHysteresis(nms, w, h, maxMag, thi, tloR);
  putBin(p3outctx, result, w, h);
  const qOut = document.getElementById('quizOut');
  if (qOut) qOut.getContext('2d').drawImage(p3outCv, 0, 0, qOut.width, qOut.height);
  const score = computeQuizScore(result);
  updateQuizMatchUI(score);

  if (score >= 88 && !window.quizSolved) {
    window.quizSolved = true;

    setTimeout(() => {
      showQuizPass();
    }, 300);
  }
}

function updateQuizMatchUI(score) {
  const fill  = document.getElementById('quizMatchFill');
  const label = document.getElementById('quizMatchLabel');
  if (!fill || !label) return;
  fill.style.width = score + '%';
  if (score >= 88) {
    fill.style.background = 'var(--accent)';
    label.textContent = 'Perfect match!';
    label.style.color = 'var(--accent)';
  } else if (score >= 68) {
    fill.style.background = '#3b82f6';
    label.textContent = 'Very close — keep fine-tuning';
    label.style.color = 'var(--ink)';
  } else if (score >= 44) {
    fill.style.background = '#93c5fd';
    label.textContent = 'Getting closer...';
    label.style.color = 'var(--muted2)';
  } else {
    fill.style.background = 'var(--border-med)';
    label.textContent = 'Adjust the sliders to begin';
    label.style.color = 'var(--muted)';
  }
}

function renderQuizTarget() {
  const tgt = document.getElementById('quizTarget');
  if (!tgt || !goldStandard) return;
  const w = p3inCv.width, h = p3inCv.height;
  putBin(p3outctx, goldStandard, w, h);
  tgt.getContext('2d').drawImage(p3outCv, 0, 0, tgt.width, tgt.height);
}

function initQuizPage() {
  // Remember if webcam was running, stop it temporarily
  wasWebcamRunning = camRunning;
  if (camRunning) stopCam();
  // Ensure success popup is hidden when quiz resets
  const sp = document.getElementById('successPopup');
  if (sp) sp.style.display = 'none';
  // Load lizard, compute gold, then start quiz
  const img = new Image();
  img.onload = () => {
    p3inctx.drawImage(img, 0, 0, p3inCv.width, p3inCv.height);
    computeGoldStandard();
    renderQuizTarget();
    document.getElementById('quizSigma').value = QUIZ_START.sigma;
    document.getElementById('quizThi').value   = QUIZ_START.thi;
    document.getElementById('quizTlo').value   = QUIZ_START.tlo;
    // Reset match bar
    const fill  = document.getElementById('quizMatchFill');
    const label = document.getElementById('quizMatchLabel');
    if (fill)  { fill.style.width = '0%'; fill.style.background = 'var(--border-med)'; }
    if (label) { label.textContent = 'Adjust the sliders to begin'; label.style.color = 'var(--muted)'; }
    quizUpdate();
  };
  img.src = './lizard.jpg';
}

function enterTuning() {
  // Quiz flow is preserved below for later reuse; tuning is currently available immediately.
  const sp = document.getElementById('successPopup');
  if (sp) sp.style.display = 'none';
  closeTuningPopup();
  tuningUnlocked = true;
  buildSamplePills();
  buildTuningSamplePills();
  const pg = document.getElementById('tuning-controls-unlocked');
  if (pg) {
    pg.style.display = 'block';
    setTimeout(() => {
      pg.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  }
  p3update();
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
    goldStandard = null;
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

/* Popup logic */
function openTuningPopup() {
  const overlay = document.getElementById('tuningPopup');
  if (!overlay) return;
  overlay.style.display = 'flex';
  showPopupPage(1);
}

function closeTuningPopup() {
  document.getElementById('tuningPopup').style.display = 'none';
  // Resume webcam if it was running before popup
  if (wasWebcamRunning && !camRunning && curSrc === 'cam') {
    toggleCam();
    wasWebcamRunning = false;
  }
}

function popupOverlayClick(e) {
  // Tuning popup cannot be dismissed by clicking outside — only by completing the quiz
}

function showPopupPage(n) {
  document.getElementById('popupPage1').style.display = n === 1 ? '' : 'none';
  document.getElementById('popupPage2').style.display = n === 2 ? '' : 'none';
  // Toggle quiz-active on modal to lock overflow when quiz is showing
  const modal = document.querySelector('#tuningPopup .popup-modal');
  if (modal) modal.classList.toggle('quiz-active', n === 2);
  if (n === 2) initQuizPage();
}

function showQuizPass() {
  const sp = document.getElementById('successPopup');
  if (sp) sp.style.display = 'flex';
}

function closeSuccessPopup() {
  // Close success popup WITHOUT activating tuning bars
  const sp = document.getElementById('successPopup');
  if (sp) sp.style.display = 'none';
  closeTuningPopup(); // also close the quiz popup behind it
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

function runHysteresis(nms, w, h, maxMag, thi, tloR) {
  const hi = maxMag*thi, lo = maxMag*thi*tloR;
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
function putThr(ctx, nms, w, h, maxMag, thi, tloR) {
  const hi=maxMag*thi, lo=maxMag*thi*tloR;
  const id = ctx.createImageData(w, h);
  for (let i = 0; i < w*h; i++) {
    if (nms[i]>=hi)      { id.data[i*4]=255; id.data[i*4+1]=255; id.data[i*4+2]=255; }
    else if (nms[i]>=lo) { id.data[i*4]=59;  id.data[i*4+1]=139; id.data[i*4+2]=212; }
    else                 { id.data[i*4]=id.data[i*4+1]=id.data[i*4+2]=0; }
    id.data[i*4+3]=255;
  }
  ctx.putImageData(id, 0, 0);
}



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
