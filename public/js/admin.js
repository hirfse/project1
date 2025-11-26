/* eslint-env browser */
/* global Swal */
(function () {
  'use strict';

  // ---------- Helpers ----------
  function byId(id) { return document.getElementById(id); }
  function $q(sel) { return document.querySelector(sel); }
  function $$q(sel) { return Array.from(document.querySelectorAll(sel)); }

  function openModal(modalId) {
    const modal = byId(modalId);
    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
    }
  }

  function toggleBlockUser(userId, status) {
    const action = status === 'blocked' ? 'unblock' : 'block';
    if (typeof Swal === 'undefined') {
      window.location.href = `/admin/toggleBlock/${userId}`;
      return;
    }
    Swal.fire({
      title: 'Are you sure?',
      text: `Do you want to ${action} this user?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes',
      cancelButtonText: 'No'
    }).then((result) => {
      if (result.isConfirmed) {
        window.location.href = `/admin/toggleBlock/${userId}`;
      }
    });
  }

  function closeModal(modalId) {
    const modal = byId(modalId);
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
    clearErrorMessages();
  }

  function searchTable() {
    const inputEl = byId('searchInput');
    if (!inputEl) return;
    const input = inputEl.value.toLowerCase();
    const table = byId('userTable') || byId('categoryTable') || byId('orderTable') || document.querySelector('table');
    if (!table) return;
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach((row) => { row.style.display = row.innerText.toLowerCase().includes(input) ? '' : 'none'; });
  }

  function validateForm(name, description, nameErrorId, descriptionErrorId) {
    clearErrorMessages();
    let isValid = true;
    if (!name.trim()) {
      displayErrorMessage(nameErrorId, 'Please enter a name');
      isValid = false;
    }
    if (!description.trim()) {
      displayErrorMessage(descriptionErrorId, 'Please enter a description');
      isValid = false;
    }
    return isValid;
  }

  function displayErrorMessage(elementId, message) {
    const el = byId(elementId);
    if (el) {
      el.innerText = message;
      el.style.display = 'block';
    }
  }

  function clearErrorMessages() {
    const errorElements = document.getElementsByClassName('error-message');
    Array.from(errorElements).forEach((el) => {
      el.innerText = '';
      el.style.display = 'none';
    });
  }

  function handleAddCategory(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    const name = byId('name')?.value || '';
    const description = byId('description')?.value || '';
    if (!validateForm(name, description, 'name-error', 'description-error')) return false;

    fetch('/admin/addCategory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name, description })
    })
      .then(async (response) => {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || data.message || 'Unknown server error');
          return data;
        } else {
          const text = await response.text();
          if (text && text.startsWith('<!DOCTYPE')) {
            if (typeof Swal !== 'undefined') {
              Swal.fire({ icon: 'warning', title: 'Session expired', text: 'Please login again to continue.' })
                .then(() => (window.location.href = '/admin/adminLogin'));
            } else {
              window.location.href = '/admin/adminLogin';
            }
            return null;
          }
          throw new Error('Unexpected response from server');
        }
      })
      .then((data) => {
        if (data === null) return; // handled
        if (typeof Swal !== 'undefined') {
          Swal.fire({ icon: 'success', title: 'Success', text: data.message || 'Category added successfully!', timer: 1500, showConfirmButton: false })
            .then(() => window.location.reload());
        } else {
          window.location.reload();
        }
      })
      .catch((error) => {
        const msg = (error && error.message) ? error.message : 'Unknown error';
        if (typeof Swal !== 'undefined') {
          Swal.fire({ icon: 'error', title: 'Error', text: msg });
        } else {
          alert(msg);
        }
      });
    return false;
  }

  function handleEditCategory(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    const categoryId = byId('editCategoryId')?.value || '';
    const categoryName = byId('editCategoryName')?.value || '';
    const description = byId('editDescription')?.value || '';
    if (!validateForm(categoryName, description, 'edit-name-error', 'edit-description-error')) return false;

    fetch(`/admin/editCategory/${categoryId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryName, description })
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().then((err) => {
            throw new Error(err.error || err.message || 'Failed to update category');
          });
        }
        return response.json();
      })
      .then((result) => {
        if (typeof Swal !== 'undefined') {
          Swal.fire({ icon: 'success', title: 'Success!', text: result.message || 'Category updated successfully', showConfirmButton: false, timer: 1500 })
            .then(() => window.location.reload());
        } else {
          window.location.reload();
        }
      })
      .catch((error) => {
        if (typeof Swal !== 'undefined') {
          Swal.fire({ icon: 'error', title: 'Oops...', text: error.message || 'Something went wrong while updating the category' });
        } else {
          alert(error.message || 'Something went wrong while updating the category');
        }
      });
    return false;
  }

  function openEditCategoryModal(id, name, description) {
    if (byId('editCategoryId')) byId('editCategoryId').value = id;
    if (byId('editCategoryName')) byId('editCategoryName').value = name;
    if (byId('editDescription')) byId('editDescription').value = description;
    openModal('editCategoryModal');
  }

  function toggleListCategory(categoryId, isListed) {
    const action = isListed ? 'unlist' : 'list';
    if (typeof Swal === 'undefined') {
      fetch(`/admin/${action}Category?id=${categoryId}`, { method: 'GET', headers: { Accept: 'application/json' } })
        .then(() => window.location.reload());
      return;
    }

    Swal.fire({
      title: 'Are you sure?',
      text: `Do you want to ${action} this category?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes',
      cancelButtonText: 'No'
    }).then((result) => {
      if (result.isConfirmed) {
        fetch(`/admin/${action}Category?id=${categoryId}`, { method: 'GET', headers: { Accept: 'application/json' } })
          .then((response) => {
            if (response.redirected) {
              const redirectUrl = response.url;
              const urlParams = new URLSearchParams(redirectUrl.split('?')[1] || '');
              const error = urlParams.get('error');
              const success = urlParams.get('success');
              if (success) { window.location.reload(); return; }
              if (error) throw new Error(error);
              throw new Error('Unexpected redirect occurred');
            }
            if (!response.ok) {
              return response.json().then((err) => { throw new Error(err.error || err.message || `HTTP ${response.status}`); })
                .catch(() => response.text().then((text) => { throw new Error(`HTTP ${response.status}: Server returned invalid response`); }));
            }
            window.location.reload();
          })
          .catch((error) => {
            Swal.fire({ icon: 'error', title: 'Error', text: error.message || `Failed to ${action} category` });
          });
      }
    });
  }

  function handleServerFeedbackFromUrl() {
    if (typeof Swal === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const success = urlParams.get('success');
    if (error) {
      Swal.fire({ icon: 'error', title: 'Error', text: error, showConfirmButton: true });
    } else if (success) {
      Swal.fire({ icon: 'success', title: 'Success', text: success, timer: 1500, showConfirmButton: false });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Server feedback
    handleServerFeedbackFromUrl();

    // Sidebar collapse
    const collapseBtn = byId('collapseBtn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => document.body.classList.toggle('collapsed-sidebar'));
    }

    // Theme toggle
    const themeToggle = byId('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', function () {
        document.body.classList.toggle('dark-mode');
        const icon = this.querySelector('i');
        if (icon) {
          if (document.body.classList.contains('dark-mode')) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
          } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
          }
        }
      });
    }

    // Add category button
    const addCategoryBtn = byId('addCategoryBtn');
    if (addCategoryBtn) {
      addCategoryBtn.addEventListener('click', () => openModal('addCategoryModal'));
    }

    // User dropdown
    const userDropdown = byId('userDropdown');
    const userMenu = byId('userMenu');
    if (userDropdown && userMenu) {
      userDropdown.addEventListener('click', () => userMenu.classList.toggle('show'));
      document.addEventListener('click', (event) => {
        if (!event.target.closest('#userDropdown')) userMenu.classList.remove('show');
      });
    }

    // Generic search input binding
    const searchInput = byId('searchInput');
    if (searchInput) {
      const handler = () => { try { searchTable(); } catch (_) {} };
      searchInput.addEventListener('keyup', handler);
      searchInput.addEventListener('input', handler);
    }

    // Coupon page: applicability toggle and modal open
    const addCouponBtn = byId('addCouponBtn');
    if (addCouponBtn) {
      addCouponBtn.addEventListener('click', () => {
        const form = byId('couponForm'); if (form) { form.reset(); form.removeAttribute('data-coupon-id'); }
        const title = byId('modalTitle'); if (title) title.textContent = 'Add Coupon';
        openModal('addCouponModal');
        const typeSel = byId('applicableType'); if (typeSel) toggleApplicability();
      });
      // Close when clicking outside modal overlay
      window.addEventListener('click', (evt) => {
        const overlay = byId('addCouponModal'); if (overlay && evt.target === overlay) closeModal('addCouponModal');
      });
    }

    // Edit Category: submit via fetch with SweetAlert
    const editCategoryForm = byId('editCategoryForm');
    if (editCategoryForm) {
      editCategoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(editCategoryForm);
        const data = Object.fromEntries(formData);
        try {
          const response = await fetch(editCategoryForm.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Failed to update category');
          if (typeof Swal !== 'undefined') {
            Swal.fire({ icon: 'success', title: 'Success!', text: result.message || 'Category updated successfully', showConfirmButton: false, timer: 1500 }).then(() => { window.location.href = '/admin/category'; });
          } else {
            window.location.href = '/admin/category';
          }
        } catch (error) {
          if (typeof Swal !== 'undefined') Swal.fire({ icon: 'error', title: 'Oops...', text: error.message || 'Something went wrong while updating the category' });
          else alert(error.message || 'Something went wrong while updating the category');
        }
      });
    }
  });

  // Expose functions for inline handlers
  if (!window.openModal) window.openModal = openModal;
  if (!window.closeModal) window.closeModal = closeModal;
  if (!window.searchTable) window.searchTable = searchTable;
  if (!window.handleAddCategory) window.handleAddCategory = handleAddCategory;
  if (!window.handleEditCategory) window.handleEditCategory = handleEditCategory;
  if (!window.openEditCategoryModal) window.openEditCategoryModal = openEditCategoryModal;
  if (!window.toggleListCategory) window.toggleListCategory = toggleListCategory;
  if (!window.toggleApplicability) window.toggleApplicability = function () {
    const applicableType = byId('applicableType')?.value || '';
    const productSelection = byId('productSelection');
    const categorySelection = byId('categorySelection');
    if (productSelection) productSelection.style.display = (applicableType === 'products') ? 'block' : 'none';
    if (categorySelection) categorySelection.style.display = (applicableType === 'categories') ? 'block' : 'none';
  };

  // ================= Inventory Page Logic =================
  function updateFilters() {
    const search = byId('globalSearch')?.value || '';
    const category = byId('categoryFilter')?.value || '';
    const status = byId('statusFilter')?.value || '';
    const stockLevel = byId('stockLevelFilter')?.value || '';
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (category) params.append('category', category);
    if (status) params.append('status', status);
    if (stockLevel) params.append('stockLevel', stockLevel);
    window.location.href = '/admin/inventory?' + params.toString();
  }

  function updateBulkUpdateButton() {
    const checked = $$q('.product-checkbox:checked');
    const btn = byId('bulkUpdateBtn');
    if (!btn) return;
    if (checked.length > 0) {
      btn.innerHTML = `<i class="fas fa-edit"></i> Bulk Update (${checked.length})`;
      btn.disabled = false; btn.style.opacity = '1';
    } else {
      btn.innerHTML = '<i class="fas fa-edit"></i> Bulk Update';
      btn.disabled = true; btn.style.opacity = '0.6';
    }
  }

  function openStockModal(productId, productName, currentStock) {
    const idEl = byId('modalProductId'); if (idEl) idEl.value = productId;
    const nameEl = byId('modalProductName'); if (nameEl) nameEl.value = productName;
    const stockEl = byId('modalCurrentStock'); if (stockEl) stockEl.value = currentStock;
    const qtyEl = byId('modalQuantity'); if (qtyEl) qtyEl.value = '';
    const reasonEl = byId('modalReason'); if (reasonEl) reasonEl.value = '';
    const actionEl = byId('modalAction'); if (actionEl) actionEl.value = 'set';
    const modal = byId('stockModal'); if (modal) modal.style.display = 'flex';
  }

  function quickAdjust(productId, action) {
    if (typeof Swal === 'undefined') return;
    Swal.fire({
      title: `${action === 'add' ? 'Add' : 'Subtract'} Stock`,
      input: 'number', inputLabel: 'Quantity', inputPlaceholder: 'Enter quantity',
      inputAttributes: { min: 1, step: 1 }, showCancelButton: true,
      confirmButtonText: action === 'add' ? 'Add Stock' : 'Subtract Stock', cancelButtonText: 'Cancel',
      inputValidator: (v) => { if (!v || v <= 0) return 'Please enter a valid quantity!'; }
    }).then((result) => { if (result.isConfirmed) { updateStock(productId, result.value, action); } });
  }

  function updateStock(productId, quantity, action) {
    fetch(`/admin/inventory/update-stock/${productId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: parseInt(quantity, 10), action }) })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const stock = byId(`stock-${productId}`); if (stock) stock.textContent = data.newQuantity;
          const statusEl = byId(`status-${productId}`); if (statusEl) { statusEl.textContent = data.newStatus; statusEl.className = 'status-badge ' + (data.newStatus === 'Available' ? 'status-completed' : data.newStatus === 'Out of Stock' ? 'status-cancelled' : 'status-pending'); }
          if (typeof Swal !== 'undefined') Swal.fire({ title: 'Success!', text: data.message, icon: 'success', timer: 2000, showConfirmButton: false });
        } else {
          if (typeof Swal !== 'undefined') Swal.fire({ title: 'Error!', text: data.error, icon: 'error' });
        }
      })
      .catch(() => { if (typeof Swal !== 'undefined') Swal.fire({ title: 'Error!', text: 'Failed to update stock', icon: 'error' }); });
  }

  // Attach Inventory handlers if page elements exist
  document.addEventListener('DOMContentLoaded', () => {
    if (byId('inventoryTable')) {
      const collapseBtn = byId('collapseBtn'); if (collapseBtn) collapseBtn.addEventListener('click', () => document.body.classList.toggle('collapsed-sidebar'));
      const globalSearch = byId('globalSearch'); if (globalSearch) globalSearch.addEventListener('input', (e) => { const term = e.target.value; if (term.length > 2 || term.length === 0) updateFilters(); });
      const categoryFilter = byId('categoryFilter'); if (categoryFilter) categoryFilter.addEventListener('change', updateFilters);
      const statusFilter = byId('statusFilter'); if (statusFilter) statusFilter.addEventListener('change', updateFilters);
      const stockLevelFilter = byId('stockLevelFilter'); if (stockLevelFilter) stockLevelFilter.addEventListener('change', updateFilters);
      const clearFilters = byId('clearFilters'); if (clearFilters) clearFilters.addEventListener('click', () => { window.location.href = '/admin/inventory'; });
      const selectAllCheckbox = byId('selectAllCheckbox'); if (selectAllCheckbox) selectAllCheckbox.addEventListener('change', function () { $$q('.product-checkbox').forEach(cb => { cb.checked = this.checked; }); updateBulkUpdateButton(); });
      const selectAllBtn = byId('selectAllBtn'); if (selectAllBtn) selectAllBtn.addEventListener('click', function () { const checkboxes = $$q('.product-checkbox'); const allChecked = checkboxes.every(cb => cb.checked); checkboxes.forEach(cb => { cb.checked = !allChecked; }); const headerCb = byId('selectAllCheckbox'); if (headerCb) headerCb.checked = !allChecked; updateBulkUpdateButton(); this.innerHTML = allChecked ? '<i class="fas fa-check-square"></i> Select All' : '<i class="fas fa-square"></i> Deselect All'; });
      $$q('.product-checkbox').forEach(cb => cb.addEventListener('change', () => { updateBulkUpdateButton(); const all = $$q('.product-checkbox'); const checked = $$q('.product-checkbox:checked'); const headerCb = byId('selectAllCheckbox'); if (headerCb) headerCb.checked = all.length === checked.length; }));
      const bulkUpdateBtn = byId('bulkUpdateBtn'); if (bulkUpdateBtn) bulkUpdateBtn.addEventListener('click', () => { const checked = $$q('.product-checkbox:checked'); if (checked.length === 0) { if (typeof Swal !== 'undefined') Swal.fire({ title: 'No Products Selected', text: 'Please select products to update', icon: 'warning' }); return; } const list = byId('selectedProductsList'); if (list) { list.innerHTML = ''; checked.forEach(cb => { const row = cb.closest('tr'); const name = row?.querySelector('.product-name')?.textContent || 'Product'; const current = row?.querySelector('.stock-quantity')?.textContent || '-'; const item = document.createElement('div'); item.className = 'selected-product-item'; item.innerHTML = `<span class="product-name">${name}</span><span class="current-stock">Current: ${current}</span>`; list.appendChild(item); }); } const modal = byId('bulkUpdateModal'); if (modal) modal.style.display = 'flex'; });
      const stockUpdateForm = byId('stockUpdateForm'); if (stockUpdateForm) stockUpdateForm.addEventListener('submit', (e) => { e.preventDefault(); const productId = byId('modalProductId')?.value; const qty = byId('modalQuantity')?.value; const action = byId('modalAction')?.value; if (productId && qty) { updateStock(productId, qty, action); } const modal = byId('stockModal'); if (modal) modal.style.display = 'none'; });
      const bulkUpdateForm = byId('bulkUpdateForm'); if (bulkUpdateForm) bulkUpdateForm.addEventListener('submit', (e) => { e.preventDefault(); const checked = $$q('.product-checkbox:checked'); const qty = byId('bulkQuantity')?.value; const action = byId('bulkAction')?.value; if (!qty) return; checked.forEach(cb => { const id = cb.value; updateStock(id, qty, action); }); const modal = byId('bulkUpdateModal'); if (modal) modal.style.display = 'none'; });
      // Expose inventory-specific fns
      if (!window.openStockModal) window.openStockModal = openStockModal;
      if (!window.quickAdjust) window.quickAdjust = quickAdjust;
      if (!window.updateFilters) window.updateFilters = updateFilters;
    }
  });

  // ================= Products Page Logic (Cropper, Add/Edit) =================
  const croppers = {};

  async function populateFilterSubcategories(categoryId, selected = '') {
    const subSelect = byId('filterSubcategory'); if (!subSelect) return;
    if (!categoryId) { subSelect.innerHTML = '<option value="">All Subcategories</option>'; subSelect.disabled = true; return; }
    try {
      const res = await fetch(`/admin/subcategories?category=${categoryId}`, { headers: { 'Accept': 'application/json' } });
      const data = await res.json(); const subs = (data && data.subcategories) ? data.subcategories.filter(s => s.isActive) : [];
      subSelect.innerHTML = '<option value="">All Subcategories</option>' + subs.map(s => `<option value="${s._id}">${s.name}</option>`).join(''); subSelect.disabled = false; if (selected) subSelect.value = selected;
    } catch {
      subSelect.innerHTML = '<option value="">All Subcategories</option>'; subSelect.disabled = true;
    }
  }

  async function populateSubcategories(selectId, categoryId, selectedSubId = '') {
    const select = byId(selectId); if (!select) return;
    if (!categoryId) { select.innerHTML = '<option value="">Select Category first</option>'; select.disabled = true; return; }
    try {
      const res = await fetch(`/admin/subcategories?category=${categoryId}`, { headers: { 'Accept': 'application/json' } });
      const data = await res.json(); const subs = data.subcategories || [];
      select.innerHTML = '<option value="">None</option>' + subs.filter(s => s.isActive).map(s => `<option value="${s._id}">${s.name}</option>`).join('');
      select.disabled = false; if (selectedSubId) select.value = selectedSubId;
    } catch {
      select.innerHTML = '<option value="">Failed to load</option>'; select.disabled = true;
    }
  }

  function viewImage(event, index, prefix) {
    const input = event.target; const previewImage = byId(`${prefix}ImgView${index}`); const cropperContainer = byId(`${prefix}CropperContainer${index}`); const cropperImage = byId(`${prefix}CroppedImg${index}`); const saveButton = byId(`${prefix}SaveButton${index}`);
    if (input.files && input.files[0]) {
      const file = input.files[0]; const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
      if (!validTypes.includes(file.type)) { displayErrorMessage(`${prefix}-image-error-${index}`, 'Only JPG and PNG files allowed'); input.value = ''; return; }
      const reader = new FileReader(); reader.onload = function (e) {
        if (previewImage) { previewImage.src = e.target.result; previewImage.style.display = 'block'; }
        if (cropperImage) cropperImage.src = e.target.result; if (cropperContainer) cropperContainer.style.display = 'block'; if (saveButton) saveButton.style.display = 'block';
        if (croppers[`${prefix}${index}`]) { croppers[`${prefix}${index}`].destroy(); }
        if (typeof Cropper !== 'undefined' && cropperImage) {
          croppers[`${prefix}${index}`] = new Cropper(cropperImage, { aspectRatio: 1, viewMode: 1, guides: true, background: false, autoCropArea: 0.8, zoomable: true, scalable: true, movable: true });
        }
      }; reader.readAsDataURL(file);
    }
  }

  function saveCroppedImage(index, prefix) {
    const cropperContainer = byId(`${prefix}CropperContainer${index}`); const previewImage = byId(`${prefix}ImgView${index}`); const input = byId(`${prefix}Input${index}`); const saveButton = byId(`${prefix}SaveButton${index}`); const thumbnailsContainer = byId(`${prefix}ThumbnailsContainer`);
    const cp = croppers[`${prefix}${index}`]; if (!cp) { if (typeof Swal !== 'undefined') Swal.fire({ icon: 'error', title: 'Error', text: 'Cropper is not initialized' }); return; }
    const croppedCanvas = cp.getCroppedCanvas({ width: 800, height: 800 }); if (!croppedCanvas) { if (typeof Swal !== 'undefined') Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to crop the image' }); return; }
    if (previewImage) previewImage.src = croppedCanvas.toDataURL('image/jpeg', 0.9);
    croppedCanvas.toBlob(function (blob) {
      const fileName = `cropped-img-${Date.now()}-${index}.jpeg`; const imgFile = new File([blob], fileName, { type: 'image/jpeg' }); const dt = new DataTransfer(); dt.items.add(imgFile); if (input) input.files = dt.files;
      if (thumbnailsContainer && previewImage) { const thumbnail = document.createElement('img'); thumbnail.src = previewImage.src; thumbnail.className = 'thumbnail'; thumbnail.style.width = '100px'; thumbnail.style.height = '100px'; thumbnail.style.objectFit = 'cover'; thumbnailsContainer.appendChild(thumbnail); }
      if (cropperContainer) cropperContainer.style.display = 'none'; if (saveButton) saveButton.style.display = 'none'; cp.destroy(); delete croppers[`${prefix}${index}`]; if (typeof Swal !== 'undefined') Swal.fire({ icon: 'success', title: 'Success', text: 'Image cropped successfully', timer: 1500 });
    }, 'image/jpeg', 0.9);
  }

  function productFormValidate(formId) {
    const prefix = formId === 'addProductForm' ? 'add' : 'edit';
    const productName = byId(`${prefix}ProductName`)?.value || '';
    const description = byId(`${prefix}Description`)?.value || '';
    const regularPrice = byId(`${prefix}RegularPrice`)?.value || '';
    const salePrice = byId(`${prefix}SalePrice`)?.value || '';
    const quantity = byId(`${prefix}Quantity`)?.value || '';
    const category = byId(`${prefix}Category`)?.value || '';
    clearErrorMessages(formId);
    let isValid = true;
    const validImageTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!productName.trim()) { displayErrorMessage(`${prefix}-productName-error`, 'Product name is required'); isValid = false; } else if (productName.trim().length < 3) { displayErrorMessage(`${prefix}-productName-error`, 'Product name must be at least 3 characters long'); isValid = false; }
    if (!description.trim()) { displayErrorMessage(`${prefix}-description-error`, 'Description is required'); isValid = false; } else if (description.trim().length < 10) { displayErrorMessage(`${prefix}-description-error`, 'Description must be at least 10 characters long'); isValid = false; }
    if (!regularPrice || isNaN(regularPrice) || parseFloat(regularPrice) < 0) { displayErrorMessage(`${prefix}-regularPrice-error`, 'Enter a valid non-negative price'); isValid = false; } else if (parseFloat(regularPrice) < 1) { displayErrorMessage(`${prefix}-regularPrice-error`, 'Price must be at least ₹1'); isValid = false; }
    if (salePrice) { if (isNaN(salePrice) || parseFloat(salePrice) < 0) { displayErrorMessage(`${prefix}-salePrice-error`, 'Enter a valid non-negative price'); isValid = false; } else if (parseFloat(salePrice) > parseFloat(regularPrice)) { displayErrorMessage(`${prefix}-salePrice-error`, 'Sale price cannot be greater than regular price'); isValid = false; } else if (parseFloat(salePrice) === parseFloat(regularPrice)) { displayErrorMessage(`${prefix}-salePrice-error`, 'Sale price should be less than regular price'); isValid = false; } }
    if (!quantity || isNaN(quantity) || !Number.isInteger(Number(quantity)) || quantity < 0) { displayErrorMessage(`${prefix}-quantity-error`, 'Enter a valid non-negative whole number'); isValid = false; }
    if (!category) { displayErrorMessage(`${prefix}-category-error`, 'Select a category'); isValid = false; }
    // image validation handled in save crop; optional here
    return isValid;
  }

  function displayErrorMessage(elementId, message) {
    const el = byId(elementId); if (el) { el.innerText = message; el.classList.add('show'); const inputId = elementId.replace('-error', ''); const inputEl = byId(inputId); if (inputEl) inputEl.classList.add('error'); }
  }
  function displayValidationErrors(errors, prefix) { clearErrorMessages(prefix === 'add' ? 'addProductForm' : 'editProductForm'); Object.keys(errors || {}).forEach(field => { const eid = `${prefix}-${field}-error`; displayErrorMessage(eid, errors[field]); }); }
  function clearErrorMessages(formId) {
    const prefix = formId === 'addProductForm' ? 'add' : 'edit';
    const ids = [`${prefix}-productName-error`, `${prefix}-description-error`, `${prefix}-regularPrice-error`, `${prefix}-salePrice-error`, `${prefix}-quantity-error`, `${prefix}-category-error`, `${prefix}-subcategory-error`, `${prefix}-status-error`, `${prefix}-image-error`, `${prefix}-image-error-1`, `${prefix}-image-error-2`, `${prefix}-image-error-3`, `${prefix}-image-error-4`];
    ids.forEach(id => { const el = byId(id); if (el) { el.innerText = ''; el.classList.remove('show'); } });
    const form = byId(formId); if (form) { form.querySelectorAll('input, select, textarea').forEach(inp => { inp.classList.remove('error'); inp.addEventListener('input', function () { const errEl = byId(this.id + '-error'); if (errEl) { errEl.innerText=''; errEl.classList.remove('show'); } this.classList.remove('error'); }); }); }
  }

  async function openEditProductModal(id, productName, description, regularPrice, salePrice, quantity, categoryId, subCategoryId, status, images) {
    if (byId('editProductId')) byId('editProductId').value = id;
    if (byId('editProductName')) byId('editProductName').value = productName;
    if (byId('editDescription')) byId('editDescription').value = description;
    if (byId('editRegularPrice')) byId('editRegularPrice').value = regularPrice;
    if (byId('editSalePrice')) byId('editSalePrice').value = salePrice;
    if (byId('editQuantity')) byId('editQuantity').value = quantity;
    if (byId('editCategory')) byId('editCategory').value = categoryId;
    if (byId('editStatus')) byId('editStatus').value = status;
    await populateSubcategories('editSubcategory', categoryId, subCategoryId);
    const existing = byId('editExistingImages'); if (existing) { existing.innerHTML = ''; try { const arr = JSON.parse(images || '[]'); arr.forEach((img, idx) => { const div = document.createElement('div'); div.className = 'position-relative'; div.innerHTML = `<img src="/uploads/product-images/${img}" class="thumbnail" alt="Product Image ${idx+1}"><input type="checkbox" name="deleteImages" value="${img}" id="delete-${idx}" class="position-absolute top-0 end-0 m-1"><label for="delete-${idx}" class="small text-muted d-block text-center">Remove</label>`; existing.appendChild(div); }); } catch {} }
    openModal('editProductModal');
  }

  function handleAddProduct(e) {
    e.preventDefault(); const form = byId('addProductForm'); if (!form) return; if (!productFormValidate('addProductForm')) return;
    const formData = new FormData(form);
    fetch('/admin/add-products', { method: 'POST', body: formData })
      .then(async (response) => {
        const ct = response.headers.get('content-type') || ''; if (ct.includes('application/json')) { const data = await response.json(); if (!response.ok) { if (data && data.validationErrors) { displayValidationErrors(data.validationErrors, 'add'); return null; } throw new Error((data && (data.message || data.error)) || 'Failed to add product'); } return data; }
        const text = await response.text(); if (text && text.startsWith('<!DOCTYPE')) { if (typeof Swal !== 'undefined') Swal.fire({ icon: 'warning', title: 'Session expired', text: 'Please login again to continue.' }).then(() => { window.location.href = '/admin/adminLogin'; }); return null; } throw new Error('Unexpected response from server');
      })
      .then((data) => { if (data === null) return; if (typeof Swal !== 'undefined') { Swal.fire({ icon: 'success', title: 'Success', text: data.message || 'Product added successfully!', timer: 1500, showConfirmButton: false }).then(() => window.location.reload()); } else { window.location.reload(); } })
      .catch((error) => { if (typeof Swal !== 'undefined') Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'Failed to add product' }); else alert(error.message || 'Failed to add product'); });
  }

  function handleEditProduct(e) {
    e.preventDefault(); const form = byId('editProductForm'); if (!form) return; if (!productFormValidate('editProductForm')) return;
    const id = byId('editProductId')?.value; const formData = new FormData(form);
    fetch(`/admin/edit-product/${id}`, { method: 'POST', body: formData })
      .then(async (response) => {
        const ct = response.headers.get('content-type') || ''; if (ct.includes('application/json')) { const data = await response.json(); if (!response.ok) { if (data && data.validationErrors) { displayValidationErrors(data.validationErrors, 'edit'); return null; } throw new Error((data && (data.message || data.error)) || 'Failed to update product'); } return data; }
        const text = await response.text(); if (text && text.startsWith('<!DOCTYPE')) { if (typeof Swal !== 'undefined') Swal.fire({ icon: 'warning', title: 'Session expired', text: 'Please login again to continue.' }).then(() => { window.location.href = '/admin/adminLogin'; }); return null; } throw new Error('Unexpected response from server');
      })
      .then((data) => { if (data === null) return; if (typeof Swal !== 'undefined') { Swal.fire({ icon: 'success', title: 'Success!', text: data.message || 'Product updated successfully', showConfirmButton: false, timer: 1500 }).then(() => window.location.reload()); } else { window.location.reload(); } })
      .catch((error) => { if (typeof Swal !== 'undefined') Swal.fire({ icon: 'error', title: 'Oops...', text: error.message || 'Something went wrong while updating the product' }); else alert(error.message || 'Something went wrong while updating the product'); });
  }

  // Attach Products handlers if page elements exist
  document.addEventListener('DOMContentLoaded', () => {
    if (byId('productTable') || byId('addProductForm') || byId('editProductForm')) {
      const collapseBtn = byId('collapseBtn'); if (collapseBtn) collapseBtn.addEventListener('click', () => document.body.classList.toggle('collapsed-sidebar'));
      const filterCategorySelect = document.querySelector('select[name="category"]'); if (filterCategorySelect) filterCategorySelect.addEventListener('change', function () { populateFilterSubcategories(this.value, ''); });
      const preCat = (typeof selectedCategory !== 'undefined') ? selectedCategory : (document.querySelector('[name="category"]')?.value || '');
      const preSub = (typeof selectedSubCategory !== 'undefined') ? selectedSubCategory : '';
      if (preCat) populateFilterSubcategories(preCat, preSub);
      const addBtn = byId('addProductBtn'); if (addBtn) addBtn.addEventListener('click', (e) => { e.preventDefault(); openModal('addProductModal'); });
      const addForm = byId('addProductForm'); if (addForm) addForm.addEventListener('submit', handleAddProduct);
      const editForm = byId('editProductForm'); if (editForm) editForm.addEventListener('submit', handleEditProduct);
      $$q('.edit-product-btn').forEach(btn => btn.addEventListener('click', function () { const id = this.dataset.id; openEditProductModal(id, this.dataset.name, this.dataset.description, this.dataset.regularPrice, this.dataset.salePrice, this.dataset.quantity, this.dataset.category, this.dataset.subcategory, this.dataset.status, this.dataset.images); }));
      $$q('.toggle-block-btn').forEach(btn => btn.addEventListener('click', function () { const productId = this.dataset.id; const isBlocked = this.dataset.blocked; if (typeof Swal !== 'undefined') Swal.fire({ title: isBlocked === 'true' ? 'Unblock product?' : 'Block product?', icon: 'warning', showCancelButton: true }).then((res) => { if (res.isConfirmed) { fetch(`/admin/toggle-block-product/${productId}`, { method: 'POST' }).then(() => window.location.reload()); } }); else fetch(`/admin/toggle-block-product/${productId}`, { method: 'POST' }).then(() => window.location.reload()); }));
      const cancelAddBtn = document.querySelector('.cancel-add-btn'); if (cancelAddBtn) cancelAddBtn.addEventListener('click', () => closeModal('addProductModal'));
      const cancelEditBtn = document.querySelector('.cancel-edit-btn'); if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => closeModal('editProductModal'));
      $$q('.image-input').forEach(input => input.addEventListener('change', function (event) { const index = this.dataset.index; const type = this.dataset.type; viewImage(event, index, type); }));
      $$q('.save-crop-btn').forEach(btn => btn.addEventListener('click', function () { const index = this.dataset.index; const type = this.dataset.type; saveCroppedImage(index, type); }));
      if (!window.viewImage) window.viewImage = function (event, index, type) { viewImage(event, index, type); };
      if (!window.saveCroppedImage) window.saveCroppedImage = function (index, type) { saveCroppedImage(index, type); };
      if (!window.openEditProductModal) window.openEditProductModal = openEditProductModal;
      const addCategorySelect = byId('addCategory'); if (addCategorySelect) addCategorySelect.addEventListener('change', function () { populateSubcategories('addSubcategory', this.value, ''); });
      const editCategorySelect = byId('editCategory'); if (editCategorySelect) editCategorySelect.addEventListener('change', function () { populateSubcategories('editSubcategory', this.value, ''); });
    }
  });
})();
