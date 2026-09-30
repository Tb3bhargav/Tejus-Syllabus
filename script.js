/**
 * Syllabus to Success
 * Main Application Logic
 */

// Application State
const AppState = {
    syllabus: [], // Array of { topic: string, tasks: [{text: string, done: boolean}] }
    examDate: null,
    startDate: new Date().toISOString(), // Track when they started for the graph
    history: [] // [{ date: string, completedCount: number }]
};

// --- Modules ---

// 1. Storage Manager
const Storage = {
    save: () => {
        localStorage.setItem('syllabus_app_state', JSON.stringify(AppState));
    },
    load: () => {
        const data = localStorage.getItem('syllabus_app_state');
        if (data) {
            const parsed = JSON.parse(data);
            AppState.syllabus = parsed.syllabus || [];
            AppState.examDate = parsed.examDate || null;
            AppState.startDate = parsed.startDate || new Date().toISOString();
            AppState.history = parsed.history || [];
            return true;
        }
        return false;
    },
    clear: () => {
        localStorage.removeItem('syllabus_app_state');
        location.reload();
    }
};

// 2. Parser Logic
const Parser = {
    // Heuristic:
    // 1. Lines ending with ':' are usually topics.
    // 2. Lines in ALL CAPS are usually topics (if shortness < 50 chars).
    // 3. Lines starting with 'Unit', 'Chapter', 'Module' are topics.
    // 4. Everything else is a task.
    parseText: (text) => {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const syllabus = [];
        let currentTopic = { topic: "General Tasks", tasks: [] };

        // Regex patterns
        const topicPatterns = [
            /^Unit\s+\d+/i,
            /^Module\s+\d+/i,
            /^Chapter\s+\d+/i,
            /^Week\s+\d+/i,
            /:$/ // Ends with colon
        ];

        // Noise patterns to ignore
        const noisePatterns = [
            /^\d+$/,           // Just a number
            /^\d+\.$/,         // Number with dot
            /^Page\s+\d+/i,    // Page numbers
            /^Total\s+Marks/i, // Metadata
            /^Exam\s+Time/i    // Metadata
        ];

        lines.forEach(line => {
            // Check for noise
            if (noisePatterns.some(p => p.test(line))) return;

            let isTopic = false;

            // Check heuristic 1: Defined patterns
            if (topicPatterns.some(p => p.test(line))) isTopic = true;
            // Check heuristic 2: All Caps short line, but filter out likely non-topics or exam headers
            // We want to avoid things like "SEMESTER IV EXAM" becoming a topic unless it really looks like one.
            // Stricter check: Must have at least one letter, be < 50 chars, all caps, and NOT contain "UNIVERSITY" or "EXAMINATION" if it's the very first line (hard to detect first line here, but general heuristic).
            else if (line === line.toUpperCase() && line.length < 60 && /[A-Z]/.test(line)) {
                if (!line.includes("UNIVERSITY") && !line.includes("SESSION") && !line.includes("TIME:")) {
                    isTopic = true;
                }
            }

            if (isTopic) {
                if (currentTopic.tasks.length > 0) {
                    syllabus.push(currentTopic);
                }
                // Clean the topic name (remove trailing :)
                currentTopic = { topic: line.replace(/:$/, ''), tasks: [] };
            } else {
                // It's a task. Clean bullets.
                // Remove leading numbers like "1. ", "2. ", "a. ", "• "
                const cleanTask = line.replace(/^[\-\*\•\d\.\)]+\s+/, '');
                // Filter out very short garbage text
                if (cleanTask.length > 2) {
                    currentTopic.tasks.push({ text: cleanTask, done: false });
                }
            }
        });

        if (currentTopic.tasks.length > 0 || currentTopic.topic !== "General Tasks") {
            syllabus.push(currentTopic);
        }

        return syllabus;
    },

    readPDF: async (file) => {
        if (typeof pdfjsLib === 'undefined') throw new Error("PDF library (pdf.js) failed to load. Check internet and reload.");
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // Reconstruct lines based on Y-coordinate
            let lastY = -1;
            let pageText = "";

            // Items are usually sorted by reading order, but Y checks ensure we handle column jumps or newlines correctly.
            // Note: PDF coordinates: (0,0) is usually bottom-left. Higher Y = higher up.
            // We iterate items. If Y drops significantly, it's a new line.

            textContent.items.forEach(item => {
                const itemY = item.transform[5];
                const itemText = item.str;

                // If it's the first item
                if (lastY === -1) {
                    pageText += itemText;
                } else {
                    // Check difference in Y. If diff is large (> height or fixed threshold), add newline
                    // Typical font height is around 10-14.
                    if (Math.abs(itemY - lastY) > 6) {
                        pageText += '\n' + itemText;
                    } else {
                        // Same line, add space if needed (sometimes PDFs have spaces, sometimes not)
                        // Heuristic: Add space if previous char wasn't space
                        if (!pageText.endsWith(' ') && !itemText.startsWith(' ')) {
                            pageText += ' ';
                        }
                        pageText += itemText;
                    }
                }
                lastY = itemY;
            });

            fullText += pageText + '\n';
        }
        return fullText;
    }
};

