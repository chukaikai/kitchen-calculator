(() => {
  'use strict';

  const pad = n => String(n).padStart(3, '0');
  const itemIdFromSeq = seq => {
    const n = Number(seq);
    return Number.isFinite(n) && n > 0 ? `CM${pad(n)}` : '';
  };

  function buildIdMaps(data) {
    const rows = Array.isArray(data?.sourceRows) ? data.sourceRows : [];
    const expected = data?.expected || {};
    const values = data?.values || {};
    const expectedById = { ...(data?.expectedById || {}) };
    const valuesById = { ...(data?.valuesById || {}) };
    const itemNamesById = { ...(data?.itemNamesById || {}) };

    for (const row of rows) {
      const id = itemIdFromSeq(row.centralSeq ?? row.siteSeq);
      if (!id || !row.name) continue;
      itemNamesById[id] = row.name;
      if (Object.prototype.hasOwnProperty.call(expected, row.name)) {
        expectedById[id] = Number(expected[row.name]);
      }
      if (Object.prototype.hasOwnProperty.call(values, row.name)) {
        valuesById[id] = Number(values[row.name]);
      }
    }

    return { ...data, schemaVersion: 3, expectedById, valuesById, itemNamesById };
  }

  async function persistDelivery(data) {
    if (!data?.deliveryDate) return;
    const fixed = buildIdMaps(data);
    localStorage.setItem(`kos-expected-${fixed.deliveryDate}`, JSON.stringify(fixed));
    localStorage.setItem('kos-import-central-current', JSON.stringify(fixed));
    try {
      if (window.db) {
        await window.db.collection('deliveries').doc(fixed.deliveryDate).set(fixed, { merge: true });
      }
    } catch (error) {
      console.warn('Item ID 雲端補寫失敗', error);
    }
  }

  // 到貨驗證頁：保留原本流程，完成後補寫固定 Item ID。
  if (typeof window.saveVerified === 'function') {
    const originalSaveVerified = window.saveVerified;
    window.saveVerified = async function itemIdSaveVerified(...args) {
      const result = await originalSaveVerified.apply(this, args);
      const dateInput = document.getElementById('deliveryDate');
      const date = dateInput?.value;
      if (date) {
        const data = JSON.parse(localStorage.getItem(`kos-expected-${date}`) || 'null');
        if (data?.verified) await persistDelivery(data);
      }
      return result;
    };
  }

  // 載入舊驗收資料時，也自動補出 Item ID，不必重新驗收。
  const current = JSON.parse(localStorage.getItem('kos-import-central-current') || 'null');
  if (current?.verified && current?.sourceRows) persistDelivery(current);

  // 每日盤點頁：以央廚次序形成固定 ID（CM001～CM103）對應到貨。
  if (typeof window.applyDelivery === 'function' && window.centralData) {
    window.applyDelivery = function applyDeliveryByItemId(data) {
      if (!data) return;
      const fixed = buildIdMaps(data);
      window.importedCentral = fixed;
      localStorage.setItem('kos-import-central-current', JSON.stringify(fixed));

      const valuesById = fixed.valuesById || {};
      const fallbackByName = new Map(
        Object.entries(fixed.values || {}).map(([name, value]) => [
          typeof window.itemKey === 'function' ? window.itemKey(name) : name,
          Number(value)
        ])
      );

      Object.values(window.centralData).flat().forEach(row => {
        const itemId = itemIdFromSeq(row[5]);
        let value = Number(valuesById[itemId]);
        if (!Number.isFinite(value)) {
          const key = typeof window.itemKey === 'function' ? window.itemKey(row[0]) : row[0];
          value = fallbackByName.get(key);
        }
        row[4] = Number.isFinite(value) ? value : 0;
      });
    };
  }

  window.KOS_ITEM_ID_VERSION = '3.0.0-beta.1';
})();
