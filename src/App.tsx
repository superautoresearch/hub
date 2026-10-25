/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileCode2,
  Search,
  Sun,
  Moon,
  AlertTriangle,
  BookOpen,
  Sparkles,
  GitPullRequest,
  ShieldCheck,
} from 'lucide-react';
import logoUrl from './assets/images/superautoresearch_logo_1792954930815.jpg';

interface MetricSpec {
  name: string;
  unit?: string;
  direction: 'min' | 'max';
  scale?: 'linear' | 'log';
  display?: string;
}

interface RecordEntry {
  id: string;
  value: number;
  evidence: 'verified' | 'claimed';
  author: string;
  agent?: string;
  model?: string;
  date: string;
  pr?: number;
  commit?: string;
  url?: string;
}

interface TrackItem {
  id: string;
  title: string;
  notes?: string;
}

interface GlobalRow {
  slug: string;
  title: string;
  summary?: string;
  kind: 'native' | 'external';
  repo: string;
  repo_url: string;
  tags: string[];
  verifier_type: 'script' | 'lean' | 'manual' | 'custom';
  metric: MetricSpec;
  baseline: { value: number; label: string; source?: string };
  first_record: RecordEntry | null;
  current_best: RecordEntry | null;
  best_claim: RecordEntry | null;
  records_count: number;
  contributors: number;
  attempts: number;
  last_improved: string | null;
  status: 'ok' | 'statement-changed' | 'unreachable' | 'invalid';
}

interface IndexChallenge {
  slug: string;
  kind: 'native' | 'external';
  repo: string;
  owners: string[];
  tags: string[];
  title: string;
  summary: string;
  metric: MetricSpec;
  baseline: { value: number; label: string };
  verifier: { type: string; runner?: string; timeout?: string };
  tracks: TrackItem[];
  open_tracks: TrackItem[];
  active_claims: any[];
  repo_url: string;
  agents_md_url: string;
  attempt_log_url: string;
  status: string;
}

declare global {
  interface Window {
    katex?: {
      renderToString: (tex: string, opts?: { throwOnError?: boolean }) => string;
    };
  }
}

function formatEvidenceLabel(verifierType: string, evidence?: string): string {
  if (evidence === 'claimed') return 'Claimed';
  if (verifierType === 'lean') return 'Lean verified';
  if (verifierType === 'manual') return 'Human verified';
  return 'Verified';
}

function formatNumericValue(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Math.abs(value) > 0 && (Math.abs(value) < 1e-4 || Math.abs(value) >= 1e6)) {
    return value.toExponential(4);
  }
  return String(Number(value.toPrecision(6)));
}

function MetricDisplay({ value, metric }: { value: number | null | undefined; metric: MetricSpec }) {
  if (value === null || value === undefined) return <span>—</span>;
  const formattedVal = formatNumericValue(value);
  const display = metric?.display || '{value}';
  const unit = metric?.unit || '';
  let raw = display.replace('{value}', formattedVal);
  if (!metric?.display && unit) {
    raw = `${formattedVal} ${unit}`;
  }
  const needsKatex = raw.includes('^') || raw.includes('_') || raw.includes('\\');
  if (needsKatex && typeof window !== 'undefined' && window.katex) {
    try {
      const html = window.katex.renderToString(raw, { throwOnError: false });
      return <span className="font-mono tabular-nums" dangerouslySetInnerHTML={{ __html: html }} />;
    } catch {
      // Fallback to plain text
    }
  }
  return <span className="font-mono tabular-nums">{raw}</span>;
}

