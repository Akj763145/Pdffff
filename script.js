
// PDF.js setup
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

class PDFViewer {
    constructor() {
        this.currentScreen = 'file';
        this.pdfDoc = null;
        this.pageNum = 1;
        this.pageCount = 0;
        this.scale = 1.0;
        this.canvas = document.getElementById('pdf-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.recentFiles = this.loadRecentFiles();
        this.isRendering = false;
        
        // Touch handling variables
        this.touches = [];
        this.lastTouchDistance = 0;
        this.initialScale = 1.0;
        
        this.initializeEventListeners();
        this.initializePinchZoom();
        this.showScreen('file');
        this.displayRecentFiles();
    }

    initializeEventListeners() {
        // File selection
        const selectBtn = document.getElementById('select-file-btn');
        const fileInput = document.getElementById('file-input');
        
        if (selectBtn) {
            selectBtn.addEventListener('click', () => {
                fileInput.click();
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files[0]) {
                    this.handleFileSelect(e.target.files[0]);
                }
            });
        }

        // Viewer back button
        const backBtn = document.getElementById('viewer-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.showScreen('file');
            });
        }

        // PDF controls
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        const zoomInBtn = document.getElementById('zoom-in');
        const zoomOutBtn = document.getElementById('zoom-out');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.prevPage());
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextPage());
        }
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => this.zoomIn());
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => this.zoomOut());
        }

        // Recent files click handling
        this.setupRecentFilesHandling();
    }

    setupRecentFilesHandling() {
        document.addEventListener('click', (e) => {
            if (e.target.closest('.file-item')) {
                const fileItem = e.target.closest('.file-item');
                const fileName = fileItem.querySelector('.file-name')?.textContent;
                if (fileName) {
                    // Create a file input to trigger file selection
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.pdf';
                    input.click();
                    
                    input.addEventListener('change', (event) => {
                        if (event.target.files[0]) {
                            this.handleFileSelect(event.target.files[0]);
                        }
                    });
                }
            }
        });
    }

    showScreen(screenName) {
        // Add smooth transition
        document.querySelectorAll('.screen').forEach(screen => {
            if (!screen.classList.contains('hidden')) {
                screen.style.transform = 'scale(0.95)';
                screen.style.opacity = '0';
                setTimeout(() => {
                    screen.classList.add('hidden');
                }, 200);
            }
        });

        // Show target screen with delay for smooth transition
        setTimeout(() => {
            const targetScreen = document.getElementById(`${screenName}-screen`);
            if (targetScreen) {
                targetScreen.classList.remove('hidden');
                targetScreen.style.transform = 'scale(0.95)';
                targetScreen.style.opacity = '0';
                
                setTimeout(() => {
                    targetScreen.style.transform = 'scale(1)';
                    targetScreen.style.opacity = '1';
                }, 50);
                
                this.currentScreen = screenName;
            }
        }, 200);
    }

    async handleFileSelect(file) {
        if (!file || file.type !== 'application/pdf') {
            alert('Please select a valid PDF file.');
            return;
        }

        try {
            const arrayBuffer = await file.arrayBuffer();
            await this.loadPDF(arrayBuffer);
            const titleElement = document.querySelector('.file-title');
            if (titleElement) {
                titleElement.textContent = file.name;
            }
            this.addToRecentFiles(file.name);
            this.showScreen('viewer');
        } catch (error) {
            console.error('Error loading PDF:', error);
            alert('Error loading PDF file. Please try again.');
        }
    }

    async loadPDF(data) {
        try {
            this.pdfDoc = await pdfjsLib.getDocument(data).promise;
            this.pageCount = this.pdfDoc.numPages;
            this.pageNum = 1;
            this.scale = 1.0;
            await this.renderPage();
            this.updatePageInfo();
        } catch (error) {
            throw new Error('Failed to load PDF document');
        }
    }

    async renderPage() {
        if (!this.pdfDoc || !this.canvas || this.isRendering) return;

        this.isRendering = true;

        try {
            // Add loading animation
            this.canvas.style.opacity = '0.5';
            this.canvas.style.transform = 'scale(0.98)';
            this.canvas.classList.add('page-changing');
            
            const page = await this.pdfDoc.getPage(this.pageNum);
            const viewport = page.getViewport({ scale: this.scale });

            // Set canvas size to fit the viewport
            this.canvas.width = viewport.width;
            this.canvas.height = viewport.height;

            const renderContext = {
                canvasContext: this.ctx,
                viewport: viewport
            };

            await page.render(renderContext).promise;
            
            // Smooth transition back
            setTimeout(() => {
                this.canvas.style.opacity = '1';
                this.canvas.style.transform = 'scale(1)';
                this.canvas.classList.remove('page-changing');
            }, 100);
            
        } catch (error) {
            console.error('Error rendering page:', error);
            this.canvas.style.opacity = '1';
            this.canvas.style.transform = 'scale(1)';
            this.canvas.classList.remove('page-changing');
        } finally {
            this.isRendering = false;
        }
    }

    updatePageInfo() {
        const pageInfo = document.getElementById('page-info');
        const zoomLevel = document.getElementById('zoom-level');
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');

        if (pageInfo) {
            pageInfo.textContent = `${this.pageNum} / ${this.pageCount}`;
        }
        if (zoomLevel) {
            zoomLevel.textContent = `${Math.round(this.scale * 100)}%`;
        }
        
        // Update button states
        if (prevBtn) {
            prevBtn.disabled = this.pageNum <= 1;
        }
        if (nextBtn) {
            nextBtn.disabled = this.pageNum >= this.pageCount;
        }
    }

    async prevPage() {
        if (this.pageNum > 1 && !this.isRendering) {
            this.pageNum--;
            await this.renderPage();
            this.updatePageInfo();
        }
    }

    async nextPage() {
        if (this.pageNum < this.pageCount && !this.isRendering) {
            this.pageNum++;
            await this.renderPage();
            this.updatePageInfo();
        }
    }

    async zoomIn() {
        if (!this.isRendering) {
            this.scale = Math.min(this.scale + 0.25, 3.0);
            if (this.pdfDoc) {
                await this.renderPage();
                this.updatePageInfo();
            }
        }
    }

    async zoomOut() {
        if (!this.isRendering) {
            this.scale = Math.max(this.scale - 0.25, 0.5);
            if (this.pdfDoc) {
                await this.renderPage();
                this.updatePageInfo();
            }
        }
    }

    initializePinchZoom() {
        if (!this.canvas) return;

        let initialDistance = 0;
        let initialScale = this.scale;
        let isZooming = false;

        // Touch start
        this.canvas.addEventListener('touchstart', (e) => {
            this.touches = Array.from(e.touches);
            
            if (e.touches.length === 2) {
                e.preventDefault();
                isZooming = true;
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                initialDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
                initialScale = this.scale;
            }
        }, { passive: false });

        // Touch move
        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && isZooming && !this.isRendering) {
                e.preventDefault();
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
                
                if (initialDistance > 0) {
                    const scaleChange = currentDistance / initialDistance;
                    const newScale = Math.min(Math.max(initialScale * scaleChange, 0.5), 3.0);
                    
                    if (Math.abs(newScale - this.scale) > 0.1) {
                        this.scale = newScale;
                        this.renderPage();
                        this.updatePageInfo();
                    }
                }
            }
        }, { passive: false });

        // Touch end
        this.canvas.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                isZooming = false;
                initialDistance = 0;
            }
        });

        // Mouse wheel zoom
        this.canvas.addEventListener('wheel', (e) => {
            if (!this.isRendering) {
                e.preventDefault();
                if (e.deltaY < 0) {
                    this.zoomIn();
                } else {
                    this.zoomOut();
                }
            }
        }, { passive: false });

        // Prevent context menu on long press
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    // Recent files management
    loadRecentFiles() {
        try {
            const stored = localStorage.getItem('recentPDFs');
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Error loading recent files:', error);
            return [];
        }
    }

    saveRecentFiles() {
        try {
            localStorage.setItem('recentPDFs', JSON.stringify(this.recentFiles));
        } catch (error) {
            console.error('Error saving recent files:', error);
        }
    }

    addToRecentFiles(fileName) {
        const fileInfo = {
            name: fileName,
            date: new Date().toLocaleDateString(),
            timestamp: Date.now()
        };

        // Remove if already exists
        this.recentFiles = this.recentFiles.filter(file => file.name !== fileName);
        
        // Add to beginning
        this.recentFiles.unshift(fileInfo);
        
        // Keep only last 5 files
        this.recentFiles = this.recentFiles.slice(0, 5);
        
        this.saveRecentFiles();
        this.displayRecentFiles();
    }

    displayRecentFiles() {
        const recentFilesList = document.getElementById('recent-files-list');
        
        if (!recentFilesList) return;

        if (this.recentFiles.length === 0) {
            recentFilesList.innerHTML = '<div class="no-files">No recent files</div>';
            return;
        }

        recentFilesList.innerHTML = this.recentFiles.map((file, index) => `
            <div class="file-item" style="animation-delay: ${1 + index * 0.1}s">
                <span class="file-icon-small">📄</span>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-date">${file.date}</div>
                </div>
            </div>
        `).join('');
    }
}

// Initialize the PDF viewer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new PDFViewer();
});

// Handle drag and drop functionality
document.addEventListener('dragover', (e) => {
    e.preventDefault();
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
        const viewer = new PDFViewer();
        viewer.handleFileSelect(files[0]);
    }
});
