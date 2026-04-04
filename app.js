/**
 * Clearance & Creepage 計算器
 * 純靜態計算機，手動輸入量測值，即時加總比對規範
 */

const SECTIONS = ['clearance', 'creepage'];
const MAX_ROWS = 6;

/* =============================================
   初始化：產生每個區塊的 7 列輸入格
   ============================================= */
function initRows(id) {
    const container = document.getElementById(`${id}-rows`);
    container.innerHTML = '';

    for (let i = 1; i <= MAX_ROWS; i++) {
        const row = document.createElement('div');
        row.className = 'measure-row';

        row.innerHTML = `
      <div class="name-cell">
        <span class="row-num">${i}</span>
        <input
          class="input-name"
          type="text"
          placeholder="Parts measured（Optional）"
          maxlength="30"
          id="${id}-name-${i}"
        />
      </div>
      <input
        class="input-value"
        type="number"
        placeholder="—"
        step="0.001"
        min="0"
        id="${id}-val-${i}"
      />
    `;

        container.appendChild(row);

        // 數值變動時即時重算
        row.querySelector('.input-value')
            .addEventListener('input', () => calculate(id));
    }
}

/* =============================================
   計算：加總有效數值，與規範值比對
   ============================================= */
function calculate(id) {
    let total = 0;
    let hasValue = false;

    for (let i = 1; i <= MAX_ROWS; i++) {
        const v = parseFloat(document.getElementById(`${id}-val-${i}`).value);
        if (!isNaN(v) && v >= 0) {
            total += v;
            hasValue = true;
        }
    }

    const specEl = document.getElementById(`${id}-spec`);
    const totalEl = document.getElementById(`${id}-total`);
    const verdict = document.getElementById(`${id}-verdict`);
    const card = document.getElementById(`${id}-result`);
    const name = id === 'clearance' ? 'Clearance' : 'Creepage';
    const spec = parseFloat(specEl.value);

    // 沒有任何數值 → 重置
    if (!hasValue) {
        totalEl.textContent = '— mm';
        verdict.textContent = '';
        card.className = 'result-card';
        return;
    }

    totalEl.textContent = `${total.toFixed(3)} mm`;

    // 尚未輸入規範值
    if (isNaN(spec) || spec <= 0) {
        verdict.textContent = '請輸入規範最小值以判定';
        card.className = 'result-card';
        return;
    }

    // 判定
    if (total >= spec) {
        card.className = 'result-card pass';
        verdict.textContent = `✅ ${name} meets criteria（${total.toFixed(3)} mm ≥ ${spec.toFixed(3)} mm）`;
    } else {
        card.className = 'result-card fail';
        verdict.textContent = `❌ ${name} does NOT meet criteria, still need ${(spec - total).toFixed(3)} mm`;
    }
}

/* =============================================
   清除：清空該區塊所有量測欄位
   （規範值保留，通常不需重複輸入）
   ============================================= */
function resetSection(id) {
    for (let i = 1; i <= MAX_ROWS; i++) {
        document.getElementById(`${id}-name-${i}`).value = '';
        document.getElementById(`${id}-val-${i}`).value = '';
    }
    calculate(id);
}

/* =============================================
   規範值變動時重算
   ============================================= */
function bindSpecInputs() {
    SECTIONS.forEach(id => {
        document.getElementById(`${id}-spec`)
            .addEventListener('input', () => calculate(id));
    });
}

/* =============================================
   啟動
   ============================================= */
SECTIONS.forEach(id => initRows(id));
bindSpecInputs();
