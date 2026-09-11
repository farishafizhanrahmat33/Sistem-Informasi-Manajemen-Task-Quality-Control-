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

// Kotak pencarian utama (Task ID/Spec/Deskripsi): mengetik perlu menekan Enter
// (navigateWithFilters reload seluruh halaman, jadi tidak ideal kalau reload
// tiap huruf diketik). TAPI kalau dikosongkan/dihapus semua, langsung jalan
// otomatis tanpa perlu Enter.
function handleMainSearchInput(input) {
    if (input.value.trim() === '') {
        resetAndFilter();
    }
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


/* ==========================================================================
   UPLOAD QR PDF -- CHUNKED PER-HALAMAN
   ==========================================================================
   Kenapa dipecah begini: kalau PDF-nya banyak halaman, render 1 request
   untuk SEMUA halaman sekaligus bisa lebih lama dari batas timeout server/
   reverse-proxy (yang konfigurasinya di luar kendali kita) -- hasilnya
   Internal Server Error + browser menampilkan dialog "Confirm Form
   Resubmission". Solusinya: browser yang memproses satu halaman per
   request (lewat /upload_qr/init lalu /upload_qr/page berkali-kali), jadi
   tiap request ke server selalu singkat, berapa pun jumlah halamannya.

   INTEGRASI KE TEMPLATE (qr_management.html):
   Form upload cukup diberi atribut id="qrUploadForm" dan biarkan input
   file-nya tetap bernama "qr_file" seperti sekarang. Kalau mau progress bar
   ditampilkan, tambahkan elemen ini di dalam/dekat form (opsional -- kalau
   tidak ada, upload tetap jalan, hanya saja tanpa progress bar visual):

     <div id="qrUploadProgressWrap" class="d-none mt-2">
       <div class="progress">
         <div id="qrUploadProgressBar" class="progress-bar" style="width:0%">0%</div>
       </div>
       <small id="qrUploadProgressText" class="text-muted"></small>
     </div>

   Tombol submit form idealnya punya id="qrUploadSubmitBtn" supaya bisa
   di-disable otomatis selama proses upload berjalan.
   ========================================================================== */

async function handleQrUploadSubmit(form) {
    const fileInput = form.querySelector('input[name="qr_file"]');
    const submitBtn = form.querySelector('#qrUploadSubmitBtn') || form.querySelector('button[type="submit"]');
    const progressWrap = document.getElementById('qrUploadProgressWrap');
    const progressBar = document.getElementById('qrUploadProgressBar');
    const progressText = document.getElementById('qrUploadProgressText');

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert('Pilih file PDF terlebih dahulu.');
        return;
    }

    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : null;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Uploading...';
    }
    if (progressWrap) progressWrap.classList.remove('d-none');

    function setProgress(done, total, label) {
        if (!progressBar) return;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        progressBar.style.width = pct + '%';
        progressBar.innerText = pct + '%';
        if (progressText) progressText.innerText = label || `${done} / ${total} halaman`;
    }

    let baseCode = null;
    let hadFailures = false;

    try {
        // 1) INIT: kirim file sekali, server balas total halaman + halaman
        //    mana saja yang sudah pernah sukses dari percobaan sebelumnya
        //    (kalau file persis sama, misal upload sebelumnya terputus).
        const initForm = new FormData();
        initForm.append('qr_file', fileInput.files[0]);

        const initResp = await fetch('/upload_qr/init', { method: 'POST', body: initForm });
        const initData = await initResp.json();

        if (!initResp.ok || initData.error) {
            throw new Error(initData.error || 'Gagal memulai upload.');
        }

        baseCode = initData.base_code;
        const fileHash = initData.file_hash;
        const totalPages = initData.total_pages;
        const alreadyDone = new Set(initData.already_done || []);

        let doneCount = alreadyDone.size;
        setProgress(doneCount, totalPages);

        // 2) PER-HALAMAN: proses satu-satu secara berurutan. Kalau koneksi
        //    putus di tengah, tinggal upload ulang file yang sama -- halaman
        //    yang sudah sukses otomatis dilewati (dicek server via hash).
        const failedPages = [];
        for (let page = 1; page <= totalPages; page++) {
            if (alreadyDone.has(page)) continue;

            const pageForm = new FormData();
            pageForm.append('base_code', baseCode);
            pageForm.append('file_hash', fileHash);
            pageForm.append('page', String(page));

            try {
                const pageResp = await fetch('/upload_qr/page', { method: 'POST', body: pageForm });
                const pageData = await pageResp.json();

                if (!pageResp.ok || pageData.error) {
                    failedPages.push(page);
                } else if (pageData.status === 'failed') {
                    failedPages.push(page);
                }
            } catch (err) {
                // Koneksi putus di tengah satu halaman -- catat gagal, lanjut
                // ke halaman berikutnya, jangan hentikan seluruh proses.
                failedPages.push(page);
            }

            doneCount++;
            setProgress(doneCount, totalPages);
        }

        hadFailures = failedPages.length > 0;

        // 3) FINALIZE: beres-beres file sementara di server.
        const finalizeForm = new FormData();
        finalizeForm.append('base_code', baseCode);
        finalizeForm.append('had_failures', hadFailures ? '1' : '0');
        await fetch('/upload_qr/finalize', { method: 'POST', body: finalizeForm });

        if (hadFailures) {
            alert(`Upload selesai, tapi ${failedPages.length} halaman gagal diproses (halaman: ${failedPages.join(', ')}). Upload file yang SAMA lagi untuk mencoba ulang khusus halaman yang gagal.`);
        }

    } catch (err) {
        alert('Upload gagal: ' + err.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml;
        }
        if (progressWrap) progressWrap.classList.add('d-none');
        fileInput.value = '';
        // Muat ulang daftar QR supaya kartu/scene yang baru langsung terlihat.
        window.location.reload();
    }
}

