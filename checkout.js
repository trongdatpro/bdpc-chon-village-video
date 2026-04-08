document.addEventListener('DOMContentLoaded', () => {
    let lastGeneratedBillText = ""; // Variable to store the bill text for sync
    // 0. Configuration - REDIRECT TO AI AGENT
    window.GAS_SYNC_URL = "/api/agent-sync-bill";

    const renderCurrency = (num) => new Intl.NumberFormat('vi-VN').format(num) + 'đ';
    const setSafeText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    console.log("Checkout Script Initialized");
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    const orderCodeFromUrl = urlParams.get('orderCode');

    // RECOVER BILL if this is a payment success return
    if (status) {
        lastGeneratedBillText = sessionStorage.getItem('chonVillageLastBill') || "";
        console.log("[RECOVER] Recovered bill content length:", lastGeneratedBillText.length);
    } else {
        sessionStorage.removeItem('chonVillageLastBill');
    }


    // 3. Retrieve Data From Session
    let bookingData = {};
    let roomsData = [];

    try {
        const bookingDataStr = sessionStorage.getItem('chonVillageBooking');
        const selectedRoomsStr = sessionStorage.getItem('chonVillageSelectedRooms');
        const selectedRoomStr = sessionStorage.getItem('chonVillageSelectedRoom');

        if (!bookingDataStr) throw new Error("Missing booking data");
        bookingData = JSON.parse(bookingDataStr);

        if (selectedRoomsStr) {
            roomsData = JSON.parse(selectedRoomsStr);
        } else if (selectedRoomStr) {
            roomsData = [JSON.parse(selectedRoomStr)];
        }

        if (!roomsData || roomsData.length === 0) throw new Error("No rooms selected");

        console.log("Check-out Data Loaded:", {
            booking: bookingData,
            rooms: roomsData
        });
    } catch (err) {
        console.error("Critical error loading session data:", err);
        alert("Thông tin đặt phòng không còn tồn tại. Vui lòng chọn lại phòng.");
        window.location.href = 'rooms.html';
        return;
    }

    // 3. Date Formatting
    const parseLocal = (dateStr) => {
        if (!dateStr) return new Date();
        const [y, m, d] = dateStr.split('-');
        return new Date(y, m - 1, d);
    };

    const checkinDate = parseLocal(bookingData.checkin);
    const checkoutDate = parseLocal(bookingData.checkout);
    const diffTime = Math.abs(checkoutDate - checkinDate);
    const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

    const formatDateObj = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const dateRangeStr = `${formatDateObj(checkinDate)} - ${formatDateObj(checkoutDate)} (${nights} \u0111\u00eam)`;

    // 4. Pricing & Surcharge Logic (Optimized for suggestion dates)
    let grandTotalAmount = 0;
    const roomsWithTotals = [];

    roomsData.forEach((room, index) => {
        // 1. Dữ liệu dự phòng (Fallback) nếu totalPrice bị mất hoặc không hợp lệ
        let roomFinalPrice = parseInt(room.totalPrice);
        
        if (isNaN(roomFinalPrice) || roomFinalPrice <= 0) {
            console.warn(`[CHECKOUT] Room ${index} (${room.name}) has invalid totalPrice: ${room.totalPrice}. Recalculating...`);
            
            // Tính lại dựa trên cơ sở: (Giá phòng gốc) + (Phụ thu người lớn thứ 3 nếu có)
            const basePrice = parseInt(room.baseRoomTotal) || parseInt(room.totalPrice) || 800000;
            const surchargeRate = parseInt(room.surcharge) || 450000;
            const guestCount = parseInt(room.adults) || parseInt(bookingData.adults) || 2;
            const stayNights = parseInt(room.nights) || nights || 1;
            
            // Nếu là số cũ chưa tính phụ thu, tính thêm vào đây
            const extraAdults = Math.max(0, guestCount - 2);
            roomFinalPrice = basePrice + (extraAdults * surchargeRate * stayNights);
            
            console.log(`[CHECKOUT] Fallback price for ${room.name}: ${roomFinalPrice}`);
        }

        grandTotalAmount += roomFinalPrice;

        // Parse individual room dates (Sử dụng ngày cụ thể của phòng, nếu không có lấy ngày chung của booking)
        const rInStr = room.checkin || bookingData.checkin;
        const rOutStr = room.checkout || bookingData.checkout;
        const rIn = parseLocal(rInStr);
        const rOut = parseLocal(rOutStr);
        const rDiff = Math.abs(rOut - rIn);
        const rNights = Math.ceil(rDiff / (1000 * 60 * 60 * 24)) || 1;

        roomsWithTotals.push({
            ...room,
            checkinDate: rIn,
            checkoutDate: rOut,
            nights: rNights,
            total: roomFinalPrice
        });
    });

    const depositAmount = Math.floor(grandTotalAmount / 2);

    // 5. Populate UI Elements
    const roomsListContainer = document.getElementById('checkout-rooms-list');
    if (roomsListContainer) {
        roomsListContainer.innerHTML = roomsWithTotals.map(room => {
            return `
                <div class="border border-primary/40 p-6 rounded-xl bg-background-light/80 shadow-md relative overflow-hidden">
                    <div class="w-full h-56 bg-center bg-cover rounded-lg mb-6 border-2 border-primary/20"
                        style="background-image: url('${room.img}');">
                    </div>
                    <h3 class="text-2xl font-serif font-bold mb-4 text-black border-b-2 border-primary/30 pb-3">${room.name}</h3>
                    <div class="space-y-4">
                        <div class="flex flex-col gap-0.5">
                            <span class="text-black text-sm font-medium italic">Ngày Nhận ${formatDateObj(room.checkinDate)} - Ngày Trả ${formatDateObj(room.checkoutDate)} - ${room.nights + 1} ngày ${room.nights} đêm</span>
                        </div>
                        <div class="flex flex-col gap-2 py-4 border-b-2 border-t-2 border-dashed border-primary/40">
                            <span class="text-black text-sm uppercase tracking-wider font-bold">Giá Phòng trọn gói:</span>
                            <div class="space-y-3">
                                <div class="flex flex-col text-sm">
                                    <span class="text-black font-bold mt-0.5">Tổng cộng cho ${room.nights} đêm: ${renderCurrency(room.total)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex justify-between items-center pt-2 text-primary font-bold">
                            <span>T\u1ed4NG C\u1ed8NG:</span>
                            <span>${renderCurrency(room.total)}</span>
                        </div>
                    </div>
                </div>`;
        }).join('');
    }

    setSafeText('checkout-total', renderCurrency(grandTotalAmount));
    setSafeText('checkout-deposit', renderCurrency(grandTotalAmount >= 0 ? depositAmount : 0));

    // Define success function using declaration for hoisting
    function handlePaymentSuccess(orderCode) {
        console.log("Executing handlePaymentSuccess for:", orderCode);

        // Ensure summary and payment sections are visible if they were hidden
        const summarySection = document.getElementById('summary-section');
        const paymentSection = document.getElementById('payment-section');
        if (summarySection) {
            summarySection.classList.remove('hidden');
            summarySection.classList.remove('opacity-0');
        }
        if (paymentSection) {
            paymentSection.classList.remove('hidden');
            paymentSection.classList.remove('opacity-0');
        }

        // Hide QR loading & QR image
        const qrLoading = document.getElementById('qr-loading');
        const qrImg = document.getElementById('checkout-qr');
        const actionBtns = document.querySelector('#payment-section .grid.grid-cols-2');

        if (qrLoading) qrLoading.classList.add('hidden');
        if (qrImg) qrImg.classList.add('hidden');
        if (actionBtns) actionBtns.classList.add('hidden');

        // Auto-hide Bank Picker if open
        const pickerOverlay = document.getElementById('bank-picker-overlay');
        const pickerModal = document.getElementById('bank-picker-modal');
        if (pickerOverlay && !pickerOverlay.classList.contains('hidden')) {
            pickerOverlay.classList.add('opacity-0');
            if (pickerModal) pickerModal.classList.add('translate-y-full');
            setTimeout(() => pickerOverlay.classList.add('hidden'), 300);
        }

        // Show Success Overlay inside Payment Section
        const successOverlay = document.getElementById('payment-success-overlay');
        if (successOverlay) {
            successOverlay.classList.remove('hidden');
            setTimeout(() => {
                successOverlay.classList.remove('opacity-0');
                successOverlay.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
        }

        // SAVE orderCode to use after info confirmation
        window.lastOrderCode = orderCode;
        sessionStorage.setItem('chonVillageLastOrderCode', orderCode);
    }
    window.handlePaymentSuccess = handlePaymentSuccess;

    async function syncToCalendarBridge() {
        try {
            const storedBill = sessionStorage.getItem('chonVillageLastBill') || "";
            const billText = lastGeneratedBillText || storedBill || "BILL_MISSING";

            console.log("[SYNC] billText length:", billText.length);
            console.log("[SYNC] billText preview:", billText.substring(0, 200));

            if (billText === "BILL_MISSING") {
                console.error("[SYNC] Không có bill để sync!");
                return;
            }

            const GAS_URL = window.GAS_SYNC_URL;
            if (!GAS_URL) {
                console.warn("[SYNC] GAS_URL not set.");
                return;
            }

            console.log("[SYNC] Đang gửi dữ liệu đồng bộ lên Server...");
            const res = await fetch(GAS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    billText,
                    bookingData, // Gửi kèm dữ liệu cấu trúc để không cần dùng AI parse lại
                    roomsData
                })
            });

            console.log("[SYNC] Response status:", res.status, res.ok);
            const data = await res.json().catch(() => ({}));
            console.log("[SYNC] Response data:", JSON.stringify(data));

            if (res.ok && data.success) {
                console.log("[SYNC] ✅ Đồng bộ 3 lịch thành công!");
            } else {
                console.error("[SYNC] ❌ Sync thất bại:", data.message || "Không rõ lỗi");
            }
        } catch (err) {
            console.error("[SYNC] ❌ Lỗi kết nối:", err.message);
        }
    }

    // Trigger success logic if URL says PAID (Case-insensitive)
    const isUrlPaid = status && status.toUpperCase() === 'PAID';
    if (isUrlPaid) {
        console.log("Payment Successful (Reload/Redirect detected)!");
        handlePaymentSuccess(orderCodeFromUrl);
    }

    // 6. visibility & Agreement Logic
    const agreeCheckbox = document.getElementById('agree-checkbox');
    const summarySection = document.getElementById('summary-section');
    const paymentSection = document.getElementById('payment-section');
    const confirmBtn = document.getElementById('confirm-btn');

    // Reset Initial State
    if (confirmBtn) {
        confirmBtn.classList.add('hidden'); // Hide original confirm button as we use Transfer button now
    }

    if (summarySection) {
        summarySection.classList.add('hidden', 'opacity-0');
    }
    if (paymentSection) {
        paymentSection.classList.add('hidden', 'opacity-0');
    }

    let payosData = null;

    // Toggle Visibility on Checkbox
    if (agreeCheckbox) {
        agreeCheckbox.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;

            if (isChecked) {
                const apiBase = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
                console.log("[API] Using base:", apiBase || '(relative)');

                // 1. Show Summary & Payment IMMEDIATELY (Before API Delay)
                if (summarySection) {
                    summarySection.classList.remove('hidden');
                    // Instant visibility for better UX
                    summarySection.classList.remove('opacity-0');
                    summarySection.style.opacity = '1';
                }
                if (paymentSection) {
                    paymentSection.classList.remove('hidden');
                    paymentSection.classList.remove('opacity-0');
                    paymentSection.style.opacity = '1';
                }

                // 2. Clear previous errors or states if any
                const qrLoading = document.getElementById('qr-loading');
                const qrImg = document.getElementById('checkout-qr');
                if (qrLoading) qrLoading.classList.remove('hidden');
                if (qrImg) qrImg.classList.add('hidden');

                // 3. Zero-Delay Scroll (Optimized)
                setTimeout(() => {
                    const targetEl = summarySection || paymentSection;
                    if (targetEl) {
                        const header = document.querySelector('header');
                        const headerHeight = header ? header.offsetHeight : 80;
                        const offsetPosition = targetEl.getBoundingClientRect().top + window.pageYOffset - headerHeight - 20;
                        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
                    }
                }, 100);

                if (paymentSection) {
                    // Populate basic info
                    const depositAmountEl = document.getElementById('checkout-deposit');
                    if (depositAmountEl) depositAmountEl.textContent = renderCurrency(depositAmount);

                    // Call PayOS Backend Automatically
                    try {
                        console.log("Creating PayOS link...");
                        const response = await fetch(`${apiBase}/create-payment-link`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                amount: depositAmount,
                                description: "Thanh toan"
                            })
                        });

                        const data = await response.json();
                        if (!response.ok) throw new Error(data.error || "Lỗi kết nối Server");

                        payosData = data;
                        console.log("PayOS Link Created:", payosData.orderCode);

                        if (payosData.qrCode) {
                            const qrImg = document.getElementById('checkout-qr');
                            const qrLoading = document.getElementById('qr-loading');
                            const accountNoEl = document.getElementById('payos-account-no');
                            const accountNameEl = document.getElementById('payos-account-name');
                            const transferBtn = document.getElementById('transfer-app-btn');

                            if (qrImg) {
                                // MODERN branded VietQR: includes NAPAS + Bank Logos
                                const brandedQrUrl = `https://img.vietqr.io/image/${payosData.bin}-${payosData.accountNumber}-print.png?amount=${payosData.amount}&addInfo=${encodeURIComponent(payosData.description)}&accountName=${encodeURIComponent(payosData.accountName)}`;
                                qrImg.src = brandedQrUrl;

                                qrImg.onload = () => {
                                    console.log("QR Image loaded successfully");
                                    qrImg.classList.remove('hidden');
                                    if (qrLoading) qrLoading.classList.add('hidden');
                                };
                                qrImg.onerror = () => {
                                    console.error("QR Image failed to load");
                                    if (qrLoading) {
                                        qrLoading.innerHTML = `
                                            <div class="flex flex-col items-center gap-2">
                                                <span class="material-symbols-outlined text-red-500 text-3xl">broken_image</span>
                                                <span class="text-[10px] text-red-500 font-bold uppercase tracking-tight">Lỗi Tải Mã VietQR</span>
                                                <button onclick="window.location.reload()" class="text-[9px] underline text-primary">Thử tải lại trang</button>
                                            </div>
                                        `;
                                    }
                                };
                            }
                            if (accountNoEl) accountNoEl.textContent = payosData.accountNumber;
                            if (accountNameEl) accountNameEl.textContent = payosData.accountName;
                            const bankNameEl = document.getElementById('payos-bank-name');
                            if (bankNameEl) bankNameEl.textContent = payosData.bankName || "Ngân hàng TMCP Phương Äông (OCB)";

                            // QR Actions: Download & Share
                            const downloadBtn = document.getElementById('download-qr-btn');
                            const shareBtn = document.getElementById('share-qr-btn');

                            if (downloadBtn) {
                                downloadBtn.onclick = async () => {
                                    try {
                                        const qrApiUrl = `https://img.vietqr.io/image/${payosData.bin}-${payosData.accountNumber}-print.png?amount=${payosData.amount}&addInfo=${encodeURIComponent(payosData.description)}&accountName=${encodeURIComponent(payosData.accountName)}`;
                                        const res = await fetch(qrApiUrl);
                                        const blob = await res.blob();
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `thanh-toan-chon-village-${payosData.orderCode}.png`;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        window.URL.revokeObjectURL(url);
                                    } catch (err) { alert("Lỗi tải ảnh. Vui lòng chụp màn hình."); }
                                };
                            }

                            if (shareBtn) {
                                shareBtn.onclick = async () => {
                                    const shareUrl = payosData.checkoutUrl;
                                    const triggerSuccess = () => {
                                        const originalContent = shareBtn.innerHTML;
                                        shareBtn.innerHTML = '<span class="material-symbols-outlined text-base leading-none">check</span><span>ÄÃƒ CHÃ‰P LINK</span>';
                                        shareBtn.classList.add('bg-green-50', 'text-green-600', 'border-green-200');
                                        setTimeout(() => {
                                            shareBtn.innerHTML = originalContent;
                                            shareBtn.classList.remove('bg-green-50', 'text-green-600', 'border-green-200');
                                        }, 3000);
                                    };

                                    try {
                                        // 1. Prepare data & text
                                        const shareTitle = 'Thanh toán Chon Village';
                                        const shareText = `Thanh toán cá»c cho Chon Village. STK: ${payosData.accountNumber} (${payosData.accountName})`;

                                        // 2. Try Image Sharing (Modern)
                                        if (navigator.canShare && window.isSecureContext) {
                                            const brandedQrApiUrl = `https://img.vietqr.io/image/${payosData.bin}-${payosData.accountNumber}-print.png?amount=${payosData.amount}&addInfo=${encodeURIComponent(payosData.description)}&accountName=${encodeURIComponent(payosData.accountName)}`;
                                            const res = await fetch(brandedQrApiUrl);
                                            const blob = await res.blob();
                                            const file = new File([blob], `thanh-toan-${payosData.orderCode}.png`, { type: 'image/png' });

                                            const shareData = {
                                                title: shareTitle,
                                                text: shareText,
                                                url: shareUrl,
                                                files: [file]
                                            };

                                            if (navigator.canShare(shareData)) {
                                                await navigator.share(shareData);
                                                return; // Success
                                            }
                                        }

                                        // 3. Fallback: Generic Web Share (Text/URL only)
                                        if (navigator.share && window.isSecureContext) {
                                            await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
                                        } else {
                                            // 4. Fallback: Clipboard (For HTTP/Local Testing)
                                            fallbackCopyText(shareUrl, triggerSuccess);
                                        }
                                    } catch (e) {
                                        console.error("[SHARE ERROR]", e);
                                        if (e.name !== 'AbortError') fallbackCopyText(shareUrl, triggerSuccess);
                                    }
                                };
                            }

                            if (transferBtn) {
                                // BANK DATA
                                const ALL_BANKS = [
                                    { id: 'vcb', name: 'Vietcombank', priority: true },
                                    { id: 'mb', name: 'MB Bank', priority: true },
                                    { id: 'tcb', name: 'Techcombank', priority: true },
                                    { id: 'icb', name: 'VietinBank', priority: true },
                                    { id: 'bidv', name: 'BIDV', priority: true },
                                    { id: 'vba', name: 'Agribank', priority: true },
                                    { id: 'tpb', name: 'TPBank (Tien Phong)' },
                                    { id: 'vpb', name: 'VPBank' },
                                    { id: 'acb', name: 'ACB (A Chau)' },
                                    { id: 'stb', name: 'Sacombank' },
                                    { id: 'vib', name: 'VIB (Quoc Te)' },
                                    { id: 'hdb', name: 'HDBank' },
                                    { id: 'shb', name: 'SHB (Saigon-Hanoi)' },
                                    { id: 'eib', name: 'Eximbank' },
                                    { id: 'msb', name: 'MSB (Maritime)' },
                                    { id: 'seab', name: 'SeABank' },
                                    { id: 'ocb', name: 'OCB (Phuong Dong)' },
                                    { id: 'lpb', name: 'LPBank' },
                                    { id: 'pvcb', name: 'PVcomBank' },
                                    { id: 'bab', name: 'Bac A Bank' },
                                    { id: 'nab', name: 'Nam A Bank' },
                                    { id: 'vietbank', name: 'VietBank' },
                                    { id: 'vccb', name: 'VietCapitalBank' },
                                    { id: 'bvb', name: 'BaoVietBank' },
                                    { id: 'pgb', name: 'PGBank' },
                                    { id: 'sgb', name: 'Saigonbank' },
                                    { id: 'klb', name: 'Kienlongbank' },
                                    { id: 'ncb', name: 'NCB (Quoc Dan)' },
                                    { id: 'oceanbank', name: 'OceanBank' },
                                    { id: 'gpb', name: 'GPBank' },
                                    { id: 'cbb', name: 'CBBank' },
                                    { id: 'hsbc', name: 'HSBC' },
                                    { id: 'scvn', name: 'Standard Chartered' },
                                    { id: 'shinhan', name: 'Shinhan Bank' },
                                    { id: 'woori', name: 'Woori Bank' },
                                    { id: 'pbb', name: 'Public Bank' },
                                    { id: 'uob', name: 'UOB' },
                                    { id: 'cimb', name: 'CIMB' },
                                    { id: 'hlb', name: 'Hong Leong Bank' },
                                    { id: 'ivb', name: 'Indovina Bank' },
                                    { id: 'vrb', name: 'VRB (Viet-Nga)' }
                                ];

                                const pickerOverlay = document.getElementById('bank-picker-overlay');
                                const pickerModal = document.getElementById('bank-picker-modal');
                                const closeBtn = document.getElementById('close-bank-picker');
                                const searchInput = document.getElementById('bank-search-input');
                                const topGrid = document.getElementById('top-banks-grid');
                                const resultsList = document.getElementById('bank-results-list');
                                const fallbackBtn = document.getElementById('use-payos-fallback');

                                const showPicker = () => {
                                    pickerOverlay.classList.remove('hidden');
                                    setTimeout(() => {
                                        pickerOverlay.classList.remove('opacity-0');
                                        pickerModal.classList.remove('translate-y-full');
                                    }, 10);
                                    renderPicker();
                                };

                                const hidePicker = () => {
                                    pickerOverlay.classList.add('opacity-0');
                                    pickerModal.classList.add('translate-y-full');
                                    setTimeout(() => pickerOverlay.classList.add('hidden'), 300);
                                };

                                // App-to-App Payment Redirect (Direct Deep Link)
                                // NAPAS Standard Deep Link (One-Touch Payment)
                                window.selectBankDirect = (id) => {
                                    if (!payosData) {
                                        console.error("[BANK PICKER] Missing PayOS data");
                                        return;
                                    }

                                    const acc = payosData.accountNumber || "";
                                    const bin = payosData.bin || ""; // Recipient Bank BIN (e.g., 970448 for OCB)
                                    const am = payosData.amount || 0;
                                    const tn = encodeURIComponent(payosData.description || "");

                                    // The exact structure requested for dl.vietqr.io:
                                    // app=[APP_ID] & ba=[RECIPIENT_ACC]@[RECIPIENT_BIN] & am=[AMOUNT] & tn=[NOTE]
                                    const url = `https://dl.vietqr.io/pay?app=${id}&ba=${acc}@${bin}&am=${am}&tn=${tn}`;

                                    console.log(`[BANK PICKER] Triggering NAPAS Deep Link for ${id}:`, url);
                                    hidePicker(); // Close UI immediately
                                    window.location.href = url;
                                };

                                const renderPicker = (filter = '') => {
                                    const topBanks = ALL_BANKS.filter(b => b.priority);
                                    const filtered = ALL_BANKS.filter(b =>
                                        b.name.toLowerCase().includes(filter.toLowerCase()) ||
                                        b.id.toLowerCase().includes(filter.toLowerCase())
                                    );

                                    if (!filter) {
                                        topGrid.innerHTML = topBanks.map(bank => `
                                            <button onclick="selectBankDirect('${bank.id}')" class="flex flex-col items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-xl hover:bg-primary/10 transition-all active:scale-95 group">
                                                <div class="w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center overflow-hidden border border-primary/10 p-1">
                                                    <img src="https://api.vietqr.io/img/${bank.id.toUpperCase()}.png" alt="${bank.name}" class="w-full h-full object-contain" onerror="this.src='https://img.vietqr.io/image/${bank.id}-logo.png'" />
                                                </div>
                                                <span class="text-[9px] font-bold text-primary uppercase text-center truncate w-full">${bank.name}</span>
                                            </button>
                                        `).join('');
                                        topGrid.parentElement.classList.remove('hidden');
                                    } else {
                                        topGrid.parentElement.classList.add('hidden');
                                    }

                                    if (filter) {
                                        resultsList.innerHTML = filtered.map(bank => `
                                            <button onclick="selectBankDirect('${bank.id}')" class="w-full flex items-center gap-4 p-3 hover:bg-primary/10 rounded-xl transition-all active:scale-[0.98] border-b border-primary/5 group">
                                                <div class="w-8 h-8 bg-white rounded-lg shadow-sm flex items-center justify-center overflow-hidden border border-primary/10 p-0.5">
                                                    <img src="https://api.vietqr.io/img/${bank.id.toUpperCase()}.png" alt="${bank.name}" class="w-full h-full object-contain" onerror="this.src='https://img.vietqr.io/image/${bank.id}-logo.png'" />
                                                </div>
                                                <span class="text-xs font-bold text-primary/80 group-hover:text-primary transition-colors">${bank.name}</span>
                                                <span class="material-symbols-outlined ml-auto text-primary/30 text-sm">chevron_right</span>
                                            </button>
                                        `).join('');
                                    } else {
                                        resultsList.innerHTML = '<p class="text-[10px] text-primary/30 text-center py-4 italic">Nhập tên ngân hàng để tìm kiếm...</p>';
                                    }
                                };

                                transferBtn.onclick = showPicker;
                                if (closeBtn) closeBtn.onclick = hidePicker;
                                if (pickerOverlay) pickerOverlay.onclick = (e) => { if (e.target === pickerOverlay) hidePicker(); };
                                if (searchInput) searchInput.oninput = (e) => renderPicker(e.target.value);
                                if (fallbackBtn) fallbackBtn.onclick = () => {
                                    hidePicker();
                                    window.location.href = payosData.checkoutUrl;
                                };
                            }

                            // 3. Start Polling for status (Use ID for v2)
                            const pollId = payosData.id || payosData.orderCode;
                            if (pollId) {
                                console.log("Starting polling for:", pollId);
                                startPaymentPolling(pollId);
                            }
                        } else {
                            throw new Error("PayOS không trả vá» mã QR. Hãy kiểm tra Dashboard.");
                        }
                    } catch (err) {
                        console.error("PayOS Fetch Error:", err);
                        const qrLoading = document.getElementById('qr-loading');
                        if (qrLoading) {
                            qrLoading.innerHTML = `
                                <div class="flex flex-col items-center gap-2 px-4 py-2">
                                    <span class="material-symbols-outlined text-red-500 text-3xl">error</span>
                                    <span class="text-[10px] text-red-500 font-bold uppercase tracking-tight">Lỗi Kết Nối PayOS</span>
                                    <p class="text-[9px] text-slate-500 text-center leading-tight">${err.message}</p>
                                </div>
                            `;
                        }
                    }
                }
            } else {
                // Hide Sections
                if (summarySection) {
                    summarySection.classList.add('opacity-0');
                    setTimeout(() => summarySection.classList.add('hidden'), 500);
                }
                if (paymentSection) {
                    paymentSection.classList.add('opacity-0');
                    setTimeout(() => paymentSection.classList.add('hidden'), 500);
                }
            }
        });
    }

    // 7. Polling & Success Flow Logic
    let pollingInterval = null;
    const statusIndicator = document.getElementById('payment-status-indicator');
    const statusText = document.getElementById('payment-status-text');
    const manualBtn = document.getElementById('manual-check-btn');

    const checkStatusOnce = async (orderCode) => {
        try {
            const apiBase = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
            console.log(`[POLLING] Fetching status for ${orderCode}...`);
            const res = await fetch(`${apiBase}/get-order/${orderCode}`);

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                console.error("[POLLING] Server Error:", res.status, errorData);
                return { paid: false, status: `ERROR_${res.status}`, detail: errorData.error };
            }

            const data = await res.json();
            console.log(`[PAYOS DEBUG] Full data for ${orderCode}:`, data);

            const currentStatus = (data.status || "UNKNOWN").toUpperCase();
            const isActuallyPaid = ['PAID', 'COMPLETED', 'SUCCESS'].includes(currentStatus);

            if (isActuallyPaid) {
                console.log("!!! SUCCESS DETECTED !!! Status:", currentStatus);
                if (pollingInterval) clearInterval(pollingInterval);
                if (statusIndicator) statusIndicator.classList.add('hidden');
                handlePaymentSuccess(orderCode);
                return { paid: true, status: currentStatus };
            }

            return { paid: false, status: currentStatus, data: data };
        } catch (e) {
            console.error("Check status exception:", e);
            return { paid: false, status: "FETCH_FAILED", detail: e.message };
        }
    };

    let currentPollingOrderCode = null;
    const startPaymentPolling = (orderCode) => {
        if (pollingInterval) clearInterval(pollingInterval);
        currentPollingOrderCode = orderCode; // Store for visibility-tab-switch trigger
        console.log("Started polling for order:", orderCode);

        // Show indicator after a short delay
        setTimeout(() => {
            if (statusIndicator && !window.location.search.includes('status=PAID')) {
                statusIndicator.classList.remove('hidden');
                setTimeout(() => statusIndicator.classList.remove('opacity-0'), 10);
            }
        }, 1500);

        pollingInterval = setInterval(async () => {
            const result = await checkStatusOnce(orderCode);
            if (result && result.paid && statusText) {
                statusText.textContent = "Đã nhận thanh toán!";
            } else if (result && result.status === 'CANCELLED') {
                if (statusText) statusText.textContent = "Giao dịch đã bị hủy.";
                clearInterval(pollingInterval);
            }
        }, 2000); // Faster polling (2s instead of 4s)

        // Reactive Check: Try immediately when user returns to tab
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible' && currentPollingOrderCode === orderCode) {
                console.log("[POLLING] Tab visible! Triggering immediate check...");
                await checkStatusOnce(orderCode);
            }
        };
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Manual Check Button
        if (manualBtn) {
            manualBtn.onclick = async () => {
                manualBtn.textContent = "Đang kiểm tra...";
                const result = await checkStatusOnce(orderCode);

                if (result && result.paid) {
                    manualBtn.textContent = "Đã nhận thanh toán!";
                    // Success transition is handled inside checkStatusOnce
                } else {
                    const statusTextStr = (result && result.status) ? result.status : "Lỗi";
                    manualBtn.textContent = `Chưa nhận được (Trạng thái: ${statusTextStr})`;
                    console.log("[MANUAL CHECK] Result:", result);
                    setTimeout(() => { manualBtn.textContent = "Kiểm tra lại ngay"; }, 4000);
                }
            };
        }
    };

    // Protect handlePaymentSuccess with error logging
    const originalHandlePaymentSuccess = window.handlePaymentSuccess;
    window.handlePaymentSuccess = function (orderCode) {
        console.log("--> Calling handlePaymentSuccess for order:", orderCode);
        try {
            if (originalHandlePaymentSuccess) {
                originalHandlePaymentSuccess(orderCode);
            } else {
                console.error("handlePaymentSuccess is NOT defined on window!");
            }
        } catch (err) {
            console.error("CRITICAL ERROR in handlePaymentSuccess:", err);
            alert("Có lỗi khi tạo hóa đơn: " + err.message);
        }
    };

    // 8. Info Collection & Bill Generation
    const confirmInfoBtn = document.getElementById('confirm-info-btn');
    const guestNameInput = document.getElementById('guest-fullname');
    const guestZaloInput = document.getElementById('guest-zalo');
    const infoForm = document.getElementById('info-collection-form');
    const billContainer = document.getElementById('bill-result-container');
    const billTextEl = document.getElementById('bill-text-content');
    const sendBillZaloBtn = document.getElementById('send-bill-zalo-btn');



    // Replace the confirmInfoBtn logic or use existing structure
    if (confirmInfoBtn) {
        confirmInfoBtn.addEventListener('click', () => {
            // Existing bill logic...
            console.log("Confirm Info Clicked");
            const name = guestNameInput ? guestNameInput.value.trim() : "Quý khách";
            const phone = guestZaloInput ? guestZaloInput.value.trim() : "Chưa cung cấp";

            if (!name || name === "Quý khách") {
                alert("Vui lòng nhập tên người đặt phòng.");
                return;
            }

            // Generate Bill Text
            const billText = generateBillText(name, phone);
            lastGeneratedBillText = billText; // Store for sync
            sessionStorage.setItem('chonVillageLastBill', billText); // Persistent for refresh

            // PERSIST FOR HISTORY (Image 1 logic)
            sessionStorage.setItem('chonVillageLastBooking', JSON.stringify({
                billText: billText,
                roomIds: roomsWithTotals.map(r => String(r.id)),
                timestamp: Date.now()
            }));

            // Show bubble immediately
            if (window.refreshBookedBubble) window.refreshBookedBubble();

            if (billTextEl) {
                billTextEl.innerHTML = billText.replace(/\n/g, '<br/>');
            }
            // Show Bill
            if (infoForm) infoForm.classList.add('hidden');
            if (billContainer) {
                billContainer.classList.remove('hidden');
                setTimeout(() => {
                    billContainer.classList.remove('opacity-0', 'translate-y-10');
                    billContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 50);
            }

            // TRIGGER CALENDAR SYNC NOW that we have the bill
            const orderCodeSync = window.lastOrderCode || sessionStorage.getItem('chonVillageLastOrderCode') || "PAID";
            syncToCalendarBridge(orderCodeSync);
        });
    }

    const generateBillText = (name, zalo) => {
        // Format ISO date string directly: YYYY-MM-DD -> DD/MM/YYYY (no Date object, no timezone issues)
        const fmtDate = (isoStr) => {
            if (!isoStr) return '??/??/????';
            const s = String(isoStr).split('T')[0];
            const p = s.split('-');
            return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : isoStr;
        };

        const ciISO = (typeof bookingData !== 'undefined' && bookingData.checkin) ? bookingData.checkin : '';
        const coISO = (typeof bookingData !== 'undefined' && bookingData.checkout) ? bookingData.checkout : '';
        const checkinFull = fmtDate(ciISO);
        const checkoutFull = fmtDate(coISO);

        const currentTotal = typeof grandTotalAmount !== 'undefined' ? grandTotalAmount : 0;
        const currentDeposit = typeof depositAmount !== 'undefined' ? depositAmount : 0;
        const remaining = currentTotal - currentDeposit;
        const nightsCount = typeof nights !== 'undefined' ? nights : 1;
        const nightsStr = nightsCount >= 3 ? nightsCount + ' đêm (' + (nightsCount + 1) + ' ngày)' : nightsCount + ' đêm';

        const roomsStr = roomsWithTotals.map(r => r.name).join(', ');

        const adults = (typeof bookingData !== 'undefined' && bookingData.adults) ? parseInt(bookingData.adults) : 2;
        const children = (typeof bookingData !== 'undefined' && bookingData.children) ? parseInt(bookingData.children) : 0;
        const childrenAges = (typeof bookingData !== 'undefined' && bookingData.childrenAgeCategory) ? bookingData.childrenAgeCategory.split(',').filter(a => a) : [];

        let guestStr = adults + ' người lớn';
        if (children > 0) guestStr += ', ' + children + ' trẻ em (' + childrenAges.join(', ') + ' tuổi)';

        return `BILL XÁC NHẬN ĐẶT PHÒNG 

➖ THÔNG TIN
- Địa chỉ: 07 Thánh Tâm - Phường 5, Tp. Đà Lạt
https://maps.app.goo.gl/aW824oYN5dznY7JX9?g_st=com.google.maps.preview.copy
- Liên hệ nhận phòng : 0889717713 (Mr. Trọng Đạt)
- Hình thức thuê: ${roomsStr}

➖ THÔNG TIN KHÁCH 
- Tên khách hàng : ${name}
- Số điện thoại : ${zalo}
- Số người: ${guestStr}
- Số ngày thuê: ${nightsStr}
* Ngày nhận nhà: 14h00 ngày ${checkinFull}
* Ngày trả nhà: 12h00 ngày ${checkoutFull}

✅ THANH TOÁN
- Thành tiền: ${renderCurrency(currentTotal)}
- Đặt cọc: ${renderCurrency(currentDeposit)}
( Xác nhận đã nhận được tiền cọc )
- Còn lại: ${renderCurrency(remaining)}
Số tiền còn lại quý khách vui lòng thanh toán hết ngay sau khi nhận nhà

➖ GHI CHÚ
- Quý khách vui lòng tự bảo vệ tài sản cá nhân, mọi mất mát bên home không chịu trách nhiệm. 
- Booking không hoàn, huỷ, đổi dưới mọi hình thức. 
- Quý khách vui lòng đem theo CMND hoặc Passport để làm thủ tục đăng ký lưu trú.
- Quý khách vui lòng đi đúng số lượng người, nếu có phát sinh phụ thu.`;
    };

    // Helper for non-secure contexts
    function fallbackCopyText(text, callback) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            const successful = document.execCommand('copy');
            if (successful && callback) callback();
        } catch (err) {
            console.error('Fallback copy failed', err);
            alert("Không thể tự động sao chép. Vui lòng copy thủ công.");
        }
        document.body.removeChild(textArea);
    }

    if (sendBillZaloBtn) {
        sendBillZaloBtn.addEventListener('click', () => {
            const name = (guestNameInput && guestNameInput.value) ? guestNameInput.value.trim() : "Quý khách";
            const phone = (guestZaloInput && guestZaloInput.value) ? guestZaloInput.value.trim() : "Chưa cung cấp";
            const fullText = generateBillText(name, phone);

            const triggerSuccess = () => {
                const originalText = sendBillZaloBtn.innerHTML;
                sendBillZaloBtn.innerHTML = '<span class="material-symbols-outlined text-sm">check</span><span>BẢN GỐC ĐÃ CHÉP & ĐANG MỞ ZALO...</span>';
                setTimeout(() => { sendBillZaloBtn.innerHTML = originalText; }, 3000);
            };

            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(fullText).then(triggerSuccess).catch(err => {
                    console.error("Clipboard API Error:", err);
                    fallbackCopyText(fullText, triggerSuccess);
                });
            } else {
                fallbackCopyText(fullText, triggerSuccess);
            }
        });
    }

});


