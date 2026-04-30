/* ── app.js ───────────────────────────────────────────────────────────────
   Golf Swing Analysis — Main Orchestrator
   State machine: idle → loading-model → analyzing → results
─────────────────────────────────────────────────────────────────────────── */

import { init as initPoseEngine }             from './core/PoseEngine.js';
import { sampleVideo, loadVideoFile }         from './core/FrameSampler.js';
import { detectPhases }                        from './core/PhaseDetector.js';
import {
  buildPhaseMetricsTable, computeTempo, PHASE_LABELS
} from './core/MetricsEngine.js';
import {
  computeSQI, extractPhaseMetricsMap, gradeColor
} from './core/SQIEngine.js';

import { TabRouter }          from './ui/TabRouter.js';
import { MetricsTable }       from './ui/MetricsTable.js';
import { CoachingCueBanner }  from './ui/CoachingCueBanner.js';
import { ScoreCard }          from './ui/ScoreCard.js';
import { RadarChart }         from './ui/RadarChart.js';
import { TrendGraph }         from './ui/TrendGraph.js';
import { SkeletonOverlay }    from './overlays/SkeletonOverlay.js';
import { HeatmapOverlay }     from './overlays/HeatmapOverlay.js';
import { TempoChart }         from './overlays/TempoChart.js';
import { WeightShiftOverlay } from './overlays/WeightShiftOverlay.js';
import { ClubPathOverlay }    from './overlays/ClubPathOverlay.js';

import { saveSwing, Settings }         from './storage/SwingDB.js';
import {
  getSQIHistory, getMetricTrend, getBestSwing,
  getSessionAvgSQI, getStreakCount,
} from './storage/TrendAggregator.js';

// ── App State ─────────────────────────────────────────────────────────────
const state = {
  status:      'idle', // idle | loading-model | analyzing | results
  userFrames:  null,
  proFrames:   null,
  userPhases:  null,
  proPhases:   null,
  metricsRows: [],
  sqiResult:   null,
  tempo:       null,
  currentOverlayFrame: 0,
  settings:    Settings.getAll(),
  abortController: null,
};

// ── DOM refs ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// Videos
const userVideoEl  = $('userVideo');
const proVideoEl   = $('proVideo');

// Tab 1 inline preview canvas
const previewCanvasEl = $('userCanvas');

// Analysis controls
const analyzeBtn    = $('analyzeBtn');
const cancelBtn     = $('cancelBtn');
const progressWrap  = $('analysisProgress');
const progressBar   = $('progressBar');
const progressText  = $('progressText');

// Overlay controls (Tab 3)
const overlayCanvasEl    = $('overlayCanvas');
const scrubberEl         = $('frameScrubber');
const scrubberLabelEl    = $('scrubberLabel');
const radarCanvasEl      = $('radarCanvas');
const tempoCanvasEl      = $('tempoCanvas');
const weightCanvasEl     = $('weightCanvas');
const clubCanvasEl       = $('clubCanvas');
const trendCanvasEl      = $('trendCanvas');
const scorecardEl        = $('scorecardContent');
const metricsTableEl     = $('metricsTableContent');
const trendSectionEl     = $('trendContent');

// ── Module instances ──────────────────────────────────────────────────────
let tabRouter, metricsTable, banner, scoreCard, radarChart;
let skeletonPreview, skeletonOverlay, heatmapOverlay, tempoChart, weightShiftOverlay, clubPathOverlay;
let trendGraph;

