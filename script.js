// script.js
// ... existing code ...
const menuEl = document.getElementById('menu');
const menuFiltersEl = document.getElementById('menuFilters');
const cartEl = document.getElementById('cart');
const orderMsg = document.getElementById('order-message');
const statusMsg = document.getElementById('status-message');
const tableSpan = document.getElementById('table-number');
const summaryBtn = document.getElementById('viewOrdersBtn');
const summaryContainer = document.getElementById('orderSummary');
const orderTypeModal = document.getElementById('orderTypeModal');
const orderTypeOptions = document.getElementById('orderTypeOptions');
const addToCartBtn = document.getElementById('addToCartBtn');
const closeModal = document.querySelector('.close');

let selectedItem = null;
let selectedOrderType = null;

const params = new URLSearchParams(window.location.search);
const tableNumber = params.get('table') || 'Unknown';

tableSpan.textContent = tableNumber;


let cart = [];
let allMenuItems = [];
let activeCategory = null;

const TAX_RATE = 0.05;
const SERVICE_RATE = 0.10;

function renderTotals() {
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const tax = +(subtotal * TAX_RATE).toFixed(2);
  const service = +(subtotal * SERVICE_RATE).toFixed(2);
  const grand = +(subtotal + tax + service).toFixed(2);
  statusMsg.textContent = `Subtotal: ₹${subtotal} | Tax: ₹${tax} | Service: ₹${service} | Total: ₹${grand}`;
}

function renderMenu(items, filterCategory = null) {
  menuEl.innerHTML = '';
  // Group items by category
  const categories = {};
  items.forEach(item => {
    if (!categories[item.category]) {
      categories[item.category] = [];
    }
    categories[item.category].push(item);
  });

  // Render filter bar
  menuFiltersEl.innerHTML = '';
  Object.keys(categories).forEach(category => {
    const btn = document.createElement('button');
    btn.className = 'menu-filter-btn' + (filterCategory === category ? ' active' : '');
    btn.textContent = category;
    btn.onclick = () => {
      activeCategory = category;
      renderMenu(allMenuItems, category);
    };
    menuFiltersEl.appendChild(btn);
  });

  // Show only selected category
  const showCategories = filterCategory ? [filterCategory] : Object.keys(categories);
  showCategories.forEach(category => {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'category-section';
    const title = document.createElement('div');
    title.className = 'category-title';
    title.textContent = category;
    categoryDiv.appendChild(title);

    const list = document.createElement('div');
    list.className = 'item-list';
    categories[category].forEach(item => {
      const card = document.createElement('div');
      card.className = 'item-card';
      let imageHtml = '';
      if (item.image_url && item.image_url.trim()) {
        imageHtml = `<img src="${item.image_url}" alt="${item.name}" class="item-image" onerror="this.style.display='none'">`;
      } else {
        imageHtml = '<div class="item-image" style="background-color: #f8f9fa; display: flex; align-items: center; justify-content: center; color: #999; font-size: 12px;">No Image</div>';
      }
      const info = document.createElement('div');
      info.className = 'item-info';
      info.innerHTML = `
        <div class="item-header">
          <div class="item-title-section">
            <h3>${item.name}</h3>
          </div>
          <div class="item-price-section">
            <div class="item-price">₹${item.price}</div>
          </div>
        </div>
        <div class="item-description">${item.description || ''}</div>
        <div class="item-actions">
          <div></div>
          <button class="add-btn" style="background-color: #27ae60; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold;">Add</button>
        </div>
      `;
      card.innerHTML = imageHtml + info.outerHTML;
      const addBtn = card.querySelector('.add-btn');
      addBtn.addEventListener('click', () => {
        const skipOrderType = ["Fast Food", "Sides"];
        if (skipOrderType.includes(item.category)) {
          addToCart(item);
        } else {
          showOrderTypeModal(item);
        }
      });
      list.appendChild(card);
    });
    categoryDiv.appendChild(list);
    menuEl.appendChild(categoryDiv);
  });
}

function renderCart() {
  cartEl.innerHTML = '';
  cart.forEach((ci, index) => {
    const li = document.createElement('li');
    const orderTypeText = ci.orderType ? ` (${ci.orderType})` : '';
    li.textContent = `${ci.name}${orderTypeText} x ${ci.quantity} - ₹${ci.price * ci.quantity}`;
    const minus = document.createElement('button');
    minus.textContent = '-';
    minus.className = 'qty-btn minus';
    minus.onclick = () => changeQty(index, -1);
    const plus = document.createElement('button');
    plus.textContent = '+';
    plus.className = 'qty-btn plus';
    plus.onclick = () => changeQty(index, 1);
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.className = 'remove-btn';
    remove.onclick = () => removeFromCart(index);

    li.appendChild(minus);
    li.appendChild(plus);
    li.appendChild(remove);
    cartEl.appendChild(li);
  });
  renderTotals();
}

