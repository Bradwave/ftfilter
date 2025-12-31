class SignalComponent {
    constructor(freq, amp, phase = 0, waveType = 'sine') {
        this.freq = freq;
        this.amp = amp;
        this.phase = phase;
        this.waveType = waveType;
        this.id = Math.random().toString(36).substr(2, 9);
        // Real Mode Params
        this.startTime = 0;   // In seconds
        this.endTime = 5.0;   // Max duration (N=2048, Rate=256 -> 8s cap)
        this.envelopeType = 'gaussian'; // 'gaussian' or 'adsr'
        this.envelopeParams = {
            gaussian: { center: 0.5, width: 0.2 }, 
            adsr: { a: 0.1, d: 0.1, s: 0.5, r: 0.2 },
            square: {}
        };
        this.collapsed = false;
    }
}

const state = {
    components: [
        new SignalComponent(2, 1.0),
        new SignalComponent(5, 0.5),
        new SignalComponent(15, 0.3)
    ],
    filterCenter: 5, // Hz
    filterWidth: 4,  // Hz
    // timeBase: 2,     // Samples per second - REMOVED
    sampleRate: 256, // Samples per second
    isDraggingFilter: false,
    showAxis: true,
    smoothing: 0,
    signalMode: 'ideal', // 'ideal' or 'real'
    filterType: 'square', // 'square' or 'gaussian'
    audioMultiplier: 50, // Scaling factor
    masterVolume: 0.5,
    // New zoom/pan state
    zoomStart: 0, // Start time of the visible window in seconds
    zoomEnd: 5,   // End time of the visible window in seconds
    isDragging: false, // For canvas pan interaction
    dragStartX: 0,     // Mouse X position when drag started
    dragStartTime: 0,  // Time at zoomStart when drag started
};

const elements = {
    componentsContainer: document.getElementById('components-container'),
    componentsToggle: document.getElementById('components-toggle'),
    componentsWrapper: document.getElementById('components-wrapper'),
    addComponentBtn: document.getElementById('add-component-btn'),
    filterWidthSlider: document.getElementById('filter-width-slider'),
    filterCenterSlider: document.getElementById('filter-center-slider'),
    filterCenterDisplay: document.getElementById('filter-center-display'),
    timeBaseSlider: document.getElementById('time-base-slider'),
    smoothingSlider: document.getElementById('smoothing-slider'),
    axisToggle: document.getElementById('axis-toggle'),
    resetBtn: document.getElementById('reset-btn'),
    audioMultSlider: document.getElementById('audio-mult-slider'),
    audioMultDisplay: document.getElementById('audio-mult-display'),
    canvases: {
        signal: document.getElementById('signal-canvas'),
        freq: document.getElementById('frequency-canvas'),
        recon: document.getElementById('reconstructed-canvas')
    },
    ctx: {}
};

// Initialize contexts
elements.ctx.signal = elements.canvases.signal.getContext('2d');
elements.ctx.freq = elements.canvases.freq.getContext('2d');
elements.ctx.recon = elements.canvases.recon.getContext('2d');

const STORAGE_KEY = 'ftfilter_state_v2';
let audioCtx = null;
let currentSource = null;
let isPlaying = null; 
let lastFilteredFFT = null;
let audioStartTime = 0; // New variable for sync

function init() {
    loadState();
    updateToggleUI();
    renderComponentsUI();
    setupListeners();
    animate();
}

function updateToggleUI() {
    const ideal = document.getElementById('mode-ideal');
    const real = document.getElementById('mode-real');
    if(ideal && real) {
        ideal.className = state.signalMode === 'ideal' ? 'segmented-option active' : 'segmented-option';
        real.className = state.signalMode === 'real' ? 'segmented-option active' : 'segmented-option';
    }
    
    const square = document.getElementById('filter-square');
    const gaussian = document.getElementById('filter-gaussian');
    if(square && gaussian) {
        square.className = state.filterType === 'square' ? 'segmented-option active' : 'segmented-option';
        gaussian.className = state.filterType === 'gaussian' ? 'segmented-option active' : 'segmented-option';
    }
}

window.setSignalMode = (mode) => {
    state.signalMode = mode;
    updateToggleUI();
    renderComponentsUI();
    saveState();
};

window.setFilterType = (type) => {
    state.filterType = type;
    updateToggleUI();
    saveState();
};

function saveState() {
    const saved = {
        components: state.components, 
        filterCenter: state.filterCenter,
        filterWidth: state.filterWidth,
        timeBase: state.timeBase,
        showAxis: state.showAxis,
        smoothing: state.smoothing,
        signalMode: state.signalMode,
        filterType: state.filterType,
        audioMultiplier: state.audioMultiplier,
        masterVolume: state.masterVolume
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state.components = parsed.components.map(c => {
                const n = new SignalComponent(c.freq, c.amp);
                n.id = c.id; 
                if (c.phase !== undefined) n.phase = c.phase;
                if (c.waveType !== undefined) n.waveType = c.waveType;
                // Restore new params
                if(c.startTime !== undefined) n.startTime = c.startTime;
                if(c.endTime !== undefined) n.endTime = c.endTime;
                if(c.envelopeType) n.envelopeType = c.envelopeType;
                if(c.envelopeParams) {
                    // Merge params to ensure new defaults (like square) are present
                    n.envelopeParams = {
                        ...n.envelopeParams,
                        ...c.envelopeParams
                    };
                }
                return n;
            });
            if(parsed.filterCenter !== undefined) state.filterCenter = parsed.filterCenter;
            if(parsed.filterWidth !== undefined) state.filterWidth = parsed.filterWidth;
            if(parsed.timeBase !== undefined) state.timeBase = parsed.timeBase;
            if(parsed.showAxis !== undefined) state.showAxis = parsed.showAxis;
            
            // New State
            if(parsed.zoomStart !== undefined) state.zoomStart = parsed.zoomStart;
            if(parsed.zoomEnd !== undefined) state.zoomEnd = parsed.zoomEnd;

            if(parsed.smoothing !== undefined) state.smoothing = parsed.smoothing;
            if(parsed.signalMode !== undefined) state.signalMode = parsed.signalMode;
            if(parsed.filterType !== undefined) state.filterType = parsed.filterType;
            if(parsed.audioMultiplier !== undefined) state.audioMultiplier = parsed.audioMultiplier;
            
            // Sync UI inputs
            elements.filterCenterSlider.value = state.filterCenter;
            elements.filterWidthSlider.value = state.filterWidth;
            // timeBaseSlider removed
            elements.axisToggle.checked = state.showAxis;
            elements.smoothingSlider.value = state.smoothing;
            elements.filterCenterDisplay.innerText = state.filterCenter.toFixed(1) + " Hz";
            if(elements.audioMultSlider) {
                elements.audioMultSlider.value = state.audioMultiplier;
                elements.audioMultDisplay.innerText = state.audioMultiplier;
            }
            if(parsed.masterVolume !== undefined) {
                 state.masterVolume = parsed.masterVolume;
                 const mv = document.getElementById('master-vol-slider');
                 if(mv) {
                     mv.value = state.masterVolume;
                     document.getElementById('master-vol-display').innerText = state.masterVolume;
                 }
            }
        } catch(e) { console.error("Failed to load state", e); }
    }
}

