document.addEventListener('DOMContentLoaded', () => {
    // 1. Helper Function
    const renderCurrency = (num) => new Intl.NumberFormat('vi-VN').format(num) + 'đ';
    const setSafeText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    console.log("Checkout Script Initialized");

    // 2. Retrieve Data From Session
    const bookingDataStr = sessionStorage.getItem('chonVillageBooking');
    const selectedRoomsStr = sessionStorage.getItem('chonVillageSelectedRooms');
    const selectedRoomStr = sessionStorage.getItem('chonVillageSelectedRoom'); // Fallback for single room

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
            const avgNightPrice = Math.round(room.basePrice / nights);
            return `
                <div class="border border-primary/40 p-6 rounded-xl bg-background-light/80 shadow-md relative overflow-hidden">
                    <!-- Room Image -->
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
                            <span class="text-black text-sm uppercase tracking-wider font-bold">Chi tiết giá phòng:</span>
                            <div class="space-y-3">
                                ${(() => {
                                    const baseWeekday = room.baseWeekday;
                                    const baseWeekend = room.baseWeekend;
                                    
                                    if (baseWeekday && baseWeekend && baseWeekday !== baseWeekend) {
                                        let html = `
                                            <div class="flex flex-col text-sm">
                                                <span class="text-black font-bold mt-0.5">${renderCurrency(baseWeekday)} / Đêm Trong Tuần (Thứ 2 - Thứ 5)</span>
                                            </div>
                                            <div class="flex flex-col text-sm">
                                                <span class="text-black font-bold mt-0.5">${renderCurrency(baseWeekend)} / Đêm Cuối Tuần (Thứ 6 - Chủ Nhật)</span>
                                            </div>`;
                                        
                                        // Add Holiday lines if any
                                        if (room.groupedNights) {
                                            room.groupedNights.forEach(group => {
                                                if (group.isHoliday) {
                                                    const dateLabel = group.count > 1 
                                                        ? `Giá Ngày ${group.startDate}-${group.endDate}:`
                                                        : `Giá Ngày Lễ ${group.startDate}:`;
                                                    html += `
                                                        <div class="flex flex-col text-sm">
                                                            <span class="text-black">${dateLabel}</span>
                                                            <span class="text-black font-bold mt-0.5">${renderCurrency(group.price)} / Đêm</span>
                                                        </div>`;
                                                }
                                            });
                                        }
                                        return html;
                                    } else {
                                        // SAME or Fallback
                                        return (room.groupedNights || []).map(group => {
                                            const dateLabel = group.count > 1 
                                                ? `Giá Ngày ${group.startDate}-${group.endDate}:`
                                                : `Giá ${group.isHoliday ? 'Ngày Lễ ' : 'Ngày '}${group.startDate}:`;
                                            return `
                                                <div class="flex flex-col text-sm">
                                                    <span class="text-black">${dateLabel}</span>
                                                    <span class="text-black font-bold mt-0.5">${renderCurrency(group.price)} / Đêm</span>
                                                </div>
                                            `;
                                        }).join('') || `
                                            <div class="flex flex-col text-sm">
                                                <span class="text-black">Giá Trung Bình:</span>
                                                <span class="text-black font-bold mt-0.5">${renderCurrency(Math.round(room.basePrice / nights))} / Đêm</span>
                                            </div>`;
                                    }
                                })()}
                            </div>
                        </div>

                        ${room.surchargeAllocated > 0 ? `
                        <div class="flex justify-between items-center py-2 border-b-2 border-dashed border-primary/40">
                            <span class="text-black text-sm font-medium">Phụ thu khách thứ 3:</span>
                            <span class="text-black text-sm font-bold">${renderCurrency(room.surchargePerNight)} / Đêm</span>
                        </div>` : ''}

                        <div class="flex justify-between items-center pt-2 text-primary">
                            <span class="text-base font-serif font-bold">Tổng cộng:</span>
                            <span class="text-base font-serif font-bold tracking-tight">${renderCurrency(room.total)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    setSafeText('checkout-total', renderCurrency(grandTotalAmount));
    setSafeText('checkout-deposit', renderCurrency(grandTotalAmount >= 0 ? depositAmount : 0));

    // 6. visibility & Agreement Logic
    const agreeCheckbox = document.getElementById('agree-checkbox');
    const summarySection = document.getElementById('summary-section');
    const paymentSection = document.getElementById('payment-section');
    const confirmBtn = document.getElementById('confirm-btn');

    // Reset Initial State
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.classList.remove('hidden');
        confirmBtn.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
    }
    
    if (summarySection) {
        summarySection.classList.add('hidden', 'opacity-0');
    }
    if (paymentSection) {
        paymentSection.classList.add('hidden', 'opacity-0');
    }

    // Toggle Visibility on Checkbox
    if (agreeCheckbox) {
        agreeCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            
            if (isChecked) {
                // Show Summary & Payment
                if (summarySection) {
                    summarySection.classList.remove('hidden');
                    setTimeout(() => summarySection.classList.remove('opacity-0'), 10);
                }
                if (paymentSection) {
                    paymentSection.classList.remove('hidden');
                    setTimeout(() => paymentSection.classList.remove('opacity-0'), 10);

                    // Update QR and Transfer Content
                    const qrImg = document.getElementById('checkout-qr');
                    const qrLoading = document.getElementById('qr-loading');
                    const transferContentEl = document.getElementById('checkout-transfer-content');
                    
                    const transferContent = `CHON ${bookingData.phone || ''}`.toUpperCase();
                    if (transferContentEl) transferContentEl.textContent = transferContent;

                    if (qrImg) {
                        const bankId = 'VCB';
                        const accountNo = '0889717713';
                        const template = 'compact';
                        const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?amount=${depositAmount}&addInfo=${encodeURIComponent(transferContent)}&accountName=NGUYEN%20VAN%20CHON`;
                        
                        qrImg.src = qrUrl;
                        qrImg.onload = () => {
                            if (qrLoading) qrLoading.classList.add('hidden');
                        };
                    }
                }
                // Unlock Button
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
                }

                // Smooth scroll to summary section with offset for sticky header
                setTimeout(() => {
                    if (summarySection) {
                        const header = document.querySelector('header');
                        const headerHeight = header ? header.offsetHeight : 80;
                        const elementPosition = summarySection.getBoundingClientRect().top;
                        const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 20;

                        window.scrollTo({
                            top: offsetPosition,
                            behavior: 'smooth'
                        });
                    }
                }, 300);
            } else {
                // Hide Summary & Payment
                if (summarySection) {
                    summarySection.classList.add('opacity-0');
                    setTimeout(() => summarySection.classList.add('hidden'), 500);
                }
                if (paymentSection) {
                    paymentSection.classList.add('opacity-0');
                    setTimeout(() => paymentSection.classList.add('hidden'), 500);
                }
                // Lock Button
                if (confirmBtn) {
                    confirmBtn.disabled = true;
                    confirmBtn.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
                }
            }
        });
    }

    // 7. Zalo Submission Logic
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            const roomNames = roomsData.map(r => r.name).join(' + ');
            const message = `Xin chào Chồn Village,\nTôi muốn gửi biên lai chuyển khoản cho đơn đặt phòng:\n- Phòng: ${roomNames}\n- Thời gian: ${dateRangeStr}\n- Tổng: ${renderCurrency(grandTotalAmount)}\n- Đã cọc (50%): ${renderCurrency(depositAmount)}\n- Tên khách: ${bookingData.name || 'Khách hàng'}\n- SĐT: ${bookingData.phone || ''}`;
            
            const zaloMsg = encodeURIComponent(message);
            const zaloUrl = `https://zalo.me/0889717713?text=${zaloMsg}`;
            const zaloDeepLink = `zalo://chat?phone=0889717713&text=${zaloMsg}`;
            
            // Try deep link
            window.location.href = zaloDeepLink;
            
            // Fallback
            setTimeout(() => {
                window.open(zaloUrl, '_blank');
            }, 500);

            // Toast feedback
            const toast = document.getElementById('toast-message');
            if (toast) {
                toast.innerHTML = `
                    <div class="flex flex-col gap-1 items-center">
                        <span class="material-symbols-outlined text-green-600 text-2xl">check_circle</span>
                        <span>Đang kết nối tới Zalo...</span>
                        <span>Xin cảm ơn bạn đã lựa chọn Chồn Village.</span>
                    </div>
                `;
                toast.classList.remove('opacity-0');
                
                setTimeout(() => {
                    toast.classList.add('opacity-0');
                    setTimeout(() => {
                        sessionStorage.removeItem('chonVillageBooking');
                        sessionStorage.removeItem('chonVillageSelectedRoom');
                        window.location.href = 'index.html';
                    }, 500);
                }, 5000);
            }
        });
    }
});
