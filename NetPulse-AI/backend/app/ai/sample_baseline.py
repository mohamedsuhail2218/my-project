"""Deterministic, clearly-labelled synthetic baseline for cold-start ML demos.

These rows are NOT written to network_measurements and are never displayed as
live telemetry. They are only used to fit the cold-start Isolation Forest before
enough real observations exist.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def build_sample_baseline(samples: int = 120) -> pd.DataFrame:
    rng = np.random.default_rng(2026)
    # A deliberately ordinary campus Wi-Fi baseline used only for model fitting.
    latency = np.clip(rng.gamma(shape=4.2, scale=8.0, size=samples), 8.0, 125.0)
    jitter = np.clip(rng.gamma(shape=2.0, scale=1.7, size=samples), 0.1, 16.0)
    loss = np.clip(rng.exponential(scale=0.28, size=samples), 0.0, 3.5)
    return pd.DataFrame(
        {
            "latency_ms": np.round(latency, 2),
            "packet_loss_pct": np.round(loss, 2),
            "jitter_ms": np.round(jitter, 2),
        }
    )
