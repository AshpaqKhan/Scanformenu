// admin.js
const container = document.getElementById('ordersContainer');
const billsContainer = document.getElementById('billsContainer');
const archivedBillsContainer = document.getElementById('archivedBillsContainer');
const archivedBillsSection = document.getElementById('archivedBillsSection');
const adminMessage = document.getElementById('adminMessage');
const clearOrdersBtn = document.getElementById('clearOrdersBtn');
const clearPaidBillsBtn = document.getElementById('clearPaidBillsBtn');
const toggleArchivedBtn = document.getElementById('toggleArchivedBtn');

// Keep rates in sync with server/client
const TAX_RATE = 0.05;
const SERVICE_RATE = 0.10;

function groupByTable(orders) {
  const map = new Map();
  orders.forEach(o => {
    if (!map.has(o.table)) map.set(o.table, []);
    map.get(o.table).push(o);
  });
  return map;
}

function render(orders) {
  container.innerHTML = '';
  const grouped = groupByTable(orders);
  grouped.forEach((ordersForTable, table) => {
    const section = document.createElement('div');
    section.className = 'table-section';

    // Add Recent Orders heading
    const recentHeading = document.createElement('div');
    recentHeading.className = 'table-title';
    recentHeading.style.fontSize = '22px';
    recentHeading.style.marginBottom = '5px';
    recentHeading.textContent = 'Recent Orders';
    section.appendChild(recentHeading);

    const title = document.createElement('div');
    title.className = 'table-title';
    title.textContent = `${table}`;

    const row = document.createElement('div');
    row.className = 'table-orders';


    ordersForTable.forEach(o => {
      const card = document.createElement('div');
      card.className = 'order-card';

      // Show image of first item in order, if available
      let imageUrl = '';
      if (o.items && o.items.length > 0 && o.items[0].image_url) {
        imageUrl = o.items[0].image_url;
      }
      if (imageUrl && imageUrl.trim()) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = o.items[0].name;
        card.appendChild(img);
      }

      // Order info wrapper for flex layout
      const infoDiv = document.createElement('div');
      infoDiv.className = 'order-info';

      const h3 = document.createElement('h3');
      h3.textContent = `Order ${o.id ? '#' + o.id.slice(-4) : ''}`;

      const ul = document.createElement('ul');
      o.items.forEach(i => {
        const li = document.createElement('li');
        li.textContent = `${i.name} x ${i.quantity}`;
        ul.appendChild(li);
      });

      const status = document.createElement('div');
      status.className = 'status';
      status.textContent = `Status: ${o.status}`;

      const estSubtotal = o.totalPrice || 0;
      const estTax = +(estSubtotal * TAX_RATE).toFixed(2);
      const estService = +(estSubtotal * SERVICE_RATE).toFixed(2);
      const estGrand = +(estSubtotal + estTax + estService).toFixed(2);
      const totals = document.createElement('div');
      totals.className = 'status';
      totals.textContent = `Subtotal: ₹${estSubtotal} | Tax: ₹${estTax} | Service: ₹${estService} | Est Total: ₹${estGrand}`;

  const prepBtn = document.createElement('button');
  prepBtn.textContent = 'Mark Preparing';
  prepBtn.onclick = () => updateStatus(o.id, 'Preparing');

  const delBtn = document.createElement('button');
  delBtn.textContent = 'Mark Delivered';
  delBtn.onclick = () => updateStatus(o.id, 'Delivered');

  // Wrap buttons in a flex container
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'order-actions';
  actionsDiv.appendChild(prepBtn);
  actionsDiv.appendChild(delBtn);

  infoDiv.appendChild(h3);
  infoDiv.appendChild(ul);
  infoDiv.appendChild(status);
  infoDiv.appendChild(totals);
  infoDiv.appendChild(actionsDiv);

  card.appendChild(infoDiv);
  row.appendChild(card);
    });

  const billBtn = document.createElement('button');
  billBtn.textContent = 'Mark Bill Paid';
  billBtn.className = 'mark-bill-btn';
  billBtn.onclick = () => markBillPaid(table);

  section.appendChild(title);
  section.appendChild(row);
  section.appendChild(billBtn);
  container.appendChild(section);
  });
}

