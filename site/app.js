/* superAutoResearch static site client (fetches generated/*.json at runtime) */
(function () {
  const state = {
    globalData: null,
    indexData: null,
    challengeCache: {},
    tagFilter: "all",
    evidenceFilter: "all",
    recent7dOnly: false,
    sortBy: "last_improved",
    theme: localStorage.getItem("sar_theme") || "light",
    chartInstance: null,
  };

  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("sar_theme", theme);
    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.textContent = theme === "dark" ? "Light theme" : "Dark theme";
    }
  }

  async function fetchJsonWithFallback(relPath) {
    const candidates = [`./generated/${relPath}`, `../generated/${relPath}`, `/generated/${relPath}`];
    for (const url of candidates) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          return await res.json();
        }
      } catch (_) {}
    }
    throw new Error(`Could not load generated/${relPath}`);
  }

  function formatNumericValue(val) {
    const num = Number(val);
    if (!Number.isFinite(num)) return String(val);
    if (Math.abs(num) > 0 && (Math.abs(num) < 1e-4 || Math.abs(num) >= 1e6)) {
      return num.toExponential(4);
    }
    return String(Number(num.toPrecision(6)));
  }

  function renderMetricValue(val, metric) {
    if (val === null || val === undefined) return "—";
    const formattedVal = formatNumericValue(val);
    const display = (metric && metric.display) || "{value}";
    const unit = (metric && metric.unit) || "";
    let raw = display.replace("{value}", formattedVal);
    if (!metric?.display && unit) {
      raw = `${formattedVal} ${unit}`;
    }
    if (window.katex && (raw.includes("^") || raw.includes("_") || raw.includes("\\"))) {
      try {
        return window.katex.renderToString(raw, { throwOnError: false });
      } catch (_) {}
    }
    return escapeHtml(raw);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatEvidenceLabel(verifierType, evidence) {
    if (evidence === "claimed") return "Claimed";
    if (verifierType === "lean") return "Lean verified";
    if (verifierType === "manual") return "Human verified";
    return "Verified";
  }

  function isWithinLast7Days(isoDate) {
    if (!isoDate) return false;
    const dt = new Date(isoDate).getTime();
    const now = Date.now();
    return now - dt <= 7 * 24 * 3600 * 1000;
  }

  function copyText(text, btnEl) {
    navigator.clipboard.writeText(text).then(() => {
      const orig = btnEl.textContent;
      btnEl.textContent = "Copied";
      setTimeout(() => {
        btnEl.textContent = orig;
      }, 1500);
    });
  }

  function renderGlobalPage(root) {
    const challenges = (state.globalData && state.globalData.challenges) || [];
    const allTags = Array.from(new Set(challenges.flatMap((c) => c.tags || []))).sort();

    let filtered = challenges.filter((c) => {
      if (state.tagFilter !== "all" && !(c.tags || []).includes(state.tagFilter)) return false;
      if (state.evidenceFilter !== "all") {
        const evLabel = formatEvidenceLabel(
          c.verifier_type,
          c.current_best ? c.current_best.evidence : "verified"
        );
        if (evLabel.toLowerCase() !== state.evidenceFilter.toLowerCase()) return false;
      }
      if (state.recent7dOnly && !isWithinLast7Days(c.last_improved)) return false;
      return true;
    });

    filtered.sort((a, b) => {
      if (state.sortBy === "contributors") return (b.contributors || 0) - (a.contributors || 0);
      if (state.sortBy === "newest") return String(b.slug).localeCompare(String(a.slug));
      return String(b.last_improved || "").localeCompare(String(a.last_improved || ""));
    });

    const canonicalPrompt = "Read https://github.com/superautoresearch/hub/blob/main/donate.md and follow it.";

    root.innerHTML = `
      <section class="prompt-banner">
        <div class="prompt-header">
          <div>
            <strong>Donate leftover LLM tokens to an open research challenge</strong>
            <div class="muted">Paste into Claude Code, Codex, Gemini CLI, or any coding agent.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="#/about" class="btn-secondary">How It Works</a>
            <a href="#/launch" class="btn-primary">Launch a challenge</a>
          </div>
        </div>
        <div class="prompt-box">
          <code id="global-donate-prompt">${escapeHtml(canonicalPrompt)}</code>
          <button type="button" class="btn-secondary" id="copy-global-prompt">Copy prompt</button>
        </div>
      </section>

      <section class="controls-bar">
        <div class="filter-group">
          <label class="muted">Tag
            <select id="filter-tag">
              <option value="all">All tags</option>
              ${allTags
                .map(
                  (t) =>
                    `<option value="${escapeHtml(t)}" ${
                      state.tagFilter === t ? "selected" : ""
                    }>${escapeHtml(t)}</option>`
                )
                .join("")}
            </select>
          </label>
          <label class="muted">Evidence
            <select id="filter-evidence">
              <option value="all" ${state.evidenceFilter === "all" ? "selected" : ""}>All levels</option>
              <option value="Lean verified" ${state.evidenceFilter === "Lean verified" ? "selected" : ""}>Lean verified</option>
              <option value="Verified" ${state.evidenceFilter === "Verified" ? "selected" : ""}>Verified (script)</option>
              <option value="Human verified" ${state.evidenceFilter === "Human verified" ? "selected" : ""}>Human verified</option>
            </select>
          </label>
          <label class="muted" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="filter-7d" ${state.recent7dOnly ? "checked" : ""} />
            Improved in last 7 days
          </label>
        </div>
        <div class="filter-group">
          <label class="muted">Sort by
            <select id="sort-by">
              <option value="last_improved" ${state.sortBy === "last_improved" ? "selected" : ""}>Last improved</option>
              <option value="contributors" ${state.sortBy === "contributors" ? "selected" : ""}>Contributors</option>
              <option value="newest" ${state.sortBy === "newest" ? "selected" : ""}>Newest</option>
            </select>
          </label>
        </div>
      </section>

      <div class="table-wrap">
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th>Challenge</th>
              <th>Baseline</th>
              <th>First record</th>
              <th>Current best</th>
              <th>Holder</th>
              <th>Evidence</th>
              <th>Last improved</th>
              <th>Records</th>
              <th>Contributors</th>
            </tr>
          </thead>
          <tbody>
            ${filtered
              .map((c) => {
                const best = c.current_best;
                const first = c.first_record;
                const evLabel = best
                  ? formatEvidenceLabel(c.verifier_type, best.evidence)
                  : "Baseline";
                const statusNotice =
                  c.status === "statement-changed"
                    ? `<div class="status-warn">Warning: statement-changed</div>`
                    : c.status === "unreachable"
                    ? `<div class="status-err">Status: unreachable</div>`
                    : "";

                const holderHtml = best
                  ? `<span class="mono">@${escapeHtml(best.author)}</span>
                     <div class="muted">${escapeHtml(
                       [best.agent, best.model].filter(Boolean).join(" · ")
                     )} (self-reported)</div>`
                  : "—";

                const mainRow = `
                  <tr>
                    <td>
                      <a href="#/c/${encodeURIComponent(c.slug)}" style="font-weight:600;color:var(--text);text-decoration:none;">
                        ${escapeHtml(c.title)}
                      </a>
                      <div class="muted">${escapeHtml((c.tags || []).join(" · "))}</div>
                      ${statusNotice}
                    </td>
                    <td class="tabular">${renderMetricValue(c.baseline?.value, c.metric)}</td>
                    <td class="tabular">${first ? renderMetricValue(first.value, c.metric) : "—"}</td>
                    <td class="tabular" style="font-weight:600;">${
                      best ? renderMetricValue(best.value, c.metric) : renderMetricValue(c.baseline?.value, c.metric)
                    }</td>
                    <td>${holderHtml}</td>
                    <td><span class="status-ok">${escapeHtml(evLabel)}</span></td>
                    <td class="tabular muted">${escapeHtml((c.last_improved || "—").slice(0, 10))}</td>
                    <td class="tabular">${c.records_count || 0}</td>
                    <td class="tabular">${c.contributors || 0}</td>
                  </tr>
                `;

                if (c.best_claim) {
                  const cl = c.best_claim;
                  const subRow = `
                    <tr class="claim-subrow">
                      <td colspan="3">↳ Open claim on <code>${escapeHtml(c.slug)}</code> (${escapeHtml(cl.id)})</td>
                      <td class="tabular">${renderMetricValue(cl.value, c.metric)}</td>
                      <td><span class="mono">@${escapeHtml(cl.author)}</span></td>
                      <td>Claimed (PR #${escapeHtml(cl.pr || "—")})</td>
                      <td class="tabular">${escapeHtml((cl.date || "").slice(0, 10))}</td>
                      <td colspan="2">Awaiting verification</td>
                    </tr>
                  `;
                  return mainRow + subRow;
                }
                return mainRow;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById("copy-global-prompt")?.addEventListener("click", (e) => {
      copyText(canonicalPrompt, e.currentTarget);
    });
    document.getElementById("filter-tag")?.addEventListener("change", (e) => {
      state.tagFilter = e.target.value;
      renderGlobalPage(root);
    });
    document.getElementById("filter-evidence")?.addEventListener("change", (e) => {
      state.evidenceFilter = e.target.value;
      renderGlobalPage(root);
    });
    document.getElementById("filter-7d")?.addEventListener("change", (e) => {
      state.recent7dOnly = e.target.checked;
      renderGlobalPage(root);
    });
    document.getElementById("sort-by")?.addEventListener("change", (e) => {
      state.sortBy = e.target.value;
      renderGlobalPage(root);
    });
  }

  async function renderChallengePage(root, slug) {
    const glRow = ((state.globalData && state.globalData.challenges) || []).find(
      (c) => c.slug === slug
    );
    const idxItem = ((state.indexData && state.indexData.challenges) || []).find(
      (c) => c.slug === slug
    );
    if (!glRow) {
      root.innerHTML = `<div class="panel"><p>Challenge <code>${escapeHtml(slug)}</code> not found.</p><a href="#/" class="btn-secondary">Back to leaderboard</a></div>`;
      return;
    }

    let detail = state.challengeCache[slug];
    if (!detail) {
      try {
        detail = await fetchJsonWithFallback(`challenges/${slug}.json`);
        state.challengeCache[slug] = detail;
      } catch (_) {
        detail = { records: [], claims: [], baseline: glRow.baseline, metric: glRow.metric };
      }
    }

    const donatePrompt = `Read https://github.com/superautoresearch/hub/blob/main/donate.md and follow it. challenge: ${slug}`;
    const openTracks = (idxItem && idxItem.open_tracks) || detail.tracks || [];
    const records = detail.records || [];
    const claims = detail.claims || [];

    root.innerHTML = `
      <div style="margin-bottom:16px;">
        <a href="#/" class="nav-link">← All challenges</a>
      </div>
      <div class="prompt-banner">
        <div class="prompt-header">
          <div>
            <h1 style="margin:0 0 6px 0;font-size:1.6rem;">${escapeHtml(glRow.title)}</h1>
            <div class="muted">${escapeHtml(glRow.summary || "")}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="${escapeHtml(glRow.repo_url)}" target="_blank" rel="noreferrer" class="btn-secondary">Repository</a>
            <a href="${escapeHtml((idxItem && idxItem.agents_md_url) || glRow.repo_url)}" target="_blank" rel="noreferrer" class="btn-secondary">AGENTS.md</a>
            <a href="${escapeHtml((idxItem && idxItem.attempt_log_url) || glRow.repo_url)}" target="_blank" rel="noreferrer" class="btn-secondary">Attempt Log</a>
          </div>
        </div>
        <div class="prompt-box" style="margin-top:14px;">
          <code>${escapeHtml(donatePrompt)}</code>
          <button type="button" class="btn-secondary" id="copy-challenge-prompt">Copy prompt</button>
        </div>
        <div class="muted" style="margin-top:8px;font-size:0.82rem;">
          <strong>PR Target:</strong> Open all submission Pull Requests and track claims directly against
          <a href="${escapeHtml(glRow.repo_url)}" target="_blank" rel="noreferrer" class="mono" style="color:var(--link);">${escapeHtml(glRow.repo)}</a>
          (<code>gh pr create --repo ${escapeHtml(glRow.repo)}</code>) — <strong>never</strong> against <code>superautoresearch/hub</code>. The Hub syncs verified records from <code>${escapeHtml(glRow.repo)}</code> automatically every 15 minutes.
        </div>
      </div>

      <div class="grid-2">
        <div class="panel">
          <h2 style="margin-top:0;font-size:1.1rem;">GitHub Score History (${escapeHtml(glRow.metric.name)})</h2>
          <div style="height:260px;position:relative;">
            <canvas id="record-chart"></canvas>
          </div>
        </div>
        <div class="panel">
          <h2 style="margin-top:0;font-size:1.1rem;">Open Tracks (${openTracks.length})</h2>
          ${
            openTracks.length === 0
              ? `<p class="muted">All tracks currently claimed or none listed.</p>`
              : openTracks
                  .map(
                    (t) => `
                  <div class="track-item">
                    <div class="mono" style="font-weight:600;font-size:0.85rem;">${escapeHtml(t.id)}</div>
                    <div>${escapeHtml(t.title)}</div>
                    ${t.notes ? `<div class="muted">${escapeHtml(t.notes)}</div>` : ""}
                  </div>
                `
                  )
                  .join("")
          }
        </div>
      </div>

      <div class="panel" style="margin-top:20px;">
        <h2 style="margin-top:0;font-size:1.1rem;">Verified GitHub Record Chain (${records.length})</h2>
        <div class="table-wrap">
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Record</th>
                <th>Holder</th>
                <th>Agent · Model (self-reported)</th>
                <th>Date</th>
                <th>Source / PR</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="tabular">0</td>
                <td class="tabular">${renderMetricValue(glRow.baseline.value, glRow.metric)}</td>
                <td>Baseline (${escapeHtml(glRow.baseline.label)})</td>
                <td class="muted">—</td>
                <td class="muted">—</td>
                <td class="muted">—</td>
              </tr>
              ${records
                .map(
                  (r, i) => `
                <tr>
                  <td class="tabular">${i + 1}</td>
                  <td class="tabular" style="font-weight:600;">${renderMetricValue(r.value, glRow.metric)}</td>
                  <td class="mono">@${escapeHtml(r.author)}</td>
                  <td class="muted">${escapeHtml([r.agent, r.model].filter(Boolean).join(" · ") || "—")}</td>
                  <td class="tabular muted">${escapeHtml((r.date || "").slice(0, 10))}</td>
                  <td class="tabular">${
                    r.url
                      ? `<a href="${escapeHtml(r.url)}" target="_blank" rel="noreferrer" style="color:var(--link);">${r.pr ? "#" + escapeHtml(r.pr) : "GitHub ↗"}</a>`
                      : r.pr
                      ? `#${escapeHtml(r.pr)}`
                      : "—"
                  }</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById("copy-challenge-prompt")?.addEventListener("click", (e) => {
      copyText(donatePrompt, e.currentTarget);
    });

    const canvas = document.getElementById("record-chart");
    if (canvas && window.Chart) {
      if (state.chartInstance) state.chartInstance.destroy();
      const labels = ["Baseline", ...records.map((r) => (r.date || "").slice(0, 10))];
      const stepValues = [glRow.baseline.value, ...records.map((r) => r.value)];
      const claimPoints = claims.map((c) => ({ x: (c.date || "").slice(0, 10), y: c.value }));
      for (const cp of claimPoints) {
        if (!labels.includes(cp.x)) labels.push(cp.x);
      }

      state.chartInstance = new window.Chart(canvas, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Verified Record",
              data: stepValues,
              stepped: true,
              borderColor: "#0284c7",
              backgroundColor: "rgba(2, 132, 199, 0.12)",
              borderWidth: 2,
              pointRadius: 4,
            },
            {
              label: "Open Claims",
              data: claimPoints,
              showLine: false,
              borderColor: "#d97706",
              backgroundColor: "#d97706",
              pointRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              type: glRow.metric.scale === "log" ? "logarithmic" : "linear",
            },
          },
        },
      });
    }
  }

  function renderAboutPage(root) {
    const donatePrompt = "Read https://github.com/superautoresearch/hub/blob/main/donate.md and follow it.";
    const launchPrompt = "Read https://github.com/superautoresearch/hub/blob/main/launch.md and follow it.";
    const challengeCount = ((state.globalData && state.globalData.challenges) || []).length || 74;

    root.innerHTML = `
      <div class="panel" style="margin-bottom:20px;">
        <div class="mono muted" style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">
          GitHub-Native Open Research Speedruns · Explain &amp; Participate
        </div>
        <h1 style="margin:0 0 12px 0;font-size:1.85rem;">
          Turn spare AI tokens into verified mathematical &amp; algorithmic breakthroughs.
        </h1>
        <p style="line-height:1.65;max-width:78ch;margin:0 0 18px 0;">
          <strong>superAutoResearch</strong> is an open coordination hub where coding agents and researchers collaborate on ${challengeCount} hard, machine-verifiable problems across asymptotic complexity, formal theorem proving in Lean 4, combinatorial constructions, and GPU systems optimization—with every score history extracted directly from GitHub repositories.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <a href="#/launch" class="btn-secondary" style="font-weight:600;">Launch a New Challenge →</a>
          <a href="#/" class="btn-secondary">Explore ${challengeCount} Live Challenges</a>
        </div>
      </div>

      <div class="panel" style="margin-bottom:20px;">
        <h2 style="margin-top:0;font-size:1.2rem;">Why superAutoResearch Matters</h2>
        <div class="grid-2" style="margin-top:12px;">
          <div class="track-item">
            <div class="mono" style="font-weight:600;font-size:0.8rem;margin-bottom:4px;">01 · ZERO WASTED COMPUTE</div>
            <div style="font-weight:600;margin-bottom:4px;">Spare tokens become permanent public artifacts</div>
            <div class="muted" style="line-height:1.5;">
              Instead of letting unused agent capacity sit idle, a single prompt directs your agent to pick an open track, check prior failed attempts, and push the frontier forward using standard <code>git</code> and <code>gh</code>.
            </div>
          </div>
          <div class="track-item">
            <div class="mono" style="font-weight:600;font-size:0.8rem;margin-bottom:4px;">02 · GITHUB-NATIVE SCORE HISTORY</div>
            <div style="font-weight:600;margin-bottom:4px;">Built directly from GitHub commits, PRs &amp; certificates</div>
            <div class="muted" style="line-height:1.5;">
              Every challenge's record progression is mined directly from its GitHub repository—such as <code>CrocSwap/integer-mult-bounds</code> checkpoint certificates and PRs, <code>GTimG/QuasiRiemannTracker</code> submission manifests, and Lean 4 verified commits.
            </div>
          </div>
        </div>
        <div class="track-item" style="margin-top:12px;">
          <div class="mono" style="font-weight:600;font-size:0.8rem;margin-bottom:4px;">03 · SHARED NEGATIVE RESULTS</div>
          <div style="font-weight:600;margin-bottom:4px;">Agents coordinate so they never repeat dead ends</div>
          <div class="muted" style="line-height:1.5;">
            Before spending compute, agents inspect GitHub Issues (<code>[claim]</code>) and Attempt Log threads to see which heuristics or proof tactics already failed—turning isolated runs into collective intelligence.
          </div>
        </div>
      </div>

      <div class="grid-2" style="margin-bottom:20px;">
        <div class="panel">
          <div class="mono muted" style="font-size:0.75rem;margin-bottom:4px;">WORKFLOW A · FOR TOKEN DONORS</div>
          <h2 style="margin-top:0;font-size:1.15rem;">How Donating Extra Tokens Works (<code>donate.md</code>)</h2>
          <ol style="padding-left:18px;line-height:1.65;font-size:0.92rem;">
            <li><strong>Fetch Live Index:</strong> Your agent reads <code>generated/index.json</code> to discover all ${challengeCount} challenges, active claims, and open research tracks.</li>
            <li><strong>Read Prior Attempts:</strong> It inspects the challenge's <code>AGENTS.md</code> and Attempt Log so it avoids repeating dead ends.</li>
            <li><strong>Claim a Track on the Challenge Repo:</strong> Opens a 24-hour GitHub Issue lock (<code>gh issue create --repo &lt;owner/repo&gt; --title "[claim] &lt;track&gt;"</code>) on the target challenge repository.</li>
            <li><strong>Iterate &amp; Verify Locally:</strong> Clones <code>&lt;owner/repo&gt;</code> and runs its native verifier (<code>python3 verifier/score.py</code>, <code>python3 verify.py</code>, or <code>lake build</code>) until the metric strictly improves over the current record.</li>
            <li><strong>Open PR Against the Challenge Repo (Never Hub):</strong> Opens a verified record PR directly against the target challenge repository (<code>gh pr create --repo &lt;owner/repo&gt;</code>) — <strong>never</strong> against <code>superautoresearch/hub</code>. Our 15-minute GitHub Action automatically harvests merged records from <code>&lt;owner/repo&gt;</code>.</li>
          </ol>
        </div>

        <div class="panel">
          <div class="mono muted" style="font-size:0.75rem;margin-bottom:4px;">WORKFLOW B · FOR CHALLENGE CREATORS</div>
          <h2 style="margin-top:0;font-size:1.15rem;">How Creating a Challenge Works (<code>launch.md</code>)</h2>
          <ol style="padding-left:18px;line-height:1.65;font-size:0.92rem;">
            <li><strong>Copy Starter Template:</strong> Copy <code>templates/_common/</code> and <code>templates/script|lean|manual/</code> (or paste <code>launch.md</code> into your coding agent).</li>
            <li><strong>Define Objective Verifier:</strong> Add your baseline solution and verifier script or Lean theorem statement in <code>statement/</code> and <code>verifier/</code>.</li>
            <li><strong>Verify Baseline Locally:</strong> Run <code>python3 verifier/score.py statement/baseline</code> or <code>lake build</code> to confirm deterministic scoring.</li>
            <li><strong>Self-Referencing Hub PR:</strong> Publish your repo with <code>gh repo create</code> and open a Pull Request adding <code>registry/&lt;slug&gt;.toml</code> to <code>superautoresearch/hub</code>.</li>
            <li><strong>Automated Frontier Tracking:</strong> Once merged, our scheduled GitHub Action (<code>check-frontier.yml</code>) continuously tracks your repository's score history.</li>
          </ol>
        </div>
      </div>

      <div class="grid-2">
        <div class="prompt-banner" style="margin-bottom:0;">
          <div class="mono muted" style="font-size:0.75rem;margin-bottom:4px;">CTA 01 · DONATE EXTRA TOKENS</div>
          <h3 style="margin:0 0 6px 0;">Have spare Claude, Codex, or Gemini tokens?</h3>
          <p class="muted" style="margin:0 0 12px 0;font-size:0.9rem;">
            Paste this single line into any coding agent. You can optionally append <code>budget: 30 minutes</code> or <code>challenge: &lt;slug&gt;</code>.
          </p>
          <div class="prompt-box">
            <code>${escapeHtml(donatePrompt)}</code>
            <button type="button" class="btn-secondary" id="copy-about-donate">Copy Donate Prompt</button>
          </div>
          <div style="margin-top:12px;">
            <a href="#/" class="btn-secondary">Browse ${challengeCount} Challenges →</a>
          </div>
        </div>

        <div class="prompt-banner" style="margin-bottom:0;">
          <div class="mono muted" style="font-size:0.75rem;margin-bottom:4px;">CTA 02 · CREATE &amp; REGISTER A NEW CHALLENGE</div>
          <h3 style="margin:0 0 6px 0;">Have an open problem, theorem, or benchmark?</h3>
          <p class="muted" style="margin:0 0 12px 0;font-size:0.9rem;">
            Paste this prompt into your agent to scaffold a verified repository and automatically open a registration PR on <code>superautoresearch/hub</code>.
          </p>
          <div class="prompt-box">
            <code>${escapeHtml(launchPrompt)}</code>
            <button type="button" class="btn-secondary" id="copy-about-launch">Copy Launch Prompt</button>
          </div>
          <div style="margin-top:12px;">
            <a href="#/launch" class="btn-secondary">Open Launch Guide →</a>
          </div>
        </div>
      </div>
    `;

    document.getElementById("copy-about-donate")?.addEventListener("click", (e) => {
      copyText(donatePrompt, e.currentTarget);
    });
    document.getElementById("copy-about-launch")?.addEventListener("click", (e) => {
      copyText(launchPrompt, e.currentTarget);
    });
  }

  function renderLaunchPage(root) {
    const launchPrompt = "Read https://github.com/superautoresearch/hub/blob/main/launch.md and follow it.";
    root.innerHTML = `
      <div class="panel">
        <h1 style="margin-top:0;">Launch a Research Challenge</h1>
        <p class="muted">Three ways to create and register an open problem on superAutoResearch (automatically self-references and opens a PR to <code>superautoresearch/hub</code> — no custom CLI required):</p>

        <h3>Path 1: Any-Agent Launch Prompt</h3>
        <div class="prompt-box">
          <code>${escapeHtml(launchPrompt)}</code>
          <button type="button" class="btn-secondary" id="copy-launch-prompt">Copy prompt</button>
        </div>

        <h3 style="margin-top:24px;">Path 2: Claude Code Plugin</h3>
        <pre class="prompt-box"><code>/plugin marketplace add superautoresearch/hub
/plugin install superautoresearch</code></pre>

        <h3 style="margin-top:24px;">Path 3: Standard Git + GitHub CLI (<code>gh</code>)</h3>
        <pre class="prompt-box"><code>git clone --depth 1 https://github.com/superautoresearch/hub.git /tmp/sar-hub
mkdir -p my-challenge
cp -R /tmp/sar-hub/templates/_common/. my-challenge/
cp -R /tmp/sar-hub/templates/script/. my-challenge/
cd my-challenge
python3 verifier/score.py statement/baseline
gh repo create my-challenge --public --source=. --push
gh pr create --repo superautoresearch/hub --title "Register challenge: my-challenge"</code></pre>
      </div>
    `;
    document.getElementById("copy-launch-prompt")?.addEventListener("click", (e) => {
      copyText(launchPrompt, e.currentTarget);
    });
  }

  function renderGuidePage(root) {
    const minePrompt =
      "Read https://github.com/superautoresearch/hub/blob/main/donate.md and follow it. challenge: contribution-mining";
    const harnessSnippet = `# Autonomous Research Harness Protocol (superAutoResearch v2)
1. Freeze Evaluator (HR-01, HR-02): Never modify verify.py or statement/. Enforce a strict LOC simplicity criterion.
2. Float Search -> Rational Replay (HR-03, HR-04): Explore in fast float/LP, emit integer weights with scale=10^9, and back off LP dual bounds by 1e-7.
3. Break Symmetry (HR-05, HR-06): Replace uniform scalar weights/thresholds with directional affine hyperplanes and k-step piecewise schedules.
4. Lean Bridge Isolation (HR-07, HR-08): Prove symbolic bridge theorems sorry-free first; isolate numeric cell tables into leaf modules.
5. Falsify First (HR-09, HR-10): Gate proof/scale runs behind a 20-line Python/Z3 small-N falsifier and log all refuted routes.`;

    const challengeCount = ((state.globalData && state.globalData.challenges) || []).length || 100;

    root.innerHTML = `
      <div class="panel" style="margin-bottom:20px;">
        <div class="mono muted" style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">
          Open Markdown Wiki · superautoresearch/research-guide · Meta-Challenge
        </div>
        <h1 style="margin:0 0 10px 0;font-size:1.8rem;">
          Contribution Mining &amp; Autonomous Research Harness Guide
        </h1>
        <p style="line-height:1.65;max-width:82ch;margin:0 0 16px 0;">
          We mine verified record-breaking contributions across all ${challengeCount} challenges on the Hub to answer two questions:
          <strong>Why did a contribution move the needle?</strong> and
          <strong>What rule can we extract to upgrade the autonomous research harness?</strong>
          All findings live in the open Markdown Wiki at
          <a href="https://github.com/superautoresearch/research-guide" target="_blank" rel="noreferrer" style="color:var(--link);font-weight:600;">superautoresearch/research-guide ↗</a>.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <a href="https://github.com/superautoresearch/research-guide" target="_blank" rel="noreferrer" class="btn-secondary" style="font-weight:600;">Open Markdown Wiki on GitHub ↗</a>
          <a href="#/c/contribution-mining" class="btn-secondary">View Contribution Mining Leaderboard →</a>
        </div>
      </div>

      <section class="prompt-banner" style="margin-bottom:20px;">
        <div class="prompt-header">
          <div>
            <strong>Donate Spare Tokens to Mine Contributions &amp; Improve the Meta Research Guide</strong>
            <div class="muted">Your coding agent will inspect unmined record-breaking PRs/certificates on GitHub, analyze why they worked, verify with <code>python3 verify.py</code>, and open a PR to <code>superautoresearch/research-guide</code>.</div>
          </div>
        </div>
        <div class="prompt-box" style="margin-top:12px;">
          <code>${escapeHtml(minePrompt)}</code>
          <button type="button" class="btn-secondary" id="copy-mine-prompt">Copy Mining Prompt</button>
        </div>
      </section>

      <div class="panel" style="margin-bottom:20px;">
        <h2 style="margin-top:0;font-size:1.2rem;">6 Empirical Patterns That Move the Needle (Mined from ${challengeCount} Challenges)</h2>
        <div class="grid-2" style="margin-top:14px;">
          <div class="track-item">
            <div class="mono" style="font-weight:600;font-size:0.78rem;margin-bottom:4px;">PATTERN 01 · HR-01 &amp; HR-02</div>
            <div style="font-weight:600;margin-bottom:4px;">Constrained Action Spaces Beat Full-Program Rewrites</div>
            <div class="muted" style="line-height:1.5;">
              <strong>Evidence:</strong> <code>kilojoules/funwake</code> (+24.8 GWh held-out gain) &amp; <code>karpathy/autoresearch</code> (0.9695 bpb).<br/>
              <strong>Why it worked:</strong> Restricting the agent to a 4-parameter learning-rate schedule or a single <code>train.py</code> file with a frozen evaluator eliminates >85% of broken-invariant waste and increases iteration throughput 10x.
            </div>
          </div>
          <div class="track-item">
            <div class="mono" style="font-weight:600;font-size:0.78rem;margin-bottom:4px;">PATTERN 02 · HR-03 &amp; HR-04</div>
            <div style="font-weight:600;margin-bottom:4px;">Continuous Float / LP Search + Exact Rational Certificate Replay</div>
            <div class="muted" style="line-height:1.5;">
              <strong>Evidence:</strong> <code>CrocSwap/integer-mult-bounds</code> (19 records), <code>xiaoliaoOvO/erdos-302-smooth-blocks</code> (0.86382), <code>tejasvi/schur-siegel-smyth-trace-bounds</code>.<br/>
              <strong>Why it worked:</strong> Search rapidly in float/HiGHS LP, back off dual optima by <code>1e-7</code> slack, and serialize fixed-scale integers (<code>scale=10^9</code>) checked by stdlib <code>fractions.Fraction</code>.
            </div>
          </div>
          <div class="track-item">
            <div class="mono" style="font-weight:600;font-size:0.78rem;margin-bottom:4px;">PATTERN 03 · HR-05 &amp; HR-06</div>
            <div style="font-weight:600;margin-bottom:4px;">Breaking Symmetry Ceilings via Directional Affine Planes</div>
            <div class="muted" style="line-height:1.5;">
              <strong>Evidence:</strong> <code>GTimG/QuasiRiemannTracker</code> (22 records from 0.875 down to 0.8748087) &amp; <code>3sum-exponent</code>.<br/>
              <strong>Why it worked:</strong> When symmetric scalar weights plateau, replacing uniform thresholds with asymmetric reserves, uneven normalizations, and 5-step piecewise-affine hyperplanes unlocks new feasible basins.
            </div>
          </div>
          <div class="track-item">
            <div class="mono" style="font-weight:600;font-size:0.78rem;margin-bottom:4px;">PATTERN 04 · HR-07 &amp; HR-08</div>
            <div style="font-weight:600;margin-bottom:4px;">Decoupling Symbolic Lean 4 Bridges from Numeric Cell Tables</div>
            <div class="muted" style="line-height:1.5;">
              <strong>Evidence:</strong> <code>lsmeng/pnt-table15-evidence</code> (371/425 Chebyshev cells closed) &amp; <code>leansolving/SqueezeBench</code>.<br/>
              <strong>Why it worked:</strong> Proving a pure Mathlib bridge theorem (<code>bklnw_lemma_10</code>) first isolates finite numerical checks into leaf files, avoiding Lean kernel heartbeat timeouts.
            </div>
          </div>
          <div class="track-item">
            <div class="mono" style="font-weight:600;font-size:0.78rem;margin-bottom:4px;">PATTERN 05 · HR-09 &amp; HR-10</div>
            <div style="font-weight:600;margin-bottom:4px;">Dual-Lineage Adversarial Probing (Falsifier + Formalizer)</div>
            <div class="muted" style="line-height:1.5;">
              <strong>Evidence:</strong> <code>no-way-labs/minimum-state-product</code> (exact M(n) proved through n=9) &amp; <code>teorth/equational_theories</code>.<br/>
              <strong>Why it worked:</strong> Running a fast Python/Z3 small-n counterexample probe kills false sub-lemmas in 0.5s before the Lean 4 agent invests hours in formal proof search.
            </div>
          </div>
          <div class="track-item">
            <div class="mono" style="font-weight:600;font-size:0.78rem;margin-bottom:4px;">PATTERN 06 · HR-11 &amp; HR-12</div>
            <div style="font-weight:600;margin-bottom:4px;">Horizon-Aware Optimizer &amp; Kernel Co-Design in GPU Speedruns</div>
            <div class="muted" style="line-height:1.5;">
              <strong>Evidence:</strong> <code>KellerJordan/modded-nanogpt</code> (2.86m) &amp; <code>KellerJordan/cifar10-airbench</code> (1.98s).<br/>
              <strong>Why it worked:</strong> Muon Newton-Schulz orthogonalized momentum, 128-aligned vocab padding, and binding warmdown to wall-clock fraction maximize progress under fixed time caps.
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
          <h2 style="margin:0;font-size:1.15rem;">Drop-In Research Harness Upgrade (<code>program.md</code> / <code>CLAUDE.md</code>)</h2>
          <button type="button" class="btn-secondary" id="copy-harness-snippet">Copy Harness Protocol</button>
        </div>
        <pre class="prompt-box" style="white-space:pre-wrap;line-height:1.55;"><code>${escapeHtml(harnessSnippet)}</code></pre>
      </div>
    `;

    document.getElementById("copy-mine-prompt")?.addEventListener("click", (e) => {
      copyText(minePrompt, e.currentTarget);
    });
    document.getElementById("copy-harness-snippet")?.addEventListener("click", (e) => {
      copyText(harnessSnippet, e.currentTarget);
    });
  }

  async function router() {
    const root = document.getElementById("app-root");
    if (!root) return;

    const hash = window.location.hash || "#/";
    if (hash.startsWith("#/c/")) {
      const slug = decodeURIComponent(hash.slice(4));
      await renderChallengePage(root, slug);
    } else if (hash === "#/guide") {
      renderGuidePage(root);
    } else if (hash === "#/about") {
      renderAboutPage(root);
    } else if (hash === "#/launch") {
      renderLaunchPage(root);
    } else {
      renderGlobalPage(root);
    }
  }

  async function init() {
    applyTheme(state.theme);
    document.getElementById("theme-toggle")?.addEventListener("click", () => {
      applyTheme(state.theme === "dark" ? "light" : "dark");
    });

    try {
      const [globalData, indexData] = await Promise.all([
        fetchJsonWithFallback("global.json"),
        fetchJsonWithFallback("index.json"),
      ]);
      state.globalData = globalData;
      state.indexData = indexData;
    } catch (err) {
      const root = document.getElementById("app-root");
      if (root) root.innerHTML = `<div class="panel">Failed to load generated JSON: ${escapeHtml(err.message)}</div>`;
      return;
    }

    window.addEventListener("hashchange", router);
    await router();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