document.addEventListener('submit', function (e) {
    const form = e.target;
    if (form && (form.id === 'qrUploadForm' || (form.action && form.action.includes('/upload_qr') && !form.action.includes('/upload_qr/')))) {
        e.preventDefault();
        handleQrUploadSubmit(form);
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

// 1a. Dipanggil setiap kali user mengetik/menghapus (input event). Hanya
// menjalankan pencarian di sini kalau teksnya sudah kosong (dihapus semua) --
// supaya reset filter terjadi otomatis tanpa perlu Enter. Selama masih ada
// teks, biarkan (nunggu Enter lewat handleSearchKeydown di bawah).
function handleSearchInput(input, listId) {
    if (input.value === '') {
        searchFilterList(input, listId);
    }
}

// 1b. Dipanggil saat user menekan tombol keyboard (keydown event). Kalau
// tombolnya Enter, baru jalankan pencarian.
function handleSearchKeydown(event, input, listId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        searchFilterList(input, listId);
    }
}

// 1c. Pasang listener secara langsung lewat JS (bukan atribut inline di HTML)
// supaya lebih pasti terpasang dengan benar, tanpa bergantung ke urutan atribut
// oninput/onkeydown di markup.
document.addEventListener('DOMContentLoaded', function () {
    const searchBoxConfigs = [
        { selector: '#project-list-search', listId: 'project-list' },
        { selector: '#package-list-search', listId: 'package-list' },
    ];

    searchBoxConfigs.forEach(({ selector, listId }) => {
        const input = document.querySelector(selector);
        if (!input) return;

        input.addEventListener('input', function () {
            handleSearchInput(input, listId);
        });

        input.addEventListener('keydown', function (event) {
            handleSearchKeydown(event, input, listId);
        });
    });

    // Kotak pencarian utama (Task ID/Spec/Deskripsi)
    const mainSearchInput = document.getElementById('searchInput');
    if (mainSearchInput) {
        mainSearchInput.addEventListener('input', function () {
            handleMainSearchInput(mainSearchInput);
        });

        mainSearchInput.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                resetAndFilter();
            }
        });
    }
});

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

// ==========================================
// LOGIKA FILTER & SORT QR MANAGEMENT
// ==========================================

// --- LOGIKA FILTER & SORT QR MANAGEMENT (FLEKSIBEL: SOURCE CODE & SCENE) ---