// ── Bootstrap ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  tabRouter = new TabRouter(document, onTabChange);
  banner    = new CoachingCueBanner();

  metricsTable = new MetricsTable(metricsTableEl);
  metricsTable.render([]);

  scoreCard  = new ScoreCard(scorecardEl);
  scoreCard.render(null);

  if (radarCanvasEl) {
    radarChart = new RadarChart(radarCanvasEl);
    autoSizeCanvas(radarCanvasEl, 420, 340);
  }
  if (previewCanvasEl)  skeletonPreview = new SkeletonOverlay(previewCanvasEl);
  if (overlayCanvasEl)  skeletonOverlay = new SkeletonOverlay(overlayCanvasEl);
  if (overlayCanvasEl)  heatmapOverlay  = new HeatmapOverlay(overlayCanvasEl);
  if (tempoCanvasEl)    { autoSizeCanvas(tempoCanvasEl, 360, 240); tempoChart = new TempoChart(tempoCanvasEl); }
  if (weightCanvasEl)   { autoSizeCanvas(weightCanvasEl, 420, 280); weightShiftOverlay = new WeightShiftOverlay(weightCanvasEl); }
  if (clubCanvasEl)     { autoSizeCanvas(clubCanvasEl, 420, 300); clubPathOverlay = new ClubPathOverlay(clubCanvasEl); }
  if (trendCanvasEl)    { autoSizeCanvas(trendCanvasEl, 560, 220); trendGraph = new TrendGraph(trendCanvasEl); }

  // Default renders
  tempoChart?.render(null);
  weightShiftOverlay?.render(null);
  clubPathOverlay?.render(null, null);
  trendGraph?.render(null);

  // Wire up file inputs
  wireDropZone('userDropZone', 'userVideoInput', userVideoEl, 'userFileName', 'user');
  wireDropZone('proDropZone',  'proVideoInput',  proVideoEl,  'proFileName',  'pro');

  // Camera view toggle
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.cameraView = btn.dataset.view;
      Settings.set('cameraView', btn.dataset.view);
    });
  });

  // Analyze button
  analyzeBtn?.addEventListener('click', runAnalysis);
  cancelBtn?.addEventListener('click', cancelAnalysis);

  // Overlay toggles
  document.querySelectorAll('.overlay-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      updateOverlayVisibility();
    });
  });

  // Phase jump buttons
  document.querySelectorAll('[data-phase-jump]').forEach(btn => {
    btn.addEventListener('click', () => jumpToPhase(btn.dataset.phaseJump));
  });

  // Frame scrubber
  scrubberEl?.addEventListener('input', () => {
    if (!state.userFrames) return;
    state.currentOverlayFrame = +scrubberEl.value;
    updateScrubberLabel();
    drawOverlayFrame();
    drawPreviewFrame();
  });

  // Settings bindings
  wireSettings();

  // Load trend data
  await refreshTrends();

  // Initialize pose engine in background (warm up)
  initModelSilently();
});

// ── File drop zone wiring ─────────────────────────────────────────────────
function wireDropZone(zoneId, inputId, videoEl, fileNameId, role) {
  const zone  = $(zoneId);
  const input = $(inputId);
  const fnEl  = $(fileNameId);

  if (!zone || !input) return;

  input.addEventListener('change', () => handleFileSelect(input.files[0], videoEl, fnEl, role));

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file, videoEl, fnEl, role);
  });
}

async function handleFileSelect(file, videoEl, fnEl, role) {
  if (!file) return;
  if (fnEl) fnEl.textContent = file.name;
  try {
    await loadVideoFile(videoEl, file);

    // ── Orientation validation ────────────────────────────────────────────
    videoEl.dataset.isPortrait = videoEl.videoHeight > videoEl.videoWidth;
    if (videoEl.dataset.isPortrait === 'true') {
      showError(
        `⚠️ Portrait video detected (${videoEl.videoWidth}×${videoEl.videoHeight}). ` +
        `For best results, use a landscape (horizontal) video. ` +
        `Pose detection works best with the golfer centered horizontally.`
      );
      return;
    }

    if (role === 'user' && proVideoEl.src) analyzeBtn.disabled = false;
    if (role === 'pro'  && userVideoEl.src) analyzeBtn.disabled = false;
    // Enable analyze if only user video provided too
    if (role === 'user') analyzeBtn.disabled = false;
  } catch (err) {
    showError(`Could not load ${role} video: ${err.message}`);
  }
}