// 3. UI Manager
const UI = {
    elements: {
        dropzone: document.getElementById('dropzone'),
        fileInput: document.getElementById('file-input'),
        checklistSection: document.getElementById('checklist-section'),
        checklistContainer: document.getElementById('checklist-container'),
        overallProgress: document.getElementById('overall-progress-bar'),
        overallText: document.getElementById('overall-progress-text'),
        examDateInput: document.getElementById('exam-date'),
        dailyGoal: document.getElementById('daily-tasks-count'),
        chartCanvas: document.getElementById('progressChart'),
        resetBtn: document.getElementById('reset-btn'),
        manualInputSection: document.getElementById('manual-input-section'),
        toastContainer: document.getElementById('toast-container')
    },

    init: () => {
        // Event Listeners
        UI.elements.dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            UI.elements.dropzone.classList.add('border-accent');
        });
        UI.elements.dropzone.addEventListener('dragleave', (e) => {
            UI.elements.dropzone.classList.remove('border-accent');
        });
        UI.elements.dropzone.addEventListener('drop', UI.handleDrop);
        UI.elements.fileInput.addEventListener('change', UI.handleFileSelect);

        UI.elements.examDateInput.addEventListener('change', (e) => {
            AppState.examDate = e.target.value;
            Storage.save();
            Timetable.update();
            ChartManager.update();
        });

        UI.elements.resetBtn.addEventListener('click', () => {
            if (confirm("Are you sure you want to reset all progress?")) Storage.clear();
        });

        // Manual Input Toggles
        // Manual Input Toggles - Removed (Always visible now)
        // document.getElementById('paste-mode-btn').addEventListener... 
        // document.getElementById('back-to-drop-btn').addEventListener...

        document.getElementById('parse-text-btn').addEventListener('click', () => {
            const text = document.getElementById('manual-text').value;
            if (!text.trim()) {
                alert("Please enter some text.");
                return;
            }
            const data = Parser.parseText(text);
            if (data.length === 0) {
                alert("No topics found. Try checking the format.");
                return;
            }
            AppState.syllabus = data;
            Storage.save();
            UI.renderSyllabus();
            UI.updateStats();
        });

        // Demo Button
        document.getElementById('demo-btn').addEventListener('click', () => {
            const demoText = `
Physics Syllabus:
Year 2024
Time: 3 Hours
Unit 1: Mechanics
1. Kinematics and Dynamics
2. Work, Energy, and Power
3. Rotational Motion
Unit 2: Electromagnetism
4. Electrostatics
Page 1
5. Magnetism and Matter
6. Electromagnetic Induction
Unit 3: Modern Physics
7. Dual Nature of Radiation
8. Atoms and Nuclei
Total Marks: 100
             `;
            const data = Parser.parseText(demoText.trim());
            AppState.syllabus = data;
            Storage.save();
            UI.renderSyllabus();
            UI.updateStats();
        });

        // Load Initial State
        if (Storage.load()) {
            UI.renderSyllabus();
            UI.updateStats();
            if (AppState.examDate) UI.elements.examDateInput.value = AppState.examDate;
        }
    },

    handleDrop: async (e) => {
        e.preventDefault();
        UI.elements.dropzone.classList.remove('border-accent');
        const file = e.dataTransfer.files[0];
        if (file) await UI.processFile(file);
    },

    handleFileSelect: async (e) => {
        const file = e.target.files[0];
        if (file) await UI.processFile(file);
    },

    processFile: async (file) => {
        try {
            let text = "";
            if (file.type === "application/pdf") {
                text = await Parser.readPDF(file);
            } else {
                text = await file.text();
            }

            const data = Parser.parseText(text);
            if (data.length === 0) throw new Error("No topics found");

            AppState.syllabus = data;
            Storage.save();
            UI.renderSyllabus();
            UI.updateStats();

        } catch (err) {
            alert("Error parsing file: " + err.message);
        }
    },

    toggleInputMode: (mode) => {
        // Obsolete - removed
    },

    renderSyllabus: () => {
        // Hide input container, show list
        const inputContainer = document.getElementById('input-container');
        if (inputContainer) inputContainer.classList.add('hidden');

        UI.elements.checklistSection.classList.remove('hidden');
        UI.elements.checklistContainer.innerHTML = '';

        AppState.syllabus.forEach((topic, tIndex) => {
            // Create Card
            const card = document.createElement('div');
            card.className = "syll-card glass-panel rounded-xl overflow-hidden animate-fade-in-up";
            card.style.animationDelay = `${tIndex * 0.1}s`;

            // Card Header
            const header = document.createElement('div');
            header.className = "p-4 border-b border-glass-border bg-glass-100 flex justify-between items-center cursor-pointer";
            header.innerHTML = `
                <h4 class="font-semibold text-lg text-white">${topic.topic}</h4>
                <span class="text-xs bg-glass-200 px-2 py-1 rounded text-glass-textMuted">${topic.tasks.filter(t => t.done).length}/${topic.tasks.length}</span>
            `;

            // Tasks List
            const list = document.createElement('div');
            list.className = "p-4 space-y-3";

            topic.tasks.forEach((task, kIndex) => {
                const item = document.createElement('div');
                item.className = "flex items-start gap-3 group";

                const checkboxId = `t-${tIndex}-${kIndex}`;

                item.innerHTML = `
                    <div class="relative flex items-center pt-1">
                        <input type="checkbox" id="${checkboxId}" class="custom-checkbox w-5 h-5 border-2 border-glass-border rounded cursor-pointer transition-colors" ${task.done ? 'checked' : ''}>
                        <i class="fa-solid fa-check absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white text-xs opacity-0 pointer-events-none transition-opacity ${task.done ? 'opacity-100' : ''}"></i>
                    </div>
                    <label for="${checkboxId}" class="text-sm cursor-pointer select-none text-gray-200 transition-colors ${task.done ? 'line-through text-white/40' : ''}">
                        ${task.text}
                    </label>
                `;

                // Checkbox Event
                const checkbox = item.querySelector('input');
                const checkIcon = item.querySelector('.fa-check');
                const label = item.querySelector('label');

                checkbox.addEventListener('change', (e) => {
                    task.done = e.target.checked;

                    // UI Updates
                    if (task.done) {
                        checkIcon.classList.remove('opacity-0');
                        label.classList.add('line-through', 'text-white/40');
                        Effects.playClick();
                        Effects.confettiBurst(e.clientX, e.clientY);
                    } else {
                        checkIcon.classList.add('opacity-0');
                        label.classList.remove('line-through', 'text-white/40');
                    }

                    Storage.save();
                    UI.updateStats(); // Also updates chart
                });

                list.appendChild(item);
            });

            card.appendChild(header);
            card.appendChild(list);
            UI.elements.checklistContainer.appendChild(card);
        });

        Timetable.update();
        ChartManager.init();
    },

    updateStats: () => {
        const allTasks = AppState.syllabus.flatMap(t => t.tasks);
        const total = allTasks.length;
        const completed = allTasks.filter(t => t.done).length;
        const remaining = total - completed;
        const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

        UI.elements.overallProgress.style.width = `${percent}%`;
        UI.elements.overallText.innerText = `${percent}%`;

        // Update Remaining Count (New)
        const remainingEl = document.getElementById('remaining-tasks-count');
        if (remainingEl) remainingEl.innerText = remaining;

        // Update header counts on cards (re-rendering simplistic for now, could optimize)
        // Ignoring granular update for MVP speed.

        Timetable.update();
        ChartManager.update();

        if (percent === 100) Effects.motivationalToast("Incredible! You've completed everything!", "success");
        else if (percent === 50) Effects.motivationalToast("Halfway there! Keep pushing!", "info");
    }
};

