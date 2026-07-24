(() => {
  'use strict';

  const VERSION = '3.1.0';
  const pad = value => String(value).padStart(3, '0');
  const idFromCentralSeq = seq => {
    const n = Number(seq);
    return Number.isInteger(n) && n >= 1 && n <= 999 ? `CM${pad(n)}` : '';
  };

  const stationFromSeq = seq => {
    const n = Number(seq);
    if (n >= 1 && n <= 28) return 'cold';
    if (n >= 29 && n <= 41) return 'pizza';
    if (n >= 42 && n <= 71) return 's2';
    if (n >= 72 && n <= 103) return 's1';
    return '';
  };

  const normalizeName = value => String(value ?? '')
    .toLowerCase()
    .replace(/[\s　]/g, '')
    .replace(/[－–—_]/g, '-')
    .replace(/[（）]/g, char => char === '（' ? '(' : ')')
    .replace(/公斤/g, 'kg')
    .replace(/公克/g, 'g');

  const aliases = [
    [/起司蛋糕/, 'CM020'],
    [/巧克力蛋糕/, 'CM021'],
    [/乾醃熟燻畢可培根/, 'CM032'],
    [/修清肋眼/, 'CM072']
  ];

  const itemIdFromName = name => {
    const normalized = normalizeName(name);
    for (const [pattern, itemId] of aliases) {
      if (pattern.test(normalized)) return itemId;
    }
    return '';
  };

  const master = Array.from({ length: 103 }, (_, index) => {
    const centralSeq = index + 1;
    return {
      itemId: idFromCentralSeq(centralSeq),
      centralSeq,
      station: stationFromSeq(centralSeq),
      active: true
    };
  });

  function buildDeliveryIdMaps(data) {
    if (!data || typeof data !== 'object') return data;
    const sourceRows = Array.isArray(data.sourceRows) ? data.sourceRows : [];
    const expected = data.expected || {};
    const values = data.values || {};
    const expectedById = { ...(data.expectedById || {}) };
    const valuesById = { ...(data.valuesById || {}) };
    const itemNamesById = { ...(data.itemNamesById || {}) };
    const centralSeqById = { ...(data.centralSeqById || {}) };

    for (const row of sourceRows) {
      const itemId = idFromCentralSeq(row.centralSeq) || itemIdFromName(row.name);
      if (!itemId) continue;
      itemNamesById[itemId] = row.name || itemNamesById[itemId] || '';
      centralSeqById[itemId] = Number(row.centralSeq) || null;
      if (row.name && Object.prototype.hasOwnProperty.call(expected, row.name)) {
        const quantity = Number(expected[row.name]);
        if (Number.isFinite(quantity)) expectedById[itemId] = quantity;
      }
      if (row.name && Object.prototype.hasOwnProperty.call(values, row.name)) {
        const quantity = Number(values[row.name]);
        if (Number.isFinite(quantity)) valuesById[itemId] = quantity;
      }
    }

    return {
      ...data,
      schemaVersion: 3.1,
      itemMasterVersion: VERSION,
      expectedById,
      valuesById,
      itemNamesById,
      centralSeqById
    };
  }

  function deliveryValue(data, centralSeq, displayName) {
    if (!data) return null;
    const fixed = buildDeliveryIdMaps(data);
    const itemId = idFromCentralSeq(centralSeq) || itemIdFromName(displayName);
    const byId = Number(fixed?.valuesById?.[itemId]);
    if (Number.isFinite(byId)) return byId;

    const values = fixed?.values || {};
    const wanted = normalizeName(displayName);
    for (const [name, quantity] of Object.entries(values)) {
      if (normalizeName(name) === wanted || itemIdFromName(name) === itemId) {
        const number = Number(quantity);
        if (Number.isFinite(number)) return number;
      }
    }
    return null;
  }

  async function persistDelivery(data) {
    const fixed = buildDeliveryIdMaps(data);
    if (!fixed?.deliveryDate) return fixed;
    localStorage.setItem(`kos-expected-${fixed.deliveryDate}`, JSON.stringify(fixed));
    localStorage.setItem('kos-import-central-current', JSON.stringify(fixed));
    try {
      if (window.firebase?.firestore) {
        await window.firebase.firestore().collection('deliveries').doc(fixed.deliveryDate).set(fixed, { merge: true });
      }
    } catch (error) {
      console.warn('Kitchen OS Item ID 雲端補寫失敗：', error);
    }
    return fixed;
  }

  function migrateLocalData() {
    try {
      const current = JSON.parse(localStorage.getItem('kos-import-central-current') || 'null');
      if (current?.sourceRows) persistDelivery(current);
    } catch (error) {
      console.warn('Kitchen OS Item ID 舊資料轉換失敗：', error);
    }
  }

  window.KOSItemMaster = {
    version: VERSION,
    master,
    idFromCentralSeq,
    itemIdFromName,
    normalizeName,
    buildDeliveryIdMaps,
    deliveryValue,
    persistDelivery
  };

  window.addEventListener('load', () => {
    migrateLocalData();
    if (typeof window.saveVerified === 'function' && !window.saveVerified.__kosItemMasterWrapped) {
      const original = window.saveVerified;
      const wrapped = async function (...args) {
        const result = await original.apply(this, args);
        const date = document.getElementById('deliveryDate')?.value;
        if (date) {
          const saved = JSON.parse(localStorage.getItem(`kos-expected-${date}`) || 'null');
          if (saved?.verified) await persistDelivery(saved);
        }
        return result;
      };
      wrapped.__kosItemMasterWrapped = true;
      window.saveVerified = wrapped;
    }
  });
})();
