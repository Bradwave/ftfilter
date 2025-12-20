class SignalComponent {
    constructor(freq, amp) {
        this.freq = freq;
        this.amp = amp;
        this.id = Math.random().toString(36).substr(2, 9);
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
    timeBase: 2,     // Seconds shown
    sampleRate: 256, // Samples per second
    isDraggingFilter: false,
    showAxis: true,
    smoothing: 0
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

const STORAGE_KEY = 'ftfilter_state_v1';

function init() {
    loadState();
    renderComponentsUI();
    setupListeners();
    animate();
}

function saveState() {
    const saved = {
        components: state.components, 
        filterCenter: state.filterCenter,
        filterWidth: state.filterWidth,
        timeBase: state.timeBase,
        showAxis: state.showAxis,
        smoothing: state.smoothing
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
                return n;
            });
            state.filterCenter = parsed.filterCenter;
            state.filterWidth = parsed.filterWidth;
            state.timeBase = parsed.timeBase;
            state.showAxis = parsed.showAxis;
            state.smoothing = parsed.smoothing || 0;
            
            // Sync UI inputs
            elements.filterCenterSlider.value = state.filterCenter;
            elements.filterWidthSlider.value = state.filterWidth;
            elements.timeBaseSlider.value = state.timeBase;
            elements.axisToggle.checked = state.showAxis;
            elements.smoothingSlider.value = state.smoothing;
            elements.filterCenterDisplay.innerText = state.filterCenter.toFixed(1) + " Hz";
        } catch(e) { console.error("Failed to load state", e); }
    }
}