function setupListeners() {
    // Generic Collapsible Logic
    document.querySelectorAll('.section-header-collapsible').forEach(header => {
        header.addEventListener('click', () => {
            const targetId = header.getAttribute('data-target');
            const content = targetId ? document.getElementById(targetId) : null;
            if (!content) return;
            
            const icon = header.querySelector('.dropdown-icon');
            content.classList.toggle('expanded');
            
            if (content.classList.contains('expanded')) {
                icon.style.transform = "rotate(0deg)";
            } else {
                icon.style.transform = "rotate(-90deg)";
            }
        });
    });

    // Master Volume
    const volSlider = document.getElementById('master-vol-slider');
    const volDisplay = document.getElementById('master-vol-display');
    if (volSlider && volDisplay) {
        volSlider.value = state.masterVolume;
        volDisplay.textContent = state.masterVolume;
        volSlider.addEventListener('input', (e) => {
             state.masterVolume = parseFloat(e.target.value);
             volDisplay.textContent = state.masterVolume;
             saveState();
        });
    }

    elements.addComponentBtn.addEventListener('click', () => {
        state.components.push(new SignalComponent(1, 1.0));
        renderComponentsUI();
        saveState();
    });

    elements.axisToggle.addEventListener('change', (e) => {
        state.showAxis = e.target.checked;
        saveState();
    });

    elements.filterWidthSlider.addEventListener('input', (e) => {
        state.filterWidth = parseFloat(e.target.value);
        saveState();
    });

    elements.filterCenterSlider.addEventListener('input', (e) => {
        state.filterCenter = parseFloat(e.target.value);
        elements.filterCenterDisplay.innerText = state.filterCenter.toFixed(1) + " Hz";
        saveState();
    });

    elements.smoothingSlider.addEventListener('input', (e) => {
        state.smoothing = parseFloat(e.target.value);
        saveState();
    });

    if (elements.audioMultSlider) {
        elements.audioMultSlider.addEventListener('input', (e) => {
            state.audioMultiplier = parseInt(e.target.value);
            elements.audioMultDisplay.innerText = state.audioMultiplier;
            saveState();
        });
    }

    elements.resetBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        // Reset Logic
        state.components = [
            new SignalComponent(1, 1.0)
        ];
        state.filterCenter = 5;
        state.filterWidth = 2;
        state.zoomStart = 0;
        state.zoomEnd = 5;
        state.showAxis = true;
        state.smoothing = 0;
        
        elements.filterCenterSlider.value = 5;
        elements.filterWidthSlider.value = 2;
        elements.axisToggle.checked = true;
        elements.smoothingSlider.value = 0;
        elements.filterCenterDisplay.innerText = "5.0 Hz";

        renderComponentsUI();
    });

    // Interaction on frequency canvas (freqCanvas logic remains the same)
    const freqCanvas = elements.canvases.freq; 
    
    freqCanvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const rect = freqCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width; 
        
        const maxFreq = state.sampleRate / 2;
        const clickedFreq = (x / width) * maxFreq;

        const halfWidth = state.filterWidth / 2;
        if (clickedFreq >= state.filterCenter - halfWidth && clickedFreq <= state.filterCenter + halfWidth) {
            state.isDraggingFilter = true;
        } else {
             state.filterCenter = clickedFreq;
             state.isDraggingFilter = true;
             updateFilterUI();
             saveState();
        }
    });

    window.addEventListener('pointermove', (e) => {
        if (!state.isDraggingFilter) return;
        e.preventDefault(); 
        const rect = freqCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        
        const maxFreq = state.sampleRate / 2;
        let newFreq = (x / width) * maxFreq;
        
        newFreq = Math.max(0, Math.min(newFreq, maxFreq));
        
        state.filterCenter = newFreq;
        updateFilterUI();
    });

    window.addEventListener('pointerup', () => {
        if (state.isDraggingFilter) {
            saveState();
        }
        state.isDraggingFilter = false;
    });
}

function updateFilterUI() {
    elements.filterCenterSlider.value = state.filterCenter;
    elements.filterCenterDisplay.innerText = state.filterCenter.toFixed(1) + " Hz";
}

function renderComponentsUI() {
    elements.componentsContainer.innerHTML = '';
    
    // Determine max time for sliders (4s default)
    const MAX_DURATION = 5.0;

    state.components.forEach((comp, index) => {
        const el = document.createElement('div');
        el.className = 'component-row';
        
        if (comp.collapsed) {
             html = `
            <div class="component-header">
                <span>WAVE ${index + 1}</span>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="material-symbols-outlined remove-btn" style="font-size: 18px;" onclick="window.toggleCollapse('${comp.id}')">expand_more</span>
                    <span class="material-symbols-outlined remove-btn" style="font-size: 16px;" onclick="removeComponent(${index})">close</span>
                </div>
            </div>
            <div class="component-collapsed-preview">
                <canvas id="col-prev-${comp.id}" width="300" height="40" style="width:100%; height:40px; display:block;"></canvas>
            </div>
            `;
        } else {
             html = `
            <div class="component-header">
                <span>WAVE ${index + 1}</span>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="material-symbols-outlined remove-btn" style="font-size: 18px;" onclick="window.toggleCollapse('${comp.id}')">expand_less</span>
                    <span class="material-symbols-outlined remove-btn" style="font-size: 16px;" onclick="removeComponent(${index})">close</span>
                </div>
            </div>
            
            <div class="component-body">
                <div class="component-collapsed-preview" style="margin-bottom: 2px;">
                    <canvas id="exp-col-prev-${comp.id}" width="300" height="40" style="width:100%; height:40px; display:block;"></canvas>
                </div>
                <div class="component-controls">
                    <!-- Wave Type Selector -->
                    <div class="component-control-item" style="grid-column: span 2;">
                        <div class="segmented-control" style="margin-bottom: 0;">
                            <div class="segmented-option ${comp.waveType === 'sine' || !comp.waveType ? 'active' : ''}" onclick="setWaveType('${comp.id}', 'sine')">SINE</div>
                            <div class="segmented-option ${comp.waveType === 'square' ? 'active' : ''}" onclick="setWaveType('${comp.id}', 'square')">SQR</div>
                            <div class="segmented-option ${comp.waveType === 'triangle' ? 'active' : ''}" onclick="setWaveType('${comp.id}', 'triangle')">TRI</div>
                            <div class="segmented-option ${comp.waveType === 'sawtooth' ? 'active' : ''}" onclick="setWaveType('${comp.id}', 'sawtooth')">SAW</div>
                        </div>
                    </div>

                    <!-- Freq -->
                    <div class="component-control-item" style="grid-column: span 2;">
                        <div class="component-slider-wrapper">
                            <span class="component-label">FREQ</span>
                            <input type="range" class="compact-range" value="${comp.freq}" min="0.5" max="50" step="0.5" 
                                oninput="updateComponent('${comp.id}', 'freq', this.value)">
                        </div>
                        <div id="f-val-${comp.id}" class="component-value">${comp.freq} Hz</div>
                    </div>

                    <!-- Amp & Phase -->
                    <div class="component-control-item">
                        <div class="component-slider-wrapper">
                            <span class="component-label">AMP</span>
                            <input type="range" class="compact-range" value="${comp.amp}" min="0" max="2" step="0.1" 
                                oninput="updateComponent('${comp.id}', 'amp', this.value)">
                        </div>
                        <div id="a-val-${comp.id}" class="component-value">${comp.amp}</div>
                    </div>

                    <div class="component-control-item">
                        <div class="component-slider-wrapper">
                            <span class="component-label">PHASE</span>
                            <input type="range" class="compact-range" value="${comp.phase || 0}" min="0" max="${(2 * Math.PI).toFixed(4)}" step="0.1" 
                                oninput="updateComponent('${comp.id}', 'phase', this.value)">
                        </div>
                        <div id="p-val-${comp.id}" class="component-value">${(comp.phase || 0).toFixed(2)} rad</div>
                    </div>
                </div>
                
                <div class="component-preview-wrapper">
                    <canvas id="preview-${comp.id}" width="100" height="28" style="width: 100%; height: 100%; display: block;"></canvas>
                </div>
        `;

        // Real Mode Extensions for Expanded View
        if (state.signalMode === 'real') {
             html += `
                <!-- Time Constraints -->
                <div style="margin-top: 8px;">
                    <div class="component-label" id="time-label-${comp.id}">
                        TIME CONSTRAINT (${comp.startTime.toFixed(2)}s - ${comp.endTime.toFixed(2)}s)
                    </div>
                    <div class="double-slider-wrapper">
                        <div class="double-slider-track"></div>
                        <div class="double-slider-fill" style="left: ${(comp.startTime/MAX_DURATION)*100}%; width: ${((comp.endTime-comp.startTime)/MAX_DURATION)*100}%"></div>
                        <input type="range" class="double-slider-input" min="0" max="${MAX_DURATION}" step="0.1" value="${comp.startTime}" 
                            oninput="updateTimeConstraint('${comp.id}', 'start', this.value)">
                        <input type="range" class="double-slider-input" min="0" max="${MAX_DURATION}" step="0.1" value="${comp.endTime}" 
                            oninput="updateTimeConstraint('${comp.id}', 'end', this.value)">
                    </div>
                </div>

                <!-- Envelope Section -->
                <div class="envelope-section">
                    <div class="envelope-header">
                         <span class="component-label">ENVELOPE</span>
                         <div class="segmented-control envelope-type-control">
                            <div class="segmented-option ${comp.envelopeType==='gaussian'?'active':''}" onclick="setEnvelopeType('${comp.id}', 'gaussian')">GAUSS</div>
                            <div class="segmented-option ${comp.envelopeType==='adsr'?'active':''}" onclick="setEnvelopeType('${comp.id}', 'adsr')">ADSR</div>
                            <div class="segmented-option ${comp.envelopeType==='square'?'active':''}" onclick="setEnvelopeType('${comp.id}', 'square')">SQR</div>
                        </div>
                    </div>
                    
                    <canvas class="envelope-preview" id="env-prev-${comp.id}" width="200" height="80"></canvas>
                    
                    <div class="envelope-params">
                        ${getEnvelopeControls(comp)}
                    </div>
                </div>
             `;
        }

        html += `</div>`; // Close component-body
        } // End else/expanded
        
        el.innerHTML = html;
        elements.componentsContainer.appendChild(el);
        
        if (comp.collapsed) {
             drawCollapsedPreview(document.getElementById(`col-prev-${comp.id}`), comp);
        } else {
            // Draw Previews
            drawComponentPreview(document.getElementById(`preview-${comp.id}`), comp);
            if (state.signalMode === 'real') {
                drawEnvelopePreview(document.getElementById(`env-prev-${comp.id}`), comp);
            }
            drawCollapsedPreview(document.getElementById(`exp-col-prev-${comp.id}`), comp);
        }
    });
}

