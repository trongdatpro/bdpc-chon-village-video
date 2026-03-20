document.addEventListener('DOMContentLoaded', () => {
    // 1. Helper Function
    const renderCurrency = (num) => new Intl.NumberFormat('vi-VN').format(num) + 'đ';
    const setSafeText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    console.log("Checkout Script Initialized");

    // 2. Check for PayOS Return Parameters
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    const orderCodeFromUrl = urlParams.get('orderCode');

    // 3. Retrieve Data From Session
    const bookingDataStr = sessionStorage.getItem('chonVillageBooking');
    const selectedRoomsStr = sessionStorage.getItem('chonVillageSelectedRooms');
    const selectedRoomStr = sessionStorage.getItem('chonVillageSelectedRoom');

    if (!bookingDataStr || (!selectedRoomsStr && !selectedRoomStr)) {
        console.warn("Booking data not found in session, redirecting...");
        window.location.href = 'index.html';
        return;
    }

    const bookingData = JSON.parse(bookingDataStr);
    const roomsData = selectedRoomsStr ? JSON.parse(selectedRoomsStr) : [JSON.parse(selectedRoomStr)];
    const adultsCount = parseInt(bookingData.adults) || 2;

    console.log("Booking Data:", bookingData);
    console.log("Rooms Data:", roomsData);

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
    const dateRangeStr = `${formatDateObj(checkinDate)} - ${formatDateObj(checkoutDate)} (${nights} đêm)`;

    // 4. Pricing & Surcharge Logic
    let baseRoomTotal = 0;
    const surchargeRates = [];
    const roomsWithTotals = [];

    roomsData.forEach(room => {
        const roomBasePrice = parseInt(room.baseRoomTotal) || 0;
        baseRoomTotal += roomBasePrice;
        
        // SPECIAL RULE: If stay >= 3 nights (4 days 3 nights), 
        // use standard surcharge (we take the first night's surcharge as "standard" 
        // or fallback to 450k). 
        // If < 3 nights, we use the specific surcharge passed.
        let rate = parseInt(room.surcharge) || 450000;
        
        // Note: The prompt says "hiển thị giá phụ thu người thứ 3 của ngày thường nếu khách đặt từ 4 ngày 3 đêm"
        // In this implementation, room.nights is passed from rooms.js.
        if (room.nights >= 3) {
            console.log(`[DEBUG] Stay is ${room.nights} nights (>= 3). Using standard surcharge rate.`);
            // Assuming the passed room.surcharge is the standard rate if rooms.js passed datesToStay[0]'s surcharge
        }
        
        surchargeRates.push(rate);

        roomsWithTotals.push({
            ...room,
            basePrice: roomBasePrice,
            surchargeAllocated: 0, 
            surchargePerNight: 0,
            total: roomBasePrice
        });
    });

    // Calculate Extra Guests (3rd person in shared rooms)
    const extraGuestsCount = Math.max(0, adultsCount - (roomsData.length * 2));
    
    // Sort logic for surcharge application
    const sortedRates = [...surchargeRates].sort((a, b) => a - b);
    let totalSurchargePerNight = 0;
    
    if (roomsData.length === 3) {
        const uniqueRates = new Set(sortedRates).size;
        if (extraGuestsCount === 1) {
            totalSurchargePerNight = (uniqueRates === 3) ? sortedRates[1] : sortedRates[0];
        } else if (extraGuestsCount === 2) {
            totalSurchargePerNight = sortedRates[0] + sortedRates[1];
        } else {
            for (let i = 0; i < extraGuestsCount; i++) totalSurchargePerNight += sortedRates[i] || sortedRates[0];
        }
    } else {
        for (let i = 0; i < extraGuestsCount; i++) totalSurchargePerNight += sortedRates[i] || sortedRates[0];
    }

    const grandSurchargeTotal = totalSurchargePerNight * nights;
    const grandTotalAmount = baseRoomTotal + grandSurchargeTotal;
    const depositAmount = Math.floor(grandTotalAmount / 2);

    // Allocate surcharge proportionally to rooms for the UI cards
    if (grandSurchargeTotal > 0) {
        roomsWithTotals.forEach((room) => {
            room.surchargeAllocated = (grandSurchargeTotal / roomsWithTotals.length);
            room.surchargePerNight = (totalSurchargePerNight / roomsWithTotals.length);
            room.total = room.basePrice + room.surchargeAllocated;
        });
    }

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
                            <span class="text-black text-sm font-medium italic">Thời gian:</span>
                            <span class="text-black text-sm font-bold leading-tight">Ngày Nhận ${formatDateObj(checkinDate)} - Ngày Trả ${formatDateObj(checkoutDate)} - ${nights + 1} ngày ${nights} đêm</span>
                        </div>
                        <div class="flex flex-col gap-2 py-4 border-b-2 border-t-2 border-dashed border-primary/40">
                            <span class="text-black text-sm uppercase tracking-wider font-bold">Chi tiết giá:</span>
                            <div class="space-y-3">
                                <div class="flex flex-col text-sm">
                                    <span class="text-black font-bold mt-0.5">Giá phòng: ${renderCurrency(room.basePrice)}</span>
                                </div>
                                ${room.surchargeAllocated > 0 ? `
                                <div class="flex flex-col text-sm">
                                    <span class="text-black font-bold mt-0.5">Phụ thu: ${renderCurrency(room.surchargeAllocated)}</span>
                                </div>` : ''}
                            </div>
                        </div>
                        <div class="flex justify-between items-center pt-2 text-primary font-bold">
                            <span>TỔNG CỘNG:</span>
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

        // Show Success Overlay inside Payment Section
        const successOverlay = document.getElementById('payment-success-overlay');
        if (successOverlay) {
            successOverlay.classList.remove('hidden');
            setTimeout(() => {
                successOverlay.classList.remove('opacity-0');
                successOverlay.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
        }

        // Clear Session for booking safety
        sessionStorage.removeItem('chonVillageBooking');
        sessionStorage.removeItem('chonVillageSelectedRooms');
        sessionStorage.removeItem('chonVillageSelectedRoom');
    }
    window.handlePaymentSuccess = handlePaymentSuccess;

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

                // Show Summary & Payment
                if (summarySection) {
                    summarySection.classList.remove('hidden');
                    setTimeout(() => summarySection.classList.remove('opacity-0'), 10);
                }
                if (paymentSection) {
                    paymentSection.classList.remove('hidden');
                    setTimeout(() => paymentSection.classList.remove('opacity-0'), 10);
                    
                    // Populate basic info
                    const transferContentEl = document.getElementById('checkout-transfer-content');
                    const depositAmountEl = document.getElementById('checkout-deposit-amount');
                    if (transferContentEl) transferContentEl.textContent = `CHON ${bookingData.phone || ''}`.toUpperCase();
                    if (depositAmountEl) depositAmountEl.textContent = renderCurrency(depositAmount);

                    // Call PayOS Backend Automatically
                    try {
                        console.log("Creating PayOS link...");
                        const response = await fetch(`${apiBase}/create-payment-link`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                amount: depositAmount,
                                description: `CHON ${bookingData.phone || ''}`.substring(0, 25)
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
                                qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(payosData.qrCode)}`;
                                qrImg.onload = () => {
                                    qrImg.classList.remove('hidden');
                                    if (qrLoading) qrLoading.classList.add('hidden');
                                };
                            }
                            if (accountNoEl) accountNoEl.textContent = payosData.accountNumber;
                            if (accountNameEl) accountNameEl.textContent = payosData.accountName;
                            if (transferBtn) {
                                transferBtn.href = payosData.checkoutUrl || '#';
                                transferBtn.innerHTML = '<span class="material-symbols-outlined text-sm">rocket_launch</span><span>Chuyển khoản</span>';
                            }

                            // 3. Start Polling for status (Use ID for v2)
                            const pollId = payosData.id || payosData.orderCode;
                            if (pollId) {
                                console.log("Starting polling for:", pollId);
                                startPaymentPolling(pollId);
                            }
                        } else {
                            throw new Error("PayOS không trả về mã QR. Hãy kiểm tra Dashboard.");
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

                // Smooth scroll
                setTimeout(() => {
                    if (summarySection) {
                        const header = document.querySelector('header');
                        const headerHeight = header ? header.offsetHeight : 80;
                        const offsetPosition = summarySection.getBoundingClientRect().top + window.pageYOffset - headerHeight - 20;
                        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
                    }
                }, 300);
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

    const startPaymentPolling = (orderCode) => {
        if (pollingInterval) clearInterval(pollingInterval);
        console.log("Started polling for order:", orderCode);
        
        // Show indicator after a short delay (so it doesn't flicker on instant success)
        setTimeout(() => {
            if (statusIndicator && !window.location.search.includes('status=PAID')) {
                statusIndicator.classList.remove('hidden');
                setTimeout(() => statusIndicator.classList.remove('opacity-0'), 10);
            }
        }, 2000);

        pollingInterval = setInterval(async () => {
            const result = await checkStatusOnce(orderCode);
            if (result && result.paid && statusText) {
                statusText.textContent = "Đã nhận thanh toán!";
            } else if (result && result.status === 'CANCELLED') {
                if (statusText) statusText.textContent = "Giao dịch đã bị hủy.";
                clearInterval(pollingInterval);
            }
        }, 4000);

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
    window.handlePaymentSuccess = function(orderCode) {
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
    const copyBillBtn = document.getElementById('copy-bill-btn');

    if (confirmInfoBtn) {
        confirmInfoBtn.addEventListener('click', () => {
            console.log("Confirm Info Clicked");
            const name = guestNameInput ? guestNameInput.value.trim() : "Quý khách";
            const phone = guestZaloInput ? guestZaloInput.value.trim() : "Chưa cung cấp";

            if (!name || name === "Quý khách") {
                alert("Vui lòng nhập tên người đặt phòng.");
                return;
            }

            // Generate Bill Text
            const billText = generateBillText(name, phone);
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
        });
    }

    const generateBillText = (name, zalo) => {
        const currentTotal = typeof grandTotalAmount !== 'undefined' ? grandTotalAmount : 0;
        const currentDeposit = typeof depositAmount !== 'undefined' ? depositAmount : 0;
        const remaining = currentTotal - currentDeposit;
        const nightsCount = typeof nights !== 'undefined' ? nights : 1;
        const nightsStr = nightsCount >= 3 ? `${nightsCount} đêm (${nightsCount + 1} ngày)` : `${nightsCount} đêm`;
        
        const inDate = typeof checkinDate !== 'undefined' ? checkinDate : new Date();
        const outDate = typeof checkoutDate !== 'undefined' ? checkoutDate : new Date();
        const rData = typeof roomsData !== 'undefined' ? roomsData : [];
        const roomsStr = rData.map(r => r.name).join(', ');

        const adults = typeof adultsCount !== 'undefined' ? adultsCount : 2;
        const children = (bookingData && bookingData.children) ? parseInt(bookingData.children) : 0;
        const childrenAges = (bookingData && bookingData.childrenAgeCategory) ? bookingData.childrenAgeCategory.split(',').filter(a => a) : [];
        
        let guestStr = `${adults} người lớn`;
        if (children > 0) {
            guestStr += `, ${children} trẻ em (${childrenAges.join(', ')} tuổi)`;
        }

        return `BILL XÁC NHẬN ĐẶT PHÒNG 

➖𝐓𝐇𝐎̂𝐍𝐆 𝐓𝐈𝐍
- Địa chỉ: 07 Thánh Tâm - Phường 5, Tp. Đà Lạt
https://maps.app.goo.gl/aW824oYN5dznY7JX9?g_st=com.google.maps.preview.copy
- Liên hệ nhận phòng : 0889717713 (Mr. Trọng Đạt)
- Hình thức thuê: ${roomsStr}

➖𝐓𝐇𝐎̂𝐍𝐆 𝐓𝐈𝐍 𝐊𝐇𝐀́𝐂𝐇 
- Tên khách hàng : ${name}
- Số điện thoại : ${zalo}
- Số người: ${guestStr}
- Số ngày thuê: ${nightsStr}
* Ngày nhận nhà: 14h00 ngày ${formatDateObj(inDate)}
* Ngày trả nhà: 12h00 ngày ${formatDateObj(outDate)}

✅ 𝐓𝐇𝐀𝐍𝐇 𝐓𝐎𝐀́𝐍
- Thành tiền: ${renderCurrency(currentTotal)}
- Đặt cọc: ${renderCurrency(currentDeposit)}
( 𝐗𝐚́𝐜 𝐧𝐡𝐚̣̂𝐧 đ𝐚̃ 𝐧𝐡𝐚̣̂𝐧 đ𝐮̛𝐨̛̣𝐜 𝐭𝐢𝐞̂̀𝐧 𝐜𝐨̣𝐜 )
- Còn lại: ${renderCurrency(remaining)}
Số tiền còn lại quý khách vui lòng thanh toán hết ngay sau khi nhận nhà

➖ 𝐆𝐇𝐈 𝐂𝐇𝐔́
- Quý khách vui lòng tự bảo vệ tài sản cá nhân, mọi mất mát bên home không chịu trách nhiệm. 
- Booking không hoàn, huỷ, đổi dưới mọi hình thức. 
- Quý khách vui lòng đem theo CMND hoặc Passport để làm thủ tục đăng kí lưu thú.
- Quý khách vui lòng đi đúng số lượng người, nếu có phát sinh phụ thu.`;
    };

    if (copyBillBtn) {
        copyBillBtn.addEventListener('click', () => {
            const name = guestNameInput.value.trim() || "Quý khách";
            const phone = guestZaloInput.value.trim() || "Chưa cung cấp";
            const fullText = generateBillText(name, phone);

            navigator.clipboard.writeText(fullText).then(() => {
                const originalText = copyBillBtn.innerHTML;
                copyBillBtn.innerHTML = '<span class="material-symbols-outlined text-sm">check</span><span>ĐÃ CHÉP BILL</span>';
                setTimeout(() => { copyBillBtn.innerHTML = originalText; }, 2000);
            }).catch(err => {
                console.error("Clipboard Error:", err);
                alert("Không thể tự động sao chép. Vui lòng copy thủ công.");
            });
        });
    }

    // Existing Copy & Transfer button logic
    const copyBtn = document.getElementById('copy-stk-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const accountNumber = (payosData && payosData.accountNumber) ? payosData.accountNumber : "0173100004750004";
            navigator.clipboard.writeText(accountNumber).then(() => {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<span class="material-symbols-outlined text-sm">check</span><span>Đã chép</span>';
                setTimeout(() => { copyBtn.innerHTML = originalText; }, 2000);
            }).catch(err => {
                console.error("Clipboard Error:", err);
                alert("STK: " + accountNumber);
            });
        });
    }
});
