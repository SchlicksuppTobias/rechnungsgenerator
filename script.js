// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let state = {
  sender: { company: '', address: '', vat: '', iban: '' },
  customers: [],
  invoices: [],
  currentInvoiceId: null,
  nextCustomerId: 1,
  nextInvoiceSeq: 1,
};

// ── Persistence ──
function save() {
  try { localStorage.setItem('rg_v2', JSON.stringify(state)); } catch(e) {}
}

function load() {
  try {
    const s = localStorage.getItem('rg_v2');
    if (s) state = { ...state, ...JSON.parse(s) };
  } catch(e) {}
  // Sync sender fields
  document.getElementById('s-company').value = state.sender.company || '';
  document.getElementById('s-address').value = state.sender.address || '';
  document.getElementById('s-vat').value = state.sender.vat || '';
  document.getElementById('s-iban').value = state.sender.iban || '';
}

// ── Formatters ──
const eur = n => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const today = () => new Date().toLocaleDateString('de-DE');
const isoToDE = s => s ? new Date(s).toLocaleDateString('de-DE') : '';

// ── Invoice number logic ──
function nextInvNumber() {
  const year = new Date().getFullYear();
  const seq  = String(state.nextInvoiceSeq).padStart(4, '0');
  return `${year}-${seq}`;
}

// ══════════════════════════════════════════
// SENDER
// ══════════════════════════════════════════
function renderPreview() {
  state.sender.company = document.getElementById('s-company').value;
  state.sender.address = document.getElementById('s-address').value;
  state.sender.vat     = document.getElementById('s-vat').value;
  state.sender.iban    = document.getElementById('s-iban').value;
  save();
  if (state.currentInvoiceId) renderInvoiceEditor();
}

// ══════════════════════════════════════════
// CUSTOMERS
// ══════════════════════════════════════════
function openCustomerModal(prefill) {
  document.getElementById('cm-name').value = prefill?.name || '';
  document.getElementById('cm-address').value = prefill?.address || '';
  document.getElementById('cm-email').value = prefill?.email || '';
  document.getElementById('cm-vat').value = prefill?.vat || '';
  document.getElementById('customer-modal').classList.add('open');
  setTimeout(() => document.getElementById('cm-name').focus(), 50);
}

function closeCustomerModal() {
  document.getElementById('customer-modal').classList.remove('open');
}

function saveCustomer() {
  const name = document.getElementById('cm-name').value.trim();
  if (!name) { alert('Bitte Namen eingeben.'); return; }
  const c = {
    id: state.nextCustomerId++,
    name,
    address: document.getElementById('cm-address').value.trim(),
    email:   document.getElementById('cm-email').value.trim(),
    vat:     document.getElementById('cm-vat').value.trim(),
  };
  state.customers.push(c);
  closeCustomerModal();
  save();
  renderCustomerList();
}

function renderCustomerList() {
  const el = document.getElementById('customer-list');
  if (!state.customers.length) {
    el.innerHTML = '<div style="font-family:var(--mono);font-size:.72rem;color:var(--muted);">Noch keine Kunden.</div>';
    return;
  }
  el.innerHTML = state.customers.map(c => {
    const inv = state.currentInvoiceId ? getInvoice(state.currentInvoiceId) : null;
    const sel = inv && inv.customerId === c.id;
    return `<div class="customer-item ${sel ? 'selected' : ''}" onclick="selectCustomer(${c.id})">
      <div>
        <div class="name">${c.name}</div>
        <div class="sub">${c.email || '—'}</div>
      </div>
      <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteCustomer(${c.id})">✕</button>
    </div>`;
  }).join('');
}

function deleteCustomer(id) {
  if (!confirm('Kunden wirklich löschen?')) return;
  state.customers = state.customers.filter(c => c.id !== id);
  save();
  renderCustomerList();
}

function selectCustomer(id) {
  if (!state.currentInvoiceId) { alert('Bitte zuerst eine Rechnung erstellen.'); return; }
  const inv = getInvoice(state.currentInvoiceId);
  if (inv) { inv.customerId = id; save(); renderInvoiceEditor(); renderCustomerList(); }
}

// ══════════════════════════════════════════
// INVOICES
// ══════════════════════════════════════════
function getInvoice(id) { return state.invoices.find(i => i.id === id); }

function newInvoice() {
  const id = Date.now();
  const inv = {
    id,
    number: nextInvNumber(),
    date: new Date().toISOString().slice(0,10),
    dueDate: new Date(Date.now() + 14*86400000).toISOString().slice(0,10),
    customerId: null,
    positions: [],
    vatRate: 19,
    notes: 'Bitte überweisen Sie den Betrag innerhalb von 14 Tagen auf das unten angegebene Konto.',
    status: 'draft',
  };
  state.nextInvoiceSeq++;
  state.invoices.unshift(inv);
  state.currentInvoiceId = id;
  save();
  renderHistoryList();
  renderCustomerList();
  renderInvoiceEditor();
}

