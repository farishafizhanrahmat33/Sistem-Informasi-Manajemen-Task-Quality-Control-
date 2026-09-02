// --- 1. LOGIKA TEMA (Global) ---
function setTheme(mode) {
    let activeTheme = mode;
    if (mode === 'system') {
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        activeTheme = systemDark ? 'dark' : 'light';
    }

    document.documentElement.setAttribute('data-theme', activeTheme);
    localStorage.setItem('user_theme_preference', mode);
    updateThemeUI(mode);
}

function updateThemeUI(mode) {
    const iconEl = document.getElementById('currentThemeIcon');
    const textEl = document.getElementById('currentThemeText');
    
    if (iconEl && textEl) {
        if (mode === 'light') {
            iconEl.innerText = '☀️'; 
            textEl.innerText = 'Light';
        } else if (mode === 'dark') {
            iconEl.innerText = '🌙'; 
            textEl.innerText = 'Dark';
        } else {
            iconEl.innerText = '💻'; 
            textEl.innerText = 'System';
        }
    }
}

document.addEventListener("DOMContentLoaded", function() {
    const savedPref = localStorage.getItem('user_theme_preference') || 'system';
    setTheme(savedPref);
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (localStorage.getItem('user_theme_preference') === 'system') {
        setTheme('system');
    }
});


// --- 2. LOGIKA TASK MANAGEMENT (Penyortiran & Pengurutan Data) ---
let itemsToShow = 9;

function initTabs() {
    const tabs = document.querySelectorAll('.filter-tab');
    if (tabs.length === 0) return;

    const savedTab = localStorage.getItem('activeTab') || 'All';

    tabs.forEach(tab => {
        if (tab.getAttribute('data-status') === savedTab) {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        }

        tab.addEventListener('click', function() {
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            const status = this.getAttribute('data-status');
            localStorage.setItem('activeTab', status);
            resetAndFilter();
        });
    });
}

