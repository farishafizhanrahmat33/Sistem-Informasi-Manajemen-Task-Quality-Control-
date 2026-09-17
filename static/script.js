/* ==========================================================================
   APEX QA CONTROL CENTER - MAIN JAVASCRIPT
   ========================================================================== */


/* ==========================================================================
   1. PROFIL SETTINGS & GLOBAL THEME LOGIC
   ========================================================================== */
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


/* ==========================================================================
   2. TASK MANAGEMENT (Pencarian, Filter Drawer, Sinkronisasi Data)
   ========================================================================== */
let itemsToShow = 15;

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

async function navigateWithFilters(overrides) {
    const newUrl = buildFilterURL(overrides);
    
    // 1. Ubah URL di address bar browser TANPA me-refresh halaman
    window.history.pushState({ path: newUrl }, '', newUrl);
    
    // 2. Berikan efek loading transparan pada container task
    const taskContainer = document.getElementById('taskContainer');
    if (taskContainer) {
        taskContainer.style.transition = 'opacity 0.2s';
        taskContainer.style.opacity = '0.4';
    }

    try {
        // 3. Ambil data HTML halaman baru di latar belakang secara diam-diam
        const response = await fetch(newUrl);
        const htmlText = await response.text();
        
        // 4. Ubah teks HTML yang didapat menjadi elemen yang bisa dibaca JS
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        
        // 5. Perbarui area Tab Menu (agar status 'active' dan angkanya berubah)
        const currentTabMenu = document.getElementById('taskTabMenu');
        const newTabMenu = doc.getElementById('taskTabMenu');
        if (currentTabMenu && newTabMenu) {
            currentTabMenu.innerHTML = newTabMenu.innerHTML;
            initTabs(); // Pasang ulang deteksi klik pada tab yang baru
        }

        // 6. Perbarui area Daftar Kartu Task
        const newTaskContainer = doc.getElementById('taskContainer');
        if (taskContainer && newTaskContainer) {
            taskContainer.innerHTML = newTaskContainer.innerHTML;
            taskContainer.style.opacity = '1';
            itemsToShow = 15;
            initTaskDisplay();
        }

        // 7. PERBARUI AREA PAGINATION AGAR LINK & NOMOR HALAMAN IKUT MENYESUAIKAN
        const currentPagination = document.getElementById('paginationWrapper');
        const newPagination = doc.getElementById('paginationWrapper');
        if (currentPagination && newPagination) {
            currentPagination.innerHTML = newPagination.innerHTML;
        }

    } catch (error) {
        // Fallback: Jika internet bermasalah/error, kembali gunakan cara lawas (refresh)
        window.location.href = newUrl;
    }
}

// === TAMBAHKAN KODE INI DI BAWAHNYA ===
// Memastikan jika user menekan tombol "Back" atau "Forward" di browser, halaman tetap berjalan normal
window.addEventListener('popstate', function() {
    window.location.reload();
});

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

function handleMainSearchInput(input) {
    if (input.value.trim() === '') {
        resetAndFilter();
    }
}

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

async function syncDataNow() {
    try {
        const response = await fetch(window.location.href);
        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        
        // 1. UPDATE DAFTAR KARTU TASK
        const newContainer = doc.getElementById('taskContainer');
        const currentContainer = document.getElementById('taskContainer');
        
        if (newContainer && currentContainer && newContainer.innerHTML !== currentContainer.innerHTML) {
            currentContainer.innerHTML = newContainer.innerHTML;
            itemsToShow = 15;
            initTaskDisplay();
        }

        // 2. UPDATE AREA TAB MENU (ANGKA COUNTER)
        const newTabMenu = doc.getElementById('taskTabMenu');
        const currentTabMenu = document.getElementById('taskTabMenu');
        
        if (newTabMenu && currentTabMenu && newTabMenu.innerHTML !== currentTabMenu.innerHTML) {
            currentTabMenu.innerHTML = newTabMenu.innerHTML;
            initTabs(); // Panggil fungsi ini lagi agar tab baru tetap bisa diklik
        }
        
    } catch (e) { 
        console.log('Background update waiting...'); 
    }
}

async function autoUpdateTasks() {
    if (!document.getElementById('taskContainer') || document.querySelector('.modal.show') || document.body.classList.contains('modal-open')) return;
    syncDataNow();
}

document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initTaskDisplay();
    setInterval(autoUpdateTasks, 5000);
});

document.addEventListener('hidden.bs.modal', function () {
    setTimeout(syncDataNow, 300);
});