function loadInvoice(id) {
  state.currentInvoiceId = id;
  renderHistoryList();
  renderCustomerList();
  renderInvoiceEditor();
}

function deleteInvoice(id) {
  if (!confirm('Rechnung wirklich löschen?')) return;
  state.invoices = state.invoices.filter(i => i.id !== id);
  if (state.currentInvoiceId === id) state.currentInvoiceId = null;
  save();
  renderHistoryList();
  if (!state.currentInvoiceId) {
    document.getElementById('main-area').innerHTML = `<div class="empty-state"><div class="icon">📄</div><p>Klicke auf „+ Rechnung" um zu beginnen</p></div>`;
  }
}

function renderHistoryList() {
  const el = document.getElementById('history-list');
  if (!state.invoices.length) {
    el.innerHTML = '<div style="font-family:var(--mono);font-size:.72rem;color:var(--muted);">Noch keine Rechnungen.</div>';
    return;
  }
  el.innerHTML = state.invoices.map(inv => {
    const c = state.customers.find(c => c.id === inv.customerId);
    const net = inv.positions.reduce((s,p) => s + p.qty * p.price, 0);
    const gross = net * (1 + inv.vatRate / 100);
    const active = inv.id === state.currentInvoiceId;
    const statusMap = { draft: 'Entwurf', sent: 'Versendet', paid: 'Bezahlt', overdue: 'Überfällig' };
    const chipMap   = { draft: 'chip-draft', sent: 'chip-sent', paid: 'chip-paid', overdue: 'chip-overdue' };
    return `<div class="history-item ${active ? 'active' : ''}" onclick="loadInvoice(${inv.id})">
      <div>
        <div class="hi-num">${inv.number} &nbsp;<span class="chip ${chipMap[inv.status]}">${statusMap[inv.status]}</span></div>
        <div class="hi-name">${c ? c.name : '— Kein Kunde —'}</div>
      </div>
      <div style="text-align:right">
        <div class="hi-amount">${eur(gross)}</div>
        <button class="btn btn-sm btn-danger" style="margin-top:.25rem" onclick="event.stopPropagation();deleteInvoice(${inv.id})">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════
// INVOICE EDITOR
// ══════════════════════════════════════════
function renderInvoiceEditor() {
  const inv = getInvoice(state.currentInvoiceId);
  if (!inv) return;
  const customer = state.customers.find(c => c.id === inv.customerId);
  const s = state.sender;

  const net   = inv.positions.reduce((sum, p) => sum + p.qty * p.price, 0);
  const vat   = net * inv.vatRate / 100;
  const gross = net + vat;

  const statusMap = { draft: 'Entwurf', sent: 'Versendet', paid: 'Bezahlt', overdue: 'Überfällig' };
  const chipMap   = { draft: 'chip-draft', sent: 'chip-sent', paid: 'chip-paid', overdue: 'chip-overdue' };

  document.getElementById('main-area').innerHTML = `
    <div class="invoice-editor" id="invoice-editor">

      <!-- EDITOR META -->
      <div class="invoice-meta print-hide" style="margin-bottom:1rem;">
        <div class="meta-card">
          <div class="meta-label">Rechnungsnummer</div>
          <div class="meta-value gold">${inv.number}</div>
          <div class="meta-sub">Status: <span class="chip ${chipMap[inv.status]}">${statusMap[inv.status]}</span></div>
        </div>
        <div class="meta-card">
          <div class="meta-label">Einstellungen</div>
          <div style="display:flex;flex-direction:column;gap:.5rem;margin-top:.25rem;">
            <div style="display:flex;align-items:center;gap:.5rem;">
              <span style="font-family:var(--mono);font-size:.7rem;color:var(--muted);min-width:80px">Datum</span>
              <input type="date" value="${inv.date}" onchange="updateInvField('date',this.value)" style="font-family:var(--mono);font-size:.78rem;border:1px solid var(--rule);border-radius:3px;padding:.2rem .4rem;background:var(--cream);color:var(--ink);outline:none;">
            </div>
            <div style="display:flex;align-items:center;gap:.5rem;">
              <span style="font-family:var(--mono);font-size:.7rem;color:var(--muted);min-width:80px">Fällig bis</span>
              <input type="date" value="${inv.dueDate}" onchange="updateInvField('dueDate',this.value)" style="font-family:var(--mono);font-size:.78rem;border:1px solid var(--rule);border-radius:3px;padding:.2rem .4rem;background:var(--cream);color:var(--ink);outline:none;">
            </div>
            <div style="display:flex;align-items:center;gap:.5rem;">
              <span style="font-family:var(--mono);font-size:.7rem;color:var(--muted);min-width:80px">MwSt.</span>
              <select class="vat-select" onchange="updateInvField('vatRate',+this.value)">
                ${[0,7,19].map(r => `<option value="${r}" ${r===inv.vatRate?'selected':''}>${r}%</option>`).join('')}
              </select>
            </div>
            <div style="display:flex;align-items:center;gap:.5rem;">
              <span style="font-family:var(--mono);font-size:.7rem;color:var(--muted);min-width:80px">Status</span>
              <select class="vat-select" onchange="updateInvField('status',this.value)">
                ${['draft','sent','paid','overdue'].map(s => `<option value="${s}" ${s===inv.status?'selected':''}>${statusMap[s]}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- ── PRINT PREVIEW ── -->
      <div class="print-invoice" id="print-invoice">

        <!-- Header -->
        <div class="pi-header">
          <div>
            <div class="pi-brand">${s.company || 'Ihr Unternehmen'}</div>
            <div class="pi-sender-addr">${(s.address || '').replace(/\n/g,'<br>')}${s.vat ? '<br>USt-IdNr.: ' + s.vat : ''}</div>
          </div>
          <div class="pi-inv-block">
            <div class="pi-inv-label">Rechnung</div>
            <div class="pi-inv-num">${inv.number}</div>
            <div class="pi-inv-date">Datum: ${isoToDE(inv.date)}<br>Fällig: ${isoToDE(inv.dueDate)}</div>
          </div>
        </div>

        <!-- Bill-to / Bill-from -->
        <div class="pi-bill-section">
          <div class="pi-bill-block">
            <div class="block-label">Rechnungsempfänger</div>
            <div class="block-content">
              ${customer
                ? `<strong>${customer.name}</strong><br>${(customer.address||'').replace(/\n/g,'<br>')}${customer.email ? '<br>' + customer.email : ''}${customer.vat ? '<br>USt-IdNr.: ' + customer.vat : ''}`
                : '<span style="color:var(--muted);">— Kein Kunde ausgewählt —</span>'}
            </div>
          </div>
          <div class="pi-bill-block">
            <div class="block-label">Bankverbindung</div>
            <div class="block-content">
              ${s.iban ? `IBAN: ${s.iban}` : '<span style="color:var(--muted);">— Keine IBAN hinterlegt —</span>'}
            </div>
          </div>
        </div>

        <!-- Items -->
        <div class="pi-items-wrap">
          <div class="pi-items-head">
            <span>Beschreibung</span>
            <span>Menge</span>
            <span>Einzelpreis</span>
            <span>Gesamt</span>
          </div>
          ${inv.positions.length
            ? inv.positions.map(p => `
              <div class="pi-item-row">
                <span>${p.desc || '—'}</span>
                <span>${p.qty}</span>
                <span>${eur(p.price)}</span>
                <span>${eur(p.qty * p.price)}</span>
              </div>`).join('')
            : `<div class="pi-item-row"><span style="color:var(--muted);font-style:italic;">Noch keine Positionen</span><span></span><span></span><span></span></div>`
          }
        </div>

        <!-- Totals -->
        <div class="pi-totals">
          <div class="pi-totals-inner">
            <div class="pi-total-row"><span class="k">Nettobetrag</span><span>${eur(net)}</span></div>
            <div class="pi-total-row"><span class="k">zzgl. MwSt. ${inv.vatRate}%</span><span>${eur(vat)}</span></div>
            <div class="pi-total-row grand-total"><span class="k">Gesamtbetrag</span><span><strong>${eur(gross)}</strong></span></div>
          </div>
        </div>

        <!-- Notes -->
        <div class="pi-notes">${inv.notes || ''}</div>
      </div>

      <!-- ── POSITION EDITOR ── -->
      <div class="print-hide">
        <div class="positions-wrap">
          <div class="positions-head">
            <span>Beschreibung</span>
            <span style="text-align:right">Menge</span>
            <span style="text-align:right">Einzelpreis</span>
            <span style="text-align:right">Gesamt</span>
            <span></span>
          </div>
          <div id="pos-list">
            ${inv.positions.map((p, i) => positionRow(p, i)).join('')}
          </div>
          <div class="add-position-row">
            <button class="btn btn-sm" style="background:var(--faint);color:var(--ink);border:1px dashed var(--rule);" onclick="addPosition()">＋ Position hinzufügen</button>
          </div>
        </div>

        <!-- Totals editor -->
        <div class="totals-block">
          <div class="totals-table">
            <div class="totals-row"><span class="label">Netto</span><span class="value">${eur(net)}</span></div>
            <div class="totals-row"><span class="label">MwSt. ${inv.vatRate}%</span><span class="value">${eur(vat)}</span></div>
            <div class="totals-row grand"><span class="label">Gesamt</span><span class="value">${eur(gross)}</span></div>
          </div>
        </div>

        <!-- Notes editor -->
        <div class="notes-area">
          <label>Zahlungshinweis / Notiz</label>
          <textarea rows="3" oninput="updateInvField('notes',this.value)">${inv.notes || ''}</textarea>
        </div>
      </div>

    </div>
  `;
}

function positionRow(p, i) {
  return `<div class="position-row" id="pos-${p.id}">
    <input type="text" value="${p.desc}" placeholder="Leistungsbeschreibung" oninput="updatePos(${p.id},'desc',this.value)">
    <input type="number" value="${p.qty}" min="0" step="1" oninput="updatePos(${p.id},'qty',+this.value)">
    <input type="number" value="${p.price}" min="0" step="0.01" oninput="updatePos(${p.id},'price',+this.value)">
    <span class="pos-total">${eur(p.qty * p.price)}</span>
    <button class="pos-del" onclick="deletePos(${p.id})">×</button>
  </div>`;
}

function addPosition() {
  const inv = getInvoice(state.currentInvoiceId);
  if (!inv) return;
  inv.positions.push({ id: Date.now(), desc: '', qty: 1, price: 0 });
  save();
  renderInvoiceEditor();
  // focus last desc
  setTimeout(() => {
    const inputs = document.querySelectorAll('#pos-list .position-row input[type=text]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 50);
}

function deletePos(posId) {
  const inv = getInvoice(state.currentInvoiceId);
  if (!inv) return;
  inv.positions = inv.positions.filter(p => p.id !== posId);
  save();
  renderInvoiceEditor();
}

function updatePos(posId, field, val) {
  const inv = getInvoice(state.currentInvoiceId);
  if (!inv) return;
  const pos = inv.positions.find(p => p.id === posId);
  if (pos) pos[field] = val;
  // live update total cell + summary without full re-render
  const net   = inv.positions.reduce((s, p) => s + p.qty * p.price, 0);
  const vat   = net * inv.vatRate / 100;
  const gross = net + vat;

  // update pos total cell
  const row = document.getElementById('pos-' + posId);
  if (row) row.querySelector('.pos-total').textContent = eur(pos.qty * pos.price);

  // update totals block
  const totalsEl = document.querySelector('.totals-block .totals-table');
  if (totalsEl) {
    totalsEl.innerHTML = `
      <div class="totals-row"><span class="label">Netto</span><span class="value">${eur(net)}</span></div>
      <div class="totals-row"><span class="label">MwSt. ${inv.vatRate}%</span><span class="value">${eur(vat)}</span></div>
      <div class="totals-row grand"><span class="label">Gesamt</span><span class="value">${eur(gross)}</span></div>`;
  }

  // update print preview totals
  const piTotals = document.querySelector('.pi-totals-inner');
  if (piTotals) {
    piTotals.innerHTML = `
      <div class="pi-total-row"><span class="k">Nettobetrag</span><span>${eur(net)}</span></div>
      <div class="pi-total-row"><span class="k">zzgl. MwSt. ${inv.vatRate}%</span><span>${eur(vat)}</span></div>
      <div class="pi-total-row grand-total"><span class="k">Gesamtbetrag</span><span><strong>${eur(gross)}</strong></span></div>`;
  }

  // update print preview items
  const piItems = document.querySelector('.pi-items-wrap');
  if (piItems && inv.positions.length) {
    piItems.innerHTML = `
      <div class="pi-items-head">
        <span>Beschreibung</span><span>Menge</span><span>Einzelpreis</span><span>Gesamt</span>
      </div>
      ${inv.positions.map(p => `<div class="pi-item-row"><span>${p.desc||'—'}</span><span>${p.qty}</span><span>${eur(p.price)}</span><span>${eur(p.qty*p.price)}</span></div>`).join('')}`;
  }

  save();
  renderHistoryList();
}

function updateInvField(field, val) {
  const inv = getInvoice(state.currentInvoiceId);
  if (!inv) return;
  inv[field] = val;
  save();
  renderHistoryList();
  renderInvoiceEditor();
}

// ══════════════════════════════════════════
// PDF EXPORT
// ══════════════════════════════════════════
function printInvoice() {
  if (!state.currentInvoiceId) { alert('Bitte zuerst eine Rechnung öffnen.'); return; }
  window.print();
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
load();
renderCustomerList();
renderHistoryList();
if (state.currentInvoiceId && getInvoice(state.currentInvoiceId)) {
  renderInvoiceEditor();
}