function filterTasks() {
    const container = document.getElementById('taskContainer');
    if (!container) return; 

    const currentCategory = localStorage.getItem('activeTab') || 'All';
    const projectEl = document.getElementById('projectFilter');
    const packageEl = document.getElementById('packageFilter');
    const searchEl = document.getElementById('searchInput');
    const sortFieldEl = document.getElementById('sortField');
    const sortOrderEl = document.getElementById('sortOrder');

    const selectedProject = projectEl ? projectEl.value : 'All';
    const selectedPackage = packageEl ? packageEl.value : 'All';
    const searchQuery = searchEl ? searchEl.value.toLowerCase().trim() : '';
    
    const sortBy = sortFieldEl ? sortFieldEl.value : 'updated';
    const sortOrder = sortOrderEl ? sortOrderEl.value : 'desc';
    
    let taskItems = Array.from(document.querySelectorAll('.task-item'));
    
    // SORTING (PENGURUTAN)
    taskItems.sort((a, b) => {
        let valA = a.getAttribute('data-' + sortBy);
        let valB = b.getAttribute('data-' + sortBy);

        if (sortBy === 'pullable' || sortBy === 'updated') {
            valA = parseFloat(valA) || 0;
            valB = parseFloat(valB) || 0;
        } else {
            valA = valA ? valA.toString().toLowerCase() : '';
            valB = valB ? valB.toString().toLowerCase() : '';
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    taskItems.forEach(item => container.appendChild(item));

    // FILTERING & MENGHITUNG JUMLAH (COUNTING)
    let matchingItems = [];
    let tabCounts = { 'All': 0 }; // Objek untuk menyimpan jumlah task tiap tab

    taskItems.forEach(item => {
        const cat = item.getAttribute('data-category'); 
        
        // Tentukan di tab mana item ini seharusnya berada
        let effectiveTab = cat;
        if (cat === 'Sample Done' || cat === 'Waiting Inspect' || cat === 'waiting inspect' || cat === 'Waiting for Inspect') {
            effectiveTab = 'Sample Done';
        }

        // Cek kategori mana yang sedang diklik user
        let matchesCategory = false;
        if (currentCategory === 'All') {
            matchesCategory = true;
        } else {
            matchesCategory = (effectiveTab === currentCategory);
        }

        const proj = item.getAttribute('data-project');
        const pkg = item.getAttribute('data-package');
        const text = item.getAttribute('data-search');
        
        // Cek apakah data lolos filter dropdown Project, Package, atau Kolom Pencarian
        let matchesOtherFilters = (selectedProject === 'All' || proj === selectedProject) && 
                                  (selectedPackage === 'All' || pkg === selectedPackage) && 
                                  (searchQuery === '' || text.includes(searchQuery));

        // JIKA LOLOS FILTER PENCARIAN -> TAMBAHKAN KE HITUNGAN ANGKA TAB
        if (matchesOtherFilters) {
            tabCounts['All']++; // Tambah 1 ke tab 'All'
            tabCounts[effectiveTab] = (tabCounts[effectiveTab] || 0) + 1; // Tambah 1 ke tab spesifik
        }

        // JIKA LOLOS SEMUA FILTER (termasuk tab aktif) -> TAMPILKAN DI LAYAR
        if (matchesCategory && matchesOtherFilters) {
            matchingItems.push(item);
        }
    });

    // UPDATE ANGKA VISUAL DI MASING-MASING TAB
    const tabsList = document.querySelectorAll('.filter-tab');
    tabsList.forEach(tab => {
        const status = tab.getAttribute('data-status');
        const count = tabCounts[status] || 0; 
        
        let badge = tab.querySelector('.task-count-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'task-count-badge'; // Style murni diatur oleh CSS di atas
            tab.appendChild(badge);
        }
        badge.innerText = count; 
    });

    // TAMPILKAN DATA (Sembunyikan sisanya dan atur limit Load More)
    taskItems.forEach(item => item.style.display = 'none');
    matchingItems.slice(0, itemsToShow).forEach(item => item.style.display = 'block');
    
    renderLoadMoreButton(matchingItems.length);
    
    const emptyMsg = document.getElementById('emptyFilterMessage');
    if (emptyMsg) {
        container.appendChild(emptyMsg);
        emptyMsg.style.display = (matchingItems.length === 0) ? 'block' : 'none';
    }
}

function resetAndFilter() { 
    itemsToShow = 9; 
    filterTasks(); 
}

function loadMore() { 
    itemsToShow += 9; 
    filterTasks(); 
}

function renderLoadMoreButton(totalMatches) {
    let container = document.getElementById('loadMoreContainer');
    if (!container) return;
    if (itemsToShow < totalMatches) {
        container.innerHTML = `<button class="btn btn-outline-secondary px-4 py-2 fw-semibold" onclick="loadMore()">Load More</button>`;
    } else { 
        container.innerHTML = ''; 
    }
}

// FUNGSI SINKRONISASI DATA PINTAR
async function syncDataNow() {
    try {
        const response = await fetch(window.location.href);
        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const newContainer = doc.getElementById('taskContainer');
        const currentContainer = document.getElementById('taskContainer');
        
        if (newContainer && currentContainer && newContainer.innerHTML !== currentContainer.innerHTML) {
            currentContainer.innerHTML = newContainer.innerHTML;
            filterTasks(); 
        }
    } catch (e) { console.log('Background update waiting...'); }
}

async function autoUpdateTasks() {
    // Jangan update jika modal terbuka agar pekerjaan pengguna tidak terganggu
    if (!document.getElementById('taskContainer') || document.querySelector('.modal.show') || document.body.classList.contains('modal-open')) return;
    syncDataNow();
}


// --- 3. EVENT LISTENERS UTAMA ---
document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    filterTasks();
    setInterval(autoUpdateTasks, 5000);
});

// AUTO SINKRONISASI KETIKA MODAL DITUTUP
document.addEventListener('hidden.bs.modal', function () {
    // Jika user baru saja menutup modal task, diam-diam perbarui kartu di belakangnya
    setTimeout(syncDataNow, 300);
});

/* ==========================================================================
   AJAX FORM SUBMISSION (Simpan Tanpa Reload Halaman / Modal Hilang)
   ========================================================================== */
document.addEventListener('submit', async function(e) {
    // Cegat hanya form yang ada hubungannya dengan Update, Send, atau Skip
    if (e.target && (
        e.target.action.includes('/update/') || 
        e.target.action.includes('/toggle_send/') || 
        e.target.action.includes('/toggle_skip/')
    )) {
        e.preventDefault(); // Hentikan sifat reload halaman bawaan HTML
        
        const form = e.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        if (!submitBtn) return;
        
        const originalText = submitBtn.innerHTML;
        const originalClass = submitBtn.className;
        
        // Buat tombol jadi indikator loading
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';
        submitBtn.disabled = true;

        try {
            const formData = new FormData(form);
            // Kirim data ke Python (Backend) di belakang layar
            const response = await fetch(form.action, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                // Beri tahu user bahwa data sukses disimpan
                submitBtn.innerHTML = '✓ Success!';
                submitBtn.className = 'btn btn-success w-100 py-2 fw-bold text-white';
                
                // Kembalikan teks tombol setelah 2 detik
                setTimeout(() => {
                    submitBtn.innerHTML = originalText;
                    submitBtn.className = originalClass;
                    submitBtn.disabled = false;
                }, 2000);
            }
        } catch (error) {
            submitBtn.innerHTML = '❌ Failed!';
            submitBtn.className = 'btn btn-danger w-100 py-2 fw-bold text-white';
            setTimeout(() => {
                submitBtn.innerHTML = originalText;
                submitBtn.className = originalClass;
                submitBtn.disabled = false;
            }, 2000);
        }
    }
});


// Tombol kembali ke atas
window.addEventListener('scroll', function() {
    const btn = document.getElementById('scrollToTopBtn');
    if (btn) {
        if (window.pageYOffset > 300) {
            btn.classList.remove('d-none'); btn.classList.add('d-flex');
        } else {
            btn.classList.remove('d-flex'); btn.classList.add('d-none');
        }
    }
});

const scrollToTopBtn = document.getElementById('scrollToTopBtn');
if (scrollToTopBtn) {
    scrollToTopBtn.addEventListener('click', function() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// FITUR PENAMPIL PDF DOKUMEN
function openPdfViewer(fileUrl, fileName) {
    document.getElementById('pdfFileName').innerText = fileName;
    document.getElementById('pdfIframe').src = fileUrl + "#toolbar=0&navpanes=0&scrollbar=0";
    document.getElementById('btnPdfFullscreen').href = fileUrl;
    
    const pdfModalEl = document.getElementById('pdfViewerModal');
    if (pdfModalEl) {
        const myModal = new bootstrap.Modal(pdfModalEl);
        myModal.show();
    }
}

document.addEventListener("DOMContentLoaded", function() {
    const pdfModalEl = document.getElementById('pdfViewerModal');
    if (pdfModalEl) {
        pdfModalEl.addEventListener('hidden.bs.modal', function () {
            const pdfIframe = document.getElementById('pdfIframe');
            const btnPdfFullscreen = document.getElementById('btnPdfFullscreen');
            if (pdfIframe) pdfIframe.src = "";
            if (btnPdfFullscreen) btnPdfFullscreen.href = "#";
        });
    }
});

// CUSTOM AUTOCOMPLETE DROPDOWN UNTUK INPUT PROYEK
document.addEventListener("DOMContentLoaded", function() {
    const input = document.getElementById('projectNameInput');
    const list = document.getElementById('projectSuggestionsList');
    
    if (input && list) {
        const items = list.querySelectorAll('.project-suggestion-item');
        input.addEventListener('focus', function() {
            if (items.length > 0) list.style.display = 'block';
        });
        
        input.addEventListener('input', function() {
            const filter = input.value.toLowerCase().trim();
            let hasVisible = false;
            items.forEach(item => {
                if (item.textContent.toLowerCase().includes(filter)) {
                    item.style.display = 'block';
                    hasVisible = true;
                } else {
                    item.style.display = 'none';
                }
            });
            list.style.display = (hasVisible && filter !== '') ? 'block' : (items.length > 0 && filter === '' ? 'block' : 'none');
        });
        
        items.forEach(item => {
            item.addEventListener('click', function(e) {
                e.preventDefault();
                input.value = this.getAttribute('data-value');
                list.style.display = 'none';
            });
        });
        
        document.addEventListener('click', function(e) {
            if (!input.contains(e.target) && !list.contains(e.target)) list.style.display = 'none';
        });
    }
});

// AUTO-DISMISS FLASH NOTIFICATION
document.addEventListener("DOMContentLoaded", function() {
    const alerts = document.querySelectorAll('.alert');
    if (alerts.length > 0) {
        setTimeout(function() {
            alerts.forEach(alertEl => {
                const bsAlert = bootstrap.Alert.getOrCreateInstance(alertEl);
                if (bsAlert) bsAlert.close();
            });
        }, 3000);
    }
});


function filterAndSortCards() {
    const stationFilter = document.getElementById('stationFilter');
    const sortField = document.getElementById('sortField');
    const sortOrder = document.getElementById('sortOrder');
    const container = document.getElementById('qrCardsContainer');
    const badge = document.getElementById('activeFilterBadge');
    
    if (!container) return;

    const filterVal = stationFilter ? stationFilter.value : 'All';
    const fieldVal = sortField ? sortField.value : 'scene';
    const sortVal = sortOrder ? sortOrder.value : 'asc';
    const cards = Array.from(container.getElementsByClassName('qr-card-item'));

    // Indikator Badge aktif/tidak
    if (badge) {
        if (filterVal !== 'All') {
            badge.classList.remove('d-none');
        } else {
            badge.classList.add('d-none');
        }
    }

    // Filter berdasarkan Station
    cards.forEach(card => {
        const subtitle = card.getAttribute('data-subtitle');
        if (filterVal === 'All' || subtitle === filterVal) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });

    // Urutkan kartu berdasarkan field yang dipilih (Scene Number atau Station Name)
    cards.sort((a, b) => {
        if (fieldVal === 'station') {
            const subA = (a.getAttribute('data-subtitle') || '').toLowerCase();
            const subB = (b.getAttribute('data-subtitle') || '').toLowerCase();
            const comparison = subA.localeCompare(subB);
            return sortVal === 'asc' ? comparison : -comparison;
        } else {
            // Default: Scene Number
            const sceneA = parseInt(a.getAttribute('data-scene')) || 0;
            const sceneB = parseInt(b.getAttribute('data-scene')) || 0;
            return sortVal === 'asc' ? (sceneA - sceneB) : (sceneB - sceneA);
        }
    });

    // Susun ulang urutan elemen di dalam container HTML
    cards.forEach(card => container.appendChild(card));
}