document.addEventListener('submit', async function(e) {
    if (e.target && (
        e.target.action.includes('/update/') || 
        e.target.action.includes('/toggle_send/') || 
        e.target.action.includes('/toggle_skip/')
    )) {
        e.preventDefault(); 
        
        const form = e.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        if (!submitBtn) return;
        
        const originalText = submitBtn.innerHTML;
        const originalClass = submitBtn.className;
        
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';
        submitBtn.disabled = true;

        try {
            const formData = new FormData(form);
            const response = await fetch(form.action, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                submitBtn.innerHTML = '✓ Success!';
                submitBtn.className = 'btn btn-success w-100 py-2 fw-bold text-white';
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

// -- CASCADING FILTER & MULTI-SELECT LOGIC (Untuk Drawer Task) --
function evaluateVisibility(item) {
    if (item.hasAttribute('data-search-hidden') || item.hasAttribute('data-dep-hidden')) {
        item.style.display = 'none';
    } else {
        item.style.display = 'block';
    }
}

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

function handleSearchInput(input, listId) {
    if (input.value === '') {
        searchFilterList(input, listId);
    }
}

function handleSearchKeydown(event, input, listId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        searchFilterList(input, listId);
    }
}

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

function updateDependentFilters() {
    if (typeof projectPackageMap === 'undefined' || typeof packageProjectMap === 'undefined') return;

    const filterBoxes = document.querySelectorAll('.premium-filter-box');
    const scrollPositions = Array.from(filterBoxes).map(box => box.scrollTop);

    const projItemCbs = Array.from(document.querySelectorAll('#project-list .item-cb'));
    const pkgItemCbs = Array.from(document.querySelectorAll('#package-list .item-cb'));

    const checkedProjects = projItemCbs.filter(cb => cb.checked).map(cb => cb.value);
    const checkedPackages = pkgItemCbs.filter(cb => cb.checked).map(cb => cb.value);

    const useAllProjects = checkedProjects.length === 0 || checkedProjects.length === projItemCbs.length;
    const useAllPackages = checkedPackages.length === 0 || checkedPackages.length === pkgItemCbs.length;

    pkgItemCbs.forEach(cb => {
        const option = cb.closest('.item-option');
        if (!option) return;
        const pkgName = cb.value;

        if (useAllProjects) {
            option.removeAttribute('data-dep-hidden');
        } else {
            let isValid = checkedProjects.some(proj =>
                projectPackageMap[proj] && projectPackageMap[proj].includes(pkgName)
            );
            if (isValid) {
                option.removeAttribute('data-dep-hidden');
            } else {
                option.setAttribute('data-dep-hidden', 'true');
                cb.checked = false; 
            }
        }
        evaluateVisibility(option);
    });

    projItemCbs.forEach(cb => {
        const option = cb.closest('.item-option');
        if (!option) return;
        const projName = cb.value;

        if (useAllPackages) {
            option.removeAttribute('data-dep-hidden');
        } else {
            let isValid = checkedPackages.some(pkg =>
                packageProjectMap[pkg] && packageProjectMap[pkg].includes(projName)
            );
            if (isValid) {
                option.removeAttribute('data-dep-hidden');
            } else {
                option.setAttribute('data-dep-hidden', 'true');
                cb.checked = false;
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

function checkIndividualState(listId) {
    updateDependentFilters();
}

function syncSelectAllState(listId) {
    const listContainer = document.getElementById(listId);
    if (!listContainer) return;

    const selectAllCheckbox = listContainer.querySelector('.select-all-cb');
    const itemCheckboxes = Array.from(listContainer.querySelectorAll('.item-cb'));

    const visibleCheckboxes = itemCheckboxes.filter(cb => {
        const parent = cb.closest('.item-option');
        return parent && !parent.hasAttribute('data-search-hidden');
    });

    if (visibleCheckboxes.length > 0) {
        const allChecked = visibleCheckboxes.every(cb => cb.checked);
        selectAllCheckbox.checked = allChecked;
    }
}

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

const filterDrawerEl = document.getElementById('filterDrawer');
if (filterDrawerEl) {
    filterDrawerEl.addEventListener('shown.bs.offcanvas', function () {
        updateDependentFilters();
    });
}


/* ==========================================================================
   3. QR MANAGEMENT (Upload Chunking, Sorting, Drawer Filtering)
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

    const files = Array.from(fileInput.files);
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

    const problems = [];

    try {
        const jobs = [];
        let overallTotal = 0;
        let overallDone = 0;

        for (const file of files) {
            const initForm = new FormData();
            initForm.append('qr_file', file);

            try {
                const initResp = await fetch('/upload_qr/init', { method: 'POST', body: initForm });
                const initData = await initResp.json();

                if (!initResp.ok || initData.error) {
                    problems.push(`${file.name}: ${initData.error || 'gagal dibaca'}`);
                    continue;
                }

                const alreadyDone = new Set(initData.already_done || []);
                jobs.push({
                    file,
                    baseCode: initData.base_code,
                    fileHash: initData.file_hash,
                    totalPages: initData.total_pages,
                    alreadyDone,
                });
                overallTotal += initData.total_pages;
                overallDone += alreadyDone.size;
            } catch (err) {
                problems.push(`${file.name}: koneksi gagal saat memulai upload`);
            }
        }

        setProgress(overallDone, overallTotal, `0 / ${jobs.length} file diproses`);

        for (let fi = 0; fi < jobs.length; fi++) {
            const job = jobs[fi];
            const failedPagesThisFile = [];

            for (let page = 1; page <= job.totalPages; page++) {
                if (job.alreadyDone.has(page)) {
                    continue;
                }

                const pageForm = new FormData();
                pageForm.append('base_code', job.baseCode);
                pageForm.append('file_hash', job.fileHash);
                pageForm.append('page', String(page));

                try {
                    const pageResp = await fetch('/upload_qr/page', { method: 'POST', body: pageForm });
                    const pageData = await pageResp.json();

                    if (!pageResp.ok || pageData.error || pageData.status === 'failed') {
                        failedPagesThisFile.push(page);
                    }
                } catch (err) {
                    failedPagesThisFile.push(page);
                }

                overallDone++;
                setProgress(overallDone, overallTotal, `File ${fi + 1}/${jobs.length}: ${job.file.name}`);
            }

            if (failedPagesThisFile.length > 0) {
                problems.push(`${job.file.name}: halaman ${failedPagesThisFile.join(', ')} gagal diproses`);
            }

            const finalizeForm = new FormData();
            finalizeForm.append('base_code', job.baseCode);
            finalizeForm.append('had_failures', failedPagesThisFile.length > 0 ? '1' : '0');
            await fetch('/upload_qr/finalize', { method: 'POST', body: finalizeForm });
        }

        if (problems.length > 0) {
            alert(`Upload selesai, tapi ada masalah:\n- ${problems.join('\n- ')}\n\nUpload file yang SAMA lagi untuk mencoba ulang bagian yang gagal.`);
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

    if (badge) {
        if (filterVal !== 'All') {
            badge.classList.remove('d-none');
        } else {
            badge.classList.add('d-none');
        }
    }

    cards.forEach(card => {
        const subtitle = card.getAttribute('data-subtitle');
        if (filterVal === 'All' || subtitle === filterVal) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });

    cards.sort((a, b) => {
        if (fieldVal === 'station') {
            const subA = (a.getAttribute('data-subtitle') || '').toLowerCase();
            const subB = (b.getAttribute('data-subtitle') || '').toLowerCase();
            const comparison = subA.localeCompare(subB);
            return sortVal === 'asc' ? comparison : -comparison;
        } else {
            const sceneA = parseInt(a.getAttribute('data-scene')) || 0;
            const sceneB = parseInt(b.getAttribute('data-scene')) || 0;
            return sortVal === 'asc' ? (sceneA - sceneB) : (sceneB - sceneA);
        }
    });

    cards.forEach(card => container.appendChild(card));
}

// -- FILTER & SORT QR MANAGEMENT (Drawer) --
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
    const sortField = sortFieldEl ? sortFieldEl.value : 'source'; 
    
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


/* ==========================================================================
   4. DASHBOARD (Chart, Tabel Aktivitas, Sinkronisasi)
   ========================================================================== */
document.addEventListener("DOMContentLoaded", function() {
    const activitySearch = document.getElementById('recentActivitySearch');
    if (activitySearch) {
        activitySearch.addEventListener('input', function() {
            const term = this.value.toLowerCase().trim();
            const rows = document.querySelectorAll('#recentActivityTableBody tr.activity-row');
            let visibleCount = 0;

            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if (text.includes(term)) {
                    row.style.display = '';
                    visibleCount++;
                } else {
                    row.style.display = 'none';
                }
            });

            const emptyRow = document.getElementById('noActivityMatch');
            if (emptyRow) {
                emptyRow.style.display = (visibleCount === 0) ? '' : 'none';
            }
        });
    }
});

function refreshDashboardData(btn) {
    const icon = btn.querySelector('svg');
    if (icon) icon.classList.add('spinning');
    
    setTimeout(() => {
        window.location.reload();
    }, 600);
}

function filterDashboardTable(category, btnElement) {
    document.querySelectorAll('.dashboard-filter-tab').forEach(tab => tab.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    const rows = document.querySelectorAll('#recentActivityTableBody tr.activity-row');
    let visibleCount = 0;

    rows.forEach(row => {
        const rowCategory = row.getAttribute('data-category');
        if (category === 'All' || rowCategory === category) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });

    const emptyRow = document.getElementById('noActivityMatch');
    if (emptyRow) {
        emptyRow.style.display = (visibleCount === 0) ? '' : 'none';
    }
}

let myQCChart = null;
const dashUrlParams = new URLSearchParams(window.location.search);
let currentFilterCategory = dashUrlParams.get('filter') || 'All';
let currentSelectedProjects = [];

const dashProjParam = dashUrlParams.get('project');
if (dashProjParam && dashProjParam !== 'All' && dashProjParam !== 'None') {
    currentSelectedProjects = dashProjParam.split(',');
}

const allLabels = ['Need Sample', 'Sample Done', 'Revision', 'Ready', 'Skipped', 'Production'];

let currentMetrics = (window.dashboardConfig && window.dashboardConfig.metrics) || {
    need: 0, done: 0, rev: 0, ready: 0, skip: 0, prod: 0,
    total: 0, verified: 0, completion_rate: 0
};

document.addEventListener("DOMContentLoaded", function() {
    const startInput = document.getElementById('dateStart');
    const endInput = document.getElementById('dateEnd');
    const searchInput = document.getElementById('recentActivitySearch');

    if (!document.getElementById('qcBarChart')) return; 

    if (startInput) startInput.addEventListener('change', runTableFilters);
    if (endInput) endInput.addEventListener('change', runTableFilters);
    if (searchInput) searchInput.addEventListener('keyup', runTableFilters);

    syncUIToState();
    initChart();
    setupInteractiveFilters();
    setupProjectListFilters();
});

function syncUIToState() {
    document.querySelectorAll('.metric-command-card').forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-filter') === currentFilterCategory);
    });
    document.querySelectorAll('.dashboard-filter-tab').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-filter') === currentFilterCategory);
    });

    const projectItems = document.querySelectorAll('#projectListContainer .proj-list-item');
    projectItems.forEach(el => {
        const pName = el.getAttribute('data-project');
        if (currentSelectedProjects.length === 0 && pName === 'All') {
            el.classList.add('active');
        } else if (currentSelectedProjects.includes(pName)) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
}

function updateURLParams() {
    const url = new URL(window.location);
    url.searchParams.set('filter', currentFilterCategory);

    if (currentSelectedProjects.length === 0) {
        url.searchParams.set('project', 'All');
    } else {
        url.searchParams.set('project', currentSelectedProjects.join(','));
    }
    window.history.pushState({}, '', url);
}

function fetchDashboardData() {
    const finalProject = currentSelectedProjects.length === 0 ? 'All' : currentSelectedProjects.join(',');
    const endpoint = `/api/dashboard-data?filter=${encodeURIComponent(currentFilterCategory)}&project=${encodeURIComponent(finalProject)}`;

    document.body.style.cursor = 'wait';

    fetch(endpoint)
        .then(response => response.json())
        .then(data => {
            document.body.style.cursor = 'default';
            if (data.error) return;

            currentMetrics = data.metrics;
            document.getElementById('count-need').innerText = currentMetrics.need ?? 0;
            document.getElementById('count-done').innerText = currentMetrics.done ?? 0;
            document.getElementById('count-rev').innerText = currentMetrics.rev ?? 0;
            document.getElementById('count-ready').innerText = currentMetrics.ready ?? 0;
            document.getElementById('count-skip').innerText = currentMetrics.skip ?? 0;
            document.getElementById('count-prod').innerText = currentMetrics.prod ?? 0;

            // Hitung persentase Need Sample (Task sudah disampling / Total task non-skip)
            const needVal = currentMetrics.need || 0;
            const doneVal = currentMetrics.done || 0;
            const revVal = currentMetrics.rev || 0;
            const readyVal = currentMetrics.ready || 0;
            const prodVal = currentMetrics.prod || 0;
            
            const nonSkippedTotal = needVal + doneVal + revVal + readyVal + prodVal;
            const sampledTotal = nonSkippedTotal - needVal;
            const needPct = nonSkippedTotal > 0 ? ((sampledTotal / nonSkippedTotal) * 100).toFixed(1) + '%' : '0%';
            
            const badgeNeedPctEl = document.getElementById('badge-need-pct');
            if (badgeNeedPctEl) badgeNeedPctEl.innerText = needPct;

            // ==== TAMBAHKAN DUA BLOK INI ====
            // Update angka penambahan harian secara dinamis (Sample Done)
            const badgeDoneDaily = document.getElementById('badge-done-daily');
            if (badgeDoneDaily) badgeDoneDaily.innerText = '+' + (currentMetrics.done_today ?? 0);

            // Update angka penambahan harian secara dinamis (Ready)
            const badgeReadyDaily = document.getElementById('badge-ready-daily');
            if (badgeReadyDaily) badgeReadyDaily.innerText = '+' + (currentMetrics.ready_today ?? 0);

            // ==== TAMBAHKAN BLOK INI ====
            // Update Status Mutu (Revision) secara dinamis
            const badgeRevStatus = document.getElementById('badge-rev-status');
            if (badgeRevStatus) {
                if (revVal === 0) {
                    badgeRevStatus.innerText = '0 Defect';
                    badgeRevStatus.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]'; // Warna Hijau Aman
                } else {
                    badgeRevStatus.innerText = revVal + ' Defect';
                    badgeRevStatus.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200'; // Warna Merah Peringatan
                }
            }
            // ============================

            document.getElementById('dynamic-progress-text').innerText = currentMetrics.completion_rate + '%';
            document.getElementById('dynamic-progress-bar').style.width = currentMetrics.completion_rate + '%';
            document.getElementById('dynamic-progress-bar').setAttribute('aria-valuenow', currentMetrics.completion_rate);
            document.getElementById('dynamic-progress-sub').innerText = `${currentMetrics.verified} of ${currentMetrics.total} total recorded tasks verified or completed.`;

            updateChartAnimation();
            renderTableTasks(data.tasks);
        })
        .catch(err => {
            document.body.style.cursor = 'default';
            console.error('Failed fetching dashboard data:', err);
        });
}

function renderTableTasks(tasks) {
    const tbody = document.getElementById('recentActivityTableBody');
    let html = '';

    if (tasks && tasks.length > 0) {
        tasks.forEach((t, idx) => {
            let badgeHtml = '';
            const cat = t.display_category;
            
            if (cat === 'Ready') {
                badgeHtml = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Ready</span>`;
            } else if (cat === 'Production') {
                badgeHtml = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#F0FDFA] text-[#0F766E] border border-[#99F6E4]"><span class="w-1.5 h-1.5 rounded-full bg-teal-500"></span> Production</span>`;
            } else if (cat === 'Skipped') {
                badgeHtml = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300"><span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span> Skipped</span>`;
            } else if (cat === 'Need Sample') {
                badgeHtml = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Need Sample</span>`;
            } else if (cat === 'Revision') {
                badgeHtml = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Revision</span>`;
            } else {
                badgeHtml = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200"><span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span> ${cat}</span>`;
            }

            const initials = (t.uploaded_by || 'User').substring(0, 1).toUpperCase();
            const projectName = t.project_name || 'General Project';
            const packageName = t.package_name || 'pkg-main';
            const taskId = t.task_id || (idx + 1);
            const taskName = t.task_name || '';
            const uploadedBy = t.uploaded_by || 'User';
            const updatedAt = t.updated_at || '';
            
            // Variabel aman untuk mencegah error kutip satu (') pada string JavaScript
            const safeTaskName = (taskName || '').replace(/'/g, "\\'");
            const safeProj = (projectName || '').replace(/'/g, "\\'");
            const safePkg = (packageName || '').replace(/'/g, "\\'");
            const safeUser = (uploadedBy || '').replace(/'/g, "\\'");

            html += `
                <tr class="hover:bg-slate-50 transition-colors group cursor-pointer activity-row" data-project="${projectName}" data-category="${cat}" data-date="${updatedAt}">
                    <td class="py-4 px-6">
                        <div class="flex flex-col gap-0.5">
                            <span class="font-bold text-[13px] text-on-surface tracking-tight group-hover:text-primary-container transition-colors truncate max-w-[200px]">${projectName}</span>
                            <span class="font-body-sm text-text-secondary truncate max-w-[200px]">${packageName}</span>
                        </div>
                    </td>
                    <td class="py-4 px-4">
                        <div class="flex flex-col gap-0.5">
                            <span class="font-code-sm text-[12px] text-primary-container font-bold">#${taskId}</span>
                            <span class="font-medium text-[13px] text-on-surface truncate max-w-[280px]">${taskName}</span>
                        </div>
                    </td>
                    <td class="py-4 px-4">
                        <div class="flex items-center gap-2.5">
                            <div class="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs">
                                ${initials}
                            </div>
                            <div class="flex flex-col">
                                <span class="font-bold text-[13px] text-on-surface">${uploadedBy}</span>
                                <span class="text-[12px] text-text-muted">${updatedAt}</span>
                            </div>
                        </div>
                    </td>
                    <td class="py-4 px-4">
                        ${badgeHtml}
                    </td>
                    <td class="py-4 px-6 text-right">
                        <!-- Perbaikan: Menambahkan atribut onclick dengan parameter yang benar -->
                        <button onclick="showTaskDetail('${taskId}', '${safeTaskName}', '${safeProj}', '${safePkg}', '${safeUser}', '${cat}', '${updatedAt}')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border-subtle bg-white text-text-secondary hover:text-on-surface hover:bg-surface-container-low text-[12px] font-semibold transition-all">
                            Lihat Detail <span class="material-symbols-outlined text-[14px]">chevron_right</span>
                        </button>
                    </td>
                </tr>
            `;
        });
        html += `<tr id="noActivityMatch" style="display: none;"><td colspan="5" class="text-center py-6 text-text-muted font-label-md">No matching activities found for this filter combination.</td></tr>`;
    } else {
        html = `<tr><td colspan="5" class="text-center py-6 text-text-muted font-label-md">No task records found in the database.</td></tr>`;
    }

    tbody.innerHTML = html;
    runTableFilters();
}

function showTaskDetail(taskId, taskName, projectName, packageName, uploadedBy, status, updatedAt) {
    document.getElementById('modal-task-id').innerText = '#' + taskId;
    document.getElementById('modal-task-name').innerText = taskName;
    document.getElementById('modal-project-name').innerText = projectName;
    document.getElementById('modal-package-name').innerText = packageName;
    document.getElementById('modal-uploaded-by').innerText = uploadedBy;
    document.getElementById('modal-updated-at').innerText = updatedAt;

    const badgeEl = document.getElementById('modal-status-badge');
    let badgeHtml = '';
    if (status === 'Ready') {
        badgeHtml = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Ready`;
        badgeEl.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]';
    } else if (status === 'Production') {
        badgeHtml = `<span class="w-1.5 h-1.5 rounded-full bg-teal-500"></span> Production`;
        badgeEl.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#F0FDFA] text-[#0F766E] border border-[#99F6E4]';
    } else if (status === 'Skipped') {
        badgeHtml = `<span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span> Skipped`;
        badgeEl.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300';
    } else if (status === 'Need Sample') {
        badgeHtml = `<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Need Sample`;
        badgeEl.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]';
    } else if (status === 'Revision') {
        badgeHtml = `<span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Revision`;
        badgeEl.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200';
    } else {
        badgeHtml = `<span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span> ${status}`;
        badgeEl.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200';
    }
    badgeEl.innerHTML = badgeHtml;

    const modal = new bootstrap.Modal(document.getElementById('taskDetailModal'));
    modal.show();
}

function getFilteredChartData() {
    const rawData = [currentMetrics.need, currentMetrics.done, currentMetrics.rev, currentMetrics.ready, currentMetrics.skip, currentMetrics.prod];
    let chartDataToRender = [...rawData];

    if (currentFilterCategory !== 'All') {
        const indexMap = { 'Need Sample': 0, 'Sample Done': 1, 'Revision': 2, 'Ready': 3, 'Skipped': 4, 'Production': 5 };
        const selectedIdx = indexMap[currentFilterCategory];

        if (selectedIdx !== undefined) {
            chartDataToRender = rawData.map((val, index) => index === selectedIdx ? val : 0);
        }
    }
    return chartDataToRender;
}

// Helper untuk membuat efek gradient vertikal (dari terang di bawah ke pekat di atas)
function createBarGradients(ctx, chartArea) {
    if (!chartArea) return ['#f59e0b', '#0ea5e9', '#ef4444', '#10b981', '#64748b', '#7C3AED'];
    
    const makeGradient = (colorTop, colorBottom) => {
        const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
        gradient.addColorStop(0, colorBottom); 
        gradient.addColorStop(1, colorTop);    
        return gradient;
    };

    return [
        makeGradient('#D97706', '#FDE68A'), // 1. Need Sample
        makeGradient('#0284C7', '#BAE6FD'), // 2. Sample Done
        makeGradient('#DC2626', '#FECACA'), // 3. Revision
        makeGradient('#059669', '#A7F3D0'), // 4. Ready
        makeGradient('#64748B', '#CBD5E1'), // 5. Skipped
        makeGradient('#7C3AED', '#C4B5FD')  // 6. Production (Diubah ke Ungu Elegan)
    ];
}

function initChart() {
    const canvasEl = document.getElementById('qcBarChart');
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');

    myQCChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Need Sample', 'Sample Done', 'Revision', 'Ready', 'Skipped', 'Production'],
            datasets: [{
                label: 'Volume Saat Ini',
                data: getFilteredChartData(),
                // Menggunakan fungsi dinamis agar gradient otomatis menyesuaikan ukuran area chart
                backgroundColor: function(context) {
                    const chart = context.chart;
                    const { ctx, chartArea } = chart;
                    if (!chartArea) return null;
                    return createBarGradients(ctx, chartArea);
                },
                borderRadius: 4,
                barPercentage: 0.6,
                maxBarThickness: 50
            }]
        },
        plugins: [{
            // Plugin Kustom 1: Menampilkan angka putih di dalam batang bagian atas
            id: 'customLabelsOnTop',
            afterDatasetsDraw(chart) {
                const { ctx, data } = chart;
                chart.getDatasetMeta(0).data.forEach((bar, index) => {
                    const value = data.datasets[0].data[index];
                    if (value > 0) {
                        ctx.save();
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = '#FFFFFF';
                        ctx.font = 'bold 12px Inter';
                        ctx.fillText(value, bar.x, bar.y + 15);
                        ctx.restore();
                    }
                });
            }
        }, {
            // Plugin Kustom 2: Garis bawah (underline) berwarna di tiap label sumbu X
            id: 'customXAxisUnderlines',
            afterDraw(chart) {
                const { ctx, chartArea: { bottom }, scales: { x } } = chart;
                // Ubah elemen terakhir ke warna ungu (#7C3AED)
                const colors = ['#f59e0b', '#0ea5e9', '#ef4444', '#10b981', '#64748b', '#7C3AED'];
                ctx.save();
                x.ticks.forEach((tick, index) => {
                    const xPos = x.getPixelForTick(index);
                    ctx.beginPath();
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = colors[index];
                    ctx.moveTo(xPos - 20, bottom + 32);
                    ctx.lineTo(xPos + 20, bottom + 32);
                    ctx.stroke();
                });
                ctx.restore();
            }
        }],
        options: {
            responsive: true, 
            maintainAspectRatio: false,
            animation: { duration: 800, easing: 'easeOutQuart' },
            plugins: { legend: { display: false }, tooltip: { enabled: true } },
            layout: { padding: { bottom: 35 } }, 
            scales: {
                x: { 
                    grid: { display: false }, 
                    ticks: { 
                        font: { family: 'Inter', size: 11, weight: '600' }, 
                        color: '#64748b',
                        padding: 6 
                    },
                    border: { display: false }
                },
                y: { 
                    beginAtZero: true, 
                    grid: { color: '#e2e8f0', drawBorder: false, tickLength: 0 }, 
                    ticks: { 
                        font: { family: 'Inter', size: 11, weight: '500' }, 
                        color: '#94a3b8',
                        stepSize: 400,
                        padding: 10
                    },
                    border: { display: false }
                }
            }
        }
    });
}

function updateChartAnimation() {
    if (myQCChart) {
        // Update dataset dengan data baru dari fungsi fetchDashboardData()
        myQCChart.data.datasets[0].data = getFilteredChartData();
        myQCChart.update();
    }
}

function setupInteractiveFilters() {
    const elements = document.querySelectorAll('.metric-command-card, .dashboard-filter-tab');

    elements.forEach(el => {
        el.addEventListener('click', function(e) {
            e.preventDefault();
            const newFilter = this.getAttribute('data-filter') || 'All';

            if (this.classList.contains('active') && this.classList.contains('metric-command-card')) {
                currentFilterCategory = 'All';
            } else {
                currentFilterCategory = newFilter;
            }

            syncUIToState();
            updateURLParams();
            fetchDashboardData(); 
        });
    });
}

function setupProjectListFilters() {
    const projectItems = document.querySelectorAll('#projectListContainer .proj-list-item');

    projectItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const projName = this.getAttribute('data-project');

            if (projName === 'All') {
                currentSelectedProjects = [];
            } else {
                if (currentSelectedProjects.includes(projName)) {
                    currentSelectedProjects = currentSelectedProjects.filter(p => p !== projName);
                } else {
                    currentSelectedProjects.push(projName);
                }
            }

            syncUIToState();
            updateURLParams();
            fetchDashboardData(); 
        });
    });
}

function runTableFilters() {
    const startDate = document.getElementById('dateStart') ? document.getElementById('dateStart').value : '';
    const endDate = document.getElementById('dateEnd') ? document.getElementById('dateEnd').value : '';
    const searchVal = document.getElementById('recentActivitySearch') ? document.getElementById('recentActivitySearch').value.toLowerCase() : '';

    const rows = document.querySelectorAll('#recentActivityTableBody tr.activity-row');
    let visibleCount = 0;

    rows.forEach(row => {
        const rowDate = row.getAttribute('data-date') || '';
        const rowText = row.innerText.toLowerCase();

        let match = true;
        if (startDate && rowDate && rowDate < startDate) match = false;
        if (endDate && rowDate && rowDate > endDate) match = false;
        if (searchVal && !rowText.includes(searchVal)) match = false;

        if (match) {
            row.style.display = "";
            visibleCount++;
        } else {
            row.style.display = "none";
        }
    });

    const noMatchRow = document.getElementById('noActivityMatch');
    if (noMatchRow) noMatchRow.style.display = visibleCount === 0 ? "" : "none";
}

document.addEventListener("DOMContentLoaded", function() {
    function updateClock() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('id-ID', { hour12: false });
        const clockEl = document.getElementById('clockTicker');
        if (clockEl) clockEl.innerText = timeString + ' WIB';
    }
    setInterval(updateClock, 1000);
    updateClock();
    
    const projectSearchField = document.getElementById('projectSearchField');
    if (projectSearchField) {
        projectSearchField.addEventListener('input', function(e) {
            const val = e.target.value.toLowerCase();
            const items = document.querySelectorAll('#projectListContainer .project-item');
            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(val) ? 'flex' : 'none';
            });
        });
    }
});


/* ==========================================================================
   5. USER MANAGEMENT
   ========================================================================== */
// (Placeholder: Logika manajemen user / kontrol role pengguna ditaruh di sini)


/* ==========================================================================
   6. SUPPORT TICKET
   ========================================================================== */
// (Placeholder: Logika manajemen dan submission tiket dukungan ditaruh di sini)


/* ==========================================================================
   7. CUSTOMER SERVICE
   ========================================================================== */
// (Placeholder: Logika live chat / bot layanan pelanggan ditaruh di sini)


/* ==========================================================================
   8. FAQ & PANDUAN
   ========================================================================== */
// (Placeholder: Logika accordion FAQ dan pencarian artikel ditaruh di sini)


/* ==========================================================================
   9. GENERAL UI & UTILITIES (Global Helpers)
   ========================================================================== */
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

// Fitur Penampil PDF
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

// Custom Autocomplete Dropdown
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

// Auto-Dismiss Flash Notification
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

// Video Fullscreen Logics
function toggleVideoFullscreen(wrapperId) {
    const elem = document.getElementById(wrapperId);
    const exitBtn = elem.querySelector('.exit-fs-btn');

    if (!document.fullscreenElement) {
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
        }
        if (exitBtn) {
            exitBtn.classList.remove('d-none');
            exitBtn.classList.add('d-flex');
        }
    } else {
        exitVideoFullscreen(wrapperId);
    }
}

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
    if (exitBtn) {
        exitBtn.classList.remove('d-flex');
        exitBtn.classList.add('d-none');
    }
}

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

// File Upload Name Preview Logic
document.addEventListener("DOMContentLoaded", function() {
    const fileInput = document.getElementById('file-upload');
    const fileNameDisplay = document.getElementById('file-name-display');

    if (fileInput && fileNameDisplay) {
        fileInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                fileNameDisplay.textContent = files[0].name;
                fileNameDisplay.style.color = '#0F766E';
                fileNameDisplay.style.fontWeight = '600';
            } else {
                fileNameDisplay.textContent = 'Belum ada berkas dipilih';
                fileNameDisplay.style.color = 'var(--text-muted)';
                fileNameDisplay.style.fontWeight = 'normal';
            }
        });
    }
});