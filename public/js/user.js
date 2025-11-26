/* eslint-env browser */
/* global Swal */
(function () {
  'use strict';

  // ---------- Utilities ----------
  function $(selector) { return document.querySelector(selector); }
  function $all(selector) { return Array.from(document.querySelectorAll(selector)); }

  // ---------- Global UI helpers ----------
  function profileViewModal() {
    const el = document.getElementById('profileViewModal');
    if (el) el.style.display = 'block';
  }

  // ---------- Product Details helpers ----------
  let maxQuantity = 10;

  function resolveProductIdForDetails() {
    const m = window.location.pathname.match(/^\/product\/([^\/]+)/);
    return m ? m[1] : null;
  }

  function magnify(imgID, zoom) {
    const img = document.getElementById(imgID);
    if (!img) return;
    const existing = document.querySelector('.img-magnifier-glass');
    if (existing) existing.remove();
    const glass = document.createElement('div');
    glass.setAttribute('class', 'img-magnifier-glass');
    img.parentElement.insertBefore(glass, img);
    glass.style.backgroundImage = `url('${img.src}')`;
    glass.style.backgroundRepeat = 'no-repeat';
    glass.style.backgroundSize = `${img.width * zoom}px ${img.height * zoom}px`;
    const w = glass.offsetWidth / 2;
    const h = glass.offsetHeight / 2;

    function getCursorPos(e) {
      e = e || window.event;
      const a = img.getBoundingClientRect();
      const x = e.pageX - a.left - window.pageXOffset;
      const y = e.pageY - a.top - window.pageYOffset;
      return { x, y };
    }
    function moveMagnifier(e) {
      e.preventDefault();
      const pos = getCursorPos(e);
      let x = pos.x;
      let y = pos.y;
      if (x > img.width - (w / zoom)) x = img.width - (w / zoom);
      if (x < w / zoom) x = w / zoom;
      if (y > img.height - (h / zoom)) y = img.height - (h / zoom);
      if (y < h / zoom) y = h / zoom;
      glass.style.left = (x - w) + 'px';
      glass.style.top = (y - h) + 'px';
      glass.style.backgroundPosition = `-${(x * zoom) - w}px -${(y * zoom) - h}px`;
    }
    img.addEventListener('mouseenter', () => { glass.style.display = 'block'; });
    img.addEventListener('mouseleave', () => { glass.style.display = 'none'; });
    glass.addEventListener('mousemove', moveMagnifier);
    img.addEventListener('mousemove', moveMagnifier);
    glass.addEventListener('touchmove', moveMagnifier);
    img.addEventListener('touchmove', moveMagnifier);
  }

  function changeMainImage(src, element) {
    const mainImage = document.getElementById('mainImage');
    if (!mainImage) return;
    mainImage.src = src;
    document.querySelectorAll('.thumbnail-container').forEach(t => t.classList.remove('active'));
    if (element && element.parentElement) element.parentElement.classList.add('active');
    const oldGlass = document.querySelector('.img-magnifier-glass');
    if (oldGlass) oldGlass.remove();
    setTimeout(() => magnify('mainImage', 3), 50);
  }

  function initializeQuantitySelector() {
    const quantityInput = document.getElementById('quantityInput');
    if (!quantityInput) return;
    const decreaseBtn = document.getElementById('decreaseBtn');
    const increaseBtn = document.getElementById('increaseBtn');
    const addToCartBtn = document.getElementById('addToCartBtn');
    const buyNowBtn = document.getElementById('buyNowBtn');
    const stockMessage = document.getElementById('stockMessage');
    const stockCountEl = document.getElementById('stockCount');
    const stockCount = parseInt((stockCountEl?.textContent || '0').trim(), 10);
    maxQuantity = Math.min(isNaN(stockCount) ? 0 : stockCount, 10);

    if (maxQuantity <= 0) {
      quantityInput.value = 0;
      if (decreaseBtn) decreaseBtn.disabled = true;
      if (increaseBtn) increaseBtn.disabled = true;
      if (addToCartBtn) addToCartBtn.disabled = true;
      if (buyNowBtn) buyNowBtn.disabled = true;
      if (stockMessage) stockMessage.textContent = 'Out of Stock';
      return;
    }
    quantityInput.value = 1;
    if (decreaseBtn) decreaseBtn.disabled = true;
    if (increaseBtn) increaseBtn.disabled = (maxQuantity === 1);
  }

  function decreaseQuantity() {
    const quantityInput = document.getElementById('quantityInput');
    const decreaseBtn = document.getElementById('decreaseBtn');
    const increaseBtn = document.getElementById('increaseBtn');
    const buyNowQty = document.getElementById('buyNowQuantityInput');
    if (!quantityInput) return;
    let currentQuantity = parseInt(quantityInput.value || '1', 10);
    if (currentQuantity > 1) {
      currentQuantity--;
      quantityInput.value = String(currentQuantity);
      if (buyNowQty) buyNowQty.value = String(currentQuantity);
      if (increaseBtn) increaseBtn.disabled = false;
      if (currentQuantity === 1 && decreaseBtn) decreaseBtn.disabled = true;
    }
  }

  function increaseQuantity() {
    const quantityInput = document.getElementById('quantityInput');
    const decreaseBtn = document.getElementById('decreaseBtn');
    const increaseBtn = document.getElementById('increaseBtn');
    const stockMessage = document.getElementById('stockMessage');
    const buyNowQty = document.getElementById('buyNowQuantityInput');
    if (!quantityInput) return;
    let currentQuantity = parseInt(quantityInput.value || '1', 10);
    if (currentQuantity < maxQuantity) {
      currentQuantity++;
      quantityInput.value = String(currentQuantity);
      if (buyNowQty) buyNowQty.value = String(currentQuantity);
      if (decreaseBtn) decreaseBtn.disabled = false;
      if (stockMessage) stockMessage.textContent = '';
      if (currentQuantity === maxQuantity && increaseBtn) {
        increaseBtn.disabled = true;
        if (stockMessage) stockMessage.textContent = (maxQuantity === 10 ? 'Maximum 10 items allowed' : 'Maximum stock reached');
      }
    }
  }

  async function checkProductStock(productId) {
    if (!productId) return;
    try {
      const res = await fetch(`/product/${productId}/json`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.success) updateProductStockDisplay(data);
    } catch (_) {}
  }

  function updateProductStockDisplay(productData) {
    const stockCount = document.getElementById('stockCount');
    const quantityInput = document.getElementById('quantityInput');
    const decreaseBtn = document.getElementById('decreaseBtn');
    const increaseBtn = document.getElementById('increaseBtn');
    const addToCartBtn = document.getElementById('addToCartBtn');
    const buyNowBtn = document.getElementById('buyNowBtn');
    const stockMessage = document.getElementById('stockMessage');

    if (stockCount && typeof productData.quantity !== 'undefined') {
      stockCount.textContent = productData.quantity;
    }
    maxQuantity = Math.min(productData.quantity || 0, 10);
    if (quantityInput) quantityInput.max = maxQuantity;

    if ((productData.quantity || 0) <= 0 || productData.status === 'Out of Stock') {
      if (addToCartBtn) addToCartBtn.disabled = true;
      if (buyNowBtn) buyNowBtn.disabled = true;
      if (increaseBtn) increaseBtn.disabled = true;
      if (decreaseBtn) decreaseBtn.disabled = true;
      if (quantityInput) quantityInput.value = 0;
      if (stockMessage) { stockMessage.textContent = 'Out of Stock'; stockMessage.style.color = '#d32f2f'; }
      return;
    }

    if (addToCartBtn) addToCartBtn.disabled = false;
    if (buyNowBtn) buyNowBtn.disabled = false;
    if (quantityInput && parseInt(quantityInput.value || '0', 10) === 0) quantityInput.value = 1;
    const currentQty = parseInt((quantityInput?.value || '1'), 10);
    if (decreaseBtn) decreaseBtn.disabled = currentQty <= 1;
    if (increaseBtn) increaseBtn.disabled = currentQty >= maxQuantity;
    if (stockMessage) {
      if (productData.quantity < 10) {
        stockMessage.textContent = `Only ${productData.quantity} left in stock`;
        stockMessage.style.color = '#ff9800';
      } else {
        stockMessage.textContent = '';
      }
    }
  }

  function startStockMonitoring() {
    const productId = resolveProductIdForDetails();
    if (!productId) return;
    setInterval(() => checkProductStock(productId), 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkProductStock(productId); });
  }

  async function addToWishlist(productId) {
    const btn = document.getElementById('wishlistBtn');
    const original = btn ? btn.innerText : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      const res = await fetch(`/wishlist/add/${productId}`, { method: 'POST' });
      if (res.status === 401 || res.status === 403) throw new Error('Please login to manage wishlist');
      const result = await res.json();
      if (result.success) {
        if (typeof Swal !== 'undefined') Swal.fire({ icon: 'success', title: 'Added to Wishlist!', timer: 1200, showConfirmButton: false });
      } else {
        throw new Error(result.message || 'Failed to add to wishlist');
      }
    } catch (err) {
      if (typeof Swal !== 'undefined') {
        if (String(err.message).includes('login')) {
          Swal.fire({ icon: 'warning', title: 'Login Required', text: 'Please login to add items to your wishlist', showCancelButton: true, confirmButtonText: 'Login Now' })
            .then(r => { if (r.isConfirmed) window.location.href = '/login'; });
        } else {
          Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'Failed to add to wishlist' });
        }
      } else {
        alert(err.message || 'Failed to add to wishlist');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.innerText = original; }
    }
  }

  // ---------- Cart page helpers ----------
  async function updateCartQuantity(productId, newQuantity) {
    try {
      const res = await fetch(`/cart/update-quantity/${productId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: Number(newQuantity) })
      });
      const data = await res.json();
      if (data.success) {
        const lineEl = document.getElementById(`item-total-${productId}`);
        if (lineEl && typeof data.itemTotal === 'number') lineEl.textContent = `₹${data.itemTotal.toFixed(2)}`;
        const grand = document.getElementById('grand-total');
        if (grand) {
          if (typeof data.newGrandTotal === 'number') grand.textContent = data.newGrandTotal.toFixed(2);
          else if (typeof data.itemTotal === 'number' && typeof data.oldTotal === 'number') {
            const current = parseFloat(grand.textContent.replace(/[^\d.]/g, '')) || 0;
            grand.textContent = (current + (data.itemTotal - data.oldTotal)).toFixed(2);
          }
        }
        if (typeof Swal !== 'undefined') Swal.fire({ icon: 'success', title: 'Updated!', timer: 1200, showConfirmButton: false });
      } else {
        if (typeof Swal !== 'undefined') Swal.fire({ icon: 'warning', title: 'Oops…', text: data.message || 'Could not update' });
      }
    } catch (err) {
      if (typeof Swal !== 'undefined') Swal.fire({ icon: 'error', title: 'Error', text: 'Could not update cart' });
    }
  }

  function bindCartListeners() {
    // Remove item
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('.remove-btn');
      if (!btn) return;
      const id = btn.dataset.id;
      if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({ title: 'Remove item?', text: 'This product will be removed from your cart.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes, remove', cancelButtonText: 'Cancel' });
        if (!result.isConfirmed) return;
      }
      try {
        const res = await fetch(`/cart/remove/${id}`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          if (typeof Swal !== 'undefined') Swal.fire({ icon: 'success', title: 'Removed!', timer: 1200, showConfirmButton: false }).then(() => location.reload());
          else location.reload();
        } else {
          if (typeof Swal !== 'undefined') Swal.fire({ icon: 'error', title: 'Oops…', text: data.message || 'Could not remove' });
        }
      } catch (_) {
        if (typeof Swal !== 'undefined') Swal.fire({ icon: 'error', title: 'Network error' });
      }
    });

    // Quantity change
    document.addEventListener('change', (e) => {
      if (e.target.matches('input[name="quantity"]')) {
        const productId = e.target.id.replace('qty-', '');
        updateCartQuantity(productId, e.target.value);
      }
    });
  }

  function checkCartStockUpdates() {
    const ids = Array.from(document.querySelectorAll('[id^="cart-item-"]')).map(el => el.id.replace('cart-item-', ''));
    ids.forEach(async (id) => {
      try {
        const res = await fetch(`/product/${id}/json`);
        const data = await res.json();
        if (data && data.success) updateCartItemStockUI(id, data.quantity, data.status);
      } catch (_) {}
    });
  }

  function updateCartItemStockUI(id, stock, status) {
    const stockEl = document.getElementById(`stock-status-${id}`);
    const qtyEl = document.getElementById(`qty-${id}`);
    const rowEl = document.getElementById(`cart-item-${id}`);
    if (!stockEl || !qtyEl) return;
    qtyEl.max = Math.min(Number(stock) || 0, 10);
    if ((Number(stock) || 0) === 0 || status === 'Out of Stock') {
      stockEl.innerHTML = '<small style="color:red">⚠️ Out of Stock</small>';
      qtyEl.disabled = true; if (rowEl) rowEl.style.opacity = '0.6';
    } else if ((Number(stock) || 0) < Number(qtyEl.value)) {
      stockEl.innerHTML = `<small style="color:orange">⚠️ Only ${stock} available</small>`;
      qtyEl.value = Math.min(Number(qtyEl.value), Number(stock));
    } else if ((Number(stock) || 0) < 10) {
      stockEl.innerHTML = `<small style="color:orange">Low Stock: ${stock} left</small>`;
    } else {
      stockEl.innerHTML = '<small style="color:green">✓ In Stock</small>';
    }
  }

  // ---------- Address forms (add/edit) ----------
  function initAddressForms() {
    const addForm = document.getElementById('addAddressForm');
    const editForm = document.getElementById('editAddressForm');
    const handleSubmit = (form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const body = new URLSearchParams(Array.from(formData.entries()));
        try {
          const res = await fetch(form.action, { method: form.method || 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
          const ct = res.headers.get('content-type') || '';
          let ok = res.ok;
          let msg = 'Saved successfully';
          if (ct.includes('application/json')) {
            const data = await res.json();
            ok = ok && !!data.success;
            msg = data.message || msg;
          }
          if (ok) {
            if (window.toastr) toastr.success(msg); else alert(msg);
            window.location.href = '/addresses';
          } else {
            if (window.toastr) toastr.error('Failed to save'); else alert('Failed to save');
          }
        } catch (_) {
          if (window.toastr) toastr.error('Network error'); else alert('Network error');
        }
      });
    };
    if (addForm) handleSubmit(addForm);
    if (editForm) handleSubmit(editForm);
  }

  // ---------- Generic model show/hide (safe no-ops) ----------
  function showModel() {
    const el = document.getElementById('model') || document.getElementById('modelView');
    if (el) el.style.display = 'block';
  }
  function hideModel() {
    const el = document.getElementById('model') || document.getElementById('modelView');
    if (el) el.style.display = 'none';
  }

  // ---------- Order item-level actions ----------
  function cancelItem(orderId, itemId) {
    if (typeof Swal === 'undefined') return;
    Swal.fire({
      title: 'Cancel Item',
      input: 'textarea',
      inputLabel: 'Cancellation Reason',
      inputPlaceholder: 'Please enter the reason for cancellation (optional)',
      showCancelButton: true,
      confirmButtonText: 'Cancel Item',
      cancelButtonText: 'Keep Item',
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      preConfirm: (reason) => {
        return fetch(`/orders/cancel-item/${orderId}/${itemId}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cancelReason: reason || 'No reason provided' })
        }).then((r) => { if (!r.ok) throw new Error('Network error'); return r.json(); })
          .then((data) => { if (!data.success) throw new Error(data.message || 'Failed to cancel item'); return data; })
          .catch((err) => { Swal.showValidationMessage(`Request failed: ${err.message}`); });
      },
      allowOutsideClick: () => !Swal.isLoading()
    }).then((res) => {
      if (res.isConfirmed) {
        Swal.fire({ icon: 'success', title: 'Item Cancelled', timer: 2000, showConfirmButton: false }).then(() => window.location.reload());
      }
    });
  }

  function returnItem(orderId, itemId) {
    if (typeof Swal === 'undefined') return;
    Swal.fire({
      title: 'Return Item',
      input: 'textarea',
      inputLabel: 'Return Reason',
      inputPlaceholder: 'Please enter the reason for returning this item',
      inputAttributes: { 'aria-label': 'Type your return reason here' },
      inputValidator: (value) => { if (!value) return 'Return reason is required!'; },
      showCancelButton: true,
      confirmButtonText: 'Submit Return Request',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#3085d6',
      preConfirm: (reason) => {
        return fetch(`/orders/return-item/${orderId}/${itemId}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnReason: reason })
        }).then((response) => { if (!response.ok) throw new Error('Network response was not ok'); return response.json(); })
          .then((data) => { if (!data.success) throw new Error(data.message || 'Failed to submit return request'); return data; })
          .catch((error) => { Swal.showValidationMessage(`Request failed: ${error.message}`); });
      },
      allowOutsideClick: () => !Swal.isLoading()
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire({ title: 'Return Request Submitted!', text: 'Your return request has been submitted successfully. We will review it shortly.', icon: 'success', timer: 3000, showConfirmButton: false })
          .then(() => window.location.reload());
      }
    });
  }
  function closeViewModal() {
    const el = document.getElementById('profileViewModal');
    if (el) el.style.display = 'none';
  }

  // ---------- Search & Filter (used on listing pages) ----------
  function searchProducts() {
    const inputEl = document.querySelector('.searchBar');
    if (!inputEl) return;
    const input = inputEl.value.toLowerCase();
    const products = document.querySelectorAll('.product');
    let hasVisibleProducts = false;

    products.forEach((product) => {
      const productName = product.getAttribute('data-name') || '';
      if (productName.includes(input)) {
        product.style.display = '';
        hasVisibleProducts = true;
      } else {
        product.style.display = 'none';
      }
    });

    const noProductsMessage = document.querySelector('.no-products');
    if (noProductsMessage) {
      noProductsMessage.style.display = hasVisibleProducts ? 'none' : 'block';
    }
  }

  function filterProducts() {
    const categorySelect = document.querySelector('select[name="category"]');
    if (!categorySelect) return;
    const selectedCategory = categorySelect.value;
    const products = document.querySelectorAll('.product');
    let hasVisibleProducts = false;

    products.forEach((product) => {
      const productCategory = product.getAttribute('data-category') || '';
      if (!selectedCategory || productCategory === selectedCategory) {
        product.style.display = '';
        hasVisibleProducts = true;
      } else {
        product.style.display = 'none';
      }
    });

    const noProductsMessage = document.querySelector('.no-products');
    if (noProductsMessage) {
      noProductsMessage.style.display = hasVisibleProducts ? 'none' : 'block';
    }

    // Re-apply search after filtering
    try { searchProducts(); } catch (e) {}
  }

  // Provide a safe default if some pages reference sortProducts()
  if (!window.sortProducts) {
    window.sortProducts = function () {};
  }

  // ---------- Cart helpers ----------
  async function addToCart(productId) {
    try {
      const qtyInput = document.getElementById('quantityInput');
      const quantity = qtyInput ? parseInt(qtyInput.value || '1', 10) : 1;
      // Preferred endpoint
      let res = await fetch('/cart/add', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, quantity })
      });
      // Fallback to legacy endpoint if needed
      if (!res.ok) {
        try {
          res = await fetch(`/cart/add/${productId}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity })
          });
        } catch (_) {}
      }
      if (!res || !res.ok) {
        let msg = 'Failed to add to cart';
        try {
          const data = await res.json();
          msg = data.error || data.message || msg;
        } catch (_) {}
        throw new Error(msg);
      }
      const result = await res.json();
      if (typeof Swal !== 'undefined') {
        Swal.fire({ icon: 'success', title: 'Success!', text: result.message || 'Product added to cart successfully', showConfirmButton: false, timer: 1500 });
      }
    } catch (error) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({ icon: 'error', title: 'Oops...', text: error.message || 'Failed to add to cart' });
      } else {
        alert(error.message || 'Failed to add to cart');
      }
    }
  }

  // ---------- Orders (cancel/return) ----------
  function cancelOrder(orderId) {
    if (typeof Swal === 'undefined') return;
    Swal.fire({
      title: 'Cancel Order',
      input: 'textarea',
      inputLabel: 'Cancellation Reason',
      inputPlaceholder: 'Please enter the reason for cancellation (optional)',
      inputAttributes: { 'aria-label': 'Type your cancellation reason here' },
      showCancelButton: true,
      confirmButtonText: 'Cancel Order',
      cancelButtonText: 'Keep Order',
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      preConfirm: (reason) => {
        return fetch(`/orders/cancel/${orderId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cancelReason: reason || 'No reason provided' })
        })
          .then((response) => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
          })
          .then((data) => {
            if (!data.success) throw new Error(data.message || 'Failed to cancel order');
            return data;
          })
          .catch((error) => {
            Swal.showValidationMessage(`Request failed: ${error.message}`);
          });
      },
      allowOutsideClick: () => !Swal.isLoading()
    }).then((result) => {
      if (result.isConfirmed) {
        const responseData = result.value || {};
        let title = 'Cancelled!';
        let text = responseData.message || 'Your order has been cancelled successfully.';
        let icon = 'success';
        if (text.includes('refunded to your wallet')) {
          title = 'Order Cancelled & Refunded!';
          icon = 'success';
        }
        Swal.fire({ title, text, icon, timer: 4000, showConfirmButton: true, confirmButtonText: 'OK' }).then(() => {
          window.location.reload();
        });
      }
    });
  }

  function returnOrder(orderId) {
    if (typeof Swal === 'undefined') return;
    Swal.fire({
      title: 'Return Order',
      input: 'textarea',
      inputLabel: 'Return Reason (Required)',
      inputPlaceholder: 'Please enter the reason for returning this order',
      inputAttributes: { 'aria-label': 'Type your return reason here' },
      inputValidator: (value) => { if (!value) return 'Return reason is required!'; },
      showCancelButton: true,
      confirmButtonText: 'Submit Return Request',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#3085d6',
      preConfirm: (reason) => {
        return fetch(`/orders/return/${orderId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ returnReason: reason })
        })
          .then((response) => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
          })
          .then((data) => {
            if (!data.success) throw new Error(data.message || 'Failed to submit return request');
            return data;
          })
          .catch((error) => {
            Swal.showValidationMessage(`Request failed: ${error.message}`);
          });
      },
      allowOutsideClick: () => !Swal.isLoading()
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire({ title: 'Return Request Submitted!', text: 'Your return request has been submitted successfully. We will review it shortly.', icon: 'success', timer: 3000, showConfirmButton: false })
          .then(() => window.location.reload());
      }
    });
  }

  // ---------- Signup validation ----------
  function signupValidation(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    const fullName = (document.getElementById('fullName') || {}).value || '';
    const phone = (document.getElementById('phone') || {}).value || '';
    const email = (document.getElementById('email') || {}).value || '';
    const password = (document.getElementById('password') || {}).value || '';
    const confirmPassword = (document.getElementById('confirmPassword') || {}).value || '';

    const emailRegex = /^[a-zA-Z0-9.!#$%&'+/=?^_{|}~-]+@[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+$/;
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

    let isValid = true;

    if (!fullName) { displayError('errorName', "Don't leave me alone :("); isValid = false; }
    else if (fullName.length < 3) { displayError('errorName', 'Name should contain more than 2 characters!'); isValid = false; }
    else { clearError('errorName'); }

    if (!phone) { displayError('errorPhone', "Don't leave me alone :("); isValid = false; }
    else if (phone.length !== 10 || isNaN(Number(phone))) { displayError('errorPhone', 'Phone number should contain exactly 10 digits!'); isValid = false; }
    else { clearError('errorPhone'); }

    if (!email) { displayError('errorEmail', "Don't leave me alone :("); isValid = false; }
    else if (!emailRegex.test(email)) { displayError('errorEmail', 'Invalid email format!'); isValid = false; }
    else { clearError('errorEmail'); }

    if (!password) { displayError('errorPass', "Don't leave me alone :("); isValid = false; }
    else if (password.length < 8) { displayError('errorPass', 'Password must contain at least 8 characters!'); isValid = false; }
    else if (!passwordRegex.test(password)) { displayError('errorPass', 'Password must contain at least one uppercase letter, one lowercase letter, and one number!'); isValid = false; }
    else { clearError('errorPass'); }

    if (!confirmPassword) { displayError('errorPass2', 'Confirm your password!'); isValid = false; }
    else if (password !== confirmPassword) { displayError('errorPass2', 'Passwords do not match!'); isValid = false; }
    else { clearError('errorPass2'); }

    if (isValid) {
      const form = document.querySelector('form');
      if (form) form.submit();
    }
  }
  function displayError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) { el.textContent = message; el.style.display = 'block'; }
  }
  function clearError(elementId) {
    const el = document.getElementById(elementId);
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  }

  // ---------- Dynamic Breadcrumbs (if an element with id="breadcrumbs" exists) ----------
  function buildBreadcrumbs(targetEl) {
    const prettyNames = { '': 'Home', home: 'Home', productlisting: 'Shop', customlisting: 'Custom', profile: 'Profile', cart: 'Cart', wishlist: 'Wishlist', addresses: 'Addresses', orders: 'Orders', checkout: 'Checkout', about: 'About', contact: 'Contact' };
    function toTitle(str) { return prettyNames[str.toLowerCase()] || str.charAt(0).toUpperCase() + str.slice(1); }
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/');
    const crumbs = [];
    let url = '';
    for (let i = 0; i < path.length; i++) {
      url += '/' + path[i];
      crumbs.push({ name: toTitle(path[i]), url: i < path.length - 1 ? url : null });
    }
    if (crumbs.length === 0 || crumbs[0].name !== 'Home') {
      crumbs.unshift({ name: 'Home', url: '/' });
    }
    targetEl.innerHTML = '<ol style="list-style:none;display:flex;gap:5px;font-size:14px;color:#888;">' +
      crumbs.map((crumb, idx) => crumb.url
        ? `<li><a href="${crumb.url}" style="color:#888;text-decoration:none;">${crumb.name}</a></li>` + (idx < crumbs.length - 1 ? '<li style="color:#888;">/</li>' : '')
        : `<li style="color:#333;">${crumb.name}</li>`
      ).join('') + '</ol>';
  }

  // ---------- OTP resend initialization ----------
  function initResendOTP() {
    const resendBtn = document.getElementById('resend-otp');
    if (!resendBtn) return;
    // Prefer hidden input value if present, else fallback to query param
    let userEmail = (document.querySelector('input[name="email"]')?.value || '').trim();
    if (!userEmail) {
      const urlParams = new URLSearchParams(window.location.search);
      userEmail = urlParams.get('email') || '';
    }
    if (!userEmail) return;

    function startTimer(duration) {
      let timeLeft = duration;
      resendBtn.disabled = true;
      const timerInterval = setInterval(() => {
        resendBtn.innerText = `Resend OTP (${timeLeft}s)`;
        timeLeft--;
        if (timeLeft < 0) {
          clearInterval(timerInterval);
          resendBtn.disabled = false;
          resendBtn.innerText = 'Resend OTP';
        }
      }, 1000);
    }

    // Start timer (default 60s); some pages may want 10s but 60 is safe default
    startTimer(60);

    resendBtn.addEventListener('click', () => {
      resendBtn.disabled = true;
      startTimer(60);
      fetch('/resendOTP', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail })
      })
        .then((r) => r.json())
        .then((d) => { if (!d.success) alert('Failed to resend OTP. Try again later.'); })
        .catch(() => alert('An error occurred. Please try again.'));
    });
  }

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', () => {
    const bc = document.getElementById('breadcrumbs');
    if (bc) buildBreadcrumbs(bc);

    // Initial filter/sort/search on listing pages
    if (document.querySelector('.allProduct')) {
      try { filterProducts(); } catch (_) {}
      try { window.sortProducts(); } catch (_) {}
      try { searchProducts(); } catch (_) {}
    }

    // OTP resend init if present
    initResendOTP();

    // Cart listeners and polling
    if (document.querySelector('.cart-table')) {
      bindCartListeners();
      setInterval(checkCartStockUpdates, 30000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) checkCartStockUpdates(); });
    }

    // Address forms (add/edit) handlers
    initAddressForms();

    // Product details init
    const addCartBtn = document.getElementById('addToCartBtn');
    if (addCartBtn) {
      const productId = resolveProductIdForDetails();
      if (productId) {
        // Initialize magnifier and quantity selector
        if (document.getElementById('mainImage')) magnify('mainImage', 3);
        if (document.getElementById('quantityInput')) initializeQuantitySelector();
        // Sync buy now quantity with selector
        const qtyInput = document.getElementById('quantityInput');
        const buyNowQty = document.getElementById('buyNowQuantityInput');
        if (qtyInput && buyNowQty) {
          qtyInput.addEventListener('input', () => { buyNowQty.value = qtyInput.value; });
        }
        addCartBtn.addEventListener('click', (e) => { e.preventDefault(); addToCart(productId); });
        const wishBtn = document.getElementById('wishlistBtn'); if (wishBtn) wishBtn.addEventListener('click', (e) => { e.preventDefault(); addToWishlist(productId); });
        startStockMonitoring();
      }
    }
  });

  // ---------- Expose to window (honor existing page-specific overrides) ----------
  if (!window.profileViewModal) window.profileViewModal = profileViewModal;
  if (!window.closeViewModal) window.closeViewModal = closeViewModal;
  if (!window.searchProducts) window.searchProducts = searchProducts;
  if (!window.filterProducts) window.filterProducts = filterProducts;
  if (!window.addToCart) window.addToCart = addToCart;
  if (!window.cancelOrder) window.cancelOrder = cancelOrder;
  if (!window.returnOrder) window.returnOrder = returnOrder;
  if (!window.cancelItem) window.cancelItem = cancelItem;
  if (!window.returnItem) window.returnItem = returnItem;
  if (!window.signupValidation) window.signupValidation = signupValidation;
  if (!window.displayError) window.displayError = displayError;
  if (!window.clearError) window.clearError = clearError;
  if (!window.magnify) window.magnify = magnify;
  if (!window.changeMainImage) window.changeMainImage = changeMainImage;
  if (!window.showModel) window.showModel = showModel;
  if (!window.hideModel) window.hideModel = hideModel;
  if (!window.increaseQuantity) window.increaseQuantity = increaseQuantity;
  if (!window.decreaseQuantity) window.decreaseQuantity = decreaseQuantity;
  if (!window.addToWishlist) window.addToWishlist = addToWishlist;
  if (!window.startStockMonitoring) window.startStockMonitoring = startStockMonitoring;
})();