async function renderBills() {
  const res = await fetch('/api/bills');
  const bills = await res.json();
  
  // Update statistics
  const totalBills = bills.length;
  const totalRevenue = bills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  const avgBill = totalBills > 0 ? +(totalRevenue / totalBills).toFixed(2) : 0;
  
  document.getElementById('totalBills').textContent = totalBills;
  document.getElementById('totalRevenue').textContent = `₹${totalRevenue.toFixed(2)}`;
  document.getElementById('avgBill').textContent = `₹${avgBill}`;
  
  // Render bills
  if (bills.length === 0) {
    billsContainer.innerHTML = `
      <div class="empty-bills">
        <div>📋 No paid bills yet</div>
        <div style="font-size: 14px; margin-top: 10px; opacity: 0.8;">Mark some orders as paid to see them here</div>
      </div>
    `;
    return;
  }
  
  billsContainer.innerHTML = '<div class="bills-grid"></div>';
  const billsGrid = billsContainer.querySelector('.bills-grid');
  
  bills.slice().reverse().forEach(b => {
    const card = document.createElement('div');
    card.className = 'bill-card';
    
    const itemsCount = b.orders.reduce((n, o) => n + o.items.reduce((s, i) => s + (i.quantity || 1), 0), 0);
    const totals = b.totals || { subtotal: b.totalAmount, tax: 0, service: 0, grandTotal: b.totalAmount };
    
    card.innerHTML = `
      <div class="bill-header">
        <div class="bill-table">${b.table}</div>
        <div class="bill-time">${b.paidAt}</div>
      </div>
      <div class="bill-items">
        <strong>${itemsCount} items</strong> • ${b.orders.length} orders
      </div>
      <div class="bill-totals">
        <div class="bill-total-row">
          <span>Subtotal:</span>
          <span>₹${totals.subtotal}</span>
        </div>
        <div class="bill-total-row">
          <span>Tax:</span>
          <span>₹${totals.tax}</span>
        </div>
        <div class="bill-total-row">
          <span>Service:</span>
          <span>₹${totals.service}</span>
        </div>
        <div class="bill-total-row">
          <span>Total:</span>
          <span>₹${totals.grandTotal}</span>
        </div>
      </div>
    `;
    billsGrid.appendChild(card);
  });
}

async function renderArchivedBills() {
  const res = await fetch('/api/archived-bills');
  const archivedBills = await res.json();
  
  // Update archived statistics
  const archivedCount = archivedBills.length;
  const archivedRevenue = archivedBills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  
  document.getElementById('archivedBillsCount').textContent = archivedCount;
  document.getElementById('archivedRevenue').textContent = `₹${archivedRevenue.toFixed(2)}`;
  document.getElementById('archivedCountBadge').textContent = `(${archivedCount})`;
  
  // Show/hide archived section
  if (archivedCount > 0) {
    archivedBillsSection.style.display = 'block';
  } else {
    archivedBillsSection.style.display = 'none';
    return;
  }
  
  // Store archived bills for later display
  window.archivedBillsData = archivedBills;
}

