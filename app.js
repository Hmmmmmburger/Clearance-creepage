/**
 * Onshape Element Right Panel App
 * 爬電距離 / 絕緣間距計算器
 *
 * 通訊機制：
 *   - 透過 window.postMessage 與 Onshape iframe 溝通
 *   - 訂閱 selection 事件取得選取實體的座標
 *   - 使用 Onshape REST API 查詢幾何資訊
 */

// ─── 設定區 ───────────────────────────────────────────────────
const CONFIG = {
    // 從 Onshape App 設定頁取得，或透過 OAuth flow 動態取得
    clientId: 'YOUR_CLIENT_ID',
    // REST API base (若使用 OAuth token 則需調整)
    apiBase: 'https://cad.onshape.com/api/v6',
};

// ─── 狀態管理 ─────────────────────────────────────────────────
const state = {
    mode: 'creepage',         // 'creepage' | 'clearance'
    specValue: null,          // 規範最小值 (mm)
    selectedPoints: [],       // [{ label, x, y, z, entityId, entityType }]
    segments: [],             // [{ from, to, distance }]
    totalDistance: 0,
    documentId: null,
    workspaceId: null,
    elementId: null,
    accessToken: null,
};

// ─── DOM 參考 ─────────────────────────────────────────────────
const dom = {
    specInput: document.getElementById('specValue'),
    pointsList: document.getElementById('pointsList'),
    segmentsSection: document.getElementById('segmentsSection'),
    segmentsList: document.getElementById('segmentsList'),
    resultCard: document.getElementById('resultCard'),
    totalDistance: document.getElementById('totalDistance'),
    resultStatus: document.getElementById('resultStatus'),
    clearBtn: document.getElementById('clearBtn'),
    undoBtn: document.getElementById('undoBtn'),
    calculateBtn: document.getElementById('calculateBtn'),
    modeBtns: document.querySelectorAll('.mode-btn'),
};

// ─── 初始化 ───────────────────────────────────────────────────
function init() {
    bindEvents();
    setupOnshapeMessaging();
    requestDocumentContext();
}

// ─── 事件綁定 ─────────────────────────────────────────────────
function bindEvents() {
    // 模式切換
    dom.modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            dom.modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.mode = btn.dataset.mode;
        });
    });

    // 規範值輸入
    dom.specInput.addEventListener('input', () => {
        state.specValue = parseFloat(dom.specInput.value) || null;
        updateResult();
    });

    // 清除全部
    dom.clearBtn.addEventListener('click', clearAll);

    // 撤銷上一點
    dom.undoBtn.addEventListener('click', undoLastPoint);

    // 重新計算
    dom.calculateBtn.addEventListener('click', calculateDistances);
}

// ─── Onshape 訊息通訊 ─────────────────────────────────────────
function setupOnshapeMessaging() {
    window.addEventListener('message', handleOnshapeMessage);
}

/**
 * 向 Onshape 請求目前文件的 context（documentId, workspaceId, elementId）
 */
function requestDocumentContext() {
    sendToOnshape({ action: 'getContext' });
}

/**
 * 向 Onshape parent frame 發送訊息
 */
function sendToOnshape(payload) {
    window.parent.postMessage(payload, '*');
}

/**
 * 處理來自 Onshape 的訊息
 * Onshape 會推送以下事件類型：
 *   - 'context'     : 文件 context 資訊
 *   - 'selectionChanged' : 使用者選取變更
 */
function handleOnshapeMessage(event) {
    // 安全性：只接受 onshape.com 來源（生產環境請嚴格設定）
    // if (!event.origin.includes('onshape.com')) return;

    const data = event.data;
    if (!data || typeof data !== 'object') return;

    switch (data.type || data.action) {
        case 'context':
            handleContext(data);
            break;

        case 'selectionChanged':
        case 'selection':
            handleSelectionChange(data);
            break;

        default:
            // 其他訊息忽略
            break;
    }
}

/**
 * 接收文件 context
 */
function handleContext(data) {
    state.documentId = data.documentId || data.did;
    state.workspaceId = data.workspaceId || data.wid;
    state.elementId = data.elementId || data.eid;
    state.accessToken = data.accessToken || null;

    console.log('[App] Context received:', {
        did: state.documentId,
        wid: state.workspaceId,
        eid: state.elementId,
    });
}

/**
 * 處理選取變更事件
 * data.selectionItems 為選取實體陣列
 * 每個 item: { id, nodeType, entityType, ... }
 */