// 4. Timetable Logic
const Timetable = {
    update: () => {
        if (!AppState.examDate) {
            UI.elements.dailyGoal.innerText = "--";
            return;
        }

        const today = new Date();
        const exam = new Date(AppState.examDate);
        const diffTime = exam - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        document.getElementById('days-remaining-text').innerText = diffDays > 0 ? `${diffDays} days remaining` : "Exam is today or past!";

        if (diffDays <= 0) {
            UI.elements.dailyGoal.innerText = "Panic";
            return;
        }

        const allTasks = AppState.syllabus.flatMap(t => t.tasks);
        const remainingters = allTasks.filter(t => !t.done).length;
        const daily = Math.ceil(remainingters / diffDays);

        UI.elements.dailyGoal.innerText = daily;
    }
};

// 5. Chart Manager
const ChartManager = {
    chart: null,

    init: () => {
        if (typeof Chart === 'undefined' || !UI.elements.chartCanvas) return;
        if (ChartManager.chart) ChartManager.chart.destroy();

        const ctx = UI.elements.chartCanvas.getContext('2d');
        if (!ctx) return;

        // Mock Data for MVP - Ideally this would parse AppState.history
        // For now, let's just show "Ideal" vs "Current" as single points or simple line

        ChartManager.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Start', 'Now', 'Goal'],
                datasets: [{
                    label: 'Actual Progress',
                    data: [0, AppState.syllabus.flatMap(t => t.tasks).filter(t => t.done).length, null],
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Required Pace',
                    data: [0, null, AppState.syllabus.flatMap(t => t.tasks).length],
                    borderColor: '#ec4899', // Pink
                    borderDash: [5, 5],
                    tension: 0.1,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: 'rgba(255,255,255,0.6)' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: 'rgba(255,255,255,0.6)' }
                    }
                },
                plugins: {
                    legend: { labels: { color: 'white' } }
                }
            }
        });
    },

    update: () => {
        // Simple update logic for the prototype
        if (typeof Chart === 'undefined') return;
        if (ChartManager.chart) {
            const completed = AppState.syllabus.flatMap(t => t.tasks).filter(t => t.done).length;
            const total = AppState.syllabus.flatMap(t => t.tasks).length;

            ChartManager.chart.data.datasets[0].data[1] = completed;
            ChartManager.chart.data.datasets[1].data[2] = total;
            ChartManager.chart.update();
        }
    }
};

// 6. Effects
const Effects = {
    playClick: () => {
        const audio = document.getElementById('sound-complete');
        if (audio) {
            audio.currentTime = 0;
            audio.volume = 0.2;
            audio.play().catch(e => console.log("Audio prevent", e));
        }
    },

    confettiBurst: (x, y) => {
        if (typeof confetti === 'undefined') return;
        confetti({
            particleCount: 60,
            spread: 70,
            origin: { x: x / window.innerWidth, y: y / window.innerHeight },
            colors: ['#6366f1', '#a855f7', '#ec4899']
        });
    },

    motivationalToast: (msg, type) => {
        const toast = document.createElement('div');
        toast.className = `glass-panel p-4 rounded-xl flex items-center gap-3 animate-fade-in-right transform transition-all duration-500`;
        toast.style.borderLeft = `4px solid ${type === 'success' ? '#22c55e' : '#6366f1'}`;
        toast.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <i class="fa-solid fa-${type === 'success' ? 'trophy' : 'info'} text-white"></i>
            </div>
            <p class="text-sm font-medium text-white">${msg}</p>
        `;

        UI.elements.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100px)';
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    }
};

// Start
document.addEventListener('DOMContentLoaded', UI.init);