function showOrderTypeModal(item) {
  selectedItem = item;
  selectedOrderType = null;
  
  // Populate modal with item info
  const modalItemImage = document.getElementById('modalItemImage');
  const modalItemName = document.getElementById('modalItemName');
  const modalItemPrice = document.getElementById('modalItemPrice');
  
  if (item.image_url && item.image_url.trim()) {
    modalItemImage.innerHTML = `<img src="${item.image_url}" alt="${item.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;" onerror="this.parentElement.innerHTML='No Image'">`;
  } else {
    modalItemImage.innerHTML = 'No Image';
  }
  
  modalItemName.textContent = item.name;
  modalItemPrice.textContent = `₹${item.price}`;
  
  // Clear previous options
  orderTypeOptions.innerHTML = '';
  
  // Create order type options
  if (item.order_types && Array.isArray(item.order_types)) {
    item.order_types.forEach(type => {
      const option = document.createElement('div');
      option.className = 'order-type-option';
      option.innerHTML = `
        <span>${type}</span>
        <span>₹${item.price}</span>
      `;
      option.onclick = () => selectOrderType(type, option);
      orderTypeOptions.appendChild(option);
    });
  } else {
    // Default order types if none specified
    const defaultTypes = ['Half', 'Full', '1 Plate'];
    defaultTypes.forEach(type => {
      const option = document.createElement('div');
      option.className = 'order-type-option';
      option.innerHTML = `
        <span>${type}</span>
        <span>₹${item.price}</span>
      `;
      option.onclick = () => selectOrderType(type, option);
      orderTypeOptions.appendChild(option);
    });
  }
  
  orderTypeModal.style.display = 'block';
}

function selectOrderType(type, optionElement) {
  // Remove previous selection
  document.querySelectorAll('.order-type-option').forEach(opt => {
    opt.classList.remove('selected');
  });
  
  // Select current option
  optionElement.classList.add('selected');
  selectedOrderType = type;
}

function addToCartWithType() {
  if (!selectedItem || !selectedOrderType) {
    alert('Please select an order type');
    return;
  }
  
  const cartItem = {
    ...selectedItem,
    orderType: selectedOrderType,
    quantity: 1
  };
  
  const existing = cart.find(ci => ci.id === selectedItem.id && ci.orderType === selectedOrderType);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push(cartItem);
  }
  
  closeOrderTypeModal();
  renderCart();
}

function closeOrderTypeModal() {
  orderTypeModal.style.display = 'none';
  selectedItem = null;
  selectedOrderType = null;
}

function addToCart(item) {
  const existing = cart.find(ci => ci.id === item.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...item, quantity: 1 });
  }
  renderCart();
}

function changeQty(index, delta) {
  cart[index].quantity += delta;
  if (cart[index].quantity <= 0) cart.splice(index, 1);
  renderCart();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  renderCart();
}

async function loadMenu() {
  const res = await fetch('/api/menu');
  const data = await res.json();
  allMenuItems = data;
  renderMenu(data);
}

async function placeOrder() {
  if (!cart.length) {
    orderMsg.textContent = 'Cart is empty';
    return;
  }
  const payload = { table: `Table ${tableNumber}`, items: cart };
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    const saved = await res.json();
    orderMsg.textContent = 'Order placed successfully!';
    cart = [];
    renderCart();
  } else {
    const err = await res.json().catch(() => ({}));
    orderMsg.textContent = 'Failed to place order' + (err.error ? `: ${err.error}` : '');
  }
}

window.placeOrder = placeOrder;

async function toggleSummary() {
  if (summaryContainer.style.display === 'none') {
    const res = await fetch('/api/orders');
    const orders = await res.json();
    const my = orders.filter(o => o.table === `Table ${tableNumber}`);
    summaryContainer.innerHTML = my.map(o => {
      const items = o.items.map(i => `${i.name} x ${i.quantity}`).join(', ');
      return `<div><strong>${o.status}</strong> • ${items} • ₹${o.totalPrice}</div>`;
    }).join('') || '<div>No orders yet.</div>';
    summaryContainer.style.display = 'block';
  } else {
    summaryContainer.style.display = 'none';
  }
}

summaryBtn?.addEventListener('click', toggleSummary);

// Modal event listeners
closeModal?.addEventListener('click', closeOrderTypeModal);
addToCartBtn?.addEventListener('click', addToCartWithType);

// Close modal when clicking outside
window.addEventListener('click', (event) => {
  if (event.target === orderTypeModal) {
    closeOrderTypeModal();
  }
});

loadMenu();
