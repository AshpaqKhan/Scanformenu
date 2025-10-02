// menu.js
const menuGrid = document.getElementById('menuGrid');
const messageEl = document.getElementById('message');

let menuItems = [];
let editingItem = null;
let selectedImageFile = null;
let selectedImageUrl = '';

function showMessage(text, type = 'success') {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  messageEl.style.display = 'block';
  setTimeout(() => { messageEl.style.display = 'none'; }, 3000);
}

function handleImageUpload(input) {
  const file = input.files[0];
  if (file) {
    selectedImageFile = file;
    
    // Show preview
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('previewImg').src = e.target.result;
      document.getElementById('imagePreview').style.display = 'block';
      
      // Show status for new image
      const statusEl = document.getElementById('imageStatus');
      statusEl.textContent = '🆕 New image selected';
      statusEl.className = 'image-status new';
    };
    reader.readAsDataURL(file);
    
    // Clear the previous image URL since we're uploading a new one
    selectedImageUrl = '';
    
    console.log('New image selected:', file.name, 'Size:', file.size);
  } else {
    // No file selected, clear the selected file
    selectedImageFile = null;
    console.log('No new image selected');
  }
}

function removeImage() {
  selectedImageFile = null;
  selectedImageUrl = '';
  document.getElementById('itemImageFile').value = '';
  document.getElementById('imagePreview').style.display = 'none';
  
  // Clear image status
  const statusEl = document.getElementById('imageStatus');
  statusEl.textContent = '';
  statusEl.className = 'image-status';
}

async function uploadImage() {
  if (!selectedImageFile) {
    console.log('No image file selected');
    return null;
  }
  
  console.log('Uploading image:', selectedImageFile.name, 'Size:', selectedImageFile.size);
  
  const formData = new FormData();
  formData.append('image', selectedImageFile);
  
  try {
    const response = await fetch('/api/upload-image', {
      method: 'POST',
      body: formData
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('Upload successful:', result);
      selectedImageUrl = result.imageUrl;
      return result.imageUrl;
    } else {
      const error = await response.json();
      console.error('Upload failed:', error);
      showMessage('Failed to upload image: ' + error.error, 'error');
      return null;
    }
  } catch (error) {
    console.error('Upload error:', error);
    showMessage('Failed to upload image: ' + error.message, 'error');
    return null;
  }
}

function renderMenu() {
  menuGrid.innerHTML = '';
  menuItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'menu-card';
    
    const statusClass = item.isActive ? 'active' : 'inactive';
    const statusText = item.isActive ? 'Active' : 'Inactive';
    
    // Handle image display
    let imageHtml = '';
    if (item.image_url && item.image_url.trim()) {
      imageHtml = `<img src="${item.image_url}" alt="${item.name}" class="image-preview" onerror="this.style.display='none'">`;
    } else {
      imageHtml = '<div class="image-preview">No Image</div>';
    }
    
    // Handle order types display
    let orderTypesHtml = '';
    if (item.order_types && Array.isArray(item.order_types)) {
      orderTypesHtml = `
        <div class="order-types">
          ${item.order_types.map(type => `<span class="order-type-tag">${type}</span>`).join('')}
        </div>
      `;
    }
    
    card.innerHTML = `
      ${imageHtml}
      <div class="content">
        <div class="header-row">
          <div class="title-section">
            <h3>${item.name}</h3>
            <div class="category">${item.category}</div>
          </div>
          <div class="price-section">
            <div class="price">₹${item.price}</div>
          </div>
        </div>
        <div class="description">${item.description || 'No description'}</div>
        ${orderTypesHtml}
        <div class="status ${statusClass}">${statusText}</div>
        <div class="actions">
          <button class="edit-btn" onclick="editItem('${item.id}')">Edit</button>
          <button class="toggle-btn" onclick="toggleItem('${item.id}')">${item.isActive ? 'Hide' : 'Show'}</button>
          <button class="delete-btn" onclick="deleteItem('${item.id}')">Delete</button>
        </div>
      </div>
    `;
    menuGrid.appendChild(card);
  });
}

async function loadMenu() {
  try {
    const res = await fetch('/api/menu/admin');
    menuItems = await res.json();
    renderMenu();
  } catch (e) {
    showMessage('Failed to load menu', 'error');
  }
}

