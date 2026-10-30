"""Small statistics toolkit for the prediction model (numpy only): ridge logistic regression, metrics, calibration, block bootstrap."""
import warnings
import numpy as np

warnings.filterwarnings("ignore", category=RuntimeWarning)   # numpy 2 on macOS (Accelerate) raises spurious matmul warnings


def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-np.clip(z, -35, 35)))


def fit_logit(X, y, lam=0.01, w=None, iters=60, tol=1e-9):
    """Ridge logistic regression by Newton's method. X must already be standardized; the intercept is not penalized.
    Minimizes  sum_i w_i * logloss_i + 0.5 * lam * sum(w) * ||coefs||^2.  Returns (intercept, coefs)."""
    n, k = X.shape
    A = np.hstack([np.ones((n, 1)), X])
    w = np.ones(n) if w is None else np.asarray(w, dtype=float)
    pm = np.eye(k + 1) * lam * w.sum()
    pm[0, 0] = 0
    base = (w * y).sum() / w.sum()
    b = np.zeros(k + 1)
    b[0] = np.log(max(1e-6, base) / max(1e-6, 1 - base))
    prev = np.inf
    for _ in range(iters):
        p = sigmoid(A @ b)
        g = A.T @ (w * (p - y)) + pm @ b
        H = (A * (w * p * (1 - p))[:, None]).T @ A + pm + np.eye(k + 1) * 1e-9
        b = b - np.linalg.solve(H, g)
        pn = sigmoid(A @ b)
        loss = -(w * (y * np.log(pn + 1e-12) + (1 - y) * np.log(1 - pn + 1e-12))).sum() + 0.5 * (b * (pm @ b)).sum()
        if abs(prev - loss) < tol * max(1.0, abs(loss)):
            break
        prev = loss
    return float(b[0]), b[1:].copy()


def predict(X, b0, b):
    return sigmoid(b0 + X @ b)


def auc(y, p):
    y = np.asarray(y); p = np.asarray(p)
    pos, neg = (y == 1).sum(), (y == 0).sum()
    if pos == 0 or neg == 0:
        return float("nan")
    r = pd_rank(p)
    return float((r[y == 1].sum() - pos * (pos + 1) / 2) / (pos * neg))


def pd_rank(x):
    order = np.argsort(x, kind="mergesort")
    ranks = np.empty(len(x)); ranks[order] = np.arange(1, len(x) + 1)
    # average ties
    xs = np.asarray(x)[order]
    i = 0
    while i < len(xs):
        j = i
        while j + 1 < len(xs) and xs[j + 1] == xs[i]:
            j += 1
        if j > i:
            ranks[order[i:j + 1]] = (i + j + 2) / 2
        i = j + 1
    return ranks


def brier(y, p):
    return float(np.mean((np.asarray(p) - np.asarray(y)) ** 2))


def logloss(y, p):
    p = np.clip(np.asarray(p), 1e-6, 1 - 1e-6); y = np.asarray(y)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def calibration(y, p, bins=10):
    """Equal-count bins by predicted probability: [(mean predicted, observed frequency, n)]."""
    y = np.asarray(y); p = np.asarray(p); order = np.argsort(p)
    out = []
    for chunk in np.array_split(order, bins):
        if len(chunk):
            out.append((float(p[chunk].mean()), float(y[chunk].mean()), int(len(chunk))))
    return out


def block_bootstrap_auc(y, p, block=60, reps=300, seed=7):
    """AUC confidence interval that respects overlapping samples: resample contiguous blocks (default 60 trading days)."""
    rng = np.random.default_rng(seed)
    y = np.asarray(y); p = np.asarray(p); n = len(y); nb = max(1, n // block); vals = []
    for _ in range(reps):
        starts = rng.integers(0, max(1, n - block), size=nb)
        idx = np.concatenate([np.arange(s, s + block) for s in starts])
        a = auc(y[idx], p[idx])
        if a == a:
            vals.append(a)
    return (float(np.percentile(vals, 5)), float(np.percentile(vals, 95))) if vals else (float("nan"), float("nan"))
