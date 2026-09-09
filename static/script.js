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


// --- 2. LOGIKA TASK MANAGEMENT ---
// PENTING: pencarian, filter (project/package), tab status, dan sort SEKARANG
// dikerjakan oleh SERVER (Flask), bukan JavaScript. Alasannya: browser hanya
// pernah menerima 50 task per halaman (hasil pagination), jadi menghitung atau
// menyaring data lewat JS hanya akan melihat 50 data itu saja -- bukan seluruh
// data yang ada di database. Sekarang JS hanya bertugas:
//   1. Menyusun ulang URL (query string) sesuai pilihan user, lalu reload halaman
//      supaya Flask yang menghitung & memfilter dari SELURUH data.
//   2. Menampilkan progresif ("Load More") task yang sudah dikirim server
//      untuk halaman saat ini (tanpa menyaring ulang).
let itemsToShow = 15;
let searchDebounceTimer = null;

// Ambil filter/search/sort yang sedang aktif dari URL saat ini
function getCurrentFilterState() {
    const params = new URLSearchParams(window.location.search);
    return {
        status: params.get('status') || 'All',
        q: params.get('q') || '',
        project: params.get('project') || 'All',
        package: params.get('package') || 'All',
        sort_by: params.get('sort_by') || 'updated',
        sort_order: params.get('sort_order') || 'desc',
    };
}

// Bangun URL baru dengan filter yang di-override, lalu reset ke page 1
// (karena hasil filter/search/sort baru bisa jadi jumlah halamannya berbeda)
function buildFilterURL(overrides = {}) {
    const state = Object.assign(getCurrentFilterState(), overrides);
    const newParams = new URLSearchParams();
    Object.entries(state).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined && value !== 'All') {
            newParams.set(key, value);
        }
    });
    newParams.set('page', '1');
    return window.location.pathname + '?' + newParams.toString();
}

function navigateWithFilters(overrides) {
    window.location.href = buildFilterURL(overrides);
}

function initTabs() {
    const tabs = document.querySelectorAll('.filter-tab');
    if (tabs.length === 0) return;

    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const status = this.getAttribute('data-status');
            navigateWithFilters({ status });
        });
    });
}

// Dipanggil saat dropdown Project/Package/Sort berubah, atau saat user
// menekan Enter di kolom pencarian -> langsung ke server dengan filter baru
function resetAndFilter() {
    const projectEl = document.getElementById('projectFilter');
    const packageEl = document.getElementById('packageFilter');
    const searchEl = document.getElementById('searchInput');
    const sortFieldEl = document.getElementById('sortField');
    const sortOrderEl = document.getElementById('sortOrder');

    navigateWithFilters({
        project: projectEl ? projectEl.value : 'All',
        package: packageEl ? packageEl.value : 'All',
        q: searchEl ? searchEl.value.trim() : '',
        sort_by: sortFieldEl ? sortFieldEl.value : 'updated',
        sort_order: sortOrderEl ? sortOrderEl.value : 'desc',
    });
}

// Ketikan di kolom pencarian di-debounce (tunggu user berhenti mengetik ~600ms)
// supaya tidak reload halaman di setiap huruf yang diketik
function debouncedSearch() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        resetAndFilter();
    }, 600);
}

// Task yang tampil di HTML adalah task hasil query server untuk page ini saja
// (sudah difilter & diurutkan oleh server). Load More di sini hanya menampilkan
// lebih banyak dari batch yang sudah dikirim, tidak menyaring ulang apa pun.
function initTaskDisplay() {
    const container = document.getElementById('taskContainer');
    if (!container) return;

    const taskItems = Array.from(container.querySelectorAll('.task-item'));

    taskItems.forEach((item, idx) => {
        item.style.display = idx < itemsToShow ? 'block' : 'none';
    });

    renderLoadMoreButton(taskItems.length);
}

function loadMore() {
    itemsToShow += 15;
    initTaskDisplay();
}

