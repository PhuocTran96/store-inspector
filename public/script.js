class App {
    constructor() {
        this.currentUser = null;
        this.currentStore = null;
        this.categories = [];
        this.categoryData = {};
        this.allStores = []; // Lưu trữ tất cả stores để filter
        this.allStoreNames = []; // Lưu trữ store names cho autocomplete
        this.filteredStores = []; // Stores sau khi filter
        this.selectedDropdownIndex = -1; // Index của item đang được highlight trong dropdown
        
        // New properties for before/after workflow
        this.currentStep = 'before'; // 'before' or 'after'
        this.sessionId = null; // Unique session ID for linking before and after
        this.beforeCategories = []; // Categories that have "before" submissions
        this.selectedAfterCategories = []; // Categories selected for "after" photos
        
        // Session persistence properties
        this.sessionStorageKey = 'storeInspectionSession';
        this.autoSaveInterval = null;
        this.lastSaveTime = null;
        
        this.init();
    }

    // Session Persistence Methods
    setupSessionPersistence() {
        // Restore session on page load
        this.restoreSession();
        
        // Auto-save every 30 seconds
        this.autoSaveInterval = setInterval(() => {
            this.saveSession();
        }, 30000);
        
        // Save on page visibility change (when user switches tabs)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.saveSession();
            }
        });
        
        // Save before page unload
        window.addEventListener('beforeunload', () => {
            this.saveSession();
        });
        
        // Save on network status change
        window.addEventListener('online', () => {
            this.restoreSession();
        });
        
        window.addEventListener('offline', () => {
            this.saveSession();
        });
    }
    
    saveSession() {
        try {
            const sessionData = {
                currentUser: this.currentUser,
                currentStore: this.currentStore,
                currentStep: this.currentStep,
                sessionId: this.sessionId,
                beforeCategories: this.beforeCategories,
                selectedAfterCategories: this.selectedAfterCategories,
                categoryData: this.categoryData,
                timestamp: Date.now()
            };
            
            localStorage.setItem(this.sessionStorageKey, JSON.stringify(sessionData));
            this.lastSaveTime = Date.now();
            
            console.log('📱 Session saved to localStorage');
        } catch (error) {
            console.error('Error saving session:', error);
        }
    }
    
    restoreSession() {
        try {
            const savedData = localStorage.getItem(this.sessionStorageKey);
            if (!savedData) return false;
            
            const sessionData = JSON.parse(savedData);
            
            // Check if session is not too old (24 hours)
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours
            if (Date.now() - sessionData.timestamp > maxAge) {
                this.clearSession();
                return false;
            }
            
            // Restore session data
            this.currentUser = sessionData.currentUser;
            this.currentStore = sessionData.currentStore;
            this.currentStep = sessionData.currentStep || 'before';
            this.sessionId = sessionData.sessionId;
            this.beforeCategories = sessionData.beforeCategories || [];
            this.selectedAfterCategories = sessionData.selectedAfterCategories || [];
            this.categoryData = sessionData.categoryData || {};
            
            console.log('📱 Session restored from localStorage');
            
            // If we have a current store and category data, restore the UI
            if (this.currentStore && Object.keys(this.categoryData).length > 0) {
                this.showToast('Phiên làm việc đã được khôi phục', 'success');
                
                // Restore appropriate screen based on current step
                if (this.currentStep === 'after' && this.beforeCategories.length > 0) {
                    this.renderAfterCategorySelection();
                    this.showScreen('categoryScreen');
                } else if (this.currentStep === 'before' || this.currentStep === 'after') {
                    this.renderCategories();
                    this.showScreen('categoryScreen');
                }
                
                // Update store name display
                const stepText = this.currentStep === 'before' ?
                    'Bước 1: Chụp ảnh TRƯỚC cải thiện' :
                    'Bước 2: Chụp ảnh SAU cải thiện';
                document.getElementById('selectedStoreName').textContent =
                    `${this.currentStore['Store name']} - ${stepText}`;
            }
            
            return true;
        } catch (error) {
            console.error('Error restoring session:', error);
            this.clearSession();
            return false;
        }
    }
    
    clearSession() {
        try {
            localStorage.removeItem(this.sessionStorageKey);
            console.log('📱 Session cleared from localStorage');
        } catch (error) {
            console.error('Error clearing session:', error);
        }
    }

    init() {
        this.bindEvents();
        this.setupSessionPersistence();
        this.checkAuthStatus();
    }    bindEvents() {
        // Login
        document.getElementById('loginForm').addEventListener('submit', this.handleLogin.bind(this));
        
        // Change password
        document.getElementById('changePasswordBtn').addEventListener('click', this.showChangePassword.bind(this));
        document.getElementById('backToLoginBtn').addEventListener('click', this.showLogin.bind(this));
        document.getElementById('changePasswordForm').addEventListener('submit', this.handleChangePassword.bind(this));
        document.getElementById('loadUserInfoBtn').addEventListener('click', this.loadUserInfo.bind(this));
        
        // Navigation
        document.getElementById('logoutBtn').addEventListener('click', this.handleLogout.bind(this));        document.getElementById('backToStoresBtn').addEventListener('click', (e) => {
            console.log('🔙 Back to stores button clicked');
            e.preventDefault(); // Prevent any default behavior
            e.stopPropagation(); // Stop event bubbling
            this.handleBackToStores();
        });
        document.getElementById('backToStoresFromAdminBtn').addEventListener('click', this.showStores.bind(this));
        document.getElementById('historyBtn')?.addEventListener('click', this.showHistory.bind(this));
          // Submit
        document.getElementById('submitBtn').addEventListener('click', this.handleSubmitClick.bind(this));
        document.getElementById('proceedToAfterBtn')?.addEventListener('click', this.proceedToAfterStep.bind(this));
        document.getElementById('backToBeforeBtn')?.addEventListener('click', this.backToBeforeStep.bind(this));
        
        // Admin
        document.getElementById('exportBtn').addEventListener('click', this.handleExport.bind(this));
        
        // Store search and filter
        document.getElementById('storeSearch').addEventListener('input', this.handleStoreSearch.bind(this));
        document.getElementById('storeSearch').addEventListener('keydown', this.handleSearchKeydown.bind(this));
        document.getElementById('storeSearch').addEventListener('focus', this.handleSearchFocus.bind(this));
        document.getElementById('clearFilter').addEventListener('click', this.clearStoreFilter.bind(this));
        
        // Close dropdown when clicking outside
        document.addEventListener('click', this.handleClickOutside.bind(this));
    }    // Screen management
    showScreen(screenId) {
        console.log('🖥️ showScreen() called with screenId:', screenId);
        document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
            console.log('✅ Screen switched to:', screenId);
        } else {
            console.error('❌ Screen not found:', screenId);
        }
    }    showLoading(show = true, message = '') {
        console.log('⏳ showLoading() called with show:', show, 'message:', message);
        const overlay = document.getElementById('loadingOverlay');
        const loadingText = overlay.querySelector('.loading-text');
        
        if (message && loadingText) {
            loadingText.textContent = message;
        } else if (loadingText) {
            loadingText.textContent = 'Đang tải...';
        }
        
        overlay.classList.toggle('active', show);
        console.log('⏳ Loading overlay is now:', show ? 'VISIBLE' : 'HIDDEN');
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }    // Authentication
    async checkAuthStatus() {
        try {
            // Check if user is already authenticated
            const response = await fetch('/api/check-session');
            if (response.ok) {
                const data = await response.json();
                this.currentUser = data.user;
                console.log('User already authenticated:', this.currentUser);
                
                // Show appropriate screen based on user role
                if (this.currentUser.role === 'Admin') {
                    this.showAdminOrStores();
                } else {
                    this.showScreen('storeScreen');
                    this.loadStores();
                }
            } else {
                // User not authenticated, show login screen
                this.showScreen('loginScreen');
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            // On error, show login screen
            this.showScreen('loginScreen');
        }
    }async handleLogin(e) {
        e.preventDefault();
        this.showLoading(true);

        const formData = new FormData(e.target);
        const credentials = {
            username: formData.get('username'),
            password: formData.get('password')
        };

        console.log('Đang đăng nhập với:', credentials.username);

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials),
                credentials: 'same-origin' // Quan trọng: gửi cookie
            });

            if (response.ok) {
                const data = await response.json();
                this.currentUser = data.user;
                console.log('Đăng nhập thành công:', this.currentUser);
                this.showToast('Đăng nhập thành công!', 'success');
                
                // Chờ một chút để đảm bảo session được lưu
                await new Promise(resolve => setTimeout(resolve, 500));
                
                if (this.currentUser.role === 'Admin') {
                    console.log('Vai trò Admin, chuyển đến trang admin/store');
                    this.showAdminOrStores();
                } else {
                    console.log('Vai trò người dùng thường, load stores');
                    await this.loadStores();
                }
            } else {
                const error = await response.json();
                console.error('Lỗi đăng nhập:', error);
                this.showToast(error.error || 'Đăng nhập thất bại', 'error');
            }
        } catch (error) {
            console.error('Lỗi kết nối:', error);
            this.showToast('Lỗi kết nối', 'error');
        } finally {
            this.showLoading(false);
        }
    }    showChangePassword() {
        // Reset form and hide user info card initially
        document.getElementById('changePasswordForm').reset();
        document.getElementById('userIdGroup').style.display = 'block';
        document.querySelector('.user-info-card').style.display = 'none';
        
        // Reset user info display
        document.getElementById('changePasswordUsername').textContent = 'Chưa đăng nhập';
        document.getElementById('changePasswordUserId').textContent = 'ID: -';
        document.getElementById('changePasswordRole').textContent = '-';
        
        // If user is already logged in, show their info directly
        if (this.currentUser) {
            document.getElementById('changePasswordUserIdInput').value = this.currentUser.id;
            this.loadUserInfo();
        }
        
        this.showScreen('changePasswordScreen');
    }    showLogin() {
        this.showScreen('loginScreen');
        document.getElementById('changePasswordForm').reset();
        
        // Reset change password screen
        document.getElementById('userIdGroup').style.display = 'block';
        document.querySelector('.user-info-card').style.display = 'none';
        document.getElementById('changePasswordUsername').textContent = 'Chưa đăng nhập';
        document.getElementById('changePasswordUserId').textContent = 'ID: -';
        document.getElementById('changePasswordRole').textContent = '-';
    }async handleChangePassword(e) {
        e.preventDefault();
        this.showLoading(true);

        const formData = new FormData(e.target);
        const newPassword = formData.get('newPassword');
        const confirmPassword = formData.get('confirmPassword');
        const userId = formData.get('userId') || document.getElementById('changePasswordUserIdInput').value.trim();

        if (!userId) {
            this.showToast('Vui lòng nhập User ID trước', 'error');
            this.showLoading(false);
            return;
        }

        if (newPassword !== confirmPassword) {
            this.showToast('Mật khẩu xác nhận không khớp', 'error');
            this.showLoading(false);
            return;
        }

        const data = {
            userId: userId,
            currentPassword: formData.get('currentPassword'),
            newPassword: newPassword
        };

        try {
            const response = await fetch('/api/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                this.showToast('Đổi mật khẩu thành công!', 'success');
                this.showLogin();
            } else {
                const error = await response.json();
                this.showToast(error.error || 'Đổi mật khẩu thất bại', 'error');
            }
        } catch (error) {
            this.showToast('Lỗi kết nối', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async handleLogout() {
        try {
            await fetch('/api/logout', { method: 'POST' });
            this.currentUser = null;
            this.currentStore = null;
            this.showScreen('loginScreen');
            this.showToast('Đã đăng xuất', 'success');
        } catch (error) {
            this.showToast('Lỗi đăng xuất', 'error');
        }
    }

    // Store management
    showAdminOrStores() {
        // For admin users, show both options
        if (this.currentUser.role === 'Admin') {
            this.showScreen('adminScreen');
        } else {
            this.loadStores();
        }
    }    async loadStores() {
        console.log('📋 loadStores() called');
        this.showLoading(true);

        try {
            // Thêm tham số demo=true để server trả về stores mẫu nếu không tìm thấy stores
            const response = await fetch('/api/stores?demo=true', {
                credentials: 'same-origin', // Quan trọng: gửi cookie
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
            
            console.log('Response status:', response.status);
            
            if (response.ok) {
                const stores = await response.json();
                console.log('Loaded stores:', stores.length);
                this.allStores = stores; // Lưu tất cả stores
                this.filteredStores = stores; // Ban đầu hiển thị tất cả
                await this.loadStoreNames(); // Load store names cho autocomplete
                this.renderStores(stores);
                console.log('🎯 Calling showScreen(storeScreen)...');
                this.showScreen('storeScreen');
                console.log('✅ loadStores() completed successfully');
            } else {
                const errorText = await response.text();
                console.error('API Error:', response.status, errorText);
                this.showToast('Không thể tải danh sách cửa hàng', 'error');
            }
        } catch (error) {
            console.error('Fetch error:', error);
            this.showToast('Lỗi kết nối', 'error');
        } finally {
            console.log('🔄 Hiding loading overlay...');
            this.showLoading(false);
        }
    }

    async loadStoreNames() {
        try {
            const response = await fetch('/api/store-names');
            if (response.ok) {
                this.allStoreNames = await response.json();
                console.log('Loaded store names:', this.allStoreNames.length);
            }
        } catch (error) {
            console.error('Error loading store names:', error);
        }
    }

    renderStores(stores) {
        const storeList = document.getElementById('storeList');
        storeList.innerHTML = '';

        if (stores.length === 0) {
            // Hiển thị thông báo khi không có cửa hàng
            const noStoreMessage = document.createElement('div');
            noStoreMessage.className = 'store-item';
            noStoreMessage.style.background = '#f8d7da';
            noStoreMessage.style.color = '#721c24';
            noStoreMessage.style.border = '1px solid #f5c6cb';
            noStoreMessage.innerHTML = `
                <h3><i class="fas fa-exclamation-circle"></i> Không tìm thấy cửa hàng</h3>
                <p>Không có cửa hàng nào được gán cho tài khoản của bạn.</p>
                <p>User ID: ${this.currentUser.id}</p>
                <p>Username: ${this.currentUser.username}</p>
            `;
            storeList.appendChild(noStoreMessage);
        }

        stores.forEach(store => {
            const storeItem = document.createElement('div');
            storeItem.className = 'store-item';            storeItem.innerHTML = `
                <h3>${store['Store name']}</h3>
                <p><strong>Địa chỉ:</strong> ${store['Address (No.Street, Ward/District, City, Province/State/Region)'] || 'N/A'}</p>
                <p style="color: #667eea; font-weight: bold;"><strong>Mã cửa hàng:</strong> ${store['Store code (Fieldcheck)'] || 'N/A'}</p>
                <p><strong>Kênh:</strong> ${store['Channel'] || 'N/A'}</p>
            `;
            storeItem.addEventListener('click', () => this.selectStore(store));
            storeList.appendChild(storeItem);
        });

        // Add admin access for admin users
        if (this.currentUser.role === 'Admin') {
            const adminItem = document.createElement('div');
            adminItem.className = 'store-item';
            adminItem.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
            adminItem.style.color = 'white';
            adminItem.innerHTML = `
                <h3><i class="fas fa-cog"></i> Quản trị</h3>
                <p>Truy cập các chức năng quản trị</p>
            `;
            adminItem.addEventListener('click', () => this.showScreen('adminScreen'));
            storeList.appendChild(adminItem);
        }
    }    showStores() {
        console.log('🏪 showStores() called');
        // Reset search filter when returning to stores
        const searchInput = document.getElementById('storeSearch');
        const clearButton = document.getElementById('clearFilter');
        if (searchInput) {
            searchInput.value = '';
            clearButton.classList.remove('show');
            this.hideDropdown();
        }
        console.log('🔄 Calling loadStores()...');
        this.loadStores();
    }async selectStore(store) {
        this.currentStore = store;
        this.sessionId = new Date().toISOString(); // Generate new session ID
        this.currentStep = 'before'; // Start with "before" step
        
        document.getElementById('selectedStoreName').textContent = `${store['Store name']} - Bước 1: Chụp ảnh TRƯỚC cải thiện`;
        await this.loadCategories();
    }    // New workflow methods
    showHistory() {
        // Add a referrer parameter to help with navigation
        const historyUrl = `/history.html?ref=stores`;
        window.open(historyUrl, '_blank');
    }    async proceedToAfterStep() {
        if (this.currentStep !== 'before') return;
        
        try {
            // Check if we have any photos to proceed with
            const categoriesWithPhotos = Object.values(this.categoryData).filter(data =>
                (data.beforeImages && data.beforeImages.length > 0) || (data.beforeNote && data.beforeNote.trim())
            );
            
            if (categoriesWithPhotos.length === 0) {
                throw new Error('Vui lòng chụp ít nhất 1 ảnh trước khi tiếp tục');
            }
            
            // Store before categories locally (no server upload yet)
            this.beforeCategories = categoriesWithPhotos.map(data => ({
                categoryId: data.id,
                categoryName: data.name,
                imageCount: data.beforeImages ? data.beforeImages.length : 0
            }));
            
            console.log('Before categories stored locally:', this.beforeCategories);
            
            // Switch to "after" step
            this.currentStep = 'after';
            
            // Update display to show after data
            this.updateCategoryDisplayForCurrentStep();
            
            document.getElementById('selectedStoreName').textContent = `${this.currentStore['Store name']} - Bước 2: Chọn danh mục cần chụp ảnh SAU cải thiện`;
            
            // Ensure we're on the category screen before rendering
            this.showScreen('categoryScreen');
            
            // Add a small delay to ensure DOM is ready
            setTimeout(() => {
                this.renderAfterCategorySelection();
                
                // Re-render all category images to show correct data for after step
                this.categories.forEach(category => {
                    this.renderCategoryImages(category.ID);
                });
            }, 50);
            
            this.saveSession(); // Save session with new step and before categories
            
        } catch (error) {
            console.error('Error proceeding to after step:', error);
            this.showToast(error.message || 'Không thể chuyển sang bước 2', 'error');
        }
    }async loadBeforeCategories() {
        try {
            const storeId = this.currentStore['Store code (Fieldcheck)'] || this.currentStore.STT;
            console.log(`Loading before categories for store: ${storeId}, sessionId: ${this.sessionId}`);
            
            const response = await fetch(`/api/before-categories/${storeId}?sessionId=${this.sessionId}`);
            
            if (response.ok) {
                this.beforeCategories = await response.json();
                console.log('Before categories loaded:', this.beforeCategories);
                
                if (this.beforeCategories.length === 0) {
                    console.warn('No before categories found');
                }
            } else {
                const errorData = await response.json();
                console.error('Failed to load before categories:', response.status, errorData);
                throw new Error(errorData.error || 'Failed to load before categories');
            }
        } catch (error) {
            console.error('Error loading before categories:', error);
            this.showToast('Không thể tải danh mục đã chụp', 'error');
            throw error; // Re-throw to handle in calling function
        }
    }    renderAfterCategorySelection() {
        const categoryList = document.getElementById('categoryList');
        
        // Add error handling for missing element
        if (!categoryList) {
            console.error('categoryList element not found. Make sure you are on the category screen.');
            // Try to switch to category screen first
            this.showScreen('categoryScreen');
            // Retry after a short delay
            setTimeout(() => {
                this.renderAfterCategorySelection();
            }, 100);
            return;
        }
        
        if (!this.beforeCategories || this.beforeCategories.length === 0) {
            categoryList.innerHTML = `
                <div class="after-step-container">
                    <div class="step-info">
                        <h3><i class="fas fa-exclamation-triangle"></i> Không có danh mục nào</h3>
                        <p>Không tìm thấy danh mục nào đã chụp ảnh "trước". Vui lòng quay lại bước 1 và chụp ảnh.</p>
                    </div>
                    
                    <div class="step-actions">
                        <button id="backToBeforeBtn" class="btn-secondary" onclick="app.backToBeforeStep()">
                            <i class="fas fa-arrow-left"></i> Quay lại bước 1
                        </button>
                    </div>
                </div>
            `;
            return;
        }
        
        categoryList.innerHTML = `
            <div class="after-step-container">
                <div class="step-info">
                    <h3><i class="fas fa-info-circle"></i> Bước 2: Chọn danh mục cần cải thiện</h3>
                    <p>Chọn các danh mục đã được cải thiện để chụp ảnh "sau":</p>
                </div>
                
                <div class="category-selection">
                    ${this.beforeCategories.map(category => `
                        <div class="category-selector">
                            <input type="checkbox" id="after-${category.categoryId}" 
                                   onchange="app.toggleAfterCategory('${category.categoryId}')">
                            <label for="after-${category.categoryId}">
                                <span class="category-name">${category.categoryName}</span>
                                <span class="before-info">(${category.imageCount} ảnh trước)</span>
                            </label>
                        </div>
                    `).join('')}
                </div>
                
                <div class="step-actions">
                    <button id="backToBeforeBtn" class="btn-secondary" onclick="app.backToBeforeStep()">
                        <i class="fas fa-arrow-left"></i> Quay lại bước 1
                    </button>
                    <button id="proceedToPhotoBtn" class="btn-primary" style="display: none;" onclick="app.startAfterPhotos()">
                        <i class="fas fa-camera"></i> Bắt đầu chụp ảnh
                    </button>
                </div>
            </div>
        `;
    }

    toggleAfterCategory(categoryId) {
        const checkbox = document.getElementById(`after-${categoryId}`);
        const proceedBtn = document.getElementById('proceedToPhotoBtn');
        
        if (checkbox.checked) {
            if (!this.selectedAfterCategories.includes(categoryId)) {
                this.selectedAfterCategories.push(categoryId);
            }
        } else {
            this.selectedAfterCategories = this.selectedAfterCategories.filter(id => id !== categoryId);
        }
        
        // Show/hide proceed button based on selection
        proceedBtn.style.display = this.selectedAfterCategories.length > 0 ? 'block' : 'none';
    }    async startAfterPhotos() {
        if (this.selectedAfterCategories.length === 0) {
            this.showToast('Vui lòng chọn ít nhất 1 danh mục', 'error');
            return;
        }
        
        // Don't filter categories - we need to keep all data
        // Just switch to showing the selected categories for after photos
        
        document.getElementById('selectedStoreName').textContent = `${this.currentStore['Store name']} - Bước 2: Chụp ảnh SAU cải thiện`;
        
        // Show only selected categories for after photos
        this.renderSelectedAfterCategories();
        
        // Re-render images for selected categories to show after data
        this.selectedAfterCategories.forEach(categoryId => {
            this.renderCategoryImages(categoryId);
        });
        
        this.saveSession();
    }

    renderSelectedAfterCategories() {
        const categoryList = document.getElementById('categoryList');
        categoryList.innerHTML = '';

        // Only show the selected categories for after photos
        this.categories.filter(category => 
            this.selectedAfterCategories.includes(category.ID)
        ).forEach(category => {
            const categoryItem = document.createElement('div');
            categoryItem.className = 'category-item';
            categoryItem.innerHTML = this.getCategoryHTML(category);
            categoryList.appendChild(categoryItem);
        });

        this.updateSubmitButton();
        this.updateSubmitButton();
    }    backToBeforeStep() {
        this.currentStep = 'before';
        this.selectedAfterCategories = [];
        
        // Update the display to show before data
        this.updateCategoryDisplayForCurrentStep();
        
        document.getElementById('selectedStoreName').textContent = `${this.currentStore['Store name']} - Bước 1: Chụp ảnh TRƯỚC cải thiện`;
        this.renderCategories(); // Re-render with before data
        
        // Re-render all category images to show delete buttons for before images
        this.categories.forEach(category => {
            this.renderCategoryImages(category.ID);
        });
        
        this.saveSession(); // Save session state
    }

    updateCategoryDisplayForCurrentStep() {
        // Update the legacy images/note fields based on current step
        for (const [categoryId, data] of Object.entries(this.categoryData)) {
            if (this.currentStep === 'before') {
                data.images = [...(data.beforeImages || [])];
                data.note = data.beforeNote || '';
            } else {
                data.images = [...(data.afterImages || [])];
                data.note = data.afterNote || '';
            }
        }
    }

    // Category management
    async loadCategories() {
        this.showLoading(true);

        try {
            const response = await fetch('/api/categories');
            if (response.ok) {
                this.categories = await response.json();
                this.initializeCategoryData();
                this.renderCategories();
                this.showScreen('categoryScreen');
            } else {
                this.showToast('Không thể tải danh mục', 'error');
            }
        } catch (error) {
            this.showToast('Lỗi kết nối', 'error');
        } finally {
            this.showLoading(false);
        }
    }    initializeCategoryData() {
        this.categoryData = {};
        this.categories.forEach(category => {
            this.categoryData[category.ID] = {
                id: category.ID,
                name: category.Category, // Use 'Category' field from CSV
                // Separate before and after data
                beforeImages: [],
                beforeNote: '',
                afterImages: [],
                afterNote: '',
                afterFixed: null, // null = not answered, true = yes, false = no
                // Legacy support for current step
                images: [],
                note: ''
            };
        });
    }

    renderCategories() {
        const categoryList = document.getElementById('categoryList');
        categoryList.innerHTML = '';

        this.categories.forEach(category => {
            const categoryItem = document.createElement('div');
            categoryItem.className = 'category-item';
            categoryItem.innerHTML = this.getCategoryHTML(category);
            categoryList.appendChild(categoryItem);
        });

        this.updateSubmitButton();
    }    getCategoryHTML(category) {
        const data = this.categoryData[category.ID];
        const imageCount = data.images.length;
        
        // Check if this category needs the yes/no question answered
        const needsAnswer = this.currentStep === 'after' && 
                           data.afterImages && data.afterImages.length > 0 && 
                           (data.afterFixed === undefined || data.afterFixed === null);

        // Fixed question HTML - only show for step 2 (after)
        const fixedQuestionHTML = this.currentStep === 'after' ? `
            <div class="fixed-question ${needsAnswer ? 'needs-answer' : ''}">
                <label>Lỗi POSM/Quầy kệ đã được fix chưa? ${needsAnswer ? '<span class="required-indicator">*</span>' : ''}</label>
                <div class="fixed-options">
                    <label class="radio-option">
                        <input type="radio" name="fixed-${category.ID}" value="yes" 
                               ${data.afterFixed === true ? 'checked' : ''}
                               onchange="app.updateFixed('${category.ID}', true)">
                        <span>Đã fix</span>
                    </label>
                    <label class="radio-option">
                        <input type="radio" name="fixed-${category.ID}" value="no" 
                               ${data.afterFixed === false ? 'checked' : ''}
                               onchange="app.updateFixed('${category.ID}', false)">
                        <span>Chưa fix</span>
                    </label>
                </div>
                ${needsAnswer ? '<div class="warning-text">⚠️ Vui lòng trả lời câu hỏi này để có thể gửi kết quả</div>' : ''}
            </div>
        ` : '';

        return `
            <div class="category-header">
                <h3>${category.Category}</h3>
                <span class="image-count">${imageCount}/8</span>
            </div>
            
            <div class="image-upload-area">
                <div class="upload-options">
                    <button class="upload-btn camera-btn" onclick="app.triggerCameraCapture('${category.ID}')">
                        <i class="fas fa-camera"></i>
                        <span>Chụp ảnh</span>
                    </button>
                    <button class="upload-btn file-btn" onclick="app.triggerFileUpload('${category.ID}')">
                        <i class="fas fa-upload"></i>
                        <span>Tải ảnh lên</span>
                    </button>
                </div>
                <small>Tối đa 8 ảnh mỗi danh mục</small>
            </div>
            
            <input type="file" id="cameraInput-${category.ID}" class="hidden-file-input"
                   accept="image/*" multiple capture="environment"
                   onchange="app.handleImageUpload('${category.ID}', this)">
            <input type="file" id="fileInput-${category.ID}" class="hidden-file-input"
                   accept="image/*" multiple
                   onchange="app.handleImageUpload('${category.ID}', this)">            <div class="image-preview" id="imagePreview-${category.ID}">
                ${this.getImagePreviewHTML(data.images, category.ID)}
            </div>
            
            <div class="category-footer">
                ${fixedQuestionHTML}
                <div class="note-section">
                    <label class="note-label">Ghi chú:</label>
                    <textarea class="note-input" 
                              placeholder="Nhập ghi chú cho danh mục này..." 
                              value="${data.note}"
                              oninput="app.updateNote('${category.ID}', this.value)"></textarea>
                </div>
            </div>
        `;
    }

    getImagePreviewHTML(images, categoryId) {
        return images.map((image, index) => `
            <div class="image-preview-item">
                <img src="${image}" alt="Preview ${index + 1}" onclick="app.viewImage('${image}')">
                <button class="remove-image-btn" onclick="app.removeImage('${categoryId}', ${index})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    }

    // Image handling
    triggerCameraCapture(categoryId) {
        document.getElementById(`cameraInput-${categoryId}`).click();
    }

    triggerFileUpload(categoryId) {
        document.getElementById(`fileInput-${categoryId}`).click();
    }    async handleImageUpload(categoryId, input) {
        const files = Array.from(input.files);
        const data = this.categoryData[categoryId];
        
        // Determine which image array to use based on current step
        const currentImages = this.currentStep === 'before' ? data.beforeImages : data.afterImages;
        
        if (currentImages.length + files.length > 8) {
            this.showToast('Tối đa 8 ảnh mỗi danh mục', 'error');
            return;
        }

        this.showLoading(true, 'Đang xử lý ảnh...');

        try {
            for (const file of files) {
                const compressedImage = await this.compressImage(file);
                currentImages.push(compressedImage);
            }
            
            // Update legacy images array for current step (for rendering)
            data.images = [...currentImages];
            
            this.renderCategoryImages(categoryId);
            this.updateSubmitButton();
            this.saveSession(); // Save after adding images
        } catch (error) {
            console.error('Error processing images:', error);
            this.showToast('Lỗi xử lý ảnh', 'error');
        } finally {
            this.showLoading(false);
            input.value = ''; // Reset input
        }
    }

    async compressImage(file, maxWidth = 1200, quality = 0.8) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                // Calculate new dimensions
                let { width, height } = img;
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Draw and compress
                ctx.drawImage(img, 0, 0, width, height);
                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedDataUrl);
            };
            
            img.src = URL.createObjectURL(file);
        });
    }    renderCategoryImages(categoryId) {
        const previewContainer = document.getElementById(`imagePreview-${categoryId}`);
        const data = this.categoryData[categoryId];
        previewContainer.innerHTML = this.getImagePreviewHTML(data.images, categoryId);
        
        // Update image count
        const countElement = previewContainer.parentElement.querySelector('.image-count');
        countElement.textContent = `${data.images.length}/8`;
        
        // If we're in step 2 (after) and this category now has images, 
        // we need to re-render the entire category to show/update the yes/no question
        if (this.currentStep === 'after' && data.afterImages && data.afterImages.length > 0) {
            // Find the category in the categories array
            const category = this.categories.find(cat => cat.ID === categoryId);
            if (category) {
                // Find the category item element and update its HTML
                const categoryItems = document.querySelectorAll('.category-item');
                categoryItems.forEach(item => {
                    const categoryHeader = item.querySelector('.category-header h3');
                    if (categoryHeader && categoryHeader.textContent === category.Category) {
                        item.innerHTML = this.getCategoryHTML(category);
                    }
                });
            }
        }
    }removeImage(categoryId, index) {
        const data = this.categoryData[categoryId];
        
        // Remove from the correct array based on current step
        const currentImages = this.currentStep === 'before' ? data.beforeImages : data.afterImages;
        currentImages.splice(index, 1);
        
        // Update legacy images array for rendering
        data.images = [...currentImages];
        
        this.renderCategoryImages(categoryId);
        this.updateSubmitButton();
        this.saveSession(); // Save after removing image
    }

    viewImage(imageSrc) {
        // Create modal to view full-size image
        const modal = document.createElement('div');
        modal.className = 'image-modal';
        modal.innerHTML = `
            <div class="image-modal-content">
                <span class="image-modal-close">&times;</span>
                <img src="${imageSrc}" alt="Full size image">
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close modal events
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.className === 'image-modal-close') {
                document.body.removeChild(modal);
            }
        });
    }    updateNote(categoryId, note) {
        const data = this.categoryData[categoryId];
        
        // Update the correct note field based on current step
        if (this.currentStep === 'before') {
            data.beforeNote = note;
        } else {
            data.afterNote = note;
        }
        
        // Update legacy note field for compatibility
        data.note = note;
        
        this.saveSession(); // Save after updating note
    }    updateFixed(categoryId, isFixed) {
        const data = this.categoryData[categoryId];
        data.afterFixed = isFixed;
        this.updateSubmitButton(); // Update submit button after changing fixed status
        this.saveSession(); // Save after updating fixed status
    }// Submit handling
    updateSubmitButton() {
        const submitBtn = document.getElementById('submitBtn');
        const proceedBtn = document.getElementById('proceedToAfterBtn');
        
        const hasImages = Object.values(this.categoryData).some(data => data.images.length > 0);
        
        if (this.currentStep === 'before') {
            // Show proceed button for "before" step
            if (proceedBtn) {
                proceedBtn.style.display = hasImages ? 'block' : 'none';
            }
            if (submitBtn) {
                submitBtn.style.display = 'none';
            }
        } else if (this.currentStep === 'after') {
            // Check if all selected after categories have answered the yes/no question
            const hasImagesAfter = Object.values(this.categoryData).some(data => data.afterImages && data.afterImages.length > 0);
            let allQuestionsAnswered = true;
            
            // Validate that all selected after categories with images have answered the question
            for (const categoryId of this.selectedAfterCategories) {
                const data = this.categoryData[categoryId];
                if (data && data.afterImages && data.afterImages.length > 0) {
                    // Check if the yes/no question has been answered
                    if (data.afterFixed === undefined || data.afterFixed === null) {
                        allQuestionsAnswered = false;
                        break;
                    }
                }
            }
              // Show submit button if has images, but disable if questions aren't answered
            if (submitBtn) {
                if (hasImagesAfter) {
                    submitBtn.style.display = 'block';
                    
                    // Update button text and style based on validation
                    if (!allQuestionsAnswered) {
                        submitBtn.textContent = 'Vui lòng trả lời tất cả câu hỏi "Đã sửa chưa?"';
                        submitBtn.style.backgroundColor = '#dc3545';
                        submitBtn.style.cursor = 'not-allowed';
                        submitBtn.disabled = true;
                    } else {
                        submitBtn.textContent = 'Gửi kết quả';
                        submitBtn.style.backgroundColor = '#28a745';
                        submitBtn.style.cursor = 'pointer';
                        submitBtn.disabled = false;
                    }
                } else {
                    submitBtn.style.display = 'none';
                }
            }
            if (proceedBtn) {
                proceedBtn.style.display = 'none';
            }
        }
    }    async handleSubmitClick() {
        // Double-check validation before submitting
        if (this.currentStep === 'after') {
            const submitBtn = document.getElementById('submitBtn');
            if (submitBtn && submitBtn.disabled) {
                this.showToast('Vui lòng trả lời tất cả câu hỏi "Đã sửa chưa?" trước khi gửi', 'error');
                return;
            }
            await this.handleSubmit('after');
        }
    }async handleSubmit(step) {
        if (step === 'after') {
            // For step 2 (after), submit both before and after data
            await this.submitBothSteps();
        } else {
            // For step 1 (before), this shouldn't happen in the new workflow
            this.showToast('Vui lòng hoàn thành bước 2 để gửi dữ liệu', 'error');
        }
    }    async submitBothSteps() {
        // First, validate that all selected after categories with images have answered the yes/no question
        const unansweredCategories = [];
        for (const categoryId of this.selectedAfterCategories) {
            const data = this.categoryData[categoryId];
            if (data && data.afterImages && data.afterImages.length > 0) {
                if (data.afterFixed === undefined || data.afterFixed === null) {
                    unansweredCategories.push(data.name || categoryId);
                }
            }
        }
        
        if (unansweredCategories.length > 0) {
            this.showToast(`Vui lòng trả lời câu hỏi "Đã sửa chưa?" cho các danh mục: ${unansweredCategories.join(', ')}`, 'error');
            return;
        }
        
        // Get step 1 (before) data - categories that have before images
        const beforeCategoriesWithData = [];
        
        // Get step 2 (after) data - only selected categories with after images
        const afterCategoriesWithData = [];
        
        // Separate before and after data
        for (const [categoryId, data] of Object.entries(this.categoryData)) {
            // Check if this category has before images (from step 1)
            if (data.beforeImages && data.beforeImages.length > 0) {
                beforeCategoriesWithData.push({
                    id: categoryId,
                    name: data.name,
                    images: data.beforeImages,
                    note: data.beforeNote || ''
                });
            }
            
            // Check if this category was selected for after and has after images
            if (this.selectedAfterCategories.includes(categoryId) && 
                data.afterImages && data.afterImages.length > 0) {
                afterCategoriesWithData.push({
                    id: categoryId,
                    name: data.name,
                    images: data.afterImages,
                    note: data.afterNote || '',
                    fixed: data.afterFixed // Include the fixed status
                });
            }
        }

        if (beforeCategoriesWithData.length === 0) {
            this.showToast('Vui lòng chụp ít nhất 1 ảnh ở bước 1', 'error');
            return;
        }

        if (afterCategoriesWithData.length === 0) {
            this.showToast('Vui lòng chụp ít nhất 1 ảnh ở bước 2', 'error');
            return;
        }

        this.showLoading(true, 'Đang gửi dữ liệu...');

        try {
            const storeId = this.currentStore['Store code (Fieldcheck)'] || this.currentStore.STT;
            
            // Submit step 1 (before) data
            const beforeSubmissionData = {
                userId: this.currentUser.id,
                username: this.currentUser.username,
                storeId: storeId,
                storeName: this.currentStore['Store name'],
                step: 'before',
                sessionId: this.sessionId,
                categories: beforeCategoriesWithData.map(data => ({
                    categoryId: data.id,
                    categoryName: data.name,
                    images: data.images,
                    note: data.note
                }))
            };

            console.log('Submitting step 1 (before) data:', {
                categoriesCount: beforeSubmissionData.categories.length,
                sessionId: this.sessionId
            });

            const beforeResponse = await fetch('/api/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(beforeSubmissionData)
            });

            if (!beforeResponse.ok) {
                const errorData = await beforeResponse.json();
                throw new Error(errorData.error || 'Gửi dữ liệu bước 1 thất bại');
            }

            // Submit step 2 (after) data
            const afterSubmissionData = {
                userId: this.currentUser.id,
                username: this.currentUser.username,
                storeId: storeId,
                storeName: this.currentStore['Store name'],
                step: 'after',
                sessionId: this.sessionId,
                categories: afterCategoriesWithData.map(data => ({
                    categoryId: data.id,
                    categoryName: data.name,
                    images: data.images,
                    note: data.note,
                    fixed: data.fixed // Include the fixed status in submission
                }))
            };

            console.log('Submitting step 2 (after) data:', {
                categoriesCount: afterSubmissionData.categories.length,
                sessionId: this.sessionId
            });

            const afterResponse = await fetch('/api/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(afterSubmissionData)
            });            if (!afterResponse.ok) {
                const errorData = await afterResponse.json();
                throw new Error(errorData.error || 'Gửi dữ liệu bước 2 thất bại');
            }            // Both submissions successful
            console.log('✅ Both submissions completed successfully');
            this.showToast('Gửi dữ liệu thành công! Cảm ơn bạn đã hoàn thành kiểm tra.', 'success');
            
            // Clear session after successful submission
            this.clearSession();
            
            // Reset app state
            this.currentStore = null;
            this.currentStep = 'before';
            this.sessionId = null;
            this.beforeCategories = [];
            this.selectedAfterCategories = [];
            this.categoryData = {};
            
            console.log('🔄 Starting redirect process...');
            // Hide loading overlay first
            this.showLoading(false);            // Return to stores screen with a small delay to let UI update
            setTimeout(() => {
                console.log('🏪 Calling showStores()...');
                try {
                    this.showStores();
                    console.log('✅ showStores() completed successfully');
                } catch (error) {
                    console.error('❌ Error in showStores():', error);
                    // Fallback: try to show store screen directly
                    console.log('🔄 Fallback: showing store screen directly...');
                    this.showScreen('storeScreen');
                }
            }, 500);} catch (error) {
            console.error('Error submitting data:', error);
            this.showToast(error.message || 'Lỗi gửi dữ liệu', 'error');
            this.showLoading(false); // Hide loading on error
        }
    }

    // Store search functionality
    handleStoreSearch(e) {
        const searchTerm = e.target.value.toLowerCase().trim();
        const clearButton = document.getElementById('clearFilter');
        
        if (searchTerm === '') {
            this.filteredStores = this.allStores;
            clearButton.classList.remove('show');
            this.hideDropdown();
        } else {
            // Filter stores based on search term
            this.filteredStores = this.allStores.filter(store =>
                store['Store name'].toLowerCase().includes(searchTerm) ||
                (store['Store code (Fieldcheck)'] && store['Store code (Fieldcheck)'].toLowerCase().includes(searchTerm)) ||
                (store['Address (No.Street, Ward/District, City, Province/State/Region)'] &&
                 store['Address (No.Street, Ward/District, City, Province/State/Region)'].toLowerCase().includes(searchTerm))
            );
            clearButton.classList.add('show');
            this.showDropdown(searchTerm);
        }
        
        this.renderStores(this.filteredStores);
        this.selectedDropdownIndex = -1; // Reset selection
    }

    handleSearchKeydown(e) {
        const dropdown = document.getElementById('searchDropdown');
        const items = dropdown.querySelectorAll('.dropdown-item');
        
        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedDropdownIndex = Math.min(this.selectedDropdownIndex + 1, items.length - 1);
                this.updateDropdownSelection(items);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.selectedDropdownIndex = Math.max(this.selectedDropdownIndex - 1, -1);
                this.updateDropdownSelection(items);
                break;
            case 'Enter':
                e.preventDefault();
                if (this.selectedDropdownIndex >= 0 && items[this.selectedDropdownIndex]) {
                    const storeName = items[this.selectedDropdownIndex].textContent;
                    document.getElementById('storeSearch').value = storeName;
                    this.hideDropdown();
                    this.handleStoreSearch({ target: { value: storeName } });
                }
                break;
            case 'Escape':
                this.hideDropdown();
                break;
        }
    }

    handleSearchFocus() {
        const searchTerm = document.getElementById('storeSearch').value.toLowerCase().trim();
        if (searchTerm) {
            this.showDropdown(searchTerm);
        }
    }

    showDropdown(searchTerm) {
        const dropdown = document.getElementById('searchDropdown');
        
        // Filter store names for autocomplete
        const matchingNames = this.allStoreNames.filter(name =>
            name.toLowerCase().includes(searchTerm)
        ).slice(0, 10); // Limit to 10 suggestions
        
        if (matchingNames.length > 0) {
            dropdown.innerHTML = matchingNames.map(name =>
                `<div class="dropdown-item">${name}</div>`
            ).join('');
            
            // Add click handlers
            dropdown.querySelectorAll('.dropdown-item').forEach(item => {
                item.addEventListener('click', () => {
                    document.getElementById('storeSearch').value = item.textContent;
                    this.hideDropdown();
                    this.handleStoreSearch({ target: { value: item.textContent } });
                });
            });
            
            dropdown.classList.add('show');
        } else {
            this.hideDropdown();
        }
    }

    updateDropdownSelection(items) {
        items.forEach((item, index) => {
            item.classList.toggle('selected', index === this.selectedDropdownIndex);
        });
    }

    hideDropdown() {
        document.getElementById('searchDropdown').classList.remove('show');
        this.selectedDropdownIndex = -1;
    }

    clearStoreFilter() {
        document.getElementById('storeSearch').value = '';
        document.getElementById('clearFilter').classList.remove('show');
        this.filteredStores = this.allStores;
        this.renderStores(this.allStores);
        this.hideDropdown();
    }

    handleClickOutside(e) {
        const searchContainer = document.querySelector('.search-container');
        if (searchContainer && !searchContainer.contains(e.target)) {
            this.hideDropdown();
        }
    }

    // User info loading for change password
    async loadUserInfo() {
        const userId = document.getElementById('changePasswordUserIdInput').value.trim();
        
        if (!userId) {
            this.showToast('Vui lòng nhập User ID', 'error');
            return;
        }
        
        this.showLoading(true);
        
        try {
            const response = await fetch(`/api/user-info/${userId}`);
            
            if (response.ok) {
                const userInfo = await response.json();
                
                // Update UI with user info
                document.getElementById('changePasswordUsername').textContent = userInfo.username;
                document.getElementById('changePasswordUserId').textContent = `ID: ${userInfo.id}`;
                document.getElementById('changePasswordRole').textContent = userInfo.role;
                
                // Show user info card and hide user ID input
                document.querySelector('.user-info-card').style.display = 'block';
                document.getElementById('userIdGroup').style.display = 'none';
                
                this.showToast('Thông tin người dùng đã được tải', 'success');
            } else {
                const error = await response.json();
                this.showToast(error.error || 'Không tìm thấy người dùng', 'error');
            }
        } catch (error) {
            console.error('Error loading user info:', error);
            this.showToast('Lỗi kết nối', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Admin functions
    async handleExport() {
        this.showLoading(true, 'Đang xuất dữ liệu...');
        
        try {
            const response = await fetch('/api/export');
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `store-inspection-export-${new Date().toISOString().split('T')[0]}.xlsx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                
                this.showToast('Xuất dữ liệu thành công!', 'success');
            } else {
                const error = await response.json();
                this.showToast(error.error || 'Lỗi xuất dữ liệu', 'error');
            }
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('Lỗi kết nối', 'error');
        } finally {
            this.showLoading(false);
        }
    }    handleBackToStores() {
        console.log('🔙 Handling back to stores - cleaning up state');
        
        try {
            // Clear current selection state
            this.currentStore = null;
            this.currentStep = 'before';
            this.sessionId = null;
            this.beforeCategories = [];
            this.selectedAfterCategories = [];
            this.categoryData = {};
            
            // Clear any saved session data
            this.clearSession();
            
            console.log('🏪 Calling showStores()...');
            this.showStores();
        } catch (error) {
            console.error('❌ Error in handleBackToStores():', error);
            // Fallback: try to show store screen directly
            console.log('🔄 Fallback: showing store screen directly...');
            try {
                this.showScreen('storeScreen');
                // Also try to load stores if possible
                if (this.allStores && this.allStores.length > 0) {
                    this.renderStores(this.allStores);
                }
            } catch (fallbackError) {
                console.error('❌ Even fallback failed:', fallbackError);
                // Last resort: reload the page
                location.reload();
            }
        }
    }
}

// Initialize the app
const app = new App();