async function handleSelectionChange(data) {
    const items = data.selectionItems || data.items || [];
    if (items.length === 0) return;

    // 取最後一個選取的實體
    const latestItem = items[items.length - 1];

    try {
        const point = await resolveEntityPoint(latestItem);
        if (point) {
            addPoint(point);
        }
    } catch (err) {
        console.error('[App] 解析實體座標失敗:', err);
    }
}

// ─── 實體座標解析 ─────────────────────────────────────────────

/**
 * 透過 REST API 解析選取實體的代表座標點
 * 支援：Edge (取中點)、Vertex (取頂點座標)、Face (取重心)
 */
async function resolveEntityPoint(item) {
    const { id: entityId, entityType, deterministic_id } = item;

    if (!state.documentId) {
        console.warn('[App] 尚未取得文件 context');
        return null;
    }

    // 依 entityType 選擇 API 端點
    // Onshape REST API: /api/v6/assemblies/{did}/w/{wid}/e/{eid}/tessellatededges
    // 或 /api/v6/parts/... 視情況

    try {
        // 方法：使用 evalExpression API 取得實體的邊界框中心點
        const endpoint = buildApiEndpoint(entityType, entityId);
        const result = await fetchApi(endpoint);
        const point = extractPointFromApiResult(result, entityType);

        if (!point) return null;

        return {
            label: formatEntityLabel(entityType, entityId),
            x: point.x,
            y: point.y,
            z: point.z,
            entityId: entityId,
            entityType: entityType,
        };
    } catch (err) {
        console.error('[App] API 呼叫失敗:', err);

        // Fallback：若無法取得真實座標，提示使用者
        showApiError('無法取得實體座標，請確認 OAuth 權限設定');
        return null;
    }
}

/**
 * 建立 API 端點 URL
 * Onshape Assembly tessellation API：
 * GET /assemblies/{did}/w/{wid}/e/{eid}/tessellatededges
 */
function buildApiEndpoint(entityType, entityId) {
    const { documentId: did, workspaceId: wid, elementId: eid } = state;
    const base = CONFIG.apiBase;

    switch (entityType) {
        case 'EDGE':
            return `${base}/assemblies/${did}/w/${wid}/e/${eid}/tessellatededges?edges=${entityId}`;
        case 'VERTEX':
            return `${base}/assemblies/${did}/w/${wid}/e/${eid}/tessellatedvertices?vertices=${entityId}`;
        default:
            // Face → 取 bounding box 中心
            return `${base}/assemblies/${did}/w/${wid}/e/${eid}/massproperties?bodies=${entityId}`;
    }
}

/**
 * 從 API 回應中提取座標點 (單位: m → 轉換為 mm)
 */
function extractPointFromApiResult(result, entityType) {
    try {
        if (entityType === 'EDGE') {
            // tessellatedEdges 回傳點陣列，取中點
            const points = result.edges?.[0]?.vertices || [];
            if (points.length < 2) return null;
            const mid = Math.floor(points.length / 2);
            const p = points[mid];
            return { x: p[0] * 1000, y: p[1] * 1000, z: p[2] * 1000 };
        }

        if (entityType === 'VERTEX') {
            const p = result.vertices?.[0]?.point || null;
            if (!p) return null;
            return { x: p[0] * 1000, y: p[1] * 1000, z: p[2] * 1000 };
        }

        // Face / Body → centroid
        const centroid = result.bodies?.[0]?.centroid || null;
        if (!centroid) return null;
        return { x: centroid[0] * 1000, y: centroid[1] * 1000, z: centroid[2] * 1000 };

    } catch {
        return null;
    }
}

/**
 * 發送 Fetch 請求到 Onshape API
 * 生產環境應使用 OAuth token；開發時可用 API key
 */
