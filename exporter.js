(() => {
    // --- CONFIGURATION ---
    const API_ENDPOINT = '/ap2/';
    const COMIC_FETCH_LIMIT = 5000; 
    const HISTORY_FETCH_LIMIT = 300; 

    // --- GRAPHQL QUERIES ---
    const LIST_QUERY = `
    query get_user_mylistList($select: MylistList_Select) {
        get_user_mylistList(select: $select) {
            paging { total pages page init size skip limit prev next }
            items {
                id
                data {
                    name
                    isPublic
                    comicNodes(amount: ${COMIC_FETCH_LIMIT}) {
                        data {
                            id
                            name
                            urlPath
                            urlCover600
                            genres
                            authors
                            score_avg
                            status: uploadStatus
                            origLang
                            dateUpdate
                            chaps_normal
                        }
                    }
                }
            }
        }
    }`;

    const HISTORY_QUERY = `
    query get_sser_myHistory($select: Sser_MyHistory_Select) {
        get_sser_myHistory(select: $select) {
            reqLimit
            newStart
            items {
                date
                comicNode { id }
                chapterNode {
                    data {
                        dname
                        title
                        order
                    }
                }
            }
        }
    }`;

    // --- UTILITIES ---
    function getUserId() {
        const match = window.location.pathname.match(/\/u\/(\d+)/);
        return match ? match[1] : null;
    }

    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function timeAgo(timestamp) {
        if (!timestamp) return 'Unknown';
        const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
        
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + "y ago";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + "mo ago";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + "d ago";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + "h ago";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + "m ago";
        return "Just now";
    }

    function formatLang(code) {
        const map = {
            'ko': '🇰🇷 Manhwa',
            'ja': '🇯🇵 Manga',
            'zh': '🇨🇳 Manhua',
            'en': '🇬🇧 Comic'
        };
        return map[code] || '🏳️ Comic';
    }

    // Sanitize objects to remove XrayWrappers in Firefox
    function cleanObject(obj) {
        if (!obj) return obj;
        return JSON.parse(JSON.stringify(obj));
    }

    // --- IMAGE PROCESSOR ---
    async function fetchImageAsBase64(url) {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            return null;
        }
    }

    async function processCoversWithQueue(lists, updateStatusFn) {
        const queue = [];
        lists.forEach(list => {
            if (list.data.comicNodes) {
                list.data.comicNodes.forEach(node => {
                    if (node.data.urlCover600) {
                        queue.push(node.data);
                    }
                });
            }
        });

        const total = queue.length;
        let processed = 0;
        const CONCURRENCY = 5; 

        updateStatusFn(`Downloading covers: 0/${total}`);

        async function worker() {
            while (queue.length > 0) {
                const comicData = queue.shift();
                const absUrl = window.location.origin + comicData.urlCover600;
                comicData.base64Cover = await fetchImageAsBase64(absUrl);
                processed++;
                if (processed % 5 === 0 || processed === total) {
                    updateStatusFn(`Downloading covers: ${processed}/${total}`);
                }
            }
        }

        const workers = Array(CONCURRENCY).fill(null).map(() => worker());
        await Promise.all(workers);
    }

    // --- FORMAT 1: HTML (Web / Visual) ---
    function generateHTML(lists, username, date) {
        let html = `<!DOCTYPE html>
<html lang="en" data-theme="mdark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${username}'s Bato Lists</title>
<style>
    :root { --b1: #161616; --b2: #1c1c1c; --b3: #252525; --bc: #eee; --pc: #fff; --p: #00bcd4; --er: #f87171; --su: #4ade80; --wa: #facc15; }
    body { background-color: var(--b1); color: var(--bc); font-family: -apple-system, sans-serif; margin: 0; padding: 20px; }
    a { text-decoration: none; color: inherit; }
    .container { max-width: 1000px; margin: 0 auto; }
    .header-main { border-bottom: 1px solid #333; padding-bottom: 15px; margin-bottom: 30px; }
    h1 { color: var(--p); margin: 0; font-size: 24px; }
    .list-block { background: var(--b2); border: 1px solid #333; border-radius: 8px; margin-bottom: 40px; overflow: hidden; }
    .list-head { background: #222; padding: 15px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; }
    .list-name { font-size: 18px; font-weight: bold; color: #fff; }
    .list-meta { font-size: 12px; color: #888; background: #111; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; }
    .item { display: flex; padding: 12px; border-bottom: 1px solid #2a2a2a; transition: background 0.2s; }
    .item:last-child { border-bottom: none; }
    .item:hover { background: var(--b3); }
    .cover-box { width: 90px; flex-shrink: 0; margin-right: 15px; position: relative; border-radius: 4px; overflow: hidden; background: #000; aspect-ratio: 2/3; }
    .cover-img { width: 100%; height: 100%; object-fit: cover; }
    .details { flex-grow: 1; display: flex; flex-direction: column; justify-content: flex-start; overflow: hidden; }
    .comic-title { font-weight: bold; font-size: 16px; color: #fff; margin-bottom: 4px; display: block; }
    .stats-row { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #aaa; margin-bottom: 6px; }
    .star-val { color: var(--wa); font-weight: bold; }
    .status-ongoing { color: var(--su); }
    .status-completed { color: #60a5fa; }
    .meta-row { font-size: 12px; line-height: 1.4; margin-bottom: 6px; }
    .lang-tag { font-weight: bold; color: #fff; margin-right: 6px; }
    .chapter-row { margin-top: auto; font-size: 13px; border-top: 1px dashed #333; padding-top: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .chap-info { display: flex; flex-direction: column; }
    .chap-label { font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; }
    .chap-val { color: var(--p); font-weight: 500; }
    .chap-date { font-style: italic; color: #666; font-size: 11px; }
    .history-box { color: var(--wa); }
    .no-image { display: flex; justify-content: center; align-items: center; height: 100%; color: #444; font-size: 10px; text-align: center; }
</style>
</head>
<body>
<div class="container">
    <div class="header-main">
        <h1>${username}'s Bato Collection</h1>
        <div style="color:#777; font-size:12px">Exported: ${date}</div>
    </div>`;

        lists.forEach(list => {
            const items = list.data.comicNodes || [];
            if (items.length === 0) return;

            html += `<div class="list-block"><div class="list-head"><span class="list-name">${list.data.name}</span><span class="list-meta">${list.data.isPublic ? 'Public' : 'Private'} • ${items.length} items</span></div>`;

            items.forEach(node => {
                const c = node.data;
                const score = c.score_avg ? c.score_avg.toFixed(1) : '-';
                const status = c.status || 'Unknown';
                const statusClass = status.toLowerCase() === 'completed' ? 'status-completed' : 'status-ongoing';
                const latestDate = timeAgo(c.dateUpdate);
                const latestChap = c.chaps_normal ? `Ch.${c.chaps_normal}` : 'Unknown';
                
                let historyHtml = '<span class="chap-val">-</span>';
                if (c.history) {
                    historyHtml = `<span class="chap-val" style="color:#facc15"> ${c.history.chapterName}</span><span class="chap-date">${timeAgo(c.history.readDate)}</span>`;
                }

                const imgSrc = c.base64Cover || c.urlCover600;
                const imgTag = imgSrc ? `<img class="cover-img" src="${imgSrc}" loading="lazy">` : `<div class="no-image">No Image</div>`;

                html += `<div class="item"><div class="cover-box">${imgTag}</div><div class="details"><div class="comic-title">${c.name}</div><div class="stats-row"><span>★ <span class="star-val">${score}</span></span><span class="${statusClass}">${status}</span></div><div class="meta-row"><span class="lang-tag">${formatLang(c.origLang)}</span><span>${(c.authors||[]).join(', ')}</span></div><div class="chapter-row"><div class="chap-info history-box"><span class="chap-label">Last Read</span>${historyHtml}</div><div class="chap-info"><span class="chap-label">Latest Release (As of ${date})</span><span class="chap-val">${latestChap}</span><span class="chap-date">${latestDate}</span></div></div></div></div>`;
            });
            html += `</div>`;
        });
        html += `</div></body></html>`;
        return html;
    }

    // --- FORMAT 2: PRINTABLE (PDF Optimized) ---
    function generatePrintableHTML(lists, username, date) {
        let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>BatoList - ${username}</title>
<style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
    body { font-family: 'Roboto', sans-serif; background: #fff; color: #000; margin: 0; padding: 20px; font-size: 10pt; }
    h1 { font-size: 18pt; margin-bottom: 5px; border-bottom: 2px solid #000; padding-bottom: 10px; }
    .subtitle { font-size: 10pt; color: #555; margin-bottom: 30px; }
    
    .list-section { margin-bottom: 30px; page-break-inside: avoid; }
    .list-title { font-size: 14pt; font-weight: bold; background: #eee; padding: 5px 10px; border-top: 2px solid #000; margin-bottom: 10px; display: flex; justify-content: space-between; }
    
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { text-align: left; border-bottom: 1px solid #000; padding: 5px; font-size: 9pt; text-transform: uppercase; }
    td { border-bottom: 1px solid #ddd; padding: 8px 5px; vertical-align: top; }
    tr { page-break-inside: avoid; }
    
    .col-title { width: 45%; }
    .col-meta { width: 15%; }
    .col-read { width: 20%; }
    .col-latest { width: 20%; }

    .title-text { font-weight: bold; font-size: 11pt; display: block; margin-bottom: 2px; }
    .author-text { font-style: italic; font-size: 9pt; color: #444; }
    .genre-text { font-size: 8pt; color: #666; margin-top: 2px; }
    
    .status-ongoing { color: #2e7d32; font-weight: bold; font-size: 8pt; }
    .status-completed { color: #1565c0; font-weight: bold; font-size: 8pt; }
    .score { font-weight: bold; }

    .read-chap { font-weight: bold; display: block; }
    .date-sub { font-size: 8pt; color: #666; }

    @media print {
        @page { margin: 1cm; size: A4; }
        body { -webkit-print-color-adjust: exact; }
        a { text-decoration: none; color: #000; }
    }
</style>
</head>
<body>
    <h1>${username}'s Bato Collection</h1>
    <div class="subtitle">Generated on ${date} • Total Lists: ${lists.length}</div>
`;

        lists.forEach(list => {
            const items = list.data.comicNodes || [];
            if (items.length === 0) return;

            html += `
            <div class="list-section">
                <div class="list-title"><span>${list.data.name}</span> <span style="font-size:10pt; font-weight:normal">${items.length} items</span></div>
                <table>
                    <thead>
                        <tr>
                            <th class="col-title">Comic Info</th>
                            <th class="col-meta">Status / Score</th>
                            <th class="col-read">Last Read</th>
                            <th class="col-latest">Latest (As of Export)</th>
                        </tr>
                    </thead>
                    <tbody>`;

            items.forEach(node => {
                const c = node.data;
                const statusClass = c.status?.toLowerCase() === 'completed' ? 'status-completed' : 'status-ongoing';
                
                let readHtml = '<span style="color:#999">-</span>';
                if (c.history) {
                    readHtml = `<span class="read-chap">${c.history.chapterName}</span><span class="date-sub">${timeAgo(c.history.readDate)}</span>`;
                }

                html += `
                <tr>
                    <td>
                        <span class="title-text">${c.name}</span>
                        <span class="author-text">${(c.authors||[]).join(', ')}</span>
                        <div class="genre-text">${formatLang(c.origLang)} • ${(c.genres||[]).slice(0,4).join(', ')}</div>
                    </td>
                    <td>
                        <div class="${statusClass}">${c.status || 'Unknown'}</div>
                        <div class="score">★ ${c.score_avg ? c.score_avg.toFixed(1) : '-'}</div>
                    </td>
                    <td>${readHtml}</td>
                    <td>
                        <span style="font-weight:bold">${c.chaps_normal ? 'Ch.'+c.chaps_normal : '-'}</span>
                        <div class="date-sub">${timeAgo(c.dateUpdate)}</div>
                    </td>
                </tr>`;
            });

            html += `</tbody></table></div>`;
        });

        html += `<script>window.onload = function() { window.print(); }</script></body></html>`;
        return html;
    }

    // --- CSV Generator ---
    function generateCSV(lists, date) {
        const rows = [];
        rows.push(['List Name', 'Privacy', 'Comic Name', 'Lang', 'Score', 'Status', 'Last Read Ch', 'Last Read Date', `Latest Ch (As of ${date})`, 'Updated', 'Genres', 'Bato URL']);
        
        lists.forEach(list => {
            if (!list.data.comicNodes) return;
            list.data.comicNodes.forEach(node => {
                const c = node.data;
                const safe = (s) => `"${(s||'').replace(/"/g, '""')}"`;
                const lastReadCh = c.history ? c.history.chapterName : '-';
                const lastReadDate = c.history ? new Date(c.history.readDate).toISOString().slice(0,10) : '-';

                rows.push([
                    safe(list.data.name),
                    list.data.isPublic ? 'Public' : 'Private',
                    safe(c.name),
                    formatLang(c.origLang),
                    c.score_avg,
                    c.status,
                    safe(lastReadCh),
                    lastReadDate,
                    c.chaps_normal,
                    timeAgo(c.dateUpdate),
                    safe((c.genres||[]).join(', ')),
                    'https://bato.to' + c.urlPath
                ]);
            });
        });
        return rows.map(r => r.join(',')).join('\n');
    }

    // --- JSON Generator ---
    function generateJSON(lists) {
        return JSON.stringify(lists.map(l => ({
            name: l.data.name,
            comics: (l.data.comicNodes||[]).map(n => ({
                title: n.data.name,
                lang: n.data.origLang,
                score: n.data.score_avg,
                status: n.data.status,
                genres: n.data.genres,
                last_read: n.data.history ? {
                    chapter: n.data.history.chapterName,
                    date: n.data.history.readDate
                } : null,
                latest_chap: n.data.chaps_normal,
                updated: n.data.dateUpdate
            }))
        })), null, 2);
    }

    // --- UI MANAGER ---
    const UI = {
        modal: null,
        
        create() {
            if (document.getElementById('be-modal')) return;
            const html = `
            <div class="be-modal-overlay" id="be-overlay">
                <div class="be-modal" id="be-modal">
                    <div class="be-header">
                        <h3 class="be-title">Export Options</h3>
                        <button class="be-close" id="be-close">&times;</button>
                    </div>
                    <div class="be-option-group">
                        
                        <!-- Visual List with Sub-option -->
                        <div class="be-option" style="flex-direction: column; align-items: flex-start; cursor: default;">
                            <label style="display: flex; align-items: flex-start; width: 100%; cursor: pointer;">
                                <input type="checkbox" id="fmt-html" checked>
                                <div>
                                    <span class="be-label">Visual List (HTML)</span>
                                    <span class="be-desc">Self-contained viewer. Best for reading on PC/Mobile.</span>
                                </div>
                            </label>
                            
                            <div id="sub-opt-container" style="width: 100%; margin-top: 10px; padding-top: 10px; border-top: 1px solid #333; margin-left: 4px;">
                                <label style="display: flex; align-items: center; cursor: pointer;">
                                    <input type="checkbox" id="opt-covers" style="width: 14px; height: 14px; margin-top: 0; margin-right: 10px;">
                                    <span style="font-size: 13px; font-weight: bold; color: #ccc;">Embed Cover Images</span>
                                </label>
                                <div style="font-size: 11px; color: #888; margin-left: 24px; margin-top: 2px;">
                                    Makes file fully offline but significantly larger (slower export).
                                </div>
                            </div>
                        </div>

                        <label class="be-option">
                            <input type="checkbox" id="fmt-pdf">
                            <div>
                                <span class="be-label">Printable View (PDF)</span>
                                <span class="be-desc">Clean, no-image list designed for "Print to PDF".</span>
                            </div>
                        </label>
                        <label class="be-option">
                            <input type="checkbox" id="fmt-csv">
                            <div><span class="be-label">Spreadsheet (CSV)</span></div>
                        </label>
                        <label class="be-option">
                            <input type="checkbox" id="fmt-json">
                            <div><span class="be-label">JSON Data</span></div>
                        </label>
                    </div>
                    <div class="be-progress-area" id="be-progress">Ready</div>
                    <div class="be-footer">
                        <button class="be-btn be-btn-secondary" id="be-cancel">Cancel</button>
                        <button class="be-btn be-btn-primary" id="be-start">Start Export</button>
                    </div>
                </div>
            </div>`;
            const div = document.createElement('div');
            div.innerHTML = html;
            document.body.appendChild(div.firstElementChild);

            this.modal = document.getElementById('be-overlay');
            
            // Interaction Logic for Sub-option
            const htmlCheck = document.getElementById('fmt-html');
            const coversCheck = document.getElementById('opt-covers');
            const subContainer = document.getElementById('sub-opt-container');

            const toggleCovers = () => {
                if (htmlCheck.checked) {
                    coversCheck.disabled = false;
                    subContainer.style.opacity = '1';
                    subContainer.style.pointerEvents = 'auto';
                } else {
                    coversCheck.disabled = true;
                    subContainer.style.opacity = '0.4';
                    subContainer.style.pointerEvents = 'none';
                }
            };
            htmlCheck.onchange = toggleCovers;
            // Run once on init
            toggleCovers();

            document.getElementById('be-close').onclick = () => this.hide();
            document.getElementById('be-cancel').onclick = () => this.hide();
            document.getElementById('be-start').onclick = () => logic.startExport();
            this.modal.onclick = (e) => { if(e.target === this.modal) this.hide(); };
        },
        show() { this.create(); this.modal.classList.add('open'); },
        hide() { if(this.modal) this.modal.classList.remove('open'); },
        updateStatus(msg) {
            const el = document.getElementById('be-progress');
            el.style.display = 'block';
            el.innerText = msg;
        },
        setLoading(loading) {
            const btn = document.getElementById('be-start');
            btn.disabled = loading;
            btn.innerText = loading ? "Processing..." : "Start Export";
        }
    };

    // --- MAIN LOGIC ---
    const logic = {
        async startExport() {
            const userId = getUserId();
            const doHtml = document.getElementById('fmt-html').checked;
            const doPdf = document.getElementById('fmt-pdf').checked;
            const doCsv = document.getElementById('fmt-csv').checked;
            const doJson = document.getElementById('fmt-json').checked;
            const embedCovers = document.getElementById('opt-covers').checked;

            if (!doHtml && !doCsv && !doJson && !doPdf) return alert("Select a format.");

            UI.setLoading(true);
            UI.updateStatus("Connecting to Bato...");

            try {
                const lists = await this.fetchLists(userId);
                if (!lists.length) {
                    UI.updateStatus("No lists found.");
                    UI.setLoading(false);
                    return;
                }

                UI.updateStatus("Fetching reading history...");
                const historyMap = await this.fetchHistory();
                
                lists.forEach(list => {
                    if (list.data.comicNodes) {
                        list.data.comicNodes.forEach(node => {
                            const comicId = node.data.id;
                            if (historyMap.has(comicId)) {
                                node.data.history = cleanObject(historyMap.get(comicId));
                            }
                        });
                    }
                });

                if (doHtml && embedCovers) {
                    await processCoversWithQueue(lists, UI.updateStatus);
                }

                UI.updateStatus("Generating files...");
                const user = document.title.split("'")[0] || "User";
                const date = new Date().toISOString().slice(0, 10);
                const base = `bato_export_${user}_${date}`;

                if (doHtml) downloadFile(generateHTML(lists, user, date), base+'.html', 'text/html');
                if (doPdf) downloadFile(generatePrintableHTML(lists, user, date), base+'_printable.html', 'text/html');
                if (doCsv) downloadFile("\uFEFF"+generateCSV(lists, date), base+'.csv', 'text/csv;charset=utf-8;');
                if (doJson) downloadFile(generateJSON(lists), base+'.json', 'application/json');

                UI.updateStatus("Done! Check your downloads.");
                UI.setLoading(false);
            } catch (e) {
                console.error(e);
                UI.updateStatus("Error: " + e.message);
                UI.setLoading(false);
            }
        },

        async fetchLists(userId) {
            const allLists = [];
            let page = 1, hasMore = true;
            while (hasMore) {
                UI.updateStatus(`Fetching lists page ${page}...`);
                const res = await fetch(API_ENDPOINT, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        query: LIST_QUERY,
                        variables: { select: { page, size: 20, sortby: "update", userId } }
                    })
                });
                const json = await res.json();
                const data = cleanObject(json.data?.get_user_mylistList);
                if (!data?.items) break;
                allLists.push(...data.items);
                if (page >= data.paging.pages) hasMore = false; else page++;
            }
            return allLists;
        },

        async fetchHistory() {
            const historyMap = new Map(); 
            let startCursor = null;
            let page = 1;
            let hasMore = true;
            const MAX_HISTORY_PAGES = 20; 

            while (hasMore && page <= MAX_HISTORY_PAGES) {
                UI.updateStatus(`Fetching history page ${page}...`);
                const res = await fetch(API_ENDPOINT, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        query: HISTORY_QUERY,
                        variables: { select: { limit: HISTORY_FETCH_LIMIT, start: startCursor } }
                    })
                });
                const json = await res.json();
                const data = cleanObject(json.data?.get_sser_myHistory);
                
                if (!data || !data.items || data.items.length === 0) break;

                data.items.forEach(item => {
                    const comicId = item.comicNode?.id;
                    const chapterData = item.chapterNode?.data;
                    if (comicId && chapterData) {
                        if (!historyMap.has(comicId)) {
                            historyMap.set(comicId, cleanObject({
                                chapterName: chapterData.dname || chapterData.title || `Ch.${chapterData.order}`,
                                readDate: item.date
                            }));
                        }
                    }
                });
                startCursor = data.newStart;
                if (!startCursor) hasMore = false;
                page++;
            }
            return historyMap;
        }
    };

    function init() {
        if (document.getElementById('bato-csv-btn')) return;
        const likedBtn = document.querySelector('a[href$="/batolists/liked"]');
        if (!likedBtn || !likedBtn.parentElement) return;
        
        const btn = document.createElement('button');
        btn.id = 'bato-csv-btn';
        btn.className = 'btn btn-xs rounded btn-success ml-2 font-bold text-white';
        btn.innerText = 'Export';
        btn.onclick = () => UI.show();
        likedBtn.parentElement.appendChild(btn);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();