function toggleArchivedBills() {
  const header = document.getElementById('archivedBillsHeader');
  const container = document.getElementById('archivedBillsContainer');
  const btn = document.getElementById('toggleArchivedBtn');
  
  if (header.style.display === 'none' || !header.style.display) {
    // Show archived bills
    header.style.display = 'flex';
    container.style.display = 'block';
    btn.textContent = '📂 Archived Bills';
    
    // Render archived bills
    if (window.archivedBillsData && window.archivedBillsData.length > 0) {
      container.innerHTML = '<div class="bills-grid"></div>';
      const billsGrid = container.querySelector('.bills-grid');
      
      window.archivedBillsData.forEach(b => {
        const card = document.createElement('div');
        card.className = 'bill-card';
        
        const itemsCount = b.orders.reduce((n, o) => n + o.items.reduce((s, i) => s + (i.quantity || 1), 0), 0);
        const totals = b.totals || { subtotal: b.totalAmount, tax: 0, service: 0, grandTotal: b.totalAmount };
        
        card.innerHTML = `
          <div class="bill-header">
            <div class="bill-table">${b.table}</div>
            <div class="bill-time">${b.paidAt}</div>
          </div>
          <div class="bill-items">
            <strong>${itemsCount} items</strong> • ${b.orders.length} orders
            <div style="font-size: 12px; color: #666; margin-top: 5px;">Archived: ${b.archivedAt}</div>
          </div>
          <div class="bill-totals">
            <div class="bill-total-row">
              <span>Subtotal:</span>
              <span>₹${totals.subtotal}</span>
            </div>
            <div class="bill-total-row">
              <span>Tax:</span>
              <span>₹${totals.tax}</span>
            </div>
            <div class="bill-total-row">
              <span>Service:</span>
              <span>₹${totals.service}</span>
            </div>
            <div class="bill-total-row">
              <span>Total:</span>
              <span>₹${totals.grandTotal}</span>
            </div>
          </div>
        `;
        billsGrid.appendChild(card);
      });
    }
  } else {
    // Hide archived bills
    header.style.display = 'none';
    container.style.display = 'none';
    btn.textContent = '📁 Archived Bills';
  }
}

async function fetchOrders() {
  const res = await fetch('/api/orders');
  const data = await res.json();
  render(data);
}

async function updateStatus(id, status) {
  await fetch(`/api/orders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  fetchOrders();
}

function showAdminMessage(text, color = 'green') {
  if (!adminMessage) return;
  adminMessage.textContent = text;
  adminMessage.style.color = color;
  adminMessage.style.display = 'block';
  setTimeout(() => { adminMessage.style.display = 'none'; }, 2000);
}

async function markBillPaid(table) {
  try {
    const res = await fetch('/api/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table })
    });
    if (res.ok) {
      showAdminMessage(`${table} marked as paid.`);
    } else {
      let errText = 'Failed to mark as paid';
      try {
        const err = await res.json();
        if (err && err.error) errText = err.error;
      } catch {}
      showAdminMessage(`${table}: ${errText}`, 'red');
    }
  } catch (e) {
    showAdminMessage(`${table}: Network error`, 'red');
    console.error(e);
  }
  fetchOrders();
  renderBills();
}

async function clearPaidBills() {
  try {
    const res = await fetch('/api/archive-bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (res.ok) {
      const result = await res.json();
      showAdminMessage('All paid bills archived.');
      renderBills();
      renderArchivedBills();
    } else {
      let errText = 'Failed to archive bills';
      try {
        const err = await res.json();
        if (err && err.error) errText = err.error;
      } catch {}
      showAdminMessage(errText, 'red');
    }
  } catch (e) {
    showAdminMessage('Network error while archiving bills', 'red');
    console.error(e);
  }
}

function subscribeToEvents() {
  const ev = new EventSource('/api/events');
  ev.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'orders_updated') fetchOrders();
      if (data.type === 'bills_updated') renderBills();
      if (data.type === 'archived_bills_updated') renderArchivedBills();
    } catch {}
  };
}

clearOrdersBtn?.addEventListener('click', async () => {
  await fetch('/api/orders', { method: 'DELETE' });
  showAdminMessage('All orders cleared.');
  fetchOrders();
});

clearPaidBillsBtn?.addEventListener('click', clearPaidBills);
toggleArchivedBtn?.addEventListener('click', toggleArchivedBills);

fetchOrders();
renderBills();
renderArchivedBills();
subscribeToEvents();
