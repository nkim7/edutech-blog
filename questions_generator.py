# Generate simple MCQ images for Sobel-style visual questions.
# Run this locally, then put the PNG files into an Overleaf folder named figures/.

import os
import numpy as np
import matplotlib.pyplot as plt
from scipy.signal import correlate2d
from PIL import Image

os.makedirs("figures", exist_ok=True)

# ── Load mano.jpeg as grayscale ───────────────────────────────────────
img_pil = Image.open("mano.jpeg").convert("L")
img_pil = img_pil.resize((80, 80), Image.LANCZOS)
img_base = np.array(img_pil, dtype=np.float64)

def save_img(arr, path):
    plt.figure(figsize=(2, 2))
    plt.imshow(arr, cmap="gray", vmin=0, vmax=255)
    plt.axis("off")
    plt.tight_layout(pad=0)
    plt.savefig(path, dpi=200, bbox_inches="tight", pad_inches=0)
    plt.close()

def save_kernel(kernel, path):
    fig, ax = plt.subplots(figsize=(1.4, 1.4))
    ax.imshow(np.ones_like(kernel), cmap="gray", vmin=0, vmax=1)
    for i in range(kernel.shape[0]):
        for j in range(kernel.shape[1]):
            ax.text(j, i, str(kernel[i, j]), ha="center", va="center", fontsize=14)
    ax.set_xticks([])
    ax.set_yticks([])
    plt.tight_layout(pad=0.1)
    plt.savefig(path, dpi=200, bbox_inches="tight", pad_inches=0)
    plt.close()

sobel_y = np.array([
    [-1, -2, -1],
    [ 0,  0,  0],
    [ 1,  2,  1]
])

sobel_x = np.array([
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1]
])

# ── Question 1: apply Sobel-Y (detects horizontal edges) ─────────────
out_h = np.abs(correlate2d(img_base, sobel_y, mode="same", boundary="symm"))
out_h = 255 * out_h / out_h.max()

# Distractors
out_v_wrong = np.abs(correlate2d(img_base, sobel_x, mode="same", boundary="symm"))
out_v_wrong = 255 * out_v_wrong / out_v_wrong.max()

blur_like = np.ones_like(img_base) * 130
blank = np.zeros_like(img_base)

save_img(img_base,    "figures/pre_input_horizontal.png")
save_kernel(sobel_y,  "figures/pre_kernel_y.png")
save_img(out_h,       "figures/pre_choice_A.png")   # correct: horizontal edges
save_img(out_v_wrong, "figures/pre_choice_B.png")   # wrong: vertical edges instead
save_img(blur_like,   "figures/pre_choice_C.png")   # wrong: blur-like
save_img(blank,       "figures/pre_choice_D.png")   # wrong: no response

# ── Question 2: apply Sobel-X (detects vertical edges) ───────────────
out_v = np.abs(correlate2d(img_base, sobel_x, mode="same", boundary="symm"))
out_v = 255 * out_v / out_v.max()

out_h_wrong = np.abs(correlate2d(img_base, sobel_y, mode="same", boundary="symm"))
out_h_wrong = 255 * out_h_wrong / out_h_wrong.max()

save_img(img_base,    "figures/post_input_vertical.png")
save_kernel(sobel_x,  "figures/post_kernel_x.png")
save_img(out_v,       "figures/post_choice_A.png")   # correct: vertical edges
save_img(out_h_wrong, "figures/post_choice_B.png")   # wrong: horizontal edges instead
save_img(blur_like,   "figures/post_choice_C.png")   # wrong: blur-like
save_img(blank,       "figures/post_choice_D.png")   # wrong: no response