function setupListeners() {
    // Collapsible (Same as before)
    elements.componentsToggle.addEventListener('click', () => {
        const content = elements.componentsWrapper;
        const icon = elements.componentsToggle.querySelector('.dropdown-icon');
        content.classList.toggle('expanded');
        if (content.classList.contains('expanded')) {
            icon.style.transform = "rotate(0deg)";
        } else {
            icon.style.transform = "rotate(-90deg)";
        }
    });

    elements.addComponentBtn.addEventListener('click', () => {
        state.components.push(new SignalComponent(10, 0.5));
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

    elements.timeBaseSlider.addEventListener('input', (e) => {
        state.timeBase = parseFloat(e.target.value);
        saveState();
    });

    elements.smoothingSlider.addEventListener('input', (e) => {
        state.smoothing = parseFloat(e.target.value);
        saveState();
    });

    elements.resetBtn.addEventListener('click', () => {
        // Clear local storage completely
        localStorage.removeItem(STORAGE_KEY);
        
        // Reset state to default
        state.components = [
            new SignalComponent(2, 1.0),
            new SignalComponent(5, 0.5)
        ];
        state.filterCenter = 5;
        state.filterWidth = 4;
        state.timeBase = 2;
        state.showAxis = true;
        state.smoothing = 0;
        
        // Sync Inputs
        elements.filterCenterSlider.value = 5;
        elements.filterWidthSlider.value = 4;
        elements.timeBaseSlider.value = 2;
        elements.axisToggle.checked = true;
        elements.smoothingSlider.value = 0;
        elements.filterCenterDisplay.innerText = "5.0 Hz";

        renderComponentsUI();
    });

    // Interaction on frequency canvas (freqCanvas logic remains the same)
    const freqCanvas = elements.canvases.freq;
    
    freqCanvas.addEventListener('mousedown', (e) => {
        const rect = freqCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width; // Use rect width, not canvas width (resolution) for calc
        
        // Map x to frequency
        const maxFreq = state.sampleRate / 2;
        const clickedFreq = (x / width) * maxFreq;

        // Check if clicked near window
        const halfWidth = state.filterWidth / 2;
        if (clickedFreq >= state.filterCenter - halfWidth && clickedFreq <= state.filterCenter + halfWidth) {
            state.isDraggingFilter = true;
        } else {
             // Jump to position
             state.filterCenter = clickedFreq;
             state.isDraggingFilter = true;
             updateFilterUI();
             saveState();
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!state.isDraggingFilter) return;
        const rect = freqCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        
        const maxFreq = state.sampleRate / 2;
        let newFreq = (x / width) * maxFreq;
        
        // Clamp
        newFreq = Math.max(0, Math.min(newFreq, maxFreq));
        
        state.filterCenter = newFreq;
        updateFilterUI();
        // Don't save on every move, maybe on mouseup
    });

    window.addEventListener('mouseup', () => {
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
    state.components.forEach((comp, index) => {
        const el = document.createElement('div');
        el.className = 'component-row';
        el.innerHTML = `
            <div class="component-header">
                <span>WAVE ${index + 1}</span>
                <span class="material-symbols-outlined remove-btn" style="font-size: 16px;" onclick="removeComponent(${index})">close</span>
            </div>
            
            <div class="component-body">
                <div class="component-controls">
                    <div class="component-control-item">
                        <div class="component-slider-wrapper">
                            <span class="component-label">FREQ</span>
                            <input type="range" class="compact-range" value="${comp.freq}" min="0.5" max="50" step="0.5" 
                                oninput="updateComponent('${comp.id}', 'freq', this.value)">
                        </div>
                        <div id="f-val-${comp.id}" class="component-value">${comp.freq} Hz</div>
                    </div>

                    <div class="component-control-item">
                        <div class="component-slider-wrapper">
                            <span class="component-label">AMP</span>
                            <input type="range" class="compact-range" value="${comp.amp}" min="0" max="2" step="0.1" 
                                oninput="updateComponent('${comp.id}', 'amp', this.value)">
                        </div>
                        <div id="a-val-${comp.id}" class="component-value">${comp.amp}</div>
                    </div>
                </div>
                
                <div class="component-preview-wrapper">
                    <canvas id="preview-${comp.id}" width="100" height="28" style="width: 100%; height: 100%; display: block;"></canvas>
                </div>
            </div>
        `;
        elements.componentsContainer.appendChild(el);
        
        // Draw Preview
        const previewCanvas = document.getElementById(`preview-${comp.id}`);
        drawComponentPreview(previewCanvas, comp);
    });
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
        const val = comp.amp * Math.sin(2 * Math.PI * comp.freq * t);
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
        document.getElementById((prop === 'freq' ? 'f-val-' : 'a-val-') + id).innerText = 
            value + (prop === 'freq' ? ' Hz' : '');
            
        // Redraw preview
        const previewCanvas = document.getElementById(`preview-${comp.id}`);
        if(previewCanvas) drawComponentPreview(previewCanvas, comp);
        
        saveState();
    }
};

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
        // Check if resize needed
        if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
            canvas.width = Math.round(rect.width * dpr);
            canvas.height = Math.round(rect.height * dpr);
            // We do NOT set style.width/height here as resizing depends on parent (100% css)
            // But we must reset context scale
             const ctx = canvas.getContext('2d');
             ctx.resetTransform(); // clear old scale
             ctx.scale(dpr, dpr);
        }
    });

    // 1. Generate Signal
    const N = 1024; 
    const signalData = [];
    const timeData = [];

    for (let i = 0; i < N; i++) {
        const t = i / state.sampleRate;
        let val = 0;
        state.components.forEach(comp => {
            val += comp.amp * Math.cos(2 * Math.PI * comp.freq * t);
        });
        signalData.push({ re: val, im: 0 }); // Complex for FFT
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
        
        freqs.push({ f: absF, mag }); 

        const inWindow = absF >= (state.filterCenter - state.filterWidth/2) && 
                         absF <= (state.filterCenter + state.filterWidth/2);
        
        if (inWindow) {
            filteredFFT.push(fftData[k]);
        } else {
            filteredFFT.push({ re: 0, im: 0 });
        }
    }

    // 4. Compute Inverse FFT
    const reconstructedData = ifft(filteredFFT);
    
    const reconPlotData = reconstructedData.map((c, i) => ({
        t: i / state.sampleRate,
        val: c.re 
    }));

    // 5. Apply Smoothing (to visual data only)
    if (state.smoothing > 0) {
        smoothData(timeData, state.smoothing);
        smoothData(reconPlotData, state.smoothing);
    }

    // 6. Draw
    drawSignal(elements.ctx.signal, timeData, false);
    drawSpectrum(elements.ctx.freq, freqs, N);
    
    drawSignal(elements.ctx.recon, reconPlotData, true);
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

    // Filter Overlay
    const centerX = (state.filterCenter / maxFreq) * w;
    const widthX = (state.filterWidth / maxFreq) * w;
    
    // Draw Window
    ctx.fillStyle = 'rgba(20, 132, 230, 0.1)';
    ctx.fillRect(centerX - widthX/2, 0, widthX, h); // No translate for rect fill usually better
    
    ctx.translate(0.5, 0.5);
    ctx.strokeStyle = 'rgba(20, 132, 230, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(centerX - widthX/2, 0, widthX, h);
    
    // Draw Magnitude Bars
    ctx.beginPath();
    const barWidth = w / (N/2);
    
    // Scale Magnitude Logic:
    // Max theoretical magnitude for sine of amplitude A is (A * N) / 2.
    // We visualize sum of components. Max amp sum approx 5? 
    // Normalized Mag = mag / (N/2). This gives back the amplitude A.
    // If we want Amplitude A=1 to be substantial height, say 1/5th of screen half?
    // Let's say max Axis Amplitude is 5.
    // screen H corresponds to 2 * MaxAxisAmp? No, FFT is usually 0 to Max.
    // Let's scale so that Amplitude = 2.0 takes up 80% height.
    
    const normalization = (N/2);
    const maxVisibleAmp = 2.5; // If amp is 2.5, it hits top
    
    for (let i = 0; i < plotData.length; i++) {
        const d = plotData[i];
        const x = (d.f / maxFreq) * w;
        
        // Normalized Amplitude
        const amp = d.mag / normalization;
        
        // Map 0..maxVisibleAmp to 0..h
        const barH = (amp / maxVisibleAmp) * h;
        
        const inWindow = d.f >= (state.filterCenter - state.filterWidth/2) && 
                         d.f <= (state.filterCenter + state.filterWidth/2);
        
        ctx.fillStyle = inWindow ? '#1484e6' : '#bbb'; 
        
        // Draw bar 
        // Use fillRect generally, translate doesn't affect it much unless stroked
        ctx.fillRect(x, h - barH, Math.max(1, barWidth - 0.5), barH);
    }
    
    ctx.translate(-0.5, -0.5);
}

// Start
init();