function toggleSelectAllSource(selectAllCb) {
    const listContainer = document.getElementById('source-list');
    if (!listContainer) return;
    const checkboxes = listContainer.querySelectorAll('.source-checkbox');
    checkboxes.forEach(cb => {
        const parentItem = cb.closest('.item-option');
        if (parentItem && parentItem.style.display !== 'none') {
            cb.checked = selectAllCb.checked;
        }
    });
}

function checkIndividualSourceState() {
    const selectAllCb = document.getElementById('selectAllSource');
    const listContainer = document.getElementById('source-list');
    if (!selectAllCb || !listContainer) return;
    const checkboxes = Array.from(listContainer.querySelectorAll('.source-checkbox'));
    const visibleCheckboxes = checkboxes.filter(cb => {
        const parent = cb.closest('.item-option');
        return parent && parent.style.display !== 'none';
    });
    if (visibleCheckboxes.length > 0) {
        selectAllCb.checked = visibleCheckboxes.every(cb => cb.checked);
    }
}

function toggleSelectAllScene(selectAllCb) {
    const listContainer = document.getElementById('scene-list');
    if (!listContainer) return;
    const checkboxes = listContainer.querySelectorAll('.scene-checkbox');
    checkboxes.forEach(cb => {
        const parentItem = cb.closest('.item-option');
        if (parentItem && parentItem.style.display !== 'none') {
            cb.checked = selectAllCb.checked;
        }
    });
}

function checkIndividualSceneState() {
    const selectAllCb = document.getElementById('selectAllScene');
    const listContainer = document.getElementById('scene-list');
    if (!selectAllCb || !listContainer) return;
    const checkboxes = Array.from(listContainer.querySelectorAll('.scene-checkbox'));
    const visibleCheckboxes = checkboxes.filter(cb => {
        const parent = cb.closest('.item-option');
        return parent && parent.style.display !== 'none';
    });
    if (visibleCheckboxes.length > 0) {
        selectAllCb.checked = visibleCheckboxes.every(cb => cb.checked);
    }
}

document.addEventListener("DOMContentLoaded", function() {
    // Search bar di dalam drawer untuk Source Code
    const sourceSearch = document.getElementById('source-list-search');
    if (sourceSearch) {
        sourceSearch.addEventListener('input', function() {
            const term = this.value.toLowerCase().trim();
            document.querySelectorAll('#source-list .item-option').forEach(opt => {
                const text = opt.querySelector('.item-text').textContent.toLowerCase();
                opt.style.display = text.includes(term) ? 'block' : 'none';
            });
        });
    }

    // Search bar di dalam drawer untuk Scene Name
    const sceneSearch = document.getElementById('scene-list-search');
    if (sceneSearch) {
        sceneSearch.addEventListener('input', function() {
            const term = this.value.toLowerCase().trim();
            document.querySelectorAll('#scene-list .item-option').forEach(opt => {
                const text = opt.querySelector('.item-text').textContent.toLowerCase();
                opt.style.display = text.includes(term) ? 'block' : 'none';
            });
        });
    }
});