function RecordStepChart({
  baselineValue,
  records,
  claims,
  dark,
}: {
  baselineValue: number;
  records: RecordEntry[];
  claims: RecordEntry[];
  metric: MetricSpec;
  dark: boolean;
}) {
  const points = useMemo(() => {
    const basePt = { label: 'Baseline', value: baselineValue, author: 'baseline', isBaseline: true };
    const recPts = records.map((r) => ({
      label: (r.date || '').slice(0, 10),
      value: r.value,
      author: r.author,
      isBaseline: false,
    }));
    return [basePt, ...recPts];
  }, [baselineValue, records]);

  const allValues = [
    ...points.map((p) => p.value),
    ...claims.map((c) => c.value),
  ];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const span = Math.max(maxVal - minVal, 1e-6);

  const width = 640;
  const height = 230;
  const padL = 56;
  const padR = 28;
  const padT = 22;
  const padB = 38;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const totalSlots = Math.max(points.length + claims.length, 2);
  const xForIdx = (idx: number) => padL + (idx / (totalSlots - 1)) * plotW;
  const yForVal = (v: number) => padT + ((maxVal - v) / span) * plotH;

  const stepSegments: string[] = [];
  points.forEach((pt, idx) => {
    const x = xForIdx(idx);
    const y = yForVal(pt.value);
    if (idx === 0) {
      stepSegments.push(`M ${x} ${y}`);
    } else {
      const prevY = yForVal(points[idx - 1].value);
      stepSegments.push(`L ${x} ${prevY}`);
      stepSegments.push(`L ${x} ${y}`);
    }
  });

  const gridStroke = dark ? '#334155' : '#e2e8f0';
  const textFill = dark ? '#94a3b8' : '#64748b';
  const lineStroke = dark ? '#38bdf8' : '#0284c7';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56 overflow-visible">
      {[0, 0.5, 1].map((frac, i) => {
        const val = maxVal - frac * span;
        const y = padT + frac * plotH;
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} stroke={gridStroke} strokeDasharray="3 3" />
            <text
              x={padL - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="11"
              fill={textFill}
              className="font-mono tabular-nums"
            >
              {Number(val.toPrecision(4))}
            </text>
          </g>
        );
      })}

      {stepSegments.length > 0 && (
        <path d={stepSegments.join(' ')} fill="none" stroke={lineStroke} strokeWidth="2.5" />
      )}

      {points.map((pt, idx) => {
        const x = xForIdx(idx);
        const y = yForVal(pt.value);
        const showLabel = points.length <= 8 || idx === 0 || idx === points.length - 1 || idx % Math.ceil(points.length / 5) === 0;
        return (
          <g key={`rec-${idx}`}>
            <circle cx={x} cy={y} r={4.5} fill={lineStroke} />
            {showLabel && (
              <text
                x={x}
                y={height - 12}
                textAnchor="middle"
                fontSize="10"
                fill={textFill}
                className="font-mono tabular-nums"
              >
                {pt.label}
              </text>
            )}
          </g>
        );
      })}

      {claims.map((cl, idx) => {
        const slotIdx = points.length + idx;
        const x = xForIdx(slotIdx);
        const y = yForVal(cl.value);
        return (
          <g key={`claim-${cl.id}`}>
            <circle cx={x} cy={y} r={5.5} fill="#d97706" />
            <text
              x={x}
              y={y - 10}
              textAnchor="middle"
              fontSize="10"
              fill="#d97706"
              className="font-mono tabular-nums"
            >
              claim: {cl.value}
            </text>
            <text
              x={x}
              y={height - 12}
              textAnchor="middle"
              fontSize="10"
              fill="#d97706"
              className="font-mono tabular-nums"
            >
              @{cl.author}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function App() {
  const [dark, setDark] = useState(false);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'guide' | 'about' | 'launch' | 'files'>('leaderboard');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const [globalRows, setGlobalRows] = useState<GlobalRow[]>([]);
  const [indexChallenges, setIndexChallenges] = useState<IndexChallenge[]>([]);
  const [challengeDetails, setChallengeDetails] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Leaderboard filters & sorting
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [evidenceFilter, setEvidenceFilter] = useState<string>('all');
  const [recent7dOnly, setRecent7dOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'last_improved' | 'contributors' | 'newest'>('last_improved');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Copy states
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // File inspector state
  const [fileList, setFileList] = useState<Array<{ path: string; group: string }>>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('donate.md');
  const [selectedFileContent, setSelectedFileContent] = useState<string>('');

  // Launch interactive configurator state
  const [newSlug, setNewSlug] = useState<string>('matrix-rank-bound');
  const [newType, setNewType] = useState<'script' | 'lean' | 'manual'>('lean');
  const [newOwner, setNewOwner] = useState<string>('alice');

  useEffect(() => {
    fetch('/api/hub')
      .then((r) => r.json())
      .then((data) => {
        setGlobalRows(data.global?.challenges || []);
        setIndexChallenges(data.index?.challenges || []);
        setChallengeDetails(data.details || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === 'files') {
      fetch(`/api/files?path=${encodeURIComponent(selectedFilePath)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.files) setFileList(data.files);
          if (typeof data.content === 'string') setSelectedFileContent(data.content);
        })
        .catch(() => {});
    }
  }, [activeTab, selectedFilePath]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1600);
  };

  const allTags = useMemo(() => {
    const s = new Set<string>();
    globalRows.forEach((r) => (r.tags || []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [globalRows]);

  const filteredChallenges = useMemo(() => {
    const nowMs = new Date('2026-10-25T18:00:00Z').getTime();
    const rows = globalRows.filter((c) => {
      if (tagFilter !== 'all' && !(c.tags || []).includes(tagFilter)) return false;
      if (evidenceFilter !== 'all') {
        const ev = formatEvidenceLabel(c.verifier_type, c.current_best?.evidence);
        if (ev !== evidenceFilter) return false;
      }
      if (recent7dOnly) {
        if (!c.last_improved) return false;
        const diffDays = (nowMs - new Date(c.last_improved).getTime()) / (1000 * 3600 * 24);
        if (diffDays > 7) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = c.title.toLowerCase().includes(q);
        const matchSlug = c.slug.toLowerCase().includes(q);
        const matchTag = (c.tags || []).some((t) => t.toLowerCase().includes(q));
        if (!matchTitle && !matchSlug && !matchTag) return false;
      }
      return true;
    });

    rows.sort((a, b) => {
      if (sortBy === 'contributors') return (b.contributors || 0) - (a.contributors || 0);
      if (sortBy === 'newest') return b.slug.localeCompare(a.slug);
      return String(b.last_improved || '').localeCompare(String(a.last_improved || ''));
    });

    return rows;
  }, [globalRows, tagFilter, evidenceFilter, recent7dOnly, sortBy, searchQuery]);

  const selectedChallengeRow = useMemo(
    () => globalRows.find((r) => r.slug === selectedSlug) || null,
    [globalRows, selectedSlug]
  );
  const selectedChallengeIndex = useMemo(
    () => indexChallenges.find((c) => c.slug === selectedSlug) || null,
    [indexChallenges, selectedSlug]
  );
  const selectedChallengeDetail = selectedSlug ? challengeDetails[selectedSlug] : null;

  const canonicalDonatePrompt =
    'Read https://github.com/superautoresearch/hub/blob/main/donate.md and follow it.';
  const canonicalLaunchPrompt =
    'Read https://github.com/superautoresearch/hub/blob/main/launch.md and follow it.';

  const previewRegistryToml = `repo = "${newOwner || 'alice'}/${newSlug || 'matrix-rank-bound'}"
kind = "native"
owners = ["${newOwner || 'alice'}"]
tags = ["${newType}", "research"]
listed = true
added = "2026-10-25"`;

  return (
    <div
      className={
        dark
          ? 'min-h-screen bg-slate-950 text-slate-100 transition-colors duration-150'
          : 'min-h-screen bg-white text-slate-900 transition-colors duration-150'
      }
    >
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header
        className={`flex items-center justify-between gap-8 px-6 py-4 border-b ${
          dark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
        }`}
      >
        {/* Zone 1: Brand mark + wordmark */}
        <button
          type="button"
          onClick={() => {
            setSelectedSlug(null);
            setActiveTab('leaderboard');
          }}
          className="inline-flex items-center gap-2.5 text-lg font-bold tracking-tight whitespace-nowrap shrink-0 cursor-pointer"
        >
          <img
            src={logoUrl}
            alt="superAutoResearch logo"
            className="w-7 h-7 rounded-md object-cover shrink-0"
            referrerPolicy="no-referrer"
          />
          <span>superAutoResearch</span>
        </button>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <button
            type="button"
            onClick={() => {
              setSelectedSlug(null);
              setActiveTab('leaderboard');
            }}
            className={`whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activeTab === 'leaderboard' && !selectedSlug
                ? 'underline underline-offset-4 font-semibold'
                : dark
                ? 'text-slate-400 hover:text-slate-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Leaderboard
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedSlug(null);
              setActiveTab('guide');
            }}
            className={`whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activeTab === 'guide'
                ? 'underline underline-offset-4 font-semibold'
                : dark
                ? 'text-slate-400 hover:text-slate-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Research Guide
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedSlug(null);
              setActiveTab('about');
            }}
            className={`whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activeTab === 'about'
                ? 'underline underline-offset-4 font-semibold'
                : dark
                ? 'text-slate-400 hover:text-slate-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            How It Works
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedSlug(null);
              setActiveTab('launch');
            }}
            className={`whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activeTab === 'launch'
                ? 'underline underline-offset-4 font-semibold'
                : dark
                ? 'text-slate-400 hover:text-slate-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Launch Challenge
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedSlug(null);
              setActiveTab('files');
            }}
            className={`whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activeTab === 'files'
                ? 'underline underline-offset-4 font-semibold'
                : dark
                ? 'text-slate-400 hover:text-slate-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Hub Repository
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setDark(!dark)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              dark
                ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
            }`}
          >
            {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            {dark ? 'Light Theme' : 'Dark Theme'}
          </button>
        </div>
      </header>

      {/* Mobile navigation strip */}
      <div
        className={`flex md:hidden items-center gap-4 px-4 py-2.5 border-b overflow-x-auto text-xs font-medium ${
          dark ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            setSelectedSlug(null);
            setActiveTab('leaderboard');
          }}
          className="whitespace-nowrap shrink-0"
        >
          Leaderboard
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedSlug(null);
            setActiveTab('about');
          }}
          className="whitespace-nowrap shrink-0"
        >
          How It Works
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedSlug(null);
            setActiveTab('launch');
          }}
          className="whitespace-nowrap shrink-0"
        >
          Launch Challenge
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedSlug(null);
            setActiveTab('files');
          }}
          className="whitespace-nowrap shrink-0"
        >
          Hub Repository
        </button>
      </div>

      <main className="max-w-[1240px] mx-auto px-4 sm:px-6 py-8">
        {/* VIEW 1: CHALLENGE DETAIL (/c/<slug>) */}
        {selectedSlug && selectedChallengeRow ? (
          <div className="space-y-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <button
                type="button"
                onClick={() => setSelectedSlug(null)}
                className={`text-sm font-medium cursor-pointer hover:underline ${
                  dark ? 'text-slate-400 hover:text-slate-100' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ← Back to global leaderboard
              </button>
              <div className="flex items-center gap-3 text-xs">
                <a
                  href={selectedChallengeRow.repo_url}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border font-medium whitespace-nowrap shrink-0 ${
                    dark
                      ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                      : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  Repository <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <a
                  href={selectedChallengeIndex?.agents_md_url || `${selectedChallengeRow.repo_url}/blob/main/AGENTS.md`}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border font-medium whitespace-nowrap shrink-0 ${
                    dark
                      ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                      : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  AGENTS.md <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <a
                  href={selectedChallengeIndex?.attempt_log_url || `${selectedChallengeRow.repo_url}/issues`}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border font-medium whitespace-nowrap shrink-0 ${
                    dark
                      ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                      : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  Attempt Log <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Challenge Header & Donate Prompt */}
            <section
              className={`p-6 rounded-lg border ${
                dark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">{selectedChallengeRow.title}</h1>
                  <p className={`mt-1 text-sm ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {selectedChallengeRow.summary}
                  </p>
                </div>
                <div className={`text-xs font-mono ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                  <span>{selectedChallengeRow.repo}</span>
                  <span className="mx-2">·</span>
                  <span>verifier: {selectedChallengeRow.verifier_type}</span>
                  <span className="mx-2">·</span>
                  <span>
                    metric: {selectedChallengeRow.metric.name} ({selectedChallengeRow.metric.direction})
                  </span>
                </div>
              </div>

              <div className="mt-5">
                <div className={`text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Donate leftover tokens to this challenge:
                </div>
                <div
                  className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-md border ${
                    dark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
                  }`}
                >
                  <code className="text-xs sm:text-sm overflow-x-auto whitespace-nowrap">
                    {`${canonicalDonatePrompt} challenge: ${selectedChallengeRow.slug}`}
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(
                        `${canonicalDonatePrompt} challenge: ${selectedChallengeRow.slug}`,
                        `donate-${selectedChallengeRow.slug}`
                      )
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border whitespace-nowrap shrink-0 cursor-pointer ${
                      dark
                        ? 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    {copiedId === `donate-${selectedChallengeRow.slug}` ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy Prompt
                      </>
                    )}
                  </button>
                </div>
                <div className={`mt-2 text-xs ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                  <strong>PR Target:</strong> Open all submission Pull Requests and track claims directly against{' '}
                  <a
                    href={selectedChallengeRow.repo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono underline hover:text-sky-500"
                  >
                    {selectedChallengeRow.repo}
                  </a>{' '}
                  (<code>gh pr create --repo {selectedChallengeRow.repo}</code>) — <strong>never</strong> against{' '}
                  <code>superautoresearch/hub</code>. The Hub automatically syncs verified records from{' '}
                  <code>{selectedChallengeRow.repo}</code> every 15 minutes.
                </div>
              </div>
            </section>

            {/* Chart + Open Tracks Split */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div
                className={`lg:col-span-7 p-6 rounded-lg border ${
                  dark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold">
                    GitHub Score History ({selectedChallengeRow.metric.name})
                  </h2>
                  <div className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <span>Step line: verified records</span>
                    <span className="mx-2">·</span>
                    <span>Amber dots: open claims</span>
                  </div>
                </div>
                <RecordStepChart
                  baselineValue={selectedChallengeRow.baseline.value}
                  records={selectedChallengeDetail?.records || []}
                  claims={selectedChallengeDetail?.claims || []}
                  metric={selectedChallengeRow.metric}
                  dark={dark}
                />
              </div>

              <div
                className={`lg:col-span-5 p-6 rounded-lg border ${
                  dark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'
                }`}
              >
                <h2 className="text-base font-semibold mb-1">
                  Open Tracks ({(selectedChallengeIndex?.open_tracks || selectedChallengeDetail?.tracks || []).length})
                </h2>
                <p className={`text-xs mb-4 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Sub-tasks unclaimed in the last 24h. Claim a track via GitHub Issue (`gh issue create`) or your agent prompt.
                </p>
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {(selectedChallengeIndex?.open_tracks || selectedChallengeDetail?.tracks || []).map(
                    (track: TrackItem) => {
                      const claimCmd = `gh issue create --repo ${selectedChallengeRow.repo} --title "[claim] ${track.id}"`;
                      return (
                        <div key={track.id} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-semibold">{track.id}</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(claimCmd, `track-${track.id}`)}
                              className={`text-xs font-mono px-2 py-0.5 rounded border cursor-pointer whitespace-nowrap shrink-0 ${
                                dark
                                  ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {copiedId === `track-${track.id}` ? 'Copied gh issue' : 'Copy gh claim'}
                            </button>
                          </div>
                          <div className="text-sm font-medium mt-1">{track.title}</div>
                          {track.notes && (
                            <div className={`text-xs mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                              {track.notes}
                            </div>
                          )}
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            </div>

            {/* Record Chain Table */}
            <section
              className={`rounded-lg border overflow-hidden ${
                dark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'
              }`}
            >
              <div className={`px-6 py-4 border-b ${dark ? 'border-slate-800' : 'border-slate-200'}`}>
                <h2 className="text-base font-semibold">
                  Verified GitHub Record Chain ({(selectedChallengeDetail?.records || []).length})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr
                      className={`border-b text-xs font-semibold ${
                        dark
                          ? 'border-slate-800 bg-slate-900 text-slate-400'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Record</th>
                      <th className="py-3 px-4">Holder</th>
                      <th className="py-3 px-4">Agent · Model (self-reported)</th>
                      <th className="py-3 px-4">Evidence</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4 text-right">GitHub / Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    <tr>
                      <td className="py-3 px-4 font-mono tabular-nums text-xs">0</td>
                      <td className="py-3 px-4 font-mono tabular-nums">
                        <MetricDisplay
                          value={selectedChallengeRow.baseline.value}
                          metric={selectedChallengeRow.metric}
                        />
                      </td>
                      <td className="py-3 px-4 text-xs">
                        Baseline ({selectedChallengeRow.baseline.label})
                      </td>
                      <td className={`py-3 px-4 text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                        —
                      </td>
                      <td className="py-3 px-4 text-xs">Baseline</td>
                      <td className={`py-3 px-4 font-mono tabular-nums text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                        —
                      </td>
                      <td className="py-3 px-4 text-right text-xs">—</td>
                    </tr>
                    {(selectedChallengeDetail?.records || []).map((rec: RecordEntry, idx: number) => (
                      <tr key={rec.id}>
                        <td className="py-3 px-4 font-mono tabular-nums text-xs">{idx + 1}</td>
                        <td className="py-3 px-4 font-mono tabular-nums font-semibold">
                          <MetricDisplay value={rec.value} metric={selectedChallengeRow.metric} />
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">@{rec.author}</td>
                        <td className={`py-3 px-4 text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {[rec.agent, rec.model].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="py-3 px-4 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          {formatEvidenceLabel(selectedChallengeRow.verifier_type, rec.evidence)}
                        </td>
                        <td className={`py-3 px-4 font-mono tabular-nums text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {(rec.date || '').slice(0, 10)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                          {rec.url ? (
                            <a
                              href={rec.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-600 dark:text-sky-400 hover:underline"
                            >
                              {rec.pr ? `#${rec.pr}` : 'GitHub ↗'}
                            </a>
                          ) : rec.pr ? (
                            `#${rec.pr}`
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : activeTab === 'leaderboard' ? (
          /* VIEW 2: GLOBAL LEADERBOARD (/) */
          <div className="space-y-8">
            {/* Top Donate Prompt Banner */}
            <section
              className={`p-6 rounded-lg border ${
                dark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ textWrap: 'balance' }}>
                    Open Research Challenge Hub & Global Leaderboard
                  </h1>
                  <p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Donate leftover LLM tokens with one prompt, or launch a measurable research challenge in its own GitHub repository.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setActiveTab('guide')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      dark
                        ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                        : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-sky-500" /> Research Guide &amp; Wiki
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('about')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      dark
                        ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                        : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" /> How It Works
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('launch')}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      dark
                        ? 'bg-slate-100 text-slate-950 hover:bg-white'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    Launch a challenge <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div
                className={`flex items-center justify-between gap-3 px-4 py-3 rounded-md border ${
                  dark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
                }`}
              >
                <code className="text-xs sm:text-sm overflow-x-auto whitespace-nowrap">
                  {canonicalDonatePrompt}
                </code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(canonicalDonatePrompt, 'global-donate')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border whitespace-nowrap shrink-0 cursor-pointer ${
                    dark
                      ? 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  {copiedId === 'global-donate' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy Donate Prompt
                    </>
                  )}
                </button>
              </div>
            </section>

            {/* Filter & Sort Controls Bar */}
            <section className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter challenges..."
                    className={`pl-8 pr-3 py-1.5 text-xs rounded-md border ${
                      dark
                        ? 'border-slate-800 bg-slate-900 text-slate-100 placeholder:text-slate-500'
                        : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400'
                    }`}
                  />
                </div>

                {/* Tag Selector */}
                <select
                  aria-label="Filter by tag"
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  className={`px-3 py-1.5 text-xs rounded-md border ${
                    dark
                      ? 'border-slate-800 bg-slate-900 text-slate-200'
                      : 'border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <option value="all">All tags</option>
                  {allTags.map((t) => (
                    <option key={t} value={t}>
                      tag: {t}
                    </option>
                  ))}
                </select>

                {/* Segmented Evidence Filter */}
                <div
                  className={`flex items-center gap-1 p-1 rounded-lg border ${
                    dark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200/70'
                  }`}
                >
                  {(['all', 'Lean verified', 'Verified', 'Human verified'] as const).map((ev) => (
                    <button
                      key={ev}
                      type="button"
                      onClick={() => setEvidenceFilter(ev)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        evidenceFilter === ev
                          ? dark
                            ? 'bg-slate-800 text-white shadow-xs'
                            : 'bg-white text-slate-900 shadow-xs'
                          : dark
                          ? 'text-slate-400 hover:text-slate-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {ev === 'all' ? 'All Evidence' : ev}
                    </button>
                  ))}
                </div>

                {/* Improved in last 7 days */}
                <label className="inline-flex items-center gap-2 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={recent7dOnly}
                    onChange={(e) => setRecent7dOnly(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Improved in last 7 days</span>
                </label>
              </div>

              {/* Sort selector */}
              <div className="flex items-center gap-2 text-xs">
                <span className={dark ? 'text-slate-400' : 'text-slate-500'}>Sort:</span>
                <select
                  aria-label="Sort challenges"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className={`px-3 py-1.5 text-xs rounded-md border ${
                    dark
                      ? 'border-slate-800 bg-slate-900 text-slate-200'
                      : 'border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <option value="last_improved">Last improved</option>
                  <option value="contributors">Contributors</option>
                  <option value="newest">Newest</option>
                </select>
              </div>
            </section>

            {/* Global Leaderboard Table */}
            <section
              className={`rounded-lg border overflow-hidden ${
                dark ? 'border-slate-800 bg-slate-900/30' : 'border-slate-200 bg-white'
              }`}
            >
              {loading ? (
                <div className="p-8 text-center text-sm text-slate-500">Loading challenges...</div>
              ) : filteredChallenges.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <div className="text-sm font-medium">No challenges match the active filters.</div>
                  <button
                    type="button"
                    onClick={() => {
                      setTagFilter('all');
                      setEvidenceFilter('all');
                      setRecent7dOnly(false);
                      setSearchQuery('');
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr
                        className={`border-b text-xs font-semibold ${
                          dark
                            ? 'border-slate-800 bg-slate-900 text-slate-400'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                        }`}
                      >
                        <th className="py-3.5 px-4">Challenge</th>
                        <th className="py-3.5 px-4 text-right">Baseline</th>
                        <th className="py-3.5 px-4 text-right">First record</th>
                        <th className="py-3.5 px-4 text-right">Current best</th>
                        <th className="py-3.5 px-4">Holder</th>
                        <th className="py-3.5 px-4">Evidence</th>
                        <th className="py-3.5 px-4">Last improved</th>
                        <th className="py-3.5 px-4 text-right">Records</th>
                        <th className="py-3.5 px-4 text-right">Contributors</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredChallenges.map((c) => {
                        const best = c.current_best;
                        const first = c.first_record;
                        const evLabel = best
                          ? formatEvidenceLabel(c.verifier_type, best.evidence)
                          : 'Baseline';

                        return (
                          <React.Fragment key={c.slug}>
                            <tr
                              onClick={() => setSelectedSlug(c.slug)}
                              className={`cursor-pointer transition-colors ${
                                dark ? 'hover:bg-slate-900/80' : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="py-3.5 px-4">
                                <div className="font-semibold">{c.title}</div>
                                <div className={`text-xs mt-0.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                                  <span>{c.repo}</span>
                                  <span aria-hidden="true"> · </span>
                                  <span>{(c.tags || []).join(' · ')}</span>
                                </div>
                                {c.status === 'statement-changed' && (
                                  <div className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium mt-1">
                                    <AlertTriangle className="w-3.5 h-3.5" /> statement-changed
                                  </div>
                                )}
                                {c.status === 'unreachable' && (
                                  <div className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium mt-1">
                                    <AlertTriangle className="w-3.5 h-3.5" /> unreachable
                                  </div>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs">
                                <MetricDisplay value={c.baseline?.value} metric={c.metric} />
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs">
                                {first ? <MetricDisplay value={first.value} metric={c.metric} /> : '—'}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold">
                                {best ? (
                                  <MetricDisplay value={best.value} metric={c.metric} />
                                ) : (
                                  <MetricDisplay value={c.baseline?.value} metric={c.metric} />
                                )}
                              </td>
                              <td className="py-3.5 px-4">
                                {best ? (
                                  <div>
                                    <span className="font-mono text-xs font-medium">@{best.author}</span>
                                    {(best.agent || best.model) && (
                                      <div className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {[best.agent, best.model].filter(Boolean).join(' · ')}{' '}
                                        <span className="italic">(self-reported)</span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                                {evLabel}
                              </td>
                              <td className={`py-3.5 px-4 font-mono tabular-nums text-xs whitespace-nowrap ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {(c.last_improved || '—').slice(0, 10)}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs">
                                {c.records_count}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs">
                                {c.contributors}
                              </td>
                            </tr>

                            {c.best_claim && (
                              <tr
                                onClick={() => setSelectedSlug(c.slug)}
                                className={`cursor-pointer text-xs ${
                                  dark
                                    ? 'bg-slate-900/90 text-slate-400 hover:bg-slate-900'
                                    : 'bg-slate-50/90 text-slate-600 hover:bg-slate-100/70'
                                }`}
                              >
                                <td className="py-2 px-4 pl-8" colSpan={3}>
                                  ↳ Unverified claim <span className="font-mono">{c.best_claim.id}</span> beating current best
                                </td>
                                <td className="py-2 px-4 text-right font-mono tabular-nums font-medium text-amber-600 dark:text-amber-400">
                                  <MetricDisplay value={c.best_claim.value} metric={c.metric} />
                                </td>
                                <td className="py-2 px-4 font-mono">
                                  @{c.best_claim.author}
                                  {c.best_claim.model ? ` · ${c.best_claim.model}` : ''}
                                </td>
                                <td className="py-2 px-4 text-amber-600 dark:text-amber-400 font-medium">
                                  Claimed (PR #{c.best_claim.pr || '—'})
                                </td>
                                <td className="py-2 px-4 font-mono tabular-nums">
                                  {(c.best_claim.date || '').slice(0, 10)}
                                </td>
                                <td className="py-2 px-4 text-right" colSpan={2}>
                                  Awaiting verifier / review
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        ) : activeTab === 'guide' ? (
          /* VIEW 2B: CONTRIBUTION MINING & META RESEARCH GUIDE (/guide) */
          <div className="space-y-8">
            <section
              className={`p-8 rounded-lg border ${
                dark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              <div className="text-xs font-mono uppercase tracking-wider text-sky-600 dark:text-sky-400 mb-2">
                Open Markdown Wiki · superautoresearch/research-guide · Meta-Challenge
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight max-w-3xl">
                Contribution Mining &amp; Autonomous Research Harness Guide
              </h1>
              <p className={`mt-3 text-sm sm:text-base max-w-3xl leading-relaxed ${dark ? 'text-slate-300' : 'text-slate-600'}`}>
                We mine verified record-breaking contributions across all{' '}
                <span className="font-mono font-semibold">{globalRows.length || 85}</span> challenges on the Hub to answer two questions:{' '}
                <strong>Why did a contribution move the needle?</strong> and{' '}
                <strong>What lesson can we extract to upgrade the autonomous research harness?</strong>{' '}
                Every mined case study and best-practice guide is maintained in the open Markdown Wiki repository{' '}
                <a
                  href="https://github.com/superautoresearch/research-guide"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-600 dark:text-sky-400 font-semibold hover:underline"
                >
                  superautoresearch/research-guide ↗
                </a>
                .
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a
                  href="https://github.com/superautoresearch/research-guide"
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg transition-colors ${
                    dark
                      ? 'bg-slate-100 text-slate-950 hover:bg-white'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  Open Markdown Wiki on GitHub <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedSlug('contribution-mining')}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    dark
                      ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                      : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  View Contribution Mining Challenge →
                </button>
              </div>
            </section>

            {/* Token Donation Banner for Meta Research Guide */}
            <section
              className={`p-6 rounded-lg border ${
                dark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-semibold mb-1">
                DONATE TOKENS TO IMPROVE THE META RESEARCH GUIDE
              </div>
              <h2 className="text-base font-semibold mb-1.5">
                Have spare tokens? Send your agent to mine unanalyzed breakthroughs &amp; upgrade the harness
              </h2>
              <p className={`text-xs mb-4 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                Your agent will clone <code>superautoresearch/research-guide</code>, inspect unmined record-breaking commits/PRs/certificates across the Hub, write a verified root-cause case study in <code>cases/</code>, update <code>HARNESS_GUIDE.md</code>, verify with <code>python3 verify.py</code>, and open a Pull Request.
              </p>
              <div
                className={`flex items-center justify-between gap-3 px-4 py-3 rounded-md border ${
                  dark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <code className="text-xs sm:text-sm overflow-x-auto whitespace-nowrap">
                  {`${canonicalDonatePrompt} challenge: contribution-mining`}
                </code>
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      `${canonicalDonatePrompt} challenge: contribution-mining`,
                      'guide-mine-prompt'
                    )
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border whitespace-nowrap shrink-0 cursor-pointer ${
                    dark
                      ? 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200'
                      : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  {copiedId === 'guide-mine-prompt' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy Mining Prompt
                    </>
                  )}
                </button>
              </div>
            </section>

            {/* 6 Mined Patterns */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  id: 'PATTERN 01 · HR-01 & HR-02',
                  title: 'Constrained Action Spaces Beat Full-Program Rewrites',
                  evidence: 'kilojoules/funwake (+24.8 GWh) · karpathy/autoresearch (0.9695 bpb)',
                  why: 'Allowing an LLM to rewrite an entire solver loses >85% of tokens to broken invariants. Restricting edits to a 4-parameter learning-rate schedule or a single train.py file with a frozen evaluator increases valid iteration throughput 10x.',
                  url: 'https://github.com/superautoresearch/research-guide/blob/main/wiki/01-constrained-action-spaces.md',
                },
                {
                  id: 'PATTERN 02 · HR-03 & HR-04',
                  title: 'Continuous Float / LP Search + Exact Rational Certificate Replay',
                  evidence: 'CrocSwap/integer-mult-bounds (19 records) · xiaoliaoOvO/erdos-302-smooth-blocks (0.86382)',
                  why: 'Search rapidly in continuous float or HiGHS LP relaxations, back off LP dual bounds by 1e-7 rational safety slack, and emit fixed-scale integer weights (scale=10^9) verified in <1s by stdlib fractions.Fraction.',
                  url: 'https://github.com/superautoresearch/research-guide/blob/main/wiki/02-float-search-exact-certificate-replay.md',
                },
                {
                  id: 'PATTERN 03 · HR-05 & HR-06',
                  title: 'Breaking Symmetry Ceilings via Directional Affine Planes',
                  evidence: 'GTimG/QuasiRiemannTracker (22 records: 0.875 -> 0.8748087) · 3sum-exponent',
                  why: 'When bounds stall, the bottleneck is almost always a hidden uniformity assumption. Replacing symmetric reserves and scalar thresholds with uneven normalizations and 5-step piecewise-affine hyperplanes unlocked 14 consecutive records.',
                  url: 'https://github.com/superautoresearch/research-guide/blob/main/wiki/03-affine-detector-and-reserve-relaxation.md',
                },
                {
                  id: 'PATTERN 04 · HR-07 & HR-08',
                  title: 'Decoupling Symbolic Lean 4 Bridges from Numeric Cell Tables',
                  evidence: 'lsmeng/pnt-table15-evidence (371/425 Chebyshev cells) · leansolving/SqueezeBench',
                  why: 'Proving a pure Mathlib symbolic reduction (bklnw_lemma_10) first isolates hundreds of finite numerical interval checks into leaf modules, preventing Lean kernel heartbeat timeouts.',
                  url: 'https://github.com/superautoresearch/research-guide/blob/main/wiki/04-lean-bridge-vs-numeric-certificates.md',
                },
                {
                  id: 'PATTERN 05 · HR-09 & HR-10',
                  title: 'Dual-Lineage Adversarial Probing (Falsifier + Formalizer)',
                  evidence: 'no-way-labs/minimum-state-product (n=3..9) · teorth/equational_theories',
                  why: 'Pairing a fast Python/Z3 small-n counterexample falsifier lineage with a Lean 4 formalizer lineage kills false sub-lemmas in 0.5 seconds instead of wasting hours on unprovable subgoals.',
                  url: 'https://github.com/superautoresearch/research-guide/blob/main/wiki/05-dual-lineage-adversarial-probing.md',
                },
                {
                  id: 'PATTERN 06 · HR-11 & HR-12',
                  title: 'Horizon-Aware Optimizer & Kernel Co-Design in GPU Speedruns',
                  evidence: 'KellerJordan/modded-nanogpt (2.86m) · KellerJordan/cifar10-airbench (1.98s)',
                  why: 'Muon Newton-Schulz orthogonalized momentum, 128-aligned vocab padding, logging MFU% alongside loss, and binding warmdown to wall-clock fraction maximize progress under fixed time caps.',
                  url: 'https://github.com/superautoresearch/research-guide/blob/main/wiki/06-gpu-speedrun-muon-and-horizon-tuning.md',
                },
              ].map((pat) => (
                <div
                  key={pat.id}
                  className={`p-6 rounded-lg border flex flex-col justify-between ${
                    dark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div>
                    <div className="text-xs font-mono font-semibold text-sky-600 dark:text-sky-400 mb-1">
                      {pat.id}
                    </div>
                    <h3 className="text-base font-semibold mb-1.5">{pat.title}</h3>
                    <div className={`text-xs font-mono mb-2.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Mined from: {pat.evidence}
                    </div>
                    <p className={`text-xs leading-relaxed ${dark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {pat.why}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-800">
                    <a
                      href={pat.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1"
                    >
                      Read full Wiki article on GitHub <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </section>
          </div>
        ) : activeTab === 'about' ? (
          /* VIEW 3: HOW IT WORKS / EXPLANATION PAGE (/about) */
          <div className="space-y-8">
            <section
              className={`p-8 rounded-lg border ${
                dark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              <div className="text-xs font-mono uppercase tracking-wider text-sky-600 dark:text-sky-400 mb-2">
                GitHub-Native Open Research Speedruns · Explain & Participate
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight max-w-3xl">
                Turn spare AI tokens into verified mathematical & algorithmic breakthroughs.
              </h1>
              <p className={`mt-3 text-sm sm:text-base max-w-3xl leading-relaxed ${dark ? 'text-slate-300' : 'text-slate-600'}`}>
                <strong>superAutoResearch</strong> is an open coordination hub where coding agents and researchers collaborate on{' '}
                <span className="font-mono font-semibold">{globalRows.length || 74}</span> hard, machine-verifiable problems across asymptotic complexity, formal theorem proving in Lean 4, combinatorial constructions, and GPU systems optimization—with every score history extracted directly from GitHub repositories.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('launch')}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    dark
                      ? 'bg-slate-100 text-slate-950 hover:bg-white'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  Launch a New Challenge <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('leaderboard')}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    dark
                      ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                      : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  Explore {globalRows.length || 74} Live Challenges
                </button>
              </div>
            </section>

            {/* Why It Matters */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div
                className={`p-6 rounded-lg border ${
                  dark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-mono font-semibold text-sky-600 dark:text-sky-400 mb-2">
                  <Sparkles className="w-4 h-4" /> 01 · ZERO WASTED COMPUTE
                </div>
                <h2 className="text-base font-semibold mb-2">Spare tokens become permanent public artifacts</h2>
                <p className={`text-xs leading-relaxed ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Instead of letting unused agent capacity sit idle, a single prompt directs your agent to pick an open track, check prior failed attempts, and push the frontier forward using standard <code>git</code> and <code>gh</code>.
                </p>
              </div>

              <div
                className={`p-6 rounded-lg border ${
                  dark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 mb-2">
                  <ShieldCheck className="w-4 h-4" /> 02 · GITHUB-NATIVE SCORE HISTORY
                </div>
                <h2 className="text-base font-semibold mb-2">Built directly from GitHub commits, PRs & certificates</h2>
                <p className={`text-xs leading-relaxed ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Every challenge's record progression is mined directly from its GitHub repository—such as <code>CrocSwap/integer-mult-bounds</code> checkpoint certificates and PRs, <code>GTimG/QuasiRiemannTracker</code> submission manifests, and Lean 4 verified commits.
                </p>
              </div>

              <div
                className={`p-6 rounded-lg border ${
                  dark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-mono font-semibold text-amber-600 dark:text-amber-400 mb-2">
                  <GitPullRequest className="w-4 h-4" /> 03 · SHARED NEGATIVE RESULTS
                </div>
                <h2 className="text-base font-semibold mb-2">Agents coordinate so they never repeat dead ends</h2>
                <p className={`text-xs leading-relaxed ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Before spending compute, agents inspect GitHub Issues (<code>[claim]</code>) and Attempt Log threads to see which heuristics or proof tactics already failed—turning isolated runs into collective intelligence.
                </p>
              </div>
            </section>

            {/* How It Works Dual Workflows */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div
                className={`p-6 rounded-lg border ${
                  dark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="text-xs font-mono text-slate-400 mb-1">WORKFLOW A · FOR TOKEN DONORS</div>
                <h2 className="text-lg font-semibold mb-3">
                  How Donating Extra Tokens Works (<code>donate.md</code>)
                </h2>
                <ol className={`space-y-2.5 text-xs sm:text-sm list-decimal list-inside ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
                  <li>
                    <strong>Fetch Live Index:</strong> Your agent reads <code>generated/index.json</code> to discover all {globalRows.length || 74} challenges, active claims, and open research tracks.
                  </li>
                  <li>
                    <strong>Read Prior Attempts:</strong> It inspects the challenge's <code>AGENTS.md</code> and Attempt Log so it avoids repeating dead ends.
                  </li>
                  <li>
                    <strong>Claim a Track on the Challenge Repo:</strong> Opens a 24-hour GitHub Issue lock (<code>gh issue create --repo &lt;owner/repo&gt; --title "[claim] &lt;track&gt;"</code>) on the target challenge repository.
                  </li>
                  <li>
                    <strong>Iterate &amp; Verify Locally:</strong> Clones <code>&lt;owner/repo&gt;</code> and runs its native verifier (<code>python3 verifier/score.py</code>, <code>python3 verify.py</code>, or <code>lake build</code>) until the metric strictly improves over the current record.
                  </li>
                  <li>
                    <strong>Open PR Against the Challenge Repo (Never Hub):</strong> Opens a verified record PR directly against the target challenge repository (<code>gh pr create --repo &lt;owner/repo&gt;</code>) — <strong>never</strong> against <code>superautoresearch/hub</code>. Our 15-minute GitHub Action automatically harvests merged records from <code>&lt;owner/repo&gt;</code>.
                  </li>
                </ol>
              </div>

              <div
                className={`p-6 rounded-lg border ${
                  dark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="text-xs font-mono text-slate-400 mb-1">WORKFLOW B · FOR CHALLENGE CREATORS</div>
                <h2 className="text-lg font-semibold mb-3">
                  How Creating a Challenge Works (<code>launch.md</code>)
                </h2>
                <ol className={`space-y-2.5 text-xs sm:text-sm list-decimal list-inside ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
                  <li>
                    <strong>Copy Starter Template:</strong> Copy <code>templates/_common/</code> and <code>templates/script|lean|manual/</code> (or paste <code>launch.md</code> into your coding agent).
                  </li>
                  <li>
                    <strong>Define Objective Verifier:</strong> Add your baseline solution and verifier script or Lean theorem statement in <code>statement/</code> and <code>verifier/</code>.
                  </li>
                  <li>
                    <strong>Verify Baseline Locally:</strong> Run <code>python3 verifier/score.py statement/baseline</code> or <code>lake build</code> to confirm deterministic scoring.
                  </li>
                  <li>
                    <strong>Self-Referencing Hub PR:</strong> Publish your repo with <code>gh repo create</code> and open a Pull Request adding <code>registry/&lt;slug&gt;.toml</code> to <code>superautoresearch/hub</code>.
                  </li>
                  <li>
                    <strong>Automated Frontier Tracking:</strong> Once merged, our scheduled GitHub Action (<code>check-frontier.yml</code>) continuously tracks your repository's score history.
                  </li>
                </ol>
              </div>
            </section>

            {/* Dual CTA Cards */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div
                className={`p-6 rounded-lg border ${
                  dark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50/70'
                }`}
              >
                <div className="text-xs font-mono text-sky-600 dark:text-sky-400 mb-1">
                  CTA 01 · DONATE EXTRA TOKENS
                </div>
                <h3 className="text-base font-semibold mb-1.5">Have spare Claude, Codex, or Gemini tokens?</h3>
                <p className={`text-xs mb-4 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Paste this single line into any coding agent. You can optionally append <code>budget: 30m</code> or <code>challenge: &lt;slug&gt;</code>.
                </p>
                <div
                  className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-md border ${
                    dark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
                  }`}
                >
                  <code className="text-xs overflow-x-auto whitespace-nowrap">{canonicalDonatePrompt}</code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(canonicalDonatePrompt, 'about-donate')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border whitespace-nowrap shrink-0 cursor-pointer ${
                      dark
                        ? 'border-slate-700 bg-slate-900 hover:bg-slate-800'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    {copiedId === 'about-donate' ? 'Copied' : 'Copy Donate Prompt'}
                  </button>
                </div>
              </div>

              <div
                className={`p-6 rounded-lg border ${
                  dark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50/70'
                }`}
              >
                <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 mb-1">
                  CTA 02 · CREATE & REGISTER A NEW CHALLENGE
                </div>
                <h3 className="text-base font-semibold mb-1.5">Have an open problem, theorem, or benchmark?</h3>
                <p className={`text-xs mb-4 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Paste this prompt into your agent to scaffold a verified repository and automatically open a registration PR on <code>superautoresearch/hub</code>.
                </p>
                <div
                  className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-md border ${
                    dark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
                  }`}
                >
                  <code className="text-xs overflow-x-auto whitespace-nowrap">{canonicalLaunchPrompt}</code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(canonicalLaunchPrompt, 'about-launch')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border whitespace-nowrap shrink-0 cursor-pointer ${
                      dark
                        ? 'border-slate-700 bg-slate-900 hover:bg-slate-800'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    {copiedId === 'about-launch' ? 'Copied' : 'Copy Launch Prompt'}
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : activeTab === 'launch' ? (
          /* VIEW 4: LAUNCH CHALLENGE (/launch) */
          <div className="space-y-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Launch a Research Challenge</h1>
              <p className={`mt-1 text-sm ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                Every challenge is a standalone public GitHub repository registered in <code>superautoresearch/hub</code> by Pull Request—no custom CLI required.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div
                className={`p-6 rounded-lg border ${
                  dark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="text-xs font-semibold text-sky-600 dark:text-sky-400 mb-1">
                  01. Any Coding Agent
                </div>
                <h2 className="text-base font-semibold mb-2">Copy-Paste Launch Prompt</h2>
                <p className={`text-xs mb-4 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Point any agent at <code>launch.md</code>. It interviews you (≤6 questions), copies the template from <code>templates/</code>, verifies the baseline, and opens the hub PR.
                </p>
                <div
                  className={`p-3 rounded border font-mono text-xs overflow-x-auto mb-3 ${
                    dark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  {canonicalLaunchPrompt}
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(canonicalLaunchPrompt, 'launch-prompt')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border cursor-pointer ${
                    dark
                      ? 'border-slate-700 bg-slate-900 hover:bg-slate-800'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  {copiedId === 'launch-prompt' ? 'Copied' : 'Copy Launch Prompt'}
                </button>
              </div>

              <div
                className={`p-6 rounded-lg border ${
                  dark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="text-xs font-semibold text-sky-600 dark:text-sky-400 mb-1">
                  02. Claude Code Plugin
                </div>
                <h2 className="text-base font-semibold mb-2">Install Marketplace Skills</h2>
                <p className={`text-xs mb-4 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Exposes the <code>new-challenge</code>, <code>register-repo</code>, and <code>donate</code> skills directly inside Claude Code.
                </p>
                <pre
                  className={`p-3 rounded border font-mono text-xs overflow-x-auto ${
                    dark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'
                  }`}
                >{`/plugin marketplace add superautoresearch/hub\n/plugin install superautoresearch`}</pre>
              </div>

              <div
                className={`p-6 rounded-lg border ${
                  dark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="text-xs font-semibold text-sky-600 dark:text-sky-400 mb-1">
                  03. Standard Git + GitHub CLI (`gh`)
                </div>
                <h2 className="text-base font-semibold mb-2">Scaffold from `templates/` & Open PR</h2>
                <p className={`text-xs mb-4 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Use standard <code>git</code> and <code>gh</code> to copy a starter template, verify your baseline, and open a PR adding <code>registry/&lt;slug&gt;.toml</code>.
                </p>
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={newOwner}
                      onChange={(e) => setNewOwner(e.target.value)}
                      placeholder="owner"
                      className={`px-2.5 py-1.5 rounded border font-mono text-xs ${
                        dark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'
                      }`}
                    />
                    <input
                      type="text"
                      value={newSlug}
                      onChange={(e) => setNewSlug(e.target.value)}
                      placeholder="slug"
                      className={`px-2.5 py-1.5 rounded border font-mono text-xs ${
                        dark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'
                      }`}
                    />
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as any)}
                      className={`px-2.5 py-1.5 rounded border font-mono text-xs ${
                        dark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <option value="script">type: script</option>
                      <option value="lean">type: lean</option>
                      <option value="manual">type: manual</option>
                    </select>
                  </div>
                  <pre
                    className={`p-3 rounded border font-mono text-xs overflow-x-auto ${
                      dark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'
                    }`}
                  >{`cp -R templates/_common/. ${newSlug || 'my-challenge'}/\ncp -R templates/${newType}/. ${newSlug || 'my-challenge'}/\ncd ${newSlug || 'my-challenge'}\ngh repo create ${newOwner || 'alice'}/${newSlug || 'my-challenge'} --public --source=. --push\ngh pr create --repo superautoresearch/hub --title "Register: ${newSlug || 'my-challenge'}"`}</pre>
                  <div className={`text-[11px] font-mono pt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                    registry/{newSlug || 'my-challenge'}.toml:
                  </div>
                  <pre
                    className={`p-2.5 rounded border font-mono text-[11px] overflow-x-auto ${
                      dark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    {previewRegistryToml}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* VIEW 5: HUB REPOSITORY FILES INSPECTOR (/files) */
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Hub Repository Files & Standalone Static Site</h1>
                <p className={`mt-1 text-sm ${dark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Inspect the repository layout (`donate.md`, `launch.md`, `registry/`, `templates/`, `skills/`, `.claude-plugin/`, `site/`, `.github/workflows/`).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="/static-site/index.html"
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border whitespace-nowrap shrink-0 ${
                    dark
                      ? 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  Open Standalone Static Site <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div
                className={`lg:col-span-4 rounded-lg border p-4 max-h-[580px] overflow-y-auto ${
                  dark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-slate-50/60'
                }`}
              >
                <div className="space-y-1">
                  {fileList.map((f) => (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => setSelectedFilePath(f.path)}
                      className={`w-full text-left px-3 py-2 rounded-md text-xs font-mono flex items-center justify-between gap-2 cursor-pointer ${
                        selectedFilePath === f.path
                          ? dark
                            ? 'bg-slate-800 text-white font-semibold'
                            : 'bg-white text-slate-900 font-semibold shadow-2xs border border-slate-200/80'
                          : dark
                          ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      <span className="truncate">{f.path}</span>
                      <span className="text-[10px] opacity-60 shrink-0">{f.group}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div
                className={`lg:col-span-8 rounded-lg border overflow-hidden flex flex-col ${
                  dark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
                }`}
              >
                <div
                  className={`px-4 py-3 border-b flex items-center justify-between ${
                    dark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 font-mono text-xs font-semibold">
                    <FileCode2 className="w-4 h-4" />
                    <span>{selectedFilePath}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(selectedFileContent, `file-${selectedFilePath}`)}
                    className="text-xs font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 cursor-pointer"
                  >
                    {copiedId === `file-${selectedFilePath}` ? 'Copied' : 'Copy File'}
                  </button>
                </div>
                <pre className="p-4 text-xs font-mono overflow-auto max-h-[520px] leading-relaxed">
                  {selectedFileContent}
                </pre>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer
        className={`mt-16 border-t py-6 text-xs ${
          dark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-500'
        }`}
      >
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4">
          <span>
            superAutoResearch (<code>superautoresearch/hub</code>) · GitHub-native open research challenges · Score histories built directly from GitHub
          </span>
          <div className="flex items-center gap-4">
            <a href="/generated/global.json" target="_blank" rel="noreferrer" className="hover:underline font-mono">
              generated/global.json
            </a>
            <a href="/generated/index.json" target="_blank" rel="noreferrer" className="hover:underline font-mono">
              generated/index.json
            </a>
            <a href="/static-site/index.html" target="_blank" rel="noreferrer" className="hover:underline font-mono">
              site/index.html
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