function getEnvelopeControls(comp) {
    if (comp.envelopeType === 'gaussian') {
        const p = comp.envelopeParams.gaussian;
        return `
            <div class="param-col span-2">
                <input type="range" min="0" max="1" step="0.01" value="${p.center}" oninput="updateEnvParam('${comp.id}', 'gaussian', 'center', this.value)">
                <span class="param-label">CENTER</span>
            </div>
            <div class="param-col span-2">
                <input type="range" min="0.05" max="0.5" step="0.01" value="${p.width}" oninput="updateEnvParam('${comp.id}', 'gaussian', 'width', this.value)">
                <span class="param-label">WIDTH</span>
            </div>
        `;
    } else if (comp.envelopeType === 'adsr') {
        // ADSR
        const p = comp.envelopeParams.adsr;
        return `
            <div class="param-col">
                <input type="range" min="0" max="1" step="0.01" value="${p.a}" oninput="updateEnvParam('${comp.id}', 'adsr', 'a', this.value)">
                <span class="param-label">A</span>
            </div>
            <div class="param-col">
                <input type="range" min="0" max="1" step="0.01" value="${p.d}" oninput="updateEnvParam('${comp.id}', 'adsr', 'd', this.value)">
                <span class="param-label">D</span>
            </div>
             <div class="param-col">
                <input type="range" min="0" max="1" step="0.01" value="${p.s}" oninput="updateEnvParam('${comp.id}', 'adsr', 's', this.value)">
                <span class="param-label">S</span>
            </div>
            <div class="param-col">
                <input type="range" min="0" max="1" step="0.01" value="${p.r}" oninput="updateEnvParam('${comp.id}', 'adsr', 'r', this.value)">
                <span class="param-label">R</span>
            </div>
        `;
    } else {
        return `<div class="param-col" style="grid-column: span 4; text-align: center;"><span class="param-label">SQUARE ENVELOPE (FULL AMPLITUDE)</span></div>`;
    }
}

// Logic Helpers
window.updateTimeConstraint = (id, type, value) => {
    const comp = state.components.find(c => c.id === id);
    if(!comp) return;
    
    value = parseFloat(value);
    
    // Pushing Logic: allow start to push end, and vice versa
    if (type === 'start') {
        if (value >= comp.endTime) {
            // Push end time forward
            comp.endTime = Math.min(value + 0.1, 5.0); // MAX_DURATION 5.0 hardcoded here
            // If hit max duration, clamp start value to maintain diff
            if (comp.endTime === 5.0) {
                 if (value > 4.9) value = 4.9;
            }
        }
        comp.startTime = value;
    } else {
        // End slider
        if (value <= comp.startTime) {
            // Push start time back
            comp.startTime = Math.max(value - 0.1, 0);
            // If hit min duration, clamp end value
            if (comp.startTime === 0) {
                 if (value < 0.1) value = 0.1;
            }
        }
        comp.endTime = value; 
    }
    
    // OPTIMIZED UPDATE: Do NOT re-render UI. Update elements manually.
    const previewCanvas = document.getElementById(`preview-${comp.id}`);
    if (previewCanvas) {
         const wrapper = previewCanvas.closest('.component-body');
         if (wrapper) {
             const trackFill = wrapper.querySelector('.double-slider-fill');
             const inputs = wrapper.querySelectorAll('.double-slider-input');
             
             // Update Fill
             const MAX = 5.0;
             const left = (comp.startTime / MAX) * 100;
             const width = ((comp.endTime - comp.startTime) / MAX) * 100;
             if(trackFill) {
                 trackFill.style.left = left + '%';
                 trackFill.style.width = width + '%';
             }
             
             // Update Input Values if pushed (sync sibling)
             if (inputs.length === 2) {
                 if (type === 'start') inputs[1].value = comp.endTime;
                 else inputs[0].value = comp.startTime;
             }
             
             // Update Label Text
             const label = document.getElementById(`time-label-${comp.id}`);
             if (label) {
                 label.innerHTML = `TIME CONSTRAINT (${comp.startTime.toFixed(2)}s - ${comp.endTime.toFixed(2)}s)`;
             }
         }
    }
    saveState();
    saveState();
};

window.toggleCollapse = (id) => {
    const c = state.components.find(x => x.id === id);
    if (c) {
        c.collapsed = !c.collapsed;
        renderComponentsUI();
        saveState();
    }
};

function drawCollapsedPreview(canvas, comp) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    if(canvas.width !== Math.round(r.width * dpr)) {
        canvas.width = r.width * dpr;
        canvas.height = r.height * dpr;
    }
    ctx.scale(dpr, dpr);
    const w = r.width;
    const h = r.height;
    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.strokeStyle = '#1484e6';
    ctx.lineWidth = 1.5;
    
    // Draw 0 to 5s timeline
    const MAX = 5.0;
    const yBase = h / 2;
    const yScale = h / 2.5; 
    
    for (let i = 0; i <= w; i++) {
        const t = (i / w) * MAX;
        let val = 0;
        
        // Time Constraint & Envelope Logic similar to signal gen
        // FTFilter has signalMode. If complex, envelopes might not apply? 
        // User said "taking into account the time constrait" which usually implies Real mode in FTFilter.
        // But let's assume if signalMode is 'real' we apply constraints. If 'complex', we might just show raw wave?
        // FTFilter usually forces meaningful envelopes only in Real mode.
        // However, the collapsed state might exist in both modes.
        // Let's stick to the logic: if Real mode, apply constraints.
        
        if (state.signalMode === 'real') {
            if (t >= comp.startTime && t <= comp.endTime) {
                const duration = comp.endTime - comp.startTime;
                let env = 1;
                if (duration > 0.01) {
                    const tNorm = (t - comp.startTime) / duration;
                    env = getEnvelopeValue(tNorm, comp.envelopeType, comp.envelopeParams);
                }
                const carrier = getWaveValue(t, comp.freq, comp.phase || 0, comp.waveType || 'sine');
                val = carrier * env * comp.amp;
            }
        } else {
             // Complex mode (no time constraints visually usually, or full duration)
             const carrier = getWaveValue(t, comp.freq, comp.phase || 0, comp.waveType || 'sine');
             val = carrier * comp.amp;
        }
        
        const y = yBase - val * yScale;
        
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
    }
    ctx.stroke();
}

