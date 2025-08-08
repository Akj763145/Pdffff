

// PDF.js configuration
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

class PDFViewer {
    constructor() {
        this.pdfDoc = null;
        this.currentPage = 1;
        this.scale = 1.0;
        this.maxScale = 5.0;
        this.minScale = 0.3;
        this.scaleStep = 0.25;
        this.canvas = document.getElementById('pdf-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.recentFiles = JSON.parse(localStorage.getItem('recentPDFs') || '[]');
        this.isRendering = false;
        this.renderTask = null;
        this.originalFileName = '';
        this.currentFileData = null;
        this.pendingPassword = null;
        
        // Touch and gesture support
        this.touchStartDistance = 0;
        this.touchStartScale = 1;
        this.isPinching = false;
        this.lastTouchTime = 0;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.viewportX = 0;
        this.viewportY = 0;
        
        this.initializeElements();
        this.bindEvents();
        this.loadRecentFiles();
        this.setupResponsiveCanvas();
    }
    
    initializeElements() {
        // File selection elements
        this.fileScreen = document.getElementById('file-screen');
        this.viewerScreen = document.getElementById('viewer-screen');
        this.selectFileBtn = document.getElementById('select-file-btn');
        this.fileInput = document.getElementById('file-input');
        this.recentFilesList = document.getElementById('recent-files-list');
        
        // Viewer elements
        this.backBtn = document.getElementById('back-btn');
        this.fileTitle = document.getElementById('file-title');
        this.zoomOutBtn = document.getElementById('zoom-out-btn');
        this.zoomInBtn = document.getElementById('zoom-in-btn');
        this.zoomLevel = document.getElementById('zoom-level');
        this.prevPageBtn = document.getElementById('prev-page-btn');
        this.nextPageBtn = document.getElementById('next-page-btn');
        this.pageInfo = document.getElementById('page-info');
        this.viewerContainer = document.querySelector('.viewer-container');
        
        // Password modal elements
        this.passwordModal = document.getElementById('password-modal');
        this.passwordInput = document.getElementById('pdf-password');
        this.passwordSubmit = document.getElementById('password-submit');
        this.passwordCancel = document.getElementById('password-cancel');
        this.passwordError = document.getElementById('password-error');
    }
    
    bindEvents() {
        // File selection events
        this.selectFileBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Viewer control events
        this.backBtn.addEventListener('click', () => this.showFileScreen());
        this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
        this.zoomInBtn.addEventListener('click', () => this.zoomIn());
        this.prevPageBtn.addEventListener('click', () => this.previousPage());
        this.nextPageBtn.addEventListener('click', () => this.nextPage());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        // Mouse wheel support for zooming
        this.viewerContainer.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        
        // Touch events for pinch zoom and pan
        this.viewerContainer.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.viewerContainer.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.viewerContainer.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        
        // Mouse events for dragging
        this.viewerContainer.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.viewerContainer.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.viewerContainer.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.viewerContainer.addEventListener('mouseleave', (e) => this.handleMouseUp(e));
        
        // Prevent context menu on long press
        this.viewerContainer.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Window resize handling
        window.addEventListener('resize', () => this.debounce(this.handleResize.bind(this), 250));
        
        // Recent files click handling
        this.recentFilesList.addEventListener('click', (e) => this.handleRecentFileClick(e));
        
        // Drag and drop support
        this.setupDragAndDrop();
        
        // Password modal events
        this.passwordSubmit.addEventListener('click', () => this.handlePasswordSubmit());
        this.passwordCancel.addEventListener('click', () => this.hidePasswordModal());
        this.passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.handlePasswordSubmit();
            } else if (e.key === 'Escape') {
                this.hidePasswordModal();
            }
        });
    }
    
    handleTouchStart(e) {
        if (e.touches.length === 1) {
            // Single touch - start panning
            this.isDragging = true;
            this.dragStartX = e.touches[0].clientX;
            this.dragStartY = e.touches[0].clientY;
            this.touchStartX = this.viewerContainer.scrollLeft;
            this.touchStartY = this.viewerContainer.scrollTop;
        } else if (e.touches.length === 2) {
            // Two finger touch - start pinch zoom
            e.preventDefault();
            this.isPinching = true;
            this.isDragging = false;
            
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            this.touchStartDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) +
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );
            this.touchStartScale = this.scale;
        }
    }
    
    handleTouchMove(e) {
        if (e.touches.length === 1 && this.isDragging && !this.isPinching) {
            // Single touch panning
            e.preventDefault();
            
            const deltaX = this.dragStartX - e.touches[0].clientX;
            const deltaY = this.dragStartY - e.touches[0].clientY;
            
            this.viewerContainer.scrollLeft = this.touchStartX + deltaX;
            this.viewerContainer.scrollTop = this.touchStartY + deltaY;
            
        } else if (e.touches.length === 2 && this.isPinching) {
            // Pinch zoom
            e.preventDefault();
            
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            const currentDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) +
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );
            
            const scaleRatio = currentDistance / this.touchStartDistance;
            let newScale = this.touchStartScale * scaleRatio;
            
            // Constrain scale
            newScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
            
            if (newScale !== this.scale) {
                // Get the center point of the pinch
                const centerX = (touch1.clientX + touch2.clientX) / 2;
                const centerY = (touch1.clientY + touch2.clientY) / 2;
                
                // Calculate the point on the canvas
                const rect = this.viewerContainer.getBoundingClientRect();
                const canvasX = centerX - rect.left;
                const canvasY = centerY - rect.top;
                
                // Store current scroll position
                const scrollLeft = this.viewerContainer.scrollLeft;
                const scrollTop = this.viewerContainer.scrollTop;
                
                this.scale = newScale;
                this.renderPageAsync().then(() => {
                    // Adjust scroll to maintain zoom center
                    const scaleChange = newScale / this.touchStartScale;
                    const newScrollLeft = scrollLeft + (canvasX * (scaleChange - 1));
                    const newScrollTop = scrollTop + (canvasY * (scaleChange - 1));
                    
                    this.viewerContainer.scrollLeft = newScrollLeft;
                    this.viewerContainer.scrollTop = newScrollTop;
                    
                    this.updateControls();
                });
            }
        }
    }
    
    handleTouchEnd(e) {
        if (e.touches.length === 0) {
            this.isDragging = false;
            this.isPinching = false;
        } else if (e.touches.length === 1 && this.isPinching) {
            // End of pinch, but one finger still down - switch to panning
            this.isPinching = false;
            this.isDragging = true;
            this.dragStartX = e.touches[0].clientX;
            this.dragStartY = e.touches[0].clientY;
            this.touchStartX = this.viewerContainer.scrollLeft;
            this.touchStartY = this.viewerContainer.scrollTop;
        }
        
        // Handle double tap to zoom
        const currentTime = Date.now();
        if (currentTime - this.lastTouchTime < 300 && e.touches.length === 0) {
            this.handleDoubleTap(e);
        }
        this.lastTouchTime = currentTime;
    }
    
    handleDoubleTap(e) {
        if (this.scale > 1.0) {
            this.scale = 1.0;
        } else {
            this.scale = Math.min(this.maxScale, 2.0);
        }
        this.renderPageAsync().then(() => {
            this.updateControls();
        });
    }
    
    handleMouseDown(e) {
        if (e.button === 0) { // Left mouse button
            this.isDragging = true;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            this.touchStartX = this.viewerContainer.scrollLeft;
            this.touchStartY = this.viewerContainer.scrollTop;
            this.viewerContainer.style.cursor = 'grabbing';
            e.preventDefault();
        }
    }
    
    handleMouseMove(e) {
        if (this.isDragging) {
            e.preventDefault();
            const deltaX = this.dragStartX - e.clientX;
            const deltaY = this.dragStartY - e.clientY;
            
            this.viewerContainer.scrollLeft = this.touchStartX + deltaX;
            this.viewerContainer.scrollTop = this.touchStartY + deltaY;
        }
    }
    
    handleMouseUp(e) {
        this.isDragging = false;
        this.viewerContainer.style.cursor = 'grab';
    }
    
    async renderPageAsync() {
        return new Promise((resolve) => {
            this.renderPage().then(resolve);
        });
    }
    
    setupDragAndDrop() {
        const dropZone = this.selectFileBtn;
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, this.preventDefaults, false);
        });
        
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('drag-over');
            }, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('drag-over');
            }, false);
        });
        
        dropZone.addEventListener('drop', (e) => this.handleDrop(e), false);
    }
    
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    handleDrop(e) {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type === 'application/pdf') {
                this.loadPDFFromFile(file);
            } else {
                this.showError('Please drop a valid PDF file.');
            }
        }
    }
    
    setupResponsiveCanvas() {
        // Set up high DPI canvas support
        const devicePixelRatio = window.devicePixelRatio || 1;
        this.canvas.style.imageRendering = 'auto';
        this.viewerContainer.style.cursor = 'grab';
    }
    
    handleResize() {
        if (this.pdfDoc && !this.isRendering) {
            this.renderPage();
        }
    }
    
    debounce(func, wait) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(func, wait);
    }
    
    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        await this.loadPDFFromFile(file);
    }
    
    async loadPDFFromFile(file) {
        if (!file || file.type !== 'application/pdf') {
            this.showError('Please select a valid PDF file.');
            return;
        }
        
        this.showLoading(true);
        this.originalFileName = file.name;
        
        try {
            // Store file data first
            this.currentFileData = await file.arrayBuffer();
            await this.loadPDF(file);
            this.addToRecentFiles(file.name);
            this.showViewerScreen();
        } catch (error) {
            console.error('Error loading PDF:', error);
            if (error.name === 'PasswordException') {
                // Don't hide loading, password modal will handle it
                return;
            } else {
                this.showError('Error loading PDF file. The file might be corrupted.');
                this.showLoading(false);
            }
        }
    }
    
    showLoading(show) {
        const controls = document.querySelectorAll('.control-btn, .icon-btn');
        controls.forEach(btn => {
            btn.disabled = show;
        });
    }
    
    showError(message) {
        alert(message);
    }
    
    async loadPDF(file, password = null) {
        if (this.renderTask) {
            this.renderTask.cancel();
        }
        
        const loadingTask = pdfjsLib.getDocument({
            data: this.currentFileData,
            password: password,
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
            cMapPacked: true,
            standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/'
        });
        
        try {
            this.pdfDoc = await loadingTask.promise;
            this.currentPage = 1;
            this.scale = this.calculateOptimalScale();
            this.fileTitle.textContent = this.originalFileName || file.name;
            
            await this.renderPage();
            this.updateControls();
        } catch (error) {
            if (error.name === 'PasswordException') {
                if (password) {
                    // Wrong password was provided
                    this.showPasswordError();
                } else {
                    // PDF needs a password
                    this.showPasswordModal();
                }
                throw error;
            } else {
                throw error;
            }
        }
    }
    
    calculateOptimalScale() {
        const container = this.viewerContainer;
        const containerWidth = container.clientWidth - 20;
        const containerHeight = container.clientHeight - 20;
        
        const standardPageWidth = 612;
        const standardPageHeight = 792;
        
        const scaleX = containerWidth / standardPageWidth;
        const scaleY = containerHeight / standardPageHeight;
        
        const optimalScale = Math.min(scaleX, scaleY, 1.0);
        
        return Math.max(this.minScale, Math.min(this.maxScale, optimalScale));
    }
    
    async renderPage() {
        if (!this.pdfDoc || this.isRendering) return;
        
        this.isRendering = true;
        
        try {
            if (this.renderTask) {
                await this.renderTask.cancel();
            }
            
            const page = await this.pdfDoc.getPage(this.currentPage);
            
            const devicePixelRatio = window.devicePixelRatio || 1;
            const viewport = page.getViewport({ scale: this.scale });
            
            this.canvas.width = viewport.width * devicePixelRatio;
            this.canvas.height = viewport.height * devicePixelRatio;
            this.canvas.style.width = viewport.width + 'px';
            this.canvas.style.height = viewport.height + 'px';
            
            // Center the canvas when it's smaller than the container
            const containerWidth = this.viewerContainer.clientWidth - 20;
            const containerHeight = this.viewerContainer.clientHeight - 20;
            
            if (viewport.width < containerWidth) {
                this.canvas.style.marginLeft = 'auto';
                this.canvas.style.marginRight = 'auto';
                this.canvas.style.display = 'block';
            } else {
                this.canvas.style.marginLeft = '0';
                this.canvas.style.marginRight = '0';
                this.canvas.style.display = 'block';
            }
            
            this.ctx.scale(devicePixelRatio, devicePixelRatio);
            
            this.canvas.classList.add('page-changing');
            
            const renderContext = {
                canvasContext: this.ctx,
                viewport: viewport
            };
            
            this.renderTask = page.render(renderContext);
            await this.renderTask.promise;
            
            this.renderTask = null;
            
            setTimeout(() => {
                this.canvas.classList.remove('page-changing');
            }, 300);
            
        } catch (error) {
            if (error.name !== 'RenderingCancelledException') {
                console.error('Error rendering page:', error);
                this.showError('Error rendering page. Please try again.');
            }
        } finally {
            this.isRendering = false;
        }
    }
    
    updateControls() {
        if (!this.pdfDoc) return;
        
        this.pageInfo.textContent = `${this.currentPage} / ${this.pdfDoc.numPages}`;
        
        this.prevPageBtn.disabled = this.currentPage <= 1;
        this.nextPageBtn.disabled = this.currentPage >= this.pdfDoc.numPages;
        
        this.zoomLevel.textContent = Math.round(this.scale * 100) + '%';
        
        this.zoomOutBtn.disabled = this.scale <= this.minScale;
        this.zoomInBtn.disabled = this.scale >= this.maxScale;
    }
    
    async previousPage() {
        if (this.currentPage > 1 && !this.isRendering) {
            this.currentPage--;
            await this.renderPage();
            this.updateControls();
        }
    }
    
    async nextPage() {
        if (this.currentPage < this.pdfDoc.numPages && !this.isRendering) {
            this.currentPage++;
            await this.renderPage();
            this.updateControls();
        }
    }
    
    async zoomIn() {
        if (this.scale < this.maxScale && !this.isRendering) {
            const oldScale = this.scale;
            const centerX = this.viewerContainer.scrollLeft + this.viewerContainer.clientWidth / 2;
            const centerY = this.viewerContainer.scrollTop + this.viewerContainer.clientHeight / 2;
            
            this.scale = Math.min(this.maxScale, this.scale + this.scaleStep);
            await this.renderPage();
            
            // Adjust scroll position to maintain zoom center
            const scaleRatio = this.scale / oldScale;
            this.viewerContainer.scrollLeft = (centerX * scaleRatio) - this.viewerContainer.clientWidth / 2;
            this.viewerContainer.scrollTop = (centerY * scaleRatio) - this.viewerContainer.clientHeight / 2;
            
            this.updateControls();
        }
    }
    
    async zoomOut() {
        if (this.scale > this.minScale && !this.isRendering) {
            const oldScale = this.scale;
            const centerX = this.viewerContainer.scrollLeft + this.viewerContainer.clientWidth / 2;
            const centerY = this.viewerContainer.scrollTop + this.viewerContainer.clientHeight / 2;
            
            this.scale = Math.max(this.minScale, this.scale - this.scaleStep);
            await this.renderPage();
            
            // Adjust scroll position to maintain zoom center
            const scaleRatio = this.scale / oldScale;
            this.viewerContainer.scrollLeft = Math.max(0, (centerX * scaleRatio) - this.viewerContainer.clientWidth / 2);
            this.viewerContainer.scrollTop = Math.max(0, (centerY * scaleRatio) - this.viewerContainer.clientHeight / 2);
            
            this.updateControls();
        }
    }
    
    async fitToWidth() {
        const container = this.viewerContainer;
        const containerWidth = container.clientWidth - 20;
        
        if (this.pdfDoc && !this.isRendering) {
            const page = await this.pdfDoc.getPage(this.currentPage);
            const viewport = page.getViewport({ scale: 1 });
            const scale = containerWidth / viewport.width;
            
            this.scale = Math.max(this.minScale, Math.min(this.maxScale, scale));
            await this.renderPage();
            this.updateControls();
        }
    }
    
    async goToPage(pageNumber) {
        if (pageNumber >= 1 && pageNumber <= this.pdfDoc.numPages && !this.isRendering) {
            this.currentPage = pageNumber;
            await this.renderPage();
            this.updateControls();
        }
    }
    
    handleKeydown(event) {
        if (this.viewerScreen.classList.contains('hidden')) return;
        
        const handledKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Escape', 'Home', 'End'];
        if (handledKeys.includes(event.key)) {
            event.preventDefault();
        }
        
        switch (event.key) {
            case 'ArrowLeft':
            case 'ArrowUp':
                this.previousPage();
                break;
            case 'ArrowRight':
            case 'ArrowDown':
                this.nextPage();
                break;
            case '+':
            case '=':
                this.zoomIn();
                break;
            case '-':
                this.zoomOut();
                break;
            case 'Escape':
                this.showFileScreen();
                break;
            case 'Home':
                this.goToPage(1);
                break;
            case 'End':
                this.goToPage(this.pdfDoc?.numPages || 1);
                break;
            case 'f':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                }
                break;
        }
    }
    
    handleWheel(event) {
        if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            if (event.deltaY < 0) {
                this.zoomIn();
            } else {
                this.zoomOut();
            }
        }
    }
    
    showFileScreen() {
        if (this.renderTask) {
            this.renderTask.cancel();
        }
        
        this.fileScreen.classList.remove('hidden');
        this.viewerScreen.classList.add('hidden');
        this.hidePasswordModal();
        
        // Reset state
        this.fileInput.value = '';
        this.currentFileData = null;
        this.pdfDoc = null;
        this.originalFileName = '';
        this.showLoading(false);
    }
    
    showViewerScreen() {
        this.fileScreen.classList.add('hidden');
        this.viewerScreen.classList.remove('hidden');
    }
    
    addToRecentFiles(fileName) {
        const fileEntry = {
            name: fileName,
            date: new Date().toLocaleDateString(),
            timestamp: Date.now()
        };
        
        this.recentFiles = this.recentFiles.filter(file => file.name !== fileName);
        this.recentFiles.unshift(fileEntry);
        this.recentFiles = this.recentFiles.slice(0, 10);
        
        try {
            localStorage.setItem('recentPDFs', JSON.stringify(this.recentFiles));
        } catch (error) {
            console.warn('Could not save recent files to localStorage:', error);
        }
        
        this.loadRecentFiles();
    }
    
    loadRecentFiles() {
        const container = this.recentFilesList;
        
        if (this.recentFiles.length === 0) {
            container.innerHTML = '<div class="no-files">No recent files</div>';
            return;
        }
        
        container.innerHTML = this.recentFiles.map((file, index) => `
            <div class="file-item" data-filename="${file.name}" style="animation-delay: ${1 + index * 0.1}s">
                <div class="file-icon-small">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                    </svg>
                </div>
                <div class="file-info">
                    <div class="file-name" title="${file.name}">${file.name}</div>
                    <div class="file-date">${file.date}</div>
                </div>
            </div>
        `).join('');
    }
    
    handleRecentFileClick(event) {
        const fileItem = event.target.closest('.file-item');
        if (fileItem) {
            this.fileInput.click();
        }
    }
    
    getDocumentInfo() {
        if (!this.pdfDoc) return null;
        
        return {
            title: this.originalFileName,
            pages: this.pdfDoc.numPages,
            currentPage: this.currentPage,
            zoom: Math.round(this.scale * 100)
        };
    }
    
    showPasswordModal() {
        this.passwordModal.classList.remove('hidden');
        this.passwordInput.value = '';
        this.passwordError.classList.add('hidden');
        setTimeout(() => {
            this.passwordInput.focus();
        }, 100);
    }
    
    hidePasswordModal() {
        this.passwordModal.classList.add('hidden');
        this.currentFileData = null;
        this.showLoading(false);
    }
    
    showPasswordError() {
        this.passwordError.classList.remove('hidden');
        this.passwordInput.value = '';
        this.passwordInput.focus();
    }
    
    async handlePasswordSubmit() {
        const password = this.passwordInput.value.trim();
        if (!password) {
            this.passwordInput.focus();
            return;
        }
        
        this.passwordSubmit.disabled = true;
        
        try {
            // Create a temporary file object for loadPDF
            const tempFile = { name: this.originalFileName };
            await this.loadPDF(tempFile, password);
            
            this.addToRecentFiles(this.originalFileName);
            this.hidePasswordModal();
            this.showViewerScreen();
            this.showLoading(false);
        } catch (error) {
            console.error('Password error:', error);
            if (error.name === 'PasswordException') {
                this.showPasswordError();
            } else {
                this.showError('Error loading PDF file. Please try again.');
                this.hidePasswordModal();
                this.showLoading(false);
            }
        } finally {
            this.passwordSubmit.disabled = false;
        }
    }
    
    destroy() {
        if (this.renderTask) {
            this.renderTask.cancel();
        }
        if (this.pdfDoc) {
            this.pdfDoc.destroy();
        }
        this.currentFileData = null;
    }
}

// Initialize PDF viewer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const viewer = new PDFViewer();
    
    window.pdfViewer = viewer;
    
    window.addEventListener('beforeunload', () => {
        viewer.destroy();
    });
});