// ── Main analysis pipeline ────────────────────────────────────────────────
async function runAnalysis() {
  if (state.status === 'analyzing') return;
  if (!userVideoEl?.src) { showError('Please upload your swing video first.'); return; }

  state.abortController = new AbortController();
  setStatus('analyzing');

  try {
    // 1. Ensure model is loaded
    setProgress(0, 'Loading pose model…');
    await initPoseEngine(state.settings.poseModel, (msg, pct) => setProgress(pct * 0.15, msg));

    // 2. Sample user video
    setProgress(15, 'Processing your swing…');
    state.userFrames = await sampleVideo(userVideoEl, {
      targetFps: state.settings.targetFps,
      maxFrames: 300,
      onProgress: (pct) => setProgress(15 + pct * 0.35, `Your swing: ${pct}%`),
      signal: state.abortController.signal,
    });

    // 3. Sample pro video (if provided)
    if (proVideoEl?.src) {
      setProgress(50, 'Processing pro swing…');
      state.proFrames = await sampleVideo(proVideoEl, {
        targetFps: state.settings.targetFps,
        maxFrames: 300,
        onProgress: (pct) => setProgress(50 + pct * 0.30, `Pro swing: ${pct}%`),
        signal: state.abortController.signal,
      });
    } else {
      state.proFrames = null;
    }

    // 4. Phase detection
    setProgress(82, 'Detecting swing phases…');
    state.userPhases = detectPhases(state.userFrames);
    state.proPhases  = state.proFrames ? detectPhases(state.proFrames) : null;

    // 5. Metrics
    setProgress(88, 'Computing metrics…');
    state.metricsRows = buildPhaseMetricsTable(
      state.userFrames, state.proFrames || [],
      state.userPhases, state.proPhases
    );

    // 6. SQI
    const phaseMetricsMap = extractPhaseMetricsMap(state.userFrames, state.userPhases);
    state.tempo    = computeTempo(state.userFrames, state.userPhases);
    state.sqiResult = computeSQI(phaseMetricsMap, state.tempo);

    // 7. Save to IndexedDB
    setProgress(94, 'Saving session…');
    await saveSwing({
      golferTag:  state.settings.golferTag,
      view:       state.settings.cameraView,
      sqi:        state.sqiResult.sqi,
      phases:     state.userPhases,
      metrics:    phaseMetricsMap,
      tempo:      state.tempo,
      coachingCues: state.sqiResult.cues.map(c => c.cue),
    });

    // 8. Render all views
    setProgress(100, 'Done!');
    renderAllResults();
    setStatus('results');

  } catch (err) {
    if (err.name === 'AbortError') {
      setStatus('idle');
    } else {
      console.error('[Analysis]', err);
      showError(`Analysis failed: ${err.message}`);
      setStatus('idle');
    }
  }
}

function cancelAnalysis() {
  state.abortController?.abort();
  setStatus('idle');
}

// ── Render all result views ───────────────────────────────────────────────
function renderAllResults() {
  // Metrics table
  metricsTable.render(state.metricsRows);

  // Scorecard
  scoreCard.render(state.sqiResult, []);

  // Radar chart
  if (radarChart && state.sqiResult?.componentScores) {
    radarChart.render(state.sqiResult.componentScores);
  }

  // Quick stats on analyzer tab
  if (state.sqiResult) {
    const statSQI = $('statSQI');
    const statGrade = $('statGrade');
    const statFrames = $('statFrames');
    const statTempo = $('statTempo');
    if (statSQI)   statSQI.textContent   = state.sqiResult.sqi;
    if (statGrade) { statGrade.textContent = state.sqiResult.grade; statGrade.style.color = gradeColor(state.sqiResult.grade); }
    if (statFrames) statFrames.textContent = state.userFrames?.length ?? '—';
    if (statTempo)  statTempo.textContent  = state.tempo ? state.tempo.ratio.toFixed(1) + ':1' : '—';
  }

  // Overlay tab — default to skeleton at address
  if (state.userFrames?.length) {
    const total = state.userFrames.length;
    if (scrubberEl) { scrubberEl.max = total - 1; scrubberEl.value = state.userPhases?.addressIdx ?? 0; }
    state.currentOverlayFrame = state.userPhases?.addressIdx ?? 0;
    updateScrubberLabel();
    drawOverlayFrame();
    drawPreviewFrame();
  }

  // Tempo chart
  tempoChart?.render(state.tempo);

  // Weight shift
  if (state.userPhases && state.userFrames) {
    const phaseMetrics = extractPhaseMetricsMap(state.userFrames, state.userPhases);
    weightShiftOverlay?.render(phaseMetrics);
  }

  // Club path
  clubPathOverlay?.render(state.userFrames, state.userPhases, state.proFrames, state.proPhases);

  // Show coaching cues
  if (state.sqiResult?.cues?.length) {
    banner.showCues(state.sqiResult.cues.map(c => ({
      ...c,
      phaseLabel: PHASE_LABELS[c.phase] || c.phase,
    })));
  } else if (state.sqiResult?.sqi >= 85) {
    banner.celebrate('Excellent swing mechanics — keep up the great work!');
  }

  // Refresh trends
  refreshTrends();
}