function applyQrDrawerFilters() {
    const selectAllSource = document.getElementById('selectAllSource');
    const selectAllScene = document.getElementById('selectAllScene');
    
    let selectedSources = [];
    if (selectAllSource && !selectAllSource.checked) {
        selectedSources = Array.from(document.querySelectorAll('.source-checkbox:checked')).map(cb => cb.value);
    }

    let selectedScenes = [];
    if (selectAllScene && !selectAllScene.checked) {
        selectedScenes = Array.from(document.querySelectorAll('.scene-checkbox:checked')).map(cb => cb.value);
    }

    const sortFieldEl = document.getElementById('sortField');
    const sortField = sortFieldEl ? sortFieldEl.value : 'source'; // 'source' atau 'name'
    
    const sortOrderEl = document.getElementById('sortOrder');
    const sortOrder = sortOrderEl ? sortOrderEl.value : 'asc';
    
    const gridContainer = document.getElementById('qrGridContainer');
    if (!gridContainer) return;

    const items = Array.from(gridContainer.querySelectorAll('.qr-item'));
    const emptyMessage = document.getElementById('noQrFoundMessage');
    const badge = document.getElementById('activeFilterBadge');
    const indicatorBox = document.getElementById('activeFiltersIndicator');
    const chipsContainer = document.getElementById('filterChipsContainer');

    let visibleCount = 0;
    items.forEach(item => {
        const qrSource = item.getAttribute('data-source');
        const qrName = item.getAttribute('data-name');

        const matchSource = !selectAllSource || selectAllSource.checked || selectedSources.includes(qrSource);
        const matchScene = !selectAllScene || selectAllScene.checked || selectedScenes.includes(qrName);

        if (matchSource && matchScene) {
            item.style.display = '';
            visibleCount++;
        } else {
            item.style.display = 'none';
        }
    });

    // Proses Sorting
    items.sort((a, b) => {
        let valA = '';
        let valB = '';

        if (sortField === 'name') {
            valA = (a.getAttribute('data-name') || '').toLowerCase();
            valB = (b.getAttribute('data-name') || '').toLowerCase();
        } else {
            valA = (a.getAttribute('data-source') || '').toLowerCase();
            valB = (b.getAttribute('data-source') || '').toLowerCase();
        }
        
        let comparison = valA.localeCompare(valB);
        return sortOrder === 'asc' ? comparison : -comparison;
    });

    items.forEach(item => gridContainer.appendChild(item));

    if (emptyMessage) {
        emptyMessage.style.display = (visibleCount === 0) ? 'block' : 'none';
    }

    // Render Chip Indikator Aktif
    const isFiltered = (selectAllSource && !selectAllSource.checked) || (selectAllScene && !selectAllScene.checked) || sortOrder !== 'asc';
    if (indicatorBox && chipsContainer) {
        if (isFiltered) {
            indicatorBox.classList.remove('d-none');
            indicatorBox.classList.add('d-flex');
            
            let chipsHtml = '';
            if (selectAllSource && !selectAllSource.checked) {
                selectedSources.forEach(src => {
                    chipsHtml += `<span class="badge badge-soft d-inline-flex align-items-center gap-1 px-2.5 py-1 rounded-pill border flex-shrink-0" style="font-size: 0.75rem; font-weight: 500; border-color: var(--border-color) !important; color: var(--text-main); max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${src}">Source: ${src}</span>`;
                });
            }
            if (selectAllScene && !selectAllScene.checked) {
                selectedScenes.forEach(scene => {
                    chipsHtml += `<span class="badge badge-soft d-inline-flex align-items-center gap-1 px-2.5 py-1 rounded-pill border flex-shrink-0" style="font-size: 0.75rem; font-weight: 500; border-color: var(--border-color) !important; color: var(--text-main); max-width: 150px; overflow: hidden; text-overflow: ellipsis;" title="${scene}">Scene: ${scene}</span>`;
                });
            }
            if (sortOrder !== 'asc') {
                chipsHtml += `<span class="badge badge-soft d-inline-flex align-items-center gap-1 px-2.5 py-1 rounded-pill border flex-shrink-0" style="font-size: 0.75rem; font-weight: 500; border-color: var(--border-color) !important; color: var(--text-main);">Sort: Z-A</span>`;
            }
            chipsContainer.innerHTML = chipsHtml;
        } else {
            indicatorBox.classList.remove('d-flex');
            indicatorBox.classList.add('d-none');
        }
    }

    if (badge) {
        if (isFiltered) {
            badge.classList.remove('d-none');
        } else {
            badge.classList.add('d-none');
        }
    }
}

function resetQrFilters() {
    const selectAllSource = document.getElementById('selectAllSource');
    if (selectAllSource) {
        selectAllSource.checked = true;
        toggleSelectAllSource(selectAllSource);
    }
    const selectAllScene = document.getElementById('selectAllScene');
    if (selectAllScene) {
        selectAllScene.checked = true;
        toggleSelectAllScene(selectAllScene);
    }
    const sortFieldEl = document.getElementById('sortField');
    if (sortFieldEl) sortFieldEl.value = 'source';
    
    const sortOrderEl = document.getElementById('sortOrder');
    if (sortOrderEl) sortOrderEl.value = 'asc';

    applyQrDrawerFilters();
}