window.setEnvelopeType = (id, type) => {
    const comp = state.components.find(c => c.id === id);
    if(comp) {
        comp.envelopeType = type;
        renderComponentsUI();
        saveState();
    }
};

window.updateEnvParam = (id, type, param, value) => {
    const comp = state.components.find(c => c.id === id);
    if(comp) {
        comp.envelopeParams[type][param] = parseFloat(value);
        saveState();
        drawEnvelopePreview(document.getElementById(`env-prev-${id}`), comp);
    }
};

function drawEnvelopePreview(canvas, comp) {
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    // Resize check standard
    const rect = canvas.getBoundingClientRect();
    if(canvas.width !== Math.round(rect.width * dpr)) {
         canvas.width = Math.round(rect.width * dpr);
         canvas.height = Math.round(rect.height * dpr);
    }
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);
    
    // Background Line
    ctx.beginPath();
    ctx.strokeStyle = '#eee';
    ctx.moveTo(0, h); ctx.lineTo(w, h); 
    ctx.moveTo(0, 0); ctx.lineTo(w, 0); 
    ctx.stroke();

    // Enveloped Wave Preview (Transparent Light Blue)
    // Matches fourier3d style
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(135, 206, 250, 0.4)';
    ctx.lineWidth = 1;
    for(let i=0; i<=w; i++) {
        const tNorm = i / w; // 0 to 1
        const env = getEnvelopeValue(tNorm, comp.envelopeType, comp.envelopeParams);
        // Note: tNorm is 0..1 (envelope space). Carrier depends on Time.
        // Assuming Preview covers 0..1s or full duration?
        // In fourier3d preview, t goes 0..1 (previewTime).
        // Let's use standard preview time logic:
        // Actually fourier3d drawEnvelopePreview loops x=0..w, t=x/w.
        const t = tNorm; // 1s preview
        const carrier = getWaveValue(t, comp.freq, comp.phase || 0, comp.waveType || 'sine');
        const val = Math.abs(carrier) * env;
        
        const y = h - (val * h * 0.9) - 2; 
        if (i===0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
    }
    ctx.stroke();

    // Envelope Curve
    ctx.beginPath();
    ctx.strokeStyle = '#1484e6';
    ctx.lineWidth = 2;
    
    const samples = 100;
    for(let i=0; i<=samples; i++) {
        const tNorm = i / samples; 
        const val = getEnvelopeValue(tNorm, comp.envelopeType, comp.envelopeParams);
        
        const x = tNorm * w;
        const y = h - (val * h * 0.9) - 2; // Margin
        
        if (i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function getEnvelopeValue(tNorm, type, params) {
    if (type === 'gaussian') {
        const p = params.gaussian;
        const num = Math.pow(tNorm - p.center, 2);
        const den = 2 * Math.pow(p.width, 2);
        return Math.exp(-num / den);
    } else if (type === 'square') {
        return 1.0;
    } else {
        const p = params.adsr;
        const t = tNorm; // alias
        if (t < p.a) {
            return t / p.a;
        } 
        else if (t < p.a + p.d) {
            const tDec = t - p.a;
            const prog = tDec / p.d;
            return 1 - prog * (1 - p.s);
        }
        else if (t < 1.0 - p.r) {
            return p.s;
        }
        else {
            const tRel = t - (1.0 - p.r);
            const prog = tRel / p.r;
            return Math.max(0, p.s * (1 - prog));
        }
    }
}

function drawComponentPreview(canvas, comp) {
    // DPI for preview
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    
    // Clear
    ctx.clearRect(0, 0, w, h);
    
    // Draw Sine
    ctx.beginPath();
    ctx.strokeStyle = '#1484e6';
    ctx.lineWidth = 2; // Thicker line
    ctx.lineJoin = 'round';
    
    const previewTime = 1.0; 
    
    // Draw logic
    ctx.moveTo(0, h/2); // Start middle
    for (let x = 0; x <= w; x++) {
        const t = (x / w) * previewTime;
        const val = comp.amp * getWaveValue(t, comp.freq, comp.phase || 0, comp.waveType || 'sine');
        // Scale: Max amp 2.0 covers most of height
        // height is 28. amp=2 -> range -2..2 is 4. scale factor?
        // Let's just scale such that amp=2.5 fills height.
        const y = h/2 - (val / 2.5) * (h/2);
        ctx.lineTo(x, y);
    }
    ctx.stroke();
}

window.removeComponent = (index) => {
    state.components.splice(index, 1);
    renderComponentsUI();
    saveState();
};

window.updateComponent = (id, prop, value) => {
    const comp = state.components.find(c => c.id === id);
    if (comp) {
        comp[prop] = parseFloat(value);
        const valEl = document.getElementById((prop === 'freq' ? 'f-val-' : (prop === 'amp' ? 'a-val-' : 'p-val-')) + id);
        if (valEl) {
            let label = value;
            if (prop === 'freq') label += ' Hz';
            else if (prop === 'phase') label = parseFloat(value).toFixed(2) + ' rad';
            valEl.innerText = label;
        }
            
        // Redraw preview
        const previewCanvas = document.getElementById(`preview-${comp.id}`);
        if(previewCanvas) drawComponentPreview(previewCanvas, comp);
        
        saveState();
    }
};

window.setWaveType = (id, type) => {
    const comp = state.components.find(c => c.id === id);
    if(comp) {
        comp.waveType = type;
        renderComponentsUI();
        saveState();
    }
};

function getWaveValue(t, freq, phase, type) {
    const angle = 2 * Math.PI * freq * t + phase;
    switch (type) {
        case 'square':
            return Math.sign(Math.cos(angle));
        case 'triangle':
            // Triangle wave from -1 to 1
            // 2/PI * asin(sin(angle)) gives triangle phase shifted.
            // Let's usestandard: 4 * abs(t * f + phase/(2PI) - floor(... + 0.75) ) ...
            // Easier: 2/PI * asin(sin(angle)) is valid but is just one phase.
            // Let's use:
            // 2 * Math.abs(2 * ((freq * t + phase / (2 * Math.PI)) % 1 + 1) % 1 - 0.5) - 1 ?? No to complicated.
            // Using asin(cos(x)) is standard triangle.
            return (2 / Math.PI) * Math.asin(Math.cos(angle));
        case 'sawtooth':
            // 2 * ( (angle / 2PI) - floor(angle/2PI + 0.5) )
            // Note: angle = 2*PI*f*t + phase
            const normAngle = (freq * t + phase / (2 * Math.PI));
            return 2 * (normAngle - Math.floor(normAngle + 0.5));
        case 'sine':
        default:
            return Math.cos(angle);
    }
}

// FFT Implementation (Simple Radix-2 DIT)
function fft(data) {
    const N = data.length;
    if (N <= 1) return data;

    const even = [];
    const odd = [];
    for (let i = 0; i < N; i++) {
        if (i % 2 === 0) even.push(data[i]);
        else odd.push(data[i]);
    }

    const evenFFT = fft(even);
    const oddFFT = fft(odd);

    const result = new Array(N);
    for (let k = 0; k < N / 2; k++) {
        const angle = -2 * Math.PI * k / N;
        const re = Math.cos(angle);
        const im = Math.sin(angle);

        const oddRe = oddFFT[k].re * re - oddFFT[k].im * im;
        const oddIm = oddFFT[k].re * im + oddFFT[k].im * re;

        result[k] = { 
            re: evenFFT[k].re + oddRe, 
            im: evenFFT[k].im + oddIm 
        };
        result[k + N / 2] = { 
            re: evenFFT[k].re - oddRe, 
            im: evenFFT[k].im - oddIm 
        };
    }
    return result;
}

// Inverse FFT
function ifft(data) {
    const N = data.length;
    // Conjugate input
    const conjugate = data.map(c => ({ re: c.re, im: -c.im }));
    
    // Forward FFT
    const transform = fft(conjugate);
    
    // Conjugate result and scale
    return transform.map(c => ({ 
        re: c.re / N, 
        im: -c.im / N // Conjugate again (and / N)
    }));
}

function animate() {
    requestAnimationFrame(animate);

    // Resize canvases with DPI Support
    const dpr = window.devicePixelRatio || 1;
    
    Object.values(elements.canvases).forEach(canvas => {
        const rect = canvas.parentElement.getBoundingClientRect();
        const ctx = canvas.getContext('2d');
        // Check if resize needed
        if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
        }
        // Always reset and scale to avoid drift
        ctx.resetTransform();
        ctx.scale(dpr, dpr);
    });

    // 1. Generate Signal
    const N = 2048; 
    const signalData = [];
    const timeData = [];

    for (let i = 0; i < N; i++) {
        const t = i / state.sampleRate;
        let val = 0;
        
        state.components.forEach(comp => {
            let compVal = comp.amp * getWaveValue(t, comp.freq, comp.phase || 0, comp.waveType || 'sine');
            
            if (state.signalMode === 'real') {
                if (t < comp.startTime || t > comp.endTime) {
                    compVal = 0;
                } else {
                    const duration = comp.endTime - comp.startTime;
                    if (duration > 0.01) {
                        const tNorm = (t - comp.startTime) / duration;
                        const env = getEnvelopeValue(tNorm, comp.envelopeType, comp.envelopeParams);
                        compVal *= env;
                    }
                }
            }
            val += compVal;
        });
        signalData.push({ re: val, im: 0 }); 
        timeData.push({ t, val });
    }

    // 2. Compute FFT
    const fftData = fft(signalData);
    
    // 3. Apply Filter
    const filteredFFT = [];
    const freqs = [];
    
    for (let k = 0; k < N; k++) {
        let f = k * state.sampleRate / N;
        if (k > N/2) f = (k - N) * state.sampleRate / N; 
        
        const mag = Math.sqrt(fftData[k].re**2 + fftData[k].im**2);
        const absF = Math.abs(f);
        
        const displayMag = state.signalMode === 'real' ? mag * 2.5 : mag;
        freqs.push({ f: absF, mag: displayMag }); 

        let response = 0;
        
        if (state.filterType === 'square') {
             if (absF >= (state.filterCenter - state.filterWidth/2) && 
                 absF <= (state.filterCenter + state.filterWidth/2)) {
                 response = 1;
             }
        } else {
            // Gaussian: Sigma = Width / 4
            const sigma = Math.max(0.1, state.filterWidth / 4); 
            const num = Math.pow(absF - state.filterCenter, 2);
            const den = 2 * Math.pow(sigma, 2);
            response = Math.exp(-num / den);
        }

        filteredFFT.push({ 
            re: fftData[k].re * response, 
            im: fftData[k].im * response 
        });
    }

    // 4. Compute Inverse FFT
    const reconstructedData = ifft(filteredFFT);

    // Capture for Audio
    lastFilteredFFT = filteredFFT;
    
    const reconPlotData = reconstructedData.map((c, i) => ({
        t: i / state.sampleRate,
        val: c.re 
    }));

    // Audio Playback Time Sync
    let pbTimeOriginal = null;
    let pbTimeRecon = null;
    if (isPlaying && audioCtx) {
        const t = audioCtx.currentTime - audioStartTime;
        if (t <= 5.0) { // Max duration
             if (isPlaying === 'original') pbTimeOriginal = t;
             else if (isPlaying === 'reconstructed') pbTimeRecon = t;
        }
    }

    // 5. Apply Smoothing (to visual data only)
    if (state.smoothing > 0) {
        smoothData(timeData, state.smoothing);
        smoothData(reconPlotData, state.smoothing);
    }

    // 6. Draw
    drawSignalNew(elements.ctx.signal, timeData, false, pbTimeOriginal);
    drawSpectrum(elements.ctx.freq, freqs, N);
    
    drawSignalNew(elements.ctx.recon, reconPlotData, true, pbTimeRecon);
}

function smoothData(data, factor) {
    if (!data || data.length === 0) return;
    let smoothedVal = data[0].val;
    for (let i = 1; i < data.length; i++) {
        smoothedVal = smoothedVal * factor + data[i].val * (1 - factor);
        data[i].val = smoothedVal;
    }
}

function drawAxis(ctx, xMax, yMax, xLabel) { // Removed 'yLabel' unused
    if (!state.showAxis) return;

    // Canvas logic units (divided by DPR is managed by context scale)
    const currentDPR = window.devicePixelRatio || 1;
    const w = ctx.canvas.width / currentDPR;
    const h = ctx.canvas.height / currentDPR;
    
    ctx.strokeStyle = '#ddd';
    ctx.fillStyle = '#999';
    ctx.font = '10px Space Mono';
    ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    
    // Make coordinates integers for sharpness
    ctx.translate(0.5, 0.5);

    // X Axis
    const numNotches = 10;
    for (let i = 0; i <= numNotches; i++) {
        const x = Math.round((i / numNotches) * w);
        const val = (i / numNotches) * xMax;
        
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x, h - 5);
        ctx.stroke();
        
        // Label
        if (i % 2 === 0) { // Every other label
            let text = val.toFixed(1);
            // No unit suffix here as per request
            
            // Adjust last label position to not be cut off
            if (i === numNotches) {
                 ctx.textAlign = 'right';
                 ctx.fillText(text, x - 2, h - 8);
            } else {
                 ctx.textAlign = 'center';
                 ctx.fillText(text, x, h - 8);
            }
        }
    }
    
    ctx.translate(-0.5, -0.5); // Reset
}

function drawSignal(ctx, data, isRecon) {
    const currentDPR = window.devicePixelRatio || 1;
    const w = ctx.canvas.width / currentDPR;
    const h = ctx.canvas.height / currentDPR;
    
    ctx.clearRect(0, 0, w, h);
    
    const maxTime = state.timeBase;
    
    // Scale Y (Fixed or Dynamic)
    const maxPossibleAmp = 5; // Roughly
    const scaleY = (h / 2 - 20) / maxPossibleAmp; 

    // Axis
    drawAxis(ctx, maxTime, maxPossibleAmp, 's');
    
    // Grid alignment
    ctx.translate(0.5, 0.5);

    // Center Line
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h/2);
    ctx.lineTo(w, h/2);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = isRecon ? '#1484e6' : '#1a1a1a'; // Blue for filtered, Black for original
    ctx.lineWidth = 2; // Thicker for visibility
    ctx.lineJoin = 'round'; // Smooth corners

    let started = false;
    for (let i = 0; i < data.length; i++) {
        const pt = data[i];
        if (pt.t > maxTime) break;
        
        const x = (pt.t / maxTime) * w;
        const y = h/2 - pt.val * scaleY;
        
        if (!started) {
            ctx.moveTo(x, y);
            started = true;
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
    
    ctx.translate(-0.5, -0.5);
}

function drawSpectrum(ctx, data, N) {
    const currentDPR = window.devicePixelRatio || 1;
    const w = ctx.canvas.width / currentDPR;
    const h = ctx.canvas.height / currentDPR;
    
    ctx.clearRect(0, 0, w, h);
    
    // We only plot 0 to Fs/2
    const maxFreq = state.sampleRate / 2;
    // Actually our 'data' array has N entries, with freqs from 0 to Fs centered?
    // We populated 'freqs' with abs(f). It has N entries, with many duplicates (pos/neg).
    // Let's just plot the first N/2 + 1 indices which correspond to 0...Fs/2
    
    const plotData = data.slice(0, N/2);
    
    // Axis
    drawAxis(ctx, maxFreq, 1, 'Hz');

    // Draw Window/Filter shape
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(20, 132, 230, 0.5)';
    ctx.lineWidth = 1;
    
    if (state.filterType === 'square') {
         const centerX = (state.filterCenter / maxFreq) * w;
         const widthX = (state.filterWidth / maxFreq) * w;
         ctx.fillStyle = 'rgba(20, 132, 230, 0.1)';
         ctx.fillRect(centerX - widthX/2, 0, widthX, h); 
         // Align stroke
         ctx.translate(0.5, 0.5);
         ctx.strokeRect(centerX - widthX/2, 0, widthX, h);
         ctx.translate(-0.5, -0.5);
    } else {
        // Draw Gaussian Curve
        ctx.translate(0.5, 0.5);
        ctx.fillStyle = 'rgba(20, 132, 230, 0.1)';
        ctx.moveTo(0, h);
        
        for(let x=0; x<=w; x+=2) { 
             const f = (x / w) * maxFreq;
             const sigma = Math.max(0.1, state.filterWidth / 4);
             const num = Math.pow(f - state.filterCenter, 2);
             const den = 2 * Math.pow(sigma, 2);
             const resp = Math.exp(-num / den);
             const y = h - (resp * h);
             ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.translate(-0.5, -0.5);
    }

    // Draw Magnitude Bars
    ctx.beginPath();
    const barWidth = w / (N/2);
    const normalization = (N/2);
    const maxVisibleAmp = 2.5; 
    
    for (let i = 0; i < plotData.length; i++) {
        const d = plotData[i];
        const x = (d.f / maxFreq) * w;
        
        const amp = d.mag / normalization;
        const barH = (amp / maxVisibleAmp) * h;
        
        let inWindow = false;
        if(state.filterType === 'square') {
             inWindow = d.f >= (state.filterCenter - state.filterWidth/2) && 
                         d.f <= (state.filterCenter + state.filterWidth/2);
        } else {
             // Visual threshold for Gaussian
             const sigma = Math.max(0.1, state.filterWidth / 4);
             const resp = Math.exp(-Math.pow(d.f - state.filterCenter, 2) / (2*sigma*sigma));
             inWindow = resp > 0.1;
        }
        
        ctx.fillStyle = inWindow ? '#1484e6' : '#bbb'; 
        ctx.fillRect(x, h - barH, Math.max(1, barWidth - 0.5), barH);
    }
    
    ctx.translate(-0.5, -0.5);
}

// Start
// init(); <-- Moving init to end after audio functions

// Audio Logic ----------------------------------------------------

window.toggleAudio = (type) => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    // Capture previous state BEFORE stop
    const wasPlayingType = isPlaying;
    
    // Stop if currently playing
    if (isPlaying) {
        stopAudio();
    }
    
    // If we just stopped the same type, return (toggle off)
    if (wasPlayingType === type) {
        return; 
    }
    
    // Start New
    isPlaying = type;
    updatePlayButtons();
    
    const buffer = generateAudioBuffer(type);
    
    currentSource = audioCtx.createBufferSource();
    currentSource.buffer = buffer;
    currentSource.connect(audioCtx.destination);
    
    // Set Start Time
    audioStartTime = audioCtx.currentTime;
    
    currentSource.onended = () => {
        // Only if we are still the registered player (avoids race condition)
        if (isPlaying === type) { 
            isPlaying = null;
            updatePlayButtons();
        }
    };
    currentSource.start();
};

function stopAudio() {
    if (currentSource) {
        try { currentSource.stop(); } catch(e){}
        currentSource = null;
    }
    isPlaying = null;
    updatePlayButtons();
}

function updatePlayButtons() {
    const btnOrig = document.getElementById('btn-play-original');
    const btnRecon = document.getElementById('btn-play-recon');
    
    if(btnOrig) {
        btnOrig.classList.remove('playing');
        const s = btnOrig.querySelector('span');
        if(s) s.innerText = 'play_arrow';
    }
    if(btnRecon) {
        btnRecon.classList.remove('playing');
        const s = btnRecon.querySelector('span');
        if(s) s.innerText = 'play_arrow';
    }
    
    if (isPlaying === 'original' && btnOrig) {
        btnOrig.classList.add('playing');
        const s = btnOrig.querySelector('span');
        if(s) s.innerText = 'stop';
    }
    if (isPlaying === 'reconstructed' && btnRecon) {
        btnRecon.classList.add('playing');
        const s = btnRecon.querySelector('span');
        if(s) s.innerText = 'stop';
    }
}

function generateAudioBuffer(type) {
    const duration = 5.0; // Fixed duration
    const sr = audioCtx.sampleRate;
    const totalSamples = sr * duration;
    const buffer = audioCtx.createBuffer(1, totalSamples, sr);
    const data = buffer.getChannelData(0);
    
    const K = state.audioMultiplier;
    
    if (type === 'original') {
        for (let i = 0; i < totalSamples; i++) {
            const t = i / sr; // Audio Time
            let val = 0;
            state.components.forEach(comp => {
                // Use getWaveValue with Audio Frequency (freq * K) and original phase
                let compVal = comp.amp * getWaveValue(t, comp.freq * K, comp.phase || 0, comp.waveType || 'sine');
                
                if (state.signalMode === 'real') {
                   if (t < comp.startTime || t > comp.endTime) {
                       compVal = 0;
                   } else {
                       const dur = comp.endTime - comp.startTime;
                       if (dur > 0.01) {
                            const tNorm = (t - comp.startTime) / dur;
                            compVal *= getEnvelopeValue(tNorm, comp.envelopeType, comp.envelopeParams);
                       }
                   }
                }
                val += compVal;
            });
            data[i] = Math.tanh(val * 0.5); 
        }
    } else {
        // Reconstructed Audio: Additive Synthesis Strategy
        // This avoids FFT bin artifacts ("pulsating") and accurately reflects the filter's effect on harmonic series.
        
        // 1. Pre-calculate active harmonics for each component
        const activeHarmonics = [];
        state.components.forEach(comp => {
            // Get harmonic series (up to Nyquist of Audio Rate)
            const nyquist = sr / 2;
            const harmonics = getHarmonics(comp.freq * K, comp.waveType || 'sine', nyquist);
            
            harmonics.forEach(h => {
                // Calculate Filter Response for this harmonic
                // Note: Filter operates in Visual Frequency domain.
                // We know AudioFreq = VisualFreq * K
                // So VisualFreq = AudioFreq / K = h.freq / K = (comp.freq * K * n) / K = comp.freq * n
                // Wait, h.freq is already scaled by K? Yes, getHarmonics takes baseFreq.
                // So we need to reverse scale to check filter response.
                const visualFreq = h.freq / K;
                
                let response = 0;
                if (state.filterType === 'square') {
                     if (visualFreq >= (state.filterCenter - state.filterWidth/2) && 
                         visualFreq <= (state.filterCenter + state.filterWidth/2)) {
                         response = 1;
                     }
                } else {
                    // Gaussian
                    const sigma = Math.max(0.1, state.filterWidth / 4); 
                    const num = Math.pow(visualFreq - state.filterCenter, 2);
                    const den = 2 * Math.pow(sigma, 2);
                    response = Math.exp(-num / den);
                }
                
                // If response is significant, add to list
                if (response > 0.001) {
                    activeHarmonics.push({
                        freq: h.freq, // Audio Freq
                        amp: comp.amp * h.amp * response,
                        phase: comp.phase || 0, // Fundamental phase shifts harmonics? 
                                                // Yes, harmonic N has phase N*phi? 
                                                // Actually for simple waves: sin(w*t + phi).
                                                // Square = sin(x) + 1/3 sin(3x) + ...
                                                // If x -> x+phi => sin(x+phi) + 1/3 sin(3(x+phi)) = sin(x+phi) + 1/3 sin(3x + 3phi)
                                                // So harmonic N gets N*phi phase shift.
                        n: h.n,
                        // Component Reference for Envelope Logic
                        startTime: comp.startTime,
                        endTime: comp.endTime,
                        envelopeType: comp.envelopeType,
                        envelopeParams: comp.envelopeParams
                    });
                }
            });
        });

        // 2. Synthesize
        for (let i = 0; i < totalSamples; i++) {
            const t = i / sr;
            let val = 0;
            
            for (let h of activeHarmonics) {
                // Basic Osc
                // Phase: The getHarmonics usually assumes sin(n*w*t).
                // Phase shift: we must apply n * phase.
                const angle = 2 * Math.PI * h.freq * t + (h.phase * h.n);
                let oscVal = h.amp * Math.cos(angle); // Cosine base for consistency with getWaveValue default
                
                // Note: getHarmonics usually returns relative amps assuming Sine base?
                // Let's ensure getHarmonics returns math consistent with 'cosine' or 'sine' base.
                // Standard getWaveValue uses Math.cos(angle).
                // Square: sign(cos(x)). Expansion of sign(cos(x)) is 4/pi * (cos(x) - 1/3 cos(3x) + 1/5 cos(5x)...)
                // So alternating signs for cosine series of square wave.
                
                // Let's trust getHarmonics to handle sign/phase offsets if possible, 
                // OR we just sum them. 
                // If getHarmonics returns signed amplitude, we just use cos.
                
                // Real Mode Envelope
                if (state.signalMode === 'real') {
                   if (t < h.startTime || t > h.endTime) {
                       oscVal = 0;
                   } else {
                       const dur = h.endTime - h.startTime;
                       if (dur > 0.01) {
                            const tNorm = (t - h.startTime) / dur;
                            oscVal *= getEnvelopeValue(tNorm, h.envelopeType, h.envelopeParams);
                       }
                   }
                }
                val += oscVal;
            }
            data[i] = Math.tanh(val * 0.5) * state.masterVolume;
        }
    }
    return buffer;
}

// IO Logic
window.exportComponents = () => {
    const data = JSON.stringify(state.components, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ftfilter_components.json';
    a.click();
    URL.revokeObjectURL(url);
};

window.triggerImport = () => {
    const inp = document.getElementById('import-file');
    if(inp) inp.click();
};

window.importComponents = (input) => {
    const file = input.files[0];
    if (!file) return;
    
    if (state.components.length > 0) {
        if (!confirm("This will replace all current signal components. Are you sure?")) {
            input.value = ''; 
            return;
        }
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (Array.isArray(data)) {
                // Compatible import logic
                state.components = data.map(c => {
                    const n = new SignalComponent(c.freq || 1, c.amp || 1, c.phase || 0, c.waveType || 'sine');
                    n.id = c.id || Math.random().toString(36).substr(2, 9);
                    // Real mode params restoration
                    if(c.startTime !== undefined) n.startTime = c.startTime;
                    if(c.endTime !== undefined) n.endTime = c.endTime;
                    if(c.envelopeType) n.envelopeType = c.envelopeType;
                    if(c.envelopeParams) n.envelopeParams = c.envelopeParams;
                    return n;
                });
                renderComponentsUI();
                saveState();
            } else {
                alert("Invalid file format: format needs to be an array of component objects.");
            }
        } catch (err) {
            alert("Error parsing JSON: " + err.message);
        }
    };
    reader.readAsText(file);
    input.value = ''; 
};

function getHarmonics(freq, type, nyquist) {
    const harmonics = [];
    let n = 1;
    
    // Safety
    if (freq <= 0) return [];

    while (freq * n < nyquist) {
        let amp = 0;
        
        switch (type) {
            case 'sine':
                if (n === 1) amp = 1; 
                break;
            case 'square':
                // Square (odd harmonics only): 4/pi * 1/n 
                // However, our getWaveValue 'square' returns +/- 1 amplitude.
                // The fundamental of a +/-1 square wave has amplitude 4/pi approx 1.27.
                // We should normalize so the peak matches or the energy matches?
                // Visual graph Square amplitude (controlled by slider) is peak-to-peak/2.
                // getWaveValue returns +/- 1.
                // So we use standard expansion: 1/n for odd n.
                // Signs: cos(x) - 1/3 cos(3x) + 1/5 cos(5x) ...
                if (n % 2 !== 0) {
                     // Alternating signs: 1, -1, 1, -1 for n=1, 3, 5, 7
                     // n=1 (idx0) -> +, n=3 (idx1) -> -, n=5 (idx2) -> +
                     // ((n-1)/2) % 2 === 0 ? 1 : -1
                     const sign = (((n - 1) / 2) % 2 === 0) ? 1 : -1;
                     amp = (4 / Math.PI) * (1 / n) * sign;
                }
                break;
            case 'triangle':
                // Triangle (odd harmonics): 8/pi^2 * (-1)^k * 1/n^2
                // series: cos(x) + 1/9 cos(3x) + ... ?? 
                // Standard Triangle (0 start, peak at pi/2): 8/pi^2 * (sin(x) - 1/9 sin(3x) + ...)
                // Our getWaveValue 'triangle' is (2/pi)*asin(cos(x)). 
                // This is a triangle wave in phase with Cosine (starts at 1, goes down).
                // Expansion: 8/pi^2 * (cos(x) + 1/9 cos(3x) + 1/25 cos(5x) ...)
                // All positives? Let's verify.
                // cos(0) + 1/9 + 1/25 = sum(1/odd^2) = pi^2/8.
                // So yes, all positive cosine terms for a "Cosine-phase" triangle.
                if (n % 2 !== 0) {
                    amp = (8 / (Math.PI * Math.PI)) * (1 / (n * n));
                }
                break;
            case 'sawtooth':
                // Sawtooth (all harmonics): 2/pi * (sin(x) - 1/2 sin(2x) + 1/3 sin(3x) ...)
                // Our getWaveValue 'sawtooth' is 2*(x - floor(x+0.5)). Ramps up.
                // If we align to Cosine? Sawtooth is usually defined via sine.
                // Let's just use 1/n scaling.
                // If we want to match our visual sawtooth (which centers at 0 and goes -1 to 1 per period),
                // The expansion is -2/pi * sum ( (-1)^k / k * sin(kx) )
                // Audio quality: phase of harmonics affects timbre very little (Helmholtz).
                // So amplitude 2/pi * 1/n is sufficient.
                amp = (2 / Math.PI) * (1 / n);
                break;
        }
        
        if (amp !== 0) {
            harmonics.push({ n, freq: freq * n, amp });
        }
        
        n++;
        // Limit to reasonable number to avoid performance hit (e.g. 50? or full spectra?)
        // 50 x 3 comps = 150 oscs. Safe.
        // If low freq (50Hz), nyquist 22k -> 400 harmonics. 400*3 = 1200. Might be slow.
        // Limit to 100 harmonics.
        if (n > 100) break;
    }
    return harmonics;
}


function drawSignalNew(ctx, data, isRecon, pbTime = null) {
    const currentDPR = window.devicePixelRatio || 1;
    const w = ctx.canvas.width / currentDPR;
    const h = ctx.canvas.height / currentDPR;
    
    // Clear
    ctx.clearRect(0, 0, w, h);
    
    // Zoom/Pan State
    const tStart = state.zoomStart;
    const tEnd = state.zoomEnd;
    const tRange = tEnd - tStart;
    
    // Safety
    if (tRange <= 0.0001) return;

    // Scale Y (Fixed or Dynamic)
    const maxPossibleAmp = 5; 
    const scaleY = (h / 2 - 20) / maxPossibleAmp; 

    // Axis
    // We need a smart axis drawer that knows about start/end
    drawAxisNew(ctx, tStart, tEnd, maxPossibleAmp, 's');
    
    // Grid alignment
    ctx.translate(0.5, 0.5);

    // Center Line
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h/2);
    ctx.lineTo(w, h/2);
    ctx.stroke();

    if (!data || data.length === 0) {
        ctx.translate(-0.5, -0.5);
        return;
    }

    ctx.beginPath();
    ctx.strokeStyle = isRecon ? '#1484e6' : '#1a1a1a';
    ctx.lineWidth = 2; 
    ctx.lineJoin = 'round';

    // Optimization: Find start index
    // Data is sorted by time usually? Yes, generated sequentially.
    // dt = 5 / 2048 typically. 
    // We can just iterate or binary search. Iteration is fast enough for 2048 points.
    
    let started = false;
    for (let i = 0; i < data.length; i++) {
        const pt = data[i];
        if (pt.t < tStart - 0.1) continue; // Margin
        if (pt.t > tEnd + 0.1) break;      // Margin
        
        const x = ((pt.t - tStart) / tRange) * w;
        const y = h/2 - pt.val * scaleY;
        
        if (!started) {
            ctx.moveTo(x, y);
            started = true;
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();

    // Playback Line
    if (pbTime !== null && pbTime >= tStart && pbTime <= tEnd) {
        const x = ((pbTime - tStart) / tRange) * w;
        ctx.beginPath();
        ctx.strokeStyle = '#000'; 
        ctx.lineWidth = 1.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    
    ctx.translate(-0.5, -0.5);
}

function drawAxisNew(ctx, tStart, tEnd, yMax, unit) {
     if (!state.showAxis) return;
     const currentDPR = window.devicePixelRatio || 1;
     const w = ctx.canvas.width / currentDPR;
     const h = ctx.canvas.height / currentDPR;
     
     ctx.strokeStyle = '#ddd';
     ctx.fillStyle = '#999';
     ctx.font = '10px Space Mono';
     ctx.lineWidth = 1;
     ctx.textAlign = 'center';
     
     ctx.translate(0.5, 0.5);
     
     const range = tEnd - tStart;
     const numNotches = 5;
     
     for (let i=0; i<=numNotches; i++) {
         const t = tStart + (i/numNotches)*range;
         const x = (i/numNotches)*w;
         
         ctx.beginPath();
         ctx.moveTo(x, h);
         ctx.lineTo(x, h-5);
         ctx.stroke();
         
         ctx.fillText(t.toFixed(2), x, h-8);
         // Skip y-axis labels for now to keep clean
     }
     ctx.translate(-0.5, -0.5);
}

function setupCanvasInteractions(canvas) {
    if(!canvas) return;
    
    // Mouse
    canvas.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', drag);
    window.addEventListener('mouseup', endDrag);
    
    // Touch
    canvas.addEventListener('touchstart', (e) => startDrag(e.touches[0]));
    window.addEventListener('touchmove', (e) => drag(e.touches[0]));
    window.addEventListener('touchend', endDrag);

    // Wheel (Zoom)
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    
    function startDrag(e) {
        // Only if target is canvas
        if (e.target !== canvas && e instanceof MouseEvent) return; 
        // For touch, e is Touch object which doesn't have target same way?
        // Actually e.target is fine.
        
        state.isDragging = true;
        const rect = canvas.getBoundingClientRect();
        state.dragStartX = (e.clientX - rect.left);
        state.dragStartTime = state.zoomStart;
        state.dragRange = state.zoomEnd - state.zoomStart;
        state.dragLastX = state.dragStartX; 
    }
    
    function drag(e) {
        if (!state.isDragging) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const w = rect.width;
        
        const dxPixels = x - state.dragLastX;
        state.dragLastX = x;
        
        const range = state.zoomEnd - state.zoomStart;
        // pixelToTime = range / w
        const dt = -(dxPixels / w) * range;
        
        let newStart = state.zoomStart + dt;
        let newEnd = state.zoomEnd + dt;
        
        // Clamp 0..5
        if (newStart < 0) {
             newStart = 0;
             newEnd = range;
        }
        if (newEnd > 5) {
             newEnd = 5;
             newStart = 5 - range;
        }
        
        state.zoomStart = newStart;
        state.zoomEnd = newEnd;
    }
    
    function endDrag() {
        state.isDragging = false;
    }
    
    function handleWheel(e) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const w = rect.width;
        
        const tHover = state.zoomStart + (mouseX / w) * (state.zoomEnd - state.zoomStart);
        
        const zoomSpeed = 0.1;
        const factor = e.deltaY > 0 ? (1 + zoomSpeed) : (1 - zoomSpeed);
        
        let newRange = (state.zoomEnd - state.zoomStart) * factor;
        
        // Clamp Range
        if (newRange < 0.1) newRange = 0.1;
        if (newRange > 5.0) newRange = 5.0;
        
        // Adjust start/end to keep tHover fixed
        const ratio = (mouseX / w);
        let newStart = tHover - newRange * ratio;
        let newEnd = tHover + newRange * (1 - ratio);
        
        // Clamp Boundary
        if (newStart < 0) {
            newStart = 0;
            newEnd = newRange;
        }
        if (newEnd > 5) {
            newEnd = 5;
            newStart = 5 - newRange;
        }
        state.zoomStart = newStart;
        state.zoomEnd = newEnd;
        updateDisplaySliders(); // Sync UI
    }
}

// Global Display Slider Logic
window.updateDisplaySegment = (type, value) => {
    value = parseFloat(value);
    const MAX = 5.0;
    
    if (type === 'start') {
        if (value >= state.zoomEnd) {
             state.zoomEnd = Math.min(value + 0.1, MAX);
             if (state.zoomEnd === MAX) {
                 if (value > MAX - 0.1) value = MAX - 0.1;
             }
        }
        state.zoomStart = value;
    } else {
        if (value <= state.zoomStart) {
             state.zoomStart = Math.max(value - 0.1, 0);
             if (state.zoomStart === 0) {
                 if (value < 0.1) value = 0.1;
             }
        }
        state.zoomEnd = value;
    }
    
    // Sync UI visually (fill, label, other slider)
    updateDisplaySliders();
};

function updateDisplaySliders() {
    const startInput = document.getElementById('display-start-input');
    const endInput = document.getElementById('display-end-input');
    const fill = document.getElementById('display-segment-fill');
    const label = document.getElementById('display-segment-label');
    
    if (startInput && endInput && fill && label) {
        // Update input values if they aren't the focused element (avoid jitter while dragging)
        if (document.activeElement !== startInput) startInput.value = state.zoomStart;
        if (document.activeElement !== endInput) endInput.value = state.zoomEnd;
        
        const MAX = 5.0;
        const left = (state.zoomStart / MAX) * 100;
        const width = ((state.zoomEnd - state.zoomStart) / MAX) * 100;
        
        fill.style.left = left + '%';
        fill.style.width = width + '%';
        
        label.innerText = `Display Segment (${state.zoomStart.toFixed(2)}s - ${state.zoomEnd.toFixed(2)}s)`;
    }
}

function init() {
    setupCanvasInteractions(elements.canvases.signal);
    setupCanvasInteractions(elements.canvases.recon);
    
    loadState();
    updateToggleUI();
    renderComponentsUI();
    setupListeners();
    updateDisplaySliders(); // Init Sync
    
    animate();
}

init();
