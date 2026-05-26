/**
 * MotionScope 3D - Master UI Orchestration and State Machine
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Application State ---
    let bvhData = null;
    let kinematics = null;
    let currentFrame = 0;
    let isPlaying = false;
    let playbackSpeed = 1.0;
    
    // Playback timing variables
    let lastTimestamp = 0;
    let accumulatedTime = 0.0;
    
    // Active selections
    let selectedJoint = "";

    // --- Biomechanical Graphs State ---
    let analyticsChart = null;
    let graphSelectedJoint = "";
    
    // --- Initialize 3D Engine ---
    const motionScene = new MotionScene3D('threejs-canvas');
    
    // --- UI Element Selectors ---
    const fileInput = document.getElementById('bvh-file-input');
    const exportBtn = document.getElementById('export-data-btn');
    const dropOverlay = document.getElementById('drop-overlay');
    const viewportPanel = document.getElementById('viewport-panel');
    const fileStatus = document.getElementById('file-status');
    const renderFps = document.getElementById('render-fps');

    // Biomechanical Graphs Selectors
    const graphsToggleBtn = document.getElementById('graphs-toggle-btn');
    const graphsModal = document.getElementById('graphs-modal');
    const closeGraphsBtn = document.getElementById('close-graphs-btn');
    const graphJointSelect = document.getElementById('graph-joint-select');
    const chartCanvas = document.getElementById('analytics-chart');
    
    // Viewport Overlay Controls
    const resetCamBtn = document.getElementById('reset-cam-btn');
    const gridToggleBtn = document.getElementById('grid-toggle-btn');
    const skeletonModeBtn = document.getElementById('skeleton-mode-btn');
    const trajectoryToggleBtn = document.getElementById('trajectory-toggle-btn');
    
    // Playback Controls
    const playPauseBtn = document.getElementById('play-pause-btn');
    const playIcon = document.getElementById('play-icon');
    const prevFrameBtn = document.getElementById('prev-frame-btn');
    const nextFrameBtn = document.getElementById('next-frame-btn');
    const timelineSlider = document.getElementById('timeline-slider');
    const sliderProgress = document.getElementById('slider-progress');
    const frameCounter = document.getElementById('frame-counter');
    const timeCurrent = document.getElementById('time-current');
    const timeTotal = document.getElementById('time-total');
    const playbackSpeedSelect = document.getElementById('playback-speed');
    
    // Sidebar telemetries
    const jointSelect = document.getElementById('joint-select');
    const jointHierarchyList = document.getElementById('joint-hierarchy-list');
    const romList = document.getElementById('rom-list');
    
    // Telemetry numerical outputs
    const posXVal = document.getElementById('pos-x');
    const posYVal = document.getElementById('pos-y');
    const posZVal = document.getElementById('pos-z');
    const velXVal = document.getElementById('vel-x');
    const velYVal = document.getElementById('vel-y');
    const velZVal = document.getElementById('vel-z');
    const accXVal = document.getElementById('acc-x');
    const accYVal = document.getElementById('acc-y');
    const accZVal = document.getElementById('acc-z');

    // Anatomical values
    const angleCards = document.querySelectorAll('.angle-card');
    const angleBadgeRightElbow = document.getElementById('angle-r-elbow');
    const angleBadgeLeftElbow = document.getElementById('angle-l-elbow');
    const angleBadgeRightKnee = document.getElementById('angle-r-knee');
    const angleBadgeLeftKnee = document.getElementById('angle-l-knee');
    const angleBadgeRightShoulderAbd = document.getElementById('angle-r-shoulder-abd');
    const angleBadgeLeftShoulderAbd = document.getElementById('angle-l-shoulder-abd');
    const angleBadgeRightHipFlex = document.getElementById('angle-r-hip-flex');
    const angleBadgeLeftHipFlex = document.getElementById('angle-l-hip-flex');

    const barRightElbow = document.getElementById('bar-r-elbow');
    const barLeftElbow = document.getElementById('bar-l-elbow');
    const barRightKnee = document.getElementById('bar-r-knee');
    const barLeftKnee = document.getElementById('bar-l-knee');
    const barRightShoulderAbd = document.getElementById('bar-r-shoulder-abd');
    const barLeftShoulderAbd = document.getElementById('bar-l-shoulder-abd');
    const barRightHipFlex = document.getElementById('bar-r-hip-flex');
    const barLeftHipFlex = document.getElementById('bar-l-hip-flex');
    
    // Toast Notification elements
    const toast = document.getElementById('notification-toast');
    const toastMsg = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');

    // --- Toast Notification Controller ---
    function showToast(message, type = 'info') {
        toastMsg.textContent = message;
        
        // Icon classes mapping
        toastIcon.className = 'fa-solid';
        if (type === 'success') {
            toastIcon.classList.add('fa-circle-check', 'text-neon');
            toast.style.borderColor = 'var(--color-neon-teal)';
        } else if (type === 'error') {
            toastIcon.classList.add('fa-triangle-exclamation', 'text-danger');
            toast.style.borderColor = 'var(--color-neon-red)';
        } else {
            toastIcon.classList.add('fa-circle-info', 'text-primary');
            toast.style.borderColor = 'var(--color-neon-purple)';
        }

        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    }

    // --- File Drag and Drop Listeners ---
    ['dragenter', 'dragover'].forEach(eventName => {
        viewportPanel.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropOverlay.classList.add('drop-overlay-active');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        viewportPanel.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Don't deactivate uploader overlay if there's no data loaded yet
            if (bvhData) {
                dropOverlay.classList.remove('drop-overlay-active');
            }
        }, false);
    });

    viewportPanel.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        if (file) {
            handleUploadedFile(file);
        }
    }, false);

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleUploadedFile(file);
        }
    });

    /**
     * Core handler for uploaded BVH files
     */
    function handleUploadedFile(file) {
        if (!file.name.toLowerCase().endsWith('.bvh')) {
            showToast("Invalid file format. Please upload a .bvh file", "error");
            return;
        }

        showToast(`Loading: ${file.name}...`);
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const parsed = parseBVH(text);
            
            if (parsed) {
                bvhData = parsed;
                kinematics = solveKinematics(bvhData);
                
                // Reset playback states
                currentFrame = 0;
                isPlaying = false;
                accumulatedTime = 0.0;
                
                // Hide uploader overlay
                dropOverlay.classList.remove('drop-overlay-active');
                
                // Initialize UI layouts
                initUIForMotionData();
                showToast(`Data Loaded Successfully`, "success");
            } else {
                showToast("Failed to parse BVH file", "error");
            }
        };
        reader.onerror = () => {
            showToast("Failed to read local file", "error");
        };
        reader.readAsText(file);
    }

    /**
     * Initializes joint dropdown selections and hierarchy structures
     */
    function initUIForMotionData() {
        if (!bvhData || !kinematics) return;

        // 1. Enable exports
        exportBtn.classList.remove('disabled');
        exportBtn.disabled = false;
        
        // 2. Set file status text
        fileStatus.innerHTML = `<span class="status-dot active"></span> TELEMETRY ACTIVE: ${bvhData.frameCount} FRAMES`;
        
        // 3. Populate Timeline Range bounds
        timelineSlider.max = bvhData.frameCount - 1;
        timelineSlider.value = 0;
        sliderProgress.style.width = '0%';
        timeTotal.textContent = formatTime(bvhData.totalDuration);
        
        // 4. Build 3D Skeleton in Three.js Scene
        motionScene.buildSkeleton(bvhData);
        
        // 5. Populate Telemetry Joint dropdown selections
        jointSelect.innerHTML = '<option value="">Select Joint...</option>';
        bvhData.jointOrder.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            jointSelect.appendChild(opt);
        });

        // 6. Select root node as default highlighted element
        selectedJoint = bvhData.rootJoint.name;
        jointSelect.value = selectedJoint;

        // 7. Rebuild Joint Hierarchy telemetry list
        rebuildHierarchyTreeList();
        
        // 8. Rebuild Biomechanical ROM list
        rebuildRomList();
        
        // 9. Update UI frame telemetry to frame 0
        updateUIForFrame(0);

        // 10. Initialize Sensor Graphs dropdown
        initGraphsUI();
    }

    /**
     * Populates graphs sensor dropdown selections
     */
    function initGraphsUI() {
        if (!bvhData || !graphJointSelect) return;
        
        graphJointSelect.innerHTML = '<option value="">Select Sensor...</option>';
        bvhData.jointOrder.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            graphJointSelect.appendChild(opt);
        });
        
        graphSelectedJoint = selectedJoint;
        graphJointSelect.value = graphSelectedJoint;
        
        if (analyticsChart) {
            analyticsChart.destroy();
            analyticsChart = null;
        }
    }

    /**
     * Solves and updates Chart.js instance with dual velocity/acceleration magnitude curves
     */
    function updateGraphsChart() {
        if (!bvhData || !kinematics || !chartCanvas) return;
        
        const jointName = graphJointSelect.value || selectedJoint;
        if (!jointName) return;
        
        const labels = [];
        const velocities = [];
        const accelerations = [];
        
        for (let f = 0; f < bvhData.frameCount; f++) {
            // Label represented as time in seconds
            labels.push((f * bvhData.frameTime).toFixed(2));
            
            // Linear velocity magnitude scaled from cm/s to m/s
            const velVec = kinematics.velocities[f][jointName];
            const velMag = velVec ? velVec.length() * 0.01 : 0.0;
            velocities.push(velMag);
            
            // Linear acceleration magnitude scaled from cm/s² to m/s²
            const accVec = kinematics.accelerations[f][jointName];
            const accMag = accVec ? accVec.length() * 0.01 : 0.0;
            accelerations.push(accMag);
        }
        
        if (analyticsChart) {
            analyticsChart.destroy();
        }
        
        // Custom vertical line plugin for real-time cursor syncing
        const verticalLinePlugin = {
            id: 'verticalLine',
            afterDraw: (chart) => {
                const xAxis = chart.scales.x;
                const yAxis = chart.scales.y;
                if (xAxis && yAxis && currentFrame !== undefined && currentFrame >= 0 && currentFrame < bvhData.frameCount) {
                    const x = xAxis.getPixelForValue(currentFrame);
                    const ctx = chart.ctx;
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(x, yAxis.top);
                    ctx.lineTo(x, yAxis.bottom);
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = 'rgba(102, 252, 241, 0.85)'; // Neon teal cursor
                    ctx.shadowColor = '#66fcf1';
                    ctx.shadowBlur = 8;
                    ctx.stroke();
                    ctx.restore();
                }
            }
        };

        const ctx = chartCanvas.getContext('2d');
        analyticsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Velocity (m/s)',
                        data: velocities,
                        borderColor: '#ef4444', // Neon Red
                        backgroundColor: 'rgba(239, 68, 68, 0.05)',
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        tension: 0.15,
                        yAxisID: 'yVel'
                    },
                    {
                        label: 'Acceleration (m/s²)',
                        data: accelerations,
                        borderColor: '#a855f7', // Neon Purple
                        backgroundColor: 'rgba(168, 85, 247, 0.05)',
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        tension: 0.15,
                        yAxisID: 'yAcc'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: '#9ca3af',
                            font: { family: 'Orbitron', size: 9 }
                        }
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: 'rgba(10, 12, 16, 0.95)',
                        titleColor: '#66fcf1',
                        titleFont: { family: 'Orbitron' },
                        bodyFont: { family: 'Inter' },
                        borderColor: 'rgba(102, 252, 241, 0.2)',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'TIME (SECONDS)',
                            color: '#9ca3af',
                            font: { family: 'Orbitron', size: 9, weight: 'bold' }
                        },
                        ticks: {
                            color: '#9ca3af',
                            font: { family: 'JetBrains Mono', size: 8 },
                            maxTicksLimit: 8
                        },
                        grid: { color: 'rgba(255, 255, 255, 0.03)' }
                    },
                    yVel: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'VELOCITY (M/S)',
                            color: '#ef4444',
                            font: { family: 'Orbitron', size: 9, weight: 'bold' }
                        },
                        ticks: {
                            color: '#ef4444',
                            font: { family: 'JetBrains Mono', size: 8 }
                        },
                        grid: { color: 'rgba(255, 255, 255, 0.03)' }
                    },
                    yAcc: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'ACCELERATION (M/S²)',
                            color: '#a855f7',
                            font: { family: 'Orbitron', size: 9, weight: 'bold' }
                        },
                        ticks: {
                            color: '#a855f7',
                            font: { family: 'JetBrains Mono', size: 8 }
                        },
                        grid: { drawOnChartArea: false }
                    }
                }
            },
            plugins: [verticalLinePlugin]
        });
    }

    /**
     * Rebuilds scrollable list representing joint tree structures
     */
    function rebuildHierarchyTreeList() {
        jointHierarchyList.innerHTML = '';
        
        bvhData.jointOrder.forEach(name => {
            const joint = bvhData.joints[name];
            const div = document.createElement('div');
            
            div.className = `joint-item joint-depth-${Math.min(joint.depth, 15)}`;
            div.innerHTML = `
                <span><i class="fa-solid fa-bone text-secondary" style="font-size:8px; margin-right:6px;"></i>${name}</span>
                <span class="depth-indicator text-secondary" style="font-size:7px;">D${joint.depth}</span>
            `;
            div.id = `hierarchy-joint-${name}`;
            
            // Set double click to trace path, single click to inspect values
            div.addEventListener('click', () => {
                selectJointTelemetry(name);
            });
            
            jointHierarchyList.appendChild(div);
        });

        // Add highlight class to active item
        highlightHierarchyItem(selectedJoint);
    }

    function selectJointTelemetry(name) {
        selectedJoint = name;
        jointSelect.value = name;
        highlightHierarchyItem(name);
        updateUIForFrame(currentFrame);
        showToast(`Telemetry locked: ${name}`);
    }

    function highlightHierarchyItem(name) {
        document.querySelectorAll('.joint-item').forEach(el => el.classList.remove('selected'));
        const activeItem = document.getElementById(`hierarchy-joint-${name}`);
        if (activeItem) {
            activeItem.classList.add('selected');
            activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    /**
     * Populates biomechanical Range of Motion telemetry
     */
    function rebuildRomList() {
        romList.innerHTML = '';
        const keys = Object.keys(kinematics.rom);
        
        if (keys.length === 0) {
            romList.innerHTML = '<div class="empty-list-placeholder">No ROM calculated yet</div>';
            return;
        }

        keys.forEach(key => {
            const min = kinematics.rom[key][0];
            const max = kinematics.rom[key][1];
            const range = max - min;
            
            // Nice human readable label
            const displayTitle = key.replace('_', ' ').replace('Flexion', 'Flex');

            const div = document.createElement('div');
            div.className = 'rom-item';
            div.innerHTML = `
                <div class="rom-title">${displayTitle}</div>
                <div class="rom-stats-row">
                    <div class="rom-stat-box"><span class="rom-stat-lbl">MIN</span><span class="rom-stat-val text-neon">${min.toFixed(1)}°</span></div>
                    <div class="rom-stat-box"><span class="rom-stat-lbl">MAX</span><span class="rom-stat-val text-purple">${max.toFixed(1)}°</span></div>
                    <div class="rom-stat-box" style="border: 1px solid var(--border-glow-purple);"><span class="rom-stat-lbl" style="color:var(--color-neon-purple)">SWEEP</span><span class="rom-stat-val" style="color:var(--color-neon-purple); font-weight:700;">${range.toFixed(1)}°</span></div>
                </div>
            `;
            
            romList.appendChild(div);
        });

        document.getElementById('angle-active-count').textContent = `${keys.length} ACTIVE`;
    }

    /**
     * Updates all UI widgets to display parameters for a specific frame index
     */
    function updateUIForFrame(frameIndex) {
        if (!bvhData || !kinematics) return;

        // 1. Update Timeline widgets
        timelineSlider.value = frameIndex;
        const progress = (frameIndex / (bvhData.frameCount - 1)) * 100;
        sliderProgress.style.width = `${progress}%`;
        
        frameCounter.textContent = `FRAME ${frameIndex} / ${bvhData.frameCount - 1}`;
        
        const curSeconds = frameIndex * bvhData.frameTime;
        timeCurrent.textContent = formatTime(curSeconds);

        // 2. Render 3D Frame state
        const framePositions = kinematics.positions[frameIndex];
        motionScene.updateFrame(framePositions, bvhData, frameIndex);

        // 3. Render 3D Joint Trajectories if enabled
        motionScene.updateTrajectories(kinematics.positions, frameIndex);

        // 4. Update Left Telemetry Panel (Position, Velocity, Acceleration)
        if (selectedJoint && framePositions[selectedJoint]) {
            // Conversions: Divided by 100 to convert cm to meters
            const pos = framePositions[selectedJoint].clone().multiplyScalar(0.01);
            const vel = kinematics.velocities[frameIndex][selectedJoint].clone().multiplyScalar(0.01);
            const acc = kinematics.accelerations[frameIndex][selectedJoint].clone().multiplyScalar(0.01);

            posXVal.textContent = pos.x.toFixed(4);
            posYVal.textContent = pos.y.toFixed(4);
            posZVal.textContent = pos.z.toFixed(4);

            velXVal.textContent = vel.x.toFixed(4);
            velYVal.textContent = vel.y.toFixed(4);
            velZVal.textContent = vel.z.toFixed(4);

            accXVal.textContent = acc.x.toFixed(4);
            accYVal.textContent = acc.y.toFixed(4);
            accZVal.textContent = acc.z.toFixed(4);
        }

        // 5. Update Right Biomechanical Telemetry (Anatomical Angles)
        const frameAngles = kinematics.anatomicalAngles[frameIndex];
        if (frameAngles) {
            updateAnatomicalBadge(frameAngles['RightElbow_Flexion'], angleBadgeRightElbow, barRightElbow, 180);
            updateAnatomicalBadge(frameAngles['LeftElbow_Flexion'], angleBadgeLeftElbow, barLeftElbow, 180);
            updateAnatomicalBadge(frameAngles['RightKnee_Flexion'], angleBadgeRightKnee, barRightKnee, 180);
            updateAnatomicalBadge(frameAngles['LeftKnee_Flexion'], angleBadgeLeftKnee, barLeftKnee, 180);
            
            updateAnatomicalBadge(frameAngles['RightShoulder_Abduction'], angleBadgeRightShoulderAbd, barRightShoulderAbd, 180);
            updateAnatomicalBadge(frameAngles['LeftShoulder_Abduction'], angleBadgeLeftShoulderAbd, barLeftShoulderAbd, 180);
            updateAnatomicalBadge(frameAngles['RightHip_Flexion'], angleBadgeRightHipFlex, barRightHipFlex, 180);
            updateAnatomicalBadge(frameAngles['LeftHip_Flexion'], angleBadgeLeftHipFlex, barLeftHipFlex, 180);
        }

        // 6. Redraw vertical line on graphs canvas if active
        if (analyticsChart) {
            analyticsChart.update('none');
        }
    }

    function updateAnatomicalBadge(val, badgeEl, fillEl, maxAngleVal = 180) {
        if (val !== undefined && val !== null && badgeEl && fillEl) {
            badgeEl.textContent = `${val.toFixed(1)}°`;
            
            // Normalize angle to % width
            const absVal = Math.min(Math.abs(val), maxAngleVal);
            const percentage = (absVal / maxAngleVal) * 100;
            fillEl.style.width = `${percentage}%`;
        } else if (badgeEl && fillEl) {
            badgeEl.textContent = '--';
            fillEl.style.width = '0%';
        }
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }

    // --- Interactive Playback Control Event Listeners ---
    
    function togglePlay() {
        if (!bvhData) return;
        isPlaying = !isPlaying;
        if (isPlaying) {
            playIcon.className = 'fa-solid fa-pause';
            showToast("Playback running");
            lastTimestamp = performance.now();
        } else {
            playIcon.className = 'fa-solid fa-play';
            showToast("Playback paused");
        }
    }

    playPauseBtn.addEventListener('click', togglePlay);

    prevFrameBtn.addEventListener('click', () => {
        if (!bvhData) return;
        isPlaying = false;
        playIcon.className = 'fa-solid fa-play';
        currentFrame = (currentFrame - 1 + bvhData.frameCount) % bvhData.frameCount;
        updateUIForFrame(currentFrame);
    });

    nextFrameBtn.addEventListener('click', () => {
        if (!bvhData) return;
        isPlaying = false;
        playIcon.className = 'fa-solid fa-play';
        currentFrame = (currentFrame + 1) % bvhData.frameCount;
        updateUIForFrame(currentFrame);
    });

    timelineSlider.addEventListener('input', (e) => {
        if (!bvhData) return;
        isPlaying = false;
        playIcon.className = 'fa-solid fa-play';
        currentFrame = parseInt(e.target.value);
        updateUIForFrame(currentFrame);
    });

    playbackSpeedSelect.addEventListener('change', (e) => {
        playbackSpeed = parseFloat(e.target.value);
        showToast(`Playback speed: ${playbackSpeed}x`);
    });

    jointSelect.addEventListener('change', (e) => {
        if (e.target.value) {
            selectJointTelemetry(e.target.value);
        }
    });

    // --- Viewport Overlay Event Listeners ---
    
    resetCamBtn.addEventListener('click', () => {
        if (bvhData) {
            motionScene.resetCamera(bvhData);
            showToast("Camera viewport reset");
        }
    });

    gridToggleBtn.addEventListener('click', () => {
        const visible = !motionScene.showGrid;
        motionScene.setGridVisibility(visible);
        gridToggleBtn.classList.toggle('active', visible);
        showToast(`Grid: ${visible ? 'VISIBLE' : 'HIDDEN'}`);
    });

    skeletonModeBtn.addEventListener('click', () => {
        const nextMode = motionScene.renderMode === 'cyber' ? 'solid' : 'cyber';
        motionScene.setRenderMode(nextMode);
        skeletonModeBtn.classList.toggle('active', nextMode === 'solid');
        showToast(`Viewport mode: ${nextMode.toUpperCase()}`);
    });

    trajectoryToggleBtn.addEventListener('click', () => {
        if (!bvhData) return;
        
        const active = !motionScene.showTrajectories;
        motionScene.showTrajectories = active;
        trajectoryToggleBtn.classList.toggle('active', active);
        
        if (active) {
            // Add currently selected joint to tracer list
            if (selectedJoint) {
                motionScene.toggleJointTrace(selectedJoint, true);
                
                // Highlight item inside list
                const listEl = document.getElementById(`hierarchy-joint-${selectedJoint}`);
                if (listEl) listEl.classList.add('has-trace');
            }
            showToast("Tracers ACTIVE for highlighted joint", "success");
        } else {
            // Restore visual traces
            motionScene.clearTrajectories();
            document.querySelectorAll('.joint-item').forEach(el => el.classList.remove('has-trace'));
            showToast("Tracers CLEARED");
        }
        
        updateUIForFrame(currentFrame);
    });

    // Toggle trajectory tracing for a specific joint on double-click
    // Note: Event delegation on the parent container
    jointHierarchyList.addEventListener('dblclick', (e) => {
        if (!bvhData) return;

        const item = e.target.closest('.joint-item');
        if (item) {
            const jointName = item.id.replace('hierarchy-joint-', '');
            const hasTrace = motionScene.tracedJoints.has(jointName);
            
            // Activate tracers if general tracing is currently off
            if (!motionScene.showTrajectories) {
                motionScene.showTrajectories = true;
                trajectoryToggleBtn.classList.add('active');
            }

            motionScene.toggleJointTrace(jointName, !hasTrace);
            item.classList.toggle('has-trace', !hasTrace);
            
            showToast(`Tracer trace: ${jointName} -> ${!hasTrace ? 'ACTIVE' : 'INACTIVE'}`);
            updateUIForFrame(currentFrame);
        }
    });

    // Click on active biomech cards locks viewport target or telemetry to that sub-component
    angleCards.forEach(card => {
        card.addEventListener('click', () => {
            if (!bvhData) return;
            const targetName = card.dataset.angle;
            
            // Map card targets back to actual joints
            const jointNameMap = {
                'RightElbow': 'RightForeArm',
                'LeftElbow': 'LeftForeArm',
                'RightKnee': 'RightLeg',
                'LeftKnee': 'LeftLeg',
                'RightShoulder_Abd': 'RightArm',
                'LeftShoulder_Abd': 'LeftArm',
                'RightHip_Flex': 'RightUpLeg',
                'LeftHip_Flex': 'LeftUpLeg'
            };
            
            const resolvedNode = resolveJointName(bvhData.joints, jointNameMap[targetName]);
            if (resolvedNode) {
                selectJointTelemetry(resolvedNode);
            }
        });
    });

    // --- Sensor Graphs Event Listeners ---
    graphsToggleBtn.addEventListener('click', () => {
        if (!bvhData) {
            showToast("Please load a BVH file first", "error");
            return;
        }
        
        const active = graphsModal.classList.toggle('active');
        graphsToggleBtn.classList.toggle('active', active);
        
        if (active) {
            updateGraphsChart();
            showToast("Graphs panel opened");
        } else {
            showToast("Graphs panel closed");
        }
    });

    closeGraphsBtn.addEventListener('click', () => {
        graphsModal.classList.remove('active');
        graphsToggleBtn.classList.remove('active');
        showToast("Graphs panel closed");
    });

    graphJointSelect.addEventListener('change', () => {
        if (bvhData) {
            updateGraphsChart();
            if (graphJointSelect.value) {
                // Auto-sync left telemetry sidebar for outstanding UX
                selectJointTelemetry(graphJointSelect.value);
            }
        }
    });

    chartCanvas.onclick = (evt) => {
        if (!analyticsChart || !bvhData) return;
        
        const points = analyticsChart.getElementsAtEventForMode(evt, 'index', { intersect: false }, true);
        if (points.length > 0) {
            const clickedFrameIndex = points[0].index;
            isPlaying = false;
            playIcon.className = 'fa-solid fa-play';
            currentFrame = clickedFrameIndex;
            updateUIForFrame(currentFrame);
            showToast(`Scrubbed to frame: ${clickedFrameIndex}`);
        }
    };

    // --- Master Render & Playback Loop ---
    function masterPlaybackFrame(timestamp) {
        if (isPlaying && bvhData && kinematics) {
            if (!lastTimestamp) lastTimestamp = timestamp;
            
            const elapsed = (timestamp - lastTimestamp) / 1000.0; // Seconds elapsed
            const frameDuration = bvhData.frameTime / playbackSpeed;
            
            accumulatedTime += elapsed;
            if (accumulatedTime >= frameDuration) {
                const step = Math.floor(accumulatedTime / frameDuration);
                currentFrame = (currentFrame + step) % bvhData.frameCount;
                accumulatedTime = accumulatedTime % frameDuration;
                
                updateUIForFrame(currentFrame);
            }
        }
        
        lastTimestamp = timestamp;

        // Render 3D viewport canvas (camera updates, orbit limits)
        motionScene.render();

        requestAnimationFrame(masterPlaybackFrame);
    }

    // Launch master rendering
    requestAnimationFrame(masterPlaybackFrame);

    // --- Dispatch Custom FPS Events ---
    window.addEventListener('viewport-fps', (e) => {
        renderFps.innerHTML = `<i class="fa-solid fa-gauge-high"></i> VIEWPORT: ${e.detail.fps} FPS`;
    });

    // --- Keyboard Shortcut Event Listeners ---
    window.addEventListener('keydown', (e) => {
        if (!bvhData) return;
        
        if (e.code === 'Space') {
            e.preventDefault();
            togglePlay();
        } else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            isPlaying = false;
            playIcon.className = 'fa-solid fa-play';
            currentFrame = (currentFrame - 1 + bvhData.frameCount) % bvhData.frameCount;
            updateUIForFrame(currentFrame);
        } else if (e.code === 'ArrowRight') {
            e.preventDefault();
            isPlaying = false;
            playIcon.className = 'fa-solid fa-play';
            currentFrame = (currentFrame + 1) % bvhData.frameCount;
            updateUIForFrame(currentFrame);
        } else if (e.code === 'KeyF') {
            e.preventDefault();
            motionScene.resetCamera(bvhData);
        }
    });

    // --- CSV Telemetry Data Exporter ---
    exportBtn.addEventListener('click', () => {
        if (!bvhData || !kinematics) return;

        showToast("Generating CSV report...");
        
        try {
            const rows = [];
            
            // Build columns header
            const header = ['Frame'];
            bvhData.jointOrder.forEach(name => {
                header.push(`${name}_pos_X`, `${name}_pos_Y`, `${name}_pos_Z`);
                header.push(`${name}_vel_X`, `${name}_vel_Y`, `${name}_vel_Z`);
                header.push(`${name}_accel_X`, `${name}_accel_Y`, `${name}_accel_Z`);
            });

            // Find all anatomical angle keys
            const angleKeys = Object.keys(kinematics.rom);
            angleKeys.forEach(key => {
                header.push(key);
            });

            rows.push(header.join(','));

            // Compile rows per frame
            for (let f = 0; f < bvhData.frameCount; f++) {
                const row = [f];
                
                bvhData.jointOrder.forEach(name => {
                    // Units: Divided by 100 to convert cm to meters exactly as in python CSV export!
                    const pos = kinematics.positions[f][name].clone().multiplyScalar(0.01);
                    const vel = kinematics.velocities[f][name].clone().multiplyScalar(0.01);
                    const acc = kinematics.accelerations[f][name].clone().multiplyScalar(0.01);

                    row.push(pos.x.toFixed(6), pos.y.toFixed(6), pos.z.toFixed(6));
                    row.push(vel.x.toFixed(6), vel.y.toFixed(6), vel.z.toFixed(6));
                    row.push(acc.x.toFixed(6), acc.y.toFixed(6), acc.z.toFixed(6));
                });

                const angles = kinematics.anatomicalAngles[f];
                angleKeys.forEach(key => {
                    const angleVal = angles[key];
                    row.push(angleVal !== undefined ? angleVal.toFixed(4) : '');
                });

                rows.push(row.join(','));
            }

            // Create download anchor link and trigger download click
            const csvContent = "data:text/csv;charset=utf-8," + rows.join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            
            // Clean file name
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `mocap_analysis_report_${timestamp}.csv`);
            document.body.appendChild(link);
            
            link.click();
            document.body.removeChild(link);
            
            showToast("CSV report downloaded", "success");
        } catch (err) {
            console.error("Export Error:", err);
            showToast("Failed to generate CSV report", "error");
        }
    });
});