async function addMenuItem() {
  const name = document.getElementById('itemName').value.trim();
  const price = parseFloat(document.getElementById('itemPrice').value);
  const category = document.getElementById('itemCategory').value;
  const description = document.getElementById('itemDescription').value.trim();
  
  // Get selected order types
  const orderTypeCheckboxes = document.querySelectorAll('.order-types-checkboxes input[type="checkbox"]:checked');
  const order_types = Array.from(orderTypeCheckboxes).map(cb => cb.value);

  if (!name || !price || !category) {
    showMessage('Please fill all required fields', 'error');
    return;
  }

  if (order_types.length === 0) {
    showMessage('Please select at least one order type', 'error');
    return;
  }

  try {
    // Upload image first if selected
    let image_url = '';
    if (selectedImageFile) {
      showMessage('Uploading image...', 'success');
      image_url = await uploadImage();
      if (!image_url) {
        showMessage('Failed to upload image', 'error');
        return;
      }
    }

    const res = await fetch('/api/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, price, category, description, image_url, order_types })
    });

    if (res.ok) {
      showMessage('Menu item added successfully');
      clearForm();
      loadMenu();
    } else {
      const err = await res.json();
      showMessage(err.error || 'Failed to add item', 'error');
    }
  } catch (e) {
    showMessage('Network error', 'error');
  }
}

function editItem(id) {
  const item = menuItems.find(i => i.id === id);
  if (!item) return;

  editingItem = item;
  document.getElementById('itemName').value = item.name;
  document.getElementById('itemPrice').value = item.price;
  document.getElementById('itemCategory').value = item.category;
  document.getElementById('itemDescription').value = item.description || '';
  
  // Handle image editing
  selectedImageFile = null; // Clear any previously selected file
  selectedImageUrl = item.image_url || '';
  
  console.log('Editing item - existing image URL:', item.image_url);
  console.log('Editing item - selectedImageUrl set to:', selectedImageUrl);
  
  if (item.image_url) {
    document.getElementById('previewImg').src = item.image_url;
    document.getElementById('imagePreview').style.display = 'block';
    
    // Show status for existing image
    const statusEl = document.getElementById('imageStatus');
    statusEl.textContent = '📷 Existing image';
    statusEl.className = 'image-status existing';
  } else {
    document.getElementById('imagePreview').style.display = 'none';
  }

  // Set order type checkboxes
  const orderTypeCheckboxes = document.querySelectorAll('.order-types-checkboxes input[type="checkbox"]');
  orderTypeCheckboxes.forEach(cb => {
    cb.checked = item.order_types && item.order_types.includes(cb.value);
  });

  const addBtn = document.getElementById('formButton');
  addBtn.textContent = 'Update Item';
  addBtn.onclick = updateMenuItem;
  
  // Show cancel button
  document.getElementById('cancelButton').style.display = 'inline-block';
  
  // Show editing indicator
  document.getElementById('editingIndicator').classList.add('show');
  
  // Show message that item is being edited
  showMessage(`Editing: ${item.name}`, 'success');
}