// ── Tab 1 inline preview ──────────────────────────────────────────────────
function drawPreviewFrame() {
  if (!state.userFrames || !previewCanvasEl || !skeletonPreview) return;
  const frameIdx = state.currentOverlayFrame;
  const uFrame = state.userFrames[frameIdx];
  const pFrame = state.proFrames
    ? state.proFrames[Math.round(frameIdx * state.proFrames.length / state.userFrames.length)]
    : null;

  const rect = previewCanvasEl.parentElement?.getBoundingClientRect();
  if (rect?.width > 0) {
    previewCanvasEl.width  = Math.round(rect.width);
    previewCanvasEl.height = Math.round(rect.width * 0.5625);
  }

  skeletonPreview.setUserPose(uFrame?.pose);
  skeletonPreview.setProPose(pFrame?.pose);
  skeletonPreview.toggleUser(true);
  skeletonPreview.togglePro(!!pFrame);
  skeletonPreview.draw();
}

// ── Overlay rendering ─────────────────────────────────────────────────────
function drawOverlayFrame() {
  if (!state.userFrames || !overlayCanvasEl) return;

  const activeToggles = getActiveOverlayToggles();
  const frameIdx = state.currentOverlayFrame;

  // Resize canvas to match container
  const rect = overlayCanvasEl.parentElement?.getBoundingClientRect();
  if (rect?.width > 0) {
    overlayCanvasEl.width  = Math.round(rect.width);
    overlayCanvasEl.height = Math.round(rect.width * 0.5625); // 16:9
  }

  const ctx = overlayCanvasEl.getContext('2d');
  ctx.clearRect(0, 0, overlayCanvasEl.width, overlayCanvasEl.height);

  const uFrame = state.userFrames[frameIdx];
  const pFrame = state.proFrames
    ? state.proFrames[Math.round(frameIdx * state.proFrames.length / state.userFrames.length)]
    : null;

  if (activeToggles.has('skeleton') && skeletonOverlay) {
    skeletonOverlay.setUserPose(uFrame?.pose);
    skeletonOverlay.setProPose(pFrame?.pose);
    skeletonOverlay.toggleUser(true);
    skeletonOverlay.togglePro(!!pFrame);
    skeletonOverlay.showGlow = true;
    skeletonOverlay.draw();
  }

  if (activeToggles.has('heatmap') && heatmapOverlay && pFrame) {
    const skelOn = activeToggles.has('skeleton');
    heatmapOverlay.render(uFrame?.pose, pFrame?.pose, { clear: !skelOn });
  }
}

function getActiveOverlayToggles() {
  const active = new Set(['skeleton', 'skeleton-user', 'skeleton-pro']);
  document.querySelectorAll('.overlay-toggle-btn.active').forEach(btn => {
    active.add(btn.dataset.overlay);
  });
  return active;
}

function updateOverlayVisibility() {
  drawOverlayFrame();
}

function updateScrubberLabel() {
  if (!scrubberLabelEl || !state.userFrames) return;
  const t = state.userFrames[state.currentOverlayFrame]?.time ?? 0;
  scrubberLabelEl.textContent = `${t.toFixed(2)}s`;
}

function jumpToPhase(phase) {
  if (!state.userPhases) return;
  const idxKey = phase + 'Idx';
  const idx = state.userPhases[idxKey];
  if (idx == null) return;
  state.currentOverlayFrame = idx;
  if (scrubberEl) scrubberEl.value = idx;
  updateScrubberLabel();
  drawOverlayFrame();
  drawPreviewFrame();
}

// ── Tab change handler ────────────────────────────────────────────────────
function onTabChange(tabId) {
  if (tabId === 'trends') refreshTrends();
  if (tabId === 'overlays' && state.userFrames) drawOverlayFrame();
  if (tabId === 'scorecard' && state.sqiResult) scoreCard.render(state.sqiResult, []);
}

