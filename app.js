/**
 * Clearance & Creepage 計算器
 * 純靜態網頁，手動輸入量測值，自動加總並與規範值比對
 */

const SECTIONS = ['clearance', 'creepage'];
const MAX_ROWS = 7;

// ═══════════════════════════════════════════════
// 初始化：為每個區塊建立 7 列輸入格
// ═══════════════════════════════════════════════
function initRows(sectionId) {
  const container = document.getElementById(`${sectionId}-rows`);
  container.innerHTML = '';

  for (let i = 1; i <= MAX_ROWS; i++) {
    const row = document.createElement('div');
    row.className = 'measure-row';
    row.id = `${sectionId}-row-${i}`;

    row.innerHTML = `
      <div class="input-name-wrap">
        <span class="row-index">${i}</span>
        <input
          type="text"
          class="input-name"
          id="${sectionId}-name-${i}"
          placeholder="量測名稱（選填）"
          maxlength="30"
        />
      </div>
      <input
        type="number"
        class="input-value"
        id="${sectionId}-val-${i}"
        placeholder="—"
        step="0.001"
        min="0"
      />
    `;

    container.appendChild(row);

    // 每次輸入數值時即時重新計算
    const valInput = row.querySelector('.input-value');
    valInput.addEventListener('input', () => calculate(sectionId));

    // 名稱有值時標記列為 active
    const nameInput = row.querySelector('.input-name');
    nameInput.addEventListener('input', () => {
      row.classList.toggle('row-active', nameInput.value.trim() !== '');
    });
  }
}

// ═══════════════════════════════════════════════
// 計算：加總所有有效數值，與規範值比較
// ═══════════════════════════════════════════════
function calculate(sectionId) {
  let total = 0;
  let hasAnyValue = false;

  for (let i = 1; i <= MAX_ROWS; i++) {
    const valEl = document.getElementById(`${sectionId}-val-${i}`);
    const val = parseFloat(valEl.value);
    if (!isNaN(val) && val >= 0) {
      total += val;
      hasAnyValue = true;
    }
  }

  const specEl  = document.getElementById(`${sectionId}-spec`);
  const spec    = parseFloat(specEl.value);
  const totalEl = document.getElementById(`${sectionId}-total`);
  const verdict = document.getElementById(`${sectionId}-verdict`);
  const card    = document.getElementById(`${sectionId}-result`);
  const sectionName = sectionId === 'clearance' ? '絕緣間距' : '爬電距離';

  if (!hasAnyValue) {
    // 尚未輸入任何數值
    totalEl.textContent = '— mm';
    verdict.textContent  = '';
    card.className = 'result-block';
    return;
  }

  // 顯示加總值
  totalEl.textContent = `${total.toFixed(3)} mm`;

  if (isNaN(spec) || spec <= 0) {
    // 尚未輸入規範值
    verdict.textContent = '請輸入規範最小值以判定';
    card.className = 'result-block';
    return;
  }

  if (total >= spec) {
    // ✅ 通過
    card.className = 'result-block pass';
    verdict.textContent = `✅ ${sectionName}符合規範（${total.toFixed(3)} mm ≥ ${spec.toFixed(3)} mm）`;
  } else {
    // ❌ 不通過
    const diff = (spec - total).toFixed(3);
    card.className = 'result-block fail';
    verdict.textContent = `❌ ${sectionName}不符規範！差距 ${diff} mm`;
  }
}

// ═══════════════════════════════════════════════
// 清除：重置該區塊所有欄位
// ═══════════════════════════════════════════════
function resetSection(sectionId) {
  for (let i = 1; i <= MAX_ROWS; i++) {
    const nameEl = document.getElementById(`${sectionId}-name-${i}`);
    const valEl  = document.getElementById(`${sectionId}-val-${i}`);
    const row    = document.getElementById(`${sectionId}-row-${i}`);
    nameEl.value = '';
    valEl.value  = '';
    row.classList.remove('row-active');
  }

  // 規範值保留（使用者通常不需要重複輸入規範）
  // 若也要清除規範值，取消下一行的註解：
  // document.getElementById(`${sectionId}-spec`).value = '';

  calculate(sectionId);
}

// ═══════════════════════════════════════════════
// 規範值變更時觸發重算
// ═══════════════════════════════════════════════
function bindSpecInputs() {
  SECTIONS.forEach(id => {
    document.getElementById(`${id}-spec`)
      .addEventListener('input', () => calculate(id));
  });
}

// ═══════════════════════════════════════════════
// 啟動
// ═══════════════════════════════════════════════
SECTIONS.forEach(id => initRows(id));
bindSpecInputs();