async function fetchApi(url) {
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    };

    // OAuth Bearer token
    if (state.accessToken) {
        headers['Authorization'] = `Bearer ${state.accessToken}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

// ─── 點位管理 ─────────────────────────────────────────────────

/**
 * 新增一個選取點位
 */
function addPoint(point) {
    state.selectedPoints.push(point);
    renderPointsList();
    calculateDistances();
    updateButtonStates();
}

/**
 * 撤銷最後一個點
 */
function undoLastPoint() {
    if (state.selectedPoints.length === 0) return;
    state.selectedPoints.pop();
    renderPointsList();
    calculateDistances();
    updateButtonStates();
}

/**
 * 清除所有點位
 */
function clearAll() {
    state.selectedPoints = [];
    state.segments = [];
    state.totalDistance = 0;
    renderPointsList();
    renderSegments();
    resetResult();
    updateButtonStates();
}

// ─── 距離計算 ─────────────────────────────────────────────────

/**
 * 計算相鄰點間的 3D 直線距離並累加
 */
function calculateDistances() {
    const pts = state.selectedPoints;

    if (pts.length < 2) {
        state.segments = [];
        state.totalDistance = 0;
        renderSegments();
        updateResult();
        return;
    }

    state.segments = [];

    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const dist = euclideanDistance3D(a, b);

        state.segments.push({
            from: a.label,
            to: b.label,
            distance: dist,
        });
    }

    state.totalDistance = state.segments.reduce((sum, s) => sum + s.distance, 0);

    renderSegments();
    updateResult();
}

/**
 * 計算兩點間的歐幾里得距離 (mm)
 */
function euclideanDistance3D(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ─── UI 渲染 ──────────────────────────────────────────────────

/**
 * 渲染點位清單
 */
function renderPointsList() {
    const list = dom.pointsList;
    const pts = state.selectedPoints;

    if (pts.length === 0) {
        list.innerHTML = '<div class="empty-hint">尚未選取任何點位</div>';
        return;
    }

    list.innerHTML = pts.map((p, i) => `
    <div class="point-item">
      <div class="point-index">${i + 1}</div>
      <div class="point-info">
        <div>${p.label}</div>
        <div class="point-coords">
          X: ${p.x.toFixed(3)} Y: ${p.y.toFixed(3)} Z: ${p.z.toFixed(3)} mm
        </div>
      </div>
    </div>
  `).join('');
}

/**
 * 渲染距離明細
 */
function renderSegments() {
    if (state.segments.length === 0) {
        dom.segmentsSection.style.display = 'none';
        return;
    }

    dom.segmentsSection.style.display = 'block';
    dom.segmentsList.innerHTML = state.segments.map((s, i) => `
    <div class="segment-item">
      <span class="segment-label">段 ${i + 1}：${s.from} → ${s.to}</span>
      <span class="segment-dist">${s.distance.toFixed(3)} mm</span>
    </div>
  `).join('');
}

/**
 * 更新結果卡片
 */
function updateResult() {
    const total = state.totalDistance;
    const spec = state.specValue;

    if (state.selectedPoints.length < 2) {
        resetResult();
        return;
    }

    // 顯示累計距離
    dom.totalDistance.textContent = `${total.toFixed(3)} mm`;

    // 比較規範值
    if (spec === null || isNaN(spec)) {
        // 無規範值：只顯示數值，不判定
        dom.resultCard.className = 'result-card result-idle';
        dom.resultStatus.textContent = '請輸入規範最小值以判定';
        return;
    }

    const modeName = state.mode === 'creepage' ? '爬電距離' : '絕緣間距';

    if (total >= spec) {
        // 通過
        dom.resultCard.className = 'result-card result-pass';
        dom.resultStatus.textContent =
            `✅ ${modeName}符合規範（≥ ${spec} mm）`;
    } else {
        // 不通過
        dom.resultCard.className = 'result-card result-fail';
        dom.resultStatus.textContent =
            `❌ ${modeName}不符規範！差值：${(spec - total).toFixed(3)} mm`;
    }
}

/**
 * 重置結果至初始狀態
 */
function resetResult() {
    dom.resultCard.className = 'result-card result-idle';
    dom.totalDistance.textContent = '— mm';
    dom.resultStatus.textContent = '';
}

/**
 * 更新按鈕狀態
 */
function updateButtonStates() {
    const count = state.selectedPoints.length;
    dom.undoBtn.disabled = count === 0;
    dom.calculateBtn.disabled = count < 2;
}

// ─── 工具函式 ─────────────────────────────────────────────────

function formatEntityLabel(entityType, entityId) {
    const typeMap = {
        EDGE: '邊',
        VERTEX: '頂點',
        FACE: '面',
    };
    const typeName = typeMap[entityType] || entityType;
    // 只顯示 ID 後 8 碼
    const shortId = entityId ? entityId.slice(-8) : '?';
    return `${typeName} …${shortId}`;
}

function showApiError(msg) {
    dom.resultStatus.textContent = `⚠️ ${msg}`;
    dom.resultCard.className = 'result-card result-idle';
}

// ─── 啟動 ─────────────────────────────────────────────────────
init();