function renderLoadMoreButton(totalItems) {
    let container = document.getElementById('loadMoreContainer');
    if (!container) return;
    if (itemsToShow < totalItems) {
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
            itemsToShow = 15;
            initTaskDisplay();
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
    initTaskDisplay();
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

// Fungsi untuk masuk ke mode fullscreen dan menampilkan tombol keluar
function toggleVideoFullscreen(wrapperId) {
    const elem = document.getElementById(wrapperId);
    const exitBtn = elem.querySelector('.exit-fs-btn');

    if (!document.fullscreenElement) {
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) { /* Safari / Mobile */
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) { /* IE/Edge */
            elem.msRequestFullscreen();
        }
        // Munculkan tombol keluar saat masuk fullscreen
        if (exitBtn) {
            exitBtn.classList.remove('d-none');
            exitBtn.classList.add('d-flex');
        }
    } else {
        exitVideoFullscreen(wrapperId);
    }
}

// Fungsi khusus untuk keluar dari fullscreen
function exitVideoFullscreen(wrapperId) {
    const elem = document.getElementById(wrapperId);
    const exitBtn = elem.querySelector('.exit-fs-btn');

    if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
    // Sembunyikan kembali tombol keluar saat kembali normal
    if (exitBtn) {
        exitBtn.classList.remove('d-flex');
        exitBtn.classList.add('d-none');
    }
}

// Listener tambahan jika pengguna keluar fullscreen lewat tombol ESC keyboard bawaan browser
document.addEventListener('fullscreenchange', handleFullscreenExit);
document.addEventListener('webkitfullscreenchange', handleFullscreenExit);

function handleFullscreenExit() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        document.querySelectorAll('.exit-fs-btn').forEach(btn => {
            btn.classList.remove('d-flex');
            btn.classList.add('d-none');
        });
    }
}

/* ========================================= */
/* CASCADING FILTER & MULTI-SELECT LOGIC     */
/* ========================================= */

// Fungsi Bantuan: Menentukan apakah elemen harus tampil atau sembunyi
function evaluateVisibility(item) {
    if (item.hasAttribute('data-search-hidden') || item.hasAttribute('data-dep-hidden')) {
        item.style.display = 'none';
    } else {
        item.style.display = 'block';
    }
}

// 1. Fungsi Pencarian (Search Bar di dalam filter) dengan Penjaga Posisi Scroll
function searchFilterList(input, listId) {
    const searchTerm = input.value.toLowerCase();
    const listContainer = document.getElementById(listId);
    if (!listContainer) return;
    
    const currentScrollTop = listContainer.scrollTop;
    const items = listContainer.querySelectorAll('.item-option');

    items.forEach(item => {
        const textElement = item.querySelector('.item-text');
        if (textElement) {
            const text = textElement.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                item.removeAttribute('data-search-hidden');
            } else {
                item.setAttribute('data-search-hidden', 'true');
            }
            evaluateVisibility(item);
        }
    });

    listContainer.scrollTop = currentScrollTop;
}

// 2. Fungsi Filter Saling Bergantung (Cascading) - Dua Arah, Aman dari Feedback Loop
function updateDependentFilters() {
    if (typeof projectPackageMap === 'undefined' || typeof packageProjectMap === 'undefined') return;

    const filterBoxes = document.querySelectorAll('.premium-filter-box');
    const scrollPositions = Array.from(filterBoxes).map(box => box.scrollTop);

    const projItemCbs = Array.from(document.querySelectorAll('#project-list .item-cb'));
    const pkgItemCbs = Array.from(document.querySelectorAll('#package-list .item-cb'));

    // Ambil daftar proyek dan paket yang sedang dicentang user (SNAPSHOT di awal,
    // sebelum ada perubahan apapun pada baris-baris di bawah)
    const checkedProjects = projItemCbs.filter(cb => cb.checked).map(cb => cb.value);
    const checkedPackages = pkgItemCbs.filter(cb => cb.checked).map(cb => cb.value);

    // PENTING: "mode Semua" ditentukan HANYA dari jumlah item yang benar-benar
    // tercentang (dibandingkan total item), BUKAN dari status checkbox "Select
    // All" itu sendiri. Kalau kita baca .checked dari checkbox Select All di sini,
    // maka begitu salah satu sisi ter-auto-uncentang gara-gara filter (lihat di
    // bawah), checkbox Select All bisa ikut ter-centang otomatis (karena semua
    // yang MASIH TERLIHAT kebetulan tercentang semua) -- lalu pada pemanggilan
    // berikutnya, itu dibaca sebagai "user pilih Semua" dan seluruh filter jadi
    // reset/muncul lagi. Dengan menghitung dari jumlah item asli (tidak peduli
    // status checkbox Select All), loop ini tidak akan terjadi lagi.
    const useAllProjects = checkedProjects.length === 0 || checkedProjects.length === projItemCbs.length;
    const useAllPackages = checkedPackages.length === 0 || checkedPackages.length === pkgItemCbs.length;

    // A. Package menyesuaikan Project yang dipilih
    pkgItemCbs.forEach(cb => {
        const option = cb.closest('.item-option');
        if (!option) return;
        const pkgName = cb.value;

        if (useAllProjects) {
            option.removeAttribute('data-dep-hidden');
        } else {
            // Paket hanya muncul jika ia ada di DALAM SALAH SATU proyek yang dicentang
            let isValid = checkedProjects.some(proj =>
                projectPackageMap[proj] && projectPackageMap[proj].includes(pkgName)
            );
            if (isValid) {
                option.removeAttribute('data-dep-hidden');
            } else {
                option.setAttribute('data-dep-hidden', 'true');
                cb.checked = false; // Uncheck otomatis jika paket di luar proyek terpilih
            }
        }
        evaluateVisibility(option);
    });

    // B. Project menyesuaikan Package yang dipilih (pakai snapshot checkedPackages
    // di atas, bukan hasil setelah bagian A berjalan, supaya kedua arah konsisten)
    projItemCbs.forEach(cb => {
        const option = cb.closest('.item-option');
        if (!option) return;
        const projName = cb.value;

        if (useAllPackages) {
            option.removeAttribute('data-dep-hidden');
        } else {
            // Proyek hanya muncul jika ia memiliki SALAH SATU paket yang dicentang
            let isValid = checkedPackages.some(pkg =>
                packageProjectMap[pkg] && packageProjectMap[pkg].includes(projName)
            );
            if (isValid) {
                option.removeAttribute('data-dep-hidden');
            } else {
                option.setAttribute('data-dep-hidden', 'true');
                cb.checked = false; // Uncheck otomatis jika proyek tidak memiliki paket tersebut
            }
        }
        evaluateVisibility(option);
    });

    syncSelectAllState('project-list');
    syncSelectAllState('package-list');

    filterBoxes.forEach((box, index) => {
        box.scrollTop = scrollPositions[index];
    });
}