async function updateMenuItem() {
  if (!editingItem) return;

  const name = document.getElementById('itemName').value.trim();
  const price = parseFloat(document.getElementById('itemPrice').value);
  const category = document.getElementById('itemCategory').value;
  const description = document.getElementById('itemDescription').value.trim();
  
  // Get selected order types
  const orderTypeCheckboxes = document.querySelectorAll('.order-types-checkboxes input[type="checkbox"]:checked');
  const order_types = Array.from(orderTypeCheckboxes).map(cb => cb.value);

  if (!name || !price || !category) {
    showMessage('Please fill all required fields', 'error');
    return;
  }

  if (order_types.length === 0) {
    showMessage('Please select at least one order type', 'error');
    return;
  }

  try {
    // Handle image update
    let image_url = selectedImageUrl;
    
    console.log('Update scenario - selectedImageFile:', selectedImageFile ? selectedImageFile.name : 'null');
    console.log('Update scenario - selectedImageUrl:', selectedImageUrl);
    
    // If a new image file is selected, upload it
    if (needsImageUpload()) {
      showMessage('Uploading new image...', 'success');
      image_url = await uploadImage();
      if (!image_url) {
        showMessage('Failed to upload new image', 'error');
        return;
      }
    } else if (!selectedImageUrl) {
      // If no image was previously selected and no new image is selected
      image_url = '';
      console.log('No previous image, setting empty string');
    } else {
      // If no new image is selected but there was a previous image, keep the previous image_url
      console.log('Keeping existing image:', selectedImageUrl);
    }

    const res = await fetch(`/api/menu/${editingItem.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name, 
        price, 
        category, 
        description, 
        image_url,
        order_types,
        isActive: editingItem.isActive 
      })
    });

    if (res.ok) {
      showMessage('Menu item updated successfully');
      clearForm();
      loadMenu();
    } else {
      const err = await res.json();
      showMessage(err.error || 'Failed to update item', 'error');
    }
  } catch (e) {
    showMessage('Network error', 'error');
  }
}

async function toggleItem(id) {
  const item = menuItems.find(i => i.id === id);
  if (!item) return;

  try {
    const res = await fetch(`/api/menu/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: item.name, 
        price: item.price, 
        category: item.category, 
        description: item.description, 
        image_url: item.image_url || '',
        order_types: item.order_types || ['Half', 'Full', '1 Plate'],
        isActive: !item.isActive 
      })
    });

    if (res.ok) {
      showMessage(`Item ${!item.isActive ? 'activated' : 'deactivated'} successfully`);
      loadMenu();
    } else {
      const err = await res.json();
      showMessage(err.error || 'Failed to toggle item', 'error');
    }
  } catch (e) {
    showMessage('Network error', 'error');
  }
}

async function deleteItem(id) {
  if (!confirm('Are you sure you want to delete this item?')) return;

  try {
    const res = await fetch(`/api/menu/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showMessage('Menu item deleted successfully');
      loadMenu();
    } else {
      const err = await res.json();
      showMessage(err.error || 'Failed to delete item', 'error');
    }
  } catch (e) {
    showMessage('Network error', 'error');
  }
}

function clearForm() {
  document.getElementById('itemName').value = '';
  document.getElementById('itemPrice').value = '';
  document.getElementById('itemCategory').value = '';
  document.getElementById('itemDescription').value = '';
  
  // Reset image fields
  selectedImageFile = null;
  selectedImageUrl = '';
  document.getElementById('itemImageFile').value = '';
  document.getElementById('imagePreview').style.display = 'none';
  
  // Reset order type checkboxes to default
  const orderTypeCheckboxes = document.querySelectorAll('.order-types-checkboxes input[type="checkbox"]');
  orderTypeCheckboxes.forEach(cb => {
    cb.checked = true; // Default all checked
  });
  
  editingItem = null;
  const addBtn = document.getElementById('formButton');
  addBtn.textContent = 'Add Item';
  addBtn.onclick = addMenuItem;
  
  // Hide cancel button
  document.getElementById('cancelButton').style.display = 'none';
  
  // Hide editing indicator
  document.getElementById('editingIndicator').classList.remove('show');
}

function cancelEdit() {
  clearForm();
  showMessage('Edit cancelled', 'success');
}

// Helper function to check if we need to upload a new image
function needsImageUpload() {
  return selectedImageFile && selectedImageFile instanceof File;
}

// Debug function to show current image state
function debugImageState() {
  console.log('=== DEBUG IMAGE STATE ===');
  console.log('selectedImageFile:', selectedImageFile);
  console.log('selectedImageFile type:', selectedImageFile ? typeof selectedImageFile : 'null');
  console.log('selectedImageFile instanceof File:', selectedImageFile instanceof File);
  console.log('selectedImageUrl:', selectedImageUrl);
  console.log('editingItem:', editingItem);
  console.log('needsImageUpload():', needsImageUpload());
  console.log('========================');
  
  showMessage(`Debug: File=${selectedImageFile ? 'Yes' : 'No'}, URL=${selectedImageUrl || 'None'}`, 'success');
}

// Subscribe to menu updates
function subscribeToEvents() {
  const ev = new EventSource('/api/events');
  ev.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'menu_updated') loadMenu();
    } catch {}
  };
}

loadMenu();
subscribeToEvents();