// ── Trends ────────────────────────────────────────────────────────────────
async function refreshTrends() {
  if (!trendSectionEl) return;
  try {
    const history  = await getSQIHistory(20);
    const bestSwing = await getBestSwing();
    const avgSQI    = await getSessionAvgSQI(10);
    const streak    = await getStreakCount(70);

    const statsEl = trendSectionEl.querySelector('#trendStats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat-box"><div class="stat-val">${avgSQI}</div><div class="stat-lbl">Session Avg</div></div>
        <div class="stat-box"><div class="stat-val gold">${bestSwing?.sqi ?? '—'}</div><div class="stat-lbl">Best Swing</div></div>
        <div class="stat-box"><div class="stat-val">${streak}</div><div class="stat-lbl">Day Streak ≥70</div></div>
        <div class="stat-box"><div class="stat-val">${history.length}</div><div class="stat-lbl">Total Swings</div></div>
      `;
    }

    if (trendGraph && history.length) {
      trendGraph.render(history, { label: 'SQI Over Time', color: '#5BA3D9', minY: 0, maxY: 100 });
    } else if (trendGraph) {
      trendGraph.render(null);
    }
  } catch (err) {
    console.warn('[Trends]', err);
  }
}

// ── Settings wiring ───────────────────────────────────────────────────────
function wireSettings() {
  const s = state.settings;

  const golferInput = $('settingGolferTag');
  if (golferInput) {
    golferInput.value = s.golferTag;
    golferInput.addEventListener('change', () => {
      state.settings.golferTag = golferInput.value;
      Settings.set('golferTag', golferInput.value);
    });
  }

  const modelSelect = $('settingPoseModel');
  if (modelSelect) {
    modelSelect.value = s.poseModel;
    modelSelect.addEventListener('change', () => {
      state.settings.poseModel = modelSelect.value;
      Settings.set('poseModel', modelSelect.value);
    });
  }

  const fpsInput = $('settingTargetFps');
  if (fpsInput) {
    fpsInput.value = s.targetFps;
    $('fpsDisplay') && ($('fpsDisplay').textContent = s.targetFps + ' fps');
    fpsInput.addEventListener('input', () => {
      state.settings.targetFps = +fpsInput.value;
      Settings.set('targetFps', +fpsInput.value);
      if ($('fpsDisplay')) $('fpsDisplay').textContent = fpsInput.value + ' fps';
    });
  }

  $('settingClearData')?.addEventListener('click', async () => {
    if (!confirm('Clear all saved swing data? This cannot be undone.')) return;
    const { clearAll } = await import('./storage/SwingDB.js');
    await clearAll();
    await refreshTrends();
    banner.show('All swing data cleared.', { title: 'Data cleared', icon: '🗑️', duration: 3000 });
  });

  $('settingExportData')?.addEventListener('click', exportAllData);
}

async function exportAllData() {
  const { listSwings } = await import('./storage/SwingDB.js');
  const swings = await listSwings();
  const json = JSON.stringify(swings, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `swing-vault-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

// ── Progress & status ─────────────────────────────────────────────────────
function setStatus(status) {
  state.status = status;
  const isAnalyzing = status === 'analyzing';
  const hasResults  = status === 'results';

  progressWrap?.classList.toggle('visible', isAnalyzing);
  analyzeBtn && (analyzeBtn.disabled = isAnalyzing);
  if (cancelBtn) cancelBtn.style.display = isAnalyzing ? 'inline-flex' : 'none';

  const statsEl = $('analyzerStats');
  if (statsEl) statsEl.style.display = hasResults ? 'block' : 'none';

  if (!isAnalyzing && progressBar) {
    setTimeout(() => { if (progressBar) progressBar.style.width = '0%'; }, 500);
  }
}

function setProgress(pct, message = '') {
  if (progressBar) progressBar.style.width = Math.round(pct) + '%';
  if (progressText) {
    const numEl = progressText.querySelector('span');
    if (numEl) numEl.textContent = Math.round(pct) + '%';
    const msgEl = progressText.querySelector('.progress-msg');
    if (msgEl) msgEl.textContent = message;
  }
}

function showError(msg) {
  banner.show(msg, { title: 'Something went wrong', icon: '⚠️', duration: 6000 });
}

// ── Utilities ─────────────────────────────────────────────────────────────
function autoSizeCanvas(canvas, w, h) {
  if (!canvas) return;
  canvas.width  = w;
  canvas.height = h;
}

async function initModelSilently() {
  try {
    await initPoseEngine(state.settings.poseModel);
    console.log('[App] Pose model warmed up');
  } catch { /* fail silently — will retry on analyze */ }
}