// 3. Fungsi Saat Tombol "Select All" Diklik
function toggleSelectAll(selectAllCheckbox, listId) {
    const listContainer = document.getElementById(listId);
    if (!listContainer) return;

    const itemCheckboxes = listContainer.querySelectorAll('.item-cb');
    itemCheckboxes.forEach(cb => {
        const parentOption = cb.closest('.item-option');
        if (parentOption && parentOption.style.display !== 'none') {
            cb.checked = selectAllCheckbox.checked;
        }
    });

    updateDependentFilters();
}

// 4. Fungsi Saat Salah Satu Item Diklik
function checkIndividualState(listId) {
    updateDependentFilters();
}

// 5. Fungsi Bantu: Sinkronisasi Status "Select All"
function syncSelectAllState(listId) {
    const listContainer = document.getElementById(listId);
    if (!listContainer) return;

    const selectAllCheckbox = listContainer.querySelector('.select-all-cb');
    const itemCheckboxes = Array.from(listContainer.querySelectorAll('.item-cb'));

    // Item yang disembunyikan karena PENCARIAN (search box) tidak dihitung --
    // itu memang cara user mempersempit tampilan. TAPI item yang disembunyikan
    // karena CASCADING (data-dep-hidden, gara-gara filter project/package yang
    // lain) TETAP dihitung, supaya checkbox "Select All" tidak salah ke-centang
    // otomatis hanya karena item lain sedang disembunyikan oleh sisi lain.
    const visibleCheckboxes = itemCheckboxes.filter(cb => {
        const parent = cb.closest('.item-option');
        return parent && !parent.hasAttribute('data-search-hidden');
    });

    if (visibleCheckboxes.length > 0) {
        const allChecked = visibleCheckboxes.every(cb => cb.checked);
        selectAllCheckbox.checked = allChecked;
    }
}

// 6. Fungsi Submit Filter ke URL
function applyDrawerFilters() {
    const allProjChecked = document.querySelector('#project-list .select-all-cb').checked;
    const allPkgChecked = document.querySelector('#package-list .select-all-cb').checked;

    let selectedProjects = [];
    if (!allProjChecked) selectedProjects = Array.from(document.querySelectorAll('#project-list .item-cb:checked')).map(cb => cb.value);
    
    let selectedPackages = [];
    if (!allPkgChecked) selectedPackages = Array.from(document.querySelectorAll('#package-list .item-cb:checked')).map(cb => cb.value);
    
    const sortField = document.getElementById('sortField') ? document.getElementById('sortField').value : 'updated';
    const sortOrder = document.getElementById('sortOrder') ? document.getElementById('sortOrder').value : 'desc';

    const url = new URL(window.location.href);
    url.searchParams.set('page', 1);
    url.searchParams.set('sort_by', sortField);
    url.searchParams.set('sort_order', sortOrder);

    url.searchParams.delete('project');
    url.searchParams.delete('package');

    if (allProjChecked) {
        url.searchParams.append('project', 'All');
    } else {
        selectedProjects.forEach(p => url.searchParams.append('project', p));
    }

    if (allPkgChecked) {
        url.searchParams.append('package', 'All');
    } else {
        selectedPackages.forEach(pkg => url.searchParams.append('package', pkg));
    }

    window.location.href = url.toString();
}

// Inisialisasi awal saat Drawer Filter dibuka
const filterDrawerEl = document.getElementById('filterDrawer');
if (filterDrawerEl) {
    filterDrawerEl.addEventListener('shown.bs.offcanvas', function () {
        updateDependentFilters();